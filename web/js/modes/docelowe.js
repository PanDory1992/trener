// 5. Target notes: I comp with the left hand, you improvise and land on chord tones.
import * as bus from '../bus.js';
import { backingChorus, classifyTarget, pcName, PROGRESSIONS } from '../music.js';
import * as store from '../store.js';
import { el, levelHeader, refreshLevel, status, svg, legend, fill, add } from '../ui.js';
import { Looper, seed } from './common.js';
import { loopOn } from '../loop.js';
import { plural, rng } from '../music.js';

export const id = 'docelowe';
const CHORUSES = 4;
const PROGS = ['twoFiveOne', 'blues', 'rhythm', 'minorTwoFive', 'balkan', 'pop'];

function planFor(level, s) {
  const r = rng(s);
  const L = level;
  const progs = L < 3 ? ['pop', 'balkan'] : L < 5 ? ['pop', 'balkan', 'twoFiveOne'] : L < 8 ? ['twoFiveOne', 'blues', 'rhythm'] : ['twoFiveOne', 'blues', 'rhythm', 'minorTwoFive'];
  const prog = r.pick(progs);
  const keyPc = L < 4 ? r.pick([0, 7, 9]) : r.pick([0, 5, 7, 10, 2, 3, 9]);
  const tempo = Math.round(Math.min(160, 72 + L * 7));
  const barsPerChord = prog === 'blues' ? 1 : L < 6 ? 2 : 1;
  return { prog, keyPc, tempo, barsPerChord };
}

