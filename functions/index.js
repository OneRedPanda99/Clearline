/**
 * Clearline Cloud Functions
 * - parseReceipt: Gemini vision OCR for expense receipts
 * - smsInbound: Twilio webhook for inbound customer texts
 * - sendSms / approveDraft / generateHermesDraft: owner SMS + Hermes
 * - runSmsReminders: scheduled day-before / quote / payment reminders
 *
 * Secrets via environment (Firebase Functions config or .env):
 *   GEMINI_API_KEY, OPENROUTER_API_KEY,
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
 *   TWILIO_WEBHOOK_URL (optional signature validation)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { parseReceiptWithGemini } = require('./lib/receipts');
const { generateHermesReply } = require('./lib/hermes');
const {
  normalizePhoneDigits,
  threadIdForPhone,
  sendTwilioSms,
  validateTwilioRequest,
  toE164
} = require('./lib/sms');

admin.initializeApp();
const db = admin.firestore();
const bucket = () => admin.storage().bucket();

async function assertOwner(uid) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists || snap.data().role !== 'owner') {
    throw new functions.https.HttpsError('permission-denied', 'Owner only');
  }
  return snap.data();
}

async function assertOwnerOrManager(uid) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  }
  const snap = await db.collection('users').doc(uid).get();
  const role = snap.exists ? snap.data().role : '';
  if (role !== 'owner' && role !== 'manager') {
    throw new functions.https.HttpsError('permission-denied', 'Owner or manager required');
  }
  return snap.data();
}

async function getGlobalSettings() {
  const snap = await db.collection('settings').doc('global').get();
  return snap.exists ? snap.data() || {} : {};
}

function localSettingsBusinessName(globalSettings) {
  return (
    (globalSettings && (globalSettings.businessName || globalSettings.smsBusinessName)) ||
    'Clearline'
  );
}

function appendMessage(thread, msg) {
  const messages = Array.isArray(thread.messages) ? thread.messages.slice() : [];
  messages.push(msg);
  // Cap stored history for document size
  while (messages.length > 120) messages.shift();
  return messages;
}

async function loadJobContext(jobId) {
  if (!jobId) return null;
  try {
    const snap = await db.collection('jobs').doc(jobId).get();
    if (!snap.exists) return null;
    const j = snap.data() || {};
    return {
      status: j.status,
      jobDate: j.jobDate,
      jobTime: j.jobTime,
      address: j.address || j.customerAddress || '',
      quoteTotal: j.quoteTotal != null ? j.quoteTotal : j.total != null ? j.total : j.price,
      serviceType: j.serviceType || j.category || '',
      paymentStatus: j.paymentStatus || j.paid
    };
  } catch (_) {
    return null;
  }
}

async function findCustomerByPhone(digits) {
  if (!digits) return null;
  const last10 = digits.slice(-10);
  try {
    const snap = await db.collection('customers').limit(400).get();
    let best = null;
    snap.forEach((doc) => {
      const c = doc.data() || {};
      const p = normalizePhoneDigits(c.phone || c.mobile || c.cell || '');
      if (p && (p === digits || p.endsWith(last10))) {
        best = Object.assign({ id: doc.id }, c);
      }
    });
    return best;
  } catch (_) {
    return null;
  }
}

async function findRecentJobForCustomer(customerId, phoneDigits) {
  try {
    let q = db.collection('jobs').orderBy('lastUpdated', 'desc').limit(40);
    const snap = await q.get();
    let match = null;
    snap.forEach((doc) => {
      if (match) return;
      const j = doc.data() || {};
      const jp = normalizePhoneDigits(j.customerPhone || '');
      if (customerId && j.customerId === customerId) {
        match = Object.assign({ id: doc.id }, j);
        return;
      }
      if (phoneDigits && jp && (jp === phoneDigits || jp.endsWith(phoneDigits.slice(-10)))) {
        match = Object.assign({ id: doc.id }, j);
      }
    });
    return match;
  } catch (_) {
    // lastUpdated index may be missing — soft fail
    return null;
  }
}

// ── parseReceipt ───────────────────────────────────────────────
exports.parseReceipt = functions.https.onCall(async (data, context) => {
  await assertOwner(context.auth && context.auth.uid);
  const storagePath = data && data.storagePath;
  if (!storagePath || typeof storagePath !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'storagePath required');
  }
  if (!storagePath.startsWith('receipts/')) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid storage path');
  }
  // Owner may only read their own receipts folder
  const uid = context.auth.uid;
  if (!storagePath.startsWith('receipts/' + uid + '/')) {
    throw new functions.https.HttpsError('permission-denied', 'Not your receipt');
  }

  let buffer;
  let mimeType = 'image/jpeg';
  try {
    const file = bucket().file(storagePath);
    const [meta] = await file.getMetadata();
    if (meta && meta.contentType) mimeType = meta.contentType;
    const [buf] = await file.download();
    buffer = buf;
  } catch (err) {
    console.error('parseReceipt download failed', err);
    throw new functions.https.HttpsError('not-found', 'Receipt file not found in Storage');
  }

  try {
    const parsed = await parseReceiptWithGemini({
      buffer,
      mimeType,
      apiKey: process.env.GEMINI_API_KEY
    });
    return parsed;
  } catch (err) {
    console.error('parseReceipt OCR failed', err);
    throw new functions.https.HttpsError(
      'internal',
      err.message || 'OCR failed',
      { code: err.code || 'ocr-failed' }
    );
  }
});

async function draftWithHermes(thread) {
  const settings = await getGlobalSettings();
  const job = await loadJobContext(thread.jobId);
  const text = await generateHermesReply({
    apiKey: process.env.OPENROUTER_API_KEY,
    messages: thread.messages || [],
    businessName: localSettingsBusinessName(settings),
    customerName: thread.customerName,
    job
  });
  return {
    text,
    createdAt: new Date().toISOString(),
    model: process.env.HERMES_MODEL || 'nousresearch/hermes-4-70b'
  };
}

async function maybeAutoSend(threadRef, thread, draft) {
  const settings = await getGlobalSettings();
  const mode = (settings.smsReplyMode || 'approve').toLowerCase();
  if (mode !== 'auto') {
    await threadRef.set(
      { draft, lastUpdated: new Date().toISOString() },
      { merge: true }
    );
    return { autoSent: false, draft };
  }
  // Auto-send
  const sent = await sendTwilioSms({ to: thread.phoneDigits, body: draft.text });
  const now = new Date().toISOString();
  const msg = {
    id: 'msg_' + Date.now(),
    direction: 'outbound',
    body: draft.text,
    ts: now,
    via: 'twilio',
    twilioSid: sent.sid,
    source: 'hermes-auto'
  };
  await threadRef.set(
    {
      messages: appendMessage(thread, msg),
      draft: null,
      lastMessageAt: now,
      lastUpdated: now
    },
    { merge: true }
  );
  return { autoSent: true, draft: null };
}

// ── smsInbound (Twilio webhook) ────────────────────────────────
exports.smsInbound = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  if (!validateTwilioRequest(req)) {
    res.status(403).send('Invalid signature');
    return;
  }

  const from = (req.body && (req.body.From || req.body.from)) || '';
  const body = (req.body && (req.body.Body || req.body.body)) || '';
  const digits = normalizePhoneDigits(from);
  const threadId = threadIdForPhone(digits);
  if (!threadId) {
    res.status(200).type('text/xml').send('<Response></Response>');
    return;
  }

  const now = new Date().toISOString();
  const threadRef = db.collection('smsThreads').doc(threadId);
  const snap = await threadRef.get();
  let thread = snap.exists ? snap.data() : null;

  if (!thread) {
    const customer = await findCustomerByPhone(digits);
    const job = await findRecentJobForCustomer(customer && customer.id, digits);
    thread = {
      phoneDigits: digits,
      customerName: (customer && (customer.name || customer.customerName)) || '',
      customerId: (customer && customer.id) || '',
      jobId: (job && job.id) || '',
      messages: [],
      draft: null,
      createdAt: now,
      createdBy: 'twilio-webhook'
    };
  }

  const inbound = {
    id: 'msg_' + Date.now(),
    direction: 'inbound',
    body: String(body).slice(0, 1500),
    ts: now,
    via: 'twilio',
    from: toE164(digits)
  };
  thread.messages = appendMessage(thread, inbound);
  thread.lastMessageAt = now;
  thread.lastUpdated = now;
  await threadRef.set(thread, { merge: true });

  // Hermes draft (and maybe auto-send)
  try {
    const draft = await draftWithHermes(thread);
    await maybeAutoSend(threadRef, thread, draft);
  } catch (err) {
    console.error('Hermes draft failed on inbound', err);
    await threadRef.set(
      {
        draft: {
          text: '',
          error: err.message || 'Hermes failed',
          createdAt: now
        },
        lastUpdated: now
      },
      { merge: true }
    );
  }

  // Empty TwiML — we send replies via REST API, not TwiML body
  res.status(200).type('text/xml').send('<Response></Response>');
});

// ── sendSms ────────────────────────────────────────────────────
exports.sendSms = functions.https.onCall(async (data, context) => {
  await assertOwnerOrManager(context.auth && context.auth.uid);
  const threadId = data && data.threadId;
  const body = data && data.body;
  if (!threadId || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'threadId and body required');
  }
  const ref = db.collection('smsThreads').doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Thread not found');
  }
  const thread = snap.data();
  if (data.jobId) thread.jobId = data.jobId;

  try {
    const sent = await sendTwilioSms({ to: thread.phoneDigits, body });
    const now = new Date().toISOString();
    const msg = {
      id: 'msg_' + Date.now(),
      direction: 'outbound',
      body: String(body).slice(0, 1500),
      ts: now,
      via: 'twilio',
      twilioSid: sent.sid,
      source: 'manual',
      sentBy: context.auth.uid
    };
    await ref.set(
      {
        messages: appendMessage(thread, msg),
        draft: null,
        jobId: thread.jobId || '',
        lastMessageAt: now,
        lastUpdated: now
      },
      { merge: true }
    );
    return { ok: true, sid: sent.sid };
  } catch (err) {
    console.error('sendSms failed', err);
    throw new functions.https.HttpsError('internal', err.message || 'Send failed');
  }
});

// ── approveDraft ───────────────────────────────────────────────
exports.approveDraft = functions.https.onCall(async (data, context) => {
  await assertOwnerOrManager(context.auth && context.auth.uid);
  const threadId = data && data.threadId;
  if (!threadId) {
    throw new functions.https.HttpsError('invalid-argument', 'threadId required');
  }
  const ref = db.collection('smsThreads').doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Thread not found');
  }
  const thread = snap.data();
  const text = (thread.draft && thread.draft.text) || '';
  if (!text) {
    throw new functions.https.HttpsError('failed-precondition', 'No draft to approve');
  }
  try {
    const sent = await sendTwilioSms({ to: thread.phoneDigits, body: text });
    const now = new Date().toISOString();
    const msg = {
      id: 'msg_' + Date.now(),
      direction: 'outbound',
      body: text,
      ts: now,
      via: 'twilio',
      twilioSid: sent.sid,
      source: 'hermes-approved',
      sentBy: context.auth.uid
    };
    await ref.set(
      {
        messages: appendMessage(thread, msg),
        draft: null,
        lastMessageAt: now,
        lastUpdated: now
      },
      { merge: true }
    );
    return { ok: true, sid: sent.sid };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message || 'Send failed');
  }
});

// ── generateHermesDraft ────────────────────────────────────────
exports.generateHermesDraft = functions.https.onCall(async (data, context) => {
  await assertOwnerOrManager(context.auth && context.auth.uid);
  const threadId = data && data.threadId;
  if (!threadId) {
    throw new functions.https.HttpsError('invalid-argument', 'threadId required');
  }
  const ref = db.collection('smsThreads').doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Thread not found');
  }
  const thread = snap.data();
  try {
    const draft = await draftWithHermes(thread);
    await ref.set({ draft, lastUpdated: new Date().toISOString() }, { merge: true });
    return { ok: true, draft };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message || 'Hermes failed');
  }
});

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(ymdA, ymdB) {
  if (!ymdA || !ymdB) return null;
  const a = new Date(ymdA + 'T12:00:00');
  const b = new Date(ymdB + 'T12:00:00');
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

async function sendReminderIfNeeded(job, kind, body) {
  const phone = job.customerPhone;
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  const threadId = threadIdForPhone(digits);
  const flagKey = 'smsReminder_' + kind;
  if (job[flagKey]) return false;

  const now = new Date().toISOString();
  const threadRef = db.collection('smsThreads').doc(threadId);
  const snap = await threadRef.get();
  const thread = snap.exists
    ? snap.data()
    : {
        phoneDigits: digits,
        customerName: job.customerName || '',
        customerId: job.customerId || '',
        jobId: job.id,
        messages: [],
        draft: null,
        createdAt: now,
        createdBy: 'reminder'
      };

  try {
    const sent = await sendTwilioSms({ to: digits, body });
    const msg = {
      id: 'msg_' + Date.now(),
      direction: 'outbound',
      body,
      ts: now,
      via: 'twilio',
      twilioSid: sent.sid,
      source: 'reminder-' + kind
    };
    await threadRef.set(
      Object.assign({}, thread, {
        jobId: job.id,
        customerName: job.customerName || thread.customerName || '',
        messages: appendMessage(thread, msg),
        lastMessageAt: now,
        lastUpdated: now
      }),
      { merge: true }
    );
    await db
      .collection('jobs')
      .doc(job.id)
      .set({ [flagKey]: now, lastUpdated: now }, { merge: true });
    return true;
  } catch (err) {
    console.error('reminder send failed', kind, job.id, err);
    return false;
  }
}

// ── runSmsReminders (hourly) ───────────────────────────────────
exports.runSmsReminders = functions.pubsub
  .schedule('every 60 minutes')
  .timeZone(process.env.REMINDER_TZ || 'America/New_York')
  .onRun(async () => {
    const settings = await getGlobalSettings();
    if (settings.smsRemindersEnabled === false) {
      console.log('SMS reminders disabled');
      return null;
    }
    const biz = localSettingsBusinessName(settings);
    const followUpDays = Number(settings.quoteFollowUpDays != null ? settings.quoteFollowUpDays : 3);
    const today = ymdLocal(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = ymdLocal(tomorrowDate);

    let jobsSnap;
    try {
      jobsSnap = await db.collection('jobs').limit(500).get();
    } catch (err) {
      console.error('Failed to list jobs for reminders', err);
      return null;
    }

    let sent = 0;
    for (const doc of jobsSnap.docs) {
      const job = Object.assign({ id: doc.id }, doc.data() || {});
      const status = String(job.status || '').toLowerCase();

      // Day-before appointment reminder
      if (
        (status === 'scheduled' || status === 'confirmed') &&
        job.jobDate === tomorrow &&
        job.customerPhone
      ) {
        const when = job.jobTime ? ` at ${job.jobTime}` : '';
        const ok = await sendReminderIfNeeded(
          job,
          'dayBefore',
          `Hi${job.customerName ? ' ' + String(job.customerName).split(' ')[0] : ''} — reminder from ${biz}: we're scheduled for tomorrow${when}. Reply if you need to reschedule.`
        );
        if (ok) sent++;
      }

      // Quote follow-up
      if (status === 'quoted' || status === 'quote' || status === 'estimate') {
        const quotedOn = (job.quotedAt || job.estimateDate || job.lastUpdated || '').slice(0, 10);
        const delta = daysBetween(quotedOn, today);
        if (delta != null && delta >= followUpDays && job.customerPhone) {
          const ok = await sendReminderIfNeeded(
            job,
            'quoteFollowUp',
            `Hi${job.customerName ? ' ' + String(job.customerName).split(' ')[0] : ''} — just checking in from ${biz} on your estimate. Happy to answer any questions or get you on the schedule.`
          );
          if (ok) sent++;
        }
      }

      // Payment reminder for completed unpaid jobs
      const paid =
        job.paymentStatus === 'paid' ||
        job.paid === true ||
        String(job.paymentStatus || '').toLowerCase() === 'paid';
      if (status === 'completed' && !paid && job.customerPhone) {
        const completedOn = (job.completedAt || job.jobDate || '').slice(0, 10);
        const delta = daysBetween(completedOn, today);
        if (delta != null && delta >= 3) {
          const ok = await sendReminderIfNeeded(
            job,
            'payment',
            `Hi${job.customerName ? ' ' + String(job.customerName).split(' ')[0] : ''} — friendly reminder from ${biz} that payment for your recent service is still open. Reply here if you have questions.`
          );
          if (ok) sent++;
        }
      }
    }
    console.log('runSmsReminders sent', sent);
    return null;
  });
