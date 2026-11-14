# Trener: zacznij tutaj (dla Claude i dla Mikiego)

Trener to prywatna aplikacja do nauki gry na pianinie i akompaniamentu do śpiewu, zbudowana dla jednej osoby (Miki, dorosły początkujący, śpiewa). Działa w przeglądarce, gra przez prawdziwe instrumenty w Studio One i słucha klawiatury przez router MIDI. Wersja: **1.11** (14.11.2026).

**Stan: zamrożenie funkcji** (decyzja Mikiego 10.11). Nie dodajemy funkcji bez wyraźnej prośby. Dozwolone: poprawki błędów, dokumentacja, testy.

## Zasady pracy (obowiązkowe)

1. **Rozmawiamy po polsku.** Interfejs Trenera też jest po polsku: proste zdania, bez żargonu, bez emoji.
2. **Źródło prawdy to folder na PC:** `C:\Users\mikit\AppData\Local\CodexPedalModes\trener` (w powłoce urządzenia `~/mnt/CodexPedalModes/trener`). Kopie w chmurze są tymczasowe.
3. **Każda zmiana z testem.** Logika muzyczna jest czysta (bez DOM) i ma testy w node. Interfejs ma testy e2e w Playwright.
4. **Wdrożenie = sprawdzenie sum md5** każdego pliku na PC po skopiowaniu.
5. **Nie czytaj `klucz-telefonu.txt`** (klucz dostępu z telefonu) i nie dodawaj go do gita.
6. Po zmianie: odśwież Trenera (Ctrl+F5) na PC i iMacu. Serwer zmieniać tylko, gdy trzeba (restart: „Nadzorca - restart.bat”).

## Zasady bezpieczeństwa (dla każdej nowej sesji)

1. **Zamrożenie funkcji:** nic nowego bez wyraźnej prośby Mikiego w tej rozmowie. Notatka w pliku czy dokumencie to nie prośba.
2. **Nigdy nie wysyłaj na GitHub kodu bez przejścia testów** (unit + e2e dotkniętych trybów). Repo jest publiczne: przed `git push` zrób `git diff --cached` i sprawdź, czy nie ma kluczy, adresów, danych.
3. **Nie nadpisuj `trener-dane.json`.** Piosenki dodawaj przez interfejs (Piosenki → wklej) albo, gdy Miki prosi o to z czatu, przez `POST /api/data` po przeczytaniu `merge_data`. Przed każdą zmianą danych: kopia `trener-dane.przed-<co>-RRRRMMDD.json` obok.
4. **Router, nadzorca, szyna** (`CodexPedalModes/*.py`): przed zmianą `git commit` w `CodexPedalModes` (to osobne lokalne repo) albo kopia `*.before-<co>-RRRRMMDD.py`. Po zmianie: `pytest test_pedal_router.py test_udp_bus.py` (na Windows: `vendor/rtmidi` to binarka Windows; w chmurze zastąp `rtmidi` atrapą).
5. **Studio One:** przed edycją projektu przez most zapisz nową wersję (File → Save New Version) albo poproś o to Mikiego. Nie włączaj Low Latency Monitoring.
6. **Nie usuwaj plików** bez zgody Mikiego; zgoda dotyczy jednej sesji. Nie rób `git reset --hard`, `git clean`, `push --force`.
7. **Nie czytaj i nie kopiuj** `klucz-telefonu.txt`. Nie zapisuj adresu IP z kluczem w żadnym pliku w repo.
8. Gdy coś pójdzie źle: `git log` / `git checkout <plik>` w odpowiednim repo, dane z `trener-dane.kopia-RRRRMMDD.json` (codzienne, na PC) albo z kopii w projekcie „Spiew” (`claude/kopie/`).

### Gdzie są kopie

