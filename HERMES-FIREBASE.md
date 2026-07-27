# Firebase / Firestore work items

Status as of 2026-07-26. `firestore.rules` in this repo matches what is deployed.

Context: static HTML PWA, Firebase Auth + Firestore v9 compat. `users/{uid}.role` is `owner | manager | worker | intern` and drives **read scope**; the boolean flags in `users/{uid}.permissions` drive **what someone may write**. Jobs carry a denormalized `accessUids` array so reads are provable without a `get()`.

---

## Done

- **Worker jobs `permission-denied`** — the `get()`-dependent `isOwner()` branch in the jobs `list` rule was rejecting filtered `array-contains` queries. The list rule is now read-free and workers can list. The `is list` type check is deliberately absent from that rule; adding it back re-breaks the query.
- **Managers couldn't shrink a crew** — `hasAll(existing)` meant non-owners could only ever add readers. `accessUidsConsistent()` replaced it with a set-equality check, so removing a worker is allowed while the Owner, creator, and assigned manager can never be dropped.
- **`intern` role** — accepted in `ownerProvisioningUser()`, and `isCrew()` groups worker + intern so an intern isn't stranded read-only by the exact-match `role() == "worker"` test.
- **Owner identity** — `isOwner()` is now a uid comparison against the hardcoded `ownerUid()`, so the Owner no longer depends on their own user doc being readable.
- **Crew writes** — crew no longer need `canEditOwnJobs` to update a job they're on. This is what powers "Confirm assignment".

---

## Open

### 1. Managers still need `canEditOwnJobs` — same trap that hit Xavier

The crew branch dropped the flag requirement, but the manager branch kept it:

```
|| (accessUidsConsistent()
    && request.resource.data.createdBy == resource.data.createdBy
    && ((isManager()
          && perm("canEditOwnJobs")          // <-- still required
          && resource.data.assignedManager == uid())
        || (isCrew() && (...))))
```

`canEditOwnJobs` is only a **local default in `firebase-sync.js`** — it is not written to Firestore user docs. Any manager provisioned without it ticked will hit `permission-denied` editing a job they manage, exactly as Xavier did on Confirm. Either drop the flag from the manager branch (crew already works this way, and `accessUidsConsistent()` is doing the real protection), or make provisioning write the flag.

### 2. Interns can't do two of the three things their role is for

The intern's job is **schedule jobs, message clients, basic bookkeeping.** Client flags (`canScheduleJobs`, `canMessageCustomers`, `canLogExpenses`) exist and the UI honors them, but:

- **Scheduling other people's jobs.** The update rule only lets crew edit jobs where `createdBy == uid()` or they're on `assignedWorkers`. An intern scheduling the crew's work is neither. We want a field-scoped path: write `jobDate` / `jobTime` / `status` on any job in their `accessUids`, without touching pricing, crew, or `accessUids`.
- **Bookkeeping.** `expenses` is `allow read, write: if isOwner()`, so an intern can't log a receipt. Suggest gating create on `perm("canLogExpenses")` with `createdBy == uid()` required, no update/delete for non-owners, and `payroll` staying owner-only.

Messaging needs nothing — it's client-side plus the existing job read scope.

Until these land, an intern sees the buttons and Firestore rejects the write.

### 3. The backfill tool can no longer run

`backfill-accessuids.html` does an unfiltered `db.collection('jobs').get()`. The list rule is now `uid() in resource.data.accessUids` with no Owner escape hatch, so the tool is dead — including for the Owner. If a job ever loses `accessUids` it is invisible to everyone with no way to repair it from the app.

Options: give the Owner a read-free list branch (`uid() == ownerUid()` is provable without a document read, unlike the old `isOwner()` role lookup), or accept that repairs happen from the Firebase console.

---

## Gotchas

- `git push` does **not** deploy rules. Console → Publish, or `firebase deploy --only firestore:rules`.
- `perm(flag)` blanket-allows the **Owner only**. Managers get nothing for free — any UI shown to a manager whose write depends on a flag must check that same flag client-side, or it's another Xavier. `index.html` was corrected on 2026-07-26 to gate the Estimate action on `canUseEstimateForm` for this reason.
