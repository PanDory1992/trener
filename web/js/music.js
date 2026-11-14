// Music engine: theory, generators and grading. No DOM here, so it is tested in node.

export const BLACK = new Set([1, 3, 6, 8, 10]);
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F, B♭, E♭, A♭, D♭, G♭

import { clickEvents } from './click.js';

export const prefs = { hNames: false };

function polish(name) {
  // Polish/German names: B = H, B♭ = B
  if (!prefs.hNames) return name;
  if (name === 'B') return 'H';
  if (name === 'B♭') return 'B';
  return name;
}

export function pcName(pc, flat = false) {
  return polish((flat ? FLAT : SHARP)[((pc % 12) + 12) % 12]);
}

export function noteName(midi, flat = false, octave = true) {
  const n = pcName(midi % 12, flat);
  return octave ? `${n}${Math.floor(midi / 12) - 1}` : n;
}

export function keyPrefersFlat(rootPc) {
  return FLAT_KEYS.has(((rootPc % 12) + 12) % 12);
}

// --- scales --------------------------------------------------------------------------
export const SCALES = {
  major: { name: 'durowa', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: 'molowa naturalna', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonic: { name: 'molowa harmoniczna', steps: [0, 2, 3, 5, 7, 8, 11] },
  pentaMajor: { name: 'pentatonika durowa', steps: [0, 2, 4, 7, 9] },
  pentaMinor: { name: 'pentatonika molowa', steps: [0, 3, 5, 7, 10] },
  dorian: { name: 'dorycka', steps: [0, 2, 3, 5, 7, 9, 10] },
  hijaz: { name: 'Hidżaz (frygijska dominantowa)', steps: [0, 1, 4, 5, 7, 8, 10] },
  hungarian: { name: 'węgierska molowa', steps: [0, 2, 3, 6, 7, 8, 11] },
  doubleHarmonic: { name: 'podwójnie harmoniczna', steps: [0, 1, 4, 5, 7, 8, 11] },
  blues: { name: 'bluesowa', steps: [0, 3, 5, 6, 7, 10] },
};
export const BALKAN = ['hijaz', 'hungarian', 'doubleHarmonic'];

/** All MIDI notes of a scale between lo and hi. */
export function scaleNotes(rootPc, scaleKey, lo, hi) {
  const steps = SCALES[scaleKey].steps;
  const out = [];
  for (let m = lo; m <= hi; m++) {
    if (steps.includes((((m - rootPc) % 12) + 12) % 12)) out.push(m);
  }
  return out;
}

// --- random with a seed (repeatable exercises, testable) ----------------------------------
export function rng(seed = Date.now()) {
  let s = (seed >>> 0) || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  next.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

// --- difficulty: weighted staircase that settles where you pass ~80 % ---------------------
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 12;
export const STEP_UP = 0.25;
export const STEP_DOWN = 1.0; // 1.0 / 0.25 = 4 → equilibrium at 4 passes per failure = 80 %

export function nextLevel(level, passed) {
  const next = passed ? level + STEP_UP : level - STEP_DOWN;
  return Math.round(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, next)) * 100) / 100;
}

// --- shared: velocities -----------------------------------------------------------------------
export const DYN = { pp: 32, p: 48, mp: 62, mf: 76, f: 94, ff: 110 };

// --- 1. echo motifs ------------------------------------------------------------------------------
const RHYTHMS = {
  // patterns in beats, summing to 1 or 2 beats
  basic: [[1]],
  eighths: [[1], [0.5, 0.5]],
  dotted: [[1], [0.5, 0.5], [1.5, 0.5], [2]],
  sync: [[1], [0.5, 0.5], [1.5, 0.5], [0.5, 1, 0.5], [0.75, 0.25]],
};

const clampL = (x) => Math.max(1, Math.min(12, Number(x) || 1));

/**
 * Motif for the echo trainer. level: 1..12, or the axes {melodia, rytm, dynamika} (since 1.10).
 *   melodia: scale, pool of notes, length, leaps;  rytm: rhythms and tempo;  dynamika: the loudness shapes.
 * opts.preferBlack: keys whose scales live on black keys (practising quiet black keys).
 * opts.focus: 'all' | 'melodia' | 'rytm' | 'dynamika': the other axes stay easy, only this one is tested.
 * opts.hand: 'right' (around middle C) | 'left' (an octave lower).
 */
export function echoMotif(level, seed, opts = {}) {
  const r = rng(seed);
  const ax = typeof level === 'object' && level ? level : { melodia: level, rytm: level, dynamika: level };
  const focus = opts.focus || 'all';
  let L = clampL(ax.melodia);           // melody
  let R = clampL(ax.rytm ?? ax.melodia); // rhythm
  const D = clampL(ax.dynamika ?? ax.melodia);
  if (focus === 'rytm' || focus === 'dynamika') L = Math.min(L, 3);
  if (focus === 'melodia' || focus === 'dynamika') R = Math.min(R, focus === 'melodia' ? 1 : 2);
  let scale = 'major';
  let rootPc = 0;
  let pool;
  if (L >= 8) scale = r.pick(BALKAN);
  else if (L >= 6.5) scale = r.pick(['minor', 'harmonic', 'dorian']);
  if (L >= 4) rootPc = r.pick([0, 2, 5, 7, 9, 10, 3]);
  if (opts.preferBlack) { rootPc = r.pick([6, 1, 3]); scale = L >= 8 ? scale : 'pentaMajor'; }
  const base = (opts.hand === 'left' ? 48 : 60) + rootPc - (rootPc > 6 ? 12 : 0);
  const all = scaleNotes(rootPc, scale, base, base + 12);
  if (L < 2) pool = [all[0]];
  else if (L < 3.5) pool = all.slice(0, 3);
  else if (L < 5) pool = all.slice(0, 5);
  else pool = all;
  if (opts.preferBlack) pool = all.filter((m) => BLACK.has(m % 12)).slice(0, Math.max(2, pool.length));
  const length = Math.min(8, 3 + Math.floor((focus === 'rytm' ? clampL(ax.rytm) : L) / 2));
  const rhythmSet = R < 3 ? RHYTHMS.basic : R < 5 ? RHYTHMS.eighths : R < 7 ? RHYTHMS.dotted : RHYTHMS.sync;
  const leapChance = L < 4 ? 0 : L < 7 ? 0.2 : 0.35;
  const withDynamics = focus === 'dynamika' || (focus === 'all' && Math.min(L, R) >= 5.5);
  const tempo = Math.round(66 + R * 4);
  // durations
  const durs = [];
  while (durs.length < length) for (const d of r.pick(rhythmSet)) if (durs.length < length) durs.push(d);
  durs[durs.length - 1] = Math.max(1, durs[durs.length - 1]);
  // pitches: stepwise walk inside the pool
  let idx = Math.floor(pool.length / 2);
  if (L < 2) idx = 0;
  const notes = [];
  for (let i = 0; i < length; i++) {
    if (i > 0 && pool.length > 1) {
      const step = r.chance(leapChance) ? r.int(2, 3) : 1;
      const dir = r.chance(0.5) ? 1 : -1;
      idx = Math.min(pool.length - 1, Math.max(0, idx + dir * step));
    }
    notes.push({ p: pool[idx], dur: durs[i], v: DYN.mf });
  }
  if (withDynamics) {
    const shapes = D < 4 ? ['cresc', 'dim'] : ['cresc', 'dim', 'accent1', 'terrace'];
    const shape = r.pick(shapes);
    const n = notes.length;
    notes.forEach((nt, i) => {
      if (shape === 'cresc') nt.v = Math.round(DYN.p + (DYN.f - DYN.p) * (i / (n - 1)));
      else if (shape === 'dim') nt.v = Math.round(DYN.f - (DYN.f - DYN.p) * (i / (n - 1)));
      else if (shape === 'accent1') nt.v = i % 2 === 0 ? DYN.f : DYN.p;
      else nt.v = i < n / 2 ? DYN.p : DYN.f;
    });
  }
  const tested = focus === 'all' ? ['melodia', 'rytm', ...(withDynamics ? ['dynamika'] : [])] : [focus];
  return { kind: 'motif', level: L, scale, rootPc, tempo, notes, withDynamics, flat: keyPrefersFlat(rootPc), focus, hand: opts.hand || 'right', tested };
}

