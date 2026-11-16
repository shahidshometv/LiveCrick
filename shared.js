/* Shared helpers for index.html and admin.html */
(function () {
  var B = {};

  B.statusOf = function (it) {
    var s = Date.parse(it.start), e = s + (it.hours || 8) * 36e5, n = Date.now();
    if (it.api) {
      if (it.api.ended) return 'finished';
      if (it.api.started) return n >= e + 864e5 ? 'finished' : 'live';
      return n >= e ? 'finished' : 'upcoming';
    }
    if (n >= e) return 'finished';
    if (n < s) return 'upcoming';
    return it.timeTbc ? 'upcoming' : 'live';
  };

  B.when = function (it) {
    if (it.timeTbc) return it.dateLabel || '';
    try { return new Date(it.start).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  };

  function clean(n) { return n.toLowerCase().replace(/\b(u-?19s?|under-?19s?|women|men)\b/g, '').replace(/\s+/g, ' ').trim(); }
  function teamsOf(it) {
    var p = it.title.split(',')[0].split(/\s+v(?:s\.?)?\s+/i);
    return p.length === 2 ? [clean(p[0]), clean(p[1])] : null;
  }

  /* merge hand-written fixtures with the live feed, then attach admin embeds */
  B.build = function (manual, api, embeds) {
    var used = {};
    var items = manual.map(function (m) {
      var it = Object.assign({}, m), t = teamsOf(m), ms = Date.parse(m.start);
      if (t) {
        for (var i = 0; i < api.length; i++) {
          var a = api[i]; if (used[a.id]) continue;
          var n = a.title.toLowerCase();
          if (n.indexOf(t[0]) > -1 && n.indexOf(t[1]) > -1 && Math.abs(Date.parse(a.start) - ms) < 36e5 * 30) { it.api = a.api; used[a.id] = 1; break; }
        }
      }
      return it;
    });
    api.forEach(function (a) { if (!used[a.id]) items.push(a); });
    items.forEach(function (it) { it.embed = (embeds && embeds[it.id]) || ''; });
    return items;
  };

  B.sorted = function (items) {
    var rank = { live: 0, upcoming: 1, finished: 2 };
    return items.map(function (i) { i._s = B.statusOf(i); return i; }).sort(function (a, b) {
      if (rank[a._s] !== rank[b._s]) return rank[a._s] - rank[b._s];
      var d = Date.parse(a.start) - Date.parse(b.start);
      return a._s === 'finished' ? -d : d;
    });
  };

  /* turn whatever was pasted into something playable: {kind:'iframe'|'video', src} */
  B.embedOf = function (raw) {
    if (!raw) return null;
    var u;
    try { u = new URL(String(raw).trim()); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    var h = u.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtu.be') { var id = u.pathname.slice(1).split('/')[0]; if (id) return { kind: 'iframe', src: 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0' }; }
    if (h === 'youtube.com') {
      var m = u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{6,})/);
      if (u.pathname === '/embed/live_stream') return { kind: 'iframe', src: u.href };
      if (m) return { kind: 'iframe', src: 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&rel=0' };
      var v = u.searchParams.get('v');
      if (u.pathname === '/watch' && v) return { kind: 'iframe', src: 'https://www.youtube.com/embed/' + encodeURIComponent(v) + '?autoplay=1&rel=0' };
    }
    if (/\.(m3u8|mp4|webm)$/i.test(u.pathname)) return { kind: 'video', src: u.href };
    return { kind: 'iframe', src: u.href };
  };

  B.loadData = function () {
    function j(url, fallback) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : fallback; }).catch(function () { return fallback; });
    }
    return Promise.all([
      fetch('streams.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }),
      j('/api/matches', { matches: [] }),
      j('/api/embeds', { embeds: {}, channels: [] })
    ]).then(function (r) {
      return {
        siteName: r[0].siteName,
        items: B.build(r[0].items || [], r[1].matches || [], r[2].embeds || {}),
        channels: Array.isArray(r[2].channels) ? r[2].channels : []
      };
    });
  };

  window.Boundary = B;
})();
