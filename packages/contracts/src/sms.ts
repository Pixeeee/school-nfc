
export const SMS_TEMPLATE_VARIABLES = ["schoolName", "studentName", "eventTime", "eventDate", "eventType", "shortReference"] as const;
export type SmsTemplateVariable = (typeof SMS_TEMPLATE_VARIABLES)[number];

const VARIABLE = /{{\s*([A-Za-z][A-Za-z0-9]*)\s*}}/g;

export function validateSmsTemplate(template: string): { variables: string[]; errors: string[] } {
  const errors: string[] = [];
  const variables = [...template.matchAll(VARIABLE)].map((m) => m[1]).filter((v): v is string => Boolean(v));
  const allowed = new Set<string>(SMS_TEMPLATE_VARIABLES);
  for (const variable of variables) if (!allowed.has(variable)) errors.push(`Unknown placeholder: {{${variable}}}`);
  if (!template.trim()) errors.push("Message template is required.");
  if (template.length > 480) errors.push("Message template must not exceed 480 characters.");
  if (!variables.includes("studentName")) errors.push("Message template must contain {{studentName}}.");
  if (!variables.includes("eventTime")) errors.push("Message template must contain {{eventTime}}.");
  return { variables: [...new Set(variables)], errors };
}

export function renderSmsTemplate(template: string, values: Record<SmsTemplateVariable, string>): string {
  const validation = validateSmsTemplate(template);
  if (validation.errors.length) throw new Error(validation.errors.join(" "));
  return template.replace(VARIABLE, (_full, variable: SmsTemplateVariable) => values[variable] ?? "").trim();
}

export function estimateSmsSegments(message: string): number {
  const isGsm7 = /^[\x0A\x0D\x20-\x7E£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/.test(message);
  const single = isGsm7 ? 160 : 70;
  const multipart = isGsm7 ? 153 : 67;
  return message.length <= single ? 1 : Math.ceil(message.length / multipart);
}
