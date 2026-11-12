// The walk through today's reviews, as a banner on the Koło and Piosenki cards.
// "Do powtórki: N" starts it; each review opens the right card; after one pass without lights:
// clean → the next interval, not clean → back to "w tempie", again tomorrow. Then "Następna powtórka".
import * as store from './store.js';
import * as M from './mastery.js';
import { el } from './ui.js';
import { STARTERS } from './songs.js';
import {
  parseItem, playPrompt, openFor, reviewList, startWalk, walk, walkCurrent, walkResult, walkNext, walkStop, walkSummary,
} from './suggest.js';

export const allSongs = () => [...(store.data.songs || []), ...STARTERS];
let walkEnd = null;      // summary after the last review (shown once)

/**
 * page: { itemId() → id of the thing on the card, go(view, extra), rerender(), way() → 'tempo'|'dark' }
 * Returns { banner(), note(id, review), start(list), reviewingNow(), due() }.
 */
export function reviewBar(page) {
  let lastReview = null;
  const open = (id) => {
    const info = parseItem(id, { songs: allSongs() });
    if (!info) { next(); return; }        // the card is gone (deleted song, removed progression): skip it
    const o = openFor(info, { way: page.way() === 'dark' ? 'dark' : 'tempo', review: true });
    page.go(o.view, { preset: o.preset });
  };
  function next() {
    const nx = walkNext();
    lastReview = null;
    if (nx) open(nx);
    else { walkEnd = { ...walkSummary(), day: store.today() }; page.rerender(); }
  }
  function start(list) { walkEnd = null; const first = startWalk(list.map((x) => x.id)); if (first) open(first); }
  function note(id, rv) { if (!rv) return; walkResult(id, rv.ok); lastReview = { id, ...rv }; }
  const reviewingNow = () => { const id = page.itemId(); return !!id && walkCurrent() === id && M.isDue(M.get(id), store.today()); };
  const due = () => reviewList(store.data.mastery || {}, { today: store.today(), songs: allSongs() });

  function banner() {
    const id = page.itemId();
    if (walkEnd && walkEnd.day !== store.today()) walkEnd = null;
    if (walkEnd) {
      const s = walkEnd;
      return el('div', { class: 'p2-review' }, el('span', {}, el('b', {}, 'Powtórki zrobione: '), `${s.ok} z ${s.total} czysto${s.done < s.total ? `, ${s.total - s.done} bez wyniku` : ''}.`),
        el('button', { class: 'btn tiny ghost', onclick: () => { walkEnd = null; page.rerender(); } }, 'Zamknij'));
    }
    const cur = walkCurrent();
    if (cur) {
      const info = parseItem(cur, { songs: allSongs() });
      const pos = `Powtórka ${walk.i + 1} z ${walk.ids.length}`;
      const end = el('button', { class: 'btn tiny ghost', onclick: () => { walkStop(); walkEnd = { ...walkSummary(), day: store.today() }; lastReview = null; page.rerender(); } }, 'Zakończ powtórki');
      const last = walk.i + 1 >= walk.ids.length;
      if (id === cur && lastReview && lastReview.id === cur) {
        return el('div', { class: 'p2-review' },
          el('span', {}, `${pos}: `, lastReview.ok
            ? el('span', { class: 'r-ok' }, `czysto. Następna za ${lastReview.days} ${lastReview.days === 1 ? 'dzień' : 'dni'}.`)
            : el('span', { class: 'r-bad' }, 'posypało się. Wraca do etapu „w tempie”, jutro jeszcze raz.')),
          el('button', { class: 'btn small primary', onclick: () => next() }, last ? 'Koniec powtórek' : 'Następna powtórka →'));
      }
      if (id === cur) {
        return el('div', { class: 'p2-review' },
          el('span', {}, el('b', {}, `${pos}: `), `${playPrompt(info)}. Jedno przejście W tempie bez świateł albo „Bez świateł”.`),
          el('button', { class: 'btn tiny', onclick: () => next() }, 'Pomiń'), end);
      }
      return el('div', { class: 'p2-review' }, el('span', {}, `${pos}: ${info ? playPrompt(info) : '…'}.`),
        el('button', { class: 'btn tiny', onclick: () => open(cur) }, 'Wróć do niej'), end);
    }
    if (id && M.isDue(M.get(id), store.today())) {
      return el('div', { class: 'p2-review' }, el('span', {}, 'Ta rzecz czeka na powtórkę: jedno przejście W tempie bez świateł albo „Bez świateł”.'));
    }
    return null;
  }
  return { banner, note, start, reviewingNow, due, open };
}
