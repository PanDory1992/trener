// Trener: navigation, home screen, daily plan runner, pilot buttons, live keyboard.
import * as bus from './bus.js';
import { dailyPlan, dueCards, MODE_IDS, plural, prefs } from './music.js';
import * as store from './store.js';
import { MODES } from './store.js';
import { el, fmtMin, Keyboard, toast, fill, add } from './ui.js';
import * as echo from './modes/echo.js';
import * as dynamika from './modes/dynamika.js';
import * as akordy from './modes/akordy.js';
import * as docelowe from './modes/docelowe.js';
import * as ucho from './modes/ucho.js';
import * as aksak from './modes/aksak.js';
import * as fiszki from './modes/fiszki.js';
import * as wolne from './modes/wolne.js';
import * as kolo from './modes/kolo.js';
import * as jam from './modes/jam.js';
import * as piosenki from './modes/piosenki.js';
import * as palce from './modes/palce.js';
import { HELP } from './help.js';
import { getKey, onKeyChange } from './key.js';
import { keyName, nameInKey } from './theory.js';
import { identify } from './chords.js';
import { install as keepAwake } from './nosleep.js';
import { setClick, clickEvents, CLICK_CH, PADS } from './click.js';
import { loopButton } from './loopui.js';
import { toggleLoop, loopOn } from './loop.js';
import { pickDice, hints, firstNewToday } from './suggest.js';
import { reviewBar, allSongs } from './reviewbar.js';

const ENGINES = { echo, dynamika, akordy, docelowe, ucho, aksak, fiszki, wolne, kolo, jam, piosenki, palce };
const MAIN = ['kolo', 'piosenki', 'jam'];
const NAV = ['palce', 'echo', 'dynamika', 'akordy', 'docelowe', 'ucho', 'aksak', 'fiszki'];
const ZOOM = { kolo: [36, 84], jam: [36, 84], piosenki: [36, 84], palce: [36, 84] };
// iPhone and other small screens: fewer octaves so the keys stay readable
const ZOOM_COMPACT = { kolo: [41, 84], jam: [36, 84], piosenki: [41, 84], palce: [36, 84] };
const COMPACT_Q = window.matchMedia('(max-width: 900px), (max-height: 560px)');
const isCompact = () => COMPACT_Q.matches;
function rangeFor(id) { return isCompact() ? (ZOOM_COMPACT[id] || [36, 96]) : (ZOOM[id] || []); }
function applyCompact() {
  document.body.classList.toggle('compact', isCompact());
  if (keyboard) keyboard.setRange(...rangeFor(view));
}
const PILOT = { 12: 'start', 13: 'repeat', 14: 'hint', 15: 'pause', 16: 'end' };
const PILOT_KEYS = [['C56', 'Start / dalej'], ['C57', 'Powtórz'], ['C58', 'Podpowiedź'], ['C59', 'Pauza'], ['C60', 'Koniec']];

let keyboard;
let view = 'home';
let instance = null;
let plan = null;          // today's planned blocks
let run = null;           // running plan session
let lastNoteAt = 0;
let insight = null;
const routerState = { router: false, touch: null };
const held = new Set();         // keys you hold right now (for "Co ja gram?")
const sustained = new Set();    // released while the sustain pedal is down: they still sound
let pedalDown = false;
let whatTimer = null;

// --- layout --------------------------------------------------------------------------------------
function layout() {
  const app = document.getElementById('app');
  fill(app, 
    el('div', { class: 'scrim', onclick: () => menu(false) }),
    el('aside', { class: 'rail', id: 'rail' },
      el('div', { class: 'brand' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }), el('span', {}, 'Trener')),
      el('nav', { 'aria-label': 'Tryby' },
        ...MAIN.map((id) => navItem(id, MODES[id].title, MODES[id].color, 'nav-main')),
        el('div', { class: 'nav-group' }, 'Ćwiczenia'),
        ...NAV.map((id) => navItem(id, MODES[id].title, MODES[id].color)),
        el('div', { class: 'nav-sep' }),
        navItem('home', 'Plan dnia', 'var(--c-plan)')),
      el('div', { class: 'rail-foot' },
        navItem('help', 'Jak to działa', 'var(--ink-3)'),
        navItem('settings', 'Ustawienia', 'var(--ink-3)'))),
    el('main', { class: 'main' },
      el('div', { class: 'topbar' },
        el('button', { class: 'menu-btn', 'aria-label': 'Menu', 'aria-controls': 'rail', onclick: () => menu() }, el('span'), el('span'), el('span')),
        el('div', { id: 'runbar', class: 'runbar' }),
        el('div', { id: 'viewtitle', class: 'viewtitle' }),
        el('div', { id: 'whatmini', class: 'whatmini', 'aria-hidden': 'true' }),
        loopButton('mini'),
        // the pilot keys on the Keystation (C56–C60), as a reminder; clickable too
        el('div', { class: 'pilot', 'aria-label': 'Pilot na klawiaturze' },
          PILOT_KEYS.map(([k, t], i) => el('button', { class: 'pk', title: t, 'aria-label': `${k}: ${t}`, onclick: () => pilot(PILOT[12 + i]) }, el('kbd', {}, k), el('span', {}, t))),
          loopButton('dock')),
        el('div', { class: 'top-right' },
          bus.remote ? null : el('button', { class: 'pill phone-btn', onclick: () => showPhone(), title: 'Otwórz Trenera na iPhonie' }, 'Na telefonie'),
          el('span', { id: 'today-min', class: 'pill' }, ''),
          el('span', { id: 'link', class: 'pill link' }, 'Łączę…'))),
      el('section', { id: 'stage', class: 'stage', tabindex: '-1' }),
      el('footer', { class: 'dock' },
        el('div', { class: 'dock-top' },
          el('div', { id: 'dockbar', class: 'dockbar', role: 'toolbar', 'aria-label': 'Granie', hidden: true }),
          el('div', { id: 'whatplay', class: 'whatplay', 'aria-live': 'polite', title: 'Co ja gram? Rozpoznaję akord, który trzymasz, w wybranej tonacji.' })),
        el('div', { id: 'kb', class: 'keyboard', 'aria-hidden': 'true' }))),
    el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }),
    el('div', { id: 'overlay', class: 'overlay', hidden: true }));
  keyboard = new Keyboard(document.getElementById('kb'));
}

