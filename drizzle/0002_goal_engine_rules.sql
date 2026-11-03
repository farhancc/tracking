-- Goal engine rules: privileges, row-level security and the triggers that
-- make strategic goals OUTCOME-measured.
--
-- Errors raised here use SQLSTATE P0001 with a machine-readable code in
-- DETAIL; the API maps them to 422 responses (src/lib/errors.ts).

------------------------------------------------------------------------------
-- Privileges
------------------------------------------------------------------------------

revoke all on schema auth from public;
grant usage on schema auth to fyos_auth;
grant select, insert, update on auth.users, auth.sessions to fyos_auth;
-- fyos_app gets nothing on the auth schema: a bug or injection in a feature
-- cannot read password hashes or sessions.

grant select, insert, update, delete on all tables in schema public to fyos_app;

------------------------------------------------------------------------------
-- Row-level security: every public table, four owner policies, fail closed
------------------------------------------------------------------------------

alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to fyos_app
  using ((select app.current_user_id()) = id);
create policy profiles_insert_own on public.profiles for insert to fyos_app
  with check ((select app.current_user_id()) = id);
create policy profiles_update_own on public.profiles for update to fyos_app
  using ((select app.current_user_id()) = id)
  with check ((select app.current_user_id()) = id);
create policy profiles_delete_own on public.profiles for delete to fyos_app
  using ((select app.current_user_id()) = id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'journeys', 'pillars', 'visions', 'goals', 'goal_measurements',
    'goal_dependencies', 'goal_links', 'tasks'
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
  end loop;
end
$$;

------------------------------------------------------------------------------
-- updated_at maintenance
------------------------------------------------------------------------------

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();
create trigger journeys_set_updated_at before update on public.journeys
  for each row execute function app.set_updated_at();
create trigger pillars_set_updated_at before update on public.pillars
  for each row execute function app.set_updated_at();
create trigger visions_set_updated_at before update on public.visions
  for each row execute function app.set_updated_at();
create trigger goal_measurements_set_updated_at before update on public.goal_measurements
  for each row execute function app.set_updated_at();

------------------------------------------------------------------------------
-- Goals
------------------------------------------------------------------------------

-- 1 = five_year … 6 = daily. Mirrors levelRank() in src/lib/domain/goals.ts.
create or replace function app.goal_level_rank(p_level text) returns int
language sql immutable
as $$
  select array_position(array['five_year', 'annual', 'quarterly', 'monthly', 'weekly', 'daily'], p_level)
$$;

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
  -- 1. Current value is DERIVED from outcome measurements, never from tasks
  --    or child goals. Any value the application tried to write is replaced.
  if new.measurement_mode = 'cumulative' then
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

  -- 3. Hierarchy: a child sits strictly deeper than its parent, in the same
  --    journey, inside the parent's period.
  if new.parent_id is not null then
    select level, journey_id, start_date, target_date, archived_at
      into v_parent
      from public.goals
     where id = new.parent_id;
    if app.goal_level_rank(v_parent.level) >= v_rank then
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
  ) then
    if exists (
      select 1 from public.goals c
       where c.parent_id = new.id
         and c.archived_at is null
         and (app.goal_level_rank(c.level) <= v_rank
              or c.start_date < new.start_date
              or c.target_date > new.target_date
              or c.journey_id <> new.journey_id)
    ) then
      raise exception 'This change conflicts with one or more sub-goals (their level or dates would fall outside this goal). Adjust the sub-goals first.'
        using errcode = 'P0001', detail = 'children_conflict';
    end if;
  end if;

  -- 4. Outcome-based achievement. A goal can only become 'achieved' when its
  --    success metric has reached the target and every blocking prerequisite
  --    is achieved. Tasks and sub-goals are not consulted.
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

create trigger goals_before_write
  before insert or update on public.goals
  for each row execute function app.goals_before_write();

------------------------------------------------------------------------------
-- Measurements → recompute the goal's current value
------------------------------------------------------------------------------

create or replace function app.goal_measurements_validate() returns trigger
language plpgsql
as $$
declare
  v_unit text;
  v_tz text;
begin
  select unit into v_unit from public.goals where id = new.goal_id;
  if v_unit = 'boolean' and new.value not in (0, 1) then
    raise exception 'Yes/no goals accept only 0 (no) or 1 (yes).'
      using errcode = 'P0001', detail = 'boolean_measurement';
  end if;
  -- A measurement records an outcome that has already happened. Future-dated
  -- values would let a goal be "achieved" before the outcome exists.
  select timezone into v_tz from public.profiles where id = new.user_id;
  if new.measured_on > (now() at time zone coalesce(v_tz, 'UTC'))::date then
    raise exception 'Measurements record outcomes that have happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'measurement_in_future';
  end if;
  return new;
end
$$;

create trigger goal_measurements_validate
  before insert or update on public.goal_measurements
  for each row execute function app.goal_measurements_validate();

-- Touching the goal re-runs goals_before_write, the single place that
-- derives current_value.
create or replace function app.goal_measurements_touch_goal() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.goal_id <> old.goal_id) then
    update public.goals set updated_at = now() where id = old.goal_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.goals set updated_at = now() where id = new.goal_id;
  end if;
  return null;
end
$$;

create trigger goal_measurements_touch_goal
  after insert or update or delete on public.goal_measurements
  for each row execute function app.goal_measurements_touch_goal();

------------------------------------------------------------------------------
-- Dependencies: no cycles
------------------------------------------------------------------------------

create or replace function app.goal_dependencies_no_cycle() returns trigger
language plpgsql
as $$
begin
  if exists (
    with recursive chain(id) as (
      select new.depends_on_goal_id
      union
      select d.depends_on_goal_id
        from public.goal_dependencies d
        join chain c on d.goal_id = c.id
    )
    select 1 from chain where id = new.goal_id
  ) then
    raise exception 'This dependency would create a cycle.'
      using errcode = 'P0001', detail = 'dependency_cycle';
  end if;
  return new;
end
$$;

create trigger goal_dependencies_no_cycle
  before insert or update on public.goal_dependencies
  for each row execute function app.goal_dependencies_no_cycle();

------------------------------------------------------------------------------
-- Tasks: activity only. completed_at follows status. No effect on goals.
------------------------------------------------------------------------------

create or replace function app.tasks_before_write() returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function app.tasks_before_write();
