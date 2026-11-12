import test from 'node:test';
import assert from 'node:assert/strict';
import { ScaleDetector, runShape, timing } from '../web/js/scaledetect.js';

const DUR = runShape([0, 2, 4, 5, 7, 9, 11]);
const cands = [
  { id: 'C dur', tonicPc: 0, shape: DUR },
  { id: 'D dur', tonicPc: 2, shape: DUR },
  { id: 'A penta moll', tonicPc: 9, shape: runShape([0, 3, 5, 7, 10]) },
];
const play = (d, notes, { start = 0, step = 0.5, jitter = () => 0 } = {}) => {
  let res = null;
  notes.forEach((n, i) => { const r = d.push(n, start + i * step + jitter(i)); if (r) res = r; });
  return res;
};

test('shape', () => {
  assert.deepEqual(DUR, [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]);
});

test('C major up and down, steady, right hand', () => {
  const d = new ScaleDetector(() => cands);
  const r = play(d, DUR.map((x) => 60 + x));
  assert.equal(r.cand.id, 'C dur');
  assert.equal(r.hand, 'rh');
  assert.equal(r.steady, true);
  assert.equal(r.bpm, 120);
});

test('any octave, left hand, other key', () => {
  const d = new ScaleDetector(() => cands);
  const r = play(d, DUR.map((x) => 38 + x));
  assert.equal(r.cand.id, 'D dur');
  assert.equal(r.hand, 'lh');
});

test('a wrong note in between: no match', () => {
  const d = new ScaleDetector(() => cands);
  const notes = DUR.map((x) => 60 + x);
  notes.splice(5, 0, 66);
  assert.equal(play(d, notes), null);
});

test('only up: no match', () => {
  const d = new ScaleDetector(() => cands);
  assert.equal(play(d, [60, 62, 64, 65, 67, 69, 71, 72]), null);
});

test('noodling before the run does not matter', () => {
  const d = new ScaleDetector(() => cands);
  const r = play(d, [64, 67, 60, 61, ...DUR.map((x) => 60 + x)]);
  assert.equal(r.cand.id, 'C dur');
});

test('uneven timing: recognised but not steady', () => {
  const d = new ScaleDetector(() => cands);
  const r = play(d, DUR.map((x) => 60 + x), { jitter: (i) => (i % 3 === 0 ? 0.35 : 0) });
  assert.equal(r.cand.id, 'C dur');
  assert.equal(r.steady, false);
});

test('a long pause breaks the run', () => {
  const d = new ScaleDetector(() => cands);
  const notes = DUR.map((x) => 60 + x);
  let res = null;
  notes.forEach((n, i) => { const r = d.push(n, i * 0.5 + (i >= 8 ? 4 : 0)); if (r) res = r; });
  assert.equal(res, null);
});

test('both hands in octaves', () => {
  const d = new ScaleDetector(() => cands);
  let res = null;
  DUR.forEach((x, i) => {
    const t = i * 0.5;
    // the partner arrives a few ms later; sometimes the lower note second
    const [a, b] = i % 2 ? [48 + x, 60 + x] : [60 + x, 48 + x];
    for (const [n, tt] of [[a, t], [b, t + 0.02]]) { const r = d.push(n, tt); if (r) res = r; }
  });
  assert.equal(res.cand.id, 'C dur');
  assert.equal(res.hand, 'both');
  assert.deepEqual(res.notes.slice(0, 3), [48, 50, 52]);
});

test('a chord breaks the run', () => {
  const d = new ScaleDetector(() => cands);
  const notes = DUR.map((x) => 60 + x);
  let res = null;
  notes.forEach((n, i) => { if (i === 5) { d.push(64, i * 0.5 - 0.2); d.push(67, i * 0.5 - 0.19); } const r = d.push(n, i * 0.5); if (r) res = r; });
  assert.equal(res, null);
});

test('twice in a row: the bottom tonic starts the next run', () => {
  const d = new ScaleDetector(() => cands);
  const one = DUR.map((x) => 60 + x);
  const twice = [...one, ...one.slice(1)];
  let n = 0;
  twice.forEach((x, i) => { if (d.push(x, i * 0.5)) n++; });
  assert.equal(n, 2);
});

test('pentatonic', () => {
  const d = new ScaleDetector(() => cands);
  const r = play(d, runShape([0, 3, 5, 7, 10]).map((x) => 57 + x), { step: 0.4 });
  assert.equal(r.cand.id, 'A penta moll');
  assert.equal(r.bpm, 150);
});

test('timing ignores the long top note', () => {
  const t = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.5, 5, 5.5, 6, 6.5, 7, 7.5];
  assert.equal(timing(t, 7).steady, true);
});
