
export const ROLES = [
  "PLATFORM_ADMIN",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "TEACHER",
  "ATTENDANCE_OFFICER",
  "AUDITOR",
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "school.read", "school.settings.manage",
  "user.read", "user.invite", "user.role.manage",
  "student.read", "student.create", "student.update", "student.archive",
  "guardian.read", "guardian.create", "guardian.update",
  "academic.read", "academic.manage",
  "nfc.read", "nfc.write", "nfc.replace", "nfc.disable", "nfc.reactivate", "nfc.clear",
  "scanner.start", "scanner.arrival", "scanner.dismissal", "scanner.custom",
  "attendance.read", "attendance.correct", "attendance.export",
  "sms.template.manage", "sms.read", "sms.retry", "sms.cancel",
  "device.read", "device.approve", "device.suspend", "device.revoke",
  "audit.read", "report.read", "report.export",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const all = [...PERMISSIONS] as Permission[];
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: all,
  SCHOOL_ADMIN: all.filter((p) => p !== "school.read" || true),
  REGISTRAR: [
    "school.read", "user.read", "student.read", "student.create", "student.update", "student.archive",
    "guardian.read", "guardian.create", "guardian.update", "academic.read", "nfc.read", "nfc.write",
    "nfc.replace", "nfc.disable", "nfc.reactivate", "nfc.clear", "attendance.read", "report.read",
    "report.export", "device.read",
  ],
  TEACHER: [
    "school.read", "student.read", "guardian.read", "academic.read", "nfc.read", "scanner.start",
    "scanner.arrival", "scanner.dismissal", "attendance.read", "sms.read", "device.read",
  ],
  ATTENDANCE_OFFICER: [
    "school.read", "student.read", "guardian.read", "academic.read", "nfc.read", "scanner.start",
    "scanner.arrival", "scanner.dismissal", "scanner.custom", "attendance.read", "attendance.correct",
    "attendance.export", "sms.read", "sms.retry", "report.read", "report.export", "device.read",
  ],
  AUDITOR: ["school.read", "student.read", "attendance.read", "sms.read", "device.read", "audit.read", "report.read", "report.export"],
};

export function effectivePermissions(role: Role, additions: readonly Permission[] = [], removals: readonly Permission[] = []): Permission[] {
  const denied = new Set(removals);
  return [...new Set([...ROLE_PERMISSIONS[role], ...additions])].filter((p) => !denied.has(p));
}

export const MEMBER_STATUSES = ["INVITED", "ACTIVE", "SUSPENDED", "DISABLED"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const DEVICE_STATUSES = ["PENDING", "APPROVED", "SUSPENDED", "REVOKED"] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const CARD_STATUSES = [
  "AVAILABLE", "RESERVED", "WRITE_PENDING", "ACTIVE", "WRITE_FAILED", "LOST", "DISABLED", "REPLACED", "DAMAGED", "RETIRED",
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

const cardTransitions: Record<CardStatus, readonly CardStatus[]> = {
  AVAILABLE: ["RESERVED", "RETIRED"],
  RESERVED: ["WRITE_PENDING", "AVAILABLE", "WRITE_FAILED"],
  WRITE_PENDING: ["ACTIVE", "WRITE_FAILED"],
  WRITE_FAILED: ["RESERVED", "AVAILABLE", "RETIRED"],
  ACTIVE: ["LOST", "DISABLED", "REPLACED", "DAMAGED", "RETIRED"],
  LOST: ["DISABLED", "REPLACED", "ACTIVE", "RETIRED"],
  DISABLED: ["ACTIVE", "REPLACED", "RETIRED"],
  REPLACED: ["RETIRED"],
  DAMAGED: ["RETIRED"],
  RETIRED: [],
};

export function canTransitionCard(from: CardStatus, to: CardStatus): boolean {
  return cardTransitions[from].includes(to);
}

export const ATTENDANCE_EVENT_TYPES = ["ARRIVAL", "DISMISSAL", "CUSTOM"] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "DISMISSED", "ABSENT", "EXCUSED", "CORRECTED", "VOIDED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const SMS_STATUSES = ["PENDING", "READY", "SENDING", "SENT", "DELIVERED", "FAILED_RETRYABLE", "FAILED_FINAL", "CANCELLED"] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

export const TERMINAL_SMS_STATUSES: readonly SmsStatus[] = ["DELIVERED", "FAILED_FINAL", "CANCELLED"];

export function canApplySmsStatus(current: SmsStatus, next: SmsStatus): boolean {
  if (current === next) return true;
  if (TERMINAL_SMS_STATUSES.includes(current)) return false;
  const rank: Record<SmsStatus, number> = {
    PENDING: 0, READY: 1, SENDING: 2, FAILED_RETRYABLE: 2, SENT: 3, DELIVERED: 4, FAILED_FINAL: 4, CANCELLED: 4,
  };
  return rank[next] >= rank[current] || (current === "FAILED_RETRYABLE" && next === "READY");
}
