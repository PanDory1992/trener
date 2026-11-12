import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../web/js/songs.js';
import * as T from '../web/js/theory.js';

const name = (c) => S.chordObj(c).name;

test('chord symbols', () => {
  const q = (t) => { const c = S.parseChord(t); return c && `${T.spellPc(c.li, c.pc).name}:${c.quality}${c.bass ? `/${T.spellPc(c.bass.li, c.bass.pc).name}` : ''}`; };
  assert.equal(q('C'), 'C:maj');
  assert.equal(q('F#m7'), 'F♯:m7');
  assert.equal(q('Bbmaj7'), 'B♭:maj7');
  assert.equal(q('Bm7b5'), 'B:m7b5');
  assert.equal(q('G/B'), 'G:maj/B');
  assert.equal(q('Dsus4'), 'D:sus4');
  assert.equal(q('Cadd9'), 'C:add9');
  assert.equal(q('E7#9'), 'E:dom7s9');   // tensions are real qualities now (chords.js)
  assert.equal(q('A7sus4'), 'A:dom7sus4');
  assert.equal(q('Ebdim7'), 'E♭:dim7');
  assert.equal(q('C6/9'), 'C:six9');
  assert.equal(q('G13'), 'G:dom13');
  assert.equal(q('D♭7♭9'), 'D♭:dom7b9');
  assert.equal(q('H7'), 'B:dom7');
  assert.equal(q('Am(maj7)'), 'A:mmaj7');
  for (const bad of ['Hello', 'And', 'Be', 'Cat', 'Am-I', 'x2', '']) assert.equal(S.parseChord(bad), null, bad);
});

test('chart with lyrics, sections and bars', () => {
  const text = `[Verse 1]
C        G           Am     F
Some words of a song go here
C    G    F   C
more words here

[Chorus]
| Am  G | F | C |
Intro: Dm G7`;
  const r = S.parseChart(text);
  assert.deepEqual(r.sections.map((s) => s.name), ['Verse 1', 'Chorus', 'Intro']);
  const v = r.sections[0];
  assert.equal(v.chords.length, 8);
  assert.equal(v.lines[0].lyric, 'Some words of a song go here');
  assert.equal(v.lines[0].chords[1].col, 9);
  const ch = r.sections[1];
  assert.deepEqual(ch.chords.map(name), ['Am', 'G', 'F', 'C']);
  assert.deepEqual(ch.beats, [2, 2, 4, 4]);
  assert.deepEqual(r.sections[2].chords.map(name), ['Dm', 'G7']);
});

test('lyrics with a chord-like word stay lyrics', () => {
  const r = S.parseChart('C G\nA man walks down the street\nAm F');
  assert.equal(r.chords.length, 4);
  assert.equal(r.sections[0].lines[0].lyric, 'A man walks down the street');
});

test('key guess and numbers', () => {
  const r = S.parseChart('| A | A | F#m | F#m |\n| D | E | A | A |');
  const k = S.guessKeys(r.chords)[0].key;
  assert.equal(T.keyName(k, true), 'A-dur');
  assert.deepEqual(r.chords.map((c) => S.numberOf(k, c)), ['1', '1', '6m', '6m', '4', '5', '1', '1']);
  const m = S.parseChart('| Am G | F E |');
  const km = S.guessKeys(m.chords)[0].key;
  assert.equal(T.keyName(km, true), 'a-moll');
  assert.deepEqual(m.chords.map((c) => S.numberOf(km, c)), ['1m', '♭7', '♭6', '5']);
  const j = S.parseChart('| Cm7 | F7 | Bbmaj7 | Ebmaj7 |\n| Am7b5 | D7 | Gm | Gm |');
  assert.equal(T.keyName(S.guessKeys(j.chords)[0].key, true), 'g-moll');
});

