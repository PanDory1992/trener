// Kostka i delikatne podpowiedzi: what to play when you do not want to choose, and a few quiet hints
// computed from your progress. Also what every "umiem" item is (title, a "Zagraj …" prompt, how to open it).
// Pure (tested in node): everything comes in as arguments (mastery records, today, a random function).
import {
  keyAt, keyName, keySignature, SCALES, PROGRESSIONS, PATTERNS, progressionChords, family, LETTERS,
} from './theory.js';
import { FADE_NAMES, NEED_CLEAN, dueOf, isDue, daysBetween } from './mastery.js';
import { plural } from './music.js';
import { parseChart } from './songs.js';
import { FIVE_PATTERNS, PAIRS, thumbDrills } from './fingers.js';

const HAND_I = { rh: 'prawą ręką', lh: 'lewą ręką', both: 'obiema rękami' };
const TAB_OF = { gama: 'gama', akordy: 'akordy', prog: 'progresje', akomp: 'akomp' };

/**
 * What an item id means, or null when its card no longer exists.
 * Koło: "major3|gama|dur|rh", "minor0|akordy|rodzina|7", "major0|akordy|przewroty|43", "major0|prog|hymn",
 *       "major0|akomp|walc|hymn".  Piosenki: "song|<id>|<section>|<pattern>".
 * songs: [{id, title, text}] (yours and the starters) to check song items.
 */
export function parseItem(id, { songs = null } = {}) {
  if (typeof id !== 'string') return null;
  const parts = id.split('|');
  if (parts[0] === 'song') {
    const [, songId, sec, pattern] = parts;
    const section = Number(sec);
    if (!songId || !Number.isInteger(section) || section < 0 || !PATTERNS.some((p) => p.id === pattern)) return null;
    let song = null, sectionName = `część ${section + 1}`;
    if (songs) {
      song = songs.find((s) => s.id === songId);
      if (!song) return null;
      try {
        const ch = parseChart(song.text || '');
        if (section >= ch.sections.length) return null;
        sectionName = ch.sections[section].name;
      } catch { return null; }
    }
    return { kind: 'song', id, songId, section, pattern, song, sectionName, title: song ? song.title : 'piosenka' };
  }
  if (parts[0] === 'palce') return parsePalce(id, parts);
  const m = /^(major|minor)(\d+)$/.exec(parts[0]);
  if (!m) return null;
  const i = Number(m[2]);
  if (i < 0 || i > 11) return null;
  const mode = m[1];
  const key = keyAt(i, mode);
  const tab = TAB_OF[parts[1]];
  const base = { kind: 'kolo', id, key, mode, i, tab };
  if (parts[1] === 'gama') {
    const [, , scale, hand] = parts;
    if (!SCALES[scale] || !HAND_I[hand]) return null;
    return { ...base, scale, hand };
  }
  if (parts[1] === 'akordy') {
    const [, , what, x] = parts;
    if (what === 'rodzina' && (x === '3' || x === '7')) return { ...base, sevenths: x === '7' };
    const pm = /^([0-6])(3|7)$/.exec(x || '');
    if (what === 'przewroty' && pm) return { ...base, sevenths: pm[2] === '7', inv: Number(pm[1]) };
    return null;
  }
  if (parts[1] === 'prog') {
    const prog = PROGRESSIONS.find((p) => p.id === parts[2] && p.mode === mode);
    return prog ? { ...base, prog: prog.id } : null;
  }
  if (parts[1] === 'akomp') {
    const pat = PATTERNS.find((p) => p.id === parts[2]);
    const prog = PROGRESSIONS.find((p) => p.id === parts[3] && p.mode === mode);
    return pat && prog ? { ...base, pattern: pat.id, prog: prog.id } : null;
  }
  return null;
}

