// Theory for the key wheel and the jam: correct spelling in all 24 keys, scales with
// fingering, chord families, progressions by mood, chord recognition, "why" texts.
// Pure functions (tested in node).
import { prefs } from './music.js';

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NAT = [0, 2, 4, 5, 7, 9, 11];
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const mod12 = (x) => ((x % 12) + 12) % 12;

// --- keys -------------------------------------------------------------------------------------
// Wheel order, clockwise from the top. Minor keys sit inside their relative major.
export const WHEEL_MAJOR = [['C', 0], ['G', 0], ['D', 0], ['A', 0], ['E', 0], ['B', 0], ['F', 1], ['D', -1], ['A', -1], ['E', -1], ['B', -1], ['F', 0]];
export const WHEEL_MINOR = [['A', 0], ['E', 0], ['B', 0], ['F', 1], ['C', 1], ['G', 1], ['E', -1], ['B', -1], ['F', 0], ['C', 0], ['G', 0], ['D', 0]];

export function makeKey(letter, acc, mode) {
  const li = LETTERS.indexOf(letter);
  return { li, acc, mode, tonicPc: mod12(NAT[li] + acc) };
}
export function keyAt(index, mode) {
  const [l, a] = (mode === 'minor' ? WHEEL_MINOR : WHEEL_MAJOR)[mod12(index)];
  return makeKey(l, a, mode);
}
export function wheelIndex(key) {
  const list = key.mode === 'minor' ? WHEEL_MINOR : WHEEL_MAJOR;
  return list.findIndex(([l, a]) => LETTERS.indexOf(l) === key.li && a === key.acc);
}
/** The next key for a walk: 1 / -1 = a step on the wheel, 'up' / 'down' = a semitone (as on the keyboard). */
export function stepKey(key, walk) {
  if (walk === 'up' || walk === 'down') {
    const target = mod12(key.tonicPc + (walk === 'up' ? 1 : -1));
    for (let i = 0; i < 12; i++) { const k = keyAt(i, key.mode); if (k.tonicPc === target) return k; }
  }
  return keyAt(wheelIndex(key) + Number(walk || 0), key.mode);
}
export function relativeOf(key) {
  return keyAt(wheelIndex(key), key.mode === 'major' ? 'minor' : 'major');
}
export const ALL_KEYS = [...WHEEL_MAJOR.map((_, i) => keyAt(i, 'major')), ...WHEEL_MINOR.map((_, i) => keyAt(i, 'minor'))];

// --- spelling ------------------------------------------------------------------------------------
export function spellName(li, acc) {
  let name = LETTERS[li] + ACC[acc];
  if (prefs.hNames && li === 6) name = acc === 0 ? 'H' : acc === -1 ? 'B' : acc === 1 ? 'H♯' : name;
  return name;
}

/** A spelled pitch from a letter index and a pitch class. */
export function spellPc(li, pc) {
  const l = ((li % 7) + 7) % 7;
  const acc = mod12(pc - NAT[l] + 6) - 6;
  return { li: l, pc: mod12(pc), acc, name: spellName(l, acc) };
}

export function keyName(key, long = false) {
  const n = spellName(key.li, key.acc);
  if (!long) return key.mode === 'minor' ? `${n}m` : n;
  return key.mode === 'minor' ? `${n.toLowerCase()}-moll` : `${n}-dur`;
}

/** Spelled degree of a key: deg 1..7 (above 7 wraps), alt in semitones vs the major scale. */
export function degreeOf(key, deg, alt = 0) {
  const d = deg - 1;
  return spellPc(key.li + d, key.tonicPc + MAJ[mod12(d) % 7] + 12 * Math.floor(d / 7) + alt);
}

// --- scales -----------------------------------------------------------------------------------------
// [degree, alteration vs major]
export const SCALES = {
  dur: { name: 'durowa', short: 'dur', deg: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0]] },
  moll: { name: 'molowa naturalna', short: 'moll', deg: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, -1], [7, -1]] },
  harm: { name: 'molowa harmoniczna', short: 'moll harm.', deg: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, -1], [7, 0]] },
  pentaDur: { name: 'pentatonika durowa', short: 'penta dur', deg: [[1, 0], [2, 0], [3, 0], [5, 0], [6, 0]] },
  pentaMoll: { name: 'pentatonika molowa', short: 'penta moll', deg: [[1, 0], [3, -1], [4, 0], [5, 0], [7, -1]] },
  blues: { name: 'bluesowa', short: 'blues', deg: [[1, 0], [3, -1], [4, 0], [5, -1], [5, 0], [7, -1]] },
  dorycka: { name: 'dorycka', short: 'dorycka', deg: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, 0], [7, -1]] },
  miksolidyjska: { name: 'miksolidyjska', short: 'miksolid.', deg: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, -1]] },
  hidzaz: { name: 'frygijska dominantowa (hidżaz, flamenco)', short: 'fryg. dom.', color: true, deg: [[1, 0], [2, -1], [3, 0], [4, 0], [5, 0], [6, -1], [7, -1]] },
  wegierska: { name: 'węgierska molowa', short: 'węgierska', color: true, deg: [[1, 0], [2, 0], [3, -1], [4, 1], [5, 0], [6, -1], [7, 0]] },
  podwojna: { name: 'podwójnie harmoniczna', short: 'podw. harm.', color: true, deg: [[1, 0], [2, -1], [3, 0], [4, 0], [5, 0], [6, -1], [7, 0]] },
  // modes of the major scale (jońska = dur, eolska = moll)
  frygijska: { name: 'frygijska', short: 'frygijska', deg: [[1, 0], [2, -1], [3, -1], [4, 0], [5, 0], [6, -1], [7, -1]] },
  lidyjska: { name: 'lidyjska', short: 'lidyjska', deg: [[1, 0], [2, 0], [3, 0], [4, 1], [5, 0], [6, 0], [7, 0]] },
  lokrycka: { name: 'lokrycka', short: 'lokrycka', deg: [[1, 0], [2, -1], [3, -1], [4, 0], [5, -1], [6, -1], [7, -1]] },
  // blues and jazz
  bluesDur: { name: 'bluesowa durowa', short: 'blues dur', deg: [[1, 0], [2, 0], [3, -1], [3, 0], [5, 0], [6, 0]] },
  melodyczna: { name: 'molowa melodyczna (jazzowa)', short: 'melodyczna', deg: [[1, 0], [2, 0], [3, -1], [4, 0], [5, 0], [6, 0], [7, 0]] },
  lidyjskaDom: { name: 'lidyjska dominantowa', short: 'lid. dominant.', deg: [[1, 0], [2, 0], [3, 0], [4, 1], [5, 0], [6, 0], [7, -1]] },
  alterowana: { name: 'alterowana', short: 'alterowana', deg: [[1, 0], [2, -1], [2, 1], [3, 0], [4, 1], [6, -1], [7, -1]] },
  bebop: { name: 'bebopowa dominantowa', short: 'bebop', deg: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, -1], [7, 0]] },
  calotonowa: { name: 'całotonowa', short: 'całotonowa', deg: [[1, 0], [2, 0], [3, 0], [4, 1], [5, 1], [7, -1]] },
  zmnPC: { name: 'zmniejszona półton–cały', short: 'zmn. pół–cały', deg: [[1, 0], [2, -1], [2, 1], [3, 0], [4, 1], [5, 0], [6, 0], [7, -1]] },
  zmnCP: { name: 'zmniejszona cały–półton', short: 'zmn. cały–pół', deg: [[1, 0], [2, 0], [3, -1], [4, 0], [5, -1], [6, -1], [6, 0], [7, 0]] },
  durHarm: { name: 'durowa harmoniczna', short: 'dur harm.', deg: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, -1], [7, 0]] },
  // world
  ukrainska: { name: 'ukraińska dorycka', short: 'ukr. dorycka', color: true, deg: [[1, 0], [2, 0], [3, -1], [4, 1], [5, 0], [6, 0], [7, -1]] },
  neapolitanska: { name: 'neapolitańska molowa', short: 'neapolit.', color: true, deg: [[1, 0], [2, -1], [3, -1], [4, 0], [5, 0], [6, -1], [7, 0]] },
  persjanska: { name: 'perska', short: 'perska', color: true, deg: [[1, 0], [2, -1], [3, 0], [4, 0], [5, -1], [6, -1], [7, 0]] },
  hirajoshi: { name: 'hirajōshi (japońska)', short: 'hirajōshi', color: true, deg: [[1, 0], [2, 0], [3, -1], [5, 0], [6, -1]] },
  inSen: { name: 'in-sen (japońska)', short: 'in-sen', color: true, deg: [[1, 0], [2, -1], [4, 0], [5, 0], [7, -1]] },
};

