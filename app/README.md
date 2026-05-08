# Clearline (SPA rebuild)

Single-page app for Clearline — a Jobber-like field-service operations platform with multi-tenant orgs, jobs, customers, estimates, invoices, expenses, taxes, profit, and payroll.

## Stack
- Next.js (App Router) · TypeScript · Tailwind CSS
- Firebase (Auth · Firestore · Storage)
- Framer Motion · TanStack React Query · Zustand (light UI state)

## Modules
- `Home` — today's schedule, pipeline, unpaid invoices, monthly summary
- `Jobs` — Leads / Scheduled / In progress / Completed; detail page with timer, notes, photos, profit summary
- `Customers` — list with search, detail with full history and totals
- `Money`
  - `Revenue` — invoice list + detail + record payment
  - `Expenses` — fast logging with category, job link, receipt upload
  - `Profit` — per-job and overall margin dashboards
  - `Taxes` — Schedule C grouped report + CSV export
  - `Estimates` — list, create, convert to invoice
  - `Payroll` — period builder from job timers + manual hours, Gusto CSV export
- `Team` — members, roles, invites, hourly rates
- `Settings` — business info, document numbering, default labor rate, tax categories, migration

## Setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Create a Firebase project. In the console, enable:
   - Authentication → Email/Password (and Google later if desired)
   - Firestore in production mode
   - Storage
3. Copy `.env.local.example` to `.env.local` and fill in values from the Firebase project's web app config.
4. Deploy security rules and indexes:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add   # pick the project
   npm run deploy:rules
   ```
5. Run dev:
   ```bash
   npm run dev
   ```
6. Visit `http://localhost:3000`. Sign up. Create your organization. Optionally run **Settings → Migrate legacy data** to import old `customers`/`jobs` collections.

## Data model
All business data is org-scoped:

```
orgs/{orgId}/
  members/{uid}
  customers/{customerId}
  jobs/{jobId}
  estimates/{estimateId}
  invoices/{invoiceId}
  expenses/{expenseId}
  payruns/{payrunId}
  taxCategories/{taxCategoryId}
  settings/global

users/{uid}                 (private prefs only)
invites/{inviteId}          (cross-org pending invites by email)
```

## Roles
- **Owner** — full access, finance, team management.
- **Manager** — CRUD jobs/customers/expenses, no team or org settings.
- **Worker** — see assigned jobs only; can update timer, notes, photos, status.

## Migration
- `Settings → Migrate legacy data` imports from the legacy top-level Firestore collections (`customers`, `jobs`) created by the old static HTML app.
- It can also import this browser's `cl-customers` / `cl-jobs` localStorage as a fallback.
- Existing docs are merged — newer fields are not overwritten by older legacy data.

## Profitability math
For a given job:
- Revenue = sum of `paidAmountCents` on linked invoices.
- COGS = sum of `expenses` linked to this job where `kind` is `cogs` or `payroll`.
- Labor cost = sum over each contributor of `(minutes / 60) * memberRateCents` (falls back to org default rate).
- Net = Revenue − COGS − LaborCost.
- Margin = Net / Revenue (when revenue > 0).

Monthly totals are computed by date-bucketed payments and expenses (regardless of job linkage).

## Payroll
- Hours come from `job.laborMinutesByUid` for jobs whose `jobDate` falls in the period, plus manual hours typed in the payrun preview.
- Overtime threshold is fixed at 40h/week; OT pays at 1.5×. Rates are per-member or fall back to org default.
- Save as draft, then export Gusto-friendly CSV.

## Notes
- The legacy HTML app (in the parent folder) remains untouched. Once the rebuild is verified, archive it under `legacy/`.
- Real-time updates use Firestore snapshots; lists only re-render when underlying ids/`updatedAt` change so the UI stays stable.
