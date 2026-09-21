
import { describe, expect, it } from "vitest";
import {
  attendanceIdempotencyKey, buildCardPayload, canApplySmsStatus, canTransitionCard,
  createGuardianSchema, estimateSmsSegments, normalizePhilippineMobile, parseCardPayload,
  renderSmsTemplate, validateSmsTemplate,
} from "./index.js";

describe("phone validation", () => {
  it.each(["09171234567", "9171234567", "+639171234567", "639171234567"])("normalizes %s", (input) => {
    expect(normalizePhilippineMobile(input)).toBe("+639171234567");
  });
  it("rejects an invalid number", () => expect(() => normalizePhilippineMobile("123")).toThrow());
});

describe("NFC payload", () => {
  it("round trips a compact payload", () => {
    const encoded = buildCardPayload("AB12CD34", "fW4Z_Qe8TVw3afW0Y5T8PQ");
    expect(parseCardPayload(encoded)).toEqual({ version: "EDU1", schoolPublicCode: "AB12CD34", token: "fW4Z_Qe8TVw3afW0Y5T8PQ" });
  });
  it("rejects personal or malformed payloads", () => expect(() => parseCardPayload("Juan|09171234567")).toThrow());
});

describe("state machines", () => {
  it("allows verified card activation but not retired reuse", () => {
    expect(canTransitionCard("WRITE_PENDING", "ACTIVE")).toBe(true);
    expect(canTransitionCard("RETIRED", "ACTIVE")).toBe(false);
  });
  it("does not regress terminal SMS states", () => {
    expect(canApplySmsStatus("SENT", "DELIVERED")).toBe(true);
    expect(canApplySmsStatus("DELIVERED", "SENDING")).toBe(false);
  });
});

describe("SMS templates", () => {
  const template = "{{schoolName}}: {{studentName}} arrived at {{eventTime}} on {{eventDate}}.";
  it("validates and renders", () => {
    expect(validateSmsTemplate(template).errors).toEqual([]);
    expect(renderSmsTemplate(template, {
      schoolName: "Example School", studentName: "Juan Santos", eventTime: "7:42 AM", eventDate: "September 18, 2026", eventType: "Arrival", shortReference: "ABC123",
    })).toContain("Juan Santos");
  });
  it("rejects unknown variables", () => expect(validateSmsTemplate("{{studentName}} {{eventTime}} {{password}}").errors).toHaveLength(1));
  it("estimates segments", () => expect(estimateSmsSegments("A".repeat(161))).toBe(2));
});

describe("schemas and idempotency", () => {
  it("normalizes guardian phone in schema", () => {
    expect(createGuardianSchema.parse({ schoolId: "school_1", displayName: "Maria Santos", phone: "09171234567" }).phone).toBe("+639171234567");
  });
  it("builds deterministic attendance key", () => {
    const input = { schoolId: "s1", studentId: "st1", localSchoolDate: "2026-09-18", eventType: "ARRIVAL" };
    expect(attendanceIdempotencyKey(input)).toBe(attendanceIdempotencyKey(input));
  });
});
