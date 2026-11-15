// Nuty (Spartito in Trener): the pure part. Builds Spartito models, lays them out with the engine and
// decides what the Nuty mode shows and asks. No DOM; the engine object E is passed in, so this file loads
// (and its tests run) without the engine, which is kept off git.

export const SP = 10;                       // staff space in SVG units
export const RED = [0.86, 0.16, 0.22, 1];
export const GREEN = [0.13, 0.55, 0.25, 1];
const ENGRAVE = { split: 60, quant: 12, tuplets: true, overlap: 'tie', extraBar: false };

/** Trener's key (theory.js) → key signature in fifths, -6..6, as Spartito counts it. */
export function fifthsOf(wheelIndex) {
  const i = ((wheelIndex % 12) + 12) % 12;
  return i <= 6 ? i : i - 12;
}

/**
 * Lays out notes with Spartito.
 * notes: [{ p, t, d, v?, st?, sel? }] (beats; st: 0 treble, 1 bass, -1 split at middle C)
 * Returns the layout L (systems, sysOps, topOps, hits, height).
 */
export function layout(E, notes, opts = {}) {
  const { width = 600, sp = SP, title = '', selc = RED, finalBar = true, marginL = null, marginR = null, top = null, bottom = null } = opts;
  const { S } = engrave(E, notes, opts);
  return E.ly_layout(S, { width, sp, marginL: marginL === null ? 3.4 * sp : marginL, marginR: marginR === null ? 1.6 * sp : marginR,
    top: top === null ? 0.4 * sp : top, bottom: bottom === null ? 4 * sp : bottom, title, ink: E.gl_INK, selc, finalBar, barOffset: 0 });
}

/** The Spartito model and its engraving (for the exports: MIDI from M, MusicXML from S). quant: 12 = 1/16, 24 = 1/8. */
export function engrave(E, notes, { key = 0, staves = 'piano', num = 4, den = 4, len = 0, quant = 12, name = '' } = {}) {
  const M = E.md_new();
  M.name = name;
  M.num = num; M.den = den;
  let end = 0;
  for (const n of notes) {
    const x = E.md_note(M, n.p, n.t, n.d, n.v || 90, 0, n.sp || 0, n.st === undefined ? -1 : n.st);
    x.sel = n.sel ? 1 : 0;
    M.notes.push(x);
    end = Math.max(end, n.t + n.d);
  }
  const bar = (num * 4) / den;
  M.lenBeats = Math.max(len, Math.ceil(end / bar - 1e-9) * bar, bar);
  return { M, S: E.nt_engrave(M, { ...ENGRAVE, key, staves, quant }) };
}

/** A chord (or one note) as whole notes in one bar. `wrong`: pitches drawn in red next to it. */
export function chordNotes(pitches, { st = null, wrong = [] } = {}) {
  const out = pitches.map((p, i) => ({ p, t: 0, d: 4, st: st ? st[i] : -1 }));
  for (const p of wrong) if (!pitches.includes(p)) out.push({ p, t: 0, d: 4, st: -1, sel: true });
  return out;
}

/**
 * A sequence of onsets (each a chord) as whole notes, one per bar: pitch without rhythm.
 * One bar each, so a staff with nothing to play gets one whole rest, not a rest on every beat.
 */
export function sequenceNotes(groups) {
  const notes = [];
  groups.forEach((g, i) => { for (const p of g) notes.push({ p, t: i * 4, d: 4, st: -1 }); });
  return { notes, num: 4, den: 4, staves: stavesFor(notes.map((n) => n.p)) };
}

/** One clef when everything fits it (bigger, calmer), the grand staff when both hands are needed. */
export function stavesFor(pitches, st = null) {
  if (st) return st.every((x) => x === 0) ? 'treble' : st.every((x) => x === 1) ? 'bass' : 'piano';
  if (!pitches.length) return 'piano';
  return pitches.every((p) => p >= 60) ? 'treble' : pitches.every((p) => p < 60) ? 'bass' : 'piano';
}

