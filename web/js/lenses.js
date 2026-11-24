// The three lenses of the Progresje tab (1.18–1.20) and the "Zamień / Pożycz" card. Pure, no DOM; tested in lenses.test.js.
//   Szkielet: what each chord is for (T / S / D) and which layer of "clothes" it belongs to (rozbierz = take layers off);
//   Bas: the kind of move from root to root, with a character and a colour (the same colours as the arrows on the Koło);
//   Siatka (Tonnetz): every major or minor triad is a triangle, neighbours share two notes (P, L, R = one finger).
// Also: ways to play a progression (left and right hand), and what can replace one chord.
import { QUALITY, FAMILY, degreeOf, degLabel, keyName, bassNote, voicing } from './theory.js';
import { stepChord, stepChords, normStep, sourceOf, CAT_BY_ID, simpleSpell, asStep, stackedChord, scaleName, scaleOf } from './chords.js';
import { fnOf } from './colors.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const isChord = (s) => s && s.k === 'chord' && !s.skip;
const pcsOf = (c) => new Set(c.tones.map((t) => t.pc));
export const commonTones = (a, b) => { const B = pcsOf(b); return [...pcsOf(a)].filter((x) => B.has(x)).length; };

/** Base triad of a quality: 'maj' | 'min' | 'dim' | 'aug' | 'sus' | null. */
export function triadOf(q) {
  const iv = new Set((QUALITY[q] || QUALITY.maj).iv.map(mod12));
  if (iv.has(4) && iv.has(7)) return 'maj';
  if (iv.has(3) && iv.has(7)) return 'min';
  if (iv.has(3) && iv.has(6)) return 'dim';
  if (iv.has(4) && iv.has(8)) return 'aug';
  if (iv.has(4)) return 'maj';
  if (iv.has(3)) return 'min';
  return 'sus';
}

// --- Szkielet -------------------------------------------------------------------------------------------------------
export const LAYERS = [
  { n: 0, name: 'Szkielet', say: 'Tylko 1, 4 i 5: dom, wyjście, napięcie.' },
  { n: 1, name: 'Rodzina', say: 'Krewni z tej samej tonacji: 6m zamiast 1, 2m zamiast 4, 3m, 7°.' },
  { n: 2, name: 'Dominanty wtórne', say: 'Akordy, które na chwilę robią z innego akordu dom (5⁷/x, 7°/x).' },
  { n: 3, name: 'Pożyczki', say: 'Akordy z innego modu z tą samą toniką: ♭7, ♭6, 4m, ♭3.' },
  { n: 4, name: 'Chromatyka', say: 'Medianty, zastępstwa trytonowe i inne obce, ale gładkie akordy.' },
];

/** Function and layer of each chord step. Returns [{ i, fn, layer, why, target? }] for the chord steps (in order). */
export function analyze(key, steps) {
  const list = steps.map(normStep);
  const chordIdx = list.map((s, i) => (isChord(s) ? i : -1)).filter((i) => i >= 0);
  const chords = chordIdx.map((i) => stepChord(key, list[i], { color: 'triads' }));
  return chordIdx.map((i, k) => {
    const s = list[i];
    const c = chords[k];
    const next = chords[(k + 1) % chords.length];
    const fn = fnOf(key, c);
    const root = c.root.pc;
    const nextRoot = next ? next.root.pc : null;
    const tri = triadOf(c.quality);
    const famChord = FAMILY[key.mode][s.d - 1];
    const diatonic = fn !== 'X' && famChord && famChord[1] === s.a;
    if (diatonic) {
      const primary = [1, 4, 5].includes(s.d);
      return { i, k, fn, layer: primary ? 0 : 1, why: primary ? 'akord główny' : `krewny (${fnWord(fn)})` };
    }
    const src = sourceOf(key, root, CAT_BY_ID[c.quality] || { iv: c.tones.map((t) => mod12(t.pc - root)), pcs: new Set(c.tones.map((t) => mod12(t.pc - root))) });
    const resolvesDown5 = nextRoot != null && mod12(nextRoot - root) === 5;
    const mode0 = borrowedFrom(key, c);
    // a plain major triad a fifth above the next chord is a secondary dominant only when no mode of this tonic holds it
    if (src.kind === 'sec' || src.kind === 'vii' || (tri === 'maj' && resolvesDown5 && k + 1 < chords.length && !mode0) || (tri === 'dim' && !mode0 && nextRoot != null && mod12(nextRoot - root) === 1)) {
      return { i, k, fn: 'X', layer: 2, why: src.kind === 'vii' || tri === 'dim' ? 'dźwięk prowadzący do następnego' : `dominanta do ${next ? next.number : 'następnego'}`, target: k + 1 };
    }
    if (src.kind === 'tt') return { i, k, fn: 'X', layer: 4, why: 'zastępstwo trytonowe: schodzi półtonem', target: k + 1 };
    const mode = mode0;
    if (mode) return { i, k, fn: 'X', layer: 3, why: `pożyczony z ${mode}` };
    return { i, k, fn: 'X', layer: 4, why: src.text };
  });
}
const fnWord = (f) => ({ T: 'dom', S: 'wyjście', D: 'napięcie' }[f] || '');

