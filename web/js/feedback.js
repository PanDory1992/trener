// Informacja po próbie: rhythm and dynamics of one pass "W tempie", and the challenge counts.
// Numbers, not praise. Pure (tested in node).
//
// hits: the right notes you played, one per (step, key): [{ k, note, dt (s, your onset − the step's time; < 0 early), vel }]
// steps: the guide's steps ({ notes, label, ct?, third?, change? }).

export const TOL_MS = 30;   // "na czas": within ±30 ms

const ms = (s) => Math.round(s * 1000);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const pcOf = (n) => ((n % 12) + 12) % 12;

/** The step's bass note, when it has one under a chord (a gap of a fifth or more under the next note). */
export function bassOf(step) {
  const ns = [...new Set(step.notes || [])].sort((a, b) => a - b);
  if (ns.length < 3 || ns[1] - ns[0] < 7) return null;
  return { bass: ns[0], upperLow: ns[1] };
}

function early(v) { return v < 0 ? 'za wcześnie' : 'za późno'; }
function stepName(steps, k) {
  const s = steps[k];
  const lab = s && s.label ? ` (${s.label})` : '';
  return `krok ${k + 1}${lab}`;
}
function range(a, b) { return a === b ? `krok ${a + 1}` : `kroki ${a + 1}–${b + 1}`; }

/**
 * Analysis of one pass. Returns { n, onTime, meanMs, rush, drag, bass, dyn, lines } or { n, lines } with too few notes.
 * lines: short Polish sentences, ready to show.
 */
export function analyzePass({ hits = [], steps = [], tolMs = TOL_MS } = {}) {
  const good = hits.filter((h) => Number.isFinite(h.dt) && steps[h.k]);
  const n = good.length;
  if (n < 3) return { n, lines: [n ? `Za mało trafionych dźwięków (${n}), żeby ocenić rytm.` : 'Brak trafionych dźwięków w tym przejściu.'] };
  const tol = tolMs / 1000;
  // bass vs upper notes: per step with a bass under the chord
  const isBass = (h) => { const b = bassOf(steps[h.k]); return !!b && h.note < b.upperLow - 4; };
  const all = good.map((h) => h.dt);
  const m = mean(all);
  const onTime = all.filter((x) => Math.abs(x) <= tol).length;
  const lines = [];
  const mm = ms(m);
  lines.push(Math.abs(mm) <= tolMs
    ? `Rytm: średnio na czas (${Math.abs(mm)} ms ${mm < 0 ? 'za wcześnie' : 'za późno'}). ${onTime} z ${n} dźwięków w ±${tolMs} ms.`
    : `Rytm: średnio ${Math.abs(mm)} ms ${early(mm)}. ${onTime} z ${n} dźwięków w ±${tolMs} ms.`);
  // per step (the chord's upper notes when there is a bass: the bass is judged on its own below)
  const byStep = new Map();
  for (const h of good) {
    if (!byStep.has(h.k)) byStep.set(h.k, { up: [], bass: [], vel: [] });
    const g = byStep.get(h.k);
    (isBass(h) ? g.bass : g.up).push(h.dt);
    if (!isBass(h) && Number.isFinite(h.vel)) g.vel.push(h.vel);
  }
  const stepDt = [...byStep.entries()].map(([k, g]) => ({ k, dt: mean(g.up.length ? g.up : g.bass) }));
  let rush = null, drag = null;
  if (stepDt.length >= 2) {
    const lo = stepDt.reduce((a, b) => (b.dt < a.dt ? b : a));
    const hi = stepDt.reduce((a, b) => (b.dt > a.dt ? b : a));
    if (lo.dt < -tol) { rush = { k: lo.k, ms: ms(lo.dt) }; lines.push(`Najbardziej się spieszysz: ${stepName(steps, lo.k)}, ${Math.abs(rush.ms)} ms za wcześnie.`); }
    if (hi.dt > tol) { drag = { k: hi.k, ms: ms(hi.dt) }; lines.push(`Najbardziej się spóźniasz: ${stepName(steps, hi.k)}, ${drag.ms} ms za późno.`); }
  }
  // bass vs chord
  let bass = null;
  const pairs = [...byStep.values()].filter((g) => g.up.length && g.bass.length).map((g) => mean(g.bass) - mean(g.up));
  if (pairs.length >= 2) {
    const b = ms(mean(pairs));
    bass = { ms: b, n: pairs.length };
    // within a chord the ear is finer than on the beat: ±15 ms counts as together
    lines.push(Math.abs(b) <= Math.min(15, tolMs) ? `Bas i akord razem (różnica ${Math.abs(b)} ms).` : `Bas wchodzi średnio ${Math.abs(b)} ms ${b > 0 ? 'po akordzie' : 'przed akordem'}.`);
  }
  // dynamics: how even the steps are (mean velocity per step, the bass apart)
  let dyn = null;
  const vs = [...byStep.entries()].filter(([, g]) => g.vel.length).map(([k, g]) => ({ k, v: mean(g.vel) })).sort((a, b) => a.k - b.k);
  if (vs.length >= 4) {
    const spread = Math.round(sd(vs.map((x) => x.v)));
    const avg = mean(vs.map((x) => x.v));
    dyn = { sd: spread, even: spread <= 8, run: null, avg: Math.round(avg) };
    if (dyn.even) lines.push(`Dynamika: równa (±${spread}).`);
    else {
      const thr = Math.max(8, spread);
      let best = null;
      for (const dir of [1, -1]) {
        let i = 0;
        while (i < vs.length) {
          if ((vs[i].v - avg) * dir > thr * 0.75) {
            let j = i;
            // a run: consecutive steps of the pass, all on the same side
            while (j + 1 < vs.length && vs[j + 1].k === vs[j].k + 1 && (vs[j + 1].v - avg) * dir > thr * 0.75) j++;
            const by = Math.round(mean(vs.slice(i, j + 1).map((x) => Math.abs(x.v - avg))));
            const score = by * (j - i + 1);
            if (!best || score > best.score) best = { from: vs[i].k, to: vs[j].k, dir, by, score };
            i = j + 1;
          } else i++;
        }
      }
      if (best) dyn.run = { from: best.from, to: best.to, dir: best.dir > 0 ? 'louder' : 'softer', by: best.by };
      lines.push(`Dynamika: nierówna (±${spread})${best ? `: ${range(best.from, best.to)} ${best.dir > 0 ? 'głośniej' : 'ciszej'} o ok. ${best.by}` : ''}.`);
    }
  }
  return { n, onTime, meanMs: mm, rush, drag, bass, dyn, lines };
}

