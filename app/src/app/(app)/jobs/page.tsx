"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { useOrgCollection, orderByUpdated } from "@/lib/data/useOrgCollection";
import type { Customer, Job, JobStatus } from "@/types";
import { useSession } from "@/lib/session/SessionProvider";
import { useToast } from "@/components/ui/Toast";
import { Drawer } from "@/components/ui/Drawer";
import { Empty } from "@/components/ui/Empty";
import { createJob, setJobStatus } from "@/lib/data/jobs";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";

const STATUSES: { id: JobStatus; label: string }[] = [
  { id: "lead", label: "Leads" },
  { id: "scheduled", label: "Scheduled" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

export default function JobsPage() {
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const { data: jobs, loading } = useOrgCollection<Job>("jobs", useMemo(() => [orderByUpdated], []));
  const { data: customers } = useOrgCollection<Customer>("customers", useMemo(() => [orderByUpdated], []));

  const [tab, setTab] = useState<JobStatus>("scheduled");
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState<Partial<Job> & { customerId?: string }>({});
  const [busy, setBusy] = useState(false);

  // Worker scope: only show jobs assigned to me or created by me.
  const visibleJobs = useMemo(() => {
    if (role !== "worker") return jobs;
    return jobs.filter(
      (j) => (j.assignedTo ?? []).includes(user?.uid ?? "") || j.createdBy === user?.uid,
    );
  }, [jobs, role, user]);

  const grouped = useMemo(() => {
    const map: Record<JobStatus, Job[]> = { lead: [], scheduled: [], in_progress: [], completed: [], lost: [] };
    visibleJobs.forEach((j) => {
      if (map[j.status]) map[j.status].push(j);
    });
    return map;
  }, [visibleJobs]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user || !draft.customerId) return;
    setBusy(true);
    try {
      const customer = customers.find((c) => c.id === draft.customerId);
      await createJob(orgId, user.uid, {
        customerId: draft.customerId,
        customerName: customer?.name ?? "",
        title: draft.title ?? customer?.name ?? "",
        status: (draft.status as JobStatus) ?? "lead",
        jobDate: draft.jobDate ?? "",
        jobTime: draft.jobTime ?? "",
        address: draft.address ?? customer?.address ?? "",
        serviceType: draft.serviceType ?? "",
      });
      setDraft({});
      setDrawer(false);
      toast.success("Job created");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function quickAdvance(job: Job) {
    if (!orgId) return;
    const next: Record<JobStatus, JobStatus | null> = {
      lead: "scheduled",
      scheduled: "in_progress",
      in_progress: "completed",
      completed: null,
      lost: null,
    };
    const target = next[job.status];
    if (!target) return;
    await setJobStatus(orgId, job.id, target);
    toast.info(`Moved to ${target.replace("_", " ")}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Jobs</h1>
          <p className="text-sm text-text-dim">{visibleJobs.length} total</p>
        </div>
        {role !== "worker" && (
          <button onClick={() => setDrawer(true)} className="btn-primary">+ New job</button>
        )}
      </div>

      <div className="card p-1">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={cn(
                "flex-shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                tab === s.id ? "bg-brand text-white" : "text-text-dim hover:bg-surface-hover",
              )}
            >
              {s.label} <span className="ml-1 text-[10px] opacity-80">{grouped[s.id].length}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="card p-6 text-center text-sm text-text-dim">Loading…</div>}

      {!loading && grouped[tab].length === 0 && (
        <Empty title="Nothing here yet" hint={role === "worker" ? "No jobs assigned." : "Create a job to get started."} />
      )}

      {!loading && grouped[tab].length > 0 && (
        <div className="card divide-y divide-line">
          {grouped[tab].map((j) => (
            <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{j.customerName || j.title || "Job"}</p>
                <p className="truncate text-xs text-text-faint">
                  {[j.jobDate ? formatDate(j.jobDate) : null, j.jobTime, j.address].filter(Boolean).join(" · ")}
                </p>
              </Link>
              {role !== "worker" && j.status !== "completed" && (
                <button onClick={() => quickAdvance(j)} className="btn-outline text-xs">
                  Advance
                </button>
              )}
              <Link href={`/jobs/${j.id}`} className="text-text-faint">›</Link>
            </div>
          ))}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="New job">
        <form onSubmit={onCreate} className="space-y-4">
          <div>
            <label className="label">Customer</label>
            <select
              className="input"
              required
              value={draft.customerId ?? ""}
              onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}
            >
              <option value="">Select customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Title (optional)</label>
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
            <input className="input" value={draft.serviceType ?? ""} placeholder="House wash, driveway…" onChange={(e) => setDraft({ ...draft, serviceType: e.target.value })} />
          </div>
          <div>
            <label className="label">Initial status</label>
            <select className="input" value={(draft.status as string) ?? "lead"} onChange={(e) => setDraft({ ...draft, status: e.target.value as JobStatus })}>
              <option value="lead">Lead</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={busy || !draft.customerId}>{busy ? "Saving…" : "Create job"}</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
