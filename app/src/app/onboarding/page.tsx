"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { useSession } from "@/lib/session/SessionProvider";
import {
  acceptInvite,
  createOrg,
  ensureUserOrgList,
  findInvitesForEmail,
  listMyOrgs,
} from "@/lib/org/orgService";
import { useToast } from "@/components/ui/Toast";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import type { Invite } from "@/types";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, status, configured, setActiveOrg } = useSession();
  const toast = useToast();

  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [myOrgs, setMyOrgs] = useState<{ orgId: string; orgName?: string }[]>([]);
  const [loadingScan, setLoadingScan] = useState(true);

  useEffect(() => {
    if (!configured) {
      router.replace("/setup");
      return;
    }
    if (status === "anon") router.replace("/signin");
  }, [status, configured, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingScan(true);
      try {
        const [foundInvites, orgs] = await Promise.all([
          user.email ? findInvitesForEmail(user.email) : Promise.resolve([]),
          listMyOrgs(user.uid),
        ]);
        if (cancelled) return;
        setInvites(foundInvites);
        setMyOrgs(orgs.map(({ orgId, orgName }) => ({ orgId, orgName })));
      } finally {
        if (!cancelled) setLoadingScan(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return <LoadingScreen label="Loading account" />;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(undefined);
    try {
      const orgId = await createOrg({
        ownerUid: user.uid,
        ownerEmail: user.email,
        ownerName: user.displayName ?? "",
        businessName: businessName.trim(),
      });
      await ensureUserOrgList(user.uid, orgId);
      await setActiveOrg(orgId);
      toast.success("Organization created");
      router.replace("/home");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(invite: Invite) {
    if (!user || !user.email) return;
    setBusy(true);
    setError(undefined);
    try {
      const orgId = await acceptInvite({
        inviteId: invite.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName ?? "",
      });
      await setActiveOrg(orgId);
      toast.success("Joined organization");
      router.replace("/home");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSwitchTo(orgId: string) {
    setBusy(true);
    try {
      await setActiveOrg(orgId);
      router.replace("/home");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center gap-5 px-6 py-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="card p-6"
      >
        <h1 className="text-2xl font-bold tracking-tight">Set up your business</h1>
        <p className="mt-1 text-sm text-text-dim">
          Create a new organization or join one you've been invited to.
        </p>
      </motion.div>

      {!loadingScan && myOrgs.length > 0 && (
        <div className="card p-4">
          <p className="section-title mb-2">Your organizations</p>
          <div className="space-y-2">
            {myOrgs.map((o) => (
              <button
                key={o.orgId}
                disabled={busy}
                onClick={() => onSwitchTo(o.orgId)}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-ink-soft px-3 py-2 text-left transition hover:border-brand/40"
              >
                <div>
                  <p className="font-semibold">{o.orgName ?? "Organization"}</p>
                  <p className="text-xs text-text-faint">{o.orgId}</p>
                </div>
                <span className="text-brand-accent">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loadingScan && invites.length > 0 && (
        <div className="card p-4">
          <p className="section-title mb-2">Pending invitations</p>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-xl border border-line bg-ink-soft px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{inv.role.toUpperCase()} invite</p>
                  <p className="text-xs text-text-faint">For {inv.email}</p>
                </div>
                <button className="btn-primary" onClick={() => onAccept(inv)} disabled={busy}>Accept</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onCreate} className="card p-4">
        <p className="section-title mb-2">Create new organization</p>
        <label className="label">Business name</label>
        <input
          className="input"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          required
          placeholder="Clearline Pressure Washing"
        />
        {error && <div className="mt-3 rounded-xl border border-bad/30 bg-bad/10 p-2 text-sm text-bad">{error}</div>}
        <button type="submit" className="btn-primary mt-3 w-full" disabled={busy || !businessName.trim()}>
          {busy ? "Creating…" : "Create organization"}
        </button>
      </form>
    </div>
  );
}
