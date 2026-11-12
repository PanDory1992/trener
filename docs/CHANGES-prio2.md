# Trener — Prio 2

Five optional features, nothing blocks, no points, streaks or deadlines. All UI text in Polish (short, "ty").

1. **Kostka i delikatne podpowiedzi** — one button picks what to play and says why in one sentence; 1–2 quiet hints computed from data.
2. **Fiszki „zagraj” z powtórkami** — spaced reviews on "umiem" items (1, 2, 4, 7, 15, then every 30 days), walk through today's reviews, "Na koniec" proposal once a day.
3. **Informacja po próbie** — after each whole pass *W tempie*: mean early/late in ms, the step that rushes/drags most, bass vs chord, dynamics evenness.
4. **Wyzwania** — Koło Progresje/Akompaniament and Jam: "Tylko dźwięki akordu", "Tercja na każdej zmianie", Jam also "Pytanie–odpowiedź" (audible gaps via `jamCycle`).
5. **Stałe kolory funkcji** — one colour map for chord functions, used on chord labels everywhere and as a strip on the chord root key.

## Files

### New
| File | What |
|---|---|
| `web/js/suggest.js` | Pure. `parseItem(id)` (what a mastery id means; `null` when the card no longer exists — removed progression/pattern/scale, deleted song, out-of-range section), `itemTitle`, `playPrompt` ("Zagraj 2m–5–1 w E♭-dur", Polish accusative for scale names), `openFor` (view + preset), `pickDice`, `diceCandidates`, `hints`, `firstNewToday`, `reviewList`, the review walk state (`walk`, `startWalk`, `walkNext`, …). |
| `web/js/feedback.js` | Pure. `analyzePass({hits, steps})` → numbers + ready Polish lines; `chordToneShare`, `thirdOnChanges`, `challengeLine`, `thirdPc`, `WindowTally` (time windows for Jam challenges). |
| `web/js/colors.js` | Pure. `FN` map (T/S/D/X: name, hex, CSS var), `fnOf(key, chord)`, `fnColor`, `fnClass`. |
| `web/js/reviewbar.js` | The review-walk banner shared by Koło and Piosenki (also used by Plan dnia and Fiszki to start a walk). |
| `tests/prio2.test.js` | 18 node tests: review scheduling, legacy records, `first` day, timing/dynamics analysis, bass vs chord, empty/odd input, challenges, item parsing/titles/prompts, dice (seeded, 40/30/30 distribution), hints, first-new-today, walk, function mapping in all 24 keys, CSS colour variables + contrast, `jamCycle` call–response. |
| `tests/e2e_prio2.py` | Playwright end-to-end (see results). |

