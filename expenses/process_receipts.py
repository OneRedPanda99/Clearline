#!/usr/bin/env python3
"""
Clearline Expenses — local receipt processing pipeline (Windows).

Flow:
  Cloudflare R2 (photo + note metadata)  ──▶  this PC downloads new images
      ──▶ local vision model (Ollama llama3.2-vision) reads each receipt
      ──▶ structured fields appended to expenses/expenses.csv
      ──▶ git add + commit + push  (so Clearline's expenses.html can read it)

The UI (expenses.html) fetches the committed CSV from GitHub raw — no server
needed. This script is the only "backend"; it runs on this PC on a schedule
(recommended: Windows Task Scheduler every 15 min, or manually).

Config: expenses/.env  (gitignored). See expenses/.env.example.

Usage:
  python process_receipts.py            # normal run (pull, OCR, commit)
  python process_receipts.py --dry-run  # don't write CSV / don't push
  python process_receipts.py --selftest # offline test w/ mock R2 + mock Ollama
"""
from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------- paths -----
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent                      # .../Clearline
CSV_PATH = HERE / "expenses.csv"
IMAGES_DIR = HERE / "images"
PROCESSED_PATH = HERE / "processed.json"     # {r2_key: {status, csv_row_id, note, error}}
CORRECTIONS_PATH = HERE / "corrections.json" # user edits: {row_id: {field: value}}
STATE_VERSION = 1

# ---------------------------------------------------------------- config ----
def load_env() -> dict:
    env = {}
    p = HERE / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

ENV = load_env()

