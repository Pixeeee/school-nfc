import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { normalizePhilippineMobile } from "@school-nfc/contracts";

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const text = (max) => z.string().trim().min(1).max(max);
const email = z.string().trim().toLowerCase().email().max(254);
const schemas = {
  overview: z.object({ action: z.literal("overview") }).strict(),
  teacherList: z.object({ action: z.literal("teacherList") }).strict(),
  teacherCreate: z
    .object({
      action: z.literal("teacherCreate"),
      email,
      password: z.string().min(8).max(128),
      name: text(120),
    })
    .strict(),
  sectionList: z.object({ action: z.literal("sectionList") }).strict(),
  sectionCreate: z
    .object({
      action: z.literal("sectionCreate"),
      requestId: z.string().uuid(),
      name: text(80),
      gradeLevelId: id,
      academicYearId: id,
    })
    .strict(),
  studentList: z
    .object({
      action: z.literal("studentList"),
      sectionId: id,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  studentCreate: z
    .object({
      action: z.literal("studentCreate"),
      requestId: z.string().uuid(),
      sectionId: id,
      studentNumber: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/),
      firstName: text(120),
      lastName: text(120),
      parentName: text(120),
      parentPhone: text(30),
      parentPhoneVerified: z.literal(true),
      parentConsent: z.literal(true),
    })
    .strict(),
  attendanceSet: z
    .object({
      action: z.literal("attendanceSet"),
      requestId: z.string().uuid(),
      sectionId: id,
      studentId: id,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      status: z.enum(["PRESENT", "ABSENT"]),
    })
    .strict(),
  attendanceList: z
    .object({
      action: z.literal("attendanceList"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  deviceList: z.object({ action: z.literal("deviceList") }).strict(),
  deviceSet: z
    .object({
      action: z.literal("deviceSet"),
      deviceId: id,
      teacherId: id,
      status: z.enum(["APPROVED", "REVOKED"]),
    })
    .strict(),
};
const adminActions = new Set([
  "teacherList",
  "teacherCreate",
  "deviceList",
  "deviceSet",
  "attendanceList",
]);
const rows = (snapshot) =>
  snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
export function schoolDate(timeZone = "Asia/Manila", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const val = (type) => parts.find((p) => p.type === type).value;
  return `${val("year")}-${val("month")}-${val("day")}`;
}
export function createPortalHandler({
  auth,
  db,
  schoolId,
  projectId,
  apiKey,
  fetchImpl = fetch,
}) {
  const base = `schools/${schoolId}`;
  async function requireSection(sectionId, uid, isAdmin = false) {
    const snap = await db.doc(`${base}/sparkSections/${sectionId}`).get();
    if (
      !snap.exists ||
      !snap.data().active ||
      (!isAdmin && snap.data().teacherId !== uid)
    )
      throw new RequestError(403, "This section is not assigned to you.");
    return snap.data();
  }
  async function login(body) {
    const generic = () =>
      new RequestError(401, "Incorrect username or password.");
    const parsed = z
      .object({
        action: z.literal("login"),
        identifier: text(254),
        password: z.string().min(1).max(128),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw generic();
    const { identifier, password } = parsed.data;
    let address = identifier.trim().toLowerCase();
    if (!address.includes("@")) {
      if (!/^[a-z0-9_]{3,40}$/.test(address)) throw generic();
      const handle = await db.doc(`loginNames/${address}`).get();
      if (!handle.exists) throw generic();
      address = handle.data().email;
    }
    const result = await fetchImpl(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: address,
          password,
          returnSecureToken: true,
        }),
      },
    );
    if (!result.ok) throw generic();
    const signed = await result.json();
    const token = await auth.verifyIdToken(signed.idToken, true);
    const membership = await db.doc(`${base}/members/${token.uid}`).get();
    if (
      !membership.exists ||
      membership.data().status !== "ACTIVE" ||
      !["SCHOOL_ADMIN", "TEACHER"].includes(membership.data().role)
    )
      throw generic();
    return { customToken: await auth.createCustomToken(token.uid) };
  }
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "POST") throw new RequestError(405, "Use POST.");
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          throw new RequestError(400, "Invalid request.");
        }
      }
      if (!body || JSON.stringify(body).length > 16000)
        throw new RequestError(400, "Invalid request.");
      if (body.action === "login")
        return res.status(200).json(await login(body));
      const bearer = req.headers.authorization;
      if (!bearer || !/^Bearer \S+$/.test(bearer))
        throw new RequestError(401, "Please sign in.");
      let token;
      try {
        token = await auth.verifyIdToken(bearer.slice(7), true);
      } catch {
        throw new RequestError(401, "Please sign in again.");
      }
      const uid = token.uid;
      const member = await db.doc(`${base}/members/${uid}`).get();
      if (
        !member.exists ||
        member.data().status !== "ACTIVE" ||
        !["SCHOOL_ADMIN", "TEACHER"].includes(member.data().role)
      )
        throw new RequestError(403, "Your school account is not active.");
      const isAdmin = member.data().role === "SCHOOL_ADMIN";
      if (adminActions.has(body.action) && !isAdmin)
        throw new RequestError(403, "Administrator access required.");
      const parsed = schemas[body.action]?.safeParse(body);
      if (!parsed?.success)
        throw new RequestError(400, "Check the submitted fields.");
      const input = parsed.data;
      const school = await db.doc(base).get();
      if (!school.exists || school.data().status !== "ACTIVE")
        throw new RequestError(403, "School is not active.");
      const timeZone = school.data().timeZone || "Asia/Manila";
      const date = schoolDate(timeZone);
      const sectionQuery = isAdmin
        ? db.collection(`${base}/sparkSections`)
        : db.collection(`${base}/sparkSections`).where("teacherId", "==", uid);
      switch (input.action) {
        case "overview": {
          const sections = rows(await sectionQuery.limit(250).get()).filter(
            (s) => s.active,
          );
          let totalStudents = 0;
          let present = 0;
          let absent = 0;
          for (const section of sections) {
            totalStudents += (
              await db
                .collection(`${base}/sparkStudents`)
                .where("sectionId", "==", section.id)
                .where("status", "==", "ACTIVE")
                .count()
                .get()
            ).data().count;
            const decisions = rows(
              await db
                .collection(`${base}/sparkRollCall`)
                .where("sectionId", "==", section.id)
                .where("localSchoolDate", "==", date)
                .limit(1000)
                .get(),
            );
            const arrivals = rows(
              await db
                .collection(`${base}/sparkAttendance`)
                .where("sectionId", "==", section.id)
                .where("localSchoolDate", "==", date)
                .where("eventType", "==", "ARRIVAL")
                .limit(1000)
                .get(),
            );
            const statuses = new Map(
              arrivals.map((x) => [x.studentId, "PRESENT"]),
            );
            decisions.forEach((x) => statuses.set(x.studentId, x.status));
            present += [...statuses.values()].filter(
              (s) => s === "PRESENT",
            ).length;
            absent += [...statuses.values()].filter(
              (s) => s === "ABSENT",
            ).length;
          }
          return res.json({
            profile: {
              uid,
              email: token.email,
              name: member.data().displayName || token.name || token.email,
              role: member.data().role,
            },
            school: { id: schoolId, name: school.data().name },
            date,
            sections: sections.length,
            students: totalStudents,
            present,
            absent,
            unmarked: Math.max(0, totalStudents - present - absent),
          });
        }
        case "teacherList":
          return res.json({
            teachers: rows(
              await db
                .collection(`${base}/members`)
                .where("role", "==", "TEACHER")
                .limit(250)
                .get(),
            ),
          });
        case "teacherCreate": {
          const created = await auth.createUser({
            email: input.email,
            password: input.password,
            displayName: input.name,
            disabled: true,
          });
          try {
            await db.doc(`${base}/members/${created.uid}`).create({
              status: "ACTIVE",
              role: "TEACHER",
              email: input.email,
              displayName: input.name,
              effectivePermissions: [],
              sectionIds: [],
              createdAt: FieldValue.serverTimestamp(),
              createdBy: uid,
            });
            await auth.updateUser(created.uid, { disabled: false });
          } catch (error) {
            // Roll back only this newly created account so the teacher can retry.
            await auth
              .updateUser(created.uid, { disabled: true })
              .catch(() => {});
            await Promise.allSettled([
              auth.deleteUser(created.uid),
              db.doc(`${base}/members/${created.uid}`).delete(),
            ]);
            throw error;
          }
          return res.json({ uid: created.uid, email: input.email });
        }
        case "sectionList":
          return res.json({
            sections: rows(await sectionQuery.limit(250).get()).filter(
              (x) => x.active,
            ),
            years: rows(
              await db
                .collection(`${base}/academicYears`)
                .where("active", "==", true)
                .limit(50)
                .get(),
            ),
            grades: rows(
              await db
                .collection(`${base}/gradeLevels`)
                .where("active", "==", true)
                .limit(50)
                .get(),
            ),
          });
        case "sectionCreate": {
          const year = await db
            .doc(`${base}/academicYears/${input.academicYearId}`)
            .get();
          const grade = await db
            .doc(`${base}/gradeLevels/${input.gradeLevelId}`)
            .get();
          if (
            !year.exists ||
            !grade.exists ||
            !year.data().active ||
            !grade.data().active
          )
            throw new RequestError(
              400,
              "Choose an active academic year and grade.",
            );
          const ref = db.doc(`${base}/sparkSections/${input.requestId}`);
          await db.runTransaction(async (tx) => {
            const existing = await tx.get(ref);
            if (existing.exists) {
              if (
                existing.data().teacherId !== uid ||
                existing.data().name !== input.name
              )
                throw new RequestError(409, "Request was already used.");
              return;
            }
            tx.create(ref, {
              name: input.name,
              gradeLevelId: input.gradeLevelId,
              academicYearId: input.academicYearId,
              teacherId: uid,
              active: true,
              deviceId: "WEB",
              createdAt: FieldValue.serverTimestamp(),
            });
          });
          return res.json({ id: ref.id });
        }
        case "studentCreate": {
          await requireSection(input.sectionId, uid);
          let parentPhone;
          try {
            parentPhone = normalizePhilippineMobile(input.parentPhone);
          } catch {
            throw new RequestError(
              400,
              "Enter a valid Philippine parent mobile number.",
            );
          }
          const ref = db.doc(`${base}/sparkStudents/${input.requestId}`);
          const number = db.doc(
            `${base}/sparkStudentNumbers/${input.studentNumber}`,
          );
          await db.runTransaction(async (tx) => {
            const existing = await tx.get(ref);
            const index = await tx.get(number);
            if (existing.exists) {
              if (
                existing.data().createdBy !== uid ||
                existing.data().studentNumber !== input.studentNumber ||
                existing.data().sectionId !== input.sectionId
              )
                throw new RequestError(409, "Request was already used.");
              return;
            }
            if (index.exists)
              throw new RequestError(409, "Student number already exists.");
            tx.create(ref, {
              sectionId: input.sectionId,
              studentNumber: input.studentNumber,
              firstName: input.firstName,
              lastName: input.lastName,
              displayName: input.firstName + " " + input.lastName,
              parentName: input.parentName,
              parentPhone,
              parentPhoneVerified: true,
              parentConsent: true,
              status: "ACTIVE",
              createdBy: uid,
              deviceId: "WEB",
              createdAt: FieldValue.serverTimestamp(),
            });
            tx.create(number, {
              studentId: ref.id,
              sectionId: input.sectionId,
            });
          });
          return res.json({ id: ref.id });
        }
        case "studentList": {
          await requireSection(input.sectionId, uid, isAdmin);
          const students = rows(
            await db
              .collection(`${base}/sparkStudents`)
              .where("sectionId", "==", input.sectionId)
              .where("status", "==", "ACTIVE")
              .limit(250)
              .get(),
          );
          const decisions = rows(
            await db
              .collection(`${base}/sparkRollCall`)
              .where("sectionId", "==", input.sectionId)
              .where("localSchoolDate", "==", input.date)
              .limit(1000)
              .get(),
          );
          const arrivals = rows(
            await db
              .collection(`${base}/sparkAttendance`)
              .where("sectionId", "==", input.sectionId)
              .where("localSchoolDate", "==", input.date)
              .where("eventType", "==", "ARRIVAL")
              .limit(1000)
              .get(),
          );
          const statuses = new Map(
            arrivals.map((x) => [
              x.studentId,
              { status: "PRESENT", source: "ANDROID" },
            ]),
          );
          decisions.forEach((x) =>
            statuses.set(x.studentId, { status: x.status, source: "WEB" }),
          );
          return res.json({
            students: students.map((s) => ({
              ...s,
              ...(statuses.get(s.id) || { status: "UNMARKED", source: null }),
            })),
            date: input.date,
            limit: 250,
          });
        }
        case "attendanceSet": {
          if (input.date !== date)
            throw new RequestError(
              409,
              "The school date has changed. Refresh the dashboard and choose today's date.",
            );
          await requireSection(input.sectionId, uid);
          const student = await db
            .doc(`${base}/sparkStudents/${input.studentId}`)
            .get();
          if (
            !student.exists ||
            student.data().sectionId !== input.sectionId ||
            student.data().status !== "ACTIVE"
          )
            throw new RequestError(
              403,
              "Student is not in your active section.",
            );
          const ref = db.doc(
            `${base}/sparkRollCall/${input.studentId}_${date}`,
          );
          const audit = db.doc(`${base}/sparkRollCallAudit/${input.requestId}`);
          await db.runTransaction(async (tx) => {
            const replay = await tx.get(audit);
            const previous = await tx.get(ref);
            if (replay.exists) {
              if (
                replay.data().teacherId !== uid ||
                replay.data().studentId !== input.studentId ||
                replay.data().status !== input.status ||
                replay.data().localSchoolDate !== date
              )
                throw new RequestError(409, "Request was already used.");
              return;
            }
            const record = {
              studentId: input.studentId,
              studentName: student.data().displayName,
              sectionId: input.sectionId,
              teacherId: uid,
              localSchoolDate: date,
              status: input.status,
              source: "WEB",
              updatedAt: FieldValue.serverTimestamp(),
            };
            tx.set(ref, record);
            tx.create(audit, {
              ...record,
              previousStatus: previous.exists
                ? previous.data().status
                : "UNMARKED",
            });
          });
          return res.json({ status: input.status, date, smsSent: false });
        }
        case "attendanceList": {
          const web = rows(
            await db
              .collection(`${base}/sparkRollCall`)
              .where("localSchoolDate", "==", input.date)
              .limit(1000)
              .get(),
          );
          const native = rows(
            await db
              .collection(`${base}/sparkAttendance`)
              .where("localSchoolDate", "==", input.date)
              .where("eventType", "==", "ARRIVAL")
              .limit(1000)
              .get(),
          );
          const merged = new Map(
            native.map((x) => [
              x.studentId,
              { ...x, status: "PRESENT", source: "ANDROID" },
            ]),
          );
          web.forEach((x) => merged.set(x.studentId, x));
          return res.json({
            attendance: [...merged.values()],
            date: input.date,
            limit: 1000,
          });
        }
        case "deviceList":
          return res.json({
            devices: rows(
              await db.collection(`${base}/sparkDevices`).limit(250).get(),
            ),
          });
        case "deviceSet": {
          const ref = db.doc(`${base}/sparkDevices/${input.deviceId}`);
          await db.runTransaction(async (tx) => {
            const device = await tx.get(ref);
            const owner = await tx.get(
              db.doc(`${base}/members/${input.teacherId}`),
            );
            if (
              !device.exists ||
              device.data().assignedUserId !== input.teacherId ||
              !owner.exists ||
              owner.data().status !== "ACTIVE" ||
              !["TEACHER", "SCHOOL_ADMIN"].includes(owner.data().role)
            )
              throw new RequestError(
                409,
                "The device owner or account no longer matches.",
              );
            tx.update(ref, {
              status: input.status,
              leaseExpiresAt: Timestamp.fromMillis(
                input.status === "APPROVED" ? Date.now() + 6 * 86400000 : 0,
              ),
              updatedAt: FieldValue.serverTimestamp(),
            });
          });
          return res.json({ status: input.status });
        }
      }
    } catch (error) {
      const code =
        error.status ||
        (error.code === "auth/email-already-exists" ? 409 : 500);
      const message = error.status
        ? error.message
        : error.code === "auth/email-already-exists"
          ? "An account with that email already exists."
          : "School service is unavailable. Please try again.";
      return res.status(code).json({ error: message });
    }
  };
}
