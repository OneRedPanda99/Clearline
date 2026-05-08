"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgDoc } from "@/lib/data/useOrgDoc";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";

import type { Customer, Expense, Invoice, Job, OrgMember, OrgSettings } from "@/types";
import { computeJobProfit } from "@/lib/money/profit";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { deleteCustomer, updateCustomer } from "@/lib/data/customers";

export default function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const router = useRouter();
  const { orgId, role } = useSession();
  const toast = useToast();
  const { data: customer, loading } = useOrgDoc<Customer>("customers", customerId);
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);
  const { data: invoices } = useOrgCollection<Invoice>("invoices", constraints);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraints);
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");

  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Partial<Customer>>({});
  const [busy, setBusy] = useState(false);

  if (loading) return <LoadingScreen label="Loading customer" />;
  if (!customer) return <div className="card p-6">Customer not found.</div>;

  const customerJobs = jobs.filter((j) => j.customerId === customer.id);
  const customerInvoices = invoices.filter((i) => i.customerId === customer.id);
  const totalRevenue = customerInvoices.reduce((s, i) => s + (i.paidAmountCents || 0), 0);
  const outstanding = customerInvoices.reduce(
    (s, i) => s + Math.max(0, (i.totals.totalCents || 0) - (i.paidAmountCents || 0)),
    0,
  );

  const profitTotal = customerJobs.reduce((s, j) => {
    const p = computeJobProfit({ job: j, invoices, expenses, members, defaultRateCents: settings?.laborDefaultRateCents ?? 0 });
    return s + p.netCents;
  }, 0);

  function openEdit() {
    setDraft({
      name: customer!.name,
      phone: customer!.phone,
      email: customer!.email,
      address: customer!.address,
      notes: customer!.notes,
    });
    setEdit(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    try {
      await updateCustomer(orgId, customer!.id, draft);
      setEdit(false);
      toast.success("Saved");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!orgId) return;
    if (!confirm("Delete this customer?")) return;
    await deleteCustomer(orgId, customer!.id);
    router.replace("/customers");
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-text-faint">Customer</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{customer.name}</h1>
            <p className="mt-1 text-sm text-text-dim">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</p>
            {customer.address && <p className="mt-1 text-sm text-text-dim">{customer.address}</p>}
          </div>
          {role !== "worker" && (
            <div className="flex flex-col items-end gap-2">
              <button onClick={openEdit} className="btn-outline">Edit</button>
              <button onClick={onDelete} className="btn-danger">Delete</button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {customer.phone && <a href={`tel:${customer.phone.replace(/\D/g, "")}`} className="rounded-lg bg-surface px-3 py-1.5 text-text hover:bg-surface-hover">Call</a>}
          {customer.email && <a href={`mailto:${customer.email}`} className="rounded-lg bg-surface px-3 py-1.5 text-text hover:bg-surface-hover">Email</a>}
          {customer.address && <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} className="rounded-lg bg-surface px-3 py-1.5 text-text hover:bg-surface-hover">Navigate</a>}
        </div>
      </div>

      {role !== "worker" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Jobs" value={String(customerJobs.length)} />
          <Stat label="Revenue" value={formatMoney(totalRevenue)} />
          <Stat label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? "warn" : "good"} />
          <Stat label="Net profit" value={formatMoney(profitTotal)} tone={profitTotal >= 0 ? "good" : "bad"} />
        </div>
      )}

      <div className="card p-5">
        <p className="section-title mb-2">Jobs</p>
        {customerJobs.length === 0 ? (
          <p className="text-sm text-text-faint">No jobs yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {customerJobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-hover">
                <div>
                  <p className="text-sm font-semibold">{j.title || j.serviceType || "Job"}</p>
                  <p className="text-xs text-text-faint">{[j.jobDate ? formatDate(j.jobDate) : null, j.status.replace("_", " ")].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-text-faint">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {role !== "worker" && (
        <div className="card p-5">
          <p className="section-title mb-2">Invoices</p>
          {customerInvoices.length === 0 ? (
            <p className="text-sm text-text-faint">No invoices yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {customerInvoices.map((i) => (
                <Link key={i.id} href={`/money/invoices/${i.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-hover">
                  <div>
                    <p className="text-sm font-semibold">{i.number}</p>
                    <p className="text-xs text-text-faint">{i.paymentStatus} · {formatDate(i.createdAt)}</p>
                  </div>
                  <p className="text-sm font-semibold">{formatMoney(i.totals.totalCents)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <Drawer open={edit} onClose={() => setEdit(false)} title="Edit customer">
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[80px]" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setEdit(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div className="card p-3">
      <p className={"text-base font-bold " + toneClass}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
