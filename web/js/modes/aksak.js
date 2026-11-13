// 8. Aksak: odd Balkan meters. Play a chord on every group start.
import * as bus from '../bus.js';
import { aksakEvents, aksakPlan, gradeAksak, METERS, onsetsFromNotes } from '../music.js';
import * as store from '../store.js';
import { el, levelHeader, refreshLevel, status, svg, fill, add } from '../ui.js';
import { playEvents, seed } from './common.js';
import { loopOn } from '../loop.js';

export const id = 'aksak';

export function mount(stage, ctx) {
  let alive = true;
  let round = null;
  let raf = 0;
  let meterChoice = store.mode(id).meter || 'auto';
  let calib = null;
  let pending = null;   // Pętla: the next round, already scheduled to follow without a gap

  const head = levelHeader(id, 'Aksak: rytmy bałkańskie', 'Gram puls w nieparzystym metrum: bas na początku każdej grupy. Zagraj akord (albo jeden dźwięk) razem z każdym basem. Długa grupa (3) ma trwać półtora razy dłużej niż krótka (2).');
  const controls = el('div', { class: 'controls' });
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const clockWrap = el('div', { class: 'aksak-wrap' });
  const result = el('div', { class: 'result' });
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn primary', onclick: () => start() }, 'Start'),
    el('button', { class: 'btn', onclick: () => stopRound('Zatrzymane.') }, '■ Stop'),
    el('button', { class: 'btn ghost', onclick: () => calibrate() }, 'Zmierz opóźnienie'));
  add(stage, head, controls, line, clockWrap, result);
  ctx.dock(actions);
  const setStatus = (t, k = '') => fill(line, status(t, k));

  controls.append(el('label', { class: 'field' }, el('span', {}, 'Metrum'),
    el('select', { onchange: (e) => { meterChoice = e.target.value; store.mode(id).meter = meterChoice; store.save(); } },
      [['auto', 'Automatycznie (wg poziomu)'], ...Object.entries(METERS).map(([k, m]) => [k, `${m.name} (${m.groups.join('+')})`])].map(([v, t]) => el('option', { value: v, selected: v === meterChoice }, t)))),
  el('p', { class: 'mode-sub small' }, `Opóźnienie odsłuchu: ${store.data.settings.latencyMs} ms (odejmowane od twoich uderzeń).`));

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

  async function start(samePlan = null, at = null) {
    if (at == null) stopRound();
    const level = store.mode(id).level;
    const plan = samePlan || aksakPlan(level, seed(), meterChoice === 'auto' ? null : meterChoice);
    const sched = aksakEvents(plan);
    let t0;
    try { t0 = await playEvents(sched.events, at != null ? { at } : undefined); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    const r = { plan, sched, t0, taps: [], done: false };
    if (at != null) { pending = r; return; }   // starts when the current round ends
    beginRound(r, false);
  }

  function beginRound(r, continued) {
    round = r;
    r.clock = drawClock(r.plan);
    if (!continued) fill(result, );
    setStatus(continued ? 'Pętla: kolejna runda. Pierwszy takt słuchasz.' : 'Pierwszy takt: tylko słuchaj. Potem graj z basem.', 'listen');
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
    const lvl = store.record(id, g.passed);
    refreshLevel(stage, id);
    const dev = Math.round(g.meanDev * 1000);
    const lr = g.longRatio;
    const longWord = lr === null ? 'za mało danych o długiej grupie'
      : Math.abs(lr - 1.5) <= 0.08 ? `długa grupa w punkt (${lr.toFixed(2)} wobec 1,5)`
        : lr < 1.5 ? `skracasz trójkę (${lr.toFixed(2)} zamiast 1,5): zostań w niej dłużej`
          : `przeciągasz trójkę (${lr.toFixed(2)} zamiast 1,5)`;
    setStatus(g.passed ? 'Groove siedzi.' : 'Jeszcze jedna runda?', g.passed ? 'good' : 'bad');
    fill(result, el('div', { class: 'chips' },
      el('div', { class: `chip ${g.ratio >= 0.8 ? 'ok' : 'bad'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Trafione'), el('span', {}, `${g.good} z ${g.total}`)),
      el('div', { class: `chip ${Math.abs(dev) <= 25 ? 'ok' : 'neutral'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Średnio'), el('span', {}, Math.abs(dev) <= 8 ? 'równo z basem' : dev > 0 ? `${dev} ms za basem` : `${-dev} ms przed basem`)),
      el('div', { class: `chip ${lr !== null && Math.abs(lr - 1.5) <= 0.1 ? 'ok' : 'bad'}` }, el('span', { class: 'chip-dot' }), el('b', {}, 'Długa miara'), el('span', {}, longWord)),
      g.extra ? el('div', { class: 'chip neutral' }, el('span', { class: 'chip-dot' }), el('b', {}, 'Dodatkowe'), el('span', {}, `${g.extra} uderzeń poza basem`)) : null),
    lvl.after !== lvl.before ? el('p', { class: 'level-change' }, `Poziom: ${lvl.after.toFixed(1)}`) : null);
    if (pending && alive) { const nx = pending; pending = null; beginRound(nx, true); }
  }

  function stopRound(msg) {
    pending = null;
    if (round) { round.endCancel && round.endCancel(); round.nextCancel && round.nextCancel(); round.done = true; }
    cancelAnimationFrame(raf);
    bus.stop();
    if (msg) setStatus(msg);
  }

  async function calibrate() {
    stopRound();
    const beat = 0.6, n = 10;
    const events = [];
    for (let k = 0; k < n; k++) { events.push({ t: k * beat, m: [0x90, 84, 80] }); events.push({ t: k * beat + 0.08, m: [0x80, 84, 0] }); }
    const t0 = await playEvents(events);
    calib = { t0, beat, n, taps: [] };
    setStatus('Stukaj dowolnym klawiszem razem z kliknięciami, od trzeciego.', 'turn');
    bus.at(t0 + n * beat + 0.4, () => {
      if (!calib) return;
      const devs = calib.taps.map((t) => { const k = Math.round((t - calib.t0) / beat); return k >= 2 && k < n ? (t - calib.t0) - k * beat : null; }).filter((d) => d !== null && Math.abs(d) < beat / 3).sort((a, b) => a - b);
      if (devs.length < 4) { setStatus('Za mało stuknięć. Spróbuj jeszcze raz.', 'bad'); calib = null; return; }
      const med = devs[Math.floor(devs.length / 2)];
      const ms = Math.max(0, Math.min(150, Math.round(med * 1000)));
      store.data.settings.latencyMs = ms;
      store.save();
      setStatus(`Opóźnienie: ${ms} ms. Zapisane, będzie odejmowane od twoich uderzeń.`, 'good');
      calib = null;
    });
  }

  return {
    onNote(e) {
      if (!e.on) return;
      if (calib) { calib.taps.push(e.ts); return; }
      if (!round || round.done) return;
      const t = e.ts - round.t0 - (store.data.settings.latencyMs || 0) / 1000;
      if (t < round.sched.startOfPlay - round.plan.eighth) return;
      const fresh = !round.taps.length || t - round.taps[round.taps.length - 1] > 0.045;
      round.taps.push(t);
      if (fresh) plotTap(t);
    },
    onPilot(a) {
      if (a === 'start' || a === 'repeat') start();
      if (a === 'pause' || a === 'end') stopRound('Zatrzymane.');
      if (a === 'hint') setStatus('Licz na głos: TA-ki, TA-ki, TA-ki-ta. Trójka jest dłuższa, nie spiesz się w niej.', 'listen');
    },
    destroy() { alive = false; stopRound(); calib = null; },
  };
}
