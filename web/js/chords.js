// Chords for the Jam editor and for naming what you play.
// - a large catalogue of chord qualities written as formulas (1 3 5 ♭7 ♭9…), added to theory.QUALITY;
// - editor steps: chord (degree, quality, voicing, slash bass, own intervals), rest, section, text, modulation;
// - suggestions by function (diatonic, sus, secondary dominants, ii/x, vii°/x, tritone subs, borrowed…);
// - recognition of any held notes: name, number in the key, inversion, slash bass, rootless, voicing type,
//   hands, function and where the chord comes from, with the second reading when it is ambiguous;
// - key detection from what you played.
// Pure (tested in node).
import { keySignature } from './midi.js';
import { QUALITY, ALL_KEYS, SCALES, FAMILY, degreeOf, degLabel, spellPc, keyName, keyByTonic, nameInKey, seventhOf, ninthOf, voicing as autoVoicing } from './theory.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 10: 16, 11: 17, 12: 19, 13: 21 };
const ACCV = { bb: -2, b: -1, '': 0, '#': 1 };
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const pretty = (t) => String(t).replace(/bb/g, '𝄫').replace(/b/g, '♭').replace(/#/g, '♯');

/** "1 b3 5 b7 9" → { iv, lt, roles, toks } (roles are plain numbers like the rest of Trener: 3 is the third, minor or major). */
export function parseFormula(f) {
  const toks = Array.isArray(f) ? f : String(f).trim().split(/\s+/);
  const out = { iv: [], lt: [], roles: [], toks: [] };
  for (const tok of toks) {
    const m = /^(bb|b|#)?(\d{1,2})$/.exec(tok);
    if (!m || SEMI[m[2]] == null) continue;
    const n = Number(m[2]);
    out.iv.push(SEMI[n] + ACCV[m[1] || '']);
    out.lt.push(n - 1);
    out.roles.push(String(n));
    out.toks.push(tok);
  }
  return out;
}

// [id, symbol, formula, group]. Existing Trener ids keep their old meaning; new ones are added to QUALITY.
const CAT = [
  ['maj', '', '1 3 5', 'triad'], ['min', 'm', '1 b3 5', 'triad'], ['dim', '°', '1 b3 b5', 'triad'], ['aug', '+', '1 3 #5', 'triad'],
  ['b5', '(♭5)', '1 3 b5', 'triad'],
  ['sus2', 'sus2', '1 2 5', 'sus'], ['sus4', 'sus4', '1 4 5', 'sus'],
  ['maj6', '6', '1 3 5 6', 'add'], ['m6', 'm6', '1 b3 5 6', 'add'], ['add9', 'add9', '1 3 5 9', 'add'], ['madd9', 'm(add9)', '1 b3 5 9', 'add'],
  ['add4', 'add4', '1 3 4 5', 'add'], ['madd4', 'm(add4)', '1 b3 4 5', 'add'], ['six9', '6/9', '1 3 5 6 9', 'add'], ['m69', 'm6/9', '1 b3 5 6 9', 'add'],
  ['maj7', 'maj7', '1 3 5 7', 'sev'], ['dom7', '7', '1 3 5 b7', 'sev'], ['m7', 'm7', '1 b3 5 b7', 'sev'], ['m7b5', 'm7♭5', '1 b3 b5 b7', 'sev'],
  ['dim7', '°7', '1 b3 b5 bb7', 'sev'], ['mmaj7', 'm(maj7)', '1 b3 5 7', 'sev'], ['aug7', '7♯5', '1 3 #5 b7', 'sev'], ['dom7b5', '7♭5', '1 3 b5 b7', 'sev'],
  ['maj7s5', 'maj7♯5', '1 3 #5 7', 'sev'], ['maj7b5', 'maj7♭5', '1 3 b5 7', 'sev'], ['dimmaj7', '°(maj7)', '1 b3 b5 7', 'sev'], ['m7s5', 'm7♯5', '1 b3 #5 b7', 'sev'],
  ['dom7sus4', '7sus4', '1 4 5 b7', 'sus7'], ['dom7sus2', '7sus2', '1 2 5 b7', 'sus7'], ['maj7sus4', 'maj7sus4', '1 4 5 7', 'sus7'], ['maj7sus2', 'maj7sus2', '1 2 5 7', 'sus7'],
  ['maj9', 'maj9', '1 3 5 7 9', 'ext'], ['dom9', '9', '1 3 5 b7 9', 'ext'], ['m9', 'm9', '1 b3 5 b7 9', 'ext'], ['mmaj9', 'm(maj9)', '1 b3 5 7 9', 'ext'],
  ['m9b5', 'm9♭5', '1 b3 b5 b7 9', 'ext'], ['dom9sus4', '9sus4', '1 4 5 b7 9', 'ext'],
  ['dom11', '11', '1 5 b7 9 11', 'ext'], ['m11', 'm11', '1 b3 5 b7 9 11', 'ext'], ['m7add11', 'm7(11)', '1 b3 5 b7 11', 'ext'],
  ['maj7s11', 'maj7♯11', '1 3 5 7 #11', 'ext'], ['maj9s11', 'maj9♯11', '1 3 5 7 9 #11', 'ext'],
  ['dom13', '13', '1 3 5 b7 9 13', 'ext'], ['dom7add13', '7(13)', '1 3 5 b7 13', 'ext'], ['m13', 'm13', '1 b3 5 b7 9 13', 'ext'], ['maj13', 'maj13', '1 3 5 7 9 13', 'ext'],
  ['dom13sus4', '13sus4', '1 4 5 b7 9 13', 'ext'],
  ['dom7b9', '7♭9', '1 3 5 b7 b9', 'alt'], ['dom7s9', '7♯9', '1 3 5 b7 #9', 'alt'], ['dom7s11', '7♯11', '1 3 5 b7 #11', 'alt'], ['dom9s11', '9♯11', '1 3 5 b7 9 #11', 'alt'],
  ['dom7b13', '7♭13', '1 3 5 b7 b13', 'alt'], ['dom13b9', '13♭9', '1 3 5 b7 b9 13', 'alt'], ['dom13s11', '13♯11', '1 3 5 b7 9 #11 13', 'alt'],
  ['dom7b9b13', '7♭9♭13', '1 3 5 b7 b9 b13', 'alt'], ['alt', '7alt', '1 3 b7 #9 b13', 'alt'], ['dom7s5s9', '7♯5♯9', '1 3 #5 b7 #9', 'alt'],
  ['dom7s5b9', '7♯5♭9', '1 3 #5 b7 b9', 'alt'], ['dom7b5b9', '7♭5♭9', '1 3 b5 b7 b9', 'alt'], ['dom7b9s11', '7♭9♯11', '1 3 5 b7 b9 #11', 'alt'],
  ['power', '5', '1 5', 'dyad'], ['dy4', '(4)', '1 4', 'dyad'], ['dy3', '(3)', '1 3', 'dyad'], ['dym3', '(♭3)', '1 b3', 'dyad'], ['dy6', '(6)', '1 6', 'dyad'],
  ['mono', '(1)', '1', 'mono'],
  // augmented sixths, spelled from ♭6 (in C: A♭ C F♯ …); they resolve outward to 5
  ['it6', ' It+6', '1 3 #6', 'chrom'], ['fr6', ' Fr+6', '1 3 #4 #6', 'chrom'], ['ger6', ' Ger+6', '1 3 5 #6', 'chrom'],
];

export const GROUPS = [['triad', 'Trójdźwięki'], ['sus', 'Zawieszone (sus)'], ['add', 'Z dodanym dźwiękiem i seksty'], ['sev', 'Septymowe'], ['sus7', 'Zawieszone septymowe'],
  ['ext', 'Rozszerzone (9, 11, 13)'], ['alt', 'Alterowane dominanty'], ['dyad', 'Dwudźwięki'], ['mono', 'Jeden dźwięk'], ['chrom', 'Zwiększone sekstowe (włoski, francuski, niemiecki)']];

function numOf(sym) {
  if (sym === '5') return '5';
  const m = /^(\d+)(.*)$/.exec(sym);
  return m ? [...m[1]].map((d) => SUP[d]).join('') + m[2] : sym;
}
function baseOf(f) {
  const iv = new Set(f.iv.map(mod12));
  if (iv.has(4)) return 'maj';
  if (iv.has(3) && iv.has(6) && !iv.has(7)) return 'dim';
  if (iv.has(3)) return 'min';
  return 'maj';
}

export const CATALOG = CAT.map(([id, sym, formula, group], idx) => {
  const f = parseFormula(formula);
  const q = QUALITY[id];
  const entry = { id, sym, formula, group, idx, iv: f.iv, roles: f.roles, toks: f.toks, lt: f.lt, base: baseOf(f), pcs: new Set(f.iv.map(mod12)) };
  // essential = what must be heard to call it that: everything but the root (rootless voicings exist) and a natural fifth
  entry.ess = new Set(f.iv.map(mod12).filter((x, k) => x !== 0 && !(f.toks[k] === '5')));
  if (!q) QUALITY[id] = { iv: f.iv, sym, num: numOf(sym), lt: f.lt, roles: f.roles, base: entry.base };
  return entry;
});
export const CAT_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

// --- chords ----------------------------------------------------------------------------------------------------
/** Spelled chord from a root (li, pc) and a quality id or a formula (own intervals). */
export function makeChord(li, pc, quality, formula = null) {
  let q = formula ? null : QUALITY[quality];
  let id = quality;
  let f;
  if (formula) {
    f = parseFormula(formula);
    const hit = matchQuality(new Set(f.iv.map(mod12)), true);
    if (hit) { id = hit.id; q = QUALITY[hit.id]; }
  }
  const iv = f ? f.iv : q.iv;
  const lt = f ? f.lt : (q.lt || [0, 2, 4, 6, 8, 10, 12].slice(0, iv.length));
  const roles = f ? f.roles : (q.roles || ['1', '3', '5', '7', '9', '11', '13'].slice(0, iv.length));
  const tones = iv.map((x, k) => spellPc(li + lt[k], pc + x));
  let sym = q ? q.sym : `(${f.toks.filter((t) => t !== '1').map(pretty).join(' ')})`;
  if (f && !f.toks.includes('1')) sym += ' bez 1';
  return { root: tones[0].pc === mod12(pc) ? tones[0] : spellPc(li, pc), quality: q ? id : 'custom', tones, roles, name: spellPc(li, pc).name + sym, sym, num: q ? (q.num ?? numOf(sym)) : sym, formula: f ? f.toks : null };
}

/** The catalogue entry with exactly this set of semitones above the root (root must be in it if needRoot). */
export function matchQuality(rel, needRoot = true) {
  for (const c of CATALOG) {
    if (c.pcs.size !== rel.size) continue;
    if (needRoot && !rel.has(0)) return null;
    let ok = true;
    for (const x of rel) if (!c.pcs.has(x)) { ok = false; break; }
    if (ok) return c;
  }
  return null;
}

/** Degree (deg 1..7, alt vs the major scale) of a spelled pitch in a key. */
export function degAlt(key, li, pc) {
  const deg = (((li - key.li) % 7) + 7) % 7 + 1;
  const ref = degreeOf(key, deg, 0).pc;
  let alt = mod12(pc - ref);
  if (alt > 6) alt -= 12;
  return { deg, alt };
}

/** Pitch classes and spellings of a scale in a key (scale id from theory.SCALES). */
// scales only for the editor (not in the Koło's scale list)
const EXTRA_SCALES = {
  alterowana: { name: 'alterowana (super-lokrycka)', deg: [[1, 0], [2, -1], [3, -1], [4, -1], [5, -1], [6, -1], [7, -1]] },
  neapolDur: { name: 'neapolitańska durowa', deg: [[1, 0], [2, -1], [3, -1], [4, 0], [5, 0], [6, 0], [7, 0]] },
};
const ALL_SCALES = { ...SCALES, ...EXTRA_SCALES };
export const scaleName = (id) => (ALL_SCALES[id] ? ALL_SCALES[id].name : '');
export function scaleOf(key, scaleId) {
  const sc = ALL_SCALES[scaleId] || SCALES[key.mode === 'minor' ? 'moll' : 'dur'];
  return sc.deg.map(([d, a]) => ({ ...degreeOf(key, d, a), d, a }));
}
export const SEVEN_NOTE_SCALES = Object.entries(ALL_SCALES).filter(([, s]) => s.deg.length === 7 && new Set(s.deg.map(([d]) => d)).size === 7).map(([id, s]) => [id, s.name]);
const MINORISH_IDS = new Set(['moll', 'harm', 'melodyczna', 'dorycka', 'frygijska', 'lokrycka', 'wegierska', 'ukrainska', 'neapolitanska', 'alterowana', 'neapolDur', 'perska']);
export const scaleMode = (id) => (MINORISH_IDS.has(id) ? 'minor' : 'major');

// --- editor steps -------------------------------------------------------------------------------------------------
// chord: { k:'chord', d, a, q, bars, f (own formula), inv, oct, open (tone order), drop (2|3), bass (semitones above root), skip, lock }
// rest: { k:'rest', bars } · section: { k:'sec', label } · text: { k:'text', label } · modulation: { k:'mod', shift, mode }
export function normStep(s) {
  if (Array.isArray(s)) return { k: 'chord', d: s[0], a: s[1] || 0, q: s[2] || 'maj', bars: s[3] || 0 };
  if (!s || typeof s !== 'object') return null;
  return { k: 'chord', a: 0, bars: 0, ...s };
}
export const isMarker = (s) => s && (s.k === 'sec' || s.k === 'text' || s.k === 'mod');

/** Chord object of a chord step in a key (with number, slash bass, own formula). */
export function stepChord(key, s, { color = 'auto', jazz = false, ninths = false } = {}) {
  const r = degreeOf(key, s.d, s.a);
  let q = s.q;
  if (!s.f && !s.lock && (q === 'maj' || q === 'min' || q === 'dim')) {
    const sev = color === 'sevenths' || color === 'ninths' || (color === 'auto' && jazz);
    if (sev) q = seventhOf(q, s.d === 5 && s.a === 0 && q === 'maj');
    if (color === 'ninths' || (color === 'auto' && ninths)) q = ninthOf(q);
  }
  const c = makeChord(r.li, r.pc, QUALITY[q] ? q : 'maj', s.f || null);
  c.number = degLabel(s.d, s.a) + c.num;
  c.deg = s.d; c.alt = s.a;
  if (s.bass != null && mod12(s.bass) !== 0) {
    const bpc = mod12(c.root.pc + s.bass);
    const tone = c.tones.find((t) => t.pc === bpc);
    const sp = tone || nameInKey(key, bpc);
    c.bassPc = bpc;
    c.name += `/${sp.name}`;
    const b = degAlt(key, sp.li, bpc);
    c.number += `/${degLabel(b.deg, b.alt)}`;
  }
  return c;
}

/** Notes of a chosen voicing: inversion × octave, an open order, or drop 2/3. Null = automatic (voice leading). */
export function chosenVoicing(c, s, center = 60) {
  if (Array.isArray(s.vrel) && s.vrel.length) {
    // your own voicing, kept relative to the root so it moves with the key
    let ref = 48; while (mod12(ref) !== c.root.pc) ref++;
    let v = s.vrel.map((x) => ref + x);
    while (v[0] < center - 14) v = v.map((x) => x + 12);
    while (v[0] > center + 8) v = v.map((x) => x - 12);
    return v;
  }
  if (s.inv == null && s.open == null && s.drop == null && !s.oct) return null;
  const pcs = c.tones.map((t) => t.pc);
  const n = pcs.length;
  let order;
  if (Array.isArray(s.open)) order = s.open.filter((i) => i < n).map((i) => pcs[i]);
  else { const inv = (s.inv || 0) % n; order = pcs.slice(inv).concat(pcs.slice(0, inv)); }
  let m = center - 6 + (s.oct || 0) * 12;
  while (mod12(m) !== order[0]) m++;
  const v = [m];
  for (const pc of order.slice(1)) { let x = v[v.length - 1] + 1; while (mod12(x) !== pc) x++; v.push(x); }
  if (s.drop && v.length >= 4) {
    const i = v.length - s.drop;          // 2nd or 3rd from the top goes an octave down
    v[i] -= 12;
    v.sort((a, b) => a - b);
  }
  return v;
}

/** Voicing choices for the Alter → Układ tab. */
export function voicingOptions(c) {
  const n = c.tones.length;
  const out = [];
  const INV = ['zasadnicza', '1. przewrót', '2. przewrót', '3. przewrót', '4. przewrót', '5. przewrót', '6. przewrót'];
  for (const oct of [-1, 0, 1]) for (let inv = 0; inv < Math.min(n, 4); inv++) out.push({ group: 'inv', label: `${INV[inv]}${oct < 0 ? ' ↓' : oct > 0 ? ' ↑' : ''}`, set: { inv, oct, open: null, drop: null } });
  if (n >= 4) for (let inv = 0; inv < Math.min(n, 4); inv++) for (const drop of [2, 3]) out.push({ group: 'drop', label: `drop ${drop} · ${INV[inv]}`, set: { inv, oct: 0, open: null, drop } });
  const idx = [...Array(Math.min(n, 5)).keys()];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const seen = new Set();
  for (const p of perms(idx)) {
    const v = chosenVoicing(c, { open: p });
    if (v[v.length - 1] - v[0] <= 12) continue;     // that is a close position, already listed
    const sig = p.join('');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ group: 'open', label: p.map((i) => c.tones[i].name).join(' '), set: { inv: null, oct: 0, open: p, drop: null }, span: v[v.length - 1] - v[0] });
  }
  return out.filter((o) => o.group !== 'open' || out.filter((x) => x.group === 'open').indexOf(o) < 12);
}

