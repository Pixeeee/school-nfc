
import type { PluginListenerHandle } from "@capacitor/core";
export type ScanMode = "ARRIVAL"|"DISMISSAL"|"CUSTOM";
export interface AuthState { signedIn:boolean; uid?:string; email?:string; }
export interface DeviceState { deviceId:string; status:"UNREGISTERED"|"PENDING"|"APPROVED"|"SUSPENDED"|"REVOKED"; schoolId?:string; leaseId?:string; leaseExpiresAt?:string; nfcAvailable:boolean; nfcEnabled:boolean; smsPermission:boolean; selectedSubscriptionId?:number; syncPending:number; smsPending:number; }
export interface StudentSummary { id:string; displayName:string; studentNumber:string; sectionId:string; photoPath?:string; activeCardId?:string; }
export interface ScanResult { eventUuid?:string; studentId?:string; displayName?:string; studentNumber?:string; eventType?:ScanMode; status:"ACCEPTED"|"DUPLICATE"|"REJECTED"; reason?:string; localTimestamp:string; smsQueued?:number; photoPath?:string; }
export interface QueueSummary { smsPending:number;smsRetry:number;smsFailed:number;syncPending:number;oldestSmsAgeSeconds?:number;oldestSyncAgeSeconds?:number; }
export interface SubscriptionInfo { subscriptionId:number;displayName:string;carrierName:string;slotIndex:number;active:boolean; }
export interface CardWriteRequest { schoolId:string;studentId:string;operation:"NEW"|"REPLACE";replacedCardId?:string; }
export interface CardWriteState { phase:"IDLE"|"RESERVING"|"WAITING_FOR_TAG"|"WRITING"|"VERIFYING"|"ACTIVATING"|"SUCCEEDED"|"FAILED";studentId?:string;cardId?:string;message?:string; }
export interface SchoolNfcPlugin {
  getAuthState():Promise<AuthState>;
  signIn(options:{email:string;password:string}):Promise<AuthState>;
  signOut():Promise<void>;
  getDeviceState():Promise<DeviceState>;
  registerDevice(options:{schoolId:string;displayName:string}):Promise<DeviceState>;
  renewLease(options:{schoolId:string}):Promise<DeviceState>;
  startScannerSession(options:{schoolId:string;mode:ScanMode;sectionId?:string;customLabel?:string}):Promise<{sessionId:string}>;
  stopScannerSession():Promise<void>;
  searchStudents(options:{query:string;limit?:number}):Promise<{students:StudentSummary[]}>;
  beginWriteCard(options:CardWriteRequest):Promise<CardWriteState>;
  cancelWriteCard():Promise<void>;
  getCardWriteState():Promise<CardWriteState>;
  listSubscriptions():Promise<{subscriptions:SubscriptionInfo[]}>;
  selectSubscription(options:{subscriptionId:number}):Promise<void>;
  requestSmsPermission():Promise<{granted:boolean}>;
  sendTestSms(options:{phone:string;message:string}):Promise<{messageId:string}>;
  getQueueSummary():Promise<QueueSummary>;
  retryFailedMessages():Promise<{queued:number}>;
  synchronizeNow():Promise<{queued:number}>;
  addListener(eventName:"deviceStateChanged",listener:(event:DeviceState)=>void):Promise<PluginListenerHandle>;
  addListener(eventName:"scanResult",listener:(event:ScanResult)=>void):Promise<PluginListenerHandle>;
  addListener(eventName:"queueStateChanged",listener:(event:QueueSummary)=>void):Promise<PluginListenerHandle>;
  addListener(eventName:"cardWriteStateChanged",listener:(event:CardWriteState)=>void):Promise<PluginListenerHandle>;
  removeAllListeners():Promise<void>;
}
