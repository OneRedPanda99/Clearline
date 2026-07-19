# Clearline

Pressure washing CRM, mobile-first PWA for managing customers, jobs, estimates, invoices, expenses, and customer SMS.

## Setup

1. Copy `config.example.js` to `config.js`
2. Fill in your Firebase and Google Maps API credentials
3. Serve the files (any static server or GitHub Pages)
4. (Optional) Deploy Cloud Functions + Storage rules for receipt OCR and Twilio/Hermes SMS — see [FUNCTIONS.md](FUNCTIONS.md)

## Features

- Customer management with search and VCF import
- Job tracking: Leads → Quoted → Scheduled → Completed
- Estimate and invoice generation
- Google Calendar sync
- Cloud sync via Firebase
- Offline-first PWA with localStorage + Firestore
- Price calculator and pre-job checklist
- Before/after photo capture
- **Receipt scan / batch upload** → vendor, date, total, tax category (Money)
- **Customer SMS** via Twilio with Nous Hermes draft/approve (or auto-reply)
- Scheduled SMS reminders (day-before, quote follow-up, payment)

## Security note

Twilio, Gemini, and OpenRouter keys belong in Cloud Functions environment only. Do not add them to `config.js`.
