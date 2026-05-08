"use client";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { getDb } from "@/lib/firebase/client";
import { useSession } from "@/lib/session/SessionProvider";

export interface OrgCollectionResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  fromCache: boolean;
}

// Subscribes to an org-scoped subcollection. Snapshots are diffed only when
// docs actually change — we expose `data` as a stable array reference unless
// the result set differs from the previous render.
export function useOrgCollection<T extends { id: string }>(
  subpath: string,
  constraints: QueryConstraint[] = [],
): OrgCollectionResult<T> {
  const { orgId } = useSession();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const prevSig = useRef<string>("");

  // Stable key — callers should memoize `constraints`. We only re-subscribe
  // when org/path or the count of constraints changes; constraints[i] identity
  // is assumed stable. (Use a wrapper hook if you need more nuance.)
  const constraintsRef = useRef(constraints);
  constraintsRef.current = constraints;
  const subKey = `${orgId ?? ""}:${subpath}:${constraints.length}`;

  useEffect(() => {
    if (!orgId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const db = getDb();
    const ref = collection(db, "orgs", orgId, ...subpath.split("/"));
    const cs = constraintsRef.current;
    const q = cs.length ? query(ref, ...cs) : query(ref);
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) })) as T[];
        const sig = rows
          .map((r) => `${r.id}:${(r as { updatedAt?: string }).updatedAt ?? ""}`)
          .join("|");
        if (sig !== prevSig.current) {
          prevSig.current = sig;
          setData(rows);
        }
        setFromCache(snap.metadata.fromCache);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [subKey, orgId, subpath]);

  return { data, loading, error, fromCache };
}

export const orderByUpdated = orderBy("updatedAt", "desc");
