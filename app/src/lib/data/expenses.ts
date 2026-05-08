"use client";

import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Expense } from "@/types";

function newId() {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createExpense(orgId: string, uid: string, input: Partial<Expense>): Promise<Expense> {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const expense: Expense = {
    id,
    date: input.date ?? now.slice(0, 10),
    amountCents: input.amountCents ?? 0,
    vendor: input.vendor ?? "",
    description: input.description ?? "",
    taxCategoryId: input.taxCategoryId ?? "other",
    jobId: input.jobId ?? "",
    payeeUid: input.payeeUid ?? "",
    kind: input.kind ?? "overhead",
    receiptStoragePath: input.receiptStoragePath ?? "",
    receiptUrl: input.receiptUrl ?? "",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "expenses"), id), expense);
  return expense;
}

export async function updateExpense(orgId: string, id: string, patch: Partial<Expense>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "expenses", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteExpense(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "expenses", id));
}
