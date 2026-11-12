// The metronome click: on the piano (high C, as it always was) or on its own MIDI channel 16, where Studio One
// has a "Klik" track with a sampler. Pads C1..G1 (MIDI 36..43) are variants 1..8. Pure, no imports.

export const CLICK_CH = 15;            // MIDI channel 16 (0-based)
export const PADS = 8;
const PIANO_NOTE = 96;                 // C7 on the piano: the old click

let cfg = { out: 'piano', sound: 1, accent: 0 };

/** settings: { clickOut: 'piano'|'ch16', clickSound: 1..8, clickAccent: 0 (same pad, louder) | 1..8 } */
export function setClick(settings = {}) {
  const pad = (v, d) => (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= PADS ? Number(v) : d);
  cfg = {
    out: settings.clickOut === 'ch16' ? 'ch16' : 'piano',
    sound: pad(settings.clickSound, 1),
    accent: Number(settings.clickAccent) === 0 ? 0 : pad(settings.clickAccent, 0),
  };
}

export const clickConfig = () => ({ ...cfg });
export const padNote = (n) => 35 + n;   // 1 → 36 (C1)

/**
 * One click as two /api/play events. pianoVel = the velocity this click always had on the piano (soft clicks on
 * off-beats are low, the first beat higher); accent = this is the first beat of a bar or of a count-in. pianoNote: where it sounds in piano mode.
 */
export function clickEvents(t, pianoVel, accent = false, len = 0.05, pianoNote = PIANO_NOTE) {
  if (cfg.out === 'ch16') {
    const note = padNote(accent && cfg.accent ? cfg.accent : cfg.sound);
    const vel = Math.max(1, Math.min(127, Math.round(pianoVel * 1.8 + (accent && !cfg.accent ? 12 : 0))));
    return [{ t, m: [0x90 | CLICK_CH, note, vel] }, { t: t + len, m: [0x80 | CLICK_CH, note, 0] }];
  }
  return [{ t, m: [0x90, pianoNote, pianoVel] }, { t: t + len, m: [0x80, pianoNote, 0] }];
}
