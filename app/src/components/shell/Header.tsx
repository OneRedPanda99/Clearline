"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/lib/session/SessionProvider";
import { useToast } from "@/components/ui/Toast";

export function Header({ title }: { title?: string }) {
  const { user, profile, signOut } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  async function onSignOut() {
    setOpen(false);
    await signOut();
    toast.info("Signed out");
  }

  const initials = (profile?.displayName || user?.email || "U")
    .split(/\s+|@/)
    .map((s) => s.charAt(0).toUpperCase())
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-ink/85 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <p className="text-base font-bold tracking-tight lg:hidden">Clearline</p>
        {title && <p className="text-base font-semibold tracking-tight text-text-dim">{title}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Link href="/settings" className="hidden h-9 w-9 items-center justify-center rounded-full text-text-dim transition hover:bg-surface-hover lg:flex">
          <span aria-hidden>⚙</span>
        </Link>
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-sm font-bold text-text"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {initials || "U"}
          </button>
          {open && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-line bg-surface-raised p-2 shadow-card">
              <div className="px-2 py-1.5 text-xs text-text-faint">{user?.email}</div>
              <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">Settings</Link>
              <Link href="/onboarding" onClick={() => setOpen(false)} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">Switch organization</Link>
              <button onClick={onSignOut} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-bad hover:bg-bad/15">Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
