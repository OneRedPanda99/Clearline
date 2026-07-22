#!/usr/bin/env python3
"""
Clearline Expenses — local receipt processing pipeline (Windows).

Flow:
  Cloudflare R2 (photo + note metadata)  ──▶  this PC downloads new images
      ──▶ local vision model (Ollama llama3.2-vision) reads each receipt
      ──▶ structured fields appended to expenses/expenses.csv
      ──▶ git add + commit + push  (so expenses.html can read it)

Local pipeline is the source of truth. The browser cannot write back to the
repo directly, so this script applies corrections permanently on each run.
"""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------- paths -----
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent                      # .../Clearline
CSV_PATH = HERE / "expenses.csv"
IMAGES_DIR = HERE / "images"
THUMBS_DIR = HERE / "thumbs"                  # small committed previews (expenses.html shows these)
PROCESSED_PATH = HERE / "processed.json"     # {r2_key: {status, csv_row_id, note, error}}
CORRECTIONS_PATH = HERE / "corrections.json" # user edits: {row_id: {field: value}}
STATE_VERSION = 1

SELFTEST = False

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
R2_PREFIX = ENV.get("R2_PREFIX", "receipts/")

OLLAMA_URL = ENV.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = ENV.get("OLLAMA_MODEL", "qwen2.5vl:7b")
OLLAMA_TIMEOUT = int(ENV.get("OLLAMA_TIMEOUT", "120"))
OLLAMA_EXTRACT_TIMEOUT = int(ENV.get("OLLAMA_EXTRACT_TIMEOUT", "180"))
OLLAMA_VISION_CTX = int(ENV.get("OLLAMA_VISION_CTX", "8192"))

DEFAULT_CSV_URL = ("https://raw.githubusercontent.com/OneRedPanda99/Clearline/"
                   "main/expenses/expenses.csv")
CSV_URL = ENV.get("EXPENSES_CSV_URL", DEFAULT_CSV_URL)

CSV_COLUMNS = [
    "id", "vendor", "purchase_date", "items", "subtotal", "tax", "total",
    "note", "category", "status", "r2_key", "photo", "created_at", "updated_at",
]

# ------------------------------------------------------------- state -------
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

def save_corrections(data: dict) -> None:
    CORRECTIONS_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

# ----------------------------------------------------------- R2 helpers ----
def _sigv4(method: str, canonical_uri: str, query: str = "", body: bytes = b"") -> dict:
    import hashlib
    import hmac

    assert R2_ACCESS_KEY and R2_SECRET, "R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set in .env"
    t = datetime.now(timezone.utc)
    amzdate = t.strftime("%Y%m%dT%H%M%SZ")
    datestamp = t.strftime("%Y%m%d")
    region = "auto"
    service = "s3"
    host = R2_ENDPOINT.replace("https://", "").replace("http://", "")

    payload_hash = hashlib.sha256(body).hexdigest()
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical = "\n".join([
        method, canonical_uri, query,
        f"host:{host}",
        f"x-amz-content-sha256:{payload_hash}",
        f"x-amz-date:{amzdate}",
        "", signed_headers, payload_hash,
    ])
    canonical_hash = hashlib.sha256(canonical.encode()).hexdigest()

    scope = f"{datestamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(["AWS4-HMAC-SHA256", amzdate, scope, canonical_hash])
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

def _encode_uri_path(path: str) -> str:
    import urllib.parse
    return "/".join(urllib.parse.quote(seg, safe="~") for seg in path.split("/"))

def r2_list_objects(prefix: str = R2_PREFIX) -> list[dict]:
    out = []
    token = ""
    while True:
        params = {"list-type": "2", "prefix": prefix}
        if token:
            params["continuation-token"] = token
        query = "&".join(f"{requests_path_quote(k)}={requests_path_quote(v)}"
                         for k, v in sorted(params.items()))
        canonical_uri = "/" + R2_BUCKET
        headers = _sigv4("GET", canonical_uri, query)
        import urllib.request
        url = f"{R2_ENDPOINT}{canonical_uri}?{query}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
        import xml.etree.ElementTree as ET
        root = ET.fromstring(body)
        ns = {"s": "http://s3.amazonaws.com/doc/2006-03-01/"}
        for c in root.findall("s:Contents", ns):
            key = c.findtext("s:Key", default="", namespaces=ns)
            size = int(c.findtext("s:Size", default="0", namespaces=ns) or "0")
            if key and not key.endswith("/"):
                out.append({"key": key, "size": size})
        truncated = root.findtext("s:IsTruncated", default="false", namespaces=ns)
        nxt = root.findtext("s:NextContinuationToken", default="", namespaces=ns)
        if truncated == "true" and nxt:
            token = nxt
        else:
            break
    return out

