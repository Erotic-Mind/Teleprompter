// Control window: editor + operator view + preview. Owns settings, drives the presenter.

const $ = (id) => document.getElementById(id);
const els = {
  script: $('script'),
  segList: $('seg-list'),
  editView: $('edit-view'),
  performView: $('perform-view'),
  previewView: $('preview-view'),
  previewScroll: $('preview-scroll'),
  previewText: $('preview-text'),
  modeSwitch: $('mode-switch'),
  unitSwitch: $('unit-switch'),
  play: $('btn-play'),
  prev: $('btn-prev'),
  next: $('btn-next'),
  reset: $('btn-reset'),
  wpm: $('wpm'),
  wpmVal: $('wpm-val'),
  font: $('font'),
  fontVal: $('font-val'),
  mirror: $('mirror'),
  displayList: $('display-list'),
  extend: $('btn-extend'),
  show: $('btn-show'),
  stDot: $('st-dot'),
  stText: $('st-text'),
  liveDot: $('live-dot'),
  pct: $('pct'),
};

const MAX_WPM = 500;
const MIN_WPM = 40;

const state = {
  text: '',
  unit: 'paragraph',
  wpm: 130,
  font: 72,
  mirror: false, // OFF by default — turn on only if the glass shows text backwards
  playing: false,
  segments: [],
  currentSeg: 0,
  presenterVisible: false,
};

const send = (msg) => window.api.toPresenter(msg);
const save = () =>
  window.api.saveState({ text: state.text, unit: state.unit, wpm: state.wpm, font: state.font, mirror: state.mirror });

// --- segments + operator list ----------------------------------------------

function rebuildSegments() {
  state.segments = window.Segments.splitSegments(state.text, state.unit);
  if (state.currentSeg >= state.segments.length) state.currentSeg = Math.max(0, state.segments.length - 1);
  renderList();
  els.previewText.textContent = state.text;
  sendScript();
}

function sendScript() {
  send({ type: 'script', segments: state.segments, unit: state.unit });
}

function renderList() {
  els.segList.innerHTML = '';
  if (state.segments.length === 0) {
    const p = document.createElement('div');
    p.className = 'empty-note';
    p.innerHTML = 'No script yet.<br />Switch to <b>Edit</b> and paste your lines.';
    els.segList.appendChild(p);
    return;
  }
  state.segments.forEach((seg) => {
    const row = document.createElement('div');
    row.className = 'seg-row';
    row.dataset.i = seg.index;
    row.title = 'Click to jump the prompter here';
    row.innerHTML = `<span class="num">${String(seg.index + 1).padStart(2, '0')}</span>${escapeHtml(seg.text)}`;
    row.addEventListener('click', () => jumpTo(seg.index));
    els.segList.appendChild(row);
  });
  highlightRow(state.currentSeg, false);
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function highlightRow(idx, scroll = true) {
  els.segList.querySelectorAll('.seg-row.current').forEach((r) => r.classList.remove('current'));
  const row = els.segList.querySelector(`.seg-row[data-i="${idx}"]`);
  if (row) {
    row.classList.add('current');
    if (scroll) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// Jump the prompter to a segment (paused there, ready for a take).
function jumpTo(idx) {
  if (state.segments.length === 0) return;
  idx = Math.max(0, Math.min(state.segments.length - 1, idx));
  state.currentSeg = idx;
  setPlaying(false);
  send({ type: 'seekSeg', index: idx });
  highlightRow(idx);
}

// --- transport --------------------------------------------------------------

function setPlaying(on) {
  state.playing = on;
  send({ type: on ? 'play' : 'pause' });
  els.play.textContent = on ? '❚❚ Pause' : '▶ Play';
  els.play.classList.toggle('playing', on);
  els.liveDot.style.background = on ? 'var(--ok)' : 'var(--muted)';
}

els.play.addEventListener('click', () => setPlaying(!state.playing));
els.prev.addEventListener('click', () => jumpTo(state.currentSeg - 1));
els.next.addEventListener('click', () => jumpTo(state.currentSeg + 1));
els.reset.addEventListener('click', () => {
  setPlaying(false);
  state.currentSeg = 0;
  send({ type: 'reset' });
  highlightRow(0);
});

// --- editor + settings ------------------------------------------------------

els.script.addEventListener('input', () => {
  state.text = els.script.value;
  rebuildSegments();
  save();
});

els.wpm.addEventListener('input', () => {
  state.wpm = Number(els.wpm.value);
  els.wpmVal.textContent = state.wpm;
  send({ type: 'speed', value: state.wpm });
  save();
});
els.font.addEventListener('input', () => {
  state.font = Number(els.font.value);
  els.fontVal.textContent = state.font;
  send({ type: 'font', value: state.font });
  save();
});
els.mirror.addEventListener('change', () => {
  state.mirror = els.mirror.checked;
  send({ type: 'mirror', value: state.mirror });
  save();
});

// mode switch (Edit / Perform / Preview)
els.modeSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setMode(b.dataset.mode);
});
function setMode(mode) {
  els.modeSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  els.editView.classList.toggle('on', mode === 'edit');
  els.performView.classList.toggle('on', mode === 'perform');
  els.previewView.classList.toggle('on', mode === 'preview');
}

// unit switch (Paragraph / Line)
els.unitSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.unit = b.dataset.unit;
  els.unitSwitch.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  state.currentSeg = 0;
  rebuildSegments();
  save();
});

