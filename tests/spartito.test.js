// 1.16: Nuty (Spartito in Trener). The pure part always; the engine part only where the engine is
// (it is Miki's own code, kept off git: tools/spartito_engine.py builds web/js/spartito/engine.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  fifthsOf, groupOnsets, sequenceNotes, stavesFor, chordNotes, placeWords, READ_LEVELS, levelItems, pickItem, checkCard,
  cardScore, noteCard, nextReadLevel, isMeter, layout, SP,
  estimateTempo, guessFifths, phraseNotes, melodyFrom, lyricWords, spaceSystems, sheetMarks, engrave,
} from '../web/js/spartito/notes.js';
import { pathData, opsMarkup, layoutSvg } from '../web/js/spartito/svg.js';

const ENGINE = fileURLToPath(new URL('../web/js/spartito/engine.js', import.meta.url));
const HAVE = existsSync(ENGINE);
const E = HAVE ? await import('../web/js/spartito/engine.js') : null;

test('key signature from the wheel: sharps up to F#, flats from Db', () => {
  assert.deepEqual([0, 1, 6, 7, 11].map(fifthsOf), [0, 1, 6, -5, -1]);
});

test('onsets close together are one chord, sorted; a row of them is one long bar of whole notes', () => {
  const g = groupOnsets([{ note: 64, t: 0 }, { note: 60, t: 0.02 }, { note: 67, t: 0.5 }]);
  assert.deepEqual(g, [[60, 64], [67]]);
  const s = sequenceNotes(g);
  assert.equal(s.num, 4);
  assert.equal(s.staves, 'treble');
  assert.equal(stavesFor([48, 64]), 'piano');
  assert.equal(stavesFor([60], [1]), 'bass');
  assert.deepEqual(s.notes.map((n) => [n.p, n.t, n.d]), [[60, 0, 4], [64, 0, 4], [67, 4, 4]]);
  assert.deepEqual(chordNotes([60, 64], { wrong: [62, 64] }).map((n) => [n.p, !!n.sel]), [[60, false], [64, false], [62, true]]);
});

test('where a note sits, in words', () => {
  assert.equal(placeWords(4 * 7 + 2, 'treble'), 'linia pierwsza');          // E4
  assert.equal(placeWords(4 * 7 + 3, 'treble'), 'pole pierwsze');           // F4
  assert.equal(placeWords(4 * 7 + 0, 'treble'), 'pierwsza linia dodana pod'); // C4
  assert.equal(placeWords(4 * 7 + 1, 'treble'), 'pod pięciolinią');          // D4
  assert.equal(placeWords(3 * 7 + 6, 'treble'), 'pod pierwszą linią dodaną'); // B3
  assert.equal(placeWords(5 * 7 + 5, 'treble'), 'pierwsza linia dodana nad'); // A5
  assert.equal(placeWords(2 * 7 + 4, 'bass'), 'linia pierwsza');            // G2
  assert.equal(placeWords(4 * 7 + 0, 'bass'), 'pierwsza linia dodana nad'); // C4 in the bass clef
});

test('the reading ladder: ten steps, every card playable and in its clef', () => {
  assert.equal(READ_LEVELS.length, 10);
  for (let lv = 1; lv <= 10; lv++) {
    for (let k = 0; k < 7; k++) {
      const { items, key } = levelItems(lv, k);
      assert.ok(items.length >= 5, `level ${lv}`);
      const ids = new Set(items.map((x) => x.id));
      assert.equal(ids.size, items.length, `ids unique on level ${lv}`);
      for (const it of items) {
        assert.equal(it.key, key);
        assert.equal(it.pitches.length, it.st.length);
        for (const p of it.pitches) assert.ok(p >= 28 && p <= 96, `${lv}: ${p}`);
      }
    }
  }
  assert.deepEqual(levelItems(1).items.map((x) => x.pitches[0]), [60, 62, 64, 65, 67]);
  assert.ok(levelItems(2).items.every((x) => x.st[0] === 1));
  // level 7 in G: F is always F#
  assert.ok(levelItems(7, 0).items.every((x) => x.pitches[0] % 12 !== 5));
  // triads are three notes in one hand; level 10 adds the bass in the left
  assert.ok(levelItems(9).items.every((x) => x.pitches.length === 3));
  assert.ok(levelItems(10).items.every((x) => x.pitches.length === 4 && x.st[0] === 1));
});

