// Progresje (1.18–1.21): how chords go one after another, and why. Six cards over one progression "in the hand":
//   Biblioteka (all progressions), Warsztat (three lenses, Zamień / Pożycz, how to play, the band), Ruchy (27 ways to
//   dress a progression, before / after), Przepisy (step-by-step builds), Trening (six games and a 5-minute loop),
//   Album (cells of harmony, reviews, found in your songs).
// The logic lives in pure modules: progs.js, lenses.js, moves.js, recipes.js, cells.js, prgames.js.
import * as bus from '../bus.js';
import { getKey, setKey } from '../key.js';
import * as store from '../store.js';
import { ALL_KEYS, keyName, keyByTonic, wheelIndex, makeKey, LETTERS, scaleNotes, SCALES } from '../theory.js';
import { stepChords, normStep, identify, stepChord } from '../chords.js';
import { el, fill, add, toast } from '../ui.js';
import { fnOf, fnClass, fnColor } from '../colors.js';
import { jamCycle, countIn, GROOVE, GROOVE_GROUPS } from '../grooves.js';
import { chunkEvents } from '../bandplay.js';
import { playEvents } from './common.js';
import { Guide, WAYS } from './guide.js';
import { loopButton } from '../loopui.js';
import * as M from '../mastery.js';
import { reviewBar } from '../reviewbar.js';
import { createPedalCoach } from '../pedalcoach.js';
import { stepLevel } from '../drill.js';
import { CATALOG, BY_ID, progFor, FAMILY_INFO, FAMILIES, filterCatalog, keyFor, withBars, barsOf } from '../progs.js';
import { analyze, undress, topLayer, LAYERS, motions, motionProfile, MOTIONS, bassLine, triadOfChord, plr, plrPath, PLR_SAY, replacements, applyReplacement, WAYS_TO_PLAY, wayPlan, triadPcs, parseTriad } from '../lenses.js';
import { MOVES, MOVE_BY_ID, MOVE_GROUPS, applyMove, movesFor, demoOf } from '../moves.js';
import { RECIPES, runRecipe } from '../recipes.js';
import { CELLS, CELL_BY_ID, cellsInSteps, collect, review as reviewCell, dueCells, cellStage, songCells } from '../cells.js';
import * as G from '../prgames.js';
import { tonnetzSvg } from '../tonnetz.js';
import { allSongs } from '../reviewbar.js';
import { analyzePass, chordToneShare, thirdOnChanges, challengeLine, thirdPc } from '../feedback.js';

const CHALLENGES = [['', 'brak'], ['ct', 'Tylko dźwięki akordu'], ['third', 'Tercja na każdej zmianie']];

export const id = 'progresje';
const TABS = [['biblioteka', 'Biblioteka'], ['warsztat', 'Warsztat'], ['ruchy', 'Ruchy'], ['przepisy', 'Przepisy'], ['trening', 'Trening'], ['album', 'Album']];
const LENSES = [['szkielet', 'Szkielet'], ['bas', 'Bas'], ['siatka', 'Siatka'], ['graj', 'Jak zagrać']];
const ROLE_LIST = [['sluchaj', 'Posłuchaj: gram wszystko'], ['akordy', 'Ty: akordy (gram bas i perkusję)'], ['wszystko', 'Ty: bas i akordy (gram rytm)'], ['solo', 'Ty: śpiew albo solo']];
const COLORS = [['triads', 'Jak napisane'], ['sevenths', 'Septymy'], ['ninths', 'Nony'], ['auto', 'Jak w stylu']];
const ROLE_TONE = { 1: 'var(--role-1)', 3: 'var(--role-3)', 5: 'var(--role-5)', 7: 'var(--role-7)', 6: 'var(--role-7)', 9: 'var(--role-t)', 2: 'var(--role-t)', 4: 'var(--role-t)', 11: 'var(--role-t)', 13: 'var(--role-t)' };
const mod12 = (x) => ((x % 12) + 12) % 12;
const isChord = (s) => s && s.k === 'chord' && !s.skip;
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

