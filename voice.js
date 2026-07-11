// Voice word-following (Phase 5). Runs in the control window (has the mic).
// Uses the browser SpeechRecognition engine, matches recognized words to the
// script, and reports the current word index. Like PromptSmart's VoiceTrack, it
// only advances on a match — so pausing or going off-script keeps it in place.
//
// NOTE: in Chrome/Electron the Web Speech API streams audio to Google for
// recognition (needs internet). A fully-offline engine (Vosk/Whisper) is the
// roadmap upgrade to match PromptSmart's on-device privacy.
(function (global) {
  const SR = global.SpeechRecognition || global.webkitSpeechRecognition;
  let rec = null, running = false, scriptWords = [], onWord = null, onStatus = null, ptr = 0;

  const norm = (w) => (w || '').toLowerCase().replace(/[^a-z0-9']/g, '');
  const supported = () => !!SR;

  function start(words, wordCb, statusCb) {
    scriptWords = (words || []).map(norm);
    onWord = wordCb; onStatus = statusCb; ptr = 0;
    if (!SR) { statusCb && statusCb('Voice not supported in this browser.'); return; }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onstart = () => statusCb && statusCb('🎙️ Listening — start reading…');
    rec.onerror = (e) => statusCb && statusCb('Voice: ' + (e.error === 'not-allowed' ? 'mic permission denied' : e.error));
    rec.onend = () => { if (running) { try { rec.start(); } catch (_) {} } }; // auto-restart
    rec.onresult = (ev) => {
      const heard = [];
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        ev.results[i][0].transcript.split(/\s+/).forEach((w) => { const n = norm(w); if (n) heard.push(n); });
      }
      const WIN = 10; // lookahead window for a match (handles small skips)
      heard.forEach((h) => {
        for (let k = 0; k < WIN && ptr + k < scriptWords.length; k++) {
          if (scriptWords[ptr + k] === h) {
            ptr = ptr + k + 1;
            onWord && onWord(Math.min(ptr, scriptWords.length - 1));
            break;
          }
        }
      });
    };
    running = true;
    try { rec.start(); } catch (e) { statusCb && statusCb('Voice start failed: ' + e.message); }
  }

  function stop() {
    running = false;
    if (rec) { try { rec.stop(); } catch (_) {} rec = null; }
    onStatus && onStatus('');
  }

  global.Voice = { supported, start, stop };
})(typeof window !== 'undefined' ? window : globalThis);