/** The same motif, easier: slower (the error loop's "simplify" step). */
export function easierMotif(m) {
  return { ...m, tempo: Math.max(50, Math.round(m.tempo * 0.8)), easy: true };
}

/** Times (in beats) at which the notes of a motif start. */
export function onsetsBeats(notes) {
  let t = 0;
  return notes.map((n) => { const s = t; t += n.dur; return s; });
}

/** Events for /api/play: count-in clicks + the motif. Returns {events, seconds, starts}. */
export function motifEvents(motif, { countIn = 2, clickNote = 96, gain = 1 } = {}) {
  const beat = 60 / motif.tempo;
  const events = [];
  for (let i = 0; i < countIn; i++) {
    events.push(...clickEvents(i * beat, Math.round(36 * gain), i === 0, 0.08, clickNote));
  }
  const startAt = countIn * beat;
  const on = onsetsBeats(motif.notes);
  const starts = [];
  motif.notes.forEach((n, i) => {
    const t = startAt + on[i] * beat;
    starts.push(t);
    const len = Math.max(0.12, n.dur * beat * 0.9);
    events.push({ t, m: [0x90, n.p, Math.max(1, Math.min(127, Math.round(n.v * gain)))] });
    events.push({ t: t + len, m: [0x80, n.p, 0] });
  });
  const total = on[on.length - 1] + motif.notes[motif.notes.length - 1].dur;
  return { events, seconds: startAt + total * beat, starts, beat };
}

function mean(a) { return a.reduce((s, x) => s + x, 0) / (a.length || 1); }
function std(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }
export function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 1;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  if (da === 0 && db === 0) return 1;
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/**
 * Best tempo fit: user onsets (s, relative to their first) vs expected (beats).
 * Returns {secPerBeat, devBeats[]} with deviations in beats after the fit.
 */
export function fitRhythm(expectedBeats, userSec) {
  const n = Math.min(expectedBeats.length, userSec.length);
  if (n < 2) return { secPerBeat: null, devBeats: [0] };
  const e = expectedBeats.slice(0, n).map((x) => x - expectedBeats[0]);
  const u = userSec.slice(0, n).map((x) => x - userSec[0]);
  // least squares through the origin: u ≈ k·e
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += e[i] * u[i]; den += e[i] * e[i]; }
  const k = den > 0 ? num / den : 0.5;
  return { secPerBeat: k, devBeats: u.map((x, i) => (x / k) - e[i]) };
}

/**
 * A stray note before the real attempt (a brushed key) must not shift everything.
 * If there are more notes than expected, keep the window that matches the pitches best.
 */
export function alignAttempt(want, got) {
  if (got.length <= want.length) return { aligned: got, skipped: 0 };
  let best = 0, bestScore = -1;
  for (let k = 0; k <= got.length - want.length; k++) {
    let sc = 0;
    for (let i = 0; i < want.length; i++) if (got[k + i].p === want[i].p) sc++;
    if (sc > bestScore) { bestScore = sc; best = k; }
  }
  return { aligned: got.slice(best, best + want.length), skipped: best };
}

/** Grade an echo attempt. attempt: [{p, ts, v}] user note-ons in order. */
export function gradeEcho(motif, attempt) {
  const want = motif.notes;
  const al = alignAttempt(want, attempt.slice(0, want.length + 4));
  const extraTotal = Math.max(0, attempt.length - want.length);
  const got = al.aligned;
  const perNote = want.map((w, i) => ({
    want: w.p, got: got[i] ? got[i].p : null, ok: !!got[i] && got[i].p === w.p,
    wantV: w.v, gotV: got[i] ? got[i].v : null,
  }));
  const pitchOk = got.length === want.length && perNote.every((x) => x.ok) && extraTotal <= 1;
  const pitchScore = Math.round(100 * perNote.filter((x) => x.ok).length / want.length);
  // rhythm
  let rhythmOk = true;
  let rhythmErr = 0;
  let tempoRatio = 1;
  let devBeats = [];
  if (want.length >= 2 && got.length >= 2) {
    const fit = fitRhythm(onsetsBeats(want), got.map((g) => g.ts));
    devBeats = fit.devBeats;
    rhythmErr = mean(devBeats.map(Math.abs));
    const maxErr = Math.max(...devBeats.map(Math.abs));
    tempoRatio = fit.secPerBeat ? (60 / motif.tempo) / fit.secPerBeat : 1;
    rhythmOk = rhythmErr <= 0.12 && maxErr <= 0.3 && got.length >= want.length;
  } else if (got.length < want.length) rhythmOk = false;
  const rhythmScore = Math.max(0, Math.round(100 - rhythmErr * 400));
  // dynamics
  let dynOk = true;
  let dyn = null;
  if (motif.withDynamics && got.length >= 2) {
    const tv = want.map((w) => w.v);
    const uv = want.map((_, i) => (got[i] ? got[i].v : 0));
    dyn = gradeDynamicsArrays(tv, uv);
    dynOk = dyn.ok;
  }
  const passed = pitchOk && rhythmOk && dynOk;
  // 0–100 per axis (since 1.10): the level moves in proportion; 80 ≈ the old "ok"
  const okCount = perNote.filter((x) => x.ok).length;
  const melodia = Math.max(0, Math.round(100 * (okCount / want.length) ** 2 - 8 * Math.max(0, extraTotal - 1)));
  const maxDev = devBeats.length ? Math.max(...devBeats.map(Math.abs)) : 0;
  let rytm = got.length >= 2 ? Math.round(Math.max(0, Math.min(100, 100 - (rhythmErr / 0.12) * 20))) : 0;
  if (maxDev > 0.3) rytm = Math.min(rytm, 75);
  if (got.length < want.length) rytm = Math.round(rytm * got.length / want.length);
  const scores = { melodia, rytm, dynamika: motif.withDynamics ? (dyn ? dyn.score : 0) : null };
  const res = { passed, pitchOk, pitchScore, rhythmOk, rhythmScore, rhythmErr, tempoRatio, devBeats, dynOk, dyn, perNote, extra: extraTotal, skipped: al.skipped, aligned: got, scores };
  res.tip = echoTip(motif, res);
  return res;
}

