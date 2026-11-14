// The common look of the exercises (1.10): header with "Teraz / Dalej", the verdict with one piece of advice, the same
// play-bar buttons everywhere, and the series summary. The logic lives in drill.js (pure) and ladders.js.
import * as store from './store.js';
import { el, fill, status } from './ui.js';
import { describe, AXES, axisNames } from './ladders.js';
import { Series, SERIES_LEN, selfBand, selfStats, coldTrend, dueDebt, settleDebt, addDebt, speedCurve } from './drill.js';

const fmt = (x) => x.toFixed(1).replace('.', ',');

/**
 * One exercise's frame. Returns {head, refresh(), counted(scores, passed, tip) → {change, summary|null}, axes(), names,
 * series}. counted() records an attempt that counts (moves the level, goes into the series).
 */
export function createDrill(id, { title, about, focus = () => null }) {
  const names = axisNames(id);
  const labels = Object.fromEntries(AXES[id]);
  const seen = store.data.settings.seenAbout || {};
  const ladder = el('div', { class: 'drill-ladder', 'aria-live': 'polite' });
  const aboutBox = el('details', { class: 'drill-about', open: !seen[id] }, el('summary', {}, 'Jak to działa'), el('p', {}, about));
  if (!seen[id]) { store.data.settings.seenAbout = { ...seen, [id]: true }; store.save(); }
  const head = el('header', { class: 'mode-head drill-head' },
    el('div', { class: 'mode-title' }, el('h1', {}, title), aboutBox),
    ladder);
  let series = new Series(names, store.axes(id, names));

  function refresh() {
    const ax = store.axes(id, names);
    const d = describe(id, ax, { focus: focus() });
    const level = store.mode(id).level;
    fill(ladder,
      el('div', { class: 'dl-now' }, el('span', { class: 'dl-k' }, 'Teraz'),
        d.now.map((x) => el('div', { class: `dl-ax ${x.off ? 'off' : ''}` }, names.length > 1 ? el('b', {}, `${x.label}: `) : null, x.text))),
      d.next ? el('div', { class: 'dl-next' }, el('span', { class: 'dl-k' }, 'Dalej'), el('div', {}, names.length > 1 ? el('b', {}, `${d.next.label}: `) : null, d.next.text)) : null,
      el('div', { class: 'dl-meta' },
        el('span', { title: 'Średnia osi. Rośnie po dobrej próbie, spada po słabej, tym bardziej, im słabsza.' }, `poziom ${fmt(level)}`),
        el('span', { class: 'dl-series', title: 'Seria 10 prób, potem podsumowanie.' }, `seria ${series.count}/${series.len}`)));
  }

  function counted(scores, passed, tip) {
    const rec = store.mode(id);
    const total = Object.values(scores).filter(Number.isFinite);
    const score = total.length ? Math.round(total.reduce((a, b) => a + b, 0) / total.length) : 0;
    // cold start (1.11): the first counted attempt of the day is kept apart; it shows what stayed overnight
    const day = store.today();
    const cold = rec.coldDay !== day;
    if (cold) {
      const kept = Object.entries(rec.cold || {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-29);
      rec.cold = Object.fromEntries([...kept, [day, score]]);
      rec.coldDay = day;
    }
    const r = store.recordScores(id, names, scores, passed);
    series.add(score, passed, tip);
    let summary = null;
    if (series.done) {
      summary = series.summary(store.axes(id, names));
      summary.cold = coldTrend(rec.cold, day);
      summary.self = selfStats((rec.self || []).slice(-30));
      if (rec.speed && rec.speed.length) summary.speed = speedCurve(rec.speed);
      store.logSeries(id, summary);
      series = new Series(names, store.axes(id, names));
    }
    refresh();
    return { change: r, summary, cold, score };
  }

  // Rewanż (1.11): what failed on an earlier day comes first, one shot
  const debts = {
    due: () => dueDebt(store.mode(id).debts, store.today()),
    add: (item) => { const rec = store.mode(id); rec.debts = addDebt(rec.debts, item, store.today()); store.save(); },
    settle: (debt, passed) => { const rec = store.mode(id); rec.debts = settleDebt(rec.debts, debt, passed, store.today()); store.save(); },
  };

  // "Jak poszło?" (1.11): your own verdict before the real one. C56 dobrze, C57 średnio, C58 źle.
  let asking = null;
  function ask(wrap, timeout = 5000) {
    if (store.data.settings.selfCheck === false) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (band) => { if (!asking) return; clearTimeout(asking.timer); asking = null; resolve(band); };
      const b = (band, label, key) => el('button', { class: `btn self-${band}`, onclick: () => done(band) }, label, el('kbd', {}, key));
      fill(wrap, status('Jak poszło?', 'turn'),
        el('div', { class: 'self-ask' }, b('good', 'Dobrze', 'C56'), b('mid', 'Średnio', 'C57'), b('bad', 'Źle', 'C58'),
          el('span', { class: 'muted' }, 'Najpierw twoja ocena, potem moja.')));
      asking = { done, timer: setTimeout(() => done(null), timeout) };
    });
  }
  function pilotAnswer(a) {
    if (!asking) return false;
    asking.done({ start: 'good', repeat: 'mid', hint: 'bad' }[a] || null);
    return true;
  }
  /** Keep the self-verdict; returns a short line for under the tip, or null. */
  function recordSelf(self, score, scores) {
    if (!self) return null;
    const rec = store.mode(id);
    const actual = selfBand(score);
    const tested = Object.entries(scores).filter(([, v]) => Number.isFinite(v));
    const weak = tested.length > 1 ? tested.sort((a, b) => a[1] - b[1])[0][0] : null;
    rec.self = [...(rec.self || []), { self, actual, weak }].slice(-60);
    store.save();
    const W = { good: 'dobrze', mid: 'średnio', bad: 'źle' };
    return self === actual ? `Twoja ocena: ${W[self]}. Zgadza się.` : `Twoja ocena: ${W[self]}, moja: ${W[actual]}${weak && self === 'good' ? ` (${labels[weak].toLowerCase()})` : ''}.`;
  }

  refresh();
  return {
    head, refresh, counted, names, labels, get series() { return series; }, axes: () => store.axes(id, names),
    debts, ask, pilotAnswer, recordSelf, get asking() { return !!asking; },
  };
}

