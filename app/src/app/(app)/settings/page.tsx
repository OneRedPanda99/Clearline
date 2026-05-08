"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection } from "@/lib/data/useOrgCollection";
import type { ExpenseKind, OrgSettings, TaxCategory } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { archiveTaxCategory, updateOrgSettings, upsertTaxCategory } from "@/lib/data/settings";
import { formatMoney, parseMoneyInput } from "@/lib/utils/format";
import { Empty } from "@/components/ui/Empty";

export default function SettingsPage() {
  const { orgId, role } = useSession();
  const toast = useToast();
  const isOwner = role === "owner";

  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");
  const { data: categories } = useOrgCollection<TaxCategory>("taxCategories", []);

  const [draft, setDraft] = useState<Partial<OrgSettings> & { laborRateStr?: string }>({});
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState<{ id?: string; label: string; scheduleCLine: string; defaultKind: ExpenseKind }>({
    label: "",
    scheduleCLine: "",
    defaultKind: "overhead",
  });

  useEffect(() => {
    if (!settings) return;
    setDraft({
      businessName: settings.businessName,
      businessPhone: settings.businessPhone,
      businessEmail: settings.businessEmail,
      businessAddress: settings.businessAddress,
      invoiceNumberPrefix: settings.invoiceNumberPrefix,
      invoiceNextNumber: settings.invoiceNextNumber,
      estimateNumberPrefix: settings.estimateNumberPrefix,
      estimateNextNumber: settings.estimateNextNumber,
      laborRateStr: ((settings.laborDefaultRateCents ?? 0) / 100).toFixed(2),
    });
  }, [settings]);

  const visibleCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);

  if (!isOwner) {
    return (
      <div className="card p-5 text-sm">
        Only the owner can change organization settings.
      </div>
    );
  }

  async function onSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    try {
      await updateOrgSettings(orgId, {
        businessName: draft.businessName,
        businessPhone: draft.businessPhone,
        businessEmail: draft.businessEmail,
        businessAddress: draft.businessAddress,
        invoiceNumberPrefix: draft.invoiceNumberPrefix,
        invoiceNextNumber: Number(draft.invoiceNextNumber) || undefined,
        estimateNumberPrefix: draft.estimateNumberPrefix,
        estimateNextNumber: Number(draft.estimateNextNumber) || undefined,
        laborDefaultRateCents: parseMoneyInput(draft.laborRateStr ?? "0"),
      });
      toast.success("Settings saved");
    } finally {
      setBusy(false);
    }
  }

  async function onAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !newCat.label) return;
    const id = newCat.id || newCat.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await upsertTaxCategory(orgId, {
      id,
      label: newCat.label,
      scheduleCLine: newCat.scheduleCLine,
      defaultKind: newCat.defaultKind,
    });
    setNewCat({ label: "", scheduleCLine: "", defaultKind: "overhead" });
    toast.success("Category saved");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-text-dim">Organization preferences, taxes, and tools.</p>
      </div>

      <form onSubmit={onSaveBusiness} className="card p-5 space-y-4">
        <p className="section-title">Business</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Business name</label>
            <input className="input" value={draft.businessName ?? ""} onChange={(e) => setDraft({ ...draft, businessName: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={draft.businessPhone ?? ""} onChange={(e) => setDraft({ ...draft, businessPhone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={draft.businessEmail ?? ""} onChange={(e) => setDraft({ ...draft, businessEmail: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="label">Address</label>
            <input className="input" value={draft.businessAddress ?? ""} onChange={(e) => setDraft({ ...draft, businessAddress: e.target.value })} />
          </div>
        </div>

        <p className="section-title">Documents</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Invoice prefix</label>
            <input className="input" value={draft.invoiceNumberPrefix ?? "INV-"} onChange={(e) => setDraft({ ...draft, invoiceNumberPrefix: e.target.value })} />
          </div>
          <div>
            <label className="label">Next invoice number</label>
            <input type="number" className="input" value={draft.invoiceNextNumber ?? 1001} onChange={(e) => setDraft({ ...draft, invoiceNextNumber: Number(e.target.value) || 1001 })} />
          </div>
          <div>
            <label className="label">Estimate prefix</label>
            <input className="input" value={draft.estimateNumberPrefix ?? "EST-"} onChange={(e) => setDraft({ ...draft, estimateNumberPrefix: e.target.value })} />
          </div>
          <div>
            <label className="label">Next estimate number</label>
            <input type="number" className="input" value={draft.estimateNextNumber ?? 1001} onChange={(e) => setDraft({ ...draft, estimateNextNumber: Number(e.target.value) || 1001 })} />
          </div>
        </div>

        <p className="section-title">Labor</p>
        <div>
          <label className="label">Default hourly rate</label>
          <input className="input" inputMode="decimal" placeholder="0.00" value={draft.laborRateStr ?? ""} onChange={(e) => setDraft({ ...draft, laborRateStr: e.target.value })} />
          <p className="mt-1 text-xs text-text-faint">Used when a member doesn't have a personal rate. Currently {formatMoney(settings?.laborDefaultRateCents ?? 0)}/hr.</p>
        </div>

        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
      </form>

      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="section-title">Tax categories</p>
        </div>
        {visibleCategories.length === 0 ? (
          <Empty title="No categories" hint="Create your first tax category." />
        ) : (
          <div className="divide-y divide-line">
            {visibleCategories.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-2 py-2 text-sm">
                <p className="col-span-5 font-semibold">{c.label}</p>
                <p className="col-span-3 text-text-faint">{c.scheduleCLine || "—"}</p>
                <p className="col-span-2 text-text-dim">{c.defaultKind}</p>
                <button onClick={() => orgId && archiveTaxCategory(orgId, c.id, true)} className="col-span-2 text-right text-xs text-text-faint hover:text-bad">Archive</button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={onAddCategory} className="mt-3 grid grid-cols-12 gap-2">
          <input className="input col-span-5" placeholder="Label" value={newCat.label} onChange={(e) => setNewCat({ ...newCat, label: e.target.value })} required />
          <input className="input col-span-3" placeholder="Schedule C line" value={newCat.scheduleCLine} onChange={(e) => setNewCat({ ...newCat, scheduleCLine: e.target.value })} />
          <select className="input col-span-2" value={newCat.defaultKind} onChange={(e) => setNewCat({ ...newCat, defaultKind: e.target.value as ExpenseKind })}>
            <option value="overhead">Overhead</option>
            <option value="cogs">COGS</option>
            <option value="payroll">Payroll</option>
          </select>
          <button type="submit" className="btn-primary col-span-2">+ Add</button>
        </form>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Tools</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/migrate" className="btn-outline">Migrate legacy data</Link>
          <Link href="/onboarding" className="btn-outline">Switch organization</Link>
        </div>
      </div>
    </div>
  );
}
