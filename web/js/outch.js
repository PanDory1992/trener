// Where Trener's own piano goes. Channel 1 belongs to Miki's keyboard (track "Ja" in Studio One); whatever Trener
// plays on the piano (chord previews, demos, "Graj ze mną", the piano click, the band's keys, the bass without the
// band) goes to channel 3 (track "Klawisze"), so the same note from Trener never cuts or swallows a note you hold.
// Drums (10), the band's bass (2) and the click (16) keep their channels. Pure; bus.play() runs every event through it.

export const TRAINER_CH = 2;   // MIDI channel 3 (0-based)

/** Note on/off on channel 1 → the same message on channel 3. Other channels and messages unchanged. */
export function toTrainerCh(events) {
  return events.map((e) => {
    const s = e.m && e.m[0];
    if (s == null || (s & 0x0f) !== 0 || ((s & 0xf0) !== 0x90 && (s & 0xf0) !== 0x80)) return e;
    return { ...e, m: [(s & 0xf0) | TRAINER_CH, e.m[1], e.m[2]] };
  });
}
