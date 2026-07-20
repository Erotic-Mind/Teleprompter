// Strict automated test suite. Run: npm test  (electron test-suite.js)
// Covers the parser and the live presenter engine. Exits non-zero on any failure.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('./segments.js'); // attaches global.Segments
const S = global.Segments;

let pass = 0, fail = 0;
const log = [];
function ok(name, cond) { if (cond) { pass++; log.push('  PASS  ' + name); } else { fail++; log.push('  FAIL  ' + name); } }
function eq(name, a, b) { ok(name + '  [' + JSON.stringify(a) + ' == ' + JSON.stringify(b) + ']', a === b); }
ipcMain.on('to-control', () => {});

function parserTests() {
  log.push('PARSER (segments.js):');
  eq('empty -> 0 items', S.parseScript('', 'paragraph').items.length, 0);
  eq('3 paragraphs -> 3 segs', S.parseScript('a\n\nb\n\nc', 'paragraph').segments.length, 3);
  let r = S.parseScript('a\n\n[PAUSE]\n\nb', 'paragraph');
  eq('pause between paras -> 2 segs', r.segments.length, 2);
  eq('pause marker recognised', r.items.filter((i) => i.type === 'pause').length, 1);
  r = S.parseScript('a\n\n[TAKE 1]\nb glued to marker\n\nc', 'paragraph');
  eq('glued [TAKE] -> still 3 segs', r.segments.length, 3);
  eq('glued [TAKE] -> 1 take', r.takes.length, 1);
  eq('take label parsed', r.takes[0].label, 'TAKE 1');
  eq('[TAKE 2 - intro] label', S.parseScript('[TAKE 2 - intro]\nx', 'paragraph').takes[0].label, 'TAKE 2 - INTRO');
  eq('line mode -> per line', S.parseScript('a\nb\nc', 'line').segments.length, 3);
  eq('multi-line paragraph kept together', S.parseScript('one\ntwo\n\nthree', 'paragraph').segments[0].text, 'one\ntwo');
}

async function presenterTests(win) {
  const send = (m) => win.webContents.send('from-control', m);
  const js = (c) => win.webContents.executeJavaScript(c);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const VP = "document.scrollingElement";
  const scrollTop = () => js(VP + '.scrollTop');

  log.push('PRESENTER (engine):');
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ kind: 'seg', index: i, text: 'Line number ' + (i + 1) + ' with several words to read across.' });
  items.splice(2, 0, { kind: 'marker', type: 'pause', label: 'PAUSE' });
  send({ type: 'script', items });
  send({ type: 'font', value: 40 });
  send({ type: 'speed', value: 200 });
  await wait(500);
  const setup = await js("({segs:document.querySelectorAll('.seg').length, words:document.querySelectorAll('.w').length, marks:document.querySelectorAll('.marker').length, max:" + VP + ".scrollHeight-" + VP + ".clientHeight})");
  eq('renders 12 segments', setup.segs, 12);
  ok('wraps word spans (>50)', setup.words > 50);
  eq('renders 1 marker', setup.marks, 1);
  ok('scroll range computed (>0)', setup.max > 0);

  // native scroll advances
  send({ type: 'reset' }); await wait(120); send({ type: 'play' }); await wait(700);
  const a = await scrollTop(); await wait(500); const b = await scrollTop();
  send({ type: 'pause' });
  ok('native scroll advances', b > a && a > 0);

  // seek positions a segment at the reading line
  send({ type: 'seekSeg', index: 8 }); await wait(250);
  const seekOk = await js("(()=>{const el=document.querySelectorAll('.seg')[8];const line=window.innerHeight*0.45;const want=Math.max(0,el.offsetTop-line);const got=" + VP + ".scrollTop;return Math.abs(got-want)<6;})()");
  ok('seek aligns segment to reading line', seekOk === true);

  // pause marker stops the scroll before the end
  send({ type: 'speed', value: 500 }); send({ type: 'reset' }); await wait(120); send({ type: 'play' }); await wait(4200);
  const p = await js("(()=>{const m=document.querySelector('.marker');const line=window.innerHeight*0.45;const target=Math.max(0,m.offsetTop-line);const got=" + VP + ".scrollTop;const end=" + VP + ".scrollHeight-" + VP + ".clientHeight;return {near:Math.abs(got-target)<8, atEnd:got>=end-2};})()");
  ok('pause marker halts the scroll', p.near === true);
  ok('pause halts before the end', p.atEnd === false);

  // voice word-following dims spoken words and moves position
  send({ type: 'reset' }); await wait(120);
  send({ type: 'voiceMode', value: true }); send({ type: 'voiceWord', index: 15 }); await wait(500);
  const v = await js("({spoken:document.querySelectorAll('.w.spoken').length, st:" + VP + ".scrollTop})");
  eq('voice dims already-spoken words', v.spoken, 15);
  ok('voice advances the scroll', v.st > 0);
  send({ type: 'voiceMode', value: false });

  // reading-position control
  send({ type: 'readPos', value: 30 }); await wait(200);
  eq('reading position updates layout', await js("document.querySelector('.pad-top').style.height"), '30vh');

  // mirror flip (now a CSS class, so no transform sits on the text when off)
  send({ type: 'mirror', value: true }); await wait(120);
  ok('mirror flips content (class only)', (await js("document.getElementById('content').classList.contains('mirror')")) === true);
}

app.whenReady().then(async () => {
  parserTests();
  const win = new BrowserWindow({ x: 60, y: 60, width: 820, height: 520, show: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false } });
  await win.loadFile('presenter.html');
  await new Promise((r) => setTimeout(r, 500));
  try { await presenterTests(win); } catch (e) { fail++; log.push('  FAIL  presenter tests threw: ' + e.message); }
  log.push('');
  log.push('==== RESULTS: ' + pass + ' passed, ' + fail + ' failed ====');
  console.log('\n' + log.join('\n') + '\n');
  app.exit(fail > 0 ? 1 : 0);
});
