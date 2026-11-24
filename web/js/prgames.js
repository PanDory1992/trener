// Trening in the Progresje tab (1.21): games that teach hearing and playing harmony. Pure, no DOM; tested in prgames.test.js.
// Each game: plan(level, rng) → a round; grade(...) → { score 0–100, tip, ... }. Levels 1–12 move with drill.stepLevel.
//   slyszBas   Słysz bas: Trener plays a progression, you answer each chord with its bass (left hand);
//   coTo       Co to za progresja?: the band plays a loop, you pick it from 3–4 cards;
//   funkcja    Dom, wyjście, napięcie: after a cadence one chord, you say T, S or D (later also "pożyczony");
//   palec      Jeden palec: from one triad to another by P/L/R moves (one note moves each time);
//   nuta       Jedna nuta, wiele akordów: find chords that hold one melody note;
//   mod        Jeden dźwięk zmienia mod: change one note of a scale over a drone and hear the mode change.
import { ALL_KEYS, keyAt, QUALITY } from './theory.js';
import { stepChords, identify } from './chords.js';
import { CATALOG, signature, withBars } from './progs.js';
import { triadOfChord, plr, plrPath, triadId, parseTriad, triadPcs, PLR_SAY, analyze } from './lenses.js';
import { fnOf } from './colors.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const shuffle = (r, a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const C_MAJOR = ALL_KEYS.find((k) => k.mode === 'major' && k.tonicPc === 0);
const A_MINOR = ALL_KEYS.find((k) => k.mode === 'minor' && k.tonicPc === 9);

/** Keys for a level: C (and a) first, then one more key on each side of the wheel every level or two. */
export function keysFor(level, mode = 'major') {
  const n = Math.min(12, 1 + Math.floor(Math.max(0, level - 2) / 1.2));
  const out = [];
  for (let k = 0; k < n; k++) out.push(keyAt(k % 2 ? 12 - Math.ceil(k / 2) : Math.ceil(k / 2), mode));
  return out;
}

export const GAMES = {
  slyszBas: { name: 'Słysz bas', about: 'Gram progresję. Potem gram każdy akord jeszcze raz i czekam: zagraj jego bas lewą ręką (dowolna oktawa poniżej środkowego C). Od poziomu 3 bez nazw, od 6 akordy z kreską.' },
  coTo: { name: 'Co to za progresja?', about: 'Zespół gra pętlę. Wybierz, która to z kart. Słuchaj basu i tego, gdzie jest dom.' },
  funkcja: { name: 'Dom, wyjście, napięcie', about: 'Najpierw kadencja, żebyś wiedział, gdzie jest dom. Potem jeden akord: czy to dom (T), wyjście (S), czy napięcie (D)? Od poziomu 5 także „pożyczony”.' },
  palec: { name: 'Jeden palec', about: 'Start i cel na siatce. Graj trójdźwięki tak, żeby za każdym razem ruszał się tylko jeden palec. Dojdź do celu najkrótszą drogą.' },
  nuta: { name: 'Jedna nuta, wiele akordów', about: 'Jeden dźwięk melodii. Znajdź jak najwięcej akordów, w których on jest. Pokazuję, którym składnikiem akordu jest i z jakiej funkcji.' },
  mod: { name: 'Jeden dźwięk zmienia mod', about: 'Bas trzyma tonikę. Zmień jeden dźwięk skali, którą widzisz, i zagraj nową skalę w górę. Usłyszysz, jak mod jaśnieje albo ciemnieje.' },
};