const BEAT_WORD = (d) => (d >= 0.4 ? 'o pół uderzenia' : d >= 0.2 ? 'o ćwierć uderzenia' : 'trochę');

/** One concrete piece of advice about the attempt: {kind, text, mark?} (kind null = praise, not counted). */
export function echoTip(motif, g) {
  const want = motif.notes;
  const got = g.aligned;
  if (got.length < want.length) return { kind: 'count', text: `Zagrałeś ${got.length} z ${want.length} dźwięków. Posłuchaj jeszcze raz do końca.` };
  const wrong = g.perNote.findIndex((x) => !x.ok);
  if (wrong >= 0) {
    const w = g.perNote[wrong];
    const dir = w.got > w.want ? 'za wysoko' : 'za nisko';
    return { kind: 'pitch', text: `${wrong + 1}. dźwięk: ${noteName(w.want, motif.flat, false)}, a nie ${noteName(w.got, motif.flat, false)} (${dir}).`, mark: [{ note: w.want, text: String(wrong + 1) }] };
  }
  if (!g.rhythmOk) {
    if (g.tempoRatio > 1.12) return { kind: 'tempo', text: `Grasz o ${Math.round((g.tempoRatio - 1) * 100)}% szybciej niż wzór. Policz w głowie 1, 2 przed startem.` };
    if (g.tempoRatio < 0.88) return { kind: 'tempo', text: `Grasz o ${Math.round((1 - g.tempoRatio) * 100)}% wolniej niż wzór.` };
    let k = 0;
    g.devBeats.forEach((d, i) => { if (Math.abs(d) > Math.abs(g.devBeats[k])) k = i; });
    const d = g.devBeats[k];
    return { kind: d < 0 ? 'early' : 'late', text: `${k + 1}. dźwięk ${d < 0 ? 'za wcześnie' : 'za późno'}, ${BEAT_WORD(Math.abs(d))}. Najdłuższe nuty trzymaj do końca.` };
  }
  if (motif.withDynamics && !g.dynOk && g.dyn) return { kind: 'dyn', text: g.dyn.tips[0] };
  // right notes, even rhythm, but in another tempo: not a miss, still worth saying
  if (g.tempoRatio > 1.12) return { kind: 'tempo', text: `Równo, ale o ${Math.round((g.tempoRatio - 1) * 100)}% szybciej niż wzór.` };
  if (g.tempoRatio < 0.88) return { kind: 'tempo', text: `Równo, ale o ${Math.round((1 - g.tempoRatio) * 100)}% wolniej niż wzór.` };
  return { kind: null, text: g.rhythmErr < 0.05 ? 'Równo jak metronom.' : 'Czysto i w rytmie.' };
}

// --- 6. dynamics -----------------------------------------------------------------------------------
export const SHAPES = {
  cresc: 'crescendo (coraz głośniej)',
  dim: 'diminuendo (coraz ciszej)',
  hairpin: 'fala: głośniej, potem ciszej',
  valley: 'dolina: ciszej, potem głośniej',
  terrace: 'tarasy: cicho, potem nagle głośno',
  accents: 'akcenty na mocnych częściach',
  accentCresc: 'akcenty w crescendo',
};

export function dynamicsPhrase(level, seed) {
  const r = rng(seed);
  const L = Math.max(1, Math.min(12, level));
  const n = Math.min(12, 6 + Math.floor(L / 2));
  const shapes = L < 3 ? ['cresc', 'dim'] : L < 5 ? ['cresc', 'dim', 'hairpin', 'valley'] : L < 7 ? ['hairpin', 'valley', 'terrace', 'accents'] : ['terrace', 'accents', 'accentCresc', 'hairpin', 'valley'];
  const shape = r.pick(shapes);
  // a bit narrower at high levels (finer control), but never under ~3 of the Keystation's ~9 distinct loudness steps
  const lo = L < 7 ? DYN.p : DYN.p + 4;
  const hi = L < 7 ? DYN.f + 6 : DYN.f;
  const rootPc = r.pick([0, 2, 5, 7]);
  const pool = scaleNotes(rootPc, 'major', 60 + rootPc - (rootPc > 6 ? 12 : 0), 72 + rootPc);
  const pattern = r.pick(['up', 'updown', 'repeat']);
  const notes = [];
  for (let i = 0; i < n; i++) {
    let p;
    if (pattern === 'up') p = pool[i % 5];
    else if (pattern === 'repeat') p = pool[[0, 2, 4, 2][i % 4]];
    else p = pool[[0, 1, 2, 3, 4, 3, 2, 1][i % 8]];
    const x = n > 1 ? i / (n - 1) : 0;
    let v;
    if (shape === 'cresc') v = lo + (hi - lo) * x;
    else if (shape === 'dim') v = hi - (hi - lo) * x;
    else if (shape === 'hairpin') v = lo + (hi - lo) * (1 - Math.abs(2 * x - 1));
    else if (shape === 'valley') v = hi - (hi - lo) * (1 - Math.abs(2 * x - 1));
    else if (shape === 'terrace') v = i < n / 2 ? lo : hi;
    else if (shape === 'accents') v = i % 4 === 0 ? hi : lo + (hi - lo) * 0.25;
    else v = (i % 4 === 0 ? 14 : 0) + lo + (hi - lo - 14) * x;
    notes.push({ p, dur: 0.5, v: Math.round(v) });
  }
  return { kind: 'dynamics', level: L, shape, tempo: 84, notes, rootPc, flat: keyPrefersFlat(rootPc), withDynamics: true };
}

