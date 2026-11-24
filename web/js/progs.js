// One catalogue of progressions for the whole Trener (1.18). Pure, no DOM; tested in progs.test.js.
// It joins three sources without changing them: the Koło progressions (theory.PROGRESSIONS, also used by Jam,
// Improwizacja and Piosenki), the Siłownia bank (progbank.BANK) and the new ones (progs-data.js).
// A Koło progression and its bank twin become one entry (one name, one "why"); the entry keeps both ids, so
// "umiem" from the Koło and the Siłownia's history still point at it.
// Every entry has editor steps ({k:'chord', d, a, q, bars, bass}), the same model as Jam's editor.
import { PROGRESSIONS, QUALITY, degreeOf, keyByTonic, ALL_KEYS } from './theory.js';
import { BANK } from './progbank.js';
import { stepChords, normStep } from './chords.js';
import { FAMILY_INFO, THEORY_META, BANK_META, NEW_PROGRESSIONS, FAMILY_GROOVE, PROG_GROOVE } from './progs-data.js';

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (x) => ((x % 12) + 12) % 12;
const UPQ = {
  '': 'maj', 7: 'dom7', maj7: 'maj7', 6: 'maj6', 69: 'six9', add9: 'add9', 9: 'dom9', maj9: 'maj9', 13: 'dom13', sus4: 'sus4', sus: 'sus4', sus2: 'sus2',
  '7sus4': 'dom7sus4', '9sus4': 'dom9sus4', '+': 'aug', '+7': 'aug7', '7b9': 'dom7b9', '7#9': 'dom7s9', alt: 'alt', 5: 'power', '7#11': 'dom7s11', 'maj7#11': 'maj7s11', '7b13': 'dom7b13',
};
const LOWQ = { '': 'min', 7: 'm7', maj7: 'mmaj7', 6: 'm6', 9: 'm9', 11: 'm11', add9: 'madd9', 'ø7': 'm7b5', 'ø': 'm7b5', '7b5': 'm7b5', '°': 'dim', '°7': 'dim7', 69: 'm69' };
const TOKEN = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/*]*)(?:\/([b#]?)([1-7]))?(?:\*([\d.]+))?$/;
const RD = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

/** Semitones of a degree (1–7 with an accidental) above the tonic. */
export const degSemis = (d, a = 0) => mod12(SCALE[d - 1] + a);

/** "bVII7", "V/7", "IVmaj7*2", "#iv°7" → editor step { k:'chord', d, a, q, bars, bass? }. */
export function parseNumeral(tok) {
  const m = TOKEN.exec(String(tok).trim());
  if (!m) throw new Error(`bad numeral ${tok}`);
  const [, acc, rn, qs, bAcc, bDeg, bars] = m;
  const upper = rn === rn.toUpperCase();
  const q = (upper ? UPQ : LOWQ)[qs];
  if (!q || !QUALITY[q]) throw new Error(`bad quality ${tok}`);
  const d = RD[rn.toLowerCase()];
  const a = acc === 'b' ? -1 : acc === '#' ? 1 : 0;
  const step = { k: 'chord', d, a, q, bars: bars ? Number(bars) : 1 };
  if (bDeg) {
    const bass = mod12(degSemis(Number(bDeg), bAcc === 'b' ? -1 : bAcc === '#' ? 1 : 0) - degSemis(d, a));
    if (bass) step.bass = bass;
  }
  return step;
}

/** A whole line of numerals → steps. */
export const parseNumerals = (line) => String(line).trim().split(/\s+/).filter(Boolean).map(parseNumeral);

/** Steps of the old Koło progressions ([d, a, q] arrays) as editor steps with 1 bar each. */
const fromArrays = (steps) => steps.map((s) => ({ ...normStep(s), bars: s[3] || 1 }));

