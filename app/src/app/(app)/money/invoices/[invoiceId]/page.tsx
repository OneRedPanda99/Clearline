"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgDoc } from "@/lib/data/useOrgDoc";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer, Invoice } from "@/types";
import { formatDate, formatMoney, parseMoneyInput, ymd } from "@/lib/utils/format";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useToast } from "@/components/ui/Toast";
import { deleteInvoice, recordPayment, updateInvoice } from "@/lib/data/invoices";

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const { orgId, user, role } = useSession();
  const toast = useToast();

  const { data: invoice, loading } = useOrgDoc<Invoice>("invoices", invoiceId);
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: customers } = useOrgCollection<Customer>("customers", constraints);
  const customer = customers.find((c) => c.id === invoice?.customerId);

  const [paymentAmt, setPaymentAmt] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "check" | "card" | "transfer" | "other">("transfer");
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen label="Loading invoice" />;
  if (!invoice) return <div className="card p-6">Invoice not found.</div>;
  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;

  const remaining = (invoice.totals.totalCents || 0) - (invoice.paidAmountCents || 0);

  async function onMarkSent() {
    if (!orgId) return;
    setBusy(true);
    try {
      await updateInvoice(orgId, invoice!.id, { status: "sent", issuedAt: new Date().toISOString() });
      toast.success("Marked as sent");
    } finally {
      setBusy(false);
    }
  }

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user) return;
    const amount = parseMoneyInput(paymentAmt);
    if (amount <= 0) return;
    setBusy(true);
    try {
      await recordPayment(orgId, invoice!.id, {
        amountCents: amount,
        method: paymentMethod,
        receivedAt: new Date().toISOString(),
        recordedBy: user.uid,
      });
      setPaymentAmt("");
      toast.success("Payment recorded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!orgId) return;
    if (!confirm(`Delete invoice ${invoice!.number}?`)) return;
    await deleteInvoice(orgId, invoice!.id);
    router.replace("/money/revenue");
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-text-faint">Invoice</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{invoice.number}</h1>
            <p className="mt-1 text-sm text-text-dim">
              {customer ? <Link href={`/customers/${customer.id}`} className="text-brand-accent hover:underline">{customer.name}</Link> : "—"}
              {invoice.dueDate ? ` · due ${formatDate(invoice.dueDate)}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{formatMoney(invoice.totals.totalCents)}</p>
            <p className={`mt-1 inline-block ${invoice.paymentStatus === "paid" ? "pill-good" : invoice.paymentStatus === "partial" ? "pill-warn" : "pill-bad"}`}>{invoice.paymentStatus}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {invoice.status === "draft" && (
            <button onClick={onMarkSent} disabled={busy} className="btn-primary">Mark as sent</button>
          )}
          <button onClick={onDelete} className="btn-danger">Delete</button>
        </div>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Lines</p>
        <div className="divide-y divide-line">
          {invoice.lines.map((l) => (
            <div key={l.id} className="grid grid-cols-12 gap-2 py-2 text-sm">
              <p className="col-span-7">{l.description || <span className="text-text-faint">—</span>}</p>
              <p className="col-span-2 text-right text-text-dim">×{l.quantity}</p>
              <p className="col-span-3 text-right font-semibold">{formatMoney(Math.round(l.quantity * l.unitPriceCents))}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
          <p className="text-text-dim">Subtotal</p>
          <p className="text-right">{formatMoney(invoice.totals.subtotalCents)}</p>
          <p className="text-text-dim">Tax</p>
          <p className="text-right">{formatMoney(invoice.totals.taxCents)}</p>
          <p className="text-text-dim">Discount</p>
          <p className="text-right">−{formatMoney(invoice.totals.discountCents)}</p>
          <p className="text-base font-bold">Total</p>
          <p className="text-right text-base font-bold">{formatMoney(invoice.totals.totalCents)}</p>
        </div>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Payments</p>
        {(invoice.payments ?? []).length === 0 ? (
          <p className="text-sm text-text-faint">No payments yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {invoice.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                <p>{formatDate(p.receivedAt)} · {p.method}</p>
                <p className="font-semibold text-good">{formatMoney(p.amountCents)}</p>
              </div>
            ))}
          </div>
        )}
        {remaining > 0 && (
          <form onSubmit={onRecordPayment} className="mt-3 grid grid-cols-12 gap-2">
            <input
              className="input col-span-5"
              inputMode="decimal"
              value={paymentAmt}
              onChange={(e) => setPaymentAmt(e.target.value)}
              placeholder={(remaining / 100).toFixed(2)}
            />
            <select className="input col-span-4" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              <option value="transfer">Transfer</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
            <button type="submit" className="btn-primary col-span-3" disabled={busy}>Record</button>
          </form>
        )}
        <p className="mt-2 text-xs text-text-faint">Remaining balance: {formatMoney(remaining)}</p>
      </div>

      <p className="text-xs text-text-faint">Created {formatDate(invoice.createdAt)} · #{invoice.id} · paid {formatDate(ymd())}</p>
    </div>
  );
}
