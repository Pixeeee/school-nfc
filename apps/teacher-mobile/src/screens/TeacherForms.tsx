import { useEffect, useState, type FormEvent } from "react";
import { SchoolNfc } from "../native/plugin";
import type {
  ActiveTeacher,
  SectionSummary,
  TeacherSetup,
} from "../native/types";
import { Banner, Button, Field } from "../components/Ui";

export function SectionForm({
  setup,
  onSaved,
  onCancel,
}: {
  setup: TeacherSetup;
  onSaved: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [gradeLevelId, setGrade] = useState(setup.gradeLevels[0]?.id ?? "");
  const [academicYearId, setYear] = useState(setup.academicYears[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await SchoolNfc.createSection({
        requestId,
        name: name.trim(),
        gradeLevelId,
        academicYearId,
      });
      await onSaved(result.sectionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Section could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="teacher-form" aria-labelledby="section-form-heading">
      <h2 id="section-form-heading">New section</h2>
      {error && <Banner>{error}</Banner>}
      <form onSubmit={submit}>
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
        <div className="form-columns">
          <Field label="Grade level">
            <select
              required
              value={gradeLevelId}
              onChange={(e) => setGrade(e.target.value)}
            >
              <option value="">Choose a grade</option>
              {setup.gradeLevels.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year">
            <select
              required
              value={academicYearId}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">Choose a year</option>
              {setup.academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {(!gradeLevelId || !academicYearId) && (
          <Banner kind="info">
            A school administrator must configure an active academic year and
            grade levels first.
          </Banner>
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
          <Button
            type="submit"
            busy={busy}
            disabled={!gradeLevelId || !academicYearId}
          >
            Create section
          </Button>
        </div>
      </form>
    </section>
  );
}

export function StudentForm({
  sectionId,
  onSaved,
  onCancel,
}: {
  sectionId: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [fields, setFields] = useState({
    studentNumber: "",
    firstName: "",
    lastName: "",
    parentName: "",
    parentPhone: "",
  });
  const [verified, setVerified] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await SchoolNfc.createStudent({
        ...fields,
        requestId,
        sectionId,
        parentPhoneVerified: verified,
        parentConsent: consent,
      });
      await onSaved();
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
          maxLength={key === "studentNumber" ? 40 : 80}
          inputMode={key === "parentPhone" ? "tel" : "text"}
          value={fields[key]}
          onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
          placeholder={placeholder}
        />
      </Field>
    );
  }
  return (
    <section className="teacher-form" aria-labelledby="student-form-heading">
      <h2 id="student-form-heading">Add student &amp; parent</h2>
      {error && <Banner>{error}</Banner>}
      <form onSubmit={submit}>
        {input("studentNumber", "Student number", "e.g. 2026-001")}
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
