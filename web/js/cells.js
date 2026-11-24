// Album komórek: short "molecules" of harmony that come back in all music (ii–V–I, IV–iv–I, ♭VI–♭VII–I …).
// Each cell: how it sounds, where you hear it, the move that makes it, a demo, and a detector that finds it in any
// chords (your songs). Plus a simple spaced review. Pure, no DOM; tested in cells.test.js.
import { stepChords } from './chords.js';
import { parseNumerals } from './progs.js';
import { triadOf, commonTones } from './lenses.js';
import { QUALITY } from './theory.js';
import { parseChart, guessKeys, chordObj } from './songs.js';

const mod12 = (x) => ((x % 12) + 12) % 12;

// [id, name, level, patterns {major?, minor?} | null (detector), sound, where, move, demo {mode, rn}]
const RAW = [
  ['autentyczna', 'Kadencja 5 → 1', 1, { major: 'V I', minor: 'V i' }, 'Napięcie i dom. Najmocniejsze zakończenie: dźwięk prowadzący wchodzi w tonikę.', 'Koniec prawie każdej piosenki i każdego utworu klasycznego.', 'dominanta', ['major', 'IV V7 I*2']],
  ['plagalna', 'Kadencja „amen” 4 → 1', 1, { major: 'IV I', minor: 'iv i' }, 'Dom bez napięcia, jak westchnienie ulgi.', 'Hymny, gospel, rock (np. finał „Hey Jude”).', 'amen', ['major', 'I IV I*2']],
  ['zwodnicza', 'Kadencja zwodnicza 5 → 6m', 1, { major: 'V vi', minor: 'V bVI' }, 'Czekasz na dom, a dostajesz krewnego. Opowieść skręca.', 'Ballady, Bach, piosenki z „jeszcze jednym” refrenem.', 'zwodnicza', ['major', 'IV V vi*2']],
  ['popLoop', 'Pętla popu 1–5–6m–4', 1, { major: 'I V vi IV' }, 'Cztery akordy, na których stoi radio. Każde przesunięcie startu zmienia nastrój.', '„Let It Be”, „No Woman, No Cry”, tysiące piosenek.', 'krewny', ['major', 'I V vi IV']],
  ['lata50', 'Lata 50. 1–6m–4–5', 1, { major: 'I vi IV V' }, 'Doo-wop: bas schodzi tercjami, 5 ciągnie do domu.', '„Stand By Me”, „Every Breath You Take”.', 'krewny', ['major', 'I vi IV V']],
  ['iiVI', '2–5–1', 2, { major: 'ii V I', minor: 'ii° V i' }, 'Najważniejsze zdanie jazzu: przygotowanie, napięcie, dom. Wszystko po kole kwintowym.', 'Każdy standard jazzowy.', 'iiV', ['major', 'ii7 V7 Imaj7*2']],
  ['iiV', '2–5 do dowolnego celu', 3, null, 'Molowy akord, potem dominanta kwartę wyżej: zapowiedź nowego domu, nawet na chwilę.', 'Jazz, bossa, musicale: każda „wycieczka” do innej tonacji.', 'iiV', ['major', 'I*2 v7 I7 IV*2']],
  ['dominantaWtorna', 'Dominanta wtórna', 2, null, 'Akord spoza tonacji, który robi z następnego akordu dom na chwilę.', '„Hallelujah” (3⁷ → 6m), Beatlesi, ragtime.', 'dominanta', ['major', 'I III7 vi IV']],
  ['molowaPlagalna', 'Molowa subdominanta 4m → 1', 2, { major: 'iv I' }, 'Jeden dźwięk schodzi o półton i wraca. Wzruszenie w durze.', '„In My Life”, „Creep”, finały filmów.', 'molowaS', ['major', 'I IV iv I']],
  ['mario', '♭6–♭7–1 (bohater)', 2, { major: 'bVI bVII I' }, 'Dwa durowe schody z molowej do domu. Zwycięsko.', 'Mario, finały rockowe, muzyka filmowa.', 'mario', ['major', 'I IV bVI bVII I*2']],
  ['miksolidyjska', '♭7 → 4 → 1 (rock)', 2, { major: 'bVII IV I' }, 'Podwójna kadencja plagalna: dwa kroki „amen” jeden po drugim.', '„Hey Jude” (koda), „Sweet Child o’ Mine”.', 'pozyczka', ['major', 'I bVII IV I']],
  ['andaluzyjska', 'Kadencja andaluzyjska', 2, { minor: 'i bVII bVI V' }, 'Bas schodzi czterema stopniami do durowej dominanty.', '„Hit the Road Jack”, flamenco, Bałkany.', 'pozyczka', ['minor', 'i bVII bVI V']],
  ['dorycka', 'Durowe 4 w mollu (dorycka)', 2, { minor: 'i IV' }, 'Jeden jasny dźwięk (podwyższona 6) robi z mollu funk.', '„Oye Como Va”, „Evil Ways”, funk.', 'pozyczka', ['minor', 'i7*2 IV7*2']],
  ['royal', 'Królewska droga 4–5–3m–6m', 3, { major: 'IV V iii vi' }, 'Wspina się do 5 i zamiast do domu skręca w smutek. Tęsknota.', 'J-pop, anime, „Just the Two of Us”.', 'krewny', ['major', 'IVmaj7 V7 iii7 vi7']],
  ['tylne', 'Tylne drzwi 4m7 → ♭7⁷ → 1', 4, { major: 'iv bVII I' }, 'Do domu bokiem, bez dźwięku prowadzącego. Miękko, soulowo.', 'Soul, standardy, ballady jazzowe.', 'tylne', ['major', 'Imaj7 iv7 bVII7 Imaj7']],
  ['tryton', 'Zastępstwo trytonowe', 5, null, 'Dominanta pół tonu nad celem: bas schodzi półtonem do domu.', 'Jazz, bossa nova, neo-soul.', 'tryton', ['major', 'ii7 bII7 Imaj7*2']],
  ['zmniejszony', 'Zmniejszony przejściowy', 3, null, 'Akord °7, którego pryma wchodzi półtonem w następny akord. Bas idzie chromatycznie.', 'Gospel, standardy, ragtime.', 'zmniejszony', ['major', 'I #i°7 ii7 V7']],
  ['medianta', 'Medianta chromatyczna', 4, null, 'Dwa akordy tego samego rodzaju o tercję od siebie, jeden wspólny dźwięk. Filmowo.', 'Muzyka filmowa, kosmos, zwroty akcji.', 'medianta', ['major', 'I bVI I bIII']],
  ['linia', 'Linia w akordzie', 3, null, 'Akord stoi, a jeden głos schodzi półtonami.', '„My Funny Valentine”, „Something”, James Bond.', 'linia', ['minor', 'i imaj7 i7 i6']],
  ['basWDol', 'Bas schodzi krokiem', 2, null, 'Lewa ręka idzie gamą w dół, akordy zmieniają się nad nią.', 'Kanon Pachelbela, „A Whiter Shade of Pale”, „Someone Like You”.', 'basKrokiem', ['major', 'I V/7 vi I/5 IV I/3 ii V']],
  ['hidzaz', 'Hidżaz ♭2 → 1', 3, { major: 'bII I' }, 'Półton nad domem w durowej tonice: flamenco, Bliski Wschód, klezmer.', 'Flamenco, klezmer, muzyka bałkańska.', 'pozyczka', ['major', 'I bII I*2']],
  ['neapol', 'Neapolitański ♭2 → 5', 5, { minor: 'bII V', major: 'bII V' }, 'Przyciemnione 2 przed dominantą. Operowo, romantycznie.', 'Beethoven, Chopin, Rachmaninow, ballady.', 'neapol', ['minor', 'i iv bII/4 V i']],
  ['kadencyjny', 'Kadencyjny 6/4', 4, null, 'Dom z kwintą w basie tuż przed dominantą. Uroczyste zakończenie.', 'Koncerty, chorały, hymny.', 'kadencyjny', ['major', 'IV I/5 V7 I']],
  ['pikardyjska', 'Tercja pikardyjska', 3, null, 'Molowy utwór kończy się durowym akordem. Światło na koniec.', 'Bach, chorały, ballady.', 'pikardyjska', ['minor', 'i iv V I']],
];

