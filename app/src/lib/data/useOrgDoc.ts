"use client";

import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getDb } from "@/lib/firebase/client";
import { useSession } from "@/lib/session/SessionProvider";

export interface OrgDocResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useOrgDoc<T extends { id: string }>(subpath: string, id: string | undefined): OrgDocResult<T> {
  const { orgId } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !id) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    const db = getDb();
    const ref = doc(db, "orgs", orgId, ...subpath.split("/"), id);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setData(null);
        } else {
          setData({ id: snap.id, ...(snap.data() as DocumentData) } as T);
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orgId, subpath, id]);

  return { data, loading, error };
}