// modes with the same tonic, from the brightest to the darkest, then the colours (1.18)
export const MODE_LADDER = [
  ['lidyjska', 'lidyjskiej'], ['dur', 'durowej (jońskiej)'], ['miksolidyjska', 'miksolidyjskiej'], ['dorycka', 'doryckiej'],
  ['moll', 'molowej (eolskiej)'], ['frygijska', 'frygijskiej'], ['lokrycka', 'lokryckiej'],
];
export const MODE_COLORS = [['harm', 'molowej harmonicznej'], ['melodyczna', 'molowej melodycznej'], ['durHarm', 'durowej harmonicznej'], ['mixoB6', 'miksolidyjskiej ♭6'], ['hidzaz', 'hidżazu (frygijskiej dominantowej)'], ['mixoB2', 'miksolidyjskiej ♭2']];

/**
 * Where a borrowed chord comes from: the mode with this tonic that holds the whole chord and differs least from the key
 * (fewest changed notes). The parallel key counts as 1.5 notes closer, the colour scales 1.5 further, so the answer is
 * the one a teacher gives: ♭7 from mixolydian, ♭6 and ♭3 from the parallel minor, ♭2 from phrygian, 2 from lydian.
 */
export function borrowedFrom(key, c) {
  const pcs = [...pcsOf(c)];
  const home = new Set(scalePcs(key, key.mode === 'minor' ? 'moll' : 'dur'));
  const parallel = key.mode === 'minor' ? 'dur' : 'moll';
  let best = null;
  for (const [id, gen] of [...MODE_LADDER, ...MODE_COLORS]) {
    const sc = scalePcs(key, id);
    const set = new Set(sc);
    if (!pcs.every((p) => set.has(p))) continue;
    const changed = sc.filter((p) => !home.has(p)).length;
    if (!changed) continue;
    const cost = changed - (id === parallel ? 1.5 : 0) + (MODE_COLORS.some(([x]) => x === id) ? 1.5 : 0);
    if (!best || cost < best.cost) best = { cost, gen };
  }
  return best ? best.gen : null;
}
const scalePcs = (key, id) => scaleOf(key, id).map((x) => x.pc);

const PRIMARY = { major: { T: [1, 0, 'maj'], S: [4, 0, 'maj'], D: [5, 0, 'maj'] }, minor: { T: [1, 0, 'min'], S: [4, 0, 'min'], D: [5, 0, 'maj'] } };
// borrowed chords by degree: which function they stand in for
const BORROWED_FN = { '2:-1': 'S', '3:-1': 'T', '4:0': 'S', '5:0': 'D', '6:-1': 'S', '7:-1': 'S', '6:0': 'S', '3:0': 'T', '2:0': 'S', '7:0': 'D', '1:0': 'T' };

