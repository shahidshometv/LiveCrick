// POST /api/check-link -> { status, detail, free }   (needs ADMIN_PASSWORD)
// Body: { url }
// status: 'playable' | 'maybe-embed' | 'login-required' | 'blocked-embed' | 'paywall-hint' | 'broken' | 'unreachable' | 'bad-url'
// free:   true | false | null  (null = cannot tell; only YouTube public videos are marked true)
const crypto = require('crypto');

const TIMEOUT_MS = 8000;
const MAX_READ = 60000;
const PAY_WORDS = /subscribe to (watch|continue)|sign in to (watch|continue)|log in to (watch|continue)|premium (only|subscribers?)|buy (a )?ticket|pay(-| )per(-| )view/i;

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function isPrivateHost(h) {
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return h === '::1' || h.startsWith('[');
}

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(function () { c.abort(); }, ms);
  return { signal: c.signal, done: function () { clearTimeout(t); } };
}

async function checkYouTube(url) {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url), { signal: t.signal });
    if (r.status === 200) return { status: 'playable', detail: 'YouTube video is public and embeddable', free: true };
    if (r.status === 401 || r.status === 403) return { status: 'blocked-embed', detail: 'YouTube says embedding is disabled or the video is private', free: null };
    if (r.status === 404) return { status: 'broken', detail: 'YouTube video not found (removed or wrong link)', free: null };
    return { status: 'unreachable', detail: 'YouTube returned status ' + r.status, free: null };
  } catch (e) {
    return { status: 'unreachable', detail: 'Could not reach YouTube', free: null };
  } finally { t.done(); }
}

async function checkGeneric(url) {
  const t = withTimeout(TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, { redirect: 'follow', signal: t.signal, headers: { Range: 'bytes=0-' + MAX_READ, 'User-Agent': 'Mozilla/5.0 BoundaryLinkCheck' } });
  } catch (e) {
    t.done();
    return { status: 'unreachable', detail: 'Could not connect to this link', free: null };
  }
  try {
    if (r.status >= 400) return { status: 'broken', detail: 'Server returned status ' + r.status, free: null };

    const finalUrl = new URL(r.url);
    if (/login|signin|sign-in|subscribe|checkout|account/i.test(finalUrl.pathname + finalUrl.search) && !/login|signin/i.test(url)) {
      return { status: 'login-required', detail: 'Link redirects to a login or subscribe page', free: false };
    }

    const type = (r.headers.get('content-type') || '').toLowerCase();
    const cors = !!r.headers.get('access-control-allow-origin');
    if (/mpegurl|mp4|webm|video\//.test(type) || /\.(m3u8|mp4|webm)$/i.test(finalUrl.pathname)) {
      return {
        status: cors ? 'playable' : 'blocked-embed',
        detail: cors ? 'Direct video stream responds correctly' : 'Stream found but it does not allow browser playback (no CORS header)',
        free: null
      };
    }

    const xfo = (r.headers.get('x-frame-options') || '').toUpperCase();
    const csp = r.headers.get('content-security-policy') || '';
    if (xfo.indexOf('DENY') > -1 || xfo.indexOf('SAMEORIGIN') > -1 || /frame-ancestors\s+'none'|frame-ancestors\s+'self'/i.test(csp)) {
      return { status: 'blocked-embed', detail: 'The page refuses to be shown inside another site. Open it in a new tab instead.', free: null };
    }

    let text = '';
    try { text = (await r.text()).slice(0, MAX_READ); } catch (e) {}
    if (PAY_WORDS.test(text)) {
      return { status: 'paywall-hint', detail: 'Page text suggests a subscription or payment is needed', free: false };
    }
    return { status: 'maybe-embed', detail: 'Page loads. Playback is not confirmed until the player runs.', free: null };
  } finally { t.done(); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) { res.status(500).json({ error: 'ADMIN_PASSWORD is not set in Vercel' }); return; }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!same(given, pw)) { res.status(401).json({ error: 'Wrong password' }); return; }

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  const url = String((body && body.url) || '').trim();

  let u;
  try { u = new URL(url); } catch (e) { res.status(200).json({ status: 'bad-url', detail: 'Not a valid link', free: null }); return; }
  if (u.protocol !== 'https:' || url.length > 500 || isPrivateHost(u.hostname)) {
    res.status(200).json({ status: 'bad-url', detail: 'Only public https links can be checked', free: null });
    return;
  }

  const host = u.hostname.replace(/^www\.|^m\./, '');
  try {
    const out = (host === 'youtube.com' || host === 'youtu.be') ? await checkYouTube(url) : await checkGeneric(url);
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ status: 'unreachable', detail: 'Check failed', free: null });
  }
};