/** The play bar above the keyboard: the mode puts its play controls here (always in the same place, always visible). */
// "Co grasz": your last notes as numbers in the shared key, under the play bar (Jam keeps its own, coloured by chord)
const dockTrail = [];
const dockTrailBox = el('div', { class: 'trail', 'aria-label': 'Twoje ostatnie dźwięki jako numery w tonacji' });
const dockTrailWrap = el('div', { class: 'trail-wrap dock-trail' }, el('span', { class: 'doors-label' }, 'Co grasz:'), dockTrailBox);
function renderDockTrail() {
  fill(dockTrailBox, dockTrail.length
    ? dockTrail.map((t, i) => el('span', { class: `tr ${t.kind} ${i === dockTrail.length - 1 ? 'last' : ''}`, title: t.name }, t.deg))
    : el('span', { class: 'muted' }, 'Zagraj coś, a zobaczysz tu numery swoich dźwięków.'));
}
function pushDockTrail(note) {
  if (!dockTrailWrap.isConnected) return;
  const n = nameInKey(getKey(), note % 12);
  dockTrail.push({ deg: n.deg, name: n.name, kind: n.diatonic ? 'sc' : 'out' });
  if (dockTrail.length > 28) dockTrail.shift();
  renderDockTrail();
}
onKeyChange(() => { dockTrail.length = 0; renderDockTrail(); });

function setDock(node) {
  const bar = document.getElementById('dockbar');
  if (!bar) return;
  if (node && !node.querySelector('.trail')) { renderDockTrail(); node = el('div', { class: 'dock-stack' }, node, dockTrailWrap); }
  fill(bar, node || null);
  bar.hidden = !node;
  document.body.classList.toggle('has-dockbar', !!node);
}

function menu(open) {
  const on = open === undefined ? !document.body.classList.contains('menu-open') : open;
  document.body.classList.toggle('menu-open', on);
}

// --- iPhone: address + QR code ------------------------------------------------------------------------------
async function showPhone() {
  let info;
  try { info = await bus.getJSON('/api/phone'); } catch { info = null; }
  const url = info && info.urls && info.urls[0];
  const qrBox = el('div', { class: 'qr' });
  if (url && window.qrcode) {
    const q = window.qrcode(0, 'M');
    q.addData(url);
    q.make();
    qrBox.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }
  showOverlay(el('div', { class: 'ov-box phone-box', style: { '--c': 'var(--c-kolo)' } },
    el('h2', {}, 'Trener na iPhonie'),
    url ? el('div', { class: 'phone-grid' }, qrBox,
      el('ol', { class: 'phone-steps' },
        el('li', {}, 'iPhone w tej samej sieci Wi-Fi co komputer.'),
        el('li', {}, 'Otwórz Aparat i skieruj go na kod. Stuknij żółty link, otworzy się Safari.'),
        el('li', {}, 'W Safari: przycisk Udostępnij (kwadrat ze strzałką) → „Do ekranu początkowego”. Masz ikonę Trener z fortepianem, która otwiera się na pełnym ekranie.'),
        el('li', {}, 'Postaw telefon poziomo na pulpicie nut. Dźwięk i tak gra z komputera.'))) : el('p', {}, 'Nie znalazłem adresu komputera w sieci domowej. Czy komputer jest podłączony do Wi-Fi albo kablem do routera?'),
    url ? el('p', { class: 'muted phone-url' }, 'Adres: ', el('code', {}, url)) : null,
    info && info.urls && info.urls.length > 1 ? el('p', { class: 'muted' }, 'Gdyby nie działał, inne adresy tego komputera: ', info.urls.slice(1).map((u) => el('code', {}, u))) : null,
    el('p', { class: 'muted' }, 'Komputer musi mieć włączonego Trenera (Trener.bat). Okno na komputerze możesz zamknąć. Jeśli iPhone „nie może połączyć się z serwerem”: Windows przy pierwszym starcie pyta o zgodę dla Pythona. Zezwól na sieci prywatne, a sieć Wi-Fi w Windows ustaw jako prywatną.'),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => hideOverlay() }, 'Gotowe'))));
}

