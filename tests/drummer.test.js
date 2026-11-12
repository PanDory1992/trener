import test from 'node:test';
import assert from 'node:assert/strict';
import { drumBar, familyOf, DRUMMERS } from '../web/js/drummer.js';
import { GROOVES, GROOVE, jamCycle } from '../web/js/grooves.js';
import { keyAt, PROGRESSIONS } from '../web/js/theory.js';

function seeded(seed = 1) { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }
const phrase = (g, level, bars = 8, opts = {}) => { const rng = seeded(7); const out = []; for (let b = 0; b < bars; b++) out.push(drumBar(g, { level, bar: b, rng, ...opts })); return out; };

test('four levels for every groove, all valid', () => {
  assert.equal(DRUMMERS.length, 4);
  for (const g of GROOVES) {
    const counts = [1, 2, 3, 4].map((lv) => phrase(g, lv).flat().length);
    for (const bars of [1, 2, 3, 4].map((lv) => phrase(g, lv))) for (const hits of bars) for (const h of hits) {
      assert.ok(h.step >= 0 && h.step < g.grid && Number.isInteger(h.step), `${g.id} step ${h.step}`);
      assert.ok(h.v >= 1 && h.v <= 127, `${g.id} vel`);
      assert.ok(Math.abs(h.dt) < 0.04, `${g.id} dt`);
    }
    assert.ok(counts[3] >= counts[0], `${g.id}: level 4 plays at least as much as level 1 (${counts})`);
  }
});

test('level 1 is the bare pattern, level 2 keeps it and varies only feel', () => {
  const g = GROOVE.funk;
  const l1 = drumBar(g, { level: 1, rng: seeded() });
  assert.ok(!l1.some((h) => h.n === 38 && h.v < 50), 'no ghost notes');
  assert.ok(l1.every((h) => h.dt === 0));
  const l2 = drumBar(g, { level: 2, bar: 0, rng: seeded() });
  assert.ok(l2.some((h) => h.dt !== 0), 'human timing');
});

test('level 3: ghosts, open hat, a fill every 4 bars; level 4: more, fills every 2', () => {
  const g = GROOVE.pop;
  const l3 = phrase(g, 3);
  assert.ok(l3.flat().some((h) => h.n === 38 && h.v < 40), 'ghosts');
  assert.ok(l3[1].some((h) => h.n === 46), 'open hat in bar 2');
  const fillIn = (bar) => bar.filter((h) => h.step >= 12 && (h.n === 38 || [50, 48, 47, 45, 43].includes(h.n))).length >= 3;
  assert.ok(fillIn(l3[3]) && !fillIn(l3[1]), 'level 3: fill on bar 4 only');
  const l4 = phrase(g, 4);
  assert.ok(l4[1].filter((h) => h.step >= 14).length >= 2, 'level 4: a short fill on bar 2 too');
  assert.ok(l3[5].some((h) => h.n === 51), 'ride in the second half of the 8-bar phrase');
});

test('latin keeps the clave; swing ghosts only on the swung "and"', () => {
  for (const id of ['bossa', 'salsa', 'samba']) {
    const g = GROOVE[id];
    assert.equal(familyOf(g), 'latin');
    const clave = (lv) => phrase(g, lv, 4).map((b) => b.filter((h) => h.n === 37).map((h) => h.step).join(',')).join('|');
    assert.equal(clave(4), clave(2), id);
  }
  const sw = GROOVE.swing;
  assert.equal(familyOf(sw), 'swing');
  const ghosts = phrase(sw, 4).flat().filter((h) => h.n === 38 && h.v < 50);
  assert.ok(ghosts.every((h) => h.step % 4 === 2 || h.step >= 12), 'swung ghosts');
});

test('jam cycle with each drummer level stays balanced', () => {
  const C = keyAt(0, 'major');
  const prog = PROGRESSIONS.find((p) => p.id === 'hymn');
  for (const lv of [1, 2, 3, 4]) for (const g of [GROOVE.funk, GROOVE.mazurek, GROOVE.purdie, GROOVE.lesnoto]) {
    const c = jamCycle({ key: C, prog, groove: g, tempo: g.tempo, band: true, role: 'sluchaj', drummer: lv, barOffset: 3, fill: true, crash: true, rng: seeded(3) });
    const held = new Map();
    for (const e of c.events) { const k = `${e.m[0] & 15}:${e.m[1]}`; held.set(k, (held.get(k) || 0) + ((e.m[0] & 0xf0) === 0x90 ? 1 : -1)); }
    for (const [k, n] of held) assert.equal(n, 0, `${g.id} L${lv} ${k}`);
  }
});

test('new grooves and progressions', () => {
  assert.ok(GROOVES.length >= 33);
  for (const id of ['rock', 'country', 'motown', 'hiphop', 'purdie', 'rocknroll', 'jazz2', 'folk', 'powerballad', 'poppunk', 'samba', 'salsa', 'tango', 'afrobeat', 'mazurek']) assert.ok(GROOVE[id], id);
  for (const g of GROOVES) for (const m of ['major', 'minor']) assert.ok(PROGRESSIONS.some((p) => p.id === g.suggest[m] && p.mode === m), `${g.id} suggests ${g.suggest[m]}`);
  assert.ok(PROGRESSIONS.length >= 27);
});
