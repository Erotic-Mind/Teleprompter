// Presenter: big scrolling text on the prompter screen.
// Smooth sub-pixel scroll via CSS transform, mirrored for the beam-splitter glass,
// with paragraph/line segments so the control window can jump to any point.

const scroller = document.getElementById('scroller');
const script = document.getElementById('script');
const hint = document.getElementById('hint');

let segEls = [];
let offset = 0; // pixels scrolled
let playing = false;
let mirror = false; // control window pushes the real value; off by default
let wpm = 130;
let pxPerSec = 0;
let maxOffset = 0;
let last = null;
let posThrottle = 0;
let currentSeg = -1;
let previewActive = false;

const readingLinePx = () => window.innerHeight * 0.42;

function countWords(text) {
  const t = (text || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

function buildSegments(segments) {
  script.innerHTML = '';
  segEls = [];
  segments.forEach((seg) => {
    const div = document.createElement('div');
    div.className = 'seg';
    div.dataset.i = seg.index;
    div.textContent = seg.text;
    script.appendChild(div);
    segEls.push(div);
  });
  hint.style.display = segments.length ? 'none' : 'block';
}

function recompute() {
  const scriptHeight = script.offsetHeight || 1;
  const n = countWords(script.textContent) || 1;
  pxPerSec = (scriptHeight / n) * (wpm / 60);
  maxOffset = Math.max(0, scroller.offsetHeight - window.innerHeight);
  clamp();
  applyTransform();
}

function clamp() {
  if (offset < 0) offset = 0;
  if (offset > maxOffset) offset = maxOffset;
}

function applyTransform() {
  // Render on whole pixels: cleaner frame-to-frame diffs, which a USB (DisplayLink)
  // display compresses far more smoothly than sub-pixel anti-aliased motion.
  const y = Math.round(offset);
  scroller.style.transform = `translateY(${-y}px) scaleX(${mirror ? -1 : 1})`;
}

// Which segment is currently sitting on the reading line?
function computeCurrent() {
  const line = offset + readingLinePx();
  let idx = 0;
  for (let i = 0; i < segEls.length; i++) {
    if (segEls[i].offsetTop <= line) idx = i;
    else break;
  }
  return segEls.length ? idx : -1;
}

function highlightCurrent(idx) {
  if (idx === currentSeg) return;
  if (segEls[currentSeg]) segEls[currentSeg].classList.remove('current');
  if (segEls[idx]) segEls[idx].classList.add('current');
  currentSeg = idx;
  window.api.toControl({ type: 'seg', index: idx });
}

function seekToSegment(index) {
  const el = segEls[index];
  if (!el) return;
  requestAnimationFrame(() => {
    offset = el.offsetTop - readingLinePx();
    clamp();
    applyTransform();
    highlightCurrent(computeCurrent());
    reportPos();
  });
}

function reportPos() {
  const ratio = maxOffset > 0 ? offset / maxOffset : 0;
  window.api.toControl({ type: 'pos', ratio, playing, atEnd: offset >= maxOffset });
}

// Tell the control window our viewport size so the preview clone can match layout.
function reportDims() {
  window.api.toControl({ type: 'dims', w: window.innerWidth, h: window.innerHeight });
}

function frame(t) {
  if (last == null) last = t;
  let dt = (t - last) / 1000;
  last = t;
  // Clamp the time step: if the system hiccups and a frame arrives late, advance
  // only a little instead of lurching forward. A stall becomes a gentle slow-down,
  // not a jarring jump — the single biggest thing that reads as "choppy".
  if (dt > 0.05) dt = 0.05;

  if (playing && pxPerSec > 0) {
    offset += pxPerSec * dt;
    if (offset >= maxOffset) {
      offset = maxOffset;
      playing = false;
    }
    applyTransform();
  }

  if (++posThrottle % 4 === 0) {
    highlightCurrent(computeCurrent());
    reportPos();
  }
  // Feed the live preview clone every frame (60fps) — just a number, cheap, no capture.
  if (previewActive) window.api.toControl({ type: 'offset', offset });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  recompute();
  reportDims();
});

// --- commands from the control window --------------------------------------

window.api.onFromControl((msg) => {
  switch (msg.type) {
    case 'script':
      buildSegments(msg.segments || []);
      requestAnimationFrame(() => {
        recompute();
        currentSeg = -1;
        highlightCurrent(computeCurrent());
      });
      break;
    case 'font':
      script.style.fontSize = msg.value + 'px';
      requestAnimationFrame(recompute);
      break;
    case 'speed':
      wpm = msg.value;
      recompute();
      break;
    case 'mirror':
      mirror = !!msg.value;
      applyTransform();
      break;
    case 'seekSeg':
      seekToSegment(msg.index);
      break;
    case 'play':
      if (offset >= maxOffset) offset = 0;
      playing = true;
      break;
    case 'pause':
      playing = false;
      break;
    case 'reset':
      offset = 0;
      playing = false;
      applyTransform();
      highlightCurrent(computeCurrent());
      reportPos();
      break;
    case 'nudge':
      offset += msg.value;
      clamp();
      applyTransform();
      reportPos();
      break;
    case 'previewActive':
      previewActive = !!msg.value;
      if (previewActive) reportDims();
      break;
  }
});

// Ready for the control window to push the current script + settings.
window.api.toControl({ type: 'ready' });