### Changed
| File | Change |
|---|---|
| `web/js/mastery.js` | `REVIEW_DAYS`, `addDay`, `daysBetween`, `dueOf`, `isDue`, `dueReviews`, `upcomingReviews`. `recordPass` keeps new fields (`first`, `firstTs`, `tail`, `due`, `step`, `lapses`) — before, it rewrote the record with a fixed field list — and returns `review: {ok, days, due} | null`. Also accepts `clean` (clean steps of a wait/dark pass) and `ts`. |
| `web/js/modes/guide.js` | In *W tempie*: each right note's onset vs its step time (one per step × key; also the "a little early for the next step" path and across the loop wrap) and velocity, plus a log of all your notes; after each whole pass `onFeedback({hits, log, steps, times, idx, beat, tempo})`. Onset = router timestamp `e.ts` (same clock as the server's schedule; falls back to `bus.now()` if it is more than 5 s off) minus `settings.latencyMs`. Strip steps get a function class when a step has `fn`. |
| `web/js/modes/kolo.js` | Preset handling extended (hand, sevenths, pattern, way, inversions, `why`, review). Row with **Kostka**, **Do powtórki: N** and one rotating hint (in the tab row on phones); a message line under it (dice reason / review banner). Feedback panel under the play row on all four cards. Step metadata (`fn`, `ct`, `third`, `change`) on Akordy/Progresje/Akompaniament; chord root marks get the function strip; family cards and Progresje numbers coloured by function with a T/S/D tag and a legend; "Wyzwanie" select on Progresje/Akompaniament. A review forces the lights off for that item. Free-play scale runs also count as reviews. |
| `web/js/modes/piosenki.js` | Preset (song, section, pattern, way) for reviews/hints; review banner; feedback panel; chart numbers and strip coloured by function in the section's key; borrowed chords neutral grey with dashed underline (was yellow, which now means subdominanta; the "Spoza rodziny" text updated). |
| `web/js/modes/jam.js` | "Wyzwanie" select next to Start (enabled for *Ty: solo* and *Ty: akordy*); live counts + one plain line after each lap; "teraz ty / słuchaj" on the board in Pytanie–odpowiedź; global bar counter across laps; board number, next chord and chord chips coloured by function; root marks get the function strip. |
| `web/js/grooves.js` | `jamCycle` options `callResponse`, `barOffset`; returns `bars`; `answerBar(globalBar)`. In the answer bars the piano part is not scheduled at all (gap is audible); with *Ty: akordy* the trainer's piano *asks* in the band bars. |
| `web/js/ui.js` | `Keyboard.mark` accepts `fn` (CSS colour) → `.m-fn` strip at the top of the key; cleared with the other mark classes. |
| `web/js/app.js` | Plan dnia: panel "Powtórki z Koła" (count, *Zagraj powtórki*, *Kostka*, up to 2 hints). "Na koniec" bar once a day (Plan dnia or ≥ 25 min played today, `data.days[today].sec`). Only additive lines; nav/ENGINES untouched. |
| `web/js/modes/fiszki.js` | Section "Z Koła i Piosenek: do powtórki N" above the flashcards: today's reviews as "Zagraj …" prompts with *Zagraj powtórki*/per-row *Zagraj*, and the next 8 upcoming reviews with "jutro / za N dni". |
| `web/js/help.js` | New entry "Kostka, powtórki i informacja po próbie" (inserted after "Umiem"); one sentence in "Piosenki" about colours. |
| `web/style.css` | Everything appended at the end under `/* --- Prio 2 --- */` (CSS variables `--fn-t/-s/-d/-x`, classes, compact rules). Nothing above it was edited. |

`store.js` is untouched (the other developer edits `MODES` there).

## Item ids and data fields
- **No new item ids.** Mastery ids stay `${mode}${wheelIndex}|gama|<scale>|<hand>`, `…|akordy|rodzina|3|7`, `…|akordy|przewroty|<idx><3|7>`, `…|prog|<id>`, `…|akomp|<pattern>|<prog>`, `song|<id>|<section>|<pattern>`. `suggest.parseItem` reads them all.
- **New fields in a mastery record** (`data.mastery[id]`, all optional, old records keep working):
  - `due` — YYYY-MM-DD of the next review; `step` — index into `REVIEW_DAYS = [1, 2, 4, 7, 15, 30]`; `lapses` — failed reviews.
  - `tail` — the last 6 passes, oldest first, `c` clean / `x` not (for "Słabe miejsce: … 2 ostatnie przejścia się sypały").
  - `first`, `firstTs` — day and epoch seconds of the very first pass (for "Na koniec"); set only when the record is created.
  - The server still merges a record as a whole by `passes`; every review is a pass.
- **New settings / mode fields:** `settings.p2EndTip` (day the "Na koniec" tip was shown), `modes.kolo.lastDice`, `modes.kolo.chal`, `modes.jam.chal` (`'' | 'ct' | 'third' | 'qa'`).
- **Presets** (`ctx.go(view, {preset})`): Koło accepts additionally `hand`, `sevenths`, `pattern`, `way`, `inv`, `item`, `why`, `review`; Piosenki accepts `song`, `section`, `pattern`, `way`.
- **Guide steps** may carry `fn` (`'T'|'S'|'D'|'X'`), `ct` (chord pitch classes), `third` (pitch class), `change` (a new chord starts here). Keyboard marks may carry `fn` (CSS colour).

