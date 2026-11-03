-- Habit tracker rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

alter table public.rest_days enable row level security;
create policy rest_days_select_own on public.rest_days for select to fyos_app using ((select app.current_user_id()) = user_id);
create policy rest_days_insert_own on public.rest_days for insert to fyos_app with check ((select app.current_user_id()) = user_id);
create policy rest_days_update_own on public.rest_days for update to fyos_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy rest_days_delete_own on public.rest_days for delete to fyos_app using ((select app.current_user_id()) = user_id);

-- Existing habits started when they were created (or at their first check-in, if earlier).
update public.habits h
   set started_on = least(
         (h.created_at at time zone coalesce((select p.timezone from public.profiles p where p.id = h.user_id), 'UTC'))::date,
         coalesce((select min(c.checkin_on) from public.habit_checkins c where c.habit_id = h.id), 'infinity'::date));

-- A check-in before the start date moves the start back, so history is never ignored.
create or replace function app.habit_checkins_extend_start() returns trigger
language plpgsql
as $$
begin
  update public.habits set started_on = new.checkin_on where id = new.habit_id and started_on > new.checkin_on;
  return null;
end
$$;

create trigger habit_checkins_extend_start after insert or update of checkin_on on public.habit_checkins
  for each row execute function app.habit_checkins_extend_start();

-- Until now the Today screen's "Rest" button stored 'skipped'. Those days were rest days.
update public.habit_checkins set status = 'rest' where status = 'skipped';
