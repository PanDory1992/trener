// Ruchy: 27 ways a pianist dresses a progression, each with a rule, how it lies under the fingers, where you hear it,
// a before/after demo, and an apply() that does it to any progression. Pure, no DOM; tested in moves.test.js.
// apply(steps, key, at, variant) → new steps or null (cannot be done here). Steps are the editor's model; the moves
// keep the total length: an inserted chord takes the second half of the chord before it.
import { FAMILY, seventhOf, ninthOf, QUALITY } from './theory.js';
import { stepChord, normStep, simpleSpell, asStep } from './chords.js';
import { withBars, parseNumerals } from './progs.js';
import { triadOf, commonTones } from './lenses.js';

const mod12 = (x) => ((x % 12) + 12) % 12;
const isChord = (s) => s && s.k === 'chord' && !s.skip;
const rootOf = (key, s) => stepChord(key, s, { color: 'triads' }).root.pc;
const stepAt = (key, pc, q, extra = {}) => { const sp = simpleSpell(key, mod12(pc)); return { ...asStep(key, sp.li, mod12(pc), q), ...extra }; };
/** The bass of a chord step: { pc, li } (the slash note if there is one). */
const bassOf = (key, s) => { const c = stepChord(key, s, { color: 'triads' }); if (c.bassPc == null) return { pc: c.root.pc, li: c.root.li }; const t = c.tones.find((x) => x.pc === c.bassPc); return t ? { pc: t.pc, li: t.li } : { pc: c.bassPc, li: simpleSpell(key, c.bassPc).li }; };
const chordIdx = (steps) => steps.map((s, i) => (isChord(s) ? i : -1)).filter((i) => i >= 0);
const prevChord = (steps, i) => { const idx = chordIdx(steps); const k = idx.indexOf(i); return k > 0 ? idx[k - 1] : idx[idx.length - 1]; };
const nextChord = (steps, i) => { const idx = chordIdx(steps); const k = idx.indexOf(i); return k >= 0 && k + 1 < idx.length ? idx[k + 1] : idx[0]; };
const len = (s) => (s.bars > 0 ? s.bars : 1);
const kind = (q) => triadOf(q);
const isDominantish = (s) => ['maj', 'dom7', 'dom9', 'dom13', 'dom7sus4', 'dom7b9'].includes(s.q) || (QUALITY[s.q] && kind(s.q) === 'maj' && QUALITY[s.q].iv.includes(10));
const tonicStep = (key) => ({ k: 'chord', d: 1, a: 0, q: key.mode === 'minor' ? 'min' : 'maj' });
const isTonic = (s) => s.d === 1 && s.a === 0;

/** Replace step i with parts [{...step, frac}] that share its length. */
function split(steps, i, parts) {
  const s = steps[i];
  const L = len(s);
  const out = parts.map(({ frac, ...st }) => ({ k: 'chord', ...st, bars: +(L * frac).toFixed(4) }));
  return [...steps.slice(0, i), ...out, ...steps.slice(i + 1)];
}

/** Put chords before the chord at i, in the second half of the chord before it (wrapping round the loop). */
function insertBefore(steps, i, chords, { replacePrev = false } = {}) {
  const p = prevChord(steps, i);
  if (p == null || p === i) return null;
  const prev = steps[p];
  const L = len(prev);
  const keep = replacePrev ? 0 : L / 2;
  const each = (L - keep) / chords.length;
  const ins = chords.map((c) => ({ k: 'chord', ...c, bars: +each.toFixed(4) }));
  const head = keep ? [{ ...prev, bars: +keep.toFixed(4) }] : [];
  return [...steps.slice(0, p), ...head, ...ins, ...steps.slice(p + 1)];
}

// sibling chords of the same function in the family (T: 1 → 6 → 3, S: 4 → 2, D: 5 → 7)
const SIBLING = { 1: 6, 6: 3, 3: 1, 4: 2, 2: 4, 5: 7, 7: 5 };
const DOM_PREF = [6, 2, 4, 5, 3, 7, 1];

