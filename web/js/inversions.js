// Inversions (1.13): which note is at the bottom. Pure, no DOM; tested in inversions.test.js.
// - invVoicing: a chord in a given inversion, in close position near a target note;
// - closestInversions: for a progression, each chord in the inversion nearest the previous one (how pianists move);
// - invPlan: the "Przewroty" mode of the chord gym, from the basics (one triad climbing through its positions) to
//   seventh chords in four positions and ii–V–I with the bass moving by step.
import { CHORDS, chordPcs, keyPrefersFlat, movement, pcName } from './music.js';

export const INV_NAMES = ['pozycja zasadnicza', '1. przewrót', '2. przewrót', '3. przewrót'];
const ROLE_WORD = { 1: 'pryma', 3: 'tercja', 5: 'kwinta', 7: 'septyma', 6: 'seksta', 4: 'kwarta', 2: 'sekunda' };

/** What sits at the bottom, in words: "tercja (E)". */
export function bottomWord(rootPc, type, inv, flat = false) {
  const roles = CHORDS[type].roles || ['1', '3', '5', '7'];
  return `${ROLE_WORD[roles[inv]] || roles[inv]} (${pcName(chordPcs(rootPc, type)[inv], flat)})`;
}

/** Close-position voicing of a chord in inversion inv, its bottom note nearest to `near` (MIDI). */
export function invVoicing(rootPc, type, inv, near = 60) {
  const pcs = chordPcs(rootPc, type);
  const order = [...pcs.slice(inv), ...pcs.slice(0, inv)];
  let b = near + ((((order[0] - near) % 12) + 18) % 12) - 6;    // the bottom pc within ±6 of near
  const v = [b];
  for (const pc of order.slice(1)) {
    let n = v[v.length - 1] + 1;
    while (n % 12 !== pc) n++;
    v.push(n);
  }
  return v;
}

/** The symbol of a chord in an inversion: "C/E" (root position: just "C"). */
export function invSymbol(rootPc, type, inv, flat = false) {
  const base = pcName(rootPc, flat) + CHORDS[type].sym;
  return inv ? `${base}/${pcName(chordPcs(rootPc, type)[inv], flat)}` : base;
}

/**
 * Each chord in the inversion closest to the previous one. The first one in root position (or `first`) around C4.
 * chords: [{rootPc, type, flat?}] → [{..., inv, bass, voicing}].
 */
export function closestInversions(chords, { first = 0, near = 60 } = {}) {
  let prev = null;
  return chords.map((c, k) => {
    const n = CHORDS[c.type].iv.length;
    let best = null;
    if (k === 0) best = { inv: first % n, v: invVoicing(c.rootPc, c.type, first % n, near) };
    else {
      for (let inv = 0; inv < n; inv++) {
        // try the voicing with its bottom near the previous bottom; the hand moves as little as possible
        const v = invVoicing(c.rootPc, c.type, inv, prev[0]);
        const m = movement(prev, v);
        if (!best || m < best.m) best = { inv, v, m };
      }
    }
    prev = best.v;
    return { ...c, inv: best.inv, bass: chordPcs(c.rootPc, c.type)[best.inv], voicing: best.v };
  });
}

// --- the mode: stages by level ---------------------------------------------------------------------------------------
const KEYS = [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6];
const keysAt = (level) => KEYS.slice(0, Math.min(12, 3 + Math.floor(Math.max(0, level - 1) * 1.4)));

export const INV_STAGES = [
  { from: 1, name: 'Wspinaczka', about: 'Jeden akord durowy po kolei w trzech pozycjach: pryma, tercja, kwinta na dole. Ręka idzie w górę, dźwięki zostają te same.' },
  { from: 2, name: 'Dur i moll tam i z powrotem', about: 'Akord w górę przez trzy pozycje i z powrotem. Czasem molowy.' },
  { from: 3, name: 'Losowe przewroty', about: 'Cztery akordy, każdy w innym przewrocie. Najpierw znajdź dolny dźwięk, potem resztę nad nim.' },
  { from: 4, name: 'Kadencja w jednym miejscu', about: 'I – IV – V – I bez skakania: IV z prymą toniki na dole, V z tercją na dole. Tak gra się akompaniament.' },
  { from: 5, name: 'Pop bez skakania', about: 'Znane progresje, każdy akord w przewrocie najbliżej poprzedniego. Palce prawie stoją.' },
  { from: 6, name: 'Septymowe w czterech pozycjach', about: 'Akord septymowy ma cztery przewroty: pryma, tercja, kwinta albo septyma na dole.' },
  { from: 7, name: 'Septymowe losowo', about: 'Różne akordy septymowe, każdy w innym przewrocie.' },
  { from: 8, name: 'Jazz i bas po gamie', about: 'ii–V–I i ballady z basem idącym krokami: przewroty najbliżej poprzedniego akordu.' },
];
export function invStage(level) { return INV_STAGES.filter((s) => level >= s.from).pop(); }

function chord(rootPc, type, inv, flat, near = 60) {
  return { rootPc, type, inv, bass: chordPcs(rootPc, type)[inv], symbol: invSymbol(rootPc, type, inv, flat), voicing: invVoicing(rootPc, type, inv, near), flat };
}