/** Onsets closer than `gap` seconds are one chord. events: [{note, t}] in time order. */
export function groupOnsets(events, gap = 0.06) {
  const out = [];
  let cur = null;
  for (const e of events) {
    if (cur && e.t - cur.t <= gap) { if (!cur.notes.includes(e.note)) cur.notes.push(e.note); }
    else { cur = { t: e.t, notes: [e.note] }; out.push(cur); }
  }
  return out.map((g) => g.notes.sort((a, b) => a - b));
}

/** The time-signature digits: wanted for music, not for a chord or a row of notes without rhythm. */
export function isMeter(op, sp) {
  return op.k === 'T' && /^\d+$/.test(op.s) && Math.abs(op.size - 2.9 * sp) < 0.01 && op.bold;
}

// --- where a note sits: words for the reader --------------------------------------------------------------
const TREBLE_BOTTOM = 4 * 7 + 2;   // E4
const BASS_BOTTOM = 2 * 7 + 4;     // G2
const ORD = ['pierwsza', 'druga', 'trzecia', 'czwarta', 'piąta'];
const ORD_POLE = ['pierwsze', 'drugie', 'trzecie', 'czwarte'];
const ORD_INS = ['pierwszą', 'drugą', 'trzecią', 'czwartą', 'piątą'];

/** "linia trzecia", "pole drugie", "pierwsza linia dodana pod" ... for a diatonic step on a clef. */
export function placeWords(step, clef) {
  const d = step - (clef === 'bass' ? BASS_BOTTOM : TREBLE_BOTTOM);   // 0 = bottom line
  if (d >= 0 && d <= 8) return d % 2 === 0 ? `linia ${ORD[d / 2]}` : `pole ${ORD_POLE[(d - 1) / 2]}`;
  if (d === -1) return 'pod pięciolinią';
  if (d === 9) return 'nad pięciolinią';
  if (d < -1) { const k = Math.floor((-d) / 2); return (-d) % 2 === 0 ? `${ORD[k - 1] || k} linia dodana pod` : `pod ${ORD_INS[k - 1] || k} linią dodaną`; }
  const k = Math.floor((d - 8) / 2);
  return (d - 8) % 2 === 0 ? `${ORD[k - 1] || k} linia dodana nad` : `nad ${ORD_INS[k - 1] || k} linią dodaną`;
}

// --- reading: the ladder ---------------------------------------------------------------------------------
const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
const range = (a, b, f = () => true) => { const o = []; for (let p = a; p <= b; p++) if (f(p)) o.push(p); return o; };
const white = (p) => WHITE.has(((p % 12) + 12) % 12);

/** Steps of reading, from five notes of one hand to chords in both. goalMs: how fast a card should be read. */
export const READ_LEVELS = [
  { n: 1, name: 'Prawa ręka: od C do G', goalMs: 4000, items: () => range(60, 67, white).map((p) => one(p, 0)) },
  { n: 2, name: 'Lewa ręka: od C do G w kluczu basowym', goalMs: 4000, items: () => range(48, 55, white).map((p) => one(p, 1)) },
  { n: 3, name: 'Obie pozycje C na zmianę', goalMs: 3500, items: () => [...range(60, 67, white).map((p) => one(p, 0)), ...range(48, 55, white).map((p) => one(p, 1))] },
  { n: 4, name: 'Oktawa w każdym kluczu', goalMs: 3200, items: () => [...range(60, 72, white).map((p) => one(p, 0)), ...range(48, 60, white).map((p) => one(p, 1))] },
  { n: 5, name: 'Środkowe C: linie dodane między kluczami', goalMs: 3200, items: () => [...range(55, 60, white).map((p) => one(p, 0)), ...range(60, 65, white).map((p) => one(p, 1)), ...range(62, 67, white).map((p) => one(p, 0))] },
  { n: 6, name: 'Cała pięciolinia z liniami dodanymi', goalMs: 3000, items: () => [...range(57, 81, white).map((p) => one(p, 0)), ...range(40, 64, white).map((p) => one(p, 1))] },
  { n: 7, name: 'Znaki przy kluczu: G, F, D, B', goalMs: 3000, keyed: [1, -1, 2, -2], items: (key) => scaleItems(key) },
  { n: 8, name: 'Dwudźwięki prawej ręki', goalMs: 3500, keyed: [0, 1, -1, 2, -2], items: (key) => intervalItems(key) },
  { n: 9, name: 'Trójdźwięki w obu rękach', goalMs: 4000, keyed: [0, 1, -1, 2, -2, 3, -3], items: (key) => triadItems(key, false) },
  { n: 10, name: 'Akordy w przewrotach, bas osobno', goalMs: 4500, keyed: [0, 1, -1, 2, -2, 3, -3], items: (key) => triadItems(key, true) },
];

