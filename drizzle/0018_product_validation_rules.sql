-- Product validation rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['product_validation_steps', 'product_validation_evidence', 'product_interviews', 'product_competitors'] loop
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
    execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end
$$;

create trigger product_validation_evidence_no_future before insert or update on public.product_validation_evidence
  for each row execute function app.no_future_dates('observed_on');
create trigger product_interviews_no_future before insert or update on public.product_interviews
  for each row execute function app.no_future_dates('interviewed_on');

-- A step is only validated (or invalidated) with evidence; the decision date follows the status.
create or replace function app.product_validation_steps_before_write() returns trigger
language plpgsql
as $$
begin
  if new.status in ('validated', 'invalidated') then
    if tg_op = 'INSERT' or old.status not in ('validated', 'invalidated') or old.status is distinct from new.status then
      if not exists (select 1 from public.product_validation_evidence e where e.product_id = new.product_id and e.step = new.step) then
        raise exception 'Add evidence before marking this step %.', new.status
          using errcode = 'P0001', detail = 'evidence_required';
      end if;
      new.decided_on := coalesce(case when tg_op = 'UPDATE' and old.status = new.status then old.decided_on end, new.decided_on, app.owner_today(new.user_id));
    end if;
    if new.decided_on > app.owner_today(new.user_id) then
      raise exception 'The decision date cannot be in the future.' using errcode = 'P0001', detail = 'occurred_in_future';
    end if;
  else
    new.decided_on := null;
  end if;
  return new;
end
$$;

create trigger product_validation_steps_before_write before insert or update on public.product_validation_steps
  for each row execute function app.product_validation_steps_before_write();

-- The last piece of evidence behind a decided step cannot be removed (reopen the step first).
create or replace function app.product_validation_evidence_keep_last() returns trigger
language plpgsql
as $$
begin
  -- Cascades (deleting the product, the step or the account) run inside FK triggers: allow them.
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (
       select 1 from public.product_validation_steps s
        where s.product_id = old.product_id and s.step = old.step and s.status in ('validated', 'invalidated'))
     and not exists (
       select 1 from public.product_validation_evidence e
        where e.product_id = old.product_id and e.step = old.step and e.id <> old.id) then
    raise exception 'This is the only evidence for a decided step. Set the step back to "in progress" first.'
      using errcode = 'P0001', detail = 'evidence_required';
  end if;
  return old;
end
$$;

create trigger product_validation_evidence_keep_last before delete on public.product_validation_evidence
  for each row execute function app.product_validation_evidence_keep_last();
