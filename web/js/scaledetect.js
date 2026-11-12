// Free play: recognise a whole scale played without "Graj ze mną" (up to the top tonic and back,
// like the Gama card), in any key and any octave, one hand or both hands in octaves.
// Pure logic (tested in node): the page feeds note-ons and gets a match back.
//
// A run counts only when it is exact: every note right, nothing extra in between.
// Steady timing (like playing to a click) counts as a pass in time; uneven = "całość, bez tempa".

const CHORD_GAP = 0.08;      // two notes this close, an octave apart = both hands together
const MAX_GAP = 3.0;         // a longer pause breaks the run
const MAX_EVENTS = 40;
const pcOf = (n) => ((n % 12) + 12) % 12;

/** Up-and-down shape of a scale as semitones from the tonic: [0,2,4,5,7,9,11,12,11,…,0]. */
export function runShape(semis) {
  const up = [...semis, 12];
  return [...up, ...up.slice(0, -1).reverse()];
}

/**
 * Steadiness of a run from its note times. The gap after the top note is left out (often held longer).
 * Returns { steady, bpm, cv } with bpm = one note per beat.
 */
export function timing(times, topIndex = -1) {
  const ioi = [];
  for (let i = 1; i < times.length; i++) if (i - 1 !== topIndex) ioi.push(times[i] - times[i - 1]);
  if (ioi.length < 3) return { steady: false, bpm: 0, cv: 1 };
  const sorted = [...ioi].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const mean = ioi.reduce((a, b) => a + b, 0) / ioi.length;
  const sd = Math.sqrt(ioi.reduce((a, b) => a + (b - mean) ** 2, 0) / ioi.length);
  const cv = sd / mean;
  const worst = Math.max(...ioi.map((x) => Math.abs(x - med) / med));
  const bpm = Math.round(60 / med);
  return { steady: cv < 0.2 && worst < 0.45 && bpm >= 40 && bpm <= 220, bpm, cv };
}

/**
 * candidates() → [{ tonicPc, shape, ...anything }] to look for (the page decides which keys and scales).
 * push(note, t) after every note-on → null, or { cand, hand: 'rh'|'lh'|'both', steady, bpm, cv, notes }.
 */
export class ScaleDetector {
  constructor(candidates) {
    this.candidates = candidates;
    this.events = [];   // [{ note, t, both }] — the lower note when both hands play in octaves
  }

  reset() { this.events = []; }

  push(note, t) {
    const last = this.events[this.events.length - 1];
    if (last && t - last.t <= CHORD_GAP) {
      // the octave partner of the last note: both hands. Anything else together = a chord: start over.
      if (!last.both && Math.abs(note - last.note) === 12) { last.both = true; last.note = Math.min(last.note, note); }
      else { this.events = []; return null; }
    } else {
      if (last && t - last.t > MAX_GAP) this.events = [];
      this.events.push({ note, t, both: false });
      if (this.events.length > MAX_EVENTS) this.events.shift();
    }
    return this.match();
  }

  match() {
    const evs = this.events;
    for (const cand of this.candidates()) {
      const L = cand.shape.length;
      if (evs.length < L) continue;
      const run = evs.slice(evs.length - L);
      const first = run[0].note;
      if (pcOf(first) !== cand.tonicPc) continue;
      if (!run.every((e, i) => e.note - first === cand.shape[i])) continue;
      const both = run[0].both;
      if (!run.every((e) => e.both === both)) continue;   // one hand or both, the same all the way
      const tm = timing(run.map((e) => e.t), cand.shape.indexOf(12));
      // the bottom tonic can start the next run straight away (up and down again)
      this.events = [{ ...run[L - 1] }];
      return { cand, hand: both ? 'both' : first >= 54 ? 'rh' : 'lh', steady: tm.steady, bpm: tm.bpm, cv: tm.cv, notes: run.map((e) => e.note) };
    }
    return null;
  }
}