/** "4:0:maj|7:0:maj|…": what makes two progressions the same (base triad, repeats collapsed). */
export function signature(steps) {
  const base = (q) => {
    const iv = (QUALITY[q] || QUALITY.maj).iv.map(mod12);
    if (iv.includes(3) && iv.includes(6) && !iv.includes(7)) return 'd';
    if (iv.includes(3) && !iv.includes(4)) return 'm';
    return 'M';
  };
  const out = [];
  for (const s of steps.map(normStep).filter((x) => x && x.k === 'chord')) {
    const t = `${degSemis(s.d, s.a)}:${base(s.q)}`;
    if (out[out.length - 1] !== t) out.push(t);
  }
  return out.join('|');
}

const FAM_MOOD = { podstawy: 'spokojnie, szkolnie', pop: 'popowo', ballada: 'balladowo', rock: 'rockowo', soul: 'soulowo', blues: 'bluesowo', jazz: 'jazzowo', latin: 'latynosko', klasyka: 'klasycznie', balkany: 'bałkańsko', film: 'filmowo' };

function build() {
  const out = [];
  const byBank = Object.fromEntries(BANK.map((b) => [b.id, b]));
  const usedBank = new Set();
  // 1. Koło progressions (with their bank twins)
  for (const p of PROGRESSIONS) {
    const meta = THEORY_META[p.id] || { fam: 'pop', tier: 3, songs: [] };
    const twin = meta.bank && byBank[meta.bank] ? byBank[meta.bank] : null;
    if (twin) usedBank.add(twin.id);
    out.push({
      id: p.id, name: p.name, mode: p.mode, fam: meta.fam, tier: meta.tier, steps: fromArrays(p.steps), mood: p.mood, why: p.why,
      songs: [...(meta.songs || []), ...((twin && BANK_META[twin.id] && BANK_META[twin.id].songs) || [])].filter((x, i, a) => a.indexOf(x) === i),
      jazz: !!(p.jazz || p.seventh === 'all'), ninths: !!p.ninths, theoryId: p.id, bankId: twin ? twin.id : null, alsoBank: [], src: 'kolo',
    });
  }
  // 2. the rest of the bank (skip exact duplicates of what is already there)
  const sigs = new Set(out.map((p) => signature(p.steps)));
  for (const b of BANK) {
    if (usedBank.has(b.id)) continue;
    const steps = parseNumerals(b.rn);
    const sig = signature(steps);
    const dup = sigs.has(sig) && !b.sevenths;
    if (dup) { const same = out.find((p) => signature(p.steps) === sig); if (same && !same.bankId) same.bankId = b.id; else if (same) same.alsoBank.push(b.id); continue; }
    sigs.add(sig);
    const meta = BANK_META[b.id] || {};
    out.push({ id: b.id, name: b.name, mode: b.minor ? 'minor' : 'major', fam: b.fam, tier: b.tier, steps, mood: meta.mood || FAM_MOOD[b.fam], why: b.about, songs: meta.songs || [], jazz: false, ninths: false, theoryId: null, bankId: b.id, alsoBank: [], src: 'bank' });
  }
  // 3. new ones
  for (const [id, fam, tier, name, rn, mood, why, songs] of NEW_PROGRESSIONS) {
    const steps = parseNumerals(rn);
    out.push({ id, name, mode: modeOfNew(steps), fam, tier, steps, mood, why, songs, jazz: false, ninths: false, theoryId: null, bankId: null, alsoBank: [], src: 'new' });
  }
  for (const p of out) {
    p.rn = toNumerals(p.steps);
    const g = PROG_GROOVE[p.id] || FAMILY_GROOVE[p.fam] || ['pop', 90];
    p.groove = g[0]; p.tempo = g[1];
  }
  return out;
}

/** Minor when the tonic chord (degree 1) is minor wherever it appears, else major. */
function modeOfNew(steps) {
  const one = steps.find((s) => s.d === 1 && s.a === 0);
  if (!one) return 'major';
  const iv = QUALITY[one.q].iv.map(mod12);
  return iv.includes(3) && !iv.includes(4) ? 'minor' : 'major';
}

