// Content of the Progresje tab (1.18): new progressions, and what the old ones did not have (family, level,
// songs to hear them in, the matching entry of the Siłownia bank). Pure data, no logic. Numerals are written
// against the MAJOR scale of the tonic (minor ones too: i, bIII, iv, bVI, bVII), as in progbank.js:
//   I ii … vii   upper case = major-based chord, lower case = minor-based;  b / # before = altered degree
//   quality after: 7 maj7 6 69 add9 9 maj9 13 sus4 sus2 7sus4 + 7b9 (upper) · 7 maj7 6 9 11 add9 ø7 ° °7 (lower)
//   /3 /b7 …     a bass note (scale degree of the key);  *2 *0.5  length in bars (default 1)

// The order of families in the Library. Same ids as progbank.FAMILIES, plus a few words about each.
export const FAMILY_INFO = {
  podstawy: { name: 'Podstawy', about: 'Akordy tonacji i kadencje. Od tego zaczyna się każda piosenka.' },
  pop: { name: 'Pop', about: 'Pętle z czterech akordów, na których stoi większość radia.' },
  ballada: { name: 'Ballada', about: 'Wolne piosenki do śpiewu: bas schodzi, akordy oddychają.' },
  rock: { name: 'Rock i folk', about: 'Trzy akordy, pożyczone ♭7 i ♭3, gitarowa prostota.' },
  soul: { name: 'Soul i gospel', about: 'Kościół, Motown, neo-soul: septymy, nony, przejściowe akordy.' },
  blues: { name: 'Blues', about: 'Dwanaście taktów i dominanty, które nie muszą się rozwiązywać.' },
  jazz: { name: 'Jazz', about: 'ii–V–I, koło kwintowe, zastępstwa. Język standardów.' },
  latin: { name: 'Latin i bossa', about: 'Bossa, salsa, flamenco: septymy, kolor i taniec.' },
  klasyka: { name: 'Klasyka', about: 'Bach, barok, romantyzm: schematy, które pożyczyła cała muzyka.' },
  balkany: { name: 'Bałkany i klezmer', about: 'Moll harmoniczny, hidżaz, freygish: kolor ze Wschodu.' },
  film: { name: 'Film i gry', about: 'Medianty, pożyczki z modów, bohaterskie finały.' },
};

// Old Koło progressions (theory.PROGRESSIONS): family, level, songs, and the Siłownia bank entry that is the same thing.
export const THEORY_META = {
  hymn: { fam: 'pop', tier: 1, bank: 'axis', songs: ['Let It Be', 'No Woman, No Cry', 'With or Without You'] },
  smutnyPop: { fam: 'pop', tier: 1, bank: 'sensitive', songs: ['Zombie (The Cranberries)'] },
  lata50: { fam: 'pop', tier: 1, bank: 'fifties', songs: ['Stand By Me', 'Every Breath You Take', 'Unchained Melody'] },
  ballada: { fam: 'ballada', tier: 2, bank: 'balladVi', songs: [] },
  kanon: { fam: 'klasyka', tier: 3, bank: 'canon', songs: ['Kanon D-dur Pachelbela'] },
  vamp14: { fam: 'soul', tier: 1, songs: [] },
  blues: { fam: 'blues', tier: 4, bank: 'blues12', songs: ['Sweet Home Chicago', 'Hound Dog'] },
  iiVI: { fam: 'jazz', tier: 5, bank: 'twoFiveOne', songs: ['Autumn Leaves', 'Fly Me to the Moon'] },
  turnaround: { fam: 'jazz', tier: 5, bank: 'turnaround', songs: ['Blue Moon', 'Heart and Soul'] },
  neosoul: { fam: 'soul', tier: 5, bank: 'soulDown', songs: [] },
  andaluzyjska: { fam: 'latin', tier: 2, bank: 'andalusian', songs: ['Hit the Road Jack', 'Walk, Don’t Run'] },
  mollPop: { fam: 'film', tier: 2, bank: 'epic', songs: [] },
  mollPodstawa: { fam: 'balkany', tier: 2, bank: 'balkan', songs: [] },
  jazzMoll: { fam: 'jazz', tier: 6, bank: 'minorTwoFive', songs: ['Autumn Leaves (część molowa)'] },
  dorycki: { fam: 'rock', tier: 2, bank: 'dorian', songs: ['Oye Como Va', 'Evil Ways'] },
  kwintowyMoll: { fam: 'balkany', tier: 4, bank: 'minorCircle', songs: [] },
  miksolidyjski: { fam: 'rock', tier: 2, bank: 'mixo', songs: ['Sweet Child o’ Mine', 'Hey Jude (koda)'] },
  rnr1454: { fam: 'rock', tier: 1, bank: 'laBamba', songs: ['La Bamba', 'Twist and Shout', 'Wild Thing'] },
  ragtime: { fam: 'jazz', tier: 6, bank: 'longCircle', songs: ['Sweet Georgia Brown'] },
  plagalMoll: { fam: 'film', tier: 2, bank: 'plagalMinor', songs: ['In My Life'] },
  filmowa: { fam: 'film', tier: 3, bank: 'mario', songs: ['Super Mario (koniec poziomu)'] },
  royalRoad: { fam: 'pop', tier: 4, bank: 'royal', songs: ['J-pop, anime'] },
  folk1415: { fam: 'rock', tier: 1, bank: 'folk', songs: ['kolędy, piosenki przy ognisku'] },
  creep: { fam: 'rock', tier: 3, bank: 'creep', songs: ['Creep'] },
  jazzBlues: { fam: 'blues', tier: 8, bank: 'jazzBlues', songs: ['Billie’s Bounce', 'Now’s the Time'] },
  watchtower: { fam: 'rock', tier: 2, bank: 'watchtower', songs: ['All Along the Watchtower'] },
  eleanor: { fam: 'film', tier: 2, songs: ['Eleanor Rigby'] },
  tangoMoll: { fam: 'latin', tier: 4, songs: [] },
};

