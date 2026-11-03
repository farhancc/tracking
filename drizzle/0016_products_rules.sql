-- Product portfolio rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['products', 'product_stage_events', 'product_metrics', 'product_transactions', 'product_milestones',
                           'product_releases', 'product_features', 'product_feedback', 'product_bugs'] loop
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
    if t <> 'product_stage_events' then
      execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_set_updated_at', t);
    end if;
  end loop;
end
$$;

-- Generic "this happened, so it cannot be in the future" check.
-- Arguments: one or more date column names.
create or replace function app.no_future_dates() returns trigger
language plpgsql
as $$
declare
  v_today date := app.owner_today(new.user_id);
  v_col text;
  v_val date;
begin
  foreach v_col in array tg_argv loop
    v_val := (to_jsonb(new) ->> v_col)::date;
    if v_val is not null and v_val > v_today then
      raise exception 'The % records something that happened. Use today or an earlier date.', replace(v_col, '_', ' ')
        using errcode = 'P0001', detail = 'occurred_in_future';
    end if;
  end loop;
  return new;
end
$$;

create trigger products_no_future before insert or update on public.products
  for each row execute function app.no_future_dates('started_on', 'launched_on');
create trigger product_transactions_no_future before insert or update on public.product_transactions
  for each row execute function app.no_future_dates('occurred_on');
create trigger product_milestones_no_future before insert or update on public.product_milestones
  for each row execute function app.no_future_dates('completed_on');
create trigger product_releases_no_future before insert or update on public.product_releases
  for each row execute function app.no_future_dates('released_on');
create trigger product_features_no_future before insert or update on public.product_features
  for each row execute function app.no_future_dates('shipped_on');
create trigger product_feedback_no_future before insert or update on public.product_feedback
  for each row execute function app.no_future_dates('received_on');
create trigger product_bugs_no_future before insert or update on public.product_bugs
  for each row execute function app.no_future_dates('reported_on', 'fixed_on');

-- Monthly metrics are actuals: only the current or a past month.
create or replace function app.product_metrics_validate() returns trigger
language plpgsql
as $$
begin
  if new.month > date_trunc('month', app.owner_today(new.user_id))::date then
    raise exception 'Metrics record a month that has started. Use this month or an earlier one.'
      using errcode = 'P0001', detail = 'occurred_in_future';
  end if;
  return new;
end
$$;

create trigger product_metrics_validate before insert or update on public.product_metrics
  for each row execute function app.product_metrics_validate();

-- Stage changes restart the stage clock; the currency is fixed once money is recorded.
create or replace function app.products_before_write() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      new.stage_entered_on := app.owner_today(new.user_id);
    end if;
    if new.currency is distinct from old.currency and (
         exists (select 1 from public.product_transactions x where x.product_id = new.id)
         or exists (select 1 from public.product_metrics x where x.product_id = new.id and x.mrr is not null)) then
      raise exception 'The currency cannot change once revenue, expenses or MRR are recorded.'
        using errcode = 'P0001', detail = 'currency_locked';
    end if;
  end if;
  return new;
end
$$;

create trigger products_before_write before insert or update on public.products
  for each row execute function app.products_before_write();

create or replace function app.products_stage_history() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.product_stage_events (user_id, product_id, from_stage, to_stage, changed_on)
    values (new.user_id, new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage, new.stage_entered_on);
  end if;
  return null;
end
$$;

create trigger products_stage_history after insert or update of stage on public.products
  for each row execute function app.products_stage_history();
