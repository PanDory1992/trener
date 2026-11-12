// "Graj ze mną": a guided walk through steps (notes or chords) on the keyboard.
// Three ways: wait (I light the keys and wait for you), tempo (lights move with a click),
// dark (no lights, you play from names and numbers; a hint appears after two misses).
// No grading: steps simply turn green when played.
//
// Lights fade as you master a thing (fade 0 full · 1 outlines · 2 only when you hesitate · 3 none);
// the page sets guide.fade and gets onPass() after every finished pass to count progress.
// With Pętla on and "mądra pętla", W tempie adapts: faster when clean, loops the hard spot when not.
// guide.walker = { peek() → {steps, label} | null, commit() } moves to another key after each whole pass
// (the page builds the steps; same shape). Walking keeps the run going even with Pętla off.
// Informacja po próbie: in W tempie every right note's onset (vs the step's time) and velocity is kept for the pass,
// plus a log of all your notes; after each whole pass onFeedback({hits, log, steps, times, idx, beat, tempo}) gets them.
import * as bus from '../bus.js';
import { el, fill } from '../ui.js';
import { playEvents } from './common.js';
import { loopOn } from '../loop.js';
import { planNext } from '../smartloop.js';
import { data as storeData } from '../store.js';
import { clickEvents } from '../click.js';

export const WAYS = {
  wait: { name: 'Prowadzę', help: 'Świecę klawisze i czekam, aż zagrasz. Bez pośpiechu.' },
  tempo: { name: 'W tempie', help: 'Klawisze przesuwają się z klikiem. Graj razem z nimi.' },
  dark: { name: 'Bez świateł', help: 'Grasz z nazw i numerów, bez podświetlenia. Po dwóch pomyłkach podpowiem.' },
};

const pcOf = (n) => ((n % 12) + 12) % 12;

/**
 * steps: [{ notes: [midi], marks: [{note,text,sub,tone}], label, sub, small, beats, exact }]
 * opts: { keyboard, strip, onStatus(text, kind), onDone(summary), onPass(result) → new fade, onRun, baseMarks }
 */
export class Guide {
  constructor({ keyboard, strip, onStatus = () => {}, onDone = () => {}, onStep = () => {}, onRun = () => {}, onPass = () => null, baseMarks = () => [], onFeedback = () => {} }) {
    Object.assign(this, { keyboard, strip, onStatus, onDone, onStep, onRun, onPass, baseMarks, onFeedback });
    this.resetCapture();
    this.steps = [];
    this.i = -1;
    this.way = null;
    this.running = false;
    this.held = new Set();
    this.raf = 0;
    this.cancelEnd = null;
    this.fade = 0;          // light level for this thing (set by the page)
    this.smart = true;      // mądra pętla (W tempie + Pętla)
    this.range = null;      // [a, b] steps of the current pass
    this.walker = null;     // set by the page: another key after each whole pass
    this.pending = null;    // prepared steps of the next key
  }

  /** Hits and the note log of the pass being played (and of the next one, for notes a little early). */
  resetCapture() {
    this.hits = []; this.hitKeys = new Set(); this.log = [];
    this.hitsNext = []; this.hitKeysNext = new Set(); this.logNext = [];
  }

  /** When you really played the note (router time), minus the hearing latency from Ustawienia. */
  onset(e) {
    const now = bus.now();
    const t = typeof e.ts === 'number' && Math.abs(e.ts - now) < 5 ? e.ts : now;
    return t - (Number(storeData.settings && storeData.settings.latencyMs) || 0) / 1000;
  }

  /** One right note for step k (only the first press of each key per step counts). next: it belongs to the next pass. */
  noteHit(k, e, t, sched, next = false) {
    const keys = next ? this.hitKeysNext : this.hitKeys;
    const tag = `${k}:${e.note}`;
    if (keys.has(tag) || !Number.isFinite(sched)) return;
    keys.add(tag);
    (next ? this.hitsNext : this.hits).push({ k, note: e.note, dt: t - sched, vel: e.vel });
  }

