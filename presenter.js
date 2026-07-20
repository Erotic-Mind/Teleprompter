// Presenter — cueprompter-exact scroll: paced whole-pixel DOCUMENT scroll
// (window.scrollTo) with NO transform on the scrolling text. A CSS transform
// promotes the text to a GPU layer, which defeats a USB/DisplayLink display's
// cheap "shift the region" scroll and re-introduces the flooding/glitch. So the
// mirror flip is applied as a CSS class only when it's actually ON (off by
// default = zero transform = smooth on the prompter).
// Also supports [PAUSE]/[TAKE] markers and per-word spans for voice-following.

const content = document.getElementById('content');
const script = document.getElementById('script');
const hint = document.getElementById('hint');
const doc = document.documentElement;

let items = [];
let segEls = [];
let wordEls = [];
let pauseEls = [];
let offset = 0; // desired document scrollTop (whole px)
let playing = false;
let mirror = false;
let wpm = 130;
let pxPerSec = 0;
let stepPx = 1;
let stepMs = 20;
let maxOffset = 0;
let timer = null;
let previewActive = false;
let currentSeg = -1;
let lastReport = 0;

let voiceMode = false;
let voiceTarget = null;
let voiceRAF = null;

let readPos = 45;
const padTop = document.querySelector('.pad-top');
const guideEl = document.getElementById('guide');
const readingLineY = () => window.innerHeight * (readPos / 100);
function setReadPos(pct) {
  readPos = Math.max(15, Math.min(75, pct));
  if (padTop) padTop.style.height = readPos + 'vh';
  if (guideEl) guideEl.style.top = readPos + '%';
  recompute();
}
const nowMs = () => (window.performance ? performance.now() : 0);

function countWords(t) { t = (t || '').trim(); return t ? t.split(/\s+/).length : 0; }

function computePacing() {
  if (pxPerSec <= 0) { stepPx = 1; stepMs = 1000; return; }
  let px = 1, ms = 1000 / pxPerSec;
  while (ms < 8 && px < 4) { px++; ms = (px * 1000) / pxPerSec; }
  stepPx = px;
  stepMs = Math.max(4, ms);
}

function recompute() {
  const scriptH = script.offsetHeight || 1;
  const n = countWords(script.textContent) || 1;
  pxPerSec = (scriptH / n) * (wpm / 60);
  computePacing();
  maxOffset = Math.max(0, doc.scrollHeight - window.innerHeight);
  clamp();
  apply();
}
function clamp() { if (offset < 0) offset = 0; if (offset > maxOffset) offset = maxOffset; }
function apply() { window.scrollTo(0, Math.round(offset)); }               // native DOCUMENT scroll
function applyMirror() { content.classList.toggle('mirror', mirror); }      // transform ONLY when mirrored

function build(list) {
  items = list || [];
  script.innerHTML = '';
  segEls = []; wordEls = []; pauseEls = [];
  items.forEach((it) => {
    if (it.kind === 'seg') {
      const div = document.createElement('div');
      div.className = 'seg';
      div.dataset.i = it.index;
      it.text.split(/(\s+)/).forEach((p) => {
        if (p === '') return;
        if (/^\s+$/.test(p)) { div.appendChild(document.createTextNode(p)); return; }
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = p;
        s.dataset.w = wordEls.length;
        div.appendChild(s);
        wordEls.push(s);
      });
      script.appendChild(div);
      segEls.push(div);
    } else if (it.kind === 'marker') {
      const div = document.createElement('div');
      div.className = 'marker';
      div.dataset.marker = it.type;
      div.textContent = '— ' + it.label + ' —';
      script.appendChild(div);
      if (it.type === 'pause') pauseEls.push(div);
    }
  });
  hint.style.display = items.length ? 'none' : 'flex';
  applyMirror();
  requestAnimationFrame(() => { recompute(); currentSeg = -1; highlightCurrent(); });
}

function computeCurrentSeg() {
  const line = offset + readingLineY();
  let idx = -1;
  for (let i = 0; i < segEls.length; i++) { if (segEls[i].offsetTop <= line) idx = i; else break; }
  return idx;
}
function highlightCurrent() {
  const idx = computeCurrentSeg();
  if (idx !== currentSeg) { currentSeg = idx; window.api.toControl({ type: 'seg', index: idx }); }
}

