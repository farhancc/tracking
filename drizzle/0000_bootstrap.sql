-- FiveYearOS bootstrap: roles, helper schema and the per-transaction user id.
-- Runs as the migration (owner) role. See docs/06-security.md §4.
--
-- fyos_app and fyos_auth are NOLOGIN group roles. Create LOGIN roles with
-- generated passwords outside migrations and grant membership, e.g.
--   create role fyos_app_login login password '<generated>' in role fyos_app;
--   create role fyos_auth_login login password '<generated>' in role fyos_auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fyos_app') then
    create role fyos_app nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'fyos_auth') then
    create role fyos_auth nologin;
  end if;
end
$$;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to fyos_app, fyos_auth;

-- The user for the current transaction, set by withUser() with
--   select set_config('app.user_id', '<uuid>', true)
-- Returns NULL when unset, so RLS policies match nothing (fail closed).
create or replace function app.current_user_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

grant usage on schema public to fyos_app, fyos_auth;

-- Tables created later by this (owner) role are usable by the app role.
-- RLS policies, added per table, decide which rows.
alter default privileges in schema public
  grant select, insert, update, delete on tables to fyos_app;
