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
  gradeLevelId: string;
  academicYearId: string;
}
interface Choice {
  id: string;
  name: string;
}
interface Teacher {
  id: string;
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
  const [years, setYears] = useState<Choice[]>([]);
  const [grades, setGrades] = useState<Choice[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
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
    sections.find((s) => s.id === selected)?.teacherId === user?.uid;
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
    setOverview(result);
    setDate((current) => current || result.date);
    const setup = await request<{
      sections: Section[];
      years: Choice[];
      grades: Choice[];
    }>("sectionList");
    if (!current()) return;
    setSections(setup.sections);
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
    await perform(async () => {
      await request("teacherCreate", values);
      element.reset();
      await load();
      setNotice(
        "Teacher account created. Share the email and password privately with the teacher.",
      );
    });
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
            Manage teachers, organize sections, and record student attendance in
            one school workspace.
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
              <p>Sign in with your username or teacher email.</p>
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
    { id: "devices" as Tab, label: "Teacher phones", icon: Smartphone },
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
                      ? "Create teacher accounts and approve the phones used for prepaid SIM attendance texts."
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
                      onClick={() => setTab(admin ? "devices" : "sections")}
                    >
                      {admin ? "Teacher phones" : "My sections"}
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
                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field label="Initial password">
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                    />
                  </Field>
                  <div className="form-actions">
                    <Button type="submit" busy={busy}>
                      Create teacher account
                    </Button>
                  </div>
                </form>
              </Card>
              <Card className="portal-list">
                <h2>
                  Teachers <span className="muted">({teachers.length})</span>
                </h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((t) => (
                        <tr key={t.id}>
                          <td data-label="Name">{t.displayName || t.email}</td>
                          <td data-label="Email">{t.email}</td>
                          <td data-label="Status">
                            <StatusBadge value={t.status} />
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
                  <Button
                    disabled={busy || !!form}
                    onClick={() => setForm("section")}
                  >
                    <Plus size={17} />
                    Create section
                  </Button>
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
              <div className="portal-roster-controls">
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
                    {sections.map((s) => (
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
                {selected && owner && (
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
                    title="Start with a section"
                    description="Create a section, then add students and their parent contacts."
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
                        <th>Status</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a) => (
                        <tr key={a.id}>
                          <td data-label="Student">
                            {a.studentName || a.studentId}
                          </td>
                          <td data-label="Section">
                            {sections.find((s) => s.id === a.sectionId)?.name ||
                              a.sectionId}
                          </td>
                          <td data-label="Status">
                            <StatusBadge value={a.status} />
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
