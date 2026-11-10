import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { devLoginEnabled } from "@/lib/auth/dev";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const dev = devLoginEnabled();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl font-semibold">FiveYearOS</h1>
          <CardDescription>Sign in with your password and authenticator app.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
            <LoginForm />
          </Suspense>
          {dev ? (
            <form action="/api/dev/login" method="post" className="flex flex-col gap-2 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Local development only (<code>FYOS_DEV_LOGIN=1</code> under <code>next dev</code>).
              </p>
              <Button type="submit" variant="outline">
                Continue as dev owner
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
