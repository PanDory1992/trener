// Nuty: Spartito in Trener. A world of its own: the rest of Trener stays without notation.
//   Na żywo   what you hold, written in the key; your last notes as a row of notes (pitch, no rhythm)
//   Czytanie  a note or chord on the staff: play it. Ten steps from five notes of one hand to chords.
//   Zeszyt    everything played today (the router's note log) in phrases, as notes; save, export, listen
//   Śpiewnik  a song from Piosenki: the band plays, you play the melody, out comes a lead sheet (chords, words)
// The engine (Miki's Spartito, web/js/spartito/engine.js) is kept off git; without it this mode says so.
import * as store from '../store.js';
import { el, fill, add, status } from '../ui.js';
import { getKey, setKey, onKeyChange } from '../key.js';
import { keyName, stepKey, wheelIndex, spellName } from '../theory.js';
import { identify } from '../chords.js';
import { plural } from '../music.js';
import * as bus from '../bus.js';
import { parseChart, guessKeys, degreeIn, STARTERS } from '../songs.js';
import { GROOVES } from '../grooves.js';
import { songBand, chunkEvents } from '../bandplay.js';
import { layoutSvg, label } from '../spartito/svg.js';
import {
  SP, RED, layout, chordNotes, sequenceNotes, stavesFor, groupOnsets, isMeter, fifthsOf, placeWords,
  READ_LEVELS, levelItems, pickItem, checkCard, cardScore, noteCard, nextReadLevel, median,
  engrave, estimateTempo, guessFifths, phraseNotes, melodyFrom, lyricWords, spaceSystems, sheetMarks,
} from '../spartito/notes.js';

export const id = 'nuty';
const SERIES = 20;
const TABS = [['zywo', 'Na żywo'], ['czytanie', 'Czytanie'], ['zeszyt', 'Zeszyt'], ['spiewnik', 'Śpiewnik']];
const TAB_FN = () => ({ zywo: liveTab, czytanie: readTab, zeszyt: bookTab, spiewnik: sheetTab });

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
    tab = (TAB_FN()[rec.tab] || liveTab)(body, E, rec, ctx);
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


