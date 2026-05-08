"use client";

import { useMemo, useState } from "react";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Expense, Job, TaxCategory } from "@/types";
import { formatDate, formatMoney, parseMoneyInput, ymd } from "@/lib/utils/format";
import { useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { Empty } from "@/components/ui/Empty";
import { createExpense, deleteExpense, updateExpense } from "@/lib/data/expenses";
import { uploadReceipt } from "@/lib/data/photoUpload";
import { downloadCsv, toCsv } from "@/lib/utils/csv";

export default function ExpensesPage() {
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: expenses, loading } = useOrgCollection<Expense>("expenses", constraints);
  const { data: categories } = useOrgCollection<TaxCategory>("taxCategories", []);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);

  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<Partial<Expense> & { amountStr?: string; receiptFile?: File }>({
    date: ymd(),
    kind: "overhead",
    taxCategoryId: "other",
  });
  const [busy, setBusy] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>(""); // YYYY-MM

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => !filterCategory || e.taxCategoryId === filterCategory)
      .filter((e) => !filterMonth || (e.date ?? "").startsWith(filterMonth));
  }, [expenses, filterCategory, filterMonth]);

  const totalCents = filtered.reduce((s, e) => s + (e.amountCents || 0), 0);

  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user) return;
    setBusy(true);
    try {
      const exp = await createExpense(orgId, user.uid, {
        date: draft.date ?? ymd(),
        amountCents: parseMoneyInput(draft.amountStr ?? ""),
        vendor: draft.vendor ?? "",
        description: draft.description ?? "",
        taxCategoryId: draft.taxCategoryId ?? "other",
        kind: draft.kind ?? categories.find((c) => c.id === draft.taxCategoryId)?.defaultKind ?? "overhead",
        jobId: draft.jobId ?? "",
      });
      if (draft.receiptFile) {
        try {
          const { storagePath, url } = await uploadReceipt(orgId, exp.id, draft.receiptFile);
          await updateExpense(orgId, exp.id, { receiptStoragePath: storagePath, receiptUrl: url });
        } catch (err) {
          toast.error("Receipt upload failed: " + (err as Error).message);
        }
      }
      setDraft({ date: ymd(), kind: "overhead", taxCategoryId: "other" });
      setDrawer(false);
      toast.success("Expense logged");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onExportCsv() {
    const header = ["Date", "Vendor", "Description", "Category", "Schedule C", "Kind", "Job", "Amount"];
    const rows = filtered.map((e) => {
      const cat = categories.find((c) => c.id === e.taxCategoryId);
      const job = jobs.find((j) => j.id === e.jobId);
      return [
        e.date,
        e.vendor,
        e.description,
        cat?.label ?? e.taxCategoryId,
        cat?.scheduleCLine ?? "",
        e.kind,
        job?.title || job?.id || "",
        (e.amountCents / 100).toFixed(2),
      ];
    });
    const csv = toCsv([header, ...rows]);
    downloadCsv(`expenses-${filterMonth || "all"}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-text-dim">{filtered.length} entries · total {formatMoney(totalCents)}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onExportCsv} className="btn-outline">Export CSV</button>
          <button onClick={() => setDrawer(true)} className="btn-primary">+ Log expense</button>
        </div>
      </div>

      <div className="card p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input type="month" className="input" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
        </div>
      </div>

      {loading && <div className="card p-6 text-center text-sm text-text-dim">Loading…</div>}
      {!loading && filtered.length === 0 && <Empty title="No expenses logged" hint="Log one in under 10 seconds." />}

      {!loading && filtered.length > 0 && (
        <div className="card divide-y divide-line">
          {filtered.map((e) => {
            const cat = categories.find((c) => c.id === e.taxCategoryId);
            const job = jobs.find((j) => j.id === e.jobId);
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{e.vendor || cat?.label || "Expense"}</p>
                  <p className="truncate text-xs text-text-faint">
                    {[formatDate(e.date), cat?.label, e.kind, job?.title].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatMoney(e.amountCents)}</p>
                  <button
                    onClick={async () => {
                      if (!orgId) return;
                      if (!confirm("Delete expense?")) return;
                      await deleteExpense(orgId, e.id);
                      toast.info("Deleted");
                    }}
                    className="text-[11px] text-text-faint hover:text-bad"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Log expense">
        <form onSubmit={onCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={draft.date ?? ymd()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount</label>
              <input className="input" inputMode="decimal" placeholder="0.00" value={draft.amountStr ?? ""} onChange={(e) => setDraft({ ...draft, amountStr: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" required value={draft.taxCategoryId ?? ""} onChange={(e) => {
              const id = e.target.value;
              const cat = categories.find((c) => c.id === id);
              setDraft({ ...draft, taxCategoryId: id, kind: cat?.defaultKind ?? draft.kind });
            }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}{c.scheduleCLine ? ` · ${c.scheduleCLine}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vendor</label>
            <input className="input" value={draft.vendor ?? ""} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kind</label>
              <select className="input" value={draft.kind ?? "overhead"} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Expense["kind"] })}>
                <option value="overhead">Overhead</option>
                <option value="cogs">Job cost (COGS)</option>
                <option value="payroll">Payroll</option>
              </select>
            </div>
            <div>
              <label className="label">Link to job (optional)</label>
              <select className="input" value={draft.jobId ?? ""} onChange={(e) => setDraft({ ...draft, jobId: e.target.value })}>
                <option value="">—</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.customerName || j.title || j.id}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Receipt (optional)</label>
            <input type="file" accept="image/*,application/pdf" className="input" onChange={(e) => setDraft({ ...draft, receiptFile: e.target.files?.[0] })} />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Save expense"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