// --- Palce items: "palce|piec|major0|gora|rh", "palce|zawolanie|rh", "palce|rownosc|4|lh",
//     "palce|kciuk|minor3|rh|1", "palce|gamy|major2|contra|2"
const P_HANDS = { rh: 'prawą ręką', lh: 'lewą ręką', both: 'obiema rękami', par: 'obiema rękami równolegle', mirror: 'obiema rękami lustrzanie', contra: 'w ruchu przeciwnym' };
function palceKey(s) {
  const m = /^(major|minor)(\d+)$/.exec(s || '');
  if (!m || Number(m[2]) > 11) return null;
  return keyAt(Number(m[2]), m[1]);
}
function parsePalce(id, parts) {
  const ex = parts[1];
  const base = { kind: 'palce', id, ex };
  if (ex === 'zawolanie') return ['rh', 'lh', 'both'].includes(parts[2]) ? { ...base, key: null, hands: parts[2] } : null;
  if (ex === 'rownosc') {
    const [, , pair, hand] = parts;
    if (!(pair === 'all' || PAIRS.some(([a]) => String(a) === pair)) || !['rh', 'lh'].includes(hand)) return null;
    return { ...base, key: null, pair, hand };
  }
  const key = palceKey(parts[2]);
  if (!key) return null;
  if (ex === 'piec') {
    const pat = FIVE_PATTERNS.find((p) => p.id === parts[3]);
    return pat && ['rh', 'lh', 'par', 'mirror'].includes(parts[4]) ? { ...base, key, pattern: pat.id, patName: pat.name, hands: parts[4] } : null;
  }
  if (ex === 'kciuk') {
    const hand = parts[3], drill = Number(parts[4]);
    if (!['rh', 'lh'].includes(hand) || !Number.isInteger(drill)) return null;
    const d = thumbDrills(key, key.mode === 'major' ? 'dur' : 'moll', hand)[drill];
    return d ? { ...base, key, hand, drill, drillName: d.name } : null;
  }
  if (ex === 'gamy') {
    const motion = parts[3], octaves = Number(parts[4]);
    return ['rh', 'lh', 'par', 'contra'].includes(motion) && (octaves === 1 || octaves === 2) ? { ...base, key, motion, octaves } : null;
  }
  return null;
}
const pairWords = (pair) => (pair === 'all' ? 'wszystkie pary palców' : `palce ${pair}–${Number(pair) + 1}`);
function palceTitle(info, acc = false) {
  const k = info.key ? keyName(info.key, true) : '';
  switch (info.ex) {
    case 'piec': return `pięć palców „${info.patName}” w ${k} ${P_HANDS[info.hands]}`;
    case 'zawolanie': return `palce na zawołanie ${P_HANDS[info.hands]}`;
    case 'rownosc': return `tryl na równość: ${pairWords(info.pair)}, ${P_HANDS[info.hand]}`;
    case 'kciuk': return `przełożenie kciuka ${info.drillName} w ${k} ${P_HANDS[info.hand]}`;
    default: return `${acc ? 'gamę' : 'gama'} ${k} ${P_HANDS[info.motion]}, ${info.octaves === 2 ? (acc ? '2 oktawy' : '2 oktawy') : (acc ? '1 oktawę' : '1 oktawa')}`;
  }
}

/** "gama E♭-dur", "skala dorycka od D", "pentatonika molowa od A". */
function scaleWords(key, sc, acc = false) {
  const tonic = keyName({ ...key, mode: 'major' });
  const nm = SCALES[sc].name;
  if (sc === 'dur' && key.mode === 'major') return `${acc ? 'gamę' : 'gama'} ${keyName(key, true)}`;
  if (sc === 'moll' && key.mode === 'minor') return `${acc ? 'gamę' : 'gama'} ${keyName(key, true)}`;
  const toAcc = (s) => s.split(' ').map((w) => (w === 'pentatonika' ? 'pentatonikę' : w.replace(/a(\)?)$/, 'ą$1'))).join(' ');
  if (nm.startsWith('pentatonika')) return `${acc ? toAcc(nm) : nm} od ${tonic}`;
  const noun = ['dur', 'moll', 'harm', 'durHarm'].includes(sc) ? (acc ? 'gamę' : 'gama') : (acc ? 'skalę' : 'skala');
  return `${noun} ${acc ? toAcc(nm) : nm} od ${tonic}`;
}

