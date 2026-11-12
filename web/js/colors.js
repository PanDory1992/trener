// Stałe kolory funkcji: one colour per harmonic function, the same everywhere (Koło, Piosenki, Jam, keys).
// By degree number, the same in major and minor: 1, 3, 6 = tonika (dom), 2, 4 = subdominanta (wyjście),
// 5, 7 = dominanta (napięcie). A chord outside the key's family is neutral (grey, dashed).
// Pure (tested in node). The CSS variables --fn-t/-s/-d/-x in style.css hold the same values.
import { family } from './theory.js';
import { baseQuality } from './songs.js';

export const FN = {
  T: { name: 'tonika', short: 'T', word: 'dom', hex: '#5c9dff', css: 'var(--fn-t)' },
  S: { name: 'subdominanta', short: 'S', word: 'wyjście', hex: '#ffe066', css: 'var(--fn-s)' },
  D: { name: 'dominanta', short: 'D', word: 'napięcie', hex: '#ff5c8a', css: 'var(--fn-d)' },
  X: { name: 'spoza rodziny', short: '·', word: 'pożyczony', hex: '#a7a0c0', css: 'var(--fn-x)' },
};
const BY_DEG = { 1: 'T', 3: 'T', 6: 'T', 2: 'S', 4: 'S', 5: 'D', 7: 'D' };
const mod12 = (x) => ((x % 12) + 12) % 12;

/**
 * Function of a chord in a key: 'T' | 'S' | 'D' | 'X'.
 * chord: { root: {li, pc}, quality } (theory.chord / songs.chordObj objects both fit).
 * In the family (same root and base triad as the family chord on that degree) → by degree;
 * in minor also the natural 5m and the leading-tone 7° (harmonic minor) count as dominants.
 */
export function fnOf(key, chord) {
  if (!key || !chord || !chord.root) return 'X';
  const deg = ((((chord.root.li - key.li) % 7) + 7) % 7) + 1;
  const fam = family(key, false)[deg - 1];
  const base = baseQuality(chord.quality);
  if (fam && fam.root.pc === mod12(chord.root.pc)) {
    const want = fam.quality === 'maj' ? 'maj' : fam.quality === 'min' ? 'min' : 'dim';
    if (base === want) return BY_DEG[deg];
    if (key.mode === 'minor' && deg === 5 && base === 'min') return 'D';
  }
  if (key.mode === 'minor' && deg === 7 && mod12(chord.root.pc - key.tonicPc) === 11 && base === 'dim') return 'D';
  return 'X';
}

/** CSS colour for a function letter (falls back to neutral). */
export function fnColor(f) { return (FN[f] || FN.X).css; }

/** Class name for elements coloured by function: "fn-T" … */
export function fnClass(f) { return `fn-${FN[f] ? f : 'X'}`; }