/** Groups of scales on the Gama card. A scale id may stand under another name in a group (jońska = dur). */
export const SCALE_GROUPS = [
  { id: 'podst', name: 'Podstawowe', list: [['dur'], ['moll'], ['harm'], ['melodyczna']] },
  { id: 'mody', name: 'Mody', list: [['dur', 'jońska'], ['dorycka'], ['frygijska'], ['lidyjska'], ['miksolidyjska'], ['moll', 'eolska'], ['lokrycka']] },
  { id: 'penta', name: 'Pentatoniki i blues', list: [['pentaDur'], ['pentaMoll'], ['bluesDur'], ['blues']] },
  { id: 'jazz', name: 'Jazz', list: [['melodyczna'], ['lidyjskaDom'], ['alterowana'], ['bebop'], ['calotonowa'], ['zmnPC'], ['zmnCP'], ['durHarm']] },
  { id: 'swiat', name: 'Świat', list: [['hidzaz'], ['wegierska'], ['podwojna'], ['ukrainska'], ['neapolitanska'], ['persjanska'], ['hirajoshi'], ['inSen']] },
];
/** Which key (dur or moll) a scale belongs to when it is played from a tonic outside the chosen key. */
export const MINORISH = new Set(['moll', 'harm', 'melodyczna', 'pentaMoll', 'blues', 'dorycka', 'frygijska', 'lokrycka', 'wegierska', 'ukrainska', 'neapolitanska', 'hirajoshi', 'zmnCP']);
/** The key with this tonic (as spelled on the wheel). */
export function keyByTonic(pc, mode) {
  for (let i = 0; i < 12; i++) { const k = keyAt(i, mode); if (k.tonicPc === ((pc % 12) + 12) % 12) return k; }
  return null;
}

/** Degree label like "3", "♭3", "♯4". */
export function degLabel(deg, alt) {
  return (alt < 0 ? '♭' : alt > 0 ? '♯' : '') + deg;
}

/** Scale notes as MIDI from `startMidi` (the tonic in the octave wanted), ascending one octave + top tonic. */
export function scaleNotes(key, scaleId, octaveBase = 60) {
  const tonicMidi = octaveBase + key.tonicPc - (key.tonicPc > 6 ? 12 : 0);
  const notes = SCALES[scaleId].deg.map(([d, a]) => {
    const sp = degreeOf(key, d, a);
    const semis = MAJ[d - 1] + a;
    return { midi: tonicMidi + semis, name: sp.name, deg: degLabel(d, a), pc: sp.pc };
  });
  notes.push({ ...notes[0], midi: tonicMidi + 12 });
  return notes;
}

// Standard one-octave fingerings (ascending, 8 notes), right and left hand.
const FINGER = {
  major: {
    C: ['12312345', '54321321'], G: ['12312345', '54321321'], D: ['12312345', '54321321'],
    A: ['12312345', '54321321'], E: ['12312345', '54321321'], B: ['12312345', '43214321'],
    'F♯': ['23412312', '43213214'], 'D♭': ['23123412', '32143213'], 'A♭': ['34123123', '32143213'],
    'E♭': ['31234123', '32143213'], 'B♭': ['41231234', '32143213'], F: ['12341234', '54321321'],
  },
  minor: {
    A: ['12312345', '54321321'], E: ['12312345', '54321321'], B: ['12312345', '43214321'],
    'F♯': ['34123123', '43213214'], 'C♯': ['34123123', '32143213'], 'G♯': ['34123123', '32132143'],
    'E♭': ['31234123', '21432132'], 'B♭': ['21231234', '21321432'], F: ['12341234', '54321321'],
    C: ['12312345', '54321321'], G: ['12312345', '54321321'], D: ['12312345', '54321321'],
  },
};

/** Fingering for a 7-note scale on this tonic, or null (pentatonics, blues: play comfortably). */
export function fingering(key, scaleId) {
  const name = LETTERS[key.li] + ACC[key.acc];
  const minorish = ['moll', 'harm', 'dorycka', 'wegierska'].includes(scaleId);
  const majorish = ['dur', 'miksolidyjska'].includes(scaleId);
  if (!minorish && !majorish) return null;
  const table = minorish ? FINGER.minor : FINGER.major;
  const f = table[name];
  if (!f) return null;
  return { rh: [...f[0]].map(Number), lh: [...f[1]].map(Number) };
}

