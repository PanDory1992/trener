// A Standard MIDI File (type 1) from Trener events: one track per channel, tempo, meter, key signature and the
// chord names as markers, so Studio One shows the chords on its timeline. Pure (tested in node).

const PPQ = 480;
const TRACK_NAMES = { 0: 'Pianino', 1: 'Bas', 2: 'Klawisze', 9: 'Perkusja', 15: 'Klik' };

function vlq(n) {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) { out.unshift((n & 0x7f) | 0x80); n >>= 7; }
  return out;
}
const str = (s) => [...new TextEncoder().encode(s)];
function chunk(id, data) {
  const len = data.length;
  return [...str(id), (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...data];
}
function track(items) {
  // items: [{ tick, bytes }] → delta-timed track data with end of track
  items.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let last = 0;
  for (const it of items) { data.push(...vlq(Math.max(0, it.tick - last)), ...it.bytes); last = Math.max(last, it.tick); }
  data.push(0, 0xff, 0x2f, 0);
  return chunk('MTrk', data);
}
const meta = (type, bytes) => [0xff, type, ...vlq(bytes.length), ...bytes];

/**
 * opts: { tempo, beats (per bar), events: [{ t (s), m: [status, d1, d2] }], markers: [{ t, text }], key: { sharps (-7..7), minor }, name }
 * Returns Uint8Array.
 */
export function buildMidi({ tempo = 100, beats = 4, events = [], markers = [], key = null, name = 'Trener jam' }) {
  const tick = (t) => Math.round(t * (tempo / 60) * PPQ);
  const us = Math.round(60000000 / tempo);
  const t0 = [
    { tick: 0, order: 0, bytes: meta(0x03, str(name)) },
    { tick: 0, order: 1, bytes: meta(0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255]) },
    { tick: 0, order: 2, bytes: meta(0x58, [Math.round(beats) || 4, 2, 24, 8]) },
  ];
  if (key) t0.push({ tick: 0, order: 3, bytes: meta(0x59, [key.sharps & 255, key.minor ? 1 : 0]) });
  markers.forEach((mk, i) => t0.push({ tick: tick(mk.t), order: 10 + i, bytes: meta(0x06, str(mk.text)) }));
  const byCh = new Map();
  events.forEach((e, i) => {
    const ch = e.m[0] & 15;
    if (!byCh.has(ch)) byCh.set(ch, []);
    const off = (e.m[0] & 0xf0) === 0x80;
    byCh.get(ch).push({ tick: tick(e.t), order: off ? i - 1e6 : i, bytes: [e.m[0], e.m[1] & 127, e.m[2] & 127] });
  });
  const tracks = [track(t0)];
  for (const [ch, items] of [...byCh.entries()].sort((a, b) => a[0] - b[0])) {
    items.unshift({ tick: 0, order: -2e6, bytes: meta(0x03, str(TRACK_NAMES[ch] || `Kanał ${ch + 1}`)) });
    tracks.push(track(items));
  }
  const head = chunk('MThd', [0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255]);
  return new Uint8Array([...head, ...tracks.flat()]);
}

/** Key signature of a Trener key: sharps (+) or flats (−) and minor flag. */
export function keySignature(key) {
  const MAJ_SF = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 };
  const tonic = key.mode === 'minor' ? (key.tonicPc + 3) % 12 : key.tonicPc;
  let sf = MAJ_SF[tonic];
  if (tonic === 6 && key.acc < 0) sf = -6;   // G♭ / e♭-moll
  if (tonic === 1 && key.acc > 0) sf = 7;    // C♯ / a♯-moll
  return { sharps: sf, minor: key.mode === 'minor' };
}