// Siłownia bank entries that have no Koło twin: songs (only where it is certain) and a mood.
export const BANK_META = {
  bluesRock: { mood: 'prosto, gitarowo' },
  pendulum: { mood: 'spokojnie, w kółko' },
  popRise: { mood: 'pogodnie' },
  popFour: { mood: 'refrenowo' },
  threeChords: { mood: 'pierwsza piosenka' },
  rockV: { mood: 'rockowo' },
  blueMoon: { mood: 'staroświecko, ciepło', songs: ['Blue Moon'] },
  shortCircle: { mood: 'jazzowo, w stronę domu' },
  minorFolk: { mood: 'ludowo, tęsknie' },
  canon: { songs: ['Kanon D-dur Pachelbela'] },
  minorCadence: { mood: 'poważnie, klasycznie' },
  eightDays: { mood: 'radośnie, Beatlesi', songs: ['Eight Days a Week'] },
  hijaz: { mood: 'Bliski Wschód, klezmer' },
  sus: { mood: 'otwarcie, oddech' },
  sus2: { mood: 'nowocześnie, przestrzennie' },
  rockFlat3: { mood: 'zadziornie' },
  bassDown: { mood: 'wzruszająco', songs: ['A Whiter Shade of Pale', 'Piano Man (zwrotka)'] },
  cadence64: { mood: 'uroczyście' },
  gospelIv: { mood: 'kościelnie, ciepło' },
  secDom: { mood: 'z napięciem do smutku' },
  quickBlues: { mood: 'bluesowo' },
  swing6: { mood: 'swingowo' },
  lament: { mood: 'lament, barok' },
  rhythmA: { songs: ['I Got Rhythm'] },
  backdoor: { mood: 'soulowo, miękko' },
  passDim: { mood: 'standardy, gospel' },
  augLine: { mood: 'rozmarzenie' },
  minorLine: { mood: 'filmowo, James Bond', songs: ['My Funny Valentine'] },
  gypsy: { mood: 'jazz cygański, Django' },
  minorBlues: { mood: 'nocnie, molowo' },
  susResolve: { mood: 'soul, fusion' },
  bachC: { songs: ['J.S. Bach, Preludium C-dur BWV 846'] },
  tritone: { mood: 'jazz, miękko w dół' },
  flyMe: { songs: ['Fly Me to the Moon'] },
  autumn: { songs: ['Autumn Leaves'] },
  twoOfUs: { songs: ['Just the Two of Us'] },
  ipanema: { songs: ['The Girl from Ipanema'] },
  blueBossa: { songs: ['Blue Bossa'] },
  jazzBlues: { songs: ['Billie’s Bounce'] },
};