function fromProgression(keyPc, list, flat) {
  // list: [[semitones above the key, type]]; voiced by the nearest inversion
  return closestInversions(list.map(([d, type]) => ({ rootPc: (keyPc + d) % 12, type }))).map((c) => ({
    ...c, symbol: invSymbol(c.rootPc, c.type, c.inv, flat), flat,
  }));
}

const POP = [
  ['Oś popu', [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']]],
  ['Lata 50.', [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']]],
  ['Smutny pop', [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']]],
  ['Kanon', [[0, 'maj'], [7, 'maj'], [9, 'min'], [4, 'min'], [5, 'maj'], [0, 'maj'], [5, 'maj'], [7, 'maj']]],
  ['Andaluzyjska', [[9, 'min'], [7, 'maj'], [5, 'maj'], [4, 'maj']]],
  ['Ballada z iii', [[0, 'maj'], [4, 'min'], [5, 'maj'], [7, 'maj']]],
];
const JAZZ = [
  ['ii–V–I', [[2, 'm7'], [7, 'dom7'], [0, 'maj7']]],
  ['Turnaround', [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']]],
  ['Molowe ii–V–i', [[11, 'm7b5'], [4, 'dom7'], [9, 'm7']]],
  ['Długie koło', [[4, 'm7'], [9, 'dom7'], [2, 'm7'], [7, 'dom7'], [0, 'maj7']]],
];

/** One round of the Przewroty mode: {stage, title, chords}. r: rng(). */
export function invPlan(level, r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const stage = invStage(level);
  const key = pick(keysAt(level));
  const flat = keyPrefersFlat(key);
  const name = (pc, type) => pcName(pc, flat) + CHORDS[type].sym;
  if (stage.from === 1) {
    return { stage, title: `${name(key, 'maj')}: pryma, tercja, kwinta na dole`, chords: [0, 1, 2, 0].map((inv, k) => chord(key, 'maj', inv, flat, k === 3 ? 72 : 60 + [0, 4, 7][inv])) };
  }
  if (stage.from === 2) {
    const type = r() < 0.5 ? 'maj' : 'min';
    const root = type === 'min' ? (key + 9) % 12 : key;
    const f = type === 'min' ? keyPrefersFlat((root + 3) % 12) : flat;
    const up = [0, 1, 2].map((inv) => chord(root, type, inv, f, 57 + [0, 4, 7][inv]));
    // up through the three positions and back down the same way
    return { stage, title: `${pcName(root, f)}${CHORDS[type].sym}: w górę i w dół`, chords: [up[0], up[1], up[2], up[1], up[0]] };
  }
  if (stage.from === 3) {
    const ch = [];
    let last = -1;
    for (let k = 0; k < 4; k++) {
      const type = level >= 3.5 && r() < 0.5 ? 'min' : 'maj';
      const root = pick(keysAt(level));
      let inv = Math.floor(r() * 3);
      if (inv === last) inv = (inv + 1) % 3;
      last = inv;
      ch.push(chord(root, type, inv, keyPrefersFlat(type === 'min' ? (root + 3) % 12 : root)));
    }
    return { stage, title: 'Każdy w innym przewrocie', chords: ch };
  }
  if (stage.from === 4) {
    const minor = level >= 4.5 && r() < 0.4;
    const k = minor ? (key + 9) % 12 : key;
    const f = flat;
    const list = minor ? [[0, 'min'], [5, 'min'], [7, 'maj'], [0, 'min']] : [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']];
    return { stage, title: `Kadencja w ${pcName(k, f)}${minor ? '-moll' : '-dur'}`, chords: fromProgression(k, list, f) };
  }
  if (stage.from === 5) {
    const [title, list] = pick(POP);
    const minor = list[0][1] === 'min' && list[0][0] === 9;
    return { stage, title: `${title} w ${pcName(key, flat)}-dur${minor ? ' (od paralelnej)' : ''}`, chords: fromProgression(key, list, flat) };
  }
  if (stage.from === 6) {
    const type = pick(['maj7', 'dom7', 'm7']);
    return { stage, title: `${name(key, type)} w czterech pozycjach`, chords: [0, 1, 2, 3].map((inv) => chord(key, type, inv, flat, 55 + 3 * inv)) };
  }
  if (stage.from === 7) {
    const ch = [];
    let last = -1;
    for (let k = 0; k < 4; k++) {
      const type = pick(['maj7', 'dom7', 'm7', 'm7b5']);
      const root = pick(keysAt(level));
      let inv = Math.floor(r() * 4);
      if (inv === last) inv = (inv + 1) % 4;
      last = inv;
      ch.push(chord(root, type, inv, keyPrefersFlat(root)));
    }
    return { stage, title: 'Septymowe, każdy w innym przewrocie', chords: ch };
  }
  const [title, list] = r() < 0.6 ? pick(JAZZ) : pick(POP);
  return { stage, title: `${title} w ${pcName(key, flat)}-dur`, chords: fromProgression(key, list, flat) };
}
