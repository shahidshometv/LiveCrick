// GET  /api/embeds  -> { embeds: { matchId: url } }      (public)
// POST /api/embeds  -> save or clear one link             (needs ADMIN_PASSWORD)
// Storage: an Upstash Redis database connected to the Vercel project.
const crypto = require('crypto');
const KEY = 'boundary:embeds';

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function cmd(s, args) {
  const r = await fetch(s.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}
async function readAll(s) {
  const v = await cmd(s, ['GET', KEY]);
  if (!v) return {};
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async function handler(req, res) {
  const s = store();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    if (!s) { res.status(200).json({ embeds: {}, error: 'Storage is not connected' }); return; }
    try { res.status(200).json({ embeds: await readAll(s) }); }
    catch (e) { res.status(200).json({ embeds: {}, error: 'Read failed' }); }
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) { res.status(500).json({ error: 'ADMIN_PASSWORD is not set in Vercel' }); return; }
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!same(given, pw)) { res.status(401).json({ error: 'Wrong password' }); return; }

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  body = body || {};
  if (body.action === 'login') { res.status(200).json({ ok: true }); return; }

  if (!s) { res.status(500).json({ error: 'Storage is not connected. Add an Upstash Redis database to the project.' }); return; }
  const id = String(body.id || '');
  const link = String(body.url || '').trim();
  if (!/^[\w.-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Bad match id' }); return; }
  if (link) {
    let u;
    try { u = new URL(link); } catch (e) { res.status(400).json({ error: 'That is not a valid link' }); return; }
    if (u.protocol !== 'https:' || link.length > 500) { res.status(400).json({ error: 'Link must start with https:// and be under 500 characters' }); return; }
  }
  try {
    const all = await readAll(s);
    if (link) {
      if (!(id in all) && Object.keys(all).length >= 500) { res.status(400).json({ error: 'Too many saved links. Clear some first.' }); return; }
      all[id] = link;
    } else { delete all[id]; }
    await cmd(s, ['SET', KEY, JSON.stringify(all)]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not save' });
  }
};
