// Palce: fingering exercises. Pure logic (tested in node): hand positions, finger patterns,
// scale fingerings over one or two octaves, where the thumb crosses, and per-finger statistics.
//
// The trick that lets a MIDI keyboard "see" fingers: in a fixed five-finger position every key has
// one finger. Play the right key and you used the right finger (as long as the hand stays put).
import { fingering, keyName, scaleNotes } from './theory.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
export const FINGER_SIGN = ['', '①', '②', '③', '④', '⑤'];

/** Tonic of the right hand for a key (around middle C, like the Gama card). */
export function rhTonic(key, octaves = 1) {
  const pc = key.tonicPc;
  if (octaves === 2) return 48 + pc + (pc < 5 ? 12 : 0);   // two octaves fit between C3 and C6
  return 60 + pc - (pc > 6 ? 12 : 0);
}

/** Five-finger position: degrees 1–5 of the key (major or minor). Returns per hand: finger → MIDI. */
export function position(key) {
  const degs = key.mode === 'minor' ? [0, 2, 3, 5, 7] : [0, 2, 4, 5, 7];
  const T = rhTonic(key);
  const rh = {}, lh = {};
  // right hand: thumb on the tonic; left hand an octave lower, little finger on the tonic
  for (let f = 1; f <= 5; f++) { rh[f] = T + degs[f - 1]; lh[f] = T - 12 + degs[5 - f]; }
  return { rh, lh };
}

export const FIVE_PATTERNS = [
  { id: 'gora', name: 'w górę i w dół', seq: [1, 2, 3, 4, 5, 4, 3, 2, 1] },
  { id: 'skoki', name: 'skoki 1-3-5', seq: [1, 3, 5, 3, 1, 3, 5, 3, 1] },
  { id: 'kciuk', name: 'od kciuka', seq: [1, 2, 1, 3, 1, 4, 1, 5, 1] },
  { id: 'tercje', name: 'tercje', seq: [1, 3, 2, 4, 3, 5, 3, 4, 2, 3, 1] },
];

export const PAIRS = [[1, 2], [2, 3], [3, 4], [4, 5]];

/**
 * Steps for finger sequences in a five-finger position.
 * hands: 'rh' | 'lh' | 'par' (both, same notes an octave apart: fingers differ) | 'mirror' (both, same fingers).
 * seq: finger numbers. Each step: {notes, marks, label, sub, beats, exact, fingers:[{hand,finger,note}]}.
 */
export function positionSteps(key, seq, hands, names) {
  const pos = position(key);
  const nm = (n) => (names ? names(n) : '');
  return seq.map((f) => {
    const parts = [];
    if (hands === 'rh' || hands === 'par' || hands === 'mirror') parts.push({ hand: 'rh', finger: f, note: pos.rh[f] });
    if (hands === 'lh') parts.push({ hand: 'lh', finger: f, note: pos.lh[f] });
    if (hands === 'par') { const note = pos.rh[f] - 12; parts.push({ hand: 'lh', finger: fingerOfLh(pos, note), note }); }
    if (hands === 'mirror') parts.push({ hand: 'lh', finger: f, note: pos.lh[f] });
    return stepOf(parts, nm);
  });
}

function fingerOfLh(pos, note) {
  for (let f = 1; f <= 5; f++) if (pos.lh[f] === note) return f;
  return 0;
}

const HAND_TONE = { rh: 'var(--mode)', lh: 'var(--role-3)' };
function stepOf(parts, nm, beats = 1) {
  const notes = [...new Set(parts.map((p) => p.note))];
  const marks = parts.map((p) => ({ note: p.note, text: String(p.finger || ''), sub: nm(p.note), tone: HAND_TONE[p.hand] }));
  const label = parts.map((p) => `${p.hand === 'rh' ? 'P' : 'L'}${p.finger}`).join(' ');
  const sub = [...new Set(parts.map((p) => nm(p.note)))].filter(Boolean).join(' ');
  return { notes, marks, label, sub, beats, exact: true, fingers: parts };
}

/** "Palec na zawołanie": random fingers (no two the same in a row). rand() → [0,1). */
export function callSteps(key, hands, count = 12, rand = Math.random) {
  const pos = position(key);
  // never the same finger twice in a row (and never loop forever on a poor random source)
  const pick = (prev) => { let f = 1 + Math.floor(rand() * 5); if (f === prev) f = (f % 5) + 1; return f; };
  const steps = [];
  let pr = 0, pl = 0;
  for (let i = 0; i < count; i++) {
    const parts = [];
    if (hands !== 'lh') { pr = pick(pr); parts.push({ hand: 'rh', finger: pr, note: pos.rh[pr] }); }
    if (hands !== 'rh') { pl = pick(pl); parts.push({ hand: 'lh', finger: pl, note: pos.lh[pl] }); }
    const s = stepOf(parts, () => '');
    // the call shows only the finger: never the note
    s.label = parts.map((p) => `${p.hand === 'rh' ? 'P' : 'L'}${p.finger}`).join(' + ');
    s.sub = '';
    steps.push(s);
  }
  return steps;
}

