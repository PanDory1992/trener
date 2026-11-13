// Jam: pick a style, a progression and a key; I play the band, you play your part.
// The board shows the chord now and next, the keys show what fits, the trail shows what you played.
import * as bus from '../bus.js';
import { getKey, setKey } from '../key.js';
import * as store from '../store.js';
import { countIn, GROOVE, GROOVES, GROOVE_GROUPS, jamCycle, ROLES, answerBar, bassMidi, KEYS_CH } from '../grooves.js';
import { progEditor } from '../editor.js';
import { normStep, stepsToChart, detectKey, stepChords, identify, scaleMode, rekey } from '../chords.js';
import { buildMidi, keySignature } from '../midi.js';
import { DRUMMERS } from '../drummer.js';

import { ALL_KEYS, family, keyAt, keyName, nameInKey, PROGRESSIONS, scaleNotes, stepKey, wheelIndex, FAMILY, degreeChord, keyByTonic } from '../theory.js';
import { el, fill, add, toast } from '../ui.js';
import { playEvents } from './common.js';
import { ROLE_TONE } from './kolo.js';
import { fnOf, fnClass, fnColor } from '../colors.js';
import { WindowTally, thirdPc } from '../feedback.js';

export const id = 'jam';
const TRAIL = 28;
// Wyzwania (no points, no time limit, can be ignored): plain counts while you play and after each lap
const CHALLENGES = [['', 'brak'], ['ct', 'Tylko dźwięki akordu'], ['third', 'Tercja na każdej zmianie'], ['qa', 'Pytanie–odpowiedź']];

function progsFor(mode) { return PROGRESSIONS.filter((p) => p.mode === mode); }

