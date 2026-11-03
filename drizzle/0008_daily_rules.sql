-- Daily execution rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['day_plans', 'habits', 'habit_checkins'] loop
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

-- Owner's local date (profile timezone).
create or replace function app.owner_today(p_user uuid) returns date
language sql stable
as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_user), 'UTC'))::date
$$;

-- Habit check-ins record what happened: no future dates.
create or replace function app.habit_checkins_validate() returns trigger
language plpgsql
as $$
begin
  if new.checkin_on > app.owner_today(new.user_id) then
    raise exception 'Habit check-ins record what happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'checkin_in_future';
  end if;
  return new;
end
$$;

create trigger habit_checkins_validate
  before insert or update on public.habit_checkins
  for each row execute function app.habit_checkins_validate();

-- Tasks: completed_at follows status; planned_week is a week start derived
-- from the planned week, the scheduled day or the due date (in that order);
-- finishing a task stamps finished_at and, if no time was logged, the
-- elapsed time since it was started.
create or replace function app.tasks_before_write() returns trigger
language plpgsql
as $$
declare
  v_week_start int;
  v_base date;
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := now();
      if new.started_at is not null and new.finished_at is null then
        new.finished_at := now();
      end if;
      if new.actual_minutes is null and new.started_at is not null then
        new.actual_minutes := greatest(1, round(extract(epoch from (coalesce(new.finished_at, now()) - new.started_at)) / 60));
      end if;
    end if;
  else
    new.completed_at := null;
    if tg_op = 'UPDATE' and old.status = 'done' then
      new.finished_at := null;
    end if;
  end if;

  v_base := coalesce(new.planned_week, new.scheduled_on, new.due_on);
  if v_base is not null then
    select week_starts_on into v_week_start from public.profiles where id = new.user_id;
    v_week_start := coalesce(v_week_start, 1);
    new.planned_week := v_base - ((extract(dow from v_base)::int - v_week_start + 7) % 7);
  end if;

  new.updated_at := now();
  return new;
end
$$;
