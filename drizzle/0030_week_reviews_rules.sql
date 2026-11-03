-- Weekly review rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

alter table public.week_reviews enable row level security;
create policy week_reviews_select_own on public.week_reviews for select to fyos_app using ((select app.current_user_id()) = user_id);
create policy week_reviews_insert_own on public.week_reviews for insert to fyos_app with check ((select app.current_user_id()) = user_id);
create policy week_reviews_update_own on public.week_reviews for update to fyos_app
  using ((select app.current_user_id()) = user_id) with check ((select app.current_user_id()) = user_id);
create policy week_reviews_delete_own on public.week_reviews for delete to fyos_app using ((select app.current_user_id()) = user_id);
create trigger week_reviews_set_updated_at before update on public.week_reviews for each row execute function app.set_updated_at();

alter table public.week_reviews add constraint week_reviews_answers_check check (jsonb_typeof(answers) = 'object' and jsonb_typeof(answers -> 'missed') = 'array');

-- A review describes a week that has started.
create or replace function app.week_reviews_validate() returns trigger
language plpgsql
as $$
begin
  if new.week_start > app.owner_today(new.user_id) then
    raise exception 'You can only review a week that has started.' using errcode = 'P0001', detail = 'week_not_started';
  end if;
  return new;
end
$$;
create trigger week_reviews_validate before insert or update on public.week_reviews
  for each row execute function app.week_reviews_validate();
