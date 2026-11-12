import test from 'node:test';
import assert from 'node:assert/strict';
import { planNext } from '../web/js/smartloop.js';

const D = (n, bad = []) => Array.from({ length: n }, (_, i) => (bad.includes(i) ? 'miss' : 'done'));

test('clean → faster', () => {
  const p = planNext(D(15), { range: [0, 14], full: [0, 14], tempo: 66 });
  assert.equal(p.tempo, 70); assert.equal(p.mode, 'full');
});

test('mistakes in one place → loop that window slower, back to full after 2 clean', () => {
  let p = planNext(D(15, [6, 7]), { range: [0, 14], full: [0, 14], tempo: 70 });
  assert.deepEqual(p.range, [5, 8]); assert.equal(p.mode, 'window'); assert.equal(p.tempo, 64); assert.equal(p.fullTempo, 70);
  p = planNext(D(15), p);
  assert.equal(p.mode, 'window'); assert.equal(p.winClean, 1); assert.equal(p.tempo, 67);
  p = planNext(D(15), p);
  assert.equal(p.mode, 'full'); assert.deepEqual(p.range, [0, 14]); assert.equal(p.tempo, 70);
});

test('mistakes everywhere → slower whole', () => {
  const p = planNext(D(15, [1, 7, 13]), { range: [0, 14], full: [0, 14], tempo: 70 });
  assert.equal(p.mode, 'full'); assert.equal(p.tempo, 66);
});

test('window gets a miss → slower again, run resets; tempo bounds hold', () => {
  let p = { range: [5, 8], full: [0, 14], tempo: 42, mode: 'window', winClean: 1, fullTempo: 60 };
  p = planNext(D(15, [6]), p);
  assert.equal(p.tempo, 40); assert.equal(p.winClean, 0);
  const q = planNext(D(4), { range: [0, 3], full: [0, 3], tempo: 199 });
  assert.equal(q.tempo, 200);
});
