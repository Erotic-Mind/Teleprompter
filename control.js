// Control window — operator surface. Owns settings, drives the presenter.
const $ = (id) => document.getElementById(id);
const send = (m) => window.api.toPresenter(m);

const els = {
  script: $('script'), insPause: $('ins-pause'), insTake: $('ins-take'),
  modeSwitch: $('mode-switch'), unitSwitch: $('unit-switch'),
  wpm: $('wpm'), wpmVal: $('wpm-val'), font: $('font'), fontVal: $('font-val'),
  lh: $('lh'), lhVal: $('lh-val'), w: $('w'), wVal: $('w-val'), rp: $('rp'), rpVal: $('rp-val'),
  mirror: $('mirror'), voice: $('voice'), voiceStatus: $('voice-status'), remoteBox: $('remote-box'),
  play: $('btn-play'), prev: $('btn-prev'), next: $('btn-next'), reset: $('btn-reset'),
  pct: $('pct'), pauseFlag: $('pause-flag'), liveDot: $('live-dot'),
  displayList: $('display-list'), extend: $('btn-extend'), show: $('btn-show'),
  stDot: $('st-dot'), stText: $('st-text'),
  takes: $('takes'), segList: $('seg-list'),
  tElapsed: $('t-elapsed'), tRemain: $('t-remain'), tTotal: $('t-total'),
  // preview
  pvStage: $('preview-stage'), pvViewport: $('preview-viewport'), pvScroller: $('preview-scroller'),
  pvScript: $('preview-script'), pvPadTop: $('pv-padtop'), pvPadBot: $('pv-padbot'),
  pvLine: $('preview-readingline'), pvEmpty: $('preview-empty'),
};

const state = {
  text: '', unit: 'paragraph', wpm: 130, font: 72, lineHeight: 1.45, width: 94, readPos: 45,
  mirror: false, playing: false, mode: 'write', presenterVisible: false, voiceOn: false,
  items: [], segments: [], takes: [], currentSeg: 0,
};
let previewDims = null, lastOffset = 0;

const save = () => window.api.saveState({
  text: state.text, unit: state.unit, wpm: state.wpm, font: state.font,
  lineHeight: state.lineHeight, width: state.width, readPos: state.readPos, mirror: state.mirror,
});

// --- script parsing / lists -------------------------------------------------
function rebuild() {
  const parsed = window.Segments.parseScript(state.text, state.unit);
  state.items = parsed.items;
  state.segments = parsed.segments;
  // takes -> segment index of the seg that follows each take marker
  state.takes = [];
  for (let i = 0; i < parsed.items.length; i++) {
    const it = parsed.items[i];
    if (it.kind === 'marker' && it.type === 'take') {
      let segIndex = state.segments.length ? state.segments[state.segments.length - 1].index : 0;
      for (let j = i + 1; j < parsed.items.length; j++) { if (parsed.items[j].kind === 'seg') { segIndex = parsed.items[j].index; break; } }
      state.takes.push({ label: it.label, segIndex });
    }
  }
  if (state.currentSeg >= state.segments.length) state.currentSeg = Math.max(0, state.segments.length - 1);
  renderSegList(); renderTakes(); buildPreview(); updateTiming();
  send({ type: 'script', items: state.items });
}

