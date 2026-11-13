// 6. Dynamics echo: copy the shape of loudness, not just the notes.
import * as bus from '../bus.js';
import { dynamicsPhrase, gradeDynamics, motifEvents, noteName, SHAPES } from '../music.js';
import * as store from '../store.js';
import { curveChart, el, legend, levelHeader, refreshLevel, status, verdictChips, fill, add } from '../ui.js';
import { Capture, Looper, playEvents, seed } from './common.js';
import { loopOn } from '../loop.js';

export const id = 'dynamika';

export function mount(stage, ctx) {
  let phrase = null;
  let capture = null;
  let phase = 'idle';
  let alive = true;
  let firstTry = true;
  let autoNext = null;
  const looper = new Looper();

  const head = levelHeader(id, 'Echo dynamiki', 'Zagram frazę, która rośnie, opada albo ma akcenty. Dźwięki widzisz niżej. Twoje zadanie to skopiować kształt głośności. Rytm tu się nie liczy.');
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const notesRow = el('div', { class: 'note-row' });
  const result = el('div', { class: 'result' });
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn primary', onclick: () => next() }, 'Start'),
    el('button', { class: 'btn', onclick: () => phrase ? present(phrase) : next() }, 'Zagraj jeszcze raz'));
  add(stage, head, line, notesRow, result);
  ctx.dock(actions);

  const setStatus = (t, k = '') => fill(line, status(t, k));

  function showNotes(p, played = 0) {
    fill(notesRow, 
      el('p', { class: 'shape' }, `Kształt: ${SHAPES[p.shape]}`),
      el('div', { class: 'note-chips' }, p.notes.map((n, i) => el('span', { class: `nchip ${i < played ? 'done' : ''}` }, noteName(n.p, p.flat, false)))));
  }

  async function present(p) {
    phase = 'listen';
    clearTimeout(autoNext);
    capture && capture.cancel();
    fill(result, );
    showNotes(p);
    setStatus('Słuchaj, jak zmienia się głośność…', 'listen');
    const sched = motifEvents(p, { countIn: 2 });
    let t0;
    try { t0 = await looper.start(sched.events, sched.seconds, { gap: 0.3 }); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    capture = new Capture({ notBefore: t0 + sched.starts[sched.starts.length - 1] + 0.05, expected: p.notes.length, quiet: 3, settle: 0.9, onUpdate: (ns) => { showNotes(p, ns.length); setStatus(`Twoja kolej: ${ns.length} z ${p.notes.length}`, 'turn'); } });
    bus.at(t0 + sched.seconds, () => { if (alive && phase === 'listen') { phase = 'turn'; setStatus(loopOn() ? 'Twoja kolej: ten sam kształt. Gram w pętli, aż zaczniesz.' : 'Twoja kolej: ten sam kształt', 'turn'); } });
    const got = await capture.done;
    if (!alive || !got) return;
    grade(p, got);
  }

  function grade(p, got) {
    phase = 'result';
    const g = gradeDynamics(p, got);
    let lvl = null;
    if (firstTry) { lvl = store.record(id, g.passed); refreshLevel(stage, id); }
    firstTry = false;
    setStatus(g.passed ? 'Kształt złapany.' : 'Jeszcze raz, z uchem na głośność.', g.passed ? 'good' : 'bad');
    fill(result, 
      verdictChips([
        ['Kształt', g.r >= 0.75 || g.ok, `zgodność ${Math.round(Math.max(0, g.r) * 100)}%`],
        ['Poziom', Math.abs(g.levelDiff) <= 18, g.levelDiff > 4 ? `głośniej o ${Math.round(g.levelDiff)}` : g.levelDiff < -4 ? `ciszej o ${Math.round(-g.levelDiff)}` : 'w punkt'],
        ['Rozpiętość', g.range >= 0.55 && g.range <= 1.7, g.range < 0.85 ? 'za płasko' : g.range > 1.3 ? 'za ostro' : 'dobra'],
        g.complete ? null : ['Nuty', false, `zagrane ${got.length} z ${p.notes.length}`],
      ]),
      curveChart(g.target, g.user),
      legend([['want-line', 'wzór'], ['you-line', 'ty']]),
      el('p', { class: 'tips' }, g.tips.join(' ')),
      lvl && lvl.after !== lvl.before ? el('p', { class: 'level-change' }, `Poziom: ${lvl.after.toFixed(1)}`) : null,
    );
    if (g.passed) autoNext = setTimeout(() => alive && phase === 'result' && next(), 3000);
  }

  function next() {
    firstTry = true;
    phrase = dynamicsPhrase(store.mode(id).level, seed());
    present(phrase);
  }

  return {
    onNote(e) { if (e.on && looper.active) looper.stop(); if (capture) capture.feed(e); },
    onPilot(a) {
      if (a === 'start' && phase !== 'listen') next();
      if (a === 'repeat' && phrase) present(phrase);
      if (a === 'hint' && phrase) setStatus(`Podpowiedź: ${SHAPES[phrase.shape]}. Najcichsza nuta ok. ${Math.min(...phrase.notes.map((n) => n.v))}, najgłośniejsza ${Math.max(...phrase.notes.map((n) => n.v))}.`, 'listen');
      if (a === 'pause') { looper.stop(); clearTimeout(autoNext); capture && capture.cancel(); bus.stop(); phase = 'idle'; setStatus('Pauza.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(autoNext); capture && capture.cancel(); bus.stop(); },
  };
}
