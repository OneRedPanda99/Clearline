"use client";

import { useMemo, useState } from "react";

import { useSession } from "@/lib/session/SessionProvider";
import { useOrgCollection } from "@/lib/data/useOrgCollection";
import type { Invite, OrgMember, Role } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { Empty } from "@/components/ui/Empty";
import { inviteMember, setMemberActive, setMemberRate, setMemberRole } from "@/lib/org/orgService";
import { formatMoney, parseMoneyInput } from "@/lib/utils/format";

export default function TeamPage() {
  const { orgId, user, role } = useSession();
  const toast = useToast();
  const { data: members } = useOrgCollection<OrgMember>("members", []);
  const isOwner = role === "owner";

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("worker");
  const [busy, setBusy] = useState(false);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [recentInvites, setRecentInvites] = useState<Invite[]>([]);

  const sortedMembers = useMemo(() => {
    const order: Record<Role, number> = { owner: 0, manager: 1, worker: 2 };
    return [...members].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  }, [members]);

  if (role === "worker") {
    return <div className="card p-6 text-sm">No access.</div>;
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !user || !email.trim()) return;
    setBusy(true);
    try {
      const inv = await inviteMember({ orgId, email, role: inviteRole, createdBy: user.uid });
      toast.success("Invite created");
      setRecentInvites((x) => [inv, ...x]);
      setEmail("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRate(uid: string) {
    if (!orgId) return;
    const cents = parseMoneyInput(rateDrafts[uid] ?? "0");
    await setMemberRate(orgId, uid, cents);
    toast.success("Rate updated");
  }

  async function onToggleActive(m: OrgMember) {
    if (!orgId) return;
    await setMemberActive(orgId, m.uid, !m.active);
    toast.info(!m.active ? "Member activated" : "Member deactivated");
  }

  async function onChangeRole(m: OrgMember, role: Role) {
    if (!orgId) return;
    await setMemberRole(orgId, m.uid, role);
    toast.info("Role updated");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-text-dim">{members.length} members</p>
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Members</p>
        {sortedMembers.length === 0 ? (
          <Empty title="No members yet" />
        ) : (
          <div className="divide-y divide-line">
            {sortedMembers.map((m) => (
              <div key={m.uid} className="grid grid-cols-12 items-center gap-3 py-3">
                <div className="col-span-12 sm:col-span-5">
                  <p className="text-sm font-semibold">{m.displayName || m.email || m.uid}</p>
                  <p className="text-xs text-text-faint">{m.email} · {m.uid.slice(0, 6)}</p>
                </div>
                <div className="col-span-6 sm:col-span-2">
                  {isOwner && m.uid !== user?.uid ? (
                    <select className="input" value={m.role} onChange={(e) => onChangeRole(m, e.target.value as Role)}>
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="worker">Worker</option>
                    </select>
                  ) : (
                    <p className="rounded-lg bg-surface px-2 py-1 text-center text-xs uppercase">{m.role}</p>
                  )}
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <div className="flex gap-1">
                    <input
                      className="input flex-1"
                      placeholder={(m.hourlyRateCents ?? 0) > 0 ? `${(m.hourlyRateCents! / 100).toFixed(2)}` : "0.00"}
                      value={rateDrafts[m.uid] ?? ""}
                      onChange={(e) => setRateDrafts({ ...rateDrafts, [m.uid]: e.target.value })}
                    />
                    {isOwner && (
                      <button onClick={() => onChangeRate(m.uid)} className="btn-outline text-xs">Save</button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-text-faint">Current: {formatMoney(m.hourlyRateCents ?? 0)}/hr</p>
                </div>
                <div className="col-span-12 sm:col-span-2 text-right">
                  {isOwner && m.uid !== user?.uid && (
                    <button onClick={() => onToggleActive(m)} className={m.active ? "btn-danger text-xs" : "btn-primary text-xs"}>
                      {m.active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                  {!m.active && <span className="ml-1 pill-bad">Inactive</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="section-title mb-2">Invite a member</p>
        <form onSubmit={onInvite} className="grid grid-cols-12 gap-2">
          <input
            className="input col-span-12 sm:col-span-7"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <select className="input col-span-6 sm:col-span-3" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="worker">Worker</option>
            <option value="manager">Manager</option>
            {isOwner && <option value="owner">Owner</option>}
          </select>
          <button type="submit" disabled={busy} className="btn-primary col-span-6 sm:col-span-2">{busy ? "…" : "Invite"}</button>
        </form>
        {recentInvites.length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {recentInvites.map((inv) => (
              <li key={inv.id} className="flex justify-between py-1.5">
                <span>{inv.email}</span>
                <span className="text-xs text-text-faint">{inv.role} · {inv.status}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-text-faint">
          Share the sign-up URL with the invitee. Once they create an account with this email, they'll see the
          pending invite on their onboarding screen and can accept it.
        </p>
      </div>
    </div>
  );
}
