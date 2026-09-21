
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import type { Transaction } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { effectivePermissions, type Permission, type Role } from "@school-nfc/contracts";
import { db } from "../admin.js";

export interface Membership {
  uid: string;
  schoolId: string;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  permissionAdditions: Permission[];
  permissionRemovals: Permission[];
  sectionIds: string[];
  email?: string;
}

export interface DeviceLeaseContext {
  deviceId: string;
  leaseId: string;
  device: FirebaseFirestore.DocumentData;
  lease: FirebaseFirestore.DocumentData;
}

export function requireUser(request: CallableRequest<unknown>): { uid: string; email?: string; platformAdmin: boolean } {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in is required.");
  return {
    uid: request.auth.uid,
    email: typeof request.auth.token.email === "string" ? request.auth.token.email.toLowerCase() : undefined,
    platformAdmin: request.auth.token.platformAdmin === true,
  };
}

export async function requireMembership(
  request: CallableRequest<unknown>,
  schoolId: string,
  permission?: Permission,
): Promise<Membership> {
  const user = requireUser(request);
  const snap = await db.doc(`schools/${schoolId}/members/${user.uid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "You are not a member of this school.");
  const data = snap.data() as Membership;
  if (data.status !== "ACTIVE") throw new HttpsError("permission-denied", "Your school membership is not active.");
  const permissions = effectivePermissions(data.role, data.permissionAdditions ?? [], data.permissionRemovals ?? []);
  if (permission && !permissions.includes(permission)) throw new HttpsError("permission-denied", `Missing permission: ${permission}`);
  return { ...data, uid: user.uid, schoolId };
}

export async function requireDeviceLease(
  request: CallableRequest<unknown>,
  input: { schoolId: string; deviceId: string; leaseId: string },
  transaction?: Transaction,
): Promise<DeviceLeaseContext> {
  const user = requireUser(request);
  const deviceRef = db.doc(`schools/${input.schoolId}/devices/${input.deviceId}`);
  const leaseRef = db.doc(`schools/${input.schoolId}/deviceLeases/${input.leaseId}`);
  const [deviceSnap, leaseSnap] = transaction
    ? await transaction.getAll(deviceRef, leaseRef)
    : await db.getAll(deviceRef, leaseRef);
  if (!deviceSnap.exists || !leaseSnap.exists) throw new HttpsError("permission-denied", "Device authorization is missing.");
  const device = deviceSnap.data()!;
  const lease = leaseSnap.data()!;
  if (device.status !== "APPROVED") throw new HttpsError("permission-denied", "This device is not approved.");
  if (device.assignedUserId !== user.uid) throw new HttpsError("permission-denied", "This device is assigned to another user.");
  if (lease.deviceId !== input.deviceId || lease.userId !== user.uid || lease.status !== "ACTIVE") {
    throw new HttpsError("permission-denied", "Device lease is invalid.");
  }
  const expiresAt = lease.expiresAt as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Device lease has expired.");
  return { deviceId: input.deviceId, leaseId: input.leaseId, device, lease };
}

export function assertSectionScope(member: Membership, sectionId: string): void {
  if (member.role === "SCHOOL_ADMIN" || member.role === "REGISTRAR") return;
  if (!(member.sectionIds ?? []).includes(sectionId)) throw new HttpsError("permission-denied", "The section is outside your assigned scope.");
}
