// 1.14: Improwizacja — plans, the band's round, grading both hands and what is easy to miss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedRH, clusters, easierImprov, gradeImprov, improvPlan, improvRound, lhAt, lhDemo, lhSlots, LH, RH, rhAt, SPLIT } from '../web/js/improv.js';
import { rng } from '../web/js/music.js';

const fixed = (lh, rh, extra = {}) => ({ lh: LH.find((s) => s.id === lh), rh: RH.find((s) => s.id === rh), vamp: { id: 'vamp14', bpc: 2, from: 1 }, keyIdx: 0, mode: 'major', groove: 'ballada', tempo: 70, color: 'triads', ...extra });
const low = (pc) => 36 + ((pc - 36) % 12 + 12) % 12;
const high = (pc) => 60 + ((pc - 60) % 12 + 12) % 12;
/** A player who does everything right: the left-hand slots, plus right-hand notes made by fn(bar, k) → [{t, p}]. */
function player(R, plan, rh = () => [], { lhLate = 0, drop = () => false } = {}) {
  const notes = lhSlots(R, plan).filter((s) => !drop(s)).map((s) => ({ t: s.t + lhLate, p: low(s.pcs[0]) }));
  R.bars.forEach((b, k) => notes.push(...rh(b, k)));
  return notes;
}

test('the ladders start at 1 and climb; a plan follows the axes', () => {
  assert.equal(LH[0].from, 1);
  assert.equal(RH[0].from, 1);
  assert.equal(lhAt(3.2).id, 'pompa');
  assert.equal(rhAt(7.4).id, 'blue');
  const r = rng(4);
  const p = improvPlan({ lewa: 1, prawa: 1 }, r);
  assert.equal(p.lh.id, 'dron');
  assert.equal(p.rh.id, 'jeden');
  assert.equal(p.keyIdx, 0);                         // C major / A minor first: white keys
  assert.equal(p.color, 'triads');
  assert.ok(p.tempo >= 58 && p.tempo <= 64);
  for (let k = 0; k < 30; k++) {
    const q = improvPlan({ lewa: 9, prawa: 9 }, r);
    assert.ok(q.tempo <= 104);
    assert.ok(['ballada', 'pop', 'halftime', 'neosoul', 'shuffle', 'funk', 'swing', 'bossa'].includes(q.groove));
  }
  const e = easierImprov(fixed('pompa', 'penta'), 'lewa');
  assert.equal(e.lh.id, 'polowki');
  assert.equal(e.rh.id, 'penta');
  assert.ok(e.tempo < 70);
});

test('a round: count-in, 8 bars of drums, the chord of every bar', () => {
  const R = improvRound(fixed('dron', 'jeden'), { rng: rng(1) });
  assert.equal(R.bars.length, 8);
  assert.deepEqual(R.bars.map((b) => b.chord.name), ['C', 'C', 'F', 'F', 'C', 'C', 'F', 'F']);
  assert.ok(R.events.every((e) => (e.m[0] & 15) === 9), 'drums only: your left hand is the bass');
  assert.equal(R.bars[2].chord.third, 9);           // A in F
  assert.ok(Math.abs(R.seconds - (R.leadIn + 8 * R.barLen)) < 1e-9);
  const twelve = improvRound(fixed('dron', 'jeden', { vamp: { id: 'blues', bpc: 1 }, color: 'auto' }), { rng: rng(1) });
  assert.equal(twelve.bars.length, 12);             // a 12-bar blues is one lap
});

test('a perfect round passes both hands', () => {
  const plan = fixed('pompa', 'trzy');
  const R = improvRound(plan, { rng: rng(2) });
  const g = gradeImprov(plan, R, player(R, plan, (b, k) => [{ t: b.start, p: high(0) }, { t: b.start + R.beat, p: high(2) }, { t: b.start + 2 * R.beat, p: high(4) }]));
  assert.equal(g.scores.lewa, 100);
  assert.ok(g.scores.prawa >= 90, JSON.stringify(g.rh));
  assert.ok(g.passed);
});

test('the left hand stopping is the first thing said, even if the right is fine', () => {
  const plan = fixed('pompa', 'trzy');
  const R = improvRound(plan, { rng: rng(2) });
  const g = gradeImprov(plan, R, player(R, plan, (b) => [{ t: b.start, p: high(0) }], { drop: (s) => s.bar >= 3 && s.bar <= 5 }));
  assert.equal(g.tip.kind, 'lh-stop');
  assert.match(g.tip.text, /milknie prawa, nie lewa/);
  assert.ok(g.scores.lewa < 70);
});

