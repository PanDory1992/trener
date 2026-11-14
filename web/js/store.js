// Progress, settings and cards, saved on disk by the server (trener-dane.json).
import { api, getJSON, saveData } from './bus.js';
import { nextLevel, prefs } from './music.js';
import { applyScores, axesOf } from './drill.js';
import { setClick } from './click.js';

export const MODES = {
  kolo: { title: 'Koło tonacji', long: 'Koło tonacji', color: 'var(--c-kolo)', blurb: 'Gamy, akordy i progresje w każdej tonacji, pokazane na klawiszach.' },
  piosenki: { title: 'Piosenki', long: 'Piosenki', color: 'var(--c-song)', blurb: 'Twoje piosenki jako akordy i numery, pod twój głos.' },
  jam: { title: 'Jam', long: 'Jam z zespołem', color: 'var(--c-jam)', blurb: 'Ja gram zespół, ty swoją partię. 18 stylów.' },
  palce: { title: 'Palce', long: 'Palce: palcowanie', color: 'var(--c-palce)', blurb: 'Pozycje, palce na zawołanie, równość palców, kciuk i gamy.' },
  home: { title: 'Plan dnia', long: 'Plan dnia', color: 'var(--c-plan)', blurb: 'Gotowa sesja, gdy nie chcesz wybierać.' },
  echo: { title: 'Echo', long: 'Echo-nauczyciel', color: 'var(--c-echo)', blurb: 'Gram motyw, ty go powtarzasz.' },
  dynamika: { title: 'Echo dynamiki', long: 'Echo dynamiki', color: 'var(--c-dyn)', blurb: 'Kopiujesz kształt głośności frazy.' },
  akordy: { title: 'Siłownia akordów', long: 'Siłownia akordów', color: 'var(--c-akordy)', blurb: 'Akordy i ich układy pod palcami.' },
  docelowe: { title: 'Nuty docelowe', long: 'Gra w nuty docelowe', color: 'var(--c-cel)', blurb: 'Improwizujesz, trafiając w akordy.' },
  ucho: { title: 'Ze słuchu', long: 'Znajdź ze słuchu', color: 'var(--c-ucho)', blurb: 'Gram melodię, ty ją znajdujesz.' },
  aksak: { title: 'Aksak', long: 'Aksak: rytmy bałkańskie', color: 'var(--c-aksak)', blurb: 'Nieparzyste metrum: 7/8, 9/8, 11/8.' },
  improv: { title: 'Improwizacja', long: 'Improwizacja: lewa gra, prawa śpiewa', color: 'var(--c-improv)', blurb: 'Zespół gra pętlę, lewa jest basem, prawa improwizuje według jednej zasady.' },
  fiszki: { title: 'Fiszki', long: 'Fiszki dla rąk', color: 'var(--c-fiszki)', blurb: 'Powtórki tego, co ma zostać w palcach.' },
  wolne: { title: 'Dla przyjemności', long: 'Granie dla przyjemności', color: 'var(--c-plan)', blurb: 'Grasz, co chcesz.' },
};

const DEFAULTS = {
  v: 1,
  settings: { hNames: false, planMinutes: 30, latencyMs: 0, gain: 1, autoCards: true, clicks: true },
  modes: {},
  cards: [],
  days: {},
  sessions: [],
};

export const data = structuredClone(DEFAULTS);
let saveTimer = null;
const changeFns = new Set();

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function load() {
  try {
    const saved = await getJSON('/api/data');
    if (saved && typeof saved === 'object') {
      Object.assign(data, structuredClone(DEFAULTS), saved);
      data.settings = { ...DEFAULTS.settings, ...(saved.settings || {}) };
    }
  } catch { /* first run */ }
  if (!data.at || typeof data.at !== 'object') data.at = {};
  snap = units();
  applySettings();
}