def r2_get_object(key: str) -> tuple[bytes, dict]:
    canonical_uri = "/" + R2_BUCKET + "/" + key
    encoded_uri = _encode_uri_path(canonical_uri)
    headers = _sigv4("GET", encoded_uri)
    import urllib.request
    url = f"{R2_ENDPOINT}{encoded_uri}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        meta = dict(resp.headers)
    return data, meta

def requests_path_quote(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="~")

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
    try:
        from PIL import Image
    except Exception:
        Image = None
    b64_source = image_bytes
    if Image is not None:
        try:
            with Image.open(io.BytesIO(image_bytes)) as im:
                if im.mode in ("RGBA", "P", "LA"):
                    im = im.convert("RGB")
                if max(im.size) > 1600:
                    scale = 1600 / max(im.size)
                    new_size = (int(im.width * scale), int(im.height * scale))
                    im = im.resize(new_size, Image.LANCZOS)
                out = io.BytesIO()
                im.save(out, "JPEG", quality=80, optimize=True)
                b64_source = out.getvalue()
        except Exception:
            b64_source = image_bytes
    b64 = base64.b64encode(b64_source).decode("ascii")
    prompt = (
        "Read this receipt image. Return ONLY a JSON object with these exact keys "
        "(no markdown, no commentary, no code fences):\n"
        "  vendor: string (store name)\n"
        "  date_raw: string — the transaction date EXACTLY as PRINTED on the receipt, "
        "character for character (e.g. '05-12-26' or '05/12/2026'). This is the date the "
        "purchase happened, NOT the upload date and NOT today. Copy digits and separators "
        "verbatim. Only use empty string if no date is visible.\n"
        "  items: array of {name: string, price: number}\n"
        "  subtotal: number\n"
        "  tax: number\n"
        "  total: number\n"
        "  category: string (one of: Supplies, Chemicals, Fuel, Equipment, Vehicle, "
        "Advertising, Software, Meals, Utilities, Rent, Insurance, Labor, Other)\n"
        "If a field is unreadable, use empty string or 0. Be precise with numbers.\n"
        + (f"User note about this receipt: {note}\n" if note else "")
    )
    import urllib.request
    if OLLAMA_MODEL == "moondream":
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "images": [b64],
            "stream": False,
        }
        endpoint = f"{OLLAMA_URL}/api/generate"
        with urllib.request.urlopen(
            urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"),
                                  headers={"Content-Type": "application/json"}),
            timeout=OLLAMA_EXTRACT_TIMEOUT,
        ) as r:
            data = json.loads(r.read().decode("utf-8"))
        text = data.get("response", "")
    else:
        payload = {
            "model": OLLAMA_MODEL,
            "format": "json",
            "stream": False,
            "options": {"num_ctx": OLLAMA_VISION_CTX, "temperature": 0},
            "messages": [
                {"role": "user", "content": prompt, "images": [b64]},
            ],
        }
        endpoint = f"{OLLAMA_URL}/api/chat"
        with urllib.request.urlopen(
            urllib.request.Request(endpoint, data=json.dumps(payload).encode("utf-8"),
                                  headers={"Content-Type": "application/json"}),
            timeout=OLLAMA_EXTRACT_TIMEOUT,
        ) as r:
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
        diff = subprocess.run(["git", "-C", str(REPO_ROOT), "diff", "--cached", "--quiet"],
                              capture_output=True)
        if diff.returncode == 0:
            return False
        subprocess.run(["git", "-C", str(REPO_ROOT), "commit", "-m", commit_msg],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(REPO_ROOT), "push"],
                       check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        sys.stderr.write(f"[git] push failed: {e}\n")
        return False

# --------------------------------------------------- duplicate helpers -----
def _safe_float(v):
    try:
        return round(float(v or 0), 2)
    except Exception:
        return None

