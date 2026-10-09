import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { db } from "../src/admin.js";
import * as api from "../src/index.js";

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const call = (
  fn: { run: (r: CallableRequest<any>) => any },
  data: unknown,
  uid = "teacher",
) => fn.run({ data, auth: { uid, token: {} } } as CallableRequest);
let schoolId: string;
let base: { schoolId: string; deviceId: string; leaseId: string };
const ref = (path: string) => db.doc(`schools/${schoolId}/${path}`);

describe.skipIf(!enabled)(
  "teacher roll call with real Firestore transactions",
  () => {
    beforeEach(async () => {
      schoolId = `test_${randomUUID()}`;
      base = { schoolId, deviceId: "teacher_phone", leaseId: "teacher_lease" };
      await Promise.all([
        db
          .doc(`schools/${schoolId}`)
          .set({ name: "Test School", timeZone: "Asia/Manila" }),
        ref("members/teacher").set({
          role: "TEACHER",
          status: "ACTIVE",
          sectionIds: [],
          permissionAdditions: [],
          permissionRemovals: [],
        }),
        ref("devices/teacher_phone").set({
          status: "APPROVED",
          assignedUserId: "teacher",
          allowedSectionIds: [],
        }),
        ref("deviceLeases/teacher_lease").set({
          deviceId: "teacher_phone",
          userId: "teacher",
          status: "ACTIVE",
          sectionIds: [],
          expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
        }),
        ref("academicYears/year_2026").set({ name: "2026-2027", active: true }),
        ref("gradeLevels/grade_7").set({ name: "Grade 7", active: true }),
      ]);
    });
    async function section() {
      return call(api.createTeacherSection, {
        ...base,
        requestId: randomUUID(),
        name: "Sampaguita",
        gradeLevelId: "grade_7",
        academicYearId: "year_2026",
      });
    }
    async function student(sectionId: string, extra = {}) {
      return call(api.createTeacherStudent, {
        ...base,
        requestId: randomUUID(),
        sectionId,
        studentNumber: "2026-001",
        firstName: "Juan",
        lastName: "Santos",
        parentName: "Maria Santos",
        parentPhone: "09171234567",
        parentPhoneVerified: true,
        parentConsent: true,
        ...extra,
      });
    }
    function event(studentId: string, extra = {}) {
      const localTimestamp = new Date().toISOString();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const date = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const localSchoolDate = `${date.year}-${date.month}-${date.day}`;
      return {
        eventUuid: randomUUID(),
        studentId,
        source: "MANUAL",
        eventType: "ARRIVAL",
        localTimestamp,
        localSchoolDate,
        timezone: "Asia/Manila",
        clockTrust: "UNKNOWN",
        idempotencyKey: `${schoolId}|${studentId}|${localSchoolDate}|ARRIVAL`,
        ...extra,
      };
    }
    it("creates a section and assigns only its creator and authorized device", async () => {
      const result = await section();
      expect(
        (await ref(`sections/${result.sectionId}`).get()).get("createdBy"),
      ).toBe("teacher");
      expect((await ref("members/teacher").get()).get("sectionIds")).toEqual([
        result.sectionId,
      ]);
      expect(
        (await ref("devices/teacher_phone").get()).get("allowedSectionIds"),
      ).toEqual([result.sectionId]);
      const setup = await call(api.getTeacherSetup, base);
      expect(setup.sections.map((s: any) => s.id)).toEqual([result.sectionId]);
    });
    it("atomically creates a student and consenting verified parent and rejects duplicate numbers", async () => {
      const { sectionId } = await section();
      const result = await student(sectionId);
      expect(
        (await ref(`students/${result.studentId}`).get()).get("sectionId"),
      ).toBe(sectionId);
      expect(
        (await ref(`guardians/${result.guardianId}`).get()).get("phoneE164"),
      ).toBe("+639171234567");
      expect(
        (
          await ref(
            `studentGuardianLinks/${result.studentId}_${result.guardianId}`,
          ).get()
        ).get("receiveArrivalSms"),
      ).toBe(true);
      await expect(student(sectionId)).rejects.toMatchObject({
        code: "already-exists",
      });
      expect(
        (await db.collection(`schools/${schoolId}/students`).get()).size,
      ).toBe(1);
    });
    it("makes creation retries idempotent", async () => {
      const requestId = randomUUID();
      const input = {
        ...base,
        requestId,
        name: "Sampaguita",
        gradeLevelId: "grade_7",
        academicYearId: "year_2026",
      };
      expect(await call(api.createTeacherSection, input)).toEqual(
        await call(api.createTeacherSection, input),
      );
      const studentRequestId = randomUUID();
      const result = await student(requestId, { requestId: studentRequestId });
      expect(await student(requestId, { requestId: studentRequestId })).toEqual(
        result,
      );
      expect(
        (await db.collection(`schools/${schoolId}/students`).get()).size,
      ).toBe(1);
      expect(
        (await db.collection(`schools/${schoolId}/guardians`).get()).size,
      ).toBe(1);
    });
    it("rejects invalid parent numbers and missing verification/consent without partial records", async () => {
      const { sectionId } = await section();
      for (const extra of [
        { parentPhone: "123" },
        { parentConsent: false },
        { parentPhoneVerified: false },
      ]) {
        await expect(student(sectionId, extra)).rejects.toMatchObject({
          code: "invalid-argument",
        });
      }
      expect(
        (await db.collection(`schools/${schoolId}/students`).get()).size,
      ).toBe(0);
    });
    it("rejects teacher writes and attendance outside assigned sections", async () => {
      await ref("sections/foreign_section").set({
        name: "Other",
        active: true,
      });
      await expect(student("foreign_section")).rejects.toMatchObject({
        code: "permission-denied",
      });
      await ref("students/foreign_student").set({
        status: "ACTIVE",
        sectionId: "foreign_section",
      });
      const result = await call(api.ingestAttendanceBatch, {
        ...base,
        batchId: randomUUID(),
        events: [event("foreign_student")],
      });
      expect(result.results[0]).toMatchObject({
        result: "REJECTED",
        errorCode: "permission-denied",
      });
    });
    it("records manual presence without a card, deduplicates concurrent events and ingests parent SMS results", async () => {
      const { sectionId } = await section();
      const { studentId, guardianId } = await student(sectionId);
      const entry = event(studentId);
      const responses = await Promise.all(
        [0, 1].map(() =>
          call(api.ingestAttendanceBatch, {
            ...base,
            batchId: randomUUID(),
            events: [{ ...entry, eventUuid: randomUUID() }],
          }),
        ),
      );
      expect(
        responses.flatMap((r) => r.results.map((v: any) => v.result)).sort(),
      ).toEqual(["ACCEPTED", "ALREADY_EXISTS"]);
      const events = await db
        .collection(`schools/${schoolId}/attendanceEvents`)
        .get();
      expect(events.size).toBe(1);
      expect(events.docs[0]!.data()).toMatchObject({
        source: "MANUAL",
        status: "PRESENT",
        cardId: null,
      });
      const sms = await call(api.ingestSmsResults, {
        ...base,
        results: [
          {
            messageId: randomUUID(),
            attendanceEventId: events.docs[0]!.get("eventUuid"),
            guardianId,
            status: "SENT",
            attemptCount: 1,
            sentAt: new Date().toISOString(),
            deliveredAt: null,
            lastErrorCode: null,
          },
        ],
      });
      expect(sms.results[0].result).toBe("ACCEPTED");
      expect(
        (
          await db.collection(`schools/${schoolId}/smsMessages`).get()
        ).docs[0]!.get("status"),
      ).toBe("SENT");
    }, 30000);
    it("keeps NFC card validation and rejects expired leases", async () => {
      const { sectionId } = await section();
      const { studentId } = await student(sectionId);
      const result = await call(api.ingestAttendanceBatch, {
        ...base,
        batchId: randomUUID(),
        events: [event(studentId, { source: "NFC", cardId: "unknown_card" })],
      });
      expect(result.results[0].result).toBe("REJECTED");
      await ref("deviceLeases/teacher_lease").update({
        expiresAt: Timestamp.fromMillis(Date.now() - 1),
      });
      await expect(call(api.getTeacherSetup, base)).rejects.toMatchObject({
        code: "failed-precondition",
      });
    });
  },
);
