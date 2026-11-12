import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../web/js/fingers.js';
import * as T from '../web/js/theory.js';

const C = T.keyAt(0, 'major');
const am = T.keyAt(0, 'minor');

test('five-finger position: one key per finger, LH little finger on the tonic', () => {
  const p = F.position(C);
  assert.deepEqual(Object.values(p.rh), [60, 62, 64, 65, 67]);
  assert.deepEqual([1, 2, 3, 4, 5].map((f) => p.lh[f]), [55, 53, 52, 50, 48]);
  const pm = F.position(am);
  assert.deepEqual(Object.values(pm.rh), [57, 59, 60, 62, 64]);
});

test('pattern steps per hand mode', () => {
  const up = F.FIVE_PATTERNS[0].seq;
  const rh = F.positionSteps(C, up, 'rh');
  assert.deepEqual(rh.map((s) => s.notes[0]), [60, 62, 64, 65, 67, 65, 64, 62, 60]);
  const lh = F.positionSteps(C, up, 'lh');
  assert.deepEqual(lh.map((s) => s.notes[0]), [55, 53, 52, 50, 48, 50, 52, 53, 55]);
  const par = F.positionSteps(C, [1, 5], 'par');
  assert.deepEqual(par[0].fingers.map((p) => `${p.hand}${p.finger}:${p.note}`), ['rh1:60', 'lh5:48']);
  const mir = F.positionSteps(C, [2], 'mirror');
  assert.deepEqual(mir[0].fingers.map((p) => `${p.hand}${p.finger}:${p.note}`), ['rh2:62', 'lh2:53']);
  assert.equal(par[0].label, 'P1 L5');
});

test('calls never repeat a finger and never show the note', () => {
  let x = 7;
  const rand = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const s = F.callSteps(C, 'both', 30, rand);
  for (let i = 1; i < s.length; i++) {
    assert.notEqual(s[i].fingers[0].finger, s[i - 1].fingers[0].finger);
    assert.notEqual(s[i].fingers[1].finger, s[i - 1].fingers[1].finger);
  }
  assert.ok(s.every((st) => st.sub === '' && /^P\d \+ L\d$/.test(st.label)));
});

test('scale fingering over two octaves (school fingerings)', () => {
  const rh = F.scaleRun(C, 'dur', 'rh', 2, 48);
  assert.equal(rh.fingers.join(''), '123123412312345');
  const lh = F.scaleRun(C, 'dur', 'lh', 2, 36);
  assert.equal(lh.fingers.join(''), '543213214321321');
  assert.equal(lh.notes[0], 36);
  assert.equal(lh.notes[14], 60);
  const f = T.keyAt(11, 'major');   // F
  assert.equal(T.keyName(f), 'F');
  assert.equal(F.scaleRun(f, 'dur', 'rh', 2, 53).fingers.join(''), '123412312341234');
  const bb = T.keyAt(10, 'major');
  assert.equal(F.scaleRun(bb, 'dur', 'lh', 2, 46).fingers.join(''), '321432132143213');
  assert.equal(F.scaleRun(C, 'lidyjska', 'rh', 1, 60), null);
});

test('crossings', () => {
  assert.equal(F.isCrossing('rh', true, 3, 1), true);
  assert.equal(F.isCrossing('rh', true, 1, 2), false);
  assert.equal(F.isCrossing('rh', false, 1, 3), true);
  assert.equal(F.isCrossing('lh', true, 1, 3), true);
  assert.equal(F.isCrossing('lh', false, 3, 1), true);
  const steps = F.scaleSteps(C, 'dur', 'rh', 1);
  const crossed = steps.map((s, j) => (s.cross.length ? j : -1)).filter((j) => j >= 0);
  // up: E→F (into step 3); down: F→E (into step 12)
  assert.deepEqual(crossed, [3, 12]);
});

