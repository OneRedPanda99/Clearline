# Clearline v1 — Product spec & acceptance criteria

The new Clearline app is a Jobber-like field-service operations platform for a small services business (initially pressure washing). It runs as a **single-page app** (Next.js App Router) backed by **Firebase** (Auth + Firestore + Storage), with **multi-tenant org** scoping and role-based access.

## Personas

- **Owner** — runs the business. Sees everything, including money. Manages members, taxes, settings.
- **Manager** — schedules jobs, manages customers and expenses; limited finance.
- **Worker** — sees assigned jobs, logs time, uploads photos, marks complete. No finance.

## Top-level modules (left nav / bottom tabs)

1. **Home** — today's schedule, next job hero, pipeline summary, unpaid invoices, follow-ups.
2. **Jobs** — Leads / Scheduled / In progress / Completed (Kanban + list).
3. **Customers** — searchable list, customer detail with full history.
4. **Money** — Revenue, Expenses, Profit, Taxes (sub-pages).
5. **Team** — members, roles, invites; payroll tracking.
6. **Settings** — business info, tax categories, defaults.

## Navigation feel (Jobber-like)

- Single app shell, no full reloads.
- Persistent left rail on desktop, bottom tabs on mobile.
- Route transitions via Framer Motion (subtle fade/slide).
- Skeleton loading states; never blank-flash.
- Optimistic updates for create/edit; revert on failure.
- Drawers/sheets for create/edit instead of full pages where appropriate.
- Forms autosave drafts to localStorage.

## Data model (Firestore, org-scoped)

```
orgs/{orgId}
  members/{uid}              role, active, permissions, displayName
  customers/{customerId}     name, phone, email, address, tags, totals
  jobs/{jobId}               customerId, status, schedule, assignedTo,
                             revenue (collected), labor (minutesByUid),
                             notes[], photos[]
  estimates/{estimateId}     jobId?, customerId, lines[], totals, status
  invoices/{invoiceId}       jobId?, customerId, lines[], totals,
                             paymentStatus, payments[]
  expenses/{expenseId}       date, vendor, amount, taxCategoryId,
                             jobId?, payeeUid?, kind (cogs|overhead|payroll),
                             receiptStorageRef
  payruns/{payrunId}         period, lines[], totals, status (draft|exported)
  taxCategories/{taxCategoryId}  label, scheduleCLine, kind, default
  settings/global            businessName, address, defaults

users/{uid}                  displayName, email, lastOrgId, prefs
invites/{inviteId}           orgId, email, role, status, createdBy
```

## Acceptance criteria

### Foundations

- Sign-in via email/password (Google optional). New user is prompted to **create or join an org**.
- Org owner can invite members by email; invite enforces role on accept.
- All pages render through a single shell; no full page reloads between modules.
- Firestore rules block any cross-org access; rules tested locally with the emulator.

### Customers / Jobs

- Customer create/edit in <30 seconds.
- Customer detail shows: contact, address, all jobs, all invoices/estimates, total revenue, total profit.
- Job has lifecycle: lead → scheduled → in-progress → completed. Status changes are one-click.
- Job detail: customer link, schedule, assignedTo, notes (timestamped), photos (Storage), labor timer.

### Money

- **Revenue**: monthly chart and table; filter by status (paid/unpaid/partial); driven by invoices.
- **Expenses**: log expense in <10 seconds. Required: date, amount, category. Optional: vendor, job link, receipt photo, notes.
- **Profit**: per-job and per-month profit = collected − (job expenses + labor cost). Per-month overhead allocated proportionally only in reports view.
- **Taxes**: expense totals grouped by Schedule C line; CSV export per year.

### Tax categories (seeded defaults — Schedule C)

- Advertising (Line 8)
- Car & truck expenses (Line 9)
- Contract labor (Line 11)
- Insurance other than health (Line 15)
- Legal & professional services (Line 17)
- Office expense (Line 18)
- Rent or lease — vehicles, machinery, equipment (Line 20a)
- Repairs & maintenance (Line 21)
- Supplies (Line 22) — chemicals, soaps
- Taxes & licenses (Line 23)
- Travel (Line 24a)
- Meals (Line 24b, 50%)
- Utilities (Line 25)
- Wages (Line 26)
- Equipment (Capital — Form 4562)
- Fuel — Gas (Line 9 sub) — separate visibility for COGS
- Other expenses (Line 27a)

Each `expense` references `taxCategoryId` so re-categorization just updates the category doc.

### Payroll (lite)

- Track hours by member from job timers and manual entries.
- Compute pay per period (rate × hours) and print/export CSV (Gusto-friendly columns: name, email, regular hours, OT hours, period start/end).

### Profit margin per job

- Job detail panel shows: Revenue (collected), Expenses (sum of linked expenses, COGS only), Labor cost, **Net profit** and margin %.
- Dashboard list: jobs with lowest margin highlighted.

### Performance / UX correctness

- No constant visual refresh. Lists only re-render when underlying data has changed (signature compare or Firestore snapshot diffs).
- Forms validate inline, show field-level errors, never lose data on accidental navigation.
- Mobile first. Tested at 360 px width.
- Offline-friendly: critical reads cached via Firestore persistence; create/update queued offline.

## Out of scope for v1

- Real Gusto API integration (CSV export only).
- Customer portal / public payment links.
- Route optimization.
- SMS automation.