/**
 * Playable chord list of editor steps: markers attach to the next chord, modulations move the key,
 * skipped steps are left out. Returns [{ chord, voicing, bass, bars, rest, labels, key }].
 */
export function stepChords(key, steps, { color = 'auto', jazz = false, ninths = false, prevVoicing = null, lo = 55, hi = 74 } = {}) {
  let k = key;
  let prev = prevVoicing;
  let labels = [];
  const out = [];
  for (const raw of steps || []) {
    const s = normStep(raw);
    if (!s || s.skip) continue;
    if (s.k === 'sec' || s.k === 'text') { labels.push({ k: s.k, label: s.label || '' }); continue; }
    if (s.k === 'mod') {
      const shifted = keyByTonic(k.tonicPc + (s.shift || 0), s.mode || k.mode);
      if (shifted) k = shifted;
      labels.push({ k: 'mod', label: `→ ${keyName(k, true)}` });
      continue;
    }
    if (s.k === 'rest') {
      out.push({ chord: { name: 'pauza', number: '—', tones: [], roles: [], root: null, quality: 'rest' }, voicing: [], bass: null, bars: s.bars || 0, rest: true, labels, key: k });
      labels = [];
      continue;
    }
    const c = stepChord(k, s, { color, jazz, ninths });
    const v = chosenVoicing(c, s, 62) || autoVoicing(c, { prev, center: 66, lo, hi });
    prev = v;
    let b = 36; const bpc = c.bassPc != null ? c.bassPc : c.root.pc;
    while (mod12(b) !== bpc) b++;
    out.push({ chord: c, voicing: v, bass: b, bars: s.bars || 0, rest: false, labels, key: k });
    labels = [];
  }
  if (labels.length && out.length) out[0].labels = [...labels, ...out[0].labels];
  return out;
}

