import { useEffect, useState, type FormEvent } from "react";
import { SchoolNfc } from "../native/plugin";
import type { ActiveTeacher, ClassKind, SectionSummary } from "../native/types";
import { Banner, Button, Field } from "../components/Ui";

export function SectionForm({
  classKind,
  onSaved,
  onCancel,
}: {
  classKind: ClassKind;
  onSaved: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [grade, setGrade] = useState(1);
  const [subjectName, setSubjectName] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || (classKind === "SUBJECT" && !subjectName.trim())) {
      setError("Enter the section and subject names.");
      return;
    }
    if (
      classKind === "SUBJECT" &&
      (!startTime || !endTime || endTime <= startTime)
    ) {
      setError("End time must be after start time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await SchoolNfc.createSection({
        requestId,
        name: name.trim(),
        classKind,
        grade,
        ...(classKind === "SUBJECT"
          ? { subjectName: subjectName.trim(), startTime, endTime }
          : {}),
      });
      await onSaved(result.sectionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Class could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="teacher-form" aria-labelledby="section-form-heading">
      <h2 id="section-form-heading">
        New {classKind === "ADVISORY" ? "advisory" : "subject"} class
      </h2>
      {error && <Banner>{error}</Banner>}
      <form onSubmit={submit}>
        <Field label="Grade level">
          <select
            required
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Grade {i + 1}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section name">
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sampaguita"
            autoFocus
          />
        </Field>
        {classKind === "SUBJECT" && (
          <>
            <Field label="Subject name">
              <input
                required
                maxLength={80}
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </Field>
            <div className="form-columns">
              <Field label="Start time">
                <input
                  required
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </Field>
              <Field label="End time">
                <input
                  required
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Create class
          </Button>
        </div>
      </form>
    </section>
  );
}

export function StudentForm({
  sectionId,
  grade,
  student,
  onSaved,
  onCancel,
}: {
  sectionId: string;
  grade?: number;
  student?: import("../native/types").StudentDetails;
  onSaved: (studentNumber?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [classGrade, setClassGrade] = useState("");
  const [fields, setFields] = useState({
    firstName: student?.firstName ?? "",
    lastName: student?.lastName ?? "",
    parentName: student?.parentName ?? "",
    parentPhone: student?.parentPhone ?? "",
  });
  const [verified, setVerified] = useState(
    student?.parentPhoneVerified ?? false,
  );
  const [consent, setConsent] = useState(student?.parentConsent ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!student && grade == null && !classGrade) {
      setError("Choose the class grade to generate the student code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const contact = {
        ...fields,
        sectionId,
        parentPhoneVerified: verified,
        parentConsent: consent,
      };
      if (student) {
        await SchoolNfc.updateStudent({
          ...contact,
          studentId: student.studentId,
        });
        await onSaved(student.studentNumber);
      } else {
        const result = await SchoolNfc.createStudent({
          ...contact,
          requestId,
          ...(grade == null ? { grade: Number(classGrade) } : {}),
        });
        await onSaved(result.studentNumber);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Student could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  function input(
    key: keyof typeof fields,
    label: string,
    placeholder?: string,
  ) {
    return (
      <Field label={label}>
        <input
          required
          maxLength={80}
          inputMode={key === "parentPhone" ? "tel" : "text"}
          value={fields[key]}
          onChange={(e) => {
            setFields({ ...fields, [key]: e.target.value });
            if (key === "parentPhone") {
              setVerified(false);
              setConsent(false);
            }
          }}
          placeholder={placeholder}
        />
      </Field>
    );
  }
  return (
    <section className="teacher-form" aria-labelledby="student-form-heading">
      <h2 id="student-form-heading">
        {student ? "Edit student & parent" : "Add student & parent"}
      </h2>
      {error && <Banner>{error}</Banner>}
      <form onSubmit={submit}>
        <p>
          {student
            ? `Student code: ${student.studentNumber}. Attendance history is preserved.`
            : "The student code is generated when you save."}
        </p>
        {!student && grade == null && (
          <Field label="Class grade">
            <select
              required
              value={classGrade}
              onChange={(e) => setClassGrade(e.target.value)}
            >
              <option value="">Choose a grade</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Grade {i + 1}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="form-columns">
          {input("firstName", "First name")}
          {input("lastName", "Last name")}
        </div>
        <div className="form-divider">PARENT CONTACT</div>
        {input("parentName", "Parent name")}
        {input("parentPhone", "Parent mobile number", "09171234567")}
        <label className="checkbox-field">
          <input
            type="checkbox"
            required
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          <span>I verified this number with the parent.</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>The parent agreed to receive attendance texts.</span>
        </label>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save student
          </Button>
        </div>
      </form>
    </section>
  );
}

export function SectionManagement({
  section,
  onSaved,
  onCancel,
}: {
  section: SectionSummary;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [teachers, setTeachers] = useState<ActiveTeacher[]>([]);
  const [adviserId, setAdviserId] = useState(section.adviserId ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [fields, setFields] = useState({
    teacherId: "",
    name: "",
    startTime: "08:00",
    endTime: "09:00",
  });
  const [newSubjectId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void SchoolNfc.activeTeacherDirectory()
      .then((result) => {
        if (active) setTeachers(result.teachers);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Teacher directory could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Configuration could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function teacherOptions() {
    return (
      <>
        <option value="">Choose a teacher</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.name}
            {teacher.username ? ` · ${teacher.username}` : ""}
          </option>
        ))}
      </>
    );
  }
  return (
    <section className="teacher-form" aria-labelledby="management-heading">
      <h2 id="management-heading">Manage {section.name}</h2>
      {error && <Banner>{error}</Banner>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(() =>
            SchoolNfc.sectionAssign({ sectionId: section.id, adviserId }),
          );
        }}
      >
        <Field label="Section adviser">
          <select
            required
            value={adviserId}
            disabled={busy}
            onChange={(e) => setAdviserId(e.target.value)}
          >
            {teacherOptions()}
          </select>
        </Field>
        <p>
          Changing the adviser transfers section management to the selected
          teacher.
        </p>
        <Button
          type="submit"
          disabled={busy || !teachers.length || adviserId === section.adviserId}
        >
          Save adviser
        </Button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (fields.endTime <= fields.startTime) {
            setError("End time must be after start time.");
            return;
          }
          void save(async () => {
            await SchoolNfc.subjectSet({
              ...fields,
              sectionId: section.id,
              subjectId: subjectId || newSubjectId,
            });
          });
        }}
      >
        <Field label="Subject to configure">
          <select
            value={subjectId}
            disabled={busy}
            onChange={(e) => {
              const selected = section.subjects?.find(
                (subject) => subject.id === e.target.value,
              );
              setSubjectId(e.target.value);
              setFields(
                selected
                  ? {
                      teacherId: selected.teacherId,
                      name: selected.name,
                      startTime: selected.startTime,
                      endTime: selected.endTime,
                    }
                  : {
                      teacherId: "",
                      name: "",
                      startTime: "08:00",
                      endTime: "09:00",
                    },
              );
            }}
          >
            <option value="">Add subject</option>
            {section.subjects?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject name">
          <input
            required
            maxLength={80}
            value={fields.name}
            disabled={busy}
            onChange={(e) => setFields({ ...fields, name: e.target.value })}
          />
        </Field>
        <Field label="Assigned teacher">
          <select
            required
            value={fields.teacherId}
            disabled={busy}
            onChange={(e) =>
              setFields({ ...fields, teacherId: e.target.value })
            }
          >
            {teacherOptions()}
          </select>
        </Field>
        <Field label="Subject start">
          <input
            required
            type="time"
            value={fields.startTime}
            disabled={busy}
            onChange={(e) =>
              setFields({ ...fields, startTime: e.target.value })
            }
          />
        </Field>
        <Field label="Subject end">
          <input
            required
            type="time"
            value={fields.endTime}
            disabled={busy}
            onChange={(e) => setFields({ ...fields, endTime: e.target.value })}
          />
        </Field>
        <Button type="submit" disabled={busy || !teachers.length}>
          {subjectId ? "Save subject assignment" : "Add subject"}
        </Button>
      </form>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>
        Close management
      </Button>
    </section>
  );
}