test('weak and slow cards come more often, never twice in a row', () => {
  const items = levelItems(1).items;
  const stats = { v60: { n: 10, bad: 6, ms: 5000 }, v62: { n: 10, bad: 0, ms: 900 }, v64: { n: 10, bad: 0, ms: 900 }, v65: { n: 10, bad: 0, ms: 900 }, v67: { n: 10, bad: 0, ms: 900 } };
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const count = {};
  let last = null;
  for (let i = 0; i < 2000; i++) {
    const c = pickItem(items, stats, last, 4000, rand);
    assert.notEqual(c.id, last);
    count[c.id] = (count[c.id] || 0) + 1;
    last = c.id;
  }
  assert.ok(count.v60 > count.v62 * 1.5, JSON.stringify(count));
});

test('checking a card: exact pitches, octave errors named, scores and levels', () => {
  const card = { pitches: [64, 60, 67] };
  assert.equal(checkCard(card, [60, 64, 67, 64]).ok, true);
  const r = checkCard({ pitches: [64] }, [52]);
  assert.equal(r.ok, false);
  assert.equal(r.octave, true);
  assert.deepEqual(checkCard({ pitches: [64] }, [65]).wrong, [65]);
  assert.equal(cardScore(true, 1000, 3000), 100);
  assert.equal(cardScore(true, 9000, 3000), 60);
  assert.equal(cardScore(false, 500, 3000), 0);
  const st = {};
  noteCard(st, 'a', true, 2000); noteCard(st, 'a', false, 100); noteCard(st, 'a', true, 1000);
  assert.deepEqual(st.a, { n: 3, bad: 1, ms: 1700 });
  const good = Array.from({ length: 20 }, () => ({ ok: true, ms: 2000 }));
  assert.equal(nextReadLevel(3, good, 3000), 4);
  assert.equal(nextReadLevel(3, good, 1500), 3);
  assert.equal(nextReadLevel(3, good.map((g, i) => ({ ...g, ok: i < 10 })), 3000), 2);
  assert.equal(nextReadLevel(10, good, 9000), 10);
});

test('display list to SVG markup', () => {
  assert.equal(pathData(['M', 0, 0, 'L', 10.123, 5, 'C', 1, 2, 3, 4, 5, 6, 'Z'], 1, 1), 'M1 1L11.12 6C2 3 4 5 6 7Z');
  const m = opsMarkup([{ k: 'T', x: 5, y: 9, s: 'a<b', size: 12, bold: 1, align: 'center', c: [0, 0, 0, 1] }, { k: 'S', d: ['M', 0, 0, 'L', 1, 1], c: [1, 0, 0, 0.5], w: 0.8 }]);
  assert.match(m, /text-anchor="middle"[^>]*>a&lt;b<\/text>/);
  assert.match(m, /stroke="rgba\(255,0,0,0\.5\)" stroke-width="0\.8"/);
});

