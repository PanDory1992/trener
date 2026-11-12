import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../web/js/music.js';

test('staircase settles near 80 % success', () => {
  // simulated player: passes with probability falling as level rises
  const r = M.rng(7);
  let level = 3, passes = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const p = 1 / (1 + Math.exp(level - 6));
    const ok = r() < p;
    level = M.nextLevel(level, ok);
    if (i > 500) { passes += ok; n++; }
  }
  const rate = passes / n;
  assert.ok(rate > 0.74 && rate < 0.86, `rate ${rate}`);
});

test('echo motifs: sensible at every level and deterministic', () => {
  for (let L = 1; L <= 12; L += 0.5) {
    for (let seed = 1; seed < 40; seed++) {
      const m = M.echoMotif(L, seed);
      assert.ok(m.notes.length >= 3 && m.notes.length <= 8);
      for (const n of m.notes) {
        assert.ok(n.p >= 48 && n.p <= 84, `pitch ${n.p}`);
        assert.ok(n.v >= 1 && n.v <= 127);
        assert.ok(n.dur > 0);
      }
      if (L < 2) assert.equal(new Set(m.notes.map((n) => n.p)).size, 1);
      if (L < 5.5) assert.equal(m.withDynamics, false);
    }
  }
  assert.deepEqual(M.echoMotif(6, 42), M.echoMotif(6, 42));
  const black = M.echoMotif(4, 3, { preferBlack: true });
  assert.ok(black.notes.every((n) => M.BLACK.has(n.p % 12)));
});

test('echo grading: perfect copy at another tempo passes, wrong note fails', () => {
  const m = M.echoMotif(4, 11);
  const on = M.onsetsBeats(m.notes);
  const spb = 0.7; // slower than the motif
  const perfect = m.notes.map((n, i) => ({ p: n.p, ts: 100 + on[i] * spb, v: n.v }));
  const g = M.gradeEcho(m, perfect);
  assert.equal(g.passed, true, JSON.stringify(g));
  const wrong = perfect.map((x, i) => (i === 1 ? { ...x, p: x.p + 1 } : x));
  assert.equal(M.gradeEcho(m, wrong).passed, false);
  const sloppy = perfect.map((x, i) => (i === 2 ? { ...x, ts: x.ts + 0.4 * spb } : x));
  assert.equal(M.gradeEcho(m, sloppy).rhythmOk, false);
  const short = perfect.slice(0, -1);
  assert.equal(M.gradeEcho(m, short).passed, false);
});

test('echo grading: dynamics checked only when the motif has them', () => {
  let m;
  for (let s = 1; !m || !m.withDynamics; s++) m = M.echoMotif(7, s);
  const on = M.onsetsBeats(m.notes);
  const flat = m.notes.map((n, i) => ({ p: n.p, ts: on[i] * 0.6, v: 76 }));
  const shaped = m.notes.map((n, i) => ({ p: n.p, ts: on[i] * 0.6, v: n.v }));
  assert.equal(M.gradeEcho(m, shaped).passed, true);
  assert.equal(M.gradeEcho(m, flat).dynOk, false);
});

test('dynamics grading: shape, level and range', () => {
  const ph = M.dynamicsPhrase(2, 5);
  const t = ph.notes.map((n) => n.v);
  assert.equal(M.gradeDynamicsArrays(t, t).ok, true);
  assert.equal(M.gradeDynamicsArrays(t, [...t].reverse()).ok, false);
  assert.equal(M.gradeDynamicsArrays(t, t.map((v) => v + 30)).ok, false);
  assert.equal(M.gradeDynamicsArrays(t, t.map((v) => 70 + (v - 70) * 0.2)).ok, false);
  const g = M.gradeDynamics(ph, ph.notes.slice(0, 3).map((n) => ({ p: n.p, v: n.v })));
  assert.equal(g.passed, false); // incomplete
});