// --- chords ---------------------------------------------------------------------------------------------
export const QUALITY = {
  maj: { iv: [0, 4, 7], sym: '', num: '' },
  min: { iv: [0, 3, 7], sym: 'm', num: 'm' },
  dim: { iv: [0, 3, 6], sym: '°', num: '°' },
  maj7: { iv: [0, 4, 7, 11], sym: 'maj7', num: 'maj7' },
  dom7: { iv: [0, 4, 7, 10], sym: '7', num: '⁷' },
  m7: { iv: [0, 3, 7, 10], sym: 'm7', num: 'm7' },
  m7b5: { iv: [0, 3, 6, 10], sym: 'm7♭5', num: 'ø' },
  maj9: { iv: [0, 4, 7, 11, 14], sym: 'maj9', num: 'maj9' },
  m9: { iv: [0, 3, 7, 10, 14], sym: 'm9', num: 'm9' },
  dom9: { iv: [0, 4, 7, 10, 14], sym: '9', num: '⁹' },
  // from songs (lt = letter steps for spelling, roles = names of the tones)
  sus4: { iv: [0, 5, 7], sym: 'sus4', num: 'sus4', lt: [0, 3, 4], roles: ['1', '4', '5'] },
  sus2: { iv: [0, 2, 7], sym: 'sus2', num: 'sus2', lt: [0, 1, 4], roles: ['1', '2', '5'] },
  maj6: { iv: [0, 4, 7, 9], sym: '6', num: '⁶', lt: [0, 2, 4, 5], roles: ['1', '3', '5', '6'] },
  m6: { iv: [0, 3, 7, 9], sym: 'm6', num: 'm6', lt: [0, 2, 4, 5], roles: ['1', '3', '5', '6'] },
  dim7: { iv: [0, 3, 6, 9], sym: '°7', num: '°7' },
  aug: { iv: [0, 4, 8], sym: '+', num: '+' },
  add9: { iv: [0, 4, 7, 14], sym: 'add9', num: 'add9', lt: [0, 2, 4, 8], roles: ['1', '3', '5', '9'] },
  madd9: { iv: [0, 3, 7, 14], sym: 'm(add9)', num: 'm(add9)', lt: [0, 2, 4, 8], roles: ['1', '3', '5', '9'] },
  dom7sus4: { iv: [0, 5, 7, 10], sym: '7sus4', num: '⁷sus4', lt: [0, 3, 4, 6], roles: ['1', '4', '5', '7'] },
  mmaj7: { iv: [0, 3, 7, 11], sym: 'm(maj7)', num: 'm(maj7)' },
  power: { iv: [0, 7], sym: '5', num: '5', lt: [0, 4], roles: ['1', '5'] },
};
const LETTER_STEP = [0, 2, 4, 6, 8]; // letter offsets for 1-3-5-7-9

/** A chord on a spelled root (li, pc): tones spelled correctly, names. */
export function chord(li, pc, quality) {
  const q = QUALITY[quality];
  const lt = q.lt || LETTER_STEP;
  const tones = q.iv.map((iv, k) => spellPc(li + lt[k], pc + iv));
  return { root: tones[0], quality, tones, name: tones[0].name + q.sym, roles: q.roles || ['1', '3', '5', '7', '9'].slice(0, q.iv.length) };
}

/** Upgrade a triad to a seventh chord the way jazz does (5 → dominant). */
export function seventhOf(quality, isDominant) {
  if (quality === 'maj') return isDominant ? 'dom7' : 'maj7';
  if (quality === 'min') return 'm7';
  if (quality === 'dim') return 'm7b5';
  return quality;
}
export function ninthOf(quality) {
  return { maj: 'maj9', maj7: 'maj9', min: 'm9', m7: 'm9', dom7: 'dom9' }[quality] || seventhOf(quality, false);
}

/** Chord on a scale degree of a key: deg, alt, quality → chord + number label. */
export function degreeChord(key, deg, alt, quality) {
  const r = degreeOf(key, deg, alt);
  const c = chord(r.li, r.pc, quality);
  c.number = degLabel(deg, alt) + QUALITY[quality].num;
  c.deg = deg; c.alt = alt;
  return c;
}

export const FAMILY = {
  major: [[1, 0, 'maj'], [2, 0, 'min'], [3, 0, 'min'], [4, 0, 'maj'], [5, 0, 'maj'], [6, 0, 'min'], [7, 0, 'dim']],
  // natural minor, but V major (from harmonic minor): that is what makes minor pull home
  minor: [[1, 0, 'min'], [2, 0, 'dim'], [3, -1, 'maj'], [4, 0, 'min'], [5, 0, 'maj'], [6, -1, 'maj'], [7, -1, 'maj']],
};

export function family(key, sevenths = false) {
  return FAMILY[key.mode].map(([d, a, q]) => degreeChord(key, d, a, sevenths ? seventhOf(q, d === 5 && a === 0 && q === 'maj') : q));
}