test('engine: a C major chord on the grand staff, spelled in the key', { skip: !HAVE && 'no engine (kept off git)' }, () => {
  const L = layout(E, chordNotes([48, 60, 64, 67]), { key: 0, width: 300, sp: SP });
  assert.equal(L.hits.filter((h) => h.k === 'n').length, 4);
  const svg = layoutSvg(L, { drop: (op) => isMeter(op, L.sp) });
  assert.match(svg, /^<svg[^>]*viewBox="0 0 300 /);
  assert.ok(!/>4<\/text>/.test(svg), 'no time signature on a chord');
  assert.ok((svg.match(/<path /g) || []).length > 20);
  // F# in D major, Gb in Db major: the engine spells by the key
  assert.equal(E.nt_spell(66, 2, 0).alter, 1);
  assert.equal(E.nt_spell(66, -5, 0).alter, -1);
  // a wrong note is drawn red (the engine's selection colour)
  const L2 = layout(E, chordNotes([64], { wrong: [65] }), { width: 300 });
  assert.match(layoutSvg(L2), /rgb\(219,41,56\)/);
});

test('engine: every reading card lays out on its own clef', { skip: !HAVE && 'no engine (kept off git)' }, () => {
  for (let lv = 1; lv <= 10; lv++) {
    const { items } = levelItems(lv, 2);
    for (const it of items) {
      const L = layout(E, chordNotes(it.pitches, { st: it.st }), { key: it.key, width: 340, sp: SP * 1.5 });
      assert.equal(L.hits.filter((h) => h.k === 'n').length, it.pitches.length, `${lv} ${it.id}`);
    }
  }
});

test('engine module is the generated one, not edited by hand', { skip: !HAVE && 'no engine (kept off git)' }, () => {
  const head = readFileSync(ENGINE, 'utf8').split('\n')[0];
  assert.match(head, /^\/\/ GENERATED by tools\/spartito_engine\.py .* md5 [0-9a-f]{32}\.$/);
  assert.match(E.ENGINE_MD5, /^[0-9a-f]{32}$/);
});

test('Zeszyt: tempo, key and beats from free playing', () => {
  const eighths = Array.from({ length: 16 }, (_, i) => [60 + (i % 5), i * 0.3, 0.25, 80]);   // 0.3 s apart
  assert.equal(estimateTempo(eighths), 100);                                               // 0.6 s quarter
  assert.equal(estimateTempo([[60, 0, 1, 80]]), 80);
  assert.equal(guessFifths([[66, 0, 1], [62, 1, 1], [69, 2, 1], [61, 3, 0.5]]), 2);        // F# C# D A: D major
  assert.equal(guessFifths([[70, 0, 1], [65, 1, 1], [60, 2, 1]]), -1);                      // Bb F C: F major
  assert.deepEqual(phraseNotes([[60, 10, 0.5, 70], [62, 10.6, 0.3, 80]], 100).map((n) => [n.p, +n.t.toFixed(3), +n.d.toFixed(3)]), [[60, 0, 0.833], [62, 1, 0.5]]);
});

test('Śpiewnik: the melody is the top note of each onset, words in order', () => {
  const ev = [
    { note: 48, on: true, t: 10.0 }, { note: 64, on: true, t: 10.01 }, { note: 67, on: true, t: 10.02 },
    { note: 67, on: false, t: 10.5 }, { note: 64, on: false, t: 10.5 }, { note: 48, on: false, t: 11 },
    { note: 65, on: true, t: 11.0 }, { note: 65, on: false, t: 11.9 }, { note: 72, on: true, t: 30 },
  ];
  const m = melodyFrom(ev, 10, 60, { endBeat: 4 });
  assert.deepEqual(m.map((n) => [n.p, Math.round(n.t * 100) / 100, Math.round(n.d * 100) / 100]), [[67, 0.02, 0.48], [65, 1, 0.9]]);
  assert.deepEqual(lyricWords([{ lines: [{ lyric: 'Ala ma  kota' }, { lyric: '' }] }, { lines: [{ lyric: 'a | kot' }] }]), ['Ala', 'ma', 'kota', 'a', 'kot']);
});

test('engine: a lead sheet with chords over the bars and words under the notes', { skip: !HAVE && 'no engine (kept off git)' }, () => {
  const notes = [{ p: 67, t: 0, d: 1, st: 0 }, { p: 64, t: 1, d: 1, st: 0 }, { p: 65, t: 2, d: 2, st: 0 }, { p: 62, t: 4, d: 4, st: 0 }];
  const L = layout(E, notes, { key: 0, staves: 'treble', len: 8, width: 500 });
  const h0 = L.height;
  spaceSystems(L, 30, 46);
  assert.equal(L.height, h0 + L.systems.length * 76);
  const r = sheetMarks(E, L, { chords: [{ beat: 0, name: 'C' }, { beat: 4, name: 'G7' }], words: ['Ala', 'ma', 'ko-', 'ta', 'nadmiar'], notes });
  assert.equal(r.placed, 4);
  const svg = layoutSvg(L);
  for (const w of ['>C<', '>G7<', '>Ala<', '>ta<']) assert.ok(svg.includes(w), w);
  assert.ok(!svg.includes('nadmiar'));
  const { M, S } = engrave(E, notes, { key: 0, staves: 'treble', len: 8, name: 'T' });
  assert.equal(E.ex_midiBytes(M, 90, 0, 'T').slice(0, 4).map((b) => String.fromCharCode(b)).join(''), 'MThd');
  assert.match(E.ex_musicxml(S, 'T'), /<score-partwise/);
});
