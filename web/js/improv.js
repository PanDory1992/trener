// Improwizacja (1.14): the left hand keeps a pattern, the right hand improvises under one rule per round, the band
// (drums only) plays a vamp. Pure, no DOM; tested in improv.test.js.
// Two axes: 'lewa' (the left-hand ladder, from a pulsing drone to anticipations) and 'prawa' (the right-hand rules,
// from one note per bar to the third on beat one). Grading splits the hands at middle C.
// What is measured besides "right or wrong": the left hand never stopping, how far apart the hands hit together
// (pianists' melody leads the bass by 10–30 ms, Palmer 1996), the swing ratio of the right hand's eighths,
// how much space the right hand leaves, and whether the left hand drifts.
import { jamCycle, countIn, timing, GROOVE } from './grooves.js';
import { keyAt, PROGRESSIONS } from './theory.js';

export const SPLIT = 60;   // middle C: below is the left hand, from here up the right hand

// --- the left-hand ladder --------------------------------------------------------------------------------------------
// slots: b = beat in the bar (0-based), r = what: R root, 5 fifth, C any chord tone, N the next chord's root
export const LH = [
  { from: 1, id: 'dron', name: 'Burdon w puls', how: 'Pryma akordu na „raz” każdego taktu. Uderzasz, nie trzymasz.', slots: [[0, 'R']] },
  { from: 2, id: 'polowki', name: 'Bas na 1 i 3', how: 'Pryma na „raz” i na „trzy”. Ręka luźna, nadgarstek miękki.', slots: [[0, 'R'], [2, 'R']] },
  { from: 3, id: 'pompa', name: 'Pompa: pryma–kwinta', how: 'Ćwierćnuty na zmianę: pryma, kwinta, pryma, kwinta.', slots: [[0, 'R'], [1, '5'], [2, 'R'], [3, '5']] },
  { from: 4.5, id: 'umpa', name: 'Bas i akord', how: 'Pryma na „raz” i „trzy”, akord (dwa, trzy dźwięki) na „dwa” i „cztery”. Szkielet gospel i ballad.', slots: [[0, 'R'], [1, 'C'], [2, '5'], [3, 'C']] },
  { from: 6, id: 'rozlozony', name: 'Rozłożony ósemkami', how: 'Ósemki: pryma, kwinta, oktawa, kwinta. Ręka zostaje w jednym miejscu.', slots: [[0, 'R'], [0.5, '5'], [1, 'R'], [1.5, '5'], [2, 'R'], [2.5, '5'], [3, 'R'], [3.5, '5']] },
  { from: 7.5, id: 'przedtakt', name: 'Przedtakt', how: 'Pryma na „raz”, kwinta na „trzy”, a następny akord przychodzi wcześniej, „na i” przed „raz”. To robi groove.', slots: [[0, 'R'], [2, '5'], [3.5, 'N']] },
];

// --- the right-hand rules --------------------------------------------------------------------------------------------
// set: which notes (degrees above the tonic, see SETS); grid: 1 = quarters, 0.5 = eighths
export const RH = [
  { from: 1, id: 'jeden', name: 'Jeden dźwięk na takt', how: 'Prawa: jeden dźwięk z akordu, na „raz” każdego taktu. Nic więcej.', set: 'chord', grid: 1 },
  { from: 2, id: 'trzy', name: 'Trzy dźwięki', how: 'Prawa: tylko trzy świecące dźwięki, w dowolnym rytmie ćwierćnut. Cała uwaga w rytm i pauzy.', set: 'three', grid: 1 },
  { from: 3, id: 'pytanie', name: 'Pytanie i odpowiedź', how: 'Dwa takty grasz, dwa takty milczysz i słuchasz. Lewa gra cały czas.', set: 'penta', grid: 1 },
  { from: 4, id: 'penta', name: 'Pentatonika', how: 'Pięć świecących dźwięków. Kończ każdą frazę na dźwięku akordu (mocne kropki).', set: 'penta', grid: 0.5 },
  { from: 5, id: 'motyw', name: 'Motyw i powtórka', how: 'Takty 1–2: krótki motyw. Takty 3–4: ten sam rytm, inne dźwięki. Potem znowu.', set: 'penta', grid: 0.5 },
  { from: 6, id: 'nai', name: 'Zacznij na „i”', how: 'Każdą frazę zaczynaj po uderzeniu, „na i”, a nie na „raz”. Tak brzmi swing i soul.', set: 'penta', grid: 0.5 },
  { from: 7, id: 'blue', name: 'Niebieska nuta', how: 'Dodaj jeden „brudny” dźwięk i od razu go rozwiąż półtonem w górę. Co najmniej dwa razy.', set: 'blue', grid: 0.5 },
  { from: 8, id: 'tercja', name: 'Tercja na „raz”', how: 'Na „raz” każdego taktu trafiaj w tercję akordu. Pomiędzy grasz cokolwiek ze skali.', set: 'scale', grid: 0.5 },
];

