import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../web/js/mastery.js';
import * as F from '../web/js/feedback.js';
import * as S from '../web/js/suggest.js';
import { FN, fnOf } from '../web/js/colors.js';
import * as T from '../web/js/theory.js';
import { rng } from '../web/js/music.js';
import { chordObj, parseChord } from '../web/js/songs.js';

// --- powtórki -----------------------------------------------------------------------------------------------------
const lightsOffClean = (id, day) => M.recordPass(id, { way: 'tempo', done: 8, total: 8, tempo: 70, fadeUsed: 3, day });
function toUmiem(id, day) {
  M.recordPass(id, { way: 'wait', done: 8, total: 8, day });
  for (let f = 0; f < 3; f++) M.recordPass(id, { way: 'tempo', done: 8, total: 8, fadeUsed: f, day });
  for (let i = 0; i < 3; i++) lightsOffClean(id, day);
}

test('addDay / daysBetween cross months and years', () => {
  assert.equal(M.addDay('2026-01-31', 1), '2026-02-01');
  assert.equal(M.addDay('2026-12-31', 15), '2027-01-15');
  assert.equal(M.daysBetween('2026-02-27', '2026-03-02'), 3);
});

test('umiem schedules a review tomorrow; clean reviews walk 1, 2, 4, 7, 15, 30, 30', () => {
  const data = {}; M.bind(data);
  const id = 'major3|gama|dur|rh';
  toUmiem(id, '2026-03-01');
  let r = M.get(id);
  assert.equal(r.stage, 3);
  assert.equal(r.due, '2026-03-02');
  assert.equal(r.first, '2026-03-01');
  assert.deepEqual(M.dueReviews('2026-03-01'), []);
  assert.deepEqual(M.dueReviews('2026-03-02'), [id]);
  let day = '2026-03-02';
  const gaps = [];
  for (let k = 0; k < 6; k++) {
    const res = lightsOffClean(id, day);
    assert.equal(res.review.ok, true);
    gaps.push(res.review.days);
    day = M.get(id).due;
  }
  assert.deepEqual(gaps, [2, 4, 7, 15, 30, 30]);
  // a pass when nothing is due is not a review
  const res = lightsOffClean(id, M.addDay(day, -3));
  assert.equal(res.review, null);
});

test('a failed review drops to "w tempie", resets to 1 day; a clean one brings umiem back', () => {
  const data = {}; M.bind(data);
  const id = 'major0|prog|hymn';
  toUmiem(id, '2026-03-01');
  assert.equal(M.keySummary('major0|').known, 1);
  const fail = M.recordPass(id, { way: 'tempo', done: 6, total: 8, tempo: 70, fadeUsed: 3, day: '2026-03-02' });
  assert.equal(fail.review.ok, false);
  assert.equal(M.get(id).stage, 2);
  assert.equal(M.get(id).due, '2026-03-03');
  assert.equal(M.keySummary('major0|').known, 0);          // the arc on the wheel dims
  assert.deepEqual(M.dueReviews('2026-03-02'), []);          // not again the same day
  assert.deepEqual(M.dueReviews('2026-03-03'), [id]);
  // with lights on it is not a review
  assert.equal(M.recordPass(id, { way: 'tempo', done: 8, total: 8, fadeUsed: 1, day: '2026-03-03' }).review, null);
  // Bez świateł (dark), clean
  const ok = M.recordPass(id, { way: 'dark', done: 8, total: 8, clean: 8, fadeUsed: 3, day: '2026-03-03' });
  assert.equal(ok.review.ok, true);
  assert.equal(M.get(id).stage, 3);
  assert.equal(M.get(id).due, '2026-03-05');
  // a dark pass with a miss is a failed review
  const bad = M.recordPass(id, { way: 'dark', done: 8, total: 8, clean: 7, fadeUsed: 3, day: '2026-03-05' });
  assert.equal(bad.review.ok, false);
});