function renderSegList() {
  els.segList.innerHTML = '';
  if (!state.segments.length) { els.segList.innerHTML = '<div class="lbl" style="text-align:center;margin-top:20px">Write a script first.</div>'; return; }
  state.segments.forEach((seg) => {
    const row = document.createElement('div');
    row.className = 'seg-row'; row.dataset.i = seg.index;
    row.innerHTML = `<span class="num">${String(seg.index + 1).padStart(2, '0')}</span>${escapeHtml(seg.text)}`;
    row.addEventListener('click', () => jumpTo(seg.index));
    els.segList.appendChild(row);
  });
  highlightRow(state.currentSeg, false);
}
function renderTakes() {
  els.takes.innerHTML = '';
  if (!state.takes.length) { els.takes.innerHTML = '<span class="none">No takes yet. Add <b>[TAKE 1]</b> in your script.</span>'; return; }
  state.takes.forEach((t) => {
    const b = document.createElement('button');
    b.textContent = '↻ ' + t.label;
    b.addEventListener('click', () => jumpTo(t.segIndex));
    els.takes.appendChild(b);
  });
}
function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function highlightRow(idx, scroll = true) {
  els.segList.querySelectorAll('.seg-row.current').forEach((r) => r.classList.remove('current'));
  const row = els.segList.querySelector(`.seg-row[data-i="${idx}"]`);
  if (row) { row.classList.add('current'); if (scroll) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

function jumpTo(idx) {
  if (!state.segments.length) return;
  idx = Math.max(0, Math.min(state.segments.length - 1, idx));
  state.currentSeg = idx; setPlaying(false); send({ type: 'seekSeg', index: idx }); highlightRow(idx);
}

// --- transport --------------------------------------------------------------
function setPlaying(on) {
  state.playing = on; send({ type: on ? 'play' : 'pause' });
  els.play.textContent = on ? '❚❚ Pause' : '▶ Play';
  els.play.classList.toggle('playing', on);
  els.liveDot.style.background = on ? 'var(--ok)' : 'var(--muted)';
  if (on) els.pauseFlag.classList.remove('on');
}
els.play.addEventListener('click', () => setPlaying(!state.playing));
els.prev.addEventListener('click', () => jumpTo(state.currentSeg - 1));
els.next.addEventListener('click', () => jumpTo(state.currentSeg + 1));
els.reset.addEventListener('click', () => { setPlaying(false); state.currentSeg = 0; send({ type: 'reset' }); highlightRow(0); els.pauseFlag.classList.remove('on'); });

// --- editor + markers -------------------------------------------------------
els.script.addEventListener('input', () => { state.text = els.script.value; rebuild(); save(); });
function insertAtCursor(text) {
  const t = els.script; const s = t.selectionStart, e = t.selectionEnd;
  const before = t.value.slice(0, s), after = t.value.slice(e);
  const pad = (before && !before.endsWith('\n') ? '\n' : '') + text + '\n';
  t.value = before + pad + after; t.focus();
  const pos = (before + pad).length; t.setSelectionRange(pos, pos);
  state.text = t.value; rebuild(); save();
}
els.insPause.addEventListener('click', () => insertAtCursor('[PAUSE]'));
els.insTake.addEventListener('click', () => insertAtCursor('[TAKE ' + (state.takes.length + 1) + ']'));

// --- settings ---------------------------------------------------------------
els.wpm.addEventListener('input', () => { state.wpm = +els.wpm.value; els.wpmVal.textContent = state.wpm; send({ type: 'speed', value: state.wpm }); updateTiming(); save(); });
els.font.addEventListener('input', () => { state.font = +els.font.value; els.fontVal.textContent = state.font; els.pvScript.style.fontSize = state.font + 'px'; send({ type: 'font', value: state.font }); save(); });
els.lh.addEventListener('input', () => { state.lineHeight = +els.lh.value / 100; els.lhVal.textContent = state.lineHeight.toFixed(2); els.pvScript.style.lineHeight = state.lineHeight; send({ type: 'lineHeight', value: state.lineHeight }); save(); });
els.w.addEventListener('input', () => { state.width = +els.w.value; els.wVal.textContent = state.width; els.pvScript.style.maxWidth = state.width + '%'; send({ type: 'width', value: state.width }); save(); });
els.rp.addEventListener('input', () => { state.readPos = +els.rp.value; els.rpVal.textContent = state.readPos; send({ type: 'readPos', value: state.readPos }); applyPreviewLayout(); save(); });
els.mirror.addEventListener('change', () => { state.mirror = els.mirror.checked; send({ type: 'mirror', value: state.mirror }); setPreviewOffset(lastOffset); save(); });

els.unitSwitch.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.unit = b.dataset.unit; els.unitSwitch.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  state.currentSeg = 0; rebuild(); save();
});

// --- modes ------------------------------------------------------------------
els.modeSwitch.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
function setMode(mode) {
  state.mode = mode;
  els.modeSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  ['write', 'setup', 'run'].forEach((m) => $(m + '-view').classList.toggle('on', m === mode));
  send({ type: 'previewActive', value: mode === 'run' });
  if (mode === 'run') requestAnimationFrame(computePreviewScale);
}

// --- voice ------------------------------------------------------------------
els.voice.addEventListener('change', () => {
  state.voiceOn = els.voice.checked;
  send({ type: 'voiceMode', value: state.voiceOn });
  if (state.voiceOn) {
    if (!window.Voice || !window.Voice.supported()) { els.voiceStatus.textContent = 'Voice not supported in this browser.'; els.voice.checked = false; state.voiceOn = false; send({ type: 'voiceMode', value: false }); return; }
    const words = wordList();
    window.Voice.start(words, (idx) => send({ type: 'voiceWord', index: idx }), (msg) => { els.voiceStatus.textContent = msg; });
  } else {
    if (window.Voice) window.Voice.stop();
    els.voiceStatus.textContent = '';
  }
});
function wordList() {
  const out = [];
  state.items.forEach((it) => { if (it.kind === 'seg') it.text.split(/\s+/).forEach((w) => { if (w) out.push(w); }); });
  return out;
}

