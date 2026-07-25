# Firebase / Firestore work items

Everything below is server-side: `firestore.rules` (hand-published in Firebase Console → Firestore → Rules) and the shape of the `users` collection. The client code in this repo is already written against the intended behavior.

Context: static HTML PWA, Firebase Auth + Firestore v9 compat. Roles live on `users/{uid}.role` (`owner` | `manager` | `worker`) plus boolean permission flags on `users/{uid}.permissions`. Each job carries a denormalized `accessUids` array (owner + creator + assigned manager + every crew worker) so job reads are provable without a `get()`.

---

## 1. Workers get `permission-denied` listing jobs

**Symptom:** a worker signs in fine (`users/{uid}` and `customers` both read successfully), then every jobs read fails:

```
worker-home.html:170  FirebaseError: Missing or insufficient permissions.
[CL_FIREBASE] snapshot listener error: jobs permission-denied
[CL_FIREBASE] syncFromCloud failed: Error jobs: permission-denied
```

**Every client query for jobs is this exact shape**, for all roles (`firebase-sync.js`, `worker-home.html`, `manager-home.html`, `manager-panel.html`):

```js
db.collection('jobs').where('accessUids', 'array-contains', uid)
```

**Suspected cause:** the `allow list` rule on `/jobs/{id}` gained an `isOwner()` branch (commit `09d5573`). `isOwner()` resolves through `get()`/`exists()` on `users/{uid}`. The rule reads:

```
allow list: if signedIn()
  && ((resource.data.accessUids is list && uid() in resource.data.accessUids)
      || isOwner());
```

Before that commit the rule was the document-read-free version below, and workers worked:

```
allow list: if signedIn()
  && resource.data.accessUids is list
  && uid() in resource.data.accessUids;
```

**What we need:** the jobs list query working for `worker` and `manager` roles. Please confirm whether a `get()`-dependent branch in a `list` rule is what rejects the filtered query, and land whichever shape is actually correct. If the document-read-free version is the fix, note the consequence in item 2.

**Ordering caution:** the owner currently relies on the `isOwner()` branch to run an *unfiltered* `db.collection('jobs').get()` in `backfill-accessuids.html`. That backfill must be run (as owner) to stamp `accessUids` on legacy jobs **before** the permissive branch is removed, or those jobs become unreadable by everyone.

---

## 2. Managers can't remove a worker from a crew

Crew assignment now happens on the job detail screen in `jobs.html` (previously only in the Team panel). Saving a crew writes `assignedWorkers` and re-stamps `accessUids`.

The update rule gates non-owners on:

```
function accessUidsPreservedOrOwner() {
  return isOwner()
    || (request.resource.data.accessUids is list
        && resource.data.accessUids is list
        && request.resource.data.accessUids.hasAll(resource.data.accessUids));
}
```

`hasAll(old)` means a non-owner can only ever **add** readers. A manager taking a worker off a job produces a smaller `accessUids`, so the write is denied. Owner is unaffected.