/** The progression with only layers ≤ n: every chord above that layer is replaced by what it stands for. */
export function undress(key, steps, n, { plain = false } = {}) {
  const list = steps.map(normStep).filter(Boolean);
  const info = analyze(key, list);
  const byI = new Map(info.map((x) => [x.i, x]));
  const out = list.map((s) => ({ ...s }));
  // targets first (a secondary dominant becomes the chord it leads to, so do those after the others)
  const prim = (f) => { const [d, a, q] = PRIMARY[key.mode][f] || PRIMARY[key.mode].T; return { d, a, q }; };
  for (const x of info) {
    if (x.layer <= n) continue;
    const s = out[x.i];
    if (x.layer === 1) Object.assign(s, prim(x.fn), { bass: undefined });
    else if (x.layer === 3 || x.layer === 4) {
      if (x.layer === 4 && x.target != null && n >= 2) { const c = stepChord(key, s); const tr = mod12(c.root.pc - 1 + 7); Object.assign(s, asStep(key, simpleSpell(key, tr).li, tr, 'dom7'), { bass: undefined }); continue; }
      const f = BORROWED_FN[`${s.d}:${s.a}`] || 'T';
      const fam = FAMILY[key.mode][s.d - 1];
      // the same degree from the key if it exists (♭6 in major → 4, its function), else the primary of the function
      Object.assign(s, n >= 1 && fam && fam[1] === 0 && s.a === 0 ? { d: s.d, a: 0, q: fam[2] } : prim(f), { bass: undefined });
    }
  }
  // secondary dominants: hold the chord before (or, at the start, become the target)
  for (const x of info) {
    if (x.layer !== 2 || x.layer <= n) continue;
    const prevI = info.filter((y) => y.k < x.k).map((y) => y.i).pop();
    const nextI = info.find((y) => y.k > x.k);
    const src = prevI != null ? out[prevI] : nextI ? out[nextI.i] : null;
    if (src) Object.assign(out[x.i], { d: src.d, a: src.a, q: src.q, bass: src.bass });
  }
  for (const s of out) {
    if (!isChord(s)) continue;
    if (plain || n < 1) { const t = triadOf(s.q); s.q = t === 'min' ? 'min' : t === 'dim' ? 'dim' : 'maj'; }
    if (n < 1) delete s.bass;
    if (s.bass === undefined) delete s.bass;
  }
  return mergeSame(out);
}

/** Neighbouring chord steps that are the same chord become one (lengths added). */
export function mergeSame(steps) {
  const out = [];
  for (const s of steps) {
    const p = out[out.length - 1];
    if (p && isChord(p) && isChord(s) && p.d === s.d && p.a === s.a && p.q === s.q && (p.bass || 0) === (s.bass || 0)) p.bars = (p.bars || 1) + (s.bars || 1);
    else out.push({ ...s });
  }
  return out;
}

/** The highest layer in a progression (where the slider ends). */
export const topLayer = (key, steps) => Math.max(0, ...analyze(key, steps).map((x) => x.layer));

// --- Bas -----------------------------------------------------------------------------------------------------------
export const MOTIONS = {
  mocny: { name: 'mocny', say: 'kwarta w górę (kwinta w dół): jak kropka w zdaniu, najsilniejszy ruch w muzyce', css: 'var(--bm-mocny)' },
  wstecz: { name: 'wstecz', say: 'kwinta w górę (kwarta w dół): cofnięcie, „amen”, rockowy luz', css: 'var(--bm-wstecz)' },
  miekki: { name: 'miękki', say: 'tercja w dół: krewny, dwa wspólne dźwięki, ręka prawie stoi', css: 'var(--bm-miekki)' },
  wznosi: { name: 'wznoszący', say: 'tercja w górę: też dwa wspólne dźwięki, ale mniej stanowczo', css: 'var(--bm-wznosi)' },
  filmowy: { name: 'filmowy', say: 'tercja do obcego akordu: jeden wspólny dźwięk, reszta półtonem (medianta)', css: 'var(--bm-filmowy)' },
  krok: { name: 'krok', say: 'sekunda: przesunięcie całego akordu, rock i pop', css: 'var(--bm-krok)' },
  poslizg: { name: 'poślizg', say: 'półton: chromatyczny najazd, gospel, jazz, filmowo', css: 'var(--bm-poslizg)' },
  tryton: { name: 'tryton', say: 'najdalszy skok: pół koła, bardzo obco', css: 'var(--bm-tryton)' },
  stoi: { name: 'stoi', say: 'ta sama pryma, zmienia się kolor (dur ↔ moll, septyma)', css: 'var(--bm-stoi)' },
};

