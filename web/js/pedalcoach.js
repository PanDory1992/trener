// Pedal coach (13.11): at every change of harmony, did the sustain pedal blur the old chord into the new one, or
// was it changed just after the new chord (legato, "syncopated" pedalling)? Pure: feed it the keys and the pedal
// with times in seconds; tick(t) returns the verdicts whose window has closed.
//
//   good  : the pedal was down, went up at the new chord (or up to 50 ms before it) and down again after it
//   blur  : the pedal stayed down through the new chord
//   early : the pedal went up well before the new chord and down only after it (a dry gap if the hands let go)
// Single notes (melody) over a held pedal are fine and never judged; nothing is judged when the pedal was not
// used in the last few seconds.

export const CLUSTER_S = 0.08;   // keys struck within this time form one chord
export const WINDOW_S = 0.6;     // time after the chord in which the pedal should be changed
export const EARLY_S = 0.6;      // lifted this long before the chord at most to count as "early"
export const SLACK_S = 0.05;     // lifted this close before the chord still counts as changed with it
export const USE_S = 5;          // the pedal counts as "in use" this long after its last move

export const VERDICT_TEXT = {
  good: 'Pedał: czysta zmiana.',
  blur: 'Pedał: rozmazane. Zmień go przy nowym akordzie.',
  early: 'Pedał: za wcześnie. Puść go dopiero, gdy uderzysz akord.',
};

/** Did the harmony change between two chords {pcs: Set, bass}? New bass or less than half the notes shared. */
export function harmonyChanged(a, b) {
  if (!a || !b) return false;
  if (a.bass % 12 !== b.bass % 12) return true;
  let common = 0;
  for (const p of b.pcs) if (a.pcs.has(p)) common++;
  const union = new Set([...a.pcs, ...b.pcs]).size;
  return common / union < 0.5;
}

export function createPedalCoach() {
  const moves = [];          // {t, down} pedal history (last seconds)
  let down = false;
  let lastMove = -Infinity;
  let cluster = null;        // {t, notes: []}
  let prevChord = null;
  const pending = [];        // times of harmony changes waiting for their window
  const counts = { good: 0, blur: 0, early: 0 };

  function downAt(t) {
    let d = false;
    for (const m of moves) { if (m.t > t) break; d = m.down; }
    return d;
  }

  function closeCluster() {
    const c = cluster;
    cluster = null;
    if (!c || c.notes.length < 2) return;
    const chord = { pcs: new Set(c.notes.map((n) => n % 12)), bass: Math.min(...c.notes) };
    if (harmonyChanged(prevChord, chord) && c.t - lastMove < USE_S) pending.push(c.t);
    prevChord = chord;
  }

  function classify(tc) {
    const heldBefore = downAt(tc - SLACK_S);
    const ups = moves.filter((m) => !m.down);
    const downs = moves.filter((m) => m.down);
    if (heldBefore) {
      const up = ups.find((m) => m.t > tc - SLACK_S && m.t <= tc + WINDOW_S);
      if (!up) return 'blur';
      return downs.some((m) => m.t > up.t && m.t <= tc + WINDOW_S + 0.4) ? 'good' : null;   // let go and left up: not judged
    }
    const lifted = ups.filter((m) => m.t >= tc - EARLY_S && m.t <= tc - SLACK_S).pop();
    if (lifted && downs.some((m) => m.t > tc && m.t <= tc + WINDOW_S)) return 'early';
    return null;
  }

  return {
    counts,
    note(t, on, note) {
      if (!on) return;
      if (cluster && t - cluster.t > CLUSTER_S) closeCluster();
      if (!cluster) cluster = { t, notes: [] };
      cluster.notes.push(note);
    },
    pedal(t, isDown) {
      if (isDown === down) return;
      down = isDown;
      lastMove = t;
      moves.push({ t, down: isDown });
    },
    /** Verdicts [{kind, t}] whose window has closed by time t. */
    tick(t) {
      if (cluster && t - cluster.t > CLUSTER_S) closeCluster();
      const out = [];
      while (pending.length && t >= pending[0] + WINDOW_S + 0.4) {
        const tc = pending.shift();
        const kind = classify(tc);
        if (kind) { counts[kind]++; out.push({ kind, t: tc }); }
      }
      while (moves.length > 2 && moves[1].t < t - 10) moves.shift();
      return out;
    },
  };
}
