// 8. Aksak: odd Balkan meters. Play a chord on every group start.
import * as bus from '../bus.js';
import { aksakEvents, aksakPlan, easierAksak, gradeAksak, METERS, onsetsFromNotes } from '../music.js';
import * as store from '../store.js';
import { el, status, svg, fill, add } from '../ui.js';
import { Coach, SAY } from '../drill.js';
import { createDrill, drillDock, seriesCard, verdict } from '../drillui.js';
import { playEvents, seed } from './common.js';
import { loopOn } from '../loop.js';

export const id = 'aksak';

export function mount(stage, ctx) {
  let alive = true;
  let round = null;
  let raf = 0;
  let meterChoice = store.mode(id).meter || 'auto';
  let pending = null;   // Pętla: the next round, already scheduled to follow without a gap
  let decision = 'next';
  let lastPlan = null;
  const coach = new Coach();

  const drill = createDrill(id, {
    title: 'Aksak: rytmy bałkańskie',
    about: 'Gram puls w nieparzystym metrum: bas na początku każdej grupy. Zagraj akord (albo jeden dźwięk) razem z każdym basem. Długa grupa (3) ma trwać półtora razy dłużej niż krótka (2). Metrum i puls mają osobne poziomy. Wykres pod wynikiem pokazuje, czy przyspieszasz, czy zwalniasz.',
  });
  const controls = el('div', { class: 'drill-opts' });
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const clockWrap = el('div', { class: 'aksak-wrap' });
  const result = el('div', { class: 'result' });
  const dock = drillDock({ primary: 'Start', onPrimary: () => primary(), onRepeat: () => again(), onHint: () => hint() });
  add(stage, drill.head, controls, line, clockWrap, result);
  ctx.dock(dock.node);
  const setStatus = (t, k = '', tip = null) => verdict(line, t, k, tip);

  controls.append(el('label', {}, 'Metrum',
    el('select', { onchange: (e) => { meterChoice = e.target.value; store.mode(id).meter = meterChoice; store.save(); } },
      [['auto', 'Automatycznie (wg poziomu)'], ...Object.entries(METERS).map(([k, m]) => [k, `${m.name} (${m.groups.join('+')})`])].map(([v, t]) => el('option', { value: v, selected: v === meterChoice }, t)))),
  el('span', {}, `Opóźnienie odsłuchu: ${store.data.settings.latencyMs} ms`, ' ', el('button', { class: 'btn tiny ghost', onclick: () => ctx.go('settings') }, 'Zmierz w Ustawieniach')));

  function hint() { setStatus('Licz na głos: TA-ki, TA-ki, TA-ki-ta. Trójka jest dłuższa, nie spiesz się w niej.', 'listen'); }

  /** C56 / the main button: Start, Stop while a round plays, and after a round what the error loop proposes. */
  function primary() {
    if (round && !round.done) { stopRound('Zatrzymane.'); return; }
    if (decision === 'retry' || decision === 'full') start(lastPlan);
    else if (decision === 'simplify') start(easierAksak(lastPlan));
    else fresh();
  }
  function again() { if (round && !round.done) stopRound(); start(lastPlan || null); }
  function fresh() {
    const got = coach.take(() => aksakPlan(drill.axes(), seed(), meterChoice === 'auto' ? null : meterChoice));
    start(got.item, null, got.comeback ? SAY.comeback : '');
  }

  function drawClock(plan) {
    const groups = METERS[plan.meter].groups;
    const total = groups.reduce((a, b) => a + b, 0);
    const R = 120, C = 150;
    const s = svg('svg', { viewBox: '0 0 300 300', class: 'aksak-clock', role: 'img', 'aria-label': `Takt ${METERS[plan.meter].name}` });
    let pos = 0;
    const polar = (frac, r) => [C + r * Math.sin(frac * 2 * Math.PI), C - r * Math.cos(frac * 2 * Math.PI)];
    groups.forEach((g, gi) => {
      const a0 = pos / total, a1 = (pos + g) / total;
      const [x0, y0] = polar(a0, R), [x1, y1] = polar(a1 - 0.004, R);
      const large = a1 - a0 > 0.5 ? 1 : 0;
      s.append(svg('path', { d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1}`, class: `arc ${g === 3 ? 'long' : 'short'}` }));
      const [tx, ty] = polar((a0 + a1) / 2, R - 34);
      s.append(svg('text', { x: tx, y: ty + 6, class: 'arc-label' }, String(g)));
      const [bx, by] = polar(a0, R);
      s.append(svg('circle', { cx: bx, cy: by, r: gi === 0 ? 9 : 6, class: 'beat-dot' }));
      for (let k = 1; k < g; k++) { const [fx, fy] = polar((pos + k) / total, R); s.append(svg('circle', { cx: fx, cy: fy, r: 2.5, class: 'fill-dot' })); }
      pos += g;
    });
    const hits = svg('g', {});
    const hand = svg('line', { x1: C, y1: C, x2: C, y2: C - R + 10, class: 'hand' });
    s.append(hits, hand, svg('text', { x: C, y: C + 62, class: 'clock-center' }, `${total}/8`));
    fill(clockWrap, s, el('div', { class: 'aksak-side' },
      el('div', { class: 'meter-name' }, METERS[plan.meter].name),
      el('div', { class: 'meter-groups' }, groups.map((g) => el('span', { class: g === 3 ? 'g long' : 'g' }, g === 3 ? 'TA-ki-ta' : 'TA-ki'))),
      el('p', { class: 'mode-sub' }, `Tempo: ${Math.round(60 / plan.eighth)} ósemek na minutę${plan.fillers ? ', z cichymi ósemkami' : ', bez podpowiedzi ósemek'}${plan.silentBars ? ', co drugi takt cisza: trzymasz puls sam' : ''}.`)));
    return { s, hits, hand, polar, total, R };
  }

  async function start(samePlan = null, at = null, note = '') {
    if (at == null) stopRound();
    if (!samePlan && at == null) { fresh(); return; }
    const plan = samePlan;
    if (at == null) { lastPlan = plan.easy ? lastPlan || plan : plan; dock.setPrimary('■ Stop'); }
    const sched = aksakEvents(plan);
    let t0;
    try { t0 = await playEvents(sched.events, at != null ? { at } : undefined); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    const r = { plan, sched, t0, taps: [], done: false };
    if (at != null) { pending = r; return; }   // starts when the current round ends
    beginRound(r, false, note);
  }

  function beginRound(r, continued, note = '') {
    round = r;
    r.clock = drawClock(r.plan);
    if (!continued) fill(result, );
    setStatus(continued ? 'Pętla: kolejna runda. Pierwszy takt słuchasz.' : `${note ? `${note} ` : ''}Pierwszy takt: tylko słuchaj. Potem graj z basem.`, 'listen');
    bus.at(r.t0 + r.sched.startOfPlay - 0.05, () => alive && round === r && !r.done && setStatus('Graj z każdym basem.', 'turn'));
    r.endCancel = bus.at(r.t0 + r.sched.seconds + 0.4, () => finish());
    // Pętla: schedule the same meter again so it follows without a gap
    r.nextCancel = bus.at(r.t0 + r.sched.seconds - 0.8, () => { if (alive && round === r && !r.done && loopOn()) start(r.plan, r.t0 + r.sched.seconds); });
    animate();
  }

  function animate() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!round || round.done || !alive) return;
      const t = bus.now() - round.t0;
      const frac = (((t % round.sched.barLen) + round.sched.barLen) % round.sched.barLen) / round.sched.barLen;
      const [x, y] = round.clock.polar(frac, round.clock.R - 12);
      round.clock.hand.setAttribute('x2', x); round.clock.hand.setAttribute('y2', y);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function plotTap(t) {
    const { sched, plan, clock } = round;
    const frac = (((t % sched.barLen) + sched.barLen) % sched.barLen) / sched.barLen;
    // nearest target
    let best = null;
    for (const tg of sched.targets) { const d = t - tg.t; if (!best || Math.abs(d) < Math.abs(best)) best = d; }
    const tol = Math.max(0.045, plan.eighth * 0.2);
    const cls = best === null ? 'hit bad' : Math.abs(best) <= tol ? 'hit ok' : Math.abs(best) <= plan.eighth * 0.5 ? 'hit near' : 'hit bad';
    const [x, y] = clock.polar(frac, clock.R + 2);
    clock.hits.append(svg('circle', { cx: x, cy: y, r: 7, class: cls }));
  }

  function finish() {
    if (!round || round.done) return;
    round.done = true;
    cancelAnimationFrame(raf);
    const onsets = onsetsFromNotes(round.taps);
    const g = gradeAksak(round.plan, round.sched, onsets);
    let rr = null;
    if (coach.counts) rr = drill.counted({ puls: g.scores.puls, metrum: g.scores.metrum }, g.passed, g.tip);
    decision = coach.after(g.passed);
    const fmt = (x) => x.toFixed(1).replace('.', ',');
    const moved = rr ? drill.names.filter((a) => rr.change.after[a] !== rr.change.before[a]) : [];
    const dev = Math.round(g.meanDev * 1000);
    const lr = g.longRatio;
    const longWord = lr === null ? 'za mało danych o długiej grupie'
      : Math.abs(lr - 1.5) <= 0.08 ? `długa grupa w punkt (${lr.toFixed(2)} wobec 1,5)`
        : lr < 1.5 ? `skracasz trójkę (${lr.toFixed(2)} zamiast 1,5): zostań w niej dłużej`
          : `przeciągasz trójkę (${lr.toFixed(2)} zamiast 1,5)`;
    setStatus(g.passed ? 'Groove siedzi.' : decision === 'simplify' ? 'Jeszcze nie. Teraz trochę wolniej.' : 'Jeszcze nie.', g.passed ? 'good' : 'bad', g.tip);
    fill(result, el('div', { class: 'chips' },
      el('div', { class: `chip ${g.ratio >= 0.8 ? 'ok' : 'bad'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Trafione'), el('span', {}, `${g.good} z ${g.total}`)),
      el('div', { class: `chip ${Math.abs(dev) <= 25 ? 'ok' : 'neutral'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Średnio'), el('span', {}, Math.abs(dev) <= 8 ? 'równo z basem' : dev > 0 ? `${dev} ms za basem` : `${-dev} ms przed basem`)),
      el('div', { class: `chip ${lr !== null && Math.abs(lr - 1.5) <= 0.1 ? 'ok' : 'bad'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Długa miara'), el('span', {}, longWord)),
      g.extra ? el('div', { class: 'chip neutral' }, el('span', { class: 'chip-dot' }), el('b', {}, 'Dodatkowe'), el('span', {}, `${g.extra} uderzeń poza basem`)) : null),
    driftChart(g, round.sched),
    moved.length ? el('p', { class: 'level-change' }, moved.map((a) => `${drill.labels[a]} ${fmt(rr.change.before[a])} → ${fmt(rr.change.after[a])}`).join(' · ')) : null,
    rr && rr.summary ? seriesCard(rr.summary, drill.labels, () => { decision = 'next'; fresh(); }) : null);
    dock.setPrimary({ retry: 'Jeszcze raz', simplify: 'Wolniej', full: 'W tempie', next: 'Następna runda' }[decision] || 'Start');
    if (pending && alive) { const nx = pending; pending = null; beginRound(nx, true); dock.setPrimary('■ Stop'); }
  }

  function stopRound(msg) {
    pending = null;
    const was = round && !round.done;
    if (round) { round.endCancel && round.endCancel(); round.nextCancel && round.nextCancel(); round.done = true; }
    cancelAnimationFrame(raf);
    bus.stop();
    if (was) dock.setPrimary('Start');
    if (msg) setStatus(msg);
  }

  /** Your deviation from the bass over the round, with the trend: rising = slowing down, falling = rushing. */
  function driftChart(g, sched) {
    const pts = g.hits.filter((h) => h.dev !== null);
    if (pts.length < 6) return null;
    const W = 640, H = 120, pad = 20;
    const T = sched.seconds;
    const lim = Math.max(0.06, ...pts.map((h) => Math.abs(h.dev)));
    const X = (t) => pad + (t / T) * (W - 2 * pad);
    const Y = (d) => H / 2 - (d / lim) * (H / 2 - 10);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Twoje uderzenia względem basu w czasie' });
    s.append(svg('line', { x1: pad, x2: W - pad, y1: H / 2, y2: H / 2, class: 'zero' }));
    for (const h of pts) s.append(svg('circle', { cx: X(h.t), cy: Y(h.dev), r: 3.5, class: 'pt' }));
    if (g.drift !== null) {
      const mx = pts.reduce((a, h) => a + h.t, 0) / pts.length, my = pts.reduce((a, h) => a + h.dev, 0) / pts.length;
      const slope = g.drift / 1000 / sched.barLen;
      const t1 = pts[0].t, t2 = pts[pts.length - 1].t;
      s.append(svg('line', { x1: X(t1), y1: Y(my + slope * (t1 - mx)), x2: X(t2), y2: Y(my + slope * (t2 - mx)), class: 'trend' }));
    }
    const word = g.drift === null ? '' : Math.abs(g.drift) < 4 ? 'Tempo równe przez całą rundę.' : g.drift > 0 ? `Zwalniasz o ok. ${g.drift} ms na takt.` : `Przyspieszasz o ok. ${-g.drift} ms na takt.`;
    return el('div', { class: 'drift' }, el('p', { class: 'mode-sub small' }, `Nad linią: za basem, pod linią: przed basem. ${word}`), s);
  }

  return {
    onNote(e) {
      if (!e.on) return;
      if (!round || round.done) return;
      const t = e.ts - round.t0 - (store.data.settings.latencyMs || 0) / 1000;
      if (t < round.sched.startOfPlay - round.plan.eighth) return;
      const fresh = !round.taps.length || t - round.taps[round.taps.length - 1] > 0.045;
      round.taps.push(t);
      if (fresh) plotTap(t);
    },
    onPilot(a) {
      if (a === 'start') primary();
      if (a === 'repeat') again();
      if (a === 'pause' || a === 'end') stopRound('Zatrzymane.');
      if (a === 'hint') hint();
    },
    destroy() { alive = false; stopRound(); },
  };
}
