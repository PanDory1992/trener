// 1.12: the bank of real progressions for the chord gym.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, BANK_BY_ID, bankChords, bankStyle, bankWeight, keysFor, nextSet, parseRoman, setTonic } from '../web/js/progbank.js';
import { checkChord, referenceVoicing, rng, roleIn } from '../web/js/music.js';

const sym = (id, key) => bankChords(id, key).map((c) => c.symbol).join(' ');

test('roman numerals: case, qualities, accidentals, bass', () => {
  assert.deepEqual(parseRoman('V7'), { deg: 7, type: 'dom7', bass: null, acc: '', bassAcc: '' });
  assert.equal(parseRoman('ii7').type, 'm7');
  assert.equal(parseRoman('iiø7').type, 'm7b5');
  assert.equal(parseRoman('bVII').deg, 10);
  assert.equal(parseRoman('#iv°7').deg, 6);
  assert.equal(parseRoman('#iv°7').type, 'dim7');
  assert.equal(parseRoman('imaj7').type, 'mMaj7');
  assert.equal(parseRoman('V/7').bass, 11);
  assert.equal(parseRoman('iv/b6').bass, 8);
  assert.throws(() => parseRoman('X7'));
  assert.throws(() => parseRoman('Vø7'));
});

test('every progression parses, has an id, a family and a sane tier', () => {
  assert.ok(BANK.length >= 60, String(BANK.length));
  assert.equal(new Set(BANK.map((p) => p.id)).size, BANK.length);
  for (const p of BANK) {
    assert.ok(p.chords.length >= 3, p.id);
    assert.ok(p.tier >= 1 && p.tier <= 8, p.id);
    assert.ok(p.about.length > 10, p.id);
  }
});

test('real songs come out right', () => {
  assert.equal(sym('axis', 0), 'C G Am F');
  assert.equal(sym('andalusian', 9), 'Am G F E');
  assert.equal(sym('creep', 7), 'G B C Cm');
  assert.equal(sym('autumn', 7), 'Cm7 F7 B♭maj7 E♭maj7 Am7♭5 D7 Gm7 Gm7');
  assert.equal(sym('flyMe', 0), 'Am7 Dm7 G7 Cmaj7 Fmaj7 Bm7♭5 E7 Am7');
  assert.equal(sym('bachC', 0), 'C Dm7/C G7/B C Am/C D7/C G/B Cmaj7/B Am7 D7 G');
  assert.equal(sym('hijaz', 2), 'D E♭ Gm D');               // ♭II spelled flat even in D
  assert.equal(sym('ipanema', 5), 'Fmaj7 G7 Gm7 G♭7 Fmaj7');
  assert.ok(BANK_BY_ID.autumn.minor && !BANK_BY_ID.creep.minor && BANK_BY_ID.minorTwoFive.minor);
});

test('slash chords: the bass must be at the bottom; a passing bass note is allowed', () => {
  const [, gOverB] = bankChords('bassDown', 0);          // G/B
  assert.equal(gOverB.bass, 11);
  assert.ok(checkChord([47, 55, 59, 62], gOverB.rootPc, gOverB.type, 'any', gOverB.bass).ok);
  assert.ok(!checkChord([43, 47, 50], gOverB.rootPc, gOverB.type, 'any', gOverB.bass).ok);     // G at the bottom
  const cOverB = bankChords('bassDown2', 0)[1];         // C/B: B is not in C
  assert.ok(checkChord([47, 60, 64, 67], cOverB.rootPc, cOverB.type, 'shell', cOverB.bass).ok);
  const v = referenceVoicing(cOverB.rootPc, cOverB.type, 'any', null, cOverB.bass);
  assert.equal(v[0] % 12, 11);
  assert.ok(checkChord(v, cOverB.rootPc, cOverB.type, 'any', cOverB.bass).ok);
});