/** Kind of move from chord a to chord b (chord objects): a MOTIONS id. */
export function motion(a, b) {
  const iv = mod12(b.root.pc - a.root.pc);
  if (iv === 0) return 'stoi';
  if (iv === 5) return 'mocny';
  if (iv === 7) return 'wstecz';
  if (iv === 1 || iv === 11) return 'poslizg';
  if (iv === 2 || iv === 10) return 'krok';
  if (iv === 6) return 'tryton';
  const ct = commonTones(a, b);
  if (ct < 2) return 'filmowy';
  return iv === 8 || iv === 9 ? 'miekki' : 'wznosi';
}

/** Moves between consecutive chords (and from the last back to the first, for a loop). */
export function motions(key, steps, { loop = true } = {}) {
  const ch = stepChords(key, steps, { color: 'triads' }).filter((x) => !x.rest).map((x) => x.chord);
  const out = [];
  for (let k = 0; k < ch.length - (loop ? 0 : 1); k++) {
    const a = ch[k], b = ch[(k + 1) % ch.length];
    if (ch.length < 2) break;
    out.push({ k, from: a.name, to: b.name, kind: motion(a, b), common: commonTones(a, b) });
  }
  return out;
}

/** Share of each kind of move (for "ta progresja jest głównie …"). */
export function motionProfile(list) {
  const n = {};
  for (const m of list) n[m.kind] = (n[m.kind] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, count }));
}

/** Bass line of a progression (MIDI, left hand around C2–C3) and how it moves: by step (≤2 semitones) or by leap. */
export function bassLine(key, steps) {
  const ch = stepChords(key, steps, { color: 'triads' }).filter((x) => !x.rest).map((x) => x.chord);
  let prev = null;
  return ch.map((c) => {
    let m = bassNote(c, 36);
    if (prev != null) { while (m - prev > 6) m -= 12; while (prev - m > 6) m += 12; if (m < 31) m += 12; if (m > 55) m -= 12; }
    const d = prev == null ? 0 : m - prev;
    prev = m;
    return { note: m, pc: mod12(m), name: c.bassPc != null ? c.name.split('/')[1] : c.root.name, step: Math.abs(d) <= 2 && d !== 0, d };
  });
}

// --- Siatka (Tonnetz) -------------------------------------------------------------------------------------------------
// node (i, j): pitch class 7i + 4j (fifths to the right, major thirds up). Major triad on root r: (i,j),(i+1,j),(i,j+1);
// minor triad on root r: (i+1,j),(i,j+1),(i+1,j+1) with 7i+4j = r − 4.
export const nodePc = (i, j) => mod12(7 * i + 4 * j);
export const triadId = (rootPc, kind) => `${mod12(rootPc)}${kind === 'min' ? 'm' : 'M'}`;
export const parseTriad = (id) => ({ root: Number(id.slice(0, -1)), kind: id.endsWith('m') ? 'min' : 'maj' });
export const triadPcs = (id) => { const { root, kind } = parseTriad(id); return [root, mod12(root + (kind === 'min' ? 3 : 4)), mod12(root + 7)]; };

/** P, L, R of a triad (each keeps two notes, one note moves by a semitone or a whole tone). */
export function plr(id) {
  const { root, kind } = parseTriad(id);
  if (kind === 'maj') return { P: triadId(root, 'min'), R: triadId(root + 9, 'min'), L: triadId(root + 4, 'min') };
  return { P: triadId(root, 'maj'), R: triadId(root + 3, 'maj'), L: triadId(root + 8, 'maj') };
}
export const PLR_SAY = {
  P: 'P: tercja o półton (dur ↔ moll), pryma i kwinta stoją',
  R: 'R: jeden dźwięk o cały ton (równoległa tonacja)',
  L: 'L: jeden dźwięk o półton (akord o tercję wielką)',
};

/** Shortest walk of P/L/R moves between two triads: [{ move, id }] (empty when the same). */
export function plrPath(from, to) {
  if (from === to) return [];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const [mv, nx] of Object.entries(plr(cur))) {
      if (prev.has(nx)) continue;
      prev.set(nx, { from: cur, move: mv });
      if (nx === to) {
        const path = [];
        let x = to;
        while (prev.get(x)) { const p = prev.get(x); path.unshift({ move: p.move, id: x }); x = p.from; }
        return path;
      }
      queue.push(nx);
    }
  }
  return [];
}

/** The triad of a chord on the grid (sevenths and ninths by their base triad), or null (dim, aug, sus). */
export function triadOfChord(c) {
  const t = triadOf(c.quality);
  return t === 'maj' || t === 'min' ? triadId(c.root.pc, t) : null;
}