// --- exports, shared by Zeszyt and Śpiewnik ----------------------------------------------------------------
function download(name, data, mime) {
  const bytes = typeof data === 'string' ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 255) : Uint8Array.from(data);
  const a = el('a', { href: URL.createObjectURL(new Blob([bytes], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fileName = (title) => (String(title || 'Nuty').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Nuty');

/** MIDI, MusicXML, PDF (the engine's own exports) and print (the page with chords and words). */
function exportRow(E, get) {
  const go = (fmt) => {
    const x = get();
    const name = fileName(x.title);
    if (fmt === 'midi') return download(`${name}.mid`, E.ex_midiBytes(engrave(E, x.notes, x.opts).M, x.bpm, x.opts.key || 0, x.title), 'audio/midi');
    if (fmt === 'xml') return download(`${name}.musicxml`, E.ex_musicxml(engrave(E, x.notes, x.opts).S, x.title), 'application/vnd.recordare.musicxml+xml');
    if (fmt === 'pdf') return download(`${name}.pdf`, E.ex_pdf(layout(E, x.notes, { ...x.opts, title: x.title, width: E.ex_PW, sp: 5, marginL: 60, marginR: 42, top: 0, bottom: 0, finalBar: true })), 'application/pdf');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${name}</title><style>body{margin:0}svg{width:100%;height:auto}@page{margin:12mm}</style>${x.print()}`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };
  return el('div', { class: 'actions nuty-export' }, el('span', { class: 'muted' }, 'Eksport:'),
    el('button', { class: 'btn small', onclick: () => go('print'), title: 'Druk albo PDF z przeglądarki (z akordami i tekstem)' }, 'Drukuj'),
    el('button', { class: 'btn small', onclick: () => go('pdf') }, 'PDF'),
    el('button', { class: 'btn small', onclick: () => go('xml'), title: 'Do MuseScore' }, 'MusicXML'),
    el('button', { class: 'btn small', onclick: () => go('midi'), title: 'Przeciągnij na ścieżkę w Studio One' }, 'MIDI'));
}

// --- Zeszyt ---------------------------------------------------------------------------------------------------
function bookTab(body, E, rec, ctx) {
  rec.saved = rec.saved || [];
  let day = new Date().toLocaleDateString('sv');          // YYYY-MM-DD in local time
  let list = [], pick = null, view = { bpm: 80, quant: 24, key: 0 };
  let alive = true;
  const listBox = el('div', { class: 'nuty-phrases' });
  const scoreWrap = el('div', { class: 'nuty-phrase' });
  const dayInput = el('input', { type: 'date', value: day, onchange: (e) => { day = e.target.value || day; load(); } });
  fill(body,
    el('p', { class: 'muted' }, 'Wszystko, co dziś zagrałeś, zapisuje router. Tu jest to podzielone na frazy (po 3 s ciszy) i zapisane nutami. Nic nie trzeba nagrywać.'),
    el('div', { class: 'nuty-bar' }, el('label', {}, 'Dzień ', dayInput),
      el('button', { class: 'btn small', onclick: () => load() }, 'Odśwież')),
    el('div', { class: 'nuty-book' }, listBox, scoreWrap));
  load();

  async function load() {
    fill(listBox, el('p', { class: 'muted' }, 'Czytam…'));
    let r;
    try { r = await bus.getJSON(`/api/phrases?day=${encodeURIComponent(day)}`); } catch { r = { phrases: [] }; }
    if (!alive) return;
    list = (r.phrases || []).slice().reverse();
    renderList();
    if (!pick && list.length) open(list[0]);
    if (!list.length) fill(scoreWrap, el('p', { class: 'muted' }, 'Tego dnia nic nie zagrałeś (albo router nie zapisał).'));
  }

  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const savedOf = (ph) => rec.saved.find((x) => x.day === day && Math.abs(x.start - ph.start) < 0.01);

  function renderList() {
    fill(listBox, list.length ? list.map((ph) => {
      const sv = savedOf(ph);
      return el('button', { class: `nuty-ph ${pick === ph ? 'on' : ''}`, onclick: () => open(ph) },
        el('b', {}, sv ? sv.name : hhmm(ph.start)), el('span', {}, `${Math.round(ph.dur)} s · ${ph.n} ${plural(ph.n, 'nuta', 'nuty', 'nut')}`));
    }) : null);
  }

  function open(ph) {
    pick = ph;
    const sv = savedOf(ph);
    view = sv ? { bpm: sv.bpm, quant: sv.quant, key: sv.key } : { bpm: estimateTempo(ph.notes), quant: 24, key: guessFifths(ph.notes) };
    renderList();
    draw();
  }

  function current() {
    const sv = savedOf(pick);
    const title = sv ? sv.name : `Fraza ${day} ${hhmm(pick.start)}`;
    const notes = phraseNotes(pick.notes, view.bpm);
    const opts = { key: view.key, quant: view.quant, staves: stavesFor(notes.map((n) => n.p)) };
    return { title, notes, opts, bpm: view.bpm, print: () => layoutSvg(layout(E, notes, { ...opts, title, width: 900, sp: 8 })) };
  }

  function draw() {
    if (!pick) return;
    const x = current();
    const L = layout(E, x.notes, { ...x.opts, title: x.title, width: 1000, sp: SP });
    const sv = savedOf(pick);
    const nameIn = el('input', { type: 'text', placeholder: 'Nazwa, np. „Ballada, pomysł”', value: sv ? sv.name : '' });
    const set = (k, v) => { view[k] = v; if (sv) Object.assign(sv, { [k]: v }); store.save(); draw(); };
    fill(scoreWrap,
      el('div', { class: 'nuty-bar' },
        el('span', {}, 'Tempo ', el('button', { class: 'btn tiny', onclick: () => set('bpm', Math.max(30, view.bpm - 5)) }, '−'), ` ${view.bpm} `,
          el('button', { class: 'btn tiny', onclick: () => set('bpm', Math.min(220, view.bpm + 5)) }, '+')),
        el('span', { class: 'seg-ctl tiny' }, [[24, 'ósemki'], [12, 'szesnastki']].map(([q, t]) => el('button', { class: view.quant === q ? 'on' : '', onclick: () => set('quant', q) }, t))),
        el('span', {}, 'Znaki ', el('button', { class: 'btn tiny', onclick: () => set('key', Math.max(-6, view.key - 1)) }, '♭'),
          el('button', { class: 'btn tiny', onclick: () => set('key', Math.min(6, view.key + 1)) }, '♯')),
        el('button', { class: 'btn small', onclick: () => listen() }, 'Posłuchaj')),
      el('p', { class: 'muted small' }, 'Tempo i znaki zgaduję z twojego grania. Bez metronomu rytm jest przybliżony: popraw tempo, aż nuty będą proste.'),
      scoreBox(L, { cls: 'phrase', label: x.title }),
      el('div', { class: 'nuty-bar' }, nameIn, el('button', { class: 'btn small', onclick: () => {
        const name = nameIn.value.trim() || `Fraza ${hhmm(pick.start)}`;
        if (sv) sv.name = name; else rec.saved.push({ id: store.newId(), day, start: pick.start, name, ...view });
        store.save(); renderList(); draw();
      } }, sv ? 'Zmień nazwę' : 'Zapisz w zeszycie')),
      exportRow(E, current),
      rec.saved.length ? el('details', { class: 'nuty-saved' }, el('summary', {}, `Zapisane (${rec.saved.length})`),
        el('ul', {}, rec.saved.slice().reverse().map((x) => el('li', {}, el('button', { class: 'link', onclick: () => { day = x.day; dayInput.value = day; pick = null; load().then(() => { const ph = list.find((p) => Math.abs(p.start - x.start) < 0.01); if (ph) open(ph); }); } }, `${x.name} (${x.day})`))))) : null);
  }

  function listen() {
    if (!pick) return;
    const ev = [];
    const t0 = Math.min(...pick.notes.map((n) => n[1]));
    for (const [p, t, d, v] of pick.notes) { ev.push({ t: t - t0, m: [0x90, p, v || 80] }, { t: t - t0 + d, m: [0x80, p, 0] }); }
    bus.play(ev.sort((a, b) => a.t - b.t).slice(0, 3800)).catch(() => {});
  }

  return { destroy() { alive = false; } };
}

// --- Śpiewnik -------------------------------------------------------------------------------------------------
function sheetTab(body, E, rec, ctx) {
  rec.sheets = rec.sheets || {};
  rec.sing = rec.sing || { song: null, sec: 0, tempo: 80, groove: 'pop' };
  const S = rec.sing;
  let take = null, alive = true;
  const songs = () => [...store.data.songs, ...STARTERS];
  const box = el('div', { class: 'nuty-sheet' });
  fill(body, el('p', { class: 'muted' }, 'Piosenka z Piosenek. Zespół gra akordy, ty grasz melodię prawą ręką (to, co śpiewasz). Wychodzi kartka do śpiewania: melodia, akordy nad nią, tekst pod nią.'), box);
  render();

  function song() { return songs().find((x) => x.id === S.song) || songs()[0]; }
  function analyse() {
    const sg = song();
    const chart = parseChart(sg.text);
    const g = guessKeys(chart.chords)[0];
    const key = g ? g.key : getKey();
    const secs = S.sec < 0 ? chart.sections : [chart.sections[Math.min(S.sec, chart.sections.length - 1)]].filter(Boolean);
    return { sg, chart, key, secs, id: `${sg.id}|${S.sec}` };
  }
  function steps(a) {
    const out = [];
    for (const s of a.secs) {
      if (a.secs.length > 1) out.push({ k: 'sec', label: s.name });
      s.chords.forEach((c, i) => {
        const d = degreeIn(a.key, c);
        const st = { k: 'chord', d: d.deg, a: d.alt, q: c.quality, bars: (s.beats[i] || 4) / 4, lock: 1 };
        if (c.bass && c.bass.pc !== c.pc) st.bass = (((c.bass.pc - c.pc) % 12) + 12) % 12;
        out.push(st);
      });
    }
    return out;
  }

  function render() {
    const a = analyse();
    S.song = a.sg.id;
    const sheet = rec.sheets[a.id];
    const sel = (label, value, items, on) => el('label', {}, `${label} `, el('select', { onchange: (e) => on(e.target.value) }, items.map(([v, t]) => el('option', { value: v, selected: String(v) === String(value) }, t))));
    fill(box,
      el('div', { class: 'nuty-bar' },
        sel('Piosenka', S.song, songs().map((x) => [x.id, x.title]), (v) => { S.song = v; S.sec = 0; store.save(); render(); }),
        sel('Część', S.sec, [...a.chart.sections.map((x, i) => [i, x.name || `część ${i + 1}`]), [-1, 'Cała piosenka']], (v) => { S.sec = Number(v); store.save(); render(); }),
        sel('Styl', S.groove, GROOVES.map((g) => [g.id, g.name]), (v) => { S.groove = v; store.save(); }),
        el('label', {}, 'Tempo ', el('input', { type: 'number', min: 40, max: 200, value: S.tempo, class: 'nuty-tempo', onchange: (e) => { S.tempo = Math.max(40, Math.min(200, Number(e.target.value) || 80)); store.save(); } }))),
      el('div', { class: 'actions' },
        take ? el('button', { class: 'btn', onclick: () => stop() }, 'Stop') : el('button', { class: 'btn primary', onclick: () => record() }, sheet ? 'Nagraj melodię jeszcze raz' : 'Nagraj melodię'),
        el('span', { class: 'muted', id: 'sheet-status' }, take ? 'Odliczam takt, potem graj melodię…' : '')),
      sheet ? drawSheet(a, sheet) : el('p', { class: 'muted' }, 'Jeszcze bez kartki. Nagraj melodię: jedno przejście z zespołem.'));
  }

  function sheetNotes(sheet) { return sheet.notes.map(([p, t, d]) => ({ p, t, d, st: 0 })); }

  function build(a, sheet, { width = 1000, sp = SP } = {}) {
    const notes = sheetNotes(sheet);
    const title = `${a.sg.title}${a.secs.length === 1 && a.chart.sections.length > 1 ? ` – ${a.secs[0].name}` : ''}`;
    const L = layout(E, notes, { key: sheet.key, staves: 'treble', len: sheet.beats, quant: 24, title, width, sp });   // eighths: a sheet to sing from
    spaceSystems(L, 3 * sp, a.words.length ? 4.6 * sp : 0.5 * sp);
    sheetMarks(E, L, { chords: sheet.chords, words: a.words, notes });
    return { L, notes, title };
  }

  function drawSheet(a, sheet) {
    a.words = lyricWords(a.secs);
    const { L, notes, title } = build(a, sheet);
    return el('div', {},
      scoreBox(L, { cls: 'sheet', label: `Śpiewnik: ${title}` }),
      a.words.length ? null : el('p', { class: 'muted small' }, 'Ta piosenka nie ma tekstu w Piosenkach: wklej go pod akordami, a pojawi się pod nutami.'),
      exportRow(E, () => ({ title, notes, bpm: sheet.tempo, opts: { key: sheet.key, staves: 'treble', len: sheet.beats, quant: 24 },
        print: () => layoutSvg(build(a, sheet, { width: 800, sp: 8 }).L) })));
  }

  async function record() {
    const a = analyse();
    const st = steps(a);
    if (!st.some((x) => x.k === 'chord')) return;
    const pass = songBand({ key: a.key, steps: st, groove: S.groove, tempo: S.tempo, mode: 'calosc', drummer: 3, lead: true });
    const parts = chunkEvents(pass.events);
    take = { events: [], timers: [] };
    render();
    let t0;
    try { t0 = await bus.play(parts[0].events, { lead: 0.3 }); } catch { take = null; render(); return; }
    if (!take) return;
    for (const p of parts.slice(1)) bus.play(p.events, { at: t0 + p.offset }).catch(() => {});
    take.t0 = t0;
    const end = t0 + pass.seconds;
    take.timers.push(bus.at(end + 0.4, () => finish(a, pass)));
  }

  function finish(a, pass) {
    if (!take || !alive) return;
    const k = S.tempo / 60;
    const start = take.t0 + pass.leadIn + (store.data.settings.latencyMs || 0) / 1000;   // the measured delay of what you hear
    const beats = (pass.seconds - pass.leadIn) * k;
    const notes = melodyFrom(take.events, start, S.tempo, { endBeat: beats });
    const fifths = fifthsOf(wheelIndex(a.key));            // a minor key sits on the wheel with its relative major's signature
    rec.sheets[a.id] = {
      notes: notes.map((n) => [n.p, Math.round(n.t * 1000) / 1000, Math.round(n.d * 1000) / 1000]),
      chords: pass.chords.map((c) => ({ beat: Math.round((c.start - pass.leadIn) * k * 1000) / 1000, name: c.name })),
      key: fifths, tempo: S.tempo, beats: Math.round(beats), at: Date.now(),
    };
    store.save();
    take = null;
    render();
  }

  function stop() {
    if (take) for (const c of take.timers) c();
    take = null;
    bus.stop();
    render();
  }

  return {
    onNote(e) { if (take && take.t0) take.events.push({ note: e.note, on: e.on, t: typeof e.ts === 'number' ? e.ts : bus.now(), vel: e.vel }); },
    destroy() { alive = false; if (take) stop(); },
  };
}

