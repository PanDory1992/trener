// 7. By ear: I play a melody, you find it on the keys. Hints come step by step.
// 1.10: a score, one tip (the interval that was hardest), interval hints, more of the intervals you miss, series,
// and a missed melody comes back a few melodies later.
import * as bus from '../bus.js';
import { cadenceEvents, contour, earMelody, motifEvents, noteName, plural, SCALES } from '../music.js';
import * as store from '../store.js';
import { el, status, fill, add } from '../ui.js';
import { Looper, playEvents, seed } from './common.js';
import { Coach, SAY } from '../drill.js';
import { createDrill, drillDock, seriesCard, verdict } from '../drillui.js';

export const id = 'ucho';
const HINTS = ['pierwszy dźwięk', 'interwał', 'rytm', 'następny dźwięk'];
const IV_NAMES = ['pryma', 'sekunda mała', 'sekunda wielka', 'tercja mała', 'tercja wielka', 'kwarta', 'tryton', 'kwinta', 'seksta mała', 'seksta wielka', 'septyma mała', 'septyma wielka', 'oktawa'];
const ivClass = (semis) => (semis <= 2 ? 'small' : semis <= 4 ? 'mid' : 'large');

/** Interval from note i-1 to note i, in words. */
export function ivWords(notes, i) {
  if (i <= 0) return null;
  const d = notes[i].p - notes[i - 1].p;
  if (d === 0) return 'ten sam dźwięk';
  const a = Math.abs(d);
  return `${d > 0 ? 'w górę' : 'w dół'} o ${a <= 12 ? IV_NAMES[a] : `${a} półtonów`}`;
}

