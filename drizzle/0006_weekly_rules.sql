-- Weekly planning rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

alter table public.week_plans enable row level security;
create policy week_plans_select_own on public.week_plans for select to fyos_app
  using ((select app.current_user_id()) = user_id);
create policy week_plans_insert_own on public.week_plans for insert to fyos_app
  with check ((select app.current_user_id()) = user_id);
create policy week_plans_update_own on public.week_plans for update to fyos_app
  using ((select app.current_user_id()) = user_id)
  with check ((select app.current_user_id()) = user_id);
create policy week_plans_delete_own on public.week_plans for delete to fyos_app
  using ((select app.current_user_id()) = user_id);
create trigger week_plans_set_updated_at before update on public.week_plans
  for each row execute function app.set_updated_at();

-- Every weekly goal must be linked to a monthly, quarterly or annual objective.
create or replace function app.goals_weekly_alignment() returns trigger
language plpgsql
as $$
declare
  v_parent_level text;
begin
  if new.level <> 'weekly' or new.is_key_result then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.parent_id is not distinct from old.parent_id
     and new.level is not distinct from old.level
     and new.is_key_result is not distinct from old.is_key_result then
    return new;
  end if;
  select level into v_parent_level from public.goals where id = new.parent_id;
  if v_parent_level is null or v_parent_level not in ('annual', 'quarterly', 'monthly') then
    raise exception 'A weekly goal must be linked to a monthly, quarterly or annual objective.'
      using errcode = 'P0001', detail = 'weekly_goal_needs_objective';
  end if;
  return new;
end
$$;

create trigger goals_weekly_alignment
  before insert or update on public.goals
  for each row execute function app.goals_weekly_alignment();

-- Tasks: completed_at follows status; planned_week is always a week start
-- (owner's week-start day) and defaults to the due date's week.
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
    end if;
  else
    new.completed_at := null;
  end if;

  v_base := coalesce(new.planned_week, new.due_on);
  if v_base is not null then
    select week_starts_on into v_week_start from public.profiles where id = new.user_id;
    v_week_start := coalesce(v_week_start, 1);
    new.planned_week := v_base - ((extract(dow from v_base)::int - v_week_start + 7) % 7);
  end if;

  new.updated_at := now();
  return new;
end
$$;