const numbersOf = (key, progId) => {
  const prog = PROGRESSIONS.find((p) => p.id === progId);
  const nums = progressionChords(key, prog, { color: 'triads' }).map((c) => c.number);
  return nums.filter((x, j) => j === 0 || x !== nums[j - 1]);
};
const progName = (pid) => (PROGRESSIONS.find((p) => p.id === pid) || { name: pid }).name;
const patName = (pid) => (PATTERNS.find((p) => p.id === pid) || { name: pid }).name;

/** A short name of the item, e.g. "gama E♭-dur lewą ręką". */
export function itemTitle(info) {
  if (!info) return '';
  if (info.kind === 'song') return `„${info.title}”, ${info.sectionName}`;
  if (info.kind === 'palce') return `Palce: ${palceTitle(info)}`;
  const k = keyName(info.key, true);
  switch (info.tab) {
    case 'gama': return `${scaleWords(info.key, info.scale)} ${HAND_I[info.hand]}`;
    case 'akordy':
      if (info.inv != null) return `przewroty ${family(info.key, info.sevenths)[info.inv].name} w ${k}`;
      return `rodzina akordów ${k}${info.sevenths ? ' z septymą' : ''}`;
    case 'progresje': return `progresja „${progName(info.prog)}” w ${k}`;
    case 'akomp': return `akompaniament „${patName(info.pattern)}” do „${progName(info.prog)}” w ${k}`;
    default: return info.id;
  }
}

/** "Zagraj 2m–5–1 w E♭-dur" and the like: what to play, in one line. */
export function playPrompt(info) {
  if (!info) return '';
  if (info.kind === 'song') return `Zagraj „${info.sectionName}” z „${info.title}”`;
  if (info.kind === 'palce') return `Zagraj ${palceTitle(info, true)}`;
  const k = keyName(info.key, true);
  switch (info.tab) {
    case 'gama': return `Zagraj ${scaleWords(info.key, info.scale, true)} ${HAND_I[info.hand]}`;
    case 'akordy': {
      const fam = family(info.key, info.sevenths);
      if (info.inv != null) return `Zagraj ${fam[info.inv].name} we wszystkich przewrotach (${k})`;
      return `Zagraj rodzinę akordów ${k}: ${fam.map((c) => c.number).join('–')}`;
    }
    case 'progresje': {
      const nums = numbersOf(info.key, info.prog);
      return nums.length <= 6 ? `Zagraj ${nums.join('–')} w ${k}` : `Zagraj „${progName(info.prog)}” w ${k}`;
    }
    case 'akomp': {
      const nums = numbersOf(info.key, info.prog);
      return `Zagraj akompaniament „${patName(info.pattern)}” do ${nums.length <= 6 ? nums.join('–') : `„${progName(info.prog)}”`} w ${k}`;
    }
    default: return '';
  }
}

/** How to open the item: { view: 'kolo'|'piosenki', preset }. way: 'tempo' | 'wait' | 'dark'. */
export function openFor(info, { way = null, review = false } = {}) {
  if (!info) return null;
  if (info.kind === 'palce') {
    const { kind, id, key, patName, drillName, ...opts } = info;   // eslint-disable-line no-unused-vars
    return { view: 'palce', preset: { ...opts, key: key ? { li: key.li, acc: key.acc, mode: key.mode } : null, way, review: review ? info.id : null, item: info.id } };
  }
  if (info.kind === 'song') return { view: 'piosenki', preset: { song: info.songId, section: info.section, pattern: info.pattern, way, review: review ? info.id : null } };
  const key = { li: info.key.li, acc: info.key.acc, mode: info.key.mode };
  const p = { tab: info.tab, key, way, review: review ? info.id : null, item: info.id };
  if (info.tab === 'gama') Object.assign(p, { scale: info.scale, hand: info.hand });
  if (info.tab === 'akordy') Object.assign(p, { sevenths: info.sevenths, inv: info.inv != null ? info.inv : null });
  if (info.tab === 'progresje') p.prog = info.prog;
  if (info.tab === 'akomp') Object.assign(p, { prog: info.prog, pattern: info.pattern });
  return { view: 'kolo', preset: p };
}