export const CELLS = RAW.map(([id, name, level, patterns, sound, where, move, [mode, rn]]) => ({ id, name, level, patterns, sound, where, move, demo: { mode, steps: parseNumerals(rn) } }));
export const CELL_BY_ID = Object.fromEntries(CELLS.map((c) => [c.id, c]));

// --- detection --------------------------------------------------------------------------------------------------
const base = (q) => triadOf(q);
const isDom = (q) => { const iv = (QUALITY[q] || QUALITY.maj).iv.map(mod12); return iv.includes(4) && iv.includes(10); };
/** Chord objects → tokens relative to the tonic, repeats collapsed: [{ semi, base, dom, root, bass, chord, k }]. */
export function tokens(key, chords) {
  const out = [];
  chords.forEach((c, k) => {
    if (!c || !c.root) return;
    const t = { semi: mod12(c.root.pc - key.tonicPc), base: base(c.quality), dom: isDom(c.quality), root: c.root.pc, bass: c.bassPc != null ? c.bassPc : c.root.pc, chord: c, k };
    const p = out[out.length - 1];
    if (p && p.semi === t.semi && p.base === t.base && p.bass === t.bass && p.chord.quality === c.quality) return;
    out.push(t);
  });
  return out;
}

const patternCache = new Map();
function patternTokens(rn, mode) {
  const id = `${mode}|${rn}`;
  if (!patternCache.has(id)) {
    const key = { tonicPc: 0, li: 0, acc: 0, mode };
    patternCache.set(id, parseNumerals(rn).map((s) => ({ semi: mod12([0, 2, 4, 5, 7, 9, 11][s.d - 1] + s.a), base: base(s.q) })));
  }
  return patternCache.get(id);
}
const sameBase = (a, b) => a === b || (a === 'maj' && b === 'sus') || (a === 'sus' && b === 'maj');

