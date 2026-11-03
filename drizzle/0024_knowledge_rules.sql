-- Knowledge and reading rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['knowledge_resources', 'knowledge_concepts', 'knowledge_applications', 'reading_goals', 'reading_sessions'] loop
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
  end loop;
end
$$;

create trigger knowledge_resources_set_updated_at before update on public.knowledge_resources for each row execute function app.set_updated_at();
create trigger knowledge_applications_set_updated_at before update on public.knowledge_applications for each row execute function app.set_updated_at();
create trigger reading_goals_set_updated_at before update on public.reading_goals for each row execute function app.set_updated_at();

create trigger knowledge_resources_no_future before insert or update on public.knowledge_resources
  for each row execute function app.no_future_dates('started_on', 'completed_on');
create trigger knowledge_applications_no_future before insert or update on public.knowledge_applications
  for each row execute function app.no_future_dates('applied_on');
create trigger reading_sessions_no_future before insert or update on public.reading_sessions
  for each row execute function app.no_future_dates('read_on');
