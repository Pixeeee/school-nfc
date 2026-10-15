export const defaultAttendanceTemplate =
  "{{studentName}} is {{attendanceStatus}} on {{eventDate}} at {{eventTime}}.";
export const defaultDismissalTemplate =
  "{{studentName}}: {{attendanceStatus}} on {{eventDate}} at {{eventTime}}.";
export const messageTokens = [
  "studentName",
  "studentCode",
  "sectionName",
  "attendanceStatus",
  "eventDate",
  "eventTime",
];
export function templateError(template: string): string | null {
  if (!template.trim()) return null;
  if (template.length > 600) return "Messages must be at most 600 characters.";
  const pattern = /\{\{\s*(\w+)\s*\}\}/g;
  const tokens = [...template.matchAll(pattern)].map((x) => x[1]!);
  if (
    tokens.some((x) => !messageTokens.includes(x)) ||
    /[{}]/.test(template.replace(pattern, ""))
  )
    return "Use only the listed placeholders, with double braces.";
  if (
    ["studentName", "attendanceStatus", "eventDate", "eventTime"].some(
      (x) => !tokens.includes(x),
    )
  )
    return "Keep the studentName, attendanceStatus, eventDate and eventTime placeholders.";
  return null;
}
export function previewMessage(template: string, status = "present on time") {
  const values: Record<string, string> = {
    studentName: "Ada Cruz",
    studentCode: "G10-NARA-001",
    sectionName: "Nara",
    attendanceStatus: status,
    eventDate: "October 15, 2026",
    eventTime: "9:00 AM",
  };
  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (match, token: string) => values[token] ?? match,
  );
}
