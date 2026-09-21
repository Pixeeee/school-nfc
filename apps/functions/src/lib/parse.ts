
import type { ZodType } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

export function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Request validation failed.", {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

export function assert(condition: unknown, code: ConstructorParameters<typeof HttpsError>[0], message: string): asserts condition {
  if (!condition) throw new HttpsError(code, message);
}
