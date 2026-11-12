// The drummer: four ways to play any groove's pattern, from metronomic to rich, and always on the groove's own kit
// and feel (rock/pop straight 16ths, swing on the ride, latin with the clave left alone, odd meters and triplet grids
// with their accents). Level 2 is the old pattern played the way a person plays it; 3 and 4 add what drummers add.
// Pure; pass rng for repeatable results.

const KICK = 36, RIM = 37, SN = 38, HH = 42, PH = 44, OH = 46, CR = 49, RIDE = 51, BELL = 53;
const TOMS = [50, 48, 47, 45, 43];
const VEL = { X: 108, x: 82, o: 46 };
const CYM = new Set([HH, PH, OH, RIDE, BELL]);

export const DRUMMERS = [
  [1, 'Prosto', 'Równo jak automat: sam szkielet rytmu, bez duchów i ozdobników. Najłatwiej się w nim odnaleźć.'],
  [2, 'Naturalnie', 'Ten sam rytm, ale jak u człowieka: talerze z akcentem na raz, drobne wahania siły i czasu, przedtakt na końcu frazy, talerz co 8 taktów.'],
  [3, 'Z życiem', 'Ciche „duchy” na werblu, otwarty hi-hat na końcu taktu, zmienna stopa, krótkie przejście co 4 takty, w drugiej połowie frazy ride zamiast hi-hatu.'],
  [4, 'Bogato', 'Jak dobry sesyjny perkusista: gęstsze duchy, flamy na werblu, szesnastki na hi-hacie, fraza rośnie w siłę, przejścia co 2 takty, za każdym razem inne.'],
];

/** The groove's family decides what the drummer may add. */
export function familyOf(g) {
  if (g.family) return g.family;
  const spb = g.grid / g.beats;
  if (!Number.isInteger(spb) || g.grid % 4 !== 0 && g.grid !== 6 && g.grid !== 12) return 'odd';
  if (g.drums[RIDE] && g.swing) return 'swing';
  if (spb === 3) return 'triplet';
  return 'straight';
}

const rnd = (rng, a, b) => a + (b - a) * rng();
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/**
 * Hits for one bar: [{ step, n, v, dt }] (dt = seconds off the grid, for feel).
 * ctx: { level 1..4, bar (counts across laps, for the 4- and 8-bar phrase), last (last bar of the lap), fill, crash, rng }
 */