## Design decisions

### 1. Kostka
- Categories: **weak** = stage 1–2 and one of the last two passes not clean (new `tail` field, last 6 passes `c`/`x`), or stuck at stage 1 for ≥ 4 passes; **in progress** = other stage 1–2; **new** = the same thing you already play, moved one step on the wheel (±1, same mode), then the basics (gama rh, rodzina, first progression, gama lh, akompaniament *blok*) in neighbouring keys. No progress at all → gama C/G/F-dur prawą ręką.
- Weights 0.4/0.3/0.3, renormalised over non-empty groups. The last pick is excluded when there is another choice (`kolo.lastDice`). New things: random among the 4 closest candidates.
- It always navigates through `ctx.go('kolo', {preset})` (a clean remount), and the why sentence stays visible until the card shows something else.
- Suggested way: new → Prowadzę, started → W tempie.
- Hints (one at a time on the Koło, rotating every 25 s when not playing; up to two on Plan dnia): "Do powtórki dziś: N rzeczy", "Ta gama jest gotowa na „Bez świateł”: …" (stage 2, fade ≥ 2), "Dawno nie grałeś tonacji z bemolami / z krzyżykami / w tonacjach molowych (ostatnio N dni temu)" (≥ 7 days, only when you played anything in the last 14 days and have ≥ 3 started things), or "… jeszcze przed tobą. Najbliżej jest F-dur: jeden bemol." with an *otwórz* link when never played.

### 2. Powtórki
- Fields in the mastery record: `due` (YYYY-MM-DD), `step` (index into `REVIEW_DAYS = [1, 2, 4, 7, 15, 30]`), `lapses`. Reaching "umiem" schedules a review tomorrow.
- A review = a pass on a due day with the lights off: *W tempie* with `fadeUsed ≥ 3` (a hint or hesitation lights make it not a review, so it can be tried again) or *Bez świateł* (clean = no miss).
- Clean → next interval (2, 4, 7, 15, 30, 30…). Not clean → stage 3 → 2 (`keySummary` no longer counts it as known, so the wheel arc dims), `cleanRun = 0`, due tomorrow. A clean review on a lapsed item brings "umiem" back (one pass, not three — it was known before; easy to explain: "jedno czyste przejście przywraca „umiem”").
- Old "umiem" records (before Prio 2, no `due`) are due the day after their last pass, so they enter the cycle by themselves.
- During a review walk the item's lights are forced off (`guide.fade = 3`) even with "Światła: pełne".
- The walk: *Do powtórki: N* (Koło), *Zagraj powtórki* (Plan dnia, Fiszki) → opens each item's card (Koło or Piosenki) in W tempie (or Bez świateł if that is your current way); banner: "Powtórka 2 z 3: Zagraj 2m–5–1 w E♭-dur. …" → after the pass "czysto. Następna za 4 dni." / "posypało się…" → *Następna powtórka →*; *Pomiń*, *Zakończ powtórki*, summary "Powtórki zrobione: 2 z 3 czysto." (expires at day change). Items whose card no longer exists are skipped.
- **Fiszki hosts the full list** (due now + upcoming with dates). The flashcard boxes themselves were not changed; mastery reviews are a separate list above them because they are played on Koło/Piosenki cards, not inside the Fiszki engine.
- "Na koniec": the first thing whose *first ever* pass was today (`first`/`firstTs`, set only when a record is created — old records never become "new"), proposed once per day (`settings.p2EndTip`).
- Server merge: still "more passes wins" per item; every review is a pass, so the newer state wins. Two windows doing a review of the same item at the same pass count: the last save wins (same as before for any field).