/** Triangles of a window of the grid around a pitch class: [{ id, kind, pts: [[i,j]×3], root }]. */
export function gridWindow(centerPc, { cols = 9, rows = 5 } = {}) {
  let ci = 0;
  for (let i = 0; i < 12; i++) if (nodePc(i, 0) === mod12(centerPc)) { ci = i; break; }
  const tris = [];
  const half = Math.floor(rows / 2);
  for (let j = -half; j < rows - half; j++) {
    const start = ci - Math.floor(cols / 2) - Math.floor(j / 2);
    for (let i = start; i < start + cols; i++) {
      const p = nodePc(i, j);
      tris.push({ id: triadId(p, 'maj'), kind: 'maj', root: p, pts: [[i, j], [i + 1, j], [i, j + 1]] });
      tris.push({ id: triadId(p + 4, 'min'), kind: 'min', root: mod12(p + 4), pts: [[i + 1, j], [i, j + 1], [i + 1, j + 1]] });
    }
  }
  return tris;
}

// --- Jak zagrać ------------------------------------------------------------------------------------------------------
// ways to play: left hand (bass clef) and right hand; level 1–4. Each gives notes per chord.
export const WAYS_TO_PLAY = [
  { id: 'prawa', name: 'Sama prawa', level: 1, lh: 'nic', rh: 'akord najbliżej poprzedniego', say: 'Na start: tylko prawa ręka, każdy akord w przewrocie najbliżej poprzedniego. Palce prawie stoją, uczysz się chwytów.' },
  { id: 'bas', name: 'Bas i akord', level: 1, lh: 'pryma', rh: 'akord najbliżej', say: 'Lewa gra prymę (albo bas z kreską), prawa akord. Podstawa akompaniamentu do śpiewu.' },
  { id: 'oktawa', name: 'Oktawa w basie', level: 2, lh: 'pryma w oktawie', rh: 'akord najbliżej', say: 'Lewa gra prymę oktawą. Pełniej i mocniej, dobre do ballad i refrenów.' },
  { id: 'kwinta', name: 'Otwarta kwinta', level: 2, lh: 'pryma i kwinta', rh: 'akord najbliżej', say: 'Lewa: pryma i kwinta. Brzmi otwarcie, jak gitara bez tercji. Prawa dokłada tercję i kolor.' },
  { id: 'gospel', name: 'Gospel: szeroko', level: 3, lh: '1–5–8', rh: 'akord z noną w górze', say: 'Lewa rozpięta na 1–5–8, prawa akord z dodaną noną. Kościelny, szeroki dźwięk do refrenu.' },
  { id: 'shell', name: 'Jazz: shell', level: 3, lh: '1–7 (albo 1–3)', rh: '3, 5 i 9 nad tym', say: 'Lewa trzyma prymę i septymę (bez septymy: tercję). Prawa: tercja, kwinta i nona. Tak gra pianista w trio.' },
  { id: 'rootless', name: 'Jazz: bez prymy', level: 4, lh: '3–7–9 (bez prymy)', rh: 'wolna na melodię', say: 'Lewa gra tylko tercję, septymę i nonę. Prymę gra basista zespołu. Prawa zostaje wolna na melodię albo improwizację.' },
];

