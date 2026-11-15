// Nuty: Spartito in Trener. A world of its own: the rest of Trener stays without notation.
//   Na żywo   what you hold, written in the key; your last notes as a row of notes (pitch, no rhythm)
//   Czytanie  a note or chord on the staff: play it. Ten steps from five notes of one hand to chords.
// The engine (Miki's Spartito, web/js/spartito/engine.js) is kept off git; without it this mode says so.
import * as store from '../store.js';
import { el, fill, add, status } from '../ui.js';
import { getKey, setKey, onKeyChange } from '../key.js';
import { keyName, stepKey, wheelIndex, spellName } from '../theory.js';
import { identify } from '../chords.js';
import { plural } from '../music.js';
import { layoutSvg, label } from '../spartito/svg.js';
import {
  SP, RED, layout, chordNotes, sequenceNotes, stavesFor, groupOnsets, isMeter, fifthsOf, placeWords,
  READ_LEVELS, levelItems, pickItem, checkCard, cardScore, noteCard, nextReadLevel, median,
} from '../spartito/notes.js';

export const id = 'nuty';
const SERIES = 20;
const TABS = [['zywo', 'Na żywo'], ['czytanie', 'Czytanie']];

export function mount(stage, ctx) {
  const rec = store.mode('nuty');
  rec.tab = rec.tab || 'zywo';
  rec.read = rec.read || { level: 1, items: {}, keyI: 0 };
  rec.names = rec.names !== false;
  let E = null;
  let alive = true;
  let tab = null;
  const body = el('div', { class: 'nuty-body' });
  const tabs = el('div', { class: 'seg-ctl nuty-tabs', role: 'tablist', 'aria-label': 'Nuty' });

  fill(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Nuty'),
      el('p', { class: 'mode-sub' }, 'Twoje granie zapisane nutami, silnikiem Spartito. To osobny świat: reszta Trenera zostaje bez nut.'))),
    tabs, body);

  function renderTabs() {
    fill(tabs, TABS.map(([v, t]) => el('button', { class: rec.tab === v ? 'on' : '', role: 'tab', 'aria-selected': String(rec.tab === v), onclick: () => { rec.tab = v; store.save(); open(); } }, t)));
  }

  function open() {
    renderTabs();
    tab && tab.destroy();
    tab = null;
    ctx.keyboard.mark([]);
    if (!E) return;
    tab = rec.tab === 'czytanie' ? readTab(body, E, rec, ctx) : liveTab(body, E, rec, ctx);
  }

  renderTabs();
  fill(body, el('p', { class: 'muted' }, 'Ładuję silnik nut…'));
  import('../spartito/engine.js').then((m) => { if (!alive) return; E = m; open(); }).catch(() => {
    if (!alive) return;
    fill(body, el('div', { class: 'nuty-missing' },
      el('h2', {}, 'Brak silnika Spartito na tym komputerze'),
      el('p', {}, 'Silnik nut to twój kod Spartito i nie jest w repozytorium. W folderze Trenera uruchom:'),
      el('pre', {}, 'python3 tools/spartito_engine.py'),
      el('p', { class: 'muted' }, 'Narzędzie bierze spartito-src/spartito.js albo B:\\Spartito\\spartito.js i zapisuje web/js/spartito/engine.js. Potem odśwież Trenera.')));
  });

  return {
    onNote(e) { tab && tab.onNote && tab.onNote(e); },
    onPilot(a) { tab && tab.onPilot && tab.onPilot(a); },
    get pilotLabels() { return tab && tab.pilotLabels; },
    destroy() { alive = false; tab && tab.destroy(); ctx.keyboard.mark([]); },
  };
}

// --- shared --------------------------------------------------------------------------------------------
function keyBar(onChange) {
  const box = el('div', { class: 'nuty-key' });
  function render() {
    const k = getKey();
    fill(box,
      el('button', { class: 'btn tiny', title: 'Tonacja: kwintę w dół', onclick: () => setKey(stepKey(getKey(), -1)) }, '◀'),
      el('span', { class: 'nuty-key-name' }, `Tonacja: ${keyName(k, true)}`),
      el('button', { class: 'btn tiny', title: 'Tonacja: kwintę w górę', onclick: () => setKey(stepKey(getKey(), 1)) }, '▶'));
  }
  render();
  const off = onKeyChange(() => { render(); onChange(); });
  return { node: box, destroy: off };
}