function one(p, st) { return { pitches: [p], st: [st], key: 0, id: `${st ? 'b' : 'v'}${p}` }; }

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const TONIC_OF_FIFTHS = (k) => (((k * 7) % 12) + 12) % 12;
function scaleOf(key) { const t = TONIC_OF_FIFTHS(key); return new Set(MAJOR.map((x) => (t + x) % 12)); }

function scaleItems(key) {
  const sc = scaleOf(key);
  const inKey = (p) => sc.has(p % 12);
  return [...range(60, 76, inKey).map((p) => ({ ...one(p, 0), key, id: `k${key}v${p}` })),
    ...range(45, 60, inKey).map((p) => ({ ...one(p, 1), key, id: `k${key}b${p}` }))];
}

function intervalItems(key) {
  const sc = [...scaleOf(key)];
  const notes = range(60, 79, (p) => sc.includes(p % 12));
  const out = [];
  for (let i = 0; i < notes.length; i++) for (const k of [2, 3, 4, 5]) if (notes[i + k]) out.push({ pitches: [notes[i], notes[i + k]], st: [0, 0], key, id: `k${key}i${notes[i]}-${notes[i + k]}` });
  return out;
}

function triadItems(key, inversions) {
  const t = TONIC_OF_FIFTHS(key);
  const degs = [0, 2, 4, 5, 7, 9];                 // I ii iii IV V vi (no diminished)
  const out = [];
  for (const dg of degs) {
    const rootPc = (t + dg) % 12;
    const q = MAJOR.indexOf(dg);
    const third = (t + MAJOR[(q + 2) % 7]) % 12, fifth = (t + MAJOR[(q + 4) % 7]) % 12;
    const pcs = [rootPc, third, fifth];
    for (const inv of inversions ? [0, 1, 2] : [0]) {
      const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
      let p = 60 + ((order[0] - 60 % 12 + 12) % 12);
      const rh = [p];
      for (const pc of order.slice(1)) { do p++; while (p % 12 !== pc); rh.push(p); }
      if (inversions) {
        const bass = 48 + ((rootPc - 48 % 12 + 12) % 12) - (rootPc >= 7 ? 12 : 0);
        out.push({ pitches: [bass, ...rh], st: [1, 0, 0, 0], key, id: `k${key}t${rootPc}i${inv}` });
      } else {
        const lh = rh.map((x) => x - 12 - (rh[0] >= 67 ? 12 : 0));
        out.push({ pitches: rh, st: [0, 0, 0], key, id: `k${key}t${rootPc}r` }, { pitches: lh, st: [1, 1, 1], key, id: `k${key}t${rootPc}l` });
      }
    }
  }
  return out;
}

/** The cards of a level (a level with `keyed` uses one key per series). */
export function levelItems(level, keyIndex = 0) {
  const L = READ_LEVELS[Math.max(1, Math.min(READ_LEVELS.length, level)) - 1];
  const key = L.keyed ? L.keyed[((keyIndex % L.keyed.length) + L.keyed.length) % L.keyed.length] : 0;
  return { level: L, key, items: L.items(key) };
}