const DETECT = {
  iiV: (t, i, n) => { const a = t[i], b = t[(i + 1) % n]; return a.base === 'min' && b.dom && mod12(b.root - a.root) === 5 && !(a.semi === 2 && b.semi === 7); },
  dominantaWtorna: (t, i, n, key) => { const a = t[i], b = t[(i + 1) % n]; return a.dom && mod12(b.root - a.root) === 5 && a.semi !== 7 && !(key.mode === 'minor' && a.semi === 7); },
  tryton: (t, i, n) => { const a = t[i], b = t[(i + 1) % n]; return a.dom && mod12(a.root - b.root) === 1; },
  zmniejszony: (t, i, n) => { const a = t[i], b = t[(i + 1) % n]; return a.base === 'dim' && mod12(b.root - a.root) === 1 || (a.base === 'dim' && mod12(b.bass - a.root) === 1); },
  medianta: (t, i, n) => { const a = t[i], b = t[(i + 1) % n]; if (!['maj', 'min'].includes(a.base) || a.base !== b.base || a.dom || b.dom) return false; const iv = mod12(b.root - a.root); return [3, 4, 8, 9].includes(iv) && commonTones(a.chord, b.chord) === 1; },
  linia: (t, i, n) => n >= 3 && i + 2 < n && t[i].root === t[i + 1].root && t[i + 1].root === t[i + 2].root,
  basWDol: (t, i, n) => { if (n < 3 || i + 2 >= n) return false; const d1 = mod12(t[i].bass - t[i + 1].bass), d2 = mod12(t[i + 1].bass - t[i + 2].bass); return d1 >= 1 && d1 <= 2 && d2 >= 1 && d2 <= 2; },
  kadencyjny: (t, i, n) => { const a = t[i], b = t[(i + 1) % n]; return a.semi === 0 && mod12(a.bass - a.root) === 7 && b.semi === 7; },
  pikardyjska: (t, i, n, key) => key.mode === 'minor' && i === n - 1 && n > 2 && t[i].semi === 0 && t[i].base === 'maj',
};