/** Notes of one chord for a way to play: { lh: [midi], rh: [midi] }. prevRh: the right hand of the chord before (voice leading). */
export function wayNotes(way, c, prevRh = null) {
  const pc = (x) => mod12(x);
  const root = bassNote(c, 36);
  const hasSev = c.tones.length >= 4 && c.roles.includes('7');
  const third = c.tones[c.roles.indexOf('3')] || c.tones[1];
  const sev = hasSev ? c.tones[c.roles.indexOf('7')] : null;
  const fifth = c.tones[c.roles.indexOf('5')] || c.tones[2] || c.tones[0];
  const near = (p, lo, hi) => { let m = lo; while (pc(m) !== pc(p)) m++; return m <= hi ? m : m - 12; };
  const rhClose = voicing(c, { prev: prevRh, center: 66, lo: 57, hi: 76 });
  switch (way) {
    case 'prawa': return { lh: [], rh: rhClose };
    case 'bas': return { lh: [root], rh: rhClose };
    case 'oktawa': return { lh: [root, root + 12].filter((x) => x <= 55), rh: rhClose };
    case 'kwinta': return { lh: [root, root + 7], rh: rhClose };
    case 'gospel': {
      const nine = mod12(c.root.pc + 2);
      const rh = voicing({ ...c, tones: [...c.tones.filter((t) => c.roles[c.tones.indexOf(t)] !== '5' || c.tones.length < 4), { pc: nine, name: '' }] }, { prev: prevRh, center: 68, lo: 59, hi: 79 });
      return { lh: [root, root + 7, root + 12], rh };
    }
    case 'shell': {
      const lh = [root, near(hasSev ? sev.pc : third.pc, root + 1, root + 12)];
      const rhPcs = [third.pc, fifth.pc, mod12(c.root.pc + 2)];
      const rh = voicing({ ...c, tones: rhPcs.map((p) => ({ pc: p, name: '' })) }, { prev: prevRh, center: 66, lo: 58, hi: 76 });
      return { lh, rh };
    }
    case 'rootless': {
      const pcs = [third.pc, hasSev ? sev.pc : fifth.pc, mod12(c.root.pc + 2)];
      const lh = voicing({ ...c, tones: pcs.map((p) => ({ pc: p, name: '' })) }, { prev: prevRh, center: 54, lo: 48, hi: 62 });
      return { lh, rh: [] };
    }
    default: return { lh: [root], rh: rhClose };
  }
}

/** Notes for the whole progression with one way to play (voice leading in the right hand, or the left for rootless). */
export function wayPlan(key, steps, way, { color = 'triads' } = {}) {
  const list = stepChords(key, steps, { color });
  let prev = null;
  return list.filter((x) => !x.rest).map((x) => {
    const n = wayNotes(way, x.chord, prev);
    prev = way === 'rootless' ? n.lh : n.rh;
    return { chord: x.chord, bars: x.bars, ...n };
  });
}

// --- Zamień / Pożycz -------------------------------------------------------------------------------------------------
const label = (key, st) => stepChord(key, st, { color: 'triads' }).number;
const nameOf = (key, st) => stepChord(key, st, { color: 'triads' }).name;
const stepOfPc = (key, pc, q) => { const sp = simpleSpell(key, mod12(pc)); return asStep(key, sp.li, mod12(pc), q); };

/**
 * What can stand where one chord stands. Groups: funkcja, palec (P/L/R), mody, medianty, przed (insert before it), barwa.
 * Each option: { step, label, name, common, why, move? ('P'|'L'|'R'), insert? (goes before the chord, takes half its time) }.
 */