/** Next card: weak and slow cards come more often; never the same one twice in a row. `rand` for tests. */
export function pickItem(items, stats = {}, lastId = null, goalMs = 3000, rand = Math.random) {
  const pool = items.length > 1 ? items.filter((x) => x.id !== lastId) : items;
  const w = pool.map((x) => {
    const s = stats[x.id];
    if (!s || !s.n) return 1.6;                       // never seen: a bit more often
    return 1 + 3 * (s.bad / s.n) + Math.min(2, (s.ms || goalMs) / goalMs - 0.5);
  });
  let r = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Did the hands play the card? Exact pitches (octave matters: this is reading). */
export function checkCard(card, played) {
  const want = [...card.pitches].sort((a, b) => a - b);
  const got = [...new Set(played)].sort((a, b) => a - b);
  const ok = want.length === got.length && want.every((p, i) => p === got[i]);
  const wrong = got.filter((p) => !want.includes(p));
  const missing = want.filter((p) => !got.includes(p));
  const octave = !ok && wrong.length && wrong.every((p) => want.some((q) => (q - p) % 12 === 0));
  return { ok, wrong, missing, octave };
}

/** 0–100: a right card read within the goal is 100, three times slower is 60; a wrong card is 0. */
export function cardScore(ok, ms, goalMs) {
  if (!ok) return 0;
  if (ms <= goalMs) return 100;
  return Math.max(60, Math.round(100 - (40 * (ms - goalMs)) / (2 * goalMs)));
}

/** Remember how this card went (rec.items: per card n, bad, ms = moving average of right answers). */
export function noteCard(stats, id, ok, ms) {
  const s = stats[id] || (stats[id] = { n: 0, bad: 0, ms: 0 });
  s.n++;
  if (!ok) s.bad++;
  else s.ms = s.ms ? Math.round(s.ms * 0.7 + ms * 0.3) : Math.round(ms);
  return s;
}

/** After a series of cards: up when (nearly) everything was right and fast enough, down when it fell apart. */
export function nextReadLevel(level, results, goalMs) {
  if (results.length < 10) return level;
  const okShare = results.filter((r) => r.ok).length / results.length;
  const times = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : Infinity;
  if (okShare >= 0.9 && median <= goalMs) return Math.min(READ_LEVELS.length, level + 1);
  if (okShare < 0.6) return Math.max(1, level - 1);
  return level;
}

export function median(list) {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// --- Zeszyt: a phrase from the router's log as notes ----------------------------------------------------------
/** Beats per minute from the onsets of free playing: the typical gap is taken as an eighth, a quarter or a half. */
export function estimateTempo(notes) {
  const on = [...new Set(notes.map((n) => Math.round(n[1] * 20) / 20))].sort((a, b) => a - b);   // onsets within 50 ms are one
  const gaps = [];
  for (let i = 1; i < on.length; i++) { const g = on[i] - on[i - 1]; if (g >= 0.12 && g <= 2.5) gaps.push(g); }
  if (gaps.length < 3) return 80;
  let beat = median(gaps);
  while (beat < 0.4) beat *= 2;
  while (beat > 1.1) beat /= 2;
  return Math.max(40, Math.min(180, Math.round(60 / beat)));
}

/** The signature (in fifths, -6..6) that leaves the fewest sounding notes outside the major scale. */
export function guessFifths(notes) {
  let best = 0, bestCost = Infinity;
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]) {
    const sc = scaleOf(k);
    const cost = notes.reduce((a, n) => a + (sc.has(((n[0] % 12) + 12) % 12) ? 0 : Math.min(2, n[2] || 0.3)), 0);
    if (cost < bestCost - 1e-9) { best = k; bestCost = cost; }
  }
  return best;
}

/** A phrase ([[pitch, t s, d s, vel]]) as notes in beats at `bpm`: the first note on beat 1 of bar 1. */
export function phraseNotes(phrase, bpm) {
  const k = bpm / 60;
  const t0 = phrase.length ? Math.min(...phrase.map((n) => n[1])) : 0;
  return phrase.map((n) => ({ p: n[0], t: (n[1] - t0) * k, d: Math.max(0.12, n[2] * k), v: n[3] || 80 }));
}

