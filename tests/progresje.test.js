// 1.18–1.21: the Progresje tab — one catalogue, lenses, moves, recipes, cells, games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_KEYS, PROGRESSIONS, SCALES, SCALE_GROUPS } from '../web/js/theory.js';
import { BANK } from '../web/js/progbank.js';
import { CATALOG, BY_ID, progFor, parseNumeral, parseNumerals, signature, filterCatalog, chordsIn, keyFor, withBars, findInSteps, barsOf } from '../web/js/progs.js';
import { NEW_PROGRESSIONS, FAMILY_INFO } from '../web/js/progs-data.js';
import { analyze, undress, topLayer, motion, motions, plr, plrPath, gridWindow, triadPcs, nodePc, replacements, applyReplacement, borrowedFrom, wayPlan, WAYS_TO_PLAY, bassLine, commonTones } from '../web/js/lenses.js';
import { MOVES, MOVE_BY_ID, applyMove, demoOf, movesFor, placesFor } from '../web/js/moves.js';
import { RECIPES, runRecipe, pick } from '../web/js/recipes.js';
import { CELLS, cellsInSteps, collect, review, dueCells, cellStage } from '../web/js/cells.js';
import * as G from '../web/js/prgames.js';
import { stepChord } from '../web/js/chords.js';

const C = ALL_KEYS.find((k) => k.mode === 'major' && k.tonicPc === 0);
const a = ALL_KEYS.find((k) => k.mode === 'minor' && k.tonicPc === 9);
const keyOf = (mode) => (mode === 'minor' ? a : C);
const names = (key, steps) => chordsIn(key, steps).map((x) => x.chord.name + (x.bars !== 1 ? `*${x.bars}` : '')).join(' ');
const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

test('numerals: qualities, accidentals, slash bass, length', () => {
  assert.deepEqual(parseNumeral('V7'), { k: 'chord', d: 5, a: 0, q: 'dom7', bars: 1 });
  assert.deepEqual(parseNumeral('bVII'), { k: 'chord', d: 7, a: -1, q: 'maj', bars: 1 });
  assert.equal(parseNumeral('iiø7').q, 'm7b5');
  assert.equal(parseNumeral('#iv°7').a, 1);
  assert.equal(parseNumeral('V/7').bass, 4);        // B under G: 4 semitones above the root
  assert.equal(parseNumeral('iv/b6').bass, 3);      // F under Dm (in a: Dm/F)
  assert.equal(parseNumeral('IVmaj7*2').bars, 2);
  assert.equal(parseNumeral('ii9').q, 'm9');
  assert.equal(parseNumeral('V13').q, 'dom13');
  assert.throws(() => parseNumeral('X'));
  assert.throws(() => parseNumeral('Vø7'));
  assert.equal(names(C, parseNumerals('I V/7 vi IV')), 'C G/B Am F');
  assert.equal(names(a, parseNumerals('i V/7 i/b7 IV/6 iv/b6 V')), 'Am E/G♯ Am/G D/F♯ Dm/F E');
});

test('one catalogue: every Koło progression and every bank progression has a place, ids are unique', () => {
  const ids = CATALOG.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PROGRESSIONS) assert.ok(progFor(p.id), p.id);
  for (const b of BANK) assert.ok(progFor(b.id), b.id);
  for (const [id] of NEW_PROGRESSIONS) assert.ok(BY_ID[id], id);
  assert.ok(CATALOG.length >= 100, `${CATALOG.length}`);
  // the Koło's pop-hymn and the bank's "Oś popu" are one entry
  assert.equal(progFor('axis').id, 'hymn');
  assert.equal(BY_ID.hymn.bankId, 'axis');
  for (const p of CATALOG) {
    assert.ok(FAMILY_INFO[p.fam], `${p.id} family ${p.fam}`);
    assert.ok(p.tier >= 1 && p.tier <= 8, p.id);
    assert.ok(['major', 'minor'].includes(p.mode), p.id);
    assert.ok(p.why && p.why.length > 20, `${p.id} has a why`);
    assert.ok(p.groove && p.tempo > 40, p.id);
    assert.ok(chordsIn(keyOf(p.mode), p.steps).length >= 1, p.id);
  }
  // minor ones have a minor tonic chord
  assert.equal(BY_ID.sunshine.mode, 'minor');
  assert.equal(BY_ID.andaluzE.mode, 'major');
  assert.equal(names(a, BY_ID.romans.steps), 'Am Dm G C F Dm E7 Am');
});

