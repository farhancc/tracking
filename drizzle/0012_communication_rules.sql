-- Communication mastery rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['comm_skills', 'comm_exercises', 'comm_resources', 'comm_recordings', 'comm_practice_sessions', 'comm_assessments'] loop
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

-- Recording storage keys must live under the owner's own prefix.
alter table public.comm_recordings
  add constraint comm_recordings_key_prefix_check check (storage_key like user_id::text || '/%');

-- Practice and assessments record what happened: no future dates.
create or replace function app.comm_sessions_no_future() returns trigger
language plpgsql
as $$
begin
  if new.practiced_on > app.owner_today(new.user_id) then
    raise exception 'This records something that happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'occurred_in_future';
  end if;
  return new;
end
$$;

create or replace function app.comm_assessments_no_future() returns trigger
language plpgsql
as $$
begin
  if new.assessed_on > app.owner_today(new.user_id) then
    raise exception 'An assessment records something that happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'occurred_in_future';
  end if;
  return new;
end
$$;

create trigger comm_sessions_no_future before insert or update on public.comm_practice_sessions
  for each row execute function app.comm_sessions_no_future();
create trigger comm_assessments_no_future before insert or update on public.comm_assessments
  for each row execute function app.comm_assessments_no_future();
