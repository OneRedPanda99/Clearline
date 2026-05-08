"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer, Expense, Invoice, Job, OrgMember, OrgSettings } from "@/types";
import { computeJobProfit, totalsForRange, type JobProfit } from "@/lib/money/profit";
import { formatMoney, ymd, startOfMonth, endOfMonth } from "@/lib/utils/format";
import { useSession } from "@/lib/session/SessionProvider";

type SortKey = "net" | "margin" | "revenue" | "cost";

export default function ProfitPage() {
  const { role } = useSession();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);
  const { data: invoices } = useOrgCollection<Invoice>("invoices", constraints);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraints);
  const { data: customers } = useOrgCollection<Customer>("customers", constraints);
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");

  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const profitByJob = useMemo<(JobProfit & { job: Job })[]>(() => {
    return jobs.map((job) => ({
      job,
      ...computeJobProfit({
        job,
        invoices,
        expenses,
        members,
        defaultRateCents: settings?.laborDefaultRateCents ?? 0,
      }),
    }));
  }, [jobs, invoices, expenses, members, settings]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...profitByJob].sort((a, b) => {
      const av = sortKey === "net" ? a.netCents : sortKey === "margin" ? a.marginPct : sortKey === "revenue" ? a.revenueCents : a.cogsCents + a.laborCostCents;
      const bv = sortKey === "net" ? b.netCents : sortKey === "margin" ? b.marginPct : sortKey === "revenue" ? b.revenueCents : b.cogsCents + b.laborCostCents;
      return (av - bv) * dir;
    });
  }, [profitByJob, sortKey, sortDir]);

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

  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;

  function setSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card-raised p-5">
        <p className="section-title">Profit overview</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Net (this month)" value={formatMoney(month.netCents)} tone={month.netCents >= 0 ? "good" : "bad"} />
          <Stat label="Net (YTD)" value={formatMoney(ytd.netCents)} tone={ytd.netCents >= 0 ? "good" : "bad"} />
          <Stat label="Revenue YTD" value={formatMoney(ytd.revenueCents)} tone="brand" />
          <Stat label="Expenses YTD" value={formatMoney(ytd.expensesCents)} tone="warn" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-12 gap-2 border-b border-line bg-surface-raised px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
          <button onClick={() => setSort("revenue")} className="col-span-5 text-left">Job</button>
          <button onClick={() => setSort("revenue")} className="col-span-2 text-right">Revenue</button>
          <button onClick={() => setSort("cost")} className="col-span-2 text-right">Cost</button>
          <button onClick={() => setSort("net")} className="col-span-2 text-right">Net</button>
          <button onClick={() => setSort("margin")} className="col-span-1 text-right">Margin</button>
        </div>
        <div className="divide-y divide-line">
          {sorted.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-faint">No jobs yet.</div>
          )}
          {sorted.map((row) => {
            const c = customers.find((cu) => cu.id === row.job.customerId);
            const cost = row.cogsCents + row.laborCostCents;
            const tone = row.netCents >= 0 ? "text-good" : "text-bad";
            return (
              <Link key={row.job.id} href={`/jobs/${row.job.id}`} className="grid grid-cols-12 items-center gap-2 px-4 py-3 transition hover:bg-surface-hover">
                <div className="col-span-5 min-w-0">
                  <p className="truncate text-sm font-semibold">{c?.name ?? row.job.customerName ?? "—"}</p>
                  <p className="truncate text-[11px] text-text-faint">{row.job.title || row.job.serviceType || row.job.id}</p>
                </div>
                <p className="col-span-2 text-right text-sm tabular-nums">{formatMoney(row.revenueCents)}</p>
                <p className="col-span-2 text-right text-sm tabular-nums text-text-dim">{formatMoney(cost)}</p>
                <p className={"col-span-2 text-right text-sm font-semibold tabular-nums " + tone}>{formatMoney(row.netCents)}</p>
                <p className="col-span-1 text-right text-xs text-text-faint">{row.revenueCents > 0 ? `${Math.round(row.marginPct * 100)}%` : "—"}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-text-faint">
        Net profit = collected revenue − (job-linked expenses [COGS/payroll] + labor cost from job timer at member rate).
        General overhead is excluded from per-job math but counted in the monthly totals.
      </p>
      <p className="text-xs text-text-faint">As of {ymd()}</p>
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
