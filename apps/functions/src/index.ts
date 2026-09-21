
import { setGlobalOptions } from "firebase-functions/v2";
setGlobalOptions({ region: "asia-southeast1", maxInstances: 50, concurrency: 40 });

export { createSchool } from "./callables/schools.js";
export { inviteMember, acceptInvitation } from "./callables/members.js";
export { createStudent, updateStudent, createGuardian, linkGuardian, upsertAcademicYear, upsertSection, upsertSmsTemplate } from "./callables/masterData.js";
export { registerDevice, approveDevice, renewDeviceLease, revokeDevice } from "./callables/devices.js";
export { reserveCard, activateCard, changeCardStatus } from "./callables/cards.js";
export { ingestAttendanceBatch, correctAttendance } from "./callables/attendance.js";
export { ingestSmsResults } from "./callables/sms.js";
export { getDeviceSnapshot } from "./callables/snapshot.js";
export { createNativeSessionToken } from "./callables/nativeSession.js";
export { updateGuardian } from "./callables/guardian-update.js";
