
export function attendanceIdempotencyKey(input: {
  schoolId: string;
  studentId: string;
  localSchoolDate: string;
  eventType: string;
}): string {
  return [input.schoolId, input.studentId, input.localSchoolDate, input.eventType].join("|");
}

export function smsIdempotencyKey(attendanceEventUuid: string, guardianId: string, templateId: string): string {
  return [attendanceEventUuid, guardianId, templateId].join("|");
}