test('chords: styles', () => {
  // Dm7 = D F A C
  assert.equal(M.checkChord([50, 53, 57, 60], 2, 'm7').ok, true);
  assert.equal(M.checkChord([53, 57, 60, 62], 2, 'm7', 'any').ok, true);
  assert.equal(M.checkChord([53, 57, 60, 62], 2, 'm7', 'rootBass').ok, false);
  assert.equal(M.checkChord([50, 53, 60], 2, 'm7', 'shell').ok, true);
  assert.equal(M.checkChord([50, 53, 57, 60], 2, 'm7', 'shell').ok, false);
  assert.equal(M.checkChord([53, 57, 60, 64], 2, 'm7', 'rootless').ok, true);
  assert.equal(M.checkChord([50, 53, 57, 60, 64], 2, 'm7', 'rootless').ok, false);
  const c = M.checkChord([48, 52], 0, 'maj');
  assert.deepEqual(c.missing, [7]);
  assert.equal(M.checkChord([60, 64, 67], 0, 'maj').ok, true);
  assert.equal(M.checkChord([60, 63, 67], 0, 'maj').ok, false);
});

test('chords: reference voicings are correct and smooth', () => {
  for (const [prog, styles] of [['twoFiveOne', ['any', 'shell', 'rootless', 'rootBass']], ['pop', ['any', 'rootBass']], ['blues', ['any', 'shell']]]) {
    for (const keyPc of [0, 5, 10, 3, 8]) {
      for (const style of styles) {
        let prev = null;
        for (const ch of M.progressionChords(prog, keyPc)) {
          const v = M.referenceVoicing(ch.rootPc, ch.type, style, prev);
          assert.ok(v.length >= 2, `${prog} ${keyPc} ${style}`);
          assert.equal(M.checkChord(v, ch.rootPc, ch.type, style).ok, true, `${prog} ${ch.symbol} ${style} ${v}`);
          prev = v;
        }
      }
    }
  }
});

test('chord symbols use flats in flat keys', () => {
  assert.deepEqual(M.progressionChords('twoFiveOne', 10).map((c) => c.symbol), ['Cm7', 'F7', 'B♭maj7', 'B♭maj7']);
  M.prefs.hNames = true;
  assert.equal(M.progressionChords('twoFiveOne', 10)[2].symbol, 'Bmaj7');
  assert.equal(M.noteName(71), 'H4');
  M.prefs.hNames = false;
});

test('target notes: classification', () => {
  const ch = M.backingChorus('twoFiveOne', 0, 100);
  assert.equal(ch.chords.length, 4);
  const beat = 0.6;
  // Dm7 on beat 1: F (third) strong
  let c = M.classifyTarget(65, 0.01, ch);
  assert.deepEqual([c.kind, c.role, c.strong, c.points], ['chord', '3', true, 3]);
  // off-beat
  c = M.classifyTarget(65, beat * 1.5, ch);
  assert.equal(c.strong, false);
  // G7 bar, B natural on beat 3 = third
  c = M.classifyTarget(71, 4 * beat + 2 * beat, ch);
  assert.equal(c.chord, 'G7'); assert.equal(c.role, '3'); assert.equal(c.strong, true);
  // C# over Dm7 = out? (major seventh: role null → out)
  c = M.classifyTarget(61, 0.0, ch);
  assert.equal(c.kind, 'out');
  // events are valid MIDI
  for (const e of ch.events) assert.ok(e.m[1] >= 21 && e.m[1] <= 108 && e.t >= 0);
});

test('ear melodies: all in range, tunes recognisable', () => {
  for (let L = 1; L <= 12; L += 0.5) {
    for (let s = 1; s < 30; s++) {
      const m = M.earMelody(L, s);
      assert.ok(m.notes.length >= 3);
      for (const n of m.notes) assert.ok(n.p >= 45 && n.p <= 84, `${L} ${s} ${n.p}`);
    }
  }
  const ode = M.TUNES.find((t) => t.name.startsWith('Oda'));
  assert.deepEqual(ode.notes.slice(0, 4).map((x) => x[0]), [4, 4, 5, 7]);
  assert.deepEqual(M.contour([{ p: 60 }, { p: 62 }, { p: 62 }, { p: 59 }]), ['↑', '=', '↓']);
});

