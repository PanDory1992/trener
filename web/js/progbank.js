// Bank of real progressions for the chord gym (1.12). Pure, no DOM; tested in progbank.test.js.
// Each progression is written in Roman numerals against the MAJOR scale of the key tonic (minor ones too: i, bIII,
// iv, bVI, bVII…), so one parser covers everything:
//   I ii iii IV V vi vii      case = major / minor triad;  accidentals before: bVII, #iv
//   7 (upper → dom7, lower → m7), maj7 (lower → m(maj7)), ø7, °, °7, +, 6, sus4, sus2, 7sus4
//   /3, /b7, /5 …             a bass note (scale degree of the key, with an accidental)
// Auto mode: "zestawy" (sets): one family and one key signature for three progressions, simplest first, then the
// next set moves to a neighbouring key on the circle of fifths. Which progressions: by level (core, a few below for
// review, now and then one above), the ones you have not played lately first, the ones you never played get a bonus.
import { CHORDS, keyPrefersFlat, pcName } from './music.js';

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['vii', 'vi', 'v', 'iv', 'iii', 'ii', 'i'];  // longest first for the prefix match
const ROMAN_DEG = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

export const FAMILIES = {
  pop: 'Pop',
  ballada: 'Ballada',
  rock: 'Rock i folk',
  soul: 'Soul i gospel',
  jazz: 'Jazz',
  latin: 'Latin i bossa',
  klasyka: 'Klasyka',
  balkany: 'Bałkany i klezmer',
  blues: 'Blues',
  film: 'Film i gry',
};