// --- progressions by mood ------------------------------------------------------------------------------------
export const PROGRESSIONS = [
  { id: 'hymn', mode: 'major', name: 'Pop-hymn', mood: 'wznosząco, radośnie', steps: [[1, 0, 'maj'], [5, 0, 'maj'], [6, 0, 'min'], [4, 0, 'maj']],
    why: '1 to dom, 5 to napięcie, 6m to smutny krewny jedynki, 4 to miękkie wyjście z domu. Ta czwórka brzmi znajomo, bo opiera się na niej mnóstwo piosenek.' },
  { id: 'smutnyPop', mode: 'major', name: 'Smutny pop', mood: 'melancholijnie', steps: [[6, 0, 'min'], [4, 0, 'maj'], [1, 0, 'maj'], [5, 0, 'maj']],
    why: 'Te same cztery akordy co w pop-hymnie, tylko start od 6m. Zaczynasz w smutku, a dur dopiero przychodzi. Kolejność zmienia nastrój bardziej niż same akordy.' },
  { id: 'lata50', mode: 'major', name: 'Lata 50.', mood: 'ciepło, staroświecko', steps: [[1, 0, 'maj'], [6, 0, 'min'], [4, 0, 'maj'], [5, 0, 'maj']],
    why: 'Bas schodzi w dół co tercję (1 → 6 → 4), a 5 na końcu ciągnie z powrotem do 1. Stąd to kołyszące „doo-wop”.' },
  { id: 'ballada', mode: 'major', name: 'Spokojna ballada', mood: 'łagodnie', steps: [[1, 0, 'maj'], [3, 0, 'min'], [6, 0, 'min'], [4, 0, 'maj']],
    why: '1 i 3m mają dwa wspólne dźwięki, 3m i 6m też. Ręka prawie się nie rusza, a harmonia płynie. To dobry trening przewrotów.' },
  { id: 'kanon', mode: 'major', name: 'Kanon (opadający bas)', mood: 'uroczyście', steps: [[1, 0, 'maj'], [5, 0, 'maj'], [6, 0, 'min'], [3, 0, 'min'], [4, 0, 'maj'], [1, 0, 'maj'], [4, 0, 'maj'], [5, 0, 'maj']],
    why: 'Bas schodzi krok po kroku, a akordy idą za nim. Barokowy schemat z XVII wieku, wciąż podkradany przez muzykę popularną.' },
  { id: 'vamp14', mode: 'major', name: 'Soulowy wahadłowy 1–4', mood: 'groove, gospel', steps: [[1, 0, 'maj'], [4, 0, 'maj']],
    why: 'Dwa akordy na zmianę. Cała uwaga idzie w rytm i brzmienie. 4 to „amen”-owy krok od 1, dlatego brzmi gospelowo.' },
  { id: 'blues', mode: 'major', name: 'Blues 12 taktów', mood: 'bluesowo', seventh: 'all', steps: [[1, 0, 'dom7'], [1, 0, 'dom7'], [1, 0, 'dom7'], [1, 0, 'dom7'], [4, 0, 'dom7'], [4, 0, 'dom7'], [1, 0, 'dom7'], [1, 0, 'dom7'], [5, 0, 'dom7'], [4, 0, 'dom7'], [1, 0, 'dom7'], [5, 0, 'dom7']],
    why: 'Trzy akordy (1, 4, 5), wszystkie dominantowe, czyli z „brudną” małą septymą. 12 taktów to cała opowieść: dom, wycieczka do 4, powrót, napięcie na 5, powrót.' },
  { id: 'iiVI', mode: 'major', name: 'Jazzowe ii–V–I', mood: 'jazz', jazz: true, steps: [[2, 0, 'min'], [5, 0, 'maj'], [1, 0, 'maj'], [1, 0, 'maj']],
    why: 'Najważniejsze zdanie jazzu. Każdy akord jest o kwintę niżej od poprzedniego (2 → 5 → 1), jak po kole tonacji w stronę domu. Septyma jednego akordu schodzi o półton do tercji następnego.' },
  { id: 'turnaround', mode: 'major', name: 'Turnaround 1–6–2–5', mood: 'jazz, standardy', jazz: true, steps: [[1, 0, 'maj'], [6, 0, 'min'], [2, 0, 'min'], [5, 0, 'maj']],
    why: 'Pętla, która zawsze prowadzi z powrotem do 1. Od 6 w dół po kole kwintowym: 6 → 2 → 5 → 1. Tak kończy się wiele standardów.' },
  { id: 'neosoul', mode: 'major', name: 'Neo-soulowe zejście', mood: 'miękko, nocnie', jazz: true, ninths: true, steps: [[4, 0, 'maj'], [3, 0, 'min'], [2, 0, 'min'], [1, 0, 'maj']],
    why: 'Akordy schodzą stopień po stopniu: 4, 3, 2, 1. Z dodaną noną brzmią „mgliście”. Palce przesuwają się w dół jak po schodach.' },
  { id: 'andaluzyjska', mode: 'minor', name: 'Kadencja andaluzyjska', mood: 'dramatycznie, flamenco', steps: [[1, 0, 'min'], [7, -1, 'maj'], [6, -1, 'maj'], [5, 0, 'maj']],
    why: 'Bas schodzi czterema stopniami w dół: 1, ♭7, ♭6, 5. Dur na 5 (z gamy harmonicznej) daje napięcie, które aż prosi o powrót do 1m. Słychać ją od Hiszpanii po Bałkany. Na ostatnim, durowym akordzie pasuje frygijska dominantowa od jego dźwięku: to ta sama skala co w gamie harmonicznej, tylko zaczęta od 5. stopnia.' },
  { id: 'mollPop', mode: 'minor', name: 'Molowy pop', mood: 'epicko, smutno', steps: [[1, 0, 'min'], [6, -1, 'maj'], [3, -1, 'maj'], [7, -1, 'maj']],
    why: 'To pop-hymn czytany od molowego dźwięku: ten sam zestaw akordów, tylko domem jest 1m. Dlatego brzmi jak jego smutna, filmowa wersja.' },
  { id: 'mollPodstawa', mode: 'minor', name: 'Molowa podstawa 1–4–5', mood: 'klasycznie, poważnie', steps: [[1, 0, 'min'], [4, 0, 'min'], [5, 0, 'maj'], [1, 0, 'min']],
    why: 'Trzy filary tonacji molowej. 5 jest durowa, bo pożycza podwyższony 7. stopień z gamy harmonicznej. Ten jeden podwyższony dźwięk ciągnie z całej siły do domu.' },
  { id: 'jazzMoll', mode: 'minor', name: 'Jazz molowy iiø–V–i', mood: 'jazz, nocnie', jazz: true, steps: [[2, 0, 'dim'], [5, 0, 'maj'], [1, 0, 'min'], [1, 0, 'min']],
    why: 'Molowa wersja ii–V–I. Półzmniejszony na 2 i dominanta na 5 prowadzą do molowego domu. Tak brzmi połowa ballad jazzowych.' },
  { id: 'dorycki', mode: 'minor', name: 'Dorycki funk 1m–4', mood: 'funk', jazz: true, steps: [[1, 0, 'min'], [4, 0, 'maj']],
    why: 'Durowy akord na 4 w tonacji molowej to znak skali doryckiej (z podwyższonym 6. stopniem). Ten jeden jasny dźwięk robi z molowego vampu funk.' },
  { id: 'kwintowyMoll', mode: 'minor', name: 'Molowe koło kwintowe', mood: 'jazz, nostalgicznie', jazz: true, steps: [[4, 0, 'min'], [7, -1, 'maj'], [3, -1, 'maj'], [6, -1, 'maj'], [2, 0, 'dim'], [5, 0, 'maj'], [1, 0, 'min'], [1, 0, 'min']],
    why: 'Każdy akord jest o kwintę niżej od poprzedniego: cała tonacja obchodzona po kole. Najpierw przez równoległy dur, potem powrót do molowego domu. Klasyczna pętla jazzowa.' },
  // --- 1.8: twelve more presets ---------------------------------------------------------------------------
  { id: 'miksolidyjski', mode: 'major', name: 'Rockowe 1–♭7–4–1', mood: 'rockowo, miksolidyjsko', steps: [[1, 0, 'maj'], [7, -1, 'maj'], [4, 0, 'maj'], [1, 0, 'maj']],
    why: '♭7 pożyczone ze skali miksolidyjskiej to brzmienie rocka: „Sweet Child o’ Mine”, „Hey Jude” w kodzie. Akord o cały ton niżej od domu brzmi zadziornie, a nie smutno.' },
  { id: 'rnr1454', mode: 'major', name: 'Rock and roll 1–4–5–4', mood: 'tanecznie, lata 60.', steps: [[1, 0, 'maj'], [4, 0, 'maj'], [5, 0, 'maj'], [4, 0, 'maj']],
    why: '„La Bamba”, „Twist and Shout”, „Wild Thing”. Trzy akordy w kółko, a 5 nie wraca od razu do domu, tylko odbija się od 4. Dlatego pętla się nie kończy.' },
  { id: 'ragtime', mode: 'major', name: 'Ragtime (dominanty po kole)', mood: 'staroświecko, swingowo', seventh: 'all', steps: [[3, 0, 'dom7'], [6, 0, 'dom7'], [2, 0, 'dom7'], [5, 0, 'dom7']],
    why: 'Każdy akord to dominanta następnego: 3⁷ → 6⁷ → 2⁷ → 5⁷ → 1. Cztery dominanty wtórne po kole kwintowym, czyli ragtime, „Sweet Georgia Brown” i bridge w Rhythm Changes.' },
  { id: 'plagalMoll', mode: 'major', name: 'Molowa subdominanta 1–4–4m–1', mood: 'nostalgicznie, filmowo', steps: [[1, 0, 'maj'], [4, 0, 'maj'], [4, 0, 'min'], [1, 0, 'maj']],
    why: 'Na 4 jeden dźwięk schodzi o półton (tercja akordu), i robi się nagle tęskno. 4m pożyczona z molowej tonacji to „Creep”, „In My Life”, mnóstwo muzyki filmowej.' },
  { id: 'filmowa', mode: 'major', name: 'Filmowa 1–♭6–♭7–1', mood: 'epicko, zwycięsko', steps: [[1, 0, 'maj'], [6, -1, 'maj'], [7, -1, 'maj'], [1, 0, 'maj']],
    why: 'Dwa pożyczone akordy durowe wchodzą schodami do domu. Brzmi jak bohater na końcu filmu albo koniec poziomu w Mario. Pożyczone z molowej, ale wszystkie są durowe, więc jest jasno.' },
  { id: 'royalRoad', mode: 'major', name: 'Royal road 4–5–3m–6m', mood: 'tęsknie, J-pop / anime', steps: [[4, 0, 'maj'], [5, 0, 'maj'], [3, 0, 'min'], [6, 0, 'min']],
    why: 'Ulubiona progresja japońskiego popu: wspina się 4 → 5 i zamiast do domu skręca w 3m i 6m. Napięcie bez rozwiązania, dlatego brzmi jak tęsknota.' },
  { id: 'folk1415', mode: 'major', name: 'Ognisko 1–4–1–5', mood: 'folk, country, prosto', steps: [[1, 0, 'maj'], [4, 0, 'maj'], [1, 0, 'maj'], [5, 0, 'maj']],
    why: 'Trzy akordy i powrót do domu po każdym wyjściu. Tak zbudowane są piosenki ludowe, kolędy i country. Najlepsza progresja, żeby skupić się na śpiewaniu.' },
  { id: 'creep', mode: 'major', name: 'Alternatywna 1–3–4–4m', mood: 'gorzko, alternatywnie', steps: [[1, 0, 'maj'], [3, 0, 'maj'], [4, 0, 'maj'], [4, 0, 'min']],
    why: 'Durowe 3 (zamiast molowego 3m) to dominanta wtórna do 6m, ale tu nie idzie do 6m, tylko do 4. Potem 4 gaśnie do 4m. Dwa „błędy” w czterech akordach: Radiohead „Creep”.' },
  { id: 'jazzBlues', mode: 'major', name: 'Blues jazzowy 12 taktów', mood: 'jazz, bebop', jazz: true, steps: [[1, 0, 'dom7'], [4, 0, 'dom7'], [1, 0, 'dom7'], [1, 0, 'dom7'], [4, 0, 'dom7'], [4, 0, 'dom7'], [1, 0, 'dom7'], [6, 0, 'dom7'], [2, 0, 'm7'], [5, 0, 'dom7'], [1, 0, 'dom7'], [5, 0, 'dom7']],
    why: 'Blues 12 taktów z jazzowymi podmianami: szybka czwórka w 2. takcie, 6⁷ jako dominanta wtórna do 2 i 2–5 zamiast samej piątki. Tak grali Charlie Parker i Sonny Rollins.' },
  { id: 'watchtower', mode: 'minor', name: 'Molowy rock 1m–♭7–♭6–♭7', mood: 'rock, epicko', steps: [[1, 0, 'min'], [7, -1, 'maj'], [6, -1, 'maj'], [7, -1, 'maj']],
    why: 'Bas schodzi 1 → ♭7 → ♭6 i wraca przez ♭7, bez dominanty. To skala eolska, czysty naturalny moll: „All Along the Watchtower”, „Stairway to Heaven” w finale.' },
  { id: 'eleanor', mode: 'minor', name: 'Wahadło 1m–♭6', mood: 'mrocznie, hipnotycznie', steps: [[1, 0, 'min'], [6, -1, 'maj']],
    why: 'Tylko dwa akordy z jednym wspólnym dźwiękiem, a reszta przesuwa się o półton. Hipnotycznie i mrocznie: „Eleanor Rigby”, filmowe napięcie, dużo muzyki elektronicznej.' },
  { id: 'tangoMoll', mode: 'minor', name: 'Tango 1m–4m–♭6–5⁷', mood: 'tango, dramatycznie', steps: [[1, 0, 'min'], [4, 0, 'min'], [6, -1, 'maj'], [5, 0, 'dom7']],
    why: 'Molowa dramaturgia z Buenos Aires: 4m i ♭6 schodzą, a 5⁷ z gamy harmonicznej szarpie z powrotem do 1m. Pasuje do tanga, flamenco i muzyki cygańskiej.' },
];