test('scale motions: parallel and contrary', () => {
  const par = F.scaleSteps(C, 'dur', 'par', 1);
  assert.equal(par.length, 15);
  assert.deepEqual(par[0].notes.sort(), [48, 60].sort());
  assert.equal(par[0].sub, 'P① L⑤');
  const con = F.scaleSteps(C, 'dur', 'contra', 1);
  assert.deepEqual(con[0].notes, [60]);            // both thumbs on the same C
  assert.deepEqual(con[7].notes.sort((a, b) => a - b), [48, 72]);
  assert.equal(con[1].sub, 'P② L②');                // mirror: the same fingers
  assert.deepEqual(con[3].cross.sort(), ['lh', 'rh']);
  const two = F.scaleSteps(C, 'dur', 'contra', 2);
  assert.equal(two.length, 29);
  const lo = Math.min(...two.flatMap((s) => s.notes)), hi = Math.max(...two.flatMap((s) => s.notes));
  assert.equal(hi - lo, 48);
  for (const k of T.ALL_KEYS) for (const m of ['rh', 'lh', 'par', 'contra']) for (const o of [1, 2]) {
    const st = F.scaleSteps(k, k.mode === 'major' ? 'dur' : 'moll', m, o);
    assert.ok(st && st.length === 14 * o + 1, `${T.keyName(k)} ${m} ${o}`);
    const ns = st.flatMap((s) => s.notes);
    assert.ok(Math.min(...ns) >= 21 && Math.max(...ns) <= 108);
  }
});

test('thumb drills: first octave and the junction', () => {
  const rh = F.thumbDrills(C, 'dur', 'rh');
  assert.deepEqual(rh.map((d) => d.name), ['E→F (3→1)', 'H→C (4→1), granica oktaw'.replace('H', 'B')]);
  const lh = F.thumbDrills(C, 'dur', 'lh');
  assert.equal(lh.length, 2);
  assert.ok(rh[0].steps.some((s) => s.cross.length));
});

test('finger stats: weak and late finger', () => {
  const fingerOf = (n) => ({ 60: { hand: 'rh', finger: 1 }, 62: { hand: 'rh', finger: 2 }, 64: { hand: 'rh', finger: 3 }, 65: { hand: 'rh', finger: 4 } }[n] || null);
  const notes = [];
  let t = 0;
  for (let r = 0; r < 4; r++) for (const [n, v, late] of [[60, 80, 0], [62, 78, 0], [64, 82, 0], [65, 50, 0.05]]) { t += 0.25 + late; notes.push({ note: n, vel: v, t }); }
  const s = F.fingerStats(notes, fingerOf);
  assert.equal(s.weakest.finger, 4);
  assert.equal(s.latest.finger, 4);
  assert.ok(s.latest.lateMs > 30);
  assert.ok(s.spread >= 28);
});

test('crossing stats: a hole before the thumb', () => {
  const steps = F.scaleSteps(C, 'dur', 'rh', 1);
  const notes = [];
  let t = 0;
  steps.forEach((s) => { t += s.cross.length ? 0.5 : 0.3; notes.push({ note: s.notes[0], t }); });
  const r = F.crossingStats(notes, steps, 'rh');
  assert.ok(r.ratio > 1.5, JSON.stringify(r));
});

test('palce items join the reviews: parse, title, prompt, how to open', async () => {
  const S = await import('../web/js/suggest.js');
  const i = S.parseItem('palce|gamy|major2|contra|2');
  assert.equal(i.kind, 'palce');
  assert.equal(S.playPrompt(i), 'Zagraj gamę D-dur w ruchu przeciwnym, 2 oktawy');
  const o = S.openFor(i, { way: 'dark', review: true });
  assert.equal(o.view, 'palce');
  assert.deepEqual([o.preset.ex, o.preset.motion, o.preset.octaves, o.preset.way, o.preset.review], ['gamy', 'contra', 2, 'dark', 'palce|gamy|major2|contra|2']);
  assert.match(S.itemTitle(S.parseItem('palce|kciuk|major0|rh|0')), /przełożenie kciuka/);
  assert.equal(S.parseItem('palce|gamy|major0|xx|1'), null);
  assert.equal(S.parseItem('palce|kciuk|major0|rh|99'), null);
  const list = S.reviewList({ 'palce|piec|major0|gora|rh': { stage: 3, fade: 3, passes: 9, last: '2026-11-01', due: '2026-11-08' } }, { today: '2026-11-09' });
  assert.equal(list.length, 1);
  assert.match(list[0].prompt, /pięć palców/);
});
