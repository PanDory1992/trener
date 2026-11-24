"""1.18–1.21: the Progresje tab. Warsztat (strip, lenses, Zamień / Pożycz, band, Graj ze mną), Biblioteka, Ruchy,
Przepisy, Trening (games with a fake player), Album; doors from the Koło, Jam and Piosenki; help.

Run: python3 tests/e2e_progresje.py <out-dir>
"""
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, UdpBus, FakeUser  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-progresje")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def triad(tid):
    root = int(tid[:-1])
    third = 3 if tid.endswith("m") else 4
    return [60 + root, 60 + root + third, 60 + root + 7]


def plr(tid):
    r = int(tid[:-1])
    if tid.endswith("M"):
        return {"P": f"{r}m", "R": f"{(r + 9) % 12}m", "L": f"{(r + 4) % 12}m"}
    return {"P": f"{r}M", "R": f"{(r + 3) % 12}M", "L": f"{(r + 8) % 12}M"}


def path(a, b):
    prev = {a: None}
    q = [a]
    while q:
        cur = q.pop(0)
        if cur == b:
            break
        for nx in plr(cur).values():
            if nx not in prev:
                prev[nx] = cur
                q.append(nx)
    out = []
    x = b
    while prev[x] is not None:
        out.insert(0, x)
        x = prev[x]
    return out


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules", "trener-dane*.json", "klucz-telefonu.txt", "trener.log"))
    (app_dir / "trener-dane.json").write_text('{"v":1,"settings":{},"modes":{},"cards":[],"days":{},"songs":[]}', encoding="utf-8")
    user = FakeUser()
    bus = UdpBus(on_play=user.on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    shots = SCRATCH / "shots"
    shots.mkdir()
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.route("https://fonts.googleapis.com/**", fonts)
            pg.route("https://fonts.gstatic.com/**", fonts)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            # --- nav and the Warsztat ------------------------------------------------------------------------------
            nav = [x.inner_text() for x in pg.locator("nav .nav-main .nav-label").all()]
            ok("nav: Koło, Progresje, Piosenki, Jam", nav[:4] == ["Koło tonacji", "Progresje", "Piosenki", "Jam"], str(nav))
            pg.click("nav >> text=Progresje")
            pg.wait_for_timeout(500)
            tabs = [x.inner_text() for x in pg.locator(".tabs .tab").all()]
            ok("six cards", tabs == ["Biblioteka", "Warsztat", "Ruchy", "Przepisy", "Trening", "Album"], str(tabs))
            head = pg.inner_text(".pr-whead h2")
            ok("Warsztat: pop-hymn in C", "Pop-hymn" in head and "C-dur" in head, head)
            chips = pg.locator(".pr-strip.live .pr-chip")
            nums = [c.inner_text().split("\n")[0] for c in chips.all()]
            ok("strip: numbers coloured by function", nums == ["1", "5", "6m", "4"] and pg.locator(".pr-strip.live .pr-chip.fn-T").count() == 2 and pg.locator(".pr-strip.live .pr-chip.fn-D").count() == 1, str(nums))
            arrows = [a.get_attribute("class") for a in pg.locator(".pr-strip.live .pr-arrow").all()]
            ok("strip: arrows by bass move", arrows[0].endswith("bm-wstecz") and "bm-krok" in arrows[1] and "bm-miekki" in arrows[2], str(arrows))
            pg.screenshot(path=str(shots / "p01-warsztat.png"), full_page=True)

            # --- Szkielet: layers and dressing ---------------------------------------------------------------------
            ok("Szkielet: layers listed", pg.locator(".pr-layer").count() == 5)
            why = pg.inner_text(".pr-why-list")
            ok("Szkielet: one line per chord", why.count("\n") >= 3 and "akord główny" in why and "krewny" in why, why.replace("\n", " | "))
            pg.locator(".pr-layer", has_text="0. Szkielet").click()
            pg.wait_for_timeout(200)
            und = pg.inner_text(".pr-lens .pr-strip")
            ok("Szkielet: without clothes 1 5 1 4", und.split("\n")[0] == "1" and "6m" not in und, und.replace("\n", " "))
            pg.locator(".pr-move-chip .pick", has_text="Dominanta wtórna").first.click()
            pg.wait_for_timeout(250)
            names = pg.inner_text(".pr-strip.live")
            ok("Ubierz: secondary dominant inserted (E7 before Am)", "E7" in names and "(zmieniona)" in pg.inner_text(".pr-whead h2"), names.replace("\n", " "))
            pg.get_by_role("button", name="Cofnij").click()
            pg.wait_for_timeout(200)
            ok("Cofnij: back to the original", "E7" not in pg.inner_text(".pr-strip.live"))

            # --- Zamień / Pożycz ----------------------------------------------------------------------------------
            chips.nth(3).click()
            pg.wait_for_timeout(300)
            card = pg.inner_text(".pr-chord")
            ok("chord card: groups for F", all(w in card for w in ("Ta sama funkcja", "Jeden palec", "Pożycz z modu", "Medianty chromatyczne", "Wtrąć przed nim")), card[:200].replace("\n", " | "))
            pg.locator(".pr-repl-g", has_text="Pożycz z modu").locator(".pick", has_text="Fm").first.click()
            pg.wait_for_timeout(250)
            ok("Pożycz: F → Fm", "Fm" in pg.inner_text(".pr-strip.live"))
            pg.get_by_role("button", name="Oryginał").click()
            pg.wait_for_timeout(200)

            # --- Bas ----------------------------------------------------------------------------------------------
            pg.locator(".pr-lenses button", has_text="Bas").click()
            pg.wait_for_timeout(250)
            prof = pg.inner_text(".pr-profile")
            ok("Bas: profile of moves", "wstecz" in prof and "krok" in prof, prof.replace("\n", " | "))
            pg.get_by_role("button", name="Bas krokiem").click()
            pg.wait_for_timeout(250)
            ok("Bas krokiem: G over B", "G/B" in pg.inner_text(".pr-strip.live"), pg.inner_text(".pr-strip.live").replace("\n", " "))

            # --- Siatka -------------------------------------------------------------------------------------------
            pg.locator(".pr-lenses button", has_text="Siatka").click()
            pg.wait_for_timeout(300)
            ok("Siatka: the grid with the path", pg.locator("svg.tonnetz .tri").count() >= 80 and pg.locator("svg.tonnetz .tri-path").count() == 1)
            threading.Thread(target=user.chord, args=([60, 64, 67],), kwargs={"hold": 1.6}, daemon=True).start()
            pg.wait_for_timeout(700)
            ok("Siatka: the chord you hold lights up, neighbours outlined", pg.locator("svg.tonnetz .tri.held").count() >= 1 and pg.locator("svg.tonnetz .tri.nb").count() >= 3)
            pg.wait_for_timeout(600)
            pg.screenshot(path=str(shots / "p02-siatka.png"), full_page=True)

            # --- Jak zagrać and the band --------------------------------------------------------------------------
            pg.locator(".pr-lenses button", has_text="Jak zagrać").click()
            pg.wait_for_timeout(300)
            ok("Jak zagrać: seven ways", pg.locator(".pr-lens .chips-row .pick").count() == 7)
            ok("Jak zagrać: Pokaż and Graj ze mną in the play bar", pg.locator("#dockbar button", has_text="Graj ze mną").count() == 1 and pg.locator("#dockbar button", has_text="Pokaż").count() == 1)
            pg.locator("#dockbar button", has_text="Graj ze mną").click()
            pg.wait_for_timeout(400)
            ok("Graj ze mną: keys lit", pg.locator(".key.marked").count() >= 3, str(pg.locator(".key.marked").count()))
            pg.locator("#dockbar button", has_text="Stop").first.click()
            pg.locator(".pr-lenses button", has_text="Szkielet").click()
            pg.wait_for_timeout(200)
            before = len(user.trainer)
            pg.locator("#dockbar button", has_text="Zespół").click()
            pg.wait_for_timeout(6500)
            ok("band: drums, bass and keys play", 0x99 in user.statuses and 0x91 in user.statuses and len(user.trainer) - before > 10, f"{sorted(user.statuses)}")
            ok("band: the chord being played is lit", pg.locator(".pr-strip.live .pr-chip.now").count() == 1)
            pg.locator("#dockbar button", has_text="Stop").click()
            pg.wait_for_timeout(300)

            # --- Biblioteka ---------------------------------------------------------------------------------------
            pg.locator(".tabs .tab", has_text="Biblioteka").click()
            pg.wait_for_timeout(300)
            n_all = pg.locator(".pr-grid .pr-card").count()
            ok("Biblioteka: over 100 progressions", n_all >= 100, str(n_all))
            pg.locator(".pr-fams .pick", has_text="Soul i gospel").click()
            pg.wait_for_timeout(200)
            ok("Biblioteka: family filter", 8 <= pg.locator(".pr-grid .pr-card").count() < n_all)
            pg.locator(".pr-fams .pick", has_text="Wszystkie").click()
            pg.fill(".pr-search", "hallelujah")
            pg.wait_for_timeout(600)
            ok("Biblioteka: search", pg.locator(".pr-grid .pr-card").count() == 1)
            pg.locator(".pr-grid .pr-card button", has_text="Otwórz").first.click()
            pg.wait_for_timeout(300)
            ok("Otwórz → Warsztat", "Kwarta, kwinta" in pg.inner_text(".pr-whead h2"))
            cells = pg.inner_text(".pr-cells-here") if pg.locator(".pr-cells-here").count() else ""
            ok("cells found in the progression", "Dominanta wtórna" in cells, cells)
            pg.locator(".pr-cells-here .pick", has_text="Dominanta wtórna").click()
            pg.wait_for_timeout(200)

            # --- Ruchy ---------------------------------------------------------------------------------------------
            pg.locator(".tabs .tab", has_text="Ruchy").click()
            pg.wait_for_timeout(300)
            ok("Ruchy: 27 moves in groups", pg.locator(".pr-move").count() == 27 and pg.locator(".pr-section h3").count() >= 5)
            pg.locator(".pr-move-head", has_text="Molowa subdominanta").click()
            pg.wait_for_timeout(200)
            body = pg.inner_text(".pr-move.open")
            ok("Ruch: rule, fingers, where, before and after", all(w in body for w in ("Przepis", "Pod palcami", "Gdzie usłyszysz", "Przed", "Po")) and "Fm" in body, body[:160].replace("\n", " | "))
            pg.locator(".tabs .tab", has_text="Biblioteka").click()
            pg.fill(".pr-search", "")
            pg.wait_for_timeout(500)
            pg.locator(".pr-card[data-id='hymn'] button", has_text="Otwórz").click()
            pg.wait_for_timeout(200)
            pg.locator(".tabs .tab", has_text="Ruchy").click()
            if not pg.locator(".pr-move.open", has_text="Molowa subdominanta").count():
                pg.locator(".pr-move-head", has_text="Molowa subdominanta").click()
            pg.locator(".pr-move.open button", has_text="Na mojej").click()
            pg.wait_for_timeout(300)
            ok("Na mojej: back in the Warsztat, changed", "(zmieniona)" in pg.inner_text(".pr-whead h2") and "Fm" in pg.inner_text(".pr-strip.live"))

            # --- Przepisy ------------------------------------------------------------------------------------------
            pg.locator(".tabs .tab", has_text="Przepisy").click()
            pg.wait_for_timeout(200)
            ok("Przepisy: ten recipes", pg.locator(".pr-grid .pr-card").count() >= 10)
            pg.locator(".pr-card", has_text="Gospelowe zakończenie").locator("button", has_text="Zacznij").click()
            for _ in range(5):
                pg.locator(".pr-recipe button", has_text="Dalej").click()
                pg.wait_for_timeout(120)
            last = pg.inner_text(".pr-recipe")
            ok("recipe: the gospel ending is built", "F♯°7" in last and "F/G" in last and "Fm" in last, last.replace("\n", " ")[:300])
            pg.screenshot(path=str(shots / "p03-przepis.png"), full_page=True)
            pg.locator(".pr-recipe button", has_text="Weź do Warsztatu").click()
            pg.wait_for_timeout(300)
            ok("recipe → Warsztat as your own", "Gospelowe zakończenie" in pg.inner_text(".pr-whead h2"))

            # --- Trening: Słysz bas --------------------------------------------------------------------------------
            pg.locator(".tabs .tab", has_text="Trening").click()
            pg.wait_for_timeout(200)
            ok("Trening: seven games", pg.locator(".pr-grid .pr-card.game").count() == 7)
            pg.locator(".pr-card", has_text="Słysz bas").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_selector("text=Akord 1 z", timeout=15000)
            n = pg.locator(".pr-game .pr-chip").count()
            for k in range(n):
                pg.wait_for_selector(f"text=Akord {k + 1} z", timeout=8000)
                pg.wait_for_timeout(300)
                user.hit(48, 70, 0.2)
                pg.wait_for_timeout(700)
            pg.wait_for_selector("text=Wynik:", timeout=8000)
            ok("Słysz bas: every chord answered, a score", pg.locator(".pr-game .pr-chip.ok, .pr-game .pr-chip.bad").count() == n and "Seria 1/10" in pg.inner_text(".pr-game-head"), pg.inner_text(".pr-game").replace("\n", " ")[:200])

            # --- Co to za progresja? -------------------------------------------------------------------------------
            pg.get_by_role("button", name="← Wszystkie gry").click()
            pg.locator(".pr-card", has_text="Co to za progresja").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_timeout(600)
            ok("Co to: three cards", pg.locator(".pr-game .pick-card").count() == 3)
            pg.locator(".pr-game .pick-card").first.click()
            pg.wait_for_timeout(300)
            ok("Co to: answered, the right card shown", pg.locator(".pr-game .pick-card.ok").count() == 1)

            # --- Dom, wyjście, napięcie ---------------------------------------------------------------------------
            pg.get_by_role("button", name="← Wszystkie gry").click()
            pg.locator(".pr-card", has_text="Dom, wyjście").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_timeout(400)
            pg.locator(".pr-fn-btns button").first.click()
            pg.wait_for_timeout(200)
            ok("Funkcja: an answer and the function named", "C-dur" in pg.inner_text(".pr-game") or "dur" in pg.inner_text(".pr-game"))

            # --- Jeden palec: walk the shortest way -----------------------------------------------------------------
            pg.get_by_role("button", name="← Wszystkie gry").click()
            pg.locator(".pr-card", has_text="Jeden palec").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_timeout(500)
            start = pg.locator("svg.tonnetz .tri.start").first.get_attribute("data-id")
            target = pg.locator("svg.tonnetz .tri.target").first.get_attribute("data-id")
            user.chord(triad(start), hold=0.6)
            pg.wait_for_timeout(300)
            for tid in path(start, target):
                user.chord(triad(tid), hold=0.6)
                pg.wait_for_timeout(350)
            res = pg.inner_text(".pr-game")
            ok("Jeden palec: reached by the shortest way", "Doszedłeś" in res and "najkrócej" in res, f"{start}→{target} {res[:120]}")

            # --- Jedna nuta -----------------------------------------------------------------------------------------
            pg.get_by_role("button", name="← Wszystkie gry").click()
            pg.locator(".pr-card", has_text="Jedna nuta").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_timeout(400)
            note = pg.inner_text(".pr-big-note")
            pcs = {"C": 0, "D♭": 1, "D": 2, "E♭": 3, "E": 4, "F": 5, "F♯": 6, "G": 7, "A♭": 8, "A": 9, "B♭": 10, "H": 11}[note]
            user.chord([60 + pcs, 64 + pcs, 67 + pcs], hold=0.7)
            pg.wait_for_timeout(500)
            ok("Jedna nuta: a chord with the note counts", "znalezione 1 z" in pg.inner_text(".pr-game"), pg.inner_text(".pr-game").replace("\n", " ")[:150])

            # --- Jeden dźwięk zmienia mod: the scale on the keys, a drone ------------------------------------------
            pg.get_by_role("button", name="← Wszystkie gry").click()
            pg.locator(".pr-card", has_text="Jeden dźwięk zmienia mod").locator("button", has_text="Graj").click()
            pg.locator("#dockbar button", has_text="Start").click()
            pg.wait_for_timeout(600)
            ok("Mod: the scale lit on the keys", pg.locator(".key.marked").count() >= 7)
            pg.locator("#dockbar button", has_text="Stop").click()

            # --- Album ----------------------------------------------------------------------------------------------
            pg.locator(".tabs .tab", has_text="Album").click()
            pg.wait_for_timeout(300)
            ok("Album: the collected cell and the rest", "Twój album (1)" in pg.inner_text(".pr-body") and pg.locator(".pr-card.cell").count() == 24)
            pg.screenshot(path=str(shots / "p04-album.png"), full_page=True)

            # --- doors: Koło, Jam, Piosenki ---------------------------------------------------------------------
            pg.click("nav >> text=Koło tonacji")
            pg.wait_for_timeout(400)
            ktabs = [x.inner_text() for x in pg.locator(".tabs .tab").all()]
            ok("Koło: Progresje is a door", ktabs == ["Gama", "Akordy", "Akompaniament", "Progresje →"], str(ktabs))
            pg.locator(".tabs .tab", has_text="Akompaniament").click()
            pg.wait_for_timeout(200)
            ok("Koło Akompaniament: a progression picker", pg.locator(".kcard .prog-select select").count() == 1)
            pg.get_by_role("button", name="Strzałki kroków").click()
            pg.wait_for_timeout(200)
            ok("Koło: step arrows", pg.locator(".wheel .step-arrow").count() == 7)
            pg.locator(".tabs .tab", has_text="Progresje →").click()
            pg.wait_for_timeout(400)
            ok("Koło → Progresje", pg.locator(".view-progresje").count() == 1)
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(400)
            ok("Jam: catalogue in the list", pg.locator("select.jam-prog optgroup").count() >= 5)
            pg.locator("#dockbar button", has_text="W Progresjach").click()
            pg.wait_for_timeout(400)
            ok("Jam → Progresje", pg.locator(".view-progresje .pr-whead").count() == 1)
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(500)
            if pg.locator(".song-steps").count():
                pg.evaluate("(() => { const d = document.querySelector('details.song-steps'); if (d) d.open = true; })()")
                door = pg.locator(".song-steps .door", has_text="Rozbierz")
                ok("Piosenki: a door to take it apart", door.count() == 1)
                door.click()
                pg.wait_for_timeout(400)
                ok("Piosenki → Progresje: the song as your own", pg.locator(".view-progresje .pr-whead").count() == 1)
            else:
                ok("Piosenki: a door to take it apart", False, "no song steps panel")

            # --- help -----------------------------------------------------------------------------------------
            pg.click(".rail-foot >> text=Jak to działa")
            pg.wait_for_timeout(300)
            ok("help: Progresje topics", pg.locator("text=Progresje: cztery soczewki").count() >= 1)
            b.close()
    finally:
        server.terminate()
        server.wait(5)
        bus.close()
    print("JS errors:", "none" if not errors else errors)
    print("ALL OK" if all(results) and not errors else f"FAILURES {results.count(False)}")


main()
