"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgDoc } from "@/lib/data/useOrgDoc";
import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import { useToast } from "@/components/ui/Toast";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Drawer } from "@/components/ui/Drawer";
import { Empty } from "@/components/ui/Empty";

import type { Customer, Expense, Invoice, Job, JobNote, OrgMember, OrgSettings } from "@/types";
import {
  addJobNote,
  addJobPhoto,
  deleteJob,
  setJobStatus,
  startJobTimer,
  stopJobTimer,
  updateJob,
} from "@/lib/data/jobs";
import { uploadJobPhoto } from "@/lib/data/photoUpload";
import { computeJobProfit } from "@/lib/money/profit";
import { formatDate, formatHours, formatMoney } from "@/lib/utils/format";

export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { orgId, user, role } = useSession();
  const toast = useToast();

  const { data: job, loading } = useOrgDoc<Job>("jobs", params.jobId);
  const { data: customer } = useOrgDoc<Customer>("customers", job?.customerId);

  const constraintsExp = useMemo(() => [orderByUpdated], []);
  const { data: expenses } = useOrgCollection<Expense>("expenses", constraintsExp);
  const { data: invoices } = useOrgCollection<Invoice>("invoices", constraintsExp);
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const { data: settingsList } = useOrgCollection<OrgSettings & { id: string }>("settings", []);
  const settings = settingsList.find((s) => s.id === "global");

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Job>>({});
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tickMs, setTickMs] = useState(0);

  useEffect(() => {
    if (job?.timer?.isRunning) {
      const id = window.setInterval(() => setTickMs(Date.now()), 1000);
      return () => window.clearInterval(id);
    }
  }, [job?.timer?.isRunning]);

  if (loading) return <LoadingScreen label="Loading job" />;
  if (!job) return <div className="card p-6">Job not found.</div>;

  const profit = computeJobProfit({
    job,
    invoices,
    expenses,
    members,
    defaultRateCents: settings?.laborDefaultRateCents ?? 0,
  });

  const isWorker = role === "worker";

  function totalLaborMinutes() {
    const base = Object.values(job!.laborMinutesByUid ?? {}).reduce((s, n) => s + (n ?? 0), 0);
    if (job!.timer?.isRunning && job!.timer?.startedAt) {
      const live = Math.max(0, Math.floor((tickMs - job!.timer.startedAt) / 60000));
      return base + live;
    }
    return base;
  }

  async function onAdvance() {
    if (!orgId) return;
    const next = job!.status === "lead" ? "scheduled" : job!.status === "scheduled" ? "in_progress" : job!.status === "in_progress" ? "completed" : null;
    if (!next) return;
    await setJobStatus(orgId, job!.id, next);
    toast.info(`Status → ${next.replace("_", " ")}`);
  }

  async function onTimerToggle() {
    if (!orgId || !user) return;
    setBusy(true);
    try {
      if (job!.timer?.isRunning) {
        const r = await stopJobTimer(orgId, job!.id, job!, user.uid);
        toast.success(`Logged ${r.addedMinutes} min`);
      } else {
        await startJobTimer(orgId, job!.id, user.uid);
        if (job!.status === "scheduled") await setJobStatus(orgId, job!.id, "in_progress");
        toast.info("Timer started");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onAddNote() {
    if (!orgId || !user || !noteText.trim()) return;
    setBusy(true);
    try {
      await addJobNote(orgId, job!.id, {
        authorUid: user.uid,
        authorName: user.displayName ?? "",
        text: noteText.trim(),
      });
      setNoteText("");
    } finally {
      setBusy(false);
    }
  }

  async function onPhotoUpload(file: File) {
    if (!orgId || !user) return;
    setBusy(true);
    try {
      const { storagePath, url } = await uploadJobPhoto(orgId, job!.id, file);
      await addJobPhoto(orgId, job!.id, { storagePath, url, uploadedBy: user.uid });
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    setDraft({
      title: job!.title,
      jobDate: job!.jobDate,
      jobTime: job!.jobTime,
      address: job!.address,
      serviceType: job!.serviceType,
      assignedTo: job!.assignedTo,
    });
    setEditOpen(true);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setBusy(true);
    try {
      await updateJob(orgId, job!.id, draft);
      setEditOpen(false);
      toast.success("Saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!orgId) return;
    if (!confirm("Delete this job? This cannot be undone.")) return;
    await deleteJob(orgId, job!.id);
    router.replace("/jobs");
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-text-faint">{job.status.replace("_", " ")}</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight">{customer?.name || job.customerName || "Job"}</h1>
            <p className="mt-1 text-sm text-text-dim">
              {[job.jobDate ? formatDate(job.jobDate) : null, job.jobTime, job.serviceType].filter(Boolean).join(" · ")}
            </p>
            {job.address && <p className="mt-2 text-sm text-text-dim"><span className="text-text-faint">Address: </span>{job.address}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            {job.status !== "completed" && (
              <button onClick={onAdvance} className="btn-primary">Advance</button>
            )}
            {!isWorker && (
              <>
                <button onClick={openEdit} className="btn-outline">Edit</button>
                <button onClick={onDelete} className="btn-danger">Delete</button>
              </>
            )}
          </div>
        </div>

        {customer && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href={`/customers/${customer.id}`} className="rounded-lg bg-surface px-3 py-1.5 text-brand-accent hover:bg-surface-hover">View customer</Link>
            {customer.phone && <a href={`tel:${customer.phone.replace(/\D/g, "")}`} className="rounded-lg bg-surface px-3 py-1.5 text-text hover:bg-surface-hover">Call</a>}
            {job.address && (
              <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} className="rounded-lg bg-surface px-3 py-1.5 text-text hover:bg-surface-hover">Navigate</a>
            )}
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="section-title">Time</p>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-2xl font-bold">{formatHours(totalLaborMinutes())}</p>
          <button onClick={onTimerToggle} disabled={busy} className={job.timer?.isRunning ? "btn-danger" : "btn-primary"}>
            {job.timer?.isRunning ? "Stop timer" : "Start timer"}
          </button>
        </div>
        <p className="mt-2 text-xs text-text-faint">
          {Object.keys(job.laborMinutesByUid ?? {}).length} contributor{(Object.keys(job.laborMinutesByUid ?? {}).length) === 1 ? "" : "s"}
        </p>
      </div>

      {!isWorker && (
        <div className="card p-5">
          <p className="section-title">Profitability</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Revenue" value={formatMoney(profit.revenueCents)} tone="brand" />
            <Stat label="Job costs" value={formatMoney(profit.cogsCents)} tone="warn" />
            <Stat label="Labor cost" value={formatMoney(profit.laborCostCents)} tone="warn" />
            <Stat label="Net" value={formatMoney(profit.netCents)} tone={profit.netCents >= 0 ? "good" : "bad"} />
          </div>
          <p className="mt-2 text-xs text-text-faint">
            Margin {(profit.marginPct * 100).toFixed(0)}%. Revenue is collected (paid) on linked invoices.
          </p>
        </div>
      )}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">Notes</p>
        </div>
        <div className="space-y-2">
          {(job.notes ?? []).slice().reverse().map((n: JobNote) => (
            <div key={n.id} className="rounded-xl border border-line bg-ink-soft p-3">
              <p className="text-sm">{n.text}</p>
              <p className="mt-1 text-[11px] text-text-faint">
                {n.authorName || "Member"} · {formatDate(n.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          ))}
          {(job.notes ?? []).length === 0 && <p className="text-sm text-text-faint">No notes yet.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="input" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…" />
          <button onClick={onAddNote} className="btn-primary" disabled={busy || !noteText.trim()}>Post</button>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">Photos</p>
          <label className="btn-outline cursor-pointer">
            Upload
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhotoUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {(job.photos ?? []).length === 0 ? (
          <Empty title="No photos yet" hint="Upload before/after shots from your phone." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(job.photos ?? []).map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl border border-line bg-ink-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Job photo"} className="h-full w-full object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </div>

      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit job">
        <form onSubmit={onSaveEdit} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={draft.jobDate ?? ""} onChange={(e) => setDraft({ ...draft, jobDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Time</label>
              <input type="time" className="input" value={draft.jobTime ?? ""} onChange={(e) => setDraft({ ...draft, jobTime: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </div>
          <div>
            <label className="label">Service type</label>
            <input className="input" value={draft.serviceType ?? ""} onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })} />
          </div>
          <div>
            <label className="label">Assigned to</label>
            <div className="space-y-1">
              {members.map((m) => {
                const checked = (draft.assignedTo ?? []).includes(m.uid);
                return (
                  <label key={m.uid} className="flex items-center gap-2 rounded-lg border border-line bg-ink-soft px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = draft.assignedTo ?? [];
                        if (e.target.checked) setDraft({ ...draft, assignedTo: [...cur, m.uid] });
                        else setDraft({ ...draft, assignedTo: cur.filter((x) => x !== m.uid) });
                      }}
                    />
                    <span>{m.displayName || m.email || m.uid}</span>
                    <span className="ml-auto text-xs text-text-faint">{m.role}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Drawer>
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
      <p className={"text-base font-bold " + tones[tone]}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-text-faint">{label}</p>
    </div>
  );
}