### 3. Informacja po próbie
- Shown after a whole pass (not during), in the panel under the play row; a window pass of the smart loop is not analysed. Lines, e.g.:
  - "Rytm: średnio 18 ms za wcześnie. 11 z 15 dźwięków w ±30 ms." (or "średnio na czas (7 ms za późno)" within ±30 ms)
  - "Najbardziej się spieszysz: krok 5 (A), 62 ms za wcześnie." / "…spóźniasz…" (only beyond ±30 ms)
  - "Bas wchodzi średnio 25 ms po akordzie." / "Bas i akord razem (różnica 8 ms)." — a step has a bass when its lowest note is ≥ a fifth under the next; a played note counts as bass when it is under the upper notes by more than a major third. Needs ≥ 2 such steps. Tolerance here ±15 ms (inside a chord the ear is finer than on the beat).
  - "Dynamika: równa (±6)." / "Dynamika: nierówna (±14): kroki 5–7 głośniej o ok. 20." — spread = SD of per-step mean velocity (bass notes apart), ≥ 4 steps; "równa" ≤ 8; the longest run of consecutive steps louder/softer than the mean by > 0.75 × max(8, SD).
- Fewer than 3 right notes → one plain line instead of numbers.

### 4. Wyzwania
- Koło (Progresje, Akompaniament), counted per pass *W tempie* and shown in the same panel: "Wyzwanie: 30 z 32 dźwięków to dźwięki akordu (94%)." and "Wyzwanie: 7 z 8 zmian z tercją." (third of the new chord from 80 ms before the change to one beat after; repeated identical chords are not a change; power/sus chords skipped). In Progresje chord tones in any octave do not spoil a step, so you can add top notes from the chord; in Akompaniament (exact notes) extra notes still spoil the step — the challenge only reports.
- Jam (*Ty: solo*, *Ty: akordy*): running counts under the board + "Okrążenie 2: 7 z 8 zmian z tercją." after each lap (computed when the lap's last window has closed). Chord-tone share uses the chord sounding at your note's timestamp. **Pytanie–odpowiedź**: bars are counted from the start of the jam (also across laps of other lengths, key walks, tempo steps); bars 1–2 of every 4 the band asks (piano plays), bars 3–4 are yours (piano silent, drums/bass go on); the board says "słuchaj" / "teraz ty"; count = in how many of your 2-bar places you played anything. Changing to Pytanie–odpowiedź while running takes effect from the next lap.

### 5. Kolory funkcji
- By degree number, the same in major and minor: 1, 3, 6 = **tonika** (blue `#5c9dff`), 2, 4 = **subdominanta** (yellow `#ffe066`), 5, 7 = **dominanta** (pink-red `#ff5c8a`), outside the family = neutral (`#a7a0c0`, dashed). In minor also 5m and the leading-tone 7° count as dominants. Seventh/ninth/sus/add/slash chords by base triad and root.
- Checked: contrast vs the panel 5.3–12:1; T/S/D pairwise ΔE (CIELAB) ≥ 47 under simulated deuteranopia, protanopia and tritanopia; S is much lighter than T/D so they differ in lightness too; plus a letter tag (T/S/D) on family cards so colour is never the only cue.
- **Role colours (1/3/5/7/9) kept as they were.** The first candidate red was almost the root's orange (ΔE 15); the chosen pink-red is ΔE 37 from it. More importantly they never share an element: role colours fill the note bubbles/tone chips, function colour is used for chord *labels* (numbers, chips, bars) and on the keyboard as a **thin strip at the top of the root key** (a different place from the bubble).
- Used in: Koło Akordy (top bar, number, tag, legend), Progresje (header numbers, strip bars), Akompaniament (strip bars), Piosenki chart numbers + strip, Jam board number, next chord, chord chips; root strip on keys in Koło/Piosenki/Jam.
- Piosenki's "spoza rodziny" was yellow; yellow is now subdominanta, so borrowed chords are grey with a dashed underline (texts updated).

## Known limits
- Timing uses the router's note timestamp; if the router clock is more than 5 s away from the server's, it falls back to the time the note reached the page (adds SSE delay; numbers lean late).
- Only *W tempie* is analysed (Prowadzę/Bez świateł have no clock). The scale walk ("po kole") shows the numbers of the pass that just ended.
- `keySummary` (wheel arcs) still counts records of cards that no longer exist (unchanged Prio 1 behaviour); reviews, dice and hints ignore them.
- Settings like `p2EndTip` and `kolo.lastDice` are not merged server-side (last window wins) — at worst the "Na koniec" tip shows once more.
- The Jam's chord-tone/third counts use the note timestamp without the latency setting (as the Jam's trail does).
- Phone: the hint text is hidden (only Kostka/Do powtórki buttons, in the tab row); the colour legend is hidden.