export function mount(stage, ctx) {
  const card = ctx.card || null;
  let mel = card ? card.payload : null;
  let found = 0;
  let mistakes = 0;
  let hints = 0;
  let alive = true;
  let active = false;
  let counted = false;
  let auto = null;
  let missAt = [];          // mistakes per note of the melody
  const looper = new Looper();
  const coach = new Coach();
  const rec = store.mode(id);
  const ivStats = rec.iv || (rec.iv = { small: [0, 0], mid: [0, 0], large: [0, 0] });

  const drill = card ? null : createDrill(id, {
    title: 'Znajdź ze słuchu',
    about: 'Gram krótką melodię. Znajdź ją na klawiaturze, dźwięk po dźwięku, w dowolnej oktawie. Pomyłki są w porządku: szukanie to sedno. Podpowiedzi przychodzą po kolei: pierwszy dźwięk, interwał do następnego, rytm, następny dźwięk. Interwały, w których się mylisz, pojawiają się częściej.',
  });
  const head = card ? el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, card.title), el('p', { class: 'mode-sub' }, 'Fiszka: znajdź melodię.'))) : drill.head;
  const line = el('div', { class: 'status-wrap' }, status('Naciśnij Start albo C56.'));
  const dotsRow = el('div', { class: 'melody-dots' });
  const extra = el('div', { class: 'melody-extra' });
  const result = el('div', { class: 'result' });
  const dock = drillDock({ primary: 'Start', onPrimary: () => next(), onRepeat: () => replay(), onHint: () => hint(), more: [['Pokaż rozwiązanie', () => giveUp()]] });
  add(stage, head, line, dotsRow, extra, result);
  ctx.dock(dock.node);
  const setStatus = (t, k = '', tip = null) => verdict(line, t, k, tip);

  function render() {
    if (!mel) return;
    fill(dotsRow, ...mel.notes.map((n, i) => {
      const known = i < found || (i === 0 && (mel.showFirst || hints >= 1));
      return el('div', { class: `mdot ${i < found ? 'found' : ''} ${i === found ? 'now' : ''}` },
        el('span', {}, known ? noteName(n.p, mel.flat, false) : '?'));
    }));
    const bits = [];
    if (hints >= 2) {
      const iv = ivWords(mel.notes, Math.max(1, found));
      bits.push(el('div', { class: 'hint-line' }, el('b', {}, 'Kierunek: '), contour(mel.notes).join(' ')));
      if (iv) bits.push(el('div', { class: 'hint-line' }, el('b', {}, `Do dźwięku ${Math.max(2, found + 1)}: `), iv));
    }
    if (hints >= 3) bits.push(el('div', { class: 'hint-line' }, el('b', {}, 'Rytm: '), mel.notes.map((n) => (n.dur >= 2 ? '𝅗𝅥' : n.dur >= 1 ? '♩' : '♪')).join(' ')));
    bits.push(el('p', { class: 'mode-sub' }, `${mel.notes.length} ${plural(mel.notes.length, 'dźwięk', 'dźwięki', 'dźwięków')}, skala ${mel.scale ? SCALES[mel.scale].name : ''}${mistakes ? `, pomyłek: ${mistakes}` : ''}${hints ? `, podpowiedzi: ${hints}` : ''}`));
    fill(extra, ...bits);
  }

  async function present(note = '') {
    active = false;
    clearTimeout(auto);
    render();
    setStatus(note ? `${note} Słuchaj…` : 'Słuchaj…', 'listen');
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

  /** More leaps when leaps are what you miss: the miss rate of mid/large intervals over the small ones. */
  function leapBias() {
    const rate = ([m, n]) => (n >= 5 ? m / n : null);
    const s = rate(ivStats.small), big = [rate(ivStats.mid), rate(ivStats.large)].filter((x) => x !== null);
    if (s === null || !big.length) return 0;
    return Math.max(0, Math.min(0.3, Math.max(...big) - s));
  }

  function begin(m, note = '') {
    mel = m;
    found = 0; mistakes = 0; hints = 0; counted = false;
    missAt = mel.notes.map(() => 0);
    fill(result);
    if (mel.showFirst) ctx.keyboard.mark([{ note: mel.notes[0].p, text: '1', tone: 'var(--c-ucho)' }]);
    else ctx.keyboard.mark([]);
    present(note);
  }

  function next() {
    clearTimeout(auto);
    if (card) { begin(mel); return; }
    const lv = drill.axes().ucho;
    const got = coach.take(() => earMelody(lv, seed(), { leapBias: leapBias() }));
    dock.setPrimary('Następne');
    begin(got.item, got.comeback ? SAY.comeback : '');
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

  /** The note you looked for longest, as advice. */
  function tipFor(gaveUp) {
    if (gaveUp) return { kind: 'gaveup', text: 'Następnym razem spróbuj podpowiedzi „interwał”: mówi, o ile w górę albo w dół.' };
    let k = -1;
    missAt.forEach((x, i) => { if (x > 0 && (k < 0 || x > missAt[k])) k = i; });
    if (k <= 0) return mistakes ? { kind: 'first', text: 'Najdłużej szukałeś pierwszego dźwięku. Zanuć go, zanim zaczniesz szukać.' } : { kind: null, text: 'Bez pomyłki.' };
    const semis = Math.abs(mel.notes[k].p - mel.notes[k - 1].p);
    return { kind: `iv-${ivClass(semis)}`, text: `Najtrudniej: ${k + 1}. dźwięk, ${ivWords(mel.notes, k)}. Zaśpiewaj ten skok, zanim go zagrasz.` };
  }

  function complete(gaveUp = false) {
    active = false;
    const passed = !gaveUp && mistakes <= Math.max(2, Math.ceil(mel.notes.length / 2)) && hints <= 1;
    const tip = tipFor(gaveUp);
    let r = null;
    if (!counted) {
      counted = true;
      if (card) setTimeout(() => ctx.onResult && ctx.onResult(passed), 1800);
      else if (coach.counts) {
        const score = gaveUp ? 0 : Math.max(0, 100 - 10 * mistakes - 15 * Math.max(0, hints - (mel.showFirst ? 0 : 1)));
        r = drill.counted({ ucho: score }, passed, tip);
      }
      if (!card) coach.after(passed);   // a missed melody is queued to come back; no immediate retry in a search task
    }
    found = mel.notes.length;
    render();
    ctx.keyboard.mark(mel.notes.map((n, i) => ({ note: n.p, text: String(i + 1), tone: 'var(--c-ucho)' })));
    const title = mel.title ? ` To była melodia: ${mel.title}.` : '';
    setStatus(gaveUp ? `Oto rozwiązanie.${title}` : passed ? `Znalezione!${title}` : `Znalezione, z pomocą.${title}`, gaveUp ? '' : passed ? 'good' : 'bad', tip);
    if (r && r.summary) { fill(result, seriesCard(r.summary, drill.labels, () => next())); dock.setPrimary('Następna seria'); return; }
    if (!card && !gaveUp) { clearTimeout(auto); auto = setTimeout(() => alive && next(), 3800); }
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
    complete(true);
    const m = motifEvents(mel, { countIn: 0 });
    playEvents(m.events, { lead: 0.3 });
  }

  if (card) setTimeout(() => { if (alive) begin(mel); }, 400);

  return {
    onNote(e) {
      if (e.on && looper.active) looper.stop();
      if (!active || !e.on || !mel || found >= mel.notes.length) return;
      const want = mel.notes[found].p % 12;
      const cls = found > 0 ? ivClass(Math.abs(mel.notes[found].p - mel.notes[found - 1].p)) : null;
      if (e.note % 12 === want) {
        if (cls) { ivStats[cls][1]++; if (missAt[found]) ivStats[cls][0]++; }
        found++;
        render();
        if (found >= mel.notes.length) complete();
        else setStatus(`Tak! ${found} z ${mel.notes.length}`, 'turn');
      } else {
        mistakes++;
        missAt[found]++;
        setStatus(`Nie ten. Dalej szukasz dźwięku ${found + 1}.`, 'bad');
        render();
      }
    },
    onPilot(a) {
      if (a === 'start') next();
      if (a === 'repeat') replay();
      if (a === 'hint') hint();
      if (a === 'pause') { active = false; looper.stop(); clearTimeout(auto); bus.stop(); setStatus('Pauza.'); }
    },
    destroy() { alive = false; looper.stop(); clearTimeout(auto); bus.stop(); ctx.keyboard.mark([]); },
  };
}