test('old "umiem" without a date is due the day after its last pass; extra fields survive', () => {
  const data = { mastery: { 'minor0|gama|moll|lh': { stage: 3, fade: 3, cleanRun: 3, best: 80, passes: 9, last: '2026-02-01' } } };
  M.bind(data);
  assert.deepEqual(M.dueReviews('2026-03-01'), ['minor0|gama|moll|lh']);
  M.recordPass('minor0|gama|moll|lh', { way: 'tempo', done: 15, total: 15, fadeUsed: 3, day: '2026-03-01' });
  const r = data.mastery['minor0|gama|moll|lh'];
  assert.equal(r.due, '2026-03-03');
  assert.equal(r.tail, 'c');
  assert.equal(r.passes, 10);
});

// --- informacja po próbie -----------------------------------------------------------------------------------------------
const scaleSteps = 'CDEFGABC'.split('').map((l, k) => ({ notes: [60 + k], label: l }));

test('timing: mean early, the step that rushes most, on-time count', () => {
  const hits = scaleSteps.map((s, k) => ({ k, note: s.notes[0], dt: k === 4 ? -0.09 : -0.02, vel: 70 }));
  const a = F.analyzePass({ hits, steps: scaleSteps });
  assert.equal(a.n, 8);
  assert.equal(a.meanMs, -29);
  assert.equal(a.onTime, 7);
  assert.equal(a.rush.k, 4);
  assert.equal(a.drag, null);
  assert.match(a.lines[0], /średnio na czas \(29 ms za wcześnie\)/);
  assert.ok(a.lines.some((l) => l.includes('krok 5 (G), 90 ms za wcześnie')));
  assert.ok(a.lines.some((l) => l === 'Dynamika: równa (±0).'));
});

test('timing: late overall, uneven dynamics names the loud run', () => {
  const vel = [70, 72, 68, 70, 100, 104, 102, 70];
  const hits = scaleSteps.map((s, k) => ({ k, note: s.notes[0], dt: 0.06, vel: vel[k] }));
  const a = F.analyzePass({ hits, steps: scaleSteps });
  assert.match(a.lines[0], /średnio 60 ms za późno/);
  assert.equal(a.dyn.even, false);
  assert.deepEqual([a.dyn.run.from, a.dyn.run.to, a.dyn.run.dir], [4, 6, 'louder']);
  assert.ok(a.lines.some((l) => /nierówna \(±\d+\): kroki 5–7 głośniej/.test(l)), a.lines.join(' | '));
});

test('bass vs chord: the bass comes after the chord', () => {
  const steps = [0, 1, 2, 3].map((k) => ({ notes: [43 + k, 60 + k, 64 + k, 67 + k], label: String(k + 1) }));
  const hits = [];
  steps.forEach((s, k) => {
    hits.push({ k, note: s.notes[0], dt: 0.035, vel: 60 });
    for (const n of s.notes.slice(1)) hits.push({ k, note: n, dt: 0.01, vel: 70 });
  });
  const a = F.analyzePass({ hits, steps });
  assert.equal(a.bass.ms, 25);
  assert.ok(a.lines.includes('Bas wchodzi średnio 25 ms po akordzie.'));
});

test('too few notes and empty passes do not divide by zero', () => {
  assert.equal(F.analyzePass({ hits: [], steps: scaleSteps }).lines.length, 1);
  assert.equal(F.analyzePass({ hits: [{ k: 0, note: 60, dt: 0.01, vel: 60 }], steps: scaleSteps }).n, 1);
  assert.equal(F.analyzePass({}).n, 0);
  const odd = F.analyzePass({ hits: [{ k: 9, note: 1, dt: NaN }, { k: 0, note: 60, dt: 0, vel: 50 }, { k: 1, note: 62, dt: 0, vel: 50 }, { k: 2, note: 64, dt: 0 }], steps: scaleSteps });
  assert.equal(odd.n, 3);
  assert.equal(odd.dyn, null);
});

