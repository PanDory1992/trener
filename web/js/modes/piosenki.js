// Piosenki: your songs as chords → numbers in a key that fits your voice, played with you section by section,
// with "kroki do niej": what from the Koło is inside (family, borrowed chords, known progressions).
import * as bus from '../bus.js';
import { setKey } from '../key.js';
import * as store from '../store.js';
import { family, keyName, makeKey, PATTERNS, voicing, bassNote } from '../theory.js';
import { el, fill, add, toast } from '../ui.js';
import { Guide, WAYS } from './guide.js';
import { loopButton } from '../loopui.js';
import { playEvents } from './common.js';
import { loopOn } from '../loop.js';
import { GROOVE, GROOVE_GROUPS } from '../grooves.js';
import { BAND_MODES, songBand, chunkEvents, chordAt } from '../bandplay.js';
import { ROLE_TONE } from './kolo.js';
import * as M from '../mastery.js';
import { fnOf, fnColor, fnClass } from '../colors.js';
import { analyzePass } from '../feedback.js';
import { reviewBar } from '../reviewbar.js';
import {
  parseChart, guessKeys, numberOf, inFamily, moveChord, chordObj, shiftedKey, explainOutside, findProgressions,
  bestShift, degreeIn, sectionKey, STARTERS,
} from '../songs.js';

export const id = 'piosenki';
export const RANGE = [36, 84];

