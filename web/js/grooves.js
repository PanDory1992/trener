// Jam grooves: drums, bass and piano comping patterns, and the event builder for one
// cycle of a progression. Pure (tested in node).
import { bassNote } from './theory.js';
import { stepChords } from './chords.js';
import { drumBar } from './drummer.js';
import { clickEvents } from './click.js';

// Drum strings: one char per grid step. X accent, x normal, o ghost/soft, . rest.
// GM drums on channel 10: 36 kick, 38 snare, 37 side stick, 42 closed hat, 46 open hat, 51 ride, 44 pedal hat.
// Bass: [step, what, lenSteps] what = R, 5, 8 (octave), 3 (chord third), b7, 6, app (half step under the next root).
// Comp: [step, lenSteps, part, vel] part = C (whole voicing) or A0..A3 (one voicing tone).
export const GROOVES = [
  { id: 'pop', name: 'Pop', meter: '4/4', beats: 4, grid: 16, tempo: 96, range: [70, 130], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'mollPop' },
    why: 'Stopa na 1 i 3, werbel na 2 i 4, ósemki na hi-hacie. To kręgosłup prawie każdej piosenki radiowej. Pianino gra „pchające” uderzenia przed trójką.',
    drums: { 36: 'X.......X.x.....', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 6], [6, 'R', 2], [8, '5', 4], [12, '8', 2], [14, 'R', 2]],
    comp: [[0, 4, 'C', 72], [6, 2, 'C', 60], [8, 4, 'C', 68], [12, 4, 'C', 60]] },
  { id: 'ballada', name: 'Ballada', meter: '4/4', beats: 4, grid: 16, tempo: 70, range: [56, 88], swing: 0, color: 'triads', suggest: { major: 'ballada', minor: 'mollPodstawa' },
    why: 'Wolno, dużo powietrza. Werbel tylko na trzy (pół-tempo), a pianino rozkłada akord. Każdy dźwięk ma czas wybrzmieć.',
    drums: { 36: 'X.......o.......', 38: '........x.......', 42: 'o...o...o...o...' },
    bass: [[0, 'R', 8], [8, '5', 8]],
    comp: [[0, 4, 'A0', 62], [4, 4, 'A1', 56], [8, 4, 'A2', 60], [12, 4, 'A1', 54]] },
  { id: 'walc', name: 'Walc', meter: '3/4', beats: 3, grid: 12, tempo: 126, range: [90, 170], swing: 0, color: 'triads', suggest: { major: 'lata50', minor: 'mollPodstawa' },
    why: 'Raz-dwa-trzy: bas na „raz”, akord na „dwa” i „trzy”. Co drugi takt bas schodzi na kwintę, żeby się nie nudził.',
    drums: { 36: 'X...........', 42: '....o...o...' },
    bass: [[0, 'R', 4]], bassAlt: [[0, '5', 4]],
    comp: [[4, 3, 'C', 58], [8, 3, 'C', 54]] },
  { id: 'swing', name: 'Swing', meter: '4/4', beats: 4, grid: 16, tempo: 126, range: [90, 200], swing: 0.16, color: 'sevenths', suggest: { major: 'turnaround', minor: 'jazzMoll' },
    why: 'Ósemki „kołyszą się”: pierwsza dłuższa, druga krótsza. Talerz ride gra „ding, ding-a ding”, hi-hat stopą zamyka na 2 i 4, a bas spaceruje po ćwierćnutach: 1, 3, 5 i dźwięk prowadzący do następnego akordu.',
    drums: { 51: 'x...x.x.x...x.x.', 44: '....x.......x...', 36: 'o.......o.......' },
    bass: [[0, 'R', 4], [4, '3', 4], [8, '5', 4], [12, 'app', 4]],
    comp: [[0, 3, 'C', 62], [6, 2, 'C', 66]] },
  { id: 'jazzBallada', name: 'Jazzowa ballada', meter: '4/4', beats: 4, grid: 16, tempo: 62, range: [48, 84], swing: 0.12, color: 'ninths', suggest: { major: 'iiVI', minor: 'jazzMoll' },
    why: 'Szczotki zamiast pałek, bas na 1 i 3, a pianino trzyma bogate akordy z noną. To muzyka „po północy”. Ważne jest brzmienie każdego akordu, nie rytm.',
    drums: { 51: 'o...o...o...o...', 44: '....o.......o...' },
    bass: [[0, 'R', 8], [8, '5', 8]],
    comp: [[0, 14, 'C', 56]] },
  { id: 'jazzWalc', name: 'Jazzowy walc', meter: '3/4', beats: 3, grid: 12, tempo: 150, range: [110, 200], swing: 0.16, color: 'sevenths', suggest: { major: 'turnaround', minor: 'kwintowyMoll' },
    why: 'Walc z kołysaniem i septymami. Bas spaceruje na trzy, pianino „dziobie” akord na 1 i na „i” po dwójce.',
    drums: { 51: 'x...x.x.x...', 44: '....x...x...' },
    bass: [[0, 'R', 4], [4, '5', 4], [8, 'app', 4]],
    comp: [[0, 3, 'C', 60], [6, 2, 'C', 62]] },
  { id: 'funk', name: 'Funk', meter: '4/4', beats: 4, grid: 16, tempo: 98, range: [80, 116], swing: 0, color: 'sevenths', suggest: { major: 'vamp14', minor: 'dorycki' },
    why: 'Wszystko kręci się wokół szesnastek. Ciche „duchy” na werblu, bas, który skacze w oktawach, i krótkie, ostre uderzenia akordu. Mniej dźwięków, więcej rytmu.',
    drums: { 36: 'X..x..X...X..x..', 38: '....X..o.o..X..o', 42: 'XoxoXoxoXoxoXoxo' },
    bass: [[0, 'R', 2], [3, '8', 1], [6, 'R', 1], [7, 'b7', 1], [10, 'R', 2], [13, '5', 1], [14, '8', 2]],
    comp: [[2, 1, 'C', 74], [5, 1, 'C', 66], [11, 1, 'C', 72], [14, 1, 'C', 64]] },
  { id: 'bossa', name: 'Bossa nova', family: 'latin', meter: '4/4', beats: 4, grid: 16, tempo: 130, range: [100, 160], swing: 0, color: 'sevenths', suggest: { major: 'iiVI', minor: 'jazzMoll' },
    why: 'Brazylijski spokój. Bas na 1 i 3 z przedtaktami, rimshot gra klawe, a pianino synkopuje jak gitara Jobima. Akordy z septymą, wszystko miękko.',
    drums: { 36: 'X.....x.X.....x.', 37: 'x..x..x...x..x..', 42: 'oooooooooooooooo' },
    bass: [[0, 'R', 6], [6, '5', 2], [8, '5', 6], [14, 'R', 2]],
    comp: [[0, 2, 'C', 60], [3, 3, 'C', 56], [6, 4, 'C', 60], [10, 2, 'C', 56], [13, 3, 'C', 58]] },
  { id: 'shuffle', name: 'Blues shuffle', meter: '4/4', beats: 4, grid: 16, tempo: 92, range: [70, 130], swing: 0.16, color: 'sevenths', suggest: { major: 'blues', minor: 'mollPodstawa' },
    why: 'Shuffle to trójkowe „taaa-da taaa-da”. Bas gra boogie: 1, 3, 5, 6, ♭7 i z powrotem. Na tym chodzi cały blues i rock and roll.',
    drums: { 36: 'X.......X.......', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, '3', 2], [4, '5', 2], [6, '6', 2], [8, 'b7', 2], [10, '6', 2], [12, '5', 2], [14, '3', 2]],
    comp: [[2, 2, 'C', 58], [6, 2, 'C', 52], [10, 2, 'C', 58], [14, 2, 'C', 52]] },
  { id: 'gospel', name: 'Gospel 6/8', meter: '6/8', beats: 2, grid: 6, tempo: 56, range: [44, 76], swing: 0, color: 'triads', suggest: { major: 'vamp14', minor: 'mollPodstawa' },
    why: 'Dwa duże uderzenia w takcie, każde podzielone na trzy. Pianino pulsuje trioli, jak w kościele na południu USA. Kołysze całym ciałem.',
    drums: { 36: 'X.....', 38: '...X..', 42: 'xoxxox' },
    bass: [[0, 'R', 3], [3, '5', 3]],
    comp: [[0, 1, 'C', 64], [1, 1, 'C', 48], [2, 1, 'C', 50], [3, 1, 'C', 60], [4, 1, 'C', 48], [5, 1, 'C', 50]] },
  { id: 'neosoul', name: 'Neo-soul', feel: 'behind', meter: '4/4', beats: 4, grid: 16, tempo: 78, range: [64, 96], swing: 0.08, color: 'ninths', suggest: { major: 'neosoul', minor: 'dorycki' },
    why: 'Leniwie, trochę „za bitem”. Akordy z noną, bas z przedtaktem i lekkie kołysanie szesnastek. D’Angelo, Erykah Badu.',
    drums: { 36: 'X......x..X.....', 38: '....X.......X..o', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 6], [7, 'R', 1], [10, '5', 4], [14, 'app', 2]],
    comp: [[1, 5, 'C', 58], [10, 6, 'C', 54]] },
  { id: 'disco', name: 'Disco', meter: '4/4', beats: 4, grid: 16, tempo: 118, range: [104, 132], swing: 0, color: 'sevenths', suggest: { major: 'smutnyPop', minor: 'mollPop' },
    why: 'Stopa na każdą ćwierćnutę („four on the floor”), otwarty hi-hat na „i”, bas skacze oktawami. Pianino gra krótko na „i”, w przerwach między stopą.',
    drums: { 36: 'X...X...X...X...', 38: '....X.......X...', 42: 'x...x...x...x...', 46: '..x...x...x...x.' },
    bass: [[0, 'R', 2], [2, '8', 2], [4, 'R', 2], [6, '8', 2], [8, 'R', 2], [10, '8', 2], [12, 'R', 2], [14, '8', 2]],
    comp: [[2, 1, 'C', 66], [6, 1, 'C', 62], [10, 1, 'C', 66], [14, 1, 'C', 62]] },
  { id: 'reggae', name: 'Reggae (one drop)', feel: 'behind', meter: '4/4', beats: 4, grid: 16, tempo: 75, range: [62, 90], swing: 0.06, color: 'triads', suggest: { major: 'vamp14', minor: 'dorycki' },
    why: 'Na „raz” jest pusto. Stopa i werbel razem dopiero na trzy, a pianino gra krótkie „skanki” na 2 i 4. Cisza na początku taktu to cały sekret.',
    drums: { 36: '........X.......', 37: '........X.......', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 4], [6, 'R', 2], [10, '5', 2], [12, '8', 2]],
    comp: [[4, 1, 'C', 70], [12, 1, 'C', 70]] },
  { id: 'lesnoto', name: 'Bałkany 7/8', meter: '7/8 (3+2+2)', beats: 3.5, grid: 7, tempo: 132, range: [100, 170], swing: 0, color: 'triads', color2: true, suggest: { major: 'hymn', minor: 'andaluzyjska' },
    why: 'Kolor z Macedonii: takt ma 7 ósemek w grupach 3+2+2, czyli „długi, krótki, krótki”. Liczy się „raz-dwa-trzy, raz-dwa, raz-dwa”.',
    drums: { 36: 'X..x.x.', 38: '...x.x.', 42: 'xoxxoxo' },
    bass: [[0, 'R', 3], [3, '5', 2], [5, '5', 2]],
    comp: [[3, 2, 'C', 60], [5, 2, 'C', 56]] },
  { id: 'karsilama', name: 'Bałkany 9/8', meter: '9/8 (2+2+2+3)', beats: 4.5, grid: 9, tempo: 120, range: [90, 160], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'andaluzyjska' },
    why: 'Dziewięć ósemek w grupach 2+2+2+3: trzy krótkie kroki i jeden długi. Tak tańczy się karşılamę w Turcji, Grecji i na Bałkanach. Liczy się „raz-dwa, raz-dwa, raz-dwa, raz-dwa-trzy”.',
    drums: { 36: 'X...X....', 38: '..x...x.o', 42: 'xoxoxoxoo' },
    bass: [[0, 'R', 2], [4, '5', 2], [6, 'R', 3]],
    comp: [[2, 2, 'C', 62], [6, 3, 'C', 64]] },
  { id: 'cocek', name: 'Čoček (orkiestra dęta)', meter: '4/4', beats: 4, grid: 16, tempo: 118, range: [96, 140], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'andaluzyjska' },
    why: 'Bałkańska orkiestra dęta: tuba na „raz”, akord na „i”, a bęben gra 3+3+2 (raz-..-..-raz-..-..-raz-..). Ten nierówny podział ciągnie do tańca.',
    drums: { 36: 'X..X..X.X..X..X.', 38: '....X.......X..x', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [4, '5', 2], [8, 'R', 2], [12, '5', 2]],
    comp: [[2, 1, 'C', 68], [6, 1, 'C', 62], [10, 1, 'C', 68], [14, 1, 'C', 62]] },
  { id: 'slowblues', name: 'Slow blues 12/8', meter: '12/8', beats: 4, grid: 12, tempo: 56, range: [44, 72], swing: 0, color: 'sevenths', suggest: { major: 'blues', minor: 'mollPodstawa' },
    why: 'Wolny blues: każda ćwierćnuta dzieli się na trzy (12 ósemek w takcie). Werbel na 2 i 4, pianino pulsuje trioli. Gra się tu mniej dźwięków, ale każdy ma wagę.',
    drums: { 36: 'X.....X.....', 38: '...X.....X..', 42: 'xooxooxooxoo' },
    bass: [[0, 'R', 3], [3, '3', 3], [6, '5', 3], [9, '6', 2], [11, '5', 1]],
    comp: [[0, 1, 'C', 58], [1, 1, 'C', 42], [2, 1, 'C', 46], [3, 1, 'C', 54], [4, 1, 'C', 42], [5, 1, 'C', 46], [6, 1, 'C', 58], [7, 1, 'C', 42], [8, 1, 'C', 46], [9, 1, 'C', 54], [10, 1, 'C', 42], [11, 1, 'C', 46]] },
  { id: 'halftime', name: 'Rock half-time', meter: '4/4', beats: 4, grid: 16, tempo: 84, range: [64, 110], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'mollPop' },
    why: 'Werbel tylko na „trzy”, więc wszystko brzmi dwa razy wolniej i ciężej. Bas gra równe ósemki na prymie, pianino trzyma długie akordy. Grunge, ballady rockowe, metal.',
    drums: { 36: 'X.....X...X.....', 38: '........X.......', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, 'R', 2]],
    comp: [[0, 8, 'C', 70], [8, 8, 'C', 64]] },

  // --- 1.8: ten more western standards ------------------------------------------------------------------------
  { id: 'rock', name: 'Rock', meter: '4/4', beats: 4, grid: 16, tempo: 112, range: [90, 150], swing: 0, color: 'triads', suggest: { major: 'miksolidyjski', minor: 'watchtower' },
    why: 'Równe ósemki wszędzie: hi-hat, bas na prymie i pianino. Stopa na 1, „i” po dwójce i na 3, werbel mocno na 2 i 4. Energia bierze się z równości, a nie z ozdobników.',
    drums: { 36: 'X.....X.X.......', 38: '....X.......X...', 42: 'X.x.X.x.X.x.X.x.' },
    bass: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, '5', 2], [14, '8', 2]],
    comp: [[0, 2, 'C', 70], [2, 2, 'C', 56], [4, 2, 'C', 64], [6, 2, 'C', 56], [8, 2, 'C', 70], [10, 2, 'C', 56], [12, 2, 'C', 64], [14, 2, 'C', 56]] },
  { id: 'poppunk', name: 'Pop-rock szybki', feel: 'ahead', meter: '4/4', beats: 4, grid: 16, tempo: 164, range: [136, 196], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'mollPop' },
    why: 'Szybko i do przodu: talerz ride gra ósemki, stopa „pcha” przed trójką, a pianino trzyma długie akordy, żeby nie przegadać tempa. Green Day, Paramore, wczesny Coldplay.',
    drums: { 36: 'X.....X.X.X.....', 38: '....X.......X...', 51: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, '5', 2]],
    comp: [[0, 6, 'C', 72], [6, 2, 'C', 62], [8, 8, 'C', 68]] },
  { id: 'country', name: 'Country (two-step)', meter: '4/4', beats: 4, grid: 16, tempo: 112, range: [90, 144], swing: 0, color: 'triads', suggest: { major: 'folk1415', minor: 'mollPodstawa' },
    why: 'Bas skacze prima–kwinta jak tuba, a akord odpowiada na 2 i 4 („bum-czik”). Werbel szeleści cicho między uderzeniami. Wszystkie piosenki przy ognisku i większość country.',
    drums: { 36: 'X.......X.......', 38: '..o.X.o...o.X.o.', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 4], [8, '5', 4]], bassAlt: [[0, 'R', 4], [8, '5', 2], [12, 'app', 4]],
    comp: [[4, 3, 'C', 64], [7, 1, 'C', 48], [12, 3, 'C', 64], [15, 1, 'C', 48]] },
  { id: 'motown', name: 'Motown (soul lat 60.)', meter: '4/4', beats: 4, grid: 16, tempo: 120, range: [100, 140], swing: 0, color: 'triads', suggest: { major: 'lata50', minor: 'mollPop' },
    why: 'Werbel na każdą ćwierćnutę (cicho na 1 i 3, mocno na 2 i 4), stopa z synkopą, a bas śpiewa własną melodię jak James Jamerson. Pianino gra krótko na każdą ćwierćnutę. The Supremes, Stevie Wonder.',
    drums: { 36: 'X.....X.X.....x.', 38: 'o...X...o...X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 3], [3, 'R', 1], [4, '5', 2], [6, '6', 2], [8, '8', 3], [11, '5', 1], [12, '3', 2], [14, 'app', 2]],
    comp: [[0, 2, 'C', 58], [4, 2, 'C', 66], [8, 2, 'C', 58], [12, 2, 'C', 66]] },
  { id: 'hiphop', name: 'Hip-hop (boom bap)', feel: 'behind', meter: '4/4', beats: 4, grid: 16, tempo: 90, range: [78, 100], swing: 0.1, color: 'sevenths', suggest: { major: 'neosoul', minor: 'dorycki' },
    why: 'Ciężka stopa („bum”) i werbel („bap”) trochę za bitem, szesnastki lekko kołyszą. Pianino gra jak pocięty sampel: kawałek akordu, przerwa, kawałek. A Tribe Called Quest, J Dilla.',
    drums: { 36: 'X......X..X.....', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 6], [7, 'R', 2], [10, '5', 3], [13, 'R', 3]],
    comp: [[0, 3, 'C', 60], [7, 2, 'C', 52], [10, 4, 'C', 58]] },
  { id: 'purdie', name: 'Half-time shuffle', meter: '4/4 (triole)', beats: 4, grid: 12, tempo: 84, range: [70, 100], swing: 0, color: 'sevenths', suggest: { major: 'vamp14', minor: 'dorycki' },
    why: 'Najtrudniejszy i najpiękniejszy groove: trioli w hi-hacie, werbel tylko na trzy, a między nimi szepczące „duchy”. Bernard Purdie, Jeff Porcaro w „Rosannie”, Steely Dan.',
    drums: { 36: 'X........x..', 38: '.o..o.X..o..', 42: 'x.xx.xx.xx.x' },
    bass: [[0, 'R', 3], [5, 'R', 1], [6, '5', 3], [9, '8', 2], [11, 'app', 1]],
    comp: [[0, 2, 'C', 62], [5, 1, 'C', 52], [6, 2, 'C', 60], [11, 1, 'C', 52]] },
  { id: 'rocknroll', name: 'Rock and roll', meter: '4/4', beats: 4, grid: 16, tempo: 168, range: [140, 200], swing: 0.1, color: 'triads', suggest: { major: 'rnr1454', minor: 'mollPodstawa' },
    why: 'Chuck Berry i Elvis: bas chodzi boogie po 1, 3, 5, 6 i z powrotem, werbel strzela na 2 i 4, a pianino pulsuje na „i”. Gra się to na stojąco.',
    drums: { 36: 'X.......X.......', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 2], [2, 'R', 2], [4, '3', 2], [6, '5', 2], [8, '6', 2], [10, '5', 2], [12, '3', 2], [14, 'app', 2]],
    comp: [[2, 1, 'C', 66], [6, 1, 'C', 66], [10, 1, 'C', 66], [14, 1, 'C', 66]] },
  { id: 'jazz2', name: 'Jazz two-feel', meter: '4/4', beats: 4, grid: 16, tempo: 140, range: [100, 200], swing: 0.16, color: 'sevenths', suggest: { major: 'iiVI', minor: 'jazzMoll' },
    why: 'Pierwszy refren standardu gra się „na dwa”: bas tylko na 1 i 3, ride swinguje, a pianino gra charleston (raz i „i” po dwójce). Potem bas zaczyna spacerować (to już styl Swing).',
    drums: { 51: 'x...x.x.x...x.x.', 44: '....x.......x...' },
    bass: [[0, 'R', 8], [8, '5', 6], [14, 'app', 2]],
    comp: [[0, 3, 'C', 62], [6, 3, 'C', 58]] },
  { id: 'folk', name: 'Akustyczny pop (bicie gitary)', meter: '4/4', beats: 4, grid: 16, tempo: 100, range: [76, 128], swing: 0, color: 'triads', suggest: { major: 'hymn', minor: 'mollPop' },
    why: 'Pianino gra jak gitara biciem „dół, dół-góra, góra-dół-góra”, perkusja lekko, z rimshotem zamiast werbla. Najlepszy styl do śpiewania: rytm jest wyraźny, ale zostawia miejsce na głos. Ed Sheeran, Dawid Podsiadło.',
    drums: { 36: 'X.......X.......', 37: '....x.......x...', 42: 'o.o.o.o.o.o.o.o.' },
    bass: [[0, 'R', 6], [6, 'R', 2], [8, '5', 6], [14, 'app', 2]],
    comp: [[0, 4, 'C', 68], [4, 2, 'C', 62], [6, 2, 'C', 50], [10, 2, 'C', 52], [12, 2, 'C', 62], [14, 2, 'C', 50]] },
  { id: 'powerballad', name: 'Power ballada', meter: '4/4', beats: 4, grid: 16, tempo: 72, range: [56, 90], swing: 0, color: 'triads', suggest: { major: 'kanon', minor: 'mollPop' },
    why: 'Pianino rozkłada akord ósemkami, bas trzyma całe nuty, a perkusja gra wolno i szeroko. Ballada, która rośnie do refrenu. Bon Jovi, Adele, „Hallelujah” w wersji z zespołem.',
    drums: { 36: 'X......xX.......', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    bass: [[0, 'R', 8], [8, 'R', 6], [14, '5', 2]],
    comp: [[0, 2, 'A0', 62], [2, 2, 'A1', 52], [4, 2, 'A2', 56], [6, 2, 'A1', 50], [8, 2, 'A0', 60], [10, 2, 'A1', 52], [12, 2, 'A2', 56], [14, 2, 'A1', 50]] },
  // --- five from around the world ------------------------------------------------------------------------------
  { id: 'samba', name: 'Samba', family: 'latin', meter: '2/4 (liczone w 4)', beats: 4, grid: 16, tempo: 100, range: [84, 126], swing: 0, color: 'sevenths', suggest: { major: 'iiVI', minor: 'jazzMoll' },
    why: 'Brazylijski karnawał: surdo (niski bęben) mocno na „dwa”, szesnastki shakera bez przerwy i rimshot w partido alto. Bas gra krótki skok kwinta–pryma. Liczy się na dwa, nie na cztery.',
    drums: { 36: 'X..x....X..x....', 43: '....X.......X...', 37: 'x..x..x...x..x..', 42: 'xoxxxoxxxoxxxoxx' },
    bass: [[0, 'R', 3], [3, '5', 1], [4, '5', 4], [8, 'R', 3], [11, '5', 1], [12, '5', 4]],
    comp: [[0, 2, 'C', 58], [3, 2, 'C', 60], [6, 2, 'C', 56], [10, 2, 'C', 60], [13, 2, 'C', 58]] },
  { id: 'salsa', name: 'Salsa (klawe son 3-2)', family: 'latin', meter: '4/4 (2 takty klawe)', beats: 4, grid: 16, tempo: 96, range: [84, 112], swing: 0, color: 'triads', suggest: { major: 'folk1415', minor: 'tangoMoll' },
    why: 'Wszystko kręci się wokół klawe 3-2 (pałeczki: raz, raz, raz | raz, raz). Bas tumbao gra przed taktem, pianino montuno skacze ósemkami między akordem a pojedynczym dźwiękiem. Tu jedno okrążenie to dwa takty klawe, a tempo liczysz w półnutach.',
    drums: { 37: 'x..x..x...x.x...', 51: 'x.x.x.x.x.x.x.x.', 45: '......xx......xx', 36: '...x.......x....' },
    bass: [[3, 'R', 3], [6, '5', 2], [11, 'R', 3], [14, '5', 2]],
    comp: [[0, 1, 'C', 60], [2, 1, 'N0', 54], [3, 1, 'C', 60], [5, 1, 'N1', 52], [6, 1, 'C', 58], [8, 1, 'N0', 54], [10, 1, 'C', 60], [11, 1, 'N1', 52], [13, 1, 'C', 58], [14, 1, 'N0', 54]] },
  { id: 'tango', name: 'Tango', family: 'latin', meter: '4/4', beats: 4, grid: 16, tempo: 120, range: [100, 140], swing: 0, color: 'triads', suggest: { major: 'kanon', minor: 'tangoMoll' },
    why: 'Buenos Aires: marcato, czyli cztery twarde uderzenia, i sincopa 3-3-2 jak bandoneon. Perkusji prawie nie ma, rytm robią pianino i kontrabas. Dramatycznie i z dumą.',
    drums: { 36: 'x.......x.......', 37: '....o.......o...' },
    bass: [[0, 'R', 3], [4, '5', 3], [8, 'R', 3], [12, '5', 2], [14, 'app', 2]],
    comp: [[0, 2, 'C', 74], [3, 2, 'C', 62], [6, 2, 'C', 68], [8, 2, 'C', 72], [12, 3, 'C', 66]] },
  { id: 'afrobeat', name: 'Afrobeat', meter: '4/4', beats: 4, grid: 16, tempo: 110, range: [96, 126], swing: 0, color: 'sevenths', suggest: { major: 'vamp14', minor: 'dorycki' },
    why: 'Fela Kuti z Nigerii: hi-hat gra szesnastki z otwarciem na „i”, stopa i werbel tańczą wokół siebie, a bas powtarza jeden riff w kółko. Jeden akord może trwać pięć minut i nie nudzić.',
    drums: { 36: 'X.....x...X..x..', 38: '....X..o....X..o', 42: 'xoxo.oxoxoxo.oxo', 46: '....x.......x...' },
    bass: [[0, 'R', 2], [3, 'R', 1], [6, '5', 2], [10, 'b7', 2], [12, '8', 1], [14, '5', 2]],
    comp: [[2, 1, 'C', 68], [6, 1, 'C', 60], [10, 1, 'C', 68], [13, 1, 'C', 62]] },
  { id: 'mazurek', name: 'Mazurek', meter: '3/4', beats: 3, grid: 12, tempo: 132, range: [100, 170], swing: 0, color: 'triads', suggest: { major: 'folk1415', minor: 'mollPodstawa' },
    why: 'Polski taniec ludowy i mazurki Chopina: na „raz” krótkie „ta-dam” (kropkowany rytm), a akcent przesuwa się na „dwa” albo „trzy”. To ten nierówny krok robi z walca mazurka.',
    drums: { 36: 'X..x........', 38: '....X...o...', 42: 'x...x...x...' },
    bass: [[0, 'R', 3], [3, 'R', 1], [4, '5', 4], [8, '5', 4]],
    comp: [[4, 3, 'C', 72], [8, 3, 'C', 58]] },
];
export const GROOVE = Object.fromEntries(GROOVES.map((g) => [g.id, g]));