test('challenges: chord tones share, third on each change, windows', () => {
  const c = T.degreeChord(T.keyAt(0, 'major'), 1, 0, 'maj');
  const g = T.degreeChord(T.keyAt(0, 'major'), 5, 0, 'maj');
  const steps = [c, g].map((ch) => ({ notes: [60], ct: ch.tones.map((t) => t.pc), third: F.thirdPc(ch), change: true }));
  assert.deepEqual(F.chordToneShare([{ k: 0, note: 64 }, { k: 0, note: 62 }, { k: 1, note: 71 }, { k: 1, note: 74 }], steps), { n: 4, ct: 3, pct: 75 });
  const log = [{ t: 10.2, note: 64 }, { t: 12.5, note: 67 }];
  assert.deepEqual(F.thirdOnChanges(log, steps, { times: [[10, 12], [12, 14]], idx: [0, 1], beat: 0.5 }), { n: 2, ok: 1 });
  assert.equal(F.challengeLine('third', { n: 8, ok: 7 }), 'Wyzwanie: 7 z 8 zmian z tercją.');
  assert.equal(F.thirdPc(T.chord(0, 0, 'power')), null);
  const w = new F.WindowTally();
  w.add({ start: 1, end: 2, pc: 4, lap: 0 }); w.add({ start: 3, end: 4, pc: null, lap: 1 });
  w.note(1.5, 4); w.note(3.5, 9);
  assert.equal(w.settle(2.5).length, 1);
  w.settle(5);
  assert.deepEqual(w.total, { n: 2, ok: 2 });
  assert.deepEqual(w.lap(1), { n: 1, ok: 1 });
});

// --- kostka i podpowiedzi ---------------------------------------------------------------------------------------------
test('items: parse, titles, prompts; gone cards are null', () => {
  const p = S.parseItem('major9|prog|iiVI');
  assert.equal(S.playPrompt(p), 'Zagraj 2m–5–1 w E♭-dur');
  assert.equal(S.itemTitle(S.parseItem('major9|gama|dur|lh')), 'gama E♭-dur lewą ręką');
  assert.equal(S.playPrompt(S.parseItem('minor0|gama|pentaMoll|rh')), 'Zagraj pentatonikę molową od A prawą ręką');
  assert.equal(S.itemTitle(S.parseItem('major0|gama|dorycka|both')), 'skala dorycka od C obiema rękami');
  assert.match(S.itemTitle(S.parseItem('major0|akordy|przewroty|43')), /^przewroty G w C-dur$/);
  assert.equal(S.parseItem('major0|prog|nieMa'), null);
  assert.equal(S.parseItem('major0|prog|andaluzyjska'), null);   // a minor progression under a major key
  assert.equal(S.parseItem('major12|gama|dur|rh'), null);
  assert.equal(S.parseItem('song|zzz|0|blok', { songs: [] }), null);
  const songs = [{ id: 's1', title: 'Moja', text: '[Zwrotka]\nC G Am F\n[Refren]\nF G C' }];
  assert.equal(S.itemTitle(S.parseItem('song|s1|1|blok', { songs })), '„Moja”, Refren');
  assert.equal(S.parseItem('song|s1|5|blok', { songs }), null);
  const o = S.openFor(S.parseItem('major9|akomp|walc|hymn'), { way: 'tempo', review: true });
  assert.deepEqual([o.view, o.preset.tab, o.preset.pattern, o.preset.prog, o.preset.key.acc, o.preset.review], ['kolo', 'akomp', 'walc', 'hymn', -1, 'major9|akomp|walc|hymn']);
});

test('dice with no progress starts near C, G or F; seeded and repeatable', () => {
  const a = S.pickDice({}, { rnd: rng(7) });
  assert.equal(a.kind, 'new');
  assert.ok(['major0|gama|dur|rh', 'major1|gama|dur|rh', 'major11|gama|dur|rh'].includes(a.id), a.id);
  assert.equal(S.pickDice({}, { rnd: rng(7) }).id, a.id);
  assert.match(a.why, /^Nowe: gama [CGF]-dur prawą ręką — /);
});