const SETS = {
  major: { three: [0, 2, 4], penta: [0, 2, 4, 7, 9], blue: [0, 2, 3, 4, 7, 9], scale: [0, 2, 4, 5, 7, 9, 11] },
  minor: { three: [0, 3, 5], penta: [0, 3, 5, 7, 10], blue: [0, 3, 5, 6, 7, 10], scale: [0, 2, 3, 5, 7, 8, 10] },
};
// the blue move: ♭3 → 3 in major, ♭5 → 5 in minor (degrees above the tonic)
const BLUE = { major: [3, 4], minor: [6, 7] };

// vamps from the shared progressions (theory.js); bpc = bars per chord
const VAMPS = [
  { id: 'vamp14', bpc: 2, from: 1 }, { id: 'eleanor', bpc: 2, from: 1 }, { id: 'dorycki', bpc: 2, from: 2.5 },
  { id: 'folk1415', bpc: 1, from: 3 }, { id: 'hymn', bpc: 1, from: 3.5 }, { id: 'watchtower', bpc: 1, from: 4 },
  { id: 'mollPodstawa', bpc: 1, from: 4.5 }, { id: 'miksolidyjski', bpc: 1, from: 5 }, { id: 'smutnyPop', bpc: 1, from: 5 },
  { id: 'turnaround', bpc: 1, from: 6.5 }, { id: 'neosoul', bpc: 1, from: 7 }, { id: 'blues', bpc: 1, from: 7 }, { id: 'jazzMoll', bpc: 1, from: 8 },
];
const GROOVES_4 = [['ballada', 1], ['pop', 2], ['halftime', 3], ['neosoul', 4], ['shuffle', 5], ['funk', 6], ['swing', 7], ['bossa', 8]];
const KEY_WALK = [0, 1, 11, 2, 10, 3, 9];   // wheel steps: C/a, G/e, F/d, D/h, B♭/g, A/fis, E♭/c

export const lhAt = (lv) => LH.filter((s) => lv >= s.from).pop();
export const rhAt = (lv) => RH.filter((s) => lv >= s.from).pop();

/** A round: {lh, rh, vamp, keyIdx, mode, groove, tempo}. axes: {lewa, prawa}; r: rng(). */
export function improvPlan(axes, r, { prev = null } = {}) {
  const L = axes.lewa ?? 1, P = axes.prawa ?? 1, lo = Math.min(L, P);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const vamps = VAMPS.filter((v) => lo >= v.from && (!prev || v.id !== prev.vamp.id || VAMPS.filter((x) => lo >= x.from).length === 1));
  const vamp = pick(vamps);
  const mode = PROGRESSIONS.find((p) => p.id === vamp.id).mode;
  const keys = KEY_WALK.slice(0, Math.min(KEY_WALK.length, 1 + Math.floor(Math.max(0, lo - 1) / 1.5)));
  const tempo = Math.round(Math.min(104, 58 + 2.6 * lo));
  const grooves = GROOVES_4.filter(([g, from]) => lo >= from && GROOVE[g] && tempo >= GROOVE[g].range[0] && tempo <= GROOVE[g].range[1]).map(([g]) => g);
  // plain triads until 5 (the right hand has enough to think about), then the groove's own colour (sevenths, ninths)
  return { lh: lhAt(L), rh: rhAt(P), vamp, keyIdx: pick(keys), mode, groove: grooves.length ? pick(grooves) : 'ballada', tempo, color: lo < 5 ? 'triads' : 'auto' };
}

/** The same round, easier where it went wrong: 'lewa' or 'prawa' one rung down, and a bit slower. */
export function easierImprov(plan, weak = 'prawa') {
  const down = (list, s) => list[Math.max(0, list.indexOf(s) - 1)];
  return { ...plan, tempo: Math.max(54, Math.round(plan.tempo * 0.9)), lh: weak === 'lewa' ? down(LH, plan.lh) : plan.lh, rh: weak === 'prawa' ? down(RH, plan.rh) : plan.rh, easy: true };
}

