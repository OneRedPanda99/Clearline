"use client";

import { isFirebaseConfigured } from "@/lib/firebase/client";

export default function SetupPage() {
  const ok = isFirebaseConfigured();
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-6 px-6">
      <div className="card p-6">
        <h1 className="text-xl font-bold">Welcome to Clearline</h1>
        <p className="mt-2 text-sm text-text-dim">
          Before you can sign in, the app needs your Firebase project credentials.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-text">
          <li>
            Copy <code className="rounded bg-ink-soft px-1.5 py-0.5">.env.local.example</code> to{" "}
            <code className="rounded bg-ink-soft px-1.5 py-0.5">.env.local</code> in the{" "}
            <code className="rounded bg-ink-soft px-1.5 py-0.5">app/</code> folder.
          </li>
          <li>
            Fill in the values from your Firebase project console (Project settings → General → Your apps →
            Web).
          </li>
          <li>Restart <code className="rounded bg-ink-soft px-1.5 py-0.5">npm run dev</code>.</li>
          <li>
            Deploy security rules with{" "}
            <code className="rounded bg-ink-soft px-1.5 py-0.5">npm run deploy:rules</code>.
          </li>
        </ol>
        <div className={"mt-4 rounded-xl border p-3 text-sm " + (ok ? "border-good/30 bg-good/10 text-good" : "border-warn/30 bg-warn/10 text-warn") }>
          {ok ? "Firebase is configured. Reload the page." : "Firebase env vars are missing."}
        </div>
      </div>
    </div>
  );
}