/**
 * A drum fill for the end of the last bar: snare, then toms going down, louder towards the end.
 * Returns { from (first step of the fill), hits: [[step, note, vel]] } on the groove's grid.
 */
export function fillPattern(g) {
  const spb = g.grid / g.beats;
  const len = Math.max(2, Math.min(g.grid - 1, Math.round(g.beats >= 4 ? spb * 2 : spb * 1.5)));
  const from = g.grid - len;
  const toms = [38, 38, 50, 48, 47, 45, 43, 43];
  const hits = [];
  for (let s = from; s < g.grid; s++) {
    const k = Math.min(toms.length - 1, Math.floor(((s - from) / len) * toms.length));
    hits.push([s, toms[k], Math.round(70 + 45 * ((s - from) / len))]);
  }
  return { from, hits };
}

export const ROLES = {
  solo: { name: 'Ty: solo', help: 'Gram akordy i bas, ty improwizujesz prawą ręką. Mocne kropki to dźwięki akordu, słabe to reszta skali.', trainer: { comp: true, bass: true } },
  akordy: { name: 'Ty: akordy', help: 'Gram bas (i perkusję z zespołem), ty grasz akordy prawą ręką. Na klawiszach widzisz układ, który najmniej skacze.', trainer: { comp: false, bass: true } },
  wszystko: { name: 'Ty: bas i akordy', help: 'Gram tylko rytm. Ty grasz lewą bas, prawą akordy, jak pianista w zespole.', trainer: { comp: false, bass: false } },
  sluchaj: { name: 'Posłuchaj', help: 'Gram wszystko. Słuchaj, patrz na klawisze i rozpoznawaj numery akordów.', trainer: { comp: true, bass: true } },
};