function keyFifths() { return fifthsOf(wheelIndex(getKey())); }

/** A note's name as Trener writes it (H or B by the setting), from Spartito's own spelling. */
function nameOf(E, p, key, sp = 0) {
  const s = E.nt_spell(p, key, sp);
  return { text: `${spellName(s.letter, s.alter)}${s.oct}`, step: s.step, letter: s.letter, alter: s.alter };
}

/** Note names next to the heads (hits are in the order the notes were given: id = index + 1). */
function headNames(E, L, notes, key, { leftForRight = false } = {}) {
  let out = '';
  for (const h of L.hits) {
    if (h.k !== 'n') continue;
    const n = notes[h.id - 1];
    if (!n) continue;
    const left = leftForRight && !n.sel;      // a card with your wrong note: the right name on the left, yours on the right
    out += label(left ? h.x0 - 3 : h.x1 + 3, (h.y0 + h.y1) / 2 + 4, nameOf(E, n.p, key, n.sp || 0).text,
      { size: 11, anchor: left ? 'end' : 'start', color: n.sel ? '#c0283a' : '#6a6480' });
  }
  return out;
}

function scoreBox(L, opts = {}) {
  const box = el('div', { class: `nuty-score ${opts.cls || ''}`, 'data-heads': String(L.hits.filter((h) => h.k === 'n').length), 'data-pitches': opts.pitches ? opts.pitches.join(' ') : null });
  box.innerHTML = layoutSvg(L, { drop: opts.hideMeter ? (op) => isMeter(op, L.sp) : null, extra: opts.extra || '', label: opts.label || 'Nuty', zoom: opts.zoom || null });
  return box;
}

// --- Na żywo ----------------------------------------------------------------------------------------------
function liveTab(body, E, rec, ctx) {
  const held = new Set();
  const onsets = [];        // {note, t}
  let timer = null;
  const chordBox = el('div', { class: 'nuty-chord' });
  const rowBox = el('div', { class: 'nuty-row' });
  const keys = keyBar(() => draw());
  const namesBox = el('label', { class: 'nuty-check' },
    el('input', { type: 'checkbox', checked: rec.names, onchange: (ev) => { rec.names = ev.target.checked; store.save(); draw(); } }), 'Nazwy obok nut');
  fill(body,
    el('div', { class: 'nuty-bar' }, keys.node, namesBox,
      el('button', { class: 'btn small', onclick: () => { onsets.length = 0; draw(); } }, 'Wyczyść')),
    el('div', { class: 'nuty-live' }, chordBox,
      el('section', { class: 'nuty-row-wrap' }, el('h2', {}, 'Ostatnie dźwięki ', el('small', {}, '(wysokość bez rytmu)')), rowBox)));
  draw();

  function draw() {
    const key = keyFifths();
    const pitches = [...held].sort((a, b) => a - b);
    // the chord you hold
    const notes = chordNotes(pitches.length ? pitches : []);
    const L = layout(E, notes, { key, width: 220, sp: SP * 1.1, finalBar: false });
    const r = pitches.length ? identify(pitches, getKey()) : null;
    fill(chordBox,
      el('div', { class: 'nuty-chord-name' }, el('span', { class: 'muted' }, 'Trzymasz'), el('b', {}, r ? r.name : '–'), r && r.number ? el('span', { class: 'nuty-num' }, r.number) : null),
      scoreBox(L, { hideMeter: true, cls: 'chord', zoom: 1.25, label: r ? `Trzymasz: ${r.name}` : 'Nic nie trzymasz', extra: rec.names ? headNames(E, L, notes, key) : '' }),
      el('p', { class: 'muted nuty-detail' }, r ? r.detail : 'Przytrzymaj akord albo dźwięk.'));
    // your last notes
    const groups = groupOnsets(onsets).slice(-16);
    if (!groups.length) { fill(rowBox, el('p', { class: 'muted' }, 'Zagraj coś, a zobaczysz tu swoje dźwięki zapisane nutami.')); return; }
    const seq = sequenceNotes(groups);
    const L2 = layout(E, seq.notes, { key, staves: seq.staves, num: seq.num, den: 4, width: 1000, sp: SP, finalBar: false });
    fill(rowBox, scoreBox(L2, { hideMeter: true, cls: 'row', zoom: 1, label: 'Ostatnie dźwięki', extra: rec.names ? headNames(E, L2, seq.notes, key) : '' }));
  }

  function later() {
    clearTimeout(timer);
    timer = setTimeout(draw, held.size ? 45 : 120);   // a chord is rarely pressed at one instant
  }

  return {
    onNote(e) {
      if (e.on) { held.add(e.note); onsets.push({ note: e.note, t: typeof e.ts === 'number' ? e.ts : performance.now() / 1000 }); if (onsets.length > 200) onsets.splice(0, 100); }
      else held.delete(e.note);
      later();
    },
    destroy() { clearTimeout(timer); keys.destroy(); },
  };
}

