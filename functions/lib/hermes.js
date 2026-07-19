/**
 * Nous Hermes via OpenRouter (OpenAI-compatible chat completions).
 * Secrets: OPENROUTER_API_KEY
 */

const DEFAULT_MODEL = 'nousresearch/hermes-4-70b';

function buildSystemPrompt({ businessName, customerName, job }) {
  const biz = businessName || 'Clearline';
  const lines = [
    `You are the SMS assistant for ${biz}, a pressure-washing business.`,
    'Write short, friendly, professional SMS replies (1-3 sentences, no markdown).',
    'Never invent prices, dates, or promises that are not in the context.',
    'If you are unsure, ask one clarifying question or suggest the owner will confirm.',
    'Do not include signature blocks unless the thread already uses one.'
  ];
  if (customerName) lines.push(`Customer name: ${customerName}.`);
  if (job) {
    lines.push(
      `Related job: status=${job.status || 'unknown'}` +
        (job.jobDate ? `, date=${job.jobDate}` : '') +
        (job.jobTime ? ` ${job.jobTime}` : '') +
        (job.address ? `, address=${job.address}` : '') +
        (job.quoteTotal != null ? `, quote/total≈${job.quoteTotal}` : '') +
        (job.serviceType ? `, service=${job.serviceType}` : '') +
        '.'
    );
  }
  return lines.join(' ');
}

async function generateHermesReply({
  apiKey,
  messages,
  businessName,
  customerName,
  job,
  model
}) {
  if (!apiKey) {
    const err = new Error('OPENROUTER_API_KEY is not configured');
    err.code = 'missing-openrouter-key';
    throw err;
  }
  const chatMessages = [
    {
      role: 'system',
      content: buildSystemPrompt({ businessName, customerName, job })
    }
  ];
  for (const m of messages || []) {
    const role = m.direction === 'inbound' || m.from === 'them' ? 'user' : 'assistant';
    const content = String(m.body || m.text || '').trim();
    if (!content) continue;
    chatMessages.push({ role, content });
  }
  if (chatMessages.length < 2) {
    chatMessages.push({
      role: 'user',
      content: 'Please draft a short polite SMS checking in with the customer.'
    });
  }

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://clearline.app',
      'X-Title': 'Clearline SMS'
    },
    body: JSON.stringify({
      model: model || process.env.HERMES_MODEL || DEFAULT_MODEL,
      messages: chatMessages,
      temperature: 0.4,
      max_tokens: 220
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error('OpenRouter failed: ' + resp.status + ' ' + text.slice(0, 300));
    err.code = 'openrouter-failed';
    throw err;
  }
  const json = await resp.json();
  const content =
    ((((json || {}).choices || [])[0] || {}).message || {}).content || '';
  return String(content).trim().replace(/^["']|["']$/g, '');
}

module.exports = {
  DEFAULT_MODEL,
  generateHermesReply,
  buildSystemPrompt
};
