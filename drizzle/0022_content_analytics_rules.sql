-- Content analytics rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

alter table public.audience_snapshots enable row level security;
create policy audience_snapshots_select_own on public.audience_snapshots for select to fyos_app using ((select app.current_user_id()) = user_id);
create policy audience_snapshots_insert_own on public.audience_snapshots for insert to fyos_app with check ((select app.current_user_id()) = user_id);
create policy audience_snapshots_update_own on public.audience_snapshots for update to fyos_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy audience_snapshots_delete_own on public.audience_snapshots for delete to fyos_app using ((select app.current_user_id()) = user_id);

create trigger audience_snapshots_no_future before insert or update on public.audience_snapshots
  for each row execute function app.no_future_dates('captured_on');

-- Platform extras are a flat object of non-negative numbers.
alter table public.content_metrics add constraint content_metrics_platform_metrics_check check (
  jsonb_typeof(platform_metrics) = 'object'
  and not jsonb_path_exists(platform_metrics, '$.* ? (@.type() != "number" || @ < 0)')
);
