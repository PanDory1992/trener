import test from 'node:test';
import assert from 'node:assert/strict';
import { identify, suggestions, stepChords, voicingOptions, makeChord, stepsToChart, detectKey, CATALOG, degreeGrid, chosenVoicing, stepChord } from '../web/js/chords.js';
import { jamCycle, bassMidi } from '../web/js/grooves.js';
import { keyAt, ALL_KEYS } from '../web/js/theory.js';
import { parseChart } from '../web/js/songs.js';

const C = keyAt(0, 'major');
const cm = ALL_KEYS.find((k) => k.mode === 'minor' && k.tonicPc === 0);
const name = (n, k = C) => identify(n, k).name;

test('names: triads, sevenths, tensions, alterations', () => {
  assert.equal(name([60, 64, 67]), 'C');
  assert.equal(name([48, 64, 67, 70]), 'C7');
  assert.equal(name([55, 59, 62, 65, 68]), 'G7♭9');
  assert.equal(name([48, 55, 64, 70, 75]), 'C7♯9');
  assert.equal(name([48, 52, 58, 62, 69]), 'C13');
  assert.equal(name([48, 64, 70, 74, 78]), 'C9♯11');
  assert.equal(name([60, 65, 67]), 'Csus4');
  assert.equal(name([52, 55, 58, 62]), 'Em7♭5');
  assert.equal(name([49, 53, 56, 59]), 'D♭7');
});

test('inversions, slash chords, rootless, ambiguity', () => {
  const inv = identify([64, 67, 72], C);
  assert.equal(inv.name, 'C/E');
  assert.match(inv.lines[0], /1\. przewrót/);
  assert.equal(name([50, 60, 63, 67], cm), 'Cm/D');      // bass alone under the right hand
  const six = identify([60, 64, 67, 69], C);
  assert.equal(six.name, 'C6');
  assert.ok(six.alts.includes('Am7/C'));
  assert.equal(name([57, 60, 64, 67]), 'Am7');
  const rootless = identify([64, 67, 70, 74, 77], keyAt(5, 'major'));   // E G B♭ D F: rootless C13? Em7♭5 add11? any name, no crash
  assert.equal(rootless.kind, 'chord');
});

test('voicing info: shell, drop 2, hands, quartal', () => {
  const sh = identify([48, 58, 64], C);
  assert.ok(sh.lines.some((l) => /shell 1–3–7/.test(l)), sh.lines.join(' / '));
  const q = identify([48, 53, 58, 63], C);
  assert.ok(q.lines.some((l) => /kwartowy/.test(l)));
  const h = identify([36, 64, 67, 71], C);
  assert.ok(h.lines.some((l) => /lewa: C · prawa: E G B/.test(l)));
});

test('function and source in the key', () => {
  assert.match(identify([48, 52, 55, 58], C).detail, /dominanta wtórna 5⁷\/4/);
  assert.match(identify([49, 53, 56, 59], C).detail, /zastępstwo trytonowe/);
  assert.match(identify([56, 60, 63], C).detail, /pożyczony z c-moll/);
  assert.match(identify([55, 59, 62, 65], cm).detail, /z tonacji/);   // G7 in c-moll: harmonic minor
});

test('catalogue and suggestions', () => {
  assert.ok(CATALOG.length >= 60);
  const g = suggestions(C);
  const v = g.find((x) => x.id === 'v');
  assert.ok(v.items.some((it) => it.label === '5⁷/4' && stepChord(C, it.step).name === 'C7'));
  const tt = g.find((x) => x.id === 'tt');
  assert.ok(tt.items.some((it) => stepChord(C, it.step).name === 'D♭7'));
  const bor = g.find((x) => x.id === 'bor');
  assert.ok(bor.items.some((it) => stepChord(C, it.step).name === 'A♭'));
  assert.equal(degreeGrid(C)[0].items.length, 12);
  const dor = suggestions(keyAt(0, 'minor'), 'dorycka');   // a-moll dorian: IV is major (D)
  assert.ok(dor.find((x) => x.id === 'tri').items.some((it) => stepChord(keyAt(0, 'minor'), it.step).name === 'D'));
});

