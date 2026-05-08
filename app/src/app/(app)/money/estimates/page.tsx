"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer, DocLine, Estimate, Job } from "@/types";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { LineEditor } from "@/components/forms/LineEditor";
import { convertEstimateToInvoice, createEstimate, deleteEstimate } from "@/lib/data/invoices";
import { Empty } from "@/components/ui/Empty";

export default function EstimatesPage() {
  const router = useRouter();
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: estimates, loading } = useOrgCollection<Estimate>("estimates", constraints);
  const { data: customers } = useOrgCollection<Customer>("customers", constraints);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);

  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<{ customerId?: string; jobId?: string; lines: DocLine[]; notes?: string }>(
    { lines: [{ id: "l1", description: "", quantity: 1, unitPriceCents: 0, taxable: false }] },
  );
  const [busy, setBusy] = useState(false);

  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user || !draft.customerId) return;
    setBusy(true);
    try {
      await createEstimate(orgId, user.uid, {
        customerId: draft.customerId,
        jobId: draft.jobId,
        lines: draft.lines,
        notes: draft.notes,
      });
      setDrawer(false);
      setDraft({ lines: [{ id: "l1", description: "", quantity: 1, unitPriceCents: 0, taxable: false }] });
      toast.success("Estimate created");
    } finally {
      setBusy(false);
    }
  }

  async function onConvert(estimateId: string) {
    if (!orgId || !user) return;
    setBusy(true);
    try {
      const inv = await convertEstimateToInvoice(orgId, user.uid, estimateId);
      toast.success("Converted to invoice");
      router.push(`/money/invoices/${inv.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Estimates</h1>
        <button onClick={() => setDrawer(true)} className="btn-primary">+ New estimate</button>
      </div>

      {loading && <div className="card p-6 text-center text-sm text-text-dim">Loading…</div>}
      {!loading && estimates.length === 0 && <Empty title="No estimates yet" hint="Quote a customer and convert to invoice when accepted." />}

      {!loading && estimates.length > 0 && (
        <div className="card divide-y divide-line">
          {estimates.map((e) => {
            const c = customers.find((cc) => cc.id === e.customerId);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{e.number} · {c?.name ?? "—"}</p>
                  <p className="truncate text-xs text-text-faint">{formatDate(e.createdAt)} · {e.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatMoney(e.totals.totalCents)}</p>
                  <div className="mt-1 flex gap-1">
                    <button onClick={() => onConvert(e.id)} disabled={busy} className="btn-outline text-xs">→ Invoice</button>
                    <button onClick={async () => orgId && (await deleteEstimate(orgId, e.id))} className="btn-danger text-xs">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="New estimate" width="lg">
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Customer</label>
              <select className="input" required value={draft.customerId ?? ""} onChange={(ev) => setDraft({ ...draft, customerId: ev.target.value })}>
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Link to job (optional)</label>
              <select className="input" value={draft.jobId ?? ""} onChange={(ev) => setDraft({ ...draft, jobId: ev.target.value })}>
                <option value="">—</option>
                {jobs.filter((j) => !draft.customerId || j.customerId === draft.customerId).map((j) => (
                  <option key={j.id} value={j.id}>{j.title || j.serviceType || j.id}</option>
                ))}
              </select>
            </div>
          </div>

          <LineEditor lines={draft.lines} onChange={(lines) => setDraft({ ...draft, lines })} />

          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px]" value={draft.notes ?? ""} onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })} />
          </div>

          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy || !draft.customerId}>{busy ? "Creating…" : "Create estimate"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