  prepare(steps) {
    return steps.map((s) => ({ ...s, pcs: new Set(s.notes.map((n) => (s.exact ? n : pcOf(n)))), found: new Set(), state: '' }));
  }

  /** Keep going after a pass? With Pętla, or while walking through keys. */
  keepGoing() { return loopOn() || !!this.walker; }

  // running: setting it tells the page (to swap Pokaż / Graj ze mną for Stop)
  get running() { return !!this._running; }
  set running(v) {
    const was = !!this._running;
    this._running = !!v;
    if (was !== this._running) this.onRun(this._running, this.way);
  }

  load(steps) {
    this.stop();
    // exact steps match the MIDI notes (both hands on the same pitch class), others any octave
    this.steps = this.prepare(steps);
    this.i = -1;
    this.range = null;
    this.renderStrip();
    this.keyboard.mark(this.fade >= 2 ? [] : this.baseMarks());
  }

  inRange(k) { return !this.range || (k >= this.range[0] && k <= this.range[1]); }

  renderStrip() {
    if (!this.strip) return;
    fill(this.strip, this.steps.map((s, k) => el('span', { class: `gstep ${s.state} ${k === this.i ? 'now' : ''} ${this.inRange(k) ? '' : 'off'}${s.fn ? ` fn fn-${s.fn}` : ''}`, 'data-k': k },
      el('b', {}, s.label), s.sub ? el('i', {}, s.sub) : null, s.small ? el('small', {}, s.small) : null)));
  }

  setStep(k) {
    this.i = k;
    this.hesitated = false;
    clearTimeout(this.hesTimer);
    this.renderStrip();
    this.showMarks();
    this.onStep(k, this.steps[k]);
    // fade 2: the lights come only when you hesitate
    const s = this.steps[k];
    if (s && this.lightLevel() === 2) {
      const delay = this.way === 'tempo' && this.timeline ? this.timeline.beat * 0.45 : 1.2;
      const step = k;
      this.hesTimer = setTimeout(() => {
        if (!this.running || this.i !== step || s.state === 'done' || s.found.size) return;
        this.hesitated = true;
        this.hintedPass = true;
        this.showMarks();
      }, delay * 1000);
    }
  }

  /** The light level actually used: Pokaż is always fully lit, Bez świateł always dark. */
  lightLevel() {
    if (this.way === 'show') return 0;
    if (this.way === 'dark') return 3;
    return Math.max(0, Math.min(3, this.fade | 0));
  }

  showMarks(hint = false) {
    const s = this.steps[this.i];
    let nxt = this.inRange(this.i + 1) ? this.steps[this.i + 1] : null;
    if (!nxt && (this.way === 'tempo' || this.way === 'show') && this.range && this.i === this.range[1] && this.keepGoing()) {
      const first = (this.plan && this.plan.range ? this.plan.range : this.range)[0];
      nxt = (this.pending || this.steps)[first];
    }
    const level = this.lightLevel();
    let marks = level >= 2 ? [] : this.baseMarks();
    if (!s) { this.keyboard.mark(marks); return; }
    const now = new Set(s.marks.map((m) => m.note));
    marks = marks.filter((m) => !now.has(m.note));
    if (hint || (level === 2 && this.hesitated) || level === 1) {
      // outlines only
      marks.push(...s.marks.map((m) => ({ ...m, ring: true })));
    } else if (level === 0) {
      if (nxt) {
        const nx = new Set(nxt.marks.map((m) => m.note));
        marks = marks.filter((m) => !nx.has(m.note) || now.has(m.note));
        marks.push(...nxt.marks.filter((m) => !now.has(m.note)).map((m) => ({ ...m, ring: true, sub: '' })));
      }
      marks.push(...s.marks);
    }
    this.keyboard.mark(marks);
  }