test('transpose keeps spelling right', () => {
  const r = S.parseChart('C Am F G7 Bb');
  const C = T.keyAt(0, 'major');
  const Db = S.shiftedKey(C, 1);
  assert.equal(T.keyName(Db), 'D♭');
  assert.deepEqual(r.chords.map((c) => name(S.moveChord(c, C, Db))), ['D♭', 'B♭m', 'G♭', 'A♭7', 'C♭']);
  const E = S.shiftedKey(C, 4);
  assert.equal(name(S.moveChord(S.parseChord('G/B'), C, E)), 'B/D♯');
});

test('outside the family: explained', () => {
  const C = T.keyAt(0, 'major');
  assert.match(S.explainOutside(C, S.parseChord('E7'), []), /dominanta.*6m/);
  assert.match(S.explainOutside(C, S.parseChord('Fm'), []), /pożyczony z c-moll.*4m/);
  assert.match(S.explainOutside(C, S.parseChord('Bb'), []), /♭7/);
  assert.equal(S.inFamily(C, S.parseChord('Am7')), true);
  assert.equal(S.inFamily(C, S.parseChord('Bb')), false);
});

test('progressions found inside', () => {
  const C = T.keyAt(0, 'major');
  const r = S.parseChart('C G Am F');
  assert.ok(S.findProgressions(C, r.chords).some((p) => p.id === 'hymn'));
  // rotation: Am F C G is the "sad pop" and also the hymn around the loop
  const r2 = S.parseChart('Am F C G');
  const ids = S.findProgressions(C, r2.chords).map((p) => p.id);
  assert.ok(ids.includes('smutnyPop') && ids.includes('hymn'), ids.join());
});

test('voice fit: an octave lower counts', () => {
  // melody A3–E5 (57–76), voice A2–G4 (45–67): an octave lower and +1 or +2
  const b = S.bestShift({ lo: 57, hi: 76 }, { lo: 45, hi: 67 });
  assert.ok(b.fits, JSON.stringify(b));
  assert.equal(b.octave, -1);
  assert.ok(Math.abs(b.shift) <= 2);
});

test('voice fit', () => {
  // melody G3–C5 (55–72), voice A2–A4 (45–69): move down 4 → D♭? room
  const b = S.bestShift({ lo: 55, hi: 72 }, { lo: 45, hi: 69 });
  assert.ok(b.fits);
  assert.ok(b.shift < 0);
  assert.equal(b.room.low >= 0 && b.room.high >= 0, true);
  const tooWide = S.bestShift({ lo: 40, hi: 75 }, { lo: 45, hi: 69 });
  assert.equal(tooWide.fits, false);
});

test('starters parse and have a key', () => {
  for (const s of S.STARTERS) {
    const r = S.parseChart(s.text);
    assert.ok(r.chords.length >= 2, s.id);
    assert.ok(S.guessKeys(r.chords)[0].score > 0, s.id);
    for (const c of r.chords) assert.ok(S.chordObj(c).tones.length >= 2, `${s.id} ${c.text}`);
  }
});

test('a section in the relative key', () => {
  const r = S.parseChart('[Verse]\nAm7 D9 Am7 D9\nFmaj7 E7 Am\n[Chorus]\n| C | G/B | Am | F |\n| C | G | Fm | C |');
  const k = S.guessKeys(r.chords)[0].key;
  assert.equal(T.keyName(k, true), 'a-moll');
  assert.equal(T.keyName(S.sectionKey(k, r.sections[1].chords), true), 'C-dur');
  assert.equal(T.keyName(S.sectionKey(k, r.sections[0].chords), true), 'a-moll');
  const C = T.keyAt(0, 'major');
  assert.equal(T.keyName(S.sectionKey(C, S.parseChart('D A Bm G D A G D').chords), true), 'D-dur');
});

test('dorian 4 in minor', () => {
  const a = T.keyAt(0, 'minor');
  assert.match(S.explainOutside(a, S.parseChord('D9'), []), /doryckie/);
});
