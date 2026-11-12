import test from 'node:test';
import assert from 'node:assert/strict';
import { toTrainerCh, TRAINER_CH } from '../web/js/outch.js';
import { jamCycle } from '../web/js/grooves.js';
import { keyAt, PROGRESSIONS } from '../web/js/theory.js';

const st = (e) => e.m[0];

test('channel 1 notes go to channel 3, others stay', () => {
  const out = toTrainerCh([
    { t: 0, m: [0x90, 60, 80] }, { t: 1, m: [0x80, 60, 0] },     // ch 1 → 3
    { t: 0, m: [0x91, 36, 80] }, { t: 0, m: [0x99, 36, 90] },    // bass 2, drums 10
    { t: 0, m: [0x9f, 38, 90] }, { t: 0, m: [0x92, 64, 70] },    // click 16, already 3
  ]);
  assert.deepEqual(out.map(st), [0x92, 0x82, 0x91, 0x99, 0x9f, 0x92]);
  assert.equal(TRAINER_CH, 2);
  assert.deepEqual(out[0].m.slice(1), [60, 80]);
});

test('the input is not changed in place', () => {
  const ev = [{ t: 0, m: [0x90, 60, 80] }];
  toTrainerCh(ev);
  assert.equal(ev[0].m[0], 0x90);
});

test('nothing from a jam lap reaches channel 1 (with or without the band, click on the piano)', () => {
  const C = keyAt(0, 'major');
  const prog = PROGRESSIONS.find((p) => p.id === 'hymn');
  for (const band of [true, false]) {
    const j = jamCycle({ key: C, prog, groove: 'pop', tempo: 100, band, click: true, role: 'solo' });
    const chans = new Set(toTrainerCh(j.events).map((e) => e.m[0] & 0x0f));
    assert.ok(!chans.has(0), `band=${band}: ${[...chans]}`);
  }
});
