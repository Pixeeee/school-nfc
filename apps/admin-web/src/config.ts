
import { z } from "zod";

const schema = z.object({
  VITE_FIREBASE_API_KEY: z.string().min(1),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  VITE_FIREBASE_PROJECT_ID: z.string().min(1),
  VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  VITE_FIREBASE_APP_ID: z.string().min(1),
  VITE_FIREBASE_FUNCTIONS_REGION: z.string().default("asia-southeast1"),
  VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: z.string().optional(),
  VITE_USE_EMULATORS: z.enum(["true", "false"]).default("false"),
});

const parsed = schema.safeParse(import.meta.env);
export const configStatus = parsed.success
  ? { configured: true as const, value: parsed.data }
  : { configured: false as const, issues: parsed.error.issues };
