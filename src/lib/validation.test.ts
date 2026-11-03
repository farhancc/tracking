import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as communication from "@/features/communication/schemas";
import * as goals from "@/features/goals/schemas";
import * as products from "@/features/products/schemas";
import * as psychology from "@/features/psychology/schemas";
import * as roadmap from "@/features/roadmap/schemas";
import * as sales from "@/features/sales/schemas";
import * as weekly from "@/features/weekly/schemas";
import { patchOf } from "./validation";

const defaultedKeys = (schema: z.ZodObject) =>
  Object.entries(schema.shape as Record<string, z.ZodType>)
    .filter(([, field]) => (field instanceof z.ZodOptional ? field.unwrap() : field) instanceof z.ZodDefault)
    .map(([key]) => key);

describe("patchOf", () => {
  it("makes every field optional without applying defaults", () => {
    const create = z.object({ title: z.string(), status: z.enum(["open", "done"]).default("open"), n: z.number().default(0) });
    expect(create.partial().parse({ title: "x" })).toEqual({ title: "x", status: "open", n: 0 }); // the Zod 4 behaviour we avoid
    expect(patchOf(create).parse({ title: "x" })).toEqual({ title: "x" });
    expect(patchOf(create).parse({ status: "done" })).toEqual({ status: "done" });
    expect(defaultedKeys(create.partial())).toEqual(["status", "n"]);
    expect(defaultedKeys(patchOf(create))).toEqual([]);
  });

  it("no update schema in the app injects defaults into a patch", () => {
    const modules = { communication, goals, products, psychology, roadmap, sales, weekly };
    const offenders: string[] = [];
    for (const [mod, exports] of Object.entries(modules)) {
      for (const [name, schema] of Object.entries(exports)) {
        if (!/Update|Patch/.test(name) || !(schema instanceof z.ZodObject)) continue;
        for (const key of defaultedKeys(schema)) offenders.push(`${mod}.${name}.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