**What we need:** let a manager (and any role with `canEditOwnJobs` on a job they're on) change crew in both directions, without letting them lock other people out. Suggested shape — validate consistency rather than monotonic growth:

- the new `accessUids` must still contain the owner uid, the job's `createdBy`, and the job's `assignedManager`;
- the new `accessUids` must equal the set implied by the new `assignedWorkers` plus those protected uids;
- a manager still may only touch jobs where `resource.data.assignedManager == uid()`.

**Decided: hardcode the owner uid in the rules.** A Firebase uid is not a credential — it already ships to the browser in `config.js` as `CL_SECRETS.ownerUid`. Hardcoding keeps the hot path free of document reads (the whole reason item 1 exists) and guarantees the owner can never be locked out of their own data by a bad `accessUids` write:

```
function ownerUid() { return "<paste CL_SECRETS.ownerUid here>"; }
```

Leave a comment on that line saying it must be re-published if the owner account ever changes. Use it as the protected-reader anchor above; keep the existing role checks for everything else rather than making this uid the only authorization mechanism.

---

## 3. New `intern` role

We want an `intern` role alongside owner / manager / worker. **It needs less than it first looks like** — an intern is a worker for data-access purposes, and what they're actually allowed to do is already driven by the per-user `permissions` flags the owner toggles in the Team panel (`canCreateJobs`, `canCreateCustomers`, `canEditOwnJobs`, `canEditOwnCustomers`, `canViewCalendar`, `canViewMap`, `isEstimator`, `isSalesman`). We do not want a second hardcoded capability matrix in the rules that can drift from those flags.

Two changes needed:

**a. Accept the role.** Provisioning is hard-limited to two values today:

```
function ownerProvisioningUser() {
  return isOwner()
    && request.resource.data.createdBy == uid()
    && request.resource.data.role is string
    && request.resource.data.role in ["manager", "worker"];
}
```

Add `"intern"`.

**b. Don't strand them.** `isWorker()` is an exact match:

```
function isWorker() { return signedIn() && role() == "worker"; }
```

With role `intern`, `isWorker()` and `isManager()` are both false, so the `/jobs/{id}` update rule rejects an intern on every branch — they'd be able to read a job and change nothing. Make intern satisfy the worker branch, e.g. `role() == "worker" || role() == "intern"`, or add an explicit parallel branch if you'd rather keep them separately auditable.

Everything else already falls out and needs no new rules:

- job reads scoped by `accessUids`, same as a worker;
- creates gated by `perm("canCreateJobs")` / `perm("canCreateCustomers")` — leave those flags off and an intern can't create;
- deletes on jobs and customers are already `isOwner()` only;
- `expenses` and `payroll` are already `allow read, write: if isOwner()`, so an intern can never read money;
- job dollar amounts are additionally zeroed client-side for every non-owner role by `getJobDisplayTotal()`.

---

## 4. Sanity check on the `get` rule

Single-doc reads still allow legacy fallbacks:

```
allow get: if signedIn()
  && (resource.data.accessUids is list && uid() in resource.data.accessUids
      || resource.data.assignedWorkers is list && uid() in resource.data.assignedWorkers
      || resource.data.assignedTo == uid()
      || resource.data.createdBy == uid()
      || resource.data.assignedManager == uid());
```

Once the backfill in item 1 has run, the `assignedWorkers` / `assignedTo` fallbacks are dead weight. Fine to drop them if you'd rather have one code path — just don't drop them before the backfill.


---

## 5. Intern capabilities (follow-up to item 3)

The intern's actual job is now defined: **schedule jobs, message clients, and basic bookkeeping.** Client-side permission flags are in place (`canScheduleJobs`, `canMessageCustomers`, `canLogExpenses`) and the UI honors them, but two of the three hit a rules wall.

**a. Scheduling other people's jobs.** The `/jobs/{id}` update rule lets crew edit only jobs where `resource.data.createdBy == uid()` or they're on `assignedWorkers`. An intern scheduling the crew's work is neither. We need an intern (or anyone with a `canScheduleJobs` flag) to be able to write `jobDate` / `jobTime` / `status` on jobs in their `accessUids`, without gaining the ability to rewrite pricing, crew, or `accessUids`. A field-scoped update rule is what we're after.

**b. Basic bookkeeping.** `expenses` is `allow read, write: if isOwner()`, so an intern cannot log a receipt. We'd like an intern to be able to **create** expense documents (and read back the ones they created) while `payroll` and the P&L stay owner-only. Suggest gating on the user's `canLogExpenses` flag, with `createdBy == uid()` required on create and no update/delete for non-owners.

**c. Messaging** needs nothing from you — it's client-side plus the existing job read scope.

Until (a) and (b) land, an intern's UI shows the buttons and Firestore rejects the write. Tell us if you'd rather we hide those controls until the rules are deployed.
