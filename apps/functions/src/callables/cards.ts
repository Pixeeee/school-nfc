
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { activateCardSchema, buildCardPayload, canTransitionCard, changeCardStatusSchema, reserveCardSchema } from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireDeviceLease, requireMembership, requireUser } from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

export const reserveCard = onCall({ ...callableOptions, consumeAppCheckToken: true }, async (request) => {
  const input = parseInput(reserveCardSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, input.operation === "REPLACE" ? "nfc.replace" : "nfc.write");
  await requireDeviceLease(request, input);
  const studentRef = db.doc(`schools/${input.schoolId}/students/${input.studentId}`);
  const student = await studentRef.get();
  if (!student.exists || student.data()?.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Student is not active.");
  if (input.operation === "NEW" && student.data()?.activeCardId) throw new HttpsError("already-exists", "Student already has an active card. Use replacement instead.");
  if (input.operation === "REPLACE" && student.data()?.activeCardId !== input.replacedCardId) throw new HttpsError("failed-precondition", "The selected card is not the student's active card.");

  const clearToken = randomToken(24);
  const cardRef = db.collection(`schools/${input.schoolId}/nfcCards`).doc();
  const reservationRef = db.collection(`schools/${input.schoolId}/cardReservations`).doc();
  const school = await db.doc(`schools/${input.schoolId}`).get();
  const schoolPublicCode = school.data()?.publicCode;
  if (typeof schoolPublicCode !== "string") throw new HttpsError("failed-precondition", "School public code is not configured.");
  const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
  await db.runTransaction(async (tx) => {
    tx.create(cardRef, {
      cardPublicId: cardRef.id, studentId: input.studentId, sectionId: student.data()?.sectionId, tokenHash: sha256(clearToken), payloadVersion: "EDU1",
      status: "RESERVED", operation: input.operation, replacedCardId: input.replacedCardId ?? null,
      reservationId: reservationRef.id, issuedBy: actor.uid, issuedDeviceId: input.deviceId,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(reservationRef, {
      cardId: cardRef.id, studentId: input.studentId, tokenHash: sha256(clearToken), status: "PENDING",
      operation: input.operation, replacedCardId: input.replacedCardId ?? null, deviceId: input.deviceId,
      userId: actor.uid, leaseId: input.leaseId, expiresAt, createdAt: FieldValue.serverTimestamp(),
    });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "CARD_RESERVED", actorUserId: actor.uid, actorDeviceId: input.deviceId, targetType: "NFC_CARD", targetId: cardRef.id, after: { studentId: input.studentId, operation: input.operation } });
  });
  return {
    reservationId: reservationRef.id,
    cardId: cardRef.id,
    payload: buildCardPayload(schoolPublicCode, clearToken),
    expiresAt: expiresAt.toDate().toISOString(),
  };
});

export const activateCard = onCall({ ...callableOptions, consumeAppCheckToken: true }, async (request) => {
  const input = parseInput(activateCardSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "nfc.write");
  await requireDeviceLease(request, input);
  const reservationRef = db.doc(`schools/${input.schoolId}/cardReservations/${input.reservationId}`);
  const result = await db.runTransaction(async (tx) => {
    const reservationSnap = await tx.get(reservationRef);
    if (!reservationSnap.exists) throw new HttpsError("not-found", "Card reservation was not found.");
    const reservation = reservationSnap.data()!;
    if (reservation.status !== "PENDING" || (reservation.expiresAt as Timestamp).toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Card reservation has expired or was already used.");
    if (reservation.deviceId !== input.deviceId || reservation.userId !== actor.uid || reservation.leaseId !== input.leaseId) throw new HttpsError("permission-denied", "Reservation does not belong to this device session.");
    const cardRef = db.doc(`schools/${input.schoolId}/nfcCards/${reservation.cardId}`);
    const studentRef = db.doc(`schools/${input.schoolId}/students/${reservation.studentId}`);
    const [cardSnap, studentSnap] = await tx.getAll(cardRef, studentRef);
    if (!cardSnap.exists || !studentSnap.exists) throw new HttpsError("not-found", "Card or student was not found.");
    if (cardSnap.data()?.status !== "RESERVED") throw new HttpsError("failed-precondition", "Card is not awaiting activation.");
    if (reservation.operation === "REPLACE") {
      const oldRef = db.doc(`schools/${input.schoolId}/nfcCards/${reservation.replacedCardId}`);
      const old = await tx.get(oldRef);
      if (!old.exists || old.data()?.status !== "ACTIVE") throw new HttpsError("failed-precondition", "Old card is not active.");
      tx.update(oldRef, { status: "REPLACED", replacementCardId: cardRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    }
    tx.update(cardRef, { status: "ACTIVE", tagUidHash: input.tagUidHash ?? null, tagTechnologies: input.tagTechnologies, capacityBytes: input.capacityBytes, activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    tx.update(studentRef, { activeCardId: cardRef.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    tx.update(reservationRef, { status: "ACTIVATED", activatedAt: FieldValue.serverTimestamp(), activatedBy: actor.uid, tokenHash: FieldValue.delete() });
    writeAudit(tx, { schoolId: input.schoolId, eventType: "CARD_ACTIVATED", actorUserId: actor.uid, actorDeviceId: input.deviceId, targetType: "NFC_CARD", targetId: cardRef.id, after: { studentId: reservation.studentId, tagUidHash: input.tagUidHash ?? null } });
    return { cardId: cardRef.id, studentId: reservation.studentId, status: "ACTIVE" };
  });
  return result;
});

export const changeCardStatus = onCall(callableOptions, async (request) => {
  const input = parseInput(changeCardStatusSchema, request.data);
  const permission = input.status === "ACTIVE" ? "nfc.reactivate" : "nfc.disable";
  const actor = await requireMembership(request, input.schoolId, permission);
  const ref = db.doc(`schools/${input.schoolId}/nfcCards/${input.cardId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Card was not found.");
    const current = snap.data()?.status;
    if (!canTransitionCard(current, input.status)) throw new HttpsError("failed-precondition", `Card cannot move from ${current} to ${input.status}.`);
    tx.update(ref, { status: input.status, statusReason: input.reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    if (["LOST", "DISABLED", "RETIRED"].includes(input.status) && snap.data()?.studentId) {
      const studentRef = db.doc(`schools/${input.schoolId}/students/${snap.data()?.studentId}`);
      const student = await tx.get(studentRef);
      if (student.data()?.activeCardId === input.cardId) tx.update(studentRef, { activeCardId: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    }
    writeAudit(tx, { schoolId: input.schoolId, eventType: `CARD_${input.status}`, actorUserId: actor.uid, targetType: "NFC_CARD", targetId: input.cardId, reason: input.reason, before: { status: current }, after: { status: input.status } });
  });
  return { cardId: input.cardId, status: input.status };
});
