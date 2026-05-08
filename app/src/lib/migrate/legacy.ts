"use client";

import { collection, doc, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Customer, Job } from "@/types";

export interface MigrationReport {
  orgId: string;
  customers: number;
  jobs: number;
  source: "firestore-legacy" | "localstorage";
  durationMs: number;
}

// Pulls every legacy top-level customers/* and jobs/* doc and writes them
// into orgs/{orgId}/customers/* and orgs/{orgId}/jobs/*.
export async function migrateLegacyFirestore(orgId: string, opts: {
  uid: string;
}): Promise<MigrationReport> {
  const db = getDb();
  const start = performance.now();

  const [customersSnap, jobsSnap] = await Promise.all([
    getDocs(collection(db, "customers")),
    getDocs(collection(db, "jobs")),
  ]);

  let migratedCustomers = 0;
  let migratedJobs = 0;

  // Firestore batches max 500 ops; chunk safely.
  const writeIn = async <T>(items: T[], handler: (batch: ReturnType<typeof writeBatch>, item: T) => void) => {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((it) => handler(batch, it));
      await batch.commit();
    }
  };

  await writeIn(customersSnap.docs, (batch, d) => {
    const data = d.data() as Partial<Customer>;
    const ref = doc(db, "orgs", orgId, "customers", d.id);
    batch.set(
      ref,
      {
        id: d.id,
        name: data.name ?? "Untitled customer",
        phone: data.phone ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        notes: data.notes ?? "",
        tags: data.tags ?? [],
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        createdBy: data.createdBy ?? opts.uid,
        legacyId: d.id,
      },
      { merge: true },
    );
    migratedCustomers++;
  });

  await writeIn(jobsSnap.docs, (batch, d) => {
    const data = d.data() as Partial<Job> & { quoteAmount?: string | number };
    const ref = doc(db, "orgs", orgId, "jobs", d.id);
    batch.set(
      ref,
      {
        id: d.id,
        customerId: data.customerId ?? "",
        customerName: data.customerName ?? "",
        title: data.title ?? "",
        status: data.status ?? "lead",
        jobDate: data.jobDate ?? "",
        jobTime: data.jobTime ?? "",
        followUpDate: data.followUpDate ?? "",
        address: data.address ?? "",
        assignedTo: Array.isArray(data.assignedTo) ? data.assignedTo : [],
        laborMinutesByUid: data.laborMinutesByUid ?? {},
        notes: Array.isArray(data.notes) ? data.notes : [],
        photos: Array.isArray(data.photos) ? data.photos : [],
        serviceType: data.serviceType ?? "",
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
        createdBy: data.createdBy ?? opts.uid,
        legacyId: d.id,
      },
      { merge: true },
    );
    migratedJobs++;
  });

  // Stamp org doc with a migration timestamp
  const batch = writeBatch(db);
  batch.set(
    doc(db, "orgs", orgId),
    { lastMigrationAt: serverTimestamp(), legacyImported: true },
    { merge: true },
  );
  await batch.commit();

  return {
    orgId,
    customers: migratedCustomers,
    jobs: migratedJobs,
    source: "firestore-legacy",
    durationMs: Math.round(performance.now() - start),
  };
}

// Imports legacy localStorage keys (cl-customers, cl-jobs) into the org.
export async function migrateLegacyLocalStorage(orgId: string, opts: { uid: string }): Promise<MigrationReport> {
  const db = getDb();
  const start = performance.now();
  const customers = readJson<Customer[]>("cl-customers") ?? [];
  const jobs = readJson<Job[]>("cl-jobs") ?? [];

  const writeIn = async <T extends { id: string }>(items: T[], col: "customers" | "jobs") => {
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((it) => {
        const ref = doc(db, "orgs", orgId, col, it.id);
        batch.set(
          ref,
          {
            ...it,
            createdBy: (it as { createdBy?: string }).createdBy ?? opts.uid,
            legacyId: it.id,
          },
          { merge: true },
        );
      });
      await batch.commit();
    }
  };

  await writeIn(customers, "customers");
  await writeIn(jobs, "jobs");

  return {
    orgId,
    customers: customers.length,
    jobs: jobs.length,
    source: "localstorage",
    durationMs: Math.round(performance.now() - start),
  };
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