const MOVES_RAW = [
  // --- zamienniki ---------------------------------------------------------------------------------------------
  { id: 'krewny', name: 'Krewny zamiast gospodarza', group: 'Zamienniki', level: 1,
    say: 'Akord z tej samej funkcji: 6m zamiast 1, 2m zamiast 4, 7° zamiast 5.',
    rule: 'Dom (T) to 1, 3m i 6m. Wyjście (S) to 4 i 2m. Napięcie (D) to 5 i 7°. Zamień akord na krewnego z tej samej grupy: dwa wspólne dźwięki zostają.',
    play: 'Zostaw dwa palce na wspólnych dźwiękach, przesuń jeden. Z C do Am przesuwa się tylko G → A.',
    hear: 'Tak powstaje zwrotka z refrenu: ten sam szkielet, inne kolory.',
    demo: ['I IV V I', 0], where: (st, key) => chordIdx(st).filter((i) => { const s = st[i]; const f = FAMILY[key.mode][s.d - 1]; return f && f[1] === s.a && SIBLING[s.d]; }),
    apply(steps, key, i) { const s = steps[i]; const d = SIBLING[s.d]; const f = FAMILY[key.mode][d - 1]; const out = steps.slice(); out[i] = { ...s, d, a: f[1], q: f[2] }; delete out[i].bass; return out; } },
  { id: 'pozyczka', name: 'Pożyczka z równoległej', group: 'Zamienniki', level: 2,
    say: 'Ten sam stopień, ale z molowej (w durze) albo z doryckiej (w mollu): 4 → 4m, 6m → ♭6, 3m → ♭3, 5 → 5m.',
    rule: 'Tonika zostaje ta sama, a akord bierzesz z ciemniejszego modu. W durze: 4m, ♭6, ♭3, ♭7, 5m. W mollu: durowe 4 z doryckiej.',
    play: 'Zwykle przesuwa się jeden palec o półton w dół (F A C → F A♭ C). Słuchaj, jak robi się „tęskno”.',
    hear: 'Molowa 4 w „Creep”, ♭6 i ♭7 w finałach filmów, durowe 4 w molowym funku („Oye Como Va”).',
    demo: ['I vi IV V', 2],
    where: (st, key) => chordIdx(st).filter((i) => borrowFor(key, st[i]) !== null),
    apply(steps, key, i) { const b = borrowFor(key, steps[i]); if (!b) return null; const out = steps.slice(); out[i] = { ...steps[i], ...b }; delete out[i].bass; return out; } },
  { id: 'medianta', name: 'Medianta chromatyczna', group: 'Zamienniki', level: 4,
    say: 'Akord o tercję obok, z jednym wspólnym dźwiękiem: C → A♭, E, A albo E♭.',
    rule: 'Wybierz akord tego samego rodzaju (dur za dur) tercję wyżej albo niżej, spoza tonacji. Jeden dźwięk wspólny, reszta idzie półtonem.',
    play: 'Trzymaj wspólny dźwięk (z C do A♭: C), dwa pozostałe palce zsuwają się o półton. Wygląda obco, w ręce jest bardzo blisko.',
    hear: 'Muzyka filmowa (John Williams, Hans Zimmer), zwroty akcji, kosmos.',
    demo: ['I IV V I', 1], variants: 4,
    where: (st, key) => chordIdx(st).filter((i) => ['maj', 'min'].includes(kind(st[i].q))),
    apply(steps, key, i, v = 0) {
      const s = steps[i]; const k = kind(s.q); if (k !== 'maj' && k !== 'min') return null;
      const c = stepChord(key, s, { color: 'triads' });
      const opts = [8, 4, 9, 3].map((x) => stepAt(key, c.root.pc + x, k)).filter((o) => commonTones(c, stepChord(key, { k: 'chord', ...o }, { color: 'triads' })) === 1);
      if (!opts.length) return null;
      const out = steps.slice(); out[i] = { ...s, ...opts[v % opts.length] }; delete out[i].bass; return out;
    } },
  { id: 'tryton', name: 'Zastępstwo trytonowe', group: 'Zamienniki', level: 5,
    say: 'Zamiast dominanty akord septymowy pół tonu nad celem: G7 → D♭7 → C.',
    rule: 'G7 i D♭7 mają te same dwa najważniejsze dźwięki (H i F, czyli tercję i septymę), tylko zamienione. Bas zamiast skakać, schodzi półtonem.',
    play: 'Lewa: D♭ → C półtonem. Prawa trzyma F i C♭ (= H) prawie bez ruchu.',
    hear: 'Jazz, bossa nova („The Girl from Ipanema”), neo-soul.',
    demo: ['ii7 V7 Imaj7 Imaj7', 1],
    where: (st, key) => chordIdx(st).filter((i) => isDominantish(st[i]) && mod12(rootOf(key, st[nextChord(st, i)]) - rootOf(key, st[i])) === 5),
    apply(steps, key, i) { const t = rootOf(key, steps[nextChord(steps, i)]); const out = steps.slice(); out[i] = { ...steps[i], ...stepAt(key, t + 1, 'dom7') }; delete out[i].bass; return out; } },
  { id: 'gospelV', name: '4 nad basem 5 (gospel)', group: 'Zamienniki', level: 3,
    say: 'Zamiast G7 gram F/G: akord 4 w prawej, bas 5 w lewej.',
    rule: 'F/G to G9sus4 bez tercji: brzmi jak dominanta, ale miękko, bez ostrego dźwięku prowadzącego.',
    play: 'Prawa: zwykły trójdźwięk F. Lewa: G. Najłatwiejsza „bogata” dominanta na świecie.',
    hear: 'Gospel, soul, ballady fortepianowe lat 70.',
    demo: ['I vi ii V', 3],
    where: (st) => chordIdx(st).filter((i) => st[i].d === 5 && st[i].a === 0),
    apply(steps, key, i) { const out = steps.slice(); out[i] = { ...steps[i], d: 4, a: 0, q: 'maj', bass: 2 }; return out; } },
  // --- napięcie przed celem ---------------------------------------------------------------------------------------
  { id: 'dominanta', name: 'Dominanta wtórna', group: 'Przed celem', level: 2,
    say: 'Przed dowolnym akordem jego własna dominanta: przed Am gram E7, przed Dm A7.',
    rule: 'Policz kwintę w górę od celu i zagraj tam akord septymowy durowy. Na chwilę cel staje się domem. Zabiera pół taktu poprzedniemu akordowi.',
    play: 'Tercja dominanty (w E7 to G♯) wchodzi półtonem w prymę celu (A). Prowadź ją tam palcem.',
    hear: 'Wszędzie: „Hallelujah” (E7 przed Am), Beatlesi, musicale, jazz.',
    demo: ['I vi IV V', 1],
    // the dominant of the tonic is just 5, not a secondary one; the best targets first: 6m, 2m, 4, 5, 3m
    where: (st) => chordIdx(st).filter((i) => !isTonic(st[i]) && kind(st[i].q) !== 'dim').sort((x, y) => DOM_PREF.indexOf(st[x].d) - DOM_PREF.indexOf(st[y].d) || x - y),
    apply(steps, key, i) { return insertBefore(steps, i, [stepAt(key, rootOf(key, steps[i]) + 7, 'dom7')]); } },
  { id: 'iiV', name: '2–5 do celu', group: 'Przed celem', level: 3,
    say: 'Przed akordem jego 2m7 i 5⁷: przed F gram Gm7 i C7.',
    rule: 'Jazzowa zapowiedź: przygotowanie (2) i napięcie (5) wobec dowolnego celu. Zajmuje miejsce akordu, który był przed celem.',
    play: 'Septyma 2m7 schodzi półtonem do tercji 5⁷ (w Gm7 → C7: F → E). Reszta palców prawie stoi.',
    hear: 'Każdy standard jazzowy, bossa nova, soul.',
    demo: ['I*2 IV*2', 1],
    where: (st) => chordIdx(st).filter((i) => chordIdx(st).length > 1),
    apply(steps, key, i) { const r = rootOf(key, steps[i]); const ii = kind(steps[i].q) === 'min' ? 'm7b5' : 'm7'; return insertBefore(steps, i, [stepAt(key, r + 2, ii), stepAt(key, r + 7, 'dom7')], { replacePrev: len(steps[prevChord(steps, i)]) < 2 }); } },
  { id: 'lancuch', name: 'Łańcuch dominant', group: 'Przed celem', level: 4,
    say: 'Dwie dominanty po kole przed celem: przed C gram D7 i G7.',
    rule: 'Każdy akord jest dominantą następnego. Kwinta w dół, kwinta w dół, dom. Tak działa ragtime i bridge w „I Got Rhythm”.',
    play: 'Tercje i septymy schodzą półtonami: w D7 → G7 F♯ → F, C → H. Graj same tercje i septymy (shell), zobaczysz drabinkę.',
    hear: 'Ragtime, „Sweet Georgia Brown”, Rhythm changes.',
    demo: ['I*2 vi*2 IV*2 I*2', 3],
    where: (st) => chordIdx(st).filter(() => chordIdx(st).length > 1),
    apply(steps, key, i) { const r = rootOf(key, steps[i]); return insertBefore(steps, i, [stepAt(key, r + 2, 'dom7'), stepAt(key, r + 7, 'dom7')], { replacePrev: len(steps[prevChord(steps, i)]) < 2 }); } },
  { id: 'zmniejszony', name: 'Zmniejszony przejściowy', group: 'Przed celem', level: 3,
    say: 'Gdy bas idzie o cały ton w górę, w połowie wstawiam °7 na półtonie pomiędzy: C → C♯°7 → Dm.',
    rule: 'Bas idzie półtonami w górę, a akord zmniejszony to dominanta bez prymy, która „wkręca się” w następny akord.',
    play: 'Lewa: C, C♯, D. Prawa: trzy palce, każdy o półton. Gospel i stare standardy żyją z tego ruchu.',
    hear: 'Gospel, stare standardy jazzowe, ragtime.',
    demo: ['I ii V I', 0],
    where: (st, key) => chordIdx(st).filter((i) => mod12(bassOf(key, st[nextChord(st, i)]).pc - bassOf(key, st[i]).pc) === 2),
    apply(steps, key, i) { const s = steps[i]; const b = bassOf(key, s); return split(steps, i, [{ ...s, frac: 0.5 }, { ...asStep(key, b.li, mod12(b.pc + 1), 'dim7'), frac: 0.5 }]); } },
  { id: 'poslizg', name: 'Poślizg półtonem', group: 'Przed celem', level: 3,
    say: 'Ten sam akord pół tonu wyżej tuż przed celem: E♭m7 → Dm7.',
    rule: 'Całą ręką zjeżdżasz o półton na cel. Ucho słyszy obcy akord, ale wie, dokąd jedzie.',
    play: 'Ten sam chwyt, przesunięty o klawisz. Najprostszy chromatyczny trik, a brzmi jak z gospelowego chóru.',
    hear: 'Gospel, neo-soul, funk, muzyka filmowa.',
    demo: ['vi7 ii7 V7 Imaj7', 1],
    where: (st) => chordIdx(st).filter(() => chordIdx(st).length > 1),
    apply(steps, key, i) { const s = steps[i]; return insertBefore(steps, i, [stepAt(key, rootOf(key, s) + 1, s.q)]); } },
  { id: 'neapol', name: 'Neapolitański przed dominantą', group: 'Przed celem', level: 5,
    say: 'Przed 5 akord ♭2 na tercji w basie (N⁶): w a-moll B♭/D → E.',
    rule: '♭2 to subdominanta z dramatem: przyciemnione 2. Bas (4. stopień) idzie do 5, a ♭2 w górze schodzi przez 1 do 7.',
    play: 'Lewa: D → E. Prawa: B♭ D F → G♯ H E. Brzmi operowo, romantycznie, jak u Beethovena i Rachmaninowa.',
    hear: 'Klasyka, romantyzm, „Sonata księżycowa”, ballady.',
    demo: ['i iv V i', 2],
    where: (st) => chordIdx(st).filter((i) => st[i].d === 5 && st[i].a === 0),
    apply(steps, key, i) { return insertBefore(steps, i, [{ d: 2, a: -1, q: 'maj', bass: 4 }]); } },
  { id: 'kadencyjny', name: 'Kadencyjny 6/4', group: 'Przed celem', level: 4,
    say: 'Dominanta zaczyna się od akordu toniki z kwintą w basie: C/G → G7 → C.',
    rule: 'Bas już stoi na 5, ale w górze jeszcze jest dom. Potem górne głosy schodzą do dominanty. Klasyczne, uroczyste zakończenie.',
    play: 'Lewa trzyma G przez dwa akordy. Prawa: C E G → H D F (czyli G7 bez prymy).',
    hear: 'Kadencje w koncertach, chorały, hymny, finały piosenek.',
    demo: ['I IV V I', 2],
    where: (st) => chordIdx(st).filter((i) => st[i].d === 5 && st[i].a === 0),
    apply(steps, key, i) { const s = steps[i]; const t = tonicStep(key); return split(steps, i, [{ ...t, bass: 7, frac: 0.5 }, { ...s, frac: 0.5 }]); } },
  // --- pożyczki i kolory --------------------------------------------------------------------------------------------
  { id: 'molowaS', name: 'Molowa subdominanta', group: 'Pożyczki', level: 2,
    say: 'Po 4 jeszcze 4m, potem dom: F → Fm → C.',
    rule: 'Tercja akordu 4 (A) schodzi o półton (A♭) i od razu wraca do G w akordzie domu. Jeden palec robi całą robotę.',
    play: 'Trzymaj F i C, rusza się tylko palec na A: A → A♭ → G.',
    hear: '„In My Life”, „Creep”, ballady, muzyka filmowa.',
    demo: ['I vi IV I', 2],
    where: (st, key) => key.mode === 'major' ? chordIdx(st).filter((i) => st[i].d === 4 && st[i].a === 0 && kind(st[i].q) === 'maj') : [],
    apply(steps, key, i) { const s = steps[i]; return split(steps, i, [{ ...s, frac: 0.5 }, { ...s, q: 'min', bass: undefined, frac: 0.5 }]).map((x) => { if (x.bass === undefined) delete x.bass; return x; }); } },
  { id: 'mario', name: '♭6–♭7–1 (bohater)', group: 'Pożyczki', level: 2,
    say: 'Do domu wchodzisz dwoma durowymi schodami z molowej: A♭ → B♭ → C.',
    rule: 'Zamiast 5 → 1 grasz ♭6 → ♭7 → 1. Wszystkie trzy są durowe i idą krokiem w górę. Brzmi zwycięsko.',
    play: 'Ten sam chwyt durowy przesuwany: A♭ → B♭ → C. Lewa gra prymy krokiem.',
    hear: 'Koniec poziomu w Mario, finały rockowe, muzyka filmowa.',
    demo: ['I IV V I', 3],
    where: (st, key) => key.mode === 'major' ? chordIdx(st).filter((i) => isTonic(st[i]) && chordIdx(st).length > 1) : [],
    apply(steps, key, i) { return insertBefore(steps, i, [{ d: 6, a: -1, q: 'maj' }, { d: 7, a: -1, q: 'maj' }], { replacePrev: true }); } },
  { id: 'tylne', name: 'Tylne drzwi (backdoor)', group: 'Pożyczki', level: 4,
    say: 'Do domu nie przez 5⁷, tylko przez 4m7 i ♭7⁷: Fm7 → B♭7 → C.',
    rule: 'B♭7 to dominanta „od tyłu”: z miksolidyjskiej, bez dźwięku prowadzącego. Wchodzi do domu miękko, jakby bokiem.',
    play: 'Z Fm7 do B♭7 zmienia się jeden dźwięk (C → D). Potem A♭ schodzi do G.',
    hear: 'Soul, standardy jazzowe, ballady.',
    demo: ['ii7 V7 Imaj7 Imaj7', 1],
    where: (st, key) => chordIdx(st).filter((i) => st[i].d === 5 && st[i].a === 0 && isTonic(st[nextChord(st, i)])),
    apply(steps, key, i) { const s = steps[i]; return split(steps, i, [{ d: 4, a: 0, q: 'm7', frac: 0.5 }, { d: 7, a: -1, q: 'dom7', frac: 0.5 }]); } },
  { id: 'septymy', name: 'Wszystko z septymą', group: 'Kolory', level: 2,
    say: 'Każdy trójdźwięk dostaje swoją septymę z tonacji: C → Cmaj7, Dm → Dm7, G → G7.',
    rule: 'Funkcje się nie zmieniają, zmienia się kolor. 5 dostaje małą septymę (dominanta), reszta septymy z gamy.',
    play: 'Lewa: pryma i septyma, prawa: tercja i kwinta. Albo cały akord w prawej, w przewrotach najbliżej.',
    hear: 'Soul, jazz, bossa, lata 70.',
    demo: ['I vi ii V', null], whole: true,
    where: (st) => (chordIdx(st).some((i) => ['maj', 'min', 'dim'].includes(st[i].q)) ? [null] : []),
    apply(steps) { return steps.map((s) => (isChord(s) && ['maj', 'min', 'dim'].includes(s.q) ? { ...s, q: seventhOf(s.q, s.d === 5 && s.a === 0 && s.q === 'maj') } : s)); } },
  { id: 'nony', name: 'Nony (neo-soul)', group: 'Kolory', level: 3,
    say: 'Dodaję nonę do każdego akordu: Cmaj9, Dm9, G9.',
    rule: 'Nona to druga nad prymą, oktawę wyżej. Robi z akordu chmurę: mniej konkretnie, bardziej miękko.',
    play: 'Najprościej: lewa pryma i septyma, prawa tercja, kwinta i nona (palce 1, 2, 4).',
    hear: 'Neo-soul (D’Angelo, Erykah Badu), R&B, jazz.',
    demo: ['IV iii ii I', null], whole: true,
    where: (st) => (chordIdx(st).length ? [null] : []),
    apply(steps) { return steps.map((s) => (isChord(s) ? { ...s, q: s.q === 'dim' || s.q === 'm7b5' ? 'm7b5' : ninthOf(s.q === 'maj' && s.d === 5 && s.a === 0 ? 'dom7' : s.q) } : s)); } },
  { id: 'otwarte', name: 'Otwarte akordy do śpiewu', group: 'Kolory', level: 2,
    say: 'Durowe dostają nonę (add9), 5 zawiesza się na sus4. Brzmi nowocześnie i zostawia miejsce głosowi.',
    rule: 'add9 to trójdźwięk z drugim stopniem. Sus4 to akord bez tercji, z czwórką. Oba są „otwarte”: nie mówią wszystkiego, śpiewak dopowiada.',
    play: 'add9: kciuk na prymie, palec 2 na nonie, 3 na tercji, 5 na kwincie. Sus4: tercję podnieś o półton.',
    hear: 'Pop akustyczny, worship, ballady do gitary i fortepianu.',
    demo: ['I V vi IV', null], whole: true,
    where: (st) => (chordIdx(st).some((i) => ['maj', 'min'].includes(st[i].q)) ? [null] : []),
    apply(steps) { return steps.map((s) => (!isChord(s) ? s : s.q === 'maj' ? { ...s, q: s.d === 5 && s.a === 0 ? 'sus4' : 'add9' } : s.q === 'min' ? { ...s, q: 'madd9' } : s)); } },
  { id: 'zawieszenie', name: 'Zawieszenie i rozwiązanie', group: 'Kolory', level: 2,
    say: 'Akord zaczyna się od sus4, a w połowie wraca do zwykłego: G7sus4 → G7.',
    rule: 'Czwórka (C w G) zastępuje tercję (H) i chce do niej zejść. To małe napięcie w środku akordu, bez zmiany harmonii.',
    play: 'Jeden palec: C → H. Reszta stoi. Graj to na dominancie przed domem.',
    hear: 'Gospel, pop, hymny, kościelne zakończenia.',
    demo: ['I IV V I', 2],
    where: (st) => chordIdx(st).filter((i) => kind(st[i].q) === 'maj' && !['sus4', 'dom7sus4'].includes(st[i].q)),
    apply(steps, key, i) { const s = steps[i]; const sus = QUALITY[s.q].iv.includes(10) ? 'dom7sus4' : 'sus4'; return split(steps, i, [{ ...s, q: sus, frac: 0.5 }, { ...s, frac: 0.5 }]); } },
  // --- bas i linie ----------------------------------------------------------------------------------------------
  { id: 'basKrokiem', name: 'Bas krokiem (przewroty w basie)', group: 'Bas i linie', level: 2,
    say: 'Lewa nie skacze po prymach, tylko idzie gamą: C → G/H → Am → F.',
    rule: 'Dla każdego akordu wybierz w basie ten dźwięk akordu (1, 3, 5), który jest najbliżej poprzedniego basu. Bas zaczyna śpiewać własną melodię.',
    play: 'Lewa gra pojedyncze dźwięki krokiem, prawa zostaje przy zwykłych akordach. Nad basem z tercją (G/H) nie dubluj tercji w prawej.',
    hear: '„Someone Like You”, „A Whiter Shade of Pale”, „Piano Man”, Bach.',
    demo: ['I V vi IV', null], whole: true,
    where: (st) => (chordIdx(st).length > 2 ? [null] : []),
    apply(steps, key) { return stepBass(steps, key); } },
  { id: 'pedal', name: 'Pedał w basie', group: 'Bas i linie', level: 2,
    say: 'Bas stoi na tonice, a akordy zmieniają się nad nim: C, F/C, G/C, C.',
    rule: 'Ten sam dźwięk w basie pod wszystkimi akordami. Napięcie rośnie, bo góra się rusza, a dół nie. Dobry początek i dobre zakończenie.',
    play: 'Lewa trzyma jeden klawisz (albo oktawę) przez całą pętlę. Cała zmiana jest w prawej.',
    hear: 'Gospelowe wstępy, organy, muzyka filmowa, zakończenia ballad.',
    demo: ['I IV V I', null], whole: true,
    where: (st) => (chordIdx(st).length > 1 ? [null] : []),
    apply(steps, key) { return steps.map((s) => { if (!isChord(s)) return s; const b = mod12(key.tonicPc - rootOf(key, s)); const o = { ...s }; if (b) o.bass = b; else delete o.bass; return o; }); } },
  { id: 'linia', name: 'Linia w akordzie', group: 'Bas i linie', level: 3,
    say: 'Akord stoi, a jeden głos schodzi półtonami: Am → Am(maj7) → Am7 → Am6.',
    rule: 'Pryma akordu schodzi chromatycznie (8, 7, ♭7, 6), reszta stoi. Długi akord dostaje ruch bez zmiany harmonii.',
    play: 'Kciuk albo palec 5 schodzi po klawiszach w dół, pozostałe trzymają.',
    hear: '„My Funny Valentine”, motyw Jamesa Bonda, „Something”.',
    demo: ['i*2 iv*2', 0],
    where: (st) => chordIdx(st).filter((i) => ['maj', 'min'].includes(st[i].q)),
    apply(steps, key, i) { const s = steps[i]; const qs = s.q === 'min' ? ['min', 'mmaj7', 'm7', 'm6'] : ['maj', 'maj7', 'dom7', 'maj6']; return split(steps, i, qs.map((q) => ({ ...s, q, frac: 0.25 }))); } },
  // --- zakończenia, pętle i modulacje ---------------------------------------------------------------------------
  { id: 'zwodnicza', name: 'Kadencja zwodnicza', group: 'Zakończenia', level: 1,
    say: 'Po 5 zamiast domu przychodzi 6m (w mollu ♭6): oszukane zakończenie.',
    rule: 'Ucho czeka na 1 i dostaje krewnego. Opowieść się nie kończy, tylko skręca. Dobre przed ostatnim refrenem.',
    play: 'Z G do Am: H idzie do C, D do C, G do A. Bas idzie krokiem w górę.',
    hear: 'Bach, ballady, piosenki z „jeszcze jednym” refrenem.',
    demo: ['I IV V I', 3],
    where: (st) => chordIdx(st).filter((i) => isTonic(st[i]) && st[prevChord(st, i)].d === 5 && st[prevChord(st, i)].a === 0),
    apply(steps, key, i) { const out = steps.slice(); out[i] = key.mode === 'minor' ? { ...steps[i], d: 6, a: -1, q: 'maj' } : { ...steps[i], d: 6, a: 0, q: 'min' }; return out; } },
  { id: 'amen', name: 'Amen na koniec', group: 'Zakończenia', level: 1,
    say: 'Na sam koniec jeszcze 4 → 1: kościelne „amen”.',
    rule: 'Kadencja plagalna. Po głównym zakończeniu dokładasz 4 i dom. Bez napięcia, jak westchnienie ulgi.',
    play: 'C zostaje w obu akordach. F A → E G, palce schodzą o krok.',
    hear: 'Hymny, gospel, finały ballad.',
    demo: ['I vi ii V I', null], whole: true,
    where: (st) => (chordIdx(st).length ? [null] : []),
    apply(steps, key) { return [...steps, { k: 'chord', d: 4, a: 0, q: key.mode === 'minor' ? 'min' : 'maj', bars: 1 }, { ...tonicStep(key), bars: 2 }]; } },
  { id: 'pikardyjska', name: 'Tercja pikardyjska', group: 'Zakończenia', level: 2,
    say: 'Molowa piosenka kończy się durowym akordem: Am → A.',
    rule: 'Na ostatnim akordzie tercja idzie o półton w górę. Smutek zamienia się w światło. Barok tak kończył prawie każdy utwór w mollu.',
    play: 'Jeden palec: C → C♯ w ostatnim akordzie.',
    hear: 'Bach, chorały, ballady, muzyka cerkiewna.',
    demo: ['i iv V i', 3],
    where: (st, key) => (key.mode === 'minor' ? chordIdx(st).filter((i, k, a) => k === a.length - 1 && isTonic(st[i])) : []),
    apply(steps, key, i) { const out = steps.slice(); out[i] = { ...steps[i], q: 'maj' }; return out; } },
  { id: 'turnaround', name: 'Powrót na koniec pętli', group: 'Zakończenia', level: 2,
    say: 'W drugiej połowie ostatniego akordu gram 5⁷, żeby pętla sama ciągnęła do początku.',
    rule: 'Turnaround: ostatnie pół taktu zapowiada pierwszy akord. Piosenka się nie zatrzymuje, tylko zawraca.',
    play: 'Lewa: pryma 5 na „trzy”. Prawa: G7 najbliżej poprzedniego akordu.',
    hear: 'Blues (ostatni takt), jazz, pop na żywo, każde „jeszcze raz!”.',
    demo: ['I vi IV IV', null], whole: true,
    where: (st, key) => { const idx = chordIdx(st); const last = st[idx[idx.length - 1]]; return idx.length > 1 && isTonic(st[idx[0]]) && !(last.d === 5 && last.a === 0) ? [null] : []; },
    apply(steps, key) { const idx = chordIdx(steps); const i = idx[idx.length - 1]; const s = steps[i]; return split(steps, i, [{ ...s, frac: 0.5 }, { d: 5, a: 0, q: 'dom7', frac: 0.5 }]); } },
  { id: 'polTonu', name: 'Pół tonu w górę na ostatni refren', group: 'Zakończenia', level: 3,
    say: 'Ta sama pętla jeszcze raz, ale pół tonu wyżej. Wejście przez dominantę nowej tonacji.',
    rule: 'Na końcu pierwszego przejścia gram 5⁷ nowej tonacji (pół tonu wyżej), potem wszystko od początku w nowej tonacji. Klasyczny chwyt na finał.',
    play: 'Ten sam chwyt, wszystko o klawisz w górę. W dominancie: tercja nowej 5 idzie do prymy nowego domu.',
    hear: '„Man in the Mirror”, finały ballad i piosenek konkursowych.',
    demo: ['I V vi IV', null], whole: true,
    where: (st) => (chordIdx(st).length > 1 && !st.some((s) => s.k === 'mod') ? [null] : []),
    apply(steps, key) {
      const idx = chordIdx(steps); const i = idx[idx.length - 1]; const s = steps[i];
      const first = split(steps, i, [{ ...s, frac: 0.5 }, { ...stepAt(key, key.tonicPc + 8, 'dom7'), frac: 0.5 }]);
      // with sections, only the last one comes back higher (the last chorus); else the whole loop
      const lastSec = steps.map((x, k) => (x.k === 'sec' ? k : -1)).filter((k) => k >= 0).pop();
      const again = (lastSec != null ? steps.slice(lastSec) : steps).map((x) => ({ ...x }));
      return [...first, { k: 'mod', shift: 1 }, ...again];
    } },
];

