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

function httpsPage(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
  return u.href;
}

function relatedHosts(a, b) {
  const normalize = function (host) { return host.toLowerCase().replace(/^www\./, ''); };
  const x = normalize(a), y = normalize(b);
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
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
    'Viewing region: worldwide; identify the countries or regions where each result is free',
    'Match: ' + text(match.title, 180),
    'Series: ' + text(match.series, 180),
    'Venue: ' + text(match.venue, 180),
    'Start: ' + text(match.start, 80),
    'Date: ' + text(match.dateLabel, 80)
  ].filter(function (line) { return !line.endsWith(': '); }).join('\n');
  const system = [
    'You search the live web for official cricket streams and full-match replays that are free in at least one country or region worldwide.',
    'Search broadly across official cricket board, tournament organizer, and broadcast-rights-holder sources, including official YouTube channels and official broadcaster watch pages in different countries.',
    'Only return live streams or full-match replays that an official source presents as free to watch, including free-with-account options. Do not include unofficial uploads, clips/highlights, mirrors, pirated streams, or paid/subscription-only options.',
    'Return as many distinct qualifying results as you can substantiate, up to 12. Prefer direct official watch pages over homepages. Do not claim the list is exhaustive. Include the countries or regions where each result is free, plus any account or other access requirements. If official evidence does not establish that the stream is free and where it is available, do not include it.',
    'Reply with a single JSON object and no markdown: {"reply":"brief scope and regional-availability caveat","links":[{"title":"video or stream title","url":"https://official-source.example/watch","publisher":"official channel or broadcaster name","access":"free|free-with-account","evidenceUrl":"https://official-source.example/event","note":"countries/regions where free and any access requirements"}]}.',
    'Each evidenceUrl must be an HTTPS page from the same official site or its subdomain and support the official status, free access, and stated region. Never invent URLs, evidence, publishers, or availability. If nothing qualifies, return an empty links array.'
  ].join(' ');
  const content = await groq([
    { role: 'system', content: system },
    { role: 'user', content: details + '\nFind official free live-stream or full-match replay pages available anywhere worldwide. Search beyond YouTube and identify regional limits.' }
  ], apiKey, true);
  const result = parseResult(content);
  if (!result || !Array.isArray(result.links)) throw new Error('Assistant returned an unreadable search result');

  const candidates = result.links.slice(0, MAX_LINKS);
  const checked = await Promise.all(candidates.map(async function (link) {
    if (!link || typeof link !== 'object') return null;
    const rawUrl = text(link.url, 500);
    const evidenceUrl = httpsPage(text(link.evidenceUrl, 500));
    const publisher = text(link.publisher || link.channel, 160);
    const access = text(link.access, 32).toLowerCase();
    if (!evidenceUrl || !publisher || !['free', 'free-with-account'].includes(access)) return null;

    const url = youtubeVideo(rawUrl);
    if (url) {
      try {
        const video = await verifyPublicVideo(url);
        if (!video || !sameChannel(publisher, video.channel)) return null;
        return {
          title: video.title,
          url: url,
          channel: video.channel,
          evidenceUrl: evidenceUrl,
          note: text(link.note, 300),
          status: 'playable',
          access: access,
          free: true
        };
      } catch (e) {
        return { checkFailed: true };
      }
    }

    const pageUrl = httpsPage(rawUrl);
    if (!pageUrl) return null;
    const page = new URL(pageUrl), evidence = new URL(evidenceUrl);
    if (!relatedHosts(page.hostname, evidence.hostname)) return null;
    return {
      title: text(link.title, 200) || publisher + ' official watch page',
      url: pageUrl,
      channel: publisher,
      evidenceUrl: evidenceUrl,
      note: text(link.note, 300),
      status: 'official-page',
      access: access,
      free: true
    };
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