test('aksak: perfect taps pass, long group measured, rushing the 3 detected', () => {
  const plan = M.aksakPlan(3, 1, 'rachenitsa');
  const sched = M.aksakEvents(plan);
  assert.equal(sched.targets.length, plan.bars * 3);
  const perfect = sched.targets.map((t) => t.t + 0.01);
  const g = M.gradeAksak(plan, sched, perfect);
  assert.equal(g.passed, true);
  assert.ok(Math.abs(g.longRatio - 1.5) < 0.02, g.longRatio);
  // "even" player: shortens the 3 to a 2.5
  const even = sched.targets.map((t) => (t.group === 0 && t.bar > 0 ? t.t - plan.eighth * 0.5 : t.t));
  const g2 = M.gradeAksak(plan, sched, even);
  assert.ok(g2.longRatio < 1.4, g2.longRatio);
  const none = M.gradeAksak(plan, sched, []);
  assert.equal(none.passed, false);
  assert.deepEqual(M.onsetsFromNotes([1, 1.01, 1.02, 2]), [1, 2]);
});

test('daily plan: fits the time, interleaves, ends with free play', () => {
  const stats = { echo: { success: 0.9, daysSince: 0 }, akordy: { success: 0.4, daysSince: 1 }, dynamika: { success: null }, aksak: { success: 0.7, daysSince: 5 } };
  for (const total of [20, 30, 45]) {
    const plan = M.dailyPlan(total, stats, 4, { ok: true, black_ones: 0.11 }, 3);
    const sum = plan.reduce((s, b) => s + b.minutes, 0);
    assert.equal(sum, total, `${total}: ${sum}`);
    assert.equal(plan[plan.length - 1].mode, 'wolne');
    assert.ok(plan.some((b) => b.mode === 'fiszki'));
    for (let i = 1; i < plan.length; i++) assert.notEqual(plan[i].mode, plan[i - 1].mode);
  }
  assert.equal(M.plural(1, 'a', 'b', 'c'), 'a');
  assert.equal(M.plural(3, 'a', 'b', 'c'), 'b');
  assert.equal(M.plural(12, 'a', 'b', 'c'), 'c');
  assert.equal(M.plural(22, 'a', 'b', 'c'), 'b');
});

test('cards: Leitner boxes', () => {
  let c = { id: 'x', box: 0, due: '2026-11-07' };
  c = M.reviewCard(c, true, '2026-11-07');
  assert.equal(c.box, 1); assert.equal(c.due, '2026-11-08');
  c = M.reviewCard(c, true, '2026-11-08');
  assert.equal(c.box, 2); assert.equal(c.due, '2026-11-10');
  c = M.reviewCard(c, false, '2026-11-10');
  assert.equal(c.box, 1); assert.equal(c.due, '2026-11-11');
  assert.equal(M.dueCards([c, { id: 'y', due: '2026-11-01' }], '2026-11-10').length, 1);
  const motif = M.motifFromPlayed([{ p: 60, ts: 0, v: 60 }, { p: 62, ts: 0.33, v: 70 }, { p: 64, ts: 0.66, v: 80 }], 90);
  assert.deepEqual(motif.notes.map((n) => n.dur), [0.5, 0.5, 1]);
});

test('a stray note before the attempt is forgiven, two are not', () => {
  const m = M.echoMotif(4, 11);
  const on = M.onsetsBeats(m.notes);
  const perfect = m.notes.map((n, i) => ({ p: n.p, ts: 10 + on[i] * 0.6, v: n.v }));
  const stray = [{ p: 30, ts: 9.2, v: 40 }, ...perfect];
  assert.equal(M.gradeEcho(m, stray).passed, true);
  const two = [{ p: 30, ts: 9.0, v: 40 }, { p: 31, ts: 9.2, v: 40 }, ...perfect];
  assert.equal(M.gradeEcho(m, two).passed, false);
  const ph = M.dynamicsPhrase(2, 9);
  const shaped = [{ p: 40, v: 76 }, ...ph.notes.map((n) => ({ p: n.p, v: n.v }))];
  assert.equal(M.gradeDynamics(ph, shaped).passed, true);
});