// --- suggestions ---------------------------------------------------------------------------------------------------
/** The chord on scale step i (0..6) stacked in thirds: n tones (3 triad, 4 seventh, 5 ninth…). */
export function stackedChord(key, scaleId, i, n) {
  const sc = scaleOf(key, scaleId);
  const root = sc[i % 7];
  const rel = new Set();
  const toks = [];
  for (let k = 0; k < n; k++) {
    const t = sc[(i + 2 * k) % 7];
    const semis = mod12(t.pc - root.pc);
    rel.add(semis);
    toks.push(semis);
  }
  const hit = matchQuality(rel);
  return hit ? { d: root.d, a: root.a, q: hit.id } : null;
}

/** The plainest spelling of a pitch class (fewest accidentals; flats in flat keys). */
export function simpleSpell(key, pc) {
  let best = null;
  for (let li = 0; li < 7; li++) {
    const sp = spellPc(li, pc);
    if (Math.abs(sp.acc) > 1) continue;
    const sharpKey = keySignature(key).sharps > 0;
    const score = Math.abs(sp.acc) * 10 + (sp.acc !== 0 && (sp.acc > 0) !== sharpKey ? 1 : 0);
    if (!best || score < best.score) best = { ...sp, score };
  }
  return best;
}
const asStep = (key, li, pc, q) => { const da = degAlt(key, li, pc); return { k: 'chord', d: da.deg, a: da.alt, q }; };
const fits = (key, scaleId, c) => { const pcs = new Set(scaleOf(key, scaleId).map((x) => x.pc)); return c.tones.every((t) => pcs.has(t.pc)); };