/** Trill on two fingers, 8 notes, or all four pairs one after another. */
export function trillSteps(key, pair, hand, names) {
  const pairs = pair === 'all' ? PAIRS : [PAIRS.find(([a]) => a === Number(pair)) || PAIRS[0]];
  const seq = pairs.flatMap(([a, b]) => [a, b, a, b, a, b, a, b]);
  return positionSteps(key, seq, hand, names);
}

/**
 * Scale notes and fingers for one or two octaves, ascending (top included). hand: 'rh' | 'lh'.
 * Two octaves: the right hand repeats the first seven fingers and ends with its top finger;
 * the left hand starts its second octave with the finger after the tonic (5 4 3 2 1 3 2 [1] 4 3 2 1 3 2 1).
 * Returns null when the scale has no school fingering in this key.
 */
export function scaleRun(key, sc, hand, octaves, base) {
  const fing = fingering(key, sc);
  if (!fing) return null;
  const one = scaleNotes(key, sc, 60);
  if (one.length !== 8) return null;
  const f = hand === 'rh' ? fing.rh : fing.lh;
  const rel = one.map((n) => n.midi - one[0].midi);
  const notes = [], fingers = [], names = [];
  const N = 7 * octaves;
  for (let k = 0; k <= N; k++) {
    const oct = Math.floor(k / 7), i = k % 7;
    notes.push(base + 12 * oct + rel[i]);
    names.push(one[i].name);
    if (hand === 'rh') fingers.push(k === N ? f[7] : f[i]);
    else fingers.push(k === 0 ? f[0] : i === 0 ? f[7] : f[i]);
  }
  return { notes, fingers, names };
}

/** Is the move from finger a to finger b (going up or down) a thumb crossing for this hand? */
export function isCrossing(hand, up, a, b) {
  // natural order: right hand up = fingers rise, left hand up = fingers fall (and the reverse going down)
  const naturalRise = (hand === 'rh') === up;
  return naturalRise ? b < a : b > a;
}

/**
 * Scale exercise steps. motion: 'rh' | 'lh' | 'par' (both hands, an octave apart) | 'contra' (from one note outwards).
 * Up and back down. Steps carry `fingers` and transitions carry crossing flags (`cross` on the step you move INTO).
 */
export function scaleSteps(key, sc, motion, octaves) {
  const T = rhTonic(key, octaves);
  const rh = scaleRun(key, sc, 'rh', octaves, T);
  const lhBase = motion === 'contra' ? T - 12 * octaves : T - 12;
  const lh = scaleRun(key, sc, 'lh', octaves, lhBase);
  if (!rh || !lh) return null;
  const N = rh.notes.length - 1;
  const order = [...Array(N + 1).keys(), ...[...Array(N).keys()].reverse()];
  const steps = order.map((k, j) => {
    const parts = [];
    const nm = {};
    if (motion !== 'lh') { parts.push({ hand: 'rh', finger: rh.fingers[k], note: rh.notes[k] }); nm[rh.notes[k]] = rh.names[k]; }
    if (motion === 'lh' || motion === 'par') { parts.push({ hand: 'lh', finger: lh.fingers[k], note: lh.notes[k] }); nm[lh.notes[k]] = lh.names[k]; }
    if (motion === 'contra') { const m = N - k; parts.push({ hand: 'lh', finger: lh.fingers[m], note: lh.notes[m] }); nm[lh.notes[m]] = lh.names[m]; }
    const s = stepOf(parts, (n) => nm[n] || '', j === N ? 2 : 1);
    s.label = [...new Set(parts.map((p) => nm[p.note]))].join(' ');
    s.sub = parts.map((p) => `${p.hand === 'rh' ? 'P' : 'L'}${FINGER_SIGN[p.finger]}`).join(' ');
    return s;
  });
  markCrossings(steps);
  return steps;
}

/** Flag the steps reached by a thumb crossing (per hand). */
export function markCrossings(steps) {
  if (steps.length) steps[0].cross = [];
  for (let j = 1; j < steps.length; j++) {
    const cross = [];
    for (const p of steps[j].fingers) {
      const q = steps[j - 1].fingers.find((x) => x.hand === p.hand);
      if (!q || q.note === p.note) continue;
      if (isCrossing(p.hand, p.note > q.note, q.finger, p.finger)) cross.push(p.hand);
    }
    steps[j].cross = cross;
  }
  return steps;
}

/**
 * "Kciuk pod spodem": short drills around each crossing of one hand's two-octave scale (first octave + the
 * octave junction). Returns [{id, name, steps}] — each drill goes up through the crossing and back.
 */
