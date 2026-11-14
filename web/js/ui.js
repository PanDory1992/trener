// Small UI toolkit: elements, the live keyboard, charts.
import { BLACK, noteName, onsetsBeats, plural } from './music.js';
import { data, levelWord, mode as modeRec, successRate } from './store.js';

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) node.style.setProperty(sk, sv); else node.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** replaceChildren / append that skip null and false. */
export function fill(node, ...kids) { node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false)); return node; }
export function add(node, ...kids) { node.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false)); return node; }

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return node;
}

// --- toast -----------------------------------------------------------------------------------
export function toast(text, kind = 'info') {
  const box = document.getElementById('toasts');
  const t = el('div', { class: `toast toast-${kind}`, role: 'status' }, text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3800);
}

// --- the keyboard -------------------------------------------------------------------------------
const LOW = 21, HIGH = 108;
export class Keyboard {
  constructor(host) {
    this.host = host;
    this.keys = new Map();
    this.color = 'var(--c-plan)';
    this.lo = LOW; this.hi = HIGH;
    this.build();
  }

  /** Show only lo..hi (bigger keys). Call with no args for the full 88. */
  setRange(lo = LOW, hi = HIGH) {
    if (lo === this.lo && hi === this.hi) return;
    this.lo = lo; this.hi = hi;
    this.host.classList.toggle('zoom', lo !== LOW || hi !== HIGH);
    this.build();
  }