function navItem(id, label, color, extra = '') {
  const lvl = MODE_IDS.includes(id) ? store.mode(id).level.toFixed(1) : '';
  return el('button', { class: `nav-item ${extra} ${view === id ? 'active' : ''}`, 'data-view': id, style: { '--c': color }, onclick: () => go(id) },
    el('span', { class: 'swatch' }), el('span', { class: 'nav-label' }, label), lvl ? el('span', { class: 'nav-lvl' }, lvl) : null);
}

function refreshNav() {
  for (const b of document.querySelectorAll('.nav-item')) {
    b.classList.toggle('active', b.dataset.view === view);
    const id = b.dataset.view;
    const lv = b.querySelector('.nav-lvl');
    if (lv && MODE_IDS.includes(id)) lv.textContent = store.mode(id).level.toFixed(1);
  }
}

// --- navigation ------------------------------------------------------------------------------------
function go(id, ctxExtra = {}) {
  if (run && !ctxExtra.fromRun && id !== view) {
    if (!window.confirm('Przerwać dzisiejszą sesję?')) return;
    endRun(false);
  }
  instance && instance.destroy();
  instance = null;
  setDock(null);
  view = id;
  document.body.dataset.view = id;
  menu(false);
  const vt = document.getElementById('viewtitle');
  if (vt) vt.textContent = MODES[id] ? MODES[id].title : id === 'settings' ? 'Ustawienia' : id === 'help' ? 'Jak to działa' : '';
  keyboard.mark([]);
  keyboard.setRange(...rangeFor(id));
  const stage = document.getElementById('stage');
  fill(stage, );
  stage.className = `stage view-${id}`;
  const color = MODES[id] ? MODES[id].color : 'var(--c-plan)';
  document.documentElement.style.setProperty('--mode', color);
  keyboard.setColor(color);
  refreshNav();
  if (id === 'home') return renderHome(stage);
  if (id === 'settings') return renderSettings(stage);
  if (id === 'help') return renderHelp(stage);
  const engine = ENGINES[id];
  instance = engine.mount(stage, { keyboard, block: ctxExtra.block || null, onBlockDone: ctxExtra.onBlockDone || null, preset: ctxExtra.preset || null, dock: setDock, go: (to, extra) => go(to, extra || {}) });
  stage.focus({ preventScroll: true });
}

// --- home -------------------------------------------------------------------------------------------
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Dobranoc' : h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';
}

function buildPlan(reshuffle = false) {
  const stats = {};
  for (const id of MODE_IDS) stats[id] = { success: store.successRate(id), daysSince: store.daysSince(id) };
  const due = dueCards(store.data.cards, store.today()).length;
  const seed = reshuffle ? Date.now() : Number(store.today().replace(/-/g, ''));
  plan = dailyPlan(store.data.settings.planMinutes, stats, due, insight, seed);
  if (insight && insight.ok && insight.black_ones > 0.05) {
    for (const b of plan) if (b.mode === 'echo') { b.preferBlack = true; b.why += ' Motywy na czarnych klawiszach.'; }
  }
}