/** Suggestion groups like Chord Suggester: [{ id, name, items: [{ step, label }] }]. scaleId null = Trener's family. */
export function suggestions(key, scaleId = null) {
  const sid = scaleId || (key.mode === 'minor' ? 'moll' : 'dur');
  const fam = !scaleId ? FAMILY[key.mode].map(([d, a, q]) => ({ d, a, q })) : [0, 1, 2, 3, 4, 5, 6].map((i) => stackedChord(key, sid, i, 3)).filter(Boolean);
  const famSet = scaleId ? sid : null;
  const inScale = (st) => fits(key, famSet || sid, stepChord(key, st, { color: 'triads' })) || (!scaleId && key.mode === 'minor' && st.d === 5 && st.a === 0);
  const groups = [];
  const push = (id, name, items) => { const seen = new Set(); const it = items.filter(Boolean).filter((x) => { const n = stepChord(key, x.step).name; if (seen.has(n)) return false; seen.add(n); return true; }); if (it.length) groups.push({ id, name, items: it }); };
  const item = (step, label) => ({ step: { k: 'chord', lock: 1, ...step }, label });
  push('tri', 'Trójdźwięki z tonacji', fam.map((s) => item(s)));
  const tryQ = (qs) => fam.flatMap((s) => qs.map((q) => { const st = { ...s, q }; return inScale(st) ? item(st) : null; }));
  push('sus', 'Zawieszone (sus)', tryQ(['sus2', 'sus4']));
  const sev = !scaleId ? fam.map((s) => ({ ...s, q: seventhOf(s.q, s.d === 5 && s.a === 0 && s.q === 'maj') })) : [0, 1, 2, 3, 4, 5, 6].map((i) => stackedChord(key, sid, i, 4)).filter(Boolean);
  push('sev', 'Septymowe', sev.map((s) => item(s)));
  push('sus7', 'Zawieszone septymowe', tryQ(['dom7sus4', 'dom7sus2', 'maj7sus4', 'maj7sus2']));
  push('add', 'Z dodanym dźwiękiem', tryQ(['add9', 'madd9', 'maj6', 'm6', 'add4', 'madd4', 'six9', 'm69']));
  const ext = scaleId ? [5, 6, 7].flatMap((n) => [0, 1, 2, 3, 4, 5, 6].map((i) => stackedChord(key, sid, i, n))).filter(Boolean)
    : tryQ(['maj9', 'dom9', 'm9', 'm11', 'dom11', 'dom13', 'm13', 'maj13', 'maj7s11', 'm9b5']).map((x) => x && x.step);
  push('ext', 'Rozszerzone (9, 11, 13)', ext.map((s) => (s ? item(s) : null)));
  // secondaries: targets are the family chords that are not diminished
  const targets = fam.filter((s) => s.q !== 'dim' && !(s.d === 1 && s.a === 0 && key.mode === 'major'));
  const tLabel = (t) => degLabel(t.d, t.a) + (QUALITY[t.q] ? QUALITY[t.q].num : '');
  const rootOf = (t) => degreeOf(key, t.d, t.a);
  const above = (t, letters, semis) => { const r = rootOf(t); return { li: r.li + letters, pc: r.pc + semis }; };
  push('v', 'Dominanty wtórne 5⁷/x', targets.map((t) => { const r = above(t, 4, 7); return item(asStep(key, r.li, r.pc, 'dom7'), `5⁷/${tLabel(t)}`); }));
  push('vv', 'Tercjowe 5⁷/5/x', targets.map((t) => { const r = above(t, 1, 2); return item(asStep(key, r.li, r.pc, 'dom7'), `5⁷/5/${tLabel(t)}`); }));
  push('ii', 'Wtórne 2/x (przygotowanie)', targets.map((t) => { const r = above(t, 1, 2); return item(asStep(key, r.li, r.pc, t.q === 'min' ? 'm7b5' : 'm7'), `2/${tLabel(t)}`); }));
  push('vii', 'Wtórne 7°/x (dźwięk prowadzący)', targets.map((t) => { const r = above(t, 6, 11); return item(asStep(key, r.li, r.pc, 'dim7'), `7°/${tLabel(t)}`); }));
  push('tt', 'Zastępstwo trytonowe', [...targets, { d: 1, a: 0, q: key.mode === 'minor' ? 'min' : 'maj' }].map((t) => { const pc = mod12(rootOf(t).pc + 1); const sp = simpleSpell(key, pc); return item(asStep(key, sp.li, pc, 'dom7'), `sub 5⁷/${tLabel(t)}`); }));
  // borrowed from the parallel key (modal mixture)
  const par = key.mode === 'major' ? 'moll' : 'dur';
  const parChords = [0, 1, 2, 3, 4, 5, 6].map((i) => stackedChord(key, par, i, 3)).filter(Boolean);
  const famNames = new Set(fam.map((s) => stepChord(key, s, { color: 'triads' }).name));
  push('bor', `Pożyczone z ${key.mode === 'major' ? 'molowej' : 'durowej'} (ta sama tonika)`, parChords.filter((s) => !famNames.has(stepChord(key, s, { color: 'triads' }).name)).map((s) => item(s)));
  // other chromatic chords: Neapolitan (♭2 in 1st inversion), augmented sixths on ♭6, cadential 6/4, Picardy third
  const nea = { d: 2, a: -1, q: 'maj', inv: 1 };
  const other = [item(nea, 'N⁶ neapolitański'), item({ d: 6, a: -1, q: 'it6' }, 'It+6 → 5'), item({ d: 6, a: -1, q: 'fr6' }, 'Fr+6 → 5'), item({ d: 6, a: -1, q: 'ger6' }, 'Ger+6 → 5'),
    item({ d: 1, a: 0, q: key.mode === 'minor' ? 'min' : 'maj', inv: 2 }, '1⁶₄ kadencyjny → 5')];
  if (key.mode === 'minor') other.push(item({ d: 1, a: 0, q: 'maj' }, '1 pikardyjska (dur na koniec)'));
  push('chrom', 'Inne chromatyczne', other);
  push('dyad', 'Dwudźwięki (kwinty)', fam.map((s) => item({ ...s, q: 'power' })));
  push('mono', 'Pojedyncze dźwięki', fam.map((s) => item({ ...s, q: 'mono' })));
  return groups;
}

// --- what comes next ---------------------------------------------------------------------------------------------
// usual next steps by degree (family numbers), with a short why; minor keys use their own table
const NEXT = {
  major: { '1': [[4, 0, 'z domu w podróż (S)'], [5, 0, 'od razu napięcie (D)'], [6, 0, 'smutny krewny 1 (T)'], [2, 0, 'przygotowanie do 5']],
    '2': [[5, 0, '2 → 5: krok po kole, w stronę domu'], [7, 0, 'też dominanta, miękko']], '3': [[6, 0, 'kwintę w dół, po kole'], [4, 0, 'krok w górę, łagodnie']],
    '4': [[5, 0, 'S → D: klasyczny ruch'], [1, 0, 'plagalnie, „amen”'], [2, 0, 'krewny 4']], '5': [[1, 0, 'do domu (kadencja autentyczna)'], [6, 0, 'zwodniczo: oczekujesz 1, przychodzi 6m'], [4, 0, 'rockowo, w tył']],
    '6': [[2, 0, 'kwintę w dół, po kole'], [4, 0, 'pop: 6m → 4'], [5, 0, 'od razu do D']], '7': [[1, 0, 'dźwięk prowadzący do domu'], [3, 0, 'kwintę w dół']] },
  minor: { '1': [[4, 0, 'w podróż (S)'], [5, 0, 'napięcie (D)'], [6, -1, 'jasny krewny'], [7, -1, 'krok w dół, epicko']],
    '2': [[5, 0, '2ø → 5: molowe 2–5']], '3': [[6, -1, 'kwintę w dół'], [7, -1, 'krok w dół']], '4': [[5, 0, 'S → D'], [1, 0, 'plagalnie'], [7, -1, 'krok w górę']],
    '5': [[1, 0, 'do domu'], [6, -1, 'zwodniczo']], '6': [[7, -1, 'krok w górę'], [5, 0, 'półtonem w dół do D'], [2, 0, 'kwintę w dół']], '7': [[3, -1, 'kwintę w dół, do jasnego krewnego'], [1, 0, 'w górę do domu']] },
};

