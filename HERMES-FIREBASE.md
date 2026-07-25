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

Open question for you: the owner uid isn't currently available to the rules (it lives client-side in `CL_SECRETS.ownerUid`, and `config.js` is gitignored). Either hardcode it in the rules or expose it somewhere the rules can read cheaply — your call on which is cleaner.

---

## 3. New `intern` role

We want to add an `intern` role alongside owner / manager / worker. Rules currently hard-limit provisioning to two values:

```
function ownerProvisioningUser() {
  return isOwner()
    && request.resource.data.createdBy == uid()
    && request.resource.data.role is string
    && request.resource.data.role in ["manager", "worker"];
}
```

**What we need:** `"intern"` accepted as a role. Treat interns as read-mostly: same job scoping as a worker via `accessUids`, but they should not be able to create or delete jobs or customers, and must never read `expenses` or `payroll`. Exact permission set isn't decided yet — flag what you need from us.

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