export function mount(stage, ctx) {
  const st = store.mode(id);
  st.tab = TABS.some(([t]) => t === st.tab) ? st.tab : 'warsztat';
  st.lens = LENSES.some(([l]) => l === st.lens) ? st.lens : 'szkielet';
  st.way = st.way || 'bas';
  st.guideWay = WAYS[st.guideWay] ? st.guideWay : 'wait';
  st.color = st.color || 'triads';
  st.role = st.role || 'sluchaj';
  st.cur = st.cur && (BY_ID[st.cur.id] || (st.cur.mine && (st.mine || []).some((m) => m.id === st.cur.id))) ? st.cur : { id: 'hymn', work: null };
  st.mine = st.mine || [];
  st.album = st.album || {};
  st.games = st.games || {};
  st.pedal = st.pedal || {};
  st.lib = st.lib || { fam: null, mode: null, tier: 8, text: '' };
  M.bind(store.data);

  let alive = true;
  let key = getKey();
  let sel = null;            // selected chord step index (Warsztat)
  let undo = [], redo = [];
  let held = new Set();
  let heldTimer = null;
  let liveTriad = null;      // what you hold, on the grid
  let heldName = null;
  let nowK = -1;             // chord index the band plays now
  let recipeView = null;     // {id, stage}
  let openMove = null;
  let game = null;           // the running game
  let diceWhy = (ctx.preset && ctx.preset.why) || null;   // the dice says why it picked this
  const pc = createPedalCoach();

  // --- presets (from the Koło, Piosenki, Jam, the dice and reviews) --------------------------------------------
  const pre = ctx.preset || {};
  if (pre.key) {
    const k = ALL_KEYS.find((x) => x.li === pre.key.li && x.acc === pre.key.acc && x.mode === pre.key.mode) || keyByTonic(makeKey(LETTERS[pre.key.li], pre.key.acc, pre.key.mode).tonicPc, pre.key.mode);
    if (k) { key = k; setKey(k); }
  }
  if (pre.prog) { const p = progFor(pre.prog); if (p) { st.cur = { id: p.id, work: null }; st.tab = 'warsztat'; } }
  if (pre.steps && pre.steps.length) {   // from Jam's editor or a song: a progression of your own
    const own = { id: `own-${Date.now().toString(36)}`, name: pre.title || 'Twoja progresja', mode: key.mode, steps: withBars(pre.steps.map(normStep).filter(Boolean)), at: Date.now(), from: pre.from || 'jam' };
    st.mine = [own, ...st.mine].slice(0, 40);
    st.cur = { id: own.id, mine: true, work: null };
    st.tab = 'warsztat';
    if (pre.lens) st.lens = pre.lens;
  }
  if (pre.tab && TABS.some(([t]) => t === pre.tab)) st.tab = pre.tab;
  if (pre.lens && LENSES.some(([l]) => l === pre.lens)) st.lens = pre.lens;
  if (pre.way && WAYS[pre.way]) st.guideWay = pre.way;
  if (pre.cell && CELL_BY_ID[pre.cell]) st.tab = 'album';
  store.save();

  // --- the progression in the hand ----------------------------------------------------------------------------------
  function prog() {
    if (st.cur.mine) {
      const m = st.mine.find((x) => x.id === st.cur.id);
      if (m) return { id: m.id, name: m.name, mode: m.mode, steps: m.steps, why: 'Twoja progresja. Zobacz w soczewkach, z czego jest zrobiona.', mood: 'twoja', songs: [], fam: 'pop', tier: 1, groove: 'pop', tempo: 88, mine: true };
    }
    return BY_ID[st.cur.id] || BY_ID.hymn;
  }
  const steps = () => withBars(st.cur.work || prog().steps);
  const fixKey = () => { const k = keyFor(prog(), key); if (k !== key) { key = k; setKey(k); } };
  fixKey();
  const grooveId = () => st.groove && GROOVE[st.groove] ? st.groove : prog().groove || 'pop';
  const tempo = () => st.tempo || prog().tempo || 88;
  function setWork(next, say = null) {
    undo.push(st.cur.work ? st.cur.work : null);
    if (undo.length > 40) undo.shift();
    redo = [];
    st.cur.work = next;
    sel = null;
    store.save();
    if (say) toast(say);
    render();
  }
  function open(idOrMine, { mine = false, tab = 'warsztat' } = {}) {
    stopAll();
    diceWhy = null;
    st.cur = { id: idOrMine, mine, work: null };
    undo = []; redo = []; sel = null;
    st.tab = tab;
    fixKey();
    store.save();
    render();
  }

  // --- sound: one chord, two chords, the band ------------------------------------------------------------------------
  function chordEvents(c, voicing, bass, t, dur, vel = 64) {
    const ev = [];
    for (const n of [bass, ...voicing].filter((x) => x != null)) { ev.push({ t, m: [0x90, n, vel] }, { t: t + dur, m: [0x80, n, 0] }); }
    return ev;
  }
  function playChords(list, dur = 0.9) {
    const ev = [];
    list.forEach((x, k) => ev.push(...chordEvents(x.chord, x.voicing, x.bass, k * dur, dur * 0.95)));
    if (ev.length) playEvents(ev, { lead: 0.15 }).catch(() => toast('Serwer Trenera nie odpowiada.'));
  }
  function previewSteps(list, k0 = 0, n = 99) {
    const ch = stepChords(key, list, { color: st.color === 'auto' ? 'triads' : st.color }).filter((x) => !x.rest);
    playChords(ch.slice(k0, k0 + n));
  }

  const band = { running: false, token: 0, timers: [], bars: 0, laps: 0, source: null, groove: null, tempo: null };
  async function bandStart({ source = () => steps(), laps = 0, role = st.role, k = () => key, onChord = null, groove = null, bpm = null } = {}) {
    bandStop(true);
    band.running = true;
    const token = ++band.token;
    band.bars = 0; band.laps = laps; band.source = source; band.groove = groove; band.tempo = bpm;
    const g = band.groove || grooveId();
    const ci = countIn(g, band.tempo || tempo(), true);
    let t0;
    try { t0 = await playEvents(ci.events, { lead: 0.4 }); } catch { band.running = false; toast('Serwer Trenera nie odpowiada.'); renderDock(); return; }
    if (token !== band.token) return;
    renderDock();
    schedule(t0 + ci.seconds, null, 0, token, role, k, onChord);
  }
  async function schedule(at, prevVoicing, lap, token, role, k, onChord) {
    if (!band.running || token !== band.token || !alive) return;
    const list = band.source();
    const key0 = k();
    const cyc = jamCycle({ key: key0, prog: { steps: list }, groove: band.groove || grooveId(), tempo: band.tempo || tempo(), band: true, keysOwn: true, role, drummer: 2,
      color: st.color, prevVoicing, fill: (lap + 1) % 4 === 0, crash: lap > 0 && lap % 4 === 0, barOffset: band.bars });
    try {
      for (const part of chunkEvents(cyc.events)) await playEvents(part.events, { at: at + part.offset });
    } catch { toast('Serwer Trenera nie odpowiada.'); bandStop(); return; }
    if (token !== band.token) return;
    cyc.chords.forEach((c, j) => band.timers.push(bus.at(at + c.start, () => { if (token !== band.token) return; nowK = j; if (onChord) onChord(j, c); else markNow(); })));
    band.bars += cyc.bars;
    const last = lap + 1 >= band.laps && band.laps > 0;
    if (last) { band.timers.push(bus.at(at + cyc.seconds, () => { if (token === band.token) bandStop(true); })); return; }
    const lead = Math.min(1.5, cyc.seconds * 0.5);
    band.timers.push(bus.at(at + cyc.seconds - lead, () => schedule(at + cyc.seconds, cyc.chords[cyc.chords.length - 1].voicing, lap + 1, token, role, k, onChord)));
  }
  function bandStop(quiet = false) {
    const was = band.running;
    band.running = false;
    band.token++;
    for (const t of band.timers) t();
    band.timers = [];
    nowK = -1;
    if (was) bus.stop();
    if (!quiet || was) { markNow(); renderDock(); }
  }
  function stopAll() { guide.stop(); bandStop(true); stopGameSound(); }

  // --- "Graj ze mną" (Guide) ------------------------------------------------------------------------------------------
  const gstrip = el('div', { class: 'gstrip' });
  const statusLine = el('div', { class: 'kstatus' });
  const setStatus = (t, kind = '') => fill(statusLine, el('span', { class: `ks ${kind}` }, t));
  const kid = (k = key) => `${k.mode}${wheelIndex(k)}`;
  let item = null;
  const progBox = el('div', { class: 'mastery' });
  const fbBox = el('div', { class: 'p2-fb', 'aria-live': 'polite' });
  // informacja po próbie (moved here from the Koło's Progresje card): timing, evenness, bass, and the challenge
  function showFeedback(fb) {
    if (!alive) return;
    const a = analyzePass({ hits: fb.hits, steps: fb.steps });
    const chal = st.chal === 'ct' ? challengeLine('ct', chordToneShare(fb.log, fb.steps)) : st.chal === 'third' ? challengeLine('third', thirdOnChanges(fb.log, fb.steps, fb)) : '';
    fill(fbBox, el('span', { class: 'fb-head' }, `Po przejściu · ${fb.tempo} BPM`), a.lines.map((l) => el('p', {}, l)), chal ? el('p', { class: 'fb-chal' }, chal) : null);
  }
  const guide = new Guide({
    keyboard: ctx.keyboard, strip: gstrip, onStatus: setStatus,
    onDone: ({ way, done, total }) => { if (way === 'show') setStatus('Teraz ty: „Graj ze mną”.'); else setStatus(done === total ? `Całość zagrana. ${done} z ${total}.` : `Zagrane ${done} z ${total}.`, done === total ? 'good' : ''); },
    onRun: () => renderDock(),
    onPass: (res) => countPass(res),
    baseMarks: () => [],
    onFeedback: (fb) => showFeedback(fb),
  });
  const reviews = reviewBar({ itemId: () => (item ? item.id : null), go: (v, x) => ctx.go && ctx.go(v, x), rerender: () => render(), way: () => st.guideWay });
  function countPass(res) {
    if (!item) return null;
    const r = M.recordPass(item.id, { ...res, day: store.today() });
    store.save();
    if (r.events.length) toast(r.events.join(' '), r.after.stage > r.before.stage ? 'good' : '');
    reviews.note(item.id, r.review);
    renderProgress();
    return r.after.fade;
  }
  function renderProgress() {
    if (!item) { fill(progBox); return; }
    const r = M.get(item.id);
    fill(progBox, el('span', { class: `mdots s${r.stage}` }, el('i'), el('i'), el('i')),
      el('span', { class: 'm-text' }, el('b', {}, M.STAGE_NAMES[r.stage]), r.best ? ` · najlepsze czyste tempo ${r.best}` : ''),
      el('span', { class: 'm-tip' }, r.stage === 0 ? 'Zacznij od „Prowadzę”.' : r.stage < 3 ? 'Graj „W tempie”, aż światła zgasną.' : 'Umiesz. Spróbuj w innej tonacji albo innym sposobem.'));
  }
  function loadGuide() {
    const plan = wayPlan(key, steps(), st.way, { color: st.color === 'auto' ? 'triads' : st.color });
    let prevName = null;
    const gsteps = plan.map((x) => {
      const notes = [...x.lh, ...x.rh];
      const fn = fnOf(key, x.chord);
      const marks = notes.map((n) => {
        const i = x.chord.tones.findIndex((t) => t.pc === mod12(n));
        const role = i >= 0 ? x.chord.roles[i] : '';
        return { note: n, text: i >= 0 ? x.chord.tones[i].name : '', sub: role, tone: ROLE_TONE[role] || 'var(--mode)', fn: role === '1' ? fnColor(fn) : undefined };
      });
      const step = { notes, marks, label: x.chord.number, sub: x.chord.name, small: x.chord.tones.map((t) => t.name).join(' '), beats: Math.max(1, Math.round((x.bars || 1) * 4)), vel: 58, fn, change: x.chord.name !== prevName, ct: x.chord.tones.map((t) => t.pc), third: thirdPc(x.chord) };
      prevName = x.chord.name;
      return step;
    });
    item = { id: `${kid()}|prog|${st.cur.mine ? 'mine' : prog().theoryId || prog().id}` };
    guide.fade = 0;
    guide.load(gsteps);
    renderProgress();
  }

  // --- skeleton of the page ---------------------------------------------------------------------------------------------
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const head = el('div', { class: 'pr-head' });
  const body = el('div', { class: 'pr-body' });
  add(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Progresje'),
      el('p', { class: 'mode-sub' }, 'Jak akordy idą po sobie i dlaczego. Słuchasz, widzisz, zmieniasz i grasz z zespołem.'))),
    tabs, head, body);

  function renderTabs() {
    fill(tabs, TABS.map(([t, label]) => el('button', { class: `tab ${st.tab === t ? 'on' : ''}`, role: 'tab', 'aria-selected': String(st.tab === t), onclick: () => { stopAll(); st.tab = t; recipeView = null; game = null; store.save(); render(); } },
      label, t === 'album' && dueCells(st.album, store.today()).length ? el('span', { class: 'pr-badge' }, String(dueCells(st.album, store.today()).length)) : null)));
  }

  // --- the strip (pasek progresji) ---------------------------------------------------------------------------------------
  /** Chips and arrows for steps. opts: { selected, onPick, small, motionsOn, now, keyOf } */
  function strip(list, { selected = null, onPick = null, small = false, motionsOn = true, now = -1, hold = null, k0 = key, cls = '' } = {}) {
    const raw = list.map(normStep);
    const ch = stepChords(k0, raw, { color: st.color === 'auto' ? 'triads' : st.color });
    const idx = raw.map((s, i) => (s && !s.skip && (s.k === 'chord' || s.k === 'rest') ? i : -1)).filter((i) => i >= 0);
    const mv = motionsOn ? motions(k0, raw) : [];
    const kids = [];
    ch.forEach((x, j) => {
      for (const lb of x.labels || []) kids.push(el('span', { class: `pr-mark ${lb.k}` }, lb.label));
      if (x.rest) { kids.push(el('span', { class: 'pr-chip rest' }, el('b', {}, '—'), el('small', {}, 'pauza'))); return; }
      const fn = fnOf(x.key, x.chord);
      const i = idx[j];
      const chip = el('button', {
        class: `pr-chip ${fnClass(fn)} ${i === selected ? 'sel' : ''} ${j === now ? 'now' : ''} ${hold && hold === x.chord.name ? 'held' : ''}`,
        style: { '--w': String(Math.min(3, Math.max(0.6, x.bars || 1))) },
        title: `${x.chord.name}: ${x.chord.tones.map((t) => t.name).join(' ')}`,
        onclick: () => { playChords([x], 1.1); if (onPick) onPick(i, j); },
      }, el('b', {}, x.chord.number), el('span', {}, x.chord.name), (x.bars || 1) !== 1 ? el('small', { class: 'pr-len' }, `${x.bars} t.`) : null);
      kids.push(chip);
      const m = mv.find((z) => z.k === j);
      if (m && (j < ch.length - 1 || motionsOn === 'loop')) {
        kids.push(el('button', { class: `pr-arrow bm-${m.kind}`, title: `${MOTIONS[m.kind].name}: ${MOTIONS[m.kind].say}`, onclick: () => playChords([x, ch[j + 1] || ch[0]], 0.8) },
          el('i', { 'aria-hidden': 'true' }, '→'), small ? null : el('small', {}, MOTIONS[m.kind].name)));
      }
    });
    if (mv.length && motionsOn && ch.length > 1) {
      const m = mv[mv.length - 1];
      kids.push(el('span', { class: `pr-loop bm-${m.kind}`, title: `z powrotem do początku: ${MOTIONS[m.kind].name}` }, '↻'));
    }
    return el('div', { class: `pr-strip ${small ? 'small' : ''} ${cls}` }, kids);
  }
  function markNow() {
    for (const s of stage.querySelectorAll('.pr-strip.live')) {
      const chips = [...s.querySelectorAll('.pr-chip:not(.rest)')];
      chips.forEach((c, j) => c.classList.toggle('now', j === nowK));
    }
  }

  // --- the play bar ---------------------------------------------------------------------------------------------------
  let recipeNow = null;     // {steps, key, groove, tempo} of the recipe stage on screen (the band plays it in Przepisy)
  function bandButton(label = 'Zespół') {
    const go = () => (st.tab === 'przepisy' && recipeView && recipeNow
      ? bandStart({ source: () => recipeNow.steps, k: () => recipeNow.key, groove: st.groove || recipeNow.groove, bpm: st.tempo || recipeNow.tempo })
      : bandStart({}));
    return el('button', { class: `btn primary ${band.running ? 'stop' : ''}`, onclick: () => { if (band.running) bandStop(); else { guide.stop(); go(); } } }, band.running ? '■ Stop' : `▶ ${label}`);
  }
  function tempoField() {
    const f = el('label', { class: 'field inline tempo-field' }, el('span', {}, 'Tempo'),
      el('input', { type: 'range', min: '40', max: '180', step: '2', value: String(tempo()), oninput: (e) => { st.tempo = Number(e.target.value); f.querySelector('b').textContent = String(st.tempo); store.save(); } }),
      el('b', {}, String(tempo())));
    return f;
  }
  function renderDock() {
    if (!alive) return;
    if (st.tab === 'trening' && game) return gameDock();
    if (st.tab === 'warsztat' && st.lens === 'graj') {
      const show = el('button', { class: 'btn', onclick: () => { if (guide.running && guide.way === 'show') { guide.stop(); bus.stop(); } else { bandStop(true); guide.show(tempo()); } } }, guide.running && guide.way === 'show' ? '■ Stop' : 'Pokaż');
      const play = el('button', { class: 'btn primary', onclick: () => { if (guide.running && guide.way !== 'show') { guide.stop(); bus.stop(); } else { bandStop(true); guide.start(st.guideWay, { tempo: tempo() }); } } }, guide.running && guide.way !== 'show' ? '■ Stop' : 'Graj ze mną');
      const ways = el('div', { class: 'seg-ctl', role: 'radiogroup', 'aria-label': 'Jak grać' }, Object.entries(WAYS).map(([w, info]) => el('button', { class: st.guideWay === w ? 'on' : '', role: 'radio', 'aria-checked': String(st.guideWay === w), title: info.help, onclick: () => { st.guideWay = w; store.save(); guide.stop(); renderDock(); } }, info.name)));
      ctx.dock(el('div', { class: 'play-row' }, show, play, loopButton(), ways, bandButton(), tempoField()));
      return;
    }
    if (['warsztat', 'biblioteka', 'ruchy', 'przepisy'].includes(st.tab)) {
      ctx.dock(el('div', { class: 'play-row' }, bandButton(st.tab === 'przepisy' ? 'Ten etap z zespołem' : st.tab === 'ruchy' ? 'Moja progresja' : 'Zespół'),
        el('label', { class: 'field inline' }, el('span', {}, 'Styl'), styleSelect()), tempoField()));
      return;
    }
    ctx.dock(null);
  }
  function styleSelect() {
    return el('select', { class: 'pr-style', 'aria-label': 'Styl zespołu', onchange: (e) => { st.groove = e.target.value === 'auto' ? null : e.target.value; st.tempo = null; store.save(); renderDock(); } },
      el('option', { value: 'auto', selected: !st.groove }, `Jak pasuje (${GROOVE[prog().groove] ? GROOVE[prog().groove].name : 'pop'})`),
      GROOVE_GROUPS.map(([n, ids]) => el('optgroup', { label: n }, ids.filter((g) => GROOVE[g]).map((g) => el('option', { value: g, selected: st.groove === g }, GROOVE[g].name)))));
  }

  // --- render ---------------------------------------------------------------------------------------------------------
  function render() {
    if (!alive) return;
    renderTabs();
    try {
      if (st.tab === 'biblioteka') renderLibrary();
      else if (st.tab === 'warsztat') renderWorkshop();
      else if (st.tab === 'ruchy') renderMoves();
      else if (st.tab === 'przepisy') renderRecipes();
      else if (st.tab === 'trening') renderTraining();
      else renderAlbum();
    } catch (err) {
      console.error(err);
      fill(head);
      fill(body, el('div', { class: 'panel' }, el('h2', {}, 'Ta karta się nie wyświetliła'), el('p', {}, String(err && err.message ? err.message : err)),
        el('button', { class: 'btn primary', onclick: () => { st.cur = { id: 'hymn', work: null }; st.tab = 'warsztat'; store.save(); render(); } }, 'Wróć do pop-hymnu')));
    }
    renderDock();
  }

  // --- the key picker (same mode as the progression) ----------------------------------------------------------------
  function keySelect(onPick = null) {
    const mode = prog().mode;
    const list = ALL_KEYS.filter((k) => k.mode === mode);
    return el('label', { class: 'field inline' }, el('span', {}, 'Tonacja'),
      el('select', { class: 'pr-key', onchange: (e) => { const k = list[Number(e.target.value)]; key = k; setKey(k); stopAll(); if (onPick) onPick(k); else render(); } },
        list.map((k, i) => el('option', { value: String(i), selected: keyName(k) === keyName(key) }, keyName(k, true)))));
  }
  const numbersOf = (list, k0 = key) => stepChords(k0, list, { color: 'triads' }).filter((x) => !x.rest).map((x) => el('b', { class: fnClass(fnOf(x.key, x.chord)) }, x.chord.number));

  // ==================================================================================================================
  // Biblioteka
  function renderLibrary() {
    fill(head);
    const L = st.lib;
    const list = filterCatalog({ fam: L.fam, mode: L.mode, maxTier: L.tier || 8, text: L.text || '' });
    const mineList = st.mine.slice(0, 12);
    const famBar = el('div', { class: 'chips-row pr-fams' },
      el('button', { class: `pick ${!L.fam ? 'on' : ''}`, onclick: () => { L.fam = null; store.save(); renderLibrary(); } }, 'Wszystkie'),
      FAMILIES.map((f) => el('button', { class: `pick ${L.fam === f ? 'on' : ''}`, title: FAMILY_INFO[f].about, onclick: () => { L.fam = f; store.save(); renderLibrary(); } }, FAMILY_INFO[f].name)));
    const search = el('input', { type: 'search', class: 'pr-search', placeholder: 'Szukaj: nazwa, nastrój, piosenka', value: L.text || '', oninput: (e) => { L.text = e.target.value; store.save(); clearTimeout(search.t); search.t = setTimeout(() => { renderLibrary(); const s = body.querySelector('.pr-search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250); } });
    const filters = el('div', { class: 'chips-row' },
      el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Dur albo moll' }, [[null, 'Dur i moll'], ['major', 'Dur'], ['minor', 'Moll']].map(([v, t]) => el('button', { class: L.mode === v ? 'on' : '', onclick: () => { L.mode = v; store.save(); renderLibrary(); } }, t))),
      el('label', { class: 'field inline' }, el('span', {}, 'Poziom do'), el('select', { onchange: (e) => { L.tier = Number(e.target.value); store.save(); renderLibrary(); } },
        [1, 2, 3, 4, 5, 6, 7, 8].map((t) => el('option', { value: String(t), selected: (L.tier || 8) === t }, String(t))))),
      search);
    const famAbout = L.fam ? el('p', { class: 'muted' }, FAMILY_INFO[L.fam].about) : null;
    const card = (p) => {
      const k0 = keyFor(p, key);
      const m = M.get(`${kid(k0)}|prog|${p.theoryId || p.id}`);
      const gym = p.bankId && (store.mode('akordy').realSeen || {})[p.bankId];
      return el('div', { class: `pr-card ${p.id === st.cur.id && !st.cur.mine ? 'on' : ''}`, 'data-id': p.id },
        el('div', { class: 'pr-card-top' }, el('b', {}, p.name), el('span', { class: 'pr-tier', title: 'poziom' }, `poz. ${p.tier}`)),
        el('div', { class: 'num-chips' }, numbersOf(p.steps, k0)),
        el('p', { class: 'pr-mood' }, p.mood),
        p.songs.length ? el('p', { class: 'pr-songs' }, p.songs.slice(0, 2).join(' · ')) : null,
        el('div', { class: 'pr-card-foot' },
          m.stage ? el('span', { class: `mdots s${m.stage}`, title: M.STAGE_NAMES[m.stage] }, el('i'), el('i'), el('i')) : null,
          gym ? el('span', { class: 'pr-gym', title: 'Grana w Siłowni akordów' }, 'Siłownia') : null,
          el('button', { class: 'btn tiny', onclick: () => bandStart({ laps: 1, role: 'sluchaj', source: () => withBars(p.steps), k: () => k0, groove: p.groove, bpm: p.tempo }) }, '▶ Posłuchaj'),
          el('button', { class: 'btn tiny primary', onclick: () => open(p.id) }, 'Otwórz')));
    };
    fill(body,
      famBar, famAbout, filters,
      mineList.length && !L.fam && !L.text ? el('div', { class: 'pr-section' }, el('h3', {}, 'Twoje'), el('div', { class: 'pr-grid' }, mineList.map((m) => el('div', { class: 'pr-card mine' },
        el('div', { class: 'pr-card-top' }, el('b', {}, m.name), el('button', { class: 'btn tiny ghost', title: 'Usuń z twoich', onclick: () => { st.mine = st.mine.filter((x) => x.id !== m.id); if (st.cur.id === m.id) st.cur = { id: 'hymn', work: null }; store.save(); renderLibrary(); } }, '×')),
        el('div', { class: 'num-chips' }, numbersOf(m.steps, keyFor({ mode: m.mode }, key))),
        el('div', { class: 'pr-card-foot' }, el('button', { class: 'btn tiny primary', onclick: () => open(m.id, { mine: true }) }, 'Otwórz')))))) : null,
      el('p', { class: 'muted' }, `${list.length} ${plural(list.length, 'progresja', 'progresje', 'progresji')}. Numery w kolorach funkcji: niebieskie dom, żółte wyjście, różowe napięcie, szare spoza tonacji.`),
      el('div', { class: 'pr-grid' }, list.map(card)));
  }

  // ==================================================================================================================
  // Warsztat
  function renderWorkshop() {
    const p = prog();
    const list = steps();
    const k0 = key;
    const changed = !!st.cur.work;
    const kids = (p.songs || []).length ? el('p', { class: 'pr-songs' }, 'Usłyszysz w: ', p.songs.join(' · ')) : null;
    fill(head,
      el('div', { class: 'kcard-head pr-whead' },
        el('div', {},
          el('h2', {}, `${p.name}${changed ? ' (zmieniona)' : ''} w ${keyName(k0, true)}`),
          el('p', { class: 'muted' }, `${p.mood}. ${barsOf(list)} ${plural(barsOf(list), 'takt', 'takty', 'taktów')}.`), kids),
        el('div', { class: 'chips-row' }, keySelect(),
          el('button', { class: 'btn small', disabled: !undo.length, onclick: () => { redo.push(st.cur.work); st.cur.work = undo.pop(); store.save(); render(); } }, 'Cofnij'),
          el('button', { class: 'btn small', disabled: !redo.length, onclick: () => { undo.push(st.cur.work); st.cur.work = redo.pop(); store.save(); render(); } }, 'Ponów'),
          changed ? el('button', { class: 'btn small', onclick: () => setWork(null, 'Oryginał.') }, 'Oryginał') : null)),
      diceWhy ? el('p', { class: 'p2-why' }, diceWhy) : null,
      reviews.banner(),
      strip(list, { selected: sel, onPick: (i) => { sel = sel === i ? null : i; renderWorkshop(); renderDock(); }, cls: 'live big' }),
      el('div', { class: 'seg-ctl pr-lenses', role: 'tablist', 'aria-label': 'Soczewki' }, LENSES.map(([l, t]) => el('button', { class: st.lens === l ? 'on' : '', role: 'tab', 'aria-selected': String(st.lens === l), onclick: () => { stopAll(); st.lens = l; store.save(); renderWorkshop(); renderDock(); } }, t))));
    const lens = st.lens === 'bas' ? lensBass(list) : st.lens === 'siatka' ? lensGrid(list) : st.lens === 'graj' ? lensPlay(list) : lensSkeleton(list);
    fill(body,
      sel != null && isChord(list[sel]) ? chordCard(list, sel) : null,
      lens,
      bandPanel(),
      el('details', { class: 'why', open: st.whyOpen !== false, ontoggle: (e) => { st.whyOpen = e.target.open; store.save(); } }, el('summary', {}, 'Dlaczego tak brzmi?'), el('p', {}, p.why)),
      cellsHere(list),
      doors(p, list));
    markNow();
  }

  function pedalLine() {
    const ped = st.pedal[prog().id] || { good: 0, blur: 0, early: 0 };
    const pn = ped.good + ped.blur + ped.early;
    return el('p', { class: 'pr-pedal' }, pn ? ['Pedał w tej progresji: ', el('b', { class: 'good' }, `${ped.good} dobrze`), ', ', el('b', { class: 'bad' }, `${ped.blur} rozmyte`), ', ', el('b', {}, `${ped.early} za wcześnie`), ` (${Math.round((ped.good / pn) * 100)}% trafień).`]
      : 'Graj z zespołem z pedałem. Puść go zaraz po nowym akordzie i od razu wciśnij znowu. Policzę każdą zmianę.');
  }
  function bandPanel() {
    return el('div', { class: 'panel pr-band' },
      el('div', { class: 'chips-row' },
        el('label', { class: 'field inline' }, el('span', {}, 'Kto gra'), el('select', { class: 'pr-role', onchange: (e) => { st.role = e.target.value; store.save(); if (band.running) bandStart({}); } }, ROLE_LIST.map(([v, t]) => el('option', { value: v, selected: st.role === v }, t)))),
        el('label', { class: 'field inline' }, el('span', {}, 'Barwa'), el('select', { class: 'pr-color', onchange: (e) => { st.color = e.target.value; store.save(); render(); } }, COLORS.map(([v, t]) => el('option', { value: v, selected: st.color === v }, t)))),
        el('label', { class: 'field inline', title: 'Liczę, czy zmieniasz pedał zaraz po każdej zmianie akordu. Osobno dla tej progresji.' },
          el('input', { type: 'checkbox', checked: !!st.pedalOn, onchange: (e) => { st.pedalOn = e.target.checked; store.save(); renderWorkshop(); } }), el('span', {}, 'Pedał na zmianę'))),
      st.pedalOn ? pedalLine() : null,
      el('p', { class: 'muted pr-band-say' }, band.running ? 'Zmiany w progresji słychać od następnego okrążenia.' : 'Start na pasku na dole (albo C56). Możesz zmieniać akordy w trakcie: zespół zagra nową wersję od następnego okrążenia.'));
  }

  // --- lens: skeleton --------------------------------------------------------------------------------------------
  function lensSkeleton(list) {
    const top = topLayer(key, list);
    const layer = st.layer == null || st.layer > top ? top : st.layer;
    const shown = layer >= top ? list : undress(key, list, layer);
    const info = analyze(key, list);
    const kinds = new Map();
    for (const x of info) kinds.set(x.layer, (kinds.get(x.layer) || 0) + 1);
    const suggestions = movesFor(list, key).filter((m) => m.level <= 4).slice(0, 8);
    return el('div', { class: 'pr-lens' },
      el('h3', {}, 'Szkielet i ubrania'),
      el('p', { class: 'muted' }, 'Każda progresja to szkielet (1, 4, 5) w ubraniach. Przesuń suwak w lewo, żeby je zdejmować, i posłuchaj, co zostaje.'),
      el('div', { class: 'pr-layers' },
        LAYERS.map((L) => el('button', { class: `pr-layer ${L.n === layer ? 'on' : ''} ${L.n > top ? 'empty' : ''}`, disabled: L.n > top, title: L.say,
          onclick: () => { st.layer = L.n; store.save(); renderWorkshop(); } }, el('b', {}, `${L.n}. ${L.name}`), el('small', {}, kinds.get(L.n) ? `${kinds.get(L.n)} ${plural(kinds.get(L.n), 'akord', 'akordy', 'akordów')}` : '—')))),
      layer < top ? el('div', {}, el('p', { class: 'pr-say' }, `Tak brzmi bez warstw powyżej „${LAYERS[layer].name}”:`), strip(shown, { small: true }),
        el('div', { class: 'chips-row' }, el('button', { class: 'btn small', onclick: () => previewSteps(shown) }, '▶ Bez ubrań'), el('button', { class: 'btn small', onclick: () => previewSteps(list) }, '▶ W ubraniach'),
          el('button', { class: 'btn small', onclick: () => setWork(shown, 'Wziąłem wersję bez ubrań.') }, 'Weź tę wersję'))) : null,
      el('ol', { class: 'pr-why-list' }, info.map((x) => {
        const c = stepChord(key, list[x.i], { color: 'triads' });
        return el('li', { class: fnClass(x.fn) }, el('b', {}, c.number), ` ${c.name}: `, x.why, el('small', { class: 'pr-lay' }, ` (warstwa ${x.layer})`));
      })),
      suggestions.length ? el('div', { class: 'pr-dress' }, el('h3', {}, 'Ubierz ją'), el('p', { class: 'muted' }, 'Ruchy, które pasują do tej progresji. Klik = zastosuj (Cofnij zawsze działa). ▶ = posłuchaj przed i po.'),
        el('div', { class: 'pr-move-chips' }, suggestions.map((m) => {
          const after = applyMove(m.id, list, key);
          return el('div', { class: 'pr-move-chip' },
            el('button', { class: 'pick', title: m.say, onclick: () => after && setWork(after, `${m.name}.`) }, m.name),
            el('button', { class: 'btn tiny ghost', title: 'Przed, potem po', onclick: () => after && playBeforeAfter(list, after) }, '▶'));
        }))) : null);
  }
  function playBeforeAfter(before, after) {
    const a = stepChords(key, before, { color: 'triads' }).filter((x) => !x.rest);
    const b = stepChords(key, after, { color: 'triads' }).filter((x) => !x.rest);
    const dur = 0.7;
    const ev = [];
    let t = 0;
    for (const x of a) { ev.push(...chordEvents(x.chord, x.voicing, x.bass, t, dur * (x.bars || 1) * 0.95)); t += dur * (x.bars || 1); }
    t += 0.8;
    for (const x of b) { ev.push(...chordEvents(x.chord, x.voicing, x.bass, t, dur * (x.bars || 1) * 0.95, 70)); t += dur * (x.bars || 1); }
    playEvents(ev, { lead: 0.15 }).catch(() => toast('Serwer Trenera nie odpowiada.'));
  }

  // --- lens: bass ------------------------------------------------------------------------------------------------
  function lensBass(list) {
    const mv = motions(key, list);
    const prof = motionProfile(mv);
    const line = bassLine(key, list);
    const steps0 = line.filter((x) => x.step).length;
    return el('div', { class: 'pr-lens' },
      el('h3', {}, 'Bas: jak rusza się pryma'),
      el('p', { class: 'muted' }, 'Ruch od prymy do prymy ma tylko kilka rodzajów i każdy ma swój charakter. Kolor strzałki na pasku to rodzaj ruchu.'),
      el('div', { class: 'pr-profile' }, prof.map(({ kind, count }) => el('div', { class: `pr-prof bm-${kind}` }, el('i'), el('b', {}, `${count}× ${MOTIONS[kind].name}`), el('span', {}, MOTIONS[kind].say)))),
      el('p', { class: 'pr-say' }, prof.length ? `Ta progresja to głównie ruch „${MOTIONS[prof[0].kind].name}”. ${prof[0].kind === 'mocny' ? 'Dlatego tak stanowczo ciągnie do domu.' : prof[0].kind === 'miekki' || prof[0].kind === 'wznosi' ? 'Dlatego płynie łagodnie: wspólne dźwięki zostają.' : prof[0].kind === 'krok' ? 'Dlatego brzmi rockowo i popowo: całe akordy się przesuwają.' : prof[0].kind === 'filmowy' ? 'Dlatego brzmi filmowo i obco.' : prof[0].kind === 'wstecz' ? 'Dlatego brzmi luźno, „amen”: bez mocnego ciągu do domu.' : ''}` : ''),
      el('h3', {}, 'Linia basu (lewa ręka)'),
      el('div', { class: 'pr-bassline' }, line.map((x, j) => el('span', { class: `pr-bnote ${x.step ? 'step' : ''}`, title: x.step ? 'krokiem' : j ? 'skok' : 'start' }, x.name))),
      el('p', { class: 'muted' }, steps0 >= line.length - 1 ? 'Bas idzie krokiem: śpiewa własną melodię.' : `Bas skacze ${line.length - 1 - steps0} ${plural(line.length - 1 - steps0, 'raz', 'razy', 'razy')}. Ruch „Bas krokiem” zamieni skoki w kroki przewrotami.`),
      el('div', { class: 'chips-row' },
        el('button', { class: 'btn small', onclick: () => { const a = applyMove('basKrokiem', list, key); if (a) setWork(a, 'Bas krokiem.'); } }, 'Bas krokiem'),
        el('button', { class: 'btn small', onclick: () => { const a = applyMove('pedal', list, key); if (a) setWork(a, 'Pedał w basie.'); } }, 'Pedał w basie'),
        el('button', { class: 'btn small primary', onclick: () => { st.tab = 'trening'; startGame('slyszBas', { prog: prog(), steps: list }); } }, 'Gra: Słysz bas')));
  }

  // --- lens: grid -------------------------------------------------------------------------------------------------
  function lensGrid(list) {
    const ch = stepChords(key, list, { color: 'triads' }).filter((x) => !x.rest).map((x) => x.chord);
    const path = ch.map(triadOfChord).filter(Boolean);
    const moves = [];
    for (let j = 0; j + 1 < path.length; j++) moves.push({ from: ch[j].name, to: ch[j + 1].name, p: plrPath(path[j], path[j + 1]) });
    const box = el('div', { class: 'pr-grid-box' });
    const drawGrid = () => fill(box, tonnetzSvg({ key, centerPc: key.tonicPc, path, held: liveTriad, now: nowK >= 0 ? path[nowK] : null, onPick: (t) => { const { root, kind } = parseTriad(t); const c = { tones: triadPcs(t).map((x) => ({ pc: x })), root: { pc: root } }; playChords([{ chord: c, voicing: triadPcs(t).map((x) => 60 + mod12(x - 0)).sort((a, b) => a - b), bass: 36 + root }], 1.2); } }));
    drawGrid();
    gridRedraw = drawGrid;
    return el('div', { class: 'pr-lens' },
      el('h3', {}, 'Siatka: które palce się ruszają'),
      el('p', { class: 'muted' }, 'Każdy trójkąt to akord. Sąsiedzi mają dwa wspólne dźwięki, więc przejście do sąsiada to ruch jednego palca. Linia to twoja progresja. Zagraj akord: zapali się na siatce, a jego sąsiedzi obrysem.'),
      box,
      el('div', { class: 'pr-plr' }, Object.entries(PLR_SAY).map(([k, t]) => el('span', {}, el('b', {}, k), ` ${t.slice(3)}`))),
      el('ul', { class: 'pr-steps' }, moves.map((m) => el('li', {}, `${m.from} → ${m.to}: `, m.p.length === 0 ? 'ten sam trójkąt' : m.p.length === 1 ? el('b', {}, `jeden palec (${m.p[0].move})`) : `${m.p.length} ruchy: ${m.p.map((x) => x.move).join(' + ')}`))),
      el('div', { class: 'chips-row' }, el('button', { class: 'btn small primary', onclick: () => { st.tab = 'trening'; startGame('palec'); } }, 'Gra: Jeden palec')));
  }
  let gridRedraw = null;

  // --- lens: how to play ----------------------------------------------------------------------------------------
  function lensPlay(list) {
    const way = WAYS_TO_PLAY.find((w) => w.id === st.way) || WAYS_TO_PLAY[1];
    loadGuide();
    return el('div', { class: 'pr-lens' },
      el('h3', {}, 'Jak to zagrać'),
      el('div', { class: 'chips-row' }, WAYS_TO_PLAY.map((w) => el('button', { class: `pick ${w.id === way.id ? 'on' : ''}`, title: w.say, onclick: () => { st.way = w.id; store.save(); renderWorkshop(); renderDock(); } }, w.name, el('span', { class: 'lvl-dots' }, '•'.repeat(w.level))))),
      el('div', { class: 'pr-way' }, el('p', {}, way.say), el('p', { class: 'muted' }, el('b', {}, 'Lewa: '), way.lh, ' · ', el('b', {}, 'Prawa: '), way.rh)),
      el('div', { class: 'chips-row' }, el('label', { class: 'chal-field', title: 'Bez punktów i bez limitu czasu. Wynik po każdym przejściu W tempie.' }, el('span', {}, 'Wyzwanie'),
        el('select', { onchange: (e) => { st.chal = e.target.value; store.save(); } }, CHALLENGES.map(([v, t]) => el('option', { value: v, selected: (st.chal || '') === v }, t))))),
      gstrip, progBox, fbBox, statusLine,
      el('p', { class: 'muted' }, 'Pokaż: gram, a ty patrzysz. Graj ze mną: świecę klawisze i czekam (Prowadzę), idę z klikiem (W tempie) albo bez świateł. „Umiem” liczy się osobno dla każdej tonacji.'));
  }

  // --- the chord card: Zamień / Pożycz and moves on one chord ------------------------------------------------------
  function chordCard(list, i) {
    const s = list[i];
    const c = stepChord(key, s, { color: 'triads' });
    const groups = replacements(key, s);
    const here = movesFor(list, key, i);
    const ctxPlay = (option) => {
      const tryList = applyReplacement(list, i, option);
      const idx = (arr) => arr.map((x, j) => (isChord(normStep(x)) ? j : -1)).filter((j) => j >= 0);
      const a = idx(list).indexOf(i);
      const ch = stepChords(key, tryList, { color: 'triads' }).filter((x) => !x.rest);
      playChords(ch.slice(Math.max(0, a - 1), a + 3), 0.8);
    };
    return el('div', { class: 'panel pr-chord' },
      el('div', { class: 'pr-chord-head' }, el('h3', {}, `Zamień / Pożycz: ${c.number} (${c.name})`), el('button', { class: 'btn tiny ghost', onclick: () => { sel = null; renderWorkshop(); } }, 'Zamknij')),
      el('p', { class: 'muted' }, '▶ gra akord przed, nowy i następny. Klik w nazwę zamienia (albo wstawia przed, jeśli to „Wtrąć przed nim”).'),
      el('div', { class: 'pr-repl' }, groups.map((g) => el('div', { class: 'pr-repl-g' },
        el('b', { title: g.about }, g.name),
        el('div', { class: 'pr-repl-items' }, g.items.map((o) => el('span', { class: 'pr-opt' },
          el('button', { class: `pick ${fnClass(fnOf(key, stepChord(key, o.step, { color: 'triads' })))}`, title: `${o.why}. Wspólne dźwięki: ${o.common}.`, onclick: () => setWork(applyReplacement(list, i, o), o.insert ? `Wstawione ${o.name} przed ${c.name}.` : `${c.name} → ${o.name}.`) },
            o.move ? el('i', { class: 'pr-plr-tag' }, o.move) : null, `${o.label} `, el('small', {}, o.name)),
          el('button', { class: 'btn tiny ghost', 'aria-label': `Posłuchaj ${o.name}`, onclick: () => ctxPlay(o) }, '▶'))))))),
      here.length ? el('div', { class: 'pr-repl-g' }, el('b', {}, 'Ruchy na tym akordzie'), el('div', { class: 'pr-repl-items' }, here.map((m) => el('span', { class: 'pr-opt' },
        el('button', { class: 'pick', title: m.say, onclick: () => { const a = applyMove(m.id, list, key, i); if (a) setWork(a, `${m.name}.`); } }, m.name),
        el('button', { class: 'btn tiny ghost', onclick: () => { const a = applyMove(m.id, list, key, i); if (a) playBeforeAfter(list, a); } }, '▶'))))) : null);
  }

  function cellsHere(list) {
    const found = cellsInSteps(key, list);
    if (!found.length) return null;
    return el('div', { class: 'pr-cells-here' }, el('b', {}, 'Komórki w tej progresji: '),
      found.map(({ cell }) => el('button', { class: `pick ${st.album[cell.id] ? 'on' : ''}`, title: cell.sound, onclick: () => { collect(st.album, cell.id, store.today()); store.save(); toast(`„${cell.name}” w albumie. Powtórka jutro.`, 'good'); renderWorkshop(); renderTabs(); } }, st.album[cell.id] ? '✓ ' : '+ ', cell.name)));
  }

  function doors(p, list) {
    const items = [
      ['Edytuj w Jamie', () => ctx.go && ctx.go('jam', { preset: { song: { title: p.name, key: { li: key.li, acc: key.acc, mode: key.mode }, steps: list.slice(0, 64) } } })],
      p.bankId ? ['Ćwicz palcami w Siłowni', () => ctx.go && ctx.go('akordy', {})] : null,
      ['Zapisz jako moją', () => { const name = window.prompt('Nazwa progresji', `${p.name} (moja)`); if (!name) return; const own = { id: `own-${Date.now().toString(36)}`, name, mode: key.mode, steps: list, at: Date.now(), from: 'warsztat' }; st.mine = [own, ...st.mine].slice(0, 40); st.cur = { id: own.id, mine: true, work: null }; undo = []; redo = []; store.save(); toast('Zapisane w Bibliotece, w „Twoje”.', 'good'); render(); }],
      ['Ta sama w następnej tonacji po kole', () => { const k = ALL_KEYS.filter((x) => x.mode === key.mode)[(wheelIndex(key) + 1) % 12]; key = k; setKey(k); render(); }],
      ['Gra: Co to za progresja?', () => { st.tab = 'trening'; startGame('coTo'); }],
    ];
    return el('div', { class: 'doors' }, el('span', { class: 'doors-label' }, 'Dalej'), items.filter(Boolean).map(([label, fn]) => el('button', { class: 'door', onclick: fn }, label, el('span', { 'aria-hidden': 'true' }, ' →'))));
  }

  // ==================================================================================================================
  // Ruchy
  function renderMoves() {
    fill(head, el('p', { class: 'muted' }, `${MOVES.length} sposobów, w jakie pianista ubiera progresję. Każdy z przepisem, wskazówką pod palce i przykładem przed i po. „Na mojej” stosuje ruch do progresji z Warsztatu (${prog().name}).`));
    const card = (m) => {
      const d = demoOf(m);
      const dk = ALL_KEYS.find((k) => k.mode === d.mode && k.tonicPc === (d.mode === 'minor' ? 9 : 0));
      const after = applyMove(m.id, d.steps, dk, d.at);
      const openNow = openMove === m.id;
      const mine = applyMove(m.id, steps(), key);
      return el('div', { class: `pr-move ${openNow ? 'open' : ''}`, 'data-move': m.id },
        el('button', { class: 'pr-move-head', 'aria-expanded': String(openNow), onclick: () => { openMove = openNow ? null : m.id; renderMoves(); } },
          el('b', {}, m.name), el('span', { class: 'lvl-dots', title: `poziom ${m.level}` }, '•'.repeat(m.level)), el('span', { class: 'pr-move-say' }, m.say)),
        openNow ? el('div', { class: 'pr-move-body' },
          el('p', {}, el('b', {}, 'Przepis: '), m.rule),
          el('p', {}, el('b', {}, 'Pod palcami: '), m.play),
          el('p', { class: 'muted' }, el('b', {}, 'Gdzie usłyszysz: '), m.hear),
          el('div', { class: 'pr-ba' },
            el('div', {}, el('small', {}, `Przed (${keyName(dk, true)})`), strip(d.steps, { small: true, k0: dk, motionsOn: false })),
            el('div', {}, el('small', {}, 'Po'), after ? strip(after, { small: true, k0: dk, motionsOn: false }) : el('span', { class: 'muted' }, '—'))),
          el('div', { class: 'chips-row' },
            el('button', { class: 'btn small', onclick: () => { const kk = key; key = dk; playBeforeAfter(d.steps, after); key = kk; } }, '▶ Przed i po'),
            mine ? el('button', { class: 'btn small primary', onclick: () => { st.tab = 'warsztat'; setWork(mine, `${m.name} na „${prog().name}”.`); } }, `Na mojej (${prog().name})`)
              : el('span', { class: 'muted' }, `Na „${prog().name}” ten ruch nie pasuje.`))) : null);
    };
    fill(body, MOVE_GROUPS.map((g) => el('div', { class: 'pr-section' }, el('h3', {}, g), el('div', { class: 'pr-moves' }, MOVES.filter((m) => m.group === g).map(card)))));
  }

  // ==================================================================================================================
  // Przepisy
  function renderRecipes() {
    if (!recipeView) {
      fill(head, el('p', { class: 'muted' }, 'Jak zawodowiec buduje progresję krok po kroku. Każdy krok to jeden ruch: słyszysz przed i po, widzisz, co się zmieniło, i grasz z zespołem.'));
      fill(body, el('div', { class: 'pr-grid' }, RECIPES.map((r) => el('div', { class: 'pr-card' },
        el('div', { class: 'pr-card-top' }, el('b', {}, r.name), el('span', { class: 'lvl-dots' }, '•'.repeat(r.level))),
        el('p', {}, r.idea),
        el('div', { class: 'pr-card-foot' }, el('span', { class: 'muted' }, `${r.steps.length + 1} ${plural(r.steps.length + 1, 'krok', 'kroki', 'kroków')}`), el('button', { class: 'btn tiny primary', onclick: () => { recipeView = { id: r.id, stage: 0 }; renderRecipes(); renderDock(); } }, 'Zacznij'))))));
      return;
    }
    const r = RECIPES.find((x) => x.id === recipeView.id);
    const rk = r.mode === key.mode ? key : keyFor({ mode: r.mode }, key);
    const stages = runRecipe(r, rk);
    const k = Math.min(recipeView.stage, stages.length - 1);
    const cur = stages[k];
    const prev = k ? stages[k - 1] : null;
    recipeNow = { steps: withBars(cur.steps), key: rk, groove: r.groove, tempo: r.tempo };
    if (band.running) band.source = () => recipeNow.steps;
    fill(head,
      el('div', { class: 'kcard-head' }, el('h2', {}, r.name), el('p', { class: 'muted' }, r.idea)),
      el('div', { class: 'pr-stages' }, stages.map((s, j) => el('button', { class: `pr-stage ${j === k ? 'on' : ''} ${j < k ? 'done' : ''}`, onclick: () => { recipeView.stage = j; renderRecipes(); } }, j === 0 ? 'Start' : String(j)))));
    fill(body,
      el('div', { class: 'panel pr-recipe' },
        el('h3', {}, k === 0 ? 'Start' : `Krok ${k} z ${stages.length - 1}`),
        el('p', { class: 'pr-say' }, cur.say),
        prev ? el('div', {}, el('small', { class: 'muted' }, 'Było:'), strip(prev.steps, { small: true, k0: rk, motionsOn: false })) : null,
        el('small', { class: 'muted' }, prev ? 'Jest:' : ''), strip(cur.steps, { k0: rk, cls: 'live' }),
        el('div', { class: 'chips-row' },
          el('button', { class: 'btn', disabled: k === 0, onclick: () => { recipeView.stage = k - 1; renderRecipes(); } }, '← Wstecz'),
          prev ? el('button', { class: 'btn', onclick: () => { const kk = key; key = rk; playBeforeAfter(prev.steps, cur.steps); key = kk; } }, '▶ Było i jest') : el('button', { class: 'btn', onclick: () => { const kk = key; key = rk; previewSteps(cur.steps); key = kk; } }, '▶ Posłuchaj'),
          k < stages.length - 1 ? el('button', { class: 'btn primary', onclick: () => { recipeView.stage = k + 1; renderRecipes(); } }, 'Dalej →')
            : el('button', { class: 'btn primary', onclick: () => { const own = { id: `own-${Date.now().toString(36)}`, name: r.name, mode: rk.mode, steps: withBars(cur.steps), at: Date.now(), from: 'przepis' }; st.mine = [own, ...st.mine].slice(0, 40); st.cur = { id: own.id, mine: true, work: null }; key = rk; setKey(rk); st.tab = 'warsztat'; st.groove = r.groove; st.tempo = r.tempo; recipeView = null; store.save(); render(); toast('Gotowe. Jest w Warsztacie i w „Twoje”.', 'good'); } }, 'Weź do Warsztatu'))),
      k === stages.length - 1 ? el('div', { class: 'why' }, el('p', {}, el('b', {}, 'Do śpiewu: '), r.sing)) : null,
      el('div', { class: 'doors' }, el('button', { class: 'door', onclick: () => { recipeView = null; renderRecipes(); renderDock(); } }, '← Wszystkie przepisy')));
    markNow();
  }

  // ==================================================================================================================
  // Album
  function renderAlbum() {
    const today = store.today();
    const due = dueCells(st.album, today);
    const found = songCells(allSongs());
    fill(head, el('p', { class: 'muted' }, 'Komórki to krótkie cząsteczki harmonii, które wracają w całej muzyce. Zbierasz je w Warsztacie (przycisk „+” pod paskiem) albo tutaj. Powtórka: słyszysz komórkę w innej tonacji i ją rozpoznajesz.'));
    const card = (c) => {
      const r = st.album[c.id];
      const inSongs = found.filter((f) => f.cells.includes(c.id));
      const dk = ALL_KEYS.find((k) => k.mode === c.demo.mode && k.tonicPc === (c.demo.mode === 'minor' ? 9 : 0));
      return el('div', { class: `pr-card cell ${r ? 'have' : 'new'}`, 'data-cell': c.id },
        el('div', { class: 'pr-card-top' }, el('b', {}, c.name), r ? el('span', { class: `mdots s${cellStage(r)}` }, el('i'), el('i'), el('i')) : el('span', { class: 'lvl-dots' }, '•'.repeat(Math.min(5, c.level)))),
        strip(c.demo.steps, { small: true, k0: dk, motionsOn: false }),
        el('p', {}, c.sound),
        el('p', { class: 'muted' }, c.where),
        inSongs.length ? el('p', { class: 'pr-songs' }, 'W twoich piosenkach: ', inSongs.map((f) => f.title).join(', ')) : null,
        el('div', { class: 'pr-card-foot' },
          el('button', { class: 'btn tiny', onclick: () => { const kk = key; key = dk; previewSteps(c.demo.steps); key = kk; } }, '▶ Posłuchaj'),
          MOVE_BY_ID[c.move] ? el('button', { class: 'btn tiny ghost', onclick: () => { openMove = c.move; st.tab = 'ruchy'; store.save(); render(); } }, 'Ruch →') : null,
          r ? el('span', { class: 'muted' }, r.due <= today ? 'do powtórki' : `powtórka ${r.due.slice(8, 10)}.${r.due.slice(5, 7)}`) : el('button', { class: 'btn tiny primary', onclick: () => { collect(st.album, c.id, today); store.save(); renderAlbum(); renderTabs(); } }, '+ Do albumu')));
    };
    const have = CELLS.filter((c) => st.album[c.id]);
    const rest = CELLS.filter((c) => !st.album[c.id]);
    fill(body,
      due.length ? el('div', { class: 'panel pr-due' }, el('b', {}, `Do powtórki dziś: ${due.length}`), ' ', el('button', { class: 'btn small primary', onclick: () => { st.tab = 'trening'; startGame('album', { queue: due.slice() }); } }, 'Powtórz teraz')) : null,
      have.length ? el('div', { class: 'pr-section' }, el('h3', {}, `Twój album (${have.length})`), el('div', { class: 'pr-grid' }, have.map(card))) : null,
      el('div', { class: 'pr-section' }, el('h3', {}, have.length ? 'Do zebrania' : 'Wszystkie komórki'), el('div', { class: 'pr-grid' }, rest.map(card))));
  }

  // ==================================================================================================================
  // Trening
  const GAME_LIST = [
    ['petla', 'Pętla 5 minut', 'Jedna progresja (ta z Warsztatu) od ucha do albumu: usłysz, zobacz, zagraj, przebierz, zbierz.'],
    ['slyszBas', G.GAMES.slyszBas.name, G.GAMES.slyszBas.about],
    ['coTo', G.GAMES.coTo.name, G.GAMES.coTo.about],
    ['funkcja', G.GAMES.funkcja.name, G.GAMES.funkcja.about],
    ['palec', G.GAMES.palec.name, G.GAMES.palec.about],
    ['nuta', G.GAMES.nuta.name, G.GAMES.nuta.about],
    ['mod', G.GAMES.mod.name, G.GAMES.mod.about],
  ];
  const gameRec = (g) => { if (!st.games[g]) st.games[g] = { level: 1, n: 0, ok: 0, series: [] }; return st.games[g]; };

  function renderTraining() {
    if (game) return renderGame();
    fill(head, el('p', { class: 'muted' }, 'Gry, które uczą słyszeć i grać harmonię. Każda ma swój poziom: rośnie, gdy idzie dobrze, spada, gdy za trudno. Seria to 10 rund.'));
    fill(body, el('div', { class: 'pr-grid' }, GAME_LIST.map(([g, name, about]) => {
      const r = gameRec(g);
      return el('div', { class: 'pr-card game' },
        el('div', { class: 'pr-card-top' }, el('b', {}, name), g === 'petla' ? null : el('span', { class: 'pr-tier' }, `poz. ${r.level.toFixed(1)}`)),
        el('p', {}, about),
        el('div', { class: 'pr-card-foot' }, r.n ? el('span', { class: 'muted' }, `rund: ${r.n}`) : null, el('button', { class: 'btn tiny primary', onclick: () => startGame(g) }, 'Graj')));
    })));
  }

  let gameSound = [];
  function stopGameSound() { for (const t of gameSound) t(); gameSound = []; }
  function startGame(g, extra = {}) {
    stopAll();
    st.tab = 'trening';
    game = { id: g, round: null, result: null, series: { n: 0, ok: 0, sum: 0 }, ...extra };
    store.save();
    if (g === 'petla') game.step = 0;
    else if (g === 'album') nextAlbumReview();
    render();
  }
  function endSeriesIfDone() {
    const s = game.series;
    if (s.n < 10) return null;
    store.logSeries('progresje', { n: s.n, ok: s.ok, avg: Math.round(s.sum / s.n) });
    const r = gameRec(game.id);
    r.series = [...(r.series || []), { d: store.today(), ok: s.ok, n: s.n }].slice(-20);
    toast(`Seria: ${s.ok} z ${s.n}. Poziom ${r.level.toFixed(1)}.`, s.ok >= 7 ? 'good' : 'info');
    game.series = { n: 0, ok: 0, sum: 0 };
    return true;
  }
  function scoreRound(score) {
    const r = gameRec(game.id);
    const before = r.level;
    r.level = stepLevel(r.level, score);
    r.n++; if (score >= 80) r.ok++;
    game.series.n++; game.series.sum += score; if (score >= 80) game.series.ok++;
    const day = store.dayRec(); day.tries = (day.tries || 0) + 1; day.ok = (day.ok || 0) + (score >= 80 ? 1 : 0);
    store.save();
    endSeriesIfDone();
    return { before, after: r.level };
  }

  function renderGame() {
    const g = game.id;
    const def = GAME_LIST.find((x) => x[0] === g) || ['album', 'Powtórka z albumu', 'Słyszysz komórkę w innej tonacji. Która to?'];
    const r = g === 'petla' || g === 'album' ? null : gameRec(g);
    fill(head, el('div', { class: 'kcard-head pr-game-head' },
      el('div', {}, el('h2', {}, def[1]), el('p', { class: 'muted' }, def[2])),
      el('div', { class: 'chips-row' }, r ? el('span', { class: 'pill' }, `Poziom ${r.level.toFixed(1)}`) : null, r ? el('span', { class: 'pill' }, `Seria ${game.series.n}/10`) : null,
        el('button', { class: 'btn small ghost', onclick: () => { stopAll(); game = null; renderTraining(); renderDock(); } }, '← Wszystkie gry'))));
    const box = el('div', { class: 'pr-game' });
    fill(body, box);
    ({ slyszBas: gameBas, coTo: gameCoTo, funkcja: gameFn, palec: gamePalec, nuta: gameNuta, mod: gameMod, petla: gamePetla, album: gameAlbum })[g](box);
  }
  function gameDock() {
    const g = game.id;
    const primary = g === 'petla' || g === 'album' ? null : el('button', { class: 'btn primary', onclick: () => pilotGame('start') }, game.round && !game.result ? 'Jeszcze raz' : game.round ? 'Następna' : 'Start');
    ctx.dock(el('div', { class: 'play-row' }, primary,
      ['slyszBas', 'palec', 'nuta', 'mod', 'coTo', 'funkcja'].includes(g) ? el('button', { class: 'btn', onclick: () => pilotGame('hint') }, 'Podpowiedź') : null,
      el('button', { class: 'btn', onclick: () => { stopAll(); bus.stop(); } }, 'Stop')));
  }
  function pilotGame(a) {
    const g = game.id;
    if (a === 'hint') return gameHint();
    if (a !== 'start') return;
    if (g === 'petla') return;
    if (!game.round || game.result) newRound();
    else replayRound();
  }
  function newRound() {
    const g = game.id;
    const r = gameRec(g);
    game.result = null;
    const rr = Math.random;
    if (g === 'slyszBas') {
      game.round = G.slyszBasPlan(r.level, rr);
      if (game.prog && !game.used) {   // from the Bas lens: first the progression from the Warsztat
        game.used = true;
        const ch = stepChords(key, game.steps, { color: 'triads' }).filter((x) => !x.rest);
        game.round = { game: 'slyszBas', level: r.level, key, prog: game.prog, chords: ch.map((x) => x.chord), names: r.level < 3, bass: ch.map((x) => (x.chord.bassPc != null ? x.chord.bassPc : x.chord.root.pc)) };
      }
      game.k = 0; game.answers = []; playBasRound();
    }
    else if (g === 'coTo') { game.round = G.coToPlan(r.level, rr); game.round.plays = 1; playCoTo(); }
    else if (g === 'funkcja') { game.round = G.funkcjaPlan(r.level, rr); playFn(); }
    else if (g === 'palec') { game.round = G.palecPlan(r.level, rr); playTriad(game.round.from); }
    else if (g === 'nuta') { game.round = G.nutaPlan(r.level, rr); playNote(game.round.pc); }
    else if (g === 'mod') { game.round = G.modPlan(r.level, rr); game.played = []; startDrone(); }
    renderGame(); renderDock();
  }
  function replayRound() {
    const g = game.id;
    if (g === 'slyszBas') { game.k = 0; game.answers = []; playBasRound(); }
    if (g === 'coTo') { game.round.plays++; playCoTo(); }
    if (g === 'funkcja') playFn();
    if (g === 'palec') playTriad(game.round.moves.length ? game.round.moves[game.round.moves.length - 1].id : game.round.from);
    if (g === 'nuta') playNote(game.round.pc);
    if (g === 'mod') startDrone();
    renderGame();
  }
  function gameHint() {
    const g = game.id; const R = game.round;
    if (!R) return;
    if (g === 'slyszBas' && game.k < R.bass.length) { let n = 36; while (mod12(n) !== R.bass[game.k]) n++; playEvents([{ t: 0, m: [0x90, n, 70] }, { t: 1, m: [0x80, n, 0] }], { lead: 0.1 }).catch(() => {}); }
    if (g === 'coTo') toast(`Zaczyna się od: ${stepChords(R.key, R.answer.steps, { color: 'triads' })[0].chord.number}.`);
    if (g === 'funkcja') toast(R.fn === 'D' ? 'Czy chce iść dalej?' : R.fn === 'T' ? 'Czy można na nim skończyć?' : 'Czy oddala się od domu, ale spokojnie?');
    if (g === 'palec') { const last = R.moves.length ? R.moves[R.moves.length - 1].id : R.from; const p = plrPath(last, R.to); if (p.length) { toast(`Następny krok: ${p[0].move} (${G.triadName(p[0].id)}).`); } }
    if (g === 'nuta') toast('Spróbuj akordu, w którym ten dźwięk jest tercją albo septymą.');
    if (g === 'mod') toast(`Zmień ${R.change[0]}. stopień o półton ${R.change[1] < 0 ? 'w dół' : 'w górę'}.`);
  }

  // --- Słysz bas ---
  function playBasRound() {
    const R = game.round;
    const dur = 60 / 76 * 2;
    const ev = [];
    let prev = null;
    R.chords.forEach((c, j) => {
      const vo = (prev = voiceOf(c, prev));
      let b = 36; const bpc = c.bassPc != null ? c.bassPc : c.root.pc; while (mod12(b) !== bpc) b++;
      ev.push(...chordEvents(c, vo, b, j * dur, dur * 0.95, 66));
    });
    playEvents(ev, { lead: 0.3 }).then(() => { gameSound.push(bus.at(bus.now() + R.chords.length * dur + 0.6, () => askBas())); }).catch(() => toast('Serwer Trenera nie odpowiada.'));
    game.phase = 'listen';
  }
  function voiceOf(c, prev) {
    const pcs = c.tones.map((t) => t.pc);
    let best = null;
    for (let base = 57; base <= 69; base++) {
      if (!pcs.includes(mod12(base))) continue;
      const v = [base]; for (const p of pcs) { if (p === mod12(base)) continue; let m = base + 1; while (mod12(m) !== p) m++; v.push(m); }
      v.sort((a, b) => a - b);
      const cost = prev ? v.reduce((s, n) => s + Math.min(...prev.map((x) => Math.abs(x - n))), 0) : Math.abs(v[0] - 62);
      if (!best || cost < best.cost) best = { v, cost };
    }
    return best ? best.v : [];
  }
  function askBas() {
    if (!game || game.id !== 'slyszBas') return;
    game.phase = 'answer';
    const R = game.round;
    if (game.k >= R.chords.length) return finishBas();
    const c = R.chords[game.k];
    playEvents(chordEvents(c, voiceOf(c, null), null, 0, 1.4, 62), { lead: 0.1 }).catch(() => {});
    renderGame();
  }
  function finishBas() {
    const R = game.round;
    const res = G.slyszBasGrade(R, game.answers);
    game.result = res;
    scoreRound(res.score);
    renderGame(); renderDock();
  }
  function gameBas(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: gram progresję. Potem każdy akord osobno, bez basu. Ty grasz bas lewą ręką.')); return; }
    const k0 = R.key;
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? `Wynik: ${game.result.score} na 100.` : game.phase === 'listen' ? 'Słuchaj całości…' : `Akord ${game.k + 1} z ${R.chords.length}: zagraj jego bas (lewa, poniżej środkowego C).`),
      el('div', { class: 'pr-strip big' }, R.chords.map((c, j) => el('span', { class: `pr-chip ${fnClass(fnOf(k0, c))} ${j === game.k && !game.result ? 'now' : ''} ${game.answers[j] != null ? (mod12(game.answers[j]) === R.bass[j] ? 'ok' : 'bad') : ''}` },
        el('b', {}, R.names || game.result || j < game.k ? c.number : '?'), el('span', {}, R.names || game.result || j < game.k ? c.name : ''),
        game.answers[j] != null ? el('small', {}, `bas: ${G.triadName(`${mod12(game.answers[j])}M`)}`) : null))),
      game.result && game.result.tip ? el('p', { class: 'drill-tip' }, game.result.tip) : null,
      game.result ? el('p', { class: 'muted' }, `To była „${R.prog.name}” w ${keyName(k0, true)}.`) : null);
  }

  // --- Co to za progresja? ---
  function playCoTo() {
    const R = game.round;
    bandStart({ laps: 2, role: 'sluchaj', source: () => withBars(R.answer.steps), k: () => R.key, onChord: () => {}, groove: R.answer.groove, bpm: Math.min(110, R.answer.tempo) });
  }
  function gameCoTo(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: zespół gra dwa okrążenia. Wybierz kartę.')); return; }
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? (game.result.right ? 'Dobrze!' : 'Nie tym razem.') : `Która to progresja? (${keyName(R.key, true)})`),
      el('div', { class: 'pr-grid' }, R.options.map((o) => el('button', {
        class: `pr-card pick-card ${game.result ? (o.id === R.answer.id ? 'ok' : game.choice === o.id ? 'bad' : '') : ''}`,
        disabled: !!game.result,
        onclick: () => { game.choice = o.id; game.result = G.coToGrade(R, o.id, R.plays); scoreRound(game.result.score); bandStop(true); renderGame(); renderDock(); },
      }, el('b', {}, o.name), el('div', { class: 'num-chips' }, numbersOf(o.steps, R.key)), el('small', {}, o.mood)))),
      game.result && game.result.tip ? el('p', { class: 'drill-tip' }, game.result.tip) : null,
      game.result ? el('div', { class: 'doors' }, el('button', { class: 'door', onclick: () => { game = null; open(R.answer.id); } }, `Otwórz „${R.answer.name}” w Warsztacie →`)) : null);
  }

  // --- Dom, wyjście, napięcie ---
  function playFn() {
    const R = game.round;
    const cad = stepChords(R.key, [{ k: 'chord', d: 1, a: 0, q: 'maj' }, { k: 'chord', d: 4, a: 0, q: 'maj' }, { k: 'chord', d: 5, a: 0, q: 'dom7' }, { k: 'chord', d: 1, a: 0, q: 'maj' }], { color: 'triads' });
    const ev = [];
    cad.forEach((x, j) => ev.push(...chordEvents(x.chord, x.voicing, x.bass, j * 0.7, 0.66, 56)));
    const c = R.chord;
    let b = 36; while (mod12(b) !== c.root.pc) b++;
    ev.push(...chordEvents(c, voiceOf(c, cad[3].voicing), b, 4 * 0.7 + 0.8, 1.6, 70));
    playEvents(ev, { lead: 0.2 }).catch(() => toast('Serwer Trenera nie odpowiada.'));
  }
  function gameFn(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: kadencja w tonacji, potem jeden akord. Wybierz jego rolę.')); return; }
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? `${R.chord.name} w ${keyName(R.key, true)}: ${G.FN_WORDS[R.fn]}.` : 'Czym jest ostatni akord?'),
      el('div', { class: 'chips-row pr-fn-btns' }, R.options.map((f) => el('button', { class: `btn ${fnClass(f)} fn-btn ${game.result && f === R.fn ? 'ok' : ''}`, disabled: !!game.result,
        onclick: () => { game.result = G.funkcjaGrade(R, f); scoreRound(game.result.score); renderGame(); renderDock(); } }, G.FN_WORDS[f]))),
      game.result && game.result.tip ? el('p', { class: 'drill-tip' }, game.result.tip) : null);
  }

  // --- Jeden palec ---
  function playTriad(t) {
    const pcs = triadPcs(t);
    const v = pcs.map((p) => { let m = 60; while (mod12(m) !== p) m++; return m; }).sort((a, b) => a - b);
    playEvents(v.flatMap((n) => [{ t: 0, m: [0x90, n, 64] }, { t: 1.2, m: [0x80, n, 0] }]), { lead: 0.1 }).catch(() => {});
  }
  function gamePalec(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: pokazuję start i cel. Graj trójdźwięki. Za każdym razem rusza się jeden palec.')); return; }
    const path = [R.from, ...R.moves.map((m) => m.id)];
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? `Doszedłeś w ${game.result.used} ${plural(game.result.used, 'ruchu', 'ruchach', 'ruchach')} (najkrócej: ${game.result.best}).` : `Z ${G.triadName(R.from)} do ${G.triadName(R.to)}. Zagraj ${G.triadName(R.from)}, potem każdy następny akord, ruszając jednym palcem.`),
      el('div', { class: 'pr-grid-box' }, tonnetzSvg({ key: ALL_KEYS[0], centerPc: parseTriad(R.from).root, path, held: liveTriad, start: R.from, target: R.to })),
      game.say ? el('p', { class: 'muted' }, game.say) : null,
      game.result && game.result.tip ? el('p', { class: 'drill-tip' }, game.result.tip) : null);
  }
  function palecFeed(notes) {
    const R = game.round;
    if (!R || game.result) return;
    const lastId = R.moves.length ? R.moves[R.moves.length - 1].id : R.from;
    const pcs = [...new Set(notes.map(mod12))];
    // the start chord itself just begins the walk
    if (pcs.length === 3 && triadPcs(lastId).every((x) => pcs.includes(x))) { game.say = `${G.triadName(lastId)}: dobrze, teraz rusz jednym palcem.`; renderGame(); return; }
    const res = G.palecStep(R, notes);
    if (res.same) return;
    game.say = res.say;
    if (res.done) { game.result = G.palecGrade(R); scoreRound(game.result.score); renderDock(); }
    renderGame();
  }

  // --- Jedna nuta ---
  function playNote(p) { let n = 72; while (mod12(n) !== p) n++; playEvents([{ t: 0, m: [0x90, n, 72] }, { t: 1.4, m: [0x80, n, 0] }], { lead: 0.1 }).catch(() => {}); }
  function gameNuta(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: gram jeden dźwięk. Szukaj akordów, w których on jest. Najlepiej z nim na górze.')); return; }
    const name = G.triadName(`${R.pc}M`);
    fill(box,
      el('p', { class: 'pr-say' }, `Dźwięk: `, el('b', { class: 'pr-big-note' }, name), ` · znalezione ${R.found.length} z ${R.target}`),
      el('div', { class: 'chips-row' }, R.found.map((f) => el('span', { class: `pick ${fnClass(f.fn)}` }, f.name, el('small', {}, ` ${f.role}${f.top ? ' ↑' : ''}`)))),
      game.say ? el('p', { class: 'muted' }, game.say) : null,
      game.result ? el('p', { class: 'pr-say' }, `Wynik: ${game.result.score} na 100.`) : el('button', { class: 'btn small', onclick: () => { game.result = G.nutaGrade(R); scoreRound(game.result.score); renderGame(); renderDock(); } }, 'Gotowe'),
      game.result && game.result.tip ? el('p', { class: 'drill-tip' }, game.result.tip) : null);
  }
  function nutaFeed(notes) {
    const R = game.round;
    if (!R || game.result) return;
    const res = G.nutaStep(R, notes);
    if (!res.say) return;
    game.say = res.say;
    if (R.found.length >= R.target) { game.result = G.nutaGrade(R); scoreRound(game.result.score); renderDock(); }
    renderGame();
  }

  // --- Jeden dźwięk zmienia mod ---
  function startDrone() {
    stopGameSound();
    const R = game.round;
    let n = 36; while (mod12(n) !== R.key.tonicPc) n++;
    const loop = () => {
      if (!game || game.id !== 'mod' || game.result) return;
      playEvents([{ t: 0, m: [0x90, n, 52] }, { t: 0, m: [0x90, n + 7, 44] }, { t: 7.8, m: [0x80, n, 0] }, { t: 7.8, m: [0x80, n + 7, 0] }], { lead: 0.1 }).catch(() => {});
      gameSound.push(bus.at(bus.now() + 7.9, loop));
    };
    loop();
    const from = scaleNotes(R.key, R.from, 60);
    ctx.keyboard.mark(from.map((x) => ({ note: x.midi, text: x.name, sub: x.deg, tone: x.deg === '1' ? 'var(--role-1)' : 'var(--mode)' })));
  }
  function gameMod(box) {
    const R = game.round;
    if (!R) { fill(box, el('p', { class: 'pr-say' }, 'Start: bas trzyma tonikę, na klawiszach widzisz skalę. Zmień jeden dźwięk i zagraj nową skalę w górę.')); return; }
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? `To ${SCALES[R.to].name}. ${R.say}` : `Teraz: ${SCALES[R.from].name} od ${scaleNotes(R.key, R.from, 60)[0].name}. Zmień jeden dźwięk tak, żeby wyszła ${SCALES[R.to].name}, i zagraj ją w górę.`),
      game.say ? el('p', { class: 'muted' }, game.say) : null);
  }
  function modFeed(e) {
    const R = game.round;
    if (!R || game.result || !e.on) return;
    game.played = [...(game.played || []), e.note].slice(-8);
    const pcs = new Set(game.played.slice(-7).map(mod12));
    const target = new Set(scaleNotes(R.key, R.to, 60).map((x) => x.pc));
    const from = new Set(scaleNotes(R.key, R.from, 60).map((x) => x.pc));
    if (pcs.size >= 7 && [...target].every((p) => pcs.has(p)) && [...pcs].every((p) => target.has(p))) {
      game.result = { score: 100 };
      scoreRound(100);
      stopGameSound();
      const notes = scaleNotes(R.key, R.to, 60);
      ctx.keyboard.mark(notes.map((x) => ({ note: x.midi, text: x.name, sub: x.deg, tone: x.deg === '1' ? 'var(--role-1)' : 'var(--good)' })));
      renderGame(); renderDock();
    } else if (pcs.size >= 7 && [...from].every((p) => pcs.has(p))) { game.say = 'To jeszcze stara skala. Zmień jeden dźwięk.'; renderGame(); }
  }

  // --- Album review ---
  function nextAlbumReview() {
    const q = game.queue || [];
    if (!q.length) { game.done = true; return; }
    const idc = q.shift();
    const cell = CELL_BY_ID[idc];
    const keys = ALL_KEYS.filter((k) => k.mode === cell.demo.mode && k.tonicPc !== (cell.demo.mode === 'minor' ? 9 : 0));
    const k = keys[Math.floor(Math.random() * keys.length)];
    const others = CELLS.filter((c) => c.id !== idc && c.demo.mode === cell.demo.mode).sort(() => Math.random() - 0.5).slice(0, 2);
    game.round = { cell, key: k, options: [cell, ...others].sort(() => Math.random() - 0.5) };
    game.result = null;
    const kk = key; key = k; previewSteps(cell.demo.steps); key = kk;
  }
  function gameAlbum(box) {
    if (game.done || !game.round) { fill(box, el('p', { class: 'pr-say' }, 'Powtórki zrobione.'), el('button', { class: 'btn primary', onclick: () => { game = null; st.tab = 'album'; render(); } }, 'Wróć do albumu')); return; }
    const R = game.round;
    fill(box,
      el('p', { class: 'pr-say' }, game.result ? (game.result.ok ? 'Dobrze. Następna powtórka później.' : `To było „${R.cell.name}”. Wraca jutro.`) : `Która komórka? (${keyName(R.key, true)})`),
      el('div', { class: 'chips-row' }, el('button', { class: 'btn small', onclick: () => { const kk = key; key = R.key; previewSteps(R.cell.demo.steps); key = kk; } }, '▶ Jeszcze raz')),
      el('div', { class: 'pr-grid' }, R.options.map((c) => el('button', { class: `pr-card pick-card ${game.result ? (c.id === R.cell.id ? 'ok' : '') : ''}`, disabled: !!game.result,
        onclick: () => { const ok = c.id === R.cell.id; reviewCell(st.album, R.cell.id, ok, store.today()); store.save(); game.result = { ok }; renderGame(); renderTabs(); } }, el('b', {}, c.name), el('small', {}, c.sound)))),
      game.result ? el('button', { class: 'btn primary', onclick: () => { nextAlbumReview(); renderGame(); } }, 'Następna') : null);
  }

  // --- Pętla 5 minut ---
  const LOOP_STEPS = [
    ['Usłysz', 'Zespół gra progresję. Znajdź uchem dom: na którym akordzie można skończyć? Potem bas: zanuć go.'],
    ['Zobacz', 'Szkielet, bas i siatka mówią, co się stało.'],
    ['Zagraj', 'Zagraj z zespołem: lewa bas, prawa akord najbliżej. Pokaż / Graj ze mną w „Jak zagrać”, jeśli trzeba.'],
    ['Przebierz', 'Jedna zmiana: wybierz ruch, posłuchaj przed i po, zagraj nową wersję.'],
    ['Zbierz', 'Komórki z tej progresji idą do albumu. Wrócą jako powtórki.'],
  ];
  function gamePetla(box) {
    const p = prog(); const list = steps();
    const k = game.step;
    const [name, say] = LOOP_STEPS[k];
    const extra = [];
    if (k === 0) extra.push(el('button', { class: 'btn primary', onclick: () => bandStart({ laps: 2, role: 'sluchaj' }) }, '▶ Posłuchaj dwa okrążenia'));
    if (k === 1) {
      const info = analyze(key, list); const prof = motionProfile(motions(key, list));
      extra.push(strip(list, { cls: 'live' }), el('p', {}, `Szkielet: ${undressNames(list)}. Najwięcej ruchów „${prof.length ? MOTIONS[prof[0].kind].name : '—'}”. Warstwy: ${[...new Set(info.map((x) => LAYERS[x.layer].name))].join(', ')}.`));
    }
    if (k === 2) extra.push(el('button', { class: 'btn primary', onclick: () => { st.role = 'wszystko'; bandStart({ role: 'wszystko' }); } }, '▶ Gram rytm, ty bas i akordy'), el('button', { class: 'btn', onclick: () => { st.tab = 'warsztat'; st.lens = 'graj'; game = null; render(); } }, 'Jak zagrać →'));
    if (k === 3) {
      const ms = movesFor(list, key).filter((m) => m.level <= 3).slice(0, 5);
      extra.push(el('div', { class: 'chips-row' }, ms.map((m) => el('span', { class: 'pr-opt' }, el('button', { class: 'pick', onclick: () => { const a = applyMove(m.id, list, key); if (a) { st.cur.work = a; store.save(); toast(`${m.name}. Zagraj nową wersję.`); renderGame(); } } }, m.name),
        el('button', { class: 'btn tiny ghost', onclick: () => { const a = applyMove(m.id, list, key); if (a) playBeforeAfter(list, a); } }, '▶')))), strip(list, { cls: 'live' }), el('button', { class: 'btn primary', onclick: () => bandStart({ role: 'akordy' }) }, '▶ Zagraj z zespołem'));
    }
    if (k === 4) {
      const found = cellsInSteps(key, list);
      extra.push(found.length ? el('div', { class: 'chips-row' }, found.map(({ cell }) => el('span', { class: 'pick on' }, cell.name))) : el('p', { class: 'muted' }, 'Tu nie ma znanych komórek. Wybierz w Bibliotece inną progresję.'),
        el('button', { class: 'btn primary', onclick: () => { for (const { cell } of found) collect(st.album, cell.id, store.today()); store.save(); scoreRound(100); toast(`Zebrane: ${found.length}.`, 'good'); game = null; st.tab = 'album'; render(); } }, found.length ? 'Do albumu i koniec' : 'Koniec'));
    }
    fill(box,
      el('div', { class: 'pr-stages' }, LOOP_STEPS.map(([n], j) => el('button', { class: `pr-stage ${j === k ? 'on' : ''} ${j < k ? 'done' : ''}`, onclick: () => { stopAll(); game.step = j; renderGame(); } }, `${j + 1}. ${n}`))),
      el('div', { class: 'panel' }, el('h3', {}, `${k + 1}. ${name}: ${p.name}`), el('p', { class: 'pr-say' }, say), extra,
        el('div', { class: 'chips-row' }, k < LOOP_STEPS.length - 1 ? el('button', { class: 'btn', onclick: () => { stopAll(); game.step = k + 1; renderGame(); } }, 'Dalej →') : null)));
  }
  const undressNames = (list) => stepChords(key, undress(key, list, 0), { color: 'triads' }).filter((x) => !x.rest).map((x) => x.chord.number).join(' → ');

  // --- live input -------------------------------------------------------------------------------------------------
  const pedalTimer = setInterval(() => {
    const v = pc.tick(performance.now() / 1000);
    if (!v.length || !st.pedalOn || !band.running) return;
    const r = st.pedal[prog().id] || (st.pedal[prog().id] = { good: 0, blur: 0, early: 0 });
    for (const x of v) r[x.kind]++;
    store.save();
    const p = stage.querySelector('.pr-pedal');
    if (p && st.tab === 'warsztat') p.replaceWith(pedalLine());
  }, 300);

  function heldChanged() {
    const notes = [...held];
    const r = notes.length >= 2 ? identify(notes, key) : null;
    heldName = r && r.kind === 'chord' ? r.name : null;
    liveTriad = r && r.chord ? triadOfChord(r.chord) : null;
    for (const c of stage.querySelectorAll('.pr-strip.live .pr-chip')) c.classList.toggle('held', !!heldName && c.querySelector('span') && c.querySelector('span').textContent === heldName);
    if (st.tab === 'warsztat' && st.lens === 'siatka' && gridRedraw) gridRedraw();
    if (game && game.round) {
      if (game.id === 'palec' && notes.length >= 3) palecFeed(notes);
      else if (game.id === 'palec') renderGame();
      if (game.id === 'nuta' && notes.length >= 3) nutaFeed(notes);
    }
  }

  render();

  return {
    onNote(e) {
      guide.feed(e);
      pc.note(performance.now() / 1000, e.on, e.note);
      if (e.on) held.add(e.note); else held.delete(e.note);
      clearTimeout(heldTimer);
      heldTimer = setTimeout(heldChanged, e.on ? 120 : 60);
      if (game && game.round && !game.result) {
        if (game.id === 'slyszBas' && game.phase === 'answer' && e.on && e.note < 60) {
          game.answers[game.k] = e.note;
          const ok = mod12(e.note) === game.round.bass[game.k];
          ctx.keyboard.flash && ctx.keyboard.flash(e.note, ok ? 'good' : 'bad');
          game.k++;
          renderGame();
          gameSound.push(bus.at(bus.now() + 0.5, () => askBas()));
        }
        if (game.id === 'mod') modFeed(e);
      }
    },
    onPedal(down) { pc.pedal(performance.now() / 1000, down); },
    pilotLabels: ['Zespół / Start', 'Pokaż / Jeszcze raz', 'Podpowiedź', 'Stop', 'Stop'],
    onPilot(a) {
      if (st.tab === 'trening' && game) { if (a === 'pause' || a === 'end') { stopAll(); bus.stop(); } else pilotGame(a); return; }
      if (a === 'start') { if (st.tab === 'warsztat' && st.lens === 'graj') { guide.running ? guide.stop() : guide.start(st.guideWay, { tempo: tempo() }); renderDock(); } else if (band.running) bandStop(); else bandStart({}); }
      if (a === 'repeat') { if (st.lens === 'graj') guide.show(tempo()); else previewSteps(steps()); }
      if (a === 'hint') { if (st.lens === 'graj') guide.hint(); }
      if (a === 'pause' || a === 'end') { stopAll(); bus.stop(); renderDock(); }
    },
    destroy() { alive = false; stopAll(); clearInterval(pedalTimer); clearTimeout(heldTimer); ctx.keyboard.mark([]); },
  };
}
