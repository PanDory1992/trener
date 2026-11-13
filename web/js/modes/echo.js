// 1. Echo: I play a motif, you play it back.
import * as bus from '../bus.js';
import { echoMotif, gradeEcho, motifEvents, noteName, SCALES } from '../music.js';
import * as store from '../store.js';
import { el, levelHeader, refreshLevel, rollChart, status, toast, verdictChips, legend, fill, add } from '../ui.js';
import { Capture, Looper, playEvents, seed } from './common.js';
import { loopOn } from '../loop.js';

export const id = 'echo';

export function mount(stage, ctx) {
  const card = ctx.card || null;
  let motif = card ? card.payload : null;
  let capture = null;
  let phase = 'idle';
  let alive = true;
  let firstTry = true;
  let autoNext = null;
  let lastAttempt = null;
  const looper = new Looper();

  const head = card ? el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, card.title), el('p', { class: 'mode-sub' }, 'Fiszka: powtórz motyw.')))
    : levelHeader(id, 'Echo-nauczyciel', 'Gram krótki motyw. Posłuchaj i zagraj go tak samo: te same dźwięki, ten sam rytm, a na wyższych poziomach ta sama dynamika.');
  const line = el('div', { class: 'status-wrap' }, status('Gotowy? Naciśnij Start albo C56.'));
  const info = el('div', { class: 'trial-info' });
  const result = el('div', { class: 'result' });
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn primary', onclick: () => next() }, 'Start'),
    el('button', { class: 'btn', onclick: () => replay() }, 'Zagraj jeszcze raz'),
    card ? null : el('button', { class: 'btn ghost', onclick: () => addCard() }, 'Dodaj do fiszek'));
  add(stage, head, line, info, result);
  ctx.dock(actions);   // Start and the rest: in the play bar above the keys, like in the main modes

  function setStatus(text, kind = '') { fill(line, status(text, kind)); }

  function describe(m) {
    const bits = [];
    bits.push(`${m.notes.length} ${m.notes.length < 5 ? 'dźwięki' : 'dźwięków'}`);
    if (m.scale) bits.push(`skala ${SCALES[m.scale].name}`);
    if (m.scale) bits.push(`od ${noteName(m.notes[0].p, m.flat)}`);
    bits.push(`${m.tempo} BPM`);
    bits.push(m.withDynamics ? 'z dynamiką' : 'bez dynamiki');
    fill(info, el('p', {}, bits.join(', ')));
  }

  async function present(m) {
    phase = 'listen';
    clearTimeout(autoNext);
    capture && capture.cancel();
    fill(result, );
    describe(m);
    setStatus('Słuchaj…', 'listen');
    const sched = motifEvents(m, { countIn: 2 });
    let t0;
    // Pętla: the motif repeats until your first note
    try { t0 = await looper.start(sched.events, sched.seconds, { gap: 0.3 }); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    const lastStart = t0 + sched.starts[sched.starts.length - 1];
    capture = new Capture({ notBefore: lastStart + 0.05, expected: m.notes.length, settle: Math.max(0.7, (60 / m.tempo) * 1.6), onUpdate: (notes) => {
      setStatus(`Twoja kolej: ${notes.length} z ${m.notes.length}`, 'turn');
    } });
    bus.at(t0 + sched.seconds - 0.05, () => { if (alive && phase === 'listen') { phase = 'turn'; setStatus(loopOn() ? 'Twoja kolej. Gram w pętli, aż zaczniesz.' : 'Twoja kolej', 'turn'); } });
    const notes = await capture.done;
    if (!alive || !notes) return;
    grade(m, notes);
  }

  function grade(m, notes) {
    phase = 'result';
    lastAttempt = notes;
    const g = gradeEcho(m, notes);
    const counts = firstTry;
    firstTry = false;
    let lvl = null;
    if (card) ctx.onResult && setTimeout(() => ctx.onResult(g.passed), 1600);
    else if (counts) {
      lvl = store.record(id, g.passed);
      refreshLevel(stage, id);
      if (!g.passed && store.data.settings.autoCards && m.notes.length >= 4) maybeAutoCard(m);
    }
    const tempoWord = g.tempoRatio > 1.12 ? `szybciej o ${Math.round((g.tempoRatio - 1) * 100)}%` : g.tempoRatio < 0.88 ? `wolniej o ${Math.round((1 - g.tempoRatio) * 100)}%` : 'w tempie';
    setStatus(g.passed ? 'Jest! Dokładnie tak.' : 'Prawie. Zobacz, co się rozjechało.', g.passed ? 'good' : 'bad');
    fill(result, 
      verdictChips([
        ['Nuty', g.pitchOk, g.pitchOk ? 'wszystkie' : `${g.perNote.filter((x) => x.ok).length} z ${m.notes.length}${g.extra ? `, ${g.extra} za dużo` : ''}`],
        ['Rytm', g.rhythmOk, g.rhythmOk ? `równo, ${tempoWord}` : `odchyłka ${Math.round(g.rhythmErr * 100)}% uderzenia`],
        m.withDynamics ? ['Dynamika', g.dynOk, g.dyn ? g.dyn.tips[0] : ''] : null,
      ]),
      rollChart(m, g.aligned, g),
      legend([['want', 'wzór'], ['you-ok', 'twoje: dobrze'], ['you-bad', 'twoje: inaczej']]),
      lvl && lvl.after !== lvl.before ? el('p', { class: 'level-change' }, lvl.after > lvl.before ? `Poziom w górę: ${lvl.after.toFixed(1)}` : `Poziom w dół: ${lvl.after.toFixed(1)}. Spokojnie, tak ma działać.`) : null,
    );
    if (g.passed && !card) autoNext = setTimeout(() => alive && phase === 'result' && next(), 2600);
  }

  function maybeAutoCard(m) {
    const t = store.today();
    const todays = store.data.cards.filter((c) => c.created === t && c.auto).length;
    if (todays >= 3) return;
    store.data.cards.push({ id: store.newId(), type: 'motif', title: `Motyw ${m.notes.map((n) => noteName(n.p, m.flat, false)).join(' ')}`, payload: m, box: 0, due: t, created: t, auto: true });
    store.save();
  }

  function addCard() {
    if (!motif) { toast('Najpierw posłuchaj motywu.'); return; }
    const t = store.today();
    store.data.cards.push({ id: store.newId(), type: 'motif', title: `Motyw ${motif.notes.map((n) => noteName(n.p, motif.flat, false)).join(' ')}`, payload: motif, box: 0, due: t, created: t });
    store.save();
    toast('Dodane do fiszek. Wróci jutro.', 'good');
  }

  function next() {
    if (card) { present(motif); return; }
    firstTry = true;
    motif = echoMotif(store.mode(id).level, seed(), { preferBlack: !!(ctx.block && ctx.block.preferBlack) });
    present(motif);
  }

  function replay() {
    if (!motif) return next();
    present(motif);
  }

  if (card) setTimeout(() => alive && present(motif), 400);

  return {
    onNote(e) { if (e.on && looper.active) looper.stop(); if (capture) capture.feed(e); },
    onPilot(a) {
      if (a === 'start' && phase !== 'listen') next();
      if (a === 'repeat') replay();
      if (a === 'hint' && motif) {
        ctx.keyboard.mark(motif.notes.map((n, i) => ({ note: n.p, text: String(i + 1), tone: 'var(--c-echo)' })));
        setTimeout(() => ctx.keyboard.mark([]), 3500);
      }
      if (a === 'pause') { looper.stop(); clearTimeout(autoNext); capture && capture.cancel(); bus.stop(); phase = 'idle'; setStatus('Pauza. C56 albo Start: dalej.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(autoNext); capture && capture.cancel(); bus.stop(); ctx.keyboard.mark([]); },
  };
}
