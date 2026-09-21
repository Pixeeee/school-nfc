
import { z } from "zod";
import {
  ATTENDANCE_EVENT_TYPES, CARD_STATUSES, DEVICE_STATUSES, MEMBER_STATUSES, PERMISSIONS, ROLES, SMS_STATUSES,
} from "./domain.js";
import { normalizePhilippineMobile } from "./phone.js";
import { validateSmsTemplate } from "./sms.js";

export const idSchema = z.string().trim().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const schoolIdSchema = idSchema;
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const roleSchema = z.enum(ROLES);
export const permissionSchema = z.enum(PERMISSIONS);
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export const deviceStatusSchema = z.enum(DEVICE_STATUSES);
export const cardStatusSchema = z.enum(CARD_STATUSES);
export const attendanceEventTypeSchema = z.enum(ATTENDANCE_EVENT_TYPES);
export const smsStatusSchema = z.enum(SMS_STATUSES);

export const personNameSchema = z.string().trim().min(1).max(80).regex(/^[\p{L}\p{M} .'-]+$/u, "Name contains unsupported characters.");
export const optionalPersonNameSchema = z.union([personNameSchema, z.literal("")]).optional();
export const philippineMobileSchema = z.string().transform((value, context) => {
  try { return normalizePhilippineMobile(value); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid phone number." }); return z.NEVER; }
});

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  publicCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/),
  timeZone: z.string().trim().min(3).max(64).default("Asia/Manila"),
});

export const inviteMemberSchema = z.object({
  schoolId: schoolIdSchema,
  email: emailSchema,
  role: roleSchema.exclude(["PLATFORM_ADMIN"]),
  permissionAdditions: z.array(permissionSchema).max(30).default([]),
  permissionRemovals: z.array(permissionSchema).max(30).default([]),
  sectionIds: z.array(idSchema).max(100).default([]),
});

export const acceptInvitationSchema = z.object({ invitationToken: z.string().min(32).max(256) });

export const createStudentSchema = z.object({
  schoolId: schoolIdSchema,
  studentNumber: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9/_-]+$/),
  firstName: personNameSchema,
  middleName: optionalPersonNameSchema,
  lastName: personNameSchema,
  suffix: z.string().trim().max(15).default(""),
  preferredName: z.string().trim().max(80).default(""),
  gradeLevelId: idSchema,
  sectionId: idSchema,
  academicYearId: idSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED", "ARCHIVED"]).default("ACTIVE"),
});

export const updateStudentSchema = createStudentSchema.partial().required({ schoolId: true }).extend({ studentId: idSchema });

export const createGuardianSchema = z.object({
  schoolId: schoolIdSchema,
  displayName: personNameSchema,
  phone: philippineMobileSchema,
  phoneStatus: z.enum(["UNVERIFIED", "VERIFIED", "INVALID", "DISABLED"]).default("UNVERIFIED"),
  consentStatus: z.enum(["PENDING", "RECORDED", "WITHDRAWN", "NOT_REQUIRED"]).default("PENDING"),
});

export const linkGuardianSchema = z.object({
  schoolId: schoolIdSchema,
  studentId: idSchema,
  guardianId: idSchema,
  relationship: z.string().trim().min(2).max(40),
  primary: z.boolean().default(false),
  receiveArrivalSms: z.boolean().default(true),
  receiveDismissalSms: z.boolean().default(true),
  receiveLateSms: z.boolean().default(true),
  receiveCustomSms: z.boolean().default(false),
});

export const registerDeviceSchema = z.object({
  schoolId: schoolIdSchema,
  devicePublicId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(80),
  platform: z.literal("ANDROID"),
  appVersion: z.string().trim().min(1).max(30),
  androidVersion: z.string().trim().min(1).max(30),
  manufacturer: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
});

export const approveDeviceSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  allowedSectionIds: z.array(idSchema).max(30),
  leaseHours: z.number().int().min(1).max(168).default(24),
});