const VEL = { X: 108, x: 82, o: 46 };

/** Seconds per beat and per step for a groove at a tempo. */
export function timing(groove, tempo) {
  const beat = 60 / tempo;
  const bar = beat * groove.beats;
  return { beat, bar, step: bar / groove.grid };
}

/** Swing: offbeat eighths come later by `swing` of a beat (0.167 = full triplet feel). */
function stepTime(groove, step, tm) {
  let t = step * tm.step;
  const spb = groove.grid / groove.beats;
  if (groove.swing && Number.isInteger(spb) && spb % 2 === 0 && step % spb === spb / 2) t += groove.swing * tm.beat;
  return t;
}

/** A tone of the chord by its role ('5', '3', '7', '6'), or null. */
function tonePc(c, role) {
  const k = (c.roles || []).indexOf(role);
  return k >= 0 && c.tones[k] ? c.tones[k].pc : null;
}

/**
 * One bass note. The bass follows the chord that sounds: the real fifth (♭5, ♯5), third, seventh (7 or maj7),
 * and with a slash chord (C/E) it stands on the written bass and takes the other tones above it.
 */
export function bassMidi(what, c, nextC, rootM) {
  const rootPc = c.root ? c.root.pc : rootM % 12;
  const iv = (pc, dflt) => (pc == null ? dflt : (pc - rootPc + 12) % 12);
  const third = iv(tonePc(c, '3') ?? tonePc(c, '4') ?? tonePc(c, '2'), 4);
  const fifth = iv(tonePc(c, '5'), 7);
  const sev = iv(tonePc(c, '7'), 10);
  const sixth = iv(tonePc(c, '6') ?? tonePc(c, '13'), 9);
  if (what === 'app') {
    const target = nextC ? bassNote(nextC) : rootM;
    return target - 1 >= 33 ? target - 1 : target + 1;
  }
  const slash = c.bassPc != null && c.bassPc !== rootPc;
  if (slash) {
    if (what === 'R') return rootM;
    if (what === '8') return rootM + 12;
    const want = (rootPc + ({ 5: fifth, 3: third, b7: sev, 6: sixth }[what] ?? 0)) % 12;
    let m = rootM + 1; while (m % 12 !== want) m++;
    return m;
  }
  switch (what) {
    case 'R': return rootM;
    case '5': return rootM + fifth;
    case '8': return rootM + 12;
    case '3': return rootM + third;
    case 'b7': return rootM + sev;
    case '6': return rootM + sixth;
    default: return rootM;
  }
}

