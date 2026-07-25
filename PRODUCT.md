# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA (manifest.json, service worker), built mobile-first and used primarily on a phone in the field. Static HTML pages, no build step, Firebase Auth + Firestore for data.

## Users

- **Owner** (the operator of SC Pressure Point, Columbia SC). Runs the whole business from the app. Ranked daily jobs-to-be-done, most to least: (1) write estimates for new leads, (2) schedule jobs and assign crew, (3) check today's jobs, (4) chase money. All four are used regularly — none is an edge case.
- **Managers** — run their own crew's jobs and assignments.
- **Workers** — see the jobs they're assigned to, run the on-site timer, take before/after photos.
- **Salesmen** — sell work and earn a commission percentage of the job total rather than an hourly wage. Today they exist as a worker with the `isSalesman` permission and `payType: commission`.
- **Intern** — a role the owner wants to add so an intern can be given a limited slice of work. Not built yet.

Role is stored on `users/{uid}.role` (owner | manager | worker) and refined by permission flags: `canCreateJobs`, `canCreateCustomers`, `canEditOwnJobs`, `canEditOwnCustomers`, `canAttachJobToCustomer`, `canViewCalendar`, `canViewMap`, `isEstimator`, `isSalesman`.

## Product Purpose

One app to run a pressure-washing business end to end: capture a lead, price it, schedule it, dispatch a crew, do the work, document it, bill it, and know what it earned. Success is the owner never needing a second tool (or paper) between a phone call and getting paid.

## Positioning

Field-service software sized to a small owner-operated crew rather than an enterprise. Two things the generic competition doesn't do:

- **Pricing that knows the trade.** Estimates are computed from square footage, surface type, and a per-surface production rate, and the same math drives the internal cost picture (time, fuel gallons, chemical) — one shared model in `CL_JOB_ECON`, not a separate calculator.
- **Job-level economics.** Any job shows estimated revenue against real labor cost, pulling the assigned crew's actual pay rate and a salesman's commission percentage, so margin is visible per job before it's worked.

## Operating Context

- Used one-handed on a phone, outdoors, often mid-job. Bottom tab bar; large tap targets.
- Money is owner-only and hidden from every other role at the data layer (`getJobDisplayTotal` returns 0 for non-owners), not just in the UI.
- A job is the spine of the product. Estimates, invoices, waivers, photos, chat, timer, and payments all hang off a job record (`job.documents`).
- Documents (estimate / invoice / waiver) are generated as printable HTML, shared by print-to-PDF, email, or copied text.
- Firestore reads are scoped by a denormalized `accessUids` array on each job.
- Business-wide numbers (furniture-moving fee, default labor rate, default $/sqft, service types, job categories) come from the Settings page, stored under `cl-settings`.

## Terminology

Job, lead, estimate, invoice, waiver, crew, dirt level, surface type, sq ft, per-sqft price, deduction (negative-area line), accessUids.

## Constraints

- No build step. Plain HTML/CSS/JS per page, shared `app.css` + `utils.js`, Tailwind via CDN. Any change must keep working as static files served from GitHub Pages.
- Firestore security rules are hand-published from `firestore.rules`; client query shapes and rules must stay matched.
- `config.js` holds secrets and is gitignored.

## Open Decisions

- Intern role: permissions and what they're allowed to see are not yet decided.