// --- Kostka -----------------------------------------------------------------------------------------------------
const tailBad = (r) => {
  const t = r.tail || '';
  return t.slice(-2).includes('x');
};
function weakWhy(r) {
  const t = (r.tail || '').slice(-2);
  if (r.lapses && r.due && r.stage < 3 && t.endsWith('x')) return 'ostatnia powtórka się posypała';
  if (t === 'xx') return '2 ostatnie przejścia się sypały';
  if (t.endsWith('x')) return 'ostatnie przejście się sypało';
  if (t.includes('x')) return 'jedno z 2 ostatnich przejść się sypało';
  return `stoi na etapie „ze światłami” od ${r.passes} ${plural(r.passes, 'przejścia', 'przejść', 'przejść')}`;
}
function progressWhy(r) {
  if (r.stage === 1) return 'teraz „W tempie”';
  if (r.fade < 3) return `światła: ${FADE_NAMES[r.fade]}`;
  const left = Math.max(1, NEED_CLEAN - (r.cleanRun || 0));
  return `jeszcze ${left} ${plural(left, 'czyste przejście', 'czyste przejścia', 'czystych przejść')} bez świateł do „umiem”`;
}
const wayFor = (r) => (r && r.stage >= 1 ? 'tempo' : 'wait');

/** The basic things worth starting in a key, in order. */
export function basicsFor(mode, i) {
  const k = `${mode}${i}`;
  const first = PROGRESSIONS.find((p) => p.mode === mode).id;
  return [`${k}|gama|${mode === 'major' ? 'dur' : 'moll'}|rh`, `${k}|akordy|rodzina|3`, `${k}|prog|${first}`, `${k}|gama|${mode === 'major' ? 'dur' : 'moll'}|lh`, `${k}|akomp|blok|${first}`];
}

function sigDiff(a, b) {
  const sa = keySignature(a), sb = keySignature(b);
  const sv = (s) => (s.sign === '♭' ? -s.count : s.count);
  const d = sv(sb) - sv(sa);
  if (!d) return 'ten sam zapis';
  if (Math.abs(d) > 1) return 'inny zapis';
  return d > 0 ? (sv(sb) > 0 ? 'jeden krzyżyk więcej' : 'jeden bemol mniej') : (sv(sb) < 0 ? 'jeden bemol więcej' : 'jeden krzyżyk mniej');
}

/** Candidate lists for the dice (Koło items only). */
export function diceCandidates(mastery = {}) {
  const weak = [], progress = [], fresh = [];
  const started = [];
  for (const [id, r] of Object.entries(mastery)) {
    if (!r || typeof r !== 'object') continue;
    const info = parseItem(id);
    if (!info || info.kind !== 'kolo') continue;
    if (r.stage >= 1) started.push({ id, info, r });
    if (r.stage < 1 || r.stage > 2) continue;
    const isWeak = tailBad(r) || (r.stage === 1 && r.passes >= 4 && !(r.tail || '').endsWith('c'));
    (isWeak ? weak : progress).push({ id, info, r });
  }
  const has = (id) => mastery[id] && mastery[id].stage >= 1;
  const seen = new Set();
  const addFresh = (id, why) => {
    if (seen.has(id) || has(id)) return;
    const info = parseItem(id);
    if (!info) return;
    seen.add(id);
    fresh.push({ id, info, r: null, why });
  };
  if (!started.length) {
    for (const i of [0, 1, 11]) addFresh(basicsFor('major', i)[0], i === 0 ? 'na start: same białe klawisze' : `na start: ${sigDiff(keyAt(0, 'major'), keyAt(i, 'major'))} niż C-dur`);
  } else {
    for (const { info } of started) {
      const suffix = info.id.slice(info.id.indexOf('|'));
      for (const d of [1, -1]) {
        const nk = keyAt(info.i + d, info.mode);
        const nid = `${info.mode}${(info.i + d + 12) % 12}${suffix}`;
        addFresh(nid, `obok ${keyName(info.key, true)} na kole (${sigDiff(info.key, nk)})`);
      }
    }
    // the basics in the keys next to yours
    for (const { info } of started) {
      for (const d of [1, -1]) {
        const ni = (info.i + d + 12) % 12;
        for (const nid of basicsFor(info.mode, ni)) addFresh(nid, `obok ${keyName(info.key, true)} na kole (${sigDiff(info.key, keyAt(ni, info.mode))})`);
      }
    }
  }
  return { weak, progress, fresh };
}

