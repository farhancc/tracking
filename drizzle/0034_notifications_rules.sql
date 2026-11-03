-- Notification rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['notification_preferences', 'push_subscriptions', 'notifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to fyos_app using ((select app.current_user_id()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to fyos_app with check ((select app.current_user_id()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to fyos_app using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to fyos_app using ((select app.current_user_id()) = user_id)', t || '_delete_own', t);
  end loop;
end
$$;

create trigger notification_preferences_set_updated_at before update on public.notification_preferences for each row execute function app.set_updated_at();

-- A push endpoint belongs to one browser; if another user signs in on it, the row moves to them.
-- (Unique endpoint + RLS means the insert path must be able to take over the old row.)
create or replace function app.claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := app.current_user_id();
begin
  if v_user is null then
    raise exception 'No user.' using errcode = 'P0001', detail = 'unauthenticated';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set user_id = v_user, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failures = 0;
end
$$;
revoke all on function app.claim_push_subscription(text, text, text, text) from public;
grant execute on function app.claim_push_subscription(text, text, text, text) to fyos_app;
