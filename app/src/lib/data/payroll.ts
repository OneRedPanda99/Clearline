"use client";

import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Job, OrgMember, Payrun, PayrunLine } from "@/types";

function newId() {
  return `pr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Aggregate minutes worked by uid in a date range from job.laborMinutesByUid +
// job.updatedAt fallback. Since we don't yet store per-day labor breakdowns,
// this attributes total job minutes to jobs whose `jobDate` falls in range.
export function aggregateHoursByUid(jobs: Job[], periodStart: string, periodEnd: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) {
    const date = j.jobDate || j.updatedAt?.slice(0, 10) || "";
    if (!date) continue;
    if (date < periodStart || date > periodEnd) continue;
    const map = j.laborMinutesByUid ?? {};
    for (const [uid, mins] of Object.entries(map)) {
      out[uid] = (out[uid] ?? 0) + (mins ?? 0);
    }
  }
  return out;
}

export function buildPayrunLines(opts: {
  members: OrgMember[];
  hoursByUidMin: Record<string, number>; // total minutes from jobs
  manualHoursByUid?: Record<string, number>; // additional hours typed in
  defaultRateCents?: number;
  otThresholdHours?: number; // default 40/week → flat 40
}): PayrunLine[] {
  const ot = opts.otThresholdHours ?? 40;
  return opts.members
    .filter((m) => m.role !== "owner") // owners don't pay themselves through payroll usually
    .map((m) => {
      const totalHours = (opts.hoursByUidMin[m.uid] ?? 0) / 60 + (opts.manualHoursByUid?.[m.uid] ?? 0);
      const reg = Math.min(totalHours, ot);
      const otH = Math.max(0, totalHours - ot);
      const rate = m.hourlyRateCents ?? opts.defaultRateCents ?? 0;
      const totalCents = Math.round(reg * rate + otH * rate * 1.5);
      return {
        uid: m.uid,
        displayName: m.displayName ?? m.email ?? m.uid,
        regularHours: round2(reg),
        otHours: round2(otH),
        rateCents: rate,
        totalCents,
      };
    });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function savePayrun(orgId: string, uid: string, payrun: Omit<Payrun, "id" | "createdAt" | "updatedAt">) {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const full: Payrun = {
    id,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    ...payrun,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "payruns"), id), full);
  return full;
}

export async function updatePayrun(orgId: string, id: string, patch: Partial<Payrun>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "payruns", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePayrun(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "payruns", id));
}
