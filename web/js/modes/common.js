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

/**
 * Latency check (1.10, moved from Aksak to Ustawienia): 10 clicks, tap along from the 3rd; the median of your
 * offsets is how late you hear the sound. feed(e) with every note-on; resolves with ms (0–150) or null.
 */
export function measureLatency(onStatus) {
  const beat = 0.6, n = 10;
  const taps = [];
  let t0 = null;
  const events = [];
  for (let k = 0; k < n; k++) { events.push({ t: k * beat, m: [0x90, 84, 80] }); events.push({ t: k * beat + 0.08, m: [0x80, 84, 0] }); }
  const done = playEvents(events).then((start) => new Promise((resolve) => {
    t0 = start;
    onStatus('Stukaj dowolnym klawiszem razem z kliknięciami, od trzeciego.');
    bus.at(t0 + n * beat + 0.4, () => {
      const devs = taps.map((t) => { const k = Math.round((t - t0) / beat); return k >= 2 && k < n ? (t - t0) - k * beat : null; })
        .filter((d) => d !== null && Math.abs(d) < beat / 3).sort((a, b) => a - b);
      if (devs.length < 4) { onStatus('Za mało stuknięć. Spróbuj jeszcze raz.'); resolve(null); return; }
      resolve(Math.max(0, Math.min(150, Math.round(devs[Math.floor(devs.length / 2)] * 1000))));
    });
  }));
  return { done, feed(e) { if (e.on && t0 !== null) taps.push(e.ts); } };
}
