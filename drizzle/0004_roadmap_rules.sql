-- Roadmap rules: RLS for the planning tables, and key-result roll-up for
-- objectives measured "from key results".

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array[
    'roadmap_years', 'roadmap_quarters', 'quarter_deliverables', 'quarter_kpis',
    'quarter_risks', 'quarter_dependencies'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to fyos_app using ((select app.current_user_id()) = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to fyos_app with check ((select app.current_user_id()) = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to fyos_app using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to fyos_app using ((select app.current_user_id()) = user_id)',
      t || '_delete_own', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end
$$;

------------------------------------------------------------------------------
-- Goals: key results
------------------------------------------------------------------------------

create or replace function app.goals_before_write() returns trigger
language plpgsql
as $$
declare
  v_current numeric;
  v_as_of date;
  v_journey record;
  v_parent record;
  v_rank int := app.goal_level_rank(new.level);
  v_met boolean;
  v_blockers text;
begin
  -- 1. Current value is DERIVED from outcomes, never from tasks or ordinary
  --    sub-goals: logged measurements, or (for objectives measured from key
  --    results) the average outcome completion of the key results.
  if new.measurement_mode = 'key_results' then
    select coalesce(round(avg(c.completion_pct), 4), 0), max(c.current_value_as_of)
      into v_current, v_as_of
      from public.goals c
     where c.parent_id = new.id
       and c.is_key_result
       and c.archived_at is null;
  elsif new.measurement_mode = 'cumulative' then
    select new.baseline_value + coalesce(sum(m.value), 0), max(m.measured_on)
      into v_current, v_as_of
      from public.goal_measurements m
     where m.goal_id = new.id;
  else
    select m.value, m.measured_on
      into v_current, v_as_of
      from public.goal_measurements m
     where m.goal_id = new.id
     order by m.measured_on desc, m.created_at desc
     limit 1;
    if not found then
      v_current := new.baseline_value;
      v_as_of := null;
    end if;
  end if;
  new.current_value := v_current;
  new.current_value_as_of := v_as_of;

  -- 2. Goals live inside their journey.
  select start_date, end_date into v_journey from public.journeys where id = new.journey_id;
  if new.start_date < v_journey.start_date or new.target_date > v_journey.end_date then
    raise exception 'Goal dates must fall within the journey (% to %).', v_journey.start_date, v_journey.end_date
      using errcode = 'P0001', detail = 'goal_outside_journey';
  end if;

  -- 3. Hierarchy. Ordinary children sit strictly below their parent; a key
  --    result may sit at the same level as the objective it measures, but
  --    key results cannot have key results of their own.
  if new.parent_id is not null then
    select level, journey_id, start_date, target_date, is_key_result
      into v_parent
      from public.goals
     where id = new.parent_id;
    if new.is_key_result and v_parent.is_key_result then
      raise exception 'A key result cannot have key results of its own.'
        using errcode = 'P0001', detail = 'key_result_under_key_result';
    end if;
    if (new.is_key_result and app.goal_level_rank(v_parent.level) > v_rank)
       or (not new.is_key_result and app.goal_level_rank(v_parent.level) >= v_rank) then
      raise exception 'A % cannot sit under a %. Children must be at a lower level than their parent.',
        replace(new.level, '_', '-'), replace(v_parent.level, '_', '-')
        using errcode = 'P0001', detail = 'invalid_parent_level';
    end if;
    if v_parent.journey_id <> new.journey_id then
      raise exception 'A goal and its parent must belong to the same journey.'
        using errcode = 'P0001', detail = 'parent_in_other_journey';
    end if;
    if new.start_date < v_parent.start_date or new.target_date > v_parent.target_date then
      raise exception 'Goal period (% to %) must fall within its parent''s period (% to %).',
        new.start_date, new.target_date, v_parent.start_date, v_parent.target_date
        using errcode = 'P0001', detail = 'outside_parent_period';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
       new.level is distinct from old.level
    or new.start_date is distinct from old.start_date
    or new.target_date is distinct from old.target_date
    or new.journey_id is distinct from old.journey_id
    or new.is_key_result is distinct from old.is_key_result
  ) then
    if exists (
      select 1 from public.goals c
       where c.parent_id = new.id
         and c.archived_at is null
         and (
              (c.is_key_result and (new.is_key_result or app.goal_level_rank(c.level) < v_rank))
           or (not c.is_key_result and app.goal_level_rank(c.level) <= v_rank)
           or c.start_date < new.start_date
           or c.target_date > new.target_date
           or c.journey_id <> new.journey_id)
    ) then
      raise exception 'This change conflicts with one or more sub-goals (their level or dates would fall outside this goal). Adjust the sub-goals first.'
        using errcode = 'P0001', detail = 'children_conflict';
    end if;
  end if;

  -- 4. Outcome-based achievement (unchanged).
  if new.status = 'achieved' then
    if tg_op = 'INSERT' or old.status is distinct from 'achieved' then
      v_met := case
        when new.target_value >= new.baseline_value then new.current_value >= new.target_value
        else new.current_value <= new.target_value
      end;
      if not v_met then
        raise exception 'A goal can only be marked achieved when its success metric reaches the target (current %, target %). Completed tasks or sub-goals do not count.',
          trim_scale(new.current_value), trim_scale(new.target_value)
          using errcode = 'P0001', detail = 'achievement_requires_outcome';
      end if;

      select string_agg(g.title, ', ' order by g.title)
        into v_blockers
        from public.goal_dependencies d
        join public.goals g on g.id = d.depends_on_goal_id
       where d.goal_id = new.id
         and d.is_blocking
         and g.status <> 'achieved';
      if v_blockers is not null then
        raise exception 'Blocked by prerequisites that are not achieved yet: %.', v_blockers
          using errcode = 'P0001', detail = 'blocked_by_dependencies';
      end if;

      new.achieved_at := now();
    end if;
  else
    new.achieved_at := null;
  end if;

  new.updated_at := now();
  return new;
end
$$;

-- When a key result's outcome changes, recompute the objective it measures.
create or replace function app.goals_roll_up_key_results() returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.is_key_result and old.parent_id is not null
     and (tg_op = 'DELETE'
          or new.parent_id is distinct from old.parent_id
          or not new.is_key_result) then
    update public.goals set updated_at = now()
     where id = old.parent_id and measurement_mode = 'key_results';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.is_key_result and new.parent_id is not null
     and (tg_op = 'INSERT'
          or new.completion_pct is distinct from old.completion_pct
          or new.archived_at is distinct from old.archived_at
          or new.parent_id is distinct from old.parent_id
          or new.current_value_as_of is distinct from old.current_value_as_of
          or not old.is_key_result) then
    update public.goals set updated_at = now()
     where id = new.parent_id and measurement_mode = 'key_results';
  end if;
  return null;
end
$$;

create trigger goals_roll_up_key_results
  after insert or update or delete on public.goals
  for each row execute function app.goals_roll_up_key_results();

-- Objectives measured from key results do not take direct measurements.
create or replace function app.goal_measurements_validate() returns trigger
language plpgsql
as $$
declare
  v_unit text;
  v_mode text;
  v_tz text;
begin
  select unit, measurement_mode into v_unit, v_mode from public.goals where id = new.goal_id;
  if v_mode = 'key_results' then
    raise exception 'This objective is measured by its key results. Log measurements on the key results instead.'
      using errcode = 'P0001', detail = 'measured_by_key_results';
  end if;
  if v_unit = 'boolean' and new.value not in (0, 1) then
    raise exception 'Yes/no goals accept only 0 (no) or 1 (yes).'
      using errcode = 'P0001', detail = 'boolean_measurement';
  end if;
  select timezone into v_tz from public.profiles where id = new.user_id;
  if new.measured_on > (now() at time zone coalesce(v_tz, 'UTC'))::date then
    raise exception 'Measurements record outcomes that have happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'measurement_in_future';
  end if;
  return new;
end
$$;

------------------------------------------------------------------------------
-- Deliverables: delivered_on follows status
------------------------------------------------------------------------------

create or replace function app.quarter_deliverables_before_write() returns trigger
language plpgsql
as $$
declare
  v_tz text;
begin
  if new.status = 'delivered' then
    if new.delivered_on is null then
      select timezone into v_tz from public.profiles where id = new.user_id;
      new.delivered_on := (now() at time zone coalesce(v_tz, 'UTC'))::date;
    end if;
  else
    new.delivered_on := null;
  end if;
  return new;
end
$$;

create trigger quarter_deliverables_before_write
  before insert or update on public.quarter_deliverables
  for each row execute function app.quarter_deliverables_before_write();