test('catalogue tools: filter, key, lengths, finding progressions in steps', () => {
  const pop = filterCatalog({ fam: 'pop', maxTier: 1 });
  assert.ok(pop.length >= 4 && pop.every((p) => p.fam === 'pop' && p.tier <= 1));
  assert.ok(filterCatalog({ text: 'hallelujah' }).some((p) => p.id === 'hallelujah'));
  assert.equal(keyFor(BY_ID.sunshine, C).mode, 'minor');
  assert.equal(keyFor(BY_ID.sunshine, C).tonicPc, 0);
  assert.equal(barsOf(parseNumerals('I*2 V*0.5 vi')), 3.5);
  assert.deepEqual(withBars([[1, 0, 'maj']]).map((s) => s.bars), [1]);
  const found = findInSteps(parseNumerals('vi IV I V'), 'major').map((p) => p.id);
  assert.ok(found.includes('hymn'), found.join(','));      // the same loop from another chord
  assert.equal(signature(parseNumerals('I I V')), '0:M|7:M');
});

test('new scales: miksolidyjska ♭6 and ♭2 in their own group', () => {
  assert.deepEqual(SCALES.mixoB6.deg.map(([d, x]) => `${d}${x}`), ['10', '20', '30', '40', '50', '6-1', '7-1']);
  assert.deepEqual(SCALES.mixoB2.deg.map(([d, x]) => `${d}${x}`), ['10', '2-1', '30', '40', '50', '60', '7-1']);
  assert.ok(SCALE_GROUPS.find((g) => g.id === 'kolory').list.some(([x]) => x === 'mixoB6'));
});

test('szkielet: layers, function, undressing to the skeleton', () => {
  const g = BY_ID.gospelTurn;
  const lay = analyze(C, g.steps).map((x) => x.layer);
  assert.deepEqual(lay, [0, 0, 0, 2, 0, 2, 1, 0]);
  assert.equal(topLayer(C, g.steps), 2);
  assert.equal(names(C, undress(C, g.steps, 0)), 'C*2 F*2 C*2 F G');
  const mx = BY_ID.mixture;
  assert.deepEqual(analyze(C, mx.steps).map((x) => x.layer), [0, 3, 3, 0, 3, 0]);
  assert.equal(names(C, undress(C, mx.steps, 0)), 'C*2 F*3 C');
  // undressing never changes the length
  for (const p of CATALOG.slice(0, 40)) for (let n = 0; n <= 4; n++) assert.equal(barsOf(undress(keyOf(p.mode), p.steps, n)), barsOf(withBars(p.steps)), `${p.id} ${n}`);
});

test('borrowed chords are named as a teacher would', () => {
  const src = (d, x, q) => borrowedFrom(C, stepChord(C, { k: 'chord', d, a: x, q }));
  assert.equal(src(7, -1, 'maj'), 'miksolidyjskiej');
  assert.equal(src(6, -1, 'maj'), 'molowej (eolskiej)');
  assert.equal(src(4, 0, 'min'), 'molowej (eolskiej)');
  assert.equal(src(2, -1, 'maj'), 'frygijskiej');
  assert.equal(src(2, 0, 'maj'), 'lidyjskiej');
  assert.equal(borrowedFrom(a, stepChord(a, { k: 'chord', d: 4, a: 0, q: 'maj' })), 'doryckiej');
});

test('bas: kinds of root moves', () => {
  const m = motions(C, BY_ID.hymn.steps).map((x) => x.kind);
  assert.deepEqual(m, ['wstecz', 'krok', 'miekki', 'wstecz']);
  assert.deepEqual(motions(C, BY_ID.iiVI.steps).map((x) => x.kind).slice(0, 2), ['mocny', 'mocny']);
  const ch = (rn) => chordsIn(C, parseNumerals(rn)).map((x) => x.chord);
  const [c, ab] = ch('I bVI');
  assert.equal(motion(c, ab), 'filmowy');
  const [c2, cm] = ch('I i');
  assert.equal(motion(c2, cm), 'stoi');
  const line = bassLine(C, BY_ID.someone.steps).map((x) => x.name);
  assert.deepEqual(line, ['C', 'B', 'A', 'F'].map((x) => x.replace('B', 'H')).map((x) => (x === 'H' ? line[1] : x)));
});

test('siatka: P, L, R keep two notes; compositions are the chromatic mediants', () => {
  for (const id of ['0M', '9m', '5M', '4m']) for (const nb of Object.values(plr(id))) assert.equal(triadPcs(id).filter((x) => triadPcs(nb).includes(x)).length, 2, `${id} → ${nb}`);
  assert.deepEqual(plr('0M'), { P: '0m', R: '9m', L: '4m' });
  assert.deepEqual(plrPath('0M', '8M').map((x) => x.move), ['P', 'L']);       // C → A♭
  assert.deepEqual(plrPath('0M', '4M').map((x) => x.move), ['L', 'P']);       // C → E
  assert.deepEqual(plrPath('0M', '9M').map((x) => x.move).sort(), ['P', 'R']);  // C → A
  assert.equal(plrPath('0M', '0M').length, 0);
  const w = gridWindow(0);
  assert.ok(w.length >= 80);
  for (const t of w) assert.deepEqual(t.pts.map(([i, j]) => nodePc(i, j)).sort((x, y) => x - y), triadPcs(t.id).slice().sort((x, y) => x - y), t.id);
});