def _meta_dt_to_iso(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except Exception:
        return None

def _to_timestamp(value: str) -> float:
    try:
        dt = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0

def _vendor_key(vendor: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (vendor or "").lower())

def _row_sig(row: dict) -> dict:
    return {
        "vendor": str(row.get("vendor") or "").strip(),
        "vendor_key": _vendor_key(row.get("vendor")),
        "total": _safe_float(row.get("total")),
        "purchase_date": str(row.get("purchase_date") or "").strip()[:10],
        "meta_created_at": _meta_dt_to_iso(row.get("created_at") or row.get("uploaded_at") or ""),
        "exif_dt": str(row.get("_exif_dt") or "").strip() or None,
    }

def _is_exact_vendor_match(a: str, b: str) -> bool:
    va, vb = _vendor_key(a), _vendor_key(b)
    if not va or not vb:
        return False
    return va == vb or va in vb or vb in va

def _near_money(a, b, tol: float = 0.02) -> bool:
    if a is None or b is None:
        return False
    return abs(float(a) - float(b)) <= tol

def _within_seconds(a, b, window: int) -> bool:
    if not a or not b:
        return False
    try:
        return abs(_to_timestamp(a) - _to_timestamp(b)) <= window
    except Exception:
        return False

def _as_items(value):
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []

def _receipt_numbers(items) -> tuple[set[str], set[str]]:
    texts = []
    for item in _as_items(items):
        if isinstance(item, dict):
            texts.append(" ".join(str(item.get(f) or "") for f in ("name", "price", "sku") if item.get(f) is not None))
        elif isinstance(item, str):
            texts.append(item)
    text = "\n".join(texts).upper()
    txn = set(re.findall(r"\b[0-9A-Z]{5,12}\b", text))
    prices = set(re.findall(r"\b\d+\.\d{2}\b", text))
    return txn, prices

def _decision(new_row: dict, candidates: list[dict]) -> tuple[bool, str | None]:
    """
    Strong signal: same purchase date, same vendor, same total -> duplicate.
    Soft signal: same vendor/total within small metadata or EXIF time window.
    Tie-breaker: shared transaction/price tokens across parsed items.
    If we cannot safely say same vs different -> flag for human review.
    """
    if not candidates:
        return False, None

    left = _row_sig(new_row)
    strong = []
    soft = []

    for cand in candidates:
        right = _row_sig(cand)
        strong_match = (
            _near_money(left["total"], right["total"]) and
            bool(left["purchase_date"]) and
            left["purchase_date"] == right["purchase_date"] and
            _is_exact_vendor_match(left["vendor"], right["vendor"])
        )
        if strong_match:
            strong.append(cand)
            continue

        soft_match = (
            left["vendor"] and right["vendor"] and
            _near_money(left["total"], right["total"]) and
            (_within_seconds(left["meta_created_at"], right["meta_created_at"], 180) or
             _within_seconds(left["exif_dt"], right["exif_dt"], 600))
        )
        if soft_match:
            soft.append(cand)

    if len(strong) == 1:
        return True, strong[0].get("id")

    exact = [c for c in candidates if _safe_float(c.get("total")) == left["total"]
             and left["purchase_date"] == str(c.get("purchase_date") or "").strip()[:10]]
    if exact:
        return True, exact[0].get("id")

    if len(strong) > 1:
        return True, strong[0].get("id")

    if len(soft) == 1:
        lt, lp = _receipt_numbers(new_row.get("items") or [])
        rt, rp = _receipt_numbers(soft[0].get("items") or [])
        if lt and rt and (lt & rt):
            return True, soft[0].get("id")
        if len(lp & rp) >= 2:
            return True, soft[0].get("id")
        return False, soft[0].get("id")

    if soft:
        lt, lp = _receipt_numbers(new_row.get("items") or [])
        rt, rp = _receipt_numbers(soft[0].get("items") or [])
        if lt and rt and (lt & rt):
            return True, soft[0].get("id")
        if len(lp & rp) >= 2:
            return True, soft[0].get("id")
        if lt and rt and not (lt & rt) and not _near_money(left["total"], _row_sig(soft[0]).get("total")):
            return False, None
        return False, soft[0].get("id")

    return False, None

# ----------------------------------------------------------- pipeline -------
def process_one(key: str, dry_run: bool) -> dict | None:
    """Download + OCR one R2 object. Returns a CSV row dict, or None to skip."""
    data, meta = r2_get_object(key)
    note = (meta.get("X-Amz-Meta-Note") or meta.get("x-amz-meta-note") or "").strip()
    orig = (meta.get("X-Amz-Meta-Originalfilename") or
            meta.get("x-amz-meta-originalfilename") or "")
    uploaded_at = (meta.get("X-Amz-Meta-Uploadedat") or
                   meta.get("x-amz-meta-uploadedat") or
                   datetime.now(timezone.utc).isoformat())
    created_at_meta = _meta_dt_to_iso(uploaded_at)

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(key).suffix or ".jpg"
    local_path = IMAGES_DIR / (Path(key).name)
    if not dry_run:
        local_path.write_bytes(data)
    thumb_rel = None
    if not dry_run:
        thumb_rel = make_thumb(local_path, key)

    digest = hashlib.sha256(data).hexdigest()
    exif_dt, exif_gps = extract_exif(local_path)

    if not ollama_available():
        sys.stderr.write(f"[process_one] ollama unavailable for {key}; deferring\n")
        raise RuntimeError("ollama unavailable")

    parsed = ollama_extract(data, note, orig)

    vendor = str(parsed.get("vendor", "") or "").strip() or "Unknown"
    purchase_date = parse_us_date(parsed.get("date_raw") or parsed.get("purchase_date") or "")
    items = parsed.get("items", []) or []
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

    row = {
        "id": "",
        "vendor": vendor,
        "purchase_date": purchase_date,
        "items": json.dumps(norm_items, ensure_ascii=False),
        "subtotal": f"{subtotal:.2f}" if subtotal else "",
        "tax": f"{tax:.2f}" if tax else "",
        "total": f"{total:.2f}" if total else "",
        "note": note,
        "category": category,
        "status": status,
        "r2_key": key,
        "photo": thumb_rel or f"expenses/images/{local_path.name}",
        "_sha256": digest,
        "_exif_dt": exif_dt,
        "_exif_gps": exif_gps,
        "_created_at_meta": created_at_meta,
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

def parse_us_date(raw: str) -> str:
    """Parse a receipt date string (US MM-DD-YY / MM/DD/YYYY) to ISO YYYY-MM-DD."""
    import re
    s = str(raw or "").strip()
    if not s:
        return ""
    m = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b", s)
        if not m:
            return ""
        mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
    if mo > 12 and d <= 12:
        mo, d = d, mo
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return ""
    return f"{y:04d}-{mo:02d}-{d:02d}"

def make_thumb(src: Path, r2_key: str) -> str | None:
    """Write a small compressed JPEG preview and return repo-relative path."""
    try:
        from PIL import Image
    except Exception:
        return None
    try:
        THUMBS_DIR.mkdir(parents=True, exist_ok=True)
        name = Path(r2_key).stem + ".jpg"
        out = THUMBS_DIR / name
        with Image.open(src) as im:
            try:
                from PIL import ImageOps
                im = ImageOps.exif_transpose(im)
            except Exception:
                pass
            if im.mode in ("RGBA", "P", "LA"):
                im = im.convert("RGB")
            im.rotate(-90, expand=True)
            im.thumbnail((900, 1200))
            im.save(out, "JPEG", quality=72, optimize=True, progressive=True)
        return f"expenses/thumbs/{name}"
    except Exception:
        return None

def extract_exif(path: Path) -> tuple[str | None, str | None]:
    """Pull capture timestamp + coarse GPS from a photo's EXIF."""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
        with Image.open(path) as im:
            exif = im.getexif()
            dt = exif.get(36867) or exif.get(306)
            dt = str(dt).strip() if dt else None
            gps = None
            try:
                gps_ifd = exif.get_ifd(0x8825)
                if gps_ifd:
                    lat = gps_ifd.get(2)
                    lon = gps_ifd.get(4)
                    if lat and lon:
                        def dec(v):
                            d, m, s = v
                            return float(d) + float(m)/60 + float(s)/3600
                        gps = f"{dec(lat):.4f},{dec(lon):.4f}"
            except Exception:
                gps = None
            return dt, gps
    except Exception:
        return None, None

# --------------------------------------------------------- corrections -------
def corrections_watchdog() -> dict:
    """
    Apply user corrections and permanently rewrite expenses.csv.
    Edits from the UI sync into corrections.json on this PC.
    A correction of {"__delete": true} removes that row entirely.
    """
    corrections = load_corrections()
    if not corrections:
        return {"changed": False}
    rows = read_csv_rows()
    by_id = {r.get("id"): r for r in rows}
    changes = 0
    deleted = 0
    keep = []
    for r in rows:
        rid = r.get("id")
        fields = corrections.get(rid)
        if fields and fields.get("__delete"):
            deleted += 1
            changes += 1
            # also mark the processed entry so it isn't re-added
            mark_processed_deleted(rid)
            continue
        if fields:
            dirty = False
            for k, v in fields.items():
                if k in CSV_COLUMNS and k != "id" and k != "__delete":
                    if r.get(k) != v:
                        r[k] = v
                        dirty = True
            if dirty:
                r["updated_at"] = datetime.now(timezone.utc).isoformat()
                if r.get("status") == "needs_review":
                    r["status"] = "ok"
                changes += 1
        keep.append(r)
    if changes:
        write_csv_rows(keep)
        # clear applied corrections so they aren't re-applied
        remaining = {rid: f for rid, f in corrections.items()
                     if not (by_id.get(rid) is None and f.get("__delete"))}
        # drop delete instructions that have been honored
        applied_delete = {rid for rid, f in corrections.items() if f.get("__delete")}
        save_corrections({rid: f for rid, f in remaining.items() if rid not in applied_delete})
    return {"changed": bool(changes), "applied": changes, "deleted": deleted}


def mark_processed_deleted(csv_id: str) -> None:
    """Mark any processed items pointing at this csv_id as deleted so the
    deleted receipt is never re-ingested from R2."""
    state = load_processed()
    items = state.get("items", {})
    changed = False
    for key, v in items.items():
        if v.get("csv_id") == csv_id and v.get("status") != "deleted":
            v["status"] = "deleted"
            changed = True
    if changed:
        save_processed(state)

# ------------------------------------------------------------- main run -----
def run(dry_run: bool = False) -> int:
    state = load_processed()
    items = state.setdefault("items", {})
    objs = r2_list_objects()
    done = {"ok", "needs_review", "skipped", "duplicate"}
    pending = [o for o in objs if items.get(o["key"], {}).get("status") not in done]
    seen_digests = {v.get("sha256") for v in items.values() if v.get("sha256")}
    recorded_keys = {v["r2_key"] for v in items.values()
                     if v.get("r2_key") and v.get("status") in done}
    pending = [o for o in pending if o["key"] not in recorded_keys]
    if not pending:
        print(f"[run] nothing new ({len(objs)} objects, all processed)")
        return 0

    print(f"[run] {len(pending)} new receipt(s) to process")

    # Apply corrections before ingestion so CSV is source of truth.
    corrections_watchdog()

    rows = read_csv_rows()
    max_n = 0
    for r in rows:
        try:
            max_n = max(max_n, int(str(r.get("id", "")).replace("exp_", "")))
        except Exception:
            pass

    # Build candidate pool for duplicate detection from processed metadata
    # and existing CSV rows. Include a lightweight row shape for comparison.
    candidates: list[dict] = []
    for r in rows:
        candidates.append({
            "id": r.get("id"),
            "vendor": r.get("vendor"),
            "total": _safe_float(r.get("total")),
            "purchase_date": str(r.get("purchase_date") or "").strip()[:10],
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
            "items": _as_items(r.get("items") or ""),
            "_exif_dt": None,
        })
    for it in items.values():
        if it.get("status") not in done:
            continue
        cid = it.get("csv_id")
        fp = it.get("fp")
        exif_dt = None
        if isinstance(fp, (list, tuple)) and len(fp) >= 4:
            exif_dt = str(fp[3] or "").strip() or None
        candidates.append({
            "id": cid,
            "vendor": "",
            "total": None,
            "purchase_date": "",
            "created_at": "",
            "updated_at": "",
            "items": [],
            "_exif_dt": exif_dt,
        })

    next_n = max_n
    added = 0
    for o in pending:
        try:
            row = process_one(o["key"], dry_run)
            if row is None:
                items[o["key"]] = {"status": "skipped"}
                continue

            digest = row.pop("_sha256", None)
            exif_dt = row.pop("_exif_dt", None)
            exif_gps = row.pop("_exif_gps", None)
            created_at_meta = row.pop("_created_at_meta", None)

            if digest and digest in seen_digests:
                items[o["key"]] = {"status": "duplicate", "sha256": digest}
                print(f"  = skip duplicate of existing receipt ({o['key']})")
                continue

            decision_row = {
                "vendor": row.get("vendor"),
                "total": row.get("total"),
                "purchase_date": row.get("purchase_date"),
                "created_at": created_at_meta or row.get("created_at"),
                "_exif_dt": exif_dt,
                "items": row.get("items"),
            }
            is_dup, dup_id = _decision(decision_row, candidates)
            if is_dup and dup_id and str(dup_id) != str(row.get("id", "")):
                row["status"] = "needs_review"
                row["note"] = (row.get("note") or "") + f" [Possible duplicate of {dup_id}]"
                print(f"  ! {row['vendor']} {row['total']} flagged possible duplicate of {dup_id}")
            elif dup_id and str(dup_id) != str(row.get("id", "")) and not is_dup:
                row["status"] = "needs_review"
                row["note"] = (row.get("note") or "") + f" [Possible duplicate of {dup_id}]"
                print(f"  ? {row['vendor']} {row['total']} marked uncertain duplicate of {dup_id}")

            fp = (
                _vendor_key(row.get("vendor", "")),
                _safe_float(row.get("total")),
                str(row.get("purchase_date") or "").strip()[:10],
                (exif_dt or "").strip(),
            )
            next_n += 1
            row["id"] = f"exp_{next_n}"
            if not dry_run:
                rows.append(row)
            items[o["key"]] = {
                "status": row["status"],
                "csv_id": row["id"],
                "sha256": digest,
                "fp": list(fp),
            }
            seen_digests.add(digest)
            candidates.append({
                "id": row["id"],
                "vendor": row.get("vendor"),
                "total": _safe_float(row.get("total")),
                "purchase_date": str(row.get("purchase_date") or "").strip()[:10],
                "created_at": created_at_meta or row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "items": _as_items(row.get("items") or ""),
                "_exif_dt": exif_dt,
            })
            added += 1
            print(f"  + {row['vendor']}  {row['total'] or '?'}  [{row['status']}]  ({o['key']})")
        except Exception as e:
            items[o["key"]] = {"status": "error", "error": str(e)[:200]}
            sys.stderr.write(f"[run] error on {o['key']}: {e}\n")

    if dry_run:
        print("[run] dry-run: not writing CSV / not pushing")
        return added

    rows = apply_corrections(rows)
    write_csv_rows(rows)
    save_processed(state)

    if added and not SELFTEST:
        ok = git_push(f"expenses: add {added} receipt(s) from R2 pipeline")
        print(f"[run] committed+{'pushed' if ok else 'nothing-to-push'}")
    return added

# ------------------------------------------------------------- selftest -----
def selftest() -> int:
    """Offline verification of pipeline code paths."""
    global SELFTEST
    SELFTEST = True
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
            "vendor": "Shell",
            "purchase_date": "2026-07-19",
            "items": [{"name": "Diesel", "price": 64.2}],
            "subtotal": 64.2, "tax": 0, "total": 64.2, "category": "Fuel",
        }

    r2_list_objects = fake_list
    r2_get_object = fake_get
    ollama_available = fake_avail
    ollama_extract = fake_extract

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
        shell = [r for r in rows if r["vendor"] == "Shell" and r["total"] == "64.20"]
        assert shell, "Shell row missing/incorrect in CSV"
        shell_id = shell[0]["id"]
        CORRECTIONS_PATH.write_text(json.dumps({shell_id: {"vendor": "Shell Gas",
                                                          "total": "70.00"}}),
                                    encoding="utf-8")
        result = corrections_watchdog()
        assert result["changed"], "corrections watchdog did not apply changes"
        rows2 = read_csv_rows()
        fixed = [r for r in rows2 if r["id"] == shell_id][0]
        assert fixed["vendor"] == "Shell Gas" and fixed["total"] == "70.00", "corrections not applied"
        print("[selftest] PASS: pipeline produced CSV row + corrections applied")
        return 0
    except AssertionError as e:
        sys.stderr.write(f"[selftest] FAIL: {e}\n")
        return 1
    finally:
        for p in backup:
            if (tmp / p.name).exists():
                shutil.copy(tmp / p.name, p)
        shutil.rmtree(tmp, ignore_errors=True)

def apply_corrections(rows: list[dict]) -> list[dict]:
    corrections = load_corrections()
    if not corrections:
        return rows
    by_id = {r.get("id"): r for r in rows}
    for rid, fields in corrections.items():
        if rid in by_id:
            for k, v in fields.items():
                if k in CSV_COLUMNS and k != "id":
                    by_id[rid][k] = v
            by_id[rid]["updated_at"] = datetime.now(timezone.utc).isoformat()
            if by_id[rid].get("status") == "needs_review":
                by_id[rid]["status"] = "ok"
    return list(by_id.values())

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
