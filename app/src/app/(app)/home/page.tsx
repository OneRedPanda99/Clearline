"use client";

import { useMemo } from "react";
import Link from "next/link";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Expense, Invoice, Job, OrgMember, OrgSettings } from "@/types";
import { formatDate, formatMoney, ymd, startOfMonth, endOfMonth } from "@/lib/utils/format";
import { Empty } from "@/components/ui/Empty";
import { totalsForRange } from "@/lib/money/profit";

export default function HomePage() {
  const { user, role, profile } = useSession();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);
  const { data: invoices } = useOrgCollection<Invoice>("invoices", constraints);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraints);
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");

  const today = ymd();
  const todays = useMemo(
    () =>
      jobs
        .filter(
          (j) => j.jobDate === today && (j.status === "scheduled" || j.status === "in_progress" || j.status === "lead"),
        )
        .sort((a, b) => (a.jobTime ?? "").localeCompare(b.jobTime ?? "")),
    [jobs, today],
  );
  const upcoming = useMemo(
    () =>
      jobs
        .filter((j) => j.jobDate && j.jobDate > today && (j.status === "scheduled" || j.status === "lead"))
        .sort((a, b) => (a.jobDate ?? "").localeCompare(b.jobDate ?? ""))
        .slice(0, 6),
    [jobs, today],
  );
  const unpaid = useMemo(
    () => invoices.filter((i) => i.paymentStatus !== "paid" && i.status !== "draft").slice(0, 5),
    [invoices],
  );

  const month = useMemo(() => {
    const d = new Date();
    return totalsForRange({
      invoices,
      expenses,
      fromIso: startOfMonth(d).toISOString(),
      toIso: endOfMonth(d).toISOString(),
    });
  }, [invoices, expenses]);

  const greeting = greetingFor(profile?.displayName || user?.displayName || user?.email || "");

  return (
    <div className="space-y-4">
      <div className="card-raised p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-text-faint">{formatDate(new Date())}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="mt-1 text-sm text-text-dim">Here's what's happening today.</p>
      </div>

      {role !== "worker" && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Revenue (mo)" value={formatMoney(month.revenueCents)} tone="brand" />
          <Stat label="Expenses (mo)" value={formatMoney(month.expensesCents)} tone="warn" />
          <Stat label="Net (mo)" value={formatMoney(month.netCents)} tone={month.netCents >= 0 ? "good" : "bad"} />
        </div>
      )}

      <div>
        <SectionHeader title="Today" link="/jobs" linkLabel="View all" />
        {todays.length === 0 ? (
          <Empty title="Nothing on today's schedule" hint="Add a job from the Jobs page." />
        ) : (
          <div className="card divide-y divide-line">
            {todays.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{j.customerName || j.title || "Job"}</p>
                  <p className="truncate text-xs text-text-faint">{[j.jobTime, j.address, j.status.replace("_", " ")].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-text-faint">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div>
          <SectionHeader title="Coming up" link="/jobs" linkLabel="View all" />
          <div className="card divide-y divide-line">
            {upcoming.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{j.customerName || j.title}</p>
                  <p className="truncate text-xs text-text-faint">{[j.jobDate ? formatDate(j.jobDate) : null, j.jobTime, j.status.replace("_", " ")].filter(Boolean).join(" · ")}</p>
                </div>
                <span className="text-text-faint">›</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {role !== "worker" && unpaid.length > 0 && (
        <div>
          <SectionHeader title="Unpaid invoices" link="/money/revenue" linkLabel="Manage" />
          <div className="card divide-y divide-line">
            {unpaid.map((i) => (
              <Link key={i.id} href={`/money/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                <div>
                  <p className="text-sm font-semibold">{i.number}</p>
                  <p className="text-xs text-text-faint">{i.paymentStatus.toUpperCase()} · {formatDate(i.dueDate || i.createdAt)}</p>
                </div>
                <p className="text-sm font-semibold">{formatMoney((i.totals.totalCents || 0) - (i.paidAmountCents || 0))}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, link, linkLabel }: { title: string; link?: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex items-end justify-between">
      <p className="section-title">{title}</p>
      {link && <Link href={link} className="text-xs text-brand-accent hover:underline">{linkLabel}</Link>}
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
    <div className="card p-3">
      <p className={"text-sm font-bold tabular-nums " + tones[tone]}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}

function greetingFor(name: string) {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name.split(/\s+|@/)[0] ?? "";
  return first ? `${time}, ${first}` : time;
}