/**
 * Details on demand (1.11): the chips and charts stay folded under the verdict; C58 or a click opens them.
 * The open state is remembered per exercise.
 */
export function details(id, nodes) {
  const open = !!(store.data.settings.detailsOpen || {})[id];
  const d = el('details', { class: 'drill-detail', open },
    el('summary', {}, 'Szczegóły', el('kbd', {}, 'C58')),
    el('div', {}, nodes.filter(Boolean)));
  d.addEventListener('toggle', () => { store.data.settings.detailsOpen = { ...(store.data.settings.detailsOpen || {}), [id]: d.open }; store.save(); });
  return d;
}

/** C58 in the result: open or close the details. Returns true when there was something to toggle. */
export function toggleDetails(root) {
  const d = root.querySelector('.drill-detail');
  if (!d) return false;
  d.open = !d.open;
  return true;
}

/** A line under the tip (your own verdict, a variation note). */
export function addLine(wrap, text) {
  if (text) wrap.append(el('p', { class: 'self-line' }, text));
}

/** The big verdict line and, under it, one piece of advice. */
export function verdict(wrap, text, kind = '', tip = null) {
  fill(wrap, status(text, kind), tip && tip.text ? el('p', { class: `drill-tip ${tip.kind ? '' : 'praise'}` }, tip.text) : null);
}

/**
 * The play bar: ▶ primary · ↺ Jeszcze raz · Podpowiedź · ⋯ (more). Same everywhere; the pilot keys do the same
 * (C56 primary, C57 again, C58 hint, C59 pause). Returns {node, setPrimary(label)}.
 */