// New in 1.18. [id, family, level, name, numerals, mood, why, songs]
export const NEW_PROGRESSIONS = [
  // --- to sing over -------------------------------------------------------------------------------------------
  ['twoChords', 'podstawy', 1, 'Dwa akordy do śpiewu', 'I*2 V*2', 'najprościej', 'Dom i napięcie, nic więcej. Setki piosenek ludowych tak wyglądają. Cała uwaga idzie w głos i rytm prawej ręki.', ['piosenki ludowe, kołysanki']],
  ['prechorus', 'pop', 2, 'Przed refrenem: w górę', 'ii iii IV V', 'narastająco', 'Bas wspina się krok po kroku, a każdy akord jest wyżej od poprzedniego. Napięcie rośnie aż do 5, które otwiera drzwi do refrenu.', []],
  ['deceptiveLoop', 'pop', 1, 'Pętla zwodnicza', 'I IV V vi', 'z niespodzianką', 'Po 5 ucho czeka na dom, a przychodzi 6m, jego smutny krewny. To kadencja zwodnicza zamknięta w pętlę, dlatego się nie kończy.', []],
  ['someone', 'ballada', 3, 'Ballada z basem w dół', 'I V/7 vi IV', 'wzruszająco', 'To pop-hymn, ale 5 stoi na swojej tercji. Bas schodzi gamą: 1, 7, 6, 4. Prawa ręka prawie się nie rusza, a melodia basu sama opowiada.', ['Someone Like You']],
  ['heaven', 'rock', 1, 'Pukanie do nieba', 'I V ii*2 I V IV*2', 'prosto, hymnicznie', 'Dwa razy ten sam początek, raz kończy się na 2m, raz na 4. Ten sam ruch w dwóch kolorach: molowym i durowym.', ['Knockin’ on Heaven’s Door']],
  ['leanOn', 'soul', 2, 'Schody w górę', 'I ii iii IV iii ii I*2', 'ciepło, kościelnie', 'Akordy idą po gamie w górę i wracają. Melodia może iść razem z nimi. Prawa ręka gra cały czas ten sam chwyt, tylko przesuwa go o klawisz.', ['Lean on Me']],
  ['hallelujah', 'ballada', 4, 'Kwarta, kwinta, molowy spadek', 'IV V vi IV V III7 vi*2', 'hymn, uniesienie', 'Słynne „the fourth, the fifth, the minor fall, the major lift”: 4, 5, potem 6m (spadek) i durowe 3⁷ (uniesienie). 3⁷ to dominanta do 6m, dlatego tak ciągnie.', ['Hallelujah (L. Cohen)']],
  ['dreamy', 'ballada', 3, 'Rozmarzone maj7', 'Imaj7*2 IVmaj7*2', 'miękko, przestrzennie', 'Dwa akordy z wielką septymą. 1 i 4 mają po dwa wspólne dźwięki, więc brzmienie się nie urywa, tylko faluje. Idealne pod spokojny głos.', []],
  ['lydian', 'film', 3, 'Lidyjskie unoszenie', 'I*2 II*2', 'unoszenie, marzenie', 'Durowe 2 to podwyższona czwórka ze skali lidyjskiej. Jeden dźwięk (♯4) robi z domu stan nieważkości. Często w muzyce filmowej o lataniu.', []],
  ['mixoFlat6', 'film', 3, 'Heroiczne 1 → 4m', 'I*2 iv*2', 'bohatersko, podniośle', 'Z wideo o modach: 4m pożyczona z miksolidyjskiej ♭6. Dwa głosy idą półtonem w górę (3 → 4, 5 → ♭6), a pryma stoi. Brzmi jak sztandar na wietrze.', []],
  ['mixture', 'film', 5, 'Mieszanie modów od G', 'I bIII bVI IV bVII I', 'filmowo, jasno i ciemno naraz', 'Z wideo o modach: ♭3 i ♭6 z molowej, 4 z durowej, ♭7 z miksolidyjskiej. Ta sama tonika, a kolory przelewają się z jasnych w ciemne i z powrotem.', []],
  ['mediantLoop', 'film', 5, 'Filmowe medianty', 'I bVI I bIII', 'kosmos, tajemnica', 'Każdy krok to medianta chromatyczna: jeden wspólny dźwięk, reszta idzie półtonem. Dlatego tak obce akordy brzmią gładko. Ulubiony chwyt kompozytorów filmowych.', []],
  ['heroic', 'film', 4, 'Triumf z pożyczkami', 'I bVII IV iv I', 'triumfalnie, potem wzruszenie', 'Najpierw miksolidyjskie ♭7, potem 4 gaśnie do 4m. Jasność, siła, a na końcu łza. Ten ruch słychać w finałach filmów.', []],
  // --- soul, gospel, funk ------------------------------------------------------------------------------------
  ['gospelPedal', 'soul', 2, 'Kościelne kołysanie', 'I IV/1 I IV/1', 'gospel, kościół', 'Bas stoi na 1, a prawa ręka kołysze się między 1 i 4. To pierwsza rzecz, którą gra kościelny organista, zanim chór zacznie śpiewać.', []],
  ['gospelTurn', 'soul', 6, 'Gospelowy turnaround', 'I I/3 IV #iv°7 I/5 VI7 ii7 V7', 'gospel, kościelny finał', 'Bas idzie w górę półtonami: 1, 3, 4, ♯4, 5. Zmniejszony na ♯4 łączy 4 z 1/5. Potem 6⁷ (dominanta do 2m) i 2–5 do domu. Cały gospel w ośmiu akordach.', []],
  ['lovely', 'soul', 4, 'Soulowe 6–2–5–1', 'vi7 II7 V7 Imaj7', 'radośnie, Stevie Wonder', 'Koło kwintowe od 6m, ale 2 jest durowe: to dominanta do 5. Jeden podwyższony dźwięk i zwykła pętla nabiera blasku.', ['Isn’t She Lovely']],
  ['sunshine', 'soul', 2, 'Molowy soul', 'i7 v7 bVII i7', 'smutno, soulowo', 'Molowa pętla bez durowej dominanty: 5m zamiast 5. Bez dźwięku prowadzącego nic nie ciągnie, więc brzmi jak westchnienie, nie jak pytanie.', ['Ain’t No Sunshine']],
  ['funk17', 'soul', 2, 'Funkowe dominanty', 'I7*2 IV7*2', 'funk, groove', 'Dwa akordy dominantowe, żaden nie chce się rozwiązać. W funku harmonia stoi, a cała robota jest w rytmie. Graj krótko, staccato.', []],
  ['oyeComo', 'latin', 2, 'Latynoski dorycki', 'i7*2 IV9*2', 'latin, gorąco', 'Molowa tonika i durowa 4 z noną. Dorycka skala w dwóch akordach. Lewa gra bas na „raz” i „i” czwórki, prawa krótkie akordy.', ['Oye Como Va']],
  ['neo251', 'soul', 6, 'Neo-soulowe 2–5–1 z noną', 'ii9 V13 Imaj9*2', 'nocnie, miękko', 'Jazzowe 2–5–1, ale każdy akord ma dodaną nonę albo trzynastkę. Ręka prawie się nie rusza: z 2m9 do 5¹³ zmienia się jeden dźwięk.', []],
  ['neoMinor', 'soul', 5, 'Neo-soulowy vamp w mollu', 'i9*2 iv9*2', 'mgliście, groove', 'Dwa molowe akordy z noną. Nona robi z prostego mollu chmurę. Lewa: pryma i septyma, prawa: tercja, kwinta, nona.', []],
  ['gospelMinor7', 'soul', 5, 'Gospelowe 7–3–6', 'viiø7 III7 vi7*2', 'gospel, jazz', 'Molowe 2–5–1, tylko do 6m, czyli do smutnego krewnego domu. Gospel i jazz uwielbiają tę drogę na koniec zwrotki.', []],
  // --- blues and jazz ------------------------------------------------------------------------------------------
  ['blues8', 'blues', 3, 'Blues 8 taktów', 'I7 V7 IV7*2 I7 V7 I7 V7', 'bluesowo, krótko', 'Krótszy brat bluesa 12-taktowego. Ten sam materiał: 1, 4, 5 jako dominanty, ale opowieść mieści się w ośmiu taktach.', ['Key to the Highway']],
  ['aTrain', 'jazz', 5, 'Durowe 2 jak w A Train', 'Imaj7*2 II7*2 ii7 V7 Imaj7*2', 'swing, lekko', 'Durowe 2⁷ wnosi podwyższoną czwórkę, jakby lidyjską. Potem 2 robi się molowe i prowadzi do domu przez 5.', ['Take the “A” Train']],
  ['fonte', 'klasyka', 5, 'Fonte: sekwencja w dół', 'VI7 ii V7 I', 'klasycznie i jazzowo', 'Ten sam ruch dwa razy, za drugim o cały ton niżej: 6⁷ → 2m, potem 5⁷ → 1. Schemat z XVIII wieku, dziś w każdym standardzie.', []],
  ['monte', 'klasyka', 5, 'Monte: sekwencja w górę', 'I7 IV II7 V', 'wznosząco', 'Brat fonte: ten sam ruch w górę. 1⁷ prowadzi do 4, 2⁷ do 5. Każda para to dominanta i jej cel, a całość się wspina.', []],
  ['turnVI7', 'jazz', 5, 'Turnaround z durowym 6', 'Imaj7 VI7 ii7 V7', 'jazz, bossa', 'Zwykły turnaround 1–6–2–5, tylko 6 jest dominantą do 2. Jeden podwyższony dźwięk (♯1) i pętla zaczyna ciągnąć.', []],
  // --- world and classical ---------------------------------------------------------------------------------
  ['folia', 'klasyka', 4, 'La Folia', 'i V i bVII bIII bVII i V', 'barok, taniec', 'Schemat z XVI wieku, na którym wariacje pisali Corelli, Vivaldi i Rachmaninow. Dwie połowy: pierwsza kończy się na 5, druga też, jak pytanie bez odpowiedzi.', ['La Folia (Corelli, Vivaldi)']],
  ['lamentChrom', 'klasyka', 6, 'Lament chromatyczny', 'i V/7 i/b7 IV/6 iv/b6 V', 'lament, schody w dół', 'Bas schodzi półtonami od 1 do 5, a akordy zmieniają się nad nim. Barokowy lament, który zna każdy gitarzysta z początku jednej słynnej rockowej ballady.', ['Dido’s Lament (Purcell)', 'Stairway to Heaven (podobny bas we wstępie)']],
  ['romans', 'klasyka', 4, 'Romans molowy', 'i iv bVII bIII bVI iv V7 i', 'romantycznie, po rosyjsku', 'Koło kwintowe w mollu: każdy akord o kwintę niżej, aż do dominanty z gamy harmonicznej. W duchu rosyjskiego romantyzmu, szeroko i śpiewnie.', []],
  ['something', 'pop', 4, 'Opadająca linia w durze', 'I Imaj7 I7 IV', 'czule', 'Akord stoi, a jeden głos schodzi półtonami: 8, 7, ♭7. Na końcu ♭7 rozwiązuje się do 4. Tak się buduje napięcie bez zmiany akordu.', ['Something (The Beatles)']],
  ['andaluzE', 'latin', 3, 'Andaluzyjska od dołu (hidżaz)', 'iv bIII bII I', 'flamenco', 'To ta sama kadencja andaluzyjska, ale widziana z ostatniego akordu. Jeśli domem jest durowy akord na końcu, to wszystko dzieje się w skali hidżaz. Flamenco myśli właśnie tak.', []],
  ['klezmer', 'balkany', 4, 'Freygish (klezmer)', 'I bII I iv I bVII I*2', 'klezmer, wesele', 'Durowa tonika w skali hidżaz: ♭2 nad nią, 4m pod nią i ♭7 jako wyjście. Ten szlochający kolor to serce muzyki klezmerskiej.', []],
  ['balkanDance', 'balkany', 3, 'Bałkańskie koło', 'i iv bVII bIII V*2 i*2', 'taniec, orkiestra dęta', 'Molowe koło kwintowe, skrócone, z durową dominantą na koniec. Dobrze leży pod 7/8 i 9/8.', []],
];

