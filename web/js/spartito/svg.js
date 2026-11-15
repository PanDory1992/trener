// Spartito's display list as SVG markup (a string: pure, testable in node).
// The engine draws everything as ops: { k: "F", d: path, c } fill (non-zero), { k: "S", d, c, w } stroke,
// { k: "T", x, y, s, size, font, bold, italic, align, c } text with its baseline at y.

const SERIF = "'Times New Roman', 'Liberation Serif', Tinos, serif";
const ANCHOR = { left: 'start', center: 'middle', right: 'end' };

const n = (v) => Math.round(v * 100) / 100;
function rgba(c) {
  if (!c) return '#141417';
  const h = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return c.length > 3 && c[3] < 1 ? `rgba(${h(c[0])},${h(c[1])},${h(c[2])},${n(c[3])})` : `rgb(${h(c[0])},${h(c[1])},${h(c[2])})`;
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function pathData(d, dx = 0, dy = 0) {
  let out = '';
  for (let i = 0; i < d.length;) {
    const c = d[i];
    if (c === 'M' || c === 'L') { out += `${c}${n(d[i + 1] + dx)} ${n(d[i + 2] + dy)}`; i += 3; }
    else if (c === 'C') { out += `C${n(d[i + 1] + dx)} ${n(d[i + 2] + dy)} ${n(d[i + 3] + dx)} ${n(d[i + 4] + dy)} ${n(d[i + 5] + dx)} ${n(d[i + 6] + dy)}`; i += 7; }
    else if (c === 'Z') { out += 'Z'; i += 1; }
    else i += 1;
  }
  return out;
}

/** Markup for a list of ops (no <svg> around it). `drop(op)`: leave an op out. */
export function opsMarkup(ops, { dx = 0, dy = 0, drop = null } = {}) {
  let out = '';
  for (const op of ops) {
    if (drop && drop(op)) continue;
    if (op.k === 'F') out += `<path d="${pathData(op.d, dx, dy)}" fill="${rgba(op.c)}"/>`;
    else if (op.k === 'S') out += `<path d="${pathData(op.d, dx, dy)}" fill="none" stroke="${rgba(op.c)}" stroke-width="${n(op.w)}"/>`;
    else if (op.k === 'T') {
      out += `<text x="${n(op.x + dx)}" y="${n(op.y + dy)}" font-family="${SERIF}" font-size="${n(op.size)}"`
        + `${op.bold ? ' font-weight="bold"' : ''}${op.italic ? ' font-style="italic"' : ''} text-anchor="${ANCHOR[op.align] || 'start'}" fill="${rgba(op.c)}">${esc(op.s)}</text>`;
    }
  }
  return out;
}

/**
 * A whole layout as one <svg>: title, every system, then `extra` markup (Trener's own marks on top).
 * The viewBox is the layout's size, so the picture scales to its box.
 */
export function layoutSvg(L, { drop = null, extra = '', cls = 'score', label = 'Nuty', paper = '#fbf9f4', height = null, zoom = null } = {}) {
  const h = n(height || L.height);
  const size = zoom ? ` width="${n(L.width * zoom)}" height="${n(h * zoom)}"` : '';
  let body = `<rect x="0" y="0" width="${n(L.width)}" height="${h}" fill="${paper}" rx="8"/>`;
  body += opsMarkup(L.topOps, { drop });
  for (const ops of L.sysOps) body += opsMarkup(ops, { drop });
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 ${n(L.width)} ${h}"${size} role="img" aria-label="${esc(label)}">${body}${extra}</svg>`;
}

/** Small text under or over a note head (names, fingers): x, y in layout units. */
export function label(x, y, text, { size = 11, color = '#5b5670', weight = 'bold', anchor = 'middle', cls = '' } = {}) {
  return `<text x="${n(x)}" y="${n(y)}" font-family="'Atkinson Hyperlegible', 'Segoe UI', sans-serif" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}"${cls ? ` class="${cls}"` : ''}>${esc(text)}</text>`;
}
