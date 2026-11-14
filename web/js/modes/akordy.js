// 4. Chord gym: I show a chord, you play it in the asked voicing.
import * as bus from '../bus.js';
import { checkChord, chordGymPlan, chordPcs, CHORDS, movement, pcName, progressionChords, PROGRESSIONS, referenceVoicing, rng, roleIn, VOICING_STYLES } from '../music.js';
import { BANK_BY_ID, bankChords, bankStyle, FAMILIES, keyName, nextSet, PASS_SAY, secondPass, setTonic, withSevenths } from '../progbank.js';
import { bottomWord, closestInversions, INV_NAMES, invPlan, invStage, invSymbol } from '../inversions.js';
import { roundResult, stepLevel } from '../drill.js';
import * as store from '../store.js';
import { el, status, fill, add } from '../ui.js';
import { addLine, createDrill, drillDock, seriesCard, verdict } from '../drillui.js';
import { Looper, playEvents, seed } from './common.js';

export const id = 'akordy';
const ROLE_TONE = { 1: 'var(--role-1)', 2: 'var(--role-3)', 3: 'var(--role-3)', 4: 'var(--role-3)', 5: 'var(--role-5)', 6: 'var(--role-7)', 7: 'var(--role-7)', 9: 'var(--role-t)', 11: 'var(--role-t)', 13: 'var(--role-t)' };
const RECENT = 12;   // a bank progression played in the last 12 rounds is pushed back hard
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
  // 1.12: 'real' = real progressions from the bank (default), 'auto' = the old exercise rounds, or manual
  let pick = store.data.modes[id]?.pick || 'real';
  const times = [];
  let shownAt = 0;
  let wrongShown = false;
  let wrongPending = false;
  let wrongTimer = null;
  let hintUsed = false;
  let lastWrong = '';
  let parts = [];           // 1.13.1: the chords of this round; the level moves once per progression

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
      sel('Wybór', manual ? 'manual' : pick, [['real', 'Prawdziwe progresje (wg poziomu)'], ['inv', 'Przewroty (od podstaw)'], ['auto', 'Ćwiczenia ii–V–I i pop (wg poziomu)'], ['manual', 'Sam wybieram']], (v) => {
        manual = v === 'manual' ? (manual || { prog: 'twoFiveOne', style: 'any', keyPc: 0 }) : null;
        if (v !== 'manual') pick = v;
        Object.assign(store.mode(id), { manual, pick }); store.save(); renderControls();
        if (started) { newRound(); setStatus('Zagraj akord i trzymaj chwilę.', 'turn'); }
      }),
      // 1.13: any inversion is fine where nothing says what goes at the bottom
      !manual && pick === 'inv' ? null : el('label', { class: 'check', title: 'Włączone: akord możesz zagrać w dowolnym przewrocie, na dole dowolny jego dźwięk. Akord z kreską (np. G/B) i tak mówi, co ma być na dole.' },
        el('input', { type: 'checkbox', checked: anyInv(), onchange: (e) => { store.mode(id).anyInv = e.target.checked; store.save(); if (started) renderBoard(); } }), ' Dowolny przewrót'),
      manual ? sel('Progresja', manual.prog, Object.entries(PROGRESSIONS).map(([k, p]) => [k, p.name]), (v) => { manual.prog = v; fixStyle(); store.save(); renderControls(); }) : null,
      manual ? sel('Układ', manual.style, Object.entries(VOICING_STYLES).filter(([k]) => PROGRESSIONS[manual.prog].sevenths || k === 'any' || k === 'rootBass').map(([k, s]) => [k, s.name]), (v) => { manual.style = v; store.save(); }) : null,
      manual ? sel('Tonacja', String(manual.keyPc), [0, 7, 2, 9, 4, 11, 6, 5, 10, 3, 8, 1].map((pc) => [String(pc), pcName(pc, [5, 10, 3, 8, 1].includes(pc))]), (v) => { manual.keyPc = Number(v); store.save(); }) : null,
    );
  }
  function anyInv() { return store.mode(id).anyInv !== false; }
  function fixStyle() { if (!PROGRESSIONS[manual.prog].sevenths && !['any', 'rootBass'].includes(manual.style)) manual.style = 'any'; }

  function newRound() {
    if (card) plan = card.payload;
    else plan = manual ? { ...manual } : pick === 'real' ? bankPlan() : pick === 'inv' ? { inv: true, style: 'any' } : chordGymPlan(store.mode(id).level, seed());
    if (plan.inv) {
      const lv = store.mode(id).invLevel || 1;
      const r = invPlan(lv, rng(seed()));
      Object.assign(plan, { title: r.title, stage: r.stage, level: lv });
      chords = r.chords;
    } else if (plan.real) {
      const first = bankChords(plan.real, plan.keyPc).map((c) => ({ ...c, pass: 1 }));
      chords = first;
      const kind = card ? null : secondPass(BANK_BY_ID[plan.real], store.mode(id).level || 1, rng(seed()));
      plan.second = kind;
      if (kind === 'same') chords = [...first, ...first.map((c) => ({ ...c, pass: 2 }))];
      if (kind === 'sevenths') chords = [...first, ...bankChords(plan.real, plan.keyPc, withSevenths(BANK_BY_ID[plan.real])).map((c) => ({ ...c, pass: 2 }))];
      if (kind === 'closer') {
        const flat = first.some((c) => c.symbol.includes('♭'));
        chords = [...first, ...closestInversions(first).map((c) => ({ ...c, symbol: invSymbol(c.rootPc, c.type, c.inv, flat), pass: 2 }))];
      }
    } else chords = progressionChords(plan.prog, plan.keyPc);
    i = 0;
    parts = [];
    renderBoard();
  }

  /** The next real progression: sets of up to 3 from one family in one key signature, then a neighbouring key. */
  function bankPlan() {
    const rec = store.mode(id);
    const level = rec.level || 1;
    const r = rng(seed());
    let set = rec.realSet;
    if (!set || !set.ids || set.at >= set.ids.length || set.ids.some((x) => !BANK_BY_ID[x])) {
      set = nextSet(level, r, { seen: rec.realSeen || {}, recent: rec.realRecent || [], prev: set && set.fam ? set : null });
    }
    const pid = set.ids[set.at];
    const p = BANK_BY_ID[pid];
    const fresh = !(rec.realSeen || {})[pid];
    rec.realSet = { ...set, at: set.at + 1 };
    rec.realSeen = { ...(rec.realSeen || {}), [pid]: ((rec.realSeen || {})[pid] || 0) + 1 };
    rec.realRecent = [...(rec.realRecent || []).filter((x) => x !== pid), pid].slice(-RECENT);
    store.save();
    return { real: pid, keyPc: setTonic(set, pid), style: bankStyle(level, p, r), fam: set.fam, k: set.at + 1, n: set.ids.length, fresh };
  }

  function planTitle() {
    if (plan.real) { const p = BANK_BY_ID[plan.real]; return `${p.name} w ${keyName(plan.keyPc, p.minor)}`; }
    return `${PROGRESSIONS[plan.prog].name} od ${pcName(plan.keyPc, [5, 10, 3, 8, 1].includes(plan.keyPc))}`;
  }

  /** The style actually checked: with "Dowolny przewrót" on, the root need not be at the bottom. */
  function effStyle() { return anyInv() && plan.style === 'rootBass' ? 'any' : plan.style; }
  function styleHelp(style) {
    if (anyInv() && ['any', 'rootBass'].includes(plan.style)) return 'Wszystkie dźwięki akordu, w dowolnej kolejności i w dowolnym przewrocie. W akordach septymowych kwintę możesz pominąć.';
    if (anyInv() && plan.style === 'shell') return 'Tylko pryma, tercja i septyma, w dowolnej kolejności. Tak gra lewa ręka w jazzie.';
    return style.help;
  }

  function renderBoard() {
    const c = chords[i];
    const style = VOICING_STYLES[plan.style];
    const p = plan.real ? BANK_BY_ID[plan.real] : null;
    const flat = c.symbol.includes('♭');
    const hasBass = c.bass !== null && c.bass !== undefined;
    const inChord = hasBass && chordPcs(c.rootPc, c.type).includes(c.bass);
    const invIdx = inChord ? chordPcs(c.rootPc, c.type).indexOf(c.bass) : -1;
    const base = pcName(c.rootPc, flat) + CHORDS[c.type].sym;
    // what goes at the bottom, said plainly (1.13): "Na dole E (tercja). Nad nim reszta C-dur: C, G."
    const bassLine = hasBass ? el('div', { class: 'bass-line' },
      el('span', { class: 'bl-bottom' }, `Na dole: ${pcName(c.bass, flat)}`),
      el('span', { class: 'bl-what' }, inChord ? ` (${INV_NAMES[invIdx]}: ${bottomWord(c.rootPc, c.type, invIdx, flat).split(' ')[0]} akordu).` : ' (dźwięk spoza akordu: bas idzie swoją drogą).'),
      el('span', { class: 'bl-top' }, ` Nad nim reszta akordu ${base}: ${chordPcs(c.rootPc, c.type).filter((pc) => pc !== c.bass).map((pc) => pcName(pc, flat)).join(', ')}, w dowolnej kolejności.`)) : null;
    const strip = [];
    chords.forEach((x, k) => {
      if (k > 0 && x.pass === 2 && chords[k - 1].pass === 1) strip.push(el('span', { class: 'cs-sep' }, plan.second === 'sevenths' ? 'drugi raz z septymami' : plan.second === 'closer' ? 'drugi raz w przewrotach' : 'drugi raz'));
      strip.push(el('span', { class: `cs ${k < i ? 'done' : ''} ${k === i ? 'now' : ''}` }, x.symbol));
    });
    fill(board, 
      plan.inv ? el('div', { class: 'prog-name' }, el('b', {}, 'Przewroty'), ` · ${plan.stage.name} · ${plan.title} · poziom ${plan.level.toFixed(1).replace('.', ',')}`) : null,
      plan.inv ? el('p', { class: 'prog-about' }, plan.stage.about) : null,
      p ? el('div', { class: 'prog-name' },
        el('b', {}, p.name), ` · ${keyName(plan.keyPc, p.minor)} · ${style.name.toLowerCase()}`,
        plan.n ? el('span', { class: 'prog-set' }, ` · ${FAMILIES[plan.fam]}: ${plan.k} z ${plan.n}`) : null,
        plan.fresh ? el('span', { class: 'prog-new' }, 'nowa') : null)
        : plan.inv ? null : el('div', { class: 'prog-name' }, `${PROGRESSIONS[plan.prog].name}, ${style.name.toLowerCase()}`),
      p ? el('p', { class: 'prog-about' }, el('span', { class: 'prog-rn' }, p.rn), ` ${p.about}`) : null,
      el('div', { class: 'chord-now' },
        el('div', { class: 'chord-symbol' }, c.symbol),
        el('div', { class: 'chord-what' }, `${CHORDS[c.type].name}: ${chordPcs(c.rootPc, c.type).map((pc) => pcName(pc, flat)).join(' ')}`)),
      bassLine,
      el('div', { class: 'chord-strip' }, strip),
      hasBass ? null : el('p', { class: 'style-help' }, styleHelp(style)));
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
    if (!card) parts.push({ score: 0, passed: false, tip: { kind: 'skip', text: `${chords[i].symbol} pominięty: liczy się jako 0.` } });
    if (i >= chords.length - 1) {
      if (!card) finishRound();
      newRound();
      setStatus('Nowa runda.', 'turn');
      return;
    }
    i++;
    renderBoard();
    setStatus('Pominięty. Zagraj następny.', 'turn');
  }

  /** The progression is done: one counted attempt with the mean of its chords. */
  function finishRound() {
    const res = roundResult(parts);
    parts = [];
    if (!res) return null;
    const tip = res.tip || { kind: null, text: `Cała progresja: ${res.score} punktów.` };
    let r;
    if (plan.inv) {
      // the Przewroty mode keeps its own level; the series still counts it
      const rec = store.mode(id);
      const before = rec.invLevel || 1;
      rec.invLevel = stepLevel(before, res.score);
      r = drill.counted({ przewroty: res.score }, res.passed, tip);
      r.change = { levelBefore: before, levelAfter: rec.invLevel };
    } else r = drill.counted({ akordy: res.score }, res.passed, tip);
    if (r.cold) addLine(line, `Zimny start dziś: ${r.score} pkt.`);
    if (r.summary) fill(summaryBox, seriesCard(r.summary, drill.labels, () => { fill(summaryBox); }));
    return r;
  }

  function evaluate() {
    if (!started || !chords.length) return;
    const notes = [...held].sort((a, b) => a - b);
    const key = notes.join(',');
    if (notes.length < 2 || key === lastEvalKey) return;
    lastEvalKey = key;
    const c = chords[i];
    const res = checkChord(notes, c.rootPc, c.type, effStyle(), c.bass, { freeBass: anyInv() && plan.style === 'shell' });
    ctx.keyboard.mark(notes.map((n) => {
      if (c.bass != null && n === notes[0] && n % 12 === c.bass && !chordPcs(c.rootPc, c.type).includes(c.bass)) return { note: n, text: 'bas', tone: 'var(--role-1)' };
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
      if (card) {
        // a card passes when every chord of the progression is right the first time
        card._fails = (card._fails || 0) + (passed ? 0 : 1);
      } else parts.push({ score, passed, tip });
      prevVoicing = notes;
      setStatus(passed ? 'Dobrze!' : 'Jest.', 'good', tip);
      renderStats();
      if (!card && i === chords.length - 1) {
        const r = finishRound();
        const f = (x) => x.toFixed(1).replace('.', ',');
        if (r) addLine(line, `Cała progresja: ${r.score} punktów${Math.abs(r.change.levelAfter - r.change.levelBefore) >= 0.05 ? `, poziom ${f(r.change.levelBefore)} → ${f(r.change.levelAfter)}` : ''}.`);
      }
      setTimeout(() => {
        if (!alive) return;
        i++;
        if (i >= chords.length) {
          if (card) { ctx.onResult && ctx.onResult(!card._fails); return; }
          newRound();
          setStatus('Nowa runda.', 'turn');
        } else {
          renderBoard();
          if (chords[i].pass === 2 && chords[i - 1].pass === 1) setStatus(PASS_SAY[plan.second], 'turn');
        }
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
      if (!res.bassOk) bits.push(`na dole ma być ${pcName(c.bass != null ? c.bass : c.rootPc, flat)}`);
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
    const v = c.voicing || referenceVoicing(c.rootPc, c.type, plan.style, prevVoicing, c.bass);
    ctx.keyboard.mark(v.map((n) => { const ro = roleIn(n % 12, c.rootPc, c.type); return { note: n, text: ro || 'bas', tone: ro ? ROLE_TONE[ro] : 'var(--role-1)' }; }));
    hintUsed = true;
  }

  function listen() {
    if (!chords.length) newRound();
    const c = chords[i];
    const v = c.voicing || referenceVoicing(c.rootPc, c.type, plan.style, prevVoicing, c.bass);
    hintUsed = true;
    looper.start(v.flatMap((n) => [{ t: 0, m: [0x90, n, 64] }, { t: 1.4, m: [0x80, n, 0] }]), 1.4, { lead: 0.1, gap: 0.8 }).catch(() => {});
  }

  function playProgression() {
    if (!chords.length) newRound();
    let prev = null;
    const ev = [];
    chords.forEach((c, k) => {
      const v = c.voicing || referenceVoicing(c.rootPc, c.type, plan.style, prev, c.bass);
      prev = v;
      for (const n of v) { ev.push({ t: k * 1.1, m: [0x90, n, 62] }); ev.push({ t: k * 1.1 + 1.0, m: [0x80, n, 0] }); }
    });
    looper.start(ev, chords.length * 1.1, { lead: 0.1, gap: 0.6 }).catch(() => {});
  }

  function addCard() {
    if (!plan) { start(); }
    if (plan.inv) { setStatus('Fiszki są dla progresji. Przewroty ćwiczysz tutaj.', 'listen'); return; }
    const t = store.today();
    store.data.cards.push({ id: store.newId(), type: 'chords', title: `${planTitle()}, ${VOICING_STYLES[plan.style].name.toLowerCase()}`, payload: { real: plan.real, prog: plan.prog, keyPc: plan.keyPc, style: plan.style }, box: 0, due: t, created: t });
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