export function mount(stage, ctx) {
  let alive = true;
  let run = null;   // {t0, chorus, plan, startOfMusic}
  let raf = 0;
  let manualProg = store.mode(id).prog || 'auto';
  // 4 choruses; with Pętla on, more choruses follow until you stop (or switch Pętla off)
  const looper = new Looper({ onEnd: (end) => { if (run && !run.done) run.endCancel = bus.at(end + 0.3, () => finish()); } });

  const head = levelHeader(id, 'Gra w nuty docelowe', 'Gram lewą ręką akordy. Ty improwizujesz prawą, powyżej środkowego C. Punkty dostajesz za dźwięki akordu (1, 3, 5, 7) zagrane na raz i na trzy.');
  const controls = el('div', { class: 'controls' });
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const score = el('div', { class: 'score-row' });
  const lane = el('div', { class: 'lane-wrap' });
  const result = el('div', { class: 'result' });
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn primary', onclick: () => start() }, 'Start'),
    el('button', { class: 'btn', onclick: () => stopRun('Zatrzymane.') }, '■ Stop'));
  add(stage, head, controls, line, score, lane, result);
  ctx.dock(actions);
  const setStatus = (t, k = '') => fill(line, status(t, k));

  controls.append(el('label', { class: 'field' }, el('span', {}, 'Progresja'),
    el('select', { onchange: (e) => { manualProg = e.target.value; store.mode(id).prog = manualProg; store.save(); } },
      [['auto', 'Automatycznie (wg poziomu)'], ...PROGS.map((k) => [k, PROGRESSIONS[k].name])].map(([v, t]) => el('option', { value: v, selected: v === manualProg }, t)))));

  async function start() {
    stopRun();
    const level = store.mode(id).level;
    const plan = planFor(level, seed());
    if (manualProg !== 'auto') plan.prog = manualProg;
    const ch = backingChorus(plan.prog, plan.keyPc, plan.tempo, { barsPerChord: plan.prog === 'blues' ? 1 : plan.barsPerChord });
    const beat = ch.beat;
    const countIn = 4 * beat;
    const events = [];
    for (let k = 0; k < 4; k++) { events.push({ t: k * beat, m: [0x90, 84, k === 0 ? 70 : 50] }); events.push({ t: k * beat + 0.06, m: [0x80, 84, 0] }); }
    for (let c = 0; c < CHORUSES; c++) for (const e of ch.events) events.push({ t: countIn + c * ch.seconds + e.t, m: e.m });
    let t0;
    try { t0 = await looper.start(events, countIn + CHORUSES * ch.seconds, { gap: 0, repeat: { events: ch.events, seconds: ch.seconds } }); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    if (!alive) return;
    run = { t0, plan, ch, start: t0 + countIn, notes: [], chorusScores: [], done: false };
    setStatus(`${PROGRESSIONS[plan.prog].name} w ${pcName(plan.keyPc, [5, 10, 3, 8, 1].includes(plan.keyPc))}, ${plan.tempo} BPM. Odliczam takt…`, 'listen');
    fill(result, );
    drawLane();
    renderScore();
    tick();
  }

  function chorusOf(t) { return Math.floor((t - run.start) / run.ch.seconds); }

  function drawLane() {
    const { ch } = run;
    const W = 1000, H = 150;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lane', role: 'img', 'aria-label': 'Akordy i twoje dźwięki' });
    const X = (t) => (t / ch.seconds) * W;
    ch.chords.forEach((c, k) => {
      s.append(svg('rect', { x: X(c.start) + 2, y: 6, width: X(c.end) - X(c.start) - 4, height: H - 12, rx: 10, class: k % 2 ? 'lane-box alt' : 'lane-box' }));
      s.append(svg('text', { x: X(c.start) + 12, y: 30, class: 'lane-sym' }, c.symbol));
      // strong beats
      const beats = (c.end - c.start) / ch.beat;
      for (let b = 0; b < beats; b += 2) s.append(svg('line', { x1: X(c.start + b * ch.beat), x2: X(c.start + b * ch.beat), y1: 40, y2: H - 10, class: 'lane-beat' }));
    });
    const dots = svg('g', { class: 'lane-dots' });
    const head = svg('line', { x1: 0, x2: 0, y1: 4, y2: H - 4, class: 'playhead' });
    s.append(dots, head);
    run.svg = { s, dots, head, X, H };
    fill(lane, s, legend([['chord', 'dźwięk akordu'], ['tension', 'napięcie (9, 11, 13)'], ['out', 'poza akordem'], ['strong', 'duża kropka = na raz lub trzy']]));
  }

  function renderScore() {
    if (!run) return;
    const strong = run.notes.filter((n) => n.strong);
    const strongChord = strong.filter((n) => n.kind === 'chord').length;
    const pts = run.notes.reduce((s, n) => s + n.points, 0);
    const looping = looper.active && loopOn();
    const k = Math.max(0, looping ? chorusOf(bus.now()) + 1 : Math.min(CHORUSES, chorusOf(bus.now()) + 1));
    fill(score, 
      el('div', { class: 'stat big' }, el('b', {}, String(pts)), el('span', {}, 'punktów')),
      el('div', { class: 'stat' }, el('b', {}, strong.length ? `${Math.round(100 * strongChord / strong.length)}%` : '–'), el('span', {}, 'trafień w akord na raz i trzy')),
      el('div', { class: 'stat' }, el('b', {}, looping ? `${k}` : `${k} / ${CHORUSES}`), el('span', {}, looping ? 'chorus (pętla)' : 'chorus')));
  }

  function tick() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!run || !alive) return;
      const t = bus.now() - run.start;
      if (t >= 0 && !run.done) {
        const within = t % run.ch.seconds;
        const x = run.svg.X(within);
        run.svg.head.setAttribute('x1', x); run.svg.head.setAttribute('x2', x);
        if (Math.floor(t / run.ch.seconds) !== run.lastChorus) {
          const prev = run.lastChorus;
          run.lastChorus = Math.floor(t / run.ch.seconds);
          if (prev !== undefined) closeChorus(prev);
          fill(run.svg.dots, );
          setStatus(looper.active && loopOn() ? `Chorus ${run.lastChorus + 1} (pętla, Stop kończy). Szukaj 1, 3, 5, 7 na raz i trzy.` : `Chorus ${run.lastChorus + 1} z ${Math.max(CHORUSES, run.lastChorus + 1)}. Szukaj 1, 3, 5, 7 na raz i trzy.`, 'turn');
          renderScore();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function closeChorus(k) {
    if (run.chorusScores.some((c) => c.k === k)) return;
    const ns = run.notes.filter((n) => n.chorus === k);
    const strong = ns.filter((n) => n.strong);
    const ratio = strong.length ? strong.filter((n) => n.kind === 'chord').length / strong.length : 0;
    const passed = strong.length >= 4 && ratio >= 0.7;
    run.chorusScores.push({ k, ratio, strong: strong.length, passed });
    store.record(id, passed);
    refreshLevel(stage, id);
  }

  function finish(upTo = null) {
    if (!run || run.done) return;
    run.done = true;
    looper.cancel();
    // all choruses that were played (4, or more with Pętla)
    const played = upTo ?? Math.max(CHORUSES, Math.round((bus.now() - 0.3 - run.start) / run.ch.seconds));
    for (let k = 0; k < played; k++) if (!run.chorusScores.some((c) => c.k === k)) closeChorus(k);
    run.chorusScores.sort((a, b) => a.k - b.k);
    cancelAnimationFrame(raf);
    const ok = run.chorusScores.filter((c) => c.passed).length;
    setStatus(ok >= 3 ? 'Świetnie trzymasz się harmonii.' : ok >= 1 ? 'Dobry kierunek. Celuj w 3 i 7 na raz.' : 'Spróbuj wolniej: na każdy akord zagraj najpierw tylko jego tercję.', ok >= 3 ? 'good' : 'bad');
    fill(result, el('div', { class: 'chorus-cards' }, run.chorusScores.map((c) => el('div', { class: `cc ${c.passed ? 'ok' : 'bad'}` },
      el('b', {}, `Chorus ${c.k + 1}`), el('span', {}, c.strong ? `${Math.round(c.ratio * 100)}% w akord na raz i trzy (${c.strong} ${plural(c.strong, 'dźwięk', 'dźwięki', 'dźwięków')})` : 'za mało dźwięków na raz i trzy')))));
  }

  function stopRun(msg) {
    looper.stop(false);
    // stopped during a Pętla run: show the choruses you finished
    if (run && !run.done && run.lastChorus >= CHORUSES) { run.endCancel && run.endCancel(); finish(run.lastChorus); }
    if (run) { run.endCancel && run.endCancel(); run.done = true; }
    cancelAnimationFrame(raf);
    bus.stop();
    if (msg) setStatus(msg);
  }

  return {
    onNote(e) {
      if (!run || run.done || !e.on) return;
      const t = e.ts - run.start;
      if (t < -0.1) return;
      const k = Math.floor(t / run.ch.seconds);
      const within = t - k * run.ch.seconds;
      const c = classifyTarget(e.note, within, run.ch);
      run.notes.push({ ...c, chorus: k });
      const { X, dots, H } = run.svg;
      const y = 50 + (1 - (Math.min(96, Math.max(48, e.note)) - 48) / 48) * (H - 64);
      dots.append(svg('circle', { cx: X(within), cy: y, r: c.strong ? 9 : 5, class: `dot ${c.kind}` }));
      if (c.strong) dots.append(svg('text', { x: X(within), y: y + 4, class: 'dot-label' }, c.role || '×'));
      renderScore();
    },
    onPilot(a) {
      if (a === 'start' || a === 'repeat') start();
      if (a === 'pause' || a === 'end') stopRun('Zatrzymane.');
      if (a === 'hint') setStatus('Najpewniejsze nuty: tercja i septyma akordu. Zagraj je na raz, a między nimi cokolwiek.', 'listen');
    },
    destroy() { alive = false; stopRun(); },
  };
}