test('Zamień / Pożycz: groups for one chord, insert takes half', () => {
  const g = replacements(C, { k: 'chord', d: 4, a: 0, q: 'maj', bars: 1 });
  const by = Object.fromEntries(g.map((x) => [x.id, x.items.map((i) => i.name)]));
  assert.deepEqual(by.funkcja, ['Dm']);
  assert.deepEqual(by.palec, ['Fm', 'Dm', 'Am']);
  assert.ok(by.mody.includes('Fm'));
  assert.deepEqual(by.medianty.sort(), ['A', 'A♭', 'D', 'D♭']);
  assert.ok(by.przed.includes('C7') && by.przed.includes('E°7'));
  assert.ok(by.barwa.includes('Fmaj7'));
  for (const grp of g) for (const it of grp.items) assert.notEqual(it.name, 'F');
  const steps = withBars(parseNumerals('I IV V I'));
  const ins = applyReplacement(steps, 1, g.find((x) => x.id === 'przed').items[0]);
  assert.equal(names(C, ins), 'C C7*0.5 F*0.5 G C');
  const rep = applyReplacement(steps, 1, g.find((x) => x.id === 'palec').items[0]);
  assert.equal(names(C, rep), 'C Fm G C');
});

test('ways to play: every way gives notes for every chord, left hand low, right hand high', () => {
  for (const w of WAYS_TO_PLAY) {
    const plan = wayPlan(C, BY_ID.iiVI.steps, w.id, { color: 'sevenths' });
    assert.equal(plan.length, 4, w.id);
    for (const x of plan) {
      assert.ok(x.lh.length + x.rh.length >= 2, `${w.id} ${x.chord.name}`);
      assert.ok(x.lh.every((n) => n < 64), `${w.id} lh ${x.lh}`);
      assert.ok(x.rh.every((n) => n >= 55), `${w.id} rh ${x.rh}`);
    }
  }
  const shell = wayPlan(C, BY_ID.iiVI.steps, 'shell', { color: 'sevenths' })[0];
  assert.deepEqual(shell.lh.map((n) => n % 12), [2, 0]);   // Dm7: D and C
});

test('every move works on its own demo and keeps the length', () => {
  const expect = {
    krewny: 'Am F G C', pozyczka: 'C Am Fm G', tryton: 'Dm7 D♭7 Cmaj7 Cmaj7', gospelV: 'C Am Dm F/G', dominanta: 'C*0.5 E7*0.5 Am F G',
    zmniejszony: 'C*0.5 C♯°7*0.5 Dm G C', neapol: 'Am Dm*0.5 B♭/D*0.5 E Am', mario: 'C F A♭*0.5 B♭*0.5 C', basKrokiem: 'C G/B Am F/A',
    pedal: 'C F/C G/C C', zwodnicza: 'C F G Am', pikardyjska: 'Am Dm E A', septymy: 'Cmaj7 Am7 Dm7 G7', molowaS: 'C Am F*0.5 Fm*0.5 C',
    linia: 'Am*0.5 Am(maj7)*0.5 Am7*0.5 Am6*0.5 Dm*2', tylne: 'Dm7 Fm7*0.5 B♭7*0.5 Cmaj7 Cmaj7',
  };
  assert.equal(MOVES.length, 27);
  for (const m of MOVES) {
    const d = demoOf(m);
    const k = keyOf(d.mode);
    const after = applyMove(m.id, d.steps, k, d.at);
    assert.ok(after, `${m.id} applies to its demo`);
    assert.notEqual(names(k, after), names(k, d.steps), `${m.id} changes something`);
    if (!['amen', 'polTonu'].includes(m.id)) assert.equal(barsOf(after), barsOf(withBars(d.steps)), `${m.id} keeps the length`);
    if (expect[m.id]) assert.equal(names(k, after), expect[m.id], m.id);
    for (const f of ['say', 'rule', 'play', 'hear']) assert.ok(m[f] && m[f].length > 10, `${m.id}.${f}`);
  }
  assert.equal(names(C, applyMove('basKrokiem', BY_ID.kanon.steps, C)), 'C G/B Am Em/G F C/E F G');   // Pachelbel's bass
  assert.equal(applyMove('molowaS', parseNumerals('I V'), C, 1), null);    // not on a 5
  assert.ok(movesFor(BY_ID.hymn.steps, C, 1).some((m) => m.id === 'krewny'));
  assert.deepEqual(placesFor('septymy', BY_ID.hymn.steps, C), [null]);
});

