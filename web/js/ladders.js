// What a level means, in words, for each exercise and axis (1.10). Pure; kept next to the generators in music.js:
// every rung here is a threshold there (tests/ladders.test.js checks the important ones).
import { rung } from './drill.js';
import { LH, RH } from './improv.js';

export const AXES = {
  echo: [['melodia', 'Melodia'], ['rytm', 'Rytm'], ['dynamika', 'Dynamika']],
  dynamika: [['ksztalt', 'Kształt']],
  akordy: [['akordy', 'Akordy']],
  docelowe: [['docelowe', 'Harmonia']],
  ucho: [['ucho', 'Słuch']],
  aksak: [['metrum', 'Metrum'], ['puls', 'Puls']],
  improv: [['lewa', 'Lewa ręka'], ['prawa', 'Prawa ręka']],
};

export const axisNames = (id) => (AXES[id] || []).map(([n]) => n);

export const LADDERS = {
  echo: {
    // music.js echoMotif: length 3 + floor(L/2); pool 1 / 3 / 5 / all at 2, 3.5, 5; keys from 4; leaps 4, 7; scales 6.5, 8
    melodia: [[1, 'jeden dźwięk, 3 nuty'], [2, '3 sąsiednie dźwięki, 4 nuty'], [3.5, '5 dźwięków skali'], [4, 'skoki, różne tonacje, 5 nut'],
      [5, 'cała skala'], [6, '6 nut'], [6.5, 'skale molowe'], [7, 'częstsze skoki'], [8, 'skale bałkańskie, 7 nut'], [10, '8 nut']],
    // rhythm sets at 3, 5, 7; tempo 66 + 4·R
    rytm: [[1, 'ćwierćnuty'], [3, 'ósemki'], [5, 'nuty z kropką'], [7, 'synkopy']],
    dynamika: [[1, 'crescendo i diminuendo'], [4, 'akcenty i tarasy']],
  },
  dynamika: {
    // dynamicsPhrase: 6 + floor(L/2) notes; shapes at 3, 5, 7
    ksztalt: [[1, 'crescendo i diminuendo'], [3, 'fala i dolina'], [5, 'tarasy i akcenty'], [7, 'akcenty w crescendo, węższy zakres']],
  },
  akordy: {
    // chordGymPlan thresholds 3, 5, 7, 9
    akordy: [[1, 'trójdźwięki popowe, 3 tonacje'], [3, 'więcej tonacji, czasem pryma w basie'], [5, 'septymowe: ii–V–I, blues'],
      [7, 'shell: 1, 3, 7 lewą ręką'], [9, 'bez prymy, 10 tonacji']],
  },
  docelowe: {
    // planFor in modes/docelowe.js: progressions at 3, 5, 8; one bar per chord from 6
    docelowe: [[1, 'pop i bałkańska, 2 takty na akord'], [3, 'też ii–V–I'], [5, 'jazz i blues'], [6, '1 takt na akord'], [8, 'jazz molowy']],
  },
  ucho: {
    // earMelody: length at 2, 4, 6; leaps from 3; keys from 4; no first note + cadence from 5; tunes 6.5; scales 8.5
    ucho: [[1, '3 dźwięki, pierwszy widać'], [2, '4 dźwięki'], [3, 'skoki'], [4, 'różne tonacje, 5 dźwięków'],
      [5, 'bez pierwszego dźwięku, z kadencją'], [6.5, 'znane melodie'], [8.5, 'skale molowe i bałkańskie']],
  },
  aksak: {
    // aksakPlan: meters at 3, 6, 9 (metrum); help off at 6, silent bars at 9 (puls)
    metrum: [[1, '7/8 i 5/8'], [3, 'lesnoto 3+2+2'], [6, '9/8'], [9, '11/8']],
    puls: [[1, 'z cichymi ósemkami'], [6, 'bez podpowiedzi ósemek'], [9, 'co drugi takt cisza']],
  },
  improv: {
    // improv.js: the left-hand ladder and the right-hand rules are the rungs themselves
    lewa: LH.map((s) => [s.from, s.name.toLowerCase()]),
    prawa: RH.map((s) => [s.from, s.name.toLowerCase()]),
  },
};

/** Tempo said next to the rung, where the level sets it. */
const TEMPO = {
  echo: (ax) => `${Math.round(66 + ax.rytm * 4)} BPM`,
  docelowe: (ax) => `${Math.round(Math.min(160, 72 + ax.docelowe * 7))} BPM`,
  aksak: (ax) => `${Math.round(60 / Math.max(0.12, 0.3 - ax.puls * 0.014))} ósemek/min`,
  improv: (ax) => `${Math.round(Math.min(104, 58 + 2.6 * Math.min(ax.lewa, ax.prawa)))} BPM`,
};
const TEMPO_AXIS = { echo: 'rytm', docelowe: 'docelowe', aksak: 'puls', improv: 'lewa' };

/**
 * {now: [{axis, label, text, level}], next: {label, text} | null}
 * opts.focus (Echo): only that axis is described. Echo's dynamics start when melody and rhythm reach 5.5.
 */
export function describe(id, axes, opts = {}) {
  const names = AXES[id] || [];
  const now = [];
  let next = null;
  let nextGap = Infinity;
  for (const [axis, label] of names) {
    if (opts.focus && opts.focus !== 'all' && axis !== opts.focus) continue;
    const lv = axes[axis] ?? 1;
    const r = rung(LADDERS[id][axis], lv);
    let text = r.now;
    if (TEMPO[id] && TEMPO_AXIS[id] === axis) text += `, ${TEMPO[id](axes)}`;
    if (id === 'echo' && axis === 'dynamika' && (!opts.focus || opts.focus === 'all') && Math.min(axes.melodia, axes.rytm) < 5.5) {
      now.push({ axis, label, text: 'jeszcze bez (od 5,5 w melodii i rytmie)', level: lv, off: true });
      continue;
    }
    now.push({ axis, label, text, level: lv });
    if (r.next && r.nextAt - lv < nextGap) { nextGap = r.nextAt - lv; next = { label, text: r.next, at: r.nextAt }; }
  }
  return { now, next };
}