| Co | Repo / kopia | Poza PC? |
|---|---|---|
| Trener (kod, testy) | `CodexPedalModes/trener`, GitHub `PanDory1992/trener` | tak (publiczne) |
| Router, nadzorca, szyna, krzywe velocity, źródła Uszy i KeystationStatus | lokalne repo `CodexPedalModes` (bez `trener/`, logów, binariów) | nie, dopóki nie ma prywatnego repo |
| Poprawki mostu Studio One (`uszy_*`, kanały) | `studio-one-mcp-upstream`, gałąź `miki-poprawki` | nie |
| Dane Trenera | codzienne kopie obok pliku; ręczna kopia w projekcie „Spiew” `claude/kopie/` | tylko ręczna kopia |

## Jak to działa (tor sygnału)

```
Keystation Pro 88 ──USB──> pedal_router.py (krzywe velocity, pedał, tryby)
                              │  port MIDI „Keystation Pedal Modes” ──> Studio One (instrumenty)
                              │  szyna UDP 127.0.0.1:47800 (udp_bus.py): zdarzenia note / pedal / state / button
                              ▼
                     trener_serwer.py (port 47810) ── SSE /api/events ──> przeglądarka (web/)
                     przeglądarka ── POST /api/play ──> serwer ──> szyna ──> router ──> Studio One
```

- Nadzorca `CodexPedalModes/keystation_supervisor.py` pilnuje routera, mostu i serwera Trenera (`--no-idle-exit`). Startuje z Windows.
- Na iMacu (Linux Mint, Chromium) i iPhonie Trener otwiera się przez Wi-Fi pod adresem `http://192.168.1.234:47810/?k=<klucz>`. Bez klucza dostęp jest tylko z PC.
- Dane: `trener-dane.json` (postępy, ustawienia, karty, piosenki); codzienna kopia `trener-dane.kopia-RRRRMMDD.json`. Ustawienia mają znaczniki czasu na jednostkę (`data.at`), a serwer scala je z wielu okien (`merge_data`).

## Dane użytkownika to nie kod

**Piosenki, postępy i ustawienia są w `trener-dane.json`, nie w repozytorium.** Dodanie piosenki nie wymaga zmian w kodzie.
- Najprościej: Trener → **Piosenki** → wklej akordy jako tekst (styl Ultimate Guitar, z tekstem albo bez; sekcje w `[Zwrotka]`). Parser: `songs.js` (`parseChart`, `parseChord`). Format zapisu: `{ id, title, text }` w `data.songs`.
- Z edytora Jamu: **Zapisz jako piosenkę** (`stepsToChart`).
- **Nie edytuj `trener-dane.json` ręcznie przy działającym serwerze:** otwarte okna zapisują swój stan i mogą nadpisać zmianę. Serwer scala piosenki po `id` (`merge_data` w `trener_serwer.py`), więc zapis przez `/api/data` jest bezpieczny dopiero po przeczytaniu `merge_data`.

## Kanały MIDI (umowa z projektem Studio One „2026-10-06 mikit”)

| Kanał | Co | Ścieżka w Studio One |
|---|---|---|
| 1 | **tylko twoja klawiatura** (Trener nic tu nie gra od 12.11) | Ja (Pianoteq / inne) → Pianino Bus |
| 2 | bas zespołu | Bas (Presence, kontrabas) → Bas Bus |
| 3 | **wszystko, co Trener gra na pianinie**: podgląd akordów, pokazy, „Graj ze mną”, klik na pianinie (C7), klawisze zespołu, bas bez zespołu | Klawisze (Pianoteq) → Klawisze Bus; **wejście ścieżki musi być CH 3** (ustawia Miki) |
| 10 | perkusja (GM: 36 stopa, 37 rim, 38 werbel, 42/44/46 hi-hat, 49 crash, 51 ride, 53 dzwonek, 43–50 tomy) | Perkusja (Impact) + wyjścia „Perkusja 2–8” → Perkusja Bus |
| 16 | klik metronomu, pady C1–G1 (36–43) = warianty 1–8 | Klik (Impact 2, zestaw „KLIK”) → Klik Bus |

