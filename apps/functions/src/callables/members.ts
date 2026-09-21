
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { acceptInvitationSchema, effectivePermissions, inviteMemberSchema } from "@school-nfc/contracts";
import { db } from "../admin.js";
import { requireMembership, requireUser } from "../lib/authz.js";
import { writeAudit } from "../lib/audit.js";
import { constantTimeShape, randomToken, sha256 } from "../lib/crypto.js";
import { callableOptions } from "../lib/options.js";
import { parseInput } from "../lib/parse.js";

export const inviteMember = onCall(callableOptions, async (request) => {
  const input = parseInput(inviteMemberSchema, request.data);
  const actor = await requireMembership(request, input.schoolId, "user.invite");
  if (input.role === "SCHOOL_ADMIN" && actor.role !== "SCHOOL_ADMIN") throw new HttpsError("permission-denied", "Only a school administrator can invite another administrator.");
  const token = randomToken(32);
  const invitationRef = db.collection(`schools/${input.schoolId}/invitations`).doc();
  await invitationRef.create({
    email: input.email, role: input.role, permissionAdditions: input.permissionAdditions,
    permissionRemovals: input.permissionRemovals, sectionIds: input.sectionIds,
    tokenHash: sha256(token), status: "PENDING", expiresAt: Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000),
    invitedBy: actor.uid, createdAt: FieldValue.serverTimestamp(),
  });
  return { invitationId: invitationRef.id, invitationToken: token, expiresInHours: 72 };
});

export const acceptInvitation = onCall(callableOptions, async (request) => {
  const actor = requireUser(request);
  const input = parseInput(acceptInvitationSchema, request.data);
  if (!constantTimeShape(input.invitationToken)) throw new HttpsError("invalid-argument", "Invitation token is invalid.");
  if (!actor.email) throw new HttpsError("failed-precondition", "The signed-in account must have a verified email address.");
  const tokenHash = sha256(input.invitationToken);
  const invitationQuery = await db.collectionGroup("invitations").where("tokenHash", "==", tokenHash).limit(2).get();
  if (invitationQuery.size !== 1) throw new HttpsError("not-found", "Invitation is invalid or expired.");
  const invitationRef = invitationQuery.docs[0]!.ref;
  const schoolId = invitationRef.parent.parent!.id;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(invitationRef);
    if (!snap.exists) throw new HttpsError("not-found", "Invitation was not found.");
    const invitation = snap.data()!;
    if (invitation.status !== "PENDING" || (invitation.expiresAt as Timestamp).toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Invitation is no longer active.");
    if (String(invitation.email).toLowerCase() !== actor.email) throw new HttpsError("permission-denied", "This invitation belongs to another email address.");
    const membership = {
      uid: actor.uid, schoolId, email: actor.email, role: invitation.role, status: "ACTIVE",
      permissionAdditions: invitation.permissionAdditions ?? [], permissionRemovals: invitation.permissionRemovals ?? [],
      sectionIds: invitation.sectionIds ?? [], effectivePermissions: effectivePermissions(invitation.role, invitation.permissionAdditions, invitation.permissionRemovals),
      createdAt: FieldValue.serverTimestamp(), createdBy: invitation.invitedBy, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid,
    };
    tx.set(db.doc(`schools/${schoolId}/members/${actor.uid}`), membership);
    tx.set(db.doc(`users/${actor.uid}/schoolMemberships/${schoolId}`), membership);
    tx.update(invitationRef, { status: "ACCEPTED", acceptedBy: actor.uid, acceptedAt: FieldValue.serverTimestamp(), tokenHash: FieldValue.delete() });
    writeAudit(tx, { schoolId, eventType: "USER_INVITATION_ACCEPTED", actorUserId: actor.uid, targetType: "MEMBER", targetId: actor.uid, after: { role: invitation.role } });
  });
  return { schoolId };
});