export function mount(stage, ctx) {
  const st = store.mode(id);
  st.groove = GROOVE[st.groove] ? st.groove : 'pop';
  st.tempo = st.tempo || GROOVE[st.groove].tempo;
  st.bpc = st.bpc || 1;
  st.color = st.color || 'auto';
  st.role = ROLES[st.role] ? st.role : 'solo';
  st.band = !!st.band;
  st.click = !!st.click;
  st.lights = st.lights !== false;
  st.prog = st.prog || {};
  st.custom = st.custom || { major: [], minor: [] };
  st.saved = st.saved || [];
  st.walk = [0, 1, -1, 'up'].includes(st.walk) ? st.walk : 0;     // each lap: a step around the circle, or a semitone up
  st.lapBpm = [0, 2, 4].includes(st.lapBpm) ? st.lapBpm : 0;  // each lap: a little faster
  st.chal = CHALLENGES.some(([v]) => v === st.chal) ? st.chal : '';
  st.scale = st.scale || null;                                   // editor: a 7-note scale instead of the family
  st.arp = { mode: 'styl', step: 0.5, voices: 4, ...(st.arp || {}) };   // the band's keys: style comping or an arpeggio
  st.human = { t: 0, v: 0, ...(st.human || {}) };                // humanization in %
  st.bassFollow = !!st.bassFollow;                               // Ty: akordy → the bass follows the chord you hold
  st.drummer = [1, 2, 3, 4].includes(st.drummer) ? st.drummer : 3;   // the drummer's level (drummer.js)
  const edUi = { open: null, tab: 'rodzaj', add: false, addTab: 'dalej' };
  let key = getKey();
  if (ctx.preset) {
    if (ctx.preset.prog) st.prog[key.mode] = ctx.preset.prog;
    if (ctx.preset.role) st.role = ctx.preset.role;
    if (ctx.preset.song) {   // from Piosenki: the song's chords as "Własna", in the song's key
      const s = ctx.preset.song;
      const k = ALL_KEYS.find((x) => x.li === s.key.li && x.acc === s.key.acc && x.mode === s.key.mode);
      if (k) { key = k; setKey(k); }
      st.custom[key.mode] = s.steps.slice(0, 64);
      st.customName = { ...(st.customName || {}), [key.mode]: s.title };
      st.prog[key.mode] = 'custom';
      if (!ctx.preset.role) st.role = 'akordy';
      setTimeout(() => toast(`W Jamie: ${s.title}. Długości akordów jak w piosence. Start, gdy chcesz.`), 50);
    }
    store.save();
  }

  let alive = true;
  let running = false;
  let cycles = [];          // [{start, seconds, chords, tm}]
  let nextTimer = null;
  let raf = 0;
  let shown = { key: null, mark: null, lap: null };
  let runToken = 0;
  const trail = [];
  // challenge counts: chord tones (per note), third after each change and answers (time windows)
  const chalRole = () => st.role === 'solo' || st.role === 'akordy';
  const tally = { ct: { n: 0, ok: 0 }, ctLaps: new Map(), third: new WindowTally(), qa: new WindowTally(), lapLine: '', summary: null };
  function chalReset() {
    tally.ct = { n: 0, ok: 0 }; tally.ctLaps = new Map(); tally.third.reset(); tally.qa.reset(); tally.lapLine = ''; tally.summary = null;
  }

  // --- skeleton ---------------------------------------------------------------------------------------------
  // what you change every time stays in sight (key, chords, your role); the rest folds away under "Więcej ustawień"
  const quick = el('div', { class: 'jc-row jam-quick' });
  const customBox = el('div', { class: 'jam-custom-box' });
  const controls = el('div', { class: 'jam-controls' });
  const setSummary = el('summary', { class: 'jam-set-sum' });
  const controlsWrap = el('details', { class: 'jam-set', open: st.setOpen === true && !document.body.classList.contains('compact'), ontoggle: (e) => { st.setOpen = e.target.open; store.save(); } }, setSummary, controls);
  const dockDyn = el('span', { class: 'jam-dock-dyn' });   // style and tempo, rebuilt with the controls
  const board = el('div', { class: 'jam-board' });
  const chalBox = el('div', { class: 'jam-chal', 'aria-live': 'polite' });
  const chalSel = el('select', { 'aria-label': 'Wyzwanie', onchange: (e) => {
    st.chal = e.target.value; store.save(); chalReset(); renderChal();
    if (running && st.chal === 'qa') toast('Pytanie–odpowiedź zabrzmi od następnego okrążenia.');
  } }, CHALLENGES.map(([v, t]) => el('option', { value: v, selected: st.chal === v }, t)));
  const chalPick = el('label', { class: 'jam-chal-pick' }, el('span', {}, 'Wyzwanie'), chalSel);
  function updateChalPick() {
    chalSel.disabled = !chalRole();
    chalPick.title = chalRole() ? 'Bez punktów i bez limitu. Pytanie–odpowiedź: zespół gra 2 takty, potem 2 takty ciszy pianina dla ciebie.' : 'Wyzwania są dla ról „Ty: solo” i „Ty: akordy”.';
    renderChal();
  }
  const trailBox = el('div', { class: 'trail', 'aria-label': 'Twoje ostatnie dźwięki jako numery w tonacji' });
  const below = el('div', { class: 'jam-below' });
  const startBtn = el('button', { class: 'btn primary big', onclick: () => (running ? stop() : start()) }, 'Start');
  const lightsBox = el('input', { type: 'checkbox', checked: st.lights, onchange: (e) => { st.lights = e.target.checked; store.save(); shown.mark = null; if (!running) idleBoard(); } });
  add(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Jam'),
      el('p', { class: 'mode-sub' }, 'Wybierz styl i akordy. Ja gram zespół, ty swoją partię. Nikt cię nie ocenia, po prostu grasz.'))),
    quick, customBox, controlsWrap, board, chalBox,

    below);

  // the play bar above the keyboard: Start, style, tempo, challenge, save, lights
  ctx.dock(el('div', { class: 'dock-stack' },
    el('div', { class: 'actions jam-actions' }, startBtn, dockDyn, chalPick,
      el('button', { class: 'btn', onclick: () => saveJam() }, 'Zapisz ten jam'),
      el('label', { class: 'field inline', title: 'Światła na klawiszach (C58 też włącza i wyłącza)' }, lightsBox, el('span', {}, 'Światła na klawiszach'))),
    // what you played, as numbers in the key: right under the buttons, close to the keys
    el('div', { class: 'trail-wrap' }, el('span', { class: 'doors-label' }, 'Co grasz:'), trailBox)));

  function prog() {
    if (st.prog[key.mode] === 'custom') {
      let steps = st.custom[key.mode] || [];
      // "Graj tylko zaznaczone": a loop of the selected steps
      if (edUi.loopSel && edUi.sel && edUi.sel.length) steps = [...edUi.sel].sort((a, b) => a - b).map((i) => steps[i]).filter(Boolean);
      if (steps.length) return { id: 'custom', mode: key.mode, name: (st.customName && st.customName[key.mode]) || 'Własna', mood: 'twoja', steps, why: 'Twoja własna progresja. Posłuchaj, które przejścia ciągną do domu (zwykle 5 → 1 i 4 → 1), a które zostawiają w zawieszeniu.' };
    }
    const list = progsFor(key.mode);
    return list.find((p) => p.id === st.prog[key.mode]) || list.find((p) => p.id === GROOVE[st.groove].suggest[key.mode]) || list[0];
  }

  function opts() {
    return { key, prog: prog(), groove: st.groove, tempo: st.tempo, barsPerChord: st.bpc, color: st.color, band: st.band, role: st.role, click: st.click, callResponse: st.chal === 'qa' && chalRole(), keysOwn: true,
      arp: st.arp, human: st.human, bassLive: st.bassFollow && st.role === 'akordy', drummer: st.drummer };
  }

  // the band listens: how loud you played in the last few seconds → how loud the next lap is
  const heard = [];
  function bandDyn() {
    if (st.follow === false) return 1;
    const now = performance.now() / 1000;
    while (heard.length && now - heard[0].t > 6) heard.shift();
    if (heard.length < 4) return 1;
    const avg = heard.reduce((a, x) => a + x.v, 0) / heard.length;
    return Math.max(0.75, Math.min(1.15, 0.75 + ((avg - 40) / 60) * 0.4));
  }

  // a key or tempo picked by hand during a run wins over the automatic step for the next lap
  let manual = { key: false, tempo: false };
  /** Key and tempo of the next lap, for "po kole" and "+BPM co okrążenie". prev = the lap before (or null). */
  function lapSetup(prev) {
    const g = GROOVE[st.groove];
    if (!prev) return { key, tempo: st.tempo };
    const k = manual.key ? key : st.walk ? stepKey(prev.key, st.walk) : key;
    const tempo = manual.tempo ? st.tempo : st.lapBpm ? Math.min(g.range[1], prev.tempo + st.lapBpm) : st.tempo;
    manual = { key: false, tempo: false };
    return { key: k, tempo };
  }

  // --- controls ------------------------------------------------------------------------------------------------
  function renderControls() {
    const g = GROOVE[st.groove];
    const p = prog();
    fill(setSummary, el('b', {}, 'Więcej ustawień'), el('span', {}, `${g.name} · ${p.name} · ${keyName(key, true)} · ${st.tempo} BPM · ${ROLES[st.role].name} · barwa, takty, perkusista, klawisze zespołu…`));
    const seg = (label, items, cur, set) => el('div', { class: 'jc' }, el('span', { class: 'jc-label' }, label),
      el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': label }, items.map(([v, t, title]) => el('button', { class: cur === v ? 'on' : '', role: 'radio', 'aria-checked': String(cur === v), title: title || null, onclick: () => set(v) }, t))));
    const changed = () => { store.save(); renderControls(); renderBelow(); updateChalPick(); if (running) toast('Zmiana zabrzmi od następnego obrotu.'); else idleBoard(); };
    const custom = p.id === 'custom' || st.prog[key.mode] === 'custom';
    const pickStyle = (id) => {
      const x = GROOVE[id];
      st.groove = x.id; st.tempo = x.tempo; manual.tempo = true;
      if (st.prog[key.mode] !== 'custom') st.prog[key.mode] = x.suggest[key.mode];
      changed();
    };
    fill(dockDyn,
      el('label', { class: 'field inline' }, el('span', {}, 'Styl'),
        el('select', { class: 'jam-style', 'aria-label': 'Styl', onchange: (e) => pickStyle(e.target.value) },
          GROOVE_GROUPS.map(([gname, ids]) => el('optgroup', { label: gname }, ids.map((gid) => GROOVE[gid]).filter(Boolean).map((x) => el('option', { value: x.id, selected: x.id === st.groove }, `${x.name} · ${x.meter}`)))))),
      el('label', { class: 'field inline tempo-field' }, el('span', {}, 'Tempo'),
        el('input', { type: 'range', min: String(g.range[0]), max: String(g.range[1]), step: '2', value: String(st.tempo), oninput: (e) => { st.tempo = Number(e.target.value); e.target.nextSibling.textContent = `${st.tempo}`; }, onchange: () => { manual.tempo = true; changed(); } }),
        el('b', {}, `${st.tempo}`)));
    fill(quick,
      el('label', { class: 'field' }, el('span', {}, 'Tonacja'),
        el('select', { class: 'jam-key', onchange: (e) => { const k = ALL_KEYS[Number(e.target.value)]; key = k; setKey(k); manual.key = true; changed(); } },
          el('optgroup', { label: 'Durowe' }, ALL_KEYS.map((k, i) => (k.mode === 'major' ? el('option', { value: i, selected: keyName(k) === keyName(key) }, keyName(k, true)) : null))),
          el('optgroup', { label: 'Molowe' }, ALL_KEYS.map((k, i) => (k.mode === 'minor' ? el('option', { value: i, selected: keyName(k) === keyName(key) }, keyName(k, true)) : null))))),
      el('label', { class: 'field' }, el('span', {}, 'Akordy'),
        el('select', { class: 'jam-prog', onchange: (e) => { st.prog[key.mode] = e.target.value; changed(); } },
          progsFor(key.mode).map((x) => el('option', { value: x.id, selected: x.id === p.id }, `${x.name} (${x.mood})`)),
          el('option', { value: 'custom', selected: custom }, 'Własna / edytor…'))),
      !custom ? el('button', { class: 'btn tiny', title: 'Skopiuj te akordy do edytora i zmieniaj je jak chcesz', onclick: () => editPreset() }, 'Edytuj te akordy') : null,
      seg('Twoja rola', Object.entries(ROLES).map(([r, info]) => [r, info.name, info.help]), st.role, (v) => { st.role = v; shown.mark = null; changed(); }),
      el('label', { class: 'field inline' }, el('input', { type: 'checkbox', checked: st.band, onchange: (e) => { st.band = e.target.checked; changed(); } }), el('span', {}, 'Perkusja i bas')));
    fill(customBox, custom ? customBuilder() : null);
    fill(controls,
      el('div', { class: 'jc-row' },
        seg('Takty na akord', [[1, '1'], [2, '2'], [4, '4']], st.bpc, (v) => { st.bpc = v; changed(); }),
        seg('Barwa', [['auto', 'Jak w stylu'], ['triads', 'Trójdźwięki'], ['sevenths', 'Septymy'], ['ninths', 'Nony']], st.color, (v) => { st.color = v; changed(); })),
      el('div', { class: 'jc-row' },
        seg('Co okrążenie: tonacja', [[0, 'ta sama tonacja'], [1, 'po kole →', 'C → G → D… (kwinta w górę, coraz więcej krzyżyków)'], [-1, 'po kole ←', 'C → F → B♭… (kwarta w górę, jak w jazzie)'], ['up', 'pół tonu w górę', 'C → D♭ → D → E♭… (po kolei jak na klawiaturze)']], st.walk, (v) => { st.walk = v; changed(); }),
        seg('Co okrążenie: tempo', [[0, 'stałe'], [2, '+2'], [4, '+4']], st.lapBpm, (v) => { st.lapBpm = v; changed(); }),
        el('label', { class: 'field inline' }, el('input', { type: 'checkbox', checked: st.click, onchange: (e) => { st.click = e.target.checked; changed(); } }), el('span', {}, 'Klik')),
        el('label', { class: 'field inline', title: 'Co 4 okrążenia (i przed nową tonacją) perkusja gra przejście, a nowa część zaczyna się od talerza.' }, el('input', { type: 'checkbox', checked: st.fills !== false, onchange: (e) => { st.fills = e.target.checked; changed(); } }), el('span', {}, 'Przejścia perkusji')),
        el('label', { class: 'field inline', title: 'Grasz cicho, zespół gra ciszej; grasz mocno, zespół też. Zmienia się od następnego okrążenia.' }, el('input', { type: 'checkbox', checked: st.follow !== false, onchange: (e) => { st.follow = e.target.checked; changed(); } }), el('span', {}, 'Zespół słucha twojej dynamiki'))),
      st.band ? el('p', { class: 'muted band-note' }, 'Perkusja idzie na kanale 10, bas na kanale 2, akordy zespołu na kanale 3 (jak wszystko, co Trener gra na pianinie). W Studio One każdy z nich ma swoją ścieżkę, a twoje pianino słucha tylko kanału 1. Bez ścieżek perkusji i basu wyłącz „Zespół”: wtedy bas gram na kanale 3.') : null,
      st.band ? el('div', { class: 'jc-row' }, seg('Perkusista', DRUMMERS.map(([v, t, d]) => [String(v), `${v}. ${t}`, d]), String(st.drummer), (v) => { st.drummer = Number(v); changed(); }),
        el('p', { class: 'muted jc-note' }, DRUMMERS.find(([v]) => v === st.drummer)[2])) : null,
      keysRow(seg, changed));
  }

  function customBuilder() {
    const steps = st.custom[key.mode] || (st.custom[key.mode] = []);
    const changedEd = () => { st.prog[key.mode] = 'custom'; store.save(); renderControls(); if (running) toast('Zmiana zabrzmi od następnego obrotu.'); else idleBoard(); };
    return el('div', { class: 'custom' }, progEditor(edUi, {
      key, steps, scaleId: st.scale,
      onChange: changedEd,
      preview: (step) => previewStep(step),
      onScale: (id) => { st.scale = id; if (id && scaleMode(id) !== key.mode) { const k = keyByTonic(key.tonicPc, scaleMode(id)); if (k) { key = k; setKey(k); manual.key = true; } } changedEd(); },
      onTranspose: (d) => { const k = keyByTonic(key.tonicPc + d, key.mode); if (k) { st.custom[k.mode] = steps; key = k; setKey(k); manual.key = true; changedEd(); toast(`Teraz ${keyName(k, true)}. Numery zostają, zmieniają się nazwy.`); } },
      onDetect: () => detectNow(),
      onSaveSong: () => saveAsSong(),
      onExportMidi: () => exportMidi(),
      onRekey: (k, sid) => {
        st.custom[k.mode] = rekey(steps, key, k);
        st.scale = (sid === 'dur' && k.mode === 'major') || (sid === 'moll' && k.mode === 'minor') ? null : sid;
        key = k; setKey(k); manual.key = true; edUi.ref = null;
        changedEd();
        toast(`Teraz ${keyName(k, true)}${st.scale ? `, skala ${st.scale}` : ''}. Akordy brzmią tak samo, zmieniły się numery.`, 'good');
      },
      heldNotes: () => [...held],
      lights: (notes, chord) => {
        if (!st.lights) return;
        const roles = new Map(chord.tones.map((t, j) => [t.pc, [t.name, chord.roles[j]]]));
        ctx.keyboard.mark(notes.map((n) => { const [nm, r] = roles.get(n % 12) || [chord.name.split('/').pop(), 'bas']; return { note: n, text: nm, sub: r, tone: ROLE_TONE[r] }; }));
      },
      toast: (t) => toast(t),
    }));
  }

  /** Play one editor chord (its voicing and bass) so a choice is heard at once. */
  function previewStep(step) {
    if (!step || normStep(step).k !== 'chord') return;
    const [e] = stepChords(key, [step], { color: st.color === 'auto' ? 'triads' : st.color });
    if (!e) return;
    const ch = KEYS_CH;
    const ev = [];
    e.voicing.forEach((n, i) => { ev.push({ t: i * 0.01, m: [0x90 | ch, n, 70] }, { t: 1.1, m: [0x80 | ch, n, 0] }); });
    if (e.bass != null) { const bc = st.band ? 1 : 0; ev.push({ t: 0, m: [0x90 | bc, e.bass, 72] }, { t: 1.1, m: [0x80 | bc, e.bass, 0] }); }
    playEvents(ev, { lead: 0.08 }).catch(() => {});
  }

  // what you played in the last minute, for "Wykryj tonację"
  const played = [];
  function detectNow() {
    const now = performance.now() / 1000;
    const hist = Array(12).fill(0);
    for (const p of played) if (now - p.t < 90) hist[p.pc] += 1;
    if (hist.reduce((a, x) => a + x, 0) < 12) { toast('Zagraj najpierw kilkanaście dźwięków albo akordów w tej tonacji, potem kliknij jeszcze raz.'); return; }
    const best = detectKey(hist)[0];
    const steps = st.custom[key.mode];
    if (st.prog[key.mode] === 'custom' && steps && steps.length) { st.custom[best.key.mode] = rekey(steps, key, best.key); edUi.ref = null; }   // the same chords, numbered in the new key
    key = best.key; setKey(best.key); manual.key = true; st.scale = null;
    store.save(); renderControls(); renderBelow(); if (!running) idleBoard();
    toast(`Brzmi jak ${keyName(best.key, true)}.`, 'good');
  }

  function saveAsSong() {
    const p = prog();
    const steps = st.custom[key.mode] || [];
    if (!steps.length) { toast('Najpierw dodaj akordy.'); return; }
    if (!Array.isArray(store.data.songs)) store.data.songs = [];
    const title = (window.prompt('Tytuł piosenki:', p.name === 'Własna' ? `Mój jam ${keyName(key)}` : p.name) || '').trim();
    if (!title) return;
    store.data.songs.unshift({ id: `s${Date.now().toString(36)}`, title, text: stepsToChart(key, steps, st.bpc) });
    store.save();
    toast(`„${title}” jest w Piosenkach.`, 'good');
  }

  /** A .mid file of 4 laps (band as set now) with the chord names as markers, for Studio One. */
  function exportMidi() {
    const o = opts();
    if (!o.prog.steps.some((x) => { const n = normStep(x); return n && n.k === 'chord' && !n.skip; })) { toast('Najpierw dodaj akordy.'); return; }
    const events = []; const markers = [];
    let at = 0; let prevVoicing = null;
    for (let lap = 0; lap < 4; lap++) {
      const cyc = jamCycle({ ...o, prevVoicing, bassLive: false, fill: lap === 3, crash: lap > 0, human: st.human, barOffset: Math.round(at / (60 / st.tempo * GROOVE[st.groove].beats)) });
      for (const e of cyc.events) events.push({ t: e.t + at, m: e.m });
      for (const c of cyc.chords) {
        for (const l of c.labels || []) if (l.label) markers.push({ t: at + c.start, text: l.label });
        if (lap === 0 || c.start === 0) markers.push({ t: at + c.start, text: c.chord.name });
      }
      prevVoicing = cyc.chords[cyc.chords.length - 1].voicing;
      at += cyc.seconds;
    }
    const g = GROOVE[st.groove];
    const name = `${prog().name} ${keyName(key)} ${st.tempo}`;
    const bytes = buildMidi({ tempo: st.tempo, beats: g.beats, events, markers, key: keySignature(key), name });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = el('a', { href: url, download: `${name.replace(/[^\w\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]+/g, '').trim() || 'jam'}.mid` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Plik MIDI pobrany: przeciągnij go do Studio One (4 okrążenia, nazwy akordów na osi).', 'good');
  }

  /** A built-in progression copied into the editor, so it can be changed. */
  function editPreset() {
    const p = prog();
    st.custom[key.mode] = p.steps.map((x) => normStep(x));
    st.customName = { ...(st.customName || {}), [key.mode]: `${p.name} (moja)` };
    st.prog[key.mode] = 'custom';
    edUi.open = null;
    store.save(); renderControls(); renderBelow(); if (!running) idleBoard();
  }

  /** The band's keys and the bass: arpeggio, humanization, bass that follows you. */
  function keysRow(seg, changed) {
    const a = st.arp;
    const ARP = [['styl', 'Jak w stylu'], ['akord', 'Akordy'], ['gora', 'W górę'], ['dol', 'W dół'], ['gora2', 'Co drugi w górę'], ['dol2', 'Co drugi w dół']];
    const arpOn = a.mode !== 'styl' && a.mode !== 'akord';
    const range = (label, val, set) => el('label', { class: 'field' }, el('span', {}, `${label} ${val}%`),
      el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(val), oninput: (e) => { e.target.previousSibling.textContent = `${label} ${e.target.value}%`; }, onchange: (e) => { set(Number(e.target.value)); changed(); } }));
    return el('div', { class: 'jc-row keys-row' },
      seg('Klawisze zespołu', ARP.map(([v, t]) => [v, t]), a.mode, (v) => { a.mode = v; changed(); }),
      arpOn ? el('label', { class: 'field' }, el('span', {}, 'Krok'),
        el('select', { onchange: (e) => { a.step = Number(e.target.value); changed(); } },
          [[1, 'ćwierćnuty'], [0.5, 'ósemki'], [1 / 3, 'triole'], [0.25, 'szesnastki']].map(([v, t]) => el('option', { value: String(v), selected: Math.abs(a.step - v) < 1e-6 }, t)))) : null,
      arpOn ? el('label', { class: 'field' }, el('span', {}, 'Głosy'),
        el('select', { onchange: (e) => { a.voices = Number(e.target.value); changed(); } }, [3, 4, 5, 6, 8].map((v) => el('option', { value: String(v), selected: a.voices === v }, String(v))))) : null,
      range('Humanizacja: czas', st.human.t, (v) => { st.human.t = v; }),
      range('Humanizacja: siła', st.human.v, (v) => { st.human.v = v; }),
      st.role === 'akordy' && st.band ? el('label', { class: 'field inline', title: 'Grasz inny akord niż zaplanowany? Bas przechodzi na twój od najbliższego uderzenia.' },
        el('input', { type: 'checkbox', checked: st.bassFollow, onchange: (e) => { st.bassFollow = e.target.checked; changed(); } }), el('span', {}, 'Bas słucha moich akordów')) : null);
  }

  function renderBelow() {
    const g = GROOVE[st.groove];
    const p = prog();
    fill(below,
      el('div', { class: 'jam-why' },
        el('details', { class: 'why', open: st.whyOpen === true, ontoggle: (e) => { st.whyOpen = e.target.open; store.save(); } }, el('summary', {}, `Dlaczego ${g.name} tak brzmi?`), el('p', {}, g.why)),
        el('details', { class: 'why', open: st.whyOpen === true, ontoggle: (e) => { st.whyOpen = e.target.open; store.save(); } }, el('summary', {}, `${p.name}: dlaczego te akordy?`), el('p', {}, p.why)),
        el('details', { class: 'why', open: st.whyOpen === true, ontoggle: (e) => { st.whyOpen = e.target.open; store.save(); } }, el('summary', {}, 'Co ćwiczysz w tej roli?'), el('p', {}, ROLES[st.role].help))),
      st.saved.length ? el('div', { class: 'saved' }, el('span', { class: 'doors-label' }, 'Moje jamy'),
        st.saved.map((s, i) => el('span', { class: 'saved-item' },
          el('button', { class: 'door', onclick: () => loadJam(s) }, s.name),
          el('button', { class: 'btn tiny ghost', 'aria-label': `Usuń ${s.name}`, onclick: () => { st.saved.splice(i, 1); store.save(); renderBelow(); } }, '×')))) : null);
  }

  function saveJam() {
    const p = prog();
    const g = GROOVE[st.groove];
    const s = { name: `${g.name} · ${p.name} · ${keyName(key)} · ${st.tempo}`, key: { i: wheelIndex(key), mode: key.mode }, groove: st.groove, prog: st.prog[key.mode] || p.id, custom: p.id === 'custom' ? JSON.parse(JSON.stringify(p.steps)) : null, tempo: st.tempo, bpc: st.bpc, color: st.color, role: st.role, scale: st.scale, arp: { ...st.arp }, human: { ...st.human } };
    st.saved = [s, ...st.saved.filter((x) => x.name !== s.name)].slice(0, 12);
    store.save();
    renderBelow();
    toast('Zapisane w „Moje jamy”.', 'good');
  }

  function loadJam(s) {
    const k = ALL_KEYS.find((x) => x.mode === s.key.mode && wheelIndex(x) === s.key.i);
    if (k) { key = k; setKey(k); }
    Object.assign(st, { groove: s.groove, tempo: s.tempo, bpc: s.bpc, color: s.color, role: s.role, scale: s.scale || null });
    if (s.arp) st.arp = { ...st.arp, ...s.arp };
    if (s.human) st.human = { ...st.human, ...s.human };
    st.prog[key.mode] = s.prog;
    if (s.custom) st.custom[key.mode] = JSON.parse(JSON.stringify(s.custom));
    store.save();
    renderControls(); renderBelow();
    if (running) toast('Zmiana zabrzmi od następnego obrotu.'); else idleBoard();
  }

  // --- board ------------------------------------------------------------------------------------------------------
  function boardView(chords, k, beatInBar, beats, info = null, turn = null) {
    const c = chords[k] ? chords[k].chord : null;
    const n = chords[(k + 1) % chords.length];
    const bk = info && info.key ? info.key : key;
    const fc = (x) => `fn ${fnClass(fnOf(bk, x))}`;
    fill(board,
      info ? el('div', { class: 'jb-status' }, el('b', {}, keyName(info.key, true)), ` · ${info.tempo} BPM · okrążenie ${info.lap + 1}`, info.nextKey ? el('span', {}, ` · następne: ${keyName(info.nextKey, true)}`) : null) : null,
      turn ? el('div', { class: `jb-turn ${turn}` }, turn === 'you' ? 'teraz ty' : 'słuchaj') : null,
      el('div', { class: 'jb-now' },
        el('div', { class: `jb-num ${c ? fc(c) : ''}` }, c ? c.number : '–'),
        el('div', { class: 'jb-main' },
          el('div', { class: 'jb-name' }, c ? c.name : 'Gotowy'),
          el('div', { class: 'jb-tones' }, c ? c.tones.map((t, j) => el('i', { style: { '--t': ROLE_TONE[c.roles[j]] } }, el('b', {}, t.name), el('span', {}, c.roles[j]))) : null)),
        el('div', { class: 'jb-next' }, el('span', {}, 'dalej'), el('b', { class: n ? fc(n.chord) : '' }, n ? el('i', {}, n.chord.number) : '', n ? `  ${n.chord.name}` : ''))),
      el('div', { class: 'jb-beats' }, Array.from({ length: Math.ceil(beats) }, (_, q) => el('i', { class: q === beatInBar ? 'on' : '' }))),
      el('div', { class: 'chord-strip jb-strip' }, chords.map((x, j) => [
        ...(x.labels || []).filter((l) => l.label).map((l) => el('span', { class: `cs-lab ${l.k}` }, l.label)),
        el('span', { class: `cs ${j === k ? 'now' : ''} ${x.rest ? 'rest' : fc(x.chord)}` }, el('b', {}, x.chord.number), ` ${x.chord.name}`)]).flat()));
  }

  function idleBoard() {
    const cyc = jamCycle({ ...opts() });
    boardView(cyc.chords, -1, -1, cyc.groove.beats);
    idleMarks(cyc.chords[0]);
  }

  function marksFor(c, next, inKey = key) {
    if (!st.lights || !c) return [];
    const ch = c.chord;
    const role = st.role;
    const pcRole = new Map(ch.tones.map((t, j) => [t.pc, [t.name, ch.roles[j]]]));
    const rootFn = (chObj, r) => (r === '1' ? fnColor(fnOf(inKey, chObj)) : undefined);
    if (role === 'solo') {
      const sc = scaleNotes(inKey, inKey.mode === 'major' ? 'dur' : 'moll', 60);
      const out = [];
      for (let m = 55; m <= 84; m++) {
        const pc = m % 12;
        if (pcRole.has(pc)) { const [nm, r] = pcRole.get(pc); out.push({ note: m, text: nm, sub: r, tone: ROLE_TONE[r], fn: rootFn(ch, r) }); }
        else { const s = sc.find((x) => x.pc === pc); if (s) out.push({ note: m, text: s.name, sub: s.deg, dim: true }); }
      }
      return out;
    }
    const roleMap = (x) => new Map(x.tones.map((t, j) => [t.pc, [t.name, x.roles[j]]]));
    const mk = (notes, chObj, ring) => {
      const map = roleMap(chObj);
      return notes.map((n) => { const [nm, r] = map.get(n % 12) || ['', '']; return { note: n, text: nm, sub: ring ? '' : r, tone: ROLE_TONE[r], ring, fn: ring ? undefined : rootFn(chObj, r) }; });
    };
    const now = mk(c.voicing, ch, false);
    if ((role === 'wszystko' || role === 'sluchaj') && c.bass != null) now.push(...mk([c.bass], ch, false));
    if (next) {
      const nn = mk(next.voicing, next.chord, true).filter((m) => !now.some((x) => x.note === m.note));
      return [...now, ...nn];
    }
    return now;
  }

  function idleMarks(c) {
    if (!c) { ctx.keyboard.mark([]); return; }
    ctx.keyboard.mark(marksFor(c, null));
  }

  // --- running ------------------------------------------------------------------------------------------------------
  /** Light update while playing: the summary line and the key list, without rebuilding the controls. */
  function syncKeyUI() {
    const g = GROOVE[st.groove];
    fill(setSummary, el('b', {}, 'Więcej ustawień'), el('span', {}, `${g.name} · ${prog().name} · ${keyName(key, true)} · ${st.tempo} BPM · ${ROLES[st.role].name} · barwa, takty, perkusista, klawisze zespołu…`));
    const sel = quick.querySelector('select.jam-key');
    if (sel && document.activeElement !== sel) sel.value = String(ALL_KEYS.findIndex((k) => keyName(k) === keyName(key)));
  }

  async function start() {
    stop(true);
    const token = runToken;
    const o = opts();
    manual = { key: false, tempo: false };
    if (!o.prog.steps.some((x) => { const n = normStep(x); return n && n.k === 'chord' && !n.skip; })) { toast('Najpierw ułóż własną progresję.'); return; }
    running = true;
    chalReset(); renderChal();
    startBtn.textContent = '■ Stop';
    startBtn.classList.add('running');
    const ci = countIn(o.groove, o.tempo, o.band);
    let t0;
    try { t0 = await playEvents(ci.events, { lead: 0.4 }); } catch { if (token === runToken) { running = false; startBtn.textContent = 'Start'; toast('Serwer Trenera nie odpowiada.'); } return; }
    if (!running || !alive || token !== runToken) return;
    await schedule(t0 + ci.seconds, null, 0, null, token, 0, null);
    loop();
  }

  async function schedule(at, prevVoicing, lap, prev, token, barOffset = 0, prevName = null) {
    if (!running || !alive || token !== runToken) return;
    const setup = lapSetup(prev);
    // a drum fill at the end of every 4th lap and before a new key; a crash where the new part starts
    const nextKeyPeek = st.walk ? stepKey(setup.key, st.walk) : null;
    const fills = st.fills !== false;
    const fill = fills && ((lap + 1) % 4 === 0 || (nextKeyPeek && keyName(nextKeyPeek) !== keyName(setup.key)));
    const crash = fills && lap > 0 && (lap % 4 === 0 || (prev && keyName(prev.key) !== keyName(setup.key)));
    const o = opts();   // the same settings for the sound and for the board (they may change while this lap is sent)
    const cyc = jamCycle({ ...o, key: setup.key, tempo: setup.tempo, prevVoicing, fill, crash, dyn: bandDyn(), barOffset });
    try { await playEvents(cyc.events, { at }); } catch { if (token === runToken) { toast('Serwer Trenera nie odpowiada.'); stop(); } return; }
    if (cyc.bassPlan && cyc.bassPlan.length) scheduleBass(cyc, at, token, setup.key);
    if (token !== runToken) return;            // stopped and started again meanwhile: the new run owns the timers
    if (!running) { bus.stop(); return; }
    const nextKey = st.walk ? stepKey(setup.key, st.walk) : null;
    const callResponse = !!o.callResponse;
    cycles.push({ start: at, ...cyc, key: setup.key, tempo: setup.tempo, lap, nextKey, barOffset, callResponse });
    if (cycles.length > 4) cycles.shift();
    addWindows(cyc, at, lap, barOffset, prevName, callResponse);
    const last = cyc.chords[cyc.chords.length - 1].voicing;
    const lastName = cyc.chords[cyc.chords.length - 1].chord.name;
    const lead = Math.min(1.5, cyc.seconds * 0.5);
    nextTimer = bus.at(at + cyc.seconds - lead, () => schedule(at + cyc.seconds, last, lap + 1, setup, token, barOffset + cyc.bars, lastName));
  }

  // Ty: akordy with "Bas słucha moich akordów": each bass note is decided a moment before it sounds,
  // from the chord you hold (if it is a chord), else from the plan
  const held = new Set();
  let bassTimers = [];
  function liveChord(k) {
    if (held.size < 3) return null;
    const r = identify([...held], k);
    return r && r.kind === 'chord' ? r : null;
  }
  function scheduleBass(cyc, at, token, k) {
    const n = cyc.chords.length;
    for (const it of cyc.bassPlan) {
      bassTimers.push(bus.at(at + it.t - 0.22, () => {
        if (token !== runToken || !running) return;
        const plan = cyc.chords[it.k];
        let ch = plan.chord;
        let rootM = plan.bass;
        const live = liveChord(k);
        if (live && live.name !== plan.chord.name) {
          ch = { ...live.chord, bassPc: null };
          rootM = 36; while (rootM % 12 !== live.rootPc) rootM++;
        }
        let next = null;
        for (let i = 1; i <= n && !next; i++) { const x = cyc.chords[(it.k + i) % n]; if (!x.rest) next = x.chord; }
        const note = bassMidi(it.what, ch, next || ch, rootM);
        playEvents([{ t: 0, m: [0x90 | it.ch, note, it.vel] }, { t: it.tEnd - it.t, m: [0x80 | it.ch, note, 0] }], { at: at + it.t }).catch(() => {});
      }));
    }
    if (bassTimers.length > 400) bassTimers = bassTimers.slice(-200);
  }

  /** Time windows of one lap: the first beat after every chord change (with a third), and your 2 bars in Pytanie–odpowiedź. */
  function addWindows(cyc, at, lap, barOffset, prevName, callResponse) {
    cyc.chords.forEach((x, k) => {
      const before = k ? cyc.chords[k - 1].chord.name : prevName;
      const pc = thirdPc(x.chord);
      if (x.chord.name === before || pc == null) return;
      tally.third.add({ start: at + x.start - 0.08, end: at + x.start + cyc.tm.beat, pc, lap });
    });
    if (callResponse) {
      for (let b = 0; b < cyc.bars; b++) {
        const gb = barOffset + b;
        if (answerBar(gb) && gb % 2 === 0) tally.qa.add({ start: at + b * cyc.tm.bar - 0.08, end: at + (b + 2) * cyc.tm.bar, pc: null, lap });
      }
    }
  }

  function renderChal() {
    if (!alive) return;
    if (!st.chal || !chalRole()) { fill(chalBox); return; }
    const pct = (x) => (x.n ? ` (${Math.round((x.ok / x.n) * 100)}%)` : '');
    let now;
    if (st.chal === 'ct') now = el('span', {}, 'Dźwięki akordu: ', el('b', {}, `${tally.ct.ok} z ${tally.ct.n}`), pct(tally.ct));
    else if (st.chal === 'third') now = el('span', {}, 'Tercja na zmianie: ', el('b', {}, `${tally.third.total.ok} z ${tally.third.total.n}`));
    else now = el('span', {}, 'Odpowiedzi (coś zagrane w twoich 2 taktach): ', el('b', {}, `${tally.qa.total.ok} z ${tally.qa.total.n}`));
    fill(chalBox, now, tally.lapLine ? el('span', { class: 'lap' }, tally.lapLine) : null,
      !running && !tally.ct.n && !tally.third.total.n && !tally.qa.total.n ? el('span', { class: 'lap' }, st.chal === 'qa' ? 'Zespół gra 2 takty, potem 2 takty są twoje. Start, gdy chcesz.' : 'Liczę od startu.') : null);
  }
  function lapLine(l) {
    if (st.chal === 'ct') { const x = tally.ctLaps.get(l) || { n: 0, ok: 0 }; return x.n ? `Okrążenie ${l + 1}: ${x.ok} z ${x.n} dźwięków akordu.` : ''; }
    if (st.chal === 'third') { const x = tally.third.lap(l); return x.n ? `Okrążenie ${l + 1}: ${x.ok} z ${x.n} zmian z tercją.` : ''; }
    if (st.chal === 'qa') { const x = tally.qa.lap(l); return x.n ? `Okrążenie ${l + 1}: odpowiedź w ${x.ok} z ${x.n} miejsc.` : ''; }
    return '';
  }

  function where(t) {
    for (let ci = cycles.length - 1; ci >= 0; ci--) {
      const c = cycles[ci];
      if (t >= c.start - 0.001 && t < c.start + c.seconds) {
        const rel = t - c.start;
        const k = c.chords.findIndex((x) => rel >= x.start && rel < x.end);
        return { c, ci, k, rel };
      }
    }
    return null;
  }

  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!running || !alive) return;
      const tnow = bus.now();
      const settled = tally.third.settle(tnow).length + tally.qa.settle(tnow).length;
      if (tally.summary && tnow >= tally.summary.at) { tally.lapLine = lapLine(tally.summary.lap) || tally.lapLine; tally.summary = null; renderChal(); }
      else if (settled) renderChal();
      const w = where(tnow);
      if (w && w.k >= 0) {
        const { c, k, rel } = w;
        const ch = c.chords[k];
        const beatInBar = Math.floor(((rel % c.tm.bar) + 1e-6) / c.tm.beat);
        const lastBeat = rel >= ch.end - c.tm.beat;
        const key2 = `${c.start}:${k}:${beatInBar}`;
        if (shown.key !== key2) {
          shown.key = key2;
          // po kole: when a new lap starts in a new key, the whole Trener follows (wheel, "Co ja gram?").
          // Only at the lap start, so a key picked by hand meanwhile is not undone.
          if (c.start !== shown.lap) {
            shown.lap = c.start;
            if (c.key && keyName(c.key) !== keyName(key) && !manual.key) { key = c.key; setKey(key); syncKeyUI(); }
            // the lap before is over: its counts as a plain line, once its last windows have closed
            if (c.lap > 0) tally.summary = { lap: c.lap - 1, at: c.start + (c.callResponse ? 2 * c.tm.bar : c.tm.beat) + 0.15 };
          }
          const gb = c.barOffset + Math.floor((rel + 1e-6) / c.tm.bar);
          boardView(c.chords, k, beatInBar, c.groove.beats, c, c.callResponse ? (answerBar(gb) ? 'you' : 'band') : null);
        }
        const markKey = `${c.start}:${k}:${lastBeat}`;
        if (shown.mark !== markKey) {
          shown.mark = markKey;
          let next = null;
          if (lastBeat) next = k + 1 < c.chords.length ? c.chords[k + 1] : (cycles[w.ci + 1] ? cycles[w.ci + 1].chords[0] : c.chords[0]);
          ctx.keyboard.mark(marksFor(ch, next && next.chord.name !== ch.chord.name ? next : null, c.key));
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function stop(silent = false) {
    const was = running;
    running = false;
    cancelAnimationFrame(raf);
    nextTimer && nextTimer();
    nextTimer = null;
    bassTimers.forEach((f) => f()); bassTimers = [];
    cycles = [];
    shown = { key: null, mark: null, lap: null };
    runToken++;
    // what was counted stays on screen; the windows of laps that will not sound are dropped
    tally.third.open = []; tally.qa.open = []; tally.summary = null;
    startBtn.textContent = 'Start';
    startBtn.classList.remove('running');
    if (was) bus.stop();
    if (!silent && alive) idleBoard();
  }

  function countChallenge(e) {
    const t = typeof e.ts === 'number' && Math.abs(e.ts - bus.now()) < 5 ? e.ts : bus.now();
    const pc = ((e.note % 12) + 12) % 12;
    tally.third.note(t, pc);
    tally.qa.note(t, pc);
    const w = where(t);
    if (w && w.k >= 0) {
      const ok = w.c.chords[w.k].chord.tones.some((x) => x.pc === pc);
      tally.ct.n++; if (ok) tally.ct.ok++;
      const l = tally.ctLaps.get(w.c.lap) || { n: 0, ok: 0 };
      l.n++; if (ok) l.ok++;
      tally.ctLaps.set(w.c.lap, l);
    }
    if (st.chal === 'ct') renderChal();
  }

  // --- trail ---------------------------------------------------------------------------------------------------------
  function pushTrail(e) {
    const pc = e.note % 12;
    const w = running ? where(e.ts) : null;
    const n = nameInKey(w && w.c.key ? w.c.key : key, pc);
    let kind = n.diatonic ? 'sc' : 'out';
    if (w && w.k >= 0 && w.c.chords[w.k].chord.tones.some((t) => t.pc === pc)) kind = 'ct';
    trail.push({ deg: n.deg, name: n.name, kind });
    if (trail.length > TRAIL) trail.shift();
    fill(trailBox, trail.map((t, i) => el('span', { class: `tr ${t.kind} ${i === trail.length - 1 ? 'last' : ''}`, title: t.name }, t.deg)));
  }

  renderControls();
  renderBelow();
  idleBoard();
  updateChalPick();
  fill(trailBox, el('span', { class: 'muted' }, 'Zagraj coś, a zobaczysz tu numery swoich dźwięków.'));

  return {
    onNote(e) {
      if (e.on) held.add(e.note); else held.delete(e.note);
      if (!e.on) return;
      played.push({ pc: e.note % 12, t: performance.now() / 1000 }); if (played.length > 300) played.shift();
      pushTrail(e); heard.push({ t: performance.now() / 1000, v: e.vel || 64 }); if (heard.length > 40) heard.shift();
      if (running) countChallenge(e);
    },
    pilotLabels: ['Start / Stop', 'Od nowa', 'Światła wł./wył.', 'Stop', 'Koniec'],
    onPilot(a) {
      if (a === 'start') { running ? stop() : start(); }
      if (a === 'repeat') start();
      if (a === 'hint') { st.lights = !st.lights; lightsBox.checked = st.lights; store.save(); shown.mark = null; if (!running) idleBoard(); toast(st.lights ? 'Światła włączone.' : 'Światła wyłączone. Graj z numerów.'); }
      if (a === 'pause') stop();
    },
    destroy() { alive = false; stop(true); ctx.keyboard.mark([]); },
  };
}
