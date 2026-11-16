// GET  /api/embeds  -> { embeds: { matchId: url }, channels: [] } (public)
// POST /api/embeds  -> manage match links or custom channels (needs ADMIN_PASSWORD)
// Storage: Neon Postgres (DATABASE_URL) or, as a fallback, Upstash Redis.
const crypto = require('crypto');

/* ---------- Neon (Postgres) ---------- */
let neonSql = null, tablesReady = false;
function neonUrl() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || ''; }
async function neon() {
  if (!neonSql) {
    const { neon } = require('@neondatabase/serverless');
    neonSql = neon(neonUrl());
  }
  if (!tablesReady) {
    await neonSql`CREATE TABLE IF NOT EXISTS embeds (id text PRIMARY KEY, url text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    await neonSql`CREATE TABLE IF NOT EXISTS channels (id text PRIMARY KEY, name text NOT NULL, category text NOT NULL, url text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    tablesReady = true;
  }
  return neonSql;
}

/* ---------- Upstash (Redis REST) ---------- */
const KEY = 'boundary:embeds';
const CHANNELS_KEY = 'boundary:channels';
function upstash() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
async function redis(s, args) {
  const r = await fetch(s.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}
async function redisAll(s) {
  const v = await redis(s, ['GET', KEY]);
  if (!v) return {};
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
async function redisChannels(s) {
  const v = await redis(s, ['GET', CHANNELS_KEY]);
  if (!v) return {};
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) { return {}; }
}

/* ---------- one interface over both ---------- */
function backend() {
  if (neonUrl()) {
    return {
      async all() {
        const sql = await neon();
        const rows = await sql`SELECT id, url FROM embeds`;
        const o = {}; rows.forEach(function (r) { o[r.id] = r.url; }); return o;
      },
      async channelsAll() {
        const sql = await neon();
        return await sql`SELECT id, name, category, url FROM channels ORDER BY category, name`;
      },
      async count() { const sql = await neon(); const r = await sql`SELECT count(*)::int AS n FROM embeds`; return r[0].n; },
      async set(id, url) {
        const sql = await neon();
        await sql`INSERT INTO embeds (id, url) VALUES (${id}, ${url}) ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`;
      },
      async del(id) { const sql = await neon(); await sql`DELETE FROM embeds WHERE id = ${id}`; },
      async setChannel(channel) {
        const sql = await neon();
        await sql`INSERT INTO channels (id, name, category, url) VALUES (${channel.id}, ${channel.name}, ${channel.category}, ${channel.url}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, url = EXCLUDED.url, updated_at = now()`;
      },
      async delChannel(id) { const sql = await neon(); await sql`DELETE FROM channels WHERE id = ${id}`; }
    };
  }
  const s = upstash();
  if (s) {
    return {
      all: function () { return redisAll(s); },
      async channelsAll() {
        const all = await redisChannels(s);
        return Object.keys(all).map(function (id) { return all[id]; });
      },
      async count() { return Object.keys(await redisAll(s)).length; },
      async set(id, url) { const a = await redisAll(s); a[id] = url; await redis(s, ['SET', KEY, JSON.stringify(a)]); },
      async del(id) { const a = await redisAll(s); delete a[id]; await redis(s, ['SET', KEY, JSON.stringify(a)]); },
      async setChannel(channel) {
        const all = await redisChannels(s);
        all[channel.id] = channel;
        await redis(s, ['SET', CHANNELS_KEY, JSON.stringify(all)]);
      },
      async delChannel(id) {
        const all = await redisChannels(s);
        delete all[id];
        await redis(s, ['SET', CHANNELS_KEY, JSON.stringify(all)]);
      }
    };
  }
  return null;
}

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async function handler(req, res) {
  const db = backend();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
    if (!db) { res.status(200).json({ embeds: {}, channels: [], error: 'Storage is not connected' }); return; }
    try { res.status(200).json({ embeds: await db.all(), channels: await db.channelsAll() }); }
    catch (e) { res.status(200).json({ embeds: {}, channels: [], error: 'Read failed' }); }
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

  if (!db) { res.status(500).json({ error: 'Storage is not connected. Connect a Neon database (DATABASE_URL) to the project.' }); return; }
  if (body.action === 'saveChannel') {
    const input = body.channel && typeof body.channel === 'object' && !Array.isArray(body.channel) ? body.channel : {};
    const name = String(input.name || '').trim();
    const category = String(input.category || '').trim();
    const link = String(input.url || '').trim();
    const id = String(input.id || crypto.randomUUID());
    if (!/^[\w.-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Bad channel id' }); return; }
    if (!name || name.length > 100) { res.status(400).json({ error: 'Channel name is required and must be under 100 characters' }); return; }
    if (!category || category.length > 40) { res.status(400).json({ error: 'Category is required and must be under 40 characters' }); return; }
    let channelUrl;
    try { channelUrl = new URL(link); } catch (e) { res.status(400).json({ error: 'Enter a valid channel URL' }); return; }
    if (!['http:', 'https:', 'rtsp:'].includes(channelUrl.protocol) || !channelUrl.hostname || channelUrl.username || channelUrl.password || link.length > 500) {
      res.status(400).json({ error: 'Channel URL must use HTTP, HTTPS, or RTSP, have no embedded credentials, and be under 500 characters' });
      return;
    }
    try {
      const channels = await db.channelsAll();
      if (!input.id && channels.length >= 500) { res.status(400).json({ error: 'Too many channels. Remove some first.' }); return; }
      const channel = { id: id, name: name, category: category, url: channelUrl.href };
      await db.setChannel(channel);
      res.status(200).json({ ok: true, channel: channel });
    } catch (e) {
      res.status(500).json({ error: 'Could not save channel' });
    }
    return;
  }
  if (body.action === 'deleteChannel') {
    const id = String(body.id || '');
    if (!/^[\w.-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Bad channel id' }); return; }
    try {
      await db.delChannel(id);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not delete channel' });
    }
    return;
  }

  const id = String(body.id || '');
  const link = String(body.url || '').trim();
  if (!/^[\w.-]{1,80}$/.test(id)) { res.status(400).json({ error: 'Bad match id' }); return; }
  if (link) {
    let u;
    try { u = new URL(link); } catch (e) { res.status(400).json({ error: 'That is not a valid link' }); return; }
    if (u.protocol !== 'https:' || link.length > 500) { res.status(400).json({ error: 'Link must start with https:// and be under 500 characters' }); return; }
  }
  try {
    if (link) {
      const all = await db.all();
      if (!(id in all) && Object.keys(all).length >= 500) { res.status(400).json({ error: 'Too many saved links. Clear some first.' }); return; }
      await db.set(id, link);
    } else { await db.del(id); }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not save' });
  }
};