// --- Słysz bas ------------------------------------------------------------------------------------------------------
/** A round: a progression (by level) in a key, and the bass pitch class of each chord. */
export function slyszBasPlan(level, r = Math.random) {
  const minor = level >= 7 && r() < 0.35;
  const mode = minor ? 'minor' : 'major';
  const pool = CATALOG.filter((p) => p.mode === mode && p.tier <= Math.max(1, Math.ceil(level / 1.5)) && p.steps.length <= 8
    && (level >= 6 || !p.steps.some((s) => s.bass)) && (level >= 5 || p.steps.every((s) => s.a === 0)));
  const prog = pick(r, pool.length ? pool : CATALOG.filter((p) => p.mode === mode && p.tier <= 2));
  const key = level <= 2 ? (minor ? A_MINOR : C_MAJOR) : pick(r, keysFor(level, mode));
  const chords = stepChords(key, withBars(prog.steps), { color: 'triads' }).filter((x) => !x.rest);
  return { game: 'slyszBas', level, key, prog, chords: chords.map((x) => x.chord), names: level < 3, bass: chords.map((x) => (x.chord.bassPc != null ? x.chord.bassPc : x.chord.root.pc)) };
}
/** Your answers (lowest note below 60 for each chord, or null) → score and a tip. */
export function slyszBasGrade(plan, answers) {
  const ok = plan.bass.map((pc, k) => answers[k] != null && mod12(answers[k]) === pc);
  const n = ok.filter(Boolean).length;
  const score = Math.round((n / plan.bass.length) * 100);
  const miss = ok.findIndex((x) => !x);
  let tip = null;
  if (miss >= 0) {
    const c = plan.chords[miss];
    const a = answers[miss];
    const d = a == null ? null : mod12(a - plan.bass[miss]);
    tip = a == null ? `Przy ${c.name} nie było basu. Graj lewą poniżej środkowego C.`
      : d === 7 || d === 5 ? `Przy ${c.name} zagrałeś kwintę akordu zamiast basu. Bas jest niżej, „pod” akordem.`
      : `Przy ${c.name} bas to ${plan.chords[miss].bassPc != null ? c.name.split('/')[1] : c.root.name}. Zaśpiewaj go, zanim zagrasz.`;
  }
  return { score, ok, tip };
}

// --- Co to za progresja? -------------------------------------------------------------------------------------
export function coToPlan(level, r = Math.random) {
  const mode = level >= 6 && r() < 0.3 ? 'minor' : 'major';
  const maxTier = Math.max(1, Math.ceil(level / 1.6));
  const pool = CATALOG.filter((p) => p.mode === mode && p.tier <= maxTier && p.steps.length <= 8 && p.steps.length >= 2);
  const bySig = new Map();
  for (const p of pool) { const s = signature(p.steps); if (!bySig.has(s)) bySig.set(s, p); }
  const distinct = [...bySig.values()];
  const answer = pick(r, distinct);
  const n = level >= 4 ? 4 : 3;
  const others = shuffle(r, distinct.filter((p) => p !== answer)).slice(0, n - 1);
  const key = level <= 3 ? (mode === 'minor' ? A_MINOR : C_MAJOR) : pick(r, keysFor(level, mode));
  return { game: 'coTo', level, key, answer, options: shuffle(r, [answer, ...others]), plays: 0 };
}
export function coToGrade(plan, chosenId, plays = 1) {
  const right = chosenId === plan.answer.id;
  const score = right ? Math.max(70, 100 - (plays - 1) * 15) : 0;
  const tip = right ? null : `To była „${plan.answer.name}”. Posłuchaj, od czego się zaczyna: ${plan.answer.mood}.`;
  return { score, right, tip };
}