/** Chords of a progression (or editor steps) with voice-led voicings and bass notes. */
export function jamChords(key, prog, { color = 'auto', prevVoicing = null } = {}) {
  const list = stepChords(key, prog.steps, { color, jazz: !!(prog.jazz || prog.seventh === 'all'), ninths: !!prog.ninths, prevVoicing, lo: 55, hi: 74 });
  return list.length ? list : [{ chord: { name: 'pauza', number: '—', tones: [], roles: [], root: null }, voicing: [], bass: null, bars: 1, rest: true, labels: [], key }];
}

/**
 * Events for one pass through the progression.
 * opts: { key, prog, groove, tempo, barsPerChord, color, band, role, click, prevVoicing,
 *         callResponse (Pytanie–odpowiedź: the piano plays 2 bars, then is silent for your 2 bars), barOffset (bars before this cycle) }
 * Returns { events, seconds, bars, chords: [{chord, voicing, bass, start, end}], tm }.
 */
/** Pytanie–odpowiedź: bars 1–2 the band asks, bars 3–4 you answer (counted from the start of the jam). */
export const answerBar = (globalBar) => Math.floor(globalBar / 2) % 2 === 1;

export const KEYS_CH = 2;   // MIDI channel 3 (0-based): the band's keys

/** Arpeggio note order for n tones: up, down, skip up (1 3 2 4 3 5…), skip down. */
function arpOrder(mode, n) {
  const up = [...Array(n).keys()];
  if (mode === 'gora') return up;
  if (mode === 'dol') return up.slice().reverse();
  const skip = [];
  for (let i = 0; i + 2 < n + 1; i++) { skip.push(i); if (i + 2 < n) skip.push(i + 2); }
  const sk = skip.length ? skip : up;
  return mode === 'gora2' ? sk : sk.map((i) => n - 1 - i);
}