// --- Śpiewnik: melody, chord symbols and words ------------------------------------------------------------------
/** The melody of a take: the top note of each onset, from `fromNote` up, in beats after `t0` (s). events: {note, on, t, vel}. */
export function melodyFrom(events, t0, bpm, { fromNote = 55, endBeat = Infinity } = {}) {
  const k = bpm / 60;
  const open = new Map(), all = [];
  for (const e of events) {
    if (e.on) { const n = { p: e.note, t: (e.t - t0) * k, d: 0.25, v: e.vel || 80 }; open.set(e.note, n); all.push(n); }
    else if (open.has(e.note)) { const n = open.get(e.note); n.d = Math.max(0.12, (e.t - t0) * k - n.t); open.delete(e.note); }
  }
  const tops = new Map();
  for (const n of all) {
    if (n.p < fromNote || n.t < -0.25 || n.t >= endBeat) continue;
    const slot = Math.round(n.t * 8);                          // onsets within a 32nd are one
    if (!tops.has(slot) || tops.get(slot).p < n.p) tops.set(slot, n);
  }
  return [...tops.values()].map((n) => ({ ...n, t: Math.max(0, n.t), d: Math.min(n.d, endBeat - Math.max(0, n.t)) })).sort((a, b) => a.t - b.t);
}

/** Words to sing, in order, from the lyric lines of song sections (parseChart). */
export function lyricWords(sections) {
  return sections.flatMap((s) => s.lines || []).map((l) => l.lyric || '').join(' ').split(/\s+/).filter((w) => w && !/^[|%]+$/.test(w));
}

/**
 * Room above each system for chord symbols and below it for words: every system moves down, so the layout
 * stays one picture. Mutates L (ops, systems, hits, height).
 */
export function spaceSystems(L, above, below) {
  const shift = (d, dy) => { for (let i = 0; i < d.length;) { const c = d[i]; if (c === 'M' || c === 'L') { d[i + 2] += dy; i += 3; } else if (c === 'C') { d[i + 2] += dy; d[i + 4] += dy; d[i + 6] += dy; i += 7; } else i += 1; } };
  L.systems.forEach((sy, i) => {
    const dy = above + i * (above + below);
    for (const op of L.sysOps[i]) { if (op.d) shift(op.d, dy); if (op.k === 'T') op.y += dy; }
    sy.y0 += dy; sy.y1 += dy; sy.tops = sy.tops.map((t) => t + dy);
  });
  for (const h of L.hits) { const dy = above + (L.measures[h.m] ? L.measures[h.m].sys : 0) * (above + below); h.y0 += dy; h.y1 += dy; }
  L.height += L.systems.length * (above + below);
  return L;
}

/**
 * Chord symbols over the beats where they start and words under the notes, as Spartito text ops, so the
 * screen (SVG) and print draw them like the rest. chords: [{beat, name}]; notes: the laid-out notes (id = index + 1).
 */
export function sheetMarks(E, L, { chords = [], words = [], notes = [] } = {}) {
  const sp = L.sp, ink = E.gl_INK;
  const text = (sys, x, y, s, size, bold, italic) => L.sysOps[sys].push({ k: 'T', x, y, s, size, font: 'serif', bold: bold ? 1 : 0, italic: italic ? 1 : 0, align: 'left', c: ink });
  for (const c of chords) {
    const at = E.ly_xAtTick(L, Math.round(c.beat * E.TPQ));
    if (!at || !c.name) continue;
    text(at.sys, at.x - 0.4 * sp, L.systems[at.sys].tops[0] - 2.4 * sp, c.name, 1.7 * sp, true, false);
  }
  const heads = L.hits.filter((h) => h.k === 'n').map((h) => ({ h, n: notes[h.id - 1] })).filter((x) => x.n)
    .sort((a, b) => a.n.t - b.n.t);
  let w = 0, lastT = -1;
  for (const { h, n } of heads) {
    if (w >= words.length) break;
    if (Math.abs(n.t - lastT) < 1e-6) continue;
    lastT = n.t;
    const sys = L.measures[h.m] ? L.measures[h.m].sys : 0;
    const bottom = L.systems[sys].tops[L.systems[sys].tops.length - 1] + 4 * sp;
    L.sysOps[sys].push({ k: 'T', x: (h.x0 + h.x1) / 2, y: bottom + 3.4 * sp, s: words[w++], size: 1.45 * sp, font: 'serif', bold: 0, italic: 0, align: 'center', c: ink });
  }
  return { placed: w };
}
