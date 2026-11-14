import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepLevel, axesOf, overall, totalScore, applyScores, Coach, Series, rung, PASS } from '../web/js/drill.js';

test('level moves in proportion to the score', () => {
  assert.equal(stepLevel(3, 100), 3.25);
  assert.equal(stepLevel(3, PASS), 3.1);
  assert.equal(stepLevel(3, 79), 2.74);          // a near miss costs about what a perfect attempt gains
  assert.equal(stepLevel(3, 0), 2);              // nothing right: the old −1.0
  assert.equal(stepLevel(1, 0), 1);              // floor
  assert.equal(stepLevel(12, 100), 12);          // ceiling
  // the old rule took a full level for one wrong note; now one wrong note in eight (score 77) costs a quarter
  assert.ok(stepLevel(5, 77) > 4.6);
});

test('axes start from the old single level and the overall level is their mean', () => {
  assert.deepEqual(axesOf({ level: 2.5 }, ['melodia', 'rytm']), { melodia: 2.5, rytm: 2.5 });
  assert.deepEqual(axesOf({ level: 2, axes: { melodia: 4 } }, ['melodia', 'rytm']), { melodia: 4, rytm: 2 });
  assert.deepEqual(axesOf(undefined, ['x']), { x: 1 });
  assert.equal(overall({ a: 2, b: 3 }), 2.5);
  assert.equal(totalScore({ a: 90, b: null, c: 70 }), 80);
});

test('only the tested axes move; the record keeps level, best and history', () => {
  const rec = { level: 3, hist: [], best: 3 };
  const r = applyScores(rec, ['melodia', 'rytm', 'dynamika'], { melodia: 100, rytm: 40, dynamika: null }, false, '2026-11-14');
  assert.equal(r.after.melodia, 3.25);
  assert.ok(r.after.rytm < 3);
  assert.equal(r.after.dynamika, 3);
  assert.equal(rec.level, overall(rec.axes));
  assert.equal(rec.hist.length, 1);
  assert.equal(rec.hist[0].s, 70);
  assert.equal(rec.lastDay, '2026-11-14');
});

test('coach: miss → same again → easier → full → next; the item comes back later', () => {
  const c = new Coach({ gap: 2 });
  let n = 0;
  const fresh = () => ({ id: ++n });
  const a = c.take(fresh);
  assert.equal(a.item.id, 1);
  assert.equal(c.counts, true);
  assert.equal(c.after(false), 'retry');
  assert.equal(c.counts, false);                 // the retry does not move the level
  assert.equal(c.after(false), 'simplify');
  assert.equal(c.stage, 'easy');
  assert.equal(c.after(true), 'full');
  assert.equal(c.after(false), 'next');
  // two fresh items, then item 1 comes back, once
  assert.equal(c.take(fresh).item.id, 2); c.after(true);
  assert.equal(c.take(fresh).item.id, 3); c.after(true);
  const back = c.take(fresh);
  assert.equal(back.item.id, 1);
  assert.equal(back.comeback, true);
  assert.equal(c.isComeback, true);
  assert.equal(c.counts, true);
  assert.equal(c.after(false), 'retry');         // missed again: retried, but not queued a second time
  assert.equal(c.queue.length, 0);
});

test('coach: a pass goes on; a retry that passes goes on', () => {
  const c = new Coach();
  c.take(() => 'x');
  assert.equal(c.after(true), 'next');
  c.take(() => 'y');
  assert.equal(c.after(false), 'retry');
  assert.equal(c.after(true), 'next');
  assert.equal(c.queue.length, 1);               // y still comes back
});

test('series: summary with axes and the most frequent advice', () => {
  const s = new Series(['melodia', 'rytm'], { melodia: 2, rytm: 2 }, 4);
  s.add(90, true, { kind: 'rush', text: 'Przyspieszasz w drugiej połowie.' });
  s.add(60, false, { kind: 'pitch', text: '3. dźwięk: E zamiast F.' });
  s.add(70, false, { kind: 'rush', text: 'Przyspieszasz pod koniec.' });
  assert.equal(s.done, false);
  s.add(100, true, null);
  assert.equal(s.done, true);
  const sum = s.summary({ melodia: 2.5, rytm: 1.8 });
  assert.equal(sum.n, 4);
  assert.equal(sum.ok, 2);
  assert.equal(sum.avg, 80);
  assert.deepEqual(sum.axes, [{ name: 'melodia', from: 2, to: 2.5 }, { name: 'rytm', from: 2, to: 1.8 }]);
  assert.equal(sum.tip.text, 'Przyspieszasz pod koniec.');
});

test('ladder: now and next', () => {
  const L = [[1, 'jeden dźwięk'], [2, 'trzy dźwięki'], [3.5, 'pięć dźwięków']];
  assert.deepEqual(rung(L, 1), { now: 'jeden dźwięk', next: 'trzy dźwięki', nextAt: 2 });
  assert.deepEqual(rung(L, 2.9), { now: 'trzy dźwięki', next: 'pięć dźwięków', nextAt: 3.5 });
  assert.deepEqual(rung(L, 9), { now: 'pięć dźwięków', next: null, nextAt: null });
});