export function jamCycle(opts) {
  const { key, prog, groove, tempo, barsPerChord = 1, color = 'auto', band = false, role = 'solo', click = false, fill = false, crash = false, dyn = 1, callResponse = false, barOffset = 0, keysOwn = false,
    arp = null, human = null, bassLive = false, rng = Math.random, drummer = 2 } = opts;
  const g = typeof groove === 'string' ? GROOVE[groove] : groove;
  const tm = timing(g, tempo);
  const chords = jamChords(key, prog, { color: color === 'auto' ? g.color : color, prevVoicing: opts.prevVoicing || null });
  const parts = ROLES[role].trainer;
  // with Pytanie–odpowiedź the piano plays in the band's bars (also when you play chords: you hear the question)
  // and is silent in yours, so the gap is audible
  const compIn = (bar) => (callResponse && (role === 'solo' || role === 'akordy') ? !answerBar(barOffset + bar) : parts.comp);
  const events = [];
  // dyn: the band follows how loud you play (about 0.75 … 1.15)
  const vv = (v) => Math.max(1, Math.min(127, Math.round(v * dyn)));
  // humanization: up to ±30 ms and ±20 velocity at 100 %
  const hT = human && human.t ? human.t / 100 : 0;
  const hV = human && human.v ? human.v / 100 : 0;
  const jit = new Map();
  const on = (t, ch, n, v) => {
    const dt = hT ? (rng() * 2 - 1) * 0.03 * hT : 0;
    const dv = hV ? Math.round((rng() * 2 - 1) * 20 * hV) : 0;
    jit.set(ch * 128 + n, dt);
    events.push({ t: Math.max(0, t + dt), m: [0x90 | ch, n, Math.max(1, Math.min(127, vv(v) + dv))] });
  };
  const off = (t, ch, n) => events.push({ t: Math.max(0, t + (jit.get(ch * 128 + n) || 0)), m: [0x80 | ch, n, 0] });
  const bassCh = band ? 1 : 0;
  // the band's keys on channel 3 (track "Klawisze"); channel 1 left for them only without keysOwn, and bus.play moves it to 3 anyway
  const compCh = band && keysOwn ? KEYS_CH : 0;
  // each chord lasts its own number of bars (a song step may say 0.5 = half a bar), else barsPerChord
  const lens = chords.map((c) => (c.bars > 0 ? c.bars : barsPerChord));
  const startStep = [];
  let acc = 0;
  for (const l of lens) { startStep.push(Math.round(acc * g.grid)); acc += l; }
  const totalBars = Math.max(1, Math.ceil(acc - 1e-9));
  const endStep = Math.round(acc * g.grid);
  const chordAt = (G) => { let k = 0; for (let i = 0; i < startStep.length; i++) if (startStep[i] <= G) k = i; return k; };
  const nextStartOf = (k) => (k + 1 < startStep.length ? startStep[k + 1] : endStep);
  const nextPlayable = (k) => { for (let i = 1; i <= chords.length; i++) { const x = chords[(k + i) % chords.length]; if (!x.rest) return x.chord; } return null; };
  const bassPlan = [];
  const useArp = arp && arp.mode && arp.mode !== 'styl';
  for (let bar = 0; bar < totalBars; bar++) {
    const t0 = bar * tm.bar;
    const B = bar * g.grid;
    const lastBar = bar === totalBars - 1;
    if (band) {
      // the drummer plays the groove's pattern at its level (see drummer.js); fills and crashes included
      for (const h of drumBar(g, { level: drummer, bar: barOffset + bar, last: lastBar, fill: fill && lastBar, crash: crash && bar === 0, rng })) {
        const t = Math.max(0, t0 + stepTime(g, h.step, tm) + h.dt);
        on(t, 9, h.n, h.v); off(t + 0.08, 9, h.n);
      }
    }
    if (click || (!band && role === 'wszystko')) {
      for (let q = 0; q < Math.ceil(g.beats); q++) {
        const t = t0 + q * tm.beat;
        events.push(...clickEvents(t, vv(q === 0 ? 56 : 38), q === 0));
      }
    }
    const k0 = chordAt(B);
    const barOfChord = Math.floor((B - startStep[k0]) / g.grid);
    if (parts.bass) {
      const pat = (g.bassAlt && barOfChord % 2 === 1) ? g.bassAlt : g.bass;
      for (const [s, what, len] of pat) {
        const G = B + s;
        if (G >= endStep) continue;
        const k = chordAt(G);
        const c = chords[k];
        if (c.rest) continue;
        const nextStart = nextStartOf(k);
        const nextC = nextPlayable(k) || c.chord;
        // the approach note only makes sense right before a chord change
        const w = what === 'app' && nextStart - G > (g.grid / g.beats) * 1.01 ? '5' : what;
        const t = t0 + stepTime(g, s, tm);
        const tEnd = t0 + stepTime(g, Math.min(s + len, nextStart - B), tm) - 0.03;
        if (bassLive) { bassPlan.push({ t, tEnd: Math.max(t + 0.05, tEnd), what: w, k, ch: bassCh, vel: vv(band ? 92 : 70) }); continue; }
        const n = bassMidi(w, c.chord, nextC, c.bass);
        on(t, bassCh, n, band ? 92 : 70); off(Math.max(t + 0.05, tEnd), bassCh, n);
      }
    }
    if (compIn(bar) && !useArp) {
      for (const [s, len, part, vel] of g.comp) {
        const G = B + s;
        if (G >= endStep) continue;
        const k = chordAt(G);
        const c = chords[k];
        if (c.rest || !c.voicing.length) continue;
        const notes = part === 'C' ? c.voicing : [c.voicing[Number(part.slice(1)) % c.voicing.length]];
        const t = t0 + stepTime(g, s, tm);
        const tOff = t0 + Math.min(g.grid, s + len, nextStartOf(k) - B) * tm.step - 0.03;
        notes.forEach((n, i) => { on(t + i * 0.004, compCh, n, vel); off(Math.max(t + 0.05, tOff), compCh, n); });
      }
      // a chord that starts between the pattern's hits still sounds when it comes
      for (let k = 0; k < startStep.length; k++) {
        const s = startStep[k] - B;
        if (s <= 0 || s >= g.grid) continue;
        if (g.comp.some(([cs]) => cs === s)) continue;
        const c = chords[k];
        if (c.rest) continue;
        const t = t0 + stepTime(g, s, tm);
        const tOff = t0 + Math.min(g.grid, nextStartOf(k) - B) * tm.step - 0.03;
        c.voicing.forEach((n, i) => { on(t + i * 0.004, compCh, n, 60); off(Math.max(t + 0.05, tOff), compCh, n); });
      }
    }
  }
  // arpeggio / plain chords instead of the style's comping
  if (useArp && (parts.comp || callResponse)) {
    const stepLen = (arp.step || 0.5) * tm.beat;
    chords.forEach((c, k) => {
      if (c.rest || !c.voicing.length) return;
      const tA = startStep[k] * tm.step, tB = nextStartOf(k) * tm.step;
      if (arp.mode === 'akord') {
        for (let t = tA; t < tB - 1e-6; t = Math.min(tB, (Math.floor(t / tm.bar + 1e-9) + 1) * tm.bar)) {
          const bar = Math.floor(t / tm.bar + 1e-9);
          const tE = Math.min(tB, (bar + 1) * tm.bar) - 0.03;
          if (!compIn(bar)) continue;
          c.voicing.forEach((n, i) => { on(t + i * 0.004, compCh, n, Math.abs(t - bar * tm.bar) < 1e-6 ? 70 : 60); off(Math.max(t + 0.05, tE), compCh, n); });
        }
        return;
      }
      const base = [...c.voicing].sort((a, b) => a - b);
      const voices = Math.max(2, arp.voices || base.length);
      const notes = [];
      for (let i = 0; notes.length < voices; i++) notes.push(base[i % base.length] + 12 * Math.floor(i / base.length));
      const order = arpOrder(arp.mode, notes.length);
      let j = 0;
      for (let t = tA; t < tB - 1e-6; t += stepLen, j++) {
        const bar = Math.floor(t / tm.bar + 1e-9);
        if (!compIn(bar)) continue;
        const inBeat = (t - bar * tm.bar) / tm.beat;
        const swingT = g.swing && Math.abs(stepLen - tm.beat / 2) < 1e-6 && Math.abs(inBeat % 1 - 0.5) < 1e-6 ? g.swing * tm.beat : 0;
        const n = notes[order[j % order.length]];
        const accent = Math.abs(inBeat - Math.round(inBeat)) < 1e-6 ? 66 : 54;
        on(t + swingT, compCh, n, accent); off(Math.min(tB, t + swingT + stepLen * 0.95), compCh, n);
      }
    });
  }
  const out = chords.map((c, k) => ({ ...c, start: startStep[k] * tm.step, end: nextStartOf(k) * tm.step }));
  events.sort((a, b) => a.t - b.t || ((a.m[0] & 0xf0) === 0x80 ? -1 : 1));
  return { events, seconds: totalBars * tm.bar, bars: totalBars, chords: out, tm, groove: g, bassPlan };
}