test('recipes: every step is done, the result says something new', () => {
  assert.ok(RECIPES.length >= 10);
  for (const r of RECIPES) {
    const k = keyOf(r.mode);
    const stages = runRecipe(r, k);
    assert.equal(stages.length, r.steps.length + 1, `${r.id}: ${stages.length - 1} of ${r.steps.length}`);
    for (const s of stages) assert.ok(s.say && s.steps.length, r.id);
  }
  const g = runRecipe(RECIPES.find((x) => x.id === 'gospel'), C);
  assert.equal(names(C, g[g.length - 1].steps), 'C F*0.5 F♯°7*0.5 C/G*0.5 D7*0.5 F/G F*0.5 Fm*0.5 C*2');
  assert.equal(pick(parseNumerals('I IV V I'), { deg: [5, 0] }), 2);
  assert.equal(pick(parseNumerals('I IV V I'), { last: true }), 3);
});

test('cells: each is found in its demo; the album reviews', () => {
  for (const c of CELLS) {
    const k = keyOf(c.demo.mode);
    assert.ok(cellsInSteps(k, c.demo.steps).some((x) => x.cell.id === c.id), c.id);
  }
  const f = cellsInSteps(C, BY_ID.gospelTurn.steps).map((x) => x.cell.id);
  assert.ok(f.includes('zmniejszony') && f.includes('iiVI'), f.join(','));
  const album = {};
  collect(album, 'iiVI', '2026-11-24');
  assert.equal(album.iiVI.due, '2026-11-25');
  assert.deepEqual(dueCells(album, '2026-11-24'), []);
  assert.deepEqual(dueCells(album, '2026-11-25'), ['iiVI']);
  review(album, 'iiVI', true, '2026-11-25');
  assert.equal(album.iiVI.box, 1);
  assert.equal(album.iiVI.due, '2026-11-27');
  review(album, 'iiVI', false, '2026-11-27');
  assert.equal(album.iiVI.box, 0);
  assert.equal(cellStage(album.iiVI), 1);
});

test('games: plans by level and fair grading', () => {
  const r = seeded();
  for (let L = 1; L <= 12; L++) {
    const b = G.slyszBasPlan(L, r);
    assert.equal(b.bass.length, b.chords.length);
    assert.equal(G.slyszBasGrade(b, b.bass.map((x) => x + 36)).score, 100);
    const c = G.coToPlan(L, r);
    assert.ok(c.options.includes(c.answer) && new Set(c.options.map((o) => o.id)).size === c.options.length);
    assert.equal(G.coToGrade(c, c.answer.id).score, 100);
    assert.equal(G.coToGrade(c, 'nic').score, 0);
    const f = G.funkcjaPlan(L, r);
    assert.equal(G.funkcjaGrade(f, f.fn).score, 100);
    const p = G.palecPlan(L, r);
    assert.ok(p.best.length >= 1);
  }
  const p = { ...G.palecPlan(1, seeded(3)) };
  p.from = '0M'; p.to = '8M'; p.best = plrPath('0M', '8M'); p.moves = [];
  assert.equal(G.palecStep(p, [60, 63, 67]).move, 'P');          // C → Cm
  assert.equal(G.palecStep(p, [60, 63, 68]).done, true);         // Cm → A♭
  assert.equal(G.palecGrade(p).score, 100);
  const bad = { from: '0M', to: '8M', best: plrPath('0M', '8M'), moves: [] };
  assert.equal(G.palecStep(bad, [62, 66, 69]).ok, false);         // C → D: two fingers move
  const n = { ...G.nutaPlan(1, seeded(1)), pc: 0, found: [] };
  assert.equal(G.nutaStep(n, [57, 64, 72]).ok, true);   // Am with C on top
  assert.equal(G.nutaStep(n, [57, 64, 72]).again, true);
  assert.equal(G.nutaStep(n, [55, 59, 62]).ok, false);  // G has no C
  assert.ok(G.MOD_STEPS.every((s) => SCALES[s.from] && SCALES[s.to]));
  const b = G.slyszBasPlan(1, seeded(5));
  assert.match(G.slyszBasGrade(b, b.bass.map(() => null)).tip, /nie było basu/);
});

test('commonTones counts shared pitch classes', () => {
  const [c, am, ab] = chordsIn(C, parseNumerals('I vi bVI')).map((x) => x.chord);
  assert.equal(commonTones(c, am), 2);
  assert.equal(commonTones(c, ab), 1);
});
