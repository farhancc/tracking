-- Personal finance rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['finance_settings', 'finance_income', 'finance_expenses', 'finance_accounts', 'finance_balances', 'finance_forecasts'] loop
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
    if t <> 'finance_balances' then
      execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_set_updated_at', t);
    end if;
  end loop;
end
$$;

-- Actuals record what happened: never in the future. Forecasts may be.
create trigger finance_income_no_future before insert or update on public.finance_income
  for each row execute function app.no_future_dates('received_on');
create trigger finance_expenses_no_future before insert or update on public.finance_expenses
  for each row execute function app.no_future_dates('spent_on');
create trigger finance_balances_no_future before insert or update on public.finance_balances
  for each row execute function app.no_future_dates('as_of');
