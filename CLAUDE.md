# Trener: zacznij tutaj (dla Claude i dla Mikiego)

Trener to prywatna aplikacja do nauki gry na pianinie i akompaniamentu do śpiewu, zbudowana dla jednej osoby (Miki, dorosły początkujący, śpiewa). Działa w przeglądarce, gra przez prawdziwe instrumenty w Studio One i słucha klawiatury przez router MIDI. Wersja: **1.8** (12.11.2026).

**Stan: zamrożenie funkcji** (decyzja Mikiego 10.11). Nie dodajemy funkcji bez wyraźnej prośby. Dozwolone: poprawki błędów, dokumentacja, testy.

## Zasady pracy (obowiązkowe)

1. **Rozmawiamy po polsku.** Interfejs Trenera też jest po polsku: proste zdania, bez żargonu, bez emoji.
2. **Źródło prawdy to folder na PC:** `C:\Users\mikit\AppData\Local\CodexPedalModes\trener` (w powłoce urządzenia `~/mnt/CodexPedalModes/trener`). Kopie w chmurze są tymczasowe.
3. **Każda zmiana z testem.** Logika muzyczna jest czysta (bez DOM) i ma testy w node. Interfejs ma testy e2e w Playwright.
4. **Wdrożenie = sprawdzenie sum md5** każdego pliku na PC po skopiowaniu.
5. **Nie czytaj `klucz-telefonu.txt`** (klucz dostępu z telefonu) i nie dodawaj go do gita.
6. Po zmianie: odśwież Trenera (Ctrl+F5) na PC i iMacu. Serwer zmieniać tylko, gdy trzeba (restart: „Nadzorca - restart.bat”).

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

## Kanały MIDI (umowa z projektem Studio One „2026-10-06 mikit”)

| Kanał | Co | Ścieżka w Studio One |
|---|---|---|
| 1 | twoje pianino i dawny klik na C7 | Ja (Pianoteq / inne) → Pianino Bus |
| 2 | bas zespołu | Bas (Presence, kontrabas) → Bas Bus |
| 3 | klawisze zespołu (akordy, arpeggio) | Klawisze (Pianoteq) → Klawisze Bus; **wejście ścieżki musi być CH 3** (ustawia Miki) |
| 10 | perkusja (GM: 36 stopa, 37 rim, 38 werbel, 42/44/46 hi-hat, 49 crash, 51 ride, 53 dzwonek, 43–50 tomy) | Perkusja (Impact) + wyjścia „Perkusja 2–8” → Perkusja Bus |
| 16 | klik metronomu, pady C1–G1 (36–43) = warianty 1–8 | Klik (Impact 2, zestaw „KLIK”) → Klik Bus |

Głośność zespołu Miki ustawia **suwakami busów** (od 10.11; wtyczki na busach usunął, zostały tylko Uszy na 0 dB na Klawisze Bus). Wtyczka **Uszy** (pomiar LUFS i wzmocnienie, sterowana przez most) jest dostępna, gdyby trzeba było znów mierzyć albo wyrównywać. Szczegóły: dokument projektu `claude/studio-one-uszy.md` (wzmocnienia tam opisane są historyczne). Pułapki Studio One:
- **Low Latency Monitoring musi być wyłączony**, bo inaczej wtyczki dostają ciszę;
- nie uruchamiać jako administrator, bo blokuje sterowanie myszą;
- dodatkowe wyjścia instrumentów muszą iść na busy, bo inaczej przesterowują Main.

## Pliki (web/js)

**Rdzeń**
- `app.js`: nawigacja, ekran główny, plan dnia, pilot (C56–C60), klawiatura na żywo, panel „Co ja gram?” (używa `chords.identify` i pedału).
- `bus.js`: połączenie z serwerem (SSE, `play`, `at`).
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
- `songs.js`: piosenki z tekstu (akordy w stylu Ultimate Guitar), `parseChord` (zna symbole z katalogu), `textToSteps`.
- `music.js`: generatory i ocenianie dla starszych trybów.
- `colors.js`: kolory funkcji T/S/D.
- `fingers.js`, `scaledetect.js`, `smartloop.js`, `mastery.js` („umiem”, powtórki), `feedback.js`, `suggest.js` (kostka, podpowiedzi).

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
- `piosenki.js`: Piosenki, przejście „Zagraj z zespołem / edytuj w Jamie”.
- `guide.js`: Graj ze mną.
- `palce.js`: Ćwiczenia → Palce.
- `echo`, `dynamika`, `akordy` (Siłownia), `docelowe`, `ucho`, `aksak`, `fiszki`, `wolne`.

**Serwer:** `trener_serwer.py`:
- GET `/`, `/api/events` (SSE), `/api/now`, `/api/data`, `/api/insights`, `/api/phone`;
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

- Unit (node 18+): `cd tests && node --test *.test.js`, około 115 testów. Muszą przejść wszystkie.
- E2E (Python + Playwright + Chromium): `python3 tests/e2e_<nazwa>.py`. Każdy uruchamia prawdziwy serwer w kopii katalogu, fałszywy router i przeglądarkę. Port 47810 musi być wolny, więc **uruchamiaj je jeden po drugim**. Potrzebują `udp_bus.py` z `CodexPedalModes` (ścieżka ustawiona w `e2e.py`).
- Zestawy: e2e, phone, scales, loop, loop_docelowe, prio1, redteam, freeplay, piosenki, jam2, prio2, palce, click, settings_sync, editor, drummer. Każdy kończy się „ALL OK” albo „SUMMARY n/n OK” i „JS errors: none”.

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

Dokumenty projektu: `trener-1.1-kolo-i-jam`, `trener-1.3-prio1`, `trener-1.4-piosenki-skale-jam`, `trener-1.5-palce-prio2`, `trener-1.6-edytor-akordow` (zawiera też 1.7 i 1.8), `trener-okiem-pianisty` (ocena i zalecenie zamrożenia), `studio-one-uszy`, `keystation-mechanika-przebudowa`.

## Inne części systemu (poza tym folderem)

- `CodexPedalModes/pedal_router.py` z testami `test_pedal_router.py`, `udp_bus.py` z `test_udp_bus.py`, krzywe `velocity-map*.json`.
- **Uszy (VST3, Rust/nih-plug):**
  - źródła w `CodexPedalModes/uszy-plugin/zrodla`;
  - budowanie: cross-kompilacja `x86_64-pc-windows-gnu`, bundle `.vst3`;
  - instalator: „Zainstaluj Uszy.bat”.
- **Most Studio One (MCP):** `C:\Users\mikit\.codex\.chatgpt-projects\g-p-6abc34ebd594819193b82e8c4aa00777\output\studio-one-setup\studio-one-mcp-upstream`, z narzędziami `uszy_*` i poprawką kanałów o tej samej nazwie. Instalacja: „Zainstaluj most.bat”.