/**
 * Kostka: ~40% a weak spot, ~30% something in progress, ~30% something new next door on the wheel.
 * rnd: () => [0,1). exclude: the last pick (not twice in a row when there is a choice).
 * Returns { kind: 'weak'|'progress'|'new', id, info, why, open } or null.
 */
export function pickDice(mastery = {}, { rnd = Math.random, exclude = null } = {}) {
  const c = diceCandidates(mastery);
  const lists = [['weak', c.weak, 0.4], ['progress', c.progress, 0.3], ['new', c.fresh, 0.3]]
    .map(([k, l, w]) => [k, l.length > 1 && exclude ? l.filter((x) => x.id !== exclude) : l, w])
    .filter(([, l]) => l.length);
  if (!lists.length) return null;
  const sum = lists.reduce((a, [, , w]) => a + w, 0);
  let x = rnd() * sum;
  let pick = lists[lists.length - 1];
  for (const l of lists) { if (x < l[2]) { pick = l; break; } x -= l[2]; }
  const [kind, list] = pick;
  // new things: the first candidates are the closest to what you play; pick among the first few
  const pool = kind === 'new' ? list.slice(0, 4) : list;
  const it = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  const title = itemTitle(it.info);
  const why = kind === 'weak' ? `Słabe miejsce: ${title} — ${weakWhy(it.r)}.`
    : kind === 'progress' ? `W toku: ${title} — ${progressWhy(it.r)}.`
      : `Nowe: ${title} — ${it.why}.`;
  return { kind, id: it.id, info: it.info, why, open: openFor(it.info, { way: wayFor(it.r) }) };
}

// --- delikatne podpowiedzi ------------------------------------------------------------------------------------------
/**
 * A few quiet hints from the data: [{ id, text, open? }]. The page shows one or two and rotates them.
 * songs: for song items. today: YYYY-MM-DD.
 */
