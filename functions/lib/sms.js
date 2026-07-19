/**
 * Twilio helpers + phone normalization for Clearline SMS threads.
 */

function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function toE164(phone) {
  const d = normalizePhoneDigits(phone);
  if (!d) return '';
  return '+' + d;
}

function threadIdForPhone(phone) {
  const d = normalizePhoneDigits(phone);
  return d ? 'phone_' + d : '';
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  // Lazy require so local lint works without node_modules in some CI paths.
  const twilio = require('twilio');
  return twilio(sid, token);
}

async function sendTwilioSms({ to, body }) {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !from) {
    const err = new Error('Twilio is not configured');
    err.code = 'twilio-unconfigured';
    throw err;
  }
  const toE = toE164(to);
  if (!toE) {
    const err = new Error('Invalid destination phone');
    err.code = 'invalid-phone';
    throw err;
  }
  const msg = await client.messages.create({
    from,
    to: toE,
    body: String(body || '').slice(0, 1500)
  });
  return { sid: msg.sid, status: msg.status, to: toE };
}

function validateTwilioRequest(req) {
  // Optional strict validation when TWILIO_AUTH_TOKEN + public URL are set.
  // Soft-pass when TWILIO_SKIP_SIGNATURE=1 (local/dev).
  if (process.env.TWILIO_SKIP_SIGNATURE === '1') return true;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const publicUrl = process.env.TWILIO_WEBHOOK_URL;
  if (!token || !publicUrl) return true;
  try {
    const twilio = require('twilio');
    const signature = req.get('x-twilio-signature') || '';
    return twilio.validateRequest(token, signature, publicUrl, req.body || {});
  } catch (_) {
    return false;
  }
}

module.exports = {
  normalizePhoneDigits,
  toE164,
  threadIdForPhone,
  getTwilioClient,
  sendTwilioSms,
  validateTwilioRequest
};
