// 1.13: inversions, the Przewroty mode, the second pass of a progression, "Dowolny przewrót".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bottomWord, closestInversions, invPlan, invStage, invSymbol, invVoicing, INV_STAGES } from '../web/js/inversions.js';
import { BANK, BANK_BY_ID, bankChords, secondPass, withSevenths } from '../web/js/progbank.js';
import { checkChord, chordPcs, rng } from '../web/js/music.js';

test('a chord in each inversion: the right note at the bottom, close position', () => {
  assert.deepEqual(invVoicing(0, 'maj', 0, 60), [60, 64, 67]);
  assert.deepEqual(invVoicing(0, 'maj', 1, 64), [64, 67, 72]);
  assert.deepEqual(invVoicing(0, 'maj', 2, 67), [67, 72, 76]);
  assert.deepEqual(invVoicing(7, 'dom7', 3, 65), [65, 67, 71, 74]);     // G7/F
  assert.equal(invSymbol(0, 'maj', 1), 'C/E');
  assert.equal(invSymbol(0, 'maj', 0), 'C');
  assert.equal(bottomWord(0, 'maj', 1), 'tercja (E)');
  assert.equal(bottomWord(7, 'dom7', 3), 'septyma (F)');
});

test('closest inversions: C – F – G – C becomes C – F/C – G/B – C, the hand barely moves', () => {
  const out = closestInversions([[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']].map(([rootPc, type]) => ({ rootPc, type })));
  assert.deepEqual(out.map((c) => invSymbol(c.rootPc, c.type, c.inv)), ['C', 'F/C', 'G/B', 'C']);
  for (const c of out) assert.equal(c.voicing[0] % 12, c.bass);
});

test('every stage makes rounds you can play: the reference voicing passes its own check', () => {
  for (const s of INV_STAGES) {
    const r = rng(s.from * 13);
    for (let k = 0; k < 15; k++) {
      const p = invPlan(s.from + 0.3, r);
      assert.equal(p.stage, s);
      assert.ok(p.chords.length >= 3, s.name);
      for (const c of p.chords) {
        assert.ok(checkChord(c.voicing, c.rootPc, c.type, 'any', c.bass).ok, `${s.name}: ${c.symbol} ${c.voicing}`);
        assert.equal(c.voicing[0] % 12, c.bass);
      }
    }
  }
  // the basics climb: C, C/E, C/G, C an octave up
  assert.deepEqual(invPlan(1, rng(1)).chords.map((c) => c.inv), [0, 1, 2, 0]);
  assert.equal(invStage(6.5).name, 'Septymowe w czterech pozycjach');
});

test('an inversion with the wrong bottom fails; the right one passes', () => {
  const [c] = invPlan(1, rng(2)).chords.slice(1);            // first inversion
  assert.ok(checkChord(c.voicing, c.rootPc, c.type, 'any', c.bass).ok);
  const root = chordPcs(c.rootPc, c.type)[0];
  const wrong = invVoicing(c.rootPc, c.type, 0, 60);
  assert.equal(wrong[0] % 12, root);
  assert.ok(!checkChord(wrong, c.rootPc, c.type, 'any', c.bass).ok);
});

test('"Dowolny przewrót": pryma w basie and shell accept any note at the bottom', () => {
  assert.ok(!checkChord([64, 67, 72], 0, 'maj', 'rootBass').ok);
  assert.ok(checkChord([64, 67, 72], 0, 'maj', 'any').ok);
  assert.ok(!checkChord([64, 71, 72], 0, 'maj7', 'shell').ok);
  assert.ok(checkChord([64, 71, 72], 0, 'maj7', 'shell', null, { freeBass: true }).ok);
  assert.ok(!checkChord([64, 67, 71, 72], 0, 'maj7', 'shell', null, { freeBass: true }).ok);   // the fifth is still not in a shell
});

test('the second pass: same, closer or with sevenths; long progressions once', () => {
  const r = rng(9);
  assert.equal(secondPass(BANK_BY_ID.canon, 5, r), null);
  const kinds = new Set();
  for (let k = 0; k < 60; k++) kinds.add(secondPass(BANK_BY_ID.axis, 6, r));
  assert.deepEqual([...kinds].sort(), ['closer', 'same', 'sevenths']);
  for (let k = 0; k < 20; k++) assert.equal(secondPass(BANK_BY_ID.axis, 1, r), 'same');
  const sev = bankChords('axis', 0, withSevenths(BANK_BY_ID.axis)).map((c) => c.symbol).join(' ');
  assert.equal(sev, 'Cmaj7 G7 Am7 Fmaj7');
  assert.equal(bankChords('balkan', 9, withSevenths(BANK_BY_ID.balkan)).map((c) => c.symbol).join(' '), 'Am7 Dm7 E7 Am7');
  assert.equal(withSevenths(BANK_BY_ID.creep), null);          // III and iv are not in the key
  assert.equal(withSevenths(BANK_BY_ID.twoFiveOne), null);     // already sevenths
});

test('more basics: at level 1 there is plenty to choose from', () => {
  const easy = BANK.filter((p) => p.tier === 1);
  assert.ok(easy.length >= 15, String(easy.length));
  assert.ok(BANK.filter((p) => p.fam === 'podstawy').length >= 10);
});
