"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { useSession } from "@/lib/session/SessionProvider";
import { useToast } from "@/components/ui/Toast";

export default function SignInPage() {
  const router = useRouter();
  const { signIn } = useSession();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) {
      toast.success("Welcome back");
      router.replace("/home");
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="card p-6"
      >
        <h1 className="text-2xl font-bold tracking-tight">Sign in to Clearline</h1>
        <p className="mt-1 text-sm text-text-dim">Run your business from one app.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              autoComplete="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              autoComplete="current-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <div className="rounded-xl border border-bad/30 bg-bad/10 p-2 text-sm text-bad">{error}</div>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link href="/signup" className="text-brand-accent hover:underline">Create account</Link>
          <span className="text-text-faint">or</span>
          <Link href="/signup" className="text-text-dim hover:underline">Join via invite</Link>
        </div>
      </motion.div>
    </div>
  );
}
