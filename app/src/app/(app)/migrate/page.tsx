"use client";

import { useState } from "react";

import { useSession } from "@/lib/session/SessionProvider";
import { migrateLegacyFirestore, migrateLegacyLocalStorage, type MigrationReport } from "@/lib/migrate/legacy";
import { useToast } from "@/components/ui/Toast";

export default function MigratePage() {
  const { user, orgId, role } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (role !== "owner") {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-bold">Migrate legacy data</h1>
        <p className="mt-2 text-sm text-text-dim">Only the org owner can run a migration.</p>
      </div>
    );
  }

  async function run(source: "firestore" | "localstorage") {
    if (!orgId || !user) return;
    setBusy(true);
    setError(undefined);
    setReport(null);
    try {
      const r =
        source === "firestore"
          ? await migrateLegacyFirestore(orgId, { uid: user.uid })
          : await migrateLegacyLocalStorage(orgId, { uid: user.uid });
      setReport(r);
      toast.success(`Imported ${r.customers} customers, ${r.jobs} jobs`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-bold tracking-tight">Migrate legacy data</h1>
        <p className="mt-1 text-sm text-text-dim">
          Import customers and jobs from the previous version of Clearline into the current organization.
        </p>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Source: legacy Firestore (top-level <code>customers</code>, <code>jobs</code>)</p>
        <p className="text-sm text-text-dim">
          Pulls every doc in the legacy <code>customers</code> and <code>jobs</code> root collections and writes them
          into <code>orgs/{orgId}/...</code>. Existing documents with the same id are merged (no overwrite of newer
          local fields).
        </p>
        <button onClick={() => run("firestore")} disabled={busy} className="btn-primary mt-3">
          {busy ? "Running…" : "Run Firestore import"}
        </button>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Source: this browser{"'"}s localStorage</p>
        <p className="text-sm text-text-dim">
          For users who only used the legacy app offline. Reads <code>cl-customers</code> and <code>cl-jobs</code>{" "}
          from this browser and copies them into the org.
        </p>
        <button onClick={() => run("localstorage")} disabled={busy} className="btn-outline mt-3">
          {busy ? "Running…" : "Run localStorage import"}
        </button>
      </div>

      {report && (
        <div className="card p-5">
          <p className="section-title mb-2">Last run</p>
          <p className="text-sm">
            Imported <strong>{report.customers}</strong> customers and <strong>{report.jobs}</strong> jobs from{" "}
            <code>{report.source}</code> in {report.durationMs} ms.
          </p>
        </div>
      )}

      {error && (
        <div className="card p-5 border-bad/30 bg-bad/10">
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}
    </div>
  );
}
