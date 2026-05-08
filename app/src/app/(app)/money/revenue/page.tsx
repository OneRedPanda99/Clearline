"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer, DocLine, Invoice, Job } from "@/types";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { LineEditor } from "@/components/forms/LineEditor";
import { createInvoice } from "@/lib/data/invoices";
import { Empty } from "@/components/ui/Empty";

export default function RevenuePage() {
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: invoices, loading } = useOrgCollection<Invoice>("invoices", constraints);
  const { data: customers } = useOrgCollection<Customer>("customers", constraints);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);

  const [tab, setTab] = useState<"all" | "unpaid" | "paid" | "draft">("unpaid");
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<{ customerId?: string; jobId?: string; lines: DocLine[]; notes?: string; dueDate?: string }>(
    { lines: [{ id: "l1", description: "", quantity: 1, unitPriceCents: 0, taxable: false }] },
  );
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    if (tab === "all") return invoices;
    if (tab === "draft") return invoices.filter((i) => i.status === "draft");
    if (tab === "paid") return invoices.filter((i) => i.paymentStatus === "paid");
    return invoices.filter((i) => i.status !== "draft" && i.paymentStatus !== "paid");
  }, [invoices, tab]);

  const totalUnpaid = useMemo(
    () =>
      invoices
        .filter((i) => i.paymentStatus !== "paid" && i.status !== "draft")
        .reduce((s, i) => s + ((i.totals.totalCents || 0) - (i.paidAmountCents || 0)), 0),
    [invoices],
  );

  if (role === "worker") {
    return <div className="card p-6 text-sm">You don't have access to Money.</div>;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user || !draft.customerId) return;
    setBusy(true);
    try {
      await createInvoice(orgId, user.uid, {
        customerId: draft.customerId,
        jobId: draft.jobId,
        lines: draft.lines.filter((l) => l.description || l.unitPriceCents > 0),
        notes: draft.notes,
        dueDate: draft.dueDate,
      });
      toast.success("Invoice created");
      setDraft({ lines: [{ id: "l1", description: "", quantity: 1, unitPriceCents: 0, taxable: false }] });
      setDrawer(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Revenue</h1>
          <p className="text-sm text-text-dim">Outstanding {formatMoney(totalUnpaid)}</p>
        </div>
        <button onClick={() => setDrawer(true)} className="btn-primary">+ New invoice</button>
      </div>

      <div className="card p-1">
        <div className="flex gap-1">
          {(["unpaid", "paid", "draft", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
                tab === t ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="card p-6 text-center text-sm text-text-dim">Loading…</div>}
      {!loading && filtered.length === 0 && <Empty title="No invoices here" hint="Create an invoice to get paid." />}

      {!loading && filtered.length > 0 && (
        <div className="card divide-y divide-line">
          {filtered.map((i) => {
            const c = customers.find((c) => c.id === i.customerId);
            const remaining = (i.totals.totalCents || 0) - (i.paidAmountCents || 0);
            const tone = i.paymentStatus === "paid" ? "good" : i.paymentStatus === "partial" ? "warn" : "bad";
            return (
              <Link key={i.id} href={`/money/invoices/${i.id}`} className="grid grid-cols-12 items-center gap-2 px-4 py-3 transition hover:bg-surface-hover">
                <div className="col-span-6 min-w-0">
                  <p className="truncate text-sm font-semibold">{i.number} · {c?.name ?? "—"}</p>
                  <p className="truncate text-xs text-text-faint">{formatDate(i.createdAt)}{i.dueDate ? ` · due ${formatDate(i.dueDate)}` : ""}</p>
                </div>
                <div className="col-span-3 text-right text-sm font-semibold">{formatMoney(i.totals.totalCents)}</div>
                <div className="col-span-3 text-right">
                  <span className={`pill-${tone === "good" ? "good" : tone === "warn" ? "warn" : "bad"}`}>
                    {i.paymentStatus} {remaining > 0 ? `· ${formatMoney(remaining)}` : ""}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="New invoice" width="lg">
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Customer</label>
              <select className="input" required value={draft.customerId ?? ""} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}>
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Link to job (optional)</label>
              <select className="input" value={draft.jobId ?? ""} onChange={(e) => setDraft({ ...draft, jobId: e.target.value })}>
                <option value="">—</option>
                {jobs.filter((j) => !draft.customerId || j.customerId === draft.customerId).map((j) => (
                  <option key={j.id} value={j.id}>{j.title || j.serviceType || j.id}</option>
                ))}
              </select>
            </div>
          </div>

          <LineEditor lines={draft.lines} onChange={(lines) => setDraft({ ...draft, lines })} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input" value={draft.dueDate ?? ""} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px]" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy || !draft.customerId}>{busy ? "Creating…" : "Create invoice"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
