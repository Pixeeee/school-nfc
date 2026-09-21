
import { WebPlugin } from "@capacitor/core";
import type { AuthState, CardWriteRequest, CardWriteState, DeviceState, QueueSummary, ScanMode, SchoolNfcPlugin, StudentSummary, SubscriptionInfo } from "./types";
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export class SchoolNfcWeb extends WebPlugin implements SchoolNfcPlugin {
  private signedIn=false;private write:CardWriteState={phase:"IDLE"};private device:DeviceState={deviceId:"browser-demo",status:"UNREGISTERED",nfcAvailable:false,nfcEnabled:false,smsPermission:false,syncPending:0,smsPending:0};
  async getAuthState():Promise<AuthState>{return{signedIn:this.signedIn,email:this.signedIn?"demo@example.test":undefined}}
  async signIn(o:{email:string;password:string}):Promise<AuthState>{if(o.password.length<8)throw new Error("Password must contain at least 8 characters.");this.signedIn=true;return{signedIn:true,email:o.email}}
  async signOut(){this.signedIn=false}
  async getDeviceState(){return this.device}
  async registerDevice(o:{schoolId:string;displayName:string}){this.device={...this.device,schoolId:o.schoolId,status:"PENDING"};return this.device}
  async renewLease(){return this.device}
  async startScannerSession(o:{schoolId:string;mode:ScanMode}){if(!this.device.nfcAvailable)throw new Error("Native NFC is available only in the Android build.");return{sessionId:crypto.randomUUID()}}
  async stopScannerSession(){}
  async searchStudents(o:{query:string;limit?:number}):Promise<{students:StudentSummary[]}>{return{students:[{id:"demo-student",displayName:"Demo Student",studentNumber:"2026-001",sectionId:"section-a"}].filter(s=>s.displayName.toLowerCase().includes(o.query.toLowerCase()))}}
  async beginWriteCard(o:CardWriteRequest){this.write={phase:"FAILED",studentId:o.studentId,message:"NFC writing requires the Android build."};return this.write}
  async cancelWriteCard(){this.write={phase:"IDLE"}}
  async getCardWriteState(){return this.write}
  async listSubscriptions():Promise<{subscriptions:SubscriptionInfo[]}>{return{subscriptions:[]}}
  async selectSubscription(){throw new Error("SIM selection requires Android.")}
  async requestSmsPermission(){return{granted:false}}
  async sendTestSms(){throw new Error("SMS requires Android.")}
  async getQueueSummary():Promise<QueueSummary>{return{smsPending:0,smsRetry:0,smsFailed:0,syncPending:0}}
  async retryFailedMessages(){return{queued:0}}
  async synchronizeNow(){await delay(200);return{queued:0}}
}