function renderHome(stage) {
  if (!plan) buildPlan();
  setTimeout(() => maybeEndTip('home'), 400);
  const total = plan.reduce((s, b) => s + b.minutes, 0);
  const due = dueCards(store.data.cards, store.today()).length;
  const week = [];
  for (let k = 6; k >= 0; k--) {
    const d = new Date(); d.setDate(d.getDate() - k);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    week.push({ iso, label: d.toLocaleDateString('pl-PL', { weekday: 'short' }), sec: (store.data.days[iso] || {}).sec || 0 });
  }
  const maxSec = Math.max(1800, ...week.map((w) => w.sec));
  add(stage, 
    el('div', { class: 'home' },
      el('section', { class: 'hero' },
        el('p', { class: 'hello' }, `${greeting()}, Miki.`),
        el('h1', { class: 'hero-title' }, `Dzisiejsze ${total} minut`),
        el('div', { class: 'plan-strip', role: 'list' }, plan.map((b, i) => el('div', {
          class: 'seg', role: 'listitem', style: { flex: String(b.minutes), '--c': MODES[b.mode].color }, title: b.why,
        }, el('b', {}, MODES[b.mode].title), el('span', {}, `${b.minutes} min`)))),
        el('ol', { class: 'plan-why' }, plan.map((b) => el('li', { style: { '--c': MODES[b.mode].color } },
          el('b', {}, `${MODES[b.mode].title}. `), b.why))),
        el('div', { class: 'actions' },
          el('button', { class: 'btn primary big', onclick: () => startRun() }, 'Zacznij'),
          el('button', { class: 'btn', onclick: () => { buildPlan(true); go('home'); } }, 'Ułóż inaczej'),
          el('label', { class: 'field inline' }, el('span', {}, 'Czas'),
            el('select', { onchange: (e) => { store.data.settings.planMinutes = Number(e.target.value); store.save(); buildPlan(); go('home'); } },
              [20, 30, 45].map((m) => el('option', { value: m, selected: m === store.data.settings.planMinutes }, `${m} min`)))))),
      el('section', { class: 'side' },
        p2Panel(),
        el('div', { class: 'panel' },
          el('h2', {}, 'Fiszki'),
          el('p', { class: 'big-num' }, String(due)),
          el('p', {}, due ? `${plural(due, 'czeka', 'czekają', 'czeka')} na powtórkę dziś.` : 'Na dziś wszystko powtórzone.'),
          el('button', { class: 'btn small', onclick: () => go('fiszki') }, 'Otwórz fiszki')),
        el('div', { class: 'panel' },
          el('h2', {}, 'Ostatni tydzień'),
          el('div', { class: 'week' }, week.map((w) => el('div', { class: `wd ${w.iso === store.today() ? 'today' : ''}`, title: fmtMin(w.sec) },
            el('div', { class: 'wd-bar' }, el('i', { style: { height: `${Math.max(2, (w.sec / maxSec) * 100)}%` } })),
            el('span', {}, w.label)))),
          el('p', { class: 'muted' }, `Dziś: ${fmtMin((store.data.days[store.today()] || {}).sec || 0)} grania.`)),
        insight && insight.ok ? el('div', { class: 'panel' },
          el('h2', {}, 'Z twojej gry'),
          el('p', {}, `Ostatnie 3 dni: ${insight.notes} nut. „1” (za wolne dotknięcie) na czarnych: `, el('b', {}, `${Math.round(insight.black_ones * 1000) / 10}%`), `, na białych: ${Math.round(insight.white_ones * 1000) / 10}%.`)) : null)),
    el('section', { class: 'modes-grid' }, NAV.map((id) => {
      const m = store.mode(id);
      const rate = store.successRate(id);
      const ds = store.daysSince(id);
      return el('button', { class: 'mode-tile', style: { '--c': MODES[id].color }, onclick: () => go(id) },
        el('span', { class: 'tile-name' }, MODES[id].long),
        el('span', { class: 'tile-blurb' }, MODES[id].blurb),
        id === 'fiszki' ? el('span', { class: 'tile-meta' }, `${store.data.cards.length} ${plural(store.data.cards.length, 'fiszka', 'fiszki', 'fiszek')}`)
          : el('span', { class: 'tile-meta' }, `poziom ${m.level.toFixed(1)}${rate != null ? `, ${Math.round(rate * 100)}% udanych` : ''}${ds === null ? ', jeszcze nie grane' : ds === 0 ? ', dziś' : `, ${ds} dni temu`}`));
    })));
}

// --- Prio 2: Kostka, powtórki z Koła, podpowiedzi, "na koniec" ---------------------------------------------------
const homeReviews = reviewBar({ itemId: () => null, go: (v, x) => go(v, x || {}), rerender: () => { if (view === 'home') go('home'); }, way: () => 'tempo' });
function rollDice() {
  const d = pickDice(store.data.mastery || {}, { exclude: store.mode('kolo').lastDice || null });
  if (!d) { toast('Kostka nie ma z czego wybrać.'); return; }
  store.mode('kolo').lastDice = d.id;
  store.save();
  go(d.open.view, { preset: { ...d.open.preset, why: d.why } });
}
function p2Panel() {
  const due = homeReviews.due();
  const hs = hints(store.data.mastery || {}, { today: store.today(), songs: allSongs() }).filter((h) => h.id !== 'due').slice(0, 2);
  return el('div', { class: 'panel p2-home' },
    el('h2', {}, 'Powtórki z Koła'),
    el('p', { class: 'big-num' }, String(due.length)),
    el('p', {}, due.length ? `${plural(due.length, 'rzecz czeka', 'rzeczy czekają', 'rzeczy czeka')} na jedno przejście bez świateł.` : 'Na dziś nic do powtórki.'),
    el('div', { class: 'actions' },
      due.length ? el('button', { class: 'btn small primary', onclick: () => homeReviews.start(due) }, 'Zagraj powtórki') : null,
      el('button', { class: 'btn small', title: 'Słabe miejsce, coś w toku albo coś nowego obok na kole.', onclick: () => rollDice() }, 'Kostka')),
    hs.length ? el('ul', { class: 'p2-hints' }, hs.map((h) => el('li', {}, h.text))) : null);
}
/** Once a day, near the end of a session: go back to the first new thing of today for a moment. */
function maybeEndTip(trigger) {
  const today = store.today();
  if (store.data.settings.p2EndTip === today || document.getElementById('p2-endtip')) return;
  const sec = (store.data.days[today] || {}).sec || 0;
  if (trigger !== 'home' && sec < 25 * 60) return;
  const first = firstNewToday(store.data.mastery || {}, { today, songs: allSongs() });
  if (!first) return;
  store.data.settings.p2EndTip = today;
  store.save();
  const bar = el('div', { id: 'p2-endtip', class: 'p2-endtip', role: 'status' },
    el('span', {}, `Na koniec: wróć na chwilę do pierwszej nowej rzeczy z dziś: ${first.title}.`),
    el('button', { class: 'btn small primary', onclick: () => { bar.remove(); go(first.open.view, { preset: first.open.preset }); } }, 'Otwórz'),
    el('button', { class: 'btn small ghost', onclick: () => bar.remove() }, 'Nie teraz'));
  document.body.append(bar);
}

