// Progression editor (Jam and Piosenki), modelled on Chord Suggester: a list of steps, every chord can be changed
// (Rodzaj, Układ, Bas, Interwały); chords come from Co dalej, Propozycje, Stopnie, Kadencje, typed text, intervals or
// from what you hold on the keyboard; plus Pauza, Sekcja, Tekst, Modulacja (named keys, with shared chords),
// selection (duplicate, transpose, loop only these), undo/redo, matching scales. The caller owns the steps and saves.
import { el } from './ui.js';
import { QUALITY, PROGRESSIONS, degLabel, degreeOf, keyName } from './theory.js';
import { textToSteps } from './songs.js';
import {
  CATALOG, GROUPS, SEVEN_NOTE_SCALES, CADENCES, normStep, stepChord, suggestions, degreeGrid, outside, voicingOptions, pretty, CAT_BY_ID,
  nextMoves, matchingScales, modTargets, pivots, heldToStep, simpleSpell, degAlt, scaleOf, scaleName, sourceOf, stepChords,
} from './chords.js';

export { textToSteps };
import { fnOf, fnClass } from './colors.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const LENS = [[0, 'jak reszta'], [0.5, '½ taktu'], [1, '1 takt'], [2, '2 takty'], [3, '3 takty'], [4, '4 takty'], [8, '8 taktów']];
const ALTER_TABS = [['rodzaj', 'Rodzaj'], ['uklad', 'Układ'], ['bas', 'Bas'], ['interwaly', 'Interwały']];
const ADD_TABS = [['dalej', 'Co dalej'], ['prop', 'Propozycje'], ['stopnie', 'Stopnie'], ['kadencje', 'Kadencje'], ['wpisz', 'Wpisz'], ['zbuduj', 'Zbuduj']];
const IV_ROWS = [['2', 'sekunda', ['b2', '2', '#2']], ['3', 'tercja', ['b3', '3']], ['4', 'kwarta', ['4', '#4']], ['5', 'kwinta', ['b5', '5', '#5']],
  ['6', 'seksta', ['b6', '6', '#6']], ['7', 'septyma', ['bb7', 'b7', '7']], ['8', 'oktawa (podwojenie)', ['8']], ['9', 'nona', ['b9', '9', '#9']],
  ['10', 'decyma (podwojona tercja)', ['b10', '10']], ['11', 'undecyma', ['11', '#11']], ['12', 'duodecyma (podwojona kwinta)', ['12']], ['13', 'tercdecyma', ['b13', '13']]];
const ivNum = (tok) => /(\d+)$/.exec(tok)[1];
const clone = (x) => JSON.parse(JSON.stringify(x));

export function stepTokens(s) {
  if (s.f) return [...s.f];
  const c = CAT_BY_ID[s.q];
  return c ? [...c.toks] : ['1', '3', '5'];
}

/** Move a chord step by semitones (the sound moves, spelled plainly in the key). */
function shiftStep(key, s, semis) {
  const r = degreeOf(key, s.d, s.a);
  const pc = mod12(r.pc + semis);
  const sp = simpleSpell(key, pc);
  const da = degAlt(key, sp.li, pc);
  return { ...s, d: da.deg, a: da.alt };
}

/**
 * ui: kept by the caller across re-renders { open, tab, add, addTab, grp, sel:[], loopSel, hist, fut, last }.
 * api: { key, steps, scaleId, onChange(), preview(step), lights(notes|null), heldNotes(), onScale(id), onTranspose(semis),
 *        onDetect(), onRekey(key, scaleId, steps), onSaveSong(), onExportMidi(), toast(text), maxSteps }
 */
