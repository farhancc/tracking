-- Privileges for the login milestone. Only fyos_auth reaches the auth schema;
-- the app role never sees credentials, sessions or audit events.
grant select, insert on auth.events to fyos_auth;
grant select, insert, update, delete on auth.rate_limits to fyos_auth;
grant select, insert, update, delete on auth.recovery_codes to fyos_auth;
revoke all on auth.events, auth.rate_limits, auth.recovery_codes from fyos_app;
