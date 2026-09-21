
import { onCall } from "firebase-functions/v2/https";
import { auth } from "../admin.js";
import { requireUser } from "../lib/authz.js";
import { callableOptions } from "../lib/options.js";

export const createNativeSessionToken = onCall({ ...callableOptions, consumeAppCheckToken: true }, async (request) => {
  const user = requireUser(request);
  const customToken = await auth.createCustomToken(user.uid, { nativeMobile: true });
  return { customToken };
});
