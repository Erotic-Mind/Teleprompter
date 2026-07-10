// Shared by both windows so the paragraph/line indexes always match.
(function (global) {
  function splitSegments(text, unit) {
    if (!text || !text.trim()) return [];
    let parts;
    if (unit === 'line') {
      parts = text.split(/\r?\n/);
    } else {
      // paragraph = block of text separated by one or more blank lines
      parts = text.split(/\r?\n\s*\r?\n/);
    }
    return parts
      .map((s) => s.replace(/\s+$/,'').replace(/^\s+/,''))
      .filter((s) => s.length > 0)
      .map((t, i) => ({ index: i, text: t }));
  }
  global.Segments = { splitSegments };
})(typeof window !== 'undefined' ? window : globalThis);