R2_ACCOUNT_ID = ENV.get("R2_ACCOUNT_ID", "3261542f255f7b68f5abae34a07bf893")
R2_BUCKET = ENV.get("R2_BUCKET", "receipts")
R2_ENDPOINT = ENV.get("R2_ENDPOINT",
                      f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com")
R2_ACCESS_KEY = ENV.get("R2_ACCESS_KEY_ID", "")
R2_SECRET = ENV.get("R2_SECRET_ACCESS_KEY", "")
R2_PREFIX = ENV.get("R2_PREFIX", "receipts/")  # where the Worker stores photos

OLLAMA_URL = ENV.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = ENV.get("OLLAMA_MODEL", "llama3.2-vision")
OLLAMA_TIMEOUT = int(ENV.get("OLLAMA_TIMEOUT", "120"))

# GitHub raw URL the UI fetches. Override in .env if the repo/path differs.
DEFAULT_CSV_URL = ("https://raw.githubusercontent.com/OneRedPanda99/Clearline/"
                   "main/expenses/expenses.csv")
CSV_URL = ENV.get("EXPENSES_CSV_URL", DEFAULT_CSV_URL)

CSV_COLUMNS = [
    "id", "vendor", "purchase_date", "items", "subtotal", "tax", "total",
    "note", "category", "status", "r2_key", "photo", "created_at", "updated_at",
]

# ----------------------------------------------------------------- state ----
def load_processed() -> dict:
    if PROCESSED_PATH.exists():
        try:
            data = json.loads(PROCESSED_PATH.read_text(encoding="utf-8"))
            if data.get("_v") == STATE_VERSION:
                return data
        except Exception:
            pass
    return {"_v": STATE_VERSION, "items": {}}

def save_processed(state: dict) -> None:
    state["_v"] = STATE_VERSION
    PROCESSED_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")

def load_corrections() -> dict:
    if CORRECTIONS_PATH.exists():
        try:
            return json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

# ----------------------------------------------------------- R2 helpers ----
def _r2_headers(method: str, key: str, body: bytes = b"", content_type: str = "") -> dict:
    """Minimal AWS SigV4 for R2 (S3-compatible). No boto dependency."""
    import hashlib
    import hmac

    assert R2_ACCESS_KEY and R2_SECRET, "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set in .env"
    t = datetime.now(timezone.utc)
    amzdate = t.strftime("%Y%m%dT%H%M%SZ")
    datestamp = t.strftime("%Y%m%d")
    region = "auto"
    service = "s3"
    host = R2_ENDPOINT.replace("https://", "")

    payload_hash = hashlib.sha256(body).hexdigest()

    # canonical request
    ct = content_type or "application/octet-stream"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical = "\n".join([
        method, "/" + key, "",
        f"host:{host}",
        f"x-amz-content-sha256:{payload_hash}",
        f"x-amz-date:{amzdate}",
        "", signed_headers, payload_hash,
    ])
    canonical_hash = hashlib.sha256(canonical.encode()).hexdigest()

    scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join([
        "AWS4-HMAC-SHA256", amzdate, scope, canonical_hash,
    ])
    kdate = hmac.new(("AWS4" + R2_SECRET).encode(), datestamp.encode(), hashlib.sha256).digest()
    kregion = hmac.new(kdate, region.encode(), hashlib.sha256).digest()
    kservice = hmac.new(kregion, service.encode(), hashlib.sha256).digest()
    ksigning = hmac.new(kservice, b"aws4_request", hashlib.sha256).digest()
    signature = hmac.new(ksigning, string_to_sign.encode(), hashlib.sha256).hexdigest()

    auth = (f"AWS4-HMAC-SHA256 Credential={R2_ACCESS_KEY}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}")
    return {
        "Host": host,
        "X-Amz-Date": amzdate,
        "X-Amz-Content-Sha256": payload_hash,
        "Authorization": auth,
        "Accept": "*/*",
    }

def r2_list_objects(prefix: str = R2_PREFIX) -> list[dict]:
    """List objects under prefix. Returns list of {key, size, uploaded_at, note}."""
    out = []
    marker = ""
    while True:
        q = f"?list-type=2&prefix={requests_path_quote(prefix)}"
        if marker:
            q += f"&continuation-token={requests_path_quote(marker)}"
        # GET bucket?list-type=2
        headers = _r2_headers("GET", "")
        import urllib.request
        url = f"{R2_ENDPOINT}/{q}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
        import xml.etree.ElementTree as ET
        root = ET.fromstring(body)
        ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
        for c in root.findall("s:Contents", ns):
            key = c.findtext("s:Key", default="", namespaces=ns)
            size = int(c.findtext("s:Size", default="0", namespaces=ns) or "0")
            out.append({"key": key, "size": size})
        cont = root.find("s:IsTruncated", ns)
        nxt = root.findtext("s:NextContinuationToken", default="", namespaces=ns)
        if cont is not None and cont.text == "true" and nxt:
            marker = nxt
        else:
            break
    return out

def r2_get_object(key: str) -> tuple[bytes, dict]:
    headers = _r2_headers("GET", key)
    import urllib.request
    url = f"{R2_ENDPOINT}/{requests_path_quote(key)}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        meta = dict(resp.headers)
    return data, meta

def requests_path_quote(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="")

# ------------------------------------------------------- vision (Ollama) ----
def ollama_available() -> bool:
    try:
        import urllib.request
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags",
                                     headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status == 200
    except Exception:
        return False

def ollama_extract(image_bytes: bytes, note: str, filename: str = "") -> dict:
    """Ask the local vision model to read the receipt and return structured JSON."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    prompt = (
        "You are a receipt parser. Read this receipt image and return ONLY a JSON "
        "object (no markdown, no commentary) with these exact keys:\n"
        "  vendor: string (store name)\n"
        "  purchase_date: string ISO date 'YYYY-MM-DD' (from the receipt, not upload time)\n"
        "  items: array of {name: string, price: number}\n"
        "  subtotal: number\n"
        "  tax: number\n"
        "  total: number\n"
        "  category: string (one of: Supplies, Chemicals, Fuel, Equipment, Vehicle, "
        "Advertising, Software, Meals, Utilities, Rent, Insurance, Labor, Other)\n"
        "If a field is unreadable, use empty string or 0. Estimate tax = total - subtotal "
        "if not shown. Be precise with numbers.\n"
        + (f"User note about this receipt: {note}\n" if note else "")
    )
    payload = {
        "model": OLLAMA_MODEL,
        "format": "json",
        "stream": False,
        "messages": [
            {"role": "user", "content": prompt,
             "images": [b64]},
        ],
    }
    import urllib.request
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as r:
        data = json.loads(r.read().decode("utf-8"))
    text = data.get("message", {}).get("content", "")
    return parse_model_json(text)

def parse_model_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except Exception:
        # try to find first { ... last }
        s, e = text.find("{"), text.rfind("}")
        if s != -1 and e != -1:
            try:
                return json.loads(text[s:e + 1])
            except Exception:
                pass
    return {}

# ------------------------------------------------------------- CSV I/O -----
def read_csv_rows() -> list[dict]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

def write_csv_rows(rows: list[dict]) -> None:
    # ensure header order
    for row in rows:
        for col in CSV_COLUMNS:
            row.setdefault(col, "")
    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        w.writeheader()
        for row in rows:
            w.writerow({c: row.get(c, "") for c in CSV_COLUMNS})

def next_id(rows: list[dict]) -> str:
    n = 0
    for r in rows:
        try:
            n = max(n, int(str(r.get("id", "")).replace("exp_", "")))
        except Exception:
            pass
    return f"exp_{n + 1}"

# ----------------------------------------------------------- git helpers ----
def git_push(commit_msg: str) -> bool:
    try:
        subprocess.run(["git", "-C", str(REPO_ROOT), "add", "expenses/"],
                       check=True, capture_output=True)
        # only commit if there are staged changes
        diff = subprocess.run(["git", "-C", str(REPO_ROOT), "diff", "--cached", "--quiet"],
                              capture_output=True)
        if diff.returncode == 0:
            return False  # nothing to commit
        subprocess.run(["git", "-C", str(REPO_ROOT), "commit", "-m", commit_msg],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(REPO_ROOT), "push"],
                       check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"[git] push failed: {e}\n")
        return False

# ----------------------------------------------------------- pipeline -------
def process_one(key: str, dry_run: bool) -> dict | None:
    """Download + OCR one R2 object. Returns a CSV row dict, or None to skip."""
    data, meta = r2_get_object(key)
    # R2 custom metadata is lowercased in headers
    note = (meta.get("X-Amz-Meta-Note") or meta.get("x-amz-meta-note") or "").strip()
    orig = (meta.get("X-Amz-Meta-Originalfilename") or
            meta.get("x-amz-meta-originalfilename") or "")
    uploaded_at = (meta.get("X-Amz-Meta-Uploadedat") or
                   meta.get("x-amz-meta-uploadedat") or
                   datetime.now(timezone.utc).isoformat())

    # save local copy (gitignored under images/)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(key).suffix or ".jpg"
    local_path = IMAGES_DIR / (Path(key).name)
    if not dry_run:
        local_path.write_bytes(data)

    if ollama_available():
        parsed = ollama_extract(data, note, orig)
    else:
        parsed = {}

    vendor = str(parsed.get("vendor", "") or "").strip() or "Unknown"
    purchase_date = str(parsed.get("purchase_date", "") or "").strip()
    items = parsed.get("items", []) or []
    # normalize items to {name, price}
    norm_items = []
    for it in items:
        if isinstance(it, dict):
            norm_items.append({"name": str(it.get("name", "")),
                               "price": to_float(it.get("price"))})
        elif isinstance(it, str):
            norm_items.append({"name": it, "price": 0})
    subtotal = to_float(parsed.get("subtotal"))
    tax = to_float(parsed.get("tax"))
    total = to_float(parsed.get("total"))
    if not total:
        total = round((subtotal or 0) + (tax or 0), 2)
    if not subtotal and total:
        subtotal = round(total - (tax or 0), 2)
    category = str(parsed.get("category", "") or "Other").strip() or "Other"
    if category not in CSV_CATEGORIES:
        category = "Other"
    needs_review = (not parsed) or vendor == "Unknown" or not total or not purchase_date
    status = "needs_review" if needs_review else "ok"

    rows = read_csv_rows()
    row = {
        "id": next_id(rows),
        "vendor": vendor,
        "purchase_date": purchase_date or uploaded_at[:10],
        "items": json.dumps(norm_items, ensure_ascii=False),
        "subtotal": f"{subtotal:.2f}" if subtotal else "",
        "tax": f"{tax:.2f}" if tax else "",
        "total": f"{total:.2f}" if total else "",
        "note": note,
        "category": category,
        "status": status,
        "r2_key": key,
        "photo": f"expenses/images/{local_path.name}",
        "created_at": uploaded_at,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return row

CSV_CATEGORIES = {"Supplies", "Chemicals", "Fuel", "Equipment", "Vehicle",
                  "Advertising", "Software", "Meals", "Utilities", "Rent",
                  "Insurance", "Labor", "Other"}

def to_float(v) -> float:
    try:
        return round(float(v), 2)
    except Exception:
        return 0.0

def apply_corrections(rows: list[dict]) -> list[dict]:
    corrections = load_corrections()
    if not corrections:
        return rows
    by_id = {r.get("id"): r for r in rows}
    for rid, fields in corrections.items():
        if rid in by_id:
            for k, v in fields.items():
                if k in CSV_COLUMNS and k not in ("id",):
                    by_id[rid][k] = v
            by_id[rid]["updated_at"] = datetime.now(timezone.utc).isoformat()
            if by_id[rid].get("status") == "needs_review":
                by_id[rid]["status"] = "ok"
    return list(by_id.values())

def run(dry_run: bool = False) -> int:
    state = load_processed()
    items = state.setdefault("items", {})
    objs = r2_list_objects()
    pending = [o for o in objs if o["key"] not in items]
    if not pending:
        print(f"[run] nothing new ({len(objs)} objects, all processed)")
        return 0

    print(f"[run] {len(pending)} new receipt(s) to process")
    rows = read_csv_rows()
    added = 0
    for o in pending:
        try:
            row = process_one(o["key"], dry_run)
            if row is None:
                items[o["key"]] = {"status": "skipped"}
                continue
            if not dry_run:
                rows.append(row)
            items[o["key"]] = {"status": row["status"], "csv_id": row["id"]}
            added += 1
            print(f"  + {row['vendor']}  {row['total'] or '?'}  [{row['status']}]  ({o['key']})")
        except Exception as e:
            items[o["key"]] = {"status": "error", "error": str(e)[:200]}
            sys.stderr.write(f"[run] error on {o['key']}: {e}\n")

    if dry_run:
        print("[run] dry-run: not writing CSV / not pushing")
        return added

    # apply manual corrections, then write
    rows = apply_corrections(rows)
    write_csv_rows(rows)
    save_processed(state)

    if added:
        ok = git_push(f"expenses: add {added} receipt(s) from R2 pipeline")
        print(f"[run] committed+{ 'pushed' if ok else 'nothing-to-push'}")
    return added

# ------------------------------------------------------------- selftest -----
def selftest() -> int:
    """Offline verification: feed a fake image + canned model output through the
    same pipeline code paths (list→process→CSV→corrections→git check)."""
    print("[selftest] starting offline self-test")
    global r2_list_objects, r2_get_object, ollama_available, ollama_extract

    fake_key = "receipts/2026/07/selftest-0001.jpg"
    fake_note = "gas for the truck"

    def fake_list(prefix=""):
        return [{"key": fake_key, "size": 1234}]
    def fake_get(key):
        meta = {
            "x-amz-meta-note": fake_note,
            "x-amz-meta-originalfilename": "IMG_0001.HEIC",
            "x-amz-meta-uploadedat": "2026-07-19T18:42:05Z",
        }
        return b"\x00\x01fakeimagedata", meta
    def fake_avail():
        return True
    def fake_extract(data, note, filename=""):
        return {
            "vendor": "Shell", "purchase_date": "2026-07-19",
            "items": [{"name": "Diesel", "price": 64.2}],
            "subtotal": 64.2, "tax": 0, "total": 64.2, "category": "Fuel",
        }

    r2_list_objects = fake_list
    r2_get_object = fake_get
    ollama_available = fake_avail
    ollama_extract = fake_extract

    # run on a temp CSV/state to avoid clobbering real files
    import tempfile, shutil
    backup = (CSV_PATH, PROCESSED_PATH, CORRECTIONS_PATH)
    tmp = Path(tempfile.mkdtemp())
    for p in backup:
        if p.exists():
            shutil.copy(p, tmp / p.name)
    try:
        n = run(dry_run=False)
        assert n == 1, f"expected 1 added, got {n}"
        rows = read_csv_rows()
        assert any(r["vendor"] == "Shell" and r["total"] == "64.20" for r in rows), \
            "Shell row missing/incorrect in CSV"
        # corrections path
        CORRECTIONS_PATH.write_text(json.dumps({"exp_1": {"vendor": "Shell Gas",
                                                          "total": "70.00"}}),
                                    encoding="utf-8")
        rows2 = apply_corrections(rows)
        fixed = [r for r in rows2 if r["id"] == "exp_1"][0]
        assert fixed["vendor"] == "Shell Gas" and fixed["total"] == "70.00", \
            "corrections not applied"
        assert fixed["status"] == "ok", "status not flipped by correction"
        print("[selftest] PASS: pipeline produced CSV row + corrections applied")
        return 0
    except AssertionError as e:
        sys.stderr.write(f"[selftest] FAIL: {e}\n")
        return 1
    finally:
        # restore real files
        for p in backup:
            if (tmp / p.name).exists():
                shutil.copy(tmp / p.name, p)
        shutil.rmtree(tmp, ignore_errors=True)

# ----------------------------------------------------------------- main -----
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    return run(dry_run=args.dry_run)

if __name__ == "__main__":
    sys.exit(main())