// --- plan runner ---------------------------------------------------------------------------------------
function startRun() {
  if (!plan) buildPlan();
  run = { blocks: plan.map((b) => ({ ...b })), i: -1, timer: null, startedAt: Date.now(), done: [] };
  nextBlock();
}

function nextBlock() {
  if (!run) return;
  clearInterval(run.timer);
  clearInterval(run.countdown);
  hideOverlay();
  run.i++;
  if (run.i >= run.blocks.length) return endRun(true);
  const b = run.blocks[run.i];
  run.endAt = Date.now() + b.minutes * 60000;
  run.paused = false;
  go(b.mode, { fromRun: true, block: b, onBlockDone: () => {} });
  renderRunbar();
  run.timer = setInterval(() => {
    if (!run || run.paused) return;
    renderRunbar();
    if (Date.now() >= run.endAt) blockOver();
  }, 500);
}

function blockOver() {
  if (!run || !document.getElementById('overlay').hidden) return;
  clearInterval(run.timer);
  clearInterval(run.countdown);
  bus.stop();
  run.done.push(run.blocks[run.i].mode);
  const nxt = run.blocks[run.i + 1];
  // soft chime through the piano
  bus.play([{ t: 0, m: [0x90, 84, 40] }, { t: 0.15, m: [0x90, 88, 40] }, { t: 0.3, m: [0x90, 91, 40] }, { t: 1.2, m: [0x80, 84, 0] }, { t: 1.2, m: [0x80, 88, 0] }, { t: 1.2, m: [0x80, 91, 0] }], { lead: 0.05 }).catch(() => {});
  let left = 12;
  const counter = el('span', {}, String(left));
  showOverlay(el('div', { class: 'ov-box', style: { '--c': nxt ? MODES[nxt.mode].color : 'var(--c-plan)' } },
    el('p', { class: 'ov-small' }, `Koniec bloku: ${MODES[run.blocks[run.i].mode].title}`),
    el('h2', {}, nxt ? `Teraz: ${MODES[nxt.mode].long}` : 'To był ostatni blok'),
    nxt ? el('p', {}, nxt.why) : null,
    el('p', { class: 'ov-small' }, 'Za ', counter, ' s ruszam dalej. C56: od razu.'),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', onclick: () => nextBlock() }, nxt ? 'Dalej' : 'Zakończ'),
      el('button', { class: 'btn', onclick: () => { clearInterval(run.countdown); run.done.pop(); hideOverlay(); run.endAt = Date.now() + 2 * 60000; run.timer = setInterval(() => { renderRunbar(); if (Date.now() >= run.endAt) blockOver(); }, 500); } }, 'Jeszcze 2 minuty'))));
  run.countdown = setInterval(() => {
    left--; counter.textContent = String(left);
    if (left <= 0) { clearInterval(run.countdown); nextBlock(); }
  }, 1000);
}

function endRun(finished) {
  if (!run) return;
  clearInterval(run.timer); clearInterval(run.countdown);
  const minutes = Math.round((Date.now() - run.startedAt) / 60000);
  store.data.sessions = [...store.data.sessions, { d: store.today(), minutes, blocks: run.done, finished }].slice(-200);
  store.save();
  const wasRun = run;
  run = null;
  renderRunbar();
  hideOverlay();
  if (finished) {
    showOverlay(el('div', { class: 'ov-box', style: { '--c': 'var(--c-plan)' } },
      el('h2', {}, 'Sesja zrobiona'),
      el('p', {}, `${minutes} min, ${wasRun.done.length} ${plural(wasRun.done.length, 'blok', 'bloki', 'bloków')}. Dobra robota.`),
      el('div', { class: 'actions' }, el('button', { class: 'btn primary', onclick: () => { hideOverlay(); go('kolo'); } }, 'Wróć do koła'))));
  }
}

