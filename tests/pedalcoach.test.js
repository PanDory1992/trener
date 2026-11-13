import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPedalCoach, harmonyChanged } from '../web/js/pedalcoach.js';

const C = [48, 64, 67], F = [53, 65, 69], C6 = [48, 64, 69];
function chord(c, t, notes) { notes.forEach((n, i) => c.note(t + i * 0.01, true, n)); }
function run(script) {
  const c = createPedalCoach();
  for (const [t, what, x] of script) what === 'pedal' ? c.pedal(t, x) : chord(c, t, x);
  return { verdicts: c.tick(20), counts: c.counts };
}

test('harmony change: new bass or few common notes', () => {
  const s = (n) => ({ pcs: new Set(n.map((x) => x % 12)), bass: Math.min(...n) });
  assert.equal(harmonyChanged(s(C), s(F)), true);
  assert.equal(harmonyChanged(s(C), s([60, 64, 67])), false);
  assert.equal(harmonyChanged(s(C), s(C6)), false);   // same bass, 2 of 4 shared
  assert.equal(harmonyChanged(null, s(C)), false);
});

test('pedal changed just after the new chord is good', () => {
  const r = run([[0, 'pedal', true], [0.2, 'chord', C], [2, 'chord', F], [2.12, 'pedal', false], [2.3, 'pedal', true]]);
  assert.deepEqual(r.verdicts.map((v) => v.kind), ['good']);
});

test('pedal held through the change is a blur', () => {
  const r = run([[0, 'pedal', true], [0.2, 'chord', C], [2, 'chord', F], [4, 'pedal', false]]);
  assert.deepEqual(r.verdicts.map((v) => v.kind), ['blur']);
  assert.equal(r.counts.blur, 1);
});

test('pedal lifted before the chord and pressed after it is early', () => {
  const r = run([[0, 'pedal', true], [0.2, 'chord', C], [1.6, 'pedal', false], [2, 'chord', F], [2.2, 'pedal', true]]);
  assert.deepEqual(r.verdicts.map((v) => v.kind), ['early']);
});

test('lifted with the chord (within 50 ms) still counts as good', () => {
  const r = run([[0, 'pedal', true], [0.2, 'chord', C], [1.97, 'pedal', false], [2, 'chord', F], [2.25, 'pedal', true]]);
  assert.deepEqual(r.verdicts.map((v) => v.kind), ['good']);
});

test('no pedal in use, melody notes and same harmony: nothing judged', () => {
  assert.deepEqual(run([[0.2, 'chord', C], [8, 'chord', F]]).verdicts, []);
  assert.deepEqual(run([[0, 'pedal', true], [0.2, 'chord', C], [1, 'chord', [72]], [1.5, 'chord', [74]]]).verdicts, []);
  assert.deepEqual(run([[0, 'pedal', true], [0.2, 'chord', C], [2, 'chord', [60, 64, 67]]]).verdicts, []);
});

test('verdict waits for its window', () => {
  const c = createPedalCoach();
  c.pedal(0, true); chord(c, 0.2, C); chord(c, 2, F);
  assert.deepEqual(c.tick(2.3), []);
  assert.equal(c.tick(3.2).length, 1);
});