/** The tonic, the chord of every bar, the band's events. bars: [{start, chord: {rootPc, pcs, third, fifth, name}}]. */
export function improvRound(plan, { rng = Math.random, drummer = 2, bars: want = 8 } = {}) {
  const key = keyAt(plan.keyIdx, plan.mode);
  const prog = PROGRESSIONS.find((p) => p.id === plan.vamp.id);
  const g = GROOVE[plan.groove];
  const tm = timing(g, plan.tempo);
  const ci = countIn(plan.groove, plan.tempo, true);
  const events = [...ci.events];
  const bars = [];
  let barOffset = 0;
  while (bars.length < want) {
    const lap = jamCycle({ key, prog, groove: plan.groove, tempo: plan.tempo, barsPerChord: plan.vamp.bpc, color: plan.color || 'auto', band: true, role: 'wszystko', drummer, fill: false, crash: barOffset === 0, barOffset, rng });
    const t0 = ci.seconds + barOffset * tm.bar;
    events.push(...lap.events.map((e) => ({ ...e, t: e.t + t0 })));
    for (let b = 0; b < lap.bars; b++) {
      const at = b * tm.bar + 1e-6;
      const c = lap.chords.find((x) => at >= x.start && at < x.end) || lap.chords[lap.chords.length - 1];
      bars.push({ start: t0 + b * tm.bar, chord: chordInfo(c.chord) });
    }
    barOffset += lap.bars;
  }
  return { key, tonic: key.tonicPc, beat: tm.beat, barLen: tm.bar, swing: g.swing || 0, leadIn: ci.seconds, bars, seconds: ci.seconds + bars.length * tm.bar, events };
}