test('dice: weak / in progress / new next door, about 40/30/30', () => {
  const m = {
    'major9|gama|dur|lh': { stage: 2, fade: 1, cleanRun: 0, passes: 6, tail: 'ccxx', last: '2026-03-01' },
    'major0|prog|hymn': { stage: 2, fade: 2, cleanRun: 0, passes: 5, tail: 'cccc', last: '2026-03-01' },
    'major0|gama|dur|rh': { stage: 3, fade: 3, cleanRun: 3, passes: 9, tail: 'cccc', last: '2026-03-01' },
  };
  const count = { weak: 0, progress: 0, new: 0 };
  const r = rng(42);
  for (let i = 0; i < 1000; i++) count[S.pickDice(m, { rnd: r }).kind]++;
  assert.ok(count.weak > 330 && count.weak < 470, JSON.stringify(count));
  assert.ok(count.progress > 230 && count.progress < 370, JSON.stringify(count));
  assert.ok(count.new > 230 && count.new < 370, JSON.stringify(count));
  const w = S.pickDice(m, { rnd: () => 0.01 });
  assert.equal(w.why, 'Słabe miejsce: gama E♭-dur lewą ręką — 2 ostatnie przejścia się sypały.');
  assert.deepEqual([w.open.view, w.open.preset.tab, w.open.preset.hand, w.open.preset.way], ['kolo', 'gama', 'lh', 'tempo']);
  const fresh = S.diceCandidates(m).fresh.map((x) => x.id);
  assert.ok(fresh.includes('major1|gama|dur|rh') && fresh.includes('major11|prog|hymn'), fresh.join(' '));
  assert.ok(!fresh.includes('major0|gama|dur|rh'));
  // only one weak item and it is excluded: it still comes (no other choice in that group)
  assert.equal(S.pickDice(m, { rnd: () => 0.01, exclude: 'major9|gama|dur|lh' }).id, 'major9|gama|dur|lh');
});

test('hints: due count, ready for Bez świateł, flats not played for a week', () => {
  const m = {
    'major1|gama|dur|rh': { stage: 2, fade: 2, passes: 6, last: '2026-03-10' },
    'major2|prog|hymn': { stage: 3, fade: 3, passes: 9, last: '2026-03-09', due: '2026-03-10' },
    'major10|gama|dur|rh': { stage: 1, passes: 2, last: '2026-03-01' },
    'minor0|gama|moll|rh': { stage: 1, passes: 2, last: '2026-03-10' },
  };
  const h = S.hints(m, { today: '2026-03-10' });
  const texts = h.map((x) => x.text);
  assert.ok(texts.includes('Do powtórki dziś: 1 rzecz.'), texts.join(' | '));
  assert.ok(texts.includes('Ta gama jest gotowa na „Bez świateł”: gama G-dur prawą ręką.'));
  assert.ok(texts.includes('Dawno nie grałeś tonacji z bemolami (ostatnio 9 dni temu).'));
  assert.deepEqual(S.hints({}, { today: '2026-03-10' }), []);
  const list = S.reviewList(m, { today: '2026-03-10' });
  assert.deepEqual(list.map((x) => x.prompt), ['Zagraj 1–5–6m–4 w D-dur']);
});

test('first new thing today and the review walk', () => {
  const m = {
    a: { stage: 1, first: '2026-03-10', firstTs: 50 },
    'major0|gama|dur|lh': { stage: 1, first: '2026-03-10', firstTs: 200 },
    'major0|prog|hymn': { stage: 1, first: '2026-03-10', firstTs: 100 },
    'major0|gama|dur|rh': { stage: 2, first: '2026-03-09', firstTs: 10 },
  };
  assert.equal(S.firstNewToday(m, { today: '2026-03-10' }).title, 'progresja „Pop-hymn” w C-dur');
  assert.equal(S.firstNewToday(m, { today: '2026-03-11' }), null);
  assert.equal(S.startWalk(['x', 'y']), 'x');
  S.walkResult('x', true);
  assert.equal(S.walkNext(), 'y');
  S.walkResult('x', false);   // not the current one: ignored
  assert.equal(S.walkNext(), null);
  assert.deepEqual(S.walkSummary(), { done: 1, ok: 1, total: 2 });
});