/** Chords of a progression in a key, with optional sevenths/ninths. */
export function progressionChords(key, prog, { color = 'auto' } = {}) {
  const sev = color === 'triads' ? false : color === 'sevenths' || color === 'ninths' || (color === 'auto' && (prog.jazz || prog.seventh === 'all'));
  const nin = color === 'ninths' || (color === 'auto' && prog.ninths);
  return prog.steps.map(([d, a, q]) => {
    let qq = q;
    if (q.length <= 3 && sev) qq = seventhOf(q, d === 5 && a === 0 && q === 'maj');
    if (nin) qq = ninthOf(qq);
    return degreeChord(key, d, a, qq);
  });
}

// --- voicings ---------------------------------------------------------------------------------------------------
/** Close voicing near `center`, closest to `prev` if given (voice leading). */
export function voicing(c, { prev = null, center = 64, lo = 52, hi = 79 } = {}) {
  const pcs = c.tones.map((t) => t.pc);
  let best = null;
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    for (let base = lo; base <= hi; base++) {
      if (base % 12 !== order[0]) continue;
      const v = [base];
      for (const pc of order.slice(1)) { let m = v[v.length - 1] + 1; while (m % 12 !== pc) m++; v.push(m); }
      if (v[v.length - 1] > hi + 4) continue;
      const cost = prev && prev.length ? v.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(p - n))), 0) : Math.abs(v.reduce((s, x) => s + x, 0) / v.length - center);
      if (!best || cost < best.cost) best = { v, cost, rot };
    }
  }
  return best ? best.v : [];
}

