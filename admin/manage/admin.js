// LiveCrick channel admin. Edits the channel list in the browser; export to publish.
// Schema matches admin/data/channels.json (the public app reads testManifestUrl).

const DATA_URL = '../data/channels.json';
const state = { channels: [], editingId: null };

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function setStatus(msg) { $('status').textContent = msg; }

function isValidHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch { return false; }
}

function nextId() {
  const nums = state.channels.map((c) => parseInt(String(c.id).replace(/\D/g, ''), 10) || 0);
  return `ch-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}

// ---- Load / save ----
async function load() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    const json = await res.json();
    state.channels = Array.isArray(json.channels) ? json.channels : [];
    setStatus(`Loaded ${state.channels.length} channels from ${DATA_URL}.`);
  } catch {
    state.channels = [];
    setStatus('Could not load channels.json. Starting with an empty list.');
  }
  render();
}

function toPayload() {
  // Only the fields the public app understands, plus rights metadata.
  return {
    channels: state.channels.map((c) => ({
      id: c.id,
      name: c.name,
      language: c.language,
      category: c.category,
      logoUrl: c.logoUrl || null,
      testManifestUrl: c.testManifestUrl || null,
      rights: c.rights || null,
    })),
  };
}

function exportJson() {
  const blob = new Blob([JSON.stringify(toPayload(), null, 2) + '\n'], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'channels.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Exported channels.json. Commit it to admin/data/channels.json to publish.');
}

// ---- Form ----
function readForm() {
  return {
    name: $('f-name').value.trim(),
    language: $('f-language').value,
    category: $('f-category').value,
    logoUrl: $('f-logo').value.trim(),
    testManifestUrl: $('f-stream').value.trim(),
    rights: $('f-rights').value.trim(),
    attested: $('f-attest').checked,
  };
}

function validate(v) {
  if (!v.name) return 'Name is required.';
  if (v.logoUrl && !isValidHttpsUrl(v.logoUrl)) return 'Logo URL must be an https:// address.';
  if (!isValidHttpsUrl(v.testManifestUrl)) return 'Stream URL must be an https:// address.';
  if (!/\.m3u8(\?|$)/i.test(v.testManifestUrl)) return 'Stream URL must be an HLS playlist ending in .m3u8.';
  if (!v.rights) return 'Record the distribution rights (licensor and agreement reference).';
  if (!v.attested) return 'Tick the rights confirmation before saving.';
  const dupe = state.channels.find((c) =>
    c.testManifestUrl === v.testManifestUrl && c.id !== state.editingId);
  if (dupe) return `This stream is already used by "${dupe.name}".`;
  return null;
}

function resetForm() {
  state.editingId = null;
  $('channel-form').reset();
  $('f-id').value = '';
  $('form-title').textContent = 'Add channel';
  $('btn-save').textContent = 'Add channel';
  $('form-error').textContent = '';
  stopTest();
}

function fillForm(c) {
  state.editingId = c.id;
  $('f-name').value = c.name || '';
  $('f-language').value = c.language || 'en';
  $('f-category').value = c.category || 'sports';
  $('f-logo').value = c.logoUrl || '';
  $('f-stream').value = c.testManifestUrl || '';
  $('f-rights').value = c.rights || '';
  $('f-attest').checked = false; // re-confirm on every edit
  $('form-title').textContent = `Edit: ${c.name}`;
  $('btn-save').textContent = 'Save changes';
  $('form-error').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('channel-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = readForm();
  const err = validate(v);
  $('form-error').textContent = err || '';
  if (err) return;

  const record = {
    id: state.editingId || nextId(),
    name: v.name,
    language: v.language,
    category: v.category,
    logoUrl: v.logoUrl || null,
    testManifestUrl: v.testManifestUrl,
    rights: v.rights,
  };

  if (state.editingId) {
    state.channels = state.channels.map((c) => (c.id === state.editingId ? record : c));
    setStatus(`Updated "${record.name}". Export to publish.`);
  } else {
    state.channels.push(record);
    setStatus(`Added "${record.name}". Export to publish.`);
  }
  resetForm();
  render();
});

$('btn-reset').addEventListener('click', resetForm);

// ---- Test stream in the admin before publishing ----
const testVideo = $('test-video');
let testHls = null;

function stopTest() {
  if (testHls) { testHls.destroy(); testHls = null; }
  testVideo.pause();
  testVideo.removeAttribute('src');
  testVideo.load();
  testVideo.classList.add('hidden');
  $('test-msg').textContent = '';
}

$('btn-test').addEventListener('click', () => {
  const url = $('f-stream').value.trim();
  stopTest();
  if (!isValidHttpsUrl(url)) { $('test-msg').textContent = 'Enter a valid https:// stream URL first.'; return; }
  testVideo.classList.remove('hidden');
  if (window.Hls && Hls.isSupported()) {
    testHls = new Hls();
    testHls.loadSource(url);
    testHls.attachMedia(testVideo);
    testHls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) $('test-msg').textContent = 'Stream failed to load. Check the URL.';
    });
  } else if (testVideo.canPlayType('application/vnd.apple.mpegurl')) {
    testVideo.src = url;
  } else {
    $('test-msg').textContent = 'This browser cannot play HLS streams.';
    return;
  }
  testVideo.play().catch(() => {});
});

// ---- List ----
function render() {
  $('count').textContent = `(${state.channels.length})`;
  const list = $('list');
  if (!state.channels.length) {
    list.innerHTML = '<div class="meta">No channels yet.</div>';
    return;
  }
  list.innerHTML = state.channels.map((c) => `
    <div class="item" data-id="${esc(c.id)}">
      <div class="info">
        <strong>${esc(c.name)}</strong>
        <span class="badge ${c.testManifestUrl ? '' : 'off'}">${c.testManifestUrl ? 'Stream set' : 'No stream'}</span>
        <span class="badge">${esc(c.category)} · ${esc(c.language)}</span>
        <div class="url">${esc(c.testManifestUrl || 'No stream URL')}</div>
        <div class="meta">Rights: ${esc(c.rights || 'not recorded')}</div>
      </div>
      <div class="actions">
        <button type="button" class="btn small" data-act="edit">Edit</button>
        <button type="button" class="btn small" data-act="up">Up</button>
        <button type="button" class="btn small" data-act="down">Down</button>
        <button type="button" class="btn small danger" data-act="delete">Delete</button>
      </div>
    </div>`).join('');
}

$('list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.item').dataset.id;
  const i = state.channels.findIndex((c) => c.id === id);
  if (i < 0) return;
  const act = btn.dataset.act;

  if (act === 'edit') fillForm(state.channels[i]);
  if (act === 'up' && i > 0) [state.channels[i - 1], state.channels[i]] = [state.channels[i], state.channels[i - 1]];
  if (act === 'down' && i < state.channels.length - 1) [state.channels[i + 1], state.channels[i]] = [state.channels[i], state.channels[i + 1]];
  if (act === 'delete') {
    if (!confirm(`Delete "${state.channels[i].name}"?`)) return;
    if (state.editingId === id) resetForm();
    state.channels.splice(i, 1);
    setStatus('Deleted. Export to publish.');
  }
  render();
});

// ---- Import / export ----
$('btn-export').addEventListener('click', exportJson);
$('btn-import-open').addEventListener('click', () => {
  $('import-box').classList.remove('hidden');
  $('import-actions').classList.remove('hidden');
  $('import-box').value = JSON.stringify(toPayload(), null, 2);
});
$('btn-import-cancel').addEventListener('click', () => {
  $('import-box').classList.add('hidden');
  $('import-actions').classList.add('hidden');
});
$('btn-import').addEventListener('click', () => {
  try {
    const json = JSON.parse($('import-box').value);
    if (!Array.isArray(json.channels)) throw new Error('Missing "channels" array.');
    const bad = json.channels.find((c) => c.testManifestUrl && !isValidHttpsUrl(c.testManifestUrl));
    if (bad) throw new Error(`Invalid stream URL on "${bad.name}". Must be https://`);
    state.channels = json.channels;
    setStatus(`Loaded ${state.channels.length} channels from pasted JSON.`);
    $('btn-import-cancel').click();
    render();
  } catch (err) {
    setStatus(`Import failed: ${err.message}`);
  }
});

load();