export function gradeDynamicsArrays(target, user) {
  const n = Math.min(target.length, user.length);
  const t = target.slice(0, n), u = user.slice(0, n);
  const r = pearson(t, u);
  const levelDiff = mean(u) - mean(t);
  const st = std(t), su = std(u);
  const range = st > 0 ? su / st : 1;
  const flatTarget = st < 3;
  // tolerances fit the Keystation (since 1.10): it tells apart only ~9 loudness steps (~14 velocity units)
  const shapeOk = flatTarget ? su < 12 : r >= 0.75;
  const levelOk = Math.abs(levelDiff) <= 22;
  const rangeOk = flatTarget ? true : range >= 0.5 && range <= 1.9;
  const ok = shapeOk && levelOk && rangeOk;
  const score = Math.max(0, Math.round(
    (flatTarget ? 60 : 60 * Math.max(0, r)) + 25 * Math.max(0, 1 - Math.abs(levelDiff) / 40) + 15 * Math.max(0, 1 - Math.abs(Math.log(Math.max(range, 0.01)))),
  ));
  const tips = [];
  if (!shapeOk) tips.push('Kształt jeszcze nie ten: posłuchaj, gdzie fraza rośnie, a gdzie opada.');
  if (!levelOk) tips.push(levelDiff > 0 ? `Całość o ${Math.round(levelDiff)} za głośno.` : `Całość o ${Math.round(-levelDiff)} za cicho.`);
  if (!rangeOk) tips.push(range < 1 ? 'Różnice między cicho a głośno za małe: odważniej.' : 'Różnice za duże: łagodniej.');
  if (ok) tips.push(r > 0.92 ? 'Kształt prawie idealny.' : 'Dobrze złapany kształt.');
  const tip = !shapeOk ? { kind: 'shape', text: tips[0] }
    : !levelOk ? { kind: levelDiff > 0 ? 'loud' : 'soft', text: tips[0] }
      : !rangeOk ? { kind: range < 1 ? 'flat' : 'sharp', text: tips[0] }
        : { kind: null, text: tips[tips.length - 1] };
  return { ok, r, levelDiff, range, score, tips, tip };
}

/**
 * A black key that came in as raw velocity 1 fell into the Keystation's black-key hole: its loudness is unknown,
 * so it is left out of the comparison instead of counting as "too quiet".
 */
export function gradeDynamics(phrase, all) {
  const attempt = alignAttempt(phrase.notes, all).aligned;
  const t = phrase.notes.map((x) => x.v);
  const u = phrase.notes.map((_, i) => (attempt[i] ? attempt[i].v : 0));
  const known = phrase.notes.map((_, i) => !(attempt[i] && attempt[i].raw === 1 && BLACK.has(attempt[i].p % 12)));
  const res = gradeDynamicsArrays(t.filter((_, i) => known[i]), u.filter((_, i) => known[i]));
  const pitchMatches = phrase.notes.filter((x, i) => attempt[i] && attempt[i].p === x.p).length;
  const complete = attempt.length >= phrase.notes.length;
  const score = complete ? res.score : Math.round(res.score * attempt.length / phrase.notes.length);
  const tip = complete ? res.tip : { kind: 'count', text: `Zagrałeś ${attempt.length} z ${phrase.notes.length} dźwięków.` };
  return { ...res, score, tip, ok: res.ok && complete, passed: res.ok && complete, complete, pitchMatches, target: t, user: u, unknown: known.filter((k) => !k).length };
}

// --- 4. chords --------------------------------------------------------------------------------------
export const CHORDS = {
  maj: { sym: '', name: 'durowy', iv: [0, 4, 7] },
  min: { sym: 'm', name: 'molowy', iv: [0, 3, 7] },
  dim: { sym: '°', name: 'zmniejszony', iv: [0, 3, 6] },
  maj7: { sym: 'maj7', name: 'wielki septymowy', iv: [0, 4, 7, 11] },
  m7: { sym: 'm7', name: 'molowy septymowy', iv: [0, 3, 7, 10] },
  dom7: { sym: '7', name: 'dominantowy', iv: [0, 4, 7, 10] },
  m7b5: { sym: 'm7♭5', name: 'półzmniejszony', iv: [0, 3, 6, 10] },
  mMaj7: { sym: 'm(maj7)', name: 'molowy z wielką septymą', iv: [0, 3, 7, 11] },
};

