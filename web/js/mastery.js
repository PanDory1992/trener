// "Umiem": progress per thing you practise (a scale, a chord family, a progression…), counted by the
// quality of passes, not by minutes or days. Lights fade as you get it right; "umiem" means
// three clean passes in time with the lights fully off.
//
// Stages: 0 nowe · 1 ze światłami (completed once with lights) · 2 w tempie (clean in time)
//         3 umiem (3 clean passes in a row, in time, lights off)
// fade:   0 full lights · 1 outlines only · 2 lights only when you hesitate · 3 no lights

export const STAGE_NAMES = ['nowe', 'ze światłami', 'w tempie', 'umiem'];
export const FADE_NAMES = ['pełne światła', 'tylko obrysy', 'światła, gdy się zawahasz', 'bez świateł'];
export const NEED_CLEAN = 3;
// Powtórki: once a thing is "umiem", a review comes after 1, 2, 4, 7, 15, then every 30 days.
// A review = one pass without lights: W tempie with the lights off, or Bez świateł.
// Clean → the next interval. Not clean → back to "w tempie" (the arc on the wheel dims), again tomorrow;
// a clean review then brings "umiem" back.
export const REVIEW_DAYS = [1, 2, 4, 7, 15, 30];
const TAIL = 6;   // how many recent passes the record remembers ('c' clean, 'x' not)

let store = null;   // injected (browser: store.js data; tests: a plain object)

export function bind(dataObj) { store = dataObj; }

function all() {
  if (!store.mastery) store.mastery = {};
  return store.mastery;
}