/** Cells found in chord objects in a key: [{ cell, at (chord index) }], one per cell, in order of appearance. */
export function findCells(key, chords, { loop = true } = {}) {
  const t = tokens(key, chords);
  const n = t.length;
  if (n < 2) return [];
  const found = new Map();
  for (const cell of CELLS) {
    const pat = cell.patterns && cell.patterns[key.mode];
    for (let i = 0; i < n && !found.has(cell.id); i++) {
      if (!loop && cell.patterns && pat && i + patternTokens(pat, key.mode).length > n) break;
      if (pat) {
        const p = patternTokens(pat, key.mode);
        if (p.length > n) break;
        if (p.every((x, j) => { const y = t[(i + j) % n]; return (loop || i + j < n) && y.semi === x.semi && sameBase(y.base, x.base); })) found.set(cell.id, { cell, at: t[i].k });
      } else if (DETECT[cell.id] && (loop || i + 1 < n) && DETECT[cell.id](t, i, n, key)) found.set(cell.id, { cell, at: t[i].k });
    }
  }
  return [...found.values()].sort((a, b) => a.at - b.at);
}

/** Cells in editor steps (a progression or a song's section). */
export function cellsInSteps(key, steps, opts) {
  return findCells(key, stepChords(key, steps, { color: 'triads' }).filter((x) => !x.rest).map((x) => x.chord), opts);
}

// --- the album (record in modes.progresje.album) -------------------------------------------------------------------
export const BOX_DAYS = [1, 2, 4, 7, 15, 30];
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Put a cell in the album (no change when it is there). Returns the record. */
export function collect(album, id, today) {
  if (!album[id]) album[id] = { added: today, box: 0, due: addDays(today, 1), ok: 0, tries: 0 };
  return album[id];
}

/** After a review: heard and played right → next box (later), not → back to the first box (tomorrow). */
export function review(album, id, ok, today) {
  const r = collect(album, id, today);
  r.tries++;
  if (ok) { r.ok++; r.box = Math.min(BOX_DAYS.length - 1, r.box + 1); } else r.box = 0;
  r.due = addDays(today, BOX_DAYS[r.box]);
  r.last = today;
  return r;
}

/** Cells due today (or overdue), the oldest first. */
export function dueCells(album, today) {
  return Object.entries(album || {}).filter(([id, r]) => CELL_BY_ID[id] && r.due <= today).sort((a, b) => a[1].due.localeCompare(b[1].due)).map(([id]) => id);
}

/** "umiem" for a cell: box 0–1 new, 2–3 learning, 4+ known. */
export const cellStage = (r) => (!r ? 0 : r.box >= 4 ? 3 : r.box >= 2 ? 2 : 1);

/** Which cells each song holds (whole song, its own key): [{ id, title, key, cells: [cellId] }]. */
export function songCells(songs) {
  const out = [];
  for (const s of songs || []) {
    try {
      const ch = parseChart(s.text || '');
      if (!ch.chords.length) continue;
      const g = guessKeys(ch.chords)[0];
      if (!g) continue;
      const cells = findCells(g.key, ch.chords.map(chordObj), { loop: false }).map((x) => x.cell.id);
      out.push({ id: s.id, title: s.title, key: g.key, cells });
    } catch { /* a song that does not parse is skipped */ }
  }
  return out;
}
