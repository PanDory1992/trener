import test from 'node:test';
import assert from 'node:assert/strict';
import { setClick, clickEvents, clickConfig, CLICK_CH } from '../web/js/click.js';
import { countIn, jamCycle } from '../web/js/grooves.js';
import { keyAt, PROGRESSIONS } from '../web/js/theory.js';

test('piano click stays as it was (high C, same velocity)', () => {
  setClick({});
  assert.deepEqual(clickEvents(1, 42, false), [{ t: 1, m: [0x90, 96, 42] }, { t: 1.05, m: [0x80, 96, 0] }]);
  assert.deepEqual(clickEvents(0, 60, true, 0.2, 84)[0].m, [0x90, 84, 60]);
});

test('channel 16: chosen pad, accent louder or on its own pad', () => {
  setClick({ clickOut: 'ch16', clickSound: 3, clickAccent: 0 });
  const [on, off] = clickEvents(0, 42, false);
  assert.deepEqual(on.m, [0x90 | CLICK_CH, 38, 76]);
  assert.deepEqual(off.m, [0x80 | CLICK_CH, 38, 0]);
  assert.equal(clickEvents(0, 42, true)[0].m[2], 88);
  setClick({ clickOut: 'ch16', clickSound: 3, clickAccent: 8 });
  assert.equal(clickEvents(0, 42, true)[0].m[1], 43);
  assert.equal(clickEvents(0, 42, false)[0].m[1], 38);
  setClick({ clickOut: 'ch16', clickSound: 99, clickAccent: 'x' });
  assert.deepEqual(clickConfig(), { out: 'ch16', sound: 1, accent: 0 });
});

test('count-in and the jam click follow the setting; the band count-in stays on the drums', () => {
  setClick({ clickOut: 'ch16', clickSound: 2 });
  const ci = countIn('pop', 100, false).events.filter((e) => (e.m[0] & 0xf0) === 0x90);
  assert.ok(ci.length === 4 && ci.every((e) => e.m[0] === (0x90 | CLICK_CH) && e.m[1] === 37));
  const band = countIn('pop', 100, true).events.filter((e) => (e.m[0] & 0xf0) === 0x90);
  assert.ok(band.every((e) => e.m[0] === 0x99));
  const C = keyAt(0, 'major');
  const j = jamCycle({ key: C, prog: PROGRESSIONS.find((p) => p.id === 'hymn'), groove: 'pop', tempo: 100, click: true });
  const clicks = j.events.filter((e) => e.m[0] === (0x90 | CLICK_CH));
  assert.ok(clicks.length >= 4);
  assert.ok(!j.events.some((e) => e.m[0] === 0x90 && e.m[1] === 96));
  setClick({});
});