export function drillDock({ primary = 'Start', onPrimary, onRepeat = null, repeatLabel = 'Jeszcze raz', onHint = null, more = [] }) {
  const prim = el('button', { class: 'btn primary', onclick: () => onPrimary() }, primary);
  const extra = more.filter(Boolean);
  const menu = extra.length ? el('details', { class: 'drill-more' },
    el('summary', { class: 'btn', 'aria-label': 'Więcej' }, '⋯'),
    el('div', { class: 'drill-menu' }, extra.map(([label, fn]) => el('button', { class: 'btn small ghost', onclick: (e) => { e.target.closest('details').open = false; fn(); } }, label)))) : null;
  const node = el('div', { class: 'actions' },
    prim,
    onRepeat ? el('button', { class: 'btn', onclick: () => onRepeat() }, repeatLabel) : null,
    onHint ? el('button', { class: 'btn', onclick: () => onHint() }, 'Podpowiedź') : null,
    menu);
  return { node, setPrimary: (label) => { prim.textContent = label; } };
}

/** The series summary card. */
export function seriesCard(sum, labels, onNext) {
  const arrow = (a) => (a.to > a.from + 0.04 ? 'up' : a.to < a.from - 0.04 ? 'down' : 'same');
  return el('div', { class: 'drill-summary' },
    el('h2', {}, `Seria: ${sum.ok} z ${sum.n} udanych`),
    el('p', { class: 'ds-avg' }, `Średnio ${sum.avg} punktów na 100.`),
    el('div', { class: 'ds-axes' }, sum.axes.map((a) => el('div', { class: `ds-ax ${arrow(a)}` },
      el('b', {}, labels[a.name] || a.name), el('span', {}, `${fmt(a.from)} → ${fmt(a.to)}`)))),
    coldLine(sum.cold),
    sum.self && sum.self.n >= 4 ? el('p', { class: 'ds-line' }, el('b', {}, 'Ucho na siebie: '), `trafiasz ${sum.self.hits} z ${sum.self.n} własnych ocen${sum.self.weakest && sum.self.over >= 2 ? `; najczęściej przeceniasz: ${(labels[sum.self.weakest.axis] || sum.self.weakest.axis).toLowerCase()}` : ''}.`) : null,
    sum.speed ? speedLine(sum.speed) : null,
    sum.tip ? el('p', { class: 'ds-tip' }, el('b', {}, 'Najczęściej: '), sum.tip.text)
      : el('p', { class: 'ds-tip' }, sum.ok * 2 < sum.n ? 'Trudna seria. Poziom już się dopasował: następna będzie trochę łatwiejsza.' : 'Bez powtarzającego się błędu. Tak trzymaj.'),
    el('button', { class: 'btn primary', onclick: () => onNext() }, 'Następna seria'));
}

function coldLine(c) {
  if (!c || c.today == null) return null;
  const vs = c.prev == null ? '' : c.today > c.prev + 4 ? `, wcześniej średnio ${c.prev}: idzie w górę` : c.today < c.prev - 4 ? `, wcześniej średnio ${c.prev}` : `, jak średnio wcześniej (${c.prev})`;
  return el('p', { class: 'ds-line' }, el('b', {}, 'Zimny start dziś: '), `${c.today} pkt${vs}. To pokazuje, co zostało z poprzednich dni.`);
}

/** Speed vs accuracy: one bar per tempo bin; the border tempo marked. */
function speedLine(sp) {
  const bins = sp.bins.filter((b) => b.n >= 1);
  if (bins.length < 2) return null;
  return el('div', { class: 'ds-speed' },
    el('p', { class: 'ds-line' }, el('b', {}, 'Tempo graniczne: '), sp.border ? `ok. ${Math.round(sp.border)} BPM. Najlepiej ćwiczyć na ${Math.round(sp.border * 0.85)}–${Math.round(sp.border * 0.9)} BPM.` : 'jeszcze za mało prób w różnych tempach.'),
    el('div', { class: 'speed-bars', 'aria-label': 'Wynik rytmu w różnych tempach' }, bins.map((b) => el('span', { class: b.avg >= 80 ? 'ok' : '', title: `${b.tempo}–${b.tempo + 7} BPM: średnio ${b.avg} (${b.n})`, style: { height: `${Math.max(8, b.avg)}%` } }, el('i', {}, String(b.tempo))))));
}

export { SERIES_LEN };