/** Suggestions after a chord step: usual next moves, its target if it is a secondary chord, and dominants into each move. */
export function nextMoves(key, step) {
  const s = normStep(step);
  if (!s || s.k !== 'chord') return [];
  const fam = FAMILY[key.mode];
  const famAt = (d, a) => fam.find(([fd, fa]) => fd === d && fa === a);
  const out = [];
  const c = stepChord(key, s);
  const src = sourceOf(key, c.root.pc, CAT_BY_ID[c.quality] || { iv: c.tones.map((t) => mod12(t.pc - c.root.pc)), pcs: new Set(c.tones.map((t) => mod12(t.pc - c.root.pc))) });
  // a secondary chord wants its target first
  if (src.kind === 'sec' || src.kind === 'vii' || src.kind === 'tt') {
    const target = src.kind === 'sec' ? mod12(c.root.pc - 7) : src.kind === 'vii' ? mod12(c.root.pc + 1) : mod12(c.root.pc - 1);
    const f = fam.find(([d, a]) => degreeOf(key, d, a).pc === target);
    if (f) out.push({ step: { k: 'chord', d: f[0], a: f[1], q: f[2] }, label: degLabel(f[0], f[1]) + QUALITY[f[2]].num, why: 'tu ten akord prowadzi' });
  }
  const da = degAlt(key, c.root.li, c.root.pc);
  const tbl = (NEXT[key.mode][String(da.deg)] || []).filter(() => famAt(da.deg, da.alt) || true);
  for (const [d, a, why] of tbl) {
    const f = famAt(d, a);
    if (!f) continue;
    out.push({ step: { k: 'chord', d, a, q: f[2] }, label: degLabel(d, a) + QUALITY[f[2]].num, why });
  }
  // a dominant into each move (5⁷/x) and the chord a fifth down (circle)
  for (const m of out.slice(0, 4)) {
    const r = degreeOf(key, m.step.d, m.step.a);
    if (m.step.q === 'dim') continue;
    const st = asStep(key, r.li + 4, r.pc + 7, 'dom7');
    out.push({ step: st, label: `5⁷/${m.label}`, why: `wtrąć przed ${m.label}, mocniej ciągnie` });
  }
  const downPc = mod12(c.root.pc + 5);
  const fd = fam.find(([d, a]) => degreeOf(key, d, a).pc === downPc);
  const down = fd ? { k: 'chord', d: fd[0], a: fd[1], q: fd[2] } : asStep(key, c.root.li + 3, c.root.pc + 5, 'dom7');
  out.push({ step: down, label: stepChord(key, down).number, why: 'kwintę w dół po kole' });
  const seen = new Set();
  return out.filter((x) => { const n = stepChord(key, x.step).name; if (seen.has(n)) return false; seen.add(n); return true; })
    .map((x) => ({ ...x, step: { lock: 1, ...x.step } }));
}

// --- cadences and classic progressions to insert -----------------------------------------------------------------
export const CADENCES = {
  major: [['Autentyczna 5 → 1', [[5, 0, 'dom7'], [1, 0, 'maj']]], ['Plagalna 4 → 1 („amen”)', [[4, 0, 'maj'], [1, 0, 'maj']]], ['Zwodnicza 5 → 6m', [[5, 0, 'dom7'], [6, 0, 'min']]],
    ['2 → 5 → 1', [[2, 0, 'm7'], [5, 0, 'dom7'], [1, 0, 'maj7']]], ['4 → 5 → 1', [[4, 0, 'maj'], [5, 0, 'maj'], [1, 0, 'maj']]], ['1⁶₄ → 5 → 1', [{ d: 1, a: 0, q: 'maj', inv: 2 }, [5, 0, 'dom7'], [1, 0, 'maj']]],
    ['Molowa plagalna 4m → 1', [[4, 0, 'min'], [1, 0, 'maj']]], ['♭6 → ♭7 → 1 (filmowa)', [[6, -1, 'maj'], [7, -1, 'maj'], [1, 0, 'maj']]], ['Półkadencja → 5', [[2, 0, 'min'], [5, 0, 'maj']]]],
  minor: [['Autentyczna 5 → 1m', [[5, 0, 'dom7'], [1, 0, 'min']]], ['Plagalna 4m → 1m', [[4, 0, 'min'], [1, 0, 'min']]], ['Zwodnicza 5 → ♭6', [[5, 0, 'dom7'], [6, -1, 'maj']]],
    ['2ø → 5 → 1m', [[2, 0, 'm7b5'], [5, 0, 'dom7'], [1, 0, 'min']]], ['Andaluzyjska 1m → ♭7 → ♭6 → 5', [[1, 0, 'min'], [7, -1, 'maj'], [6, -1, 'maj'], [5, 0, 'maj']]],
    ['Neapolitańska N⁶ → 5 → 1m', [{ d: 2, a: -1, q: 'maj', inv: 1 }, [5, 0, 'dom7'], [1, 0, 'min']]], ['Ger+6 → 5 → 1m', [{ d: 6, a: -1, q: 'ger6' }, [5, 0, 'dom7'], [1, 0, 'min']]],
    ['Pikardyjska 5 → 1 (dur)', [[5, 0, 'dom7'], [1, 0, 'maj']]]],
};

// --- keys of a progression -------------------------------------------------------------------------------------------
/** Absolute chords of the steps (root pc, tone pcs), modulations applied. */
function absChords(key, steps) {
  return stepChords(key, steps).filter((e) => !e.rest).map((e) => ({ pcs: new Set(e.chord.tones.map((t) => t.pc).concat(e.chord.bassPc != null ? [e.chord.bassPc] : [])), name: e.chord.name }));
}

/** Scales (tonic × 7-note scale) that hold the chords: all of them first, then the closest. [{ key, scaleId, fit, of }] */
export function matchingScales(key, steps) {
  const chords = absChords(key, steps);
  if (!chords.length) return [];
  const common = ['dur', 'moll', 'harm', 'dorycka', 'miksolidyjska', 'lidyjska', 'frygijska', 'melodyczna'];
  const out = [];
  for (const [id] of SEVEN_NOTE_SCALES) {
    for (let t = 0; t < 12; t++) {
      const k = keyByTonic(t, scaleMode(id));
      if (!k) continue;
      const pcs = new Set(scaleOf(k, id).map((x) => x.pc));
      const fit = chords.filter((c) => [...c.pcs].every((p) => pcs.has(p))).length;
      out.push({ key: k, scaleId: id, fit, of: chords.length, rank: fit * 100 - (common.includes(id) ? common.indexOf(id) : 20) - (t === key.tonicPc ? 0 : 5) });
    }
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 12);
}

