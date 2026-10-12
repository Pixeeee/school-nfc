import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type User,
} from "firebase/auth";
import {
  Activity,
  BookOpen,
  Check,
  ClipboardCheck,
  Gauge,
  LogOut,
  Menu,
  Plus,
  School,
  ShieldCheck,
  Smartphone,
  Users,
  UserRoundCog,
  X,
} from "lucide-react";
import { getFirebase } from "./firebase";
import {
  Banner,
  Button,
  Card,
  Empty,
  Field,
  Loading,
  PageHeader,
  StatusBadge,
} from "./components/Ui";

interface Profile {
  uid: string;
  email: string;
  name: string;
  role: "SCHOOL_ADMIN" | "TEACHER";
}
interface Overview {
  profile: Profile;
  school: { id: string; name: string };
  date: string;
  sections: number;
  students: number;
  present: number;
  absent: number;
  unmarked: number;
}
interface Section {
  id: string;
  name: string;
  teacherId: string;
  adviserId?: string;
  subjectTeacherIds?: string[];
  gradeLevelId: string;
  academicYearId: string;
}
interface Subject {
  id: string;
  sectionId: string;
  teacherId: string;
  name: string;
  startTime: string;
  endTime: string;
}
interface Choice {
  id: string;
  name: string;
}
interface Teacher {
  id: string;
  username?: string;
  displayName: string;
  email: string;
  status: string;
}
interface Student {
  id: string;
  studentNumber: string;
  displayName: string;
  parentName: string;
  parentPhone: string;
  status: string;
  source: string | null;
}
interface Attendance {
  id: string;
  studentId: string;
  studentName?: string;
  sectionId: string;
  status: string;
  source: string;
  subjectId?: string;
  attendanceTag?: string;
  localTimestamp?: string;
}
interface Device {
  id: string;
  displayName: string;
  assignedUserId: string;
  status: string;
}
type Tab = "overview" | "teachers" | "sections" | "attendance" | "devices";
async function request<T>(
  action: string,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const user = getFirebase().auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const response = await fetch("/api/portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...fields }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result;
}
const formValues = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget).entries());
const readable = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed.";
export function SparkPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [years, setYears] = useState<Choice[]>([]);
  const [grades, setGrades] = useState<Choice[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [issued, setIssued] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<"section" | "student" | null>(null);
  const authEpoch = useRef(0);
  const profileRequest = useRef(0);
  const rosterRequest = useRef(0);
  const selection = useRef({ selected, date });
  selection.current = { selected, date };
  const admin = overview?.profile.role === "SCHOOL_ADMIN";
  const owner =
    sections.find((s) => s.id === selected)?.adviserId === user?.uid;
  useEffect(
    () =>
      onAuthStateChanged(getFirebase().auth, (next) => {
        authEpoch.current += 1;
        profileRequest.current += 1;
        rosterRequest.current += 1;
        setDate("");
        setForm(null);
        setBusy(false);
        setUser(next);
        setAuthLoading(false);
        setOverview(null);
        setStudents([]);
        setSelected("");
        setSections([]);
        setTeachers([]);
        setTeacherFilter("");
        setIssued(null);
        setDevices([]);
        setAttendance([]);
        setError("");
        setNotice("");
        setTab("overview");
      }),
    [],
  );
  const load = useCallback(async () => {
    const uid = getFirebase().auth.currentUser?.uid;
    if (!uid) return;
    const epoch = authEpoch.current;
    const requestId = ++profileRequest.current;
    const current = () =>
      authEpoch.current === epoch &&
      getFirebase().auth.currentUser?.uid === uid &&
      profileRequest.current === requestId;
    const result = await request<Overview>("overview");
    if (!current()) return;
    if (result.profile.role !== "SCHOOL_ADMIN")
      throw new Error(
        "This dashboard is for the school administrator only. Teachers sign in using the Android app.",
      );
    setOverview(result);
    setDate((current) => current || result.date);
    const setup = await request<{
      sections: Section[];
      subjects?: Subject[];
      years: Choice[];
      grades: Choice[];
    }>("sectionList");
    if (!current()) return;
    setSections(setup.sections);
    setSubjects(setup.subjects || []);
    setYears(setup.years);
    setGrades(setup.grades);
    setSelected((current) =>
      setup.sections.some((s) => s.id === current)
        ? current
        : setup.sections[0]?.id || "",
    );
    if (result.profile.role === "SCHOOL_ADMIN") {
      const [staff, phones] = await Promise.all([
        request<{ teachers: Teacher[] }>("teacherList"),
        request<{ devices: Device[] }>("deviceList"),
      ]);
      if (!current()) return;
      setTeachers(staff.teachers);
      setDevices(phones.devices);
    }
  }, []);
  useEffect(() => {
    if (user) void load().catch((e) => setError(readable(e)));
  }, [user, load]);
  const loadRoster = useCallback(async () => {
    const uid = getFirebase().auth.currentUser?.uid;
    const epoch = authEpoch.current;
    const requestId = ++rosterRequest.current;
    if (!selected || !date) {
      setStudents([]);
      return;
    }
    const result = await request<{ students: Student[] }>("studentList", {
      sectionId: selected,
      date,
    });
    if (
      authEpoch.current !== epoch ||
      getFirebase().auth.currentUser?.uid !== uid ||
      rosterRequest.current !== requestId ||
      selection.current.selected !== selected ||
      selection.current.date !== date
    )
      return;
    setStudents(result.students);
  }, [selected, date]);
  useEffect(() => {
    setStudents([]);
    if (user) void loadRoster().catch((e) => setError(readable(e)));
  }, [user, loadRoster]);
  useEffect(() => {
    let active = true;
    const uid = getFirebase().auth.currentUser?.uid;
    const epoch = authEpoch.current;
    setAttendance([]);
    if (admin && tab === "attendance" && date)
      void request<{ attendance: Attendance[] }>("attendanceList", { date })
        .then((r) => {
          if (
            active &&
            authEpoch.current === epoch &&
            getFirebase().auth.currentUser?.uid === uid
          )
            setAttendance(r.attendance);
        })
        .catch((e) => {
          if (active && authEpoch.current === epoch) setError(readable(e));
        });
    return () => {
      active = false;
    };
  }, [admin, tab, date]);
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    const epoch = authEpoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (authEpoch.current === epoch) setError(readable(e));
    } finally {
      if (authEpoch.current === epoch) setBusy(false);
    }
  }
  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event);
    await perform(async () => {
      const result = await request<{ customToken: string }>("login", values);
      await signInWithCustomToken(getFirebase().auth, result.customToken);
    });
  }
  async function createTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event);
    const element = event.currentTarget;
    const epoch = authEpoch.current;
    if (!values.email) delete values.email;
    if (!values.password) delete values.password;
    setIssued(null);
    await perform(async () => {
      const credentials = await request<{ username: string; password: string }>(
        "teacherCreate",
        values,
      );
      if (authEpoch.current !== epoch) return;
      setIssued(credentials);
      element.reset();
      await load();
      setNotice(
        "Teacher account created. Share the username and password privately with the teacher. They sign in to the Android app.",
      );
    });
  }
  useEffect(() => {
    if (tab !== "teachers") setIssued(null);
  }, [tab]);
  function filterTeacher(id: string) {
    setTeacherFilter(id);
    setStudents([]);
    setSelected(sections.find((s) => !id || s.teacherId === id)?.id || "");
  }
  async function createSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event);
    await perform(async () => {
      const result = await request<{ id: string }>("sectionCreate", {
        ...values,
        requestId: crypto.randomUUID(),
      });
      await load();
      setSelected(result.id);
      setForm(null);
      setNotice("Section created. You can now add students.");
    });
  }
  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = formValues(event);
    await perform(async () => {
      await request("studentCreate", {
        ...values,
        sectionId: selected,
        requestId: crypto.randomUUID(),
        parentPhoneVerified: values.parentPhoneVerified === "on",
        parentConsent: values.parentConsent === "on",
      });
      await load();
      await loadRoster();
      setForm(null);
      setNotice(
        "Student and parent contact saved. No student account was created.",
      );
    });
  }
  async function mark(studentId: string, status: "PRESENT" | "ABSENT") {
    await perform(async () => {
      await request("attendanceSet", {
        requestId: crypto.randomUUID(),
        studentId,
        sectionId: selected,
        date,
        status,
      });
      await loadRoster();
      await load();
      setNotice(`Attendance saved as ${status.toLowerCase()}.`);
    });
  }
  async function changeDevice(device: Device, status: "APPROVED" | "REVOKED") {
    await perform(async () => {
      await request("deviceSet", {
        deviceId: device.id,
        teacherId: device.assignedUserId,
        status,
      });
      await load();
      setNotice(
        status === "APPROVED"
          ? "Phone approved for six days."
          : "Phone access revoked.",
      );
    });
  }
  if (authLoading) return <Loading />;
  if (!user)
    return (
      <div className="login-page">
        <section className="login-story">
          <div className="brand-large">
            <School />
            <span>School Attendance</span>
          </div>
          <h1>
            A clear view of
            <br />
            every school day.
          </h1>
          <p>
            Create teacher accounts and review every teacher’s class data in one
            school workspace.
          </p>
          <div className="trust-row">
            <ShieldCheck />
            <span>
              Administrator and teacher access. Student records without student
              accounts.
            </span>
          </div>
        </section>
        <section className="login-form-panel">
          <form className="login-card" onSubmit={submitLogin}>
            <div>
              <span className="eyebrow">SCHOOL WORKSPACE</span>
              <h2>Welcome back</h2>
              <p>Sign in with your administrator username.</p>
            </div>
            {error && <Banner>{error}</Banner>}
            <Field label="Username or email">
              <input
                name="identifier"
                autoComplete="username"
                required
                maxLength={254}
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            <Button type="submit" busy={busy}>
              Sign in
            </Button>
          </form>
        </section>
      </div>
    );
  if (!overview)
    return (
      <div className="configuration">
        <h1>Opening your school workspace</h1>
        {error ? <Banner>{error}</Banner> : <Loading />}
        <Button onClick={() => void perform(load)} busy={busy}>
          Retry
        </Button>
        <Button
          variant="ghost"
          onClick={() => void signOut(getFirebase().auth)}
        >
          Sign out
        </Button>
      </div>
    );
  const navigation = [
    { id: "overview" as Tab, label: "Overview", icon: Gauge },
    { id: "teachers" as Tab, label: "Teachers", icon: UserRoundCog },
    {
      id: "sections" as Tab,
      label: admin ? "Sections & students" : "My sections",
      icon: BookOpen,
    },
    { id: "attendance" as Tab, label: "Attendance", icon: Activity },
  ].filter((item) => admin || ["overview", "sections"].includes(item.id));
  return (
    <div className="shell">
      <aside className={`sidebar ${navOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <School />
          </div>
          <div>
            <strong>School Attendance</strong>
            <span>{admin ? "Administrator" : "Teacher"} workspace</span>
          </div>
          <button
            className="mobile-close"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`portal-nav ${tab === item.id ? "active" : ""}`}
              onClick={() => {
                setTab(item.id);
                setNavOpen(false);
                setForm(null);
                setError("");
                setNotice("");
              }}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">
            {overview.profile.name?.[0]?.toUpperCase() || "S"}
          </div>
          <div>
            <strong title={overview.profile.email}>
              {overview.profile.name}
            </strong>
            <span>{admin ? "Administrator" : "Teacher"}</span>
          </div>
          <button
            title="Sign out"
            onClick={() => void signOut(getFirebase().auth)}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-panel">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu />
          </button>
          <div className="school-select">
            <School size={19} />
            <strong>{overview.school.name}</strong>
          </div>
          <div className="secure-chip">
            <ShieldCheck size={16} /> {admin ? "Administrator" : "Teacher"}
          </div>
        </header>
        <main>
          {error && <Banner>{error}</Banner>}
          {notice && <Banner kind="success">{notice}</Banner>}
          {tab === "overview" && (
            <>
              <PageHeader
                title={admin ? "Administrator dashboard" : "Teacher dashboard"}
                description={`Attendance for ${overview.date} · ${overview.school.name}`}
                action={
                  <Button
                    variant="secondary"
                    busy={busy}
                    onClick={() => void perform(load)}
                  >
                    Refresh
                  </Button>
                }
              />
              <div className="metric-grid">
                {[
                  ["Sections", overview.sections, BookOpen],
                  ["Students", overview.students, Users],
                  ["Present", overview.present, Check],
                  ["Absent", overview.absent, X],
                ].map(([label, value, Icon]) => {
                  const MetricIcon = Icon as typeof Users;
                  return (
                    <Card className="metric" key={String(label)}>
                      <div className="metric-icon">
                        <MetricIcon />
                      </div>
                      <div>
                        <span>{String(label)}</span>
                        <strong>{String(value)}</strong>
                      </div>
                    </Card>
                  );
                })}
              </div>
              <div className="dashboard-grid">
                <Card>
                  <div className="card-heading">
                    <div>
                      <h2>Today’s roll call</h2>
                      <p>{overview.unmarked} students still unmarked</p>
                    </div>
                    <ClipboardCheck />
                  </div>
                  <div className="attendance-progress">
                    <span
                      style={{
                        width: `${overview.students ? Math.min(100, ((overview.present + overview.absent) / overview.students) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="muted">
                    Students are absent only when a teacher explicitly marks
                    them Absent.
                  </p>
                  <Button onClick={() => setTab("sections")}>
                    Open sections
                  </Button>
                </Card>
                <Card>
                  <h2>
                    {admin ? "Manage your school" : "Your teaching workspace"}
                  </h2>
                  <p className="muted">
                    {admin
                      ? "Create teacher accounts and review their sections, students, and attendance."
                      : "Create a section, add students and parent contacts, then take roll call."}
                  </p>
                  <div className="portal-quick-actions">
                    {admin && (
                      <Button
                        variant="secondary"
                        onClick={() => setTab("teachers")}
                      >
                        Manage teachers
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => setTab("sections")}
                    >
                      {admin ? "View class data" : "My sections"}
                    </Button>
                  </div>
                </Card>
              </div>
            </>
          )}
          {tab === "teachers" && admin && (
            <>
              <PageHeader
                title="Teacher accounts"
                description="Create school-issued accounts. Students do not need accounts."
              />
              <Card>
                <h2>Add a teacher</h2>
                <form className="form-grid" onSubmit={createTeacher}>
                  <Field label="Full name">
                    <input name="name" required maxLength={120} />
                  </Field>
                  <Field label="Username">
                    <input
                      name="username"
                      required
                      minLength={3}
                      maxLength={40}
                      pattern="[A-Za-z0-9_]{3,40}"
                      autoComplete="off"
                    />
                    <small className="muted">
                      Letters, numbers, and underscores. Give this username and
                      initial password to the teacher.
                    </small>
                  </Field>
                  <Field label="Email (optional)">
                    <input name="email" type="email" autoComplete="off" />
                  </Field>
                  <Field label="Initial password">
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      placeholder="Leave blank to generate a secure password"
                    />
                  </Field>
                  <div className="form-actions">
                    <Button type="submit" busy={busy}>
                      Create teacher account
                    </Button>
                  </div>
                </form>
              </Card>
              {issued && (
                <Card>
                  <h2>Teacher login details</h2>
                  <p>
                    Give these credentials to the teacher for the Android app.
                    The password is shown only now.
                  </p>
                  <p>
                    Username: <strong>{issued.username}</strong>
                  </p>
                  <p>
                    Initial password: <code>{issued.password}</code>
                  </p>
                  <Button variant="secondary" onClick={() => setIssued(null)}>
                    Hide credentials
                  </Button>
                </Card>
              )}
              <Card className="portal-list">
                <h2>
                  Teachers <span className="muted">({teachers.length})</span>
                </h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Class data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((t) => (
                        <tr key={t.id}>
                          <td data-label="Name">{t.displayName || t.email}</td>
                          <td data-label="Username">{t.username || "—"}</td>
                          <td data-label="Email">
                            {t.email?.endsWith(".invalid") ? "—" : t.email}
                          </td>
                          <td data-label="Status">
                            <StatusBadge value={t.status} />
                          </td>
                          <td data-label="Class data">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                filterTeacher(t.id);
                                setTab("sections");
                              }}
                            >
                              View classes (
                              {
                                sections.filter((s) => s.teacherId === t.id)
                                  .length
                              }
                              )
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!teachers.length && (
                  <Empty
                    title="No teachers yet"
                    description="Create your first teacher account above."
                  />
                )}
              </Card>
            </>
          )}
          {tab === "sections" && (
            <>
              <PageHeader
                title={admin ? "Sections & students" : "My sections"}
                description="Keep each class organized, with parent contacts and daily attendance."
                action={
                  !admin && (
                    <Button
                      disabled={busy || !!form}
                      onClick={() => setForm("section")}
                    >
                      <Plus size={17} />
                      Create section
                    </Button>
                  )
                }
              />
              {form === "section" && (
                <Card>
                  <h2>Create a section</h2>
                  <form className="form-grid" onSubmit={createSection}>
                    <Field label="Section name">
                      <input name="name" required maxLength={80} />
                    </Field>
                    <Field label="Academic year">
                      <select name="academicYearId" required>
                        {years.map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Grade level">
                      <select name="gradeLevelId" required>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="form-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setForm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        busy={busy}
                        disabled={!years.length || !grades.length}
                      >
                        Save section
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
              {selected && admin && (
                <Card>
                  <h2>Adviser and subjects</h2>
                  <Field label="Section adviser">
                    <select
                      value={
                        sections.find((s) => s.id === selected)?.adviserId ||
                        sections.find((s) => s.id === selected)?.teacherId ||
                        ""
                      }
                      disabled={busy}
                      onChange={(e) => {
                        setBusy(true);
                        void request("sectionAssign", {
                          sectionId: selected,
                          adviserId: e.target.value,
                        })
                          .then(load)
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      <option value="">Choose adviser</option>
                      {teachers
                        .filter((t) => t.status === "ACTIVE")
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.displayName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {subjects
                    .filter((s) => s.sectionId === selected)
                    .map((subject) => (
                      <form
                        key={subject.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          setBusy(true);
                          void request("subjectSet", {
                            subjectId: subject.id,
                            sectionId: selected,
                            teacherId: String(data.get("teacherId")),
                            name: String(data.get("name")),
                            startTime: String(data.get("startTime")),
                            endTime: String(data.get("endTime")),
                          })
                            .then(load)
                            .catch((e) => setError(e.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        <Field label="Subject">
                          <input
                            name="name"
                            defaultValue={subject.name}
                            required
                            maxLength={80}
                          />
                        </Field>
                        <Field label="Subject teacher">
                          <select
                            name="teacherId"
                            defaultValue={subject.teacherId}
                            required
                          >
                            {teachers
                              .filter((t) => t.status === "ACTIVE")
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.displayName}
                                </option>
                              ))}
                          </select>
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
                        <Button disabled={busy}>Save assignment</Button>
                      </form>
                    ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      setBusy(true);
                      void request("subjectSet", {
                        subjectId: crypto.randomUUID(),
                        sectionId: selected,
                        teacherId: String(data.get("teacherId")),
                        name: String(data.get("name")),
                        startTime: String(data.get("startTime")),
                        endTime: String(data.get("endTime")),
                      })
                        .then(load)
                        .then(() => setNotice("Subject assigned."))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <h3>Add subject</h3>
                    <Field label="Subject name">
                      <input name="name" required maxLength={80} />
                    </Field>
                    <Field label="Assigned teacher">
                      <select name="teacherId" required>
                        <option value="">Choose teacher</option>
                        {teachers
                          .filter((t) => t.status === "ACTIVE")
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.displayName}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Start">
                      <input name="startTime" type="time" required />
                    </Field>
                    <Field label="End">
                      <input name="endTime" type="time" required />
                    </Field>
                    <Button disabled={busy}>Add subject</Button>
                  </form>
                </Card>
              )}
              <div className="portal-roster-controls">
                <Field label="Teacher">
                  <select
                    value={teacherFilter}
                    onChange={(e) => filterTeacher(e.target.value)}
                  >
                    <option value="">All teachers</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName} · {t.username || t.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => setTab("attendance")}
                >
                  View attendance
                </Button>
                <Field label="Section">
                  <select
                    value={selected}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setForm(null);
                    }}
                    disabled={busy}
                  >
                    <option value="">Choose a section</option>
                    {sections
                      .filter(
                        (s) =>
                          !teacherFilter ||
                          (s.adviserId || s.teacherId) === teacherFilter ||
                          !!s.subjectTeacherIds?.includes(teacherFilter),
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {admin
                            ? ` · ${teachers.find((t) => t.id === s.teacherId)?.displayName || (s.teacherId === user.uid ? "Administrator" : "Teacher")}`
                            : ""}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Attendance date">
                  <input
                    type="date"
                    value={date}
                    max={overview.date}
                    disabled={busy}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                {selected && owner && !admin && (
                  <Button
                    variant="secondary"
                    disabled={busy || !!form}
                    onClick={() => setForm("student")}
                  >
                    <Plus size={17} />
                    Add student
                  </Button>
                )}
              </div>
              {form === "student" && (
                <Card>
                  <h2>Add a student</h2>
                  <form className="form-grid" onSubmit={createStudent}>
                    <Field label="Student number">
                      <input
                        name="studentNumber"
                        required
                        maxLength={40}
                        pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}"
                      />
                    </Field>
                    <Field label="First name">
                      <input name="firstName" required maxLength={120} />
                    </Field>
                    <Field label="Last name">
                      <input name="lastName" required maxLength={120} />
                    </Field>
                    <Field label="Parent or guardian name">
                      <input name="parentName" required maxLength={120} />
                    </Field>
                    <Field label="Parent mobile number">
                      <input
                        name="parentPhone"
                        type="tel"
                        placeholder="09XXXXXXXXX"
                        required
                        maxLength={30}
                      />
                    </Field>
                    <div className="portal-consents">
                      <label>
                        <input
                          type="checkbox"
                          name="parentPhoneVerified"
                          required
                        />{" "}
                        I verified that this number belongs to the parent.
                      </label>
                      <label>
                        <input type="checkbox" name="parentConsent" required />{" "}
                        The parent agreed to attendance text messages.
                      </label>
                    </div>
                    <div className="form-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setForm(null)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" busy={busy}>
                        Save student
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
              {selected ? (
                <Card className="portal-list">
                  <div className="card-heading">
                    <div>
                      <h2>{sections.find((s) => s.id === selected)?.name}</h2>
                      <p>
                        {students.length} students · {date}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      busy={busy}
                      onClick={() => void perform(loadRoster)}
                    >
                      Refresh
                    </Button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Parent contact</th>
                          <th>Attendance</th>
                          <th>Roll call</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr key={s.id}>
                            <td data-label="Student">
                              <strong>{s.displayName}</strong>
                              <br />
                              <small>{s.studentNumber}</small>
                            </td>
                            <td data-label="Parent contact">
                              {s.parentName}
                              <br />
                              <small>{s.parentPhone}</small>
                            </td>
                            <td data-label="Attendance">
                              <StatusBadge value={s.status} />
                              {s.source && (
                                <small className="portal-source">
                                  {s.source === "ANDROID"
                                    ? "Android app"
                                    : "Web dashboard"}
                                </small>
                              )}
                            </td>
                            <td data-label="Roll call">
                              <div className="row-actions">
                                <Button
                                  variant={
                                    s.status === "PRESENT"
                                      ? "secondary"
                                      : "primary"
                                  }
                                  disabled={
                                    !owner ||
                                    date !== overview.date ||
                                    busy ||
                                    !!form ||
                                    s.status === "PRESENT"
                                  }
                                  onClick={() => void mark(s.id, "PRESENT")}
                                >
                                  Present
                                </Button>
                                <Button
                                  variant={
                                    s.status === "ABSENT"
                                      ? "secondary"
                                      : "danger"
                                  }
                                  disabled={
                                    !owner ||
                                    date !== overview.date ||
                                    busy ||
                                    !!form ||
                                    s.status === "ABSENT"
                                  }
                                  onClick={() => void mark(s.id, "ABSENT")}
                                >
                                  Absent
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!students.length && (
                    <Empty
                      title="No students in this section"
                      description="The assigned teacher can add students and parent contacts."
                    />
                  )}
                  <p className="portal-footnote">
                    Web roll call saves attendance to Firebase. Parent texts
                    using prepaid SIM load are sent from the Android app. Roster
                    view is limited to 250 students per section.
                  </p>
                </Card>
              ) : (
                <Card>
                  <Empty
                    title={admin ? "No sections yet" : "Start with a section"}
                    description={
                      admin
                        ? "This teacher creates sections and student attendance records in the Android app. Their class data will appear here."
                        : "Create a section, then add students and their parent contacts."
                    }
                  />
                </Card>
              )}
            </>
          )}
          {tab === "attendance" && admin && (
            <>
              <PageHeader
                title="Attendance records"
                description="Review explicit Present and Absent records from the school workspace."
              />
              <Field label="Teacher">
                <select
                  value={teacherFilter}
                  onChange={(e) => filterTeacher(e.target.value)}
                >
                  <option value="">All teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} · {t.username || t.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="School date">
                <input
                  type="date"
                  value={date}
                  max={overview.date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Card className="portal-list">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Section</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Recorded time</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance
                        .filter(
                          (a) =>
                            !teacherFilter ||
                            sections.some(
                              (s) =>
                                s.id === a.sectionId &&
                                ((s.adviserId || s.teacherId) ===
                                  teacherFilter ||
                                  !!s.subjectTeacherIds?.includes(
                                    teacherFilter,
                                  )),
                            ),
                        )
                        .map((a) => (
                          <tr key={a.id}>
                            <td data-label="Student">
                              {a.studentName || a.studentId}
                            </td>
                            <td data-label="Section">
                              {sections.find((s) => s.id === a.sectionId)
                                ?.name || a.sectionId}
                            </td>
                            <td data-label="Subject">
                              {subjects.find((s) => s.id === a.subjectId)
                                ?.name || "Legacy section"}
                            </td>
                            <td data-label="Status">
                              <StatusBadge
                                value={a.attendanceTag || a.status}
                              />
                            </td>
                            <td data-label="Recorded time">
                              {a.localTimestamp
                                ? new Date(a.localTimestamp).toLocaleString(
                                    "en-PH",
                                    { timeZone: "Asia/Manila" },
                                  )
                                : "—"}
                            </td>
                            <td data-label="Source">
                              {a.source === "WEB"
                                ? "Web dashboard"
                                : "Android app"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!attendance.length && (
                  <Empty
                    title="No attendance for this date"
                    description="Records appear after teachers mark attendance."
                  />
                )}
                <p className="portal-footnote">
                  Up to 1,000 web records and 1,000 Android arrival records per
                  date. Web decisions take precedence in this dashboard; the
                  Android app keeps its local attendance evidence.
                </p>
              </Card>
            </>
          )}
          {tab === "devices" && admin && (
            <>
              <PageHeader
                title="Teacher phones"
                description="Approve registered Android phones for attendance and prepaid SIM texts."
              />
              <Card>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Phone</th>
                        <th>Teacher</th>
                        <th>Status</th>
                        <th>Access</th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.map((d) => (
                        <tr key={d.id}>
                          <td data-label="Phone">
                            {d.displayName}
                            <br />
                            <small>{d.id}</small>
                          </td>
                          <td data-label="Teacher">
                            {teachers.find((t) => t.id === d.assignedUserId)
                              ?.displayName || d.assignedUserId}
                          </td>
                          <td data-label="Status">
                            <StatusBadge value={d.status} />
                          </td>
                          <td data-label="Access">
                            <div className="row-actions">
                              <Button
                                disabled={busy}
                                onClick={() => void changeDevice(d, "APPROVED")}
                              >
                                {d.status === "APPROVED"
                                  ? "Renew approval"
                                  : "Approve"}
                              </Button>
                              <Button
                                variant="danger"
                                disabled={busy || d.status === "REVOKED"}
                                onClick={() => void changeDevice(d, "REVOKED")}
                              >
                                Revoke
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!devices.length && (
                  <Empty
                    title="No phones registered"
                    description={`Teachers sign in to the Android app and register their phone with school ID ${overview.school.id}.`}
                  />
                )}
              </Card>
            </>
          )}
        </main>
      </div>
      {navOpen && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
    </div>
  );
}