test('right notes outside the round and right hand silent', () => {
  const plan = fixed('dron', 'trzy');
  const R = improvRound(plan, { rng: rng(2) });
  const wrong = gradeImprov(plan, R, player(R, plan, (b) => [{ t: b.start, p: 61 }, { t: b.start + R.beat, p: 66 }]));
  assert.equal(wrong.tip.kind, 'rh-notes');
  const silent = gradeImprov(plan, R, player(R, plan));
  assert.equal(silent.scores.prawa, 0);
  assert.equal(silent.tip.kind, 'rh-none');
  assert.deepEqual(allowedRH(R, plan, 0).sort((a, b) => a - b), [0, 2, 4]);   // C D E: three notes, strict
});

test('question and answer: silence in the answer bars counts', () => {
  const plan = fixed('dron', 'pytanie');
  const R = improvRound(plan, { rng: rng(5) });
  const ok = gradeImprov(plan, R, player(R, plan, (b, k) => (Math.floor(k / 2) % 2 ? [] : [{ t: b.start, p: high(0) }, { t: b.start + R.beat, p: high(4) }])));
  const noSpace = gradeImprov(plan, R, player(R, plan, (b) => [{ t: b.start, p: high(0) }, { t: b.start + R.beat, p: high(4) }]));
  assert.equal(ok.rh.task.score, 1);
  assert.equal(noSpace.rh.task.score, 0.5);
  assert.ok(ok.space >= 50);
});

test('the blue note: ♭3 resolving up a semitone', () => {
  const plan = fixed('dron', 'blue');
  const R = improvRound(plan, { rng: rng(5) });
  const g = gradeImprov(plan, R, player(R, plan, (b, k) => (k % 2 ? [] : [{ t: b.start + R.beat, p: 63 }, { t: b.start + 1.5 * R.beat, p: 64 }])));
  assert.equal(g.rh.task.score, 1);
  assert.match(g.rh.task.text, /4 razy/);
});

test('the third on beat one', () => {
  const plan = fixed('dron', 'tercja');
  const R = improvRound(plan, { rng: rng(5) });
  const g = gradeImprov(plan, R, player(R, plan, (b) => [{ t: b.start, p: high(b.chord.third) }]));
  assert.equal(g.rh.task.score, 1);
  const root = gradeImprov(plan, R, player(R, plan, (b) => [{ t: b.start, p: high(b.chord.rootPc) }]));
  assert.equal(root.rh.task.score, 0);
});

test('what is easy to miss: hands apart, swing ratio, drift', () => {
  const plan = fixed('pompa', 'penta');
  const R = improvRound(plan, { rng: rng(7) });
  // right hand 60 ms after the left on every beat, eighths in a 2:1 swing
  const swingy = player(R, plan, (b) => [0, 1, 2, 3].flatMap((q) => [{ t: b.start + q * R.beat + 0.06, p: high(0) }, { t: b.start + (q + 2 / 3) * R.beat, p: high(4) }]));
  const g = gradeImprov(plan, R, swingy);
  assert.ok(g.sync >= 55 && g.sync <= 65, String(g.sync));
  assert.ok(g.swing > 1.8 && g.swing < 2.2, String(g.swing));
  // a left hand that rushes 5 ms more every slot
  let k = 0;
  const rushing = lhSlots(R, plan).map((s) => ({ t: s.t - 0.005 * k++, p: low(s.pcs[0]) }));
  const d = gradeImprov(plan, R, rushing);
  assert.ok(d.drift < -10, String(d.drift));
});

test('clusters, and the left-hand demo plays the pattern below middle C', () => {
  const c = clusters([{ t: 1, p: 48 }, { t: 1.02, p: 52 }, { t: 1.5, p: 55 }]);
  assert.equal(c.length, 2);
  assert.deepEqual([...c[0].pcs].sort(), [0, 4]);
  const plan = fixed('umpa', 'jeden');
  const R = improvRound(plan, { rng: rng(1) });
  const ev = lhDemo(R, plan);
  const ons = ev.filter((e) => e.m[0] === 0x90);
  assert.ok(ons.every((e) => e.m[1] < SPLIT));
  assert.ok(ons.length >= 8 * 4);
});