export function inversionName(rot) {
  return ['postać zasadnicza', '1. przewrót', '2. przewrót', '3. przewrót'][rot] || '';
}

/** Root position + inversions of a chord near middle C. */
export function inversions(c, base = 60) {
  const out = [];
  const pcs = c.tones.map((t) => t.pc);
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    let m = base - 1; const v = [];
    for (const pc of order) { m++; while (m % 12 !== pc) m++; v.push(m); }
    out.push({ rot, notes: v, name: inversionName(rot) });
  }
  return out;
}

export function bassNote(c, lo = 36) {
  const pc = c.bassPc != null ? c.bassPc : c.root.pc;   // slash chords: the written bass
  let m = lo; while (m % 12 !== pc) m++; return m;
}

// --- accompaniment patterns (one bar, beats from 0) -------------------------------------------------------------
// what: 'R' bass root, '5' bass fifth, 'C' full chord (right hand), 'A0'.. 'A3' arpeggio tones of the voicing
export const PATTERNS = [
  { id: 'blok', name: 'Akord na cały takt', beats: 4, level: 1, ev: [[0, 'R', 4], [0, 'C', 4]],
    why: 'Najprostszy akompaniament. Lewa gra bas, prawa akord, oba na „raz”, i trzymasz. Cała uwaga idzie w czystą zmianę na następny akord.' },
  { id: 'puls', name: 'Ćwierćnuty', beats: 4, level: 1, ev: [[0, 'R', 4], [0, 'C', 1], [1, 'C', 1], [2, 'C', 1], [3, 'C', 1]],
    why: 'Prawa ręka gra akord na każde uderzenie. Uczy równego pulsu: ręka jest jak perkusja.' },
  { id: 'ballada', name: 'Ballada (bas 1 i 5)', beats: 4, level: 2, ev: [[0, 'R', 2], [2, '5', 2], [0, 'C', 2], [2, 'C', 2]],
    why: 'Bas na zmianę: pryma i kwinta, a prawa ręka akord dwa razy na takt. Daje ruch, ale nie zagłusza śpiewu.' },
  { id: 'rozlozony', name: 'Akord rozłożony', beats: 4, level: 2, ev: [[0, 'R', 4], [0, 'A0', 1], [1, 'A1', 1], [2, 'A2', 1], [3, 'A1', 1]],
    why: 'Prawa ręka gra dźwięki akordu po kolei. Brzmi delikatnie i „płynąco”. Palce zostają w jednym miejscu, zmienia się tylko kolejność.' },
  { id: 'walc', name: 'Walc', beats: 3, level: 2, ev: [[0, 'R', 1], [1, 'C', 1], [2, 'C', 1]],
    why: 'Na trzy: bas na „raz”, akord na „dwa” i „trzy”. Charakterystyczne „um-pa-pa”.' },
  { id: 'popOsemki', name: 'Pop: ósemki', beats: 4, level: 3, ev: [[0, 'R', 1.5], [1.5, 'R', 0.5], [2, '5', 2], [0, 'C', 0.5], [0.5, 'C', 0.5], [1, 'C', 0.5], [1.5, 'C', 0.5], [2, 'C', 0.5], [2.5, 'C', 0.5], [3, 'C', 0.5], [3.5, 'C', 0.5]],
    why: 'Prawa ręka gra ósemki, lewa ma mały „podskok” przed trójką. Napęd jak w zespole, trudniej utrzymać równo.' },
];

// --- chord recognition ("Co ja gram?") ----------------------------------------------------------------------------
const TEMPLATES = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['°', [0, 3, 6]], ['+', [0, 4, 8]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['5', [0, 7]],
  ['maj7', [0, 4, 7, 11]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]], ['m7♭5', [0, 3, 6, 10]], ['°7', [0, 3, 6, 9]],
  ['m(maj7)', [0, 3, 7, 11]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['add9', [0, 2, 4, 7]], ['m(add9)', [0, 2, 3, 7]],
  ['maj9', [0, 2, 4, 7, 11]], ['9', [0, 2, 4, 7, 10]], ['m9', [0, 2, 3, 7, 10]], ['7sus4', [0, 5, 7, 10]],
  ['maj7', [0, 4, 11]], ['7', [0, 4, 10]], ['m7', [0, 3, 10]], ['6/9', [0, 2, 4, 7, 9]], ['13', [0, 4, 9, 10]],
];
const INTERVAL_NAMES = ['pryma', 'sekunda mała', 'sekunda wielka', 'tercja mała', 'tercja wielka', 'kwarta', 'tryton', 'kwinta', 'seksta mała', 'seksta wielka', 'septyma mała', 'septyma wielka'];