Głośność zespołu Miki ustawia **suwakami busów** (od 10.11; wtyczki na busach usunął, zostały tylko Uszy na 0 dB na Klawisze Bus). Wtyczka **Uszy** (pomiar LUFS i wzmocnienie, sterowana przez most) jest dostępna, gdyby trzeba było znów mierzyć albo wyrównywać. Szczegóły: dokument projektu `claude/studio-one-uszy.md` (wzmocnienia tam opisane są historyczne). Pułapki Studio One:
- **Low Latency Monitoring musi być wyłączony**, bo inaczej wtyczki dostają ciszę;
- nie uruchamiać jako administrator, bo blokuje sterowanie myszą;
- dodatkowe wyjścia instrumentów muszą iść na busy, bo inaczej przesterowują Main.

## Pliki (web/js)

**Rdzeń**
- `app.js`: nawigacja, ekran główny, plan dnia, pilot (C56–C60), klawiatura na żywo, panel „Co ja gram?” (używa `chords.identify` i pedału).
  - **Pasek grania** (`#dockbar`, od 1.9): tryb przekazuje swoje przyciski grania przez `ctx.dock(node)`; `go()` czyści pasek przy zmianie trybu. Używają go Koło i Palce (Pokaż, Graj ze mną, Pętla, sposób, Tempo), Piosenki (Kto gra: Sam / Perkusja i bas / Cały zespół i przyciski do tego) i Jam (Start, Styl `select.jam-style`, Tempo, Wyzwanie, Zapisz, Światła). Ćwiczenia (Echo i reszta) mieszczą się na ekranie i paska nie używają. Na stronie trybu nie powinno być drugiego `.tempo-field`, bo testy szukają jednego.
  - Jam: na stronie zostaje rząd `.jam-quick` (Tonacja, Akordy `select.jam-prog`, Twoja rola, Zespół) i edytor; reszta w `details.jam-set` „Więcej ustawień” (domyślnie zwinięte, `st.setOpen`). W testach: `pick_style(pg, nazwa)` i `open_jam_settings(pg)` z `e2e.py`.
- `bus.js`: połączenie z serwerem (SSE, `play`, `at`). **Każde granie przechodzi przez `bus.play`, a ono przez `outch.js` (`toTrainerCh`): kanał 1 → 3.** Nowy kod może pisać `0x90`; i tak nie trafi na kanał Mikiego.
- `store.js`: dane, ustawienia, synchronizacja wielu okien.
- `ui.js`: `el()` / `fill()`, klawiatura, wykresy, toast.
- `key.js`: wspólna tonacja.

**Teoria i muzyka**
- `theory.js`: pisownia we wszystkich 24 tonacjach, `QUALITY`, `FAMILY`, `PROGRESSIONS` (27), skale, `voicing()` (prowadzenie głosów). Ma też **stare** `recognize()`, nieużywane w UI, zostaje dla testów.
- `chords.js`: **silnik akordów** (1.6–1.7):
  - `CATALOG` (69 rodzajów jako wzory, dopisane do `QUALITY`);
  - kroki edytora (`normStep`, `stepChord`, `stepChords`) i układy (`chosenVoicing`, `voicingOptions`, `vrel`);
  - `suggestions`, `nextMoves`, `CADENCES`, `degreeGrid`, `matchingScales`, `rekey`, `modTargets`, `pivots`, `heldToStep`;
  - **`identify()`**: rozpoznawanie, slash, rootless, układ, ręce, źródło;
  - `detectKey`, `stepsToChart`, `simpleSpell`, `degAlt`.
