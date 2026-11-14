// 1.11: stage 2 of the exercises — cold start, rewanż, speed curve, variations, legato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coldTrend, dueDebt, settleDebt, addDebt, speedCurve } from '../web/js/drill.js';
import * as M from '../web/js/music.js';

test('cold start: today and the mean of the days before', () => {
  const t = coldTrend({ '2026-11-10': 60, '2026-11-12': 70, '2026-11-14': 85 }, '2026-11-14');
  assert.equal(t.today, 85);
  assert.equal(t.prev, 65);
  assert.equal(t.days.length, 3);
  assert.equal(coldTrend({}, '2026-11-14').prev, null);
});

test('rewanż: yesterday comes first, one shot; a miss waits for tomorrow, three misses drop it', () => {
  let d = addDebt([], { id: 'a' }, '2026-11-13');
  d = addDebt(d, { id: 'b' }, '2026-11-14');
  assert.equal(dueDebt(d, '2026-11-13'), null);            // nothing from before today
  const due = dueDebt(d, '2026-11-14');
  assert.equal(due.item.id, 'a');
  const missed = settleDebt(d, due, false, '2026-11-14');
  assert.equal(missed.length, 2);
  assert.equal(dueDebt(missed, '2026-11-14'), null);        // the miss waits for tomorrow, b is from today
  assert.ok(dueDebt(missed, '2026-11-15'));
  const passed = settleDebt(d, due, true, '2026-11-14');
  assert.deepEqual(passed.map((x) => x.item.id), ['b']);
  const dd = [{ item: { id: 'c' }, day: '2026-11-01', tries: 2 }];
  assert.equal(settleDebt(dd, dd[0], false, '2026-11-14').length, 0);
  assert.equal(addDebt([1, 2, 3, 4, 5].map((i) => ({ item: i, day: 'x', tries: 0 })), 6, 'y').length, 5);
});

test('speed curve: the border tempo is the fastest bin still at 80+', () => {
  const pts = [[70, 95], [72, 90], [80, 88], [84, 85], [90, 82], [92, 84], [98, 60], [100, 55], [110, 40], [112, 45]];
  const c = speedCurve(pts);
  assert.equal(c.border, 92);                               // bin 88–95 is the last one at 80+
  assert.ok(c.bins.length >= 4);
  assert.equal(speedCurve([[70, 50], [72, 40]]).border, null);
});

test('variation: same intervals and rhythm, another key / octave / hand', () => {
  const m = M.echoMotif(5, 21);
  for (let s = 1; s < 20; s++) {
    const v = M.variedMotif(m, s);
    assert.ok(v.variation);
    assert.equal(v.notes.length, m.notes.length);
    const d0 = v.notes[0].p - m.notes[0].p;
    assert.ok(v.notes.every((n, i) => n.p - m.notes[i].p === d0 && n.dur === m.notes[i].dur));
    assert.ok(d0 !== 0);
  }
  const ear = M.earVariation(M.earMelody(4, 3), 2);
  assert.ok(ear.variation.startsWith('od '));
  assert.equal(ear.showFirst, false);
});

test('legato: gaps and smears between notes', () => {
  const m = { notes: [{ p: 60, dur: 1 }, { p: 62, dur: 1 }, { p: 64, dur: 1 }, { p: 65, dur: 1 }] };
  const legato = [{ ts: 0, off: 0.51 }, { ts: 0.5, off: 1.01 }, { ts: 1.0, off: 1.5 }, { ts: 1.5, off: 2 }];
  assert.equal(M.gradeLegato(m, legato).ok, true);
  const gap = [{ ts: 0, off: 0.3 }, { ts: 0.5, off: 1.0 }, { ts: 1.0, off: 1.5 }, { ts: 1.5, off: 2 }];
  const g = M.gradeLegato(m, gap);
  assert.deepEqual(g.gaps, [0]);
  assert.equal(g.tip.kind, 'gap');
  const smear = [{ ts: 0, off: 0.5 }, { ts: 0.5, off: 1.4 }, { ts: 1.0, off: 1.5 }, { ts: 1.5, off: 2 }];
  assert.deepEqual(M.gradeLegato(m, smear).blurs, [1]);
  assert.equal(M.gradeLegato(m, [{ ts: 0 }, { ts: 0.5 }]).known, 0);
});
