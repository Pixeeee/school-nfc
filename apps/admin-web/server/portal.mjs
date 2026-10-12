import { randomBytes } from "node:crypto";
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
  activeTeacherDirectory: z
    .object({ action: z.literal("activeTeacherDirectory") })
    .strict(),
  teacherList: z.object({ action: z.literal("teacherList") }).strict(),
  teacherCreate: z
    .object({
      action: z.literal("teacherCreate"),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_]{3,40}$/),
      email: email.optional(),
      password: z.string().min(8).max(128).optional(),
      name: text(120),
    })
    .strict(),
  sectionAssign: z
    .object({
      action: z.literal("sectionAssign"),
      sectionId: id,
      adviserId: id,
    })
    .strict(),
  subjectSet: z
    .object({
      action: z.literal("subjectSet"),
      subjectId: id,
      sectionId: id,
      teacherId: id,
      name: text(80),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .strict(),
  sectionList: z.object({ action: z.literal("sectionList") }).strict(),
  sectionCreate: z
    .object({
      action: z.literal("sectionCreate"),
      requestId: z.string().uuid(),
      name: text(80),
      gradeLevelId: id.optional(),
      academicYearId: id.optional(),
      classKind: z.enum(["ADVISORY", "SUBJECT"]).optional(),
      grade: z.number().int().min(1).max(12).optional(),
      subjectName: text(80).optional(),
      startTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      endTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
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
        .regex(/^[A-Z0-9][A-Z0-9_-]{0,39}$/)
        .optional(),
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
const teacherActions = new Set([
  "activeTeacherDirectory",
  "sectionAssign",
  "subjectSet",
  "sectionCreate",
  "studentCreate",
  "attendanceSet",
  "deviceSet",
]);
const adviserId = (section) =>
  section.classKind === "SUBJECT"
    ? ""
    : (section.adviserId ?? section.teacherId);
const canManageRoster = (section, uid) =>
  section.classKind === "SUBJECT"
    ? section.teacherId === uid
    : adviserId(section) === uid;
const rows = (snapshot) =>
  snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
export function latestNativeRollCall(records) {
  return [
    ...new Map(
      [...records]
        .sort((a, b) =>
          (a.localTimestamp || "").localeCompare(b.localTimestamp || ""),
        )
        .map((x) => [
          `${x.studentId}|${x.subjectId || "LEGACY"}`,
          {
            ...x,
            status:
              x.attendanceTag ||
              (x.eventType === "ABSENT" ? "ABSENT" : "PRESENT"),
            source: "ANDROID",
          },
        ]),
    ).values(),
  ];
}
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
  async function requireActiveTeacher(tx, uid) {
    const member = await tx.get(db.doc(`${base}/members/${uid}`));
    const school = await tx.get(db.doc(base));
    if (
      !member.exists ||
      member.data().status !== "ACTIVE" ||
      member.data().role !== "TEACHER" ||
      school.data()?.status !== "ACTIVE"
    )
      throw new RequestError(
        403,
        "Your teacher account or school is not active.",
      );
  }
  async function requireSection(sectionId, uid, isAdmin = false) {
    const snap = await db.doc(`${base}/sparkSections/${sectionId}`).get();
    if (
      !snap.exists ||
      !snap.data().active ||
      (!isAdmin && adviserId(snap.data()) !== uid)
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
        client: z.enum(["WEB", "ANDROID"]).default("WEB"),
        password: z.string().min(1).max(128),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success) throw generic();
    const { identifier, password, client } = parsed.data;
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
      membership.data().role !==
        (client === "ANDROID" ? "TEACHER" : "SCHOOL_ADMIN")
    )
      throw generic();
    return {
      customToken: await auth.createCustomToken(token.uid, {
        portalClient: client,
      }),
      schoolId,
    };
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
      if (!isAdmin && token.portalClient !== "ANDROID")
        throw new RequestError(
          403,
          "This dashboard is for the school administrator only.",
        );
      if (adminActions.has(body.action) && !isAdmin)
        throw new RequestError(403, "Administrator access required.");
      if (
        teacherActions.has(body.action) &&
        (isAdmin || token.portalClient !== "ANDROID")
      )
        throw new RequestError(403, "Teacher Android access required.");
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
        case "activeTeacherDirectory": {
          const teachers = rows(
            await db
              .collection(`${base}/members`)
              .where("role", "==", "TEACHER")
              .where("status", "==", "ACTIVE")
              .limit(250)
              .get(),
          );
          return res.json({
            teachers: teachers.map((teacher) => ({
              id: teacher.id,
              name: teacher.displayName || teacher.username || "Teacher",
              username: teacher.username || "",
            })),
          });
        }
        case "sectionAssign":
        case "subjectSet": {
          if (input.action === "subjectSet" && input.endTime <= input.startTime)
            throw new RequestError(400, "End time must be after start time.");
          await db.runTransaction(async (tx) => {
            const actingMember = await tx.get(db.doc(`${base}/members/${uid}`));
            if (
              !actingMember.exists ||
              actingMember.data().status !== "ACTIVE" ||
              actingMember.data().role !== "TEACHER"
            )
              throw new RequestError(
                403,
                "Your teacher account is not active.",
              );
            const sectionRef = db.doc(
              `${base}/sparkSections/${input.sectionId}`,
            );
            const section = await tx.get(sectionRef);
            if (
              !section.exists ||
              !section.data().active ||
              adviserId(section.data()) !== uid
            )
              throw new RequestError(
                403,
                "Only the current section adviser can configure this section.",
              );
            const targetId =
              input.action === "sectionAssign"
                ? input.adviserId
                : input.teacherId;
            const teacher = await tx.get(db.doc(`${base}/members/${targetId}`));
            if (
              !teacher.exists ||
              teacher.data().status !== "ACTIVE" ||
              teacher.data().role !== "TEACHER"
            )
              throw new RequestError(400, "Choose an active teacher.");
            if (input.action === "sectionAssign") {
              tx.update(sectionRef, { adviserId: input.adviserId });
              return;
            }
            const ref = db.doc(`${base}/sparkSubjects/${input.subjectId}`);
            const previous = await tx.get(ref);
            if (
              previous.exists &&
              previous.data().sectionId !== input.sectionId
            )
              throw new RequestError(
                409,
                "Subject belongs to another section.",
              );
            const others = await tx.get(
              db
                .collection(`${base}/sparkSubjects`)
                .where("sectionId", "==", input.sectionId),
            );
            const teacherIds = [
              ...new Set([
                input.teacherId,
                ...others.docs
                  .filter((d) => d.id !== input.subjectId && d.data().active)
                  .map((d) => d.data().teacherId),
              ]),
            ];
            tx.set(
              ref,
              {
                sectionId: input.sectionId,
                teacherId: input.teacherId,
                name: input.name,
                startTime: input.startTime,
                endTime: input.endTime,
                active: true,
              },
              { merge: true },
            );
            tx.update(sectionRef, { subjectTeacherIds: teacherIds });
          });
          return res.json(
            input.action === "sectionAssign"
              ? { adviserId: input.adviserId }
              : { subjectId: input.subjectId },
          );
        }
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
                .where("eventType", "in", ["ARRIVAL", "ABSENT"])
                .limit(1000)
                .get(),
            );
            const statuses = new Map(
              latestNativeRollCall(arrivals).map((x) => [
                x.studentId,
                x.status,
              ]),
            );
            decisions.forEach((x) => statuses.set(x.studentId, x.status));
            present += [...statuses.values()].filter((s) =>
              ["PRESENT", "ON_TIME", "LATE"].includes(s),
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
          const address =
            input.email ||
            `${input.username}@teachers.${projectId || "schoolattendance"}.invalid`;
          const password =
            input.password || randomBytes(18).toString("base64url");
          const handle = db.doc("loginNames/" + input.username);
          if ((await handle.get()).exists)
            throw new RequestError(409, "Username is already in use.");
          const created = await auth.createUser({
            email: address,
            password,
            displayName: input.name,
            disabled: true,
          });
          let handleClaimed = false;
          try {
            await db.runTransaction(async (tx) => {
              if ((await tx.get(handle)).exists)
                throw new RequestError(409, "Username is already in use.");
              tx.create(handle, { uid: created.uid, email: address });
              tx.create(db.doc(`${base}/members/${created.uid}`), {
                status: "ACTIVE",
                role: "TEACHER",
                username: input.username,
                email: address,
                displayName: input.name,
                effectivePermissions: [],
                sectionIds: [],
                createdAt: FieldValue.serverTimestamp(),
                createdBy: uid,
              });
            });
            handleClaimed = true;
            await auth.updateUser(created.uid, { disabled: false });
          } catch (error) {
            // Roll back only this newly created account so the teacher can retry.
            await auth
              .updateUser(created.uid, { disabled: true })
              .catch(() => {});
            await Promise.allSettled([
              auth.deleteUser(created.uid),
              db.doc(`${base}/members/${created.uid}`).delete(),
              ...(handleClaimed ? [handle.delete()] : []),
            ]);
            throw error;
          }
          return res.json({
            uid: created.uid,
            email: address,
            username: input.username,
            password,
          });
        }
        case "sectionList":
          return res.json({
            sections: rows(await sectionQuery.limit(250).get())
              .filter((x) => x.active)
              .map((x) => ({
                ...x,
                classKind: x.classKind || "ADVISORY",
                isAdviser: adviserId(x) === uid,
                canManageRoster: !isAdmin && canManageRoster(x, uid),
              })),
            subjects: rows(
              await db.collection(`${base}/sparkSubjects`).limit(1000).get(),
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
          const modern =
            input.classKind !== undefined || input.grade !== undefined;
          if (modern && (!input.classKind || !input.grade))
            throw new RequestError(400, "Choose a class role and Grade 1–12.");
          if (!modern && (!input.academicYearId || !input.gradeLevelId))
            throw new RequestError(
              400,
              "Choose an active academic year and grade.",
            );
          if (
            input.classKind === "SUBJECT" &&
            (!input.subjectName ||
              !input.startTime ||
              !input.endTime ||
              input.endTime <= input.startTime)
          )
            throw new RequestError(
              400,
              "Enter a subject and start/end times in order.",
            );
          if (
            input.classKind !== "SUBJECT" &&
            (input.subjectName || input.startTime || input.endTime)
          )
            throw new RequestError(
              400,
              "Subject fields require a subject class.",
            );
          const ref = db.doc(`${base}/sparkSections/${input.requestId}`);
          const values = {
            name: input.name,
            teacherId: uid,
            adviserId: input.classKind === "SUBJECT" ? "" : uid,
            ...(modern
              ? { classKind: input.classKind, grade: input.grade }
              : {}),
            ...(input.gradeLevelId ? { gradeLevelId: input.gradeLevelId } : {}),
            ...(input.academicYearId
              ? { academicYearId: input.academicYearId }
              : {}),
            ...(input.classKind === "SUBJECT"
              ? { subjectTeacherIds: [uid] }
              : {}),
          };
          await db.runTransaction(async (tx) => {
            await requireActiveTeacher(tx, uid);
            const existing = await tx.get(ref);
            const subjectRef = db.doc(
              `${base}/sparkSubjects/${input.requestId}`,
            );
            const subject =
              input.classKind === "SUBJECT" ? await tx.get(subjectRef) : null;
            for (const [collection, target] of [
              ["academicYears", input.academicYearId],
              ["gradeLevels", input.gradeLevelId],
            ]) {
              if (
                target &&
                !(
                  await tx.get(db.doc(`${base}/${collection}/${target}`))
                ).data()?.active
              )
                throw new RequestError(
                  400,
                  "Choose an active academic year and grade.",
                );
            }
            if (existing.exists) {
              if (
                Object.entries(values).some(
                  ([key, value]) =>
                    JSON.stringify(existing.data()[key]) !==
                    JSON.stringify(value),
                ) ||
                (subject &&
                  (!subject.exists ||
                    ["name", "startTime", "endTime"].some(
                      (key) =>
                        subject.data()[key] !==
                        input[key === "name" ? "subjectName" : key],
                    )))
              )
                throw new RequestError(409, "Request was already used.");
              return;
            }
            if (subject?.exists)
              throw new RequestError(409, "Request was already used.");
            tx.create(ref, {
              ...values,
              active: true,
              deviceId: "WEB",
              createdAt: FieldValue.serverTimestamp(),
            });
            if (subject)
              tx.create(subjectRef, {
                sectionId: ref.id,
                teacherId: uid,
                name: input.subjectName,
                startTime: input.startTime,
                endTime: input.endTime,
                active: true,
              });
          });
          return res.json({ id: ref.id, sectionId: ref.id });
        }
        case "studentCreate": {
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
          const values = {
            sectionId: input.sectionId,
            firstName: input.firstName,
            lastName: input.lastName,
            displayName: input.firstName + " " + input.lastName,
            parentName: input.parentName,
            parentPhone,
            parentPhoneVerified: true,
            parentConsent: true,
            status: "ACTIVE",
            createdBy: uid,
          };
          const studentNumber = await db.runTransaction(async (tx) => {
            await requireActiveTeacher(tx, uid);
            const section = await tx.get(
              db.doc(`${base}/sparkSections/${input.sectionId}`),
            );
            if (
              !section.exists ||
              !section.data().active ||
              !canManageRoster(section.data(), uid)
            )
              throw new RequestError(
                403,
                "Only the class roster owner can create students.",
              );
            const existing = await tx.get(ref);
            if (existing.exists) {
              if (
                Object.entries(values).some(
                  ([key, value]) => existing.data()[key] !== value,
                ) ||
                (input.studentNumber &&
                  existing.data().studentNumber !== input.studentNumber)
              )
                throw new RequestError(409, "Request was already used.");
              return existing.data().studentNumber;
            }
            let number = input.studentNumber,
              counter,
              next;
            if (section.data().classKind || !number) {
              let grade = section.data().grade;
              if (grade === undefined && section.data().gradeLevelId) {
                const legacyGrade = await tx.get(
                  db.doc(`${base}/gradeLevels/${section.data().gradeLevelId}`),
                );
                const match = /^Grade\s+(\d{1,2})$/i.exec(
                  legacyGrade.data()?.name || "",
                );
                if (match) grade = Number(match[1]);
              }
              if (!Number.isInteger(grade) || grade < 1 || grade > 12)
                throw new RequestError(
                  400,
                  "This legacy section needs a student number.",
                );
              const name =
                section
                  .data()
                  .name.normalize("NFKD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toUpperCase()
                  .replace(/[^A-Z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
                  .slice(0, 24) || "SECTION";
              const prefix = `G${grade}-${name}`;
              counter = db.doc(`${base}/sparkStudentCodeCounters/${prefix}`);
              next = (await tx.get(counter)).data()?.next || 1;
              do {
                number = `${prefix}-${String(next++).padStart(3, "0")}`;
              } while (
                (await tx.get(db.doc(`${base}/sparkStudentNumbers/${number}`)))
                  .exists
              );
            } else if (
              (await tx.get(db.doc(`${base}/sparkStudentNumbers/${number}`)))
                .exists
            )
              throw new RequestError(409, "Student number already exists.");
            if (counter) tx.set(counter, { next });
            tx.create(ref, {
              ...values,
              studentNumber: number,
              deviceId: "WEB",
              createdAt: FieldValue.serverTimestamp(),
            });
            tx.create(db.doc(`${base}/sparkStudentNumbers/${number}`), {
              studentId: ref.id,
              sectionId: input.sectionId,
            });
            return number;
          });
          return res.json({
            id: ref.id,
            studentId: ref.id,
            guardianId: `${ref.id}_parent`,
            studentNumber,
          });
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
              .where("eventType", "in", ["ARRIVAL", "ABSENT"])
              .limit(1000)
              .get(),
          );
          const statuses = new Map(
            latestNativeRollCall(arrivals).map((x) => [x.studentId, x]),
          );
          decisions.forEach((x) =>
            statuses.set(x.studentId, { status: x.status, source: "WEB" }),
          );
          return res.json({
            students: students.map((s) => ({
              ...s,
              status: statuses.get(s.id)?.status || "UNMARKED",
              source: statuses.get(s.id)?.source || null,
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
              .where("eventType", "in", ["ARRIVAL", "ABSENT"])
              .limit(1000)
              .get(),
          );
          const merged = new Map(
            latestNativeRollCall(native).map((x) => [
              `${x.studentId}|${x.subjectId || "LEGACY"}`,
              x,
            ]),
          );
          web.forEach((x) => merged.set(`${x.studentId}|LEGACY`, x));
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
