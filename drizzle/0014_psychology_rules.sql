-- Sales psychology lab rules.

grant select, insert, update, delete on all tables in schema public to fyos_app;

do $$
declare
  t text;
begin
  foreach t in array array['psych_concepts', 'psych_reviews', 'psych_applications'] loop
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

create trigger psych_concepts_set_updated_at before update on public.psych_concepts
  for each row execute function app.set_updated_at();
create trigger psych_applications_set_updated_at before update on public.psych_applications
  for each row execute function app.set_updated_at();

-- "Understood deeply" must be earned: 3+ successful reviews and an application with a result.
create or replace function app.psych_concepts_validate() returns trigger
language plpgsql
as $$
declare
  v_reviews int;
  v_applied int;
begin
  if new.understanding = 'deep' and (tg_op = 'INSERT' or old.understanding is distinct from 'deep') then
    select count(*) into v_reviews from public.psych_reviews r
     where r.concept_id = new.id and r.rating in ('good', 'easy');
    select count(*) into v_applied from public.psych_applications a
     where a.concept_id = new.id and a.outcome <> 'inconclusive' and a.result is not null and length(btrim(a.result)) > 0;
    if v_reviews < 3 or v_applied < 1 then
      raise exception 'Mark a concept "understood deeply" only after 3 successful reviews (% so far) and a real application with a result (% so far).', v_reviews, v_applied
        using errcode = 'P0001', detail = 'deep_understanding_not_earned';
    end if;
  end if;
  return new;
end
$$;

create trigger psych_concepts_validate before insert or update on public.psych_concepts
  for each row execute function app.psych_concepts_validate();

create or replace function app.psych_applications_no_future() returns trigger
language plpgsql
as $$
begin
  if new.applied_on > app.owner_today(new.user_id) then
    raise exception 'An application records something that happened. Use today or an earlier date.'
      using errcode = 'P0001', detail = 'occurred_in_future';
  end if;
  return new;
end
$$;

create trigger psych_applications_no_future before insert or update on public.psych_applications
  for each row execute function app.psych_applications_no_future();
