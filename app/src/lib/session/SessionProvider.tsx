"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { getDb, getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import type { OrgMember, Role, UserProfile } from "@/types";

type AuthStatus = "loading" | "anon" | "user" | "ready" | "error";

interface SessionState {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  orgId: string | null;
  member: OrgMember | null;
  role: Role | null;
  configured: boolean;
  error?: string;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => Promise<void>;
  setActiveOrg: (orgId: string) => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? "loading" : "anon");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [member, setMember] = useState<OrgMember | null>(null);
  const [error, setError] = useState<string | undefined>();

  const memberUnsubRef = useRef<(() => void) | null>(null);
  const profileUnsubRef = useRef<(() => void) | null>(null);

  // Auth state subscription
  useEffect(() => {
    if (!configured) return;
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(
      auth,
      (u) => {
        setUser(u);
        if (!u) {
          setStatus("anon");
          setProfile(null);
          setOrgId(null);
          setMember(null);
        } else {
          setStatus("user");
        }
      },
      (err) => {
        setError(err.message);
        setStatus("error");
      },
    );
    return () => unsub();
  }, [configured]);

  // Load user profile + lastOrgId
  useEffect(() => {
    profileUnsubRef.current?.();
    profileUnsubRef.current = null;
    if (!user) return;
    const db = getDb();
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        const seed: UserProfile = {
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? "",
        };
        try {
          await setDoc(ref, { ...seed, createdAt: serverTimestamp() }, { merge: true });
        } catch {
          // ignore — rules may block; we'll retry on next change
        }
        setProfile(seed);
      } else {
        setProfile({ uid: user.uid, ...(snap.data() as Omit<UserProfile, "uid">) });
        const last = (snap.data() as { lastOrgId?: string }).lastOrgId;
        if (last && last !== orgId) setOrgId(last);
      }
    });
    profileUnsubRef.current = unsub;
    return () => {
      unsub();
      profileUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Subscribe to org membership
  useEffect(() => {
    memberUnsubRef.current?.();
    memberUnsubRef.current = null;
    if (!user || !orgId) {
      setMember(null);
      return;
    }
    const db = getDb();
    const memberRef = doc(db, "orgs", orgId, "members", user.uid);
    const unsub = onSnapshot(
      memberRef,
      (snap) => {
        if (!snap.exists()) {
          setMember(null);
          setStatus("user");
          return;
        }
        const m = { uid: user.uid, ...(snap.data() as Omit<OrgMember, "uid">) };
        setMember(m);
        setStatus("ready");
      },
      (err) => {
        setError(err.message);
      },
    );
    memberUnsubRef.current = unsub;
    return () => {
      unsub();
      memberUnsubRef.current = null;
    };
  }, [user, orgId]);

  const setActiveOrg = useCallback(
    async (newOrgId: string) => {
      if (!user) return;
      setOrgId(newOrgId);
      try {
        const db = getDb();
        await updateDoc(doc(db, "users", user.uid), { lastOrgId: newOrgId });
      } catch {
        // ignore — profile listener will reconcile
      }
    },
    [user],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    if (!configured) return { ok: false, error: "Firebase not configured." };
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      return { ok: false, error: friendlyAuthError(e.code) || e.message || "Sign-in failed" };
    }
  }, [configured]);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      if (!configured) return { ok: false, error: "Firebase not configured." };
      try {
        const auth = getFirebaseAuth();
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName) {
          await updateProfile(cred.user, { displayName });
        }
        // seed users/{uid}
        const db = getDb();
        await setDoc(
          doc(db, "users", cred.user.uid),
          {
            email: cred.user.email,
            displayName: displayName || cred.user.displayName || "",
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        return { ok: true };
      } catch (err) {
        const e = err as { code?: string; message?: string };
        return { ok: false, error: friendlyAuthError(e.code) || e.message || "Sign-up failed" };
      }
    },
    [configured],
  );

  const signOut = useCallback(async () => {
    if (!configured) return;
    const auth = getFirebaseAuth();
    await fbSignOut(auth);
  }, [configured]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      profile,
      orgId,
      member,
      role: member?.role ?? null,
      configured,
      error,
      signIn,
      signUp,
      signOut,
      setActiveOrg,
    }),
    [status, user, profile, orgId, member, configured, error, signIn, signUp, signOut, setActiveOrg],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function friendlyAuthError(code?: string): string | undefined {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a minute.";
    default:
      return undefined;
  }
}

export async function fetchUserDoc(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as Omit<UserProfile, "uid">) };
}