/** One degree like "b7", "#4", "3" → semitones above the tonic. */
function degreeSemis(s) {
  const m = /^([b#]?)([1-7])$/.exec(s);
  if (!m) throw new Error(`bad degree ${s}`);
  return (SCALE[Number(m[2]) - 1] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
}

/** "bVII7", "iiø7/1", "IVmaj7", "#iv°7" → {deg (semitones), type, bass (semitones) | null}. */
export function parseRoman(tok) {
  const [head, bassTok] = tok.split('/');
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(head);
  if (!m) throw new Error(`bad chord ${tok}`);
  const rn = m[2];
  const low = rn.toLowerCase();
  const num = ROMAN.find((r) => low === r);
  if (!num) throw new Error(`bad numeral ${tok}`);
  const upper = rn === rn.toUpperCase();
  const deg = (SCALE[ROMAN_DEG[num] - 1] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  const q = m[3];
  const TYPES = upper
    ? { '': 'maj', 7: 'dom7', maj7: 'maj7', 6: 'maj6', sus4: 'sus4', sus2: 'sus2', '7sus4': 'sus7', '+': 'aug' }
    : { '': 'min', 7: 'm7', maj7: 'mMaj7', 6: 'm6', 'ø7': 'm7b5', '°': 'dim', '°7': 'dim7' };
  const type = TYPES[q];
  if (!type || !CHORDS[type]) throw new Error(`bad quality ${tok}`);
  return { deg, type, bass: bassTok ? degreeSemis(bassTok) : null, acc: m[1], bassAcc: bassTok ? bassTok[0] : '' };
}

// [id, family, tier (≈ the level it belongs to), name, numerals, one line about it]
const RAW = [
  // --- tier 1–2: triads, the songs everyone knows -------------------------------------------------------------------
  ['axis', 'pop', 1, 'Oś popu', 'I V vi IV', 'Najczęstsza progresja popu, np. „Let It Be” i „With or Without You”.'],
  ['fifties', 'pop', 1, 'Lata 50.', 'I vi IV V', 'Doo-wop i „Stand by Me”. Bas schodzi o tercję, potem idzie w górę.'],
  ['sensitive', 'pop', 1, 'Smutny pop', 'vi IV I V', 'Ta sama co oś popu, ale od molowego akordu, np. „Zombie” (The Cranberries).'],
  ['popRise', 'pop', 1, 'Pop w górę', 'I IV vi V', 'Refren, który rośnie: kończy na V, więc ciągnie dalej.'],
  ['popFour', 'pop', 2, 'Pop od subdominanty', 'IV I V vi', 'Oś popu zaczęta od IV: refreny, które „startują w powietrzu”.'],
  ['threeChords', 'rock', 1, 'Trzy akordy', 'I IV V I', 'Rock and roll, folk, kolędy: tonika, subdominanta, dominanta.'],
  ['folk', 'rock', 1, 'Folk', 'I IV I V', 'Piosenka przy gitarze: między każdym krokiem powrót do domu.'],
  ['laBamba', 'latin', 1, 'La Bamba', 'I IV V IV', 'Krótki krąg z Meksyku, np. „La Bamba” i „Twist and Shout”.'],
  ['rockV', 'rock', 2, 'Rock: V–IV', 'I V IV V', 'Gitarowy rock: dominanta schodzi do subdominanty, a nie do toniki.'],
  ['ballad', 'ballada', 2, 'Ballada z iii', 'I iii IV V', 'iii łączy I z IV jednym ruchem w górę: miękka ballada.'],
  ['balladVi', 'ballada', 2, 'Ballada z vi i iii', 'I iii vi IV', 'Dwa molowe akordy pod rząd: ciepło i trochę smutku.'],
  ['blueMoon', 'pop', 2, 'Blue Moon', 'I vi ii V', 'Turnaround z lat 30., np. „Blue Moon”. Tu jeszcze bez septym.'],
  ['shortCircle', 'pop', 2, 'Krótkie koło kwintowe', 'vi ii V I', 'Każdy akord to kwinta pod poprzednim: najmocniejszy ruch basu.'],
  ['balkan', 'balkany', 2, 'Bałkańska', 'i iv V i', 'Moll z durową dominantą: wesela, kolo, horo.'],
  ['minorFolk', 'balkany', 2, 'Molowa ludowa', 'i bVII i V', 'Moll z ♭VII: brzmi staro, ludowo, potem ostra dominanta.'],
  ['andalusian', 'latin', 2, 'Kadencja andaluzyjska', 'i bVII bVI V', 'Flamenco i „Hit the Road Jack”: bas schodzi po czterech stopniach.'],
  ['epic', 'film', 2, 'Epicka', 'i bVI bIII bVII', 'Muzyka filmowa i rock stadionowy: moll, który brzmi jak zwycięstwo.'],
  ['watchtower', 'rock', 2, 'Eolska w kółko', 'i bVII bVI bVII', 'Moll bez dominanty, np. „All Along the Watchtower”.'],
  ['mixo', 'rock', 2, 'Miksolidyjska', 'I bVII IV I', 'Rock z ♭VII zamiast V, np. „Sweet Home Alabama”.'],
  ['plagalMinor', 'film', 2, 'Molowa subdominanta', 'I IV iv I', 'IV zamienia się w iv: nostalgia w jednym półtonie (A → A♭ w C-dur).'],
  // --- tier 3–4: longer, chromatic touches, sus, first slash chords ------------------------------------------------
  ['canon', 'klasyka', 3, 'Kanon Pachelbela', 'I V vi iii IV I IV V', 'Barokowy kanon. Ta sama droga basu wraca w setkach piosenek.'],
  ['diatonicCircle', 'klasyka', 3, 'Diatoniczne koło kwintowe', 'I IV vii° iii vi ii V I', 'Barok (Vivaldi, Bach): każdy krok o kwintę w dół, wszystkie stopnie gamy.'],
  ['minorCadence', 'klasyka', 3, 'Kadencja molowa', 'i iv V7 i', 'Moll harmoniczny: dominanta z septymą i podniesionym prowadzącym.'],
  ['creep', 'rock', 3, 'Creep', 'I III IV iv', 'Durowe III i molowe iv, np. „Creep” (Radiohead). Dwa zaskoczenia w czterech akordach.'],
  ['eightDays', 'pop', 3, 'II durowe', 'I II7 IV I', 'Durowe II z septymą (dominanta do V, która nie przychodzi), np. „Eight Days a Week”.'],
  ['mario', 'film', 3, 'Kadencja Mario', 'I bVI bVII I', '♭VI–♭VII–I: zwycięski finał w grach i filmach.'],
  ['hijaz', 'balkany', 3, 'Hidżaz (freygish)', 'I bII iv I', 'Durowa tonika z ♭II nad nią: klezmer, muzyka bałkańska i arabska.'],
  ['sus', 'pop', 3, 'Zawieszone', 'Isus4 I Vsus4 V', 'Sus: kwarta zamiast tercji, napięcie, które opada na tercję.'],
  ['sus2', 'ballada', 3, 'Otwarte sus2', 'Isus2 IV vi Vsus4', 'Bez tercji brzmi przestrzennie: nowoczesne ballady i worship.'],
  ['rockFlat3', 'rock', 3, 'Rock z ♭III', 'I bIII IV I', '♭III pożyczone z mollu: ciężki, bluesowy rock.'],
  ['bassDown', 'ballada', 4, 'Zstępujący bas', 'I V/7 vi I/5 IV I/3 ii V', 'Bas schodzi po gamie krok po kroku: ballady fortepianowe. Dolny dźwięk jest tu najważniejszy.'],
  ['bassDown2', 'ballada', 4, 'Bas po gamie w dół', 'I I/7 vi vi/5 IV I/3 ii V', 'Ta sama linia basu, nad nią akordy stoją dłużej.'],
  ['cadence64', 'klasyka', 4, 'Kadencja klasyczna', 'I IV I/5 V7 I', 'I z kwintą w basie przed dominantą: koniec utworów Mozarta i Haydna.'],
  ['gospelIv', 'soul', 4, 'Gospel z iv', 'I I7 IV iv I', 'I7 prowadzi do IV, potem molowe iv i powrót: kościół i soul.'],
  ['secDom', 'pop', 4, 'Dominanta do vi', 'I III7 vi IV', 'III7 to dominanta do vi: ballady pop i musicale.'],
  ['blues12', 'blues', 4, 'Blues 12 taktów', 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'Podstawa bluesa i rock and rolla. Każdy akord to dominanta z septymą.'],
  ['minorCircle', 'balkany', 4, 'Molowe koło kwintowe', 'i iv bVII bIII bVI iiø7 V7 i', 'Cygańskie i bałkańskie ballady, francuski walc: cała tonacja molowa po kwintach.'],
  // --- tier 5–6: sevenths, jazz basics, soul colours --------------------------------------------------------------
  ['twoFiveOne', 'jazz', 5, 'ii–V–I', 'ii7 V7 Imaj7 Imaj7', 'Najważniejsze zdanie jazzu.'],
  ['turnaround', 'jazz', 5, 'Turnaround', 'Imaj7 vi7 ii7 V7', 'Koniec chorusa, który wraca na początek.'],
  ['royal', 'pop', 5, 'Królewska droga', 'IVmaj7 V7 iii7 vi7', 'Japoński pop i anime: od IV, przez V, w miękki moll.'],
  ['soulDown', 'soul', 5, 'Septymy w dół', 'IVmaj7 iii7 ii7 Imaj7', 'Schodzenie po gamie samymi septymowymi: neo-soul i R&B.'],
  ['quickBlues', 'blues', 5, 'Blues z szybką czwórką', 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'Już w 2. takcie IV7: tak gra większość bluesmanów.'],
  ['swing6', 'jazz', 5, 'Swing z szóstką', 'I6 vi7 ii7 V7', 'Akord z sekstą zamiast maj7: brzmienie swingu lat 30. i 40.'],
  ['lament', 'klasyka', 5, 'Bas lamentu', 'i v/b7 iv/b6 V', 'Bas schodzi od toniki do dominanty: lamenty barokowe, np. Purcell. Pilnuj basu.'],
  ['minorTwoFive', 'jazz', 6, 'Molowe iiø–V–i', 'iiø7 V7 i7 i7', 'ii–V–I w mollu: półzmniejszony, dominanta, molowa tonika.'],
  ['rhythmA', 'jazz', 6, 'Rhythm changes', 'Imaj7 vi7 ii7 V7 iii7 VI7 ii7 V7', 'Część A z Gershwina: dwa turnaroundy, drugi z dominantą VI7.'],
  ['longCircle', 'jazz', 6, 'Długie koło kwintowe', 'iii7 VI7 ii7 V7 Imaj7', 'Każdy akord to kwinta nad następnym: dwie dominanty pod rząd.'],
  ['backdoor', 'soul', 6, 'Tylne drzwi', 'Imaj7 iv7 bVII7 Imaj7', 'Do toniki od ♭VII7 zamiast od V7: gospel, soul, ballady jazzowe.'],
  ['passDim', 'jazz', 6, 'Zmniejszony przejściowy', 'Imaj7 #i°7 ii7 V7', 'Bas idzie chromatycznie w górę: C, C♯, D. Zmniejszony łączy dwa akordy.'],
  ['augLine', 'film', 6, 'Linia w akordzie', 'I I+ I6 I7 IV', 'Jeden głos idzie w górę: 5, ♯5, 6, ♭7. Piosenki z lat 30. i musicale.'],
  ['minorLine', 'film', 6, 'Opadający głos w mollu', 'i imaj7 i7 i6', 'Jeden głos schodzi chromatycznie od toniki: muzyka szpiegowska i ballady lat 60.'],
  ['gypsy', 'balkany', 6, 'Jazz cygański', 'i6 iv6 i6 V7', 'Molowe akordy z sekstą: Django Reinhardt i swing manouche.'],
  ['minorBlues', 'blues', 6, 'Blues molowy', 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', '12 taktów w mollu, z ♭VI7 przed dominantą.'],
  ['susResolve', 'soul', 6, 'Dominanta sus', 'ii7 V7sus4 V7 Imaj7', 'V7sus4 trzyma kwartę, potem schodzi do tercji: gospel i fusion.'],
  // --- tier 7–8: standards and real changes -------------------------------------------------------------------------
  ['bachC', 'klasyka', 7, 'Bach, Preludium C-dur', 'I ii7/1 V7/7 I vi/1 II7/1 V/7 Imaj7/7 vi7 II7 V', 'Pierwsze takty z „Das wohltemperierte Klavier”. Bas stoi i schodzi, góra się zmienia.'],
  ['tritone', 'jazz', 7, 'Podstawienie trytonowe', 'ii7 bII7 Imaj7 Imaj7', '♭II7 zamiast V7: bas schodzi półtonami.'],
  ['flyMe', 'jazz', 7, 'Fly Me to the Moon', 'vi7 ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7', 'Całe koło kwintowe w tonacji: każdy stopień po kolei.'],
  ['autumn', 'jazz', 7, 'Autumn Leaves', 'iv7 bVII7 bIIImaj7 bVImaj7 iiø7 V7 i7 i7', 'ii–V–I w paralelnym durze, potem w mollu. Standard nad standardami.'],
  ['twoOfUs', 'soul', 7, 'Just the Two of Us', 'IVmaj7 III7 vi7 v7 I7', 'Soul i city pop: dominanta do vi, potem ii–V do IV.'],
  ['ipanema', 'latin', 8, 'The Girl from Ipanema', 'Imaj7 II7 ii7 bII7 Imaj7', 'Początek bossa novy: II7, potem ii7 i podstawienie trytonowe.'],
  ['blueBossa', 'latin', 8, 'Blue Bossa', 'i7 iv7 iiø7 V7 i7 biii7 bVI7 bIImaj7 iiø7 V7 i7', 'Moll, wycieczka do tonacji o półton wyżej (♭II) i powrót.'],
  ['jazzBlues', 'blues', 8, 'Blues jazzowy', 'I7 IV7 I7 v7 I7 IV7 #iv°7 I7 VI7 ii7 V7 I7 VI7 ii7 V7', 'Blues z ii–V, zmniejszonym i turnaroundem: tak go grają jazzmani.'],
];

export const BANK = RAW.map(([id, fam, tier, name, rn, about]) => {
  const chords = rn.split(/\s+/).map(parseRoman);
  const sevenths = chords.every((c) => CHORDS[c.type].iv.length === 4);
  const minor = chords.some((c) => c.deg === 0 && ['min', 'm7', 'm6', 'mMaj7'].includes(c.type));
  return { id, fam, tier, name, rn, about, chords, sevenths, minor, slash: chords.some((c) => c.bass !== null) };
});
export const BANK_BY_ID = Object.fromEntries(BANK.map((p) => [p.id, p]));

/** The chords of a bank progression in a key (keyPc = the tonic of the progression: minor ones get a minor tonic). */
export function bankChords(id, keyPc) {
  const p = BANK_BY_ID[id];
  const flat = keyPrefersFlat(p.minor ? (keyPc + 3) % 12 : keyPc);
  // spelled like the numeral: bII is E♭ in D, not D♯
  const sp = (acc) => (acc === 'b' ? true : acc === '#' ? false : flat);
  return p.chords.map(({ deg, type, bass, acc, bassAcc }) => {
    const rootPc = (keyPc + deg) % 12;
    const b = bass === null ? null : (keyPc + bass) % 12;
    const symbol = pcName(rootPc, sp(acc)) + CHORDS[type].sym + (b !== null && b !== rootPc ? `/${pcName(b, sp(bassAcc))}` : '');
    return { rootPc, type, symbol, bass: b !== null && b !== rootPc ? b : null };
  });
}

// Major keys from the easiest; how many by level. A set uses one key signature: minor progressions take the relative minor.
const KEY_ORDER = [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6];
export function keysFor(level) { return KEY_ORDER.slice(0, Math.min(12, 3 + Math.floor(Math.max(0, level - 1) * 1.1))); }

/** How the hand plays, by level. Triads never go shell or rootless; slash chords always keep their bass. */
export function bankStyle(level, p, r) {
  if (!p.sevenths) return level >= 3 && r() < 0.4 ? 'rootBass' : 'any';
  if (level >= 9) return r() < 0.6 ? 'rootless' : 'shell';
  if (level >= 7) return r() < 0.7 ? 'shell' : 'any';
  return 'any';
}

/**
 * Weight of a progression at a level: core (around the level) 3, review (well below) 1, stretch (up to one above) 0.7.
 * seen: {id: count}; recent: ids played lately (pushed back hard); never played: ×1.5.
 */
export function bankWeight(p, level, { seen = {}, recent = [] } = {}) {
  if (p.tier > level + 1) return 0;
  const L = Math.min(level, 8.5);   // above the top tier everything is core; the voicing (shell, rootless) makes it harder
  let w = p.tier > L + 0.5 ? 0.7 : p.tier > L - 1.5 ? 3 : 1;
  if (recent.includes(p.id)) w *= 0.05;
  if (!seen[p.id]) w *= 1.5;
  return w;
}

function weighted(r, items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let x = r() * total;
  for (const [it, w] of items) { x -= w; if (x <= 0) return it; }
  return items[items.length - 1][0];
}

/**
 * The next set: {fam, key, ids (simplest first, up to 3), at: 0}. Another family than last time, and a key next to the
 * last one on the circle of fifths (or its relative), when the level allows it.
 */
export function nextSet(level, r, { seen = {}, recent = [], prev = null } = {}) {
  const famW = {};
  for (const p of BANK) {
    const w = bankWeight(p, level, { seen, recent });
    if (w > 0) famW[p.fam] = (famW[p.fam] || 0) + w;
  }
  if (prev && Object.keys(famW).length > 1) delete famW[prev.fam];
  const fam = weighted(r, Object.entries(famW));
  // up to 3 different progressions of the family, drawn by weight, then ordered simplest first
  const pool = BANK.filter((p) => p.fam === fam).map((p) => [p, bankWeight(p, level, { seen, recent })]).filter(([, w]) => w > 0);
  const ids = [];
  while (ids.length < 3 && pool.length) {
    const p = weighted(r, pool);
    ids.push(p);
    pool.splice(pool.findIndex(([q]) => q === p), 1);
  }
  ids.sort((a, b) => a.tier - b.tier);
  const keys = keysFor(level);
  const pick = (a) => a[Math.floor(r() * a.length)];
  let key;
  if (prev && keys.includes(prev.key)) {
    const near = keys.filter((k) => [5, 7].includes((k - prev.key + 12) % 12));
    key = pick(near.length ? near : keys);
  } else key = pick(keys);
  return { fam, key, ids: ids.map((p) => p.id), at: 0 };
}

/** The tonic for a progression of the set: the set's major key, or its relative minor. */
export function setTonic(set, id) { return BANK_BY_ID[id].minor ? (set.key + 9) % 12 : set.key; }

/** Name of a key for the board: "C-dur", "a-moll". */
export function keyName(pc, minor) {
  const flat = keyPrefersFlat(minor ? (pc + 3) % 12 : pc);
  const n = pcName(pc, flat);
  return minor ? `${n.toLowerCase()}-moll` : `${n}-dur`;
}