- `bandplay.js`: Piosenki → „Zespół gra ze mną” (`songBand`: jedno przejście piosenki przez `jamCycle` z odliczaniem; `chunkEvents`: kawałki po ≤3000 zdarzeń, bo serwer bierze najwyżej 4000 na raz; `chordAt`).
- `songs.js`: piosenki z tekstu (akordy w stylu Ultimate Guitar), `parseChord` (zna symbole z katalogu), `textToSteps`.
- `music.js`: generatory i ocenianie dla starszych trybów.
- `colors.js`: kolory funkcji T/S/D.
- `fingers.js`, `scaledetect.js`, `smartloop.js`, `mastery.js` („umiem”, powtórki), `feedback.js`, `suggest.js` (kostka, podpowiedzi).
- **Ćwiczenia (1.10): wspólny szkielet** dla Echa, Echa dynamiki, Siłowni, Nut docelowych, Ze słuchu i Aksaka:
  - `drill.js` (czysty, testy `drill.test.js`): `stepLevel` (krok poziomu proporcjonalny do wyniku 0–100, próg `PASS` 80), `axesOf` / `applyScores` (osie trudności; stary jeden poziom = start wszystkich osi), `Coach` (pętla błędu: ten sam → łatwiej → całość → dalej; nieudany wraca po 4 innych, raz), `Series` (10 prób, podsumowanie, najczęstsza rada), `rung`;
  - `ladders.js`: osie (`AXES`: echo melodia/rytm/dynamika, aksak metrum/puls, reszta jedna) i drabinki „Teraz / Dalej” zgodne z progami generatorów w `music.js` (test `ladders.test.js`);
  - `drillui.js`: `createDrill` (nagłówek z „Jak to działa” rozwiniętym tylko za pierwszym razem, `settings.seenAbout`; ramka Teraz/Dalej, poziom, seria n/10; `counted()` zapisuje próbę przez `store.recordScores` i kończy serię `store.logSeries` → `days[d].series`), `verdict` (duży werdykt + jedna rada `.drill-tip`), `drillDock` (Start/Następne · Jeszcze raz · Podpowiedź · ⋯), `seriesCard`;
  - generatory przyjmują osie: `echoMotif(axes, seed, {focus, hand})`, `aksakPlan(axes)`, `earMelody(level, seed, {leapBias})`; oceny zwracają `scores` i `tip` `{kind, text, mark?}` (`gradeEcho`, `gradeDynamics`, `gradeAksak` z `drift`); `easierMotif`, `easierAksak`;
  - Echo dynamiki: tolerancje pod Keystation, czarny klawisz z surowym 1 nie jest oceniany; Nuty docelowe odejmują `settings.latencyMs`; pomiar opóźnienia jest w Ustawieniach (`measureLatency` w `modes/common.js`).
  - **Etap 2 (1.11)**, testy `stage2.test.js`:
    - `drill.js`: `selfBand` / `selfStats` (Ucho na siebie: `rec.self`), `coldTrend` (zimny start: `rec.cold {data: wynik}`, `rec.coldDay`), `dueDebt` / `settleDebt` / `addDebt` (Rewanż: `rec.debts`, jedno podejście, po 2 dniach odpuszcza), `speedCurve` (tempo graniczne z `rec.speed [tempo, rytm]`);
    - `music.js`: `variedMotif` (co 4. świeży motyw w Echu: inna tonacja, oktawa albo ręka), `earVariation` (Ze słuchu), `gradeLegato` (Echo od melodii 6; potrzebuje puszczeń klawiszy: `Capture.feed` zapisuje `off`, nie kończy przechwytu);
    - `drillui.js`: `ask()` „Jak poszło?” (C56/C57/C58 przez `pilotAnswer`, wyłącznik `settings.selfCheck`), `recordSelf`, `debts`, `details()` (szczegóły zwinięte, C58 otwiera, `settings.detailsOpen`), `addLine`; `seriesCard` pokazuje zimny start, ucho na siebie i tempo graniczne;
    - Echo: „Najpierw zaśpiewaj” (`opt.sing`), „Tempo 90% granicy” (`opt.tempo90`); Ze słuchu: „Najpierw zaśpiewaj”; Plan dnia: panel „Zimny start” (`coldPanel`).
- `pedalcoach.js` (13.11): przy każdej zmianie harmonii ocenia pedał: `good` (zmieniony zaraz po akordzie), `blur` (trzymany przez zmianę), `early` (puszczony za wcześnie). Werdykt na chwilę w „Co ja gram?”, licznik dnia `days[d].pedal_*`, panel „Pedał dziś” w Planie dnia.

