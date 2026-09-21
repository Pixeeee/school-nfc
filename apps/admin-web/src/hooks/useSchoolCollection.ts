
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, type DocumentData, type QueryConstraint } from "firebase/firestore";
import { getFirebase } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

export function useSchoolCollection<T extends DocumentData>(name: string, orderField = "updatedAt", max = 100, extra: QueryConstraint[] = []) {
  const { schoolId } = useAuth();
  const [items, setItems] = useState<Array<T & { id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!schoolId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const q = query(collection(getFirebase().db, `schools/${schoolId}/${name}`), ...extra, orderBy(orderField, "desc"), limit(max));
    return onSnapshot(q, (snapshot) => { setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as T & { id: string }))); setLoading(false); setError(null); }, (e) => { setLoading(false); setError(e.message); });
  }, [schoolId, name, orderField, max, JSON.stringify(extra)]);
  return { items, loading, error };
}
