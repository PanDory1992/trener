# Trener 1.6: edytor akordów i pełne rozpoznawanie (2026-11-10)

Zrobione na podstawie 22 zrzutów z Chord Suggestera (iPhone). Wszystko trafiło w jednej dostawie.

## Silnik akordów: `web/js/chords.js` (bez UI, z testami)
- **Katalog: 66 rodzajów** zapisanych wzorami (1 3 5 ♭7 ♭9…), dopisanych do `theory.QUALITY`:
  - trójdźwięki, sus;
  - 6, add9, add4, 6/9;
  - 7, maj7, ø, °7, m(maj7), 7♯5, 7♭5, maj7♯5;
  - sus septymowe;
  - 9, 11, 13;
  - alteracje (♭9, ♯9, ♯11, ♭13, alt);
  - dwudźwięki, pojedynczy dźwięk.
- Stare id nie zmieniły znaczenia. `songs.js` czyta nowe symbole (7♭9, 13, m11, 9♯11…), także z ♭/♯.
- **Kroki edytora:**
  - akord: `{k:'chord', d, a, q, bars, f (własne interwały), inv, oct, open, drop, bass (półtony nad prymą), skip, lock}`;
  - znaczniki: `{k:'rest'|'sec'|'text'|'mod'}`;
  - stare tablice `[d,a,q,bars]` dalej działają.
- `stepChords()` buduje listę grającą: znaczniki doklejają się do następnego akordu, modulacja przesuwa tonację, pominięte kroki wypadają.
- **Propozycje** w stylu Suggestera:
  - z tonacji, sus, septymowe, z dodanym dźwiękiem, 9/11/13;
  - 5⁷/x, 5⁷/5/x, 2/x, 7°/x, zastępstwo trytonowe;
  - pożyczone z równoległej, kwinty, pojedyncze dźwięki.
- **Stopnie:** 12 stopni × dur, moll, 7, m7, maj7, °, ø, sus4.
- **Rozpoznawanie** `identify()`:
  - kandydaci = każda pryma × katalog;
  - muszą zabrzmieć wszystkie dźwięki oprócz prymy i czystej kwinty;
  - punkty: bas = pryma, prostota, pasowanie do tonacji.
  - Slash (C/D): gdy zwykłe odczytanie nie jest proste, albo bas stoi sam pod prawą ręką, a nad nim nie ma tercji.
  - Wynik zawiera: przewrót, rootless, „bez kwinty”, układ (zwarty, otwarty, drop 2/3, shell, guide tones, kwartowy, klaster), lewą i prawą rękę, dźwięk na górze, podwojenia, funkcję i źródło (z tonacji, 5⁷/x, sub, 7°/x, pożyczony, chromatyczny) oraz do dwóch innych nazw (C6 albo Am7/C).
- Wykrywanie tonacji metodą Krumhansla. `stepsToChart()` zapisuje jam jako piosenkę z kreskami taktów.

## Edytor: `web/js/editor.js` (Jam; Piosenki → „Zagraj z zespołem / edytuj w Jamie”)
- Każdy wiersz: kropka (pomiń), numer, nazwa, dźwięki (czerwone = spoza tonacji), długość, Zmień, ↑ ↓ ×.
- **Zmień** ma cztery zakładki:
  - Rodzaj: najpierw „Z tonacji”, potem wszystkie grupy;
  - Układ: Auto, przewroty × oktawa, drop 2/3, układy otwarte;
  - Bas: 12 basów;
  - Interwały: budowa od 2 do 13 z ♭ i ♯.
- Każdy wybór od razu słychać (podgląd na kanale klawiszy zespołu).
- **+ Akord**: Propozycje, Stopnie, Zbuduj z interwałów. Do tego + Pauza, + Sekcja, + Tekst, + Modulacja.
- Na górze:
  - Skala: rodzina jak w Kole albo dowolna skala 7-dźwiękowa;
  - Wykryj tonację: z ostatnich 90 s gry;
  - −½ i +½;
  - Zapisz jako piosenkę;
  - Wyczyść.
- „Edytuj te akordy” kopiuje gotową progresję do edytora. Z Piosenek przychodzą sekcje i basy ze slasha.

