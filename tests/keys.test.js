import test from 'node:test';
import assert from 'node:assert/strict';
import { jamCycle, KEYS_CH } from '../web/js/grooves.js';
import { keyAt, PROGRESSIONS } from '../web/js/theory.js';

const C = keyAt(0, 'major');
const base = { key: C, prog: PROGRESSIONS.find((p) => p.id === 'hymn'), groove: 'pop', tempo: 96, role: 'solo' };
const chans = (ev) => new Set(ev.filter((e) => (e.m[0] & 0xf0) === 0x90).map((e) => e.m[0] & 0x0f));

test('band keys go to channel 3 when the band plays and keysOwn is on', () => {
  const c = chans(jamCycle({ ...base, band: true, keysOwn: true }).events);
  assert.ok(c.has(KEYS_CH) && c.has(1) && c.has(9));
  assert.ok(!c.has(0), 'nothing on your piano channel');
});

test('without keysOwn or without the band the chords stay on the piano', () => {
  assert.ok(chans(jamCycle({ ...base, band: true }).events).has(0));
  const c = chans(jamCycle({ ...base, band: false, keysOwn: true }).events);
  assert.ok(c.has(0) && !c.has(KEYS_CH));
});
