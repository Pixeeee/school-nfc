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
  teacherId?: string;
  attendanceTag?: string;
  localTimestamp?: string;
}
type Tab = "overview" | "teachers" | "sections" | "attendance";
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
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherFilter, setTeacherFilter] = useState("");
  const [issued, setIssued] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyticsRefresh, setAnalyticsRefresh] = useState(0);
  const authEpoch = useRef(0);
  const profileRequest = useRef(0);
  const rosterRequest = useRef(0);
  const selection = useRef({ selected, date });
  selection.current = { selected, date };
  const admin = overview?.profile.role === "SCHOOL_ADMIN";
  useEffect(
    () =>
      onAuthStateChanged(getFirebase().auth, (next) => {
        authEpoch.current += 1;
        profileRequest.current += 1;
        rosterRequest.current += 1;
        setDate("");
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
    }>("sectionList");
    if (!current()) return;
    setSections(setup.sections);
    setSubjects(setup.subjects || []);
    setSelected((current) =>
      setup.sections.some((s) => s.id === current)
        ? current
        : setup.sections[0]?.id || "",
    );
    if (result.profile.role === "SCHOOL_ADMIN") {
      const staff = await request<{ teachers: Teacher[] }>("teacherList");
      if (!current()) return;
      setTeachers(staff.teachers);
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
    if (admin && (tab === "attendance" || tab === "sections") && date)
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
  }, [admin, tab, date, analyticsRefresh]);
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
    setSelected(
      sections.find(
        (s) =>
          !id ||
          (s.adviserId || s.teacherId) === id ||
          s.subjectTeacherIds?.includes(id),
      )?.id || "",
    );
  }
  const selectedSection = sections.find((s) => s.id === selected);
  const matchesTeacher = (a: Attendance) =>
    !teacherFilter ||
    sections.some(
      (s) =>
        s.id === a.sectionId &&
        ((s.adviserId || s.teacherId) === teacherFilter ||
          a.teacherId === teacherFilter ||
          subjects.some(
            (subject) =>
              subject.id === a.subjectId && subject.teacherId === teacherFilter,
          )),
    );
  const visibleAttendance = attendance.filter(matchesTeacher);
  const sectionAttendance = visibleAttendance.filter(
    (a) => a.sectionId === selected,
  );
  const sectionSubjects = subjects.filter(
    (subject) =>
      subject.sectionId === selected &&
      (!teacherFilter ||
        (selectedSection?.adviserId || selectedSection?.teacherId) ===
          teacherFilter ||
        subject.teacherId === teacherFilter),
  );
  const summaryRecords = sectionAttendance.filter(
    (a) =>
      students.some((student) => student.id === a.studentId) &&
      (sectionSubjects.length
        ? sectionSubjects.some((subject) => subject.id === a.subjectId)
        : !a.subjectId),
  );
  const attendanceStatus = (a: Attendance) => a.attendanceTag || a.status;
  const dailyCounts = {
    "On time": summaryRecords.filter((a) => attendanceStatus(a) === "ON_TIME")
      .length,
    Late: summaryRecords.filter((a) => attendanceStatus(a) === "LATE").length,
    Absent: summaryRecords.filter((a) => attendanceStatus(a) === "ABSENT")
      .length,
    Unmarked: Math.max(
      0,
      students.length * Math.max(sectionSubjects.length, 1) -
        summaryRecords.length,
    ),
  };
  const presentWithoutTimeTag = summaryRecords.filter(
    (a) => attendanceStatus(a) === "PRESENT",
  ).length;
  const displayedCounts = presentWithoutTimeTag
    ? { ...dailyCounts, Present: presentWithoutTimeTag }
    : dailyCounts;
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
                                sections.filter(
                                  (s) =>
                                    (s.adviserId || s.teacherId) === t.id ||
                                    s.subjectTeacherIds?.includes(t.id),
                                ).length
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
                title="Sections & students"
                description="View each teacher’s class data and attendance analytics. Teachers manage their classes in the Android app."
              />
              <div className="portal-roster-controls">
                <Field label="Teacher">
                  <select
                    value={teacherFilter}
                    disabled={busy}
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
                    disabled={busy}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Choose a section</option>
                    {sections
                      .filter(
                        (s) =>
                          !teacherFilter ||
                          (s.adviserId || s.teacherId) === teacherFilter ||
                          s.subjectTeacherIds?.includes(teacherFilter),
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
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
              </div>
              {selected ? (
                <>
                  <Card aria-label="Attendance analytics">
                    <div className="card-heading">
                      <div>
                        <h2>{selectedSection?.name} · Attendance analytics</h2>
                        <p>
                          {date} · {students.length} students ·{" "}
                          {sectionSubjects.length || 1}{" "}
                          {sectionSubjects.length
                            ? "subjects"
                            : "section session"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        busy={busy}
                        onClick={() =>
                          void perform(async () => {
                            await loadRoster();
                            setAnalyticsRefresh((value) => value + 1);
                          })
                        }
                      >
                        Refresh
                      </Button>
                    </div>
                    <div className="metric-grid">
                      {Object.entries(displayedCounts).map(([label, value]) => (
                        <div className="metric" key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <p className="portal-footnote">
                      Counts reflect daily student-subject attendance for the
                      displayed roster. Unmarked is not Absent.
                    </p>
                  </Card>
                  <Card className="portal-list">
                    <h2>Student list</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Parent contact</th>
                            <th>Latest mark</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student) => (
                            <tr key={student.id}>
                              <td data-label="Student">
                                <strong>{student.displayName}</strong>
                                <br />
                                <small>{student.studentNumber}</small>
                              </td>
                              <td data-label="Parent contact">
                                {student.parentName}
                                <br />
                                <small>{student.parentPhone}</small>
                              </td>
                              <td data-label="Latest mark">
                                <StatusBadge value={student.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!students.length && (
                      <Empty
                        title="No students in this section"
                        description="The teacher adds students and parent contacts in the Android app."
                      />
                    )}
                    <p className="portal-footnote">
                      View only. Teachers manage sections, students and parent
                      texts in the Android app.
                    </p>
                  </Card>
                  <Card className="portal-list">
                    <h2>Subject attendance</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Student</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Recorded time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectionAttendance.map((record) => (
                            <tr key={record.id}>
                              <td data-label="Student">
                                {record.studentName ||
                                  students.find(
                                    (student) =>
                                      student.id === record.studentId,
                                  )?.displayName ||
                                  record.studentId}
                              </td>
                              <td data-label="Subject">
                                {subjects.find(
                                  (subject) => subject.id === record.subjectId,
                                )?.name || "Section attendance"}
                              </td>
                              <td data-label="Status">
                                <StatusBadge value={attendanceStatus(record)} />
                              </td>
                              <td data-label="Recorded time">
                                {record.localTimestamp
                                  ? new Date(
                                      record.localTimestamp,
                                    ).toLocaleString("en-PH", {
                                      timeZone: "Asia/Manila",
                                    })
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!sectionAttendance.length && (
                      <Empty
                        title="No attendance recorded for this date"
                        description="Records appear after teachers mark attendance in the app."
                      />
                    )}
                  </Card>
                </>
              ) : (
                <Card>
                  <Empty
                    title="No sections yet"
                    description="Teacher-created sections and attendance analytics will appear here."
                  />
                </Card>
              )}
            </>
          )}
          {tab === "attendance" && admin && (
            <>
              <PageHeader
                title="Attendance records"
                description="View On time, Late and Absent records submitted by teachers."
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
                      {visibleAttendance.map((a) => (
                        <tr key={a.id}>
                          <td data-label="Student">
                            {a.studentName || a.studentId}
                          </td>
                          <td data-label="Section">
                            {sections.find((s) => s.id === a.sectionId)?.name ||
                              a.sectionId}
                          </td>
                          <td data-label="Subject">
                            {subjects.find((s) => s.id === a.subjectId)?.name ||
                              "Legacy section"}
                          </td>
                          <td data-label="Status">
                            <StatusBadge value={a.attendanceTag || a.status} />
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
                {!visibleAttendance.length && (
                  <Empty
                    title="No attendance for this date"
                    description="Records appear after teachers mark attendance."
                  />
                )}
                <p className="portal-footnote">
                  View only. Attendance is recorded by teachers in the Android
                  app.
                </p>
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
