const crypto = require('crypto');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SEARCH_MODEL = 'openai/gpt-oss-20b';
const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || SEARCH_MODEL;
const MAX_LINKS = 12;

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function bodyOf(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
}

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function youtubeVideo(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(u.hostname.toLowerCase())) return null;

  let id = '';
  if (u.hostname.toLowerCase().endsWith('youtu.be')) id = u.pathname.slice(1).split('/')[0];
  else {
    id = u.searchParams.get('v') || '';
    if (!id) {
      const m = u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{6,})/);
      if (m) id = m[1];
    }
  }
  return /^[\w-]{6,}$/.test(id) ? 'https://www.youtube.com/watch?v=' + id : null;
}

function parseResult(content) {
  const match = String(content || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const result = JSON.parse(match[0]);
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch (e) {
    return null;
  }
}

async function groq(messages, apiKey, search) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 45000);
  try {
    const payload = {
      model: search ? SEARCH_MODEL : CHAT_MODEL,
      messages: messages,
      max_completion_tokens: search ? 3000 : 1200
    };
    if (search) {
      payload.reasoning_effort = 'low';
      payload.tools = [{ type: 'browser_search' }];
      payload.tool_choice = 'required';
    }
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const result = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      const message = result.error && result.error.message;
      throw new Error(message || 'Groq request failed with status ' + response.status);
    }
    const content = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Groq returned an empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyPublicVideo(url) {
  const endpoint = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || typeof data.title !== 'string' || typeof data.author_name !== 'string') return null;
  return { title: data.title, channel: data.author_name };
}

function sameChannel(a, b) {
  const normalize = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); };
  const x = normalize(a), y = normalize(b);
  return x.length >= 4 && y.length >= 4 && (x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
}

async function findLinks(match, apiKey) {
  const details = [
    'Match: ' + text(match.title, 180),
    'Series: ' + text(match.series, 180),
    'Venue: ' + text(match.venue, 180),
    'Start: ' + text(match.start, 80),
    'Date: ' + text(match.dateLabel, 80)
  ].filter(function (line) { return !line.endsWith(': '); }).join('\n');
  const system = [
    'You search the live web for lawful, free-to-view cricket streams.',
    'Search official cricket board, tournament organizer, or broadcaster sources and their official YouTube channels.',
    'Only return public YouTube video URLs for live streams or full replays that are presented as free to watch. Do not include unofficial uploads, clips/highlights, mirrors, paid/subscription-only streams, or links whose source cannot be substantiated.',
    'Return as many distinct qualifying results as you can substantiate, up to 12. Do not claim the list is exhaustive. Regional availability can differ.',
    'Reply with a single JSON object and no markdown: {"reply":"brief scope/availability caveat","links":[{"title":"video title","url":"https://www.youtube.com/watch?v=...","channel":"official channel name","evidenceUrl":"https://official-source.example/...","note":"why this is relevant and any region restriction"}]}.',
    'Each evidenceUrl must be an HTTPS page that supports the official status or free availability. Never invent URLs, evidence, channels, or availability. If nothing qualifies, return an empty links array.'
  ].join(' ');
  const content = await groq([
    { role: 'system', content: system },
    { role: 'user', content: details + '\nFind free official live streams or full-match replays.' }
  ], apiKey, true);
  const result = parseResult(content);
  if (!result || !Array.isArray(result.links)) throw new Error('Assistant returned an unreadable search result');

  const candidates = result.links.slice(0, MAX_LINKS);
  const checked = await Promise.all(candidates.map(async function (link) {
    if (!link || typeof link !== 'object') return null;
    const url = youtubeVideo(text(link.url, 500));
    const channel = text(link.channel, 160);
    let evidence;
    try { evidence = new URL(text(link.evidenceUrl, 500)); } catch (e) { return null; }
    if (!url || !channel || evidence.protocol !== 'https:') return null;
    try {
      const video = await verifyPublicVideo(url);
      if (!video || !sameChannel(channel, video.channel)) return null;
      return {
        title: video.title,
        url: url,
        channel: video.channel,
        evidenceUrl: evidence.href,
        note: text(link.note, 300),
        status: 'playable',
        free: true
      };
    } catch (e) {
      return { checkFailed: true };
    }
  }));
  const verificationFailures = checked.filter(function (item) { return item && item.checkFailed; }).length;
  return {
    reply: text(result.reply, 500) || 'Search complete. Results are not exhaustive and may vary by region.',
    links: checked.filter(function (item) { return item && !item.checkFailed; }),
    verificationFailures: verificationFailures
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) { res.status(500).json({ error: 'ADMIN_PASSWORD is not set in Vercel' }); return; }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!same(given, password)) { res.status(401).json({ error: 'Wrong password' }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'GROQ_API_KEY is not set in Vercel' }); return; }

  const body = bodyOf(req);
  if (!body) { res.status(400).json({ error: 'Invalid JSON body' }); return; }

  try {
    if (body.mode === 'links') {
      if (!body.match || typeof body.match !== 'object' || Array.isArray(body.match)) {
        res.status(400).json({ error: 'Match details are required' });
        return;
      }
      const result = await findLinks(body.match, apiKey);
      res.status(200).json(result);
      return;
    }
    if (body.mode !== 'chat' || !Array.isArray(body.messages)) {
      res.status(400).json({ error: 'Unsupported assistant mode' });
      return;
    }

    const messages = body.messages.slice(-12).map(function (message) {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return null;
      const content = text(message.content, 2000);
      return content ? { role: message.role, content: content } : null;
    }).filter(Boolean);
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      res.status(400).json({ error: 'A user message is required' });
      return;
    }
    const reply = await groq([
      { role: 'system', content: 'You are a helpful cricket assistant. Recommend only lawful, official viewing options and be clear when availability or cost is uncertain.' }
    ].concat(messages), apiKey, false);
    res.status(200).json({ reply: reply });
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' || e.name === 'TimeoutError' ? 'Assistant request timed out. Please try again.' : e.message });
  }
};