function targetForEl(el) { return Math.max(0, Math.min(maxOffset, el.offsetTop - readingLineY())); }

function seekToSegment(index) {
  const el = segEls[index];
  if (!el) return;
  requestAnimationFrame(() => { offset = targetForEl(el); apply(); highlightCurrent(); reportPos(); });
}

function reportPos() {
  const ratio = maxOffset > 0 ? offset / maxOffset : 0;
  window.api.toControl({ type: 'pos', ratio, offset, playing, atEnd: offset >= maxOffset });
}
function reportDims() { window.api.toControl({ type: 'dims', w: window.innerWidth, h: window.innerHeight }); }

function maybeReport() {
  const t = nowMs();
  if (t - lastReport >= 33) {
    lastReport = t;
    highlightCurrent();
    reportPos();
    if (previewActive) window.api.toControl({ type: 'offset', offset });
  }
}

// --- paced native-scroll clock ---------------------------------------------
function tick() {
  if (!playing) return;
  const prev = offset;
  offset += stepPx;
  for (const m of pauseEls) {
    const t = targetForEl(m);
    if (t > prev && t <= offset) {
      offset = t; apply(); setPlaying(false); reportPos();
      window.api.toControl({ type: 'marker', markerType: 'pause' });
      return;
    }
  }
  if (offset >= maxOffset) { offset = maxOffset; apply(); setPlaying(false); reportPos(); return; }
  apply();
  maybeReport();
  timer = setTimeout(tick, stepMs);
}
function setPlaying(on) {
  playing = !!on && !voiceMode;
  clearTimeout(timer);
  if (playing) {
    if (offset >= maxOffset) offset = 0;
    timer = setTimeout(tick, stepMs);
  }
  reportPos();
}

// --- voice word-following --------------------------------------------------
function voiceFollow() {
  if (!voiceMode || voiceTarget == null) { voiceRAF = null; return; }
  const diff = voiceTarget - offset;
  if (Math.abs(diff) < 1) offset = voiceTarget;
  else offset += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.15);
  offset = Math.round(offset); clamp(); apply(); maybeReport();
  voiceRAF = requestAnimationFrame(voiceFollow);
}
function setVoiceWord(index) {
  const el = wordEls[index];
  if (!el) return;
  voiceTarget = targetForEl(el);
  for (let i = 0; i < wordEls.length; i++) wordEls[i].classList.toggle('spoken', i < index);
  if (!voiceRAF) voiceRAF = requestAnimationFrame(voiceFollow);
}

window.addEventListener('resize', () => { recompute(); reportDims(); });

// --- commands from control -------------------------------------------------
window.api.onFromControl((msg) => {
  switch (msg.type) {
    case 'script':
      build(msg.items || (msg.segments || []).map((s) => ({ kind: 'seg', index: s.index, text: s.text })));
      break;
    case 'font':
      script.style.fontSize = msg.value + 'px';
      requestAnimationFrame(recompute);
      break;
    case 'speed':
      wpm = msg.value; recompute();
      if (playing) { clearTimeout(timer); timer = setTimeout(tick, stepMs); }
      break;
    case 'mirror': mirror = !!msg.value; applyMirror(); break;
    case 'lineHeight': script.style.lineHeight = msg.value; requestAnimationFrame(recompute); break;
    case 'width': script.style.maxWidth = msg.value + '%'; requestAnimationFrame(recompute); break;
    case 'readPos': setReadPos(msg.value); break;
    case 'seekSeg': seekToSegment(msg.index); break;
    case 'play': setPlaying(true); break;
    case 'pause': setPlaying(false); break;
    case 'reset':
      setPlaying(false); offset = 0; apply(); highlightCurrent(); reportPos();
      for (const w of wordEls) w.classList.remove('spoken');
      break;
    case 'nudge': offset += msg.value; clamp(); apply(); highlightCurrent(); reportPos(); break;
    case 'previewActive': previewActive = !!msg.value; if (previewActive) reportDims(); break;
    case 'voiceMode':
      voiceMode = !!msg.value;
      if (voiceMode) setPlaying(false);
      else { voiceTarget = null; for (const w of wordEls) w.classList.remove('spoken'); }
      break;
    case 'voiceWord': if (voiceMode) setVoiceWord(msg.index); break;
  }
});

window.api.toControl({ type: 'ready' });
