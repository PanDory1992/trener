// The brain shared by the exercises (Echo, Echo dynamiki, Siłownia, Nuty docelowe, Ze słuchu, Aksak). Pure: no DOM,
// tested in node (tests/drill.test.js).
//
//  - a score 0–100 per attempt instead of pass/fail; the level moves in proportion to it;
//  - several difficulty axes per exercise (Echo: melody, rhythm, dynamics): only the axis you missed gets easier;
//  - the error loop (Coach): a miss → the same item again; a second miss → an easier version, then the full one;
//    a missed item comes back a few items later (spaced, interleaved);
//  - a series of attempts (10) with a summary.

export const PASS = 80;            // score at which an axis neither rises nor falls much
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 12;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round2 = (x) => Math.round(x * 100) / 100;

/**
 * New level after an attempt with `score` (0–100).
 * At or above PASS: +0.10 … +0.25 (a perfect attempt). Below: −0.25 (a near miss) … −1.0 (nothing right).
 * A near miss costs as much as a perfect attempt gains, a total miss four times that, so the level settles where
 * most attempts land just above PASS.
 */
export function stepLevel(level, score, pass = PASS) {
  const s = clamp(Number(score) || 0, 0, 100);
  const d = s >= pass ? 0.1 + 0.15 * (s - pass) / (100 - pass) : -(0.25 + 0.75 * (pass - s) / pass);
  return round2(clamp(level + d, LEVEL_MIN, LEVEL_MAX));
}

/** The exercise's axes as {name: level}; an old record (one level) starts every axis at that level. */
export function axesOf(rec, names) {
  const base = clamp(Number(rec && rec.level) || 1, LEVEL_MIN, LEVEL_MAX);
  const old = (rec && rec.axes) || {};
  const out = {};
  for (const n of names) out[n] = Number.isFinite(old[n]) ? old[n] : base;
  return out;
}

/** One number for the nav and the plan: the mean of the axes. */
export function overall(axes) {
  const v = Object.values(axes);
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : 1;
}

/** Total score of an attempt from the scores of the axes it tested (null = not tested). */
export function totalScore(scores) {
  const v = Object.values(scores).filter((x) => Number.isFinite(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

/**
 * Apply one counted attempt to a mode record (mutates it). scores: {axis: 0–100 | null}.
 * Returns {before, after} as axes, plus the overall levels.
 */
export function applyScores(rec, names, scores, passed, day) {
  const before = axesOf(rec, names);
  const after = { ...before };
  for (const n of names) if (Number.isFinite(scores[n])) after[n] = stepLevel(before[n], scores[n]);
  rec.axes = after;
  rec.level = overall(after);
  rec.best = Math.max(rec.best || 1, rec.level);
  rec.hist = [...(rec.hist || []), { d: day, ok: !!passed, s: totalScore(scores) }].slice(-60);
  rec.lastDay = day;
  return { before, after, levelBefore: overall(before), levelAfter: rec.level };
}

// --- the error loop ------------------------------------------------------------------------------------------------
export const SAY = {
  retry: 'Jeszcze raz ten sam.',
  simplify: 'Teraz łatwiej: wolniej i z podpowiedzią.',
  full: 'I znowu w całości.',
  comeback: 'Powrót: ten sprzed chwili.',
};

/**
 * Coach: decides what comes after an attempt. One per mounted exercise.
 *   begin(item, {comeback}) before presenting an item;
 *   after(passed) → 'next' | 'retry' | 'simplify' | 'full';
 *   counts → true when the attempt being graded is the item's first (it moves the level and goes into the series);
 *   take(makeFresh) → a due comeback or a fresh item.
 * Comebacks: an item missed on its first attempt comes back after `gap` other items, once.
 */
export class Coach {
  constructor({ gap = 4 } = {}) {
    this.gap = gap;
    this.served = 0;          // items begun (fresh or comeback)
    this.queue = [];          // [{item, due}]
    this.cur = null;          // {item, tries, stage: 'full'|'easy'|'rebuild', comeback}
  }

  begin(item, { comeback = false } = {}) {
    this.served++;
    this.cur = { item, tries: 0, stage: 'full', comeback, queued: comeback };
  }

  get counts() { return !!this.cur && this.cur.tries === 0 && this.cur.stage === 'full'; }
  get stage() { return this.cur ? this.cur.stage : 'full'; }
  get isComeback() { return !!(this.cur && this.cur.comeback && this.cur.tries === 0); }

  after(passed) {
    const c = this.cur;
    if (!c) return 'next';
    c.tries++;
    if (!passed && !c.queued) { this.queue.push({ item: c.item, due: this.served + this.gap }); c.queued = true; }
    if (c.stage === 'easy') { c.stage = 'rebuild'; return 'full'; }
    if (passed) return 'next';
    if (c.stage === 'rebuild') return 'next';      // tried easier and full again: move on, it comes back later
    if (c.tries === 1) return 'retry';
    c.stage = 'easy';
    return 'simplify';
  }

  /** Next item: a comeback whose turn it is, else makeFresh(). Returns {item, comeback}. */
  take(makeFresh) {
    const i = this.queue.findIndex((q) => q.due <= this.served);
    if (i >= 0) {
      const { item } = this.queue.splice(i, 1)[0];
      this.begin(item, { comeback: true });
      return { item, comeback: true };
    }
    const item = makeFresh();
    this.begin(item);
    return { item, comeback: false };
  }
}

// --- series ------------------------------------------------------------------------------------------------------------
export const SERIES_LEN = 10;

/** A series of counted attempts. add() after each; summary() when done. */
export class Series {
  constructor(names, axesStart, len = SERIES_LEN) {
    this.names = names;
    this.start = { ...axesStart };
    this.len = len;
    this.items = [];   // {score, passed, tip}
  }

  add(score, passed, tip = null) { this.items.push({ score, passed, tip }); }
  get count() { return this.items.length; }
  get done() { return this.items.length >= this.len; }

  /** {n, ok, avg, axes:[{name, from, to}], tip, best, worst} */
  summary(axesNow) {
    const n = this.items.length;
    const ok = this.items.filter((x) => x.passed).length;
    const avg = n ? Math.round(this.items.reduce((s, x) => s + x.score, 0) / n) : 0;
    // the most frequent kind of advice in the series, said with its latest text
    const byKind = new Map();
    for (const x of this.items) if (x.tip && x.tip.kind) byKind.set(x.tip.kind, { n: (byKind.get(x.tip.kind)?.n || 0) + 1, text: x.tip.text });
    let tip = null;
    for (const [kind, v] of byKind) if (!tip || v.n > tip.n) tip = { kind, n: v.n, text: v.text };
    return {
      n, ok, avg,
      axes: this.names.map((name) => ({ name, from: this.start[name], to: axesNow[name] })),
      tip: tip && tip.n >= 2 ? tip : null,
    };
  }
}

// --- the ladder: what a level means, in words ----------------------------------------------------------------------
/**
 * ladder: [[fromLevel, text], ...] in rising order. Returns {now, next, nextAt}.
 */
export function rung(ladder, level) {
  let now = ladder[0];
  let next = null;
  for (const r of ladder) {
    if (r[0] <= level + 1e-9) now = r;
    else { next = r; break; }
  }
  return { now: now[1], next: next ? next[1] : null, nextAt: next ? next[0] : null };
}