## Zespół: `grooves.js`
- **Bas idzie za akordem:**
  - prawdziwa kwinta (♭5, ♯5), tercja (albo 4 i 2 przy sus), septyma (7 albo maj7), seksta;
  - przy slashu stoi na basie i bierze dźwięki akordu nad nim.
- **Bas słucha moich akordów** (rola „Ty: akordy”):
  - każdy dźwięk basu ustalany jest 0,22 s przed zagraniem;
  - liczy się akord, który trzymasz (`identify`), a gdy nic nie trzymasz, ten z planu;
  - `bassPlan` z `jamCycle` i `scheduleBass` w jam.js.
- **Klawisze zespołu:** jak w stylu, same akordy (na każdym takcie), arpeggio w górę, w dół, co drugi w górę, co drugi w dół. Krok: ćwierćnuty, ósemki, triole, szesnastki. Głosy: 3 do 8.
- **Humanizacja:** czas do ±30 ms, siła do ±20 przy 100%. Dotyczy całego zespołu, bez kliku.
- Pauza: gra tylko perkusja. Sekcje i modulacje widać na pasku akordów.

## Co ja gram?
- Panel pokazuje nazwę, numer, opis i źródło, do tego „albo: …” i do 5 linijek (przewrót, układ, ręce, góra, dźwięki z rolami). Pełna lista jest w podpowiedzi.
- **Pedał** (zdarzenia `pedal` z routera, CC64): puszczone klawisze przy wciśniętym pedale dalej brzmią.
  - Gdy trzymasz 1–2 dźwięki nad akordem na pedale, nazwą jest akord, który brzmi („na pedale (trzymasz: B♭)”).
  - Gdy trzymasz inny akord, dochodzi linijka „z pedałem brzmi: …”.

## Testy
- Unit: 102 (nowe `tests/chords.test.js`, 10 grup). E2E: nowy `e2e_editor.py` (17 sprawdzeń), wcześniejsze dostosowane.
- `e2e_prio2` liczy teraz klawisze zespołu na kanale 1 albo 3.

## Do zapamiętania
- Rola dźwięku to sama liczba (3 = tercja mała albo wielka). Dzięki temu `thirdPc`, kolory i światła działają bez zmian. `ROLE_TONE` ma też 2, 4, 6, 11 i 13.
- Kroki z Piosenek mają `lock`, więc „Barwa” ich nie podnosi. Gotowe progresje nadal podnosi.

## 1.7 (tego samego dnia): luki z analizy Suggestera
- **+ To, co trzymam** (`heldToStep`): rozpoznany akord, bas ze slasha i twój układ (`vrel`: dźwięki względem prymy, więc przenoszą się z tonacją). W Układzie jest też „Mój układ”.
- **Co dalej** (`nextMoves`):
  - typowe następne kroki według stopnia (dur i moll), każdy z jednym zdaniem „dlaczego”;
  - akord wtórny (5⁷/x, 7°/x, sub) najpierw prowadzi do swojego celu;
  - do tego 5⁷ przed każdym z ruchów i krok kwintę w dół.
- **Kadencje:** zestawy dla dur i moll plus wszystkie gotowe progresje do wstawienia.
- **Wpisz** (`songs.textToSteps`): symbole akordów, `%`, N.C., basy.
- **Cofnij i Ponów** (60 kroków). **⧉** powiela krok.
- **Zaznaczanie kilku kroków:** Powiel, ±½ (tylko te akordy, prosta pisownia), Usuń, „Graj tylko zaznaczone” (pętla w `prog()`).
- **Pasujące skale** (`matchingScales`): każda skala 7-dźwiękowa na każdej z 12 tonik.
  - Kliknięcie przepisuje numery (`rekey`), a brzmienie zostaje.
  - „Wykryj tonację” też przepisuje numery zamiast zmieniać akordy.
- **Modulacja:**
  - nazwane cele: równoległa, relatywna, dominanty, subdominanty, ½ i 1 ton w górę;
  - **akordy wspólne** (`pivots`) do wstawienia przed modulacją.
- **Chromatyka:** N⁶ (♭2 w 1. przewrocie), It+6, Fr+6 i Ger+6 na ♭6, 1⁶₄ kadencyjny, tercja pikardyjska.
  - Przy rozpoznawaniu sekstowych zwiększonych nie biorę pod uwagę: ich dźwięki brzmią jak akordy 7.
