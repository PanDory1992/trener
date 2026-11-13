// Ćwiczenia → Palce: fingering practice. Five-finger positions (where the key tells which finger you used),
// fingers on call, even fingers (per-finger loudness and timing), the thumb crossing, and scales with
// school fingering: right, left, both in parallel, contrary motion, one or two octaves.
import * as bus from '../bus.js';
import { getKey, setKey } from '../key.js';
import * as store from '../store.js';
import { ALL_KEYS, keyName, stepKey, nameInKey, wheelIndex } from '../theory.js';
import { reviewBar } from '../reviewbar.js';
import { el, fill, add, toast } from '../ui.js';
import { Guide, WAYS } from './guide.js';
import { loopButton } from '../loopui.js';
import * as M from '../mastery.js';
import {
  FIVE_PATTERNS, PAIRS, positionSteps, callSteps, trillSteps, scaleSteps, thumbDrills, fingerStats, crossingStats,
} from '../fingers.js';

export const id = 'palce';
export const RANGE = [36, 84];

const EXERCISES = [
  ['piec', 'Pięć palców'], ['zawolanie', 'Na zawołanie'], ['rownosc', 'Równość'], ['kciuk', 'Kciuk'], ['gamy', 'Gamy'],
];
const WALKS = [[0, 'ta sama tonacja'], [1, 'po kole →'], ['up', 'pół tonu w górę']];
const HANDS5 = [['rh', 'Prawa'], ['lh', 'Lewa'], ['par', 'Obie równolegle'], ['mirror', 'Obie lustrzanie']];
const MOTIONS = [['rh', 'Prawa'], ['lh', 'Lewa'], ['par', 'Obie równolegle'], ['contra', 'Ruch przeciwny']];
const HOW = {
  piec: 'Pięć palców na pięciu klawiszach: kciuk prawej ręki na tonice, mały palec lewej na tonice. Każdy klawisz ma swój palec, więc trafiony klawisz = dobry palec, dopóki ręka stoi w miejscu. Palce zaokrąglone, nadgarstek luźno, graj z ramienia, nie z napięcia. Na klawiszach świecą numery palców (1 to kciuk).',
  zawolanie: 'Widzisz tylko numer palca (P = prawa, L = lewa), bez podświetlenia. Zagraj klawisz pod tym palcem. Ręka stoi w pozycji pięciopalcowej tej tonacji. Uczy szybkiego skojarzenia „numer → palec”, które jest potrzebne przy każdym palcowaniu z nut.',
  rownosc: 'Tryl na dwóch palcach, osiem dźwięków. Najlepiej „W tempie”: po każdym przejściu widzisz, który palec gra ciszej albo się spóźnia. Słabe palce (4 i 5) potrzebują krótkich serii, nie długich: gdy czujesz napięcie, przerwa. Lepiej równo i wolno niż szybko i nierówno.',
  kciuk: 'Przełożenie kciuka to jedyny trudny ruch w gamach. Tu ćwiczysz go osobno, w krótkich kawałkach: przez przejście i z powrotem. Kciuk przesuwa się pod dłonią wcześniej, zanim jest potrzebny, a łokieć prowadzi rękę w bok. W tempie Trener mierzy, czy przy przełożeniu nie robi się dziura w rytmie.',
  gamy: 'Gama ze szkolnym palcowaniem: prawą, lewą, obiema równolegle (oktawę od siebie) albo w ruchu przeciwnym (obie ręce od tej samej toniki na zewnątrz: kciuki spotykają się w środku, palce są te same w obu rękach). Na jedną albo dwie oktawy, w górę i w dół.',
};

