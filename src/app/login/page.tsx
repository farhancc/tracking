import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { devLoginEnabled } from "@/lib/auth/dev";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  const dev = devLoginEnabled();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>FiveYearOS</CardTitle>
          <CardDescription>
            Password and authenticator-code sign-in arrives with the authentication milestone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dev ? (
            <form action="/api/dev/login" method="post" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Local development: sign in as the dev owner account (enabled by <code>FYOS_DEV_LOGIN=1</code> under{" "}
                <code>next dev</code> only).
              </p>
              <Button type="submit">Continue as dev owner</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign-in is not available on this deployment yet. API clients can use a Bearer token.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
