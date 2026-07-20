# Clearline

Pressure washing CRM, mobile-first PWA for managing customers, jobs, estimates, and invoices.

UI follows **[Material Design 3 foundations](https://m3.material.io/foundations)** (design tokens, surface containers, 48dp touch targets, state layers) with Clearline’s electric brand mapped onto M3 color roles — see `app.css`.

## Setup

1. Copy `config.example.js` to `config.js`
2. Fill in your Firebase and Google Maps API credentials
3. Serve the files (any static server or GitHub Pages)

## Features

- Customer management with search and VCF import
- Job tracking: Leads → Quoted → Scheduled → Completed
- Estimate and invoice generation
- Google Calendar sync
- Cloud sync via Firebase
- Offline-first PWA with localStorage + Firestore
- Price calculator and pre-job checklist
- Before/after photo capture
- Material Design 3 across the CRM (tokens, buttons, fields, chips, lists, sheets, nav, job hub)
- Expenses: receipt-tracking backend UI (`expenses.html`) — list/review/summary, inline
  editing, and a receipt photo viewer, wired to a separate FastAPI service via
  `expensesApi` config (see `config.example.js`).
