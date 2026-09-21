
import { createHash, randomBytes } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function deterministicDocumentId(value: string): string {
  return sha256(value).slice(0, 40);
}

export function constantTimeShape(value: string): boolean {
  return /^[A-Za-z0-9_-]{32,256}$/.test(value);
}
