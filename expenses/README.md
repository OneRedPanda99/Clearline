# Clearline Expenses — local receipt pipeline

This folder turns phone receipt photos (uploaded via the Cloudflare Worker to
R2) into a **CSV committed to the Clearline GitHub repo**, which the
`expenses.html` page in Clearline reads. No server, no API, no tunnel — the
"backend" is this script running on your Windows PC.

## How it works

```
Phone → Worker (X-Upload-Key) → R2 (photo + note)
        │
This PC (scheduled): process_receipts.py
   1. list + download new R2 objects → expenses/images/
   2. local vision model (Ollama llama3.2-vision) reads each receipt
   3. append a row to expenses.csv
   4. git add + commit + push
        │
Clearline expenses.html → fetch raw expenses.csv → list/detail/review/summary
```

## Setup (one time)

1. **Install Ollama** from https://ollama.com and pull the vision model:
   ```
   ollama pull llama3.2-vision
   ```
   (A 3080 runs the 11B Q4 build comfortably. Moondream/Qwen2-VL also work —
   change `OLLAMA_MODEL` in `.env`.)

2. **Create `expenses/.env`** from `.env.example`. Fill in the two R2 secrets
   (create an R2 API token with Read/Edit on the `receipts` bucket in the
   Cloudflare dashboard → R2 → Manage API tokens):
   ```
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   ```
   The account id, endpoint, bucket, and CSV URL are pre-filled.

3. **Run it** (manually, or schedule it):
   ```
   python process_receipts.py
   ```
   Schedule `run_once.bat` with Windows Task Scheduler every 15 minutes for
   hands-off operation. The first run needs `git push` access — GitHub Desktop
   already provides credential storage, so it should just work.

## Fixing a misread (corrections)

The CSV is the pipeline's source of truth (committed from this PC). If a receipt
is misread, you have two options:

- **In the browser** (`expenses.html`): edit vendor/total/category inline. The
  fix is saved to `localStorage` and shown immediately. It also writes a
  `corrections.json`-shaped entry so the next pipeline run can bake it into the
  CSV permanently (the PC script reads `expenses/corrections.json`).
- **Directly**: add to `expenses/corrections.json`:
  ```json
  { "exp_3": { "vendor": "Shell Gas", "total": "70.00", "category": "Fuel" } }
  ```
  and run the pipeline — it applies the correction and recommits.

## Verification

```
python process_receipts.py --selftest   # offline test, no R2/Ollama/git needed
python process_receipts.py --dry-run    # list+OCR without writing/pushing
```

## Files

- `process_receipts.py` — the pipeline (stdin stdlib only; Ollama is a separate app)
- `expenses.csv` — the data (header only until receipts are processed)
- `processed.json` — tracks which R2 objects were already handled
- `corrections.json` — manual edits to apply on the next run
- `images/` — downloaded receipt photos (gitignored)
- `.env` — your R2 secrets (gitignored; never commit)