export function replacements(key, step) {
  const s = normStep(step);
  if (!isChord(s)) return [];
  const cur = stepChord(key, s, { color: 'triads' });
  const curName = cur.name;
  const groups = [];
  let seen = new Set([curName]);
  const opt = (st, why, extra = {}) => {
    const full = { k: 'chord', bars: s.bars || 1, ...st };
    const c = stepChord(key, full, { color: 'triads' });
    if (!extra.insert && seen.has(c.name)) return null;
    if (!extra.insert) seen.add(c.name);
    return { step: full, label: c.number, name: c.name, common: commonTones(cur, c), why, ...extra };
  };
  // each group has its own list (Fm may be both a P neighbour and a borrowing: say both); never the chord itself
  const push = (id, name, about, items) => { const it = items.filter(Boolean); seen = new Set([curName]); if (it.length) groups.push({ id, name, about, items: it }); };
  // the same function, from the key's family
  const fn = fnOf(key, cur);
  const fam = FAMILY[key.mode].map(([d, a, q], i) => ({ d, a, q, i }));
  const FNS = { T: [1, 3, 6], S: [2, 4], D: [5, 7] };
  push('funkcja', 'Ta sama funkcja', 'Zamiennik z rodziny: inna barwa, ta sama rola w zdaniu.',
    (FNS[fn] || []).filter((d) => d !== s.d).map((d) => { const f = fam[d - 1]; return opt({ d: f.d, a: f.a, q: f.q }, `${fnWord(fn)}, jak ${cur.number}`); }));
  // one finger: P, L, R on the grid
  const tri = triadOfChord(cur);
  if (tri) {
    const n = plr(tri);
    push('palec', 'Jeden palec (siatka)', 'Sąsiedzi na siatce: dwa dźwięki zostają, jeden się przesuwa.',
      ['P', 'R', 'L'].map((mv) => { const t = parseTriad(n[mv]); return opt(stepOfPc(key, t.root, t.kind), PLR_SAY[mv], { move: mv }); }));
  }
  // borrowed from a mode with the same tonic: the chord on the same degree
  const modeOpts = [];
  for (const [id, gen] of [...MODE_LADDER, ...MODE_COLORS]) {
    const st = stackedChord(key, id, s.d - 1, triadOf(cur.quality) === 'dim' || cur.tones.length < 4 ? 3 : 4);
    if (!st) continue;
    const o = opt({ d: st.d, a: st.a, q: st.q }, `z ${gen}`);
    if (o) modeOpts.push(o);
  }
  push('mody', 'Pożycz z modu', 'Ten sam stopień w innym modzie od tej samej toniki (od najjaśniejszego do najciemniejszego).', modeOpts);
  // chromatic mediants: a third away, one common tone
  if (tri) {
    const { kind } = parseTriad(tri);
    const r = cur.root.pc;
    push('medianty', 'Medianty chromatyczne', 'Tercja obok, jeden wspólny dźwięk, reszta idzie półtonem. Brzmi filmowo.',
      [3, 4, 8, 9].map((x) => opt(stepOfPc(key, r + x, kind), `tercja ${x === 3 || x === 4 ? 'w górę' : 'w dół'}, jeden wspólny dźwięk`)).filter((o) => o && o.common === 1));
  }
  // before it (insertions): its dominant, its ii–V, leading-tone diminished, tritone sub, a chromatic slide
  const r = cur.root.pc;
  const tgt = cur.number;
  push('przed', 'Wtrąć przed nim', 'Akord, który prowadzi do tego. Zabiera mu pół taktu.', [
    opt(stepOfPc(key, r + 7, 'dom7'), `dominanta: robi z ${tgt} dom na chwilę`, { insert: true }),
    opt(stepOfPc(key, r + 2, triadOf(cur.quality) === 'min' ? 'm7b5' : 'm7'), `2 do ${tgt}: przygotowanie (potem dodaj 5⁷)`, { insert: true }),
    opt(stepOfPc(key, r - 1, 'dim7'), `zmniejszony: wchodzi półtonem od dołu`, { insert: true }),
    opt(stepOfPc(key, r + 1, 'dom7'), `trytonowe: schodzi półtonem z góry`, { insert: true }),
    opt(stepOfPc(key, r + 1, cur.quality), `poślizg: ten sam akord pół tonu wyżej`, { insert: true }),
  ]);
  // the same chord, another colour
  const base = triadOf(cur.quality);
  const colours = base === 'min' ? ['m7', 'm9', 'm6', 'madd9', 'min'] : base === 'maj' ? (fn === 'D' || s.d === 5 ? ['dom7', 'dom9', 'dom7sus4', 'dom13', 'maj'] : ['maj7', 'add9', 'maj6', 'sus2', 'sus4', 'maj9', 'maj']) : base === 'dim' ? ['m7b5', 'dim7', 'dim'] : ['maj'];
  push('barwa', 'Ta sama, inny kolor', 'Ta sama pryma i funkcja, inne dźwięki dodane.', colours.filter((q) => q !== cur.quality).map((q) => opt({ d: s.d, a: s.a, q, bass: s.bass }, 'barwa')));
  return groups;
}

/** Put a replacement into the steps at chord step index i (insert = before it, taking half of its length). */
export function applyReplacement(steps, i, option) {
  const out = steps.map((x) => ({ ...normStep(x) }));
  const s = out[i];
  if (!isChord(s)) return out;
  const len = s.bars > 0 ? s.bars : 1;
  if (option.insert) {
    const half = len / 2;
    out.splice(i, 1, { ...option.step, k: 'chord', bars: half }, { ...s, bars: half });
  } else {
    const { bass, ...rest } = option.step;
    out[i] = { ...rest, k: 'chord', bars: len, ...(bass ? { bass } : {}) };
  }
  return out;
}

export { label as stepLabel, nameOf as stepName, keyName, degreeOf, degLabel, scaleName };
