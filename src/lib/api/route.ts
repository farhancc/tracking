import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection, type NextRequest } from "next/server";
import type { z } from "zod";
import { withUser, type Tx } from "@/db/client";
import { authenticateRequest, type CurrentUser } from "@/lib/auth/current-user";
import { isSameOrigin } from "@/lib/auth/origin";
import { AppError, toAppError } from "@/lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function apiError(error: AppError): Response {
  return Response.json(
    { error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

type Context<P> = {
  request: NextRequest;
  params: P;
  user: CurrentUser;
  tx: Tx;
  /** Parses and validates the JSON body (400 with field errors on failure). */
  body: <S extends z.ZodType>(schema: S) => Promise<z.infer<S>>;
  /** Validates the URL query string. */
  query: <S extends z.ZodType>(schema: S) => z.infer<S>;
};

/**
 * Wraps a route handler: authenticates (cookie or Bearer token), rejects
 * cross-origin unsafe requests made with cookies, runs the handler inside
 * withUser() so RLS applies, and maps every error to a JSON error envelope.
 * Success responses are `{ data: … }`.
 */
export function apiRoute<P = Record<string, never>>(
  handler: (ctx: Context<P>) => Promise<unknown>,
  options: { status?: number } = {},
) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      await connection(); // API responses are always per-request: never prerender them
      const auth = await authenticateRequest(request);
      if (!auth) throw new AppError(401, "unauthenticated", "Sign in or send a valid Bearer token.");
      if (auth.via === "cookie" && !SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
        throw new AppError(403, "bad_origin", "Cross-origin requests are not allowed.");
      }
      const params = (await context.params) ?? ({} as P);

      let rawBody: unknown;
      const body = async <S extends z.ZodType>(schema: S) => {
        if (rawBody === undefined) {
          const type = request.headers.get("content-type") ?? "";
          if (!type.includes("application/json")) {
            throw new AppError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
          }
          try {
            rawBody = await request.json();
          } catch {
            throw new AppError(400, "invalid_json", "The request body is not valid JSON.");
          }
        }
        return schema.parse(rawBody) as z.infer<S>;
      };
      const query = <S extends z.ZodType>(schema: S) =>
        schema.parse(Object.fromEntries(request.nextUrl.searchParams)) as z.infer<S>;

      const result = await withUser(auth.user.userId, (tx) =>
        handler({ request, params, user: auth.user, tx, body, query }),
      );
      if (result instanceof Response) return result;
      if (result === undefined) return new Response(null, { status: 204 });
      return Response.json({ data: result }, { status: options.status ?? 200, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      unstable_rethrow(e); // let Next.js control flow (prerender bail-out, redirects) through
      return apiError(toAppError(e));
    }
  };
}

/**
 * Like apiRoute, but without wrapping the handler in a database transaction,
 * for long-running work (e.g. calls to an external model) that opens its own
 * short transactions as needed.
 */
export function apiRouteNoTx(handler: (ctx: Omit<Context<Record<string, never>>, "tx">) => Promise<unknown>, options: { status?: number } = {}) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      await connection();
      const auth = await authenticateRequest(request);
      if (!auth) throw new AppError(401, "unauthenticated", "Sign in or send a valid Bearer token.");
      if (auth.via === "cookie" && !SAFE_METHODS.has(request.method) && !isSameOrigin(request)) {
        throw new AppError(403, "bad_origin", "Cross-origin requests are not allowed.");
      }
      const body = async <S extends z.ZodType>(schema: S) => {
        if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
          throw new AppError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
        }
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new AppError(400, "invalid_json", "The request body is not valid JSON.");
        }
        return schema.parse(raw) as z.infer<S>;
      };
      const query = <S extends z.ZodType>(schema: S) => schema.parse(Object.fromEntries(request.nextUrl.searchParams)) as z.infer<S>;
      const result = await handler({ request, params: {} as Record<string, never>, user: auth.user, body, query });
      if (result instanceof Response) return result;
      return Response.json({ data: result }, { status: options.status ?? 200, headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      unstable_rethrow(e);
      return apiError(toAppError(e));
    }
  };
}