/** Steps re-written for another key so the same chords sound (degrees change, sound stays). */
export function rekey(steps, from, to) {
  return steps.map((raw) => {
    const s = normStep(raw);
    if (!s || s.k !== 'chord') return s;
    const r = degreeOf(from, s.d, s.a);
    const n = nameInKey(to, r.pc);
    const da = degAlt(to, n.li, r.pc);
    return { ...s, d: da.deg, a: da.alt };
  });
}

/** Named targets for a modulation, and the chords both keys share (pivots). */
export function modTargets(key) {
  const rel = key.mode === 'major' ? keyByTonic(key.tonicPc + 9, 'minor') : keyByTonic(key.tonicPc + 3, 'major');
  const par = keyByTonic(key.tonicPc, key.mode === 'major' ? 'minor' : 'major');
  return [['równoległa', par], ['relatywna (te same dźwięki)', rel], ['dominanty (kwintę w górę)', keyByTonic(key.tonicPc + 7, key.mode)], ['subdominanty (kwartę w górę)', keyByTonic(key.tonicPc + 5, key.mode)],
    ['o pół tonu w górę', keyByTonic(key.tonicPc + 1, key.mode)], ['o cały ton w górę', keyByTonic(key.tonicPc + 2, key.mode)]].filter(([, k]) => k)
    .map(([name, k]) => ({ name, key: k, shift: mod12(k.tonicPc - key.tonicPc), mode: k.mode }));
}
export function pivots(from, to) {
  const a = FAMILY[from.mode].map(([d, al, q]) => ({ d, a: al, q, c: stepChord(from, { k: 'chord', d, a: al, q }) }));
  const b = FAMILY[to.mode].map(([d, al, q]) => ({ d, a: al, q, c: stepChord(to, { k: 'chord', d, a: al, q }) }));
  return a.filter((x) => b.some((y) => y.c.root.pc === x.c.root.pc && y.q === x.q))
    .map((x) => { const y = b.find((z) => z.c.root.pc === x.c.root.pc && z.q === x.q); return { step: { k: 'chord', d: x.d, a: x.a, q: x.q, lock: 1 }, name: x.c.name, from: x.c.number, to: y.c.number }; });
}

// --- a held chord into a step ------------------------------------------------------------------------------------------
/** What you hold → an editor step with its quality, slash bass and your exact voicing (relative to the root). */
export function heldToStep(notes, key) {
  const r = identify(notes, key);
  if (!r || r.kind !== 'chord') return null;
  const ch = r.chord;
  const da = degAlt(key, ch.root.li, ch.root.pc);
  const step = { k: 'chord', d: da.deg, a: da.alt, q: r.q, lock: 1 };
  const sorted = [...new Set(notes)].sort((x, y) => x - y);
  let upper = sorted;
  if (r.bassPc != null && r.bassPc !== r.rootPc) { step.bass = mod12(r.bassPc - r.rootPc); upper = sorted.slice(1); }
  else if (sorted.length >= 4 && sorted[1] - sorted[0] >= 9) upper = sorted.slice(1);     // the left hand's root: the bass track plays it
  let ref = 48; while (mod12(ref) !== r.rootPc) ref++;
  step.vrel = upper.map((n) => n - ref);
  return { step, name: r.name };
}

/** Scale Degrees: every root of the 12 (♭2, ♭3, ♯4…) × the common qualities. */
export const DEGREE_ROOTS = [[1, 0], [2, -1], [2, 0], [3, -1], [3, 0], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0], [7, -1], [7, 0]];
export const DEGREE_QUALITIES = [['maj', 'Durowe'], ['min', 'Molowe'], ['dom7', 'Dominantowe 7'], ['m7', 'Molowe 7'], ['maj7', 'Wielkie 7 (maj7)'], ['dim', 'Zmniejszone'], ['m7b5', 'Półzmniejszone (ø)'], ['sus4', 'sus4']];
export function degreeGrid(key) {
  return DEGREE_QUALITIES.map(([q, name]) => ({ q, name, items: DEGREE_ROOTS.map(([d, a]) => ({ step: { k: 'chord', d, a, q, lock: 1 } })) }));
}

/** Which tones of a chord are outside the key's scale (for the red marks). */
export function outside(key, c, scaleId = null) {
  const sid = scaleId || (key.mode === 'minor' ? 'harm' : 'dur');
  const pcs = new Set(scaleOf(key, sid).map((x) => x.pc));
  if (!scaleId && key.mode === 'minor') for (const x of scaleOf(key, 'moll')) pcs.add(x.pc);
  return c.tones.map((t) => !pcs.has(t.pc));
}

// --- recognition ------------------------------------------------------------------------------------------------
const INTERVAL = ['pryma', 'sekunda mała', 'sekunda wielka', 'tercja mała', 'tercja wielka', 'kwarta', 'tryton', 'kwinta', 'seksta mała', 'seksta wielka', 'septyma mała', 'septyma wielka'];
const KIND = { maj6: 'durowy z sekstą', m6: 'molowy z sekstą', add9: 'durowy z dodaną noną', madd9: 'molowy z dodaną noną', six9: 'durowy 6/9', mmaj7: 'molowy z wielką septymą', aug7: 'zwiększony dominantowy', dom9: 'dominantowy z noną', maj9: 'wielki septymowy z noną', m9: 'molowy z noną', dom13: 'dominantowy z tercdecymą', dom7sus4: 'dominantowy zawieszony', alt: 'dominanta alterowana', maj: 'durowy', min: 'molowy', dim: 'zmniejszony', aug: 'zwiększony', dom7: 'dominantowy', maj7: 'wielki septymowy', m7: 'molowy septymowy', m7b5: 'półzmniejszony', dim7: 'zmniejszony septymowy', sus2: 'zawieszony (2 zamiast tercji)', sus4: 'zawieszony (4 zamiast tercji)', power: 'kwinta (power chord)' };

