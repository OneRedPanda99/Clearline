# Clearline Cloud Functions

Receipt OCR (Gemini), Twilio SMS, and Nous Hermes drafts run in Firebase Cloud Functions. **Never put these secrets in `config.js` or GitHub Pages.**

## Prerequisites

1. Firebase project with **Blaze** (Functions + Storage)
2. Enable **Cloud Storage**, **Cloud Functions**, and deploy rules:
   ```bash
   firebase deploy --only firestore:rules,storage,functions
   ```
3. From `functions/`:
   ```bash
   npm install
   ```

## Secrets / environment

Copy `functions/.env.example` → `functions/.env` for the emulator, or set params for production:

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google AI Studio key for receipt OCR |
| `GEMINI_MODEL` | Optional, default `gemini-2.0-flash` |
| `OPENROUTER_API_KEY` | OpenRouter key for Nous Hermes |
| `HERMES_MODEL` | Optional, default `nousresearch/hermes-4-70b` |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | E.164 sending number |
| `TWILIO_WEBHOOK_URL` | Public URL of `smsInbound` (signature check) |
| `TWILIO_SKIP_SIGNATURE` | `1` only for local testing |
| `REMINDER_TZ` | Timezone for reminder schedule (default `America/New_York`) |

Example (Firebase Functions gen1 env / Secret Manager — adjust to your CLI version):

```bash
firebase functions:config:set \
  clearline.gemini_api_key="..." \
  clearline.openrouter_api_key="..." \
  clearline.twilio_account_sid="..." \
  clearline.twilio_auth_token="..." \
  clearline.twilio_phone_number="+1..."
```

Or set process env / secrets when deploying. The code reads `process.env.*` first.

## Twilio webhook

Point the Twilio phone number’s **A MESSAGE COMES IN** webhook to:

`https://us-central1-YOUR_PROJECT.cloudfunctions.net/smsInbound`

Method: `HTTP POST`.

## Client wiring

- `config.js` may set `functionsRegion` (default `us-central1`) — no API secrets.
- Money → **Scan receipts** uploads to `receipts/{uid}/{expenseId}.jpg` then calls `parseReceipt`.
- Job chat uses `smsThreads` + `sendSms` / `approveDraft` / `generateHermesDraft`.
- Settings → **Customer SMS** writes `smsReplyMode`, `smsRemindersEnabled`, `quoteFollowUpDays` to `settings/global`.

## Reminder jobs

`runSmsReminders` runs hourly and may send:

- Day-before appointment (scheduled jobs)
- Quote follow-up after N days
- Payment nudge for completed unpaid jobs (3+ days)

Flags on the job doc (`smsReminder_dayBefore`, etc.) prevent duplicates.

## Home server (deferred)

Paths and IDs (`receipts/{uid}/…`, `expenses`, `smsThreads`, `customers`) are stable so a later home NAS sync agent can mirror Storage + Firestore without reshaping data.