const semis = (n) => `${n} ${n === 1 ? 'półton' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'półtony' : 'półtonów'}`;
const NOTE = (m) => `${['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

function chordMarks(c, notes, fn = null) {
  return notes.map((n) => {
    const idx = c.tones.findIndex((t) => t.pc === ((n % 12) + 12) % 12);
    const role = idx >= 0 ? c.roles[idx] : '';
    const bass = c.bassPc != null && ((n % 12) + 12) % 12 === c.bassPc && idx < 0;
    return { note: n, text: idx >= 0 ? c.tones[idx].name : bass ? c.name.split('/')[1] : '', sub: bass ? 'bas' : role, tone: ROLE_TONE[role] || 'var(--mode)', fn: fn && role === '1' ? fnColor(fn) : undefined };
  });
}

export function mount(stage, ctx) {
  const st = store.mode(id);
  st.way = st.way || 'wait';
  st.tempo = st.tempo || 80;
  st.pattern = PATTERNS.some((p) => p.id === st.pattern) ? st.pattern : 'blok';
  st.show = st.show || 'both';
  st.bpc = [0, 1, 2].includes(st.bpc) ? st.bpc : 0;
  st.meta = st.meta || {};
  st.autoLights = st.autoLights !== false;
  st.bandMode = BAND_MODES.some(([v]) => v === st.bandMode) ? st.bandMode : 'rytm';
  st.who = st.who === 'sam' || BAND_MODES.some(([v]) => v === st.who) ? st.who : 'sam';   // who plays: you alone or with the band
  st.bandStyle = GROOVE[st.bandStyle] ? st.bandStyle : 'pop';
  if (!Array.isArray(store.data.songs)) store.data.songs = [];
  M.bind(store.data);
  // from a review or a hint: open this song, section and pattern
  const pre = ctx.preset || {};
  if (pre.song && [...store.data.songs, ...STARTERS].some((x) => x.id === pre.song)) {
    st.sel = pre.song;
    if (Number.isInteger(pre.section)) st.meta[pre.song] = { shift: 0, keyPick: 0, ...(st.meta[pre.song] || {}), section: pre.section };
    if (pre.pattern && PATTERNS.some((p) => p.id === pre.pattern)) st.pattern = pre.pattern;
    if (pre.way && WAYS[pre.way]) st.way = pre.way;
    store.save();
  }
  let alive = true;
  let editing = null;        // null | {id?, title, text}
  let capture = null;        // {what: 'voice'|'melody', lo?}
  let item = null;

  const listBox = el('div', { class: 'song-list' });
  const card = el('div', { class: 'song-card' });
  add(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Piosenki'),
      el('p', { class: 'mode-sub' }, 'Wklej akordy piosenki, którą chcesz śpiewać. Rozpiszę je na numery, przeniosę pod twój głos i zagram z tobą, część po części.'))),
    el('div', { class: 'songs' }, listBox, card));

  const strip = el('div', { class: 'gstrip' });
  const line = el('div', { class: 'kstatus' });
  const progBox = el('div', { class: 'mastery' });
  const fbBox = el('div', { class: 'p2-fb', 'aria-live': 'polite' });
  const revBox = el('div', { class: 'p2-bar' });
  let fbItem = null;
  const setStatus = (t, kind = '') => fill(line, el('span', { class: `ks ${kind}` }, t));
  let chartEls = [];
  const guide = new Guide({
    keyboard: ctx.keyboard, strip,
    onStatus: setStatus,
    onDone: ({ way, done, total }) => { if (way === 'show') setStatus('Teraz ty: „Graj ze mną”.'); else setStatus(done === total ? 'Cała część zagrana.' : `Zagrane ${done} z ${total}.`, done === total ? 'good' : ''); },
    onRun: () => refreshRunButtons(),
    onStep: (k, s) => { for (const e of chartEls) e.classList.toggle('now', !!s && Number(e.dataset.ci) === s.ci); },
    onPass: (res) => countPass(res),
    onFeedback: (fb) => {
      if (!alive) return;
      const a = analyzePass({ hits: fb.hits, steps: fb.steps });
      fill(fbBox, el('span', { class: 'fb-head' }, `Po przejściu · ${fb.tempo} BPM`), a.lines.map((l) => el('p', {}, l)));
    },
  });
  const reviews = reviewBar({ itemId: () => item, go: (v, x) => ctx.go && ctx.go(v, x), rerender: () => renderReview(), way: () => st.way });
  function renderReview() { if (alive) fill(revBox, reviews.banner()); }

  // --- data -----------------------------------------------------------------------------------------------
  const allSongs = () => [...store.data.songs.map((s) => ({ ...s, mine: true })), ...STARTERS.map((s) => ({ ...s, mine: false }))];
  const meta = (sid) => (st.meta[sid] = st.meta[sid] || { shift: 0, keyPick: 0, section: 0 });
  function current() {
    const songs = allSongs();
    return songs.find((s) => s.id === st.sel) || songs[0];
  }
  function analyse(song) {
    const chart = parseChart(song.text);
    const guesses = guessKeys(chart.chords).slice(0, 3);
    const m = meta(song.id);
    const orig = guesses.length ? guesses[Math.min(m.keyPick || 0, guesses.length - 1)].key : makeKey('C', 0, 'major');
    const key = shiftedKey(orig, m.shift || 0);
    const move = (c) => moveChord(c, orig, key);
    // a section may sit in the relative key (verse in a-moll, chorus in C-dur) or modulate
    const secOrig = chart.sections.map((sec) => sectionKey(orig, sec.chords));
    const secKey = secOrig.map((k) => shiftedKey(k, m.shift || 0));
    return { chart, guesses, orig, key, move, m, secOrig, secKey };
  }

  // --- progress ------------------------------------------------------------------------------------------------
  function countPass(res) {
    if (!item) return null;
    const r = M.recordPass(item, { ...res, day: store.today() });
    store.save();
    reviews.note(item, r.review);
    renderReview();
    if (r.events.length) toast(r.events.join(' '), r.after.stage > r.before.stage ? 'good' : '');
    renderProgress();
    if (r.after.stage !== r.before.stage) renderCard();
    return st.autoLights ? r.after.fade : 0;
  }
  const dots = (iid) => { const r = M.get(iid); return el('span', { class: `mdots s${r.stage}`, title: M.STAGE_NAMES[r.stage] }, el('i'), el('i'), el('i')); };
  function renderProgress() {
    if (!item) { fill(progBox); return; }
    const r = M.get(item);
    fill(progBox, dots(item),
      el('span', { class: 'm-text' }, el('b', {}, M.STAGE_NAMES[r.stage]), ` · światła: ${st.autoLights ? M.FADE_NAMES[r.fade] : 'zawsze pełne'}${r.best ? ` · najlepsze czyste tempo ${r.best}` : ''}`),
      el('button', { class: `pick small ${st.autoLights ? 'on' : ''}`, onclick: () => { st.autoLights = !st.autoLights; store.save(); renderCard(); } }, st.autoLights ? 'Światła: auto' : 'Światła: pełne'));
  }

  // --- list -----------------------------------------------------------------------------------------------------
  function renderList() {
    const sel = current();
    const pick = (s) => { guide.stop(); st.sel = s.id; editing = null; store.save(); renderList(); renderCard(); };
    const row = (s) => el('button', { class: `song-pick ${sel && s.id === sel.id && !editing ? 'on' : ''}`, onclick: () => pick(s) }, el('b', {}, s.title), s.note ? el('span', {}, s.note) : null);
    const mine = store.data.songs;
    if (document.body.classList.contains('compact')) {
      // phone: one line — the song list and "+"
      fill(listBox,
        el('select', { class: 'song-select', 'aria-label': 'Piosenka', onchange: (e) => pick(allSongs().find((s) => s.id === e.target.value)) },
          el('optgroup', { label: 'Moje' }, allSongs().filter((s) => s.mine).map((s) => el('option', { value: s.id, selected: sel && s.id === sel.id }, s.title))),
          el('optgroup', { label: 'Na start' }, allSongs().filter((s) => !s.mine).map((s) => el('option', { value: s.id, selected: sel && s.id === sel.id }, s.title)))),
        el('button', { class: 'btn primary small', onclick: () => { guide.stop(); editing = { title: '', text: '' }; renderCard(); } }, '+ Dodaj'));
      return;
    }
    fill(listBox,
      el('button', { class: 'btn primary song-add', onclick: () => { guide.stop(); editing = { title: '', text: '' }; renderList(); renderCard(); } }, '+ Dodaj piosenkę'),
      el('div', { class: 'song-group' }, 'Moje'),
      mine.length ? allSongs().filter((s) => s.mine).map(row) : el('p', { class: 'muted small' }, 'Jeszcze nic. Wklej akordy swojej piosenki.'),
      el('div', { class: 'song-group' }, 'Na start (same akordy, uproszczone)'),
      allSongs().filter((s) => !s.mine).map(row));
  }

  // --- editor ----------------------------------------------------------------------------------------------------
  function renderEditor() {
    const title = el('input', { class: 'song-title-in', placeholder: 'Tytuł (np. Ain’t No Sunshine)', value: editing.title || '' });
    const area = el('textarea', { class: 'song-text-in', rows: '14', spellcheck: 'false', placeholder: '[Zwrotka]\nAm       Em        G       Am\n(tekst pod akordami, jeśli chcesz)\n\n[Refren]\n| C | G | Am | F |' });
    area.value = editing.text || '';
    const preview = el('p', { class: 'muted' });
    const upd = () => {
      const r = parseChart(area.value);
      const g = guessKeys(r.chords)[0];
      fill(preview, r.chords.length ? `Rozpoznane: ${r.sections.length} ${r.sections.length === 1 ? 'część' : 'części'} (${r.sections.map((s) => s.name).join(', ')}), ${r.chords.length} akordów, tonacja ${keyName(g.key, true)}.` : 'Wklej akordy: z Ultimate Guitar albo z kartki. Części oznacz np. [Zwrotka], [Refren]. Takty możesz oddzielić kreską |.');
    };
    area.addEventListener('input', upd);
    upd();
    const save = () => {
      const r = parseChart(area.value);
      if (!r.chords.length) { toast('Nie widzę akordów. Wklej linie z akordami (C, Am, F#m7…).'); return; }
      const t = title.value.trim() || 'Bez tytułu';
      if (editing.id) { const s = store.data.songs.find((x) => x.id === editing.id); if (s) { s.title = t; s.text = area.value; } }
      else { const nid = `s${Date.now().toString(36)}`; store.data.songs.unshift({ id: nid, title: t, text: area.value }); st.sel = nid; }
      editing = null; store.save(); renderList(); renderCard();
    };
    fill(card,
      el('h2', {}, editing.id ? 'Popraw piosenkę' : 'Nowa piosenka'),
      title, area, preview,
      el('p', { class: 'muted small' }, 'Tekst piosenki zostaje tylko u ciebie, na tym komputerze. Liczą się linie z akordami; linia tekstu pod nimi pokaże się pod akordami.'),
      el('div', { class: 'play-row' },
        el('button', { class: 'btn primary', onclick: save }, 'Zapisz'),
        el('button', { class: 'btn', onclick: () => { editing = null; renderList(); renderCard(); } }, 'Anuluj')));
    title.focus();
  }

  // --- the song ---------------------------------------------------------------------------------------------------
  let runBtns = null;
  function refreshRunButtons() {
    if (!runBtns) return;
    const r = guide.running, w = guide.way;
    const set = (b, stop, label) => { b.textContent = stop ? '■ Stop' : label; b.classList.toggle('stop', stop); };
    set(runBtns.show, r && w === 'show', 'Pokaż');
    set(runBtns.play, r && w !== 'show', 'Graj ze mną');
  }

  function stepsFor(sec, move, beatsList, skey) {
    const pat = PATTERNS.find((p) => p.id === st.pattern) || PATTERNS[0];
    const steps = [];
    let prev = null;
    sec.chords.forEach((raw, ci) => {
      const c = chordObj(move(raw));
      const fn = fnOf(skey, c);
      const v = voicing(c, { prev, center: 64, lo: 55, hi: 74 });
      prev = v;
      const root = bassNote(c, 43);
      const dur = beatsList[ci];
      if (pat.id === 'blok') {
        const notes = [root, ...v];
        steps.push({ notes, marks: chordMarks(c, notes, fn), label: c.name, sub: numberOf(skey, move(raw)), beats: dur, vel: 58, ci, fn });
        return;
      }
      // the pattern repeated over the chord's length (cut where the chord ends)
      const byBeat = new Map();
      for (let off = 0; off < dur; off += pat.beats) {
        for (const [b, what] of pat.ev) {
          if (off + b >= dur) continue;
          const n = what === 'R' ? [root] : what === '5' ? [root + 7] : what === 'C' ? v : [v[Number(what.slice(1)) % v.length]];
          if (!byBeat.has(off + b)) byBeat.set(off + b, []);
          byBeat.get(off + b).push(...n);
        }
      }
      const beats = [...byBeat.keys()].sort((a, b) => a - b);
      beats.forEach((b, j) => {
        const notes = [...new Set(byBeat.get(b))];
        const nextB = j + 1 < beats.length ? beats[j + 1] : dur;
        const names = notes.map((x) => { const t = c.tones.find((tt) => tt.pc === ((x % 12) + 12) % 12); return t ? t.name : ''; });
        steps.push({ notes, marks: chordMarks(c, notes, fn), label: j === 0 ? c.name : names.length > 2 ? c.name : names.join(' '), sub: j === 0 ? numberOf(skey, move(raw)) : notes.length === 1 ? 'bas' : '', beats: nextB - b, vel: 56, exact: true, ci, fn });
      });
    });
    return steps;
  }

  function renderChart(a, secIdx) {
    chartEls = [];
    const { chart, move } = a;
    const label = (raw, si) => {
      const c = chordObj(move(raw));
      const num = numberOf(a.secKey[si], move(raw));
      const fc = `fn ${fnClass(fnOf(a.secKey[si], c))}`;
      if (st.show === 'names') return [el('b', {}, c.name)];
      if (st.show === 'nums') return [el('b', { class: fc }, num)];
      return [el('b', {}, c.name), el('i', { class: fc }, num)];
    };
    return el('div', { class: `song-chart show-${st.show}` }, chart.sections.map((sec, si) => {
      let ci = 0;
      return el('section', { class: `sc-sec ${si === secIdx ? 'on' : ''}` },
        el('button', { class: 'sc-name', onclick: () => { guide.stop(); a.m.section = si; store.save(); renderCard(); } }, sec.name,
          keyName(a.secOrig[si]) !== keyName(a.orig) || a.secOrig[si].mode !== a.orig.mode ? el('span', { class: 'sc-key' }, ` · ${keyName(a.secKey[si], true)}`) : null),
        sec.lines.map((ln) => el('div', { class: 'sc-line' },
          ln.chords.length ? el('div', { class: 'sc-chords' }, ln.chords.map((t) => {
            const myCi = ci++;
            const raw = t.chord;
            const e = el('span', { class: `sc-ch ${inFamily(a.secOrig[si], raw) ? '' : 'out'}`, style: { left: `${t.col}ch` }, 'data-ci': si === secIdx ? String(myCi) : '', 'data-sc': `${si}:${myCi}`, title: 'Kliknij: zagram ten akord',
              onclick: () => { const c = chordObj(move(raw)); const v = voicing(c, { center: 64, lo: 55, hi: 74 }); const notes = [bassNote(c, 43), ...v]; ctx.keyboard.mark(chordMarks(c, notes, fnOf(a.secKey[si], c))); soft(notes); } }, ...label(raw, si));
            if (si === secIdx) chartEls.push(e);
            return e;
          })) : null,
          ln.lyric != null ? el('div', { class: 'sc-lyric' }, ln.lyric) : null)));
    }));
  }

  function soft(notes, dur = 1.2, vel = 52) {
    const ev = [];
    notes.forEach((n, i) => { ev.push({ t: i * 0.012, m: [0x90, n, vel] }, { t: dur, m: [0x80, n, 0] }); });
    playEvents(ev, { lead: 0.05 }).catch(() => {});
  }

  function voiceRow(a) {
    const voice = store.data.settings.voice || null;
    const mel = a.m.melody || null;
    const fit = voice && mel ? bestShift(mel, voice) : null;
    const nowShift = a.m.shift || 0;
    const nowOct = a.m.octave || 0;
    const octTxt = (o) => (o < 0 ? ', śpiewasz oktawę niżej' : o > 0 ? ', śpiewasz oktawę wyżej' : '');
    let advice = null;
    if (fit) {
      const target = shiftedKey(a.orig, fit.shift);
      const T = nowShift + 12 * nowOct;
      const cur = { low: mel.lo + T - voice.lo, high: voice.hi - (mel.hi + T) };
      const curTxt = cur.low >= 0 && cur.high >= 0 ? `Teraz pasuje${octTxt(nowOct)}: zapas ${semis(cur.low)} na dole, ${semis(cur.high)} na górze.` : cur.low < 0 ? `Teraz za nisko o ${semis(-cur.low)}${octTxt(nowOct)}.` : `Teraz za wysoko o ${semis(-cur.high)}${octTxt(nowOct)}.`;
      const same = fit.shift === nowShift && fit.octave === nowOct;
      advice = el('span', { class: 'voice-advice' }, curTxt, ' ',
        fit.fits
          ? (same ? el('b', {}, 'To najlepsza tonacja dla ciebie.') : el('button', { class: 'pick small on', onclick: () => { a.m.shift = fit.shift; a.m.octave = fit.octave; store.save(); renderCard(); } }, `Najlepiej ${keyName(target, true)} (${fit.shift > 0 ? '+' : ''}${fit.shift}${octTxt(fit.octave)}): zapas ${fit.room.low} / ${fit.room.high}`))
          : el('b', {}, `Melodia jest szersza niż twój zakres o ${semis(-Math.min(fit.room.low, fit.room.high))}. Wybierz, czy wolisz zapas na dole, czy na górze.`));
    }
    return el('div', { class: 'voice-row' },
      el('span', {}, 'Twój głos: ', el('b', {}, voice ? `${NOTE(voice.lo)}–${NOTE(voice.hi)}` : 'nieustawiony'), ' '),
      el('button', { class: 'pick small', onclick: () => { capture = { what: 'voice' }; setStatus('Zagraj na klawiaturze najniższy dźwięk, który śpiewasz swobodnie.', 'turn'); } }, voice ? 'zmień' : 'ustaw'),
      el('span', {}, ' · Melodia: ', el('b', {}, mel ? `${NOTE(mel.lo)}–${NOTE(mel.hi)}` : '?'), ' '),
      el('button', { class: 'pick small', title: 'Zagraj najniższy i najwyższy dźwięk melodii tak, jak śpiewasz ją w oryginalnej tonacji', onclick: () => { capture = { what: 'melody' }; setStatus(`Zagraj najniższy dźwięk melodii (tak, jak ją śpiewasz w ${keyName(a.orig, true)}).`, 'turn'); } }, mel ? 'zmień' : 'ustaw'),
      advice);
  }

  function stepsInside(a, sec) {
    const { orig, key, chart, move } = a;
    const all = chart.chords;
    const seen = new Set();
    const outside = [];
    // each chord judged in its own section's key (a chorus in the relative major has its own family)
    chart.sections.forEach((s, si) => {
      for (const c of s.chords) {
        if (inFamily(a.secOrig[si], c)) continue;
        const tag = `${c.pc}:${c.quality}`;
        if (seen.has(tag)) continue;
        seen.add(tag);
        const mc = move(c);
        const sk = a.secKey[si];
        const where = keyName(sk) !== keyName(key) || sk.mode !== key.mode ? ` (w ${s.name}, ${keyName(sk, true)})` : '';
        outside.push(explainOutside(sk, mc, s.chords).replace(/^[^:]+:/, `${chordObj(mc).name} (${numberOf(sk, mc)})${where}:`));
      }
    });
    const progs = findProgressions(orig, sec ? sec.chords : all);
    const progsAll = progs.length ? progs : findProgressions(orig, all);
    const goKolo = (preset) => ctx.go && ctx.go('kolo', { preset: { key: { li: key.li, acc: key.acc, mode: key.mode }, ...preset } });
    const fam = family(key, false);
    const used = new Set(all.filter((c) => inFamily(orig, c)).map((c) => degreeIn(orig, c).deg));
    return el('details', { class: 'why song-steps', open: st.stepsOpen !== false },
      el('summary', { onclick: (e) => { st.stepsOpen = !e.currentTarget.parentNode.open; store.save(); } }, 'Kroki do niej'),
      el('p', {}, el('b', {}, `Tonacja: ${keyName(key, true)}. `), `Z rodziny używa: ${[...used].sort().map((d) => `${fam[d - 1].number} (${fam[d - 1].name})`).join(', ') || 'nic'}.`),
      el('div', { class: 'doors' },
        el('button', { class: 'door', onclick: () => goKolo({ tab: 'akordy' }) }, `Rodzina akordów ${keyName(key, true)} →`),
        el('button', { class: 'door', onclick: () => goKolo({ tab: 'gama', scale: key.mode === 'major' ? 'dur' : 'moll' }) }, `Gama ${keyName(key, true)} →`),
        progsAll.map((p) => el('button', { class: 'door', onclick: () => goKolo({ tab: 'progresje', prog: p.id }) }, `Progresja „${p.name}” →`)),
        el('button', { class: 'door', onclick: () => jamWith(a, sec) }, 'Zagraj z zespołem / edytuj w Jamie →')),
      outside.length ? el('div', {}, el('p', { class: 'muted' }, 'Spoza rodziny (szare, podkreślone kreskami):'), el('ul', {}, outside.map((t) => el('li', {}, t)))) : el('p', { class: 'muted' }, 'Wszystkie akordy są z rodziny tej tonacji.'));
  }

  /** Editor steps for sections: sections stay as markers, half-bar chords stay half a bar, slash basses (C/E) stay. */
  function songSteps(a, secs) {
    const steps = [];
    for (const s of secs) {
      if (secs.length > 1) steps.push({ k: 'sec', label: s.name });
      s.chords.forEach((c, i) => {
        const mc = a.move(c); const d = degreeIn(a.key, mc);
        const step = { k: 'chord', d: d.deg, a: d.alt, q: mc.quality, bars: st.bpc ? st.bpc : (s.beats[i] || 4) / 4, lock: 1 };
        if (mc.bass && mc.bass.pc !== mc.pc) step.bass = (((mc.bass.pc - mc.pc) % 12) + 12) % 12;
        steps.push(step);
      });
    }
    return steps;
  }

  function jamWith(a, sec) {
    const steps = songSteps(a, sec ? [sec] : a.chart.sections);
    steps.splice(64);
    ctx.go && ctx.go('jam', { preset: { song: { title: `${current().title}${sec ? ` · ${sec.name}` : ''}`, key: { li: a.key.li, acc: a.key.acc, mode: a.key.mode }, steps } } });
  }

  // --- the band plays the song with you (no detour through Jam) ---------------------------------------------------
  let band = null;        // { gen, timers: [], raf, whole }
  let bandGen = 0;
  let bandBtns = null;
  const bandStyleOf = (sid) => (GROOVE[meta(sid).style] ? meta(sid).style : st.bandStyle);
  function bandLight(sc) {
    for (const e of card.querySelectorAll('.sc-ch.band-now')) e.classList.remove('band-now', 'now');
    if (sc) { const e = card.querySelector(`.sc-ch[data-sc="${sc}"]`); if (e) e.classList.add('band-now', 'now'); }
  }
  function refreshBandButtons() {
    if (!bandBtns) return;
    const set = (b, on, label) => { b.textContent = on ? '■ Stop' : label; b.classList.toggle('stop', on); };
    set(bandBtns.part, !!band && !band.whole, '▶ Ta część');
    set(bandBtns.whole, !!band && band.whole, '▶ Cała piosenka');
  }
  function stopBand(silence = true) {
    if (!band) return;
    for (const c of band.timers) { try { c(); } catch { /* gone */ } }
    cancelAnimationFrame(band.raf);
    band = null;
    bandLight(null);
    if (silence) bus.stop();
    refreshBandButtons();
  }
  async function startBand(whole) {
    guide.stop();
    stopBand(false);
    bus.stop();
    const song = current();
    const a = analyse(song);
    const secIdx = Math.min(a.m.section || 0, a.chart.sections.length - 1);
    const sis = whole ? a.chart.sections.map((_, i) => i) : [secIdx];
    const steps = songSteps(a, sis.map((i) => a.chart.sections[i]));
    const where = sis.flatMap((si) => a.chart.sections[si].chords.map((_, ci) => ({ si, ci })));   // played chord k → place on the chart
    if (!where.length) return;
    const gen = ++bandGen;
    band = { gen, timers: [], raf: 0, whole };
    refreshBandButtons();
    const groove = bandStyleOf(song.id);
    const tempo = st.tempo;
    let barOffset = 0;
    let lap = 1;
    const playPass = async (at) => {
      const pass = songBand({ key: a.key, steps, groove, tempo, mode: st.who === 'sam' ? st.bandMode : st.who, drummer: 3, barOffset, lead: at == null });
      barOffset += pass.bars;
      const parts = chunkEvents(pass.events);
      let t0;
      try { t0 = await playEvents(parts[0].events, at == null ? { lead: 0.3 } : { at }); } catch { if (band && band.gen === gen) { setStatus('Serwer Trenera nie odpowiada.', 'bad'); stopBand(false); } return; }
      if (!band || band.gen !== gen) return;
      for (const p of parts.slice(1)) playEvents(p.events, { at: t0 + p.offset }).catch(() => {});
      const end = t0 + pass.seconds;
      band.pass = { t0, chords: pass.chords, leadIn: pass.leadIn, end };
      // shortly before the end: another pass (Pętla) or the end
      band.timers.push(bus.at(end - 0.8, () => {
        if (!band || band.gen !== gen) return;
        if (loopOn()) { lap++; playPass(end); } else band.timers.push(bus.at(end + 0.1, () => { if (band && band.gen === gen) { stopBand(false); setStatus('Koniec. Zagrać jeszcze raz?'); } }));
      }));
    };
    const names = a.chart.sections;
    let lastSc = '';
    const tick = () => {
      if (!band || band.gen !== gen || !alive) return;
      const p = band.pass;
      if (p) {
        const now = bus.now();
        // the next pass starts right at the end of this one
        const k = chordAt(p.chords, now - p.t0);
        const sc = k >= 0 && where[k] ? `${where[k].si}:${where[k].ci}` : '';
        if (sc !== lastSc) {
          lastSc = sc;
          bandLight(sc);
          if (k >= 0 && where[k]) setStatus(`Zespół gra${lap > 1 ? ` (${lap}. raz)` : ''} · ${names[where[k].si].name} · ${p.chords[k].name || ''}`, 'listen');
          else if (now < p.t0 + p.leadIn) setStatus('Odliczam takt…', 'listen');
        }
      }
      band.raf = requestAnimationFrame(tick);
    };
    band.raf = requestAnimationFrame(tick);
    await playPass(null);
  }
  const WHO = [['sam', 'Sam', 'Bez zespołu: świecę klawisze i czekam albo prowadzę w tempie.'], ...BAND_MODES];
  /** The bar above the keyboard: who plays, then the buttons for that (always in the same place). */
  function dockRow(song, guideCtl) {
    const who = el('div', { class: 'seg-ctl small who-seg', role: 'radiogroup', 'aria-label': 'Kto gra' },
      WHO.map(([v, t, help]) => el('button', { class: st.who === v ? 'on' : '', role: 'radio', 'aria-checked': String(st.who === v), title: help,
        onclick: () => { if (st.who === v) return; stopBand(); guide.stop(); bus.stop(); st.who = v; if (v !== 'sam') st.bandMode = v; store.save(); renderCard(); } }, t)));
    if (st.who === 'sam') {
      bandBtns = null;
      const { show, play, ways, tempo } = guideCtl;
      runBtns = { show, play };
      return el('div', { class: 'play-row' }, who, show, play, loopButton(), ways, tempo);
    }
    runBtns = null;
    const part = el('button', { class: 'btn primary', title: 'Zespół gra zaznaczoną część piosenki', onclick: () => { if (band && !band.whole) stopBand(); else startBand(false); } }, '');
    const whole = el('button', { class: 'btn', title: 'Zespół gra całą piosenkę od początku', onclick: () => { if (band && band.whole) stopBand(); else startBand(true); } }, '');
    bandBtns = { part, whole };
    refreshBandButtons();
    const style = bandStyleOf(song.id);
    const styleSel = el('select', { class: 'band-style', 'aria-label': 'Styl zespołu', title: 'Styl zespołu (zapamiętany dla tej piosenki)', onchange: (e) => { meta(song.id).style = e.target.value; st.bandStyle = e.target.value; store.save(); renderCard(); } },
      GROOVE_GROUPS.map(([n, ids]) => el('optgroup', { label: n }, ids.filter((gid) => GROOVE[gid]).map((gid) => el('option', { value: gid, selected: gid === style }, `${GROOVE[gid].name} · ${GROOVE[gid].meter}`)))));
    return el('div', { class: 'play-row' }, who, styleSel, part, whole, loopButton(), guideCtl.tempo);
  }

  function renderCard() {
    guide.stop();
    stopBand();
    if (editing) return renderEditor();
    const song = current();
    if (!song) { fill(card, el('p', {}, 'Dodaj piosenkę.')); return; }
    const a = analyse(song);
    const { chart, guesses, orig, key, m } = a;
    if (!chart.sections.length) { fill(card, el('h2', {}, song.title), el('p', {}, 'Nie widzę tu akordów.')); return; }
    const secIdx = Math.min(m.section || 0, chart.sections.length - 1);
    const sec = chart.sections[secIdx];
    const beatsList = sec.chords.map((_, i) => (st.bpc ? 4 * st.bpc : sec.beats[i] || 4));
    item = `song|${song.id}|${secIdx}|${st.pattern}`;
    guide.fade = st.autoLights ? M.get(item).fade : 0;
    if (reviews.reviewingNow()) guide.fade = 3;   // a review is played without lights
    if (fbItem !== item) { fill(fbBox); fbItem = item; }
    renderReview();
    guide.load(stepsFor(sec, a.move, beatsList, a.secKey[secIdx]));
    setKey(key);   // "Co ja gram?" names notes in the song's key

    const ways = el('div', { class: 'seg-ctl', role: 'radiogroup', 'aria-label': 'Jak grać' },
      Object.entries(WAYS).map(([w, info]) => el('button', { class: st.way === w ? 'on' : '', role: 'radio', 'aria-checked': String(st.way === w), title: info.help, onclick: () => { st.way = w; store.save(); renderCard(); } }, info.name)));
    const tempo = el('label', { class: 'field inline tempo-field' }, el('span', {}, 'Tempo'),
      el('input', { type: 'range', min: '40', max: '160', step: '2', value: String(st.tempo), oninput: (e) => { st.tempo = Number(e.target.value); tv.textContent = `${st.tempo}`; store.save(); } }), el('b', {}, ''));
    const tv = tempo.querySelector('b'); tv.textContent = `${st.tempo}`;
    const show = el('button', { class: 'btn', onclick: () => { stopBand(false); if (guide.running && guide.way === 'show') { guide.stop(); bus.stop(); } else guide.show(st.tempo); } }, 'Pokaż');
    const play = el('button', { class: 'btn primary', onclick: () => { stopBand(false); if (guide.running && guide.way !== 'show') { guide.stop(); bus.stop(); } else guide.start(st.way, { tempo: st.tempo }); } }, 'Graj ze mną');
    const shiftBtn = (d) => el('button', { class: 'btn small', onclick: () => { m.shift = Math.max(-11, Math.min(11, (m.shift || 0) + d)); store.save(); renderCard(); } }, d > 0 ? '+½' : '−½');

    fill(card,
      el('div', { class: 'song-head' },
        el('h2', {}, song.title),
        song.mine ? el('div', { class: 'song-tools' },
          el('button', { class: 'pick small', onclick: () => { editing = { id: song.id, title: song.title, text: song.text }; renderCard(); } }, 'Popraw'),
          el('button', { class: 'pick small', onclick: () => { if (window.confirm(`Usunąć „${song.title}”?`)) { store.data.songs = store.data.songs.filter((x) => x.id !== song.id); store.data.songsDeleted = [...(store.data.songsDeleted || []), song.id]; st.sel = null; store.save(); renderList(); renderCard(); } } }, 'Usuń')) : null),
      el('div', { class: 'key-row' },
        el('span', {}, 'Zapis w ', el('b', {}, keyName(orig, true)), guesses.length > 1 ? el('select', { class: 'key-pick', title: 'Nie ta tonacja? Wybierz inną z pasujących.', onchange: (e) => { m.keyPick = Number(e.target.value); m.shift = 0; store.save(); renderCard(); } },
          guesses.map((g, i) => el('option', { value: i, selected: i === (m.keyPick || 0) }, i === 0 ? 'pewna' : `może ${keyName(g.key, true)}?`))) : null),
        el('span', { class: 'key-now' }, ' → grasz w ', el('b', {}, keyName(key, true)), m.shift ? ` (${m.shift > 0 ? '+' : ''}${m.shift})` : ''),
        shiftBtn(-1), shiftBtn(1), m.shift ? el('button', { class: 'pick small', onclick: () => { m.shift = 0; store.save(); renderCard(); } }, 'oryginał') : null),
      voiceRow(a),
      el('div', { class: 'chips-row sec-row' },
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Pokazuj' },
          [['names', 'Nazwy'], ['nums', 'Numery'], ['both', 'Oba']].map(([v, t]) => el('button', { class: st.show === v ? 'on' : '', role: 'radio', 'aria-checked': String(st.show === v), onclick: () => { st.show = v; store.save(); renderCard(); } }, t))),
        el('span', { class: 'muted' }, 'Ćwiczysz:'),
        chart.sections.map((s, i) => el('button', { class: `pick ${i === secIdx ? 'on' : ''}`, onclick: () => { m.section = i; store.save(); renderCard(); } }, s.name, dots(`song|${song.id}|${i}|${st.pattern}`)))),
      renderChart(a, secIdx),
      el('details', { class: 'song-more', open: st.moreOpen === true, ontoggle: (e) => { st.moreOpen = e.target.open; store.save(); } },
        el('summary', {}, 'Więcej: akompaniament i takty ', el('span', { class: 'muted' }, `${(PATTERNS.find((x) => x.id === st.pattern) || PATTERNS[0]).name} · ${st.bpc ? `${st.bpc} ${st.bpc === 1 ? 'takt' : 'takty'} na akord` : 'jak zapisano'}`)),
      el('div', { class: 'chips-row pat-row' },
        el('span', { class: 'muted', title: 'Jak gram akordy w „Pokaż” i „W tempie” (bez zespołu)' }, 'Akompaniament:'),
        PATTERNS.map((p) => el('button', { class: `pick small ${p.id === st.pattern ? 'on' : ''}`, onclick: () => { st.pattern = p.id; store.save(); renderCard(); } }, p.name)),
        el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': 'Takty na akord' },
          [[0, 'jak zapisano'], [1, '1 takt'], [2, '2 takty']].map(([v, t]) => el('button', { class: st.bpc === v ? 'on' : '', role: 'radio', 'aria-checked': String(st.bpc === v), onclick: () => { st.bpc = v; store.save(); renderCard(); } }, t))))),
      revBox, strip, progBox,
      fbBox, line,
      stepsInside(a, sec));
    ctx.dock(dockRow(song, { show, play, ways, tempo }));
    setStatus(st.who === 'sam' ? WAYS[st.way].help : `${BAND_MODES.find(([v]) => v === st.who)[2]} Kliknij ▶ Ta część albo ▶ Cała piosenka na dole. Z „Pętlą” gramy w kółko.`);
    renderProgress();
    ctx.keyboard.mark([]);
  }

  renderList();
  renderCard();

  return {
    onNote(e) {
      if (capture && e.on) {
        const a = analyse(current());
        if (capture.lo == null) { capture.lo = e.note; setStatus(capture.what === 'voice' ? 'Teraz najwyższy dźwięk, który śpiewasz swobodnie.' : 'Teraz najwyższy dźwięk melodii.', 'turn'); return; }
        const r = { lo: Math.min(capture.lo, e.note), hi: Math.max(capture.lo, e.note) };
        if (capture.what === 'voice') { store.data.settings.voice = r; toast(`Twój głos: ${NOTE(r.lo)}–${NOTE(r.hi)}.`); }
        else { a.m.melody = r; toast(`Melodia: ${NOTE(r.lo)}–${NOTE(r.hi)}.`); }
        capture = null; store.save(); renderCard();
        return;
      }
      guide.feed(e);
    },
    // C56–C60 follow "Kto gra": with the band, C56 plays this part with the band (again = stop), C57 from the start
    pilotLabels: () => (st.who === 'sam' ? ['Graj ze mną', 'Pokaż', 'Podpowiedź', 'Stop', 'Stop'] : ['Ta część z zespołem / Stop', 'Cała piosenka z zespołem', '—', 'Stop', 'Stop']),
    onPilot(act) {
      if (st.who !== 'sam') {
        if (act === 'start') { if (band) stopBand(); else startBand(false); }
        if (act === 'repeat') startBand(true);
      } else {
        if (act === 'start') guide.start(st.way, { tempo: st.tempo });
        if (act === 'repeat') guide.show(st.tempo);
        if (act === 'hint') guide.hint();
      }
      if (act === 'pause' || act === 'end') { stopBand(false); guide.stop(); bus.stop(); }
    },
    destroy() { alive = false; stopBand(); guide.stop(); ctx.keyboard.mark([]); },
  };
}

