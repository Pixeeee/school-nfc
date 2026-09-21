import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

const app = getApps()[0] ?? initializeApp();
const db = getFirestore(app);

const schema = z
  .object({
    schoolId: z.string().min(6).max(128),
    guardianId: z.string().min(6).max(128),
    displayName: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(10).max(32).optional(),
    phoneStatus: z.enum(["UNVERIFIED", "VERIFIED", "INVALID", "DISABLED"]).optional(),
    consentStatus: z.enum(["NOT_RECORDED", "RECORDED", "WITHDRAWN"]).optional(),
    verificationConfirmed: z.boolean().default(false),
    consentConfirmed: z.boolean().default(false),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

function normalizePhilippineMobile(value: string): string {
  const compact = value.replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("+63")
    ? compact
    : compact.startsWith("63")
      ? `+${compact}`
      : compact.startsWith("0")
        ? `+63${compact.slice(1)}`
        : compact.startsWith("9")
          ? `+63${compact}`
          : compact;

  if (!/^\+639\d{9}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "Enter a valid Philippine mobile number.");
  }
  return normalized;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}••••${phone.slice(-3)}`;
}

export const updateGuardian = onCall(
  {
    region: "asia-southeast1",
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const parsed = schema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Invalid guardian update.", {
        issues: parsed.error.flatten(),
      });
    }
    const input = parsed.data;

    const memberRef = db.doc(`schools/${input.schoolId}/members/${request.auth.uid}`);
    const guardianRef = db.doc(`schools/${input.schoolId}/guardians/${input.guardianId}`);
    const auditRef = db.collection(`schools/${input.schoolId}/auditLogs`).doc();

    await db.runTransaction(async (transaction) => {
      const [memberSnapshot, guardianSnapshot] = await transaction.getAll(
        memberRef,
        guardianRef,
      );

      const permissions = memberSnapshot.exists && Array.isArray(memberSnapshot.get("permissions"))
        ? (memberSnapshot.get("permissions") as unknown[])
        : [];
      if (
        !memberSnapshot.exists
        || memberSnapshot.get("status") !== "ACTIVE"
        || !permissions.includes("guardian.update")
      ) {
        throw new HttpsError("permission-denied", "guardian.update permission is required.");
      }
      if (!guardianSnapshot.exists) {
        throw new HttpsError("not-found", "Guardian was not found.");
      }
      if (input.phoneStatus === "VERIFIED" && !input.verificationConfirmed) {
        throw new HttpsError(
          "failed-precondition",
          "Explicit phone verification confirmation is required.",
        );
      }
      if (input.consentStatus === "RECORDED" && !input.consentConfirmed) {
        throw new HttpsError(
          "failed-precondition",
          "Explicit guardian consent confirmation is required.",
        );
      }

      const before = guardianSnapshot.data() ?? {};
      const update: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      };
      if (input.displayName !== undefined) update.displayName = input.displayName;
      if (input.phone !== undefined) {
        const phoneE164 = normalizePhilippineMobile(input.phone);
        update.phoneE164 = phoneE164;
        update.phoneMasked = maskPhone(phoneE164);
        // A changed destination must be verified again.
        update.phoneStatus = "UNVERIFIED";
        update.phoneVerifiedAt = FieldValue.delete();
        update.phoneVerifiedBy = FieldValue.delete();
      }
      if (input.phoneStatus !== undefined) {
        update.phoneStatus = input.phoneStatus;
        if (input.phoneStatus === "VERIFIED") {
          update.phoneVerifiedAt = FieldValue.serverTimestamp();
          update.phoneVerifiedBy = request.auth.uid;
        }
      }
      if (input.consentStatus !== undefined) {
        update.consentStatus = input.consentStatus;
        update.consentRecordedAt = input.consentStatus === "RECORDED"
          ? FieldValue.serverTimestamp()
          : FieldValue.delete();
        update.consentRecordedBy = input.consentStatus === "RECORDED"
          ? request.auth.uid
          : FieldValue.delete();
      }

      transaction.update(guardianRef, update);
      transaction.create(auditRef, {
        type: "GUARDIAN_VERIFICATION_UPDATED",
        actorUid: request.auth.uid,
        schoolId: input.schoolId,
        targetType: "guardian",
        targetId: input.guardianId,
        reason: input.reason,
        before: {
          displayName: before.displayName ?? null,
          phoneMasked: before.phoneMasked ?? null,
          phoneStatus: before.phoneStatus ?? null,
          consentStatus: before.consentStatus ?? null,
        },
        after: {
          displayName: update.displayName ?? before.displayName ?? null,
          phoneMasked: update.phoneMasked ?? before.phoneMasked ?? null,
          phoneStatus: update.phoneStatus ?? before.phoneStatus ?? null,
          consentStatus: update.consentStatus ?? before.consentStatus ?? null,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return { ok: true, guardianId: input.guardianId };
  },
);