export function hints(mastery = {}, { today, songs = null } = {}) {
  const out = [];
  const entries = Object.entries(mastery).filter(([, r]) => r && typeof r === 'object');
  const due = entries.filter(([id, r]) => isDue(r, today) && parseItem(id, { songs }));
  if (due.length) out.push({ id: 'due', text: `Do powtórki dziś: ${due.length} ${plural(due.length, 'rzecz', 'rzeczy', 'rzeczy')}.`, review: true });
  // ready to try without lights
  const ready = entries.filter(([id, r]) => r.stage === 2 && r.fade >= 2 && parseItem(id, { songs }))
    .sort((a, b) => String(b[1].last || '').localeCompare(String(a[1].last || '')));
  if (ready.length) {
    const info = parseItem(ready[0][0], { songs });
    out.push({ id: `ready:${ready[0][0]}`, text: info.tab === 'gama' ? `Ta gama jest gotowa na „Bez świateł”: ${itemTitle(info)}.` : `Gotowe na „Bez świateł”: ${itemTitle(info)}.`, open: openFor(info, { way: 'dark' }) });
  }
  // keys you have not visited for a while (only when you play at all)
  const kolo = entries.map(([id, r]) => [parseItem(id), r]).filter(([i, r]) => i && i.kind === 'kolo' && r.last);
  const recent = kolo.some(([, r]) => daysBetween(r.last, today) <= 14);
  if (recent && kolo.length >= 3) {
    const groups = [
      ['flats', (i) => i.i >= 7, 'tonacji z bemolami', 'Tonacje z bemolami jeszcze przed tobą. Najbliżej jest F-dur: jeden bemol.', { tab: 'gama', key: { li: LETTERS.indexOf('F'), acc: 0, mode: 'major' }, scale: 'dur', hand: 'rh' }],
      ['sharps', (i) => i.i >= 1 && i.i <= 6, 'tonacji z krzyżykami', 'Tonacje z krzyżykami jeszcze przed tobą. Najbliżej jest G-dur: jeden krzyżyk.', { tab: 'gama', key: { li: LETTERS.indexOf('G'), acc: 0, mode: 'major' }, scale: 'dur', hand: 'rh' }],
      ['minor', (i) => i.mode === 'minor', 'w tonacjach molowych', 'Tonacje molowe jeszcze przed tobą. a-moll ma te same dźwięki co C-dur.', { tab: 'gama', key: { li: LETTERS.indexOf('A'), acc: 0, mode: 'minor' }, scale: 'moll', hand: 'rh' }],
    ];
    for (const [gid, inG, words, never, preset] of groups) {
      const last = kolo.filter(([i]) => inG(i)).map(([, r]) => r.last).sort().pop();
      if (!last) out.push({ id: gid, text: never, open: { view: 'kolo', preset } });
      else {
        const d = daysBetween(last, today);
        if (d >= 7) out.push({ id: gid, text: `Dawno nie grałeś ${words} (ostatnio ${d} dni temu).` });
      }
    }
  }
  return out;
}

/** The first thing whose first pass was today (for "Na koniec: wróć…"), or null. */
export function firstNewToday(mastery = {}, { today, songs = null } = {}) {
  let best = null;
  for (const [id, r] of Object.entries(mastery)) {
    if (!r || r.first !== today) continue;
    const info = parseItem(id, { songs });
    if (!info) continue;
    if (!best || (r.firstTs || 0) < (best.r.firstTs || 0)) best = { id, r, info };
  }
  if (!best) return null;
  return { id: best.id, info: best.info, title: itemTitle(best.info), open: openFor(best.info, { way: wayFor(best.r) }) };
}

/** Today's reviews as items that still exist: [{ id, info, title, prompt, due }]. */
export function reviewList(mastery = {}, { today, songs = null } = {}) {
  return Object.entries(mastery)
    .filter(([, r]) => r && typeof r === 'object' && isDue(r, today))
    .map(([id, r]) => ({ id, r, info: parseItem(id, { songs }) }))
    .filter((x) => x.info)
    .sort((a, b) => dueOf(a.r).localeCompare(dueOf(b.r)) || a.id.localeCompare(b.id))
    .map(({ id, r, info }) => ({ id, info, title: itemTitle(info), prompt: playPrompt(info), due: dueOf(r), lapsed: r.stage < 3 }));
}

// --- the walk through today's reviews (one at a time) -------------------------------------------------------------
export const walk = { ids: [], i: 0, results: {}, active: false };
export function startWalk(ids) { walk.ids = [...ids]; walk.i = 0; walk.results = {}; walk.active = ids.length > 0; return walk.ids[0] || null; }
export function walkCurrent() { return walk.active ? walk.ids[walk.i] || null : null; }
export function walkResult(id, ok) { if (walk.active && id === walk.ids[walk.i]) walk.results[id] = ok; }
export function walkNext() { if (!walk.active) return null; walk.i++; if (walk.i >= walk.ids.length) { walk.active = false; return null; } return walk.ids[walk.i]; }
export function walkStop() { walk.active = false; }
export function walkSummary() { const v = Object.values(walk.results); return { done: v.length, ok: v.filter(Boolean).length, total: walk.ids.length }; }