test('the new chord types are checked and labelled', () => {
  assert.ok(checkChord([60, 64, 69], 0, 'maj6').ok);              // C6 without the fifth
  assert.ok(!checkChord([60, 64, 67], 0, 'maj6').ok);             // that is just C
  assert.ok(checkChord([60, 63, 66, 69], 0, 'dim7').ok);
  assert.ok(checkChord([60, 65, 67], 0, 'sus4').ok);
  assert.ok(!checkChord([60, 64, 67], 0, 'sus4').ok);
  assert.ok(checkChord([60, 64, 68], 0, 'aug').ok);
  assert.equal(roleIn(9, 0, 'maj6'), '6');
  assert.equal(roleIn(5, 0, 'sus4'), '4');
  for (const p of BANK) for (const c of bankChords(p.id, 0)) {
    const v = referenceVoicing(c.rootPc, c.type, 'any', null, c.bass);
    assert.ok(checkChord(v, c.rootPc, c.type, 'any', c.bass).ok, `${p.id} ${c.symbol}`);
  }
});

test('every level has enough to choose from, and nothing far above it', () => {
  for (let L = 1; L <= 12; L++) {
    const ok = BANK.filter((p) => bankWeight(p, L) > 0);
    assert.ok(ok.length >= 7, `level ${L}: ${ok.length}`);
    assert.ok(ok.every((p) => p.tier <= L + 1));
  }
  assert.equal(keysFor(1).length, 3);
  assert.equal(keysFor(12).length, 12);
});

test('a set: one family, simplest first, then another family in a neighbouring key', () => {
  const r = rng(7);
  const a = nextSet(4, r);
  assert.ok(a.ids.length >= 1 && a.ids.length <= 3);
  assert.ok(a.ids.every((x) => BANK_BY_ID[x].fam === a.fam));
  const tiers = a.ids.map((x) => BANK_BY_ID[x].tier);
  assert.deepEqual(tiers, [...tiers].sort((x, y) => x - y));
  assert.ok(keysFor(4).includes(a.key));
  const b = nextSet(4, r, { prev: a });
  assert.notEqual(b.fam, a.fam);
  assert.ok([5, 7].includes((b.key - a.key + 12) % 12), `${a.key} → ${b.key}`);
  // minor progressions take the relative minor: same key signature
  assert.equal(setTonic({ key: 0 }, 'andalusian'), 9);
  assert.equal(setTonic({ key: 0 }, 'axis'), 0);
});

test('variety: many different progressions over a session, recent ones pushed back', () => {
  for (const L of [2, 5, 8]) {
    const r = rng(L * 11);
    const seen = {};
    let recent = [];
    let prev = null;
    let played = 0;
    for (let s = 0; s < 12; s++) {
      const set = nextSet(L, r, { seen, recent, prev });
      for (const x of set.ids) { seen[x] = (seen[x] || 0) + 1; recent = [...recent.filter((y) => y !== x), x].slice(-12); played++; }
      prev = set;
    }
    const distinct = Object.keys(seen).length;
    assert.ok(distinct >= Math.min(18, played * 0.6), `level ${L}: ${distinct} different out of ${played}`);
  }
  const p = BANK_BY_ID.axis;
  assert.ok(bankWeight(p, 1, { recent: ['axis'], seen: { axis: 1 } }) < bankWeight(p, 1, { seen: { axis: 1 } }) / 10);
  assert.ok(bankWeight(p, 1) > bankWeight(p, 1, { seen: { axis: 1 } }));
});

test('voicing by level: triads stay whole, sevenths go shell and rootless higher up', () => {
  const r = rng(3);
  assert.equal(bankStyle(1, BANK_BY_ID.axis, r), 'any');
  for (let k = 0; k < 20; k++) assert.ok(['any', 'rootBass'].includes(bankStyle(10, BANK_BY_ID.canon, r)));
  for (let k = 0; k < 20; k++) assert.ok(['shell', 'rootless'].includes(bankStyle(10, BANK_BY_ID.autumn, r)));
  assert.equal(bankStyle(5, BANK_BY_ID.twoFiveOne, r), 'any');
});