// --- Czytanie ---------------------------------------------------------------------------------------------
function readTab(body, E, rec, ctx) {
  const R = rec.read;
  let run = null;           // { level, key, items, results, card, t0, played, wrongOnce, next }
  let timer = null;
  const view = el('div', { class: 'nuty-read' });
  fill(body, view);
  intro();

  function lvl() { return READ_LEVELS[Math.max(1, Math.min(READ_LEVELS.length, R.level)) - 1]; }

  function intro(summary = null) {
    run = null;
    ctx.keyboard.mark([]);
    const L = lvl();
    const next = READ_LEVELS[L.n] || null;
    fill(view,
      el('div', { class: 'nuty-ladder' },
        el('div', {}, el('span', { class: 'muted' }, 'Teraz '), el('b', {}, `${L.n}. ${L.name}`)),
        next ? el('div', { class: 'muted' }, `Dalej: ${next.n}. ${next.name}`) : null,
        el('div', { class: 'muted' }, `Cel: ${SERIES} kart, 9 na 10 dobrze, połowa w ${(L.goalMs / 1000).toFixed(1).replace('.', ',')} s.`)),
      summary,
      el('p', {}, 'Na pięciolinii pojawia się nuta albo akord. Zagraj dokładnie to, w tej oktawie. Liczy się czas: czytanie to szybkość.'),
      el('div', { class: 'actions' },
        el('button', { class: 'btn primary', onclick: () => start() }, summary ? 'Następna seria' : 'Start'),
        el('button', { class: 'btn small', onclick: () => { R.level = Math.max(1, R.level - 1); store.save(); intro(); } }, 'Łatwiej'),
        el('button', { class: 'btn small', onclick: () => { R.level = Math.min(READ_LEVELS.length, R.level + 1); store.save(); intro(); } }, 'Trudniej')));
  }

  function start() {
    const { level, key, items } = levelItems(R.level, R.keyI || 0);
    run = { level, key, items, results: [], card: null, lastId: null };
    nextCard();
  }

  function nextCard() {
    clearTimeout(timer);
    ctx.keyboard.mark([]);
    if (run.results.length >= SERIES) return finish();
    const card = pickItem(run.items, R.items, run.lastId, run.level.goalMs);
    run.card = card; run.lastId = card.id;
    run.played = new Set(); run.held = new Set(); run.wrongOnce = false; run.locked = false;
    show(null);
    run.t0 = performance.now();
  }

  function show(res) {
    const c = run.card;
    const notes = chordNotes(c.pitches, { st: c.st, wrong: res && !res.ok ? res.wrong : [] });
    // one clef when the card lives in one (bigger, calmer); the grand staff when it needs both
    const L = layout(E, notes, { key: c.key, staves: stavesFor(c.pitches, c.st), width: 300, sp: SP * 1.3, finalBar: false });
    // names after a right answer; after a wrong one your note is red and the status line names the right one
    const names = res && res.ok ? headNames(E, L, notes, c.key) : '';
    const n = run.results.length;
    let msg;
    if (!res) msg = status(c.pitches.length > 1 ? `Zagraj ${c.pitches.length} dźwięki naraz.` : 'Zagraj tę nutę.', 'turn');
    else if (res.ok) msg = status(`Dobrze. ${describe(c)}`, 'good');
    else msg = status(`${res.octave ? 'Dobra nuta, zła oktawa.' : 'Nie ta.'} ${describe(c)} Zagraj poprawnie, a pójdziemy dalej.`, 'bad');
    fill(view,
      el('div', { class: 'nuty-read-top' },
        el('span', {}, `${run.level.n}. ${run.level.name}`),
        el('span', { class: 'nuty-count' }, `${n} / ${SERIES}`)),
      scoreBox(L, { hideMeter: true, zoom: 1.6, cls: `card ${res ? (res.ok ? 'ok' : 'bad') : ''}`, label: 'Karta do przeczytania', extra: names, pitches: c.pitches }),
      msg,
      el('div', { class: 'actions' }, el('button', { class: 'btn small', onclick: () => intro() }, 'Przerwij serię')));
  }

  function describe(c) {
    if (c.pitches.length !== 1) return c.pitches.map((p) => nameOf(E, p, c.key).text).join(', ') + '.';
    const nm = nameOf(E, c.pitches[0], c.key);
    return `${nm.text}: ${placeWords(nm.step, c.st[0] === 1 ? 'bass' : 'treble')} w kluczu ${c.st[0] === 1 ? 'basowym' : 'wiolinowym'}.`;
  }

  function judge() {
    const c = run.card;
    const res = checkCard(c, [...run.played]);
    const ms = performance.now() - run.t0;
    if (!run.wrongOnce) {
      const ok = res.ok;
      noteCard(R.items, c.id, ok, ms);
      run.results.push({ id: c.id, ok, ms, score: cardScore(ok, ms, run.level.goalMs) });
      store.save();
    }
    if (res.ok) {
      run.locked = true;
      show(res);
      timer = setTimeout(nextCard, run.wrongOnce ? 900 : 450);
    } else {
      run.wrongOnce = true;
      show(res);
      ctx.keyboard.mark(c.pitches.map((p) => ({ note: p, text: nameOf(E, p, c.key).text.replace(/\d+$/, ''), tone: 'var(--good)' })));
      run.played = new Set();
    }
  }

  function finish() {
    const res = run.results;
    const ok = res.filter((r) => r.ok).length;
    const times = res.filter((r) => r.ok).map((r) => r.ms);
    const before = R.level;
    R.level = nextReadLevel(R.level, res, run.level.goalMs);
    if (run.level.keyed) R.keyI = (R.keyI || 0) + 1;
    const avg = Math.round(res.reduce((a, r) => a + r.score, 0) / Math.max(1, res.length));
    store.logSeries('nuty', { n: res.length, ok, avg });
    const slow = [...new Set(res.filter((r) => !r.ok || r.ms > run.level.goalMs).map((r) => r.id))].slice(0, 6)
      .map((idv) => run.items.find((x) => x.id === idv)).filter(Boolean);
    const moved = R.level > before ? `Awans na poziom ${R.level}.` : R.level < before ? `Poziom niżej: ${R.level}. Utrwal to, co było.` : 'Zostajesz na tym poziomie.';
    const summary = el('div', { class: 'nuty-summary' },
      el('h2', {}, `Seria: ${ok} z ${res.length} dobrze`),
      el('p', {}, `Połowa kart przeczytana w ${(median(times) / 1000).toFixed(1).replace('.', ',')} s. ${moved}`),
      slow.length ? el('p', { class: 'muted' }, `Do powtórki (wrócą częściej): ${slow.map((c) => c.pitches.map((p) => nameOf(E, p, c.key).text).join('+')).join(', ')}.`) : null);
    store.save();
    intro(summary);
  }

  return {
    onNote(e) {
      if (!run || !run.card || run.locked || !e.on) { if (run && run.held) run.held.delete(e.note); return; }
      run.played.add(e.note);
      run.held.add(e.note);
      const need = run.card.pitches.length;
      clearTimeout(timer);
      if (need === 1) judge();
      else if (run.played.size >= need) timer = setTimeout(judge, 90);   // the last key of a chord comes a bit later
      else timer = setTimeout(judge, 700);                               // fewer keys than the card: judged after a moment
    },
    onPilot(a) {
      if (a === 'start') { if (!run) start(); }
      else if (a === 'end') intro();
    },
    pilotLabels: ['Start', null, null, null, 'Przerwij'],
    destroy() { clearTimeout(timer); },
  };
}

void plural; void add; void RED;