  build() {
    this.host.innerHTML = '';
    this.keys.clear();
    const whites = [];
    for (let m = this.lo; m <= this.hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
    const wW = 100 / whites.length;
    let wi = 0;
    for (let m = this.lo; m <= this.hi; m++) {
      const isBlack = BLACK.has(m % 12);
      const key = el('div', { class: isBlack ? 'key black' : 'key white', 'data-note': m });
      if (isBlack) {
        key.style.left = `${(wi - 0.32) * wW}%`;
        key.style.width = `${wW * 0.64}%`;
      } else {
        key.style.left = `${wi * wW}%`;
        key.style.width = `${wW}%`;
        if (m % 12 === 0) key.append(el('span', { class: 'key-label' }, noteName(m)));
        wi++;
      }
      key.append(el('span', { class: 'key-mark' }, el('b'), el('i')));
      this.keys.set(m, key);
      this.host.append(key);
    }
    if (this.lastMarks && this.lastMarks.length) this.mark(this.lastMarks);   // after a range change
  }

  setColor(c) { this.color = c; this.host.style.setProperty('--kb-color', c); }

  press(note, vel, who = 'you') {
    const k = this.keys.get(note);
    if (!k) return;
    k.classList.add(who === 'you' ? 'down' : 'trainer');
    if (who === 'you') k.style.setProperty('--vel', (0.35 + 0.65 * Math.min(127, vel) / 127).toFixed(2));
  }

  release(note, who = 'you') {
    const k = this.keys.get(note);
    if (k) k.classList.remove(who === 'you' ? 'down' : 'trainer');
  }

  /**
   * Marks on keys, replacing previous ones: [{note, text, sub, tone, dim, ring}]
   * text = big label (note name), sub = small second line (degree / finger), tone = css colour,
   * dim = quiet mark (e.g. scale tones), ring = outline only (e.g. "next"), fn = function colour (chord root).
   */
  mark(list = []) {
    this.lastMarks = list;
    for (const k of this.keys.values()) {
      if (!k.classList.contains('marked')) continue;
      k.classList.remove('marked', 'm-dim', 'm-ring', 'm-sub', 'm-fn');
      k.style.removeProperty('--fn');
      const mk = k.querySelector('.key-mark');
      mk.firstChild.textContent = ''; mk.lastChild.textContent = '';
      mk.style.removeProperty('--mark');
    }
    for (const { note, text = '', sub = '', tone, dim, ring, fn } of list) {
      const k = this.keys.get(note);
      if (!k) continue;
      k.classList.add('marked');
      if (dim) k.classList.add('m-dim');
      if (ring) k.classList.add('m-ring');
      if (sub) k.classList.add('m-sub');
      const mk = k.querySelector('.key-mark');
      mk.firstChild.textContent = text;
      mk.lastChild.textContent = sub;
      if (tone) mk.style.setProperty('--mark', tone);
      // fn: a css colour of the chord's function, shown as a strip on top of the root key
      if (fn) { k.classList.add('m-fn'); k.style.setProperty('--fn', fn); }
    }
  }

  /** Short flash on a key: 'good' or 'bad'. */
  flash(note, kind = 'good') {
    const k = this.keys.get(note);
    if (!k) return;
    const cls = `flash-${kind}`;
    k.classList.remove(cls);
    void k.offsetWidth;
    k.classList.add(cls);
    clearTimeout(k._flash);
    k._flash = setTimeout(() => k.classList.remove(cls), 420);
  }

  clearAll() {
    for (const k of this.keys.values()) k.classList.remove('down', 'trainer');
  }
}

// --- level header for a mode ----------------------------------------------------------------------
export function levelHeader(id, title, sub) {
  const m = modeRec(id);
  const rate = successRate(id);
  const pct = ((m.level - 1) / 11) * 100;
  return el('header', { class: 'mode-head' },
    el('div', { class: 'mode-title' },
      el('h1', {}, title),
      sub ? el('p', { class: 'mode-sub' }, sub) : null),
    el('div', { class: 'level', title: 'Poziom dopasowuje się sam: po udanej próbie rośnie trochę, po nieudanej spada bardziej. Ustala się tam, gdzie trafiasz mniej więcej 4 na 5.' },
      el('div', { class: 'level-top' },
        el('span', { class: 'level-num' }, m.level.toFixed(1)),
        el('span', { class: 'level-word' }, levelWord(m.level))),
      el('div', { class: 'level-bar' }, el('span', { style: { width: `${pct}%` } })),
      el('div', { class: 'level-rate' }, rate == null ? 'jeszcze bez prób' : `${Math.round(rate * 100)}% udanych (${Math.min(20, m.hist.length)} ${plural(Math.min(20, m.hist.length), 'ostatnia próba', 'ostatnie próby', 'ostatnich prób')})`)));
}

export function refreshLevel(container, id) {
  const old = container.querySelector('.mode-head .level');
  if (!old) return;
  const fresh = levelHeader(id, '', '').querySelector('.level');
  old.replaceWith(fresh);
}

/** Big status line: "Słuchaj", "Twoja kolej"... */
export function status(text, kind = '') {
  return el('div', { class: `status ${kind}` }, text);
}

export function verdictChips(items) {
  return el('div', { class: 'chips' }, items.filter(Boolean).map(([label, ok, detail]) =>
    el('div', { class: `chip ${ok === null ? 'neutral' : ok ? 'ok' : 'bad'}` },
      el('span', { class: 'chip-dot' }), el('b', {}, label), detail ? el('span', {}, detail) : null)));
}

// --- charts ------------------------------------------------------------------------------------------
/** Piano roll: target (outlined) vs yours (filled). attempt notes need .p and .ts. */
export function rollChart(motif, attempt, grade, { width = 760, height = 220 } = {}) {
  const want = motif.notes;
  const on = onsetsBeats(want);
  const totalBeats = on[on.length - 1] + want[want.length - 1].dur;
  const pitches = [...want.map((n) => n.p), ...attempt.map((n) => n.p)];
  const lo = Math.min(...pitches) - 1, hi = Math.max(...pitches) + 1;
  const pad = { l: 48, r: 16, t: 14, b: 50 };
  const X = (b) => pad.l + (b / totalBeats) * (width - pad.l - pad.r);
  const rowH = (height - pad.t - pad.b) / Math.max(1, hi - lo + 1);
  const Y = (p) => pad.t + (hi - p) * rowH;
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart roll', role: 'img', 'aria-label': 'Wzór i twoje nuty' });
  for (let p = lo; p <= hi; p++) {
    s.append(svg('rect', { x: pad.l, y: Y(p), width: width - pad.l - pad.r, height: rowH, fill: BLACK.has(p % 12) ? 'var(--roll-black)' : 'transparent' }));
    if (p % 12 === 0 || p === lo + 1) s.append(svg('text', { x: pad.l - 8, y: Y(p) + rowH * 0.72, 'text-anchor': 'end', class: 'axis' }, noteName(p, motif.flat)));
  }
  want.forEach((n, i) => {
    s.append(svg('rect', { x: X(on[i]) + 1, y: Y(n.p) + 1, width: Math.max(4, X(on[i] + n.dur) - X(on[i]) - 3), height: Math.max(3, rowH - 2), rx: 4, class: 'roll-want' }));
  });
  if (attempt.length && grade && grade.devBeats) {
    const t0 = attempt[0].ts;
    const k = grade.tempoRatio ? (60 / motif.tempo) / grade.tempoRatio : 60 / motif.tempo;
    attempt.slice(0, want.length + 3).forEach((a, i) => {
      const b = (a.ts - t0) / k;
      const ok = grade.perNote[i] ? grade.perNote[i].ok : false;
      s.append(svg('rect', { x: X(b) + 3, y: Y(a.p) + rowH * 0.22, width: Math.max(4, (X(want[Math.min(i, want.length - 1)].dur) - X(0)) * 0.6), height: Math.max(3, rowH * 0.56), rx: 3, class: ok ? 'roll-you ok' : 'roll-you bad' }));
    });
  }
  // velocity lane
  const vy = height - 30, vh = 24;
  want.forEach((n, i) => {
    const x = X(on[i]) + 2;
    s.append(svg('rect', { x, y: vy + vh * (1 - n.v / 127), width: 5, height: vh * n.v / 127, class: 'vel-want' }));
    const a = attempt[i];
    if (a) s.append(svg('rect', { x: x + 7, y: vy + vh * (1 - a.v / 127), width: 5, height: vh * a.v / 127, class: 'vel-you' }));
  });
  s.append(svg('text', { x: pad.l - 8, y: vy + vh - 4, 'text-anchor': 'end', class: 'axis' }, 'siła'));
  return s;
}

/** Two velocity curves: target (dashed) and yours. */
export function curveChart(target, user, { width = 760, height = 240, showTarget = true } = {}) {
  const pad = { l: 46, r: 18, t: 18, b: 30 };
  const n = target.length;
  const X = (i) => pad.l + (n > 1 ? i / (n - 1) : 0.5) * (width - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / 127) * (height - pad.t - pad.b);
  const s = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart curve', role: 'img', 'aria-label': 'Wzór głośności i twoja głośność' });
  for (const [v, label] of [[32, 'pp'], [62, 'mp'], [94, 'f'], [120, 'fff']]) {
    s.append(svg('line', { x1: pad.l, x2: width - pad.r, y1: Y(v), y2: Y(v), class: 'grid' }));
    s.append(svg('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, label));
  }
  const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  if (showTarget) s.append(svg('path', { d: path(target), class: 'curve-want' }));
  if (user && user.length) {
    s.append(svg('path', { d: path(user), class: 'curve-you' }));
    user.forEach((v, i) => s.append(svg('circle', { cx: X(i), cy: Y(v), r: 5, class: 'dot-you' })));
  }
  if (showTarget) target.forEach((v, i) => s.append(svg('circle', { cx: X(i), cy: Y(v), r: 3.5, class: 'dot-want' })));
  return s;
}

export function legend(items) {
  return el('div', { class: 'legend' }, items.map(([cls, text]) => el('span', { class: `lg ${cls}` }, el('i'), text)));
}

export function fmtMin(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function settings() { return data.settings; }
