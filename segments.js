// Shared script parser. Turns the script text into an ordered list of "items":
//   { kind:'seg', index, text }      — a readable line/paragraph
//   { kind:'marker', type, label }   — a [PAUSE] or [TAKE ...] cue
// Both windows parse identically so indexes always line up.
(function (global) {
  function markerFor(line) {
    const b = line.trim();
    if (/^\[\s*pause\s*\]$/i.test(b)) return { type: 'pause', label: 'PAUSE' };
    const t = b.match(/^\[\s*take\b([^\]]*)\]$/i);
    if (t) return { type: 'take', label: ('TAKE ' + (t[1] || '').trim()).replace(/\s+/g, ' ').trim().toUpperCase() };
    return null;
  }

  function parseScript(text, unit) {
    if (!text || !text.trim()) return { items: [], segments: [], takes: [] };
    const lines = text.split(/\r?\n/);
    const items = [];
    let segIndex = 0;
    let buf = [];
    const flush = () => {
      const joined = buf.join('\n').replace(/^\s+|\s+$/g, '');
      if (joined) items.push({ kind: 'seg', index: segIndex++, text: joined });
      buf = [];
    };
    lines.forEach((line) => {
      const m = markerFor(line);
      if (m) { flush(); items.push({ kind: 'marker', type: m.type, label: m.label }); return; }
      if (unit === 'line') {
        const b = line.trim();
        if (b) items.push({ kind: 'seg', index: segIndex++, text: b });
      } else if (line.trim() === '') {
        flush();
      } else {
        buf.push(line);
      }
    });
    flush();
    const segments = items.filter((i) => i.kind === 'seg');
    const takes = items.filter((i) => i.kind === 'marker' && i.type === 'take');
    return { items, segments, takes };
  }

  // Backwards-compatible helper (just the readable segments).
  function splitSegments(text, unit) {
    return parseScript(text, unit).segments;
  }

  global.Segments = { parseScript, splitSegments };
})(typeof window !== 'undefined' ? window : globalThis);
