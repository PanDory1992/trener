// Piosenki → "Zespół gra ze mną": the song's chords as one jam lap (jamCycle), with a bar of count-in, cut into
// pieces small enough for the server (it takes at most 4000 events per /api/play). Pure; the page plays it.
import { jamCycle, countIn } from './grooves.js';

export const BAND_MODES = [
  ['rytm', 'Perkusja i bas', 'Zespół gra perkusję i bas. Akordy grasz ty.'],
  ['calosc', 'Cały zespół', 'Perkusja, bas i klawisze (kanał 3), jak w Jamie. Ty możesz śpiewać albo grać melodię.'],
];

/** One pass of the song (or a section) with the band. countIn only on the first lap. */
export function songBand({ key, steps, groove, tempo, mode = 'rytm', drummer = 3, barOffset = 0, lead = true, rng = Math.random }) {
  const lap = jamCycle({
    key, prog: { steps }, groove, tempo, band: true, keysOwn: true,
    role: mode === 'calosc' ? 'solo' : 'akordy',
    drummer, fill: true, crash: barOffset === 0, barOffset, rng,
  });
  const ci = lead ? countIn(groove, tempo, true) : { events: [], seconds: 0 };
  const shift = ci.seconds;
  return {
    events: [...ci.events, ...lap.events.map((e) => ({ ...e, t: e.t + shift }))],
    leadIn: shift,
    seconds: shift + lap.seconds,
    lapSeconds: lap.seconds,
    bars: lap.bars,
    chords: lap.chords.map((c, k) => ({ k, name: c.chord && c.chord.name, start: c.start + shift, end: c.end + shift })),
  };
}

/** Split time-sorted events into pieces of at most `max`, each with its own offset (times relative to it). */
export function chunkEvents(events, max = 3000) {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const out = [];
  for (let i = 0; i < sorted.length; i += max) {
    const part = sorted.slice(i, i + max);
    const offset = i === 0 ? 0 : part[0].t;
    out.push({ offset, events: part.map((e) => ({ ...e, t: e.t - offset })) });
  }
  return out.length ? out : [{ offset: 0, events: [] }];
}

/** Which chord (index into the played chords) sounds at time t (seconds from the start of the pass), or -1. */
export function chordAt(chords, t) {
  for (const c of chords) if (t >= c.start && t < c.end) return c.k;
  return -1;
}
