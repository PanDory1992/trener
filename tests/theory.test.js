import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../web/js/theory.js';
import * as G from '../web/js/grooves.js';
import { prefs } from '../web/js/music.js';

test('all 24 keys: seven letters, correct pitch classes, family qualities', () => {
  for (const k of T.ALL_KEYS) {
    for (const sc of k.mode === 'major' ? ['dur', 'miksolidyjska'] : ['moll', 'harm', 'dorycka']) {
      const n = T.scaleNotes(k, sc);
      assert.equal(n.length, 8);
      assert.equal(new Set(n.slice(0, 7).map((x) => x.name[0])).size, 7, `${T.keyName(k)} ${sc}`);
      const steps = T.SCALES[sc].deg.map(([d, a]) => [0, 2, 4, 5, 7, 9, 11][d - 1] + a);
      n.slice(0, 7).forEach((x, i) => assert.equal((x.midi - n[0].midi + 120) % 12, steps[i] % 12));
      for (let i = 1; i < 8; i++) assert.ok(n[i].midi > n[i - 1].midi);
    }
    const fam = T.family(k);
    assert.equal(fam.length, 7);
    for (const c of fam) assert.equal(new Set(c.tones.map((t) => t.name[0])).size, 3, c.name);
  }
});

test('spelling examples', () => {
  const Db = T.keyAt(7, 'major');
  assert.equal(T.scaleNotes(Db, 'dur').map((x) => x.name).join(' '), 'D♭ E♭ F G♭ A♭ B♭ C D♭');
  const gis = T.keyAt(5, 'minor');
  assert.equal(T.scaleNotes(gis, 'harm')[6].name, 'F𝄪');
  const Bb = T.keyAt(10, 'major');
  assert.deepEqual(T.progressionChords(Bb, T.PROGRESSIONS.find((p) => p.id === 'iiVI')).map((c) => c.name), ['Cm7', 'F7', 'B♭maj7', 'B♭maj7']);
  assert.deepEqual(T.chord(2, 4, 'maj').tones.map((t) => t.name), ['E', 'G♯', 'B']);
  prefs.hNames = true;
  assert.equal(T.keyName(T.keyAt(10, 'major'), true), 'B-dur');
  assert.equal(T.keyName(T.keyAt(5, 'major'), true), 'H-dur');
  prefs.hNames = false;
});

test('minor family uses a major V', () => {
  const am = T.keyAt(0, 'minor');
  assert.deepEqual(T.family(am).map((c) => c.name), ['Am', 'B°', 'C', 'Dm', 'E', 'F', 'G']);
  assert.equal(T.family(am, true)[4].name, 'E7');
});

test('relative keys and wheel', () => {
  assert.equal(T.keyName(T.relativeOf(T.keyAt(0, 'major'))), 'Am');
  assert.equal(T.keyName(T.relativeOf(T.keyAt(9, 'minor'))), 'E♭');
  for (let i = 0; i < 12; i++) assert.equal(T.wheelIndex(T.keyAt(i, 'major')), i);
});

test('fingering exists for every wheel key', () => {
  for (const k of T.ALL_KEYS) {
    const f = T.fingering(k, k.mode === 'major' ? 'dur' : 'moll');
    assert.ok(f, T.keyName(k));
    assert.equal(f.rh.length, 8); assert.equal(f.lh.length, 8);
  }
  assert.equal(T.fingering(T.keyAt(0, 'major'), 'pentaDur'), null);
});

test('recognize chords, inversions and intervals', () => {
  const C = T.keyAt(0, 'major');
  const r = (ns) => T.recognize(ns, C);
  assert.equal(r([60, 64, 67]).name, 'C');
  assert.equal(r([64, 67, 72]).name, 'C/E');
  assert.equal(r([57, 60, 64]).number, '6m');
  assert.equal(r([55, 59, 62, 65]).name, 'G7');
  assert.equal(r([55, 59, 62, 65]).number, '5⁷');
  assert.equal(r([59, 62, 65, 69]).number, '7ø');
  assert.equal(r([60, 67]).kind, 'interval');
  assert.equal(r([62]).number, '2');
  assert.equal(r([48, 64, 67, 71]).name, 'Cmaj7');
  assert.equal(r([60, 61, 62]).kind, 'cluster');
  const am = T.keyAt(0, 'minor');
  assert.equal(T.recognize([56, 59, 64], am).name, 'E/G♯');
});