test('steps: voicing choices, slash bass, rest, section, modulation', () => {
  const c = makeChord(0, 0, 'm7');
  assert.ok(voicingOptions(c).some((o) => o.group === 'drop'));
  assert.deepEqual(chosenVoicing(c, { inv: 1 }), [63, 67, 70, 72]);
  const list = stepChords(C, [{ k: 'sec', label: 'Zwrotka' }, [1, 0, 'maj', 1], { k: 'chord', d: 5, a: 0, q: 'dom7b9', bass: 4 }, { k: 'rest', bars: 1 }, { k: 'mod', shift: 2 }, [1, 0, 'maj', 0.5], { k: 'chord', d: 4, a: 0, q: 'maj', skip: true }]);
  assert.equal(list.length, 4);
  assert.equal(list[0].labels[0].label, 'Zwrotka');
  assert.equal(list[1].chord.name, 'G7♭9/B');
  assert.equal(list[1].bass % 12, 11);
  assert.ok(list[2].rest);
  assert.equal(list[3].chord.name, 'D');
});

test('bass follows the chord: slash, real fifth and seventh', () => {
  const slash = stepChord(C, { k: 'chord', d: 1, a: 0, q: 'maj', bass: 4 });
  assert.equal(bassMidi('R', slash, null, 40), 40);
  assert.equal(bassMidi('5', slash, null, 40) % 12, 7);
  const dim = stepChord(C, { k: 'chord', d: 7, a: 0, q: 'm7b5' });
  assert.equal(bassMidi('5', dim, null, 47) - 47, 6);
  const maj7 = stepChord(C, { k: 'chord', d: 1, a: 0, q: 'maj7' });
  assert.equal(bassMidi('b7', maj7, null, 36) - 36, 11);
});

test('jam from editor steps: rest is silent, arpeggio, humanization, live bass plan', () => {
  const prog = { steps: [[1, 0, 'maj', 1], { k: 'rest', bars: 1 }] };
  const j = jamCycle({ key: C, prog, groove: 'pop', tempo: 100, band: true, keysOwn: true, role: 'solo' });
  const restStart = j.chords[1].start;
  assert.ok(!j.events.some((e) => (e.m[0] & 0xf0) === 0x90 && [1, 2].includes(e.m[0] & 15) && e.t >= restStart + 0.01), 'no bass/keys in the rest');
  const a = jamCycle({ key: C, prog: { steps: [[1, 0, 'maj', 1]] }, groove: 'pop', tempo: 120, band: true, keysOwn: true, role: 'solo', arp: { mode: 'gora', step: 0.5, voices: 4 } });
  const keys = a.events.filter((e) => (e.m[0] & 0xf0) === 0x90 && (e.m[0] & 15) === 2);
  assert.equal(keys.length, 8);
  assert.ok(keys[1].m[1] > keys[0].m[1]);
  const h = jamCycle({ key: C, prog: { steps: [[1, 0, 'maj', 1]] }, groove: 'pop', tempo: 120, band: true, role: 'solo', human: { t: 100, v: 100 }, rng: () => 1 });
  const plain = jamCycle({ key: C, prog: { steps: [[1, 0, 'maj', 1]] }, groove: 'pop', tempo: 120, band: true, role: 'solo' });
  assert.ok(h.events.some((e, i) => e.t !== plain.events[i].t));
  const live = jamCycle({ key: C, prog: { steps: [[1, 0, 'maj', 1]] }, groove: 'pop', tempo: 120, band: true, role: 'akordy', bassLive: true });
  assert.ok(live.bassPlan.length > 0);
  assert.ok(!live.events.some((e) => (e.m[0] & 15) === 1));
});

test('steps → song chart → parsed back', () => {
  const text = stepsToChart(C, [{ k: 'sec', label: 'Refren' }, [1, 0, 'maj', 2], [5, 0, 'dom7b9', 1], [6, 0, 'min', 0.5], [4, 0, 'maj', 0.5]]);
  const ch = parseChart(text);
  assert.equal(ch.sections[0].name, 'Refren');
  assert.deepEqual(ch.sections[0].chords.map((c) => c.quality), ['maj', 'maj', 'dom7b9', 'min', 'maj']);
  assert.deepEqual(ch.sections[0].beats, [4, 4, 4, 2, 2]);
});

test('key detection', () => {
  const hist = Array(12).fill(0);
  [0, 2, 4, 5, 7, 9, 11, 0, 4, 7, 0, 7].forEach((pc) => { hist[pc] += 1; });
  assert.equal(detectKey(hist)[0].key.tonicPc, 0);
});

