// 4. Chord gym: I show a chord, you play it in the asked voicing.
import * as bus from '../bus.js';
import { checkChord, chordGymPlan, chordPcs, CHORDS, movement, pcName, progressionChords, PROGRESSIONS, referenceVoicing, roleIn, VOICING_STYLES } from '../music.js';
import * as store from '../store.js';
import { el, status, fill, add } from '../ui.js';
import { addLine, createDrill, drillDock, seriesCard, verdict } from '../drillui.js';
import { Looper, playEvents, seed } from './common.js';

export const id = 'akordy';
const ROLE_TONE = { 1: 'var(--role-1)', 3: 'var(--role-3)', 5: 'var(--role-5)', 7: 'var(--role-7)', 9: 'var(--role-t)', 11: 'var(--role-t)', 13: 'var(--role-t)' };
const STABLE_MS = 170;

export function mount(stage, ctx) {
  const card = ctx.card || null;
  const held = new Set();
  const looper = new Looper();   // Pętla: C57 chord / progression repeats until you play
  let alive = true;
  let plan = null;          // {prog, style, keyPc}
  let chords = [];
  let i = 0;
  let tries = 0;
  let prevVoicing = null;
  let lastEvalKey = '';
  let stableTimer = null;
  let started = false;
  let manual = store.data.modes[id]?.manual || null;
  const times = [];
  let shownAt = 0;
  let wrongShown = false;
  let wrongPending = false;
  let wrongTimer = null;
  let hintUsed = false;
  let lastWrong = '';

  const drill = card ? null : createDrill(id, {
    title: 'Siłownia akordów',
    about: 'Pokazuję akord, ty go grasz. Liczy się, czy są właściwe dźwięki za pierwszym razem, jak szybko je znajdziesz i jak mało ruszysz palcami od poprzedniego akordu. Szare kropki na klawiszach to twój poprzedni akord: szukaj najbliższego układu.',
  });
  const head = card ? el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, card.title), el('p', { class: 'mode-sub' }, 'Fiszka: zagraj akordy.'))) : drill.head;
  const controls = el('div', { class: 'drill-opts' });
  const board = el('div', { class: 'chord-board' });
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const stats = el('div', { class: 'chord-stats' });
  const summaryBox = el('div', { class: 'result' });
  const dock = drillDock({
    primary: 'Start', onPrimary: () => (started ? skip() : start()), onRepeat: () => listen(), repeatLabel: 'Posłuchaj', onHint: () => hint(),
    more: [['Zagraj całą progresję', () => playProgression()], card ? null : ['Dodaj do fiszek', () => addCard()]],
  });
  add(stage, head, card ? null : controls, board, line, stats, summaryBox);
  ctx.dock(dock.node);

  const setStatus = (t, k = '', tip = null) => verdict(line, t, k, tip);

  function renderControls() {
    const sel = (label, value, options, onchange) => el('label', {}, label,
      el('select', { onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => el('option', { value: v, selected: v === value }, t))));
    fill(controls, 
      sel('Wybór', manual ? 'manual' : 'auto', [['auto', 'Automatycznie (wg poziomu)'], ['manual', 'Sam wybieram']], (v) => {
        manual = v === 'manual' ? (manual || { prog: 'twoFiveOne', style: 'any', keyPc: 0 }) : null;
        store.mode(id).manual = manual; store.save(); renderControls();
      }),
      manual ? sel('Progresja', manual.prog, Object.entries(PROGRESSIONS).map(([k, p]) => [k, p.name]), (v) => { manual.prog = v; fixStyle(); store.save(); renderControls(); }) : null,
      manual ? sel('Układ', manual.style, Object.entries(VOICING_STYLES).filter(([k]) => PROGRESSIONS[manual.prog].sevenths || k === 'any' || k === 'rootBass').map(([k, s]) => [k, s.name]), (v) => { manual.style = v; store.save(); }) : null,
      manual ? sel('Tonacja', String(manual.keyPc), [0, 7, 2, 9, 4, 11, 6, 5, 10, 3, 8, 1].map((pc) => [String(pc), pcName(pc, [5, 10, 3, 8, 1].includes(pc))]), (v) => { manual.keyPc = Number(v); store.save(); }) : null,
    );
  }
  function fixStyle() { if (!PROGRESSIONS[manual.prog].sevenths && !['any', 'rootBass'].includes(manual.style)) manual.style = 'any'; }

  function newRound() {
    if (card) plan = card.payload;
    else plan = manual ? { ...manual } : chordGymPlan(store.mode(id).level, seed());
    chords = progressionChords(plan.prog, plan.keyPc);
    i = 0;
    renderBoard();
  }

  function renderBoard() {
    const c = chords[i];
    const style = VOICING_STYLES[plan.style];
    fill(board, 
      el('div', { class: 'prog-name' }, `${PROGRESSIONS[plan.prog].name}, ${style.name.toLowerCase()}`),
      el('div', { class: 'chord-now' },
        el('div', { class: 'chord-symbol' }, c.symbol),
        el('div', { class: 'chord-what' }, `${CHORDS[c.type].name}: ${chordPcs(c.rootPc, c.type).map((pc) => pcName(pc, c.symbol.includes('♭'))).join(' ')}`)),
      el('div', { class: 'chord-strip' }, chords.map((x, k) => el('span', { class: `cs ${k < i ? 'done' : ''} ${k === i ? 'now' : ''}` }, x.symbol))),
      el('p', { class: 'style-help' }, style.help));
    tries = 0;
    hintUsed = false;
    wrongShown = false;
    wrongPending = false;
    shownAt = performance.now();
    // where your hand is now: the previous chord, faint; the nearest voicing of the new one is close to it
    ctx.keyboard.mark(prevVoicing ? prevVoicing.map((n) => ({ note: n, text: '·', tone: 'var(--ink-3)' })) : []);
  }

  function start() {
    started = true;
    fill(summaryBox);
    newRound();
    dock.setPrimary('Następny akord');
    setStatus('Zagraj akord i trzymaj chwilę.', 'turn');
  }

  function skip() {
    fill(summaryBox);
    i = Math.min(i + 1, chords.length - 1);
    renderBoard();
    setStatus('Pominięty. Zagraj następny.', 'turn');
  }

  function evaluate() {
    if (!started || !chords.length) return;
    const notes = [...held].sort((a, b) => a - b);
    const key = notes.join(',');
    if (notes.length < 2 || key === lastEvalKey) return;
    lastEvalKey = key;
    const c = chords[i];
    const res = checkChord(notes, c.rootPc, c.type, plan.style);
    ctx.keyboard.mark(notes.map((n) => {
      const role = roleIn(n % 12, c.rootPc, c.type);
      return { note: n, text: role || '×', tone: role ? ROLE_TONE[role] : 'var(--bad)' };
    }));
    if (res.ok) {
      clearTimeout(wrongTimer);
      wrongPending = false;
      const move = movement(prevVoicing, notes);
      const secs = (performance.now() - shownAt) / 1000;
      times.push({ secs, move, first: tries === 0 });
      const passed = tries === 0 && !hintUsed;
      // score: right the first time, minus time over 3 s; a second try 50, later 25; with a hint at most 40
      let score = tries === 0 ? Math.max(60, Math.round(100 - Math.max(0, secs - 3) * 8)) : tries === 1 ? 50 : 25;
      if (hintUsed) score = Math.min(score, 40);
      const moveWord = move === null ? '' : `ruch palców ${move} ${move === 1 ? 'półton' : move < 5 ? 'półtony' : 'półtonów'}`;
      const tip = hintUsed && tries === 0 ? { kind: 'hint', text: `${c.symbol} z podpowiedzią: najwyżej 40 punktów. Następny spróbuj najpierw sam.` }
        : tries > 0 && lastWrong ? { kind: 'wrong', text: `${c.symbol}: ${lastWrong}. Za drugim razem się udało.` }
        : secs > 5 ? { kind: 'slow', text: `${c.symbol}: ${secs.toFixed(1).replace('.', ',')} s. Zanim zagrasz, nazwij w myślach tercję.` }
          : move !== null && move > 8 ? { kind: 'move', text: `Duży skok ręki (${moveWord}). Szukaj układu najbliżej poprzedniego akordu.` }
            : { kind: null, text: move === null ? `${secs.toFixed(1).replace('.', ',')} s.` : `${secs.toFixed(1).replace('.', ',')} s, ${moveWord}${move <= 4 ? ', bardzo gładko' : ''}.` };
      let r = null;
      if (card) {
        // a card passes when every chord of the progression is right the first time
        card._fails = (card._fails || 0) + (passed ? 0 : 1);
      } else {
        r = drill.counted({ akordy: score }, passed, tip);
      }
      prevVoicing = notes;
      setStatus(passed ? 'Dobrze!' : 'Jest.', 'good', tip);
      if (r && r.cold) addLine(line, `Zimny start dziś: ${r.score} pkt.`);
      renderStats();
      if (r && r.summary) fill(summaryBox, seriesCard(r.summary, drill.labels, () => { fill(summaryBox); }));
      setTimeout(() => {
        if (!alive) return;
        i++;
        if (i >= chords.length) {
          if (card) { ctx.onResult && ctx.onResult(!card._fails); return; }
          newRound();
          setStatus('Nowa runda.', 'turn');
        } else renderBoard();
      }, 450);
    } else if (notes.length >= Math.min(3, chordPcs(c.rootPc, c.type).length) || res.wrong.length) {
      // still building the chord? say "not yet" only if the hand stays put a moment longer
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => showWrong(c, res), 320);
    }
  }

  function showWrong(c, res) {
    if (!alive || chords[i] !== c) return;
    {
      wrongPending = true;
      const flat = c.symbol.includes('♭');
      const bits = [];
      if (res.missing.length) bits.push(`brakuje: ${res.missing.map((pc) => pcName(pc, flat)).join(', ')}`);
      if (res.wrong.length) bits.push(`nie pasuje: ${res.wrong.map((pc) => pcName(pc, flat)).join(', ')}`);
      if (!res.bassOk) bits.push(`na dole ma być ${pcName(c.rootPc, flat)}`);
      lastWrong = bits.join('; ');
      setStatus(`Jeszcze nie: ${lastWrong}.`, 'bad', { kind: 'wrong', text: 'Puść klawisze i spróbuj jeszcze raz.' });
    }
  }

  function renderStats() {
    const recent = times.slice(-12);
    if (!recent.length) return;
    const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const moves = recent.filter((x) => x.move !== null).map((x) => x.move);
    fill(stats, 
      el('div', { class: 'stat' }, el('b', {}, `${avg(recent.map((x) => x.secs)).toFixed(1)} s`), el('span', {}, 'średnio do znalezienia')),
      el('div', { class: 'stat' }, el('b', {}, moves.length ? `${avg(moves).toFixed(1)}` : '–'), el('span', {}, 'półtonów ruchu na zmianę')),
      el('div', { class: 'stat' }, el('b', {}, `${Math.round(100 * recent.filter((x) => x.first).length / recent.length)}%`), el('span', {}, 'za pierwszym razem')));
  }

  function hint() {
    if (!chords.length) return;
    const c = chords[i];
    const v = referenceVoicing(c.rootPc, c.type, plan.style, prevVoicing);
    ctx.keyboard.mark(v.map((n) => ({ note: n, text: roleIn(n % 12, c.rootPc, c.type), tone: ROLE_TONE[roleIn(n % 12, c.rootPc, c.type)] })));
    hintUsed = true;
  }

  function listen() {
    if (!chords.length) newRound();
    const c = chords[i];
    const v = referenceVoicing(c.rootPc, c.type, plan.style, prevVoicing);
    hintUsed = true;
    looper.start(v.flatMap((n) => [{ t: 0, m: [0x90, n, 64] }, { t: 1.4, m: [0x80, n, 0] }]), 1.4, { lead: 0.1, gap: 0.8 }).catch(() => {});
  }

  function playProgression() {
    if (!chords.length) newRound();
    let prev = null;
    const ev = [];
    chords.forEach((c, k) => {
      const v = referenceVoicing(c.rootPc, c.type, plan.style, prev);
      prev = v;
      for (const n of v) { ev.push({ t: k * 1.1, m: [0x90, n, 62] }); ev.push({ t: k * 1.1 + 1.0, m: [0x80, n, 0] }); }
    });
    looper.start(ev, chords.length * 1.1, { lead: 0.1, gap: 0.6 }).catch(() => {});
  }

  function addCard() {
    if (!plan) { start(); }
    const t = store.today();
    store.data.cards.push({ id: store.newId(), type: 'chords', title: `${PROGRESSIONS[plan.prog].name} od ${pcName(plan.keyPc, [5, 10, 3, 8, 1].includes(plan.keyPc))}, ${VOICING_STYLES[plan.style].name.toLowerCase()}`, payload: { ...plan }, box: 0, due: t, created: t });
    store.save();
    setStatus('Dodane do fiszek.', 'good');
  }

  renderControls();
  if (card) setTimeout(() => alive && start(), 300);

  return {
    onNote(e) {
      if (e.on && looper.active) looper.stop();
      if (e.on) held.add(e.note); else held.delete(e.note);
      clearTimeout(stableTimer);
      clearTimeout(wrongTimer);
      if (!e.on) {
        if (!held.size) {
          lastEvalKey = '';
          if (wrongPending) {          // one wrong attempt = from first key down to all keys up
            wrongPending = false;
            tries++;
            if (tries >= 3 && !wrongShown) { wrongShown = true; hint(); setStatus('Podpowiedź na klawiaturze: tak można go zagrać.', 'listen'); }
          }
        }
        return;
      }
      stableTimer = setTimeout(evaluate, STABLE_MS);
    },
    onPilot(a) {
      if (a === 'start') started ? skip() : start();
      if (a === 'repeat') listen();
      if (a === 'hint') hint();
      if (a === 'pause') { looper.stop(); bus.stop(); setStatus('Pauza.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(stableTimer); ctx.keyboard.mark([]); },
  };
}