export const PROGRESSIONS = {
  pop: { name: 'Pop: I–V–vi–IV', sevenths: false, mode: 'major', chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
  fifties: { name: 'Lata 50.: I–vi–IV–V', sevenths: false, mode: 'major', chords: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']] },
  balkan: { name: 'Bałkańska: i–iv–V–i', sevenths: false, mode: 'minor', chords: [[0, 'min'], [5, 'min'], [7, 'maj'], [0, 'min']] },
  twoFiveOne: { name: 'Jazz: ii–V–I', sevenths: true, mode: 'major', chords: [[2, 'm7'], [7, 'dom7'], [0, 'maj7'], [0, 'maj7']] },
  minorTwoFive: { name: 'Jazz molowy: iiø–V–i', sevenths: true, mode: 'minor', chords: [[2, 'm7b5'], [7, 'dom7'], [0, 'm7'], [0, 'm7']] },
  rhythm: { name: 'Turnaround: I–vi–ii–V', sevenths: true, mode: 'major', chords: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']] },
  blues: { name: 'Blues 12 taktów', sevenths: true, mode: 'major', chords: [[0, 'dom7'], [5, 'dom7'], [0, 'dom7'], [0, 'dom7'], [5, 'dom7'], [5, 'dom7'], [0, 'dom7'], [0, 'dom7'], [7, 'dom7'], [5, 'dom7'], [0, 'dom7'], [7, 'dom7']] },
};

export const VOICING_STYLES = {
  any: { name: 'Dowolny układ', help: 'Wszystkie dźwięki akordu, w dowolnej kolejności i oktawie. W akordach septymowych kwintę możesz pominąć.' },
  rootBass: { name: 'Pryma w basie', help: 'Jak wyżej, ale najniższy dźwięk to pryma (nazwa akordu).' },
  shell: { name: 'Shell (1–3–7)', help: 'Tylko pryma, tercja i septyma. Pryma na dole. Tak gra lewa ręka w jazzie.' },
  rootless: { name: 'Bez prymy', help: 'Tercja i septyma, do tego kwinta lub nona. Bez prymy: gra ją basista.' },
};

export function chordPcs(rootPc, type) {
  return CHORDS[type].iv.map((i) => (rootPc + i) % 12);
}

export function chordSymbol(rootPc, type, flat) {
  return pcName(rootPc, flat) + CHORDS[type].sym;
}

/** Role of a pitch class in a chord: '1','3','5','7' or tension '9','11','13', or null. */
export function roleIn(pc, rootPc, type) {
  const iv = (((pc - rootPc) % 12) + 12) % 12;
  const ivs = CHORDS[type].iv;
  const labels = ['1', '3', '5', '7'];
  const k = ivs.indexOf(iv);
  if (k >= 0) return labels[k];
  if (iv === 2 || iv === 1 || iv === 3) return '9';
  if (iv === 5 || iv === 6) return '11';
  if (iv === 9 || iv === 8) return '13';
  return null;
}

/** Check a played chord (MIDI notes held together) against a target. */
export function checkChord(notes, rootPc, type, style = 'any') {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const pcs = new Set(sorted.map((n) => n % 12));
  const need = chordPcs(rootPc, type);
  const third = need[1], fifth = need[2], seventh = need[3];
  const isSeventh = need.length === 4;
  const bass = sorted.length ? sorted[0] % 12 : null;
  const extra = [...pcs].filter((pc) => !need.includes(pc));
  let required;
  let allowed;
  let bassRule = null;
  if (style === 'shell') {
    required = isSeventh ? [rootPc, third, seventh] : [rootPc, third];
    allowed = new Set(required);
    bassRule = rootPc;
  } else if (style === 'rootless') {
    required = isSeventh ? [third, seventh] : [third, fifth];
    const ninth = (rootPc + 2) % 12;
    allowed = new Set([third, fifth, seventh, ninth].filter((x) => x !== undefined));
    if (pcs.has(rootPc)) extra.push(rootPc);
  } else {
    required = isSeventh ? [rootPc, third, seventh] : [rootPc, third, fifth];
    allowed = new Set(isSeventh ? [...need, (rootPc + 2) % 12] : need);
    if (style === 'rootBass') bassRule = rootPc;
  }
  const missing = required.filter((pc) => !pcs.has(pc));
  const wrong = [...pcs].filter((pc) => !allowed.has(pc));
  const bassOk = bassRule === null || bass === bassRule;
  const ok = sorted.length >= 2 && missing.length === 0 && wrong.length === 0 && bassOk;
  return { ok, missing, wrong, bassOk, notes: sorted, extra: [...new Set(extra)] };
}

/** Finger movement between two voicings: each new note to its nearest old note, in semitones. */
export function movement(prev, next) {
  if (!prev || !prev.length || !next.length) return null;
  return next.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(p - n))), 0);
}

/** A reference voicing near middle C (for "Posłuchaj" and hints). */
export function referenceVoicing(rootPc, type, style = 'any', prev = null) {
  const pcs = chordPcs(rootPc, type);
  const isSeventh = pcs.length === 4;
  let set;
  if (style === 'shell') set = isSeventh ? [pcs[0], pcs[1], pcs[3]] : [pcs[0], pcs[1]];
  else if (style === 'rootless') set = isSeventh ? [pcs[1], pcs[2], pcs[3], (rootPc + 2) % 12] : [pcs[1], pcs[2]];
  else set = pcs;
  // try all rotations in octave 3–5, keep the one closest to prev (or to E4)
  let best = null;
  for (let base = 48; base <= 60; base++) {
    const v = [];
    let last = base - 1;
    for (const pc of rotate(set, base)) {
      let m = last + 1;
      while (m % 12 !== pc) m++;
      v.push(m);
      last = m;
    }
    if (style === 'shell' || style === 'rootBass') {
      if (v[0] % 12 !== rootPc) continue;
    }
    const cost = prev && prev.length ? movement(prev, v) : Math.abs(mean(v) - 64);
    if (!best || cost < best.cost) best = { v, cost };
  }
  if (style === 'shell' && best) best.v[0] -= 12; // root an octave lower, like a left hand
  return best ? best.v : [];
}

function rotate(set, base) {
  // start the voicing from the chord tone that comes first above `base`
  const sorted = [...set];
  let bestI = 0, bestD = 99;
  sorted.forEach((pc, i) => { const d = (((pc - base) % 12) + 12) % 12; if (d < bestD) { bestD = d; bestI = i; } });
  return sorted.slice(bestI).concat(sorted.slice(0, bestI));
}

/** Chord exercise list from a progression in a key. */
export function progressionChords(progKey, keyPc) {
  const prog = PROGRESSIONS[progKey];
  const flat = keyPrefersFlat(prog.mode === 'minor' ? (keyPc + 3) % 12 : keyPc);
  return prog.chords.map(([deg, type]) => ({ rootPc: (keyPc + deg) % 12, type, symbol: chordSymbol((keyPc + deg) % 12, type, flat) }));
}

/** Auto settings for the chord gym by level. */
export function chordGymPlan(level, seed) {
  const r = rng(seed);
  const L = level;
  let progs, style, keys;
  if (L < 3) { progs = ['pop', 'fifties']; style = 'any'; keys = [0, 7, 5]; }
  else if (L < 5) { progs = ['pop', 'fifties', 'balkan']; style = r.chance(0.5) ? 'any' : 'rootBass'; keys = [0, 7, 5, 2, 9, 10, 3]; }
  else if (L < 7) { progs = ['twoFiveOne', 'rhythm', 'blues', 'minorTwoFive']; style = 'any'; keys = [0, 5, 7, 10, 2, 3]; }
  else if (L < 9) { progs = ['twoFiveOne', 'rhythm', 'minorTwoFive', 'blues']; style = 'shell'; keys = [0, 5, 7, 10, 2, 3, 8]; }
  else { progs = ['twoFiveOne', 'rhythm', 'minorTwoFive']; style = 'rootless'; keys = [0, 5, 7, 10, 2, 3, 8, 1, 4, 9]; }
  const prog = r.pick(progs);
  return { prog, style: PROGRESSIONS[prog].sevenths || style === 'any' || style === 'rootBass' ? style : 'any', keyPc: r.pick(keys) };
}

// --- 5. target notes: backing ----------------------------------------------------------------------------
/**
 * Backing for one chorus. Returns {events, chords:[{start,end,rootPc,type,symbol}], beats, beat}
 * Times in seconds from the chorus start. Left hand: root on 1, shell on 2 and 4 (light swing feel).
 */
