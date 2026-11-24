// Przepisy: how a pianist builds a progression step by step, each step a move from moves.js on the result of the one
// before, with a sentence of why and what to listen for. Pure, no DOM; tested in recipes.test.js.
import { parseNumerals, withBars } from './progs.js';
import { applyMove } from './moves.js';
import { normStep } from './chords.js';

const isChord = (s) => s && s.k === 'chord' && !s.skip;

// at: null (whole progression) · { deg: [d, a] } the first chord on that degree · { last: true } · { nth: k } the k-th chord (0-based)
export const RECIPES = [
  { id: 'ballada', name: 'Ballada do śpiewu', level: 1, mode: 'major', groove: 'ballada', tempo: 70,
    idea: 'Cztery najprostsze akordy, a potem trzy ruchy, po których brzmią jak z płyty. Wszystko zostawia miejsce na głos.',
    start: 'I V vi IV', startSay: 'Szkielet: pop-hymn. Dom, napięcie, smutny krewny, wyjście. Zagraj i zaśpiewaj na nim cokolwiek.',
    steps: [
      { move: 'basKrokiem', at: null, say: 'Lewa nie skacze. 5 staje na swojej tercji, bas schodzi gamą: 1, 7, 6. Posłuchaj, jak bas sam śpiewa.' },
      { move: 'otwarte', at: null, say: 'Durowe dostają nonę, 5 zawiesza się na sus4. Brzmi przestrzennie i nie zagłusza melodii.' },
      { move: 'turnaround', at: null, say: 'Na koniec pętli pół taktu dominanty. Pętla sama ciągnie do początku.' },
    ],
    sing: 'Śpiewaj dźwięki, które są w akordzie: na 1 tercję (E w C), na 6m prymę (A). Wtedy każdy akord „siedzi” pod głosem.' },
  { id: 'refren', name: 'Refren, który się podnosi', level: 2, mode: 'major', groove: 'pop', tempo: 92,
    idea: 'Zwrotka zaczyna od smutku, przed refrenem bas wspina się, a ostatni refren jest pół tonu wyżej. Tak buduje się napięcie całej piosenki.',
    start: 'vi IV I V', startSay: 'Zwrotka: smutny pop. Zaczynasz od 6m, dur przychodzi dopiero w trzecim akordzie.',
    steps: [
      { append: 'ii iii IV V', section: 'Przed refrenem', say: 'Przed refrenem bas wspina się: 2m, 3m, 4, 5. Każdy akord jest wyżej, napięcie rośnie.' },
      { append: 'I V vi IV', section: 'Refren', say: 'Refren: te same akordy co w zwrotce, ale od domu. Jasno i pewnie, bo zaczyna się na 1.' },
      { move: 'polTonu', at: null, say: 'Ostatni refren pół tonu wyżej, przez dominantę nowej tonacji. Klasyczny finał.' },
    ],
    sing: 'W zwrotce śpiewaj nisko i cicho, w refrenie wyżej. Harmonia już to robi: ty idź za nią.' },
  { id: 'gospel', name: 'Gospelowe zakończenie', level: 3, mode: 'major', groove: 'gospel', tempo: 66,
    idea: 'Z najprostszej kadencji kościelny finał: przejściowy zmniejszony, dominanta wtórna, miękka dominanta i molowe „amen”.',
    start: 'I IV I/5 V', startSay: 'Szkielet: 1, 4, 1 z kwintą w basie, 5. Jak w każdej pieśni. Bas idzie: 1, 4, 5, 5.',
    steps: [
      { move: 'zmniejszony', at: { nth: 1 }, say: 'Bas idzie z 4 na 5, więc w połowie wstawiam ♯4°7. Bas półtonami w górę: pierwszy smak gospelu.' },
      { move: 'dominanta', at: { last: true }, say: 'Przed 5 jej własna dominanta (2⁷). Ostatnia prosta robi się dłuższa.' },
      { move: 'gospelV', at: { deg: [5, 0] }, say: 'Zamiast G gram F/G: akord 4 nad basem 5. Najmiększa dominanta, jaka istnieje.' },
      { move: 'amen', at: null, say: 'Na sam koniec „amen”: 4 i dom.' },
      { move: 'molowaS', at: { deg: [4, 0] }, find: 'last', say: 'I jeszcze 4m przed domem. Ten jeden palec (A → A♭) to łza w finale.' },
    ],
    sing: 'Na „amen” śpiewaj 1 → 1: głos stoi, a akordy zmieniają się pod nim. Tak brzmi chór kościelny.' },
  { id: 'film', name: 'Filmowy finał', level: 3, mode: 'major', groove: 'powerballad', tempo: 72,
    idea: 'Zwykłe 4–5–1 zamieniam w bohaterski finał z pożyczkami z molowej i zawieszeniem przed domem.',
    start: 'I IV V I', startSay: 'Szkielet: kadencja 4–5–1. Poprawnie, ale nudno.',
    steps: [
      { move: 'mario', at: { last: true }, say: 'Do domu przez ♭6 i ♭7: dwa durowe schody z molowej. Od razu zwycięsko.' },
      { move: 'molowaS', at: { deg: [4, 0] }, say: '4 gaśnie do 4m. Po zwycięstwie chwila wzruszenia.' },
      { move: 'zawieszenie', at: { deg: [7, -1] }, say: '♭7 zaczyna się od sus4 i dopiero potem się rozwiązuje. Oddech przed ostatnim akordem.' },
    ],
    sing: 'Nad ♭6 i ♭7 śpiewaj długie dźwięki, najlepiej 1 albo 5 tonacji. Akordy przesuwają się pod stojącym głosem.' },
  { id: 'neosoul', name: 'Pętla neo-soul', level: 4, mode: 'major', groove: 'neosoul', tempo: 76,
    idea: 'Schodzące akordy 4–3–2–1, potem nony, poślizg i bas krokiem. Nocne, miękkie brzmienie.',
    start: 'IV iii ii I', startSay: 'Szkielet: cztery akordy w dół po gamie. Palce zsuwają się jak po schodach.',
    steps: [
      { move: 'nony', at: null, say: 'Każdy akord dostaje nonę. Tak brzmi neo-soul: mgła zamiast konturów.' },
      { move: 'poslizg', at: { nth: 2 }, say: 'Przed 2m9 ten sam akord pół tonu wyżej. Ręka zjeżdża o klawisz.' },
      { move: 'dominanta', at: { nth: 0 }, say: 'Na końcu pętli 1⁷: dominanta do pierwszego akordu (4). Pętla sama wraca na początek.' },
    ],
    sing: 'Śpiewaj miękko, za uderzeniem, „leniwie”. W neo-soulu głos jest jeszcze jednym instrumentem.' },
  { id: 'jazz', name: 'Jazzowy turnaround do każdej piosenki', level: 4, mode: 'major', groove: 'swing', tempo: 120,
    idea: 'Z czterech akordów 1–4–5–1 robi się jazzowa pętla: krewni, 2–5, zastępstwo trytonowe i septymy.',
    start: 'I IV V I', startSay: 'Szkielet: 1, 4, 5, 1.',
    steps: [
      { move: 'krewny', at: { nth: 1 }, say: '4 zamieniam na 2m: krewny z tej samej funkcji. Teraz jest 1–2–5–1.' },
      { move: 'dominanta', at: { nth: 1 }, say: 'Przed 2m jego dominanta 6⁷. Pętla 1–6⁷–2–5 to serce standardów.' },
      { move: 'tryton', at: { deg: [5, 0] }, say: 'Dominantę zamieniam na trytonową: bas schodzi półtonami do domu.' },
      { move: 'septymy', at: null, say: 'Wszystko z septymą. Teraz brzmi jak jazz.' },
    ],
    sing: 'W jazzie śpiewaj tercje i septymy akordów: one najlepiej opowiadają harmonię.' },
  { id: 'romans', name: 'Molowy romans', level: 4, mode: 'minor', groove: 'ballada', tempo: 66,
    idea: 'Prosta molowa kadencja w duchu romantyzmu: bas krokiem, neapolitański przed dominantą i durowy akord na koniec.',
    start: 'i iv V i', startSay: 'Szkielet: 1m, 4m, 5, 1m. Trzy filary mollu. Durowa 5 pożycza dźwięk z gamy harmonicznej.',
    steps: [
      { move: 'neapol', at: { deg: [5, 0] }, say: 'Przed 5 akord neapolitański (♭2 na tercji w basie). Dramat jak w operze.' },
      { move: 'kadencyjny', at: { deg: [5, 0] }, say: 'Dominanta zaczyna się od 1m z kwintą w basie. Klasyczna, uroczysta kadencja.' },
      { move: 'pikardyjska', at: { last: true }, say: 'Ostatni akord durowy. Smutek kończy się światłem.' },
    ],
    sing: 'Śpiewaj szeroko, legato. W romansie melodia często zaczyna na kwincie i schodzi do tercji.' },
  { id: 'rock', name: 'Rockowa pętla z pożyczką', level: 2, mode: 'major', groove: 'rock', tempo: 104,
    idea: 'Trzy akordy, a potem miksolidyjskie ♭7 zamiast 5. Gitarowa zadziorność bez dominanty.',
    start: 'I IV V IV', startSay: 'Szkielet: rock and roll 1–4–5–4.',
    steps: [
      { replace: { at: { deg: [5, 0] }, rn: 'bVII' }, say: '5 zamieniam na ♭7 z miksolidyjskiej. Akord o cały ton niżej od domu brzmi zadziornie.' },
      { move: 'pedal', at: null, say: 'Dla próby: bas stoi na tonice pod wszystkim. Słyszysz, jak rośnie napięcie?' },
    ],
    sing: 'Nad ♭7 śpiewaj ♭7 tonacji (B♭ w C). To dźwięk, który robi rocka.' },
  { id: 'bossa', name: 'Z ballady bossa nova', level: 5, mode: 'major', groove: 'bossa', tempo: 120,
    idea: 'Lata 50. (1–6–4–5) zamieniam w bossę: krewni, nony, zastępstwo trytonowe i poślizg.',
    start: 'I vi IV V', startSay: 'Szkielet: lata 50.',
    steps: [
      { move: 'krewny', at: { nth: 2 }, say: '4 zamieniam na 2m. Teraz 1–6m–2m–5: najczęstsza pętla jazzu.' },
      { move: 'nony', at: null, say: 'Nony: Cmaj9, Am9, Dm9, G9. Bossa żyje z dźwięków dodanych.' },
      { move: 'tryton', at: { deg: [5, 0] }, say: 'G9 zamieniam na D♭7: bas schodzi do domu półtonem.' },
    ],
    sing: 'Bossę śpiewa się cicho, blisko mikrofonu, prawie mówiąc. Rytm robią ręce.' },
  { id: 'bach', name: 'Kanon: bas Bacha i Pachelbela', level: 3, mode: 'major', groove: 'ballada', tempo: 72,
    idea: 'Z ośmiu akordów kanonu powstaje słynny bas schodzący gamą. Potem septymy i zawieszenie na końcu.',
    start: 'I V vi iii IV I IV V', startSay: 'Akordy Kanonu Pachelbela, na razie wszystkie z prymą w basie. Bas skacze.',
    steps: [
      { move: 'basKrokiem', at: null, say: 'Bas krokiem: C, H, A, G, F, E, F, G. To jest ten słynny bas. Akordy zostały te same.' },
      { move: 'zawieszenie', at: { last: true }, say: 'Ostatnia dominanta z zawieszeniem: sus4 → 5. Barokowe westchnienie przed powrotem.' },
    ],
    sing: 'Nad tym basem możesz śpiewać gamę w dół, od 1 do 1. Wszystko pasuje: tak działa kanon.' },
];