const ROMAN_UP = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** Steps → a compact numeral line (for searching and tests; the screen uses Trener's own numbers). */
export function toNumerals(steps) {
  const back = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
  const UPB = back(UPQ), LOWB = back(LOWQ);
  UPB.maj = ''; LOWB.min = ''; UPB.sus4 = 'sus4';
  return steps.map(normStep).filter((s) => s && s.k === 'chord').map((s) => {
    const iv = QUALITY[s.q].iv.map(mod12);
    const minorish = iv.includes(3) && !iv.includes(4);
    const rn = ROMAN_UP[s.d - 1];
    const acc = s.a < 0 ? 'b' : s.a > 0 ? '#' : '';
    const qs = minorish ? (LOWB[s.q] ?? s.q) : (UPB[s.q] ?? s.q);
    return `${acc}${minorish ? rn.toLowerCase() : rn}${qs}${s.bars && s.bars !== 1 ? `*${s.bars}` : ''}`;
  }).join(' ');
}

export const CATALOG = build();
export const BY_ID = Object.fromEntries(CATALOG.map((p) => [p.id, p]));
export const FAMILIES = Object.keys(FAMILY_INFO);
export { FAMILY_INFO };

/** The entry for an old Koło id or a bank id (or a catalogue id). */
export function progFor(id) {
  return BY_ID[id] || CATALOG.find((p) => p.theoryId === id || p.bankId === id || p.alsoBank.includes(id)) || null;
}

/** Filter the catalogue: { fam, mode, maxTier, minTier, text }. Sorted by level, then name. */
export function filterCatalog({ fam = null, mode = null, maxTier = 99, minTier = 0, text = '' } = {}) {
  const t = text.trim().toLowerCase();
  return CATALOG.filter((p) => (!fam || p.fam === fam) && (!mode || p.mode === mode) && p.tier <= maxTier && p.tier >= minTier
    && (!t || `${p.name} ${p.mood} ${p.songs.join(' ')} ${p.rn}`.toLowerCase().includes(t)))
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'pl'));
}

/** The chords of a progression in a key (chords.stepChords; color 'triads' = as written). */
export function chordsIn(key, steps, { color = 'triads' } = {}) {
  return stepChords(key, steps, { color });
}

/** A key of the right mode: the given one if it fits, else the one with the same tonic, else C / a. */
export function keyFor(prog, key) {
  if (key && key.mode === prog.mode) return key;
  if (key) { const k = keyByTonic(key.tonicPc, prog.mode); if (k) return k; }
  return ALL_KEYS.find((k) => k.mode === prog.mode && k.tonicPc === (prog.mode === 'minor' ? 9 : 0));
}

/** Total length in bars. */
export const barsOf = (steps) => steps.map(normStep).filter((s) => s && (s.k === 'chord' || s.k === 'rest')).reduce((n, s) => n + (s.bars > 0 ? s.bars : 1), 0);

/** A copy of the steps where every chord and rest has its length written out (0 → 1 bar). */
export const withBars = (steps) => steps.map((s) => { const n = normStep(s); if (!n) return null; return n.k === 'chord' || n.k === 'rest' ? { ...n, bars: n.bars > 0 ? n.bars : 1 } : n; }).filter(Boolean);

/** The progressions from the catalogue found in a list of steps (in order, also across the end of the loop). */
export function findInSteps(steps, mode) {
  const s = signature(steps).split('|').filter(Boolean);
  if (!s.length) return [];
  const ring = [...s, ...s];
  const found = [];
  for (const p of CATALOG) {
    if (p.mode !== mode) continue;
    const w = signature(p.steps).split('|');
    if (w.length < 3 || w.length > s.length) continue;
    for (let i = 0; i < s.length; i++) if (w.every((x, j) => ring[i + j] === x)) { found.push(p); break; }
  }
  return found;
}

/** Root pitch class of a step in a key. */
export const rootPcOf = (key, s) => degreeOf(key, s.d, s.a).pc;