// --- timing -----------------------------------------------------------------
function fmt(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function totalWords() { return wordList().length; }
function updateTiming(ratio) {
  const total = totalWords() / Math.max(1, state.wpm) * 60;
  els.tTotal.textContent = fmt(total);
  if (ratio == null) return;
  els.tElapsed.textContent = fmt(ratio * total);
  els.tRemain.textContent = fmt((1 - ratio) * total);
}

// --- live preview clone -----------------------------------------------------
function buildPreview() {
  els.pvScript.style.fontSize = state.font + 'px';
  els.pvScript.style.lineHeight = state.lineHeight;
  els.pvScript.style.maxWidth = state.width + '%';
  els.pvScript.innerHTML = '';
  state.items.forEach((it) => {
    const d = document.createElement('div');
    if (it.kind === 'seg') { d.className = 'pv-seg'; d.textContent = it.text; }
    else { d.className = 'pv-mark'; d.textContent = '— ' + it.label + ' —'; }
    els.pvScript.appendChild(d);
  });
  setPreviewOffset(lastOffset);
}
function applyPreviewDims(w, h) { previewDims = { w, h }; els.pvViewport.style.width = w + 'px'; els.pvViewport.style.height = h + 'px'; els.pvViewport.style.display = 'block'; els.pvEmpty.style.display = 'none'; applyPreviewLayout(); }
function applyPreviewLayout() {
  if (!previewDims) return;
  const h = previewDims.h;
  els.pvPadTop.style.height = h * state.readPos / 100 + 'px';
  els.pvPadBot.style.height = h * 0.95 + 'px';
  els.pvLine.style.top = h * state.readPos / 100 + 'px';
  computePreviewScale();
}
function computePreviewScale() {
  if (!previewDims) return;
  const st = els.pvStage.getBoundingClientRect();
  const k = Math.max(0.05, Math.min((st.width - 16) / previewDims.w, (st.height - 16) / previewDims.h));
  els.pvViewport.style.zoom = k;
}
function setPreviewOffset(offset) { lastOffset = offset; els.pvScroller.style.transform = `translateY(${-offset}px) scaleX(${state.mirror ? -1 : 1})`; }
window.addEventListener('resize', () => { if (state.mode === 'run') computePreviewScale(); });

// --- screens / presenter window / phone remote ------------------------------
els.displayList.addEventListener('change', () => { const id = +els.displayList.value; if (!isNaN(id)) window.api.showPresenter(id); });
els.show.addEventListener('click', () => { if (state.presenterVisible) window.api.hidePresenter(); else window.api.showPresenter(); });
els.extend.addEventListener('click', async () => { els.extend.disabled = true; els.extend.textContent = 'Working…'; await window.api.extendDisplays(); await loadDisplays(); window.api.showPresenter(); els.extend.textContent = 'Make Separate Screen'; els.extend.disabled = false; });
async function loadDisplays() {
  const list = await window.api.getDisplays(); els.displayList.innerHTML = '';
  list.forEach((d) => { const o = document.createElement('option'); o.value = d.id; o.textContent = `${d.w}×${d.h}${d.isPrimary ? ' — laptop' : (/elgato|prom/i.test(d.label) ? ' — prompter' : ' — external')}`; if (!d.isPrimary) o.selected = true; els.displayList.appendChild(o); });
}
if (window.api.platform !== 'win32') els.extend.style.display = 'none';

async function refreshRemote() {
  if (!window.api.getRemoteInfo) { els.remoteBox.textContent = 'Phone remote available in the desktop app.'; return; }
  const info = await window.api.getRemoteInfo();
  if (info && info.url) els.remoteBox.innerHTML = `On your phone (same Wi-Fi), open:<br><b>${info.url}</b>`;
  else els.remoteBox.textContent = 'Open the prompter to enable the phone remote.';
}

window.api.onPresenterStatus((s) => {
  state.presenterVisible = s.visible;
  els.show.textContent = s.visible ? 'Hide Prompter' : 'Show Prompter';
  els.show.classList.toggle('accent', !s.visible);
  if (s.visible) { els.stDot.className = 'dot ok'; els.stText.textContent = s.web ? 'Prompter window open' : `Prompter live on ${s.label || 'screen'} (${s.w}×${s.h})`; }
  else if (s.web) { els.stDot.className = 'dot warn'; els.stText.textContent = 'Click “Show Prompter”, then drag it onto your prompter screen'; }
  else if (s.hasExternal) { els.stDot.className = 'dot warn'; els.stText.textContent = `${s.label} ready — click Show Prompter`; }
  else if (s.screenCount <= 1) { els.stDot.className = 'dot warn'; els.stText.textContent = 'Prompter is mirroring your laptop — click “Make Separate Screen”'; }
  else { els.stDot.className = 'dot'; els.stText.textContent = 'No prompter screen detected'; }
  refreshRemote();
});
if (window.api.onDisplaysChanged) window.api.onDisplaysChanged(loadDisplays);

// --- messages from presenter / phone remote --------------------------------
window.api.onFromPresenter((msg) => {
  if (msg.type === 'ready') {
    send({ type: 'script', items: state.items });
    send({ type: 'font', value: state.font }); send({ type: 'speed', value: state.wpm });
    send({ type: 'lineHeight', value: state.lineHeight }); send({ type: 'width', value: state.width });
    send({ type: 'readPos', value: state.readPos }); send({ type: 'mirror', value: state.mirror });
    send({ type: 'seekSeg', index: state.currentSeg }); send({ type: 'previewActive', value: state.mode === 'run' });
  } else if (msg.type === 'seg') {
    if (msg.index >= 0 && msg.index !== state.currentSeg) { state.currentSeg = msg.index; highlightRow(msg.index); }
  } else if (msg.type === 'dims') { applyPreviewDims(msg.w, msg.h); }
  else if (msg.type === 'offset') { setPreviewOffset(msg.offset); }
  else if (msg.type === 'pos') { els.pct.textContent = Math.round(msg.ratio * 100) + '%'; if (typeof msg.offset === 'number') setPreviewOffset(msg.offset); updateTiming(msg.ratio); if (msg.atEnd && state.playing) setPlaying(false); }
  else if (msg.type === 'marker' && msg.markerType === 'pause') { setPlaying(false); els.pauseFlag.classList.add('on'); }
});
// phone remote commands (relayed by main)
if (window.api.onRemoteCommand) window.api.onRemoteCommand((cmd) => {
  if (cmd.type === 'play') setPlaying(true);
  else if (cmd.type === 'pause') setPlaying(false);
  else if (cmd.type === 'toggle') setPlaying(!state.playing);
  else if (cmd.type === 'next') jumpTo(state.currentSeg + 1);
  else if (cmd.type === 'prev') jumpTo(state.currentSeg - 1);
  else if (cmd.type === 'reset') els.reset.click();
  else if (cmd.type === 'speed') { els.wpm.value = Math.max(40, Math.min(500, state.wpm + cmd.delta)); els.wpm.dispatchEvent(new Event('input')); }
});

// --- keyboard ---------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const typing = document.activeElement === els.script;
  if (typing && e.key !== 'Escape') return;
  switch (e.key) {
    case ' ': e.preventDefault(); setPlaying(!state.playing); break;
    case 'PageDown': e.preventDefault(); jumpTo(state.currentSeg + 1); break;
    case 'PageUp': e.preventDefault(); jumpTo(state.currentSeg - 1); break;
    case 'ArrowUp': e.preventDefault(); els.wpm.value = Math.min(500, state.wpm + 5); els.wpm.dispatchEvent(new Event('input')); break;
    case 'ArrowDown': e.preventDefault(); els.wpm.value = Math.max(40, state.wpm - 5); els.wpm.dispatchEvent(new Event('input')); break;
    case 'Home': e.preventDefault(); els.reset.click(); break;
    case 'Escape': els.script.blur(); break;
  }
});

// --- startup ----------------------------------------------------------------
(async function init() {
  const s = (await window.api.loadState()) || {};
  state.text = s.text || ''; state.unit = s.unit === 'line' ? 'line' : 'paragraph';
  state.wpm = s.wpm || 130; state.font = s.font || 72;
  state.lineHeight = s.lineHeight || 1.45; state.width = s.width || 94; state.readPos = s.readPos || 45;
  state.mirror = s.mirror === true;
  els.script.value = state.text;
  els.wpm.value = state.wpm; els.wpmVal.textContent = state.wpm;
  els.font.value = state.font; els.fontVal.textContent = state.font;
  els.lh.value = Math.round(state.lineHeight * 100); els.lhVal.textContent = state.lineHeight.toFixed(2);
  els.w.value = state.width; els.wVal.textContent = state.width;
  els.rp.value = state.readPos; els.rpVal.textContent = state.readPos;
  els.mirror.checked = state.mirror;
  els.unitSwitch.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.unit === state.unit));
  rebuild();
  setMode(state.text.trim() ? 'run' : 'write');
  await loadDisplays(); refreshRemote();
})();
