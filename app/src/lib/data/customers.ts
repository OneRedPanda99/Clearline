"use client";

import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { Customer } from "@/types";

function newId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCustomer(orgId: string, uid: string, input: Partial<Customer>): Promise<Customer> {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const customer: Customer = {
    id,
    name: (input.name ?? "").trim() || "Untitled customer",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    notes: input.notes ?? "",
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "customers"), id), customer);
  return customer;
}

export async function updateCustomer(orgId: string, id: string, patch: Partial<Customer>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "customers", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCustomer(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "customers", id));
}
