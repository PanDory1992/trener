// 6. Dynamics echo: copy the shape of loudness, not just the notes.
// 1.10: a score and one tip, tolerances that fit the Keystation, your loudness drawn live, the error loop and series.
import * as bus from '../bus.js';
import { dynamicsPhrase, gradeDynamics, motifEvents, noteName, SHAPES } from '../music.js';
import * as store from '../store.js';
import { curveChart, el, legend, status, verdictChips, fill, add } from '../ui.js';
import { Capture, Looper, seed } from './common.js';
import { loopOn } from '../loop.js';
import { Coach, SAY } from '../drill.js';
import { addLine, createDrill, details, drillDock, seriesCard, toggleDetails, verdict } from '../drillui.js';

export const id = 'dynamika';
const fmt = (x) => x.toFixed(1).replace('.', ',');

export function mount(stage, ctx) {
  let phrase = null;
  let shown = null;
  let capture = null;
  let phase = 'idle';
  let alive = true;
  let auto = null;
  let debt = null;
  const looper = new Looper();
  const coach = new Coach();

  const drill = createDrill(id, {
    title: 'Echo dynamiki',
    about: 'Zagram frazę, która rośnie, opada albo ma akcenty. Dźwięki widzisz niżej. Skopiuj kształt głośności, rytm tu się nie liczy. Twoja głośność rysuje się na żywo. Ocena bierze pod uwagę, że Keystation rozróżnia tylko około 9 poziomów siły, a czarny klawisz z „1” (dziura w klawiaturze) nie jest liczony.',
  });
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const notesRow = el('div', { class: 'note-row' });
  const live = el('div', { class: 'dyn-live' });
  const result = el('div', { class: 'result' });
  const dock = drillDock({ primary: 'Start', onPrimary: () => primary(), onRepeat: () => replay(), onHint: () => hint() });
  add(stage, drill.head, line, notesRow, live, result);
  ctx.dock(dock.node);

  const setStatus = (t, k = '', tip = null) => verdict(line, t, k, tip);
  const later = (fn, ms) => { clearTimeout(auto); auto = setTimeout(() => alive && fn(), ms); };

  function showNotes(p, played = 0) {
    fill(notesRow,
      el('p', { class: 'shape' }, `Kształt: ${SHAPES[p.shape]}`),
      el('div', { class: 'note-chips' }, p.notes.map((n, i) => el('span', { class: `nchip ${i < played ? 'done' : ''}` }, noteName(n.p, p.flat, false)))));
  }

  // your loudness as you play; the target only in the easier version (and after the attempt)
  function drawLive(p, got) {
    fill(live, curveChart(p.notes.map((n) => n.v), got.map((x) => x.v), { height: 180, showTarget: !!p.easy }));
  }

  async function present(p, note = '') {
    phase = 'listen';
    shown = p;
    clearTimeout(auto);
    capture && capture.cancel();
    fill(result);
    showNotes(p);
    drawLive(p, []);
    setStatus(note ? `${note} Słuchaj…` : 'Słuchaj, jak zmienia się głośność…', 'listen');
    const sched = motifEvents(p, { countIn: 2 });
    let t0;
    try { t0 = await looper.start(sched.events, sched.seconds, { gap: 0.3 }); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    capture = new Capture({ notBefore: t0 + sched.starts[sched.starts.length - 1] + 0.05, expected: p.notes.length, quiet: 3, settle: 0.9, onUpdate: (ns) => {
      showNotes(p, ns.length); drawLive(p, ns); setStatus(`Twoja kolej: ${ns.length} z ${p.notes.length}`, 'turn');
    } });
    bus.at(t0 + sched.seconds, () => { if (alive && phase === 'listen') { phase = 'turn'; setStatus(loopOn() ? 'Twoja kolej: ten sam kształt. Gram w pętli, aż zaczniesz.' : 'Twoja kolej: ten sam kształt', 'turn'); } });
    const got = await capture.done;
    if (!alive || !got) return;
    grade(p, got);
  }

  async function grade(p, got) {
    phase = 'result';
    const g = gradeDynamics(p, got);
    const counts = coach.counts;
    let self = null;
    if (counts) { phase = 'ask'; fill(live); self = await drill.ask(line); if (!alive) return; phase = 'result'; }
    const wasComeback = coach.isComeback;
    let r = null;
    let selfLine = null;
    if (counts) { r = drill.counted({ ksztalt: g.score }, g.passed, g.tip); selfLine = drill.recordSelf(self, r.score, { ksztalt: g.score }); }
    let decision = coach.after(g.passed);
    if (debt) { drill.debts.settle(debt, g.passed); debt = null; decision = 'next'; }
    else if (counts && !g.passed && !wasComeback) drill.debts.add(phrase);
    setStatus(g.passed ? (p.easy ? 'Tak. Teraz bez podglądu.' : 'Kształt złapany.') : 'Jeszcze nie ten kształt.', g.passed ? 'good' : 'bad', g.tip);
    addLine(line, selfLine);
    if (r && r.cold) addLine(line, `Zimny start dziś: ${r.score} pkt.`);
    fill(live);
    fill(result, details(id, [
      verdictChips([
        ['Kształt', g.r >= 0.75 || g.ok, `zgodność ${Math.round(Math.max(0, g.r) * 100)}%`],
        ['Poziom', Math.abs(g.levelDiff) <= 22, g.levelDiff > 4 ? `głośniej o ${Math.round(g.levelDiff)}` : g.levelDiff < -4 ? `ciszej o ${Math.round(-g.levelDiff)}` : 'w punkt'],
        ['Rozpiętość', g.range >= 0.5 && g.range <= 1.9, g.range < 0.85 ? 'za płasko' : g.range > 1.3 ? 'za ostro' : 'dobra'],
        g.complete ? null : ['Nuty', false, `zagrane ${got.length} z ${p.notes.length}`],
        g.unknown ? ['Czarne „1”', null, `${g.unknown} bez oceny (dziura w klawiaturze)`] : null,
      ]),
      curveChart(g.target, g.user),
      legend([['want-line', 'wzór'], ['you-line', 'ty']])]),
      r && r.change.after.ksztalt !== r.change.before.ksztalt ? el('p', { class: 'level-change' }, `Poziom ${fmt(r.change.before.ksztalt)} → ${fmt(r.change.after.ksztalt)}`) : null,
    );
    if (r && r.summary) { result.append(seriesCard(r.summary, drill.labels, () => next())); dock.setPrimary('Następna seria'); return; }
    dock.setPrimary('Następne');
    if (decision === 'next') later(next, g.passed ? 3000 : 3800);
    else if (decision === 'retry') later(() => present(phrase, SAY.retry), 3400);
    else if (decision === 'simplify') later(() => present({ ...phrase, easy: true }, 'Teraz łatwiej: kształt widać na wykresie.'), 3400);
    else if (decision === 'full') later(() => present(phrase, SAY.full), 2800);
  }

  function next() {
    clearTimeout(auto);
    dock.setPrimary('Następne');
    const d = drill.debts.due();
    if (d) {
      debt = d;
      phrase = d.item;
      coach.begin(phrase);
      present(phrase, 'Rewanż: fraza, która ostatnio nie wyszła. Jedno podejście.');
      return;
    }
    const lv = drill.axes().ksztalt;
    const got = coach.take(() => dynamicsPhrase(lv, seed()));
    phrase = got.item;
    dock.setPrimary('Następne');
    present(phrase, got.comeback ? SAY.comeback : '');
  }
  function primary() { if (phase !== 'listen' && phase !== 'ask') next(); }
  function replay() { clearTimeout(auto); if (!phrase) return next(); present(shown || phrase); }
  function hint() {
    if (phase === 'result' && toggleDetails(result)) return;
    if (!shown) return;
    drawLive({ ...shown, easy: true }, []);
    setStatus(`Podpowiedź: ${SHAPES[shown.shape]}. Najciszej ok. ${Math.min(...shown.notes.map((n) => n.v))}, najgłośniej ${Math.max(...shown.notes.map((n) => n.v))}.`, 'listen');
  }

  return {
    onNote(e) { if (e.on && looper.active) looper.stop(); if (capture) capture.feed(e); },
    onPilot(a) {
      if (drill.pilotAnswer(a)) return;
      if (a === 'start') primary();
      if (a === 'repeat') replay();
      if (a === 'hint') hint();
      if (a === 'pause') { looper.stop(); clearTimeout(auto); capture && capture.cancel(); bus.stop(); phase = 'idle'; setStatus('Pauza.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(auto); capture && capture.cancel(); bus.stop(); },
  };
}