// --- challenges ---------------------------------------------------------------------------------------------------

/** "Tylko dźwięki akordu": log [{k, note}] against steps with ct (pitch classes of the chord). */
export function chordToneShare(log = [], steps = []) {
  let n = 0, ct = 0;
  for (const e of log) {
    const s = steps[e.k];
    if (!s || !s.ct) continue;
    n++;
    if (s.ct.includes(pcOf(e.note))) ct++;
  }
  return { n, ct, pct: n ? Math.round((ct / n) * 100) : 0 };
}

/**
 * "Tercja na każdej zmianie": at every step that starts a new chord (change, third), was its third played
 * from a moment before the change until one beat after it? log [{t, note}], times [[start, end]] by pass index, idx = step of each.
 */
export function thirdOnChanges(log = [], steps = [], { times = [], idx = [], beat = 1, early = 0.08 } = {}) {
  let n = 0, ok = 0;
  idx.forEach((k, j) => {
    const s = steps[k];
    if (!s || !s.change || s.third == null || !times[j]) return;
    n++;
    const t0 = times[j][0];
    if (log.some((e) => e.t >= t0 - early && e.t <= t0 + beat && pcOf(e.note) === s.third)) ok++;
  });
  return { n, ok };
}

/** One line for a challenge result. */
export function challengeLine(kind, r) {
  if (kind === 'ct') return r.n ? `Wyzwanie: ${r.ct} z ${r.n} dźwięków to dźwięki akordu (${r.pct}%).` : 'Wyzwanie: brak dźwięków do policzenia.';
  if (kind === 'third') return r.n ? `Wyzwanie: ${r.ok} z ${r.n} zmian z tercją.` : 'Wyzwanie: w tej progresji nie ma zmian z tercją.';
  return '';
}

/** The third of a chord (pitch class) or null (power chords, sus). */
export function thirdPc(chord) {
  if (!chord || !chord.tones) return null;
  const i = (chord.roles || []).indexOf('3');
  return i >= 0 && chord.tones[i] ? chord.tones[i].pc : null;
}

/**
 * Time windows for the Jam challenges ("Tercja na każdej zmianie", "Pytanie–odpowiedź").
 * add({start, end, pc|null, lap}) → a window; note(t, pc) marks windows it falls in (pc null = any note);
 * settle(now) closes the windows that ended and counts them (total and per lap).
 */
export class WindowTally {
  constructor() { this.reset(); }
  reset() { this.open = []; this.total = { n: 0, ok: 0 }; this.laps = new Map(); }
  add(w) { this.open.push({ ...w, hit: false }); }
  note(t, pc) {
    for (const w of this.open) if (!w.hit && t >= w.start && t <= w.end && (w.pc == null || w.pc === pc)) w.hit = true;
  }
  settle(now) {
    const done = this.open.filter((w) => w.end < now);
    if (!done.length) return [];
    this.open = this.open.filter((w) => w.end >= now);
    for (const w of done) {
      this.total.n++; if (w.hit) this.total.ok++;
      if (!this.laps.has(w.lap)) this.laps.set(w.lap, { n: 0, ok: 0 });
      const l = this.laps.get(w.lap); l.n++; if (w.hit) l.ok++;
    }
    return done;
  }
  lap(l) { return this.laps.get(l) || { n: 0, ok: 0 }; }
}