// --- screens + presenter window --------------------------------------------

els.displayList.addEventListener('change', () => {
  const id = Number(els.displayList.value);
  if (!Number.isNaN(id)) window.api.showPresenter(id);
});

els.show.addEventListener('click', () => {
  if (state.presenterVisible) window.api.hidePresenter();
  else window.api.showPresenter();
});

els.extend.addEventListener('click', async () => {
  els.extend.disabled = true;
  els.extend.textContent = 'Working…';
  await window.api.extendDisplays();
  await loadDisplays();
  window.api.showPresenter();
  els.extend.textContent = 'Make Separate Screen';
  els.extend.disabled = false;
});

async function loadDisplays() {
  const list = await window.api.getDisplays();
  els.displayList.innerHTML = '';
  list.forEach((d) => {
    const opt = document.createElement('option');
    const tag = d.isPrimary ? ' — laptop' : ` — ${/elgato|prom/i.test(d.label) ? 'prompter' : 'external'}`;
    opt.value = d.id;
    opt.textContent = `${d.w}×${d.h}${tag}`;
    if (!d.isPrimary) opt.selected = true;
    els.displayList.appendChild(opt);
  });
}

if (window.api.platform !== 'win32') {
  els.extend.style.display = 'none'; // Windows-only helper
}

// status banner
window.api.onPresenterStatus((s) => {
  state.presenterVisible = s.visible;
  els.show.textContent = s.visible ? 'Hide Prompter' : 'Show Prompter';
  els.show.classList.toggle('accent', !s.visible);

  if (s.visible) {
    els.stDot.className = 'dot ok';
    els.stText.textContent = `Prompter live on ${s.label || 'external screen'} (${s.w}×${s.h})`;
  } else if (s.hasExternal) {
    els.stDot.className = 'dot warn';
    els.stText.textContent = `${s.label} ready — click Show Prompter`;
  } else if (s.screenCount <= 1) {
    els.stDot.className = 'dot warn';
    els.stText.textContent = 'Prompter is mirroring your laptop — click "Make Separate Screen"';
  } else {
    els.stDot.className = 'dot';
    els.stText.textContent = 'No prompter screen detected';
  }
});
window.api.onDisplaysChanged(loadDisplays);

// --- messages from the presenter -------------------------------------------

window.api.onFromPresenter((msg) => {
  if (msg.type === 'ready') {
    sendScript();
    send({ type: 'font', value: state.font });
    send({ type: 'speed', value: state.wpm });
    send({ type: 'mirror', value: state.mirror });
    send({ type: 'seekSeg', index: state.currentSeg });
  } else if (msg.type === 'seg') {
    if (msg.index >= 0 && msg.index !== state.currentSeg) {
      state.currentSeg = msg.index;
      highlightRow(msg.index);
    }
  } else if (msg.type === 'pos') {
    els.pct.textContent = Math.round(msg.ratio * 100) + '%';
    const max = els.previewScroll.scrollHeight - els.previewScroll.clientHeight;
    if (max > 0) els.previewScroll.scrollTop = msg.ratio * max;
    if (msg.atEnd && state.playing) setPlaying(false);
  }
});

// --- keyboard remote (works while this window is focused) --------------------

window.addEventListener('keydown', (e) => {
  const typing = document.activeElement === els.script;
  if (typing && e.key !== 'Escape') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      setPlaying(!state.playing);
      break;
    case 'PageDown':
      e.preventDefault();
      jumpTo(state.currentSeg + 1);
      break;
    case 'PageUp':
      e.preventDefault();
      jumpTo(state.currentSeg - 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      els.wpm.value = Math.min(MAX_WPM, state.wpm + 5);
      els.wpm.dispatchEvent(new Event('input'));
      break;
    case 'ArrowDown':
      e.preventDefault();
      els.wpm.value = Math.max(MIN_WPM, state.wpm - 5);
      els.wpm.dispatchEvent(new Event('input'));
      break;
    case 'Home':
      e.preventDefault();
      els.reset.click();
      break;
    case 'Escape':
      els.script.blur();
      break;
  }
});

// --- startup ----------------------------------------------------------------

(async function init() {
  const s = (await window.api.loadState()) || {};
  state.text = s.text || '';
  state.unit = s.unit === 'line' ? 'line' : 'paragraph';
  state.wpm = s.wpm || 130;
  state.font = s.font || 72;
  state.mirror = s.mirror === true; // default OFF unless previously turned on

  els.script.value = state.text;
  els.wpm.value = state.wpm;
  els.wpmVal.textContent = state.wpm;
  els.font.value = state.font;
  els.fontVal.textContent = state.font;
  els.mirror.checked = state.mirror;
  els.unitSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.unit === state.unit));

  rebuildSegments();
  setMode(state.text.trim() ? 'perform' : 'edit');

  await loadDisplays();
})();
