#!/usr/bin/env bash
# Logical backup of the whole FiveYearOS database (schema + data, all schemas
# including auth), in pg_dump's compressed custom format.
#
#   BACKUP_DATABASE_URL=postgres://owner:…@host/db?sslmode=require scripts/backup.sh [out-dir]
#
# Use the DIRECT (non-pooled) Neon endpoint and the owner role. The file holds
# personal data and password/TOTP material: store it encrypted (see docs/26 §5).
set -euo pipefail
url="${BACKUP_DATABASE_URL:?Set BACKUP_DATABASE_URL (owner role, direct endpoint)}"
out="${1:-backups}"
mkdir -p "$out"
file="$out/fiveyearos-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --compress=9 --no-owner --file "$file" "$url"
pg_restore --list "$file" > /dev/null   # the archive is readable
echo "$file ($(du -h "$file" | cut -f1))"
