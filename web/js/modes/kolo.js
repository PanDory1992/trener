// Koło tonacji: pick a key on the circle of fifths, then open its cards:
// Gama, Akordy, Progresje, Akompaniament. Each card: Pokaż / Graj ze mną / Dlaczego / next doors.
import * as bus from '../bus.js';
import { getKey, setKey } from '../key.js';
import * as store from '../store.js';
import {
  ALL_KEYS, chord, degreeChord, family, fingering, inversions, keyAt, keyName, keySignature, PATTERNS, PROGRESSIONS,
  progressionChords, relativeOf, SCALES, scaleNotes, stepPattern, stepKey, voicing, bassNote, wheelIndex, whyFamily, whyInversions, whyScale,
  WHEEL_MAJOR, SCALE_GROUPS, MINORISH, keyByTonic, makeKey, LETTERS,
} from '../theory.js';
import { ScaleDetector, runShape } from '../scaledetect.js';
import { el, fill, add, svg, toast } from '../ui.js';
import { Guide, WAYS } from './guide.js';
import { loopButton } from '../loopui.js';
import { playEvents } from './common.js';
import * as M from '../mastery.js';
import { fnOf, fnColor, fnClass, FN } from '../colors.js';
import { analyzePass, chordToneShare, thirdOnChanges, challengeLine, thirdPc } from '../feedback.js';
import { pickDice, hints, walkCurrent } from '../suggest.js';
import { reviewBar, allSongs } from '../reviewbar.js';

export const id = 'kolo';
export const RANGE = [36, 84];

export const ROLE_TONE = { 1: 'var(--role-1)', 3: 'var(--role-3)', 5: 'var(--role-5)', 7: 'var(--role-7)', 6: 'var(--role-7)', 9: 'var(--role-t)', 2: 'var(--role-t)', 4: 'var(--role-t)', 11: 'var(--role-t)', 13: 'var(--role-t)', 8: 'var(--role-1)', 10: 'var(--role-3)', 12: 'var(--role-5)' };
const FINGER = ['', '①', '②', '③', '④', '⑤'];
const ALL_SCALES = Object.keys(SCALES);
const TABS = [['gama', 'Gama'], ['akordy', 'Akordy'], ['progresje', 'Progresje'], ['akomp', 'Akompaniament']];
const HAND_NAME = { rh: 'prawa', lh: 'lewa', both: 'obie ręce' };
// Gama: what comes after a whole pass — the same key, the next on the wheel, or a semitone up (as on the keyboard)
const SCALE_WALKS = [[0, 'ta sama tonacja'], [1, 'po kole →'], ['up', 'pół tonu w górę']];

/** The Gama card's steps for any key: up to the top tonic and back, with fingering. */
export function scaleSteps(key, sc, hand) {
  const notesR = scaleNotes(key, sc, 60);
  const notesL = notesR.map((n) => ({ ...n, midi: n.midi - 12 }));
  const fing = fingering(key, sc);
  const n = notesR.length;
  const up = [...Array(n).keys()], down = up.slice(0, -1).reverse();
  const steps = [...up, ...down].map((k, j) => {
    const r = notesR[k], l = notesL[k];
    const fr = fing ? fing.rh[k] : 0;
    const fl = fing ? fing.lh[k] : 0;
    const notes = hand === 'rh' ? [r.midi] : hand === 'lh' ? [l.midi] : [l.midi, r.midi];
    const marks = notes.map((x) => {
      const f = x === r.midi && hand !== 'lh' ? fr : fl;
      return { note: x, text: r.name, sub: f ? FINGER[f] : r.deg, tone: r.deg === '1' ? 'var(--role-1)' : 'var(--mode)' };
    });
    const fingerTxt = fing ? (hand === 'rh' ? FINGER[fr] : hand === 'lh' ? FINGER[fl] : `${FINGER[fl]} ${FINGER[fr]}`) : '';
    return { notes, marks, label: r.name, sub: `${r.deg}${fingerTxt ? ` · ${fingerTxt}` : ''}`, beats: j === n - 1 ? 2 : 1, exact: hand === 'both' };
  });
  return { notesR, fing, steps };
}

function chordMarks(c, notes, { sub = true, fn = null } = {}) {
  // notes: MIDI of a voicing; label each with its name and role in the chord (the root also gets the function colour)
  return notes.map((n) => {
    const idx = c.tones.findIndex((t) => t.pc === ((n % 12) + 12) % 12);
    const role = idx >= 0 ? c.roles[idx] : '';
    return { note: n, text: idx >= 0 ? c.tones[idx].name : '', sub: sub ? role : '', tone: ROLE_TONE[role] || 'var(--mode)', fn: fn && role === '1' ? fnColor(fn) : undefined };
  });
}

/** Legend of the function colours (one line). */
export function fnLegend() {
  return el('div', { class: 'fn-legend', 'aria-label': 'Kolory funkcji' },
    [['T', 'tonika: 1, 3m, 6m (dom)'], ['S', 'subdominanta: 2m, 4'], ['D', 'dominanta: 5, 7° (napięcie)'], ['X', 'spoza rodziny']]
      .map(([f, t]) => el('span', { class: fnClass(f) }, el('i'), t)));
}

const CHALLENGES = [['', 'brak'], ['ct', 'Tylko dźwięki akordu'], ['third', 'Tercja na każdej zmianie']];