// --- Dom, wyjście, napięcie ---------------------------------------------------------------------------------
const FN_POOL = {
  major: [[1, 0, 'maj', 'T'], [6, 0, 'min', 'T'], [3, 0, 'min', 'T'], [4, 0, 'maj', 'S'], [2, 0, 'min', 'S'], [5, 0, 'maj', 'D'], [5, 0, 'dom7', 'D'], [7, 0, 'dim', 'D']],
  borrowed: [[4, 0, 'min', 'X'], [6, -1, 'maj', 'X'], [7, -1, 'maj', 'X'], [3, -1, 'maj', 'X'], [2, -1, 'maj', 'X']],
};
export function funkcjaPlan(level, r = Math.random) {
  const key = level <= 2 ? C_MAJOR : pick(r, keysFor(level, 'major'));
  const pool = [...FN_POOL.major.filter(([d]) => level >= 3 || [1, 4, 5].includes(d)), ...(level >= 5 ? FN_POOL.borrowed : [])];
  const [d, a, q, fn] = pick(r, pool);
  const chord = stepChords(key, [{ k: 'chord', d, a, q, bars: 1 }], { color: 'triads' })[0].chord;
  return { game: 'funkcja', level, key, chord, fn, options: level >= 5 ? ['T', 'S', 'D', 'X'] : ['T', 'S', 'D'] };
}
export const FN_WORDS = { T: 'dom (T)', S: 'wyjście (S)', D: 'napięcie (D)', X: 'pożyczony' };
export function funkcjaGrade(plan, answer) {
  const right = answer === plan.fn;
  const tip = right ? null : plan.fn === 'X' ? `${plan.chord.name} nie jest z tej tonacji: to pożyczka.` : `${plan.chord.name} to ${FN_WORDS[plan.fn]}. ${plan.fn === 'D' ? 'Słychać, że chce iść dalej.' : plan.fn === 'T' ? 'Można na nim skończyć.' : 'Oddala od domu, ale nie ciągnie tak mocno jak 5.'}`;
  return { score: right ? 100 : 0, right, tip };
}

// --- Jeden palec -----------------------------------------------------------------------------------------------
export function palecPlan(level, r = Math.random) {
  const want = Math.min(5, 1 + Math.floor((level + 1) / 2));
  const all = [];
  for (let p = 0; p < 12; p++) all.push(triadId(p, 'maj'), triadId(p, 'min'));
  const startPool = level <= 3 ? ['0M', '7M', '5M', '9m'] : all;
  for (let tries = 0; tries < 200; tries++) {
    const from = pick(r, startPool);
    const cands = all.filter((t) => plrPath(from, t).length === want);
    if (cands.length) { const to = pick(r, cands); return { game: 'palec', level, from, to, best: plrPath(from, to), moves: [] }; }
  }
  return { game: 'palec', level, from: '0M', to: '8M', best: plrPath('0M', '8M'), moves: [] };
}
/** One chord you played (MIDI notes) during the game: { ok, id, move, done } — ok when it is a P/L/R neighbour of the last triad. */
export function palecStep(plan, notes) {
  const pcs = [...new Set(notes.map(mod12))];
  if (pcs.length !== 3) return { ok: false, id: null, say: 'Zagraj trzy różne dźwięki: trójdźwięk.' };
  let id = null;
  for (const root of pcs) for (const k of ['maj', 'min']) { const t = triadId(root, k); const tp = triadPcs(t); if (tp.every((x) => pcs.includes(x))) id = t; }
  if (!id) return { ok: false, id: null, say: 'To nie jest trójdźwięk durowy ani molowy.' };
  const last = plan.moves.length ? plan.moves[plan.moves.length - 1].id : plan.from;
  if (id === last) return { ok: false, id, same: true, say: '' };
  const nb = plr(last);
  const move = Object.keys(nb).find((m) => nb[m] === id);
  if (!move) return { ok: false, id, say: `Z ${triadName(last)} do ${triadName(id)} rusza się więcej niż jeden palec. Wróć do ${triadName(last)}.` };
  plan.moves.push({ id, move });
  return { ok: true, id, move, say: PLR_SAY[move], done: id === plan.to };
}
export function palecGrade(plan) {
  const used = plan.moves.length;
  const best = plan.best.length;
  const score = plan.moves.length && plan.moves[used - 1].id === plan.to ? Math.round(100 * Math.min(1, best / used)) : 0;
  return { score, used, best, tip: score < 100 && score > 0 ? `Najkrótsza droga ma ${best} ${best === 1 ? 'ruch' : best < 5 ? 'ruchy' : 'ruchów'}: ${plan.best.map((x) => x.move).join(' → ')}.` : null };
}
const NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'H'];
export function triadName(id) { const { root, kind } = parseTriad(id); return NAMES[root] + (kind === 'min' ? 'm' : ''); }

