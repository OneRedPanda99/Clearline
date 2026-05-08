"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Expense, Invoice } from "@/types";
import { formatMoney, startOfMonth, endOfMonth } from "@/lib/utils/format";
import { totalsForRange } from "@/lib/money/profit";

export default function MoneyHomePage() {
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: invoices } = useOrgCollection<Invoice>("invoices", constraints);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraints);

  const month = useMemo(() => {
    const d = new Date();
    return totalsForRange({
      invoices,
      expenses,
      fromIso: startOfMonth(d).toISOString(),
      toIso: endOfMonth(d).toISOString(),
    });
  }, [invoices, expenses]);

  const ytd = useMemo(() => {
    const d = new Date();
    return totalsForRange({
      invoices,
      expenses,
      fromIso: new Date(d.getFullYear(), 0, 1).toISOString(),
      toIso: new Date(d.getFullYear(), 11, 31, 23, 59, 59).toISOString(),
    });
  }, [invoices, expenses]);

  const cards = [
    { href: "/money/revenue", label: "Revenue", desc: "Invoices, payments, AR" },
    { href: "/money/expenses", label: "Expenses", desc: "Log costs in seconds" },
    { href: "/money/profit", label: "Profit", desc: "Per-job and overall margins" },
    { href: "/money/taxes", label: "Taxes", desc: "Schedule C categories + export" },
    { href: "/money/estimates", label: "Estimates", desc: "Quote and convert to invoice" },
    { href: "/money/payroll", label: "Payroll", desc: "Hours, pay, Gusto export" },
  ];

  return (
    <div className="space-y-4">
      <div className="card-raised p-5">
        <p className="section-title">This month</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="Revenue" value={formatMoney(month.revenueCents)} tone="brand" />
          <Stat label="Expenses" value={formatMoney(month.expensesCents)} tone="warn" />
          <Stat label="Net" value={formatMoney(month.netCents)} tone={month.netCents >= 0 ? "good" : "bad"} />
        </div>
        <p className="mt-3 text-xs text-text-faint">YTD net: <span className="font-semibold text-text">{formatMoney(ytd.netCents)}</span></p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card p-4 transition hover:bg-surface-hover">
            <p className="text-sm font-bold">{c.label}</p>
            <p className="text-xs text-text-faint">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "brand" | "good" | "warn" | "bad" }) {
  const tones: Record<string, string> = {
    brand: "text-brand-accent",
    good: "text-good",
    warn: "text-warn",
    bad: "text-bad",
  };
  return (
    <div className="rounded-xl border border-line bg-ink-soft p-3">
      <p className={"text-sm font-bold tabular-nums " + tones[tone]}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