function chordInfo(ch) {
  const pcs = ch.tones.map((t) => t.pc);
  const role = (re) => { const k = (ch.roles || []).findIndex((x) => re.test(x)); return k >= 0 ? pcs[k] : null; };
  return { rootPc: ch.root.pc, pcs, third: role(/^b?3$/), fifth: role(/^[b#]?5$/) ?? (ch.root.pc + 7) % 12, name: ch.name };
}

/** The notes the right hand may use in a bar (pitch classes). Chord tones are always fine, except in "Trzy dźwięki". */
export function allowedRH(round, plan, bar) {
  const c = round.bars[bar].chord;
  if (plan.rh.set === 'chord') return c.pcs;
  const set = SETS[plan.mode][plan.rh.set].map((d) => (round.tonic + d) % 12);
  return plan.rh.set === 'three' ? set : [...new Set([...set, ...c.pcs])];
}

/** Where the left hand should be, in seconds from the round start, with the pitch classes that fit. */
export function lhSlots(round, plan) {
  const out = [];
  round.bars.forEach((bar, k) => {
    for (const [b, r] of plan.lh.slots) {
      const off = b % 1 ? round.swing * round.beat : 0;     // offbeat eighths swing with the groove
      const next = round.bars[k + 1] || round.bars[0];
      const pcs = r === 'R' ? [bar.chord.rootPc] : r === '5' ? [bar.chord.fifth, bar.chord.rootPc] : r === 'N' ? [next.chord.rootPc] : bar.chord.pcs;
      out.push({ t: bar.start + b * round.beat + off, bar: k, r, pcs });
    }
  });
  return out;
}

/** Cluster onsets that are together (a chord) into one hit: [{t, pcs, notes}]. */
export function clusters(notes, gap = 0.04) {
  const out = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const last = out[out.length - 1];
    if (last && n.t - last.t <= gap) { last.notes.push(n.p); last.pcs.add(n.p % 12); } else out.push({ t: n.t, notes: [n.p], pcs: new Set([n.p % 12]) });
  }
  return out;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * Grade a round. notes: [{t (seconds from the round start, latency already taken off), p}] — note-ons only.
 * → {scores: {lewa, prawa}, passed, tip, lh: {...}, rh: {...}, sync, swing, space, density, drift}
 */
export function gradeImprov(plan, round, notes) {
  const tol = Math.max(0.07, Math.min(0.13, round.beat * 0.2));
  const L = clusters(notes.filter((n) => n.p < SPLIT));
  const R = clusters(notes.filter((n) => n.p >= SPLIT));
  // a note a little before the bar line belongs to the new bar (anticipation, nerves)
  const barOf = (t) => Math.max(0, Math.min(round.bars.length - 1, Math.floor((t - round.leadIn + 0.25 * round.beat) / round.barLen)));

  // --- left hand: every slot of the pattern
  const slots = lhSlots(round, plan);
  const used = new Set();
  let got = 0, timeOnly = 0;
  const devs = [];
  const missedRun = { len: 0, max: 0, at: -1 };
  for (const s of slots) {
    let best = -1;
    L.forEach((c, k) => { if (!used.has(k) && Math.abs(c.t - s.t) <= tol && (best < 0 || Math.abs(c.t - s.t) < Math.abs(L[best].t - s.t))) best = k; });
    if (best >= 0) {
      used.add(best);
      const fits = [...L[best].pcs].some((pc) => s.pcs.includes(pc));
      if (fits) got++; else timeOnly++;
      devs.push({ t: s.t, d: L[best].t - s.t });
      missedRun.len = 0;
    } else {
      missedRun.len += 1;
      if (missedRun.len > missedRun.max) { missedRun.max = missedRun.len; missedRun.at = s.bar; }
    }
  }
  const lhScore = Math.round(100 * (got + 0.5 * timeOnly) / slots.length);
  const perBar = plan.lh.slots.length;
  const stopped = missedRun.max >= Math.max(2, perBar + 1) && L.length > 0 ? missedRun.at + 1 : missedRun.max >= slots.length ? 1 : 0;
  // drift of the left hand: ms per bar (least squares of the deviation over time)
  let drift = null;
  if (devs.length >= 6) {
    const mt = mean(devs.map((x) => x.t)), md = mean(devs.map((x) => x.d));
    const num = devs.reduce((s, x) => s + (x.t - mt) * (x.d - md), 0), den = devs.reduce((s, x) => s + (x.t - mt) ** 2, 0);
    drift = den ? Math.round((num / den) * round.barLen * 1000) : 0;
  }

  // --- right hand
  const bars = round.bars.length;
  const rhNotes = notes.filter((n) => n.p >= SPLIT);
  const inSet = rhNotes.length ? rhNotes.filter((n) => allowedRH(round, plan, barOf(n.t)).includes(n.p % 12)).length / rhNotes.length : 0;
  const grid = plan.rh.grid * round.beat;
  const onGrid = (t) => {
    const x = t - round.leadIn;
    const k = Math.round(x / grid);
    const off = plan.rh.grid < 1 && k % 2 ? round.swing * round.beat : 0;
    return Math.abs(x - (k * grid + off)) <= tol;
  };
  const timingOk = R.length ? R.filter((c) => onGrid(c.t)).length / R.length : 0;
  const barsWith = new Set(R.map((c) => barOf(c.t)));
  // phrases: hits closer than a beat and a half belong together
  const phrases = [];
  R.forEach((c) => { const last = phrases[phrases.length - 1]; if (last && c.t - last[last.length - 1].t <= round.beat * 1.5) last.push(c); else phrases.push([c]); });
  const task = taskScore(plan, round, R, rhNotes, phrases, barOf);
  const rhScore = R.length ? Math.round(100 * (0.35 * inSet + 0.35 * timingOk + 0.3 * task.score)) : 0;

  // --- what is easy to miss
  const pairs = [];
  for (const c of L) { const near = R.filter((x) => Math.abs(x.t - c.t) <= 0.07); if (near.length) pairs.push(near.reduce((a, b) => (Math.abs(b.t - c.t) < Math.abs(a.t - c.t) ? b : a)).t - c.t); }
  const sync = pairs.length >= 4 ? Math.round(mean(pairs) * 1000) : null;
  const sync_abs = pairs.length >= 4 ? Math.round(mean(pairs.map(Math.abs)) * 1000) : null;
  const ratios = [];
  for (let k = 0; k + 1 < R.length; k++) {
    const x = R[k].t - round.leadIn, beatIdx = Math.round(x / round.beat);
    if (Math.abs(x - beatIdx * round.beat) > round.beat * 0.12) continue;
    const y = R[k + 1].t - round.leadIn - beatIdx * round.beat;
    if (y > round.beat * 0.35 && y < round.beat * 0.85) ratios.push(y / (round.beat - y));
  }
  const swing = ratios.length >= 6 ? Math.round(mean(ratios) * 100) / 100 : null;
  const space = Math.round(100 * (bars - barsWith.size) / bars);
  const density = Math.round((R.length / bars) * 10) / 10;

  const scores = { lewa: lhScore, prawa: rhScore };
  const passed = lhScore >= 80 && rhScore >= 80;
  const tip = pickTip(plan, round, { lhScore, got, timeOnly, slots: slots.length, stopped, R, inSet, timingOk, task, density, sync_abs, swing, space, drift });
  return { scores, passed, tip, lh: { score: lhScore, got, timeOnly, slots: slots.length, stopped, hits: L.map((c) => c.t) }, rh: { score: rhScore, inSet, timing: timingOk, task, hits: R.map((c) => c.t), notes: rhNotes.length },
    sync, syncAbs: sync_abs, swing, space, density, drift };
}

function taskScore(plan, round, R, rhNotes, phrases, barOf) {
  const bars = round.bars.length;
  const id = plan.rh.id;
  const frac = (a, b) => (b ? a / b : 0);
  if (id === 'jeden') {
    let good = 0;
    for (let b = 0; b < bars; b++) {
      const inBar = R.filter((c) => barOf(c.t) === b);
      if (inBar.length === 1 && Math.abs(inBar[0].t - round.bars[b].start) <= round.beat * 0.3) good++;
    }
    return { score: good / bars, text: `${good} z ${bars} taktów: jeden dźwięk na „raz”` };
  }
  if (id === 'trzy') {
    const pcs = new Set(rhNotes.map((n) => n.p % 12));
    const fillBars = new Set(R.map((c) => barOf(c.t))).size;
    return { score: Math.min(1, fillBars / (bars * 0.6)) * (pcs.size <= 3 ? 1 : 0.5), text: `${pcs.size} różnych dźwięków, grane w ${fillBars} z ${bars} taktów` };
  }
  if (id === 'pytanie') {
    const q = [], a = [];
    for (let b = 0; b < bars; b++) (Math.floor(b / 2) % 2 === 0 ? q : a).push(b);
    const played = new Set(R.map((c) => barOf(c.t)));
    const qs = q.filter((b) => played.has(b)).length, as = a.filter((b) => !played.has(b)).length;
    return { score: (frac(qs, q.length) + frac(as, a.length)) / 2, text: `pytania: ${qs} z ${q.length} taktów, cisza w odpowiedziach: ${as} z ${a.length}` };
  }
  if (id === 'penta') {
    const ends = phrases.filter((p) => p.length >= 2).map((p) => p[p.length - 1]);
    const ok = ends.filter((c) => [...c.pcs].some((pc) => round.bars[barOf(c.t)].chord.pcs.includes(pc))).length;
    return { score: ends.length ? ok / ends.length : 0, text: `${ok} z ${ends.length} fraz kończy się na dźwięku akordu` };
  }
  if (id === 'motyw') {
    const block = 2 * round.barLen;
    const rhythm = (k) => new Set(R.filter((c) => c.t >= round.leadIn + k * block && c.t < round.leadIn + (k + 1) * block)
      .map((c) => Math.round((c.t - round.leadIn - k * block) / (round.beat / 2))));
    const sims = [];
    for (let k = 0; k + 1 < bars / 2; k += 2) {
      const a = rhythm(k), b = rhythm(k + 1);
      if (a.size < 2) continue;
      const inter = [...a].filter((x) => b.has(x) || b.has(x - 1) || b.has(x + 1)).length;
      sims.push(inter / Math.max(a.size, b.size));
    }
    const s = sims.length ? mean(sims) : 0;
    return { score: Math.min(1, s / 0.7), text: sims.length ? `odpowiedź powtarza rytm motywu w ${Math.round(s * 100)}%` : 'za mało dźwięków w motywie' };
  }
  if (id === 'nai') {
    const starts = phrases.map((p) => p[0].t - round.leadIn);
    const off = starts.filter((x) => { const f = (x / round.beat) % 1; return f > 0.3 && f < 0.85; }).length;
    return { score: starts.length ? off / starts.length : 0, text: `${off} z ${starts.length} fraz zaczyna się „na i”` };
  }
  if (id === 'blue') {
    const [from, to] = BLUE[plan.mode].map((d) => (round.tonic + d) % 12);
    const seq = [...rhNotes].sort((a, b) => a.t - b.t);
    let n = 0;
    for (let k = 0; k + 1 < seq.length; k++) if (seq[k].p % 12 === from && seq[k + 1].p % 12 === to && seq[k + 1].p - seq[k].p === 1 && seq[k + 1].t - seq[k].t < 0.5) n++;
    return { score: Math.min(1, n / 2), text: `niebieska nuta rozwiązana ${n} razy` };
  }
  // tercja
  let ok = 0, tried = 0;
  for (let b = 0; b < bars; b++) {
    const first = R.find((c) => Math.abs(c.t - round.bars[b].start) <= round.beat * 0.35);
    if (!first) continue;
    tried++;
    if (first.pcs.has(round.bars[b].chord.third)) ok++;
  }
  return { score: ok / bars, text: `tercja na „raz” w ${ok} z ${bars} taktów${tried > ok ? ` (${tried - ok} razy inny dźwięk)` : ''}` };
}

function pickTip(plan, round, x) {
  if (x.stopped) return { kind: 'lh-stop', text: `Lewa stanęła w okolicy taktu ${x.stopped}. Zasada: gdy się sypie, milknie prawa, nie lewa. Lewa to zespół.` };
  if (x.lhScore < 60) {
    if (x.got + x.timeOnly < x.slots * 0.6) return { kind: 'lh-time', text: `Lewa gubi puls: trafiona w czas ${x.got + x.timeOnly} z ${x.slots} razy. Zagraj rundę samą lewą, prawa milczy.` };
    return { kind: 'lh-pitch', text: `Lewa jest w czasie, ale nie w dźwiękach. ${plan.lh.how}` };
  }
  if (!x.R.length) return { kind: 'rh-none', text: 'Prawa milczała. Zacznij od jednego dźwięku na takt, lewa niech gra dalej.' };
  if (x.inSet < 0.75) return { kind: 'rh-notes', text: `Prawa wychodzi poza dźwięki rundy (${Math.round((1 - x.inSet) * 100)}% obok). Świecą na klawiaturze, mocne kropki to dźwięki akordu.` };
  if (x.timingOk < 0.6) return { kind: 'rh-time', text: `Prawa ucieka od pulsu: w czasie ${Math.round(x.timingOk * 100)}% uderzeń. Przyklej dźwięki do ${plan.rh.grid < 1 ? 'ósemek' : 'uderzeń'} perkusji.` };
  if (x.task.score < 0.6) return { kind: 'rh-task', text: `Zadanie „${plan.rh.name}”: ${x.task.text}. ${plan.rh.how}` };
  if (x.density > 6 && plan.rh.from <= 5) return { kind: 'density', text: `Średnio ${String(x.density).replace('.', ',')} dźwięku na takt. Spróbuj połowę mniej: cisza też gra.` };
  if (x.drift !== null && Math.abs(x.drift) >= 15) return { kind: 'drift', text: `Lewa ${x.drift < 0 ? 'przyspiesza' : 'zwalnia'} o ok. ${Math.abs(x.drift)} ms na takt. Słuchaj werbla na „dwa” i „cztery”.` };
  if (x.sync_abs !== null && x.sync_abs > 45) return { kind: 'sync', text: `Gdy ręce grają razem, rozjeżdżają się średnio o ${x.sync_abs} ms. U pianistów melodia wyprzedza bas o 10–30 ms; więcej znaczy, że ręce grają osobno.` };
  if (x.space < 10 && plan.rh.from >= 3) return { kind: 'space', text: 'Prawa grała prawie w każdym takcie. Zostaw czasem cały takt ciszy: wtedy słychać lewą i frazy mają oddech.' };
  return { kind: null, text: `Lewa i prawa razem. ${x.task.text.charAt(0).toUpperCase()}${x.task.text.slice(1)}.` };
}

/** Notes the left hand would play, for "Posłuchaj lewej": the pattern over the same bars (Trener's channel). */
export function lhDemo(round, plan) {
  const ev = [];
  const slots = lhSlots(round, plan);
  slots.forEach((s, k) => {
    const end = (slots[k + 1] ? slots[k + 1].t : s.t + round.beat) - 0.03;
    const bar = round.bars[s.bar];
    const low = (pc) => 36 + ((pc - 36) % 12 + 12) % 12;      // C2–B2
    let notes;
    if (s.r === 'C') notes = bar.chord.pcs.slice(0, 3).map((pc) => 48 + ((pc - 48) % 12 + 12) % 12);
    else if (s.r === 'R' && plan.lh.id === 'rozlozony' && Math.round(s.t / round.beat) % 2 === 1) notes = [low(s.pcs[0]) + 12];
    else notes = [low(s.pcs[0])];
    for (const n of notes) ev.push({ t: s.t, m: [0x90, n, s.r === 'C' ? 58 : 78] }, { t: Math.max(s.t + 0.05, end), m: [0x80, n, 0] });
  });
  return ev;
}
