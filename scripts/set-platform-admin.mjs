
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
if (!email) throw new Error("Usage: GOOGLE_APPLICATION_CREDENTIALS=... node scripts/set-platform-admin.mjs admin@example.com");
initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const user = await auth.getUserByEmail(email.trim().toLowerCase());
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), platformAdmin: true });
await auth.revokeRefreshTokens(user.uid);
console.log(`Platform-admin claim applied to ${email}. The user must sign in again.`);