/** Name a pitch class in the context of a key: diatonic spelling if it fits, else nearest. */
export function nameInKey(key, pc) {
  const dur = key.mode === 'minor' ? SCALES.harm : SCALES.dur;
  const order = key.mode === 'minor' ? [SCALES.harm, SCALES.moll] : [dur];
  for (const sc of order) {
    for (const [d, a] of sc.deg) {
      const sp = degreeOf(key, d, a);
      if (sp.pc === mod12(pc)) return { ...sp, deg: degLabel(d, a), diatonic: true };
    }
  }
  // chromatic: ♭ of the degree above (sounds natural in most keys)
  for (const [d, a] of [[2, -1], [3, -1], [4, 1], [6, -1], [7, -1], [5, -1], [1, 1], [2, 1], [5, 1], [6, 1]]) {
    const sp = degreeOf(key, d, a);
    if (sp.pc === mod12(pc)) return { ...sp, deg: degLabel(d, a), diatonic: false };
  }
  return { ...spellPc(0, pc), deg: '?', diatonic: false };
}

/** What chord is held? notes: MIDI numbers. Returns null or {name, number, detail}. */
export function recognize(notes, key) {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const bass = sorted[0] % 12;
  const pcs = [...new Set(sorted.map((n) => n % 12))];
  if (pcs.length === 1) {
    const n = nameInKey(key, pcs[0]);
    return { kind: 'note', name: n.name, number: n.deg, detail: `${n.deg}. stopień w ${keyName(key, true)}` };
  }
  if (pcs.length === 2 && sorted.length === 2) {
    const iv = mod12(sorted[1] - sorted[0]);
    const a = nameInKey(key, sorted[0] % 12), b = nameInKey(key, sorted[1] % 12);
    return { kind: 'interval', name: `${a.name}–${b.name}`, number: `${a.deg}–${b.deg}`, detail: INTERVAL_NAMES[iv] };
  }
  let best = null;
  for (const root of pcs) {
    const set = pcs.map((pc) => mod12(pc - root)).sort((a, b) => a - b).join(',');
    TEMPLATES.forEach(([sym, iv], idx) => {
      if ([...iv].sort((a, b) => a - b).join(',') !== set) return;
      const score = (root === bass ? 10 : 0) - idx * 0.1 - (iv.length < 3 ? 2 : 0);
      if (!best || score > best.score) best = { root, sym, score };
    });
  }
  if (!best) {
    const names = pcs.map((pc) => nameInKey(key, pc).name).join(' ');
    return { kind: 'cluster', name: names, number: '', detail: 'zbitka dźwięków, nie typowy akord' };
  }
  const r = nameInKey(key, best.root);
  const NUM = { '7': '⁷', 'm7♭5': 'ø', '9': '⁹' };
  const number = r.deg + (NUM[best.sym] ?? best.sym);
  let name = r.name + best.sym;
  if (best.root !== bass) name += `/${nameInKey(key, bass).name}`;
  const kind = best.sym === '' ? 'durowy' : best.sym === 'm' ? 'molowy' : best.sym === '°' ? 'zmniejszony' : best.sym === '7' ? 'dominantowy' : best.sym === 'maj7' ? 'wielki septymowy' : best.sym === 'm7' ? 'molowy septymowy' : best.sym;
  const where = r.diatonic ? `${number} w ${keyName(key, true)}` : `spoza ${keyName(key, true)}`;
  return { kind: 'chord', name, number, detail: `${kind}, ${where}${best.root !== bass ? ', w przewrocie' : ''}` };
}