/** The chord step index chosen by an "at" selector, or null. */
export function pick(steps, at, { find = 'first' } = {}) {
  if (at == null) return null;
  const idx = steps.map((s, i) => (isChord(normStep(s)) ? i : -1)).filter((i) => i >= 0);
  if (at.last) return idx[idx.length - 1];
  if (at.nth != null) return idx[at.nth] ?? null;
  if (at.deg) {
    const hits = idx.filter((i) => steps[i].d === at.deg[0] && (steps[i].a || 0) === at.deg[1]);
    return (find === 'last' ? hits[hits.length - 1] : hits[0]) ?? null;
  }
  return null;
}

/**
 * Every stage of a recipe: [{ say, steps, changed? }] from the start to the end, in a key.
 * A step that cannot be done (the move does not fit) is skipped, or its fallback move is used.
 */
export function runRecipe(r, key) {
  const stages = [];
  let steps = withBars(parseNumerals(r.start));
  if (r.steps.some((x) => x.section)) steps = [{ k: 'sec', label: 'Zwrotka' }, ...steps];
  stages.push({ say: r.startSay, steps, label: 'Start' });
  for (const st of r.steps) {
    let next = null;
    if (st.append) next = [...steps, ...(st.section ? [{ k: 'sec', label: st.section }] : []), ...withBars(parseNumerals(st.append))];
    else if (st.replace) {
      const i = pick(steps, st.replace.at);
      if (i != null) { next = steps.slice(); next[i] = { ...parseNumerals(st.replace.rn)[0], bars: steps[i].bars || 1 }; }
    } else {
      for (const id of [st.move, st.fallback].filter(Boolean)) {
        next = applyMove(id, steps, key, pick(steps, st.at, { find: st.find }), st.variant || 0);
        if (next) break;
      }
    }
    if (!next || JSON.stringify(next) === JSON.stringify(steps)) continue;
    steps = next;
    stages.push({ say: st.say, steps, label: st.move || (st.append ? st.section : 'zamiana') });
  }
  return stages;
}