test('voicing moves little between chords', () => {
  const C = T.keyAt(0, 'major');
  const chords = T.progressionChords(C, T.PROGRESSIONS[0]);
  let prev = null, moves = 0;
  for (const c of chords) { const v = T.voicing(c, { prev }); if (prev) moves += v.reduce((s, n) => s + Math.min(...prev.map((p) => Math.abs(p - n))), 0); prev = v; }
  assert.ok(moves <= 12, `moves ${moves}`);
});

test('every progression builds in every key of its mode', () => {
  for (const p of T.PROGRESSIONS) for (const k of T.ALL_KEYS.filter((x) => x.mode === p.mode)) {
    const cs = T.progressionChords(k, p);
    assert.equal(cs.length, p.steps.length);
    for (const c of cs) assert.ok(c.tones.every((t) => /^[A-G]/.test(t.name)), `${p.id} ${c.name}`);
  }
});

test('jam cycle: valid MIDI, sorted, balanced note on/off, fits the bars', () => {
  const C = T.keyAt(0, 'major');
  for (const g of G.GROOVES) for (const band of [false, true]) for (const role of Object.keys(G.ROLES)) {
    const prog = T.PROGRESSIONS.find((p) => p.id === g.suggest.major);
    const cyc = G.jamCycle({ key: C, prog, groove: g, tempo: g.tempo, barsPerChord: 2, band, role, click: true });
    assert.ok(cyc.events.length > 0 && cyc.events.length < 4000, `${g.id} ${cyc.events.length}`);
    const held = new Map();
    let last = 0;
    for (const e of cyc.events) {
      assert.ok(e.t >= last - 1e-9); last = e.t;
      assert.ok(e.t <= cyc.seconds + 0.01, `${g.id} event after the end ${e.t} > ${cyc.seconds}`);
      const [s, n, v] = e.m;
      assert.ok(n >= 0 && n < 128 && v >= 0 && v < 128);
      const key = `${s & 15}:${n}`;
      if ((s & 0xf0) === 0x90) held.set(key, (held.get(key) || 0) + 1); else held.set(key, (held.get(key) || 0) - 1);
      if (!band) assert.equal(s & 15, 0, 'without the band everything goes to the piano channel');
    }
    for (const [k, c] of held) assert.equal(c, 0, `${g.id} ${k} unbalanced`);
    assert.equal(cyc.chords.length, prog.steps.length);
    assert.ok(Math.abs(cyc.seconds - prog.steps.length * 2 * cyc.tm.bar) < 1e-6);
  }
});

test('swing moves offbeat eighths later', () => {
  const C = T.keyAt(0, 'major');
  const prog = T.PROGRESSIONS.find((p) => p.id === 'blues');
  const cyc = G.jamCycle({ key: C, prog, groove: 'shuffle', tempo: 90, band: true, role: 'sluchaj' });
  const hats = cyc.events.filter((e) => e.m[0] === 0x99 && e.m[1] === 42).map((e) => e.t / cyc.tm.beat);
  assert.ok(Math.abs(hats[1] - (0.5 + 0.16)) < 0.01, `hat ${hats[1]}`);
});

test('stepKey: wheel and semitone walks', () => {
  const C = T.keyAt(0, 'major');
  const names = (walk, n, start = C) => { const out = []; let k = start; for (let i = 0; i < n; i++) { k = T.stepKey(k, walk); out.push(T.keyName(k)); } return out.join(' '); };
  assert.equal(names(1, 3), 'G D A');
  assert.equal(names(-1, 3), 'F B♭ E♭');
  assert.equal(names('up', 12), 'D♭ D E♭ E F F♯ G A♭ A B♭ B C');
  assert.equal(names('down', 2), 'B B♭');
  const a = T.keyAt(0, 'minor');
  assert.equal(names('up', 3, a), T.keyName(T.stepKey(a, 'up')) + ' ' + names('up', 3, a).split(' ').slice(1).join(' '));
  for (const k of T.ALL_KEYS) assert.equal(T.stepKey(k, 'up').tonicPc, (k.tonicPc + 1) % 12);
});