/** The borrowed counterpart of a chord in this key (for the "pozyczka" move), or null. */
export function borrowFor(key, s) {
  if (!isChord(s)) return null;
  const k = kind(s.q);
  if (key.mode === 'major') {
    if (s.a !== 0) return null;
    if (s.d === 4 && k === 'maj') return { q: 'min' };
    if (s.d === 6 && k === 'min') return { a: -1, q: 'maj' };
    if (s.d === 3 && k === 'min') return { a: -1, q: 'maj' };
    if (s.d === 5 && k === 'maj') return { q: 'min' };
    if (s.d === 2 && k === 'min') return { q: 'dim' };
    if (s.d === 7 && k === 'dim') return { a: -1, q: 'maj' };
    return null;
  }
  if (s.d === 4 && s.a === 0 && k === 'min') return { q: 'maj' };
  if (s.d === 2 && s.a === 0 && k === 'dim') return { q: 'min' };
  if (s.d === 6 && s.a === -1 && k === 'maj') return { a: 0, q: 'dim' };
  return null;
}

/** Choose a bass from each chord (1, 3, 5, 7) as close as possible to the bass before it (a walking line). */
function stepBass(steps, key) {
  let prev = null;
  const dist = (a, b) => { const d = mod12(b - a); return Math.min(d, 12 - d); };
  return steps.map((s) => {
    if (!isChord(s)) return s;
    const c = stepChord(key, { ...s, bass: undefined }, { color: 'triads' });
    const root = c.root.pc;
    if (prev == null) { prev = root; const o = { ...s }; delete o.bass; return o; }
    const cands = c.tones.map((t, k) => ({ pc: t.pc, role: c.roles[k] })).filter((t) => ['1', '3', '5', '7'].includes(t.role));
    let best = null;
    for (const t of cands) {
      const d = dist(prev, t.pc);
      const cost = d + (t.role === '1' ? 0 : t.role === '3' ? 1 : t.role === '7' ? 1.2 : 2) + (d === 0 ? 1.5 : 0);   // a fifth in the bass only to pass
      if (!best || cost < best.cost) best = { ...t, cost };
    }
    prev = best.pc;
    const o = { ...s };
    const b = mod12(best.pc - root);
    if (b) o.bass = b; else delete o.bass;
    return o;
  });
}

