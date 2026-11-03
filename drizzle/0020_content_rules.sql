-- Content management rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['brand_settings', 'content_pillars', 'content_items', 'content_sources', 'content_metrics'] loop
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
    if t <> 'content_sources' then
      execute format('create trigger %I before update on public.%I for each row execute function app.set_updated_at()', t || '_set_updated_at', t);
    end if;
  end loop;
end
$$;

create trigger content_items_no_future before insert or update on public.content_items
  for each row execute function app.no_future_dates('recorded_on', 'published_on');
create trigger content_metrics_no_future before insert or update on public.content_metrics
  for each row execute function app.no_future_dates('captured_on');

-- Metrics describe a published item, captured on or after it went out.
create or replace function app.content_metrics_validate() returns trigger
language plpgsql
as $$
declare
  v_published date;
begin
  select published_on into v_published from public.content_items where id = new.item_id;
  if v_published is null then
    raise exception 'Record metrics once the content is published.' using errcode = 'P0001', detail = 'not_published';
  end if;
  if new.captured_on < v_published then
    raise exception 'Metrics cannot be captured before the publishing date (%).', v_published
      using errcode = 'P0001', detail = 'captured_before_publish';
  end if;
  return new;
end
$$;

create trigger content_metrics_validate before insert or update on public.content_metrics
  for each row execute function app.content_metrics_validate();

-- A performance review needs numbers; published content with numbers can't be un-published.
create or replace function app.content_items_validate() returns trigger
language plpgsql
as $$
declare
  v_has_metrics boolean;
begin
  if tg_op = 'UPDATE' then
    select exists (select 1 from public.content_metrics m where m.item_id = new.id) into v_has_metrics;
    if new.status = 'reviewed' and old.status <> 'reviewed' and not v_has_metrics then
      raise exception 'Record at least one set of metrics before the performance review.'
        using errcode = 'P0001', detail = 'metrics_required';
    end if;
    if v_has_metrics and new.status not in ('published', 'reviewed') then
      raise exception 'This content has recorded metrics, so it stays published.'
        using errcode = 'P0001', detail = 'metrics_exist';
    end if;
    if v_has_metrics and new.published_on > (select min(m.captured_on) from public.content_metrics m where m.item_id = new.id) then
      raise exception 'The publishing date cannot be after the first metrics capture.'
        using errcode = 'P0001', detail = 'captured_before_publish';
    end if;
  elsif new.status = 'reviewed' then
    raise exception 'Record at least one set of metrics before the performance review.'
      using errcode = 'P0001', detail = 'metrics_required';
  end if;
  return new;
end
$$;

create trigger content_items_validate before insert or update on public.content_items
  for each row execute function app.content_items_validate();
