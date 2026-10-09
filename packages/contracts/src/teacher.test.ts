import { describe, expect, it } from "vitest";
import * as schemas from "./schemas.js";
import { ROLE_PERMISSIONS } from "./domain.js";

describe("teacher roll call contracts", () => {
  const event = {
    eventUuid: "b3abc8f5-6cc3-4a3f-b9e3-d5d3bc55b7b7",
    idempotencyKey: "school|student|2026-10-09|ARRIVAL",
    studentId: "student",
    source: "MANUAL",
    eventType: "ARRIVAL",
    localSchoolDate: "2026-10-09",
    localTimestamp: "2026-10-09T01:00:00Z",
    timezone: "Asia/Manila",
    clockTrust: "UNKNOWN",
    scannerSessionId: "session",
    smsExpectedCount: 1,
  };
  it("accepts manual presence without an NFC card", () => {
    expect(schemas.attendanceEventInputSchema.safeParse(event).success).toBe(
      true,
    );
  });
  it("continues to require a card for NFC attendance", () => {
    expect(
      schemas.attendanceEventInputSchema.safeParse({ ...event, source: "NFC" })
        .success,
    ).toBe(false);
  });
  it("rejects unsupported manual event types", () => {
    expect(
      schemas.attendanceEventInputSchema.safeParse({
        ...event,
        eventType: "DISMISSAL",
      }).success,
    ).toBe(false);
  });
  it("grants scoped teacher setup permissions without granting school-wide academic management", () => {
    expect(ROLE_PERMISSIONS.TEACHER).toContain("section.create");
    expect(ROLE_PERMISSIONS.TEACHER).toContain("student.create");
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain("academic.manage");
  });
});
