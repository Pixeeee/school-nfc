
const PH_MOBILE = /^\+639\d{9}$/;

export class PhoneValidationError extends Error {
  constructor(message = "Enter a valid Philippine mobile number, such as 09171234567.") {
    super(message);
    this.name = "PhoneValidationError";
  }
}

export function normalizePhilippineMobile(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, "");
  let normalized: string;
  if (/^09\d{9}$/.test(compact)) normalized = `+63${compact.slice(1)}`;
  else if (/^9\d{9}$/.test(compact)) normalized = `+63${compact}`;
  else if (/^639\d{9}$/.test(compact)) normalized = `+${compact}`;
  else normalized = compact;
  if (!PH_MOBILE.test(normalized)) throw new PhoneValidationError();
  return normalized;
}

export function maskPhone(phoneE164: string): string {
  if (!/^\+\d{10,15}$/.test(phoneE164)) return "••••";
  return `${phoneE164.slice(0, 4)}•••••${phoneE164.slice(-3)}`;
}