## Test results (final code, 2026-11-09)
Every e2e suite ran under the shared lock (`flock /tmp/trener-e2e.lock`, ports checked free first).

| Suite | Result |
|---|---|
| `node --test tests/*.test.js` | **77 pass / 0 fail** (59 before + 18 new in `prio2.test.js`) |
| `python3 tests/test_server_merge.py` | merge OK |
| `e2e.py`, `e2e_phone.py`, `e2e_scales.py`, `e2e_loop.py`, `e2e_loop_docelowe.py`, `e2e_prio1.py`, `e2e_redteam.py`, `e2e_freeplay.py`, `e2e_piosenki.py`, `e2e_jam2.py` | all exit 0, no `BAD`, no `FAILED`, no JS errors. Their OK/BAD lines match a baseline run of the unchanged copy (only random values like the phone key differ). |
| `e2e_prio2.py` (new) | **42/42 OK**, no JS errors |

What `e2e_prio2.py` covers (seeded data: an "umiem" scale with a review due yesterday, a weak progression, a gama ready for Bez świateł, an untouched flat key, a progression id that no longer exists):
- Koło row shows Kostka, "Do powtórki: 1" (the removed card is ignored) and a hint. The dice (4 rolls) always opens the card it names: the key in the why sentence matches the wheel. The weak pick opens Progresje ii–V–I in E♭-dur in W tempie.
- Review walk: the banner gives the prompt; a pass with 7 missed steps → "posypało się", the server record goes stage 3 → 2 with `due` = tomorrow, and the C-dur arc on the wheel dims; summary "Powtórki zrobione: 0 z 1".
- Timing: playing 170 ms after each step lights up → "średnio ~150 ms za późno", dynamics "równa"; playing 150 ms ahead with steps 5–7 louder → "średnio ~165 ms za wcześnie" and "nierówna (±19): kroki 5–7 głośniej".
- Colours: family T S T S D T D, tonika computed as rgb(92,157,255), the G root key gets the dominant strip; Progresje strip T D T S; Jam chips T D T S; Piosenki chart numbers coloured.
- Progresje challenge "Tylko dźwięki akordu": an added D over G counts as a chord tone, an F♯ over F does not → exactly one non-chord tone counted; the bass vs chord line appears.
- Fiszki lists the lapsed scale under "Następne … jutro"; Plan dnia shows the panel with Kostka; the "Na koniec" tip appears, opens the Koło and is not proposed again the same day.
- Jam: "Tercja na zmianie: 6 z 7" with one change missed on purpose + "Okrążenie 1: 3 z 4 zmian z tercją."; chord tones counted live; Pytanie–odpowiedź with the band: the board shows both "słuchaj" and "teraz ty", and the trainer's piano played 33 notes in the band's bars and 0 in yours.
- Phone (iPhone 13 Pro Max, landscape and portrait): no horizontal overflow on Gama, Akordy, Progresje, Akompaniament, after a dice roll, Jam, Plan dnia, Fiszki; in portrait the Gama play button stays on screen with the Kostka row. Landscape Progresje has the same height as before (the challenge select sits in the existing row).

Screenshots: `/tmp/claude-0/-home-claude/53b6de72-3dcb-5eb9-86f4-0a2fa82cd438/scratchpad/p2/run1/e2e_prio2/shots/`.