// --- "why" texts for the cards -----------------------------------------------------------------------------------
export function whyScale(key, scaleId) {
  const k = keyName(key, true);
  const notes = scaleNotes(key, scaleId).slice(0, -1).map((n) => n.name).join(' ');
  const t = {
    dur: `Gama durowa to przepis: cały ton, cały, pół, cały, cały, cały, pół. Od ${spellName(key.li, key.acc)} ten przepis daje: ${notes}. Wszystko, co jasne i „domowe” w muzyce, stoi na tych siedmiu dźwiękach.`,
    moll: `Molowa naturalna to przepis: cały, pół, cały, cały, pół, cały, cały. Ma te same dźwięki co jej durowa siostra (${degreeOf(key, 3, -1).name}-dur), tylko domem jest inny dźwięk. Stąd smutniejszy kolor.`,
    harm: 'Harmoniczna to molowa z podwyższonym 7. stopniem. Ten jeden dźwięk leży półton pod tonikę i ciągnie do niej z całej siły. Daje też charakterystyczny „orientalny” skok o półtora tonu między 6 a 7.',
    pentaDur: 'Pięć dźwięków durowej, bez 4 i 7, czyli bez półtonów. Nic nie zgrzyta, dlatego to najbezpieczniejsza skala do pierwszych improwizacji. Brzmi folkowo i pogodnie.',
    pentaMoll: 'Pięć dźwięków molowej, bez 2 i 6. Rock, blues i soul improwizują głównie na niej. Każdy dźwięk pasuje do molowego akordu na 1.',
    blues: 'Molowa pentatonika plus jeden „brudny” dźwięk: ♭5, półton między 4 a 5. Przechodzi się przez niego, nie zatrzymuje. To on daje bluesowy jęk.',
    dorycka: 'Molowa z podwyższonym 6. stopniem. Ten jeden jaśniejszy dźwięk robi różnicę: smutno, ale z nadzieją. Brzmienie funku, soulu i modalnego jazzu.',
    miksolidyjska: 'Durowa z obniżonym 7. stopniem. Brzmi jak dur, ale luźniej, rockowo i bluesowo: brak „ciągu” do domu, który daje 7. stopień.',
    hidzaz: 'Frygijska dominantowa: obniżona 2, durowa 3 i obniżona 6. Półton nad tonicą i skok o półtora tonu zaraz za nim to brzmienie flamenco, a na Bałkanach i Bliskim Wschodzie nazywa się hidżaz. Gra się ją nad durowym akordem na 1, nie nad molowym. To 5. tryb molowej harmonicznej.',
    wegierska: 'Molowa harmoniczna z podwyższonym 4. stopniem: dwa „orientalne” skoki w jednej skali. Brzmienie muzyki węgierskiej i cygańskiej.',
    podwojna: 'Dwa skoki o półtora tonu, symetrycznie wokół toniki i dominanty. Najbardziej „egzotyczna” z popularnych skal.',
    frygijska: 'Molowa z obniżonym 2. stopniem. Półton tuż nad toniką brzmi ciemno i hiszpańsko: flamenco, metal, muzyka filmowa.',
    lidyjska: 'Durowa z podwyższonym 4. stopniem. Jeszcze jaśniejsza niż dur, jakby unosiła się nad ziemią. Ulubiona skala muzyki filmowej i jazzu na akordach maj7.',
    lokrycka: 'Obniżone 2 i 5: na 1 stoi akord zmniejszony, więc to rzadko „dom”. W jazzie gra się ją na akordzie ø (m7♭5), np. 2ø w molowym ii–V–i.',
    bluesDur: 'Durowa pentatonika plus ♭3 jako dźwięk przejściowy (♭3 → 3). Wesoły, „kościelny” blues: soul, gospel, country, rock and roll.',
    melodyczna: 'Molowa z durową 6 i 7 (w jazzie tak samo w górę i w dół). Molowy akord z „ciągiem” do domu. Z niej pochodzą jazzowe skale: lidyjska dominantowa i alterowana.',
    lidyjskaDom: 'Durowa z ♯4 i ♭7. Na akordzie 7, który nie musi się rozwiązywać (np. ♭7 w bluesie albo podstawienie trytonowe), brzmi jasno i jazzowo.',
    alterowana: 'Wszystkie napięcia naraz: ♭9, ♯9, ♯11, ♭13 (tu zapisane jako ♭2, ♯2, ♯4, ♭6). Gra się ją na akordzie 5⁷ tuż przed rozwiązaniem do 1. Im mocniej boli, tym słodsze rozwiązanie.',
    bebop: 'Miksolidyjska plus 7 jako dźwięk przejściowy. Osiem dźwięków: gdy grasz ósemkami od toniki, dźwięki akordu same wypadają na mocne części taktu. Tak „mówią” saksofoniści bebopu.',
    calotonowa: 'Same całe tony, sześć dźwięków, bez półtonów i bez domu. Brzmi jak sen albo zawieszenie w czasie: Debussy, jazz na akordzie 7♯5.',
    zmnPC: 'Na zmianę półton i cały ton. Symetryczna: powtarza się co tercję małą, więc są tylko trzy różne. Gra się ją na akordzie 7 (daje ♭9, ♯9, ♯11 i 13 naraz).',
    zmnCP: 'Na zmianę cały ton i półton. Pasuje do akordu zmniejszonego (°7). Też symetryczna, też tylko trzy różne.',
    durHarm: 'Durowa z obniżonym 6. Jasno, ale z cieniem: daje molowe 4m w durowej tonacji, ten „wzruszający” akord z ballad.',
    ukrainska: 'Dorycka z podwyższonym 4. stopniem. Brzmienie klezmeru, muzyki żydowskiej, rumuńskiej i bałkańskiej.',
    neapolitanska: 'Molowa harmoniczna z obniżonym 2. stopniem. Dramatyczna, operowa, ciemniejsza od harmonicznej.',
    persjanska: 'Bardzo dużo półtonów i dwa skoki o półtora tonu. Gęste, bliskowschodnie brzmienie.',
    hirajoshi: 'Japońska pentatonika z półtonami zamiast bezpiecznych całych tonów. Brzmi jak koto: smutno i przestrzennie.',
    inSen: 'Japońska pentatonika: półton tuż nad toniką i brak tercji. Medytacyjna, surowa.',
  };
  // a mode is a major scale played from another degree: say which one
  const parent = { dorycka: [7, -1], frygijska: [6, -1], lidyjska: [5, 0], miksolidyjska: [4, 0], lokrycka: [2, -1] }[scaleId];
  const rel = parent ? ` Te same dźwięki co ${degreeOf(key, parent[0], parent[1]).name}-dur, tylko domem jest ${spellName(key.li, key.acc)}.` : '';
  // the 5th mode of the harmonic minor: the harmonic minor sits a fourth above the tonic
  const relHarm = scaleId === 'hidzaz' ? ` Te same dźwięki co ${degreeOf(key, 4, 0).name}-moll harmoniczna, tylko domem jest ${spellName(key.li, key.acc)}.` : '';
  return `${t[scaleId] || ''}${rel}${relHarm} (${k})`;
}

export function whyFamily(key) {
  if (key.mode === 'minor') {
    return `Akord to co drugi dźwięk gamy: 1–3–5. Zbuduj go na każdym stopniu ${keyName(key, true)}, a dostaniesz rodzinę: molowe 1m i 4m, durowe ♭3, ♭6, ♭7, zmniejszony 2°. Do tego 5 durowe, pożyczone z gamy harmonicznej, bo to ono ciągnie do domu. Na kole rodzina to wybrana tonacja, jej dwaj sąsiedzi i trzy durowe obok.`;
  }
  return `Akord to co drugi dźwięk gamy: 1–3–5. Zbuduj go na każdym stopniu ${keyName(key, true)}, a dostaniesz rodzinę: trzy durowe (1, 4, 5), trzy molowe (2m, 3m, 6m) i jeden zmniejszony (7°). Na kole to widać: 1 w środku, 4 po lewej, 5 po prawej, a molowi krewni wewnątrz koła pod nimi.`;
}

export function whyInversions() {
  return 'Przewrót to ten sam akord, tylko inny dźwięk na dole. Po co? Żeby ręka nie skakała. Między sąsiednimi akordami prawie zawsze da się przejść przewrotem, ruszając palcami o 1–2 klawisze. Brzmi to też płynniej, jak śpiew chóru.';
}

/** Key signature: {count, sign, notes} e.g. G-dur → 1 ♯ [F♯]. */
export function keySignature(key) {
  const i = wheelIndex(key);
  const sharps = i <= 6;
  const count = sharps ? i : 12 - i;
  const order = sharps ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3];
  return { count, sign: count ? (sharps ? '♯' : '♭') : '', notes: order.slice(0, count).map((li) => spellName(li, sharps ? 1 : -1)) };
}

/** Steps of a 7-note scale as words: C = cały ton, P = półton, 1½ = półtora. */
export function stepPattern(scaleId) {
  const deg = SCALES[scaleId].deg;
  const semis = deg.map(([d, a]) => MAJ[d - 1] + a).concat(12);
  return semis.slice(1).map((s, i) => ({ 1: 'P', 2: 'C', 3: '1½' }[s - semis[i]] || '?'));
}
