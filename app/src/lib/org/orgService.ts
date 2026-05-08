"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Invite, OrgMember, Role } from "@/types";
import { DEFAULT_TAX_CATEGORIES } from "@/lib/tax/categories";

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createOrg(opts: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerName?: string | null;
  businessName: string;
}) {
  const db = getDb();
  const orgId = newId("org");

  // Phase 1: create the org doc and the owner member doc.
  // We keep these in a single batch so security rules can evaluate them
  // independently against pre-batch state — both are bootstrap-allowed.
  const phase1 = writeBatch(db);

  phase1.set(doc(db, "orgs", orgId), {
    name: opts.businessName,
    ownerUid: opts.ownerUid,
    createdAt: serverTimestamp(),
  });

  phase1.set(doc(db, "orgs", orgId, "members", opts.ownerUid), {
    uid: opts.ownerUid,
    role: "owner" satisfies Role,
    active: true,
    displayName: opts.ownerName ?? "",
    email: opts.ownerEmail ?? "",
    createdAt: serverTimestamp(),
  });

  // Update user's profile + org list. Self-write only.
  phase1.set(
    doc(db, "users", opts.ownerUid),
    {
      lastOrgId: orgId,
      displayName: opts.ownerName ?? "",
      email: opts.ownerEmail ?? "",
      orgs: [orgId],
    },
    { merge: true },
  );

  await phase1.commit();

  // Phase 2: now that the caller is an active owner of the new org,
  // seed settings + tax categories. These rules check `isOwner(orgId)`
  // which depends on the just-committed member doc.
  const phase2 = writeBatch(db);

  phase2.set(doc(db, "orgs", orgId, "settings", "global"), {
    businessName: opts.businessName,
    invoiceNumberPrefix: "INV-",
    invoiceNextNumber: 1001,
    estimateNumberPrefix: "EST-",
    estimateNextNumber: 1001,
    laborDefaultRateCents: 0,
    updatedAt: serverTimestamp(),
  });

  for (const cat of DEFAULT_TAX_CATEGORIES) {
    phase2.set(doc(db, "orgs", orgId, "taxCategories", cat.id), {
      label: cat.label,
      scheduleCLine: cat.scheduleCLine,
      defaultKind: cat.defaultKind,
      builtin: true,
    });
  }

  await phase2.commit();

  return orgId;
}

export async function listMyOrgs(uid: string): Promise<{ orgId: string; member: OrgMember; orgName?: string }[]> {
  const db = getDb();
  // Use collectionGroup-free approach: scan invites by email isn't applicable for owners.
  // Instead, we read users/{uid}.lastOrgId AND any orgs we know we belong to via the user profile's `orgs` array (kept up-to-date when joining).
  const userSnap = await getDoc(doc(db, "users", uid));
  const profile = userSnap.exists() ? (userSnap.data() as { orgs?: string[] }) : { orgs: [] };
  const orgIds = Array.isArray(profile.orgs) ? profile.orgs : [];
  const out: { orgId: string; member: OrgMember; orgName?: string }[] = [];
  for (const orgId of orgIds) {
    const memberSnap = await getDoc(doc(db, "orgs", orgId, "members", uid));
    if (!memberSnap.exists()) continue;
    const orgSnap = await getDoc(doc(db, "orgs", orgId));
    out.push({
      orgId,
      member: { uid, ...(memberSnap.data() as Omit<OrgMember, "uid">) },
      orgName: orgSnap.exists() ? (orgSnap.data() as { name?: string }).name : undefined,
    });
  }
  return out;
}

export async function ensureUserOrgList(uid: string, orgId: string) {
  const db = getDb();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as { orgs?: string[] }).orgs ?? [] : [];
  if (!existing.includes(orgId)) {
    await setDoc(ref, { orgs: [...existing, orgId] }, { merge: true });
  }
}

export async function inviteMember(opts: {
  orgId: string;
  email: string;
  role: Role;
  createdBy: string;
}): Promise<Invite> {
  const db = getDb();
  const id = newId("inv");
  const invite: Invite = {
    id,
    orgId: opts.orgId,
    email: opts.email.trim().toLowerCase(),
    role: opts.role,
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: opts.createdBy,
  };
  await setDoc(doc(db, "invites", id), invite);
  return invite;
}

export async function acceptInvite(opts: { inviteId: string; uid: string; email: string; displayName?: string }) {
  const db = getDb();
  const inviteRef = doc(db, "invites", opts.inviteId);
  const snap = await getDoc(inviteRef);
  if (!snap.exists()) throw new Error("Invite not found");
  const invite = snap.data() as Invite;
  if (invite.status !== "pending") throw new Error("Invite is no longer valid");
  if (invite.email.toLowerCase() !== opts.email.toLowerCase()) {
    throw new Error("Invite is for a different email address");
  }

  // Two-phase: create the member doc first (referencing the still-pending invite),
  // then mark the invite accepted. Each is allowed by its own rule independently.
  const memberRef = doc(db, "orgs", invite.orgId, "members", opts.uid);
  await setDoc(memberRef, {
    uid: opts.uid,
    role: invite.role,
    active: true,
    displayName: opts.displayName ?? "",
    email: opts.email,
    inviteId: invite.id,
    createdAt: serverTimestamp(),
  });
  await updateDoc(inviteRef, { status: "accepted", acceptedBy: opts.uid, acceptedAt: serverTimestamp() });

  await ensureUserOrgList(opts.uid, invite.orgId);
  await updateDoc(doc(db, "users", opts.uid), { lastOrgId: invite.orgId });
  return invite.orgId;
}

export async function findInvitesForEmail(email: string): Promise<Invite[]> {
  const db = getDb();
  const q = query(collection(db, "invites"), where("email", "==", email.toLowerCase()), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invite, "id">) }));
}

export async function setMemberRate(orgId: string, uid: string, hourlyRateCents: number) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "members", uid), { hourlyRateCents });
}

export async function setMemberActive(orgId: string, uid: string, active: boolean) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "members", uid), { active });
}

export async function setMemberRole(orgId: string, uid: string, role: Role) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "members", uid), { role });
}