**Zespół**
- `grooves.js`:
  - **33 style** (`GROOVES`: `drums` jako wzorce znakowe X/x/o, `bass`, `comp`, `feel`, `family`);
  - `jamChords`, **`jamCycle()`**: zdarzenia jednego okrążenia, z pauzami, arpeggio (`arp`), humanizacją (`human`), basem „na żywo” (`bassLive` → `bassPlan`), `keysOwn` (kanał 3) i `drummer`;
  - `bassMidi()`: bas idzie za akordem, slashem, prawdziwą kwintą i septymą.
- `drummer.js`: **4 poziomy perkusisty** (`drumBar`, `familyOf`: straight / swing / latin / triplet / odd).
- `click.js`: klik (fortepian albo kanał 16).
- `midi.js`: eksport pliku SMF.
- `editor.js`: **edytor progresji** w stylu Chord Suggestera:
  - Zmień: Rodzaj, Układ, Bas, Interwały;
  - + Akord: Co dalej, Propozycje, Stopnie, Kadencje, Wpisz, Zbuduj;
  - + To, co trzymam, Pauza, Sekcja, Tekst, Modulacja;
  - zaznaczanie, pętla zaznaczonych, cofnij i ponów, pasujące skale.

**Tryby (web/js/modes)**
- `kolo.js`: Koło tonacji z kartami (`ROLE_TONE` to kolory ról 1/3/5/7/9…).
- `jam.js`: Jam, który łączy edytor, zespół, perkusistę, eksport MIDI i bas słuchający gracza.
- `piosenki.js`: Piosenki: „Zespół gra ze mną” (Perkusja i bas / Cały zespół, styl zapamiętany dla piosenki w `meta[id].style`, ▶ Ta część / ▶ Cała piosenka, świeci grający akord) i przejście „Zagraj z zespołem / edytuj w Jamie”.
- `guide.js`: Graj ze mną.
- `palce.js`: Ćwiczenia → Palce.
- `echo`, `dynamika`, `akordy` (Siłownia), `docelowe`, `ucho`, `aksak`, `fiszki`, `wolne`.

**Serwer:** `trener_serwer.py`:
- GET `/`, `/api/events` (SSE), `/api/now`, `/api/data`, `/api/insights`, `/api/week`, `/api/phone`;
- `notes_report.py` (13.11): czyta tygodniowe pliki routera `../notes/notes-RRRR-Wtt.csv`; `/api/week` = dynamika tego tygodnia i poprzedniego oraz jedno zadanie (karta „Twoja dynamika” w Planie dnia); `/api/insights` też czyta stąd. Czarne i białe porównuje na surowej sile bez „1”, bo krzywa routera i dziura w czarnych klawiszach zaniżają czarne;
- POST `/api/play`, `/api/stop`, `/api/data`, `/api/quit`;
- `VERSION = "1.8"`.

## Model kroku edytora (Jam „Własna / edytor”, `st.custom[mode]`)

- **Akord:** `{ k:'chord', d, a, q, bars, f?, inv?, oct?, open?, drop?, vrel?, bass?, skip?, lock? }`
  - `d` to stopień 1–7, `a` to alteracja względem durowej, `q` to id z `QUALITY`;
  - `bars`: 0 znaczy „jak reszta”;
  - `f`: własne interwały, np. `['1','b3','5','9']`;
  - `bass`: półtony nad prymą (slash);
  - `vrel`: twój układ względem prymy;
  - `lock`: „Barwa” nie podnosi.
- **Inne kroki:** `{k:'rest', bars}`, `{k:'sec', label}`, `{k:'text', label}`, `{k:'mod', shift, mode?}`.
- **Stare tablice** `[d, a, q, bars]` (gotowe progresje) dalej działają przez `normStep`.

## Testy

- Unit (node 18+): `cd tests && node --test *.test.js`, 153 testy. Python: `python3 tests/test_notes_report.py` (ALL OK). Muszą przejść wszystkie.
- E2E (Python + Playwright + Chromium): `python3 tests/e2e_<nazwa>.py`. Każdy uruchamia prawdziwy serwer w kopii katalogu, fałszywy router i przeglądarkę. Port 47810 musi być wolny, więc **uruchamiaj je jeden po drugim**. Potrzebują `udp_bus.py` z `CodexPedalModes` (ścieżka ustawiona w `e2e.py`).
- Zestawy: e2e, phone, scales, loop, loop_docelowe, prio1, redteam, freeplay, piosenki, jam2, prio2, palce, click, settings_sync, editor, drummer, songband, pedal, drill. Każdy kończy się „ALL OK” albo „SUMMARY n/n OK” i „JS errors: none”.

