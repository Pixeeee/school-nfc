import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createPortalHandler } from "../server/portal.mjs";

let handler;
export default async function portal(req, res) {
  if (!handler) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
      if (
        !projectId ||
        key.project_id !== projectId ||
        !process.env.SCHOOL_ID ||
        !process.env.VITE_FIREBASE_API_KEY
      )
        throw new Error("Missing server configuration");
      const app =
        getApps().find((x) => x.name === "school-portal") ||
        initializeApp({ credential: cert(key), projectId }, "school-portal");
      handler = createPortalHandler({
        auth: getAuth(app),
        db: getFirestore(app),
        schoolId: process.env.SCHOOL_ID,
        projectId,
        apiKey: process.env.VITE_FIREBASE_API_KEY,
      });
    } catch {
      res.setHeader("Cache-Control", "no-store");
      return res
        .status(503)
        .json({
          error: "School administrator setup is required before signing in.",
        });
    }
  }
  return handler(req, res);
}
