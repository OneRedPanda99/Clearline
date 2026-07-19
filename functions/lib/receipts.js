/**
 * Receipt OCR via Gemini (Google AI Studio / Generative Language API).
 * Secrets: GEMINI_API_KEY
 */

const TAX_CATEGORY_IDS = [
  'advertising',
  'car_truck',
  'chemicals_supplies',
  'contract_labor',
  'depreciation',
  'insurance',
  'interest',
  'legal_professional',
  'office',
  'rent',
  'repairs',
  'meals',
  'taxes_licenses',
  'travel',
  'utilities',
  'wages',
  'other'
];

const TAX_HINTS = [
  'advertising — ads, flyers, Facebook/Google ads, yard signs',
  'car_truck — gas, fuel, oil, tires, vehicle maintenance',
  'chemicals_supplies — detergent, chemicals, soap, brushes, tips',
  'contract_labor — subcontractors, helpers paid as contractors',
  'depreciation — equipment purchases (pressure washer, trailer)',
  'insurance — liability, auto, workers comp premiums',
  'interest — loan interest, credit card interest (business)',
  'legal_professional — lawyer, accountant, bookkeeping',
  'office — software, postage, paper, phone accessories',
  'rent — shop rent, equipment lease, storage unit',
  'repairs — repairs and maintenance of equipment',
  'meals — business meals with clients/crew',
  'taxes_licenses — business licenses, permits, filing fees',
  'travel — hotels, airfare, parking for jobs out of town',
  'utilities — electric, water, internet for business',
  'wages — employee payroll (prefer payroll entries)',
  'other — anything that does not clearly fit above'
];

function normalizeTaxCategory(hint) {
  const raw = String(hint || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (TAX_CATEGORY_IDS.includes(raw)) return raw;
  const compact = raw.replace(/[^a-z_]/g, '');
  if (TAX_CATEGORY_IDS.includes(compact)) return compact;
  return 'other';
}

function extractJsonObject(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    // fall through
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {
      // fall through
    }
  }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
  return null;
}

function coerceAmount(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && isFinite(v)) return Math.round(v * 100) / 100;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

function coerceDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // MM/DD/YYYY or M/D/YY
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    const m = String(parseInt(mdy[1], 10)).padStart(2, '0');
    const d = String(parseInt(mdy[2], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const dt = new Date(t);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

async function parseReceiptWithGemini({ buffer, mimeType, apiKey }) {
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'missing-gemini-key';
    throw err;
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const b64 = Buffer.from(buffer).toString('base64');
  const prompt =
    'You extract structured data from a business expense receipt photo.\n' +
    'Return ONLY a JSON object with keys:\n' +
    '  vendor (string),\n' +
    '  date (YYYY-MM-DD),\n' +
    '  amount (number, the total paid),\n' +
    '  taxCategoryHint (one of: ' + TAX_CATEGORY_IDS.join(', ') + '),\n' +
    '  description (short string),\n' +
    '  confidence (0-1),\n' +
    '  rawText (brief OCR text excerpt)\n' +
    'Tax category guidance:\n- ' + TAX_HINTS.join('\n- ') + '\n' +
    'If a field is unknown, use null / "other" / 0.4 as appropriate. Prefer the receipt TOTAL.';

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType || 'image/jpeg',
              data: b64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error('Gemini OCR failed: ' + resp.status + ' ' + text.slice(0, 300));
    err.code = 'gemini-failed';
    throw err;
  }
  const json = await resp.json();
  const text =
    (((json || {}).candidates || [])[0] || {}).content &&
    ((((json || {}).candidates || [])[0] || {}).content.parts || [])
      .map((p) => p.text || '')
      .join('\n');

  const parsed = extractJsonObject(text) || {};
  return {
    vendor: parsed.vendor ? String(parsed.vendor).trim() : '',
    date: coerceDate(parsed.date),
    amount: coerceAmount(parsed.amount),
    taxCategoryHint: normalizeTaxCategory(parsed.taxCategoryHint || parsed.taxCategory),
    taxCategory: normalizeTaxCategory(parsed.taxCategoryHint || parsed.taxCategory),
    description: parsed.description ? String(parsed.description).trim() : '',
    confidence:
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    rawText: parsed.rawText ? String(parsed.rawText).slice(0, 2000) : ''
  };
}

module.exports = {
  TAX_CATEGORY_IDS,
  parseReceiptWithGemini,
  normalizeTaxCategory,
  coerceAmount,
  coerceDate
};