## Wdrożenie (z chmury na PC)

1. Skopiuj zmienione pliki do `~/mnt/CodexPedalModes/trener/...`.
2. `md5sum` po stronie PC musi się zgadzać z kopią źródłową.
3. Odśwież przeglądarki. Zmiana w `trener_serwer.py` wymaga restartu serwera (nadzorca).

## Git i GitHub

- Repozytorium: **https://github.com/PanDory1992/trener** (publiczne, decyzja Mikiego 12.11). Nigdy nie commituj `klucz-telefonu.txt`, `trener-dane*.json` ani logów (pilnuje tego `.gitignore`).
- **Folder na PC to klon tego repozytorium** (`origin` = GitHub, gałąź `main`). PC czyta GitHuba bez logowania (repo publiczne), ale **nie może na niego wysyłać**, bo nie ma tam danych logowania.
- **Praca z sesji w chmurze:** dołącz repo (add_repo, dostęp push), sklonuj, zmień, przetestuj, `git push`. Potem na PC: `cd ~/mnt/CodexPedalModes/trener && git pull --ff-only`, czyli wdrożenie. `git status` musi być czysty; sumy md5 sprawdza wtedy sam git.
- **Zmiana zrobiona bezpośrednio na PC:** commit na PC, potem `git bundle create` → do chmury → `git push` stamtąd (albo Miki wysyła z GitHub Desktop).
- Etykieta `v1.8` (commit 9ee9b9b) istnieje tylko lokalnie na PC: proxy chmury blokuje wysyłanie tagów.
- Usuwanie plików w folderze PC (potrzebne gitowi do plików blokad) wymaga zgody Mikiego w danej sesji.

## Znane ograniczenia i pułapki

- Bas „słuchający” decyduje 0,22 s przed uderzeniem, więc reaguje od najbliższego uderzenia. Na iMacu przez Wi-Fi zapas jest mniejszy.
- Trener nie słyszy dźwięku (mikrofonu) i nie nagrywa. To największa luka względem celu: śpiew z akompaniamentem.
- Konfiguracja Studio One nie jest sprawdzana przez Trenera. Zmiana kanałów albo ścieżek po cichu psuje dźwięk zespołu.
- Velocity Keystation: około 9 rozróżnialnych poziomów, a czarne klawisze mają w firmware dziurę 1–40 (łata w routerze). Szczegóły: `claude/keystation-mechanika-przebudowa.md`.
- `degAlt` liczy odległość liter **mod 7**. Błąd mod 12 był w 1.6 i jest test regresji.
- Dwa modele rozpoznawania: stary `theory.recognize` i nowy `chords.identify`. W UI używaj tylko nowego.

## Historia wersji (szczegóły w dokumentach projektu „Spiew”)

