"use client";

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Job, JobNote, JobPhoto, JobStatus } from "@/types";

function newId(prefix = "j") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createJob(orgId: string, uid: string, input: Partial<Job> & { customerId: string }) {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const job: Job = {
    id,
    customerId: input.customerId,
    customerName: input.customerName ?? "",
    title: input.title ?? "",
    status: (input.status as JobStatus) ?? "lead",
    jobDate: input.jobDate ?? "",
    jobTime: input.jobTime ?? "",
    followUpDate: input.followUpDate ?? "",
    address: input.address ?? "",
    assignedTo: input.assignedTo ?? [],
    laborMinutesByUid: input.laborMinutesByUid ?? {},
    notes: [],
    photos: [],
    serviceType: input.serviceType ?? "",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "jobs"), id), job);
  return job;
}

export async function updateJob(orgId: string, id: string, patch: Partial<Job>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "jobs", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function setJobStatus(orgId: string, id: string, status: JobStatus) {
  return updateJob(orgId, id, { status });
}

export async function deleteJob(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "jobs", id));
}

export async function addJobNote(orgId: string, jobId: string, note: Omit<JobNote, "id" | "createdAt">) {
  const db = getDb();
  const entry: JobNote = {
    id: newId("n"),
    createdAt: new Date().toISOString(),
    ...note,
  };
  await updateDoc(doc(db, "orgs", orgId, "jobs", jobId), {
    notes: arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
  return entry;
}

export async function addJobPhoto(orgId: string, jobId: string, photo: Omit<JobPhoto, "id" | "uploadedAt">) {
  const db = getDb();
  const entry: JobPhoto = {
    id: newId("p"),
    uploadedAt: new Date().toISOString(),
    ...photo,
  };
  await updateDoc(doc(db, "orgs", orgId, "jobs", jobId), {
    photos: arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
  return entry;
}

// Timer: start/stop. Stops accumulate minutes into laborMinutesByUid[uid].
export async function startJobTimer(orgId: string, jobId: string, uid: string) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "jobs", jobId), {
    timer: { startedAt: Date.now(), isRunning: true, uid },
    updatedAt: new Date().toISOString(),
  });
}

export async function stopJobTimer(orgId: string, jobId: string, current: Job, uid: string) {
  const db = getDb();
  const startedAt = current.timer?.startedAt ?? 0;
  const elapsedMs = startedAt ? Date.now() - startedAt : 0;
  const minutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  const prev = current.laborMinutesByUid?.[uid] ?? 0;
  await updateDoc(doc(db, "orgs", orgId, "jobs", jobId), {
    [`laborMinutesByUid.${uid}`]: prev + minutes,
    timer: { isRunning: false },
    updatedAt: new Date().toISOString(),
  });
  return { addedMinutes: minutes };
}