export const MOVES = MOVES_RAW.map((m) => ({ ...m }));
export const MOVE_BY_ID = Object.fromEntries(MOVES.map((m) => [m.id, m]));
export const MOVE_GROUPS = [...new Set(MOVES.map((m) => m.group))];

/** Steps (with lengths written out) after a move, or null. at: chord step index (ignored for whole-progression moves). */
export function applyMove(id, steps, key, at = null, variant = 0) {
  const m = MOVE_BY_ID[id];
  if (!m) return null;
  const st = withBars(steps);
  if (!m.whole) {
    const w = m.where(st, key);
    if (at == null) { if (!w.length) return null; at = w[0]; }
    if (!isChord(st[at]) || !w.includes(at)) return null;
  }
  const out = m.apply(st, key, at, variant);
  return out ? out.map((s) => { const o = { ...s }; if (o.bass === undefined) delete o.bass; return o; }) : null;
}

/** Where a move can be done in these steps: chord step indices (or [null] for a whole-progression move). */
export function placesFor(id, steps, key) {
  const m = MOVE_BY_ID[id];
  return m ? m.where(withBars(steps), key) : [];
}

/** The moves that can be done on one chord step (for the chord card), and the whole-progression ones that fit. */
export function movesFor(steps, key, at = null) {
  const st = withBars(steps);
  return MOVES.filter((m) => { const w = m.where(st, key); return at == null ? w.length > 0 : m.whole ? false : w.includes(at); });
}

/** The demo of a move: { key mode, before steps, at } (key: C major or a minor). */
export function demoOf(m) {
  const [rn, at] = m.demo;
  const steps = parseNumerals(rn);
  const minor = steps.find((s) => s.d === 1 && s.a === 0) && triadOf(steps.find((s) => s.d === 1 && s.a === 0).q) === 'min';
  return { mode: minor ? 'minor' : 'major', steps, at };
}
