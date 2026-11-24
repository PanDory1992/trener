// Siatka (Tonnetz) on the screen: triangles = triads, neighbours share an edge (two notes). The progression is drawn
// as a path through the triangles; the chord you hold lights up; a click on a triangle plays it.
import { svg } from './ui.js';
import { gridWindow, nodePc, parseTriad, plr } from './lenses.js';
import { simpleSpell } from './chords.js';

const W = 64, H = 56;
const xy = ([i, j]) => [i * W + j * (W / 2), -j * H];

/**
 * opts: { key, centerPc, path: [triadId], held: triadId|null, now: triadId|null, target, start, onPick(id) }
 * Returns an <svg>.
 */
export function tonnetzSvg({ key, centerPc, path = [], held = null, now = null, target = null, start = null, onPick = null, cols = 9, rows = 5 }) {
  const tris = gridWindow(centerPc, { cols, rows });
  const pts = tris.flatMap((t) => t.pts.map(xy));
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const pad = 8;
  const root = svg('svg', { class: 'tonnetz', viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`, role: 'img', 'aria-label': 'Siatka akordów' });
  const name = (id) => { const { root: r, kind } = parseTriad(id); return simpleSpell(key, r).name + (kind === 'min' ? 'm' : ''); };
  const onPath = new Set(path);
  const nb = held ? new Set(Object.values(plr(held))) : new Set();
  // the same triad appears several times in the window: draw the copy nearest the middle as the "main" one for labels
  const centre = (t) => { const c = t.pts.map(xy).reduce((a, p) => [a[0] + p[0] / 3, a[1] + p[1] / 3], [0, 0]); return c; };
  const pathCentres = [];
  for (const t of tris) {
    const c = centre(t);
    const cls = ['tri', t.kind,
      onPath.has(t.id) ? 'path' : '', t.id === held ? 'held' : '', t.id === now ? 'now' : '', nb.has(t.id) ? 'nb' : '',
      t.id === target ? 'target' : '', t.id === start ? 'start' : ''].filter(Boolean).join(' ');
    const g = svg('g', { class: cls, 'data-id': t.id, tabindex: onPick ? '0' : null, role: onPick ? 'button' : null, 'aria-label': name(t.id) });
    g.append(svg('polygon', { points: t.pts.map(xy).map((p) => p.join(',')).join(' ') }));
    g.append(svg('text', { x: c[0].toFixed(1), y: (c[1] + 5).toFixed(1), class: 'tri-name' }, name(t.id)));
    if (onPick) {
      g.addEventListener('click', () => onPick(t.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(t.id); } });
    }
    root.append(g);
    if (onPath.has(t.id)) pathCentres.push({ id: t.id, c });
  }
  // the path: from each chord to the nearest copy of the next one
  if (path.length > 1) {
    const pick = (id, from) => {
      const all = pathCentres.filter((x) => x.id === id).map((x) => x.c);
      if (!all.length) return null;
      if (!from) return all.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))[0];
      return all.sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]))[0];
    };
    let prev = null;
    const line = [];
    for (const id of path) { const p = pick(id, prev); if (p) { line.push(p); prev = p; } }
    if (line.length > 1) root.append(svg('polyline', { class: 'tri-path', points: line.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ') }));
    line.forEach((p, k) => root.append(svg('circle', { class: 'tri-dot', cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: k === 0 ? 6 : 4 })));
  }
  // note names on the nodes (small)
  const seen = new Set();
  for (const t of tris) for (const pt of t.pts) {
    const k = pt.join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    const [x, y] = xy(pt);
    root.append(svg('text', { x: x.toFixed(1), y: (y + 3).toFixed(1), class: 'tri-node' }, simpleSpell(key, nodePc(...pt)).name));
  }
  return root;
}
