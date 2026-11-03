-- Sales mastery rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['sales_tracks', 'prospects', 'deals', 'sales_activities', 'sales_targets', 'sales_journal_entries'] loop
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

-- Activities and journal entries record what happened: no future dates.
create or replace function app.no_future_occurred_on() returns trigger
language plpgsql
as $$
begin
  if new.occurred_on > app.owner_today(new.user_id) then
    raise exception 'This records something that happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'occurred_in_future';
  end if;
  return new;
end
$$;

create trigger sales_activities_no_future before insert or update on public.sales_activities
  for each row execute function app.no_future_occurred_on();
create trigger sales_journal_no_future before insert or update on public.sales_journal_entries
  for each row execute function app.no_future_occurred_on();

-- Closing a deal in the future is also not allowed.
create or replace function app.deals_validate() returns trigger
language plpgsql
as $$
begin
  if new.closed_on is not null and new.closed_on > app.owner_today(new.user_id) then
    raise exception 'A deal can only be closed today or earlier.'
      using errcode = 'P0001', detail = 'closed_in_future';
  end if;
  return new;
end
$$;

create trigger deals_validate before insert or update on public.deals
  for each row execute function app.deals_validate();
