"use client";

import { useMemo, useState } from "react";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Job, OrgMember, OrgSettings, Payrun } from "@/types";
import { formatDate, formatHours, formatMoney } from "@/lib/utils/format";
import { Empty } from "@/components/ui/Empty";
import { useToast } from "@/components/ui/Toast";
import {
  aggregateHoursByUid,
  buildPayrunLines,
  deletePayrun,
  savePayrun,
  updatePayrun,
} from "@/lib/data/payroll";
import { downloadCsv, toCsv } from "@/lib/utils/csv";

export default function PayrollPage() {
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const constraints = useMemo(() => [orderByUpdated], []);
  const { data: jobs } = useOrgCollection<Job>("jobs", constraints);
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const { data: payruns } = useOrgCollection<Payrun>("payruns", constraints);
  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");

  const [periodStart, setPeriodStart] = useState<string>(() => firstDayOfThisWeek());
  const [periodEnd, setPeriodEnd] = useState<string>(() => addDays(firstDayOfThisWeek(), 6));
  const [manual, setManual] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const hoursMin = useMemo(() => aggregateHoursByUid(jobs, periodStart, periodEnd), [jobs, periodStart, periodEnd]);

  const previewLines = useMemo(() => {
    const manualHours: Record<string, number> = {};
    Object.entries(manual).forEach(([uid, str]) => {
      const n = parseFloat(str || "");
      if (Number.isFinite(n)) manualHours[uid] = n;
    });
    return buildPayrunLines({
      members,
      hoursByUidMin: hoursMin,
      manualHoursByUid: manualHours,
      defaultRateCents: settings?.laborDefaultRateCents ?? 0,
    });
  }, [members, hoursMin, manual, settings]);

  const previewTotal = previewLines.reduce((s, l) => s + l.totalCents, 0);

  if (role === "worker") return <div className="card p-6 text-sm">No access.</div>;
  if (role !== "owner") {
    return <div className="card p-6 text-sm">Only the owner can run payroll.</div>;
  }

  async function onSaveDraft() {
    if (!orgId || !user) return;
    setBusy(true);
    try {
      const created = await savePayrun(orgId, user.uid, {
        periodStart,
        periodEnd,
        status: "draft",
        lines: previewLines,
        totalCents: previewTotal,
      });
      toast.success(`Payrun saved (${created.id})`);
      setManual({});
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function exportGustoCsv(lines = previewLines, start = periodStart, end = periodEnd) {
    const header = ["Employee", "Email", "Period start", "Period end", "Regular hours", "OT hours", "Hourly rate", "Total pay"];
    const rows = lines.map((l) => {
      const m = members.find((x) => x.uid === l.uid);
      return [
        l.displayName ?? "",
        m?.email ?? "",
        start,
        end,
        l.regularHours,
        l.otHours,
        (l.rateCents / 100).toFixed(2),
        (l.totalCents / 100).toFixed(2),
      ];
    });
    const csv = toCsv([header, ...rows]);
    downloadCsv(`payroll-${start}-to-${end}.csv`, csv);
  }

  async function onMarkExported(p: Payrun) {
    if (!orgId) return;
    await updatePayrun(orgId, p.id, { status: "exported" });
    toast.info("Marked exported");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Payroll</h1>
          <p className="text-sm text-text-dim">Hours from job timers · save drafts · export CSV for Gusto</p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="section-title">New payrun</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Period start</label>
            <input type="date" className="input" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Period end</label>
            <input type="date" className="input" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div className="card divide-y divide-line p-0">
          <div className="grid grid-cols-12 gap-2 border-b border-line bg-surface-raised px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
            <p className="col-span-4">Member</p>
            <p className="col-span-2 text-right">Hours (timer)</p>
            <p className="col-span-3 text-right">Manual hours</p>
            <p className="col-span-1 text-right">Rate</p>
            <p className="col-span-2 text-right">Total</p>
          </div>
          {members.filter((m) => m.role !== "owner").map((m) => {
            const fromTimers = (hoursMin[m.uid] ?? 0) / 60;
            const line = previewLines.find((l) => l.uid === m.uid);
            return (
              <div key={m.uid} className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                <div className="col-span-4 min-w-0">
                  <p className="truncate text-sm font-semibold">{m.displayName || m.email || m.uid}</p>
                  <p className="truncate text-[11px] text-text-faint">{m.role}</p>
                </div>
                <p className="col-span-2 text-right text-sm tabular-nums">{formatHours(Math.round(fromTimers * 60))}</p>
                <input
                  className="input col-span-3 text-right"
                  inputMode="decimal"
                  placeholder="0"
                  value={manual[m.uid] ?? ""}
                  onChange={(e) => setManual({ ...manual, [m.uid]: e.target.value })}
                />
                <p className="col-span-1 text-right text-xs text-text-faint">{formatMoney(m.hourlyRateCents ?? settings?.laborDefaultRateCents ?? 0)}</p>
                <p className="col-span-2 text-right text-sm font-semibold tabular-nums">{formatMoney(line?.totalCents ?? 0)}</p>
              </div>
            );
          })}
          <div className="grid grid-cols-12 gap-2 border-t border-line bg-ink-soft px-3 py-2">
            <p className="col-span-10 text-right text-sm font-bold">Total payrun</p>
            <p className="col-span-2 text-right text-sm font-bold">{formatMoney(previewTotal)}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => exportGustoCsv()} className="btn-outline">Export CSV (Gusto)</button>
          <button onClick={onSaveDraft} className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save as draft"}</button>
        </div>

        {!members.some((m) => m.hourlyRateCents && m.hourlyRateCents > 0) && (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-2 text-xs text-warn">
            Set hourly rates per member in <a className="underline" href="/team">Team</a> for totals to be accurate.
          </p>
        )}
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">History</p>
        {payruns.length === 0 ? (
          <Empty title="No payruns yet" />
        ) : (
          <div className="divide-y divide-line">
            {payruns.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{p.periodStart} → {p.periodEnd}</p>
                  <p className="text-xs text-text-faint">{p.status} · created {formatDate(p.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <p className="text-sm font-semibold">{formatMoney(p.totalCents)}</p>
                  <button className="btn-outline text-xs" onClick={() => exportGustoCsv(p.lines, p.periodStart, p.periodEnd)}>CSV</button>
                  {p.status === "draft" && (
                    <button className="btn-primary text-xs" onClick={() => onMarkExported(p)}>Mark exported</button>
                  )}
                  <button className="btn-danger text-xs" onClick={async () => {
                    if (!orgId) return;
                    if (!confirm("Delete payrun?")) return;
                    await deletePayrun(orgId, p.id);
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function firstDayOfThisWeek() {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return ymd(d);
}
function addDays(s: string, days: number) {
  const d = new Date(s);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
