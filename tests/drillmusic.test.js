// 1.10: the exercises' generators take difficulty axes, grading gives 0–100 per axis and one concrete tip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../web/js/music.js';

const play = (m, f = (n, i, t) => ({ p: n.p, ts: t, v: n.v })) => {
  const beat = 60 / m.tempo;
  let t = 10;
  return m.notes.map((n, i) => { const x = f(n, i, t); t += n.dur * beat; return x; });
};

test('echo: a number still works the old way; axes are independent', () => {
  assert.deepEqual(M.echoMotif(4, 7), M.echoMotif({ melodia: 4, rytm: 4, dynamika: 4 }, 7));
  const fastEasy = M.echoMotif({ melodia: 1, rytm: 9, dynamika: 1 }, 3);
  assert.equal(new Set(fastEasy.notes.map((n) => n.p)).size, 1);   // melody 1: one pitch
  assert.ok(fastEasy.tempo > 100);                                // rhythm 9: fast
  assert.deepEqual(fastEasy.tested, ['melodia', 'rytm']);
});

test('echo: focus and the left hand', () => {
  const r = M.echoMotif({ melodia: 10, rytm: 6, dynamika: 1 }, 5, { focus: 'rytm' });
  assert.ok(new Set(r.notes.map((n) => n.p)).size <= 3);           // simple pitches when rhythm is the point
  assert.deepEqual(r.tested, ['rytm']);
  const d = M.echoMotif({ melodia: 1, rytm: 1, dynamika: 1 }, 5, { focus: 'dynamika' });
  assert.equal(d.withDynamics, true);
  assert.deepEqual(d.tested, ['dynamika']);
  const left = M.echoMotif(3, 5, { hand: 'left' });
  assert.ok(left.notes.every((n) => n.p < 60));
  assert.equal(left.hand, 'left');
});

test('echo: scores per axis and one tip', () => {
  const m = M.echoMotif({ melodia: 5, rytm: 2, dynamika: 1 }, 11);
  const perfect = M.gradeEcho(m, play(m));
  assert.equal(perfect.passed, true);
  assert.equal(perfect.scores.melodia, 100);
  assert.ok(perfect.scores.rytm >= 95);
  assert.equal(perfect.scores.dynamika, null);
  assert.equal(perfect.tip.kind, null);
  // one wrong note: a clear tip naming it, a score just under the pass mark, and a mark for the keyboard
  const oneWrong = M.gradeEcho(m, play(m, (n, i, t) => ({ p: i === 2 ? n.p + 1 : n.p, ts: t, v: n.v })));
  assert.equal(oneWrong.passed, false);
  assert.equal(oneWrong.tip.kind, 'pitch');
  assert.match(oneWrong.tip.text, /^3\. dźwięk/);
  assert.equal(oneWrong.tip.mark[0].note, m.notes[2].p);
  assert.ok(oneWrong.scores.melodia >= 50 && oneWrong.scores.melodia < 80);
  // rushing: the tip says so
  const rushed = M.gradeEcho(m, play(m, (n, i, t) => ({ p: n.p, ts: 10 + (t - 10) * 0.7, v: n.v })));
  assert.equal(rushed.tip.kind, 'tempo');
  // too few notes
  assert.equal(M.gradeEcho(m, play(m).slice(0, 2)).tip.kind, 'count');
});

test('dynamics: the black-key hole (raw 1) is not counted as playing too quietly', () => {
  let ph = null;
  for (let s = 1; !ph || !ph.notes.some((n) => M.BLACK.has(n.p % 12)); s++) ph = M.dynamicsPhrase(2, s, {});
  // force black keys into the phrase by transposing a copy a semitone up when needed
  const notes = ph.notes.map((n) => ({ ...n }));
  const shaped = notes.map((n) => ({ p: n.p, v: n.v, raw: n.v }));
  const holed = shaped.map((x) => (M.BLACK.has(x.p % 12) ? { ...x, v: 20, raw: 1 } : x));
  const g = M.gradeDynamics({ ...ph, notes }, holed);
  assert.ok(g.unknown >= 1);
  assert.equal(g.passed, true);
  assert.equal(g.tip.kind, null);
});

test('dynamics: tips have a kind; incomplete attempts score less', () => {
  const ph = M.dynamicsPhrase(2, 9);
  const loud = M.gradeDynamics(ph, ph.notes.map((n) => ({ p: n.p, v: Math.min(127, n.v + 35) })));
  assert.equal(loud.tip.kind, 'loud');
  const half = M.gradeDynamics(ph, ph.notes.slice(0, 3).map((n) => ({ p: n.p, v: n.v })));
  assert.equal(half.tip.kind, 'count');
  assert.ok(half.score < 60);
});

test('aksak: axes, an easier round, scores and the drift', () => {
  const p = M.aksakPlan({ metrum: 1, puls: 10 }, 1);
  assert.ok(['rachenitsa', 'paidushko'].includes(p.meter));
  assert.equal(p.fillers, false);
  const e = M.easierAksak(p);
  assert.ok(e.eighth > p.eighth && e.fillers);
  const plan = M.aksakPlan(3, 1, 'rachenitsa');
  const sched = M.aksakEvents(plan);
  const exact = sched.targets.map((t) => t.t);
  const g = M.gradeAksak(plan, sched, exact);
  assert.equal(g.scores.puls, 100);
  assert.ok(g.scores.metrum >= 95);
  assert.equal(g.tip.kind, null);
  // slowing down: every hit 4 ms later than the one before → a positive drift and a "slow" tip when it costs hits
  const slow = sched.targets.map((t, i) => t.t + i * 0.012);
  const gs = M.gradeAksak(plan, sched, slow);
  assert.ok(gs.drift > 0);
  if (gs.ratio < 0.8) assert.equal(gs.tip.kind, 'slow');
});

test('ear: leap bias makes more leaps', () => {
  const leaps = (bias) => {
    let n = 0;
    for (let s = 1; s <= 60; s++) {
      const m = M.earMelody(4, s, { leapBias: bias });
      for (let i = 1; i < m.notes.length; i++) if (Math.abs(m.notes[i].p - m.notes[i - 1].p) > 2) n++;
    }
    return n;
  };
  assert.ok(leaps(0.3) > leaps(0) + 10);
});
