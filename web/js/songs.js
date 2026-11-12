// Songs: chords pasted as text (Ultimate Guitar style, with or without lyrics) → sections, key, numbers,
// transposition, what is inside (borrowed chords, known progressions), and the voice fit.
// Pure functions (tested in node). No lyrics are shipped with the app: the starter songs are chords only.
import {
  chord, degLabel, degreeOf, family, keyByTonic, keyName, LETTERS, PROGRESSIONS, QUALITY, ALL_KEYS, spellPc,
} from './theory.js';
import { degAlt } from './chords.js';   // (also registers the full chord catalogue in QUALITY)

const NAT = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (x) => ((x % 12) + 12) % 12;

// --- one chord symbol ----------------------------------------------------------------------------------
// suffix → quality (longest first wins)
const SUFFIX = [
  ['m7b5', 'm7b5'], ['m7(b5)', 'm7b5'], ['ø7', 'm7b5'], ['ø', 'm7b5'], ['-7b5', 'm7b5'],
  ['mmaj7', 'mmaj7'], ['m(maj7)', 'mmaj7'], ['mM7', 'mmaj7'], ['minmaj7', 'mmaj7'],
  ['maj9', 'maj9'], ['M9', 'maj9'], ['maj7', 'maj7'], ['Maj7', 'maj7'], ['ma7', 'maj7'], ['M7', 'maj7'], ['Δ7', 'maj7'], ['Δ', 'maj7'], ['maj', 'maj'],
  ['m(add9)', 'madd9'], ['madd9', 'madd9'], ['m9', 'm9'], ['min9', 'm9'], ['-9', 'm9'],
  ['m7', 'm7'], ['min7', 'm7'], ['-7', 'm7'], ['m6', 'm6'], ['min6', 'm6'], ['-6', 'm6'],
  ['m11', 'm11'], ['m13', 'm13'], ['m7(11)', 'm7add11'], ['m(maj9)', 'mmaj9'], ['mmaj9', 'mmaj9'], ['m9b5', 'm9b5'], ['m7#5', 'm7s5'],
  ['m6/9', 'm69'], ['m69', 'm69'], ['m(add4)', 'madd4'], ['madd4', 'madd4'], ['m(add11)', 'madd4'], ['madd11', 'madd4'],
  ['min', 'min'], ['m', 'min'], ['-', 'min'],
  ['dim7', 'dim7'], ['°7', 'dim7'], ['o7', 'dim7'], ['dim', 'dim'], ['°', 'dim'], ['o', 'dim'],
  ['aug', 'aug'], ['+5', 'aug'], ['+', 'aug'], ['#5', 'aug'],
  ['7sus4', 'dom7sus4'], ['7sus2', 'dom7sus2'], ['7sus', 'dom7sus4'], ['9sus4', 'dom9sus4'], ['9sus', 'dom9sus4'], ['13sus4', 'dom13sus4'], ['13sus', 'dom13sus4'],
  ['maj7sus4', 'maj7sus4'], ['maj7sus2', 'maj7sus2'], ['maj7#11', 'maj7s11'], ['maj9#11', 'maj9s11'], ['maj7#5', 'maj7s5'], ['maj7b5', 'maj7b5'], ['maj13', 'maj13'],
  ['dim(maj7)', 'dimmaj7'], ['°(maj7)', 'dimmaj7'], ['(b5)', 'b5'], ['add4', 'add4'], ['add11', 'add4'],
  ['7b9b13', 'dom7b9b13'], ['7#9b13', 'alt'], ['7alt', 'alt'], ['alt', 'alt'], ['7#5#9', 'dom7s5s9'], ['7#5b9', 'dom7s5b9'], ['7b5b9', 'dom7b5b9'], ['7b9#11', 'dom7b9s11'],
  ['13b9', 'dom13b9'], ['13#11', 'dom13s11'], ['9#11', 'dom9s11'], ['7b9', 'dom7b9'], ['7#9', 'dom7s9'], ['7#11', 'dom7s11'], ['7b13', 'dom7b13'], ['7(13)', 'dom7add13'],
  ['7#5', 'aug7'], ['aug7', 'aug7'], ['+7', 'aug7'], ['7b5', 'dom7b5'],
  ['sus4', 'sus4'], ['sus2', 'sus2'], ['sus', 'sus4'],
  ['add9', 'add9'], ['add2', 'add9'], ['2', 'add9'],
  ['69', 'six9'], ['6/9', 'six9'], ['6', 'maj6'],
  ['13', 'dom13'], ['11', 'dom11'], ['9', 'dom9'], ['7', 'dom7'],
  ['5', 'power'],
].sort((a, b) => b[0].length - a[0].length);
// what may follow the main suffix (tensions we keep in the name but do not voice): 7b9, 7#9, 7alt…
const TAIL = /^(\(?(b|#|♭|♯)(5|9|11|13)\)?|alt|\((add)?\d+\))*$/;

function parseNote(s) {
  const m = /^([A-H])(##|bb|#|b|♯|♭|𝄪|𝄫)?/.exec(s);
  if (!m) return null;
  let letter = m[1];
  let acc = { '#': 1, '♯': 1, b: -1, '♭': -1, '##': 2, '𝄪': 2, bb: -2, '𝄫': -2 }[m[2] || ''] || 0;
  if (letter === 'H') letter = 'B';   // H = B natural (German/Polish charts)
  const li = LETTERS.indexOf(letter);
  return { li, acc, pc: mod12(NAT[li] + acc), len: m[0].length };
}

/** "F#m7/C#" → { li, acc, pc, quality, bass: {li,acc,pc} | null, text } or null when it is not a chord. */
export function parseChord(text) {
  let t = String(text).trim();
  if (/^\(.*\)$/.test(t)) t = t.slice(1, -1);   // (Am) = an optional chord
  if (!t || t.length > 18) return null;
  const root = parseNote(t);
  if (!root) return null;
  let rest = t.slice(root.len);
  let bass = null;
  const slash = rest.lastIndexOf('/');
  if (slash >= 0 && !/^\d/.test(rest.slice(slash + 1))) {     // "6/9" is not a bass
    bass = parseNote(rest.slice(slash + 1));
    if (!bass || bass.len !== rest.length - slash - 1) return null;
    rest = rest.slice(0, slash);
  }
  let quality = 'maj';
  if (rest) {
    rest = rest.replace(/♭/g, 'b').replace(/♯/g, '#');
    const hit = SUFFIX.find(([sfx]) => rest.startsWith(sfx));
    if (hit) { quality = hit[1]; rest = rest.slice(hit[0].length); }
    if (rest && !TAIL.test(rest)) return null;
  }
  return { li: root.li, acc: root.acc, pc: root.pc, quality, bass: bass ? { li: bass.li, acc: bass.acc, pc: bass.pc } : null, text: t };
}

// --- a whole chart -------------------------------------------------------------------------------------
const SECTION_WORDS = /^(intro|verse|zwrotka|refren|chorus|ref|pre-?chorus|przedrefren|bridge|most(ek)?|outro|coda|solo|interlude|instrumental|break|tag|zakończenie|wstęp|strofa)\b/i;
const NOISE = /^(\||\|\||-+|x\d+|\(x\d+\)|\d+x|N\.?C\.?|%|\/|:\||\|:|\.\.\.|…)$/i;

function sectionName(line) {
  const s = line.trim();
  let m = /^\[([^\]]{1,40})\]\s*(.*)$/.exec(s);
  if (m) return { name: m[1].trim(), rest: m[2] };
  m = /^([^:]{1,30}):\s*(.*)$/.exec(s);
  if (m && SECTION_WORDS.test(m[1].trim())) return { name: m[1].trim(), rest: m[2] };
  if (SECTION_WORDS.test(s) && s.split(/\s+/).length <= 3 && !parseChord(s.split(/\s+/)[0])) return { name: s.replace(/:$/, ''), rest: '' };
  return null;
}

/** Chord tokens of a line with their columns, or null when the line is lyrics. */
function chordLine(line) {
  const toks = [];
  const re = /\S+/g;
  let m, words = 0, chords = 0;
  while ((m = re.exec(line))) {
    const raw = m[0];
    if (NOISE.test(raw)) { if (raw.includes('|')) toks.push({ col: m.index, bar: true }); continue; }
    words++;
    // "|C" or "C|" glued to a bar line
    const clean = raw.replace(/^\|+|\|+$/g, '');
    const c = parseChord(clean);
    if (c) { chords++; toks.push({ col: m.index + raw.indexOf(clean), text: clean, chord: c, barBefore: raw.startsWith('|') }); }
  }
  if (!chords) return null;
  // a line is chords when (almost) every word is a chord; "A" or "Am" alone in lyrics is rare
  return chords / words >= 0.75 ? toks : null;
}

/**
 * Parse pasted text. Returns { sections: [{ name, lines: [{ chords: [{col,text,chord}], lyric }], chords: [chord] }], chords: [all] }.
 * Bars ("|") split durations: chords between two bar lines share one bar.
 */
export function parseChart(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const sections = [];
  let cur = null;
  const open = (name) => { cur = { name, lines: [], chords: [], beats: [] }; sections.push(cur); };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\t/g, '    ');
    if (!raw.trim()) continue;
    const sec = sectionName(raw);
    let body = raw;
    if (sec) { open(sec.name); if (!sec.rest.trim()) continue; body = sec.rest; }
    const toks = chordLine(body);
    if (!cur) open(toks ? 'Całość' : 'Tekst');
    if (toks) {
      const next = lines[i + 1] != null ? lines[i + 1].replace(/\t/g, '    ') : '';
      const lyricNext = next.trim() && !sectionName(next) && !chordLine(next) ? next : null;
      const chords = toks.filter((t) => t.chord);
      cur.lines.push({ chords, lyric: lyricNext });
      if (lyricNext != null) i++;
      // durations in bars: with bar lines, chords between two bars share it; without, one bar each
      const hasBars = toks.some((t) => t.bar || t.barBefore);
      if (hasBars) {
        let group = [];
        const flush = () => { for (const c of group) { cur.chords.push(c.chord); cur.beats.push(4 / group.length); } group = []; };
        for (const t of toks) { if (t.bar || t.barBefore) flush(); if (t.chord) group.push(t); }
        flush();
      } else {
        for (const c of chords) { cur.chords.push(c.chord); cur.beats.push(4); }
      }
    } else {
      cur.lines.push({ chords: [], lyric: body });
    }
  }
  const out = sections.filter((s) => s.chords.length || s.lines.length);
  return { sections: out, chords: out.flatMap((s) => s.chords) };
}

// --- key and numbers ------------------------------------------------------------------------------------
const BASE = { maj: 'maj', maj7: 'maj', dom7: 'maj', maj9: 'maj', dom9: 'maj', maj6: 'maj', add9: 'maj', sus4: 'maj', sus2: 'maj', dom7sus4: 'maj', aug: 'maj', power: 'maj',
  min: 'min', m7: 'min', m9: 'min', m6: 'min', madd9: 'min', mmaj7: 'min', dim: 'dim', m7b5: 'dim', dim7: 'dim' };
export const baseQuality = (q) => BASE[q] || (QUALITY[q] && QUALITY[q].base) || 'maj';

/** Degree of a chord root in a key: { deg 1..7, alt } (spelled by letters, like ♭7 or ♯4). */
export function degreeIn(key, c) {
  const deg = (((c.li - key.li) % 7) + 7) % 7 + 1;
  const ref = mod12(key.tonicPc + NAT[deg - 1] - NAT[0]);   // major-scale degree of this key
  let alt = mod12(c.pc - ref);
  if (alt > 6) alt -= 12;
  return { deg, alt };
}

/** Number like "6m", "♭7", "5⁷" for a chord in a key. */
export function numberOf(key, c) {
  const { deg, alt } = degreeIn(key, c);
  const num = QUALITY[c.quality] ? QUALITY[c.quality].num : '';
  let s = degLabel(deg, alt) + num;
  if (c.bass) { const b = degreeIn(key, c.bass); s += `/${degLabel(b.deg, b.alt)}`; }
  return s;
}

/** Does this chord belong to the key's family (triad on a scale degree with the family's quality)? */
export function inFamily(key, c) {
  const fam = family(key, false);
  const { deg, alt } = degreeIn(key, c);
  const f = fam[deg - 1];
  if (!f || f.root.pc !== c.pc) return false;
  const want = f.quality === 'maj' ? 'maj' : f.quality === 'min' ? 'min' : 'dim';
  return baseQuality(c.quality) === want && alt === degreeIn(key, f.root).alt;
}

/** Best keys for a list of chords: [{ key, score }], best first. */
export function scoreKey(key, chords) {
  let score = 0;
  chords.forEach((c, i) => {
      const fam = inFamily(key, c);
      if (fam) score += 2;
      const tonic = c.pc === key.tonicPc && baseQuality(c.quality) === (key.mode === 'major' ? 'maj' : 'min');
      if (tonic) score += 1.5 + (i === 0 ? 2 : 0) + (i === chords.length - 1 ? 2 : 0);
      // V(7) → I: the strongest sign of home
      const nx = chords[i + 1];
      if (nx && nx.pc === key.tonicPc && mod12(c.pc - key.tonicPc) === 7 && baseQuality(c.quality) === 'maj') score += 1.5;
  });
  return score;
}

export function guessKeys(chords) {
  if (!chords.length) return [];
  const res = ALL_KEYS.map((key) => ({ key, score: scoreKey(key, chords) }));
  // fewer accidentals wins a tie (C over B♯), then major
  const acc = (k) => Math.abs(k.acc) * 0.01 + (k.mode === 'minor' ? 0.005 : 0);
  res.sort((a, b) => b.score - a.score || acc(a.key) - acc(b.key));
  return res;
}

/**
 * The key of one section: the song's key, its relative (verse in a-moll, chorus in C-dur),
 * or another key when the section clearly modulates.
 */
export function sectionKey(songKey, chords) {
  if (!chords.length) return songKey;
  const rel = keyByTonic(songKey.tonicPc + (songKey.mode === 'major' ? 9 : 3), songKey.mode === 'major' ? 'minor' : 'major');
  const own = scoreKey(songKey, chords);
  const r = rel ? scoreKey(rel, chords) : -Infinity;
  const best = guessKeys(chords)[0];
  if (best && best.score > Math.max(own, r) + 4 && !sameFamily(best.key, songKey)) return best.key;
  return r > own + 1 ? rel : songKey;
}
function sameFamily(a, b) {
  const rel = (k) => mod12(k.tonicPc + (k.mode === 'minor' ? 3 : 0));
  return rel(a) === rel(b);
}

/** The same chord moved into another key by its degree (correct spelling there). */
export function moveChord(c, from, to) {
  const { deg, alt } = degreeIn(from, c);
  const r = degreeOf(to, deg, alt);
  const out = { ...c, li: r.li, acc: r.acc, pc: r.pc };
  if (c.bass) { const b = degreeIn(from, c.bass); const rb = degreeOf(to, b.deg, b.alt); out.bass = { li: rb.li, acc: rb.acc, pc: rb.pc }; }
  return out;
}

/** Full chord object (tones, roles, name) for voicing and marks. */
export function chordObj(c) {
  const q = QUALITY[c.quality] ? c.quality : 'maj';
  const ch = chord(c.li, c.pc, q);
  if (c.bass) {
    const bn = spellPc(c.bass.li, c.bass.pc).name;
    ch.bassPc = c.bass.pc;
    ch.name += `/${bn}`;
  }
  return ch;
}

/** Key a song lands in after moving it by `shift` semitones (spelled as on the wheel). */
export function shiftedKey(key, shift) {
  if (!shift) return key;
  return keyByTonic(key.tonicPc + shift, key.mode) || key;
}

// --- what is inside ----------------------------------------------------------------------------------------
/** Why a chord outside the family is there, in one short sentence. */
export function explainOutside(key, c, all) {
  const { deg, alt } = degreeIn(key, c);
  const bq = baseQuality(c.quality);
  const num = numberOf(key, { ...c, bass: null });
  if (key.mode === 'minor' && deg === 4 && alt === 0 && bq === 'maj') return `${num}: durowe 4 w molu, czyli brzmienie doryckie (6 stopień podniesiony). Jasny, soulowy kolor: funk, soul, Santana.`;
  // secondary dominant: a major chord a fifth above a chord that is in the song or the family
  if (bq === 'maj') {
    const target = mod12(c.pc + 5);
    const fam = family(key, false);
    const t = fam.find((f) => f.root.pc === target && f.quality !== 'dim');
    if (t && target !== key.tonicPc) return `${num}: dominanta „pożyczona” do ${t.number} (${t.name}). Ciągnie do niego, jak 5 do 1.`;
  }
  const parallel = keyByTonic(key.tonicPc, key.mode === 'major' ? 'minor' : 'major');
  if (parallel && inFamily(parallel, c)) {
    return key.mode === 'major'
      ? `${num}: pożyczony z ${keyName(parallel, true)} (ta sama tonika, molowa rodzina). Daje cień, ${deg === 4 && bq === 'min' ? 'wzruszające 4m' : deg === 7 && alt === -1 ? 'rockowe ♭7' : 'ciemniejszy kolor'}.`
      : `${num}: pożyczony z ${keyName(parallel, true)}. Nagłe światło w molu.`;
  }
  if (deg === 2 && alt === -1 && bq === 'maj') return `${num}: akord neapolitański albo podstawienie trytonowe za 5. Półton nad toniką, mocno ciągnie w dół.`;
  return `${num}: chromatyczny kolor spoza rodziny.`;
}

/** Progressions from the wheel found inside a list of chords (in order, also across the end of the loop). */
export function findProgressions(key, chords) {
  const seq = chords.map((c) => { const d = degreeIn(key, c); return `${d.deg}:${d.alt}:${baseQuality(c.quality)}`; });
  // collapse repeats (C C G G → C G)
  const s = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
  const found = [];
  for (const p of PROGRESSIONS.filter((x) => x.mode === key.mode)) {
    const want = p.steps.map(([d, a, q]) => `${d}:${a}:${baseQuality(q)}`);
    const w = want.filter((x, i) => i === 0 || x !== want[i - 1]);
    if (w.length < 3 || w.length > s.length + 1) continue;
    const ring = [...s, ...s];
    for (let i = 0; i < s.length; i++) {
      if (w.every((x, j) => ring[i + j] === x)) { found.push(p); break; }
    }
  }
  return found;
}

// --- the voice ----------------------------------------------------------------------------------------------
/**
 * Best key for a melody range [lo, hi] (MIDI, in the original key) inside a voice range.
 * You may also sing it an octave lower or higher (a man singing a woman's song): the total move
 * T = shift + 12·octave, the key moves by shift (−6…+5), the voice by T.
 * Returns { shift, octave, room: {low, high}, fits } — room = semitones to spare below and above.
 */
export function bestShift(melody, voice) {
  if (!melody || !voice) return null;
  let best = null;
  for (let T = -19; T <= 19; T++) {
    const shift = ((((T + 6) % 12) + 12) % 12) - 6;
    const octave = (T - shift) / 12;
    const low = melody.lo + T - voice.lo;
    const high = voice.hi - (melody.hi + T);
    const worst = Math.min(low, high);
    // fit first, then balance, then a small key change, then the original octave
    const score = worst * 10 - Math.abs(low - high) - Math.abs(shift) * 0.3 - Math.abs(octave) * 0.5;
    if (!best || score > best.score) best = { shift, octave, room: { low, high }, fits: worst >= 0, score };
  }
  return best;
}

// --- durations → steps ------------------------------------------------------------------------------------
/** Beats per chord for a section: as written (bars), or a fixed number of bars per chord. */
export function sectionBeats(sec, barsPerChord = 0) {
  return sec.chords.map((_, i) => (barsPerChord ? 4 * barsPerChord : sec.beats[i] || 4));
}

// --- starter songs: chords only, no lyrics (simplified; check against the recording) ---------------------
export const STARTERS = [
  { id: 'st-standbyme', title: 'Stand by Me (Ben E. King)', note: 'Zwrotka. Jedna progresja na całą piosenkę: 1 – 6m – 4 – 5.',
    text: '[Zwrotka]\n| A | A | F#m | F#m |\n| D | E | A | A |' },
  { id: 'st-letitbe', title: 'Let It Be (The Beatles)', note: 'Zwrotka to 1–5–6m–4, refren zaczyna się od 6m.',
    text: '[Zwrotka]\n| C | G | Am | F |\n| C | G | F C | C |\n[Refren]\n| Am | G | F | C |\n| C | G | F C | C |' },
  { id: 'st-knockin', title: 'Knockin’ on Heaven’s Door (Bob Dylan)', note: 'Dwa razy 1–5, raz z 2m, raz z 4.',
    text: '[Całość]\n| G | D | Am | Am |\n| G | D | C | C |' },
  { id: 'st-hittheroad', title: 'Hit the Road Jack (Ray Charles)', note: 'Kadencja andaluzyjska: 1m – ♭7 – ♭6 – 5, w kółko.',
    text: '[Całość]\n| Am G | F E |' },
  { id: 'st-sunshine', title: 'Ain’t No Sunshine (Bill Withers)', note: 'Molowy blues-soul: 1m – 5m – ♭7 – 1m.',
    text: '[Zwrotka]\n| Am | Em G | Am | Am |' },
  { id: 'st-survive', title: 'I Will Survive (Gloria Gaynor)', note: 'Molowe koło kwintowe, disco. Każdy akord ciągnie do następnego o kwartę wyżej.',
    text: '[Całość]\n| Am7 | Dm7 | G7 | Cmaj7 |\n| Fmaj7 | Bm7b5 | E7sus4 | E7 |' },
  { id: 'st-flyme', title: 'Fly Me to the Moon (standard)', note: 'Część A: koło kwintowe z septymami, jazz od pierwszego taktu.',
    text: '[Część A]\n| Am7 | Dm7 | G7 | Cmaj7 |\n| Fmaj7 | Bm7b5 | E7 | Am7 |' },
  { id: 'st-autumn', title: 'Autumn Leaves (standard)', note: 'Część A: ii–V–I w durze, potem ii–V–i w molu. Szkoła jazzu w ośmiu taktach.',
    text: '[Część A]\n| Cm7 | F7 | Bbmaj7 | Ebmaj7 |\n| Am7b5 | D7 | Gm | Gm |' },
  { id: 'st-blues', title: 'Blues 12 taktów (w F)', note: 'Forma, na której stoi blues, rock and roll i pół jazzu.',
    text: '[Chorus]\n| F7 | Bb7 | F7 | F7 |\n| Bb7 | Bb7 | F7 | F7 |\n| C7 | Bb7 | F7 | C7 |' },
  { id: 'st-balkan', title: 'Bałkański temat (ćwiczebny)', note: 'Typowy bałkański obieg w a-moll harmonicznej: 1m – 4m – 5 – 1m. Graj go w Jamie w 7/8.',
    text: '[Temat]\n| Am | Am | Dm | Am |\n| Dm | Am | E | Am |' },
];

// --- typed chords for the editor ------------------------------------------------------------------------
/** Typed chords ("Dm7 G7 | Cmaj7 A7/C# % N.C.") → steps in the key; returns { steps, bad }. */
export function textToSteps(text, key) {
  const steps = [];
  const bad = [];
  for (const tok of String(text).split(/[\s,|]+/).filter(Boolean)) {
    if (tok === '%') { const last = [...steps].reverse().find((s) => s.k === 'chord'); if (last) steps.push({ ...last }); continue; }
    if (/^N\.?C\.?$/i.test(tok)) { steps.push({ k: 'rest', bars: 0 }); continue; }
    const c = parseChord(tok);
    if (!c) { bad.push(tok); continue; }
    const da = degAlt(key, c.li, c.pc);
    const st = { k: 'chord', d: da.deg, a: da.alt, q: QUALITY[c.quality] ? c.quality : 'maj', lock: 1 };
    if (c.bass && c.bass.pc !== c.pc) st.bass = mod12(c.bass.pc - c.pc);
    steps.push(st);
  }
  return { steps, bad };
}