/** Local calendar day + n days, as YYYY-MM-DD (no UTC shift). */
export function addDay(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const t = new Date(y, (m || 1) - 1, (d || 1) + n, 12);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
export function daysBetween(a, b) {
  const p = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  return Math.round((p(b) - p(a)) / 86400000);
}

/** When the next review is due (YYYY-MM-DD) or null. "Umiem" from before reviews existed: the day after the last pass. */
export function dueOf(r) {
  if (!r) return null;
  if (r.due) return r.due;
  if (r.stage >= 3 && r.last) return addDay(r.last, 1);
  return null;
}

/** Is this record waiting for a review on `day`? */
export function isDue(r, day) {
  const d = dueOf(r);
  return !!(d && day && d <= day && r.stage >= 2);
}

/** Ids of things to review today, the oldest due first. */
export function dueReviews(day) {
  return Object.entries(all())
    .filter(([, r]) => r && typeof r === 'object' && isDue(r, day))
    .sort((a, b) => dueOf(a[1]).localeCompare(dueOf(b[1])) || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** Things with a review coming later (for the list in Fiszki): [{id, due, step}] soonest first. */
export function upcomingReviews(day) {
  return Object.entries(all())
    .filter(([, r]) => r && typeof r === 'object' && r.stage >= 2 && dueOf(r) && !isDue(r, day))
    .map(([id, r]) => ({ id, due: dueOf(r), step: r.step || 0 }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}

export function get(id) {
  const r = all()[id];
  return r ? { stage: 0, fade: 0, cleanRun: 0, best: 0, passes: 0, ...r } : { stage: 0, fade: 0, cleanRun: 0, best: 0, passes: 0 };
}

/**
 * Count one finished pass. way: 'wait' | 'tempo' | 'dark'. done/total: steps played right.
 * fadeUsed: the light level during that pass (an "always full lights" pass never counts as lights-off).
 * Returns {before, after, events: [..]} — events are short Polish sentences worth showing.
 */
export function recordPass(id, { way, done, total, tempo = 0, fadeUsed = 0, day = '', clean: cleanSteps, ts = 0 }) {
  const before = get(id);
  const r = { ...before };
  const clean = total > 0 && done >= total;
  const events = [];
  r.passes += 1;
  if (day) r.last = day;
  if (!r.first && day && before.passes === 0) { r.first = day; r.firstTs = ts || Math.round(Date.now() / 1000); }   // only truly new things
  // the pass as one letter for "recent passes": in time it must be clean, otherwise without a single miss
  const passOk = way === 'tempo' ? clean : total > 0 && (cleanSteps == null ? done : cleanSteps) >= total;
  r.tail = `${before.tail || ''}${passOk ? 'c' : 'x'}`.slice(-TAIL);
  if (way === 'wait' || way === 'dark') {
    if (done >= total && r.stage < 1) { r.stage = 1; events.push('Pierwszy raz całość: etap „ze światłami”.'); }
  } else if (way === 'tempo') {
    if (clean) {
      if (r.stage < 2) { r.stage = 2; events.push('Czysto w tempie: etap „w tempie”.'); }
      if (tempo > r.best) r.best = tempo;
      if (fadeUsed >= 3) {
        r.cleanRun += 1;
        if (r.cleanRun >= NEED_CLEAN && r.stage < 3) { r.stage = 3; events.push('UMIEM: trzy czyste przejścia bez świateł.'); }
      } else {
        r.cleanRun = 0;
      }
      // lights fade only after a clean pass at the current level (not with lights forced full)
      if (r.fade < 3 && fadeUsed >= r.fade) { r.fade += 1; events.push(`Światła przygasają: ${FADE_NAMES[r.fade]}.`); }
    } else {
      r.cleanRun = 0;
      if (total > 0 && done / total < 0.7 && r.fade > 0) { r.fade -= 1; events.push(`Więcej światła: ${FADE_NAMES[r.fade]}.`); }
    }
  }
  // --- powtórki ---
  let review = null;
  const lightsOff = (way === 'tempo' && fadeUsed >= 3) || way === 'dark';
  if (day && lightsOff && isDue(before, day)) {
    const step = before.due ? (before.step || 0) : 0;
    if (passOk) {
      r.step = Math.min(REVIEW_DAYS.length - 1, step + 1);
      r.due = addDay(day, REVIEW_DAYS[r.step]);
      if (r.stage < 3) { r.stage = 3; r.cleanRun = Math.max(r.cleanRun, NEED_CLEAN); }
      review = { ok: true, days: REVIEW_DAYS[r.step], due: r.due };
      events.push(`Powtórka czysta${before.stage < 3 ? ': znowu „umiem”' : ''}. Następna za ${review.days} ${review.days === 1 ? 'dzień' : 'dni'}.`);
    } else {
      r.stage = Math.min(r.stage, 2);
      r.cleanRun = 0;
      r.step = 0;
      r.due = addDay(day, 1);
      r.lapses = (before.lapses || 0) + 1;
      review = { ok: false, days: 1, due: r.due };
      events.push('Powtórka się posypała: etap „w tempie”, jeszcze raz jutro.');
    }
  } else if (day && r.stage >= 3 && before.stage < 3) {
    // just got "umiem" (also again, after a lapse): the first review tomorrow
    r.step = 0;
    r.due = addDay(day, REVIEW_DAYS[0]);
    events.push('Pierwsza powtórka: jutro.');
  }
  const out = {};
  for (const k of ['stage', 'fade', 'cleanRun', 'best', 'passes', 'last', 'first', 'firstTs', 'tail', 'due', 'step', 'lapses']) {
    const v = k === 'last' ? (r.last || before.last) : r[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  all()[id] = out;
  return { before, after: get(id), events, review };
}

/** Summary per key prefix (e.g. "major0|"): how many things started and how many "umiem". */
export function keySummary(prefix) {
  let started = 0, known = 0;
  const knownList = [], startedList = [];
  for (const [id, r] of Object.entries(all())) {
    if (!id.startsWith(prefix)) continue;
    if (r.stage >= 3) { known++; knownList.push(id); }
    else if (r.stage >= 1) { started++; startedList.push(id); }
  }
  return { started, known, knownList, startedList };
}

/** 3 dots as a short string, for titles. */
export function dotsText(r) {
  return `${r.stage >= 1 ? '●' : '○'}${r.stage >= 2 ? '●' : '○'}${r.stage >= 3 ? '●' : '○'}`;
}
