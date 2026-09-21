
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { collection, onSnapshot, query } from "firebase/firestore";
import { getFirebase } from "../firebase";

export interface SchoolMembership { schoolId: string; role: string; status: string; sectionIds: string[]; effectivePermissions?: string[]; }
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  memberships: SchoolMembership[];
  schoolId: string | null;
  setSchoolId: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { auth, db } = getFirebase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<SchoolMembership[]>([]);
  const [schoolId, setSchoolIdState] = useState<string | null>(() => localStorage.getItem("school-nfc.schoolId"));
  useEffect(() => onAuthStateChanged(auth, (next) => { setUser(next); setLoading(false); }), [auth]);
  useEffect(() => {
    if (!user) { setMemberships([]); return; }
    return onSnapshot(query(collection(db, `users/${user.uid}/schoolMemberships`)), (snapshot) => {
      const active = snapshot.docs.map((doc) => ({ schoolId: doc.id, ...doc.data() } as SchoolMembership)).filter((m) => m.status === "ACTIVE");
      setMemberships(active);
      if (!schoolId || !active.some((m) => m.schoolId === schoolId)) setSchoolIdState(active[0]?.schoolId ?? null);
    });
  }, [db, schoolId, user]);
  const setSchoolId = (id: string) => { localStorage.setItem("school-nfc.schoolId", id); setSchoolIdState(id); };
  const value = useMemo<AuthContextValue>(() => ({
    user, loading, memberships, schoolId, setSchoolId,
    login: async (email, password) => { await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password); },
    logout: async () => { await signOut(auth); localStorage.removeItem("school-nfc.schoolId"); },
  }), [auth, loading, memberships, schoolId, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("AuthProvider is missing."); return value; }
