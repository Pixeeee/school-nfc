import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Plus, RefreshCw, UserPlus, Users } from "lucide-react";
import { SchoolNfc } from "../native/plugin";
import type {
  ClassKind,
  DeviceState,
  QueueSummary,
  RosterStudent,
  SectionSummary,
  TeacherSetup,
  StudentDetails,
} from "../native/types";
import { Banner, Button, Field } from "../components/Ui";
import { SectionForm, StudentForm, SectionManagement } from "./TeacherForms";

import { orderRoster } from "./rosterOrder";

const smsLabels = {
  NONE: "No SMS queued",
  QUEUED: "SMS queued",
  SENT: "SMS sent",
  DELIVERED: "SMS delivered",
  FAILED: "SMS needs attention",
};
export function RollCallScreen({
  device,
  queue,
  onSettings,
}: {
  device: DeviceState;
  queue: QueueSummary | null;
  onSettings: () => void;
}) {
  const formAnchor = useRef<HTMLDivElement>(null);
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [orderDraft, setOrderDraft] = useState<string[] | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentDetails | null>(
    null,
  );
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [classKind, setClassKind] = useState<ClassKind>("ADVISORY");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const view = useRef({ selected: "", subjectId: "" });
  const [history, setHistory] = useState<
    Array<{
      studentId: string;
      subjectId?: string;
      attendanceTag?: string;
      eventType: string;
      localTimestamp: string;
    }>
  >([]);
  const [historyShown, setHistoryShown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dismissal, setDismissal] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  view.current = { selected, subjectId };
  const [setup, setSetup] = useState<TeacherSetup | null>(null);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [date, setDate] = useState("");
  const [form, setForm] = useState<
    "section" | "student" | "edit" | "management" | null
  >(null);
  useEffect(() => {
    if (form)
      formAnchor.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
  }, [form]);
  const [loading, setLoading] = useState(true);
  const [busyStudent, setBusyStudent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [setupError, setSetupError] = useState("");
  const loadSetup = useCallback(async () => {
    const result = await SchoolNfc.getTeacherSetup();
    setSetup(result);
    setSections(result.sections);
    setSetupError("");
    setSelected((current) =>
      result.sections.some((s) => s.id === current)
        ? current
        : (result.sections[0]?.id ?? ""),
    );
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const cached = await SchoolNfc.listSections();
        if (!active) return;
        setSections(cached.sections);
        setSelected(cached.sections[0]?.id ?? "");
        const result = await SchoolNfc.getTeacherSetup();
        if (!active) return;
        setSetup(result);
        setSections(result.sections);
        setSelected((current) =>
          result.sections.some((s) => s.id === current)
            ? current
            : (result.sections[0]?.id ?? ""),
        );
      } catch (e) {
        if (active)
          setSetupError(
            e instanceof Error
              ? e.message
              : "Setup needs an internet connection. Cached roll call is still available.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const refreshRoster = useCallback(async () => {
    if (!selected) {
      setStudents([]);
      return;
    }
    const result = await SchoolNfc.listSectionStudents({
      sectionId: selected,
      subjectId,
    });
    if (
      view.current.selected === selected &&
      view.current.subjectId === subjectId
    ) {
      setStudents(result.students);
      setCustomOrder(result.rosterOrder ?? []);
      setDate(result.localSchoolDate);
    }
  }, [selected, subjectId]);
  useEffect(() => {
    let active = true;
    setStudents([]);
    setError("");
    setNotice("");
    async function refresh() {
      try {
        if (!selected) return;
        const result = await SchoolNfc.listSectionStudents({
          sectionId: selected,
          subjectId,
        });
        if (
          active &&
          view.current.selected === selected &&
          view.current.subjectId === subjectId
        ) {
          setStudents(result.students);
          setCustomOrder(result.rosterOrder ?? []);
          setDate(result.localSchoolDate);
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Roster could not be loaded.",
          );
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, subjectId]);
  async function markPresent(
    student: RosterStudent,
    tag: "ON_TIME" | "LATE" | "ABSENT" = "ON_TIME",
  ) {
    if (busyStudent) return;
    setBusyStudent(student.id);
    setError("");
    setNotice("");
    try {
      const result = subjectId
        ? await SchoolNfc.markSubject({
            sectionId: selected,
            studentId: student.id,
            subjectId,
            tag,
          })
        : tag === "ABSENT"
          ? await SchoolNfc.markAbsent({
              sectionId: selected,
              studentId: student.id,
            })
          : await SchoolNfc.markPresent({
              sectionId: selected,
              studentId: student.id,
              tag,
            });
      if (result.status === "REJECTED")
        throw new Error(result.reason ?? "Attendance was rejected.");
      setNotice(
        result.status === "DUPLICATE"
          ? "Attendance already recorded today. No additional SMS queued."
          : `${student.displayName} marked ${tag === "ABSENT" ? "absent" : tag === "LATE" ? "present late" : "present on time"}. ${subjectId ? "Subject attendance saved. No parent SMS sent." : `${result.smsQueued ?? 0} parent SMS queued.`}`,
      );
      await refreshRoster();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Attendance could not be saved.",
      );
    } finally {
      setBusyStudent(null);
    }
  }
  const orderedStudents = orderRoster(students, customOrder);
  const present = students.filter((s) => s.present).length;
  const section = sections.find((s) => s.id === selected);
  const subject = section?.subjects?.find((s) => s.id === subjectId);
  const isAdviser = section?.classKind !== "SUBJECT" && section?.isAdviser;
  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const canManageRoster =
    section?.canManageRoster ??
    section?.isAdviser ??
    section?.classKind !== "SUBJECT";
  const canMark = subjectId
    ? subject?.isAssigned
    : isAdviser ||
      (!section?.subjects?.length && section?.classKind !== "SUBJECT");
  useEffect(() => {
    setSubjectId(
      section?.classKind === "SUBJECT" && section.subjects?.length === 1
        ? section.subjects[0]!.id
        : "",
    );
    setSelectedStudentId("");
    setOrderDraft(null);
    setDeleteConfirm(false);
    setEditingStudent(null);
    setForm(null);
    setHistory([]);
    setHistoryShown(false);
    setDismissal(null);
    setEditing(false);
    setError("");
  }, [selected, section?.classKind, section?.subjects?.length]);
  const suggestedLate = subject
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date()) > subject.startTime
    : false;
  return (
    <div className="standard-page roll-call-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TEACHER ATTENDANCE</span>
          <h1>Roll call</h1>
          <p>Choose a class and student, then mark On time, Late or Absent.</p>
        </div>
        <div className="heading-icon">
          <ClipboardCheck />
        </div>
      </div>
      {!subjectId &&
        (!device.smsPermission || device.selectedSubscriptionId == null) && (
          <Banner kind="info">
            Set up SMS permission and your prepaid SIM before sending parent
            texts.{" "}
            <button className="text-button" onClick={onSettings}>
              Open settings
            </button>
          </Banner>
        )}
      {setupError && (
        <Banner kind="info">
          {setupError}{" "}
          <button
            className="text-button"
            onClick={() =>
              void loadSetup().catch((e) => setSetupError(String(e.message)))
            }
          >
            Retry setup
          </button>
        </Banner>
      )}
      {error && <Banner>{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      <section className="section-picker">
        <Field label="Your class">
          <select
            value={selected}
            disabled={
              form !== null || busyStudent !== null || dismissal !== null
            }
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Choose a section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.classKind === "SUBJECT" && s.subjects?.[0]?.name
                  ? `${s.subjects[0].name} · `
                  : ""}
                {s.grade ? `Grade ${s.grade} · ` : ""}
                {s.name}
                {s.classKind
                  ? ` · ${s.classKind === "ADVISORY" ? "Advisory" : "Subject"}`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="secondary"
          disabled={!setup || form !== null || busyStudent !== null}
          onClick={() => {
            setClassKind("ADVISORY");
            setForm("section");
          }}
        >
          <Plus /> Advisory
        </Button>
        <Button
          variant="secondary"
          disabled={!setup || form !== null || busyStudent !== null}
          onClick={() => {
            setClassKind("SUBJECT");
            setForm("section");
          }}
        >
          <Plus /> Subject
        </Button>
      </section>
      <div ref={formAnchor} style={{ scrollMarginTop: 80 }} />
      {isAdviser && device.backend === "SPARK" && (
        <Button
          variant="secondary"
          disabled={form !== null || busyStudent !== null || dismissal !== null}
          onClick={() => setForm("management")}
        >
          Manage section
        </Button>
      )}
      {form === "management" && isAdviser && (
        <SectionManagement
          key={section.id}
          section={section}
          onCancel={() => setForm(null)}
          onSaved={async () => {
            await loadSetup();
            setForm(null);
            setNotice("Section configuration saved.");
          }}
        />
      )}
      {section && device.backend === "SPARK" && (
        <section className="section-picker">
          <Field label="Subject">
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={busyStudent !== null || form !== null}
            >
              <option value="">
                {isAdviser ? "Advisory attendance" : "Choose a subject"}
              </option>
              {section.subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} · {subject.startTime}–{subject.endTime}
                </option>
              ))}
            </select>
          </Field>
          {subject?.isAssigned && (
            <>
              <p>
                {suggestedLate
                  ? "The scheduled start has passed. Present late is suggested; choose the correct status."
                  : "Choose the actual attendance status."}
              </p>
              <Button variant="secondary" onClick={() => setEditing(!editing)}>
                Edit subject schedule
              </Button>
            </>
          )}
          {editing && subject && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void SchoolNfc.updateSubject({
                  subjectId,
                  name: String(data.get("name")),
                  startTime: String(data.get("startTime")),
                  endTime: String(data.get("endTime")),
                })
                  .then(async () => {
                    await loadSetup();
                    setEditing(false);
                  })
                  .catch((e) => setError(e.message));
              }}
            >
              <Field label="Subject name">
                <input
                  name="name"
                  defaultValue={subject.name}
                  required
                  maxLength={80}
                />
              </Field>
              <Field label="Start">
                <input
                  name="startTime"
                  type="time"
                  defaultValue={subject.startTime}
                  required
                />
              </Field>
              <Field label="End">
                <input
                  name="endTime"
                  type="time"
                  defaultValue={subject.endTime}
                  required
                />
              </Field>
              <Button>Save schedule</Button>
            </form>
          )}
          {isAdviser && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  void SchoolNfc.subjectAttendance({
                    sectionId: selected,
                    date,
                  })
                    .then((r) => {
                      if (view.current.selected === selected) {
                        setHistory(r.attendance);
                        setHistoryShown(true);
                      }
                    })
                    .catch((e) => setError(e.message))
                }
              >
                View all subject attendance
              </Button>
              <Button
                variant="secondary"
                disabled={busyStudent !== null}
                onClick={() =>
                  void SchoolNfc.dismissalCount({ sectionId: selected })
                    .then((r) => {
                      if (view.current.selected === selected)
                        setDismissal(r.count);
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Out
              </Button>
            </>
          )}
          {dismissal !== null && (
            <div role="dialog" aria-modal="true" aria-label="Confirm dismissal">
              <p>
                Send dismissal SMS to {dismissal} consenting active parent
                contacts for {section.name} today? Out can be recorded once per
                section per day.
              </p>
              <Button
                disabled={busyStudent !== null}
                onClick={() => {
                  setBusyStudent("OUT");
                  void SchoolNfc.dismissSection({
                    sectionId: selected,
                    expectedCount: dismissal,
                  })
                    .then((r) => {
                      setNotice(`${r.queued} dismissal SMS queued.`);
                      setDismissal(null);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusyStudent(null));
                }}
              >
                Confirm Out · {dismissal} recipients
              </Button>
              <Button variant="secondary" onClick={() => setDismissal(null)}>
                Cancel
              </Button>
            </div>
          )}
          {historyShown && (
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  {section.subjects?.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedStudents.map((student) => (
                  <tr key={student.id}>
                    <td>{student.displayName}</td>
                    {section.subjects?.map((subject) => {
                      const latest = history
                        .filter(
                          (x) =>
                            x.studentId === student.id &&
                            x.subjectId === subject.id,
                        )
                        .sort((a, b) =>
                          b.localTimestamp.localeCompare(a.localTimestamp),
                        )[0];
                      return (
                        <td key={subject.id}>
                          {latest?.attendanceTag?.replace("_", " ") ||
                            "Unmarked"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {form === "section" && setup && (
        <SectionForm
          key={classKind}
          classKind={classKind}
          onCancel={() => setForm(null)}
          onSaved={async (id) => {
            await loadSetup();
            setSelected(id);
            setForm(null);
            setNotice("Section created.");
          }}
        />
      )}
      {(form === "student" || (form === "edit" && editingStudent)) && (
        <StudentForm
          key={editingStudent?.studentId ?? "new-student"}
          sectionId={selected}
          student={form === "edit" ? (editingStudent ?? undefined) : undefined}
          grade={section?.grade}
          onCancel={() => setForm(null)}
          onSaved={async (studentNumber) => {
            await refreshRoster();
            if (section?.grade == null) await loadSetup();
            setForm(null);
            setNotice(
              `Student and parent contact saved.${studentNumber ? ` Student code: ${studentNumber}.` : ""}`,
            );
          }}
        />
      )}
      {selected ? (
        <>
          <section
            className="attendance-summary"
            aria-label="Today's attendance"
          >
            <div>
              <span>{date || "TODAY"}</span>
              <h2>{section?.name}</h2>
              <p>
                <strong>{present}</strong> of {students.length} students present
              </p>
            </div>
            <div className="attendance-count">
              {present}
              <span>present</span>
            </div>
            <progress
              value={present}
              max={Math.max(students.length, 1)}
              aria-label="Students present"
            />
          </section>
          <div className="roster-heading">
            <h2>
              Students <span>{students.length}</span>
            </h2>
            <div>
              <button
                className="icon-button"
                aria-label="Refresh roster"
                onClick={() =>
                  void refreshRoster().catch((e) => setError(e.message))
                }
              >
                <RefreshCw />
              </button>
              <Button
                variant="secondary"
                disabled={
                  form !== null ||
                  busyStudent !== null ||
                  (device.backend === "SPARK" &&
                    !(
                      section?.canManageRoster ??
                      section?.isAdviser ??
                      section?.classKind !== "SUBJECT"
                    ))
                }
                onClick={() => setForm("student")}
              >
                <UserPlus /> Add student
              </Button>
            </div>
          </div>
          <section
            className="student-action-panel"
            aria-label="Selected student attendance"
          >
            {selectedStudent ? (
              <>
                <div className="student-details">
                  <h3>{selectedStudent.displayName}</h3>
                  <span>{selectedStudent.studentNumber}</span>
                  <span>
                    {selectedStudent.attendanceStatus?.replace("_", " ") ||
                      (selectedStudent.present ? "PRESENT" : "Unmarked")}
                  </span>
                  <small
                    className={
                      selectedStudent.smsStatus === "FAILED" ||
                      selectedStudent.syncStatus === "CONFLICT"
                        ? "needs-attention"
                        : ""
                    }
                  >
                    {subjectId
                      ? "Subject attendance only · No SMS"
                      : smsLabels[selectedStudent.smsStatus]}
                    {selectedStudent.syncStatus === "CONFLICT"
                      ? " · Sync conflict"
                      : ""}
                  </small>
                </div>
                {device.backend === "SPARK" && canManageRoster && (
                  <div className="attendance-actions">
                    <Button
                      variant="secondary"
                      disabled={busyStudent !== null || form !== null}
                      onClick={() => {
                        setBusyStudent(selectedStudent.id);
                        setError("");
                        setDeleteConfirm(false);
                        void SchoolNfc.getStudent({
                          sectionId: selected,
                          studentId: selectedStudent.id,
                        })
                          .then((r) => {
                            setEditingStudent(r.student);
                            setForm("edit");
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusyStudent(null));
                      }}
                    >
                      Edit student
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busyStudent !== null || form !== null}
                      onClick={() => setDeleteConfirm(true)}
                    >
                      Delete student
                    </Button>
                  </div>
                )}
                {deleteConfirm && (
                  <div
                    role="alertdialog"
                    aria-label="Confirm student deletion"
                    className="delete-confirmation"
                  >
                    <p>
                      Delete {selectedStudent.displayName} from this class
                      roster? Past attendance and the student code are kept.
                      Unsent texts on this phone are cancelled; texts already
                      sending or sent cannot be recalled.
                    </p>
                    <Button
                      variant="danger"
                      busy={busyStudent !== null}
                      onClick={() => {
                        setBusyStudent(selectedStudent.id);
                        setError("");
                        void SchoolNfc.deleteStudent({
                          sectionId: selected,
                          studentId: selectedStudent.id,
                        })
                          .then(async () => {
                            setDeleteConfirm(false);
                            setSelectedStudentId("");
                            await refreshRoster();
                            setNotice(
                              "Student removed from the roster. Attendance history preserved.",
                            );
                          })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusyStudent(null));
                      }}
                    >
                      Confirm delete
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busyStudent !== null}
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Keep student
                    </Button>
                  </div>
                )}
                {canMark ? (
                  <div className="attendance-actions">
                    <Button
                      disabled={
                        busyStudent !== null ||
                        form !== null ||
                        selectedStudent.attendanceStatus === "ON_TIME"
                      }
                      onClick={() =>
                        void markPresent(selectedStudent, "ON_TIME")
                      }
                    >
                      On time
                    </Button>
                    {(subjectId || device.backend === "SPARK") && (
                      <Button
                        variant="secondary"
                        disabled={
                          busyStudent !== null ||
                          form !== null ||
                          selectedStudent.attendanceStatus === "LATE"
                        }
                        onClick={() =>
                          void markPresent(selectedStudent, "LATE")
                        }
                      >
                        Late
                      </Button>
                    )}
                    {device.backend === "SPARK" && (
                      <Button
                        variant="secondary"
                        disabled={
                          busyStudent !== null ||
                          form !== null ||
                          selectedStudent.attendanceStatus === "ABSENT"
                        }
                        onClick={() =>
                          void markPresent(selectedStudent, "ABSENT")
                        }
                      >
                        Absent
                      </Button>
                    )}
                  </div>
                ) : (
                  <p>Choose an assigned subject to mark attendance.</p>
                )}
              </>
            ) : (
              <p>Tap a student below to mark attendance.</p>
            )}
          </section>
          <section className="roster-order" aria-label="Roster order">
            <p>
              {customOrder.length
                ? "Custom order on this phone"
                : "Alphabetical by surname (A–Z)"}
            </p>
            {device.backend === "SPARK" && (
              <div className="form-actions">
                <Button
                  variant="secondary"
                  disabled={
                    form !== null || busyStudent !== null || orderDraft !== null
                  }
                  onClick={() =>
                    setOrderDraft(orderedStudents.map((s) => s.id))
                  }
                >
                  Customize order
                </Button>
                {customOrder.length > 0 && (
                  <Button
                    variant="secondary"
                    disabled={busyStudent !== null || orderDraft !== null}
                    onClick={() => {
                      setBusyStudent("ORDER");
                      void SchoolNfc.saveRosterOrder({
                        sectionId: selected,
                        studentIds: [],
                      })
                        .then(() => setCustomOrder([]))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusyStudent(null));
                    }}
                  >
                    Reset to surname A–Z
                  </Button>
                )}
              </div>
            )}
            {orderDraft && (
              <div className="teacher-form">
                <h3>Customize student order</h3>
                <p>
                  Use Up and Down, then save. This order is saved for this
                  account and class on this phone.
                </p>
                {orderDraft.map((id, index) => (
                  <div className="order-row" key={id}>
                    <span>
                      {index + 1}.{" "}
                      {students.find((s) => s.id === id)?.displayName}
                    </span>
                    <button
                      aria-label={`Move ${students.find((s) => s.id === id)?.displayName} up`}
                      disabled={index === 0 || busyStudent !== null}
                      onClick={() =>
                        setOrderDraft((ids) => {
                          const next = [...ids!];
                          [next[index - 1], next[index]] = [
                            next[index]!,
                            next[index - 1]!,
                          ];
                          return next;
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${students.find((s) => s.id === id)?.displayName} down`}
                      disabled={
                        index === orderDraft.length - 1 || busyStudent !== null
                      }
                      onClick={() =>
                        setOrderDraft((ids) => {
                          const next = [...ids!];
                          [next[index + 1], next[index]] = [
                            next[index]!,
                            next[index + 1]!,
                          ];
                          return next;
                        })
                      }
                    >
                      ↓
                    </button>
                  </div>
                ))}
                <div className="form-actions">
                  <Button
                    variant="secondary"
                    disabled={busyStudent !== null}
                    onClick={() => setOrderDraft(null)}
                  >
                    Cancel order
                  </Button>
                  <Button
                    busy={busyStudent === "ORDER"}
                    onClick={() => {
                      setBusyStudent("ORDER");
                      void SchoolNfc.saveRosterOrder({
                        sectionId: selected,
                        studentIds: orderDraft,
                      })
                        .then(() => {
                          setCustomOrder(orderDraft);
                          setOrderDraft(null);
                          setNotice("Roster order saved.");
                        })
                        .catch((e) => setError(e.message))
                        .finally(() => setBusyStudent(null));
                    }}
                  >
                    Save order
                  </Button>
                </div>
              </div>
            )}
          </section>
          <div
            className="roll-call-roster"
            role="group"
            aria-label="Student grid"
          >
            {orderedStudents.map((student) => (
              <button
                type="button"
                key={student.id}
                className={`student-tile ${student.present ? "is-present" : ""} ${student.attendanceStatus === "ABSENT" ? "is-absent" : ""}`}
                aria-pressed={selectedStudentId === student.id}
                disabled={busyStudent !== null || form !== null}
                onClick={() => {
                  setSelectedStudentId(student.id);
                  setDeleteConfirm(false);
                }}
              >
                <strong>{student.displayName}</strong>
                <span>{student.studentNumber}</span>
                <small>
                  {student.attendanceStatus?.replace("_", " ") ||
                    (student.present ? "PRESENT" : "Unmarked")}
                </small>
              </button>
            ))}
          </div>
          {!students.length && (
            <div className="empty-state">
              <Users />
              <h3>Your section is ready</h3>
              <p>
                Add the first student and parent contact to start roll call.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          <Users />
          <h2>{loading ? "Loading your sections…" : "Start with a section"}</h2>
          <p>Create a section, then add students and their parent contacts.</p>
        </div>
      )}
      <p className="attendance-footnote">
        Attendance is saved on this phone. Parent texts use the selected SIM;
        sending and delivery depend on the carrier. {queue?.smsPending ?? 0} SMS
        pending.
      </p>
    </div>
  );
}
