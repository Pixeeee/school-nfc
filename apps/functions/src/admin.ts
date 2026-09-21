
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) initializeApp();
export const auth = getAuth();
export const db = getFirestore();
export const storage = getStorage();
db.settings({ ignoreUndefinedProperties: true });