/** One bar of count-in (side stick with the band, piano click without). */
export function countIn(groove, tempo, band) {
  const g = typeof groove === 'string' ? GROOVE[groove] : groove;
  const tm = timing(g, tempo);
  const ev = [];
  for (let q = 0; q < Math.ceil(g.beats); q++) {
    const t = q * tm.beat;
    if (band) { ev.push({ t, m: [0x99, 37, q === 0 ? 100 : 76] }, { t: t + 0.06, m: [0x89, 37, 0] }); }
    else ev.push(...clickEvents(t, q === 0 ? 62 : 44, q === 0));
  }
  return { events: ev, seconds: tm.bar };
}

// the style cards in three groups (any groove not listed lands in the last group)
const GROUPED = [
  ['Pop, rock, soul', ['pop', 'ballada', 'rock', 'poppunk', 'powerballad', 'folk', 'halftime', 'motown', 'disco', 'funk', 'neosoul', 'hiphop', 'gospel', 'country', 'rocknroll']],
  ['Jazz i blues', ['swing', 'jazz2', 'jazzBallada', 'jazzWalc', 'shuffle', 'purdie', 'slowblues', 'walc']],
  ['Ze świata', ['bossa', 'samba', 'salsa', 'tango', 'reggae', 'afrobeat', 'mazurek', 'cocek', 'lesnoto', 'karsilama']],
];
export const GROOVE_GROUPS = (() => {
  const listed = new Set(GROUPED.flatMap(([, ids]) => ids));
  const rest = GROOVES.map((g) => g.id).filter((id) => !listed.has(id));
  return GROUPED.map(([n, ids], i) => [n, i === GROUPED.length - 1 ? [...ids, ...rest] : ids]);
})();
