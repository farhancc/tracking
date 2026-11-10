#!/usr/bin/env bash
# Fails if a server-only variable name, or the value of one that is set in
# this environment, appears in the browser bundles (SEC-SEC-01). Run after
# `next build`.
set -euo pipefail
dir="${1:-.next/static}"
[ -d "$dir" ] || { echo "No $dir: run next build first." >&2; exit 2; }
names=(DATABASE_URL AUTH_DATABASE_URL MIGRATION_DATABASE_URL AUTH_JWT_PRIVATE_JWK AUTH_ENCRYPTION_KEY VAPID_PRIVATE_KEY CRON_SECRET ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN STORAGE_S3_SECRET_ACCESS_KEY STORAGE_S3_ACCESS_KEY_ID OWNER_PASSWORD)
fail=0
for n in "${names[@]}"; do
  if grep -rqF -- "$n" "$dir"; then echo "Server variable name in client bundle: $n"; fail=1; fi
  v="${!n:-}"
  if [ -n "$v" ] && [ "${#v}" -ge 8 ] && grep -rqF -- "$v" "$dir"; then echo "VALUE of $n found in client bundle"; fail=1; fi
done
[ "$fail" = 0 ] && echo "Client bundles contain no server secrets (${#names[@]} variables checked)."
exit "$fail"
