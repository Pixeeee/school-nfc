
import { describe, expect, it } from "vitest";
import { deterministicDocumentId, randomToken, sha256 } from "../src/lib/crypto.js";

describe("server crypto helpers", () => {
  it("creates URL-safe high-entropy tokens", () => {
    const token = randomToken(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken(24)).not.toBe(token);
  });
  it("hashes deterministically", () => {
    expect(sha256("secret")).toHaveLength(64);
    expect(deterministicDocumentId("event-key")).toBe(deterministicDocumentId("event-key"));
  });
});