export function progEditor(ui, api) {
  const { key, steps } = api;
  const scaleId = api.scaleId || null;
  const max = api.maxSteps || 96;
  ui.sel = Array.isArray(ui.sel) ? ui.sel.filter((i) => i < steps.length) : [];
  ui.hist = ui.hist || []; ui.fut = ui.fut || [];
  // undo: remember the steps as they were before each change (the list is edited in place)
  if (ui.ref !== steps) { ui.ref = steps; ui.last = JSON.stringify(steps); ui.hist = []; ui.fut = []; }
  const changed = (preview) => {
    const now = JSON.stringify(steps);
    if (now !== ui.last) { ui.hist.push(ui.last); if (ui.hist.length > 60) ui.hist.shift(); ui.fut = []; ui.last = now; }
    api.onChange();
    if (preview) api.preview(preview);
  };
  const restore = (from, to) => { if (!from.length) return; to.push(JSON.stringify(steps)); const s = JSON.parse(from.pop()); steps.splice(0, steps.length, ...s); ui.last = JSON.stringify(steps); ui.open = null; ui.sel = []; api.onChange(); };
  const chordOf = (s) => stepChord(key, normStep(s));
  const scalePcs = scaleId ? new Set(scaleOf(key, scaleId).map((x) => x.pc)) : null;
  const tonesView = (c) => {
    const out = outside(key, c, scaleId);
    const bassOut = c.bassPc != null && !c.tones.some((t) => t.pc === c.bassPc) && (scalePcs ? !scalePcs.has(c.bassPc) : outside(key, { tones: [{ pc: c.bassPc }] }, null)[0]);
    const bassName = c.bassPc != null ? c.name.split('/').pop() : null;
    return el('span', { class: 'pe-tones' }, bassName ? el('i', { class: `pe-bass ${bassOut ? 'out' : ''}` }, `${bassName} /`) : null, c.tones.map((t, i) => el('i', { class: out[i] ? 'out' : '' }, t.name)));
  };
  const fnTag = (c) => {
    const q = CAT_BY_ID[c.quality];
    if (!q || !c.root) return null;
    const src = sourceOf(key, c.root.pc, q, scaleId);
    const short = { sec: src.text.split(':')[0].replace('dominanta wtórna ', ''), tt: 'sub', vii: src.text.split(':')[0].replace('dźwięk prowadzący ', ''), borrowed: 'pożycz.', aug6: 'Ger+6' }[src.kind];
    return short ? el('em', { class: 'pe-fn', title: src.text }, short) : null;
  };
  const chip = (step, label, onclick, extra = '', title = null) => {
    const c = chordOf(step);
    return el('button', { class: `pe-chip fn ${fnClass(fnOf(key, c))} ${extra}`, onclick, title: title || c.tones.map((t) => t.name).join(' ') },
      el('span', { class: 'pe-chip-top' }, el('b', {}, label || c.number), label && /\//.test(label) ? null : fnTag(c)), el('span', { class: 'pe-name' }, c.name), tonesView(c));
  };
  const norm = (i) => { const s = normStep(steps[i]); steps[i] = s; return s; };
  const insertMany = (list, { open = true } = {}) => {
    if (!list.length) return;
    const room = Math.max(0, max - steps.length);
    const add = list.slice(0, room).map((x) => clone(x));
    if (!add.length) { api.toast && api.toast('Progresja jest pełna.'); return; }
    const at = ui.open != null ? ui.open + 1 : steps.length;
    steps.splice(at, 0, ...add);
    ui.sel = [];
    const lastChord = add.map((x, k) => (x.k === 'chord' ? at + k : -1)).filter((x) => x >= 0).pop();
    if (open && lastChord != null) ui.open = lastChord;
    changed(add.find((x) => x.k === 'chord') || null);
  };
  const insert = (step) => insertMany([step]);

  // --- one row -------------------------------------------------------------------------------------------
  function row(raw, i) {
    const s = normStep(raw);
    const selected = ui.sel.includes(i);
    const selBox = el('input', { type: 'checkbox', class: 'pe-sel', 'aria-label': 'Zaznacz', checked: selected, onchange: (e) => { ui.sel = e.target.checked ? [...ui.sel, i] : ui.sel.filter((x) => x !== i); api.onChange(); } });
    const move = (d) => { const j = i + d; if (j < 0 || j >= steps.length) return; [steps[i], steps[j]] = [steps[j], steps[i]]; if (ui.open === i) ui.open = j; ui.sel = []; changed(); };
    const tools = el('span', { class: 'pe-tools' },
      el('button', { class: 'btn tiny ghost', 'aria-label': 'W górę', onclick: () => move(-1) }, '↑'),
      el('button', { class: 'btn tiny ghost', 'aria-label': 'W dół', onclick: () => move(1) }, '↓'),
      el('button', { class: 'btn tiny ghost', 'aria-label': 'Powiel', title: 'Powiel', onclick: () => { steps.splice(i + 1, 0, clone(norm(i))); ui.sel = []; changed(); } }, '⧉'),
      el('button', { class: 'btn tiny ghost', 'aria-label': 'Usuń', onclick: () => { steps.splice(i, 1); if (ui.open === i) ui.open = null; else if (ui.open > i) ui.open--; ui.sel = []; changed(); } }, '×'));
    const lenSel = (allowAll = true) => el('select', { class: 'pe-len', 'aria-label': 'Długość', onchange: (e) => { norm(i).bars = Number(e.target.value); changed(); } },
      LENS.filter(([v]) => allowAll || v).map(([v, t]) => el('option', { value: String(v), selected: (s.bars || 0) === v }, t)));
    if (s.k === 'sec' || s.k === 'text') {
      return el('div', { class: `pe-row pe-${s.k} ${selected ? 'sel' : ''}` }, selBox, el('span', { class: 'pe-kind' }, s.k === 'sec' ? 'Sekcja' : 'Tekst'),
        el('input', { type: 'text', value: s.label || '', placeholder: s.k === 'sec' ? 'Zwrotka, Refren…' : 'notatka', maxlength: '60', onchange: (e) => { norm(i).label = e.target.value; changed(); } }), tools);
    }
    if (s.k === 'mod') return modRow(s, i, selBox, tools, selected);
    if (s.k === 'rest') return el('div', { class: `pe-row pe-rest ${selected ? 'sel' : ''}` }, selBox, el('span', { class: 'pe-kind' }, 'Pauza'), lenSel(false), el('span', { class: 'muted' }, 'perkusja gra, akordów i basu nie ma'), tools);
    const c = chordOf(s);
    const open = ui.open === i;
    const show = () => { const [e] = stepChords(key, [s]); if (e && api.lights) api.lights([...(e.bass != null ? [e.bass] : []), ...e.voicing], e.chord); };
    return el('div', { class: `pe-item ${open ? 'open' : ''} ${s.skip ? 'skip' : ''} ${selected ? 'sel' : ''}` },
      el('div', { class: 'pe-row' }, selBox,
        el('button', { class: `btn tiny ghost pe-eye ${s.skip ? 'off' : ''}`, title: s.skip ? 'Pominięty: kliknij, żeby grał' : 'Gra: kliknij, żeby pominąć', 'aria-label': 'Pomiń', onclick: () => { norm(i).skip = !s.skip; changed(); } }, s.skip ? '◌' : '●'),
        el('button', { class: `pe-main fn ${fnClass(fnOf(key, c))}`, title: 'Posłuchaj i zobacz na klawiaturze', onclick: () => { ui.open = open ? null : i; if (!open) { show(); } changed(open ? null : s); } },
          el('b', { class: 'pe-num' }, c.number), el('span', { class: 'pe-name' }, c.name), fnTag(c), tonesView(c), s.vrel ? el('em', { class: 'pe-fn', title: 'Twój układ z klawiatury' }, 'twój układ') : null),
        lenSel(),
        el('button', { class: `btn tiny ${open ? 'primary' : ''}`, onclick: () => { ui.open = open ? null : i; changed(); } }, 'Zmień'),
        tools),
      open ? alterPanel(i, s, c) : null);
  }

  function modRow(s, i, selBox, tools, selected) {
    // the key before this modulation (earlier modulations count)
    const before = stepChords(key, [...steps.slice(0, i), [1, 0, 'maj']]);
    const k = before.length ? before[before.length - 1].key : key;
    const targets = modTargets(k);
    const to = keyFromShift(k, s);
    const piv = pivots(k, to);
    const cur = targets.findIndex((m) => m.shift === mod12(s.shift || 0) && m.mode === (s.mode || k.mode));
    return el('div', { class: `pe-mod-wrap ${selected ? 'sel' : ''}` },
      el('div', { class: 'pe-row pe-mod' }, selBox, el('span', { class: 'pe-kind' }, 'Modulacja'),
        el('select', { 'aria-label': 'Dokąd', onchange: (e) => { const v = e.target.value; const x = norm(i); if (v.startsWith('t')) { const m = targets[Number(v.slice(1))]; x.shift = m.shift; x.mode = m.mode; } else { x.shift = Number(v); x.mode = undefined; } changed(); } },
          targets.map((m, j) => el('option', { value: `t${j}`, selected: cur === j }, `do ${m.name}: ${keyName(m.key, true)}`)),
          el('optgroup', { label: 'o półtony (ten sam tryb)' }, [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7].map((v) => el('option', { value: String(v), selected: cur < 0 && (s.shift || 0) === v }, `${v > 0 ? '+' : ''}${v}`)))),
        el('span', { class: 'muted' }, `→ ${keyName(to, true)} od tego miejsca`), tools),
      piv.length ? el('div', { class: 'pe-pivots' }, el('span', { class: 'muted' }, 'Akordy wspólne (przez nie przejście brzmi gładko), kliknij, żeby wstawić przed modulacją:'),
        piv.map((p) => el('button', { class: 'btn tiny', onclick: () => { steps.splice(i, 0, clone(p.step)); ui.sel = []; changed(p.step); } }, `${p.name}: ${p.from} → ${p.to}`))) : null);
  }

  // --- Alter -----------------------------------------------------------------------------------------------
  function alterPanel(i, s, c) {
    const tab = ui.tab || 'rodzaj';
    const set = (patch) => { Object.assign(norm(i), patch); changed(steps[i]); };
    let body;
    if (tab === 'rodzaj') {
      const inKey = CATALOG.filter((q) => !outside(key, chordOf({ ...s, q: q.id, f: null, bass: null }), scaleId).some(Boolean));
      const grp = (name, list) => (list.length ? el('div', { class: 'pe-grp' }, el('span', { class: 'pe-grp-name' }, name),
        el('div', { class: 'pe-grid' }, list.map((q) => chip({ ...s, q: q.id, f: null, lock: 1, vrel: null }, degLabel(s.d, s.a) + QUALITY[q.id].num, () => set({ q: q.id, f: null, lock: 1, vrel: null }), s.q === q.id && !s.f ? 'on' : '')))) : null);
      body = [grp('Z tonacji (wszystkie dźwięki pasują)', inKey), ...GROUPS.map(([g, name]) => grp(name, CATALOG.filter((q) => q.group === g && !inKey.includes(q))))];
    } else if (tab === 'uklad') {
      const opts = voicingOptions(c);
      const cur = (o) => !s.vrel && JSON.stringify(o.set) === JSON.stringify({ inv: s.inv ?? null, oct: s.oct || 0, open: s.open ?? null, drop: s.drop ?? null });
      const group = (g, name) => { const list = opts.filter((o) => o.group === g); return list.length ? el('div', { class: 'pe-grp' }, el('span', { class: 'pe-grp-name' }, name),
        el('div', { class: 'pe-grid' }, list.map((o) => el('button', { class: `pe-chip ${cur(o) ? 'on' : ''}`, onclick: () => set({ ...o.set, vrel: null }) }, el('span', { class: 'pe-name' }, o.label))))) : null; };
      body = [el('div', { class: 'pe-grid' },
        el('button', { class: `pe-chip ${s.inv == null && s.open == null && s.drop == null && !s.oct && !s.vrel ? 'on' : ''}`, onclick: () => set({ inv: null, oct: 0, open: null, drop: null, vrel: null }) },
          el('b', {}, 'Auto'), el('span', { class: 'pe-name' }, 'najbliżej poprzedniego akordu (płynne prowadzenie głosów)')),
        api.heldNotes ? el('button', { class: `pe-chip ${s.vrel ? 'on' : ''}`, title: 'Przytrzymaj ten akord na klawiaturze tak, jak chcesz go słyszeć, i kliknij', onclick: () => {
          const h = heldToStep(api.heldNotes(), key);
          if (!h) { api.toast && api.toast('Przytrzymaj akord (co najmniej 3 dźwięki) i kliknij jeszcze raz.'); return; }
          set({ vrel: h.step.vrel });
        } }, el('b', {}, 'Mój układ'), el('span', { class: 'pe-name' }, 'przytrzymaj go na klawiaturze i kliknij')) : null),
      group('inv', 'Przewroty (↓ oktawa niżej, ↑ wyżej)'), group('drop', 'Drop 2 / drop 3 (jazzowe, szersze)'), group('open', 'Układy otwarte (rozstrzelone)')];
    } else if (tab === 'bas') {
      body = el('div', { class: 'pe-grid' }, [...Array(12).keys()].map((b) => {
        const st = { ...s, bass: b || null };
        return chip(st, b ? `bas +${b}` : 'bez', () => set({ bass: b || null }), (s.bass || 0) === b ? 'on' : '');
      }));
    } else {
      body = intervalBuilder(stepTokens(s), (toks) => set({ f: toks, vrel: null }));
    }
    return el('div', { class: 'pe-alter' },
      el('div', { class: 'seg-ctl small pe-tabs', role: 'tablist' }, ALTER_TABS.map(([v, t]) => el('button', { class: tab === v ? 'on' : '', role: 'tab', onclick: () => { ui.tab = v; changed(); } }, t))),
      el('div', { class: 'pe-body' }, body));
  }

  function intervalBuilder(toks, apply) {
    const pick = (num, tok) => {
      const next = toks.filter((t) => ivNum(t) !== num);
      if (tok) next.push(tok);
      apply(next.sort((a, b) => Number(ivNum(a)) - Number(ivNum(b))));
    };
    return el('div', { class: 'pe-iv' },
      el('div', { class: 'pe-iv-formula' }, el('span', {}, 'Wzór'), el('b', {}, toks.map(pretty).join(' – '))),
      el('label', { class: 'field inline' }, el('input', { type: 'checkbox', checked: toks.includes('1'), onchange: (e) => pick('1', e.target.checked ? '1' : null) }), el('span', {}, 'Pryma (1)')),
      IV_ROWS.map(([num, name, choices]) => {
        const cur = toks.find((t) => ivNum(t) === num) || null;
        return el('div', { class: 'pe-iv-row' }, el('span', { class: 'pe-iv-name' }, name),
          el('div', { class: 'seg-ctl small' }, el('button', { class: cur ? '' : 'on', onclick: () => pick(num, null) }, '×'),
            choices.map((tok) => el('button', { class: cur === tok ? 'on' : '', onclick: () => pick(num, tok) }, pretty(tok)))));
      }));
  }

  // --- Add ------------------------------------------------------------------------------------------------
  function addPanel() {
    const tab = ui.addTab || 'dalej';
    let body;
    if (tab === 'dalej') {
      const ref = ui.open != null ? steps[ui.open] : [...steps].reverse().find((x) => normStep(x).k === 'chord');
      const refC = ref ? chordOf(ref) : null;
      const moves = ref ? nextMoves(key, ref) : [];
      body = ref ? [el('p', { class: 'muted' }, `Po ${refC.number} ${refC.name}:`),
        el('div', { class: 'pe-grid' }, moves.map((m) => chip(m.step, m.label, () => insert({ ...m.step }), '', m.why)))]
        : el('p', { class: 'muted' }, 'Dodaj pierwszy akord, a podpowiem, co może być dalej.');
    } else if (tab === 'prop') {
      ui.grp = ui.grp || { tri: true };
      body = suggestions(key, scaleId).map((g) => el('details', { class: 'pe-grp', open: !!ui.grp[g.id], ontoggle: (e) => { ui.grp[g.id] = e.target.open; } },
        el('summary', { class: 'pe-grp-name' }, `${g.name} (${g.items.length})`),
        el('div', { class: 'pe-grid' }, g.items.map((it) => chip(it.step, it.label, () => insert({ ...it.step }))))));
    } else if (tab === 'stopnie') {
      body = degreeGrid(key).map((g) => el('div', { class: 'pe-grp' }, el('span', { class: 'pe-grp-name' }, g.name),
        el('div', { class: 'pe-grid' }, g.items.map((it) => chip(it.step, null, () => insert({ ...it.step }))))));
    } else if (tab === 'kadencje') {
      const one = (name, list, why) => el('button', { class: 'pe-chip', title: why || '', onclick: () => insertMany(list.map((x) => ({ lock: 1, ...normStep(x) }))) },
        el('b', {}, name), el('span', { class: 'pe-name' }, list.map((x) => chordOf(x).name).join(' – ')));
      body = [el('div', { class: 'pe-grp' }, el('span', { class: 'pe-grp-name' }, 'Kadencje (zakończenia)'), el('div', { class: 'pe-grid' }, CADENCES[key.mode].map(([n, l]) => one(n, l)))),
        el('div', { class: 'pe-grp' }, el('span', { class: 'pe-grp-name' }, 'Gotowe progresje (wstawiam całą)'), el('div', { class: 'pe-grid' }, PROGRESSIONS.filter((p) => p.mode === key.mode).map((p) => one(p.name, p.steps, p.why))))];
    } else if (tab === 'wpisz') {
      const area = el('textarea', { class: 'pe-text', rows: '2', placeholder: 'np. Dm7 G7 | Cmaj7 A7/C♯ % N.C.' }, ui.text || '');
      body = [el('p', { class: 'muted' }, 'Wpisz akordy jak w śpiewniku: spacja albo | między nimi, „%” powtarza poprzedni, N.C. to pauza. Działają basy (C/E) i H.'),
        area, el('button', { class: 'btn', onclick: () => {
          ui.text = area.value;
          const { steps: list, bad } = textToSteps(area.value, key);
          if (bad.length && api.toast) api.toast(`Nie rozumiem: ${bad.join(', ')}`);
          if (list.length) { ui.text = ''; insertMany(list); }
        } }, 'Dodaj te akordy')];
    } else {
      ui.build = ui.build || { d: 1, a: 0, f: ['1', '3', '5'] };
      const b = ui.build;
      const roots = [[1, 0], [2, -1], [2, 0], [3, -1], [3, 0], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0], [7, -1], [7, 0]];
      const step = { k: 'chord', d: b.d, a: b.a, q: 'maj', f: [...b.f], lock: 1 };
      body = [el('div', { class: 'pe-iv-row' }, el('span', { class: 'pe-iv-name' }, 'Od stopnia'),
        el('div', { class: 'seg-ctl small' }, roots.map(([d, a]) => el('button', { class: b.d === d && b.a === a ? 'on' : '', onclick: () => { b.d = d; b.a = a; changed(); } }, degLabel(d, a))))),
      intervalBuilder(b.f, (toks) => { b.f = toks; changed(); api.preview({ ...step, f: toks }); }),
      el('div', { class: 'pe-grid' }, chip({ ...step, f: [...b.f] }, null, () => insert({ ...step, f: [...b.f] }), 'big'), el('span', { class: 'muted' }, 'kliknij akord, żeby go dodać'))];
    }
    return el('div', { class: 'pe-add' },
      el('div', { class: 'seg-ctl small pe-tabs', role: 'tablist' }, ADD_TABS.map(([v, t]) => el('button', { class: tab === v ? 'on' : '', role: 'tab', onclick: () => { ui.addTab = v; changed(); } }, t))),
      el('p', { class: 'muted' }, ui.open != null ? 'Nowe akordy wstawię za zaznaczonym (otwartym).' : 'Nowe akordy dodam na końcu.'),
      el('div', { class: 'pe-body' }, body));
  }

  function scalesPanel() {
    const list = matchingScales(key, steps);
    if (!list.length) return el('div', { class: 'pe-add' }, el('p', { class: 'muted' }, 'Najpierw dodaj akordy.'));
    return el('div', { class: 'pe-add' }, el('span', { class: 'pe-grp-name' }, 'Skale, w których mieszczą się twoje akordy (kliknij: przepiszę numery na tę tonację, akordy brzmią tak samo)'),
      el('div', { class: 'pe-grid' }, list.map((m) => el('button', { class: `pe-chip ${m.fit === m.of ? 'on' : ''}`, onclick: () => { ui.scales = false; api.onRekey(m.key, m.scaleId); } },
        el('b', {}, `${m.fit} z ${m.of} akordów`), el('span', { class: 'pe-name' }, `${keyName(m.key, true).split('-')[0]} ${scaleName(m.scaleId)}`)))));
  }

  // selection tools
  const selTools = () => {
    if (!ui.sel.length) return null;
    const idx = [...ui.sel].sort((a, b) => a - b);
    const shift = (d) => { for (const i of idx) { const s = norm(i); if (s.k === 'chord') steps[i] = shiftStep(key, s, d); } changed(); };
    return el('div', { class: 'pe-seltools' }, el('b', {}, `Zaznaczone: ${idx.length}`),
      el('button', { class: 'btn tiny', onclick: () => { const copy = idx.map((i) => clone(normStep(steps[i]))); steps.splice(idx[idx.length - 1] + 1, 0, ...copy); ui.sel = copy.map((_, k) => idx[idx.length - 1] + 1 + k); changed(); } }, 'Powiel'),
      el('button', { class: 'btn tiny', title: 'Przesuń zaznaczone akordy o pół tonu w dół', onclick: () => shift(-1) }, '−½'),
      el('button', { class: 'btn tiny', title: 'Przesuń zaznaczone akordy o pół tonu w górę', onclick: () => shift(1) }, '+½'),
      el('button', { class: 'btn tiny', onclick: () => { for (const i of idx.reverse()) steps.splice(i, 1); ui.sel = []; ui.open = null; changed(); } }, 'Usuń'),
      el('label', { class: 'field inline', title: 'Jam gra tylko zaznaczone kroki, w kółko: ćwiczysz jedno przejście' },
        el('input', { type: 'checkbox', checked: !!ui.loopSel, onchange: (e) => { ui.loopSel = e.target.checked; api.onChange(); } }), el('span', {}, 'Graj tylko zaznaczone (pętla)')),
      el('button', { class: 'btn tiny ghost', onclick: () => { ui.sel = []; ui.loopSel = false; api.onChange(); } }, 'Odznacz'));
  };

  const nChords = steps.filter((s) => normStep(s).k === 'chord').length;
  const scaleLine = scaleOf(key, scaleId || (key.mode === 'minor' ? 'harm' : 'dur')).map((x) => x.name).join(' ');
  return el('div', { class: 'pe' },
    el('div', { class: 'pe-head' },
      el('label', { class: 'field' }, el('span', {}, 'Skala'),
        el('select', { onchange: (e) => api.onScale(e.target.value || null) },
          el('option', { value: '', selected: !scaleId }, `rodzina ${keyName(key, true)} (jak w Kole)`),
          SEVEN_NOTE_SCALES.map(([id, name]) => el('option', { value: id, selected: scaleId === id }, name)))),
      el('span', { class: 'pe-scale-notes' }, scaleLine),
      el('div', { class: 'pe-head-btns' },
        el('button', { class: 'btn tiny', title: 'Cofnij', disabled: !ui.hist.length, onclick: () => restore(ui.hist, ui.fut) }, '↶ Cofnij'),
        el('button', { class: 'btn tiny', title: 'Ponów', disabled: !ui.fut.length, onclick: () => restore(ui.fut, ui.hist) }, '↷'),
        el('button', { class: 'btn tiny', title: 'Z tego, co grałeś przed chwilą', onclick: () => api.onDetect() }, 'Wykryj tonację'),
        el('button', { class: `btn tiny ${ui.scales ? 'primary' : ''}`, title: 'W jakich skalach mieszczą się te akordy', onclick: () => { ui.scales = !ui.scales; api.onChange(); } }, 'Pasujące skale'),
        el('button', { class: 'btn tiny', title: 'Transponuj o pół tonu w dół', onclick: () => api.onTranspose(-1) }, '−½'),
        el('button', { class: 'btn tiny', title: 'Transponuj o pół tonu w górę', onclick: () => api.onTranspose(1) }, '+½'),
        api.onSaveSong ? el('button', { class: 'btn tiny', onclick: () => api.onSaveSong() }, 'Zapisz jako piosenkę') : null,
        api.onExportMidi ? el('button', { class: 'btn tiny', title: 'Plik .mid do Studio One: klawisze, bas, perkusja, nazwy akordów na osi', onclick: () => api.onExportMidi() }, 'Eksport MIDI') : null,
        el('button', { class: 'btn tiny ghost', onclick: () => { if (!steps.length || window.confirm('Wyczyścić całą progresję? (Cofnij przywróci)')) { steps.length = 0; ui.open = null; ui.sel = []; changed(); } } }, 'Wyczyść'))),
    ui.scales ? scalesPanel() : null,
    selTools(),
    el('div', { class: 'pe-list' }, steps.length ? steps.map(row) : el('p', { class: 'muted' }, 'Jeszcze pusto. Dodaj akord poniżej albo zagraj go i kliknij „+ To, co trzymam”.')),
    el('div', { class: 'pe-addbar' },
      el('button', { class: `btn ${ui.add ? 'primary' : ''}`, onclick: () => { ui.add = !ui.add; changed(); } }, ui.add ? 'Zamknij dodawanie' : '+ Akord'),
      api.heldNotes ? el('button', { class: 'btn', title: 'Przytrzymaj akord na klawiaturze i kliknij: dodam go z twoim układem i basem', onclick: () => {
        const h = heldToStep(api.heldNotes(), key);
        if (!h) { api.toast && api.toast('Przytrzymaj akord (co najmniej 3 dźwięki) i kliknij jeszcze raz.'); return; }
        insert(h.step);
        api.toast && api.toast(`Dodane: ${h.name}`);
      } }, '+ To, co trzymam') : null,
      el('button', { class: 'btn tiny', onclick: () => insertMany([{ k: 'rest', bars: 1 }], { open: false }) }, '+ Pauza'),
      el('button', { class: 'btn tiny', onclick: () => insertMany([{ k: 'sec', label: nChords ? 'Refren' : 'Zwrotka' }], { open: false }) }, '+ Sekcja'),
      el('button', { class: 'btn tiny', onclick: () => insertMany([{ k: 'text', label: '' }], { open: false }) }, '+ Tekst'),
      el('button', { class: 'btn tiny', onclick: () => { const m = modTargets(key)[2]; insertMany([{ k: 'mod', shift: m.shift, mode: m.mode }], { open: false }); } }, '+ Modulacja'),
      el('span', { class: 'muted' }, `${nChords} akordów`)),
    ui.add ? addPanel() : null);
}

function keyFromShift(k, s) {
  const m = modTargets(k).find((x) => x.shift === mod12(s.shift || 0) && x.mode === (s.mode || k.mode));
  if (m) return m.key;
  const list = stepChords(k, [{ k: 'mod', shift: s.shift || 0, mode: s.mode }, [1, 0, 'maj']]);
  return list.length ? list[0].key : k;
}
