/**
 * The development-only sign-in is enabled only under `next dev` with
 * FYOS_DEV_LOGIN=1. Production builds (NODE_ENV=production) can never enable it.
 */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.FYOS_DEV_LOGIN === "1";
}
