// 7. By ear: I play a melody, you find it on the keys. Hints come step by step.
import * as bus from '../bus.js';
import { cadenceEvents, contour, earMelody, motifEvents, noteName, plural, SCALES } from '../music.js';
import * as store from '../store.js';
import { el, levelHeader, refreshLevel, status, fill, add } from '../ui.js';
import { Looper, playEvents, seed } from './common.js';

export const id = 'ucho';
const HINTS = ['pierwszy dźwięk', 'kierunek melodii', 'rytm', 'następny dźwięk'];

export function mount(stage, ctx) {
  const card = ctx.card || null;
  let mel = card ? card.payload : null;
  let found = 0;
  let mistakes = 0;
  let hints = 0;
  let alive = true;
  let active = false;
  let counted = false;
  let autoNext = null;
  const looper = new Looper();

  const head = card ? el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, card.title), el('p', { class: 'mode-sub' }, 'Fiszka: znajdź melodię.')))
    : levelHeader(id, 'Znajdź ze słuchu', 'Gram krótką melodię. Znajdź ją na klawiaturze, dźwięk po dźwięku, w dowolnej oktawie. Pomyłki są w porządku: szukanie to sedno.');
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij „Nowa melodia” albo C56.'));
  const dotsRow = el('div', { class: 'melody-dots' });
  const extra = el('div', { class: 'melody-extra' });
  const actions = el('div', { class: 'actions' },
    el('button', { class: 'btn primary', onclick: () => next() }, 'Nowa melodia'),
    el('button', { class: 'btn', onclick: () => replay() }, 'Zagraj jeszcze raz'),
    el('button', { class: 'btn', onclick: () => hint() }, 'Podpowiedź'),
    el('button', { class: 'btn ghost', onclick: () => giveUp() }, 'Pokaż rozwiązanie'));
  add(stage, head, line, dotsRow, extra, actions);
  const setStatus = (t, k = '') => fill(line, status(t, k));

  function render() {
    if (!mel) return;
    fill(dotsRow, ...mel.notes.map((n, i) => {
      const known = i < found || (i === 0 && (mel.showFirst || hints >= 1));
      return el('div', { class: `mdot ${i < found ? 'found' : ''} ${i === found ? 'now' : ''}` },
        el('span', {}, known ? noteName(n.p, mel.flat, false) : '?'));
    }));
    const bits = [];
    if (hints >= 2) bits.push(el('div', { class: 'hint-line' }, el('b', {}, 'Kierunek: '), contour(mel.notes).join(' ')));
    if (hints >= 3) bits.push(el('div', { class: 'hint-line' }, el('b', {}, 'Rytm: '), mel.notes.map((n) => (n.dur >= 2 ? '𝅗𝅥' : n.dur >= 1 ? '♩' : '♪')).join(' ')));
    bits.push(el('p', { class: 'mode-sub' }, `${mel.notes.length} ${plural(mel.notes.length, 'dźwięk', 'dźwięki', 'dźwięków')}, skala ${mel.scale ? SCALES[mel.scale].name : ''}${mistakes ? `, pomyłek: ${mistakes}` : ''}${hints ? `, podpowiedzi: ${hints}` : ''}`));
    fill(extra, ...bits);
  }

  async function present() {
    active = false;
    clearTimeout(autoNext);
    render();
    setStatus('Słuchaj…', 'listen');
    let ev = [];
    let offset = 0;
    if (mel.playCadence) {
      const cad = cadenceEvents(mel.rootPc, mel.scale !== 'major');
      ev = cad.events; offset = cad.seconds;
    }
    const m = motifEvents(mel, { countIn: 0 });
    ev = ev.concat(m.events.map((e) => ({ t: e.t + offset, m: e.m })));
    let t0;
    // Pętla: the melody repeats until your first note
    try { t0 = await looper.start(ev, offset + m.seconds, { gap: 1.0 }); } catch { setStatus('Serwer Trenera nie odpowiada.', 'bad'); return; }
    // you may start as soon as the last note sounds
    bus.at(t0 + offset + m.starts[m.starts.length - 1] + 0.05, () => {
      if (!alive) return;
      active = true;
      setStatus(found ? `Szukaj dalej: dźwięk ${found + 1} z ${mel.notes.length}` : mel.showFirst ? `Zaczyna się od ${noteName(mel.notes[0].p, mel.flat, false)}. Szukaj dalej.` : 'Szukaj: od jakiego dźwięku to się zaczyna?', 'turn');
    });
  }

  function next() {
    mel = earMelody(store.mode(id).level, seed());
    found = 0; mistakes = 0; hints = 0; counted = false;
    if (mel.showFirst) ctx.keyboard.mark([{ note: mel.notes[0].p, text: '1', tone: 'var(--c-ucho)' }]);
    else ctx.keyboard.mark([]);
    present();
  }

  function replay() { if (!mel) return next(); present(); }

  function hint() {
    if (!mel) return;
    hints = Math.min(HINTS.length, hints + 1);
    const label = HINTS[hints - 1];
    if (hints === 1) {
      ctx.keyboard.mark([{ note: mel.notes[0].p, text: '1', tone: 'var(--c-ucho)' }]);
      playEvents([{ t: 0, m: [0x90, mel.notes[0].p, 70] }, { t: 0.6, m: [0x80, mel.notes[0].p, 0] }], { lead: 0.05 });
    }
    if (hints === 4 && found < mel.notes.length) {
      const n = mel.notes[found];
      ctx.keyboard.mark([{ note: n.p, text: String(found + 1), tone: 'var(--c-ucho)' }]);
      playEvents([{ t: 0, m: [0x90, n.p, 70] }, { t: 0.6, m: [0x80, n.p, 0] }], { lead: 0.05 });
      hints = 3; // the next-note hint can be used again
      mistakes += 1;
    }
    setStatus(`Podpowiedź: ${label}.`, 'listen');
    render();
  }

  function complete(gaveUp = false) {
    active = false;
    const passed = !gaveUp && mistakes <= Math.max(2, Math.ceil(mel.notes.length / 2)) && hints <= 1;
    if (!counted) {
      counted = true;
      if (card) setTimeout(() => ctx.onResult && ctx.onResult(passed), 1800);
      else { store.record(id, passed); refreshLevel(stage, id); }
    }
    found = mel.notes.length;
    render();
    ctx.keyboard.mark(mel.notes.map((n, i) => ({ note: n.p, text: String(i + 1), tone: 'var(--c-ucho)' })));
    const title = mel.title ? ` To była melodia: ${mel.title}.` : '';
    setStatus(gaveUp ? `Oto rozwiązanie.${title}` : passed ? `Znalezione!${title}` : `Znalezione, z pomocą.${title}`, gaveUp ? '' : passed ? 'good' : 'bad');
    if (!card && !gaveUp) autoNext = setTimeout(() => alive && next(), 3500);
    if (!card && !passed && store.data.settings.autoCards) {
      const t = store.today();
      if (store.data.cards.filter((c) => c.created === t && c.auto).length < 3) {
        store.data.cards.push({ id: store.newId(), type: 'melody', title: mel.title ? `Ze słuchu: ${mel.title}` : `Ze słuchu: ${mel.notes.length} dźwięków`, payload: mel, box: 0, due: t, created: t, auto: true });
        store.save();
      }
    }
  }

  function giveUp() {
    if (!mel) return;
    if (!counted) { counted = true; if (card) setTimeout(() => ctx.onResult && ctx.onResult(false), 2500); else { store.record(id, false); refreshLevel(stage, id); } }
    complete(true);
    const m = motifEvents(mel, { countIn: 0 });
    playEvents(m.events, { lead: 0.3 });
  }

  if (card) setTimeout(() => { if (alive) { found = 0; present(); } }, 400);

  return {
    onNote(e) {
      if (e.on && looper.active) looper.stop();
      if (!active || !e.on || !mel || found >= mel.notes.length) return;
      const want = mel.notes[found].p % 12;
      if (e.note % 12 === want) {
        found++;
        render();
        if (found >= mel.notes.length) complete();
        else setStatus(`Tak! ${found} z ${mel.notes.length}`, 'turn');
      } else {
        mistakes++;
        setStatus(`Nie ten. Dalej szukasz dźwięku ${found + 1}.`, 'bad');
        render();
      }
    },
    onPilot(a) {
      if (a === 'start') next();
      if (a === 'repeat') replay();
      if (a === 'hint') hint();
      if (a === 'pause') { active = false; looper.stop(); bus.stop(); setStatus('Pauza.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(autoNext); bus.stop(); ctx.keyboard.mark([]); },
  };
}
