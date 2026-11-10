import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, toAppError } from "./errors";

describe("toAppError", () => {
  it("maps validation, an empty PATCH and database errors to client errors, and hides the rest", () => {
    expect(toAppError(z.object({ a: z.string() }).safeParse({}).error).status).toBe(400);
    expect(toAppError(new Error("No values to set"))).toMatchObject({ status: 400, message: "Send at least one field to change." });
    expect(toAppError(Object.assign(new Error("dup"), { code: "23505", severity: "ERROR" })).status).toBe(409);
    expect(toAppError(new AppError(503, "storage_not_configured", "x")).status).toBe(503);
    const hidden = toAppError(new Error("connection string postgres://secret"));
    expect(hidden).toMatchObject({ status: 500, message: "Something went wrong." });
  });
});