export function mount(stage, ctx) {
  const st = store.mode(id);
  st.ex = EXERCISES.some(([e]) => e === st.ex) ? st.ex : 'piec';
  st.way = WAYS[st.way] ? st.way : 'wait';
  st.tempo = st.tempo || 72;
  st.pattern = FIVE_PATTERNS.some((p) => p.id === st.pattern) ? st.pattern : 'gora';
  st.hands5 = st.hands5 || 'rh';
  st.callHands = st.callHands || 'rh';
  st.pair = st.pair || '1';
  st.trillHand = st.trillHand || 'rh';
  st.thumbHand = st.thumbHand || 'rh';
  st.drill = st.drill || 0;
  st.motion = st.motion || 'rh';
  st.octaves = st.octaves === 2 ? 2 : 1;
  st.walk = [0, 1, 'up'].includes(st.walk) ? st.walk : 0;
  st.autoLights = st.autoLights !== false;
  // from a review, the dice or "Na koniec": open exactly that exercise
  const pre = ctx.preset || {};
  if (pre.ex && EXERCISES.some(([e]) => e === pre.ex)) {
    st.ex = pre.ex;
    if (pre.ex === 'piec') { st.pattern = pre.pattern; st.hands5 = pre.hands; }
    if (pre.ex === 'zawolanie') st.callHands = pre.hands;
    if (pre.ex === 'rownosc') { st.pair = pre.pair; st.trillHand = pre.hand; }
    if (pre.ex === 'kciuk') { st.thumbHand = pre.hand; st.drill = pre.drill; }
    if (pre.ex === 'gamy') { st.motion = pre.motion; st.octaves = pre.octaves; }
    if (pre.key) {
      const found = ALL_KEYS.find((k) => k.li === pre.key.li && k.acc === pre.key.acc && k.mode === pre.key.mode);
      if (found) setKey(found);
    }
    if (pre.way && WAYS[pre.way]) st.way = pre.way;
    if (pre.review) st.walk = 0;     // a review stays in its key
    store.save();
  }
  M.bind(store.data);
  let key = getKey();
  let alive = true;
  let item = null;
  let steps = [];
  let fingerMap = new Map();     // note → {hand, finger} for this exercise
  let pass = [];                 // notes of the current pass (for stats)

  const card = el('div', { class: 'kcard palce-card' });
  const strip = el('div', { class: 'gstrip' });
  // phone: the strip is one scrolling row, keep the current step in view
  const follow = new MutationObserver(() => {
    const n = strip.querySelector('.gstep.now');
    if (n && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, n.offsetLeft - strip.offsetLeft - strip.clientWidth / 3);
  });
  follow.observe(strip, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  const line = el('div', { class: 'kstatus' });
  const progBox = el('div', { class: 'mastery' });
  const statsBox = el('div', { class: 'finger-stats', 'aria-live': 'polite' });
  const reviewBox = el('div', { class: 'p2-msg' });
  const setStatus = (t, kind = '') => fill(line, el('span', { class: `ks ${kind}` }, t));
  add(stage,
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Palce'),
      el('p', { class: 'mode-sub' }, 'Palcowanie: pozycje, palce na zawołanie, równość palców, przełożenie kciuka i gamy. Trener nie widzi rąk, ale w stałej pozycji każdy klawisz ma swój palec.'))),
    card);

  const guide = new Guide({
    keyboard: ctx.keyboard, strip,
    onStatus: setStatus,
    onDone: ({ way, done, total }) => { if (way === 'show') setStatus('Teraz ty: „Graj ze mną”.'); else setStatus(done === total ? 'Całość. Jeszcze raz albo następna tonacja.' : `Zagrane ${done} z ${total}.`, done === total ? 'good' : ''); },
    onRun: () => refreshRunButtons(),
    onPass: (res) => countPass(res),
  });

  // --- progress ------------------------------------------------------------------------------------------
  const kid = () => `${key.mode}${wheelIndex(key)}`;
  function countPass(res) {
    showStats(res.way);
    if (!item) return null;
    const r = M.recordPass(item, { ...res, day: store.today() });
    store.save();
    if (r.events.length) toast(r.events.join(' '), r.after.stage > r.before.stage ? 'good' : r.review && !r.review.ok ? 'info' : '');
    reviews.note(item, r.review);
    renderProgress();
    renderReview();
    if (st.ex === 'zawolanie') return 3;
    return st.autoLights ? r.after.fade : 0;
  }
  const reviews = reviewBar({ itemId: () => item, go: (v, x) => ctx.go && ctx.go(v, x), rerender: () => renderReview(), way: () => st.way });
  function renderReview() { if (alive) fill(reviewBox, reviews.banner()); }
  const dots = (iid) => { const r = M.get(iid); return el('span', { class: `mdots s${r.stage}`, title: M.STAGE_NAMES[r.stage] }, el('i'), el('i'), el('i')); };
  function renderProgress() {
    if (!item) { fill(progBox); return; }
    const r = M.get(item);
    const lights = st.ex === 'zawolanie' ? 'tylko numer palca' : st.autoLights ? M.FADE_NAMES[r.fade] : 'zawsze pełne';
    fill(progBox, dots(item),
      el('span', { class: 'm-text' }, el('b', {}, M.STAGE_NAMES[r.stage]), ` · światła: ${lights}${r.best ? ` · najlepsze czyste tempo ${r.best}` : ''}`),
      st.ex === 'zawolanie' ? null : el('button', { class: `pick small ${st.autoLights ? 'on' : ''}`, onclick: () => { st.autoLights = !st.autoLights; store.save(); render(); } }, st.autoLights ? 'Światła: auto' : 'Światła: pełne'));
  }

  // --- what the fingers did --------------------------------------------------------------------------------
  function showStats(way) {
    const timed = way === 'tempo';
    const notes = pass;
    pass = [];
    if (st.ex === 'kciuk' || st.ex === 'gamy') {
      if (!timed) { fill(statsBox, el('p', { class: 'muted' }, 'Pomiar przełożenia kciuka działa „W tempie”.')); return; }
      const hands = st.ex === 'kciuk' ? [st.thumbHand] : st.motion === 'rh' ? ['rh'] : st.motion === 'lh' ? ['lh'] : ['rh', 'lh'];
      const rows = hands.map((h) => {
        const c = crossingStats(notes, steps, h);
        if (!c) return el('p', { class: 'muted' }, `${h === 'rh' ? 'Prawa' : 'Lewa'}: za mało czystych dźwięków, żeby zmierzyć przełożenie.`);
        // judged by the worst crossing: one hole is what you hear
        const ok = c.worst.ratio < 1.25;
        const x = (v) => v.toFixed(2).replace('.', ',');
        return el('p', { class: ok ? 'good' : 'warn' }, el('b', {}, `${h === 'rh' ? 'Prawa' : 'Lewa'}: `),
          ok ? `przełożenie kciuka równe (najdłuższa przerwa przy przełożeniu: ×${x(c.worst.ratio)} zwykłej).`
            : `przed ${c.worst.label} robi się dziura: ×${x(c.worst.ratio)} zwykłej przerwy. Przesuń kciuk wcześniej, jeszcze w trakcie poprzedniego dźwięku.`);
      });
      fill(statsBox, el('div', { class: 'fs-head' }, 'Przełożenie kciuka (ostatnie przejście)'), rows);
      return;
    }
    const s = fingerStats(notes, (n) => fingerMap.get(n) || null, { timed });
    if (!s.fingers.length) { fill(statsBox); return; }
    const max = Math.max(...s.fingers.map((f) => f.vel), 1);
    const bars = s.fingers.map((f) => el('div', { class: `fs-row ${s.weakest && f === s.weakest ? 'weak' : ''} ${s.latest && f === s.latest && f.lateMs > 15 ? 'late' : ''}` },
      el('span', { class: 'fs-f' }, `${f.hand === 'rh' ? 'P' : 'L'}${f.finger}`),
      el('span', { class: 'fs-bar' }, el('i', { style: { width: `${Math.round((f.vel / max) * 100)}%` } })),
      el('span', { class: 'fs-v' }, `${f.velPct > 0 ? '+' : ''}${f.velPct}%`),
      el('span', { class: 'fs-t' }, f.lateMs == null ? '' : `${f.lateMs > 0 ? '+' : ''}${f.lateMs} ms`)));
    const says = [];
    if (s.weakest && s.spread >= 12) says.push(`Najciszej gra palec ${s.weakest.hand === 'rh' ? 'P' : 'L'}${s.weakest.finger} (${s.weakest.velPct}% od średniej).`);
    else if (s.fingers.length > 1) says.push(`Głośność równa (różnica ${s.spread}).`);
    if (timed && s.latest && s.latest.lateMs > 15) says.push(`Najbardziej spóźnia się ${s.latest.hand === 'rh' ? 'P' : 'L'}${s.latest.finger}: średnio ${s.latest.lateMs} ms.`);
    else if (timed) says.push('W czasie wszystkie palce w normie (±15 ms).');
    fill(statsBox, el('div', { class: 'fs-head' }, `Twoje palce (ostatnie przejście${timed ? '' : ', czas mierzę tylko „W tempie”'})`), bars, el('p', {}, says.join(' ')));
  }

  // --- steps for the chosen exercise --------------------------------------------------------------------
  const names = (k) => (n) => nameInKey(k, n).name;
  function buildSteps(k) {
    if (st.ex === 'piec') return positionSteps(k, FIVE_PATTERNS.find((p) => p.id === st.pattern).seq, st.hands5, names(k));
    if (st.ex === 'zawolanie') return callSteps(k, st.callHands, 12);
    if (st.ex === 'rownosc') return trillSteps(k, st.pair, st.trillHand, names(k));
    const sc = k.mode === 'major' ? 'dur' : 'moll';
    if (st.ex === 'kciuk') {
      const drills = thumbDrills(k, sc, st.thumbHand);
      if (!drills.length) return [];
      return drills[Math.min(st.drill, drills.length - 1)].steps;
    }
    return scaleSteps(k, sc, st.motion, st.octaves) || [];
  }
  function itemId() {
    const k = kid();
    if (st.ex === 'piec') return `palce|piec|${k}|${st.pattern}|${st.hands5}`;
    if (st.ex === 'zawolanie') return `palce|zawolanie|${st.callHands}`;
    if (st.ex === 'rownosc') return `palce|rownosc|${st.pair}|${st.trillHand}`;
    if (st.ex === 'kciuk') return `palce|kciuk|${k}|${st.thumbHand}|${st.drill}`;
    return `palce|gamy|${k}|${st.motion}|${st.octaves}`;
  }
  function fitKeyboard(list) {
    const ns = list.flatMap((s) => s.notes);
    if (!ns.length) return;
    let lo = Math.min(...ns) - 3, hi = Math.max(...ns) + 3;
    const [dlo, dhi] = RANGE;
    lo = Math.min(lo, dlo); hi = Math.max(hi, dhi);
    while ([1, 3, 6, 8, 10].includes(((lo % 12) + 12) % 12)) lo--;
    while ([1, 3, 6, 8, 10].includes(((hi % 12) + 12) % 12)) hi++;
    ctx.keyboard.setRange(Math.max(21, lo), Math.min(108, hi));
  }

  /** At rest: the whole hand position (every finger on its key), or the first notes of a scale. */
  function idleMarks(list) {
    if (st.ex === 'zawolanie' || !list.length || guide.fade >= 2) return [];
    if (st.ex === 'piec' || st.ex === 'rownosc') {
      const seen = new Map();
      for (const s of list) for (const m of s.marks) if (!seen.has(m.note)) seen.set(m.note, m);
      return [...seen.values()];
    }
    return list[0].marks;
  }
  guide.baseMarks = () => idleMarks(steps);

  // --- UI ---------------------------------------------------------------------------------------------------------
  let runBtns = null;
  function refreshRunButtons() {
    if (!runBtns) return;
    const r = guide.running, w = guide.way;
    const set = (b, stop, label) => { b.textContent = stop ? '■ Stop' : label; b.classList.toggle('stop', stop); };
    set(runBtns.show, r && w === 'show', 'Pokaż');
    set(runBtns.play, r && w !== 'show', 'Graj ze mną');
  }
  const seg = (label, list, cur, onPick) => el('div', { class: 'seg-ctl small', role: 'radiogroup', 'aria-label': label },
    list.map(([v, t]) => el('button', { class: String(cur) === String(v) ? 'on' : '', role: 'radio', 'aria-checked': String(String(cur) === String(v)), onclick: () => { onPick(v); store.save(); render(); } }, t)));

  function options() {
    if (st.ex === 'piec') return [
      el('div', { class: 'chips-row' }, FIVE_PATTERNS.map((p) => el('button', { class: `pick ${p.id === st.pattern ? 'on' : ''}`, onclick: () => { st.pattern = p.id; store.save(); render(); } }, p.name, ' ', el('small', { class: 'muted' }, p.seq.join('-')), dots(`palce|piec|${kid()}|${p.id}|${st.hands5}`)))),
      el('div', { class: 'chips-row' }, seg('Ręce', HANDS5, st.hands5, (v) => { st.hands5 = v; }))];
    if (st.ex === 'zawolanie') return [el('div', { class: 'chips-row' }, seg('Ręce', [['rh', 'Prawa'], ['lh', 'Lewa'], ['both', 'Obie naraz']], st.callHands, (v) => { st.callHands = v; }))];
    if (st.ex === 'rownosc') return [el('div', { class: 'chips-row' },
      seg('Palce', [...PAIRS.map(([a, b]) => [String(a), `${a}–${b}`]), ['all', 'wszystkie po kolei']], st.pair, (v) => { st.pair = v; }),
      seg('Ręka', [['rh', 'Prawa'], ['lh', 'Lewa']], st.trillHand, (v) => { st.trillHand = v; }))];
    if (st.ex === 'kciuk') {
      const drills = thumbDrills(key, key.mode === 'major' ? 'dur' : 'moll', st.thumbHand);
      return [el('div', { class: 'chips-row' },
        seg('Ręka', [['rh', 'Prawa'], ['lh', 'Lewa']], st.thumbHand, (v) => { st.thumbHand = v; st.drill = 0; }),
        el('span', { class: 'muted' }, 'Przejście:'),
        drills.map((d, i) => el('button', { class: `pick ${i === Math.min(st.drill, drills.length - 1) ? 'on' : ''}`, onclick: () => { st.drill = i; store.save(); render(); } }, d.name, dots(`palce|kciuk|${kid()}|${st.thumbHand}|${i}`))))];
    }
    return [el('div', { class: 'chips-row' },
      seg('Ręce', MOTIONS, st.motion, (v) => { st.motion = v; }),
      seg('Oktawy', [[1, '1 oktawa'], [2, '2 oktawy']], st.octaves, (v) => { st.octaves = Number(v); }))];
  }

  function render({ live = false } = {}) {
    if (!live) guide.stop();
    key = getKey();
    const list = buildSteps(key);
    steps = list;
    fingerMap = new Map();
    for (const s of list) for (const p of s.fingers || []) fingerMap.set(p.note, { hand: p.hand, finger: p.finger });
    item = list.length ? itemId() : null;
    guide.fade = st.ex === 'zawolanie' ? 3 : st.autoLights && item ? M.get(item).fade : 0;
    if (item && reviews.reviewingNow()) guide.fade = 3;   // a review is played without lights
    // walking: after each pass the next key (and a new random set of calls)
    let nextKey = null;
    guide.walker = st.walk || st.ex === 'zawolanie' ? {
      peek: () => { nextKey = st.walk ? stepKey(key, st.walk) : key; const s2 = buildSteps(nextKey); return s2.length === list.length ? { steps: s2, label: keyName(nextKey, true) } : null; },
      commit: () => { if (!alive || !nextKey) return; setKey(nextKey); nextKey = null; render({ live: true }); refreshRunButtons(); },
    } : null;
    if (!live) { guide.load(list); fitKeyboard(list); }

    const ways = el('div', { class: 'seg-ctl', role: 'radiogroup', 'aria-label': 'Jak grać' },
      Object.entries(WAYS).map(([w, info]) => el('button', { class: st.way === w ? 'on' : '', role: 'radio', 'aria-checked': String(st.way === w), title: info.help, onclick: () => { st.way = w; store.save(); render(); } }, info.name)));
    const tempo = el('label', { class: 'field inline tempo-field' }, el('span', {}, 'Tempo'),
      el('input', { type: 'range', min: '40', max: '160', step: '2', value: String(st.tempo), oninput: (e) => { st.tempo = Number(e.target.value); tv.textContent = `${st.tempo}`; store.save(); } }), el('b', {}, ''));
    const tv = tempo.querySelector('b'); tv.textContent = `${st.tempo}`;
    const show = el('button', { class: 'btn', onclick: () => { if (guide.running && guide.way === 'show') { guide.stop(); bus.stop(); } else { pass = []; guide.show(st.tempo); } } }, 'Pokaż');
    const play = el('button', { class: 'btn primary', onclick: () => { if (guide.running && guide.way !== 'show') { guide.stop(); bus.stop(); } else { pass = []; guide.start(st.way, { tempo: st.tempo }); } } }, 'Graj ze mną');
    runBtns = { show, play };

    fill(card,
      el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Ćwiczenie' },
        EXERCISES.map(([e, t]) => el('button', { class: `tab ${e === st.ex ? 'on' : ''}`, role: 'tab', 'aria-selected': String(e === st.ex), onclick: () => { st.ex = e; store.save(); render(); } }, t))),
      el('div', { class: 'chips-row key-row' },
        el('label', { class: 'field inline' }, el('span', {}, 'Tonacja'),
          el('select', { class: 'palce-key', onchange: (e) => { setKey(ALL_KEYS[Number(e.target.value)]); render(); } },
            ALL_KEYS.map((k, i) => el('option', { value: i, selected: keyName(k) === keyName(key) && k.mode === key.mode }, keyName(k, true))))),
        el('span', { class: 'muted walk-label' }, 'potem:'),
        seg('Po każdym przejściu', WALKS, st.walk, (v) => { st.walk = v; })),
      ...options(),
      list.length ? null : el('p', { class: 'warn' }, 'Dla tej tonacji nie mam szkolnego palcowania. Wybierz inną.'),
      reviewBox, strip, progBox,
      ctx.dock(el('div', { class: 'play-row' }, show, play, loopButton(), ways, tempo)),
      line, statsBox,
      el('details', { class: 'why', open: st.howOpen !== false, ontoggle: (e) => { st.howOpen = e.target.open; store.save(); } },
        el('summary', {}, 'Jak ćwiczyć'), el('p', {}, HOW[st.ex])));
    if (!live) setStatus(st.ex === 'zawolanie' ? 'Zobacz numer, zagraj palcem. Bez świateł: podpowiedź pojawi się po dwóch pomyłkach.' : WAYS[st.way].help);
    renderProgress();
    renderReview();
    if (!live) ctx.keyboard.mark(idleMarks(list));
  }

  render();

  return {
    onNote(e) {
      if (e.on && guide.running && guide.way !== 'show') pass.push({ note: e.note, vel: e.vel || 64, t: performance.now() / 1000 });
      guide.feed(e);
    },
    onPilot(a) {
      if (a === 'start') { pass = []; guide.start(st.way, { tempo: st.tempo }); }
      if (a === 'repeat') guide.show(st.tempo);
      if (a === 'hint') guide.hint();
      if (a === 'pause' || a === 'end') { guide.stop(); bus.stop(); }
    },
    destroy() { alive = false; follow.disconnect(); guide.stop(); ctx.keyboard.mark([]); },
  };
}