  // --- the three ways -----------------------------------------------------------------------
  async start(way, { tempo = 72 } = {}) {
    this.stop();
    if (!this.steps.length) return;
    this.way = way;
    this.running = true;
    this.token = this.runId;
    this.hintedPass = false;
    this.early = new Map();
    this.misses = 0;
    this.passMisses = 0;
    this.range = null;
    for (const s of this.steps) { s.found.clear(); s.state = ''; s.wrong = 0; }
    this.resetCapture();
    if (way === 'tempo') return this.startTempo(tempo);
    this.setStep(0);
    this.onStatus(way === 'dark' ? 'Graj z nazw. Klawisze się nie świecą.' : this.lightLevel() >= 2 ? 'Światła przygaszone, bo to już ci wychodzi. C58 = podpowiedź.' : 'Zagraj podświetlone.', 'turn');
  }

  async startTempo(tempo, { play = false } = {}) {
    this.pass = 1;
    this.nextTimeline = null;
    const n = this.steps.length;
    this.plan = { range: [0, n - 1], full: [0, n - 1], tempo, mode: 'full', winClean: 0, fullTempo: tempo };
    const ok = await this.schedulePass(this.plan, play, null);
    if (!ok) return;
    this.onStatus(play ? 'Słuchaj i patrz na klawisze…' : 'Odliczam takt, potem graj z klawiszami.', 'listen');
    const step = () => {
      if (!this.running || !this.timeline) return;
      const now = bus.now();
      // Pętla: the next pass is already scheduled; switch to it when it starts
      if (this.nextTimeline && now >= this.nextTimeline.start - 0.04) {
        if (this.i >= 0 && !play) this.closeTempoStep(this.i);
        const prev = this.timeline;
        if (!play) this.countTempoPass(prev);
        // what was played a little early belongs to this pass
        this.hits = this.hitsNext; this.hitKeys = this.hitKeysNext; this.log = this.logNext;
        this.hitsNext = []; this.hitKeysNext = new Set(); this.logNext = [];
        if (this.nextTimeline.walk && this.pending) {
          // the next key: new steps (same shape), the page moves the wheel and the card
          this.steps = this.pending;
          this.pending = null;   // early notes were already checked against these steps
          try { this.nextTimeline.walk.commit(); } catch (err) { console.error(err); }
        }
        this.timeline = this.nextTimeline;
        this.nextTimeline = null;
        this.range = this.timeline.range;
        for (const k of this.timeline.idx) { const s = this.steps[k]; s.found.clear(); s.state = ''; s.wrong = 0; }
        // notes played a little early for the first step of this pass
        for (const [k, pcs] of this.early) for (const pc of pcs) this.steps[k].found.add(pc);
        this.early.clear();
        this.pass++;
        this.i = -1;
        this.renderStrip();
        const tl = this.timeline;
        this.onStatus(`${loopOn() ? 'Pętla' : 'Przejście'} ${this.pass} · ${tl.tempo} BPM${tl.note ? ` · ${tl.note}` : ''}`, play ? 'listen' : 'turn');
      }
      const tl = this.timeline;
      const kk = tl.times.findIndex(([a, b]) => now >= a - 0.04 && now < b - 0.04);
      const k = kk >= 0 ? tl.idx[kk] : -1;
      if (now < tl.start - 0.04) { if (this.i !== -1) { this.i = -1; this.renderStrip(); } }
      else if (k >= 0 && k !== this.i) {
        if (this.i >= 0 && !play) this.closeTempoStep(this.i);
        if (this.i === -1 && !play && this.pass === 1) this.onStatus('Graj!', 'turn');
        this.setStep(k);
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** One pass in time (count-in only the first time). at = server time for a loop pass. */
  async schedulePass(plan, play, at, src = this.steps) {
    const tempo = plan.tempo;
    const [a, b] = plan.range;
    const idx = [];
    for (let k = a; k <= b; k++) idx.push(k);
    const beat = 60 / tempo;
    const countIn = at == null ? 4 : 0;
    const ev = [];
    let t = 0;
    const times = idx.map((k) => { const s = src[k]; const st = t; t += (s.beats || 1) * beat; return [st, t]; });
    const total = t;
    for (let q = 0; q < countIn; q++) ev.push(...clickEvents(q * beat, q === 0 ? 60 : 42, q === 0));
    const beats = Math.ceil(total / beat - 1e-6);
    for (let q = 0; q < beats; q++) {
      const tt = countIn * beat + q * beat;
      ev.push(...clickEvents(tt, q === 0 && at != null ? 46 : 34, q === 0 && at != null, 0.04));
    }
    if (play) {
      idx.forEach((k, j) => {
        const s = src[k];
        const [st, en] = times[j];
        s.notes.forEach((n, q) => { ev.push({ t: countIn * beat + st + q * 0.006, m: [0x90, n, s.vel || 64] }, { t: countIn * beat + en - 0.04, m: [0x80, n, 0] }); });
      });
    }
    const token = this.token;
    let t0;
    try { t0 = await playEvents(ev, at != null ? { at } : undefined); } catch { if (token === this.token) { this.onStatus('Serwer Trenera nie odpowiada.', 'bad'); this.running = false; } return false; }
    // stopped (or restarted) while the request was on its way: never let an old run continue
    if (!this.running || token !== this.token || token !== this.runId) { if (!this.running) bus.stop(); return false; }
    const start = t0 + countIn * beat;
    const tl = { start, end: start + total, times: times.map(([x, y]) => [start + x, start + y]), idx, range: [a, b], beat, play, tempo, note: plan.note || '', full: a === 0 && b === this.steps.length - 1, walk: plan.walk || null };
    if (at == null) { this.timeline = tl; this.range = tl.range; } else this.nextTimeline = tl;
    // shortly before the end: plan another pass if Pętla is on, else finish
    this.cancelEnd = bus.at(tl.end - 0.22, () => {
      if (!this.running || token !== this.token) return;
      if (this.keepGoing()) {
        let next = { ...this.plan, note: '', walk: null };
        let bad = false;
        if (this.way === 'tempo' && !play) {
          // judge the pass so far. A step not played yet is unknown: with clear mistakes elsewhere we act,
          // with nothing but unknowns we keep the tempo (never claim "czysto" on a guess)
          const pos = tl.idx.indexOf(this.i);
          let unknown = false;
          const states = this.steps.map((s, k) => {
            const j = tl.idx.indexOf(k);
            if (j < 0) return s.state;
            if (k === this.i && !s.state) {
              if (s.wrong) return 'part';
              if (s.found.size) return 'done';
              unknown = true; return 'done';
            }
            if (j > pos) { unknown = true; return 'done'; }
            return s.state;
          });
          bad = tl.idx.some((k) => states[k] !== 'done');
          if (this.smart) next = bad || !unknown ? planNext(states, this.plan) : { ...this.plan, note: 'Tempo bez zmian (ostatni dźwięk za późno, żeby ocenić).' };
        }
        // walking through keys: after a whole pass (clean, when it is yours to play) the next key, same tempo
        let src = this.steps;
        this.pending = null;
        if (this.walker && tl.full && !bad) {
          let w = null;
          try { w = this.walker.peek(); } catch (err) { console.error(err); }
          if (w && w.steps && w.steps.length === this.steps.length) {
            this.pending = this.prepare(w.steps);
            src = this.pending;
            next = { ...this.plan, range: [0, this.steps.length - 1], mode: 'full', winClean: 0, walk: { commit: () => this.walker && this.walker.commit() }, note: `Teraz ${w.label}` };
            if (this.i === tl.idx[tl.idx.length - 1]) this.showMarks();   // the outline of the next key's first note
          }
        }
        this.plan = { ...next, walk: null };
        this.schedulePass(next, play, tl.end, src);
      } else {
        this.cancelEnd = bus.at(tl.end + 0.15, () => { if (token === this.token) this.finish(); });
      }
    });
    return true;
  }

  /** A whole pass in time is over: tell the page (mastery); it may change the light level. */
  countTempoPass(tl) {
    if (this.way !== 'tempo' || !tl || !tl.full) return;
    const done = this.steps.filter((s) => s.state === 'done').length;
    // a pass where you asked for a hint (or the lights came on because you hesitated) is not "lights off"
    const level = this.lightLevel();
    const fadeUsed = this.hintedPass ? Math.min(level, 1) : level;
    this.hintedPass = false;
    try {
      const res = this.onPass({ way: 'tempo', done, total: this.steps.length, tempo: tl.tempo, fadeUsed });
      if (res != null) this.fade = res;
    } catch (err) { console.error(err); }
    try {
      this.onFeedback({ hits: this.hits.slice(), log: this.log.slice(), steps: this.steps, times: tl.times, idx: tl.idx, beat: tl.beat, tempo: tl.tempo });
    } catch (err) { console.error(err); }
  }

  /** Pokaż: I play it, the lights follow. */
  show(tempo = 72) {
    this.stop();
    if (!this.steps.length) return;
    this.way = 'show';
    this.running = true;
    this.token = this.runId;
    this.early = new Map();
    for (const s of this.steps) { s.found.clear(); s.state = ''; }
    return this.startTempo(tempo, { play: true });
  }

  closeTempoStep(k) {
    const s = this.steps[k];
    if (!s.state) s.state = s.found.size >= s.pcs.size ? (s.wrong ? 'part' : 'done') : s.found.size ? 'part' : 'miss';
  }

  finish() {
    if (!this.running) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hesTimer);
    if (this.way === 'tempo' && this.i >= 0) this.closeTempoStep(this.i);
    if (this.way === 'tempo') this.countTempoPass(this.timeline);
    const done = this.steps.filter((s) => s.state === 'done').length;
    const way = this.way;
    this.running = false;
    this.timeline = null;
    this.i = -1;
    this.range = null;
    this.renderStrip();
    this.keyboard.mark(this.lightLevel() >= 2 ? [] : this.baseMarks());
    this.onDone({ way, done, total: this.steps.length });
  }

  stop() {
    this.runId = (this.runId || 0) + 1;
    const was = this.running;
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hesTimer);
    this.cancelEnd && this.cancelEnd();
    this.cancelEnd = null;
    // also when the notes were sent but the timeline is not set up yet
    if (this.timeline || (was && (this.way === 'tempo' || this.way === 'show'))) bus.stop();
    this.timeline = null;
    this.nextTimeline = null;
    this.pending = null;
    this.range = null;
    if (was) { this.i = -1; this.renderStrip(); this.keyboard.mark(this.fade >= 2 ? [] : this.baseMarks()); }
  }

  hint() {
    if (!this.running || this.i < 0) return;
    this.hintedPass = true;
    this.showMarks(true);
    setTimeout(() => this.running && this.showMarks(false), 2500);
  }

  // --- notes from the player ----------------------------------------------------------------------
  feed(e) {
    if (e.on) this.held.add(e.note); else this.held.delete(e.note);
    if (!e.on || !this.running || this.i < 0) return;
    const s = this.steps[this.i];
    if (!s) return;
    const pc = s.exact ? e.note : pcOf(e.note);
    if (this.way === 'show') return;
    if (this.way === 'tempo') {
      const tl = this.timeline;
      const j = tl ? tl.idx.indexOf(this.i) : -1;
      const t = this.onset(e);
      if (s.pcs.has(pc)) {
        s.found.add(pc); this.keyboard.flash(e.note, 'good');
        if (s.found.size >= s.pcs.size && !s.state && !s.wrong) { s.state = 'done'; this.renderStrip(); }
        if (j >= 0) this.noteHit(this.i, e, t, tl.times[j][0]);
        this.log.push({ k: this.i, note: e.note, t });
      } else {
        // a little early for the next step counts for the next step (also across the loop's wrap)
        let nxK = -1, nxStart = Infinity, wrap = false;
        if (tl && j >= 0 && j + 1 < tl.idx.length) { nxK = tl.idx[j + 1]; nxStart = tl.times[j + 1][0]; }
        else if (this.nextTimeline) { nxK = this.nextTimeline.idx[0]; nxStart = this.nextTimeline.times[0][0]; wrap = true; }
        const nx = nxK >= 0 ? (wrap && this.pending ? this.pending : this.steps)[nxK] : null;
        const npc = nx && nx.exact ? e.note : pcOf(e.note);
        if (nx && tl && nxStart - bus.now() < tl.beat * 0.3 && nx.pcs.has(npc)) {
          if (wrap) { if (!this.early.has(nxK)) this.early.set(nxK, new Set()); this.early.get(nxK).add(npc); }
          else nx.found.add(npc);
          this.keyboard.flash(e.note, 'good');
          this.noteHit(nxK, e, t, nxStart, wrap);
          (wrap ? this.logNext : this.log).push({ k: nxK, note: e.note, t });
        } else {
          this.log.push({ k: this.i, note: e.note, t });
          // a wrong note spoils the step (mashing many keys is not "clean")
          s.wrong = (s.wrong || 0) + 1;
          if (s.state === 'done') { s.state = 'part'; this.renderStrip(); }
          this.keyboard.flash(e.note, 'bad');
        }
      }
      return;
    }
    // wait / dark
    if (!s.pcs.has(pc)) {
      this.keyboard.flash(e.note, 'bad');
      this.misses++;
      this.passMisses++;
      if (this.misses >= 2 && this.lightLevel() >= 2) { this.showMarks(true); this.onStatus('Podpowiedź: obrysowane klawisze.', 'listen'); }
      return;
    }
    this.keyboard.flash(e.note, 'good');
    const heldPcs = new Set([...this.held].map((n) => (s.exact ? n : pcOf(n))));
    const complete = [...s.pcs].every((p) => heldPcs.has(p));
    if (!complete) { s.found.add(pc); return; }
    s.state = this.misses ? 'part' : 'done';
    this.misses = 0;
    if (this.i + 1 >= this.steps.length) {
      // the whole thing once: count it (lights level matters only in time)
      const done = this.steps.filter((x) => x.state === 'done').length;
      try {
        const res = this.onPass({ way: this.way, done: this.steps.length, total: this.steps.length, clean: done, fadeUsed: this.lightLevel() });
        if (res != null) this.fade = res;
      } catch (err) { console.error(err); }
      this.passMisses = 0;
      if (!this.keepGoing()) { this.finish(); return; }
      // Pętla (or walking): from the beginning again, maybe in the next key
      let w = null;
      if (this.walker) { try { w = this.walker.peek(); } catch (err) { console.error(err); } }
      if (w && (!w.steps || w.steps.length !== this.steps.length)) w = null;
      this.renderStrip();
      this.onStatus(w ? `Całość! Teraz ${w.label}.` : 'Całość! Pętla: jeszcze raz od początku.', 'good');
      const myRun = this.runId = (this.runId || 0) + 1;
      setTimeout(() => {
        if (!this.running || this.runId !== myRun) return;
        if (w) {
          this.steps = this.prepare(w.steps);
          try { this.walker && this.walker.commit(); } catch (err) { console.error(err); }
        }
        for (const st of this.steps) { st.found.clear(); st.state = ''; }
        this.setStep(0);
      }, 900);
      this.i = this.steps.length;   // nothing to play until the restart
      return;
    }
    this.setStep(this.i + 1);
  }
}
