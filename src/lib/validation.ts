import { z } from "zod";

type StripDefault<T> = T extends z.ZodDefault<infer I> ? I : T;
export type PatchShape<S extends z.ZodRawShape> = { [K in keyof S]: z.ZodOptional<StripDefault<S[K]>> };

/**
 * Like `.partial()`, but drops `.default()` values. Zod 4 still applies
 * defaults to absent optional keys, so a plain `.partial()` makes a PATCH
 * reset every defaulted field it did not mention.
 */
export function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>;
}
