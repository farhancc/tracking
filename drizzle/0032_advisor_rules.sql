-- AI advisor rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['advisor_questions', 'advisor_proposals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to fyos_app using ((select app.current_user_id()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to fyos_app with check ((select app.current_user_id()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to fyos_app using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to fyos_app using ((select app.current_user_id()) = user_id)', t || '_delete_own', t);
  end loop;
end
$$;

-- A decided proposal stays decided: its status can't be changed again.
create or replace function app.advisor_proposals_validate() returns trigger
language plpgsql
as $$
begin
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'This proposal was already %.', old.status using errcode = 'P0001', detail = 'proposal_decided';
  end if;
  return new;
end
$$;
create trigger advisor_proposals_validate before update on public.advisor_proposals
  for each row execute function app.advisor_proposals_validate();