export function backingChorus(progKey, keyPc, tempo, { barsPerChord = 1, gain = 1 } = {}) {
  const chords = progressionChords(progKey, keyPc);
  const beat = 60 / tempo;
  const events = [];
  const spans = [];
  let t = 0;
  chords.forEach((c) => {
    const len = 4 * barsPerChord * beat;
    const bassNote = 36 + c.rootPc - (c.rootPc > 7 ? 12 : 0);
    const shellPcs = chordPcs(c.rootPc, c.type);
    const third = shellPcs[1];
    const top = shellPcs[3] !== undefined ? shellPcs[3] : shellPcs[2];
    const shell = [nearest(third, 52), nearest(top, 55)].sort((a, b) => a - b);
    for (let bar = 0; bar < barsPerChord; bar++) {
      const b0 = t + bar * 4 * beat;
      events.push({ t: b0, m: [0x90, bassNote, Math.round(70 * gain)] });
      events.push({ t: b0 + beat * 1.8, m: [0x80, bassNote, 0] });
      for (const k of [1, 3]) {
        for (const n of shell) {
          events.push({ t: b0 + k * beat, m: [0x90, n, Math.round((k === 1 ? 52 : 58) * gain)] });
          events.push({ t: b0 + k * beat + beat * 0.6, m: [0x80, n, 0] });
        }
      }
      events.push({ t: b0 + 2 * beat, m: [0x90, bassNote + 7 > 59 ? bassNote - 5 : bassNote + 7, Math.round(56 * gain)] });
      events.push({ t: b0 + 2 * beat + beat * 1.5, m: [0x80, bassNote + 7 > 59 ? bassNote - 5 : bassNote + 7, 0] });
    }
    spans.push({ start: t, end: t + len, ...c });
    t += len;
  });
  return { events, chords: spans, seconds: t, beat };
}

function nearest(pc, around) {
  let best = around;
  for (let m = around - 6; m <= around + 6; m++) if (m % 12 === pc) { best = m; break; }
  return best;
}

/** Classify a note played at time t (s from chorus start) against the backing. */
export function classifyTarget(note, t, chorus) {
  const c = chorus.chords.find((x) => t >= x.start - 0.06 && t < x.end - 0.06) || chorus.chords[chorus.chords.length - 1];
  const role = roleIn(note % 12, c.rootPc, c.type);
  const kind = role === '1' || role === '3' || role === '5' || role === '7' ? 'chord' : role ? 'tension' : 'out';
  const beatPos = (t - c.start) / chorus.beat;
  const frac = beatPos - Math.round(beatPos);
  const beatInBar = ((Math.round(beatPos) % 4) + 4) % 4;
  const strong = Math.abs(frac) <= 0.15 && (beatInBar === 0 || beatInBar === 2);
  const points = kind === 'chord' ? (strong ? 3 : 1) : kind === 'tension' ? (strong ? 1 : 1) : strong ? -1 : 0;
  return { kind, role, strong, points, chord: c.symbol };
}

// --- 7. by ear ------------------------------------------------------------------------------------------------
// Public-domain tunes (traditional or composers dead > 70 years), written as scale degrees in major
// (semitones from the tonic) and beats.
export const TUNES = [
  { name: 'Wlazł kotek na płotek', notes: [[7, 1], [4, 1], [4, 1], [5, 1], [2, 1], [2, 1], [0, 0.5], [4, 0.5], [7, 2]] },
  { name: 'Panie Janie (Frère Jacques)', notes: [[0, 1], [2, 1], [4, 1], [0, 1], [0, 1], [2, 1], [4, 1], [0, 1], [4, 1], [5, 1], [7, 2]] },
  { name: 'Oda do radości (Beethoven)', notes: [[4, 1], [4, 1], [5, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 1], [0, 1], [0, 1], [2, 1], [4, 1], [4, 1.5], [2, 0.5], [2, 2]] },
  { name: 'Mrugaj, mrugaj, gwiazdko', notes: [[0, 1], [0, 1], [7, 1], [7, 1], [9, 1], [9, 1], [7, 2], [5, 1], [5, 1], [4, 1], [4, 1], [2, 1], [2, 1], [0, 2]] },
  { name: 'Menuet G-dur (Petzold)', notes: [[7, 1], [0, 0.5], [2, 0.5], [4, 0.5], [5, 0.5], [7, 1], [0, 1], [0, 1]] },
  { name: 'Dla Elizy (Beethoven), początek', minor: true, notes: [[7, 0.5], [6, 0.5], [7, 0.5], [6, 0.5], [7, 0.5], [2, 0.5], [5, 0.5], [3, 0.5], [0, 1.5]] },
];

/**
 * A melody to find by ear. opts.leapBias (0–0.3): more leaps when leaps are what you miss (since 1.10).
 */
export function earMelody(level, seed, opts = {}) {
  const r = rng(seed);
  const L = Math.max(1, Math.min(12, level));
  const rootPc = L < 4 ? 0 : r.pick([0, 2, 5, 7, 9, 10, 3]);
  const tonic = 60 + rootPc - (rootPc > 6 ? 12 : 0);
  const showFirst = L < 5;
  const playCadence = L >= 5;
  if (L >= 6.5 && L < 8.5 && r.chance(0.6)) {
    const tune = r.pick(TUNES);
    const notes = tune.notes.map(([deg, dur]) => ({ p: tonic + deg, dur, v: DYN.mf }));
    return { kind: 'melody', level: L, tempo: 96, notes, rootPc, flat: keyPrefersFlat(rootPc), showFirst, playCadence, title: tune.name, tune: true, scale: tune.minor ? 'minor' : 'major' };
  }
  const scale = L >= 8.5 ? r.pick(['minor', 'harmonic', ...BALKAN]) : 'major';
  const pool = scaleNotes(rootPc, scale, tonic - 5, tonic + 12);
  const tonicIdx = pool.indexOf(tonic);
  const length = L < 2 ? 3 : L < 4 ? 4 : L < 6 ? 5 : Math.min(8, 5 + Math.floor((L - 5) / 1.5));
  const leap = L < 3 ? 0 : Math.min(0.6, (L < 6 ? 0.2 : 0.35) + Math.max(0, Math.min(0.3, opts.leapBias || 0)));
  let idx = tonicIdx;
  const notes = [];
  for (let i = 0; i < length; i++) {
    if (i > 0) {
      const step = r.chance(leap) ? r.int(2, 4) : 1;
      const dirUp = i < length / 2 ? r.chance(0.7) : r.chance(0.3);
      idx = Math.min(pool.length - 1, Math.max(0, idx + (dirUp ? step : -step)));
    }
    notes.push({ p: pool[idx], dur: i === length - 1 ? 2 : r.pick([1, 1, 0.5, 1]), v: DYN.mf });
  }
  if (length >= 4) notes[length - 1].p = tonic; // land on the tonic: sounds finished
  return { kind: 'melody', level: L, tempo: 92, notes, rootPc, flat: keyPrefersFlat(rootPc), showFirst, playCadence, scale };
}