export function mount(stage, ctx) {
  const st = store.mode(id);
  st.tab = st.tab || 'gama';
  st.way = st.way || 'wait';
  st.tempo = st.tempo || 66;
  st.hand = st.hand || 'rh';
  st.sevenths = !!st.sevenths;
  st.bassToo = st.bassToo !== false;
  st.pattern = st.pattern || 'blok';
  st.autoLights = st.autoLights !== false;
  st.smart = st.smart !== false;
  M.bind(store.data);
  let item = null;          // the thing on the current card, for "umiem": {id, label}
  const progBox = el('div', { class: 'mastery' });
  let key = getKey();
  let alive = true;
  let selChord = null;      // index in family (Akordy tab)
  let invMode = false;      // Akordy: walk inversions of selChord
  if (ctx.preset && ctx.preset.tab) st.tab = ctx.preset.tab;
  if (ctx.preset && ctx.preset.key) {   // from Piosenki: open a card in the song's key
    const pk = ctx.preset.key;
    const found = ALL_KEYS.find((k) => k.li === pk.li && k.acc === pk.acc && k.mode === pk.mode) || keyByTonic(makeKey(LETTERS[pk.li], pk.acc, pk.mode).tonicPc, pk.mode);
    if (found) { key = found; setKey(found); }
    if (ctx.preset.prog) st.prog = { ...(st.prog || {}), [key.mode]: ctx.preset.prog };
    if (ctx.preset.scale) { st.scale = ctx.preset.scale; st.scaleGroup = null; }
    store.save();
  }
  // Kostka, powtórki, podpowiedzi: open exactly the thing (hand, chords, pattern, inversions, how to play)
  const pre = ctx.preset || {};
  if (pre.hand && HAND_NAME[pre.hand]) st.hand = pre.hand;
  if (pre.sevenths != null) st.sevenths = !!pre.sevenths;
  if (pre.pattern && PATTERNS.some((p) => p.id === pre.pattern)) st.pattern = pre.pattern;
  if (pre.way && WAYS[pre.way]) st.way = pre.way;
  if (pre.tab === 'akordy' && Number.isInteger(pre.inv) && pre.inv >= 0 && pre.inv < 7) { selChord = pre.inv; invMode = true; }
  const diceWhy = pre.why && pre.item ? { id: pre.item, text: pre.why } : null;
  let hintIdx = Math.floor(Math.random() * 6);

  // --- skeleton ---------------------------------------------------------------------------------
  const wheelBox = el('div', { class: 'wheel-box' });
  // small screens: the wheel opens over the card from this button
  const keyPill = el('button', { class: 'key-pill', onclick: () => wheelOpen(true) });
  const wheelOpen = (on) => { const k = stage.querySelector('.kolo'); if (k) k.classList.toggle('wheel-open', on); };
  const compact = () => document.body.classList.contains('compact');
  const keyInfo = el('div', { class: 'key-info' });
  const p2Bar = el('div', { class: 'p2-bar' });        // Kostka, Do powtórki, one hint
  const p2Msg = el('div', { class: 'p2-msg' });        // why the dice picked this, the review banner
  const fbBox = el('div', { class: 'p2-fb', 'aria-live': 'polite' });
  let fbItem = null;
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const card = el('div', { class: 'kcard' });
  add(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Koło tonacji'),
      el('p', { class: 'mode-sub' }, 'Wybierz tonację na kole. Każda karta pokazuje dokładnie, co zagrać, gra to z tobą i tłumaczy, dlaczego tak brzmi.'))),
    el('div', { class: 'kolo' },
      el('div', { class: 'kolo-left' },
        el('button', { class: 'wheel-close btn small', onclick: () => wheelOpen(false) }, 'Zamknij koło'),
        wheelBox, keyInfo),
      el('div', { class: 'kolo-right' }, el('div', { class: 'kolo-top' }, keyPill, tabs, p2Bar), p2Msg, card)));

  const strip = el('div', { class: 'gstrip' });
  const line = el('div', { class: 'kstatus' });
  const setStatus = (t, kind = '') => fill(line, el('span', { class: `ks ${kind}` }, t));
  const guide = new Guide({
    keyboard: ctx.keyboard, strip,
    onStatus: setStatus,
    onDone: ({ way, done, total }) => {
      if (way === 'show') setStatus('Teraz ty: „Graj ze mną”.');
      else setStatus(done === total ? `Całość zagrana. ${done} z ${total}.` : `Zagrane ${done} z ${total}. Kolejna runda?`, done === total ? 'good' : '');
    },
    onRun: () => refreshRunButtons(),
    onPass: (res) => countPass(res),
    baseMarks: () => base(),
    onFeedback: (fb) => showFeedback(fb),
  });
  guide.smart = st.smart;

  // --- "umiem": progress per card item -----------------------------------------------------------
  const kid = (k = key) => `${k.mode}${wheelIndex(k)}`;
  function useItem(idSuffix, label) {
    item = { id: `${kid()}|${idSuffix}`, label };
    guide.fade = st.autoLights ? M.get(item.id).fade : 0;
    if (reviewingNow()) guide.fade = 3;   // a review is played without lights
    // a new thing on the card clears the last pass's numbers (not while walking through keys: those belong to the run)
    if (fbItem !== item.id && !guide.running) fill(fbBox);
    fbItem = item.id;
    renderP2();
  }
  const reviews = reviewBar({ itemId: () => (item ? item.id : null), go: (v, x) => ctx.go && ctx.go(v, x), rerender: () => renderP2(), way: () => st.way });
  const reviewingNow = () => reviews.reviewingNow();
  const noteReview = (id, rv) => reviews.note(id, rv);
  function countPass(res) {
    if (!item) return null;
    const r = M.recordPass(item.id, { ...res, day: store.today() });
    store.save();
    if (r.events.length) toast(r.events.join(' '), r.after.stage > r.before.stage ? 'good' : r.review && !r.review.ok ? 'info' : '');
    noteReview(item.id, r.review);
    refreshProgress();
    if (r.after.stage !== r.before.stage) { drawWheel(); renderKeyInfo(); markChips(); }
    renderP2();
    return st.autoLights ? r.after.fade : 0;
  }
  function dots(id) {
    const r = M.get(id);
    return el('span', { class: `mdots s${r.stage}`, 'data-id': id, title: `${M.STAGE_NAMES[r.stage]}${r.best ? `, najlepsze czyste tempo ${r.best}` : ''}`, 'aria-label': `postęp: ${M.STAGE_NAMES[r.stage]}` }, el('i'), el('i'), el('i'));
  }
  function nextTip(r) {
    if (r.stage === 0) return 'Zacznij od „Prowadzę”.';
    if (r.stage === 1) return 'Teraz „W tempie”. Każde czyste przejście przygasza światła.';
    if (r.stage === 2 && r.fade < 3) return 'Graj „W tempie” czysto: światła będą gasnąć same.';
    if (r.stage === 2) return `Jeszcze ${M.NEED_CLEAN - r.cleanRun} ${M.NEED_CLEAN - r.cleanRun === 1 ? 'czyste przejście' : 'czyste przejścia'} w tempie bez świateł i umiesz.`;
    return 'Umiesz. Spróbuj szybciej albo w sąsiedniej tonacji.';
  }
  function refreshProgress() {
    if (!item) { fill(progBox); return; }
    const r = M.get(item.id);
    fill(progBox,
      dots(item.id),
      el('span', { class: 'm-text' }, el('b', {}, M.STAGE_NAMES[r.stage]), ` · światła: ${st.autoLights ? M.FADE_NAMES[r.fade] : 'zawsze pełne'}${r.best ? ` · najlepsze czyste tempo ${r.best}` : ''}`),
      el('span', { class: 'm-tip' }, nextTip(r)),
      el('button', { class: `pick small ${st.autoLights ? 'on' : ''}`, title: 'Auto: światła przygasają, gdy coś ci wychodzi. Wyłącz, żeby zawsze świeciły w pełni.', onclick: () => { st.autoLights = !st.autoLights; store.save(); guide.stop(); renderCard(); } }, st.autoLights ? 'Światła: auto' : 'Światła: pełne'),
      st.way === 'tempo' ? el('button', { class: `pick small ${st.smart ? 'on' : ''}`, title: 'Mądra pętla (W tempie + Pętla): czysto = szybciej, błędy w jednym miejscu = zapętlam to miejsce wolniej.', onclick: () => { st.smart = !st.smart; guide.smart = st.smart; store.save(); refreshProgress(); } }, st.smart ? 'Mądra pętla: wł.' : 'Mądra pętla: wył.') : null);
  }
  // refresh the little dots on chips after a pass (without re-rendering the card mid-play)
  const markChips = () => {
    for (const d of card.querySelectorAll('.mdots[data-id]')) d.replaceWith(dots(d.dataset.id));
    for (const o of card.querySelectorAll('.prog-select option')) {
      const p = PROGRESSIONS.find((x) => x.id === o.value);
      if (p) o.textContent = `${M.dotsText(M.get(`${kid()}|prog|${p.id}`))} ${p.name} (${p.mood})`;
    }
  };
  let runBtns = null;   // {show, play} of the current card
  function refreshRunButtons() {
    if (!runBtns) return;
    const r = guide.running, w = guide.way;
    const set = (b, stop, label) => { b.textContent = stop ? '■ Stop' : label; b.classList.toggle('stop', stop); };
    set(runBtns.show, r && w === 'show', 'Pokaż');
    set(runBtns.play, r && w !== 'show', 'Graj ze mną');
  }
  function stopAll() { guide.stop(); bus.stop(); setStatus('Zatrzymane.'); }
  let base = () => [];
  let shownScale = null;   // the scale whose keys are lit on the Gama card (free play with those lights is not "lights off")

  // --- free play: a whole scale played without "Graj ze mną" counts too ----------------------------------
  let candCache = null;
  function candidates() {
    const tag = `${keyName(key)}|${key.mode}`;
    if (candCache && candCache.tag === tag) return candCache.list;
    const list = [], seen = new Set();
    const addKey = (k, scales) => {
      for (const sc of scales) {
        const ns = scaleNotes(k, sc, 60);
        const shape = runShape(ns.slice(0, -1).map((x) => x.midi - ns[0].midi));
        const sig = `${k.tonicPc}:${shape.join(',')}`;
        if (seen.has(sig)) continue;   // e.g. blues on C in C-dur and in c-moll: the current key wins
        seen.add(sig);
        list.push({ key: k, scale: sc, tonicPc: k.tonicPc, shape });
      }
    };
    // the chosen key first (a scale from its tonic counts there), then every scale from every tonic,
    // filed under the dur or moll key it belongs to
    addKey(key, ALL_SCALES);
    for (let pc = 0; pc < 12; pc++) {
      for (const sc of ALL_SCALES) { const k = keyByTonic(pc, MINORISH.has(sc) ? 'minor' : 'major'); if (k) addKey(k, [sc]); }
    }
    candCache = { tag, list };
    return list;
  }
  const detector = new ScaleDetector(candidates);
  function creditFreeRun(r) {
    const { key: k, scale: sc } = r.cand;
    const id = `${kid(k)}|gama|${sc}|${r.hand}`;
    const total = r.notes.length;
    // were the keys of this scale lit on the screen? then it is a pass with lights, not without
    const lit = shownScale && guide.fade < 2 && r.notes.every((n) => shownScale.pcs.has(((n % 12) + 12) % 12));
    const res = r.steady
      ? M.recordPass(id, { way: 'tempo', done: total, total, tempo: r.bpm, fadeUsed: lit ? 1 : 3, day: store.today() })
      : M.recordPass(id, { way: 'dark', done: total, total, day: store.today() });
    store.save();
    noteReview(id, res.review);
    const what = `${scaleTitle(sc)} od ${scaleNotes(k, sc, 60)[0].name} (${HAND_NAME[r.hand]})`;
    const how = r.steady ? `Równo, ok. ${r.bpm} BPM${lit ? ', ze światłami na ekranie' : ', bez świateł'}.` : 'Całość bez błędu, tempo nierówne.';
    const extra = res.events.length ? res.events.join(' ') : r.steady && !lit && res.after.stage < 3 ? `Czyste bez świateł: ${res.after.cleanRun} z ${M.NEED_CLEAN}.` : '';
    toast(`Rozpoznałem: ${what}. ${how} ${extra}`.trim(), res.after.stage > res.before.stage ? 'good' : '');
    if (item && item.id === id) {
      guide.fade = st.autoLights ? res.after.fade : 0;
      if (st.tab === 'gama' && !guide.running) ctx.keyboard.mark(guide.fade >= 2 ? [] : base());
      refreshProgress();
    }
    drawWheel(); renderKeyInfo(); markChips(); renderP2();
  }

  // --- Kostka, powtórki, podpowiedzi ----------------------------------------------------------------------
  function go(open) { if (open && ctx.go) ctx.go(open.view, { preset: open.preset }); }
  function rollDice() {
    const d = pickDice(store.data.mastery || {}, { exclude: st.lastDice || null });
    if (!d) { toast('Kostka nie ma z czego wybrać.'); return; }
    st.lastDice = d.id;
    store.save();
    go({ view: d.open.view, preset: { ...d.open.preset, why: d.why } });
  }
  function renderP2() {
    if (!alive) return;
    const songs = allSongs();
    const today = store.today();
    const due = reviews.due();
    const hs = hints(store.data.mastery || {}, { today, songs }).filter((h) => h.id !== 'due');
    const h = hs.length ? hs[hintIdx % hs.length] : null;
    fill(p2Bar,
      el('button', { class: 'btn small p2-dice', title: 'Kostka wybiera, co zagrać: słabe miejsce, coś w toku albo coś nowego w sąsiedniej tonacji.', onclick: () => rollDice() }, 'Kostka'),
      due.length && !walkCurrent() ? el('button', { class: 'btn small p2-due', title: due.map((x) => x.prompt).join('\n'), onclick: () => reviews.start(due) }, 'Do powtórki: ', el('b', {}, String(due.length))) : null,
      h ? el('span', { class: 'p2-hint' }, h.text, ' ', h.open ? el('button', { onclick: () => go(h.open) }, 'otwórz') : null) : null);
    fill(p2Msg,
      diceWhy && item && item.id === diceWhy.id ? el('p', { class: 'p2-why' }, diceWhy.text) : null,
      reviews.banner());
  }
  const hintTimer = setInterval(() => { hintIdx++; if (!guide.running) renderP2(); }, 25000);

  // --- informacja po próbie -----------------------------------------------------------------------------
  function showFeedback(fb) {
    if (!alive) return;
    const a = analyzePass({ hits: fb.hits, steps: fb.steps });
    let chal = '';
    if ((st.tab === 'progresje' || st.tab === 'akomp') && st.chal === 'ct') chal = challengeLine('ct', chordToneShare(fb.log, fb.steps));
    if ((st.tab === 'progresje' || st.tab === 'akomp') && st.chal === 'third') chal = challengeLine('third', thirdOnChanges(fb.log, fb.steps, fb));
    fill(fbBox, el('span', { class: 'fb-head' }, `Po przejściu · ${fb.tempo} BPM`), a.lines.map((l) => el('p', {}, l)), chal ? el('p', { class: 'fb-chal' }, chal) : null);
  }
  function chalPick() {
    return el('label', { class: 'chal-field', title: 'Bez punktów i bez limitu czasu. Wynik po każdym przejściu W tempie.' }, el('span', {}, 'Wyzwanie'),
      el('select', { onchange: (e) => { st.chal = e.target.value; store.save(); } },
        CHALLENGES.map(([v, t]) => el('option', { value: v, selected: (st.chal || '') === v }, t))));
  }
  /** Function, chord tones, third and "a new chord starts here" for a step. */
  const chordMeta = (c, prevName) => ({ fn: fnOf(key, c), ct: c.tones.map((t) => t.pc), third: thirdPc(c), change: c.name !== prevName });

  // --- wheel -----------------------------------------------------------------------------------------
  function sectorPath(i, r1, r2) {
    const a1 = ((i * 30 - 105) * Math.PI) / 180, a2 = ((i * 30 - 75) * Math.PI) / 180;
    const p = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    return `M${p(r1, a1)} L${p(r2, a1)} A${r2} ${r2} 0 0 1 ${p(r2, a2)} L${p(r1, a2)} A${r1} ${r1} 0 0 0 ${p(r1, a1)} Z`;
  }
  function labelPos(i, r) {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }

  function familyOnWheel() {
    // number labels of the family wedge: [ring, index, label]
    const i = wheelIndex(key);
    const m = (x) => (x + 12) % 12;
    if (key.mode === 'major') return [['o', m(i - 1), '4'], ['o', i, '1'], ['o', m(i + 1), '5'], ['i', m(i - 1), '2m'], ['i', i, '6m'], ['i', m(i + 1), '3m']];
    return [['i', m(i - 1), '4m'], ['i', i, '1m'], ['i', m(i + 1), '5m'], ['o', m(i - 1), '♭6'], ['o', i, '♭3'], ['o', m(i + 1), '♭7']];
  }

  function drawWheel() {
    const s = svg('svg', { viewBox: '-205 -205 410 410', class: 'wheel', role: 'group', 'aria-label': 'Koło tonacji' });
    const fam = familyOnWheel();
    const famLabel = (ring, i) => (fam.find(([r, x]) => r === ring && x === i) || [])[2];
    const ki = wheelIndex(key);
    for (let i = 0; i < 12; i++) {
      for (const ring of ['o', 'i']) {
        const k = keyAt(i, ring === 'o' ? 'major' : 'minor');
        const selected = ki === i && (ring === 'o') === (key.mode === 'major');
        const fl = famLabel(ring, i);
        const g = svg('g', { class: `sector ${ring === 'o' ? 'outer' : 'inner'} ${fl ? 'fam' : ''} ${selected ? 'sel' : ''}`, tabindex: '0', role: 'button', 'aria-label': keyName(k, true), 'data-key': keyName(k) });
        g.append(svg('path', { d: ring === 'o' ? sectorPath(i, 128, 200) : sectorPath(i, 76, 128) }));
        // the name, and under it (not beside it) the number in the chosen key, so they never run into each other
        const lp = labelPos(i, ring === 'o' ? 164 : 102);
        if (fl) {
          g.append(svg('text', { x: lp.x, y: lp.y + (ring === 'o' ? -1 : -2), class: 'sec-name' }, keyName(k)));
          g.append(svg('text', { x: lp.x, y: lp.y + (ring === 'o' ? 16 : 13), class: 'sec-num' }, fl));
        } else g.append(svg('text', { x: lp.x, y: lp.y + (ring === 'o' ? 7 : 5), class: 'sec-name' }, keyName(k)));
        // progress map: a line at the edge of keys you have started, bright when you know things there
        const sum = M.keySummary(`${kid(k)}|`);
        const lvl = sum.known >= 3 ? 3 : sum.known >= 1 ? 2 : sum.started ? 1 : 0;
        if (lvl) g.append(svg('path', { d: ring === 'o' ? sectorPath(i, 196, 204) : sectorPath(i, 76, 81), class: `prog-arc lvl${lvl}` }));
        g.append(svg('title', {}, `${keyName(k, true)}${sum.known || sum.started ? `: umiesz ${sum.known}, w toku ${sum.started}` : ''}`));
        const pick = () => { selectKey(k); };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(); } });
        s.append(g);
      }
    }
    const sig = keySignature(key);
    s.append(svg('circle', { r: 72, class: 'wheel-center' }));
    s.setAttribute('viewBox', '-210 -210 420 420');
    s.append(svg('text', { y: -6, class: 'wc-name' }, keyName(key, true)));
    s.append(svg('text', { y: 22, class: 'wc-sig' }, sig.count ? `${sig.count} ${sig.sign}` : 'bez znaków'));
    fill(wheelBox, s);
  }

  function renderKeyInfo() {
    const sig = keySignature(key);
    const i = wheelIndex(key);
    const left = keyAt(i - 1, key.mode), right = keyAt(i + 1, key.mode), rel = relativeOf(key);
    fill(keyInfo,
      el('p', { class: 'ki-sig' }, sig.count ? `Znaki: ${sig.notes.join(' ')}` : 'Same białe klawisze'),
      el('div', { class: 'ki-nav' },
        el('button', { class: 'btn small', onclick: () => selectKey(left), title: 'Jeden znak mniej krzyżyków (lub więcej bemoli)' }, `← ${keyName(left)}`),
        el('button', { class: 'btn small', onclick: () => selectKey(rel) }, key.mode === 'major' ? `Molowa: ${keyName(rel)}` : `Durowa: ${keyName(rel)}`),
        el('button', { class: 'btn small', onclick: () => selectKey(right) }, `${keyName(right)} →`)),
      knownHere(),
      el('p', { class: 'muted ki-help' }, key.mode === 'major'
        ? 'Rodzina na kole: 1 w środku, 4 po lewej, 5 po prawej, a w środku koła ich molowi krewni. Sąsiedzi różnią się jednym dźwiękiem.'
        : 'Rodzina na kole: 1m w środku, 4m po lewej, 5m po prawej (zwykle gra się je jako durowe 5), a na zewnątrz durowi krewni.'));
  }

  function itemLabel(id) {
    const [, tab, a, b] = id.split('|');
    if (tab === 'gama') return `${SCALES[a] ? SCALES[a].short : a} (${{ rh: 'prawa', lh: 'lewa', both: 'obie' }[b] || b})`;
    if (tab === 'akordy') {
      if (a === 'rodzina') return `rodzina akordów${b === '7' ? ' z septymą' : ''}`;
      // przewroty: degree index + 3/7 → the chord in this key
      const [, mode, wi] = id.match(/^(major|minor)(\d+)\|/) || [];
      try { const c = family(keyAt(Number(wi), mode), b.slice(-1) === '7')[Number(b.slice(0, -1))]; return `przewroty ${c.name}`; } catch { return 'przewroty'; }
    }
    const pr = (pid) => (PROGRESSIONS.find((p) => p.id === pid) || { name: pid }).name;
    if (tab === 'prog') return pr(a);
    if (tab === 'akomp') return `${(PATTERNS.find((p) => p.id === a) || { name: a }).name} (${pr(b)})`;
    return id;
  }
  function knownHere() {
    const sum = M.keySummary(`${kid()}|`);
    if (!sum.known && !sum.started) return el('p', { class: 'muted ki-map' }, 'Mapa: kreska przy tonacji = coś zaczęte, jasna i gruba = coś umiesz bez świateł.');
    return el('div', { class: 'ki-map' },
      sum.known ? el('p', {}, el('b', {}, 'Umiesz tu: '), sum.knownList.map(itemLabel).join(', ')) : null,
      sum.started ? el('p', { class: 'muted' }, el('b', {}, 'W toku: '), sum.startedList.map(itemLabel).join(', ')) : null);
  }

  function renderKeyPill() {
    const sig = keySignature(key);
    fill(keyPill, el('b', {}, keyName(key, true)), el('span', {}, sig.count ? `${sig.count} ${sig.sign}` : 'bez znaków'), el('i', {}, 'zmień tonację'));
  }

  function selectKey(k, quiet = false) {
    guide.stop();
    key = k;
    setKey(k);
    selChord = null; invMode = false;
    drawWheel();
    renderKeyInfo();
    renderKeyPill();
    renderCard();
    if (compact()) setTimeout(() => wheelOpen(false), 350);
    if (!quiet) {
      const c = degreeChord(k, 1, 0, k.mode === 'minor' ? 'min' : 'maj');
      soft(voicing(c, { center: 60 }).concat([bassNote(c, 36)]));
    }
  }

  function soft(notes, dur = 1.1, vel = 48) {
    const ev = [];
    notes.forEach((n, i) => { ev.push({ t: i * 0.012, m: [0x90, n, vel] }, { t: dur, m: [0x80, n, 0] }); });
    playEvents(ev, { lead: 0.05 }).catch(() => {});
  }

  // --- tabs -----------------------------------------------------------------------------------------------
  function renderTabs() {
    fill(tabs, TABS.map(([tid, name]) => el('button', { class: `tab ${st.tab === tid ? 'on' : ''}`, role: 'tab', 'aria-selected': String(st.tab === tid), onclick: () => { st.tab = tid; store.save(); guide.stop(); renderTabs(); renderCard(); } }, name)));
  }

  // shared controls for a card
  function playRow({ tempoLabel = 'Tempo' } = {}) {
    const ways = el('div', { class: 'seg-ctl', role: 'radiogroup', 'aria-label': 'Jak grać' },
      Object.entries(WAYS).map(([w, info]) => el('button', { class: st.way === w ? 'on' : '', role: 'radio', 'aria-checked': String(st.way === w), title: info.help, onclick: () => { st.way = w; store.save(); guide.stop(); renderCard(); } }, info.name)));
    const tempo = el('label', { class: 'field inline tempo-field' }, el('span', {}, tempoLabel),
      el('input', { type: 'range', min: '40', max: '140', step: '2', value: String(st.tempo), oninput: (e) => { st.tempo = Number(e.target.value); tv.textContent = `${st.tempo}`; store.save(); } }),
      el('b', {}, ''));
    const tv = tempo.querySelector('b'); tv.textContent = `${st.tempo}`;
    const show = el('button', { class: 'btn', onclick: () => { if (guide.running && guide.way === 'show') stopAll(); else guide.show(st.tempo); } }, 'Pokaż');
    const play = el('button', { class: 'btn primary', onclick: () => { if (guide.running && guide.way !== 'show') stopAll(); else guide.start(st.way, { tempo: st.tempo }); } }, 'Graj ze mną');
    runBtns = { show, play };
    // the play controls live in the bar above the keyboard (always visible); nothing stays in the card
    ctx.dock(el('div', { class: 'play-row' }, show, play, loopButton(), ways, tempo));
    return null;
  }

  function why(text, extra = null) {
    return el('details', { class: 'why', open: st.whyOpen !== false && !compact(), ontoggle: (e) => { st.whyOpen = e.target.open; store.save(); } },
      el('summary', {}, 'Dlaczego?'), el('p', {}, text), extra);
  }

  function doors(list) {
    return el('div', { class: 'doors' }, el('span', { class: 'doors-label' }, 'Następne drzwi'),
      list.filter(Boolean).map(([label, fn]) => el('button', { class: 'door', onclick: fn }, label, el('span', { 'aria-hidden': 'true' }, ' →'))));
  }

  function renderCard() {
    guide.stop();
    guide.walker = null;
    shownScale = null;
    setStatus(WAYS[st.way].help);
    try {
      if (st.tab === 'gama') return cardScale();
      if (st.tab === 'akordy') return cardChords();
      if (st.tab === 'progresje') return cardProgressions();
      return cardAccomp();
    } catch (err) {
      // never leave an empty card: say so and offer a way back to the defaults
      console.error(err);
      fill(card, el('div', { class: 'kcard-head' },
        el('h2', {}, 'Ta karta się nie wyświetliła'),
        el('p', { class: 'muted' }, `Błąd: ${err && err.message ? err.message : err}. Przycisk niżej przywraca domyślne ustawienia karty.`)),
      el('button', { class: 'btn primary', onclick: () => { st.scale = null; st.hand = 'rh'; st.pattern = 'blok'; st.prog = {}; store.save(); renderCard(); } }, 'Przywróć i pokaż'));
    }
  }

  function scaleTitle(sc) {
    const nm = SCALES[sc].name;
    if (['dur', 'moll', 'harm'].includes(sc)) return `Gama ${nm}`;
    if (nm.startsWith('pentatonika')) return nm[0].toUpperCase() + nm.slice(1);
    return `Skala ${nm}`;
  }

  // --- Gama ------------------------------------------------------------------------------------------------
  function cardScale({ live = false } = {}) {
    let sc = st.scale && SCALES[st.scale] ? st.scale : key.mode === 'major' ? 'dur' : 'moll';
    // groups: the one picked, else the first that has the current scale
    const group = SCALE_GROUPS.find((g) => g.id === st.scaleGroup) || SCALE_GROUPS.find((g) => g.list.some(([x]) => x === sc)) || SCALE_GROUPS[0];
    const hand = st.hand;
    const { notesR, fing, steps } = scaleSteps(key, sc, hand);
    shownScale = { pcs: new Set(notesR.map((x) => x.pc)) };
    const tonic = notesR[0].name;
    const pattern = SCALES[sc].deg.length === 7 ? stepPattern(sc) : null;

    // base: every scale tone in range, quietly, with its degree
    base = () => {
      const out = [];
      for (let m = RANGE[0]; m <= RANGE[1]; m++) {
        const n = notesR.find((x) => ((x.midi - m) % 12 + 12) % 12 === 0);
        if (n) out.push({ note: m, text: n.name, sub: n.deg, tone: n.deg === '1' ? 'var(--role-1)' : 'var(--mode)', dim: true });
      }
      return out;
    };

    useItem(`gama|${sc}|${hand}`);
    // walking through keys after each pass (works without Pętla too)
    let walkKey = null;
    guide.walker = st.scaleWalk ? {
      peek: () => { walkKey = stepKey(key, st.scaleWalk); return { steps: scaleSteps(walkKey, sc, hand).steps, label: keyName(walkKey, true) }; },
      commit: () => { if (!walkKey || !alive) return; key = walkKey; walkKey = null; setKey(key); drawWheel(); renderKeyInfo(); renderKeyPill(); cardScale({ live: true }); refreshRunButtons(); },
    } : null;
    if (!live) guide.load(steps);

    fill(card,
      el('div', { class: 'kcard-head' },
        el('h2', {}, `${scaleTitle(sc)} od ${tonic}`),
        el('p', { class: 'muted' }, `${notesR.slice(0, -1).map((n) => n.name).join(' ')}${pattern ? `  ·  przepis: ${pattern.join(' ')}` : ''}`)),
      compact() ? null : el('div', { class: 'scale-groups seg-ctl small', role: 'tablist', 'aria-label': 'Rodzaje skal' },
        SCALE_GROUPS.map((g) => {
          const known = g.list.filter(([x]) => M.get(`${kid()}|gama|${x}|${hand}`).stage >= 1).length;
          return el('button', { class: g.id === group.id ? 'on' : '', role: 'tab', 'aria-selected': String(g.id === group.id), onclick: () => { st.scaleGroup = g.id; store.save(); renderCard(); } },
            g.name, known ? el('small', { class: 'sg-count' }, ` ${known}/${g.list.length}`) : null);
        })),
      el('div', { class: 'chips-row' },
        // phone: the groups as a list, so the play buttons stay on screen
        compact() ? el('select', { class: 'sg-select', 'aria-label': 'Rodzaje skal', onchange: (e) => { st.scaleGroup = e.target.value; store.save(); renderCard(); } },
          SCALE_GROUPS.map((g) => el('option', { value: g.id, selected: g.id === group.id }, g.name))) : null,
        group.list.map(([x, alias]) => el('button', { class: `pick ${SCALES[x].color ? 'color' : ''} ${x === sc ? 'on' : ''}`, title: SCALES[x].name, onclick: () => { st.scale = x; st.scaleGroup = group.id; store.save(); renderCard(); } }, alias || SCALES[x].short, dots(`${kid()}|gama|${x}|${hand}`)))),
      el('div', { class: 'chips-row' },
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Ręka' },
          [['rh', 'Prawa'], ['lh', 'Lewa'], ['both', 'Obie']].map(([h, t]) => el('button', { class: hand === h ? 'on' : '', role: 'radio', 'aria-checked': String(hand === h), onclick: () => { st.hand = h; store.save(); renderCard(); } }, t))),
        el('span', { class: 'muted walk-label' }, 'potem:'),
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Po każdym przejściu' },
          SCALE_WALKS.map(([v, t]) => el('button', { class: (st.scaleWalk || 0) === v ? 'on' : '', role: 'radio', 'aria-checked': String((st.scaleWalk || 0) === v), title: v ? `Następna: ${keyName(stepKey(key, v), true)}. Gram dalej, aż dasz Stop.` : '', onclick: () => { st.scaleWalk = v; store.save(); renderCard(); } }, t))),
        st.scaleWalk ? el('span', { class: 'muted' }, `następna: ${keyName(stepKey(key, st.scaleWalk), true)}`) : null),
      el('p', { class: 'muted fing-hint' }, fing ? 'Kółka ①–⑤ to palce: 1 kciuk, 5 mały. „Potem” mówi, co po każdej zagranej całości: ta sama tonacja, następna po kole albo pół tonu w górę (gram dalej, aż dasz Stop).' : 'Ta skala nie ma jednego „szkolnego” palcowania. Graj wygodnie, bez wciskania kciuka pod czarny klawisz.'),
      strip, progBox, playRow(), fbBox, line,
      why(whyScale(key, sc)),
      doors([
        ['Akordy z tej gamy', () => { st.tab = 'akordy'; store.save(); renderTabs(); renderCard(); }],
        ['Improwizuj na niej w Jamie', () => ctx.go && ctx.go('jam', { preset: { role: 'solo' } })],
        [`Sąsiad: ${keyName(keyAt(wheelIndex(key) + 1, key.mode), true)}`, () => selectKey(keyAt(wheelIndex(key) + 1, key.mode))],
        [`${key.mode === 'major' ? 'Molowa siostra' : 'Durowa siostra'}: ${keyName(relativeOf(key), true)}`, () => selectKey(relativeOf(key))],
      ]));
    refreshProgress();
    if (!live) ctx.keyboard.mark(guide.fade >= 2 ? [] : base());
  }

  // --- Akordy -----------------------------------------------------------------------------------------------
  function cardChords() {
    const fam = family(key, st.sevenths);
    const famBase = () => [];
    base = famBase;
    let steps;
    if (invMode && selChord != null) {
      const c = fam[selChord];
      steps = inversions(c, 55).map((inv) => ({ notes: inv.notes, marks: chordMarks(c, inv.notes, { fn: fnOf(key, c) }), label: c.name, sub: inv.name, beats: 2, vel: 60, fn: fnOf(key, c) }));
    } else {
      let prev = null;
      steps = fam.map((c) => { const v = voicing(c, { prev: null, center: 62, lo: 55, hi: 72 }); prev = v; return { notes: v, marks: chordMarks(c, v, { fn: fnOf(key, c) }), label: c.number, sub: c.name, small: c.tones.map((t) => t.name).join(' '), beats: 2, vel: 60, fn: fnOf(key, c) }; });
    }
    const sel = selChord != null ? fam[selChord] : null;
    useItem(invMode && sel ? `akordy|przewroty|${selChord}${st.sevenths ? 7 : 3}` : `akordy|rodzina|${st.sevenths ? 7 : 3}`);
    guide.load(steps);

    const showChord = (c, notes) => { ctx.keyboard.mark(chordMarks(c, notes, { fn: fnOf(key, c) })); soft(notes, 1.3, 56); };
    fill(card,
      el('div', { class: 'kcard-head' },
        el('h2', {}, `Rodzina akordów ${keyName(key, true)}`),
        el('p', { class: 'muted' }, 'Kliknij akord: zobaczysz jego dźwięki na klawiszach i usłyszysz go. Kolory dźwięków: 1 pryma, 3 tercja, 5 kwinta, 7 septyma. Kolor numeru to funkcja akordu.')),
      fnLegend(),
      el('div', { class: 'chips-row' },
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Rodzaj akordów' },
          [[false, 'Trójdźwięki'], [true, 'Z septymą']].map(([v, t]) => el('button', { class: st.sevenths === v ? 'on' : '', role: 'radio', 'aria-checked': String(st.sevenths === v), onclick: () => { st.sevenths = v; store.save(); renderCard(); } }, t, dots(`${kid()}|akordy|rodzina|${v ? 7 : 3}`))))),
      el('div', { class: 'fam-grid' }, fam.map((c, k) => el('button', {
        class: `fam-card q-${c.quality} fn ${fnClass(fnOf(key, c))} ${selChord === k ? 'on' : ''}`,
        title: `${c.name}: ${FN[fnOf(key, c)].name}`,
        onclick: () => { selChord = k; invMode = false; renderCard(); const v = voicing(c, { center: 62, lo: 55, hi: 72 }); showChord(c, v); },
      },
      el('span', { class: 'fc-num' }, c.number, el('span', { class: 'fn-tag', 'aria-hidden': 'true' }, FN[fnOf(key, c)].short)), el('span', { class: 'fc-name' }, c.name),
      el('span', { class: 'fc-tones' }, c.tones.map((t, j) => el('i', { style: { '--t': ROLE_TONE[c.roles[j]] } }, t.name)))))),
      sel ? el('div', { class: 'inv-row' },
        el('span', { class: 'muted' }, `${sel.name} w przewrotach:`),
        inversions(sel, 55).map((inv) => el('button', { class: 'pick', onclick: () => showChord(sel, inv.notes) }, inv.name)),
        el('button', { class: `pick ${invMode ? 'on' : ''}`, onclick: () => { invMode = !invMode; renderCard(); } }, invMode ? 'Graj całą rodzinę' : 'Ćwicz przewroty')) : null,
      el('p', { class: 'muted' }, invMode && sel ? `„Graj ze mną” przejdzie przez przewroty ${sel.name}.` : '„Graj ze mną” przejdzie przez całą rodzinę, od 1 do 7.'),
      strip, progBox, playRow(), fbBox, line,
      why(invMode ? whyInversions() : whyFamily(key)),
      doors([
        ['Progresje z tej rodziny', () => { st.tab = 'progresje'; store.save(); renderTabs(); renderCard(); }],
        ['Graj akordy w Jamie', () => ctx.go && ctx.go('jam', { preset: { role: 'akordy' } })],
        sel && sel.quality !== 'dim' && sel.quality !== 'm7b5' ? [`${sel.name} jako tonacja`, () => {
          const target = ALL_KEYS.find((k) => k.tonicPc === sel.root.pc && k.mode === (/^m(?!aj)/.test(sel.quality) || sel.quality === 'min' ? 'minor' : 'major'));
          if (target) selectKey(target); else toast('Tej tonacji nie ma na kole, bo zapisuje się ją inaczej.');
        }] : null,
      ]));
    refreshProgress();
    ctx.keyboard.mark([]);
  }

  // --- Progresje ------------------------------------------------------------------------------------------------
  function currentProg() {
    const list = PROGRESSIONS.filter((p) => p.mode === key.mode);
    const pid = (st.prog || {})[key.mode];
    return list.find((p) => p.id === pid) || list[0];
  }

  function cardProgressions() {
    const list = PROGRESSIONS.filter((p) => p.mode === key.mode);
    const prog = currentProg();
    const colorPick = st.progColor || 'auto';
    const chords = progressionChords(key, prog, { color: colorPick });
    base = () => [];
    let prev = null;
    let prevName = null;
    const steps = chords.map((c) => {
      const v = voicing(c, { prev, center: 64, lo: 55, hi: 74 });
      prev = v;
      const notes = st.bassToo ? [bassNote(c, 43), ...v] : v;
      const meta = chordMeta(c, prevName);
      prevName = c.name;
      return { notes, marks: chordMarks(c, notes, { fn: meta.fn }), label: c.number, sub: c.name, small: c.tones.map((t) => t.name).join(' '), beats: prog.steps.length > 8 ? 2 : 4, vel: 58, ...meta };
    });
    useItem(`prog|${prog.id}`);
    guide.load(steps);
    fill(card,
      el('div', { class: 'kcard-head' },
        el('h2', {}, `${prog.name} w ${keyName(key, true)}`),
        el('p', { class: 'muted' }, `${prog.mood}. Numery: `, el('span', { class: 'num-chips' }, chords.map((c) => el('b', { class: fnClass(fnOf(key, c)) }, c.number))))),
      compact()
        // phone: a list instead of 10 tiles, so the chords and the buttons stay on screen
        ? el('label', { class: 'field prog-select' }, el('span', {}, 'Progresja'),
          el('select', { onchange: (e) => { st.prog = { ...(st.prog || {}), [key.mode]: e.target.value }; store.save(); renderCard(); } },
            list.map((p) => el('option', { value: p.id, selected: p.id === prog.id }, `${M.dotsText(M.get(`${kid()}|prog|${p.id}`))} ${p.name} (${p.mood})`))))
        : el('div', { class: 'prog-list' }, list.map((p) => el('button', { class: `prog-pick ${p.id === prog.id ? 'on' : ''}`, onclick: () => { st.prog = { ...(st.prog || {}), [key.mode]: p.id }; store.save(); renderCard(); } },
          el('b', {}, p.name, dots(`${kid()}|prog|${p.id}`)), el('span', {}, p.mood)))),
      el('div', { class: 'chips-row' },
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Barwa' },
          [['auto', 'Jak w stylu'], ['triads', 'Trójdźwięki'], ['sevenths', 'Septymy'], ['ninths', 'Nony']].map(([v, t]) => el('button', { class: colorPick === v ? 'on' : '', role: 'radio', 'aria-checked': String(colorPick === v), onclick: () => { st.progColor = v; store.save(); renderCard(); } }, t))),
        el('label', { class: 'field inline' }, el('input', { type: 'checkbox', checked: st.bassToo, onchange: (e) => { st.bassToo = e.target.checked; store.save(); renderCard(); } }), el('span', {}, 'Lewa ręka gra bas')),
        chalPick()),
      fnLegend(),
      strip, progBox, playRow(), fbBox, line,
      why(`${prog.why} Na klawiszach pokazuję układ, w którym ręka rusza się jak najmniej: wspólne dźwięki zostają pod palcami.`),
      doors([
        ['Zagraj ją w Jamie', () => ctx.go && ctx.go('jam', { preset: { prog: prog.id, role: 'akordy' } })],
        ['Akompaniament do niej', () => { st.tab = 'akomp'; store.save(); renderTabs(); renderCard(); }],
        [`Ta sama w ${keyName(keyAt(wheelIndex(key) + 1, key.mode), true)}`, () => selectKey(keyAt(wheelIndex(key) + 1, key.mode))],
      ]));
    refreshProgress();
    ctx.keyboard.mark([]);
  }

  // --- Akompaniament -------------------------------------------------------------------------------------------
  function cardAccomp() {
    const prog = currentProg();
    const pat = PATTERNS.find((p) => p.id === st.pattern) || PATTERNS[0];
    const chords = progressionChords(key, prog, { color: 'triads' });
    base = () => [];
    let prev = null;
    const steps = [];
    let prevName = null;
    for (const c of chords) {
      const v = voicing(c, { prev, center: 64, lo: 55, hi: 74 });
      prev = v;
      const meta = chordMeta(c, prevName);
      prevName = c.name;
      const root = bassNote(c, 43);
      const byBeat = new Map();
      for (const [b, what, d] of pat.ev) {
        const n = what === 'R' ? [root] : what === '5' ? [root + 7] : what === 'C' ? v : [v[Number(what.slice(1)) % v.length]];
        if (!byBeat.has(b)) byBeat.set(b, []);
        byBeat.get(b).push(...n);
      }
      const beats = [...byBeat.keys()].sort((a, b) => a - b);
      beats.forEach((b, j) => {
        const notes = [...new Set(byBeat.get(b))];
        const nextB = j + 1 < beats.length ? beats[j + 1] : pat.beats;
        // every step says what to play, so it can be read without lights
        const names = notes.map((x) => { const t = c.tones.find((tt) => tt.pc === ((x % 12) + 12) % 12); return t ? t.name : ''; });
        steps.push({ notes, marks: chordMarks(c, notes, { sub: false, fn: meta.fn }), label: j === 0 ? c.number : names.length > 2 ? c.name : names.join(' '), sub: j === 0 ? c.name : notes.length === 1 ? 'bas' : '', beats: nextB - b, vel: 56, exact: true, ...meta, change: j === 0 && meta.change });
      });
    }
    useItem(`akomp|${pat.id}|${prog.id}`);
    guide.load(steps);
    fill(card,
      el('div', { class: 'kcard-head' },
        el('h2', {}, `Akompaniament: ${pat.name}`),
        el('p', { class: 'muted' }, `Do progresji ${prog.name} (${chords.map((c) => c.name).join(' ')}). Inną progresję wybierzesz w karcie Progresje.`)),
      el('div', { class: 'chips-row' }, PATTERNS.map((p) => el('button', { class: `pick ${p.id === pat.id ? 'on' : ''}`, onclick: () => { st.pattern = p.id; store.save(); renderCard(); } },
        p.name, el('span', { class: 'lvl-dots', 'aria-label': `trudność ${p.level} z 3` }, '•'.repeat(p.level)), dots(`${kid()}|akomp|${p.id}|${prog.id}`)))),
      el('div', { class: 'chips-row' }, chalPick()),
      strip, progBox, playRow(), fbBox, line,
      why(pat.why),
      doors([
        ['Z zespołem w Jamie', () => ctx.go && ctx.go('jam', { preset: { prog: prog.id, role: 'wszystko' } })],
        ['Inna progresja', () => { st.tab = 'progresje'; store.save(); renderTabs(); renderCard(); }],
      ]));
    refreshProgress();
    ctx.keyboard.mark([]);
  }

  drawWheel();
  renderKeyInfo();
  renderKeyPill();
  renderTabs();
  renderCard();

  return {
    onNote(e) {
      guide.feed(e);
      if (!e.on) return;
      if (guide.running) { detector.reset(); return; }
      const r = detector.push(e.note, performance.now() / 1000);
      if (r) { try { creditFreeRun(r); } catch (err) { console.error(err); } }
    },
    onPilot(a) {
      if (a === 'start') guide.start(st.way, { tempo: st.tempo });
      if (a === 'repeat') guide.show(st.tempo);
      if (a === 'hint') guide.hint();
      if (a === 'pause' || a === 'end') stopAll();
    },
    destroy() { alive = false; clearInterval(hintTimer); guide.stop(); ctx.keyboard.mark([]); },
  };
}
