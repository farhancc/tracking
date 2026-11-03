"use client";

import { SubmitButton } from "./submit-button";

/** Signing out also clears pages the service worker saved for offline use. */
export function SignOutForm() {
  return (
    <form
      action="/api/auth/logout"
      method="post"
      onSubmit={() => navigator.serviceWorker?.controller?.postMessage("clear-pages")}
    >
      <SubmitButton variant="ghost" size="sm">
        Sign out
      </SubmitButton>
    </form>
  );
}
