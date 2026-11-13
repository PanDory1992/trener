// 3. Cards: spaced repetition for the hands (Leitner boxes).
import { BOX_DAYS, dueCards, motifFromPlayed, noteName, plural, reviewCard } from '../music.js';
import * as store from '../store.js';
import { el, status, toast, fill, add } from '../ui.js';
import * as echo from './echo.js';
import * as akordy from './akordy.js';
import * as ucho from './ucho.js';
import * as M from '../mastery.js';
import { reviewBar, allSongs } from '../reviewbar.js';
import { parseItem, itemTitle, playPrompt } from '../suggest.js';

export const id = 'fiszki';
const ENGINE = { motif: echo, chords: akordy, melody: ucho };
const TYPE_WORD = { motif: 'motyw', chords: 'akordy', melody: 'ze słuchu' };

export function mount(stage, ctx) {
  let alive = true;
  let inner = null;
  let queue = [];
  let session = null;
  let recording = null;
  M.bind(store.data);
  // "umiem" from the Koło and Piosenki comes back here too: one pass without lights after 1, 2, 4, 7, 15, 30 days
  const reviews = reviewBar({ itemId: () => null, go: (v, x) => ctx.go && ctx.go(v, x), rerender: () => list(), way: () => 'tempo' });
  function umiemSection() {
    const t = store.today();
    const due = reviews.due();
    const songs = allSongs();
    const later = M.upcomingReviews(t).map((x) => ({ ...x, info: parseItem(x.id, { songs }) })).filter((x) => x.info).slice(0, 8);
    if (!due.length && !later.length) return null;
    const when = (d) => { const n = M.daysBetween(t, d); return n === 1 ? 'jutro' : `za ${n} ${plural(n, 'dzień', 'dni', 'dni')}`; };
    return el('section', { class: 'p2-rev' },
      el('h2', {}, `Z Koła i Piosenek: do powtórki ${due.length}`),
      due.length ? el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => reviews.start(due) }, `Zagraj powtórki (${due.length})`)) : el('p', { class: 'muted' }, 'Na dziś nic. Następne niżej.'),
      due.map((x, k) => el('div', { class: 'p2-rev-row' },
        el('span', { class: 'rv-title' }, x.prompt, el('small', {}, x.lapsed ? 'Ostatnio się posypało. Jedno czyste przejście przywraca „umiem”.' : 'Jedno przejście W tempie bez świateł albo „Bez świateł”.')),
        el('span', { class: 'rv-due' }, 'dziś'),
        el('button', { class: 'btn tiny', onclick: () => reviews.start(due.slice(k).concat(due.slice(0, k))) }, 'Zagraj'))),
      later.length ? el('p', { class: 'muted' }, 'Następne:') : null,
      later.map((x) => el('div', { class: 'p2-rev-row' },
        el('span', { class: 'rv-title' }, itemTitle(x.info), el('small', {}, playPrompt(x.info))),
        el('span', { class: 'rv-due' }, when(x.due)), el('span'))));
  }

  function list() {
    inner && inner.destroy(); inner = null;
    const t = store.today();
    const due = dueCards(store.data.cards, t);
    const cards = [...store.data.cards].sort((a, b) => (a.due || '').localeCompare(b.due || ''));
    fill(stage, 
      el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
        el('h1', {}, 'Fiszki dla rąk'),
        el('p', { class: 'mode-sub' }, 'To, co ci nie wyszło, i to, co sam dodasz, wraca do powtórki. Udana powtórka: karta wraca coraz później (1, 2, 4, 7, 15, 30, 60 dni). Nieudana: jutro.'))),
      el('div', { class: 'due-hero' },
        el('div', {}, el('div', { class: 'due-num' }, String(due.length)), el('div', { class: 'due-label' }, due.length ? `${plural(due.length, 'fiszka czeka', 'fiszki czekają', 'fiszek czeka')} na dziś` : 'Na dziś nic. Wszystko powtórzone.')),
        el('div', { class: 'actions' },
          due.length ? el('button', { class: 'btn primary', onclick: () => review(due) }, 'Powtórz teraz') : null,
          el('button', { class: 'btn', onclick: () => record() }, 'Nagraj własny motyw'))),
      umiemSection(),
      cards.length ? el('div', { class: 'card-list' }, cards.map((c) => el('div', { class: `card-row ${c.paused ? 'paused' : ''}` },
        el('span', { class: `card-type t-${c.type}` }, TYPE_WORD[c.type] || c.type),
        el('span', { class: 'card-title' }, c.title),
        el('span', { class: 'boxes', title: `Pudełko ${c.box || 0} z ${BOX_DAYS.length - 1}` }, BOX_DAYS.slice(1).map((_, k) => el('i', { class: k < (c.box || 0) ? 'on' : '' }))),
        el('span', { class: 'card-due' }, !c.due || c.due <= t ? 'dziś' : c.due),
        el('button', { class: 'btn tiny ghost', onclick: () => { c.paused = !c.paused; store.save(); list(); } }, c.paused ? 'Wznów' : 'Wstrzymaj'),
        el('button', { class: 'btn tiny ghost', onclick: () => { if (confirmDelete(c)) { store.data.cards = store.data.cards.filter((x) => x !== c); store.save(); list(); } } }, 'Usuń'))))
        : el('p', { class: 'empty' }, 'Jeszcze nie masz fiszek. Pojawią się same, gdy coś nie wyjdzie w Echu albo Ze słuchu, albo dodaj je przyciskiem „Dodaj do fiszek”.'),
    );
  }

  function confirmDelete(c) { return window.confirm(`Usunąć fiszkę „${c.title}”?`); }

  function review(due) {
    queue = due.map((c) => c.id);
    session = { done: 0, ok: 0, retry: new Set() };
    nextCard();
  }

  function nextCard() {
    inner && inner.destroy(); inner = null;
    if (!alive) return;
    const id = queue.shift();
    if (!id) {
      fill(stage, el('div', { class: 'done-box' },
        el('h1', {}, 'Powtórki zrobione'),
        el('p', {}, `${session.ok} z ${session.done} za pierwszym razem.`),
        el('button', { class: 'btn primary', onclick: () => list() }, 'Wróć do fiszek')));
      if (ctx.onBlockDone) ctx.onBlockDone();
      return;
    }
    const card = store.data.cards.find((c) => c.id === id);
    if (!card) return nextCard();
    const engine = ENGINE[card.type];
    let answered = false;
    const onResult = (passed) => {
      if (answered) return;
      answered = true;
      const first = !session.retry.has(card.id);
      if (first) {
        const updated = reviewCard(card, passed, store.today());
        Object.assign(card, updated);
        session.done++;
        if (passed) session.ok++;
        store.save();
      }
      if (!passed && first) { session.retry.add(card.id); queue.push(card.id); }
      toast(passed ? (first ? `Dobrze. Wróci za ${BOX_DAYS[card.box]} ${BOX_DAYS[card.box] === 1 ? 'dzień' : 'dni'}.` : 'Dobrze, tym razem wyszło.') : 'Wróci jutro i jeszcze raz na końcu tej sesji.', passed ? 'good' : 'info');
      setTimeout(nextCard, 400);
    };
    const progress = el('div', { class: 'card-progress' },
      el('span', {}, `Fiszka ${session.done + 1} z ${session.done + 1 + queue.length}`),
      el('button', { class: 'btn tiny ghost', onclick: () => onResult(false) }, 'Nie umiem, następna'));
    const host = el('div', { class: 'card-host' });
    fill(stage, progress, host);
    inner = engine.mount(host, { ...ctx, card: { ...card }, onResult });
  }

  function record() {
    inner && inner.destroy(); inner = null;
    recording = { notes: [], timer: null };
    const line = el('div', { class: 'status-wrap' }, status('Zagraj motyw. Skończ ciszą (2 s) albo przyciskiem C56.', 'turn'));
    const preview = el('div', { class: 'note-chips' });
    fill(stage, el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, 'Nagraj własny motyw'), el('p', { class: 'mode-sub' }, 'Lick, pasaż, fragment piosenki. Zapamiętam dźwięki, rytm i dynamikę, a potem będę ci go podsuwał do powtórki.'))), line, preview,
      el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: () => finishRecording() }, 'Gotowe'), el('button', { class: 'btn ghost', onclick: () => { recording = null; list(); } }, 'Anuluj')));
    recording.line = line; recording.preview = preview;
  }

  function finishRecording() {
    if (!recording) return;
    clearTimeout(recording.timer);
    const notes = recording.notes;
    recording = null;
    if (notes.length < 2) { toast('Za krótko: zagraj co najmniej 2 dźwięki.'); list(); return; }
    const motif = motifFromPlayed(notes, 90);
    const name = window.prompt('Jak nazwać ten motyw?', `Mój motyw ${notes.slice(0, 5).map((n) => noteName(n.p, false, false)).join(' ')}`);
    if (name === null) { list(); return; }
    const t = store.today();
    store.data.cards.push({ id: store.newId(), type: 'motif', title: name || 'Mój motyw', payload: motif, box: 0, due: t, created: t, own: true });
    store.save();
    toast('Zapisane. Pierwsza powtórka: dziś.', 'good');
    list();
  }

  if (ctx.block) {
    const due = dueCards(store.data.cards, store.today());
    if (due.length) review(due); else list();
  } else list();

  return {
    onNote(e) {
      if (recording) {
        if (!e.on) return;
        recording.notes.push({ p: e.note, ts: e.ts, v: e.vel });
        fill(recording.preview, ...recording.notes.map((n) => el('span', { class: 'nchip done' }, noteName(n.p, false, false))));
        clearTimeout(recording.timer);
        recording.timer = setTimeout(finishRecording, 2000);
        return;
      }
      inner && inner.onNote && inner.onNote(e);
    },
    onPilot(a) {
      if (recording && a === 'start') return finishRecording();
      if (inner && inner.onPilot) return inner.onPilot(a);
      if (a === 'start') { const due = dueCards(store.data.cards, store.today()); if (due.length) review(due); }
    },
    destroy() { alive = false; inner && inner.destroy(); recording = null; },
  };
}