- **Eksport MIDI** (`web/js/midi.js`):
  - SMF typ 1, ścieżka na każdy kanał;
  - tempo, metrum, znaki przy kluczu;
  - nazwy akordów i sekcje jako markery;
  - 4 okrążenia z humanizacją.
- **Drobne:**
  - bas ze slasha na kafelkach (czerwony, gdy spoza skali);
  - funkcja (5⁷/x, sub, pożycz.) na kafelkach w Rodzaju;
  - kliknięcie akordu pokazuje go na klawiaturze Trenera;
  - nazwy dźwięków skali w nagłówku;
  - interwały 8, 10 i 12 (podwojenia);
  - skale alterowana i neapolitańska durowa (tylko w edytorze).
- **Poprawiony błąd:** `degAlt` liczył odległość liter modulo 12 zamiast 7. Przez to propozycje we wszystkich tonacjach poza C miały złe stopnie. Jest test regresji.
- Unit: 109. `e2e_editor`: 31 sprawdzeń.

## 1.8: style, progresje, perkusista
- **33 style** w trzech grupach na kartach Jamu (`GROUPED` w jam.js):
  - Pop, rock, soul;
  - Jazz i blues;
  - Ze świata.
- **Nowe zachodnie:** rock, pop-rock szybki, country (two-step), Motown, hip-hop (boom bap), half-time shuffle (Purdie, siatka triolowa 12), rock and roll, jazz two-feel, akustyczny pop (bicie gitary, do śpiewania), power ballada.
- **Nowe ze świata:** samba (surdo na 43), salsa (klawe son 3-2 na rimshocie, conga na 45; jedno okrążenie = 2 takty klawe), tango, afrobeat, mazurek.
- **12 nowych progresji:**
  - rockowa 1–♭7–4–1, rock and roll 1–4–5–4, ragtime 3⁷–6⁷–2⁷–5⁷;
  - 1–4–4m–1, filmowa 1–♭6–♭7–1, royal road 4–5–3m–6m;
  - ognisko 1–4–1–5, „Creep” 1–3–4–4m, blues jazzowy;
  - molowe: rock 1m–♭7–♭6–♭7, wahadło 1m–♭6, tango 1m–4m–♭6–5⁷.
- **Perkusista** (`web/js/drummer.js`, `drumBar`) ma 4 poziomy dla każdego stylu. Domyślnie w Jamie jest 3, a w `jamCycle` bez podanej opcji 2, żeby stare testy dalej przechodziły.
  - **1. Prosto:** sam szkielet, bez duchów, równe talerze, krótkie przejście na werblu.
  - **2. Naturalnie:**
    - akcenty talerzy (raz > „i” > szesnastki), wahanie siły ±5 i czasu ±4 ms;
    - werbel lekko za bitem w stylach z `feel: 'behind'` (neo-soul, hip-hop, reggae) i przed bitem w pop-rocku (`ahead`);
    - przedtakt w 4. takcie frazy, talerz co 8 taktów.
  - **3. Z życiem:**
    - duchy na werblu (prawdopodobieństwo 0,3);
    - otwarty hi-hat na ostatnim „i” w 2. i 4. takcie;
    - stopa przesuwa się w 3. takcie;
    - przejście co 4 takty, ride zamiast hi-hatu w taktach 5–8 frazy.
  - **4. Bogato:**
    - duchy częściej (0,5), flamy, szesnastki na hi-hacie, dzwonek ride w swingu;
    - fraza rośnie w siłę (0,94 do 1,05);
    - przejścia co 2 takty: werbel, tomy albo linearne, za każdym razem inne;
    - przejście na koniec okrążenia bywa całym taktem.
  - **Rodzina stylu** (`familyOf`): straight, swing (duchy tylko na swingowanych ósemkach), latin (klawe nietknięte, zamiast werbla odzywają się tomy), triplet, odd.
  - Fraza liczy się po `barOffset`, czyli przez kolejne okrążenia.
- **Testy:** unit 115 (nowe `drummer.test.js`), nowe `e2e_drummer.py`.
