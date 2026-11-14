// 1. Echo: I play a motif, you play it back.
// 1.10: three difficulty axes (melody, rhythm, dynamics), a score per axis, one tip, the error loop and series.
import * as bus from '../bus.js';
import { echoMotif, easierMotif, gradeEcho, motifEvents, noteName, SCALES } from '../music.js';
import * as store from '../store.js';
import { el, rollChart, status, toast, verdictChips, legend, fill, add } from '../ui.js';
import { Capture, Looper, seed } from './common.js';
import { loopOn } from '../loop.js';
import { Coach, SAY } from '../drill.js';
import { createDrill, drillDock, seriesCard, verdict } from '../drillui.js';

export const id = 'echo';
const fmt = (x) => x.toFixed(1).replace('.', ',');
const FOCUS = [['all', 'Wszystko'], ['melodia', 'Melodia'], ['rytm', 'Rytm'], ['dynamika', 'Dynamika']];
const HANDS = [['right', 'Prawa'], ['left', 'Lewa']];

export function mount(stage, ctx) {
  const card = ctx.card || null;
  let motif = card ? card.payload : null;
  let shown = motif;            // what was last played (the easier version during the error loop)
  let capture = null;
  let phase = 'idle';
  let alive = true;
  let auto = null;
  let markTimer = null;
  const looper = new Looper();
  const coach = new Coach();
  const rec = store.mode(id);
  const opt = rec.opts || (rec.opts = { hand: 'right', focus: 'all' });

  const drill = card ? null : createDrill(id, {
    title: 'Echo-nauczyciel',
    about: 'Gram krótki motyw. Posłuchaj i zagraj go tak samo: te same dźwięki, ten sam rytm, a gdy dojdziesz do dynamiki, ta sama głośność. Melodia, rytm i dynamika mają osobne poziomy: łatwieje tylko to, co nie wyszło.',
    focus: () => opt.focus,
  });
  const head = card ? el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, card.title), el('p', { class: 'mode-sub' }, 'Fiszka: powtórz motyw.'))) : drill.head;
  const opts = card ? null : el('div', { class: 'drill-opts' });
  const line = el('div', { class: 'status-wrap' }, status('Gotowy? Naciśnij Start albo C56.'));
  const info = el('div', { class: 'trial-info' });
  const result = el('div', { class: 'result' });
  const dock = drillDock({
    primary: 'Start', onPrimary: () => primary(), onRepeat: () => replay(), onHint: () => hint(),
    more: card ? [] : [['Dodaj do fiszek', () => addCard()]],
  });
  add(stage, head, opts, line, info, result);
  ctx.dock(dock.node);

  function seg(list, value, onPick) {
    return el('div', { class: 'seg-ctl tiny' }, list.map(([v, t]) => el('button', { class: v === value ? 'on' : '', onclick: () => onPick(v) }, t)));
  }
  function renderOpts() {
    if (!opts) return;
    fill(opts,
      el('label', {}, 'Ręka', seg(HANDS, opt.hand, (v) => { opt.hand = v; store.save(); renderOpts(); })),
      el('label', {}, 'Ćwiczysz', seg(FOCUS, opt.focus, (v) => { opt.focus = v; store.save(); renderOpts(); drill.refresh(); })));
  }
  renderOpts();

  const setStatus = (text, kind = '', tip = null) => verdict(line, text, kind, tip);
  const later = (fn, ms) => { clearTimeout(auto); auto = setTimeout(() => alive && fn(), ms); };

  function describe(m) {
    const bits = [];
    bits.push(`${m.notes.length} ${m.notes.length < 5 ? 'dźwięki' : 'dźwięków'}`);
    if (m.scale) bits.push(`skala ${SCALES[m.scale].name}`);
    if (m.scale) bits.push(`od ${noteName(m.notes[0].p, m.flat)}`);
    bits.push(`${m.tempo} BPM`);
    bits.push(m.withDynamics ? 'z dynamiką' : 'bez dynamiki');
    if (m.hand === 'left') bits.push('lewa ręka');
    fill(info, el('p', {}, bits.join(', ')));
  }

  function markMotif(m, ms = 0) {
    clearTimeout(markTimer);
    ctx.keyboard.mark(m.notes.map((n, i) => ({ note: n.p, text: String(i + 1), tone: 'var(--c-echo)' })));
    if (ms) markTimer = setTimeout(() => ctx.keyboard.mark([]), ms);
  }

  async function present(m, note = '') {
    phase = 'listen';
    shown = m;
    clearTimeout(auto);
    capture && capture.cancel();
    fill(result);
    describe(m);
    if (m.easy) markMotif(m); else { clearTimeout(markTimer); ctx.keyboard.mark([]); }
    setStatus(note ? `${note} Słuchaj…` : 'Słuchaj…', 'listen');
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
    const g = gradeEcho(m, notes);
    if (card) {
      setStatus(g.passed ? 'Jest! Dokładnie tak.' : 'Prawie.', g.passed ? 'good' : 'bad', g.tip);
      showResult(m, g, null);
      ctx.onResult && setTimeout(() => ctx.onResult(g.passed), 1600);
      return;
    }
    const wasComeback = coach.isComeback;
    let rec2 = null;
    if (coach.counts) {
      const scores = Object.fromEntries(drill.names.map((a) => [a, m.tested && m.tested.includes(a) ? g.scores[a] : null]));
      rec2 = drill.counted(scores, g.passed, g.tip);
    }
    const decision = coach.after(g.passed);
    if (wasComeback && !g.passed) maybeAutoCard(motif);
    setStatus(g.passed ? (m.easy ? 'Tak. Teraz w normalnym tempie.' : 'Jest! Dokładnie tak.') : 'Prawie.', g.passed ? 'good' : 'bad', g.tip);
    if (g.tip && g.tip.mark) { ctx.keyboard.mark(g.tip.mark.map((x) => ({ ...x, tone: 'var(--c-echo)' }))); clearTimeout(markTimer); markTimer = setTimeout(() => ctx.keyboard.mark([]), 4000); }
    showResult(m, g, rec2);
    if (rec2 && rec2.summary) { result.append(seriesCard(rec2.summary, drill.labels, () => next())); dock.setPrimary('Następna seria'); return; }
    dock.setPrimary('Następne');
    if (decision === 'next') later(next, g.passed ? 2600 : 3600);
    else if (decision === 'retry') later(() => present(motif, SAY.retry), 3200);
    else if (decision === 'simplify') later(() => present(easierMotif(motif), SAY.simplify), 3200);
    else if (decision === 'full') later(() => present(motif, SAY.full), 2600);
  }

  function showResult(m, g, rec2) {
    const tempoWord = g.tempoRatio > 1.12 ? `szybciej o ${Math.round((g.tempoRatio - 1) * 100)}%` : g.tempoRatio < 0.88 ? `wolniej o ${Math.round((1 - g.tempoRatio) * 100)}%` : 'w tempie';
    const moved = rec2 ? drill.names.filter((a) => rec2.change.after[a] !== rec2.change.before[a]) : [];
    fill(result,
      verdictChips([
        ['Nuty', g.pitchOk, g.pitchOk ? 'wszystkie' : `${g.perNote.filter((x) => x.ok).length} z ${m.notes.length}${g.extra ? `, ${g.extra} za dużo` : ''}`],
        ['Rytm', g.rhythmOk, g.rhythmOk ? `równo, ${tempoWord}` : `odchyłka ${Math.round(g.rhythmErr * 100)}% uderzenia`],
        m.withDynamics ? ['Dynamika', g.dynOk, g.dyn ? g.dyn.tips[0] : ''] : null,
      ]),
      rollChart(m, g.aligned, g),
      legend([['want', 'wzór'], ['you-ok', 'twoje: dobrze'], ['you-bad', 'twoje: inaczej']]),
      moved.length ? el('p', { class: 'level-change' }, moved.map((a) => `${drill.labels[a]} ${fmt(rec2.change.before[a])} → ${fmt(rec2.change.after[a])}`).join(' · ')) : null,
    );
  }

  function maybeAutoCard(m) {
    if (!store.data.settings.autoCards || !m || m.notes.length < 4) return;
    const t = store.today();
    const todays = store.data.cards.filter((c) => c.created === t && c.auto).length;
    if (todays >= 3) return;
    store.data.cards.push({ id: store.newId(), type: 'motif', title: `Motyw ${m.notes.map((n) => noteName(n.p, m.flat, false)).join(' ')}`, payload: m, box: 0, due: t, created: t, auto: true });
    store.save();
    toast('Ten motyw trafił do fiszek: wróci jutro.');
  }

  function addCard() {
    if (!motif) { toast('Najpierw posłuchaj motywu.'); return; }
    const t = store.today();
    store.data.cards.push({ id: store.newId(), type: 'motif', title: `Motyw ${motif.notes.map((n) => noteName(n.p, motif.flat, false)).join(' ')}`, payload: motif, box: 0, due: t, created: t });
    store.save();
    toast('Dodane do fiszek. Wróci jutro.', 'good');
  }

  function next() {
    clearTimeout(auto);
    if (card) { present(motif); return; }
    const axes = drill.axes();
    const got = coach.take(() => echoMotif(axes, seed(), { preferBlack: !!(ctx.block && ctx.block.preferBlack), focus: opt.focus, hand: opt.hand }));
    motif = got.item;
    dock.setPrimary('Następne');
    present(motif, got.comeback ? SAY.comeback : '');
  }

  function primary() { if (phase !== 'listen') next(); }

  function replay() {
    clearTimeout(auto);
    if (!motif) return next();
    present(shown || motif);
  }

  function hint() {
    if (!shown) return;
    markMotif(shown, 3500);
    setStatus('Podpowiedź na klawiszach: kolejne dźwięki motywu.', 'listen');
  }

  if (card) setTimeout(() => alive && present(motif), 400);

  return {
    onNote(e) { if (e.on && looper.active) looper.stop(); if (capture) capture.feed(e); },
    onPilot(a) {
      if (a === 'start') primary();
      if (a === 'repeat') replay();
      if (a === 'hint') hint();
      if (a === 'pause') { looper.stop(); clearTimeout(auto); capture && capture.cancel(); bus.stop(); phase = 'idle'; setStatus('Pauza. C56 albo Następne: dalej.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(auto); clearTimeout(markTimer); capture && capture.cancel(); bus.stop(); ctx.keyboard.mark([]); },
  };
}