export function thumbDrills(key, sc, hand) {
  const run = scaleRun(key, sc, hand, 2, hand === 'rh' ? rhTonic(key, 2) : rhTonic(key, 2) - 12);
  if (!run) return [];
  const out = [];
  for (let i = 0; i < run.notes.length - 1 && i < 8; i++) {
    if (!isCrossing(hand, true, run.fingers[i], run.fingers[i + 1])) continue;
    const a = Math.max(0, i - 2), b = Math.min(run.notes.length - 1, i + 3);
    const idx = [...Array(b - a + 1).keys()].map((x) => a + x);
    const order = [...idx, ...idx.slice(0, -1).reverse()];
    const steps = order.map((k) => stepOf([{ hand, finger: run.fingers[k], note: run.notes[k] }], () => run.names[k]));
    steps.forEach((s, j) => { s.label = run.names[order[j]]; s.sub = FINGER_SIGN[run.fingers[order[j]]]; });
    markCrossings(steps);
    const junction = i >= 6;
    out.push({ id: `x${i}`, name: `${run.names[i]}→${run.names[i + 1]} (${run.fingers[i]}→${run.fingers[i + 1]})${junction ? ', granica oktaw' : ''}`, steps });
  }
  return out;
}

/**
 * Per-finger statistics from one pass. notes: [{note, vel, t}] in time order; fingerOf(note) → {hand, finger} | null.
 * timing (only when `timed`): each note's lateness = its gap from the previous note of the same hand minus the
 * median gap (ms). Returns { fingers: [{hand, finger, n, vel, velPct, lateMs}], weakest, latest, spread }.
 */
export function fingerStats(notes, fingerOf, { timed = true } = {}) {
  const per = new Map();
  const byHand = { rh: [], lh: [] };
  for (const x of notes) {
    const f = fingerOf(x.note);
    if (!f) continue;
    byHand[f.hand].push({ ...x, ...f });
  }
  for (const hand of ['rh', 'lh']) {
    const seq = byHand[hand];
    const gaps = [];
    for (let i = 1; i < seq.length; i++) gaps.push(seq[i].t - seq[i - 1].t);
    const sorted = [...gaps].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    seq.forEach((x, i) => {
      const k = `${hand}${x.finger}`;
      if (!per.has(k)) per.set(k, { hand, finger: x.finger, n: 0, velSum: 0, lateSum: 0, lateN: 0 });
      const r = per.get(k);
      r.n++; r.velSum += x.vel;
      // a long pause (over 2× the median) is a stop, not a late finger
      if (timed && i > 0 && med > 0 && gaps[i - 1] < med * 2) { r.lateSum += (gaps[i - 1] - med) * 1000; r.lateN++; }
    });
  }
  const list = [...per.values()].filter((r) => r.n > 0);
  const all = list.reduce((a, r) => a + r.velSum, 0) / Math.max(1, list.reduce((a, r) => a + r.n, 0));
  const fingers = list.map((r) => ({
    hand: r.hand, finger: r.finger, n: r.n,
    vel: Math.round(r.velSum / r.n),
    velPct: all ? Math.round(((r.velSum / r.n) / all - 1) * 100) : 0,
    lateMs: timed && r.lateN ? Math.round(r.lateSum / r.lateN) : null,
  })).sort((a, b) => (a.hand === b.hand ? a.finger - b.finger : a.hand === 'rh' ? -1 : 1));
  const enough = fingers.filter((f) => f.n >= 2);
  const weakest = enough.length > 1 ? enough.reduce((a, b) => (b.vel < a.vel ? b : a)) : null;
  const timedList = enough.filter((f) => f.lateMs != null);
  const latest = timedList.length > 1 ? timedList.reduce((a, b) => (b.lateMs > a.lateMs ? b : a)) : null;
  const vels = enough.map((f) => f.vel);
  const spread = vels.length ? Math.max(...vels) - Math.min(...vels) : 0;
  return { fingers, weakest, latest, spread };
}

/**
 * How long the gaps into crossing notes are compared with the others (one pass, timed).
 * notes: [{note, t}] in order; steps: the exercise steps (with .cross). Returns { ratio, worst: {label, ratio} } or null.
 */
export function crossingStats(notes, steps, hand) {
  const seq = notes.filter((x) => steps.some((s) => s.fingers.some((p) => p.hand === hand && p.note === x.note)));
  if (seq.length < 4) return null;
  // walk the steps in order and match the played notes (a wrong order breaks the match: no stats)
  const gaps = [];
  let si = 0;
  for (let i = 0; i < seq.length && si < steps.length; i++) {
    const want = steps[si].fingers.find((p) => p.hand === hand);
    if (!want || want.note !== seq[i].note) continue;
    if (i > 0 && si > 0) gaps.push({ gap: seq[i].t - seq[i - 1].t, cross: steps[si].cross.includes(hand), label: steps[si].label });
    si++;
  }
  const normal = gaps.filter((g) => !g.cross).map((g) => g.gap).sort((a, b) => a - b);
  const crossing = gaps.filter((g) => g.cross);
  if (normal.length < 3 || !crossing.length) return null;
  const med = normal[Math.floor(normal.length / 2)];
  const worst = crossing.reduce((a, b) => (b.gap > a.gap ? b : a));
  const ratio = crossing.reduce((a, g) => a + g.gap, 0) / crossing.length / med;
  return { ratio: Math.round(ratio * 100) / 100, worst: { label: worst.label, ratio: Math.round((worst.gap / med) * 100) / 100 } };
}

export const keyLabel = (k) => keyName(k, true);
export { mod12 };