function candidates(pcs, bass, key, sid) {
  const scale = new Set(scaleOf(key, sid).map((x) => x.pc));
  const out = [];
  const many = pcs.size >= 3;
  for (let root = 0; root < 12; root++) {
    const rel = new Set([...pcs].map((p) => mod12(p - root)));
    const hasRoot = rel.has(0);
    if (!hasRoot && pcs.size < 4) continue;
    for (const c of CATALOG) {
      if (c.group === 'chrom' || (many && (c.group === 'dyad' || c.group === 'mono'))) continue;
      let ok = true;
      for (const x of rel) if (!c.pcs.has(x)) { ok = false; break; }
      if (!ok) continue;
      for (const e of c.ess) if (!rel.has(e)) { ok = false; break; }
      if (!ok) continue;
      const miss5 = c.pcs.has(7) && !rel.has(7) && c.toks.includes('5');
      let score = 100 - c.idx * 0.15 - (hasRoot ? 0 : 14) - (miss5 ? 1.5 : 0) + (root === bass ? 9 : 0);
      if (scale.has(root)) score += 2;
      if ([...c.pcs].every((x) => scale.has(mod12(root + x)))) score += 2;
      out.push({ root, c, score, hasRoot, miss5 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function spellRoot(key, rootPc, pcs) {
  // spell the root so that the chord's tones read well in the key
  const n = nameInKey(key, rootPc);
  return { li: n.li, pc: rootPc, deg: n.deg, diatonic: n.diatonic };
}

function inversionText(role) {
  return { 1: 'postać zasadnicza', 3: '1. przewrót (tercja w basie)', 5: '2. przewrót (kwinta w basie)', 7: '3. przewrót (septyma w basie)', 6: 'seksta w basie' }[role] || `${role} w basie`;
}

/** Voicing: how the notes lie (close, open, drop 2/3, shell, quartal, cluster), hands, top note, doubled tones. */
export function voicingInfo(notes, roleOf) {
  const v = [...notes].sort((a, b) => a - b);
  const info = { type: [], hands: null, top: roleOf(v[v.length - 1]), doubled: [] };
  // two hands: a gap of a sixth or more, at most 3 notes below it
  let gi = -1; let gap = 0;
  for (let i = 0; i < v.length - 1; i++) if (v[i + 1] - v[i] > gap) { gap = v[i + 1] - v[i]; gi = i; }
  let upper = v;
  if (gap >= 9 && gi <= 2 && v.length - gi - 1 >= 2) { info.hands = { lh: v.slice(0, gi + 1), rh: v.slice(gi + 1) }; upper = info.hands.rh; }
  const pcsU = upper.map(mod12);
  const cnt = {};
  v.forEach((n) => { const r = roleOf(n); cnt[r] = (cnt[r] || 0) + 1; });
  info.doubled = Object.entries(cnt).filter(([, n]) => n > 1).map(([r]) => r);
  const span = upper[upper.length - 1] - upper[0];
  const uniq = new Set(pcsU);
  const CORE = ['1', '3', '5', '7', '6'];
  const corePcs = new Set(upper.filter((n) => CORE.includes(roleOf(n))).map(mod12));   // tensions may sit anywhere
  // close: no tone of this hand could sit between two neighbours (a tension on top may replace the root)
  const closeOf = (arr) => { for (let i = 0; i < arr.length - 1; i++) { if (!CORE.includes(roleOf(arr[i + 1]))) continue; for (let m = arr[i] + 1; m < arr[i + 1]; m++) if (corePcs.has(mod12(m))) return false; } return true; };
  const ints = upper.slice(1).map((n, i) => n - upper[i]);
  const roles = new Set(v.map(roleOf));
  if (uniq.size >= 3 && ints.every((x) => x === 5 || x === 6) && ints.filter((x) => x === 6).length <= 1) info.type.push('kwartowy');
  else if (ints.length >= 2 && ints.filter((x) => x <= 2).length >= 2) info.type.push('klaster (sekundy)');
  else if (upper.length >= 2 && closeOf(upper)) info.type.push('zwarty');
  else if (upper.length === 4 && closeOf([upper[1], upper[2], upper[0] + 12, upper[3]].sort((a, b) => a - b)) && upper[0] + 12 < upper[3] && upper[0] + 12 > upper[2]) info.type.push('drop 2');
  else if (upper.length === 4 && closeOf([upper[1], upper[0] + 12, upper[2], upper[3]].sort((a, b) => a - b)) && upper[0] + 12 < upper[2]) info.type.push('drop 3');
  else if (span > 12) info.type.push('otwarty (rozstrzelony)');
  if (roles.has('3') && roles.has('7') && !roles.has('5') && [...roles].every((r) => r === '1' || r === '3' || r === '7')) info.type.push(roles.has('1') ? 'shell 1–3–7' : 'guide tones 3–7');
  return info;
}

/** Where a chord comes from in a key: family (with T/S/D), secondary dominant, leading tone, tritone sub, borrowed. */
export function sourceOf(key, rootPc, q, scaleId = null) {
  const sid = scaleId || (key.mode === 'minor' ? 'moll' : 'dur');
  const tones = q.iv.map((x) => mod12(rootPc + x));
  const sc = new Set(scaleOf(key, sid).map((x) => x.pc));
  if (key.mode === 'minor' && !scaleId) sc.add(mod12(key.tonicPc + 11));   // the raised 7th of harmonic minor
  if (tones.every((t) => sc.has(t))) return { kind: 'family', text: 'z tonacji' };
  const fam = FAMILY[key.mode].map(([d, a, qq]) => ({ d, a, q: qq, pc: degreeOf(key, d, a).pc }));
  const dom = q.pcs ? q.pcs.has(4) && q.pcs.has(10) : (q.iv.includes(4) && q.iv.includes(10));
  const lab = (t) => degLabel(t.d, t.a) + (QUALITY[t.q] ? QUALITY[t.q].num : '');
  if (dom || q.id === 'maj' || q.base === 'maj') {
    const t = fam.find((x) => x.q !== 'dim' && mod12(x.pc + 7) === rootPc);
    if (t && dom) return { kind: 'sec', text: `dominanta wtórna 5⁷/${lab(t)}: prowadzi do ${lab(t)}` };
    const tt = fam.find((x) => x.q !== 'dim' && mod12(x.pc + 1) === rootPc);
    if (tt && dom) return { kind: 'tt', text: `zastępstwo trytonowe: zamiast 5⁷/${lab(tt)}, schodzi półtonem do ${lab(tt)}` };
    if (dom && mod12(rootPc - key.tonicPc) === 8) return { kind: 'aug6', text: 'na ♭6: brzmi jak niemiecki akord zwiększony sekstowy (Ger+6), rozwiązuje się na 5' };
  }
  if (q.base === 'dim') {
    const t = fam.find((x) => x.q !== 'dim' && mod12(x.pc - 1) === rootPc);
    if (t) return { kind: 'vii', text: `dźwięk prowadzący 7°/${lab(t)}: wchodzi półtonem do ${lab(t)}` };
  }
  const par = new Set(scaleOf(key, key.mode === 'major' ? 'moll' : 'dur').map((x) => x.pc));
  if (tones.every((t) => par.has(t))) {
    const pk = keyByTonic(key.tonicPc, key.mode === 'major' ? 'minor' : 'major');
    return { kind: 'borrowed', text: `pożyczony z ${pk ? keyName(pk, true) : 'równoległej tonacji'}` };
  }
  return { kind: 'chromatic', text: 'spoza tonacji (chromatyczny)' };
}

/**
 * Name held notes in a key. notes: MIDI numbers. Returns null or
 * { kind: 'note'|'interval'|'chord'|'cluster', name, number, detail, lines[], alts[], chord?, rootPc, q, bassPc }.
 */
export function identify(notes, key, { scaleId = null } = {}) {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const sid = scaleId || (key.mode === 'minor' ? 'moll' : 'dur');
  const bass = mod12(sorted[0]);
  const pcs = new Set(sorted.map(mod12));
  if (pcs.size === 1) {
    const n = nameInKey(key, bass);
    return { kind: 'note', name: n.name, number: n.deg, detail: `${n.deg}. stopień w ${keyName(key, true)}${sorted.length > 1 ? ' (w oktawach)' : ''}`, lines: [], alts: [] };
  }
  if (pcs.size === 2) {
    const [a0, b0] = [sorted[0], sorted.find((x) => mod12(x) !== bass)];
    const iv = mod12(b0 - a0);
    const a = nameInKey(key, a0), b = nameInKey(key, b0);
    const alts = iv === 7 ? [`${a.name}5 (power chord)`] : iv === 5 ? [`${b.name}5 (power chord, przewrót)`] : [];
    return { kind: 'interval', name: `${a.name}–${b.name}`, number: `${a.deg}–${b.deg}`, detail: INTERVAL[iv], lines: [], alts };
  }
  let cands = candidates(pcs, bass, key, sid);
  const best0 = cands[0];
  // the bass is not a chord tone of the best reading (a 9th, 11th…) or nothing fits: try "upper chord / bass"
  const coreRole = (cd) => { const k = cd ? cd.c.iv.map(mod12).indexOf(mod12(bass - cd.root)) : -1; return k >= 0 ? cd.c.roles[k] : null; };
  // a lone left-hand bass a sixth or more under the right hand reads as "chord / bass" (C/D, not D9sus4)
  const split = sorted.length >= 4 && sorted[1] - sorted[0] >= 9 && mod12(sorted[1]) !== bass;
  // a plain reading (triad, 7th, 6, add, sus with a chord tone in the bass) is kept; else try "upper chord / bass"
  const hasThird = (cd) => { const k = cd.c.roles.indexOf('3'); return k >= 0 && pcs.has(mod12(cd.root + cd.c.iv[k])); };
  // root in the bass and a third in the chord (G7♭9, C13) is plain too; D under C E G (no third of D) reads C/D
  const plain = best0 && ((['triad', 'sev', 'sus', 'add', 'sus7'].includes(best0.c.group) && ['1', '3', '5', '7'].includes(coreRole(best0)))
    || (coreRole(best0) === '1' && hasThird(best0)));
  if (!plain) {
    const upper = sorted.filter((n) => n !== sorted[0] && mod12(n) !== bass);
    const up = new Set(upper.map(mod12));
    if (up.size >= 3) {
      const uc = candidates(up, mod12(upper[0]), key, sid).filter((x) => x.hasRoot && !x.c.pcs.has(mod12(bass - x.root)))[0];
      if (uc) cands.push({ ...uc, slash: bass, score: uc.score - 3 + (split ? 8 : 0) });
      cands = cands.sort((a, b) => b.score - a.score);
    }
  }
  const best = cands[0];
  if (!best) {
    const names = [...pcs].map((pc) => nameInKey(key, pc).name).join(' ');
    return { kind: 'cluster', name: names, number: '', detail: 'zbitka dźwięków, nie typowy akord', lines: [], alts: [] };
  }
  const build = (cd) => {
    const r = spellRoot(key, cd.root);
    const ch = makeChord(r.li, cd.root, cd.c.id);
    let name = ch.name;
    let number = `${r.deg}${ch.num}`;
    const bpc = cd.slash != null ? cd.slash : bass;
    if (bpc !== cd.root) {
      const tone = ch.tones.find((t) => t.pc === bpc);
      const sp = tone || nameInKey(key, bpc);
      name += `/${sp.name}`;
      number += `/${nameInKey(key, bpc).deg}`;
    }
    if (!cd.hasRoot) name += ' (bez prymy)';
    return { name, number, ch, r };
  };
  const B = build(best);
  const ch = B.ch;
  const roleOfPc = (pc) => { const k = ch.tones.findIndex((t) => t.pc === pc); return k >= 0 ? ch.roles[k] : best.slash != null && pc === best.slash ? 'bas' : '?'; };
  const lines = [];
  const kind = KIND[best.c.id] || `akord ${best.c.sym}`;
  const src = sourceOf(key, best.root, best.c, scaleId);
  const inv = best.slash != null ? `bas ${nameInKey(key, best.slash).name} pod akordem ${ch.name} (akord z basem)` : best.hasRoot ? inversionText(roleOfPc(bass)) : 'bez prymy (rootless): prymę gra bas albo nikt';
  lines.push(inv);
  const vi = voicingInfo(sorted, (n) => roleOfPc(mod12(n)));
  if (vi.type.length) lines.push(`układ: ${vi.type.join(', ')}`);
  if (vi.hands) lines.push(`lewa: ${vi.hands.lh.map((n) => nameInKey(key, mod12(n)).name).join(' ')} · prawa: ${vi.hands.rh.map((n) => nameInKey(key, mod12(n)).name).join(' ')}`);
  lines.push(`na górze: ${vi.top === '1' ? 'pryma' : vi.top === '3' ? 'tercja' : vi.top === '5' ? 'kwinta' : vi.top === '7' ? 'septyma' : vi.top}`);
  if (best.miss5) lines.push('bez kwinty (normalne, kwinta niewiele wnosi)');
  if (vi.doubled.length) lines.push(`podwojone: ${vi.doubled.join(', ')}`);
  lines.push(`dźwięki: ${ch.tones.map((t, i) => `${t.name} (${ch.roles[i]})`).join(' · ')}`);
  const seen = new Set([B.name]);
  const alts = [];
  for (const cd of cands.slice(1)) {
    if (cd.score < best.score - 14 || alts.length >= 2) break;
    const x = build(cd);
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    alts.push(x.name);
  }
  return {
    kind: 'chord', name: B.name, number: B.number, detail: `${kind}, ${src.text}`, lines, alts, src,
    chord: ch, rootPc: best.root, q: best.c.id, bassPc: best.slash != null ? best.slash : bass, rootless: !best.hasRoot, voicing: vi,
  };
}

// --- key detection -------------------------------------------------------------------------------------------
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b) {
  const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}
/** Best keys for a pitch-class histogram (weights per pc). Returns [{ key, r }] best first. */
export function detectKey(hist) {
  const out = [];
  for (const k of ALL_KEYS) {
    const prof = k.mode === 'major' ? KK_MAJ : KK_MIN;
    const rot = [...Array(12).keys()].map((pc) => prof[mod12(pc - k.tonicPc)]);
    out.push({ key: k, r: corr(hist, rot) });
  }
  return out.sort((a, b) => b.r - a.r);
}

// --- a progression as a chord chart (for Piosenki) -----------------------------------------------------------
/** Steps → chart text with sections ("[Zwrotka]") and bar lines ("| C | G Am |"), chords only (rests left out). */
export function stepsToChart(key, steps, barsPerChord = 1) {
  const lines = [];
  let bars = [];       // finished bars of the current line
  let half = [];       // chords sharing the bar being filled
  let fillLeft = 0;
  let k = key;
  const flushLine = () => { if (half.length) { bars.push(half.join(' ')); half = []; fillLeft = 0; } if (bars.length) { lines.push(`| ${bars.join(' | ')} |`); bars = []; } };
  for (const raw of steps) {
    const s = normStep(raw);
    if (!s || s.skip) continue;
    if (s.k === 'sec') { flushLine(); lines.push(`[${s.label || 'Sekcja'}]`); continue; }
    if (s.k === 'text' || s.k === 'rest') continue;
    if (s.k === 'mod') { const kk = keyByTonic(k.tonicPc + (s.shift || 0), s.mode || k.mode); if (kk) k = kk; continue; }
    const name = stepChord(k, s).name;
    const len = s.bars || barsPerChord;
    if (len < 1) {
      if (!half.length) fillLeft = 1;
      half.push(name); fillLeft -= len;
      if (fillLeft <= 1e-9) { bars.push(half.join(' ')); half = []; }
    } else {
      if (half.length) { bars.push(half.join(' ')); half = []; }
      for (let b = 0; b < Math.round(len); b++) bars.push(name);
    }
    if (bars.length >= 4) flushLine();
  }
  flushLine();
  return lines.join('\n');
}