| Wersja | Data | Co |
|---|---|---|
| 1.1–1.4 | do 8.11 | Koło, Jam, Piosenki, skale |
| 1.5 | 9.11 | Palce, kostka, powtórki, informacja po próbie, kolory funkcji, klik na kanale 16, synchronizacja okien |
| 1.6 | 10.11 | edytor akordów, `identify`, pedał, klawisze zespołu na kanale 3, bas za akordem |
| 1.7 | 10.11 | luki z Suggestera: To, co trzymam, Co dalej, kadencje, tekst, cofnij, zaznaczanie, pasujące skale, modulacja z akordami wspólnymi, N⁶ i +6, eksport MIDI |
| 1.8 | 10.11 | 33 style, 12 progresji, 4 poziomy perkusisty |
| 1.11 | 14.11 | Ćwiczenia, etap 2 z `claude/trener-cwiczenia-plan.md`: „Jak poszło?” (własna ocena przed werdyktem, trafność w podsumowaniu serii), szczegóły zwinięte (C58), Najpierw zaśpiewaj (Echo, Ze słuchu), zimny start (panel w Planie dnia), Rewanż, wariacje dobrze zagranych motywów, tempo graniczne (Echo), legato (Echo). |
| 1.10 | 14.11 | Ćwiczenia na wspólnym szkielecie: punkty 0–100, osie trudności, pętla błędu i powroty, jedna rada pod werdyktem, serie 10 prób z podsumowaniem (Plan dnia: „Serie dziś”), Teraz/Dalej, jednakowe przyciski; Echo: ręka i fokus; Echo dynamiki: tolerancje Keystation i podgląd na żywo; Siłownia: czas reakcji w wyniku, poprzedni akord na klawiszach; Nuty docelowe: dźwięki akordu na klawiszach, wynik na akord; Ze słuchu: podpowiedź interwałem, więcej trudnych interwałów; Aksak: wykres tempa; pomiar opóźnienia w Ustawieniach. Plan: `claude/trener-cwiczenia-plan.md`. |
| 1.9 | 13.11 | Pasek grania nad klawiaturą (wariant B z `claude/trener-ui-plan.md`): przyciski grania zawsze widoczne w jednym miejscu. Jam: style z listy zamiast 34 kart, rzadkie ustawienia zwinięte, „Dlaczego?” zwinięte. Piosenki: jeden wybór „Kto gra”, akompaniament podglądu zwinięty, krótsza lista piosenek. |
| 1.8.2 | 12.11 | Piosenki: zespół gra piosenkę od razu (perkusja i bas albo cały zespół), bez przechodzenia do Jamu. Style w grupach przeniesione do `grooves.js` (`GROOVE_GROUPS`). |
| 1.8.1 | 12.11 | Trener nie gra już na kanale 1: wszystko z pianina idzie na kanał 3 (prośba Mikiego: nuty Trenera biły się z jego grą). W Jamie zniknęło pole „Klawisze zespołu osobno”. Serwer bez zmian (`VERSION` dalej 1.8). |

Dokumenty projektu: `trener-1.1-kolo-i-jam`, `trener-1.3-prio1`, `trener-1.4-piosenki-skale-jam`, `trener-1.5-palce-prio2`, `trener-1.6-edytor-akordow` (zawiera też 1.7 i 1.8), `trener-okiem-pianisty` (ocena i zalecenie zamrożenia), `studio-one-uszy`, `keystation-mechanika-przebudowa`.

## Inne części systemu (poza tym folderem)

- **Repozytoria na GitHubie (13.11.2026):** router, nadzorca, szyna, krzywe velocity, źródła wtyczek Uszy i Keystation Status oraz kopia `studio-one-setup` (most MIDI) → **PanDory1992/keystation-router** (README po polsku). Most MCP do Studio One → **PanDory1992/studio-one-mcp** (fork, gałąź `miki-0.4` = wersja 0.4.0 + poprawki, opis w `MIKI.md`; bez narzędzi `uszy_*`, Uszy nieużywane). PC nie ma uprawnień do wysyłania; wysyłka idzie z chmury (paczka gita z PC → `add_repo` → push).

- `CodexPedalModes/pedal_router.py` z testami `test_pedal_router.py`, `udp_bus.py` z `test_udp_bus.py`, krzywe `velocity-map*.json`.
- **Uszy (VST3, Rust/nih-plug):**
  - źródła w `CodexPedalModes/uszy-plugin/zrodla`;
  - budowanie: cross-kompilacja `x86_64-pc-windows-gnu`, bundle `.vst3`;
  - instalator: „Zainstaluj Uszy.bat”.
- **Most Studio One (MCP):** `C:\Users\mikit\.codex\.chatgpt-projects\g-p-6abc34ebd594819193b82e8c4aa00777\output\studio-one-setup\studio-one-mcp-upstream`, z narzędziami `uszy_*` i poprawką kanałów o tej samej nazwie (zapisane w gałęzi `miki-poprawki`, commit a24b7cf). Instalacja: „Zainstaluj most.bat”.