/** The groove that suits a family best (Jam style id), and a tempo. */
export const FAMILY_GROOVE = {
  podstawy: ['pop', 84], pop: ['pop', 92], ballada: ['ballada', 70], rock: ['rock', 104], soul: ['gospel', 72], blues: ['shuffle', 92],
  jazz: ['swing', 120], latin: ['bossa', 120], klasyka: ['ballada', 66], balkany: ['cocek', 120], film: ['powerballad', 72],
};
/** Better grooves for some progressions than the family default. */
export const PROG_GROOVE = {
  funk17: ['funk', 96], oyeComo: ['salsa', 104], neo251: ['neosoul', 76], neoMinor: ['neosoul', 76], neosoul: ['neosoul', 76], soulDown: ['neosoul', 76],
  tangoMoll: ['tango', 116], andaluzyjska: ['rock', 100], andalusian: ['rock', 100], andaluzE: ['tango', 112], balkanDance: ['lesnoto', 132],
  mollPodstawa: ['karsilama', 120], balkan: ['karsilama', 120], ragtime: ['swing', 132], longCircle: ['swing', 132], gypsy: ['swing', 160],
  ipanema: ['bossa', 132], blueBossa: ['bossa', 132], lovely: ['motown', 112], gospelTurn: ['gospel', 66], gospelPedal: ['gospel', 66],
  sunshine: ['neosoul', 76], blues8: ['slowblues', 64], minorBlues: ['slowblues', 62], dreamy: ['jazzBallada', 64], folia: ['walc', 96],
  lamentChrom: ['ballada', 66], kanon: ['ballada', 72], canon: ['ballada', 72], hallelujah: ['walc', 84], heaven: ['folk', 72],
};