// --- Jedna nuta, wiele akordów --------------------------------------------------------------------------
export function nutaPlan(level, r = Math.random) {
  const key = level <= 3 ? C_MAJOR : pick(r, keysFor(level, 'major'));
  const deg = pick(r, level <= 2 ? [0, 7] : [0, 2, 4, 5, 7, 9]);
  const pc = mod12(key.tonicPc + deg);
  const target = level <= 2 ? 4 : level <= 5 ? 6 : level <= 8 ? 8 : 10;
  return { game: 'nuta', level, key, pc, target, found: [] };
}
/** A chord you hold: counts when it contains the note (any role) and is not found yet. */
export function nutaStep(plan, notes) {
  const r = identify(notes, plan.key);
  if (!r || r.kind !== 'chord' || !r.chord) return { ok: false, say: '' };
  const c = r.chord;
  const idx = c.tones.findIndex((t) => t.pc === plan.pc);
  if (idx < 0) return { ok: false, name: c.name, say: `W ${c.name} nie ma tego dźwięku.` };
  if (plan.found.some((f) => f.name === r.name)) return { ok: false, name: r.name, again: true, say: `${r.name} już jest.` };
  const role = c.roles[idx];
  const fn = fnOf(plan.key, c);
  const top = notes.length && mod12(Math.max(...notes)) === plan.pc;
  plan.found.push({ name: r.name, role, fn, top });
  return { ok: true, name: r.name, role, fn, top, say: `${r.name}: ten dźwięk to ${role === '1' ? 'pryma' : role === '3' ? 'tercja' : role === '5' ? 'kwinta' : role === '7' ? 'septyma' : `${role}`}${top ? ', na górze, jak w melodii' : ''}.` };
}
export function nutaGrade(plan) {
  const n = plan.found.length;
  const tops = plan.found.filter((f) => f.top).length;
  const score = Math.round(Math.min(1, n / plan.target) * 85 + Math.min(1, tops / Math.max(1, n)) * 15);
  return { score, n, tip: n < plan.target ? 'Szukaj też poza tonacją: 4m, ♭6, akordy septymowe.' : tops < n ? 'Spróbuj trzymać ten dźwięk na górze akordu: wtedy śpiewa jak melodia.' : null };
}

// --- Jeden dźwięk zmienia mod ---------------------------------------------------------------------------
// the ladder from the brightest to the darkest, one note each time, then three colours
export const MOD_STEPS = [
  { from: 'dur', to: 'miksolidyjska', change: [7, -1], say: '7 → ♭7: dur robi się bluesowy, rockowy.' },
  { from: 'miksolidyjska', to: 'dorycka', change: [3, -1], say: '3 → ♭3: robi się moll, ale jasny, z durową 6. Funk i jazz.' },
  { from: 'dorycka', to: 'moll', change: [6, -1], say: '6 → ♭6: zwykły, smutny moll naturalny.' },
  { from: 'moll', to: 'frygijska', change: [2, -1], say: '2 → ♭2: ciemno, hiszpańsko, półton nad domem.' },
  { from: 'frygijska', to: 'lokrycka', change: [5, -1], say: '5 → ♭5: najciemniejszy mod, nawet dom jest zmniejszony.' },
  { from: 'dur', to: 'lidyjska', change: [4, 1], say: '4 → ♯4: jaśniej niż dur, unoszenie, muzyka filmowa.' },
  { from: 'moll', to: 'harm', change: [7, 1], say: '♭7 → 7: moll harmoniczny, dźwięk prowadzący ciągnie do domu. Bałkany, klasyka.' },
  { from: 'frygijska', to: 'hidzaz', change: [3, 1], say: '♭3 → 3: hidżaz. Flamenco, klezmer, Bliski Wschód.' },
  { from: 'miksolidyjska', to: 'mixoB6', change: [6, -1], say: '6 → ♭6: miksolidyjska ♭6. Na dole dur, na górze moll.' },
];
export function modPlan(level, r = Math.random) {
  const i = Math.min(MOD_STEPS.length - 1, Math.floor(Math.max(0, level - 1) / 1.2));
  const step = level <= 2 ? MOD_STEPS[Math.floor(r() * 2)] : MOD_STEPS[Math.floor(r() * (i + 1))];
  const key = level <= 4 ? C_MAJOR : pick(r, keysFor(level, 'major'));
  return { game: 'mod', level, key, ...step };
}