/** I–IV–V–I cadence events (sets the key before the melody). */
export function cadenceEvents(rootPc, minor = false, gain = 1) {
  const t = rootPc > 6 ? rootPc - 12 : rootPc;
  const chords = minor
    ? [[0, 3, 7], [5, 8, 12], [7, 11, 14], [0, 3, 7]]
    : [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]];
  const events = [];
  chords.forEach((c, i) => {
    for (const iv of c) {
      events.push({ t: i * 0.55, m: [0x90, 55 + t + iv, Math.round(50 * gain)] });
      events.push({ t: i * 0.55 + 0.5, m: [0x80, 55 + t + iv, 0] });
    }
  });
  return { events, seconds: chords.length * 0.55 + 0.35 };
}

/** Contour arrows of a melody: '↑', '↓', '=' between notes. */
export function contour(notes) {
  return notes.slice(1).map((n, i) => (n.p > notes[i].p ? '↑' : n.p < notes[i].p ? '↓' : '='));
}

// --- 8. aksak ------------------------------------------------------------------------------------------------------
export const METERS = {
  paidushko: { name: 'Pajduszko 5/8', groups: [2, 3] },
  rachenitsa: { name: 'Raczenica 7/8', groups: [2, 2, 3] },
  lesnoto: { name: 'Lesnoto 7/8', groups: [3, 2, 2] },
  daychovo: { name: 'Dajczowo 9/8', groups: [2, 2, 2, 3] },
  kopanitsa: { name: 'Kopanica 11/8', groups: [2, 2, 3, 2, 2] },
};

/** level: 1..12, or the axes {metrum, puls} (since 1.10): metrum picks the meters, puls the tempo and the help. */
export function aksakPlan(level, seed, meterKey = null) {
  const r = rng(seed);
  const ax = typeof level === 'object' && level ? level : { metrum: level, puls: level };
  const M = clampL(ax.metrum), P = clampL(ax.puls ?? ax.metrum);
  const meters = M < 3 ? ['rachenitsa', 'paidushko'] : M < 6 ? ['rachenitsa', 'paidushko', 'lesnoto'] : M < 9 ? ['rachenitsa', 'lesnoto', 'daychovo'] : ['rachenitsa', 'lesnoto', 'daychovo', 'kopanitsa'];
  const meter = meterKey || r.pick(meters);
  const eighth = Math.max(0.12, 0.3 - P * 0.014);           // seconds per eighth: 286 ms → 132 ms
  const fillers = P < 6;                                    // soft clicks on the in-between eighths
  const silentBars = P >= 9;                                // every other bar: pulse only on the first beat
  return { meter, eighth, fillers, silentBars, bars: 8, countInBars: 1, level: (M + P) / 2 };
}

/** A round slower (the error loop's "simplify" step): 12 % more time per eighth, with the soft eighths back. */
export function easierAksak(plan) {
  return { ...plan, eighth: Math.min(0.3, plan.eighth * 1.12), fillers: true, silentBars: false, easy: true };
}

/** Pulse events for an aksak round; group starts get a bass note, bar start an accent. */
export function aksakEvents(plan, { rootNote = 38, gain = 1 } = {}) {
  const groups = METERS[plan.meter].groups;
  const barLen = groups.reduce((a, b) => a + b, 0) * plan.eighth;
  const events = [];
  const targets = [];
  const totalBars = plan.countInBars + plan.bars;
  for (let bar = 0; bar < totalBars; bar++) {
    const b0 = bar * barLen;
    const counting = bar < plan.countInBars;
    const quiet = !counting && plan.silentBars && (bar - plan.countInBars) % 2 === 1;
    let pos = 0;
    groups.forEach((g, gi) => {
      const t = b0 + pos * plan.eighth;
      if (!counting) targets.push({ t, bar: bar - plan.countInBars, group: gi, len: g });
      if (!quiet || gi === 0) {
        const note = gi === 0 ? rootNote : rootNote + 7;
        const vel = gi === 0 ? 92 : g === 3 ? 76 : 66;
        if (counting) events.push(...clickEvents(t, Math.round(60 * gain), gi === 0, plan.eighth * 0.8, 84));
        else events.push({ t, m: [0x90, note, Math.round(vel * gain)] }, { t: t + plan.eighth * 0.8, m: [0x80, note, 0] });
      }
      if (plan.fillers && !quiet) {
        for (let k = 1; k < g; k++) {
          const tf = t + k * plan.eighth;
          events.push(...clickEvents(tf, Math.round(26 * gain)));
        }
      }
      pos += g;
    });
  }
  return { events, targets, barLen, seconds: totalBars * barLen, startOfPlay: plan.countInBars * barLen };
}

/** Merge notes played together (a chord) into one onset. ts in seconds, sorted. */
export function onsetsFromNotes(ts, window = 0.045) {
  const out = [];
  for (const t of [...ts].sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1] > window) out.push(t);
  }
  return out;
}

