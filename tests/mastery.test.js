import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../web/js/mastery.js';

test('ladder: lights fade over clean passes, umiem after 3 clean lights-off passes', () => {
  const data = {}; M.bind(data);
  const id = 'major0|gama|dur|rh';
  M.recordPass(id, { way: 'wait', done: 15, total: 15 });
  assert.equal(M.get(id).stage, 1);
  // clean tempo passes: fade 0→1→2→3, then three passes at fade 3
  for (let f = 0; f < 3; f++) M.recordPass(id, { way: 'tempo', done: 15, total: 15, tempo: 70, fadeUsed: f });
  assert.equal(M.get(id).stage, 2);
  assert.equal(M.get(id).fade, 3);
  M.recordPass(id, { way: 'tempo', done: 15, total: 15, tempo: 70, fadeUsed: 3 });
  M.recordPass(id, { way: 'tempo', done: 15, total: 15, tempo: 74, fadeUsed: 3 });
  assert.equal(M.get(id).stage, 2);
  const r = M.recordPass(id, { way: 'tempo', done: 15, total: 15, tempo: 78, fadeUsed: 3 });
  assert.equal(M.get(id).stage, 3);
  assert.equal(M.get(id).best, 78);
  assert.ok(r.events.some((e) => e.startsWith('UMIEM')));
});

test('a messy pass resets the run and brings light back', () => {
  const data = {}; M.bind(data);
  const id = 'x';
  for (let f = 0; f < 3; f++) M.recordPass(id, { way: 'tempo', done: 8, total: 8, fadeUsed: f });
  M.recordPass(id, { way: 'tempo', done: 8, total: 8, fadeUsed: 3 });
  M.recordPass(id, { way: 'tempo', done: 7, total: 8, fadeUsed: 3 });    // one slip: run reset, lights stay off
  assert.equal(M.get(id).cleanRun, 0);
  assert.equal(M.get(id).fade, 3);
  M.recordPass(id, { way: 'tempo', done: 3, total: 8, fadeUsed: 3 });    // fell apart: more light
  assert.equal(M.get(id).fade, 2);
  // lights "always full" never count as lights-off
  for (let i = 0; i < 5; i++) M.recordPass(id, { way: 'tempo', done: 8, total: 8, fadeUsed: 0 });
  assert.equal(M.get(id).stage, 2);
});

test('key summary', () => {
  const data = { mastery: { 'major0|a': { stage: 3 }, 'major0|b': { stage: 1 }, 'major1|c': { stage: 3 } } }; M.bind(data);
  const s = M.keySummary('major0|');
  assert.equal(s.known, 1); assert.equal(s.started, 1);
});
