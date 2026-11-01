// LiveCrick web app. Static site: reads bundled JSON fixtures in ./data.
// Swap loadData() for real API calls once the NestJS backend exists (PRD section 12).

const state = { matches: null, channels: null, cricketTab: 'live', channelQuery: '' };

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function loadData() {
  if (state.matches && state.channels) return;
  const [m, c] = await Promise.all([
    fetch('data/matches.json').then((r) => r.json()),
    fetch('data/channels.json').then((r) => r.json()),
  ]);
  state.matches = m.matches;
  state.channels = c.channels;
}

// PRD section 13: never present stale data as live.
function freshness(iso) {
  if (!iso) return 'Score unavailable';
  const age = (Date.now() - Date.parse(iso)) / 1000;
  if (age < 30) return 'Updated just now';
  if (age < 120) return `Updated ${Math.round(age)}s ago`;
  return `Last updated ${Math.round(age / 60)} min ago · may be stale`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function matchCard(m) {
  const scoreText = m.score
    ? `${m.score.runs}/${m.score.wickets} (${m.score.overs} ov)`
    : null;

  let body;
  if (m.status === 'live') {
    body = `<div class="score">${esc(scoreText ?? 'Score not available')}</div>
            <div class="meta">${esc(freshness(m.lastUpdatedAt))}</div>`;
  } else if (m.status === 'upcoming') {
    body = `<div class="meta">Starts ${esc(fmtDate(m.startsAt))}</div>`;
  } else {
    body = `<div class="score">${esc(scoreText ?? 'Result unavailable')}</div>
            <div class="meta">Final</div>`;
  }

  return `<article class="card">
    <div class="row">
      <span class="meta">${esc(m.tournament)}</span>
      ${m.video?.available ? '<span class="chip">Live video</span>' : ''}
    </div>
    <h3>${esc(m.teamA.shortName)} vs ${esc(m.teamB.shortName)}</h3>
    ${body}
  </article>`;
}

function channelCard(ch) {
  return `<button class="card channel" data-channel="${esc(ch.id)}" type="button">
    <div class="icon">📺</div>
    <div><strong>${esc(ch.name)}</strong></div>
    <div class="lang">${esc(ch.language)}</div>
  </button>`;
}

function homeView() {
  const live = state.matches.filter((m) => m.status === 'live');
  return `
    <h1>Live now</h1>
    ${live.length
      ? `<div class="grid grid-matches">${live.map(matchCard).join('')}</div>`
      : '<div class="empty">No live matches right now.</div>'}
    <h2>Channels</h2>
    <div class="grid">${state.channels.map(channelCard).join('')}</div>`;
}

function cricketView() {
  const tabs = [['live', 'Live'], ['upcoming', 'Upcoming'], ['completed', 'Results']];
  const items = state.matches.filter((m) => m.status === state.cricketTab);
  return `
    <h1>Cricket</h1>
    <div class="subtabs">
      ${tabs.map(([k, label]) =>
        `<button data-cricket="${k}" class="${k === state.cricketTab ? 'active' : ''}" type="button">${label}</button>`
      ).join('')}
    </div>
    ${items.length
      ? `<div class="grid grid-matches">${items.map(matchCard).join('')}</div>`
      : '<div class="empty">No matches right now.</div>'}`;
}

function liveTvView() {
  const q = state.channelQuery.toLowerCase();
  const items = state.channels.filter((c) => !q || c.name.toLowerCase().includes(q));
  return `
    <h1>Live TV</h1>
    <input class="search" id="channel-search" type="search"
           placeholder="Search channels" value="${esc(state.channelQuery)}" />
    ${items.length
      ? `<div class="grid">${items.map(channelCard).join('')}</div>`
      : '<div class="empty">No channels found.</div>'}`;
}

function profileView() {
  return `
    <h1>Profile</h1>
    <div class="list">
      <div><strong>Guest</strong><div class="meta">Sign in is optional</div></div>
      <div>Notification settings</div>
      <div>Privacy policy</div>
      <div>Terms of use</div>
      <div>Help and support</div>
      <div><span class="meta">Data source: bundled sample data</span></div>
    </div>`;
}

const routes = {
  home: homeView,
  cricket: cricketView,
  livetv: liveTvView,
  profile: profileView,
};

async function render() {
  const name = (location.hash || '#home').slice(1);
  const tab = routes[name] ? name : 'home';
  const view = document.getElementById('view');

  document.querySelectorAll('.tabs a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === tab));

  view.innerHTML = '<div class="empty">Loading…</div>';
  try {
    await loadData();
    view.innerHTML = routes[tab]();
  } catch {
    view.innerHTML = '<div class="empty">Could not load data. Check your connection and try again.</div>';
  }
}

// ---- Player: plays only streams returned for a channel; fails closed when none. ----
const video = document.getElementById('video');
const playerEl = document.getElementById('player');
const msgEl = document.getElementById('player-msg');
let hls = null;

function destroyHls() {
  if (hls) { hls.destroy(); hls = null; }
}

function openPlayer(ch) {
  document.getElementById('player-title').textContent = ch.name;
  msgEl.textContent = '';
  playerEl.classList.remove('hidden');
  destroyHls();

  if (!ch.testManifestUrl) {
    video.removeAttribute('src');
    video.load();
    msgEl.textContent = 'This channel is not available in your region.';
    return;
  }

  if (window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(ch.testManifestUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) msgEl.textContent = 'Playback failed. Check your connection and try again.';
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = ch.testManifestUrl;
  } else {
    msgEl.textContent = 'This browser cannot play HLS streams.';
    return;
  }
  video.play().catch(() => {});
}

function closePlayer() {
  video.pause();
  destroyHls();
  video.removeAttribute('src');
  video.load();
  playerEl.classList.add('hidden');
}

// ---- Events ----
document.getElementById('player-close').addEventListener('click', closePlayer);

document.getElementById('view').addEventListener('click', (e) => {
  const sub = e.target.closest('[data-cricket]');
  if (sub) {
    state.cricketTab = sub.dataset.cricket;
    render();
    return;
  }
  const chBtn = e.target.closest('[data-channel]');
  if (chBtn) {
    const ch = state.channels.find((c) => c.id === chBtn.dataset.channel);
    if (ch) openPlayer(ch);
  }
});

document.getElementById('view').addEventListener('input', (e) => {
  if (e.target.id === 'channel-search') {
    state.channelQuery = e.target.value.trim();
    const pos = e.target.selectionStart;
    render().then(() => {
      const input = document.getElementById('channel-search');
      if (input) { input.focus(); input.setSelectionRange(pos, pos); }
    });
  }
});

window.addEventListener('hashchange', render);
render();