export function drumBar(g, { level = 2, bar = 0, last = false, fill = false, crash = false, rng = Math.random } = {}) {
  const lv = Math.max(1, Math.min(4, level | 0));
  const fam = familyOf(g);
  const spb = g.grid / g.beats;
  const p = ((bar % 4) + 4) % 4;
  const p8 = ((bar % 8) + 8) % 8;
  const hits = [];
  const add = (step, n, v, dt = 0) => { if (step >= 0 && step < g.grid) hits.push({ step, n, v: Math.max(1, Math.min(127, Math.round(v))), dt }); };
  const has = (step, notes) => hits.some((h) => h.step === step && notes.includes(h.n));
  const drop = (pred) => { for (let i = hits.length - 1; i >= 0; i--) if (pred(hits[i])) hits.splice(i, 1); };
  const onBeat = (s) => Math.abs(s % spb) < 1e-9;
  const off8 = (s) => Number.isInteger(spb) && spb % 2 === 0 && s % spb === spb / 2;
  const jit = [0, 0, 5, 7, 9][lv];
  const tj = [0, 0, 0.004, 0.006, 0.008][lv];
  const feel = g.feel === 'behind' ? 0.012 : g.feel === 'ahead' ? -0.004 : 0;
  const arc = lv === 4 ? [0.94, 0.97, 1, 1.05][p] : 1;
  const rideHalf = lv >= 3 && fam === 'straight' && p8 >= 4 && g.drums[HH] && !g.drums[RIDE] && !g.keepHats;

  // 1. the groove's own pattern
  for (const [note, pat] of Object.entries(g.drums)) {
    const n0 = Number(note);
    for (let s = 0; s < pat.length; s++) {
      const sym = pat[s];
      if (!VEL[sym]) continue;
      let n = n0;
      let v = VEL[sym];
      let dt = 0;
      if (lv === 1) {
        if (sym === 'o' && (n === SN || n === KICK)) continue;      // no ghosts
        if (CYM.has(n)) v = 74;                                      // even, like a machine
        add(s, n, v);
        continue;
      }
      if (CYM.has(n) && sym !== 'o') v *= onBeat(s) ? 1 : off8(s) ? 0.84 : 0.72;
      v += rnd(rng, -jit, jit);
      dt = rnd(rng, -tj, tj);
      if (n === SN || n === RIM) dt += feel;
      if (CYM.has(n)) dt += feel / 2;
      if (rideHalf && n === HH) { n = RIDE; v *= 0.92; }
      add(s, n, v * arc, dt);
    }
  }
  if (lv === 1) {
    if (fill) applyFill(g, hits, 1, rng, add, drop);
    if (crash) add(0, CR, 96);
    return hits;
  }

  const kickSteps = new Set(hits.filter((h) => h.n === KICK).map((h) => h.step));
  const snSteps = new Set(hits.filter((h) => h.n === SN || h.n === RIM).map((h) => h.step));
  const free = (s) => !kickSteps.has(s) && !snSteps.has(s);
  const usesHat = !!g.drums[HH];

  // 2. Naturalnie: a pickup at the end of the phrase, a crash every 8 bars
  if (p === 3 && !last && fam !== 'latin') {
    const s = g.grid - 1;
    if (free(s)) { if (rng() < 0.5) add(s, SN, rnd(rng, 34, 46), feel); else add(s, KICK, rnd(rng, 60, 72)); }
  }
  if (bar > 0 && p8 === 0 && !crash) { drop((h) => h.step === 0 && (h.n === HH || h.n === RIDE)); add(0, CR, rnd(rng, 84, 96)); }

  if (lv >= 3) {
    // ghost notes on the snare (latin: the clave stays, the congas/toms talk instead)
    const ghostP = lv === 3 ? 0.3 : 0.5;
    const cand = [];
    for (let s = 0; s < g.grid; s++) {
      if (onBeat(s) || !free(s)) continue;
      if (fam === 'swing' && !off8(s)) continue;               // swing: only the swung "and"
      if (fam === 'straight' && Number.isInteger(spb) && spb % 2 === 0 && off8(s) && lv === 3) continue;   // 16ths around the "and"
      cand.push(s);
    }
    if (fam === 'latin') {
      for (const s of cand) if (rng() < ghostP * 0.6) add(s, pick(rng, [45, 43]), rnd(rng, 40, 58));
    } else {
      for (const s of cand) if (rng() < ghostP) add(s, SN, rnd(rng, fam === 'swing' ? 30 : 20, fam === 'swing' ? 46 : 36), feel);
    }
    // the bass drum moves a little
    const kickP = lv === 3 ? (p === 2 ? 0.6 : 0) : 0.45;
    if (rng() < kickP) {
      const ks = cand.filter((s) => s % 1 === 0 && !(fam === 'swing' && !off8(s)));
      if (ks.length) add(pick(rng, ks), KICK, fam === 'swing' ? rnd(rng, 52, 70) : rnd(rng, 64, 82));
    }
    // open hi-hat on the last "and" (bars 2 and 4 of the phrase)
    if (usesHat && (p === 1 || p === 3) && fam !== 'latin' && Number.isInteger(spb) && spb % 2 === 0) {
      const s = g.grid - spb / 2;
      if (hits.some((h) => h.step === s && h.n === HH)) { drop((h) => h.step === s && h.n === HH); add(s, OH, rnd(rng, 70, 84)); }
    }
  }
  if (lv === 4) {
    // flams on the backbeat, extra 16ths on the hats, ride bell on 1 in swing
    for (const s of snSteps) if (onBeat(s) && rng() < 0.25) add(s, SN, rnd(rng, 44, 56), feel - 0.018);
    if (usesHat && fam === 'straight' && spb === 4) for (let s = 0; s < g.grid; s++) if (s % 2 === 1 && !has(s, [HH, OH]) && rng() < 0.3) add(s, HH, rnd(rng, 34, 48), feel / 2);
    if (fam === 'swing' && rng() < 0.5) add(0, BELL, rnd(rng, 60, 72));
  }

  // short fills inside the phrase (never in the lap's last bar: that one gets the real fill)
  const mini = !last && ((lv === 3 && p === 3) || (lv === 4 && (p === 1 || p === 3)));
  if (mini && fam !== 'latin') {
    const len = lv === 4 && p === 1 ? Math.max(1, Math.round(spb / 2)) : Math.max(1, Math.round(spb));
    const from = g.grid - len;
    drop((h) => h.step >= from && (h.n === SN || h.n === KICK || h.n === HH || h.n === OH));
    const type = lv === 3 ? 'snare' : pick(rng, ['snare', 'toms', 'linear']);
    for (let s = from, k = 0; s < g.grid; s++, k++) {
      const up = 52 + 40 * ((k + 1) / len);
      if (type === 'snare') add(s, SN, up, feel);
      else if (type === 'toms') add(s, TOMS[Math.min(TOMS.length - 1, k)], up);
      else add(s, k % 2 ? SN : KICK, up, k % 2 ? feel : 0);
    }
  }
  if (fill) applyFill(g, hits, lv, rng, add, drop);
  if (crash) { drop((h) => h.step === 0 && (h.n === HH || h.n === RIDE)); add(0, CR, 100); if (lv >= 3 && !has(0, [KICK])) add(0, KICK, 100); }
  return hits;
}

/** The fill at the end of a lap: longer and more varied with each level. */
function applyFill(g, hits, lv, rng, add, drop) {
  const spb = g.grid / g.beats;
  const beatsLen = lv === 4 && g.beats >= 4 && rng() < 0.4 ? g.beats : g.beats >= 4 ? 2 : 1.5;
  const len = Math.max(2, Math.min(g.grid - 1, Math.round(spb * beatsLen)));
  const from = g.grid - len;
  const keepCym = lv <= 2;
  drop((h) => h.step >= from && (h.n === KICK || h.n === SN || h.n === RIM || (!keepCym && (h.n === HH || h.n === OH || h.n === RIDE))));
  if (lv === 1) {                      // a plain snare run on the beat subdivisions
    for (let s = from, k = 0; s < g.grid; s += Math.max(1, Math.round(spb / 2)), k++) add(s, SN, 70 + 30 * ((s - from) / len));
    return;
  }
  const type = lv === 2 ? 'down' : pick(rng, lv === 3 ? ['down', 'snareToms', 'down'] : ['down', 'snareToms', 'linear', 'triplets']);
  for (let s = from; s < g.grid; s++) {
    const x = (s - from) / len;
    const v = 70 + 45 * x;
    const tom = TOMS[Math.min(TOMS.length - 1, Math.floor(x * TOMS.length))];
    if (type === 'down') add(s, x < 0.25 ? SN : tom, v);
    else if (type === 'snareToms') add(s, x < 0.5 ? SN : tom, v);
    else if (type === 'linear') { const k = s - from; add(s, k % 3 === 0 ? KICK : k % 3 === 1 ? SN : tom, v); }
    else if ((s - from) % 3 !== 1) add(s, tom, v);                     // triplets: two of three
  }
  if (lv >= 3) add(g.grid - 1, KICK, 96);
}
