"use client";

import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  runTransaction,
} from "firebase/firestore";

import { getDb } from "@/lib/firebase/client";
import type { DocLine, DocTotals, Estimate, Invoice, PaymentEvent, OrgSettings } from "@/types";

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeTotals(lines: DocLine[], discountCents = 0, taxRate = 0): DocTotals {
  const subtotalCents = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceCents), 0);
  const taxableCents = lines
    .filter((l) => l.taxable)
    .reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceCents), 0);
  const taxCents = Math.round(taxableCents * taxRate);
  const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);
  return { subtotalCents, taxCents, discountCents, totalCents };
}

async function nextNumber(
  orgId: string,
  field: "invoiceNextNumber" | "estimateNextNumber",
  prefixField: "invoiceNumberPrefix" | "estimateNumberPrefix",
): Promise<string> {
  const db = getDb();
  const ref = doc(db, "orgs", orgId, "settings", "global");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists() ? snap.data() : {}) as OrgSettings & Record<string, number | string>;
    const current = (data[field] as number) ?? 1001;
    const prefix = (data[prefixField] as string) ?? (field === "invoiceNextNumber" ? "INV-" : "EST-");
    tx.set(ref, { [field]: current + 1 }, { merge: true });
    return `${prefix}${current}`;
  });
}

export async function createInvoice(
  orgId: string,
  uid: string,
  input: { customerId: string; jobId?: string; lines?: DocLine[]; notes?: string; dueDate?: string },
): Promise<Invoice> {
  const db = getDb();
  const id = newId("inv");
  const number = await nextNumber(orgId, "invoiceNextNumber", "invoiceNumberPrefix");
  const now = new Date().toISOString();
  const lines = input.lines ?? [];
  const invoice: Invoice = {
    id,
    number,
    customerId: input.customerId,
    jobId: input.jobId ?? "",
    lines,
    totals: computeTotals(lines),
    status: "draft",
    paymentStatus: "unpaid",
    payments: [],
    paidAmountCents: 0,
    dueDate: input.dueDate ?? "",
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "invoices"), id), invoice);
  return invoice;
}

export async function updateInvoice(orgId: string, id: string, patch: Partial<Invoice>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "invoices", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function recordPayment(orgId: string, invoiceId: string, payment: Omit<PaymentEvent, "id">) {
  const db = getDb();
  const ref = doc(db, "orgs", orgId, "invoices", invoiceId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Invoice not found");
    const inv = snap.data() as Invoice;
    const event: PaymentEvent = { id: newId("pay"), ...payment };
    const payments = [...(inv.payments ?? []), event];
    const paid = payments.reduce((s, p) => s + p.amountCents, 0);
    const status: Invoice["paymentStatus"] =
      paid <= 0 ? "unpaid" : paid >= inv.totals.totalCents ? "paid" : "partial";
    tx.update(ref, {
      payments,
      paidAmountCents: paid,
      paymentStatus: status,
      updatedAt: new Date().toISOString(),
    });
    return { event, paid, status };
  });
}

export async function deleteInvoice(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "invoices", id));
}

// Estimates
export async function createEstimate(
  orgId: string,
  uid: string,
  input: { customerId: string; jobId?: string; lines?: DocLine[]; notes?: string },
): Promise<Estimate> {
  const db = getDb();
  const id = newId("est");
  const number = await nextNumber(orgId, "estimateNextNumber", "estimateNumberPrefix");
  const now = new Date().toISOString();
  const lines = input.lines ?? [];
  const estimate: Estimate = {
    id,
    number,
    customerId: input.customerId,
    jobId: input.jobId ?? "",
    lines,
    totals: computeTotals(lines),
    status: "draft",
    notes: input.notes ?? "",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  };
  await setDoc(doc(collection(db, "orgs", orgId, "estimates"), id), estimate);
  return estimate;
}

export async function updateEstimate(orgId: string, id: string, patch: Partial<Estimate>) {
  const db = getDb();
  await updateDoc(doc(db, "orgs", orgId, "estimates", id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteEstimate(orgId: string, id: string) {
  const db = getDb();
  await deleteDoc(doc(db, "orgs", orgId, "estimates", id));
}

// Convert an estimate to an invoice (carry over lines).
export async function convertEstimateToInvoice(orgId: string, uid: string, estimateId: string) {
  const db = getDb();
  const snap = await getDoc(doc(db, "orgs", orgId, "estimates", estimateId));
  if (!snap.exists()) throw new Error("Estimate not found");
  const est = snap.data() as Estimate;
  return createInvoice(orgId, uid, {
    customerId: est.customerId,
    jobId: est.jobId,
    lines: est.lines,
    notes: est.notes,
  });
}
