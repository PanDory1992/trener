import test from 'node:test';
import assert from 'node:assert/strict';
import { songBand, chunkEvents, chordAt, BAND_MODES } from '../web/js/bandplay.js';
import { keyAt } from '../web/js/theory.js';

const C = keyAt(0, 'major');
const steps = [{ k: 'sec', label: 'Zwrotka' }, { k: 'chord', d: 1, a: 0, q: 'maj', bars: 1 }, { k: 'chord', d: 4, a: 0, q: 'maj', bars: 0.5 },
  { k: 'chord', d: 5, a: 0, q: 'maj', bars: 0.5 }, { k: 'chord', d: 6, a: 0, q: 'min', bars: 2 }];
const rng = () => 0.42;
const chans = (ev) => new Set(ev.filter((e) => (e.m[0] & 0xf0) === 0x90).map((e) => e.m[0] & 0x0f));

test('Perkusja i bas: drums and bass, no keys and nothing on your channel 1', () => {
  const p = songBand({ key: C, steps, groove: 'pop', tempo: 100, mode: 'rytm', rng });
  const c = chans(p.events);
  assert.ok(c.has(9) && c.has(1), [...c].join());
  assert.ok(!c.has(2) && !c.has(0), [...c].join());
});

test('Cały zespół: drums, bass and keys on channel 3', () => {
  const c = chans(songBand({ key: C, steps, groove: 'ballada', tempo: 76, mode: 'calosc', rng }).events);
  assert.ok(c.has(9) && c.has(1) && c.has(2), [...c].join());
  assert.ok(!c.has(0));
});

test('count-in only on the first pass; chords follow the written lengths', () => {
  const first = songBand({ key: C, steps, groove: 'pop', tempo: 120, rng });
  const next = songBand({ key: C, steps, groove: 'pop', tempo: 120, lead: false, barOffset: first.bars, rng });
  assert.equal(first.bars, 4);
  assert.ok(Math.abs(first.leadIn - 2) < 1e-9);          // one bar of 4/4 at 120
  assert.equal(next.leadIn, 0);
  assert.ok(Math.abs(first.seconds - 10) < 1e-6);        // 1 + 4 bars
  assert.deepEqual(first.chords.map((c) => +(c.end - c.start).toFixed(3)), [2, 1, 1, 4]);
  assert.equal(chordAt(first.chords, 2.5), 0);
  assert.equal(chordAt(first.chords, 4.2), 1);
  assert.equal(chordAt(first.chords, 9.9), 3);
  assert.equal(chordAt(first.chords, 1), -1);
});

test('a whole song is cut into pieces the server accepts, nothing lost, times kept', () => {
  const long = Array.from({ length: 40 }, (_, i) => ({ k: 'chord', d: (i % 6) + 1, a: 0, q: 'maj', bars: 2 }));
  const p = songBand({ key: C, steps: long, groove: 'funk', tempo: 90, mode: 'calosc', drummer: 4, rng });
  const parts = chunkEvents(p.events, 1000);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((x) => x.events.length <= 1000));
  assert.equal(parts.reduce((n, x) => n + x.events.length, 0), p.events.length);
  const back = parts.flatMap((x) => x.events.map((e) => e.t + x.offset)).sort((a, b) => a - b);
  const orig = p.events.map((e) => e.t).sort((a, b) => a - b);
  assert.ok(back.every((t, i) => Math.abs(t - orig[i]) < 1e-9));
  assert.ok(parts.every((x) => x.events.every((e) => e.t >= 0)));
});

test('two modes, with help text', () => {
  assert.deepEqual(BAND_MODES.map(([v]) => v), ['rytm', 'calosc']);
});
