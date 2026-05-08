"use client";

import { useMemo, useState } from "react";

import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import { useSession } from "@/lib/session/SessionProvider";
import type { Expense, TaxCategory } from "@/types";
import { formatMoney } from "@/lib/utils/format";
import { downloadCsv, toCsv } from "@/lib/utils/csv";
import { Empty } from "@/components/ui/Empty";

export default function TaxesPage() {
  const { role } = useSession();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraints);
  const { data: categories } = useOrgCollection<TaxCategory>("taxCategories", []);

  const [year, setYear] = useState<number>(new Date().getFullYear());

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const inYear = useMemo(
    () => expenses.filter((e) => e.date >= yearStart && e.date <= yearEnd),
    [expenses, yearStart, yearEnd],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, { totalCents: number; count: number }>();
    for (const e of inYear) {
      const cur = map.get(e.taxCategoryId) ?? { totalCents: 0, count: 0 };
      cur.totalCents += e.amountCents;
      cur.count += 1;
      map.set(e.taxCategoryId, cur);
    }
    const rows = categories.map((c) => ({
      category: c,
      ...(map.get(c.id) ?? { totalCents: 0, count: 0 }),
    }));
    rows.sort((a, b) => (b.totalCents - a.totalCents));
    return rows;
  }, [inYear, categories]);

  const total = byCategory.reduce((s, r) => s + r.totalCents, 0);

  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;

  function onExport() {
    const header = ["Category", "Schedule C line", "Total amount", "Entry count"];
    const rows = byCategory.map((r) => [
      r.category.label,
      r.category.scheduleCLine ?? "",
      (r.totalCents / 100).toFixed(2),
      r.count,
    ]);
    rows.push([]);
    rows.push(["Detail"]);
    rows.push(["Date", "Vendor", "Description", "Category", "Schedule C", "Job", "Amount"]);
    for (const e of inYear) {
      const cat = categories.find((c) => c.id === e.taxCategoryId);
      rows.push([
        e.date,
        e.vendor ?? "",
        e.description ?? "",
        cat?.label ?? e.taxCategoryId,
        cat?.scheduleCLine ?? "",
        e.jobId ?? "",
        (e.amountCents / 100).toFixed(2),
      ]);
    }
    const csv = toCsv([header, ...rows]);
    downloadCsv(`taxes-${year}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Taxes</h1>
          <p className="text-sm text-text-dim">Schedule C summary · {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" className="input w-24 text-right" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
          <button onClick={onExport} className="btn-primary">Export CSV</button>
        </div>
      </div>

      <div className="card p-5">
        <p className="section-title">Total deductible</p>
        <p className="mt-2 text-3xl font-bold tabular-nums">{formatMoney(total)}</p>
        <p className="text-xs text-text-faint">{inYear.length} entries</p>
      </div>

      {byCategory.every((r) => r.totalCents === 0) ? (
        <Empty title="Nothing to report" hint={`No expenses logged in ${year}.`} />
      ) : (
        <div className="card divide-y divide-line">
          {byCategory.map((row) => (
            <div key={row.category.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
              <div className="col-span-7 min-w-0">
                <p className="truncate text-sm font-semibold">{row.category.label}</p>
                <p className="truncate text-xs text-text-faint">{row.category.scheduleCLine || "—"} · {row.count} entries</p>
              </div>
              <p className="col-span-3 text-right text-sm font-semibold tabular-nums">{formatMoney(row.totalCents)}</p>
              <p className="col-span-2 text-right text-xs text-text-faint">{total > 0 ? `${Math.round((row.totalCents / total) * 100)}%` : "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
