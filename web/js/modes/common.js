// Shared pieces for the modes: capturing an attempt, playing with the global volume.
import * as bus from '../bus.js';
import { data } from '../store.js';
import { loopOn } from '../loop.js';

/** Scale velocities of note-ons by the volume setting. */
export function withGain(events) {
  const g = data.settings.gain || 1;
  if (g === 1) return events;
  return events.map((e) => (e.m[0] & 0xf0) === 0x90 && e.m[2] > 0
    ? { ...e, m: [e.m[0], e.m[1], Math.max(1, Math.min(127, Math.round(e.m[2] * g)))] } : e);
}

export async function playEvents(events, opts) {
  return bus.play(withGain(events), opts);
}

/**
 * Plays a phrase and, while "Pętla" is on, plays it again and again (seamless, scheduled ahead).
 * repeat: {events, seconds} for the passes after the first (e.g. without the count-in).
 * onPass(k, start) after each repeat is scheduled; onEnd(end) when the loop was switched off.
 */
export class Looper {
  constructor({ onPass = null, onEnd = null } = {}) {
    this.onPass = onPass;
    this.onEnd = onEnd;
    this.stopped = true;
    this.k = 0;
    this.timer = null;
  }

  async start(events, seconds, { gap = 0.5, lead = null, at = null, repeat = null } = {}) {
    this.cancel();
    this.stopped = false;
    const gen = this.gen = (this.gen || 0) + 1;
    this.rep = repeat || { events, seconds };
    this.gap = gap;
    this.k = 0;
    const t0 = await playEvents(events, at != null ? { at } : lead != null ? { lead } : undefined);
    if (this.stopped || gen !== this.gen) return t0;   // stopped or restarted meanwhile
    this.passEnd = t0 + seconds;
    this.arm();
    return t0;
  }

  arm() {
    const next = this.passEnd + this.gap;
    const gen = this.gen;
    this.timer = bus.at(next - 0.7, async () => {
      if (this.stopped || gen !== this.gen) return;
      if (!loopOn()) { this.stopped = true; if (this.onEnd) this.onEnd(this.passEnd); return; }
      this.k++;
      try { await playEvents(this.rep.events, { at: next }); } catch { this.stopped = true; return; }
      if (gen !== this.gen) return;
      if (this.stopped) { bus.stop(); return; }
      this.passEnd = next + this.rep.seconds;
      if (this.onPass) this.onPass(this.k, next);
      this.arm();
    });
  }

  /** True while the phrase still repeats (or will). */
  get active() { return !this.stopped; }

  /** Stop repeating; silence=true also cuts a repeat that is sounding right now. */
  stop(silence = true) {
    const cut = silence && !this.stopped && this.k > 0 && bus.now() < this.passEnd;
    this.cancel();
    if (cut) bus.stop();
  }

  cancel() { this.stopped = true; if (this.timer) this.timer(); this.timer = null; }
}

/**
 * Collects the user's note-ons after `notBefore` (server time).
 * Done when `expected` notes arrived and `settle` s passed, or `quiet` s after the last note.
 */
export class Capture {
  constructor({ notBefore, expected, settle = 0.6, quiet = 2.4, onUpdate = null }) {
    this.notBefore = notBefore;
    this.expected = expected;
    this.settle = settle;
    this.quiet = quiet;
    this.onUpdate = onUpdate;
    this.notes = [];
    this.early = 0;
    this.timer = null;
    this.done = new Promise((resolve) => { this.resolve = resolve; });
    this.closed = false;
  }

  feed(e) {
    if (this.closed || !e.on) return;
    if (e.ts < this.notBefore) { this.early++; return; }
    this.notes.push({ p: e.note, ts: e.ts, v: e.vel, raw: e.raw });
    if (this.onUpdate) this.onUpdate(this.notes);
    clearTimeout(this.timer);
    const wait = this.notes.length >= this.expected ? this.settle : this.quiet;
    this.timer = setTimeout(() => this.finish(), wait * 1000);
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.resolve(this.notes);
  }

  cancel() { this.closed = true; clearTimeout(this.timer); this.resolve(null); }
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function seed() { return (Date.now() ^ (Math.random() * 1e9)) >>> 0; }