// --- 1.7 ---------------------------------------------------------------------------------------------------
import { nextMoves, matchingScales, rekey, pivots, modTargets, heldToStep, degAlt, simpleSpell } from '../web/js/chords.js';
import { textToSteps } from '../web/js/songs.js';
import { buildMidi, keySignature } from '../web/js/midi.js';
const G = keyAt(1, 'major');
const Eb = ALL_KEYS.find((k) => k.mode === 'major' && k.tonicPc === 3);

test('degrees in other keys (regression: letter distance mod 7)', () => {
  assert.deepEqual(degAlt(G, 0, 0), { deg: 4, alt: 0 });          // C in G = 4
  assert.deepEqual(degAlt(Eb, 1, 2), { deg: 7, alt: 0 });         // D in E♭ = 7
  const v = suggestions(G).find((x) => x.id === 'v');
  assert.ok(v.items.some((it) => it.label === '5⁷/4' && stepChord(G, it.step).name === 'G7'));
  assert.equal(simpleSpell(C, 1).name, 'D♭');
  assert.equal(simpleSpell(keyAt(2, 'major'), 1).name, 'C♯');
});

test('what comes next', () => {
  const after5 = nextMoves(C, [5, 0, 'maj']).map((m) => stepChord(C, m.step).name);
  assert.equal(after5[0], 'C');
  assert.ok(after5.includes('Am'));
  const afterD7 = nextMoves(C, { k: 'chord', d: 2, a: 0, q: 'dom7' }).map((m) => stepChord(C, m.step).name);
  assert.equal(afterD7[0], 'G');   // a secondary dominant wants its target
});

test('matching scales, rekey, modulation targets and pivots', () => {
  const m = matchingScales(C, [[2, 0, 'm7'], [5, 0, 'dom7'], [1, 0, 'maj7']]);
  assert.equal(m[0].fit, 3);
  assert.equal(m[0].key.tonicPc, 0);
  assert.deepEqual(rekey([[1, 0, 'maj']], C, G).map((s) => [s.d, s.a]), [[4, 0]]);
  assert.ok(modTargets(C).some((t) => t.name.startsWith('relatywna') && t.key.tonicPc === 9 && t.key.mode === 'minor'));
  assert.deepEqual(pivots(C, G).map((p) => p.name).sort(), ['Am', 'C', 'Em', 'G']);
});

test('a held chord becomes a step with your voicing', () => {
  const h = heldToStep([40, 60, 64, 67], C);
  assert.equal(h.name, 'C/E');
  assert.equal(h.step.bass, 4);
  const [e] = stepChords(C, [h.step]);
  assert.deepEqual(e.voicing.map((n) => n % 12), [0, 4, 7]);
  const [e2] = stepChords(G, [rekey([h.step], C, G)[0]]);   // same sound in another key's numbers
  assert.equal(e2.chord.name, 'C/E');
});

test('typed chords', () => {
  const { steps, bad } = textToSteps('Dm7 G7 | Cmaj7 A7/C# % N.C. xyz', C);
  assert.deepEqual(bad, ['xyz']);
  assert.equal(steps.length, 6);
  assert.equal(stepChord(C, steps[3]).name, 'A7/C♯');
  assert.equal(steps[5].k, 'rest');
});

test('augmented sixths and the Neapolitan', () => {
  const g = suggestions(cm).find((x) => x.id === 'chrom');
  const names = g.items.map((it) => stepChord(cm, it.step).name);
  assert.ok(names.includes('D♭'));
  assert.ok(names.some((n) => /A♭ Ger\+6/.test(n)));
  assert.deepEqual(stepChord(cm, g.items.find((it) => /Ger/.test(it.label)).step).tones.map((t) => t.name), ['A♭', 'C', 'E♭', 'F♯']);
});

test('MIDI file', () => {
  const b = buildMidi({ tempo: 120, events: [{ t: 0, m: [0x90, 60, 80] }, { t: 0.5, m: [0x80, 60, 0] }], markers: [{ t: 0, text: 'C' }], key: keySignature(Eb) });
  assert.equal(String.fromCharCode(...b.slice(0, 4)), 'MThd');
  assert.equal(b[11], 2);   // tempo track + one channel
  assert.deepEqual(keySignature(Eb), { sharps: -3, minor: false });
});
