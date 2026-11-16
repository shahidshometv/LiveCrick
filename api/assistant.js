// POST /api/assistant -> { reply, links? }   (needs ADMIN_PASSWORD; uses GROQ_API_KEY)
// Body: { mode: 'chat' | 'links', match?: {title, series, venue, start, dateLabel}, messages: [{role, content}] }
// Env: GROQ_API_KEY (required), GROQ_MODEL (optional, default below)
const crypto = require('crypto');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

const BASE_RULES = [
  'You are the assistant inside Boundary, an admin tool for a cricket video site.',
  'The admin saves one embed link per match. Only suggest streams from official broadcasters, official',
  'league or board channels, or other sources the admin has rights to. Never suggest pirated or unofficial streams.',
  'Never invent a URL. If you are not sure a link exists, say so. Keep answers short and practical.'
].join(' ');

const LINKS_RULE = [
  'The admin wants stream links for the match above.',
  'Reply with ONLY a JSON object, no markdown, in this shape:',
  '{"note": "one short sentence on what you found or could not verify", "links": [{"title": "short label", "url": "https://...", "note": "why this source"}]}',
  'Return at most 5 links. Use an empty array if you cannot name a real source.'
].join(' ');

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function cleanLinks(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map(function (l) {
    if (!l || typeof l !== 'object') return null;
    const url = String(l.url || '').trim();
    try { if (new URL(url).protocol !== 'https:' || url.length > 500) return null; } catch (e) { return null; }
    return {
      title: String(l.title || url).slice(0, 120),
      url: url,
      note: String(l.note || '').slice(0, 200)
    };
  }).filter(Boolean);
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch (e) {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) { res.status(500).json({ error: 'ADMIN_PASSWORD is not set in Vercel' }); return; }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!same(given, pw)) { res.status(401).json({ error: 'Wrong password' }); return; }

  const key = process.env.GROQ_API_KEY;
  if (!key) { res.status(500).json({ error: 'GROQ_API_KEY is not set in Vercel' }); return; }

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};

  const mode = body.mode === 'links' ? 'links' : 'chat';
  const match = body.match && typeof body.match === 'object' ? body.match : null;
  const msgs = (Array.isArray(body.messages) ? body.messages : [])
    .filter(function (m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(); })
    .slice(-MAX_MESSAGES)
    .map(function (m) { return { role: m.role, content: m.content.slice(0, MAX_CHARS) }; });
  if (!msgs.length) { res.status(400).json({ error: 'Send a message first' }); return; }

  let system = BASE_RULES;
  if (match) {
    system += '\nCurrent match: ' + [match.title, match.series, match.venue, match.dateLabel || match.start]
      .map(function (x) { return String(x || '').slice(0, 200); }).filter(Boolean).join(' | ');
  }
  if (mode === 'links') system += '\n' + LINKS_RULE;

  const payload = {
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    messages: [{ role: 'system', content: system }].concat(msgs),
    temperature: 0.2,
    max_tokens: 2000
  };

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json().catch(function () { return {}; });
    if (!r.ok) { res.status(502).json({ error: (d.error && d.error.message) || 'Assistant request failed' }); return; }
    const text = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';

    if (mode === 'links') {
      const parsed = parseJsonLoose(text);
      res.status(200).json({ reply: String(parsed.note || '').slice(0, 300), links: cleanLinks(parsed.links) });
      return;
    }
    res.status(200).json({ reply: text });
  } catch (e) {
    res.status(502).json({ error: 'Assistant unreachable' });
  }
};