test('all scales in all keys: ascending, right pitch classes, a "why", groups know every id', () => {
  for (const k of T.ALL_KEYS) {
    for (const id of Object.keys(T.SCALES)) {
      const n = T.scaleNotes(k, id);
      for (let i = 1; i < n.length; i++) assert.ok(n[i].midi > n[i - 1].midi, `${id} ${T.keyName(k)}`);
      for (const x of n) assert.equal(((x.midi % 12) + 12) % 12, x.pc);
      assert.ok(!T.whyScale(k, id).startsWith(' ('), id);
    }
  }
  for (const g of T.SCALE_GROUPS) for (const [id] of g.list) assert.ok(T.SCALES[id], id);
  const C = T.keyAt(0, 'major');
  assert.equal(T.scaleNotes(C, 'alterowana').map((x) => x.name).join(' '), 'C D♭ D♯ E F♯ A♭ B♭ C');
  assert.equal(T.scaleNotes(C, 'lidyjska').map((x) => x.name).join(' '), 'C D E F♯ G A B C');
  assert.equal(T.scaleNotes(T.keyAt(0, 'minor'), 'frygijska').map((x) => x.name).join(' '), 'A B♭ C D E F G A');
  assert.match(T.whyScale(T.makeKey('D', 0, 'minor'), 'dorycka'), /C-dur, tylko domem jest D/);
  // frygijska dominantowa (flamenco): G Ab B C D Eb F G = 5th mode of C harmonic minor
  const G = T.makeKey('G', 0, 'major');
  assert.equal(T.scaleNotes(G, 'hidzaz').map((x) => x.name).join(' '), 'G A♭ B C D E♭ F G');
  assert.match(T.whyScale(G, 'hidzaz'), /C-moll harmoniczna, tylko domem jest G/);
  assert.match(T.SCALES.hidzaz.name, /flamenco/);
  assert.equal(T.keyName(T.keyByTonic(1, 'major')), 'D♭');
});

test('jam: half-bar chords from songs, fills, crash, dynamics', () => {
  const am = T.keyAt(0, 'minor');
  // Hit the Road Jack: | Am G | F E | = four chords, half a bar each
  const prog = { id: 'song', mode: 'minor', steps: [[1, 0, 'min', 0.5], [7, -1, 'maj', 0.5], [6, -1, 'maj', 0.5], [5, 0, 'maj', 0.5]] };
  for (const g of G.GROOVES) for (const fill of [false, true]) {
    const cyc = G.jamCycle({ key: am, prog, groove: g, tempo: g.tempo, band: true, role: 'sluchaj', fill, crash: fill, dyn: fill ? 1.15 : 0.75 });
    assert.ok(Math.abs(cyc.seconds - 2 * cyc.tm.bar) < 1e-6, g.id);
    assert.ok(Math.abs(cyc.chords[1].start - cyc.tm.bar / 2) <= cyc.tm.step / 2 + 1e-6, `${g.id} second chord at half a bar (on the grid)`);
    const held = new Map();
    for (const e of cyc.events) {
      assert.ok(e.t <= cyc.seconds + 0.01 && e.m[2] < 128);
      const k = `${e.m[0] & 15}:${e.m[1]}`;
      held.set(k, (held.get(k) || 0) + ((e.m[0] & 0xf0) === 0x90 ? 1 : -1));
    }
    for (const [k, c] of held) assert.equal(c, 0, `${g.id} ${k}`);
    // every chord sounds on the piano while it lasts (comp or the extra hit at the change)
    for (const c of cyc.chords) assert.ok(cyc.events.some((e) => e.m[0] === 0x90 && e.t >= c.start - 0.01 && e.t < c.end && c.voicing.includes(e.m[1])), `${g.id} ${c.chord.name}`);
    // toms that are not part of the groove itself (samba's surdo, salsa's conga)
    const toms = cyc.events.filter((e) => e.m[0] === 0x99 && [50, 48, 47, 45, 43].includes(e.m[1]) && !(String(e.m[1]) in g.drums));
    if (fill) { assert.ok(toms.length > 0, `${g.id} fill`); assert.ok(cyc.events.some((e) => e.m[0] === 0x99 && e.m[1] === 49 && e.t === 0), `${g.id} crash`); }
    else assert.equal(toms.length, 0);
  }
  const loud = G.jamCycle({ key: am, prog, groove: 'pop', tempo: 96, band: true, role: 'sluchaj', dyn: 1.15 });
  const soft = G.jamCycle({ key: am, prog, groove: 'pop', tempo: 96, band: true, role: 'sluchaj', dyn: 0.75 });
  const avg = (c) => c.events.filter((e) => (e.m[0] & 0xf0) === 0x90).reduce((a, e) => a + e.m[2], 0);
  assert.ok(avg(loud) > avg(soft) * 1.3);
});
