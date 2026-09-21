
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { SchoolNfcPlugin } from "./types";
import { SchoolNfcWeb } from "./web";
export const SchoolNfc = Capacitor.isNativePlatform() ? registerPlugin<SchoolNfcPlugin>("SchoolNfc") : new SchoolNfcWeb();
