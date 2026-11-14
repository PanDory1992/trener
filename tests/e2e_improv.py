"""1.14: Improwizacja. The band plays a vamp (drums only); a fake player keeps the left hand on the kick drum
and plays a right-hand note with it. Checks the board, the round, the verdict, the details, the map, the series
counter, the left-hand demo and the home panel.

Run: python3 tests/e2e_improv.py <out-dir>
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-improv")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


class Player(FakeUser):
    """groove: with every kick drum, C below middle C (left) and E above it (right)."""
    def on_play(self, packets):
        super().on_play(packets)
        if self.mode != "groove":
            return
        for p in packets:
            if p[0] == 0x99 and p[1] == 36 and p[2] > 0:
                threading.Timer(0.0, self.hit, (48, 80, 0.15)).start()
                threading.Timer(0.01, self.hit, (64, 70, 0.15)).start()


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules", "trener-dane*.json", "klucz-telefonu.txt", "trener.log"))
    (app_dir / "trener-dane.json").write_text('{"v":1,"settings":{},"modes":{},"cards":[],"days":{}}', encoding="utf-8")
    user = Player()
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

            pg.click("nav >> text=Improwizacja")
            pg.wait_for_timeout(400)
            lad = pg.inner_text(".drill-ladder")
            ok("ladder: both hands from the basics", "burdon w puls" in lad and "jeden dźwięk na takt" in lad and "seria 0/10" in lad, lad.replace("\n", " | "))
            user.set("groove")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_selector(".imp-hands", timeout=5000)
            board = pg.inner_text(".improv-board")
            ok("board: both rules, the vamp", "Burdon w puls" in board and "Jeden dźwięk na takt" in board and "Pętla:" in board and ("C-dur" in board or "a-moll" in board), board.replace("\n", " | "))
            pg.wait_for_timeout(5000)
            ok("live: a bar is lit", pg.locator(".imp-bars .ib.now").count() == 1)
            ok("keys: right-hand notes and the left-hand target lit", pg.locator(".key.marked").count() >= 4, str(pg.locator(".key.marked").count()))
            pg.screenshot(path=str(shots / "i01-round.png"))
            ok("drums only: the band leaves the bass to you", user.statuses and all((s & 0x0F) == 9 for s in user.statuses if s & 0xF0 == 0x90), str(sorted(user.statuses)))
            pg.wait_for_selector(".result .chips", timeout=60000, state="attached")
            user.set("off")
            pg.wait_for_timeout(300)
            st = pg.inner_text(".status-wrap")
            ok("a verdict with one tip", pg.locator(".drill-tip").count() == 1 and ("Lewa" in st or "Obie ręce" in st), st.replace("\n", " | "))
            pg.locator(".drill-detail > summary").click()
            res = pg.inner_text(".result")
            ok("details: both hands, the task, space", all(w in res for w in ("Lewa", "Prawa", "Zadanie", "Przestrzeń")), res.replace("\n", " | ")[:300])
            ok("details: hands apart measured", "Rozjazd rąk" in res, res.replace("\n", " | ")[:400])
            ok("the time map", pg.locator(".imp-map").count() == 1 and pg.locator(".imp-map .hit.lh").count() >= 4 and pg.locator(".imp-map .hit.rh").count() >= 4)
            ok("series counter", "seria 1/10" in pg.inner_text(".drill-ladder"))
            prim = pg.locator(".actions .btn.primary").inner_text()
            ok("next step on the main button", prim in ("Następna runda", "Jeszcze raz", "Łatwiej", "W pełnej wersji"), prim)
            pg.screenshot(path=str(shots / "i02-result.png"), full_page=True)

            # --- the left-hand demo: notes below middle C on Trener's channel, with the drums --------------
            before = len(user.trainer)
            pg.locator(".drill-more > summary").click()
            pg.get_by_role("button", name="Posłuchaj lewej").click()
            pg.wait_for_timeout(9000)   # a bar of count-in at ~60 BPM, then the left hand
            demo = [n for n in user.trainer[before:] if n[1] < 60]
            ok("demo: the left hand plays on Trener's channel 3", 0x92 in user.statuses and len(demo) >= 4 and "Słuchaj lewej" in pg.inner_text(".status-wrap"), f"{sorted(user.statuses)} {len(demo)}")
            pg.locator(".drill-more > summary").click()
            pg.get_by_role("button", name="Stop").click()

            # --- help and home -------------------------------------------------------------------------------
            pg.click("nav >> text=Plan dnia")
            pg.wait_for_timeout(400)
            ok("home: cold start lists Improwizacja", "Improwizacja" in pg.inner_text(".cold-list") if pg.locator(".cold-list").count() else False)
            b.close()
    finally:
        server.terminate()
        server.wait(5)
        bus.close()
    print("JS errors:", "none" if not errors else errors)
    print("ALL OK" if all(results) and not errors else "FAILURES")


main()