export const deviceLeaseSchema = z.object({ schoolId: schoolIdSchema, deviceId: idSchema });

export const reserveCardSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  leaseId: idSchema,
  studentId: idSchema,
  operation: z.enum(["NEW", "REPLACE"]).default("NEW"),
  replacedCardId: idSchema.optional(),
}).superRefine((value, context) => {
  if (value.operation === "REPLACE" && !value.replacedCardId) context.addIssue({ code: "custom", path: ["replacedCardId"], message: "The replaced card is required." });
});

export const activateCardSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  leaseId: idSchema,
  reservationId: idSchema,
  tagUidHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  tagTechnologies: z.array(z.string().trim().min(1).max(80)).max(20),
  capacityBytes: z.number().int().min(1).max(32768),
});

export const changeCardStatusSchema = z.object({
  schoolId: schoolIdSchema,
  cardId: idSchema,
  status: z.enum(["LOST", "DISABLED", "ACTIVE", "DAMAGED", "RETIRED"]),
  reason: z.string().trim().min(5).max(500),
});

export const attendanceEventInputSchema = z.object({
  eventUuid: z.string().uuid(),
  idempotencyKey: z.string().min(10).max(500),
  studentId: idSchema,
  cardId: idSchema,
  eventType: attendanceEventTypeSchema,
  localSchoolDate: isoDateSchema,
  localTimestamp: isoDateTimeSchema,
  timezone: z.string().min(3).max(64),
  clockTrust: z.enum(["TRUSTED", "UNTRUSTED", "UNKNOWN"]),
  scannerSessionId: idSchema,
  smsExpectedCount: z.number().int().min(0).max(10),
});

export const ingestAttendanceBatchSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  leaseId: idSchema,
  batchId: z.string().uuid(),
  events: z.array(attendanceEventInputSchema).min(1).max(100),
});

export const smsResultSchema = z.object({
  messageId: z.string().uuid(),
  attendanceEventId: z.string().uuid(),
  guardianId: idSchema,
  status: smsStatusSchema,
  attemptCount: z.number().int().min(0).max(30),
  sentAt: isoDateTimeSchema.optional(),
  deliveredAt: isoDateTimeSchema.optional(),
  lastErrorCode: z.string().trim().max(100).optional(),
});

export const ingestSmsResultsSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  leaseId: idSchema,
  batchId: z.string().uuid(),
  results: z.array(smsResultSchema).min(1).max(200),
});

export const smsTemplateSchema = z.object({
  schoolId: schoolIdSchema,
  templateId: idSchema.optional(),
  eventType: attendanceEventTypeSchema,
  name: z.string().trim().min(2).max(80),
  body: z.string().trim().min(1).max(480).superRefine((value, context) => {
    for (const error of validateSmsTemplate(value).errors) context.addIssue({ code: "custom", message: error });
  }),
  enabled: z.boolean().default(true),
});

export const correctAttendanceSchema = z.object({
  schoolId: schoolIdSchema,
  eventId: idSchema,
  correctedStatus: z.enum(["PRESENT", "LATE", "DISMISSED", "ABSENT", "EXCUSED", "VOIDED"]),
  correctedTimestamp: isoDateTimeSchema.optional(),
  reason: z.string().trim().min(10).max(1000),
});

export const snapshotRequestSchema = z.object({
  schoolId: schoolIdSchema,
  deviceId: idSchema,
  leaseId: idSchema,
  kind: z.enum(["CONFIG", "STUDENTS", "CARDS", "GUARDIANS", "TEMPLATES"]),
  cursor: z.string().max(500).optional(),
  pageSize: z.number().int().min(1).max(500).default(250),
});

export type CreateStudentInput = z.input<typeof createStudentSchema>;
export type CreateGuardianInput = z.input<typeof createGuardianSchema>;
export type AttendanceEventInput = z.infer<typeof attendanceEventInputSchema>;
