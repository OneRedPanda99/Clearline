"use client";

import { doc, setDoc } from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { OrgSettings, TaxCategory } from "@/types";

export async function updateOrgSettings(orgId: string, patch: Partial<OrgSettings>) {
  const db = getDb();
  await setDoc(
    doc(db, "orgs", orgId, "settings", "global"),
    { ...patch, updatedAt: new Date().toISOString() },
    { merge: true },
  );
}

export async function upsertTaxCategory(orgId: string, cat: TaxCategory) {
  const db = getDb();
  await setDoc(doc(db, "orgs", orgId, "taxCategories", cat.id), cat, { merge: true });
}

export async function archiveTaxCategory(orgId: string, id: string, archived: boolean) {
  const db = getDb();
  await setDoc(doc(db, "orgs", orgId, "taxCategories", id), { archived }, { merge: true });
}
