import type { PluginListenerHandle } from "@capacitor/core";
export type ScanMode = "ARRIVAL" | "ABSENT" | "DISMISSAL" | "CUSTOM";
export interface AuthState {
  signedIn: boolean;
  uid?: string;
  email?: string;
}
export interface TeacherSmsProfile {
  username: string;
  schoolName: string;
  attendanceTemplate?: string;
  dismissalTemplate?: string;
}
export interface DeviceState {
  backend?: "SPARK" | "FUNCTIONS";
  deviceId: string;
  status: "UNREGISTERED" | "PENDING" | "APPROVED" | "SUSPENDED" | "REVOKED";
  schoolId?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  nfcAvailable: boolean;
  nfcEnabled: boolean;
  smsPermission: boolean;
  selectedSubscriptionId?: number;
  syncPending: number;
  smsPending: number;
}
export interface StudentSummary {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  studentNumber: string;
  sectionId: string;
  photoPath?: string;
  activeCardId?: string;
}
export interface ScanResult {
  eventUuid?: string;
  studentId?: string;
  displayName?: string;
  studentNumber?: string;
  eventType?: ScanMode;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED";
  reason?: string;
  localTimestamp: string;
  smsQueued?: number;
  photoPath?: string;
}
export interface QueueSummary {
  smsPending: number;
  smsRetry: number;
  smsFailed: number;
  syncPending: number;
  oldestSmsAgeSeconds?: number;
  oldestSyncAgeSeconds?: number;
}
export interface SubscriptionInfo {
  subscriptionId: number;
  displayName: string;
  carrierName: string;
  slotIndex: number;
  active: boolean;
}
export interface CardWriteRequest {
  schoolId: string;
  studentId: string;
  operation: "NEW" | "REPLACE";
  replacedCardId?: string;
}
export interface CardWriteState {
  phase:
    | "IDLE"
    | "RESERVING"
    | "WAITING_FOR_TAG"
    | "WRITING"
    | "VERIFYING"
    | "ACTIVATING"
    | "SUCCEEDED"
    | "FAILED";
  studentId?: string;
  cardId?: string;
  message?: string;
}
export interface ActiveTeacher {
  id: string;
  name: string;
  username: string;
}
export interface SubjectConfiguration {
  subjectId: string;
  sectionId: string;
  teacherId: string;
  name: string;
  startTime: string;
  endTime: string;
}
export interface StudentDetails {
  studentId: string;
  sectionId: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  parentName: string;
  parentPhone: string;
  parentPhoneVerified: boolean;
  parentConsent: boolean;
}
export interface ReportCounts {
  onTime: number;
  late: number;
  absent: number;
  recorded: number;
}
export interface TeacherReport {
  month: string;
  generatedAt: string;
  totals: ReportCounts;
  rows: Array<
    ReportCounts & {
      studentId: string;
      studentNumber: string;
      displayName: string;
      lastName: string;
      sectionId: string;
      sectionName: string;
      subjectId: string;
      subjectName: string;
    }
  >;
}
export interface SchoolNfcPlugin {
  getStudent(options: {
    sectionId: string;
    studentId: string;
  }): Promise<{ student: StudentDetails }>;
  updateStudent(
    options: Omit<StudentDetails, "studentNumber">,
  ): Promise<{ studentId: string }>;
  deleteStudent(options: {
    sectionId: string;
    studentId: string;
  }): Promise<{ studentId: string }>;
  saveRosterOrder(options: {
    sectionId: string;
    studentIds: string[];
  }): Promise<void>;
  teacherReport(options: { month: string }): Promise<TeacherReport>;
  getTeacherProfile(): Promise<TeacherSmsProfile>;
  saveTeacherProfile(profile: TeacherSmsProfile): Promise<TeacherSmsProfile>;
  activeTeacherDirectory(): Promise<{ teachers: ActiveTeacher[] }>;
  sectionAssign(options: {
    sectionId: string;
    adviserId: string;
  }): Promise<{ adviserId: string }>;
  subjectSet(options: SubjectConfiguration): Promise<{ subjectId: string }>;
  updateSubject(options: {
    subjectId: string;
    name: string;
    startTime: string;
    endTime: string;
  }): Promise<{ subjectId: string }>;
  markSubject(options: {
    sectionId: string;
    studentId: string;
    subjectId: string;
    tag: "ON_TIME" | "LATE" | "ABSENT";
  }): Promise<ScanResult>;
  subjectAttendance(options: { sectionId: string; date: string }): Promise<{
    attendance: Array<{
      studentId: string;
      subjectId?: string;
      attendanceTag?: string;
      eventType: string;
      localTimestamp: string;
    }>;
  }>;
  dismissalCount(options: { sectionId: string }): Promise<{ count: number }>;
  dismissSection(options: {
    sectionId: string;
    expectedCount: number;
  }): Promise<{ queued: number }>;
  listSections(): Promise<{ sections: SectionSummary[] }>;
  getTeacherSetup(): Promise<TeacherSetup>;
  createSection(options: CreateSectionRequest): Promise<{ sectionId: string }>;
  createStudent(
    options: CreateTeacherStudentRequest,
  ): Promise<{ studentId: string; guardianId: string; studentNumber?: string }>;
  listSectionStudents(options: {
    sectionId: string;
    subjectId?: string;
  }): Promise<{
    students: RosterStudent[];
    localSchoolDate: string;
    rosterOrder?: string[];
  }>;
  markAbsent(options: {
    sectionId: string;
    studentId: string;
  }): Promise<ScanResult>;
  markPresent(options: {
    sectionId: string;
    studentId: string;
    tag?: "ON_TIME" | "LATE";
  }): Promise<ScanResult>;
  getAuthState(): Promise<AuthState>;
  signIn(options: { username: string; password: string }): Promise<AuthState>;
  signOut(): Promise<void>;
  getDeviceState(): Promise<DeviceState>;
  registerDevice(options: {
    schoolId: string;
    displayName: string;
  }): Promise<DeviceState>;
  renewLease(options: { schoolId: string }): Promise<DeviceState>;
  startScannerSession(options: {
    schoolId: string;
    mode: ScanMode;
    sectionId?: string;
    customLabel?: string;
  }): Promise<{ sessionId: string }>;
  stopScannerSession(): Promise<void>;
  searchStudents(options: {
    query: string;
    limit?: number;
  }): Promise<{ students: StudentSummary[] }>;
  beginWriteCard(options: CardWriteRequest): Promise<CardWriteState>;
  cancelWriteCard(): Promise<void>;
  getCardWriteState(): Promise<CardWriteState>;
  listSubscriptions(): Promise<{ subscriptions: SubscriptionInfo[] }>;
  selectSubscription(options: { subscriptionId: number }): Promise<void>;
  requestSmsPermission(): Promise<{ granted: boolean; blocked: boolean }>;
  openPermissionSettings(): Promise<void>;
  sendTestSms(options: {
    phone: string;
    message: string;
  }): Promise<{ messageId: string }>;
  getQueueSummary(): Promise<QueueSummary>;
  retryFailedMessages(): Promise<{ queued: number }>;
  synchronizeNow(): Promise<{ queued: number }>;
  addListener(
    eventName: "deviceStateChanged",
    listener: (event: DeviceState) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "scanResult",
    listener: (event: ScanResult) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "queueStateChanged",
    listener: (event: QueueSummary) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "cardWriteStateChanged",
    listener: (event: CardWriteState) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export type ClassKind = "ADVISORY" | "SUBJECT";
export interface SectionSummary {
  classKind?: ClassKind;
  grade?: number;
  canManageRoster?: boolean;
  id: string;
  name: string;
  adviserId?: string;
  isAdviser?: boolean;
  subjects?: SubjectSummary[];
  gradeLevelId?: string;
  academicYearId?: string;
}
export interface SubjectSummary {
  isAssigned?: boolean;
  id: string;
  name: string;
  teacherId: string;
  startTime: string;
  endTime: string;
}
export interface TeacherSetup {
  sections: SectionSummary[];
  academicYears: Array<{ id: string; name: string }>;
  gradeLevels: Array<{ id: string; name: string }>;
}
export interface RosterStudent extends StudentSummary {
  present: boolean;
  attendanceStatus?: "PRESENT" | "ON_TIME" | "LATE" | "ABSENT" | "UNMARKED";
  smsStatus: "NONE" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
  syncStatus?: string;
}
export interface CreateSectionRequest {
  requestId: string;
  name: string;
  classKind: ClassKind;
  grade: number;
  subjectName?: string;
  startTime?: string;
  endTime?: string;
  gradeLevelId?: string;
  academicYearId?: string;
}
export interface CreateTeacherStudentRequest {
  grade?: number;
  requestId: string;
  sectionId: string;
  studentNumber?: string;
  firstName: string;
  lastName: string;
  parentName: string;
  parentPhone: string;
  parentPhoneVerified: boolean;
  parentConsent: boolean;
}
