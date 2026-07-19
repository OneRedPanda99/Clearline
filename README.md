# Clearline

Pressure washing CRM, mobile-first PWA for managing customers, jobs, estimates, and invoices.

## Setup

1. Copy `config.example.js` to `config.js`
2. Fill in your Firebase and Google Maps API credentials
3. In Firebase Console → Authentication → Sign-in method, enable **Google** and **Email/Password**
4. Deploy Firestore rules from `firestore.rules`
5. (Recommended) Deploy Cloud Functions for team password resets — see [TEAM-ACCOUNTS.md](TEAM-ACCOUNTS.md)
6. Serve the files (any static server or GitHub Pages)

## Features

- Customer management with search and VCF import
- Job tracking: Leads → Quoted → Scheduled → Completed
- Estimate and invoice generation
- Google Calendar sync
- Cloud sync via Firebase
- Offline-first PWA with localStorage + Firestore
- Price calculator and pre-job checklist
- Before/after photo capture
- **Team accounts** — Owner creates manager/worker usernames + passwords (More → Team)

## Team logins

Owners create crew accounts under **More → Team**. Workers and managers sign in with username + password on the Sign In screen. Details: [TEAM-ACCOUNTS.md](TEAM-ACCOUNTS.md).