// --- several windows (computer, iMac, iPhone) ----------------------------------------------------------------
// Every setting and every mode's record carries the time it was last changed (data.at["settings.gain"],
// data.at["modes.jam"]). The server keeps the newer one, so a window opened earlier cannot put old settings back,
// and a window learns settings changed elsewhere from the answer to its next save.
let snap = {};
function units() {
  const u = {};
  for (const [k, v] of Object.entries(data.settings || {})) u[`settings.${k}`] = JSON.stringify(v);
  for (const [k, v] of Object.entries(data.modes || {})) u[`modes.${k}`] = JSON.stringify(v);
  return u;
}
function stamp() {
  const now = Date.now();
  for (const [k, j] of Object.entries(units())) if (snap[k] !== j) { data.at[k] = now; snap[k] = j; }
}
function applySettings() {
  prefs.hNames = !!data.settings.hNames;
  setClick(data.settings);
}
const LOCAL = new Set(['key']);   // what this window shows right now: changes elsewhere wait for a reload
function adoptSettings(r) {
  if (!r || typeof r.settings !== 'object' || typeof r.at !== 'object' || !r.settings || !r.at) return;
  let changed = false;
  for (const [k, v] of Object.entries(r.settings)) {
    const unit = `settings.${k}`;
    if (LOCAL.has(k) || !((r.at[unit] || 0) > (data.at[unit] || 0))) continue;
    data.settings[k] = v;
    data.at[unit] = r.at[unit];
    snap[unit] = JSON.stringify(v);
    changed = true;
  }
  if (changed) applySettings();
}

export function save(now = false) {
  clearTimeout(saveTimer);
  // the server merges what other windows saved (iPhone + computer): take their progress back in
  const run = () => { stamp(); return saveData(data).then((r) => {
    adoptSettings(r);
    if (r && r.mastery && typeof r.mastery === 'object') {
      if (!data.mastery) data.mastery = {};
      for (const [k, v] of Object.entries(r.mastery)) {
        const mine = data.mastery[k];
        if (!mine || (v.passes || 0) > (mine.passes || 0)) data.mastery[k] = v;
      }
    }
    if (Array.isArray(r && r.songs)) {
      // songs added in another window show up here too (deleted ones stay deleted: the server keeps the list)
      const have = new Set((data.songs || []).map((s) => s.id));
      const gone = new Set(data.songsDeleted || []);
      for (const s of r.songs) if (!have.has(s.id) && !gone.has(s.id)) (data.songs || (data.songs = [])).push(s);
    }
  }).catch(() => {}); };
  if (now) return run();
  saveTimer = setTimeout(run, 800);
  for (const fn of changeFns) fn();
  return null;
}
export function flush() {
  stamp();
  try { navigator.sendBeacon(api('/api/data'), new Blob([JSON.stringify(data)], { type: 'application/json' })); } catch { save(true); }
}
export function onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); }

export function mode(id) {
  if (!data.modes[id]) data.modes[id] = { level: 1, hist: [], lastDay: null, best: 1 };
  return data.modes[id];
}

/** Record one graded attempt; moves the level. Returns {before, after}. */
export function record(id, passed, { adjust = true } = {}) {
  const m = mode(id);
  const before = m.level;
  if (adjust) m.level = nextLevel(m.level, passed);
  m.best = Math.max(m.best || 1, m.level);
  m.hist = [...m.hist, { d: today(), ok: !!passed }].slice(-60);
  m.lastDay = today();
  const day = dayRec();
  day.tries = (day.tries || 0) + 1;
  day.ok = (day.ok || 0) + (passed ? 1 : 0);
  save();
  return { before, after: m.level };
}

/** The exercise's difficulty axes (1.10); an old record starts every axis at its one level. */
export function axes(id, names) { return axesOf(mode(id), names); }

/** One counted attempt with a score per axis (0–100, null = not tested). Returns {before, after, levelBefore, levelAfter}. */
export function recordScores(id, names, scores, passed) {
  const r = applyScores(mode(id), names, scores, passed, today());
  const day = dayRec();
  day.tries = (day.tries || 0) + 1;
  day.ok = (day.ok || 0) + (passed ? 1 : 0);
  save();
  return r;
}

/** A finished series, for Plan dnia. */
export function logSeries(id, sum) {
  const day = dayRec();
  day.series = [...(day.series || []), { id, n: sum.n, ok: sum.ok, avg: sum.avg, at: Date.now() }].slice(-40);
  save();
}

export function successRate(id, n = 20) {
  const h = mode(id).hist.slice(-n);
  if (!h.length) return null;
  return h.filter((x) => x.ok).length / h.length;
}

export function daysSince(id) {
  const last = mode(id).lastDay;
  if (!last) return null;
  return Math.round((new Date(today() + 'T12:00') - new Date(last + 'T12:00')) / 86400000);
}

export function dayRec(d = today()) {
  if (!data.days[d]) data.days[d] = { sec: 0, notes: 0 };
  return data.days[d];
}

export function levelWord(level) {
  if (level < 3) return 'rozgrzewka';
  if (level < 5) return 'podstawy';
  if (level < 7) return 'średni';
  if (level < 9) return 'zaawansowany';
  return 'mistrzowski';
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}
