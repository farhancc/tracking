"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Next.js keeps visited pages mounted (hidden by React <Activity>), so a
 * success or error message from a Server Action would still be showing when
 * the user comes back. This returns the action state until the component is
 * hidden; after that, the old result is suppressed until a new one arrives.
 * See node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
 */
export function useFreshState<S>(state: S): S | null {
  const latest = useRef(state);
  const [dismissed, setDismissed] = useState<S | null>(null);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useLayoutEffect(() => {
    return () => setDismissed(latest.current);
  }, []);

  return state === dismissed ? null : state;
}
