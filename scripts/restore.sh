#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into an EMPTY database, with the
# same grants, revokes and row-level-security policies.
#
#   RESTORE_DATABASE_URL=postgres://owner:…@host/new_db scripts/restore.sh backups/fiveyearos-….dump
#
# Restore into a new database (a Neon branch is ideal), check it, then point
# the app at it. Never restore over the live database.
set -euo pipefail
url="${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL (owner role, empty target database)}"
file="${1:?Pass the .dump file}"
# The roles fyos_app / fyos_auth are cluster-wide and must exist (drizzle/0000_bootstrap.sql creates them).
psql "$url" -v ON_ERROR_STOP=1 -q -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='fyos_app') then create role fyos_app nologin; end if; if not exists (select 1 from pg_roles where rolname='fyos_auth') then create role fyos_auth nologin; end if; end \$\$;"
# Privileges (grants and revokes, e.g. on the security-definer function) are restored exactly as backed up.
pg_restore --no-owner --exit-on-error --dbname "$url" "$file"
echo "Restored $file. Check row counts, then sign in against it before switching over."
