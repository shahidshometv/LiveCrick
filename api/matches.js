// Vercel serverless function: GET /api/matches
// Needs the environment variable CRICKET_API_KEY (free key from https://cricketdata.org).
const HOURS = { test: 120, odi: 9, t20: 4 };

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=300');
  const key = process.env.CRICKET_API_KEY;
  if (!key) {
    res.status(200).json({ matches: [], error: 'CRICKET_API_KEY is not set' });
    return;
  }
  try {
    const r = await fetch('https://api.cricapi.com/v1/currentMatches?apikey=' + encodeURIComponent(key) + '&offset=0');
    const d = await r.json();
    if (d.status !== 'success' || !Array.isArray(d.data)) {
      res.status(200).json({ matches: [], error: d.reason || 'API error' });
      return;
    }
    const matches = d.data.map(function (m) {
      let t = m.dateTimeGMT || '';
      if (t && !/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t += 'Z';
      const type = (m.matchType || '').toLowerCase();
      return {
        id: 'api-' + m.id,
        title: m.name || '',
        series: (m.matchType || '').toUpperCase(),
        venue: m.venue || '',
        start: t,
        hours: HOURS[type] || 8,
        api: {
          started: !!m.matchStarted,
          ended: !!m.matchEnded,
          status: m.status || '',
          score: Array.isArray(m.score) ? m.score : []
        }
      };
    }).filter(function (m) { return m.title && m.start && !isNaN(Date.parse(m.start)); });
    res.status(200).json({ matches: matches });
  } catch (e) {
    res.status(200).json({ matches: [], error: 'Fetch failed' });
  }
};
