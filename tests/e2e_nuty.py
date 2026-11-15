"""1.16: Nuty (Spartito in Trener). A fake pianist holds a chord and plays a row of notes (Na żywo), then reads
cards (Czytanie): right, wrong (red note, keys lit, then corrected), a whole series up to the summary. At the end
the engine is blocked to check the mode explains what is missing. Needs web/js/spartito/engine.js (kept off git).

Run: python3 tests/e2e_nuty.py <out-dir>
"""
import json
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-nuty")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def main():
    if not (TRENER / "web" / "js" / "spartito" / "engine.js").exists():
        print("SKIP: no Spartito engine (python3 tools/spartito_engine.py)")
        print("ALL OK")
        return
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules", "trener-dane*.json", "klucz-telefonu.txt", "trener.log", "spartito-src"))
    (app_dir / "trener-dane.json").write_text('{"v":1,"settings":{},"modes":{},"cards":[],"days":{}}', encoding="utf-8")
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

            ok("nav: Nuty apart from the exercises", pg.locator(".nav-group-nuty").count() == 1 and pg.locator(".nav-item.nav-nuty").count() == 1)
            ok("server says 1.16", json.loads(pg.evaluate("fetch('/api/now').then(r => r.text())"))["version"] == "1.16")
            pg.click(".nav-item.nav-nuty")
            pg.wait_for_selector(".nuty-chord .nuty-score svg", timeout=5000)
            tabs = pg.inner_text(".nuty-tabs")
            ok("tabs: Na żywo, Czytanie", "Na żywo" in tabs and "Czytanie" in tabs, tabs.replace("\n", " | "))
            ok("empty chord: nothing held", pg.locator(".nuty-chord .nuty-score").get_attribute("data-heads") == "0" and "–" in pg.inner_text(".nuty-chord-name"))

            # hold D major with F# in D major: the name and four heads on the grand staff
            pg.click("button[title='Tonacja: kwintę w górę']")
            pg.click("button[title='Tonacja: kwintę w górę']")
            pg.wait_for_timeout(200)
            ok("key: D", "D" in pg.inner_text(".nuty-key-name"), pg.inner_text(".nuty-key-name"))
            for n in (50, 62, 66, 69):
                bus.note(True, n, 80, 80)
                time.sleep(0.005)
            pg.wait_for_timeout(400)
            name = pg.inner_text(".nuty-chord-name")
            heads = pg.locator(".nuty-chord .nuty-score").get_attribute("data-heads")
            svg = pg.inner_html(".nuty-chord .nuty-score")
            ok("held chord: D, four heads", "D" in name and heads == "4", f"{name!r} heads={heads}")
            ok("names next to the heads, spelled in D: F♯", "F♯4" in svg or "F#4" in svg, "")
            ok("no time signature on a chord", ">4</text>" not in svg.replace("F♯4</text>", ""))
            pg.screenshot(path=str(shots / "01-zywo-akord.png"))
            for n in (50, 62, 66, 69):
                bus.note(False, n, 0, 0)
            # a row: the onsets (the chord counts as one), then a scale up
            user.seq([60, 62, 64, 65, 67], gap=0.15)
            pg.wait_for_timeout(500)
            row = pg.locator(".nuty-row .nuty-score")
            ok("row: chord + five notes = nine heads", row.get_attribute("data-heads") == "9", row.get_attribute("data-heads"))
            pg.uncheck(".nuty-check input")
            pg.wait_for_timeout(200)
            ok("names off: no labels", "Atkinson" not in pg.inner_html(".nuty-chord .nuty-score") + pg.inner_html(".nuty-row .nuty-score"))
            pg.screenshot(path=str(shots / "02-zywo-rzad.png"))
            pg.click("text=Wyczyść")
            pg.wait_for_timeout(200)
            ok("clear: the row is empty", pg.locator(".nuty-row .nuty-score").count() == 0)

            # --- Czytanie
            pg.click(".nuty-tabs >> text=Czytanie")
            pg.wait_for_timeout(300)
            lad = pg.inner_text(".nuty-ladder")
            ok("ladder: level 1, next level 2, the goal", "1. Prawa ręka: od C do G" in lad and "Dalej: 2." in lad and "20 kart" in lad, lad.replace("\n", " | "))
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_selector(".nuty-score.card", timeout=3000)

            def card():
                return [int(x) for x in pg.locator(".nuty-score.card").get_attribute("data-pitches").split()]

            c = card()
            ok("card: one note of C-G in the treble", len(c) == 1 and 60 <= c[0] <= 67, str(c))
            # wrong first (a semitone up), then right
            user.hit(c[0] + 1, 70, 0.1)
            pg.wait_for_timeout(300)
            st = pg.inner_text(".status")
            svg = pg.inner_html(".nuty-score.card")
            ok("wrong: told, your note in red, the right keys lit", "Nie ta" in st and "rgb(219,41,56)" in svg and pg.locator(".key.marked").count() == 1, st)
            pg.screenshot(path=str(shots / "03-czytanie-blad.png"))
            user.hit(c[0], 70, 0.1)
            pg.wait_for_timeout(250)
            st = pg.inner_text(".status")
            ok("corrected: named with its place", "Dobrze" in st and ("linia" in st or "pole" in st or "pod pięciolinią" in st), st)
            pg.wait_for_timeout(1000)
            ok("next card, count 1/20", "1 / 20" in pg.inner_text(".nuty-count"), pg.inner_text(".nuty-count"))
            # the rest of the series: all right and quick
            for i in range(19):
                c = card()
                user.hit(c[0], 70, 0.05)
                pg.wait_for_timeout(650)
            pg.wait_for_selector(".nuty-summary", timeout=4000)
            summ = pg.inner_text(".nuty-summary")
            ok("summary: 19 of 20, level up", "19 z 20" in summ and "Awans na poziom 2" in summ, summ.replace("\n", " | "))
            ok("ladder now level 2", "2. Lewa ręka" in pg.inner_text(".nuty-ladder"))
            pg.screenshot(path=str(shots / "04-czytanie-seria.png"))
            pg.wait_for_timeout(1200)
            saved = json.loads((app_dir / "trener-dane.json").read_text(encoding="utf-8"))
            r = saved.get("modes", {}).get("nuty", {}).get("read", {})
            ok("saved: level 2, card stats", r.get("level") == 2 and len(r.get("items", {})) >= 3, str(r)[:160])
            day = next(iter(saved.get("days", {}).values()), {})
            ok("series logged for Plan dnia", any(s.get("id") == "nuty" and s.get("n") == 20 for s in day.get("series", [])))
            # level 2: the bass clef; a chord level by the button
            pg.get_by_role("button", name="Następna seria").click()
            pg.wait_for_timeout(300)
            c = card()
            ok("level 2: C-G in the bass", 48 <= c[0] <= 55, str(c))
            pg.click("text=Przerwij serię")
            for _ in range(7):
                pg.click("text=Trudniej")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(300)
            c = card()
            ok("level 9: a triad", len(c) == 3, str(c))
            user.chord(c, hold=0.15)
            pg.wait_for_timeout(700)
            ok("chord read: right, next card", "1 / 20" in pg.inner_text(".nuty-count") and pg.locator(".nuty-score.card.bad").count() == 0, pg.inner_text(".nuty-count"))
            pg.screenshot(path=str(shots / "05-czytanie-akord.png"))

            # other modes stay without notation
            pg.click(".nav-item[data-view=echo]")
            pg.wait_for_timeout(400)
            ok("Echo: no score", pg.locator(".nuty-score").count() == 0)

            # without the engine: the mode says what to do
            pg2 = b.new_page(viewport={"width": 1200, "height": 800})
            pg2.route("**/spartito/engine.js", lambda route: route.fulfill(status=404, body="nope"))
            pg2.goto("http://127.0.0.1:47810/")
            pg2.wait_for_timeout(1200)
            pg2.click(".nav-item.nav-nuty")
            pg2.wait_for_timeout(800)
            ok("no engine: explained", "Brak silnika Spartito" in pg2.inner_text(".nuty-missing") and "spartito_engine.py" in pg2.inner_text(".nuty-missing"))
            b.close()
    finally:
        server.terminate()
        bus.close()
    errors = [e for e in errors if "spartito/engine.js" not in e and "404" not in e]
    print("JS errors:", errors or "none")
    print(f"SUMMARY {sum(results)}/{len(results)} OK")
    if all(results) and not errors:
        print("ALL OK")


if __name__ == "__main__":
    main()
