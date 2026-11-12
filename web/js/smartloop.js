// "Mądra pętla": what the next pass of a loop should be, from how the last one went.
// Clean → a little faster. Mistakes in one place → loop just that place, a bit slower, until it is
// clean twice, then the whole thing again at the earlier tempo. Mistakes everywhere → slower.

export const STEP_UP = 4;
export const STEP_DOWN = 4;
export const WINDOW_SLOWER = 6;
export const WINDOW_CLEAN_NEEDED = 2;

/**
 * states: per step of the whole strip ('done' | 'part' | 'miss' | ''), only steps in `range` matter.
 * plan: { range:[a,b], full:[0,n-1], tempo, mode:'full'|'window', winClean, fullTempo, min, max }
 * Returns the next plan with a short Polish `note`.
 */
export function planNext(states, plan) {
  const { range, full, tempo, mode = 'full', winClean = 0, fullTempo = tempo, min = 40, max = 200 } = plan;
  const [a, b] = range;
  const bad = [];
  for (let i = a; i <= b; i++) if (states[i] !== 'done') bad.push(i);
  const clamp = (t) => Math.max(min, Math.min(max, Math.round(t)));
  if (mode === 'window') {
    if (!bad.length) {
      if (winClean + 1 >= WINDOW_CLEAN_NEEDED) {
        return { range: full, full, tempo: clamp(fullTempo), mode: 'full', winClean: 0, fullTempo, min, max, note: 'Trudne miejsce opanowane. Wracam do całości.' };
      }
      return { range, full, tempo: clamp(Math.min(fullTempo, tempo + 3)), mode, winClean: winClean + 1, fullTempo, min, max, note: 'Czysto. Jeszcze raz to miejsce.' };
    }
    return { range, full, tempo: clamp(tempo - STEP_DOWN), mode, winClean: 0, fullTempo, min, max, note: `To miejsce wolniej: ${clamp(tempo - STEP_DOWN)} BPM.` };
  }
  if (!bad.length) {
    return { range: full, full, tempo: clamp(tempo + STEP_UP), mode: 'full', winClean: 0, fullTempo: clamp(tempo + STEP_UP), min, max, note: `Czysto. Szybciej: ${clamp(tempo + STEP_UP)} BPM.` };
  }
  const total = b - a + 1;
  const w0 = Math.max(a, bad[0] - 1), w1 = Math.min(b, bad[bad.length - 1] + 1);
  const len = w1 - w0 + 1;
  if (total >= 4 && len <= Math.max(2, Math.floor(total * 0.6))) {
    const t = clamp(tempo - WINDOW_SLOWER);
    return { range: [w0, w1], full, tempo: t, mode: 'window', winClean: 0, fullTempo: tempo, min, max, note: `Zapętlam trudne miejsce: kroki ${w0 + 1}–${w1 + 1}, ${t} BPM.` };
  }
  return { range: full, full, tempo: clamp(tempo - STEP_DOWN), mode: 'full', winClean: 0, fullTempo: clamp(tempo - STEP_DOWN), min, max, note: `Trochę wolniej: ${clamp(tempo - STEP_DOWN)} BPM.` };
}
