"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer } from "@/types";
import { useSession } from "@/lib/session/SessionProvider";
import { useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { Empty } from "@/components/ui/Empty";
import { createCustomer } from "@/lib/data/customers";

export default function CustomersPage() {
  const { orgId, user } = useSession();
  const toast = useToast();
  const { data, loading } = useOrgCollection<Customer>("customers", useMemo(() => [orderByUpdated], []));
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<Partial<Customer>>({});
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => {
      const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user) return;
    setBusy(true);
    try {
      await createCustomer(orgId, user.uid, draft);
      toast.success("Customer added");
      setDraft({});
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
          <h1 className="text-xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-text-dim">{data.length} total</p>
        </div>
        <button onClick={() => setDrawer(true)} className="btn-primary">+ New customer</button>
      </div>

      <div className="card p-3">
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email, address"
        />
      </div>

      {loading && <div className="card p-6 text-center text-sm text-text-dim">Loading customers…</div>}

      {!loading && filtered.length === 0 && (
        <Empty title="No customers yet" hint="Add your first customer to start scheduling jobs." />
      )}

      {!loading && filtered.length > 0 && (
        <div className="card divide-y divide-line">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-hover"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-xs text-text-faint">
                  {[c.phone, c.email, c.address].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-text-faint">›</span>
            </Link>
          ))}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="New customer">
        <form onSubmit={onCreate} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
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
            <button type="button" className="btn-outline flex-1" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Create"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