/** Grade an aksak round. onsets: seconds relative to the round's t0 (already latency-corrected). */
export function gradeAksak(plan, sched, onsets) {
  const tol = Math.max(0.045, plan.eighth * 0.2);
  const used = new Set();
  const hits = sched.targets.map((tg) => {
    let best = -1, bestD = 1e9;
    onsets.forEach((o, i) => { const d = Math.abs(o - tg.t); if (!used.has(i) && d < bestD) { bestD = d; best = i; } });
    if (best >= 0 && bestD <= plan.eighth * 0.5) { used.add(best); return { ...tg, dev: onsets[best] - tg.t, ok: bestD <= tol }; }
    return { ...tg, dev: null, ok: false };
  });
  const playOnsets = onsets.filter((o) => o >= sched.startOfPlay - plan.eighth * 0.5);
  const extra = playOnsets.filter((o) => ![...used].some((i) => onsets[i] === o)).length;
  const good = hits.filter((h) => h.ok).length;
  const ratio = good / Math.max(1, hits.length);
  // long group: actual length of the 3-group divided by an average 2-group
  const groups = METERS[plan.meter].groups;
  const longIdx = groups.indexOf(3);
  const lens = { two: [], three: [] };
  for (let i = 0; i < hits.length - 1; i++) {
    const a = hits[i], b = hits[i + 1];
    if (a.dev === null || b.dev === null) continue;
    const span = (b.t + b.dev) - (a.t + a.dev);
    (a.len === 3 ? lens.three : lens.two).push(span);
  }
  const longRatio = lens.three.length && lens.two.length ? mean(lens.three) / mean(lens.two) : null;
  const meanDev = mean(hits.filter((h) => h.dev !== null).map((h) => h.dev));
  const passed = ratio >= 0.8 && extra <= 2;
  // drift: least-squares slope of your deviation over the round, in ms per bar (+ = falling behind = slowing)
  const pts = hits.filter((h) => h.dev !== null).map((h) => [h.t, h.dev]);
  let drift = null;
  if (pts.length >= 6) {
    const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
    let num = 0, den = 0;
    for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
    drift = den > 0 ? Math.round((num / den) * sched.barLen * 1000) : 0;
  }
  const puls = Math.max(0, Math.round(100 * ratio - 6 * Math.max(0, extra - 2)));
  const metrum = longRatio === null ? null : Math.max(0, Math.round(100 - (Math.abs(longRatio - 1.5) / 1.5) * 300));
  const scores = { puls, metrum };
  const lr = longRatio;
  const tip = ratio < 0.8 && drift !== null && Math.abs(drift) >= 6
    ? { kind: drift > 0 ? 'slow' : 'rush', text: drift > 0 ? `Zwalniasz: z każdym taktem o ok. ${drift} ms później niż bas.` : `Przyspieszasz: z każdym taktem o ok. ${-drift} ms wcześniej niż bas.` }
    : lr !== null && Math.abs(lr - 1.5) > 0.1
      ? { kind: lr < 1.5 ? 'short3' : 'long3', text: lr < 1.5 ? 'Skracasz trójkę: zostań w niej dłużej, TA-ki-ta.' : 'Przeciągasz trójkę: wejdź w następną grupę wcześniej.' }
      : ratio < 0.8 ? { kind: 'miss', text: `Trafione ${good} z ${hits.length}. Graj tylko z basem, nic pomiędzy.` }
        : { kind: null, text: 'Puls trzymasz równo z basem.' };
  return { hits, good, total: hits.length, ratio, extra, longRatio, meanDev, passed, longIdx, tol, drift, scores, tip };
}

// --- 2. daily plan --------------------------------------------------------------------------------------------------
export const MODE_IDS = ['echo', 'akordy', 'docelowe', 'dynamika', 'ucho', 'aksak'];

/**
 * Plan for today. stats: {mode: {success: 0..1|null, daysSince: number}}, dueCards, insights.
 * Returns blocks [{mode, minutes, why}], interleaved, last block for pleasure.
 */
export function dailyPlan(totalMin, stats, dueCards, insight, seed) {
  const r = rng(seed);
  const blocks = [];
  let left = totalMin;
  const fun = { mode: 'wolne', minutes: Math.min(7, Math.max(4, Math.round(totalMin * 0.18))), why: 'Na koniec: zagraj, co lubisz. Bez oceniania.' };
  left -= fun.minutes;
  if (dueCards > 0) {
    const m = Math.min(6, 2 + Math.ceil(dueCards / 3));
    blocks.push({ mode: 'fiszki', minutes: m, why: `${dueCards} ${plural(dueCards, 'fiszka czeka', 'fiszki czekają', 'fiszek czeka')} na powtórkę.` });
    left -= m;
  }
  const scored = MODE_IDS.map((id) => {
    const s = stats[id] || {};
    const weak = s.success == null ? 0.6 : 1 - s.success;
    const stale = Math.min(1.5, (s.daysSince == null ? 3 : s.daysSince) * 0.2);
    let boost = 0;
    let why = s.success == null ? 'Jeszcze tego nie próbowałeś.' : s.daysSince >= 3 ? `Nie było od ${s.daysSince} dni.` : `Ostatnio ${Math.round(100 * s.success)}% udanych prób.`;
    if (id === 'dynamika' && insight && insight.ok && insight.black_ones > 0.05) {
      boost = 0.5;
      why = `„1” na czarnych: ${Math.round(insight.black_ones * 100)}% uderzeń. Ćwiczymy cichą, kontrolowaną grę.`;
    }
    return { id, score: weak + stale + boost + r() * 0.3, why };
  }).sort((a, b) => b.score - a.score);
  const n = Math.max(2, Math.min(4, Math.round(left / 6)));
  const chosen = scored.slice(0, n);
  const per = Math.max(4, Math.floor(left / chosen.length));
  let spare = Math.max(0, left - per * chosen.length);
  for (const c of chosen) {
    const extra = spare > 0 ? 1 : 0;
    spare -= extra;
    blocks.push({ mode: c.id, minutes: per + extra, why: c.why });
  }
  // interleave: never the same kind twice in a row (ear / hand / time)
  const kind = { echo: 'ear', ucho: 'ear', dynamika: 'hand', akordy: 'harm', docelowe: 'harm', aksak: 'time', fiszki: 'mix' };
  const ordered = [];
  const pool = blocks.slice();
  while (pool.length) {
    const prev = ordered[ordered.length - 1];
    let i = pool.findIndex((b) => !prev || kind[b.mode] !== kind[prev.mode]);
    if (i < 0) i = 0;
    ordered.push(pool.splice(i, 1)[0]);
  }
  ordered.push(fun);
  return ordered;
}

export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

// --- 3. cards (Leitner boxes) ---------------------------------------------------------------------------------------
export const BOX_DAYS = [0, 1, 2, 4, 7, 15, 30, 60];

export function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function reviewCard(card, passed, today) {
  const box = passed ? Math.min(BOX_DAYS.length - 1, (card.box || 0) + 1) : 1;
  const due = addDays(today, passed ? BOX_DAYS[box] : 1);
  const history = [...(card.history || []), { d: today, ok: passed }].slice(-30);
  return { ...card, box, due, history };
}

export function dueCards(cards, today) {
  return cards.filter((c) => !c.paused && (c.due || today) <= today).sort((a, b) => (a.due || '').localeCompare(b.due || '') || (a.box || 0) - (b.box || 0));
}

/** Turn freely played notes [{p, ts, v}] into a motif (rhythm in beats, quantised to 1/4 beat). */
export function motifFromPlayed(played, tempo = 90) {
  if (!played.length) return null;
  const beat = 60 / tempo;
  const t0 = played[0].ts;
  const starts = played.map((n) => Math.round(((n.ts - t0) / beat) * 4) / 4);
  const notes = played.map((n, i) => ({
    p: n.p,
    dur: i < played.length - 1 ? Math.max(0.25, starts[i + 1] - starts[i]) : 1,
    v: n.v,
  }));
  const vs = notes.map((x) => x.v);
  const withDynamics = std(vs) > 10;
  return { kind: 'motif', level: 0, tempo, notes, withDynamics, scale: null, rootPc: notes[0].p % 12, flat: false, own: true };
}
