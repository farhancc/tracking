/**
 * Creates a throwaway database, applies the real migrations as the owner role
 * (a non-superuser, like Neon's project owner) and creates LOGIN roles that
 * are members of fyos_app / fyos_auth. Each test run is isolated.
 *
 * Requires TEST_ADMIN_DATABASE_URL: an owner role with CREATEDB and CREATEROLE,
 * e.g. postgres://fyos_owner:dev-owner@127.0.0.1:5432/postgres
 */
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../src/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
    authUrl: string;
  }
}

const APP_LOGIN = "fyos_app_test";
const AUTH_LOGIN = "fyos_auth_test";
const PASSWORD = "fyos-test-password";

function withDatabase(url: string, database: string, user?: string, password?: string) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

export default async function setup(project: TestProject) {
  const adminUrl =
    process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://fyos_owner:dev-owner@127.0.0.1:5432/postgres";
  const dbName = `fyos_test_${process.pid}_${Date.now()}`;

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);

  const ownerUrl = withDatabase(adminUrl, dbName);
  await runMigrations(ownerUrl);

  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = '${APP_LOGIN}') then
        create role ${APP_LOGIN} login password '${PASSWORD}' in role fyos_app;
      end if;
      if not exists (select 1 from pg_roles where rolname = '${AUTH_LOGIN}') then
        create role ${AUTH_LOGIN} login password '${PASSWORD}' in role fyos_auth;
      end if;
    end $$;`);
  await owner.end();

  project.provide("ownerUrl", ownerUrl);
  project.provide("appUrl", withDatabase(adminUrl, dbName, APP_LOGIN, PASSWORD));
  project.provide("authUrl", withDatabase(adminUrl, dbName, AUTH_LOGIN, PASSWORD));

  return async () => {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  };
}
