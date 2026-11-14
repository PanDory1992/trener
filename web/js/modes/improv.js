// 9. Improwizacja (1.14): the band plays a vamp (drums only), your left hand is the bass and keeps a pattern, your
// right hand improvises under one rule per round. Two axes, the same frame as the other exercises.
import * as bus from '../bus.js';
import { rng } from '../music.js';
import { allowedRH, easierImprov, gradeImprov, improvPlan, improvRound, lhDemo, lhSlots, SPLIT } from '../improv.js';
import * as store from '../store.js';
import { el, fill, add, svg, verdictChips } from '../ui.js';
import { Coach, SAY } from '../drill.js';
import { addLine, createDrill, details, drillDock, seriesCard, toggleDetails, verdict } from '../drillui.js';
import { playEvents, seed } from './common.js';
import { keyName } from '../theory.js';

export const id = 'improv';
const ROLE_OF = { 0: '1', 3: '3', 4: '3', 6: '5', 7: '5', 8: '5', 10: '7', 11: '7', 2: '9', 9: '6', 5: '4' };
const TONE = { 1: 'var(--role-1)', 3: 'var(--role-3)', 5: 'var(--role-5)', 7: 'var(--role-7)' };
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (x) => String(x).replace('.', ',');

export function mount(stage, ctx) {
  let alive = true;
  let run = null;          // {plan, R, t0, notes, done, cancels}
  let lastPlan = null;
  let decision = 'next';
  let weak = 'prawa';
  const coach = new Coach();

  const drill = createDrill(id, {
    title: 'Improwizacja',
    about: 'Zespół gra pętlę (sama perkusja). Lewa ręka jest basem: gra swój wzór i nigdy nie staje. Prawa improwizuje według jednej zasady na rundę. Lewa i prawa mają osobne poziomy. Trener rozdziela ręce na środkowym C: niżej lewa, od C w górę prawa. Po rundzie zobaczysz też rzeczy, których nie słychać od razu: o ile rozjeżdżają się ręce, czy twoje ósemki swingują, ile ciszy zostawiasz i czy lewa przyspiesza.',
  });
  const line = el('div', { class: 'status-wrap' });
  const board = el('div', { class: 'improv-board' });
  const result = el('div', { class: 'result' });
  const dock = drillDock({
    primary: 'Start', onPrimary: () => primary(), onRepeat: () => again(), onHint: () => hint(),
    more: [['Posłuchaj lewej', () => demo()], ['Stop', () => stopRun('Zatrzymane.')]],
  });
  add(stage, drill.head, line, board, result);
  ctx.dock(dock.node);
  const setStatus = (t, k = '', tip = null) => verdict(line, t, k, tip);
  setStatus('Naciśnij Start albo C56. Najpierw takt odliczania.');

  function fresh() {
    const got = coach.take(() => improvPlan(drill.axes(), rng(seed()), { prev: lastPlan }));
    start(got.item, got.comeback ? SAY.comeback : '');
  }
  function primary() {
    if (run && !run.done) { stopRun('Zatrzymane.'); return; }
    if (!lastPlan) { fresh(); return; }
    if (decision === 'retry' || decision === 'full') start(lastPlan, decision === 'full' ? SAY.full : SAY.retry);
    else if (decision === 'simplify') start(easierImprov(lastPlan, weak), weak === 'lewa' ? 'Teraz łatwiej dla lewej i trochę wolniej.' : 'Teraz łatwiejsze zadanie dla prawej i trochę wolniej.');
    else fresh();
  }
  function again() { if (lastPlan) start(lastPlan, 'Jeszcze raz.'); else fresh(); }

  let demoOn = false;
  /** Stop what plays. Returns the stop request, so a new round starts only after it (else the stop could cut it). */
  function stopRun(msg) {
    const playing = (run && !run.done) || demoOn;
    if (run) { run.done = true; run.cancels.forEach((c) => c()); }
    run = null;
    demoOn = false;
    ctx.keyboard.mark([]);
    if (msg) { setStatus(msg); dock.setPrimary('Start'); }
    return playing ? bus.stop() : Promise.resolve();
  }

  /** The board: both hands' rules, the vamp, and the live chord. */
  function drawBoard(plan, R, k = -1) {
    const key = R.key;
    const chords = [...new Set(R.bars.map((b) => b.chord.name))];
    const bar = k >= 0 ? R.bars[k] : null;
    const answer = plan.rh.id === 'pytanie' && k >= 0 && Math.floor(k / 2) % 2 === 1;
    fill(board,
      el('div', { class: 'imp-hands' },
        el('div', { class: 'imp-hand lh' }, el('span', { class: 'imp-k' }, 'Lewa'), el('b', {}, plan.lh.name), el('p', {}, plan.lh.how)),
        el('div', { class: 'imp-hand rh' }, el('span', { class: 'imp-k' }, 'Prawa'), el('b', {}, plan.rh.name), el('p', {}, plan.rh.how))),
      el('div', { class: 'imp-vamp' }, `Pętla: ${chords.join(' – ')} · ${keyName(key, true)} · ${plan.groove === 'ballada' ? 'ballada' : plan.groove} ${plan.tempo} BPM`),
      el('div', { class: 'imp-live' },
        el('div', { class: 'imp-chord' }, bar ? bar.chord.name : '·'),
        el('div', { class: 'imp-bars' }, R.bars.map((b, i) => el('span', { class: `ib ${i < k ? 'done' : ''} ${i === k ? 'now' : ''} ${plan.rh.id === 'pytanie' && Math.floor(i / 2) % 2 ? 'quiet' : ''}` }, String(i + 1)))),
        k >= 0 ? el('div', { class: `imp-cue ${answer ? 'quiet' : ''}` }, plan.rh.id === 'pytanie' ? (answer ? 'Prawa: cisza, słuchaj' : 'Prawa: pytanie') : `takt ${k + 1} z ${R.bars.length}`) : null));
  }

  /** Keys: the right hand's notes (chord tones strong, the rest faint), the left hand's targets below middle C. */
  function markBar(plan, R, k) {
    const b = R.bars[k];
    const ok = allowedRH(R, plan, k);
    const marks = [];
    for (let n = SPLIT; n < SPLIT + 24; n++) {
      if (!ok.includes(n % 12)) continue;
      const iv = ((n % 12) - b.chord.rootPc + 12) % 12;
      const isChord = b.chord.pcs.includes(n % 12);
      marks.push({ note: n, text: isChord ? ROLE_OF[iv] || '' : '', tone: isChord ? TONE[ROLE_OF[iv]] || 'var(--role-t)' : 'var(--role-t)', dim: !isChord });
    }
    const wants = new Set(lhSlots(R, plan).filter((s) => s.bar === k).flatMap((s) => (s.r === 'C' ? [] : s.pcs.slice(0, 1))));
    for (let n = 36; n < 48; n++) if (wants.has(n % 12)) marks.push({ note: n, text: n % 12 === b.chord.rootPc ? 'R' : '5', tone: n % 12 === b.chord.rootPc ? 'var(--role-1)' : 'var(--role-5)' });
    if (plan.lh.slots.some(([, r]) => r === 'C')) for (let n = 48; n < SPLIT; n++) if (b.chord.pcs.includes(n % 12)) marks.push({ note: n, tone: 'var(--role-3)', dim: true });
    ctx.keyboard.mark(marks);
  }

  async function start(plan, note = '') {
    await stopRun();
    fill(result);
    lastPlan = plan.easy ? lastPlan || plan : plan;
    const R = improvRound(plan, { rng: rng(seed()) });
    drawBoard(plan, R);
    markBar(plan, R, 0);
    let t0;
    try { t0 = await playEvents(R.events); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    const me = { plan, R, t0, notes: [], done: false, cancels: [] };
    run = me;
    dock.setPrimary('■ Stop');
    setStatus(`${note ? `${note} ` : ''}Odliczanie: jeden takt. Potem lewa zaczyna, prawa dołącza.`, 'listen');
    R.bars.forEach((b, k) => me.cancels.push(bus.at(t0 + b.start - 0.06, () => {
      if (run !== me || me.done) return;
      drawBoard(plan, R, k);
      markBar(plan, R, k);
      if (k === 0) setStatus('Graj. Lewa nie staje.', 'turn');
    })));
    me.cancels.push(bus.at(t0 + R.seconds + 0.35, () => finish(me)));
  }

  function finish(me) {
    if (run !== me || me.done) return;
    me.done = true;
    const { plan, R } = me;
    const g = gradeImprov(plan, R, me.notes);
    let rr = null;
    if (coach.counts) rr = drill.counted({ lewa: g.scores.lewa, prawa: g.scores.prawa }, g.passed, g.tip);
    decision = coach.after(g.passed);
    weak = g.scores.lewa < g.scores.prawa ? 'lewa' : 'prawa';
    dock.setPrimary({ retry: 'Jeszcze raz', simplify: 'Łatwiej', full: 'W pełnej wersji', next: 'Następna runda' }[decision] || 'Następna runda');
    setStatus(g.passed ? 'Obie ręce grają razem.' : `Lewa ${g.scores.lewa}, prawa ${g.scores.prawa}.`, g.passed ? 'good' : 'bad', g.tip);
    if (rr && rr.cold) addLine(line, `Zimny start dziś: ${rr.score} pkt.`);
    const sync = g.sync == null ? null
      : ['Rozjazd rąk', Math.abs(g.sync) <= 35 ? true : Math.abs(g.sync) <= 50 ? null : false,
        Math.abs(g.sync) <= 8 ? 'razem' : g.sync > 0 ? `prawa ${g.sync} ms po lewej` : `prawa ${-g.sync} ms przed lewą`];
    const swing = g.swing == null ? null : ['Ósemki prawej', null, g.swing < 1.2 ? `równe (${fmt(g.swing)}:1)` : g.swing < 1.75 ? `lekki swing ${fmt(g.swing)}:1` : `pełny swing ${fmt(g.swing)}:1`];
    fill(result, details(id, [
      verdictChips([
        ['Lewa', g.scores.lewa >= 80, `${g.lh.got} z ${g.lh.slots} w czasie i w dźwięku${g.lh.timeOnly ? `, ${g.lh.timeOnly} tylko w czasie` : ''}`],
        ['Prawa', g.scores.prawa >= 80, g.rh.notes ? `w czasie ${pct(g.rh.timing)}, w dźwiękach rundy ${pct(g.rh.inSet)}` : 'cisza'],
        ['Zadanie', g.rh.task.score >= 0.8, g.rh.task.text],
        sync,
        swing,
        ['Przestrzeń', null, `prawa milczy w ${g.space}% taktów, ${fmt(g.density)} uderzenia na takt`],
        g.drift == null ? null : ['Tempo lewej', Math.abs(g.drift) < 10, Math.abs(g.drift) < 5 ? 'równe' : g.drift < 0 ? `przyspiesza ${-g.drift} ms/takt` : `zwalnia ${g.drift} ms/takt`],
      ]),
      timeMap(me, g),
      el('p', { class: 'mode-sub small' }, 'Rozjazd rąk: u pianistów melodia zwykle wyprzedza bas o 10–30 ms, to naturalne; powyżej 50 ms ręce grają osobno. Ósemki: 1:1 to równe, 2:1 to triola, czyli pełny swing. Przestrzeń: frazy oddychają, gdy prawa milczy w co czwartym takcie albo częściej.')]),
    rr && rr.summary ? seriesCard(rr.summary, drill.labels, () => fresh()) : null);
    ctx.keyboard.mark([]);
    drawBoard(plan, R);
    run = null;
  }

  /** Both hands against the beat: the left's targets (rings) and hits below, the right's hits above. */
  function timeMap(me, g) {
    const { R, plan } = me;
    const W = 760, H = 130, pad = 14;
    const t0 = R.leadIn, t1 = R.seconds;
    const X = (t) => pad + ((t - t0) / (t1 - t0)) * (W - 2 * pad);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'imp-map', role: 'img', 'aria-label': 'Mapa czasu obu rąk' });
    for (let k = 0; k <= R.bars.length * 4; k++) {
      const t = t0 + k * R.beat;
      s.append(svg('line', { x1: X(t), x2: X(t), y1: 6, y2: H - 6, class: k % 4 ? 'beat' : 'bar' }));
    }
    s.append(svg('text', { x: pad, y: 18, class: 'lane' }, 'prawa'), svg('text', { x: pad, y: H - 26, class: 'lane' }, 'lewa'));
    for (const sl of lhSlots(R, plan)) s.append(svg('circle', { cx: X(sl.t), cy: H - 40, r: 6, class: 'target' }));
    for (const t of g.lh.hits) if (t >= t0 - 0.2) s.append(svg('circle', { cx: X(t), cy: H - 40, r: 4, class: 'hit lh' }));
    for (const t of g.rh.hits) if (t >= t0 - 0.2) s.append(svg('circle', { cx: X(t), cy: 40, r: 4, class: 'hit rh' }));
    return el('div', { class: 'imp-mapwrap' }, s, el('p', { class: 'mode-sub small' }, 'Kreski: uderzenia, grube: początek taktu. Kółka na dole: gdzie miała być lewa. Kropki: gdzie zagrałeś.'));
  }

  async function demo() {
    await stopRun();
    const plan = lastPlan || improvPlan(drill.axes(), rng(seed()));
    const R = improvRound(plan, { rng: rng(seed()), bars: 4 });
    drawBoard(plan, R);
    setStatus(`Słuchaj lewej: ${plan.lh.name.toLowerCase()}. ${plan.lh.how}`, 'listen');
    demoOn = true;
    try { await playEvents([...R.events, ...lhDemo(R, plan)]); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); }
    setTimeout(() => { demoOn = false; }, R.seconds * 1000);
  }

  function hint() {
    if (!run && toggleDetails(result)) return;
    const plan = (run && run.plan) || lastPlan;
    if (!plan) { setStatus('Najpierw Start. Lewa gra wzór, prawa improwizuje według jednej zasady.', 'listen'); return; }
    setStatus(`Lewa: ${plan.lh.how} Prawa: ${plan.rh.how}`, 'listen');
  }

  return {
    onNote(e) {
      if (!e.on || !run || run.done) return;
      const t = e.ts - run.t0 - (store.data.settings.latencyMs || 0) / 1000;
      if (t < run.R.leadIn - 0.35) return;
      run.notes.push({ t, p: e.note });
    },
    onPilot(a) {
      if (a === 'start') primary();
      if (a === 'repeat') again();
      if (a === 'hint') hint();
      if (a === 'pause' || a === 'end') stopRun('Zatrzymane.');
    },
    destroy() { alive = false; stopRun(); },
  };
}