// --- stałe kolory funkcji -------------------------------------------------------------------------------------------------
test('function of every family chord in all 24 keys; borrowed chords are neutral', () => {
  for (const k of T.ALL_KEYS) {
    const want = k.mode === 'major' ? ['T', 'S', 'T', 'S', 'D', 'T', 'D'] : ['T', 'S', 'T', 'S', 'D', 'T', 'D'];
    assert.deepEqual(T.family(k).map((c) => fnOf(k, c)), want, T.keyName(k));
    assert.deepEqual(T.family(k, true).map((c) => fnOf(k, c)), want, T.keyName(k) + ' 7');
  }
  const C = T.keyAt(0, 'major'), a = T.keyAt(0, 'minor');
  assert.equal(fnOf(C, T.degreeChord(C, 7, -1, 'maj')), 'X');    // ♭7 borrowed
  assert.equal(fnOf(C, T.degreeChord(C, 4, 0, 'min')), 'X');     // 4m borrowed
  assert.equal(fnOf(C, T.degreeChord(C, 2, 0, 'maj')), 'X');     // secondary dominant
  assert.equal(fnOf(a, T.degreeChord(a, 5, 0, 'min')), 'D');     // natural minor v
  assert.equal(fnOf(a, T.degreeChord(a, 7, 0, 'dim')), 'D');     // G♯°
  assert.equal(fnOf(C, chordObj(parseChord('G7/B'))), 'D');
  assert.equal(fnOf(C, chordObj(parseChord('Fsus2'))), 'S');
  assert.equal(fnOf(C, null), 'X');
});

test('function colours: CSS variables match, distinct and readable on the dark panel', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const [f, v] of Object.entries(FN)) {
    const m = new RegExp(`--fn-${f.toLowerCase()}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
    assert.ok(m, `--fn-${f.toLowerCase()} in style.css`);
    assert.equal(m[1].toLowerCase(), v.hex);
    assert.ok(contrast(v.hex, '#241f3d') >= 4.5, `${f} contrast`);
  }
  // T, S, D differ in lightness too (not only in hue): at least 0.08 relative luminance apart pairwise
  const L = ['T', 'S', 'D'].map((f) => lum(FN[f].hex));
  assert.ok(Math.abs(L[0] - L[1]) > 0.08 && Math.abs(L[1] - L[2]) > 0.08, L.join(' '));
});

test('Pytanie–odpowiedź: the piano is silent in your 2 bars, bars counted across laps', async () => {
  const G = await import('../web/js/grooves.js');
  const key = T.keyAt(0, 'major');
  const prog = T.PROGRESSIONS.find((p) => p.id === 'hymn');
  const pianoOnBars = (cyc) => [...new Set(cyc.events.filter((e) => e.m[0] === 0x90 && e.m[1] !== 96).map((e) => Math.floor(e.t / cyc.tm.bar + 1e-6)))];
  const solo = G.jamCycle({ key, prog, groove: 'pop', tempo: 100, role: 'solo', band: true, callResponse: true });
  assert.equal(solo.bars, 4);
  assert.deepEqual(pianoOnBars(solo), [0, 1]);
  const plain = G.jamCycle({ key, prog, groove: 'pop', tempo: 100, role: 'solo', band: true });
  assert.deepEqual(pianoOnBars(plain), [0, 1, 2, 3]);
  // you play chords: the trainer's piano asks in the band's bars, the bass keeps going (channel 2)
  const ak = G.jamCycle({ key, prog, groove: 'pop', tempo: 100, role: 'akordy', band: true, callResponse: true, barOffset: 2 });
  assert.deepEqual(pianoOnBars(ak), [2, 3]);
  assert.ok(ak.events.some((e) => e.m[0] === 0x91 && Math.floor(e.t / ak.tm.bar) === 0));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(G.answerBar), [false, false, true, true, false, false, true, true]);
});

test('"first" is set only on the very first pass, not on old records', () => {
  const data = { mastery: { old: { stage: 2, fade: 1, cleanRun: 0, best: 0, passes: 5, last: '2026-03-01' } } };
  M.bind(data);
  M.recordPass('old', { way: 'wait', done: 4, total: 4, day: '2026-03-10' });
  M.recordPass('new', { way: 'wait', done: 4, total: 4, day: '2026-03-10', ts: 99 });
  assert.equal(data.mastery.old.first, undefined);
  assert.equal(data.mastery.new.first, '2026-03-10');
  assert.equal(data.mastery.new.firstTs, 99);
});