function renderRunbar() {
  const bar = document.getElementById('runbar');
  if (!run) { fill(bar, el('span', { class: 'today' }, new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }))); return; }
  const b = run.blocks[run.i];
  const left = Math.max(0, Math.round((run.endAt - Date.now()) / 1000));
  fill(bar, 
    el('div', { class: 'run-steps' }, run.blocks.map((x, k) => el('i', { class: k < run.i ? 'done' : k === run.i ? 'now' : '', style: { '--c': MODES[x.mode].color, flex: String(x.minutes) } }))),
    el('span', { class: 'run-label' }, `Blok ${run.i + 1} z ${run.blocks.length}: ${MODES[b.mode].title}`),
    el('span', { class: 'run-time' }, run.paused ? 'pauza' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`),
    el('button', { class: 'btn tiny', onclick: () => blockOver() }, 'Następny blok'),
    el('button', { class: 'btn tiny ghost', onclick: () => { if (window.confirm('Zakończyć sesję?')) { endRun(false); go('home'); } } }, 'Zakończ'));
}

function showOverlay(node) { const o = document.getElementById('overlay'); fill(o, node); o.hidden = false; o.querySelector('button')?.focus(); }
function hideOverlay() { const o = document.getElementById('overlay'); o.hidden = true; fill(o, ); }

// --- settings & help --------------------------------------------------------------------------------------
function renderSettings(stage) {
  const s = store.data.settings;
  const row = (label, help, control) => el('div', { class: 'set-row' }, el('div', {}, el('b', {}, label), el('p', {}, help)), control);
  add(stage, 
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, 'Ustawienia'))),
    el('div', { class: 'settings' },
      row('Nazwy dźwięków', 'Polskie: H i B (B = B♭). Angielskie: B i B♭, jak w akordach jazzowych i na YouTube.',
        el('select', { onchange: (e) => { s.hNames = e.target.value === 'h'; prefs.hNames = s.hNames; store.save(); } },
          el('option', { value: 'b', selected: !s.hNames }, 'Angielskie (B, B♭)'), el('option', { value: 'h', selected: s.hNames }, 'Polskie (H, B)'))),
      row('Głośność trenera', 'Jak głośno gram wzory i akompaniament (mnożnik siły uderzenia). Twoja gra się nie zmienia.',
        el('input', { type: 'range', min: '0.6', max: '1.3', step: '0.05', value: String(s.gain), oninput: (e) => { s.gain = Number(e.target.value); store.save(); } })),
      clickRow(row, s),
      row('Opóźnienie odsłuchu', 'Ile milisekund mija, zanim usłyszysz dźwięk. Odejmuję je od twoich uderzeń w Aksaku. Zmierzysz je w Aksaku przyciskiem „Zmierz opóźnienie”.',
        el('input', { type: 'number', min: '0', max: '150', value: String(s.latencyMs), onchange: (e) => { s.latencyMs = Math.max(0, Math.min(150, Number(e.target.value) || 0)); store.save(); } })),
      row('Fiszki z błędów', 'Motyw z Echa albo melodia Ze słuchu, które nie wyszły, same trafiają do fiszek (najwyżej 3 dziennie).',
        el('input', { type: 'checkbox', checked: s.autoCards, onchange: (e) => { s.autoCards = e.target.checked; store.save(); } })),
      row('Poziomy', 'Wyzeruj poziom jednego trybu, jeśli chcesz zacząć od nowa.',
        el('select', { onchange: (e) => { const id = e.target.value; if (id && window.confirm(`Wyzerować poziom: ${MODES[id].long}?`)) { store.data.modes[id] = { level: 1, hist: [], lastDay: null, best: 1 }; store.save(); toast('Wyzerowane.'); } e.target.value = ''; } },
          el('option', { value: '' }, 'Wybierz tryb…'), MODE_IDS.map((id) => el('option', { value: id }, MODES[id].long)))),
      el('p', { class: 'muted' }, 'Postępy zapisują się same w pliku trener-dane.json w folderze routera, z codzienną kopią.')));
}

// The metronome click: piano (high C) or its own track "Klik" in Studio One on MIDI channel 16, pads C1..G1.
function clickRow(row, s) {
  const pads = (sel, first) => [first, ...Array.from({ length: PADS }, (_, i) => el('option', { value: String(i + 1), selected: Number(sel) === i + 1 }, `${i + 1} (${['C1', 'C♯1', 'D1', 'D♯1', 'E1', 'F1', 'F♯1', 'G1'][i]})`))].filter(Boolean);
  const apply = () => { setClick(s); store.save(); };
  const extra = el('div', { class: 'click-pads' },
    el('label', {}, 'Dźwięk ', el('select', { onchange: (e) => { s.clickSound = Number(e.target.value); apply(); } }, pads(s.clickSound || 1))),
    el('label', {}, 'Raz ', el('select', { onchange: (e) => { s.clickAccent = Number(e.target.value); apply(); } },
      pads(s.clickAccent || 0, el('option', { value: '0', selected: !s.clickAccent }, 'ten sam, mocniej')))),
    el('button', { class: 'btn tiny', onclick: () => {
      const beat = 60 / 100;
      const ev = [];
      for (let q = 0; q < 8; q++) ev.push(...clickEvents(q * beat, q % 4 === 0 ? 60 : 42, q % 4 === 0));
      bus.play(ev).catch(() => toast('Nie słychać? Sprawdź, czy działa serwer i router.'));
    } }, 'Posłuchaj'));
  const sync = () => { extra.hidden = s.clickOut !== 'ch16'; };
  sync();
  return row('Klik metronomu', 'Pianino: wysokie C, jak dotąd. Ścieżka „Klik”: osobny dźwięk ze Studio One (kanał MIDI 16, pady C1–G1), z własnym suwakiem głośności. „Raz” to pierwsza miara: ten sam dźwięk mocniej albo inny pad.',
    el('div', { class: 'click-set' },
      el('select', { onchange: (e) => { s.clickOut = e.target.value; apply(); sync(); } },
        el('option', { value: 'piano', selected: s.clickOut !== 'ch16' }, 'Pianino (wysokie C)'),
        el('option', { value: 'ch16', selected: s.clickOut === 'ch16' }, 'Ścieżka „Klik” (kanał 16)')),
      extra));
}

function renderHelp(stage) {
  add(stage, el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' }, el('h1', {}, 'Jak to działa'))),
    el('div', { class: 'help' }, HELP.map(([title, body, color]) => el('details', { class: 'help-item', style: { '--c': color } }, el('summary', {}, title), el('div', { html: body })))));
}

// --- events -------------------------------------------------------------------------------------------------
function pilot(action) {
  if (!document.getElementById('overlay').hidden) {
    if (action === 'start' && run) nextBlock();
    return;
  }
  if (action === 'end') {
    if (run) { blockOver(); return; }
    if (view !== 'kolo') { go('kolo'); return; }
  }
  if (action === 'pause' && run) { run.paused = !run.paused; if (!run.paused) run.endAt = Date.now() + (run.leftMs || 0); else run.leftMs = run.endAt - Date.now(); renderRunbar(); }
  if (view === 'home' && action === 'start') { startRun(); return; }
  instance && instance.onPilot && instance.onPilot(action);
}

function onBus(e) {
  if (e.t === 'note') {
    if (e.src === 'keys') {
      if (e.on) { held.add(e.note); sustained.delete(e.note); } else { held.delete(e.note); if (pedalDown) sustained.add(e.note); }
      updateWhat();
      if (e.on) {
        pushDockTrail(e.note);
        keyboard.press(e.note, e.vel, 'you');
        const now = Date.now();
        const day = store.dayRec();
        if (lastNoteAt && now - lastNoteAt < 30000) day.sec += (now - lastNoteAt) / 1000;
        day.notes = (day.notes || 0) + 1;
        lastNoteAt = now;
        if (day.notes % 25 === 0) store.save();
        updateTodayPill();
      } else keyboard.release(e.note, 'you');
      instance && instance.onNote && instance.onNote(e);
    } else if (e.ch !== 9 && e.ch !== CLICK_CH) {   // drums (channel 10) and the click (16) are not piano keys
      if (e.on) keyboard.press(e.note, e.vel, 'trainer'); else keyboard.release(e.note, 'trainer');
    }
  } else if (e.t === 'pedal') {
    if (e.pedal === 'sustain' || e.cc === 64) {
      pedalDown = e.value >= 64;
      if (!pedalDown) sustained.clear();
      updateWhat();
    }
  } else if (e.t === 'button') {
    if (PILOT[e.program]) pilot(PILOT[e.program]);
  } else if (e.t === 'state') {
    routerState.router = true;
    routerState.touch = e.touch;
    routerState.connected = e.connected;
    updateLink();
  } else if (e.t === 'link' || e.t === 'server') {
    if (e.t === 'server' && e.up) { keyboard.clearAll(); held.clear(); sustained.clear(); updateWhat(); }   // reconnected: note-offs may be lost
    updateLink();
  }
}

// --- a newer Trener on disk than this page: ask to refresh (an old open tab never counts new things) ----
let build0 = undefined;
async function checkVersion() {
  let j;
  try { j = await bus.getJSON('/api/now'); } catch { return; }
  const b = j && j.build ? j.build : null;
  if (build0 === undefined) { build0 = b; return; }
  if (b && b !== build0) showUpdate();
}
function showUpdate() {
  if (document.getElementById('update-bar')) return;
  document.body.append(el('div', { id: 'update-bar', class: 'update-bar', role: 'alert' },
    el('span', {}, 'Jest nowa wersja Trenera. Odśwież, żeby z niej korzystać (postęp się nie zgubi).'),
    el('button', { class: 'btn primary small', onclick: () => { store.flush(); setTimeout(() => location.reload(), 150); } }, 'Odśwież')));
}
function watchVersion() {
  checkVersion();
  setInterval(checkVersion, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });
  bus.on((e) => { if (e.t === 'server' && e.up) setTimeout(checkVersion, 500); });
}

function updateLink() {
  const p = document.getElementById('link');
  if (!p) return;
  let text, cls;
  if (!bus.link.server) { text = 'Brak serwera Trenera: uruchom Trener.bat'; cls = 'bad'; }
  else if (!bus.link.router) { text = 'Router nie odpowiada'; cls = 'bad'; }
  else if (routerState.connected === false) { text = 'Router działa, klawiatura odłączona'; cls = 'warn'; }
  else { text = `Połączono${routerState.touch ? `, czucie ${routerState.touch === 'light' ? 'Light' : routerState.touch === 'heavy' ? 'Heavy' : 'Acoustic'}` : ''}`; cls = 'ok'; }
  p.textContent = text;
  p.className = `pill link ${cls}`;
}

// --- "Co ja gram?" -----------------------------------------------------------------------------------------
function updateWhat() {
  clearTimeout(whatTimer);
  // a chord is rarely pressed at one instant: wait a moment before naming it
  whatTimer = setTimeout(renderWhat, held.size ? 45 : 900);
}

function renderWhat() {
  const box = document.getElementById('whatplay');
  if (!box) return;
  const key = getKey();
  const sounding = [...new Set([...held, ...sustained])];
  // what the hands hold; with the pedal also what still sounds (it may be a different chord)
  const rh = held.size ? identify([...held], key) : null;
  const rs = sustained.size && sounding.length >= 2 ? identify(sounding, key) : null;
  // one or two keys held over a pedalled chord: what sounds is the chord
  const r = rs && rs.kind === 'chord' && (!rh || rh.kind !== 'chord') ? rs : (rh || rs);
  const mini = document.getElementById('whatmini');
  if (mini) {
    mini.classList.toggle('idle', !r);
    if (r) fill(mini, el('b', {}, r.name), r.number ? el('span', {}, r.number) : null);
    else if (!mini.firstChild) fill(mini, el('b', {}, keyName(key, true)));
  }
  if (!r) {
    box.classList.add('idle');
    if (!box.firstChild) fill(box, el('span', { class: 'wp-label' }, 'Co ja gram?'), el('b', { class: 'wp-name' }, '–'), el('span', { class: 'wp-detail' }, `Przytrzymaj akord. Tonacja: ${keyName(key, true)}.`));
    return;
  }
  box.classList.remove('idle');
  const lines = [...(r.lines || [])];
  if (r === rs && rh) lines.unshift(`na pedale (trzymasz: ${rh.name})`);
  else if (r === rh && rs && rs.name !== rh.name) lines.unshift(`z pedałem brzmi: ${rs.name}${rs.number ? ` (${rs.number})` : ''}`);
  if (!rh && rs) lines.unshift('brzmi na pedale (klawisze puszczone)');
  box.title = lines.join('\n');
  fill(box, el('span', { class: 'wp-label' }, 'Co ja gram?'),
    el('b', { class: 'wp-name' }, r.name),
    r.number ? el('span', { class: 'wp-num' }, r.number) : null,
    el('span', { class: 'wp-detail' }, r.detail),
    r.alts && r.alts.length ? el('span', { class: 'wp-alt' }, `albo: ${r.alts.join(', ')}`) : null,
    lines.length ? el('ul', { class: 'wp-lines' }, lines.slice(0, 5).map((t) => el('li', {}, t))) : null);
}

function updateTodayPill() {
  const p = document.getElementById('today-min');
  if (p) p.textContent = `dziś ${fmtMin((store.data.days[store.today()] || {}).sec || 0)}`;
}

function onKey(e) {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLoop(); toast(loopOn() ? 'Pętla włączona.' : 'Pętla wyłączona.'); return; }
  const map = { ' ': 'start', Enter: 'start', r: 'repeat', h: 'hint', p: 'pause', Escape: 'end' };
  const a = map[e.key];
  if (a) { e.preventDefault(); pilot(a); }
}

async function main() {
  await store.load();
  setClick(store.data.settings);
  layout();
  applyCompact();
  COMPACT_Q.addEventListener('change', applyCompact);
  keepAwake();
  renderRunbar();
  updateTodayPill();
  bus.on(onBus);
  bus.connect();
  try { insight = await bus.getJSON('/api/insights'); } catch { insight = null; }
  go('kolo');
  renderWhat();
  onKeyChange(() => { const b = document.getElementById('whatplay'); const m = document.getElementById('whatmini'); if (!held.size) { if (b) fill(b); if (m) fill(m); } renderWhat(); });
  updateLink();
  setInterval(updateLink, 2000);
  setInterval(() => maybeEndTip('time'), 30000);
  watchVersion();
  document.addEventListener('keydown', onKey);
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.flush(); });
  store.onChange(() => refreshNav());
}

main();
