
import type { Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../admin.js";

export interface AuditInput {
  schoolId: string;
  eventType: string;
  actorUserId: string;
  actorDeviceId?: string;
  targetType: string;
  targetId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
}

export function writeAudit(transaction: Transaction, input: AuditInput): void {
  const ref = db.collection(`schools/${input.schoolId}/auditLogs`).doc();
  transaction.create(ref, {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
