
export const CARD_PAYLOAD_VERSION = "EDU1" as const;
const SCHOOL_CODE = /^[A-Z0-9]{6,12}$/;
const TOKEN = /^[A-Za-z0-9_-]{22,64}$/;

export interface CardPayload {
  version: typeof CARD_PAYLOAD_VERSION;
  schoolPublicCode: string;
  token: string;
}

export function buildCardPayload(schoolPublicCode: string, token: string): string {
  if (!SCHOOL_CODE.test(schoolPublicCode)) throw new Error("Invalid school public code.");
  if (!TOKEN.test(token)) throw new Error("Invalid NFC token.");
  return `${CARD_PAYLOAD_VERSION}|${schoolPublicCode}|${token}`;
}

export function parseCardPayload(value: string): CardPayload {
  if (value.length > 128) throw new Error("NFC payload is too large.");
  const [version, schoolPublicCode, token, extra] = value.split("|");
  if (extra !== undefined || version !== CARD_PAYLOAD_VERSION || !schoolPublicCode || !token) throw new Error("Unsupported NFC payload.");
  if (!SCHOOL_CODE.test(schoolPublicCode) || !TOKEN.test(token)) throw new Error("Malformed NFC payload.");
  return { version, schoolPublicCode, token };
}
