"""1.10: the exercises on the common frame (drill.js / drillui.js): ladder, series, verdict with one tip, the error loop.

Run: python3 tests/e2e_drill.py <out-dir>
"""
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, UdpBus, FakeUser, CLICKS  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-drill")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


class User(FakeUser):
    """echo-wrong: plays the motif back with the 3rd note a semitone up."""
    def loop(self):
        while True:
            time.sleep(0.05)
            if self.mode not in ("echo", "echo-wrong", "melody", "chord"):
                continue
            with self.lock:
                fresh = self.trainer[self.replayed_upto:]
                quiet = time.time() - self.last > 0.9
            if not fresh or not quiet:
                continue
            with self.lock:
                self.replayed_upto = len(self.trainer)
            notes = [n for n in fresh if n[1] not in CLICKS]
            if self.mode == "melody":
                times = [n[0] for n in notes]
                notes = [n for n in notes if sum(abs(t - n[0]) < 0.02 for t in times) == 1]
            if not notes:
                continue
            t0 = notes[0][0]
            start = time.time() + 0.2
            for i, (t, note, vel) in enumerate(notes):
                delay = start + (t - t0) - time.time()
                if delay > 0:
                    time.sleep(delay)
                if self.mode == "echo-wrong" and i == 2:
                    note += 1
                self.hit(note, vel, 0.6 if self.mode == "chord" else 0.2)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules", "trener-dane*.json", "klucz-telefonu.txt", "trener.log"))
    # an old record (one level) for echo: the axes must start from it
    # ... and a rewanż from an earlier day (1.11)
    debt = '{"item":{"kind":"motif","level":2,"scale":"major","rootPc":0,"tempo":74,"notes":[{"p":60,"dur":1,"v":76},{"p":62,"dur":1,"v":76},{"p":64,"dur":1,"v":76},{"p":62,"dur":1,"v":76}],"withDynamics":false,"flat":false,"focus":"all","hand":"right","tested":["melodia","rytm"]},"day":"2020-01-01","tries":0}'
    (app_dir / "trener-dane.json").write_text('{"v":1,"settings":{},"modes":{"echo":{"level":3,"hist":[],"lastDay":null,"best":3,"debts":[' + debt + ']}},"cards":[],"days":{"' + __import__("datetime").date.today().isoformat() + '":{"series":[{"id":"akordy","n":10,"ok":8,"avg":85,"at":1}]}}}', encoding="utf-8")
    user = User()
    bus = UdpBus(on_play=user.on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    threading.Thread(target=user.loop, daemon=True).start()
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

            # --- Echo ----------------------------------------------------------------------------------------
            user.set("echo")
            pg.click("nav >> text=Echo")
            pg.wait_for_timeout(400)
            lad = pg.inner_text(".drill-ladder")
            ok("echo ladder from the old level 3", "TERAZ" in lad.upper() and "3 sąsiednie dźwięki" in lad and "poziom 3,0" in lad and "seria 0/10" in lad, lad.replace("\n", " | "))
            ok("about open the first time", pg.locator(".drill-about[open]").count() == 1)
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(300)
            ok("rewanż first", "Rewanż" in pg.inner_text(".status-wrap"), pg.inner_text(".status-wrap"))
            pg.wait_for_selector(".result .chips", timeout=20000, state="attached")
            pg.wait_for_timeout(300)
            st = pg.inner_text(".status-wrap")
            ok("echo passes with a line of praise", "Jest!" in st and pg.locator(".drill-tip").count() == 1, st.replace("\n", " | "))
            ok("no self-assessment", pg.locator(".self-ask").count() == 0 and "Jak poszło?" not in st)
            ok("a rewanż is not the cold start", "Zimny start dziś" not in st)
            ok("details folded", pg.locator(".drill-detail[open]").count() == 0 and pg.locator(".drill-detail").count() == 1)
            pg.locator(".drill-detail > summary").click()
            ok("details open on click", pg.locator(".result .chips").is_visible())
            ok("series counter", "seria 1/10" in pg.inner_text(".drill-ladder"))
            ok("level change named per axis", "Melodia 3,0 → 3,3" in pg.inner_text(".result"), pg.inner_text(".level-change") if pg.locator(".level-change").count() else "")
            pg.screenshot(path=str(shots / "d01-echo-pass.png"))
            # a wrong note: the tip names it, then the same motif again
            user.set("echo-wrong")
            pg.wait_for_function("document.querySelector('.status-wrap').innerText.includes('Prawie')", timeout=25000)
            tip = pg.inner_text(".drill-tip")
            ok("wrong note: tip names the 3rd note", tip.startswith("3. dźwięk"), tip)
            pg.screenshot(path=str(shots / "d02-echo-wrong.png"))
            pg.wait_for_function("document.querySelector('.status-wrap').innerText.includes('Jeszcze raz ten sam')", timeout=8000)
            ok("error loop: the same again", True)
            user.set("echo")
            pg.wait_for_function("document.querySelector('.status-wrap').innerText.includes('Jest!')", timeout=25000)
            ok("retry counts no level", "seria 2/10" in pg.inner_text(".drill-ladder"), pg.inner_text(".dl-meta"))
            # "Najpierw zaśpiewaj": a silence to sing in before your turn
            user.set("off")
            pg.keyboard.press("p")
            pg.wait_for_timeout(300)
            pg.locator(".drill-opts label", has_text="Najpierw zaśpiewaj").locator("input").check()
            pg.get_by_role("button", name="Następne", exact=True).click()
            pg.wait_for_function("document.querySelector('.status-wrap').innerText.includes('Zaśpiewaj')", timeout=15000)
            ok("sing first", True)
            pg.keyboard.press("p")
            pg.locator(".drill-opts label", has_text="Najpierw zaśpiewaj").locator("input").uncheck()
            # options: the left hand and the rhythm focus
            pg.locator(".drill-opts button", has_text="Lewa").click()
            pg.locator(".drill-opts button", has_text="Rytm").click()
            ok("focus narrows the ladder", pg.locator(".dl-now .dl-ax").count() == 1)
            user.set("off")
            pg.locator(".drill-more > summary").click()
            ok("more menu", pg.get_by_role("button", name="Dodaj do fiszek", exact=True).is_visible())
            pg.keyboard.press("Escape")

            # --- Echo dynamiki ------------------------------------------------------------------------------
            user.set("echo")
            pg.click("nav >> text=Echo dynamiki")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_selector(".dyn-live svg", timeout=5000)
            ok("dynamics: live chart while you play", pg.locator(".dyn-live svg .curve-want").count() == 0)
            pg.wait_for_selector(".result .chips", timeout=25000, state="attached")
            st = pg.inner_text(".status-wrap")
            ok("dynamics: verdict + tip", "Kształt złapany" in st and pg.locator(".drill-tip").count() == 1, st.replace("\n", " | "))
            ok("dynamics: series 1/10", "seria 1/10" in pg.inner_text(".drill-ladder"))
            pg.screenshot(path=str(shots / "d03-dyn.png"))
            user.set("off")
            pg.keyboard.press("p")

            # --- Ze słuchu ---------------------------------------------------------------------------------
            user.set("melody")
            pg.click("nav >> text=Ze słuchu")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_function("document.querySelector('.status-wrap').innerText.includes('Znalezione')", timeout=20000)
            ok("ear: found, series 1/10", "seria 1/10" in pg.inner_text(".drill-ladder"), pg.inner_text(".dl-meta"))
            user.set("off")
            pg.keyboard.press("p")
            pg.screenshot(path=str(shots / "d04-ucho.png"))

            # --- Siłownia: ten chords (each heard first) → the series summary ------------------------------
            user.set("chord")
            pg.click("nav >> text=Siłownia akordów")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(400)
            ok("chords: a real progression by default", pg.locator(".prog-about").count() == 1 and " z " in pg.inner_text(".prog-name"), pg.inner_text(".chord-board").replace("\n", " | "))
            pg.screenshot(path=str(shots / "d04-akordy-bank.png"))
            # 1.13.1: one counted attempt per progression (both passes), not per chord
            done = False
            for k in range(30):
                pg.get_by_role("button", name="Posłuchaj", exact=True).click()
                pg.wait_for_timeout(3300)
                if "seria 1/10" in pg.inner_text(".drill-ladder"):
                    done = True
                    break
            ok("chords: the whole progression counts once", done and k >= 5, f"chords played: {k + 1}")
            pg.screenshot(path=str(shots / "d05-akordy-summary.png"))
            ok("chords: 'Dowolny przewrót' switch", pg.locator("label.check", has_text="Dowolny przewrót").count() == 1)
            # --- Przewroty: the bottom note said plainly, and the mode plays through ------------------------
            pg.locator(".drill-opts select").first.select_option("inv")
            pg.wait_for_timeout(400)
            board = pg.inner_text(".chord-board")
            ok("inversions: the mode starts at the basics", "Przewroty" in board and "Wspinaczka" in board, board.replace("\n", " | "))
            for k in range(2):
                pg.get_by_role("button", name="Posłuchaj", exact=True).click()
                pg.wait_for_timeout(3300)
            board = pg.inner_text(".chord-board")
            ok("inversions: 'Na dole' and the inversion said", "Na dole:" in board and "przewrót" in board, board.replace("\n", " | "))
            pg.screenshot(path=str(shots / "d05b-przewroty.png"))
            pg.locator(".drill-opts select").first.select_option("real")
            user.set("off")

            # --- Nuty docelowe: chord tones on the keys -------------------------------------------------------
            pg.click("nav >> text=Nuty docelowe")
            pg.locator(".drill-opts input[type=checkbox]").check()
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(5000)
            ok("targets: chord tones marked", pg.locator(".keyboard .marked").count() >= 3, str(pg.locator(".keyboard .marked").count()))
            ok("targets: primary is Stop while playing", pg.get_by_role("button", name="■ Stop", exact=True).count() == 1)
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- Aksak: mirror the bass; the drift chart ------------------------------------------------------
            user.set("mirror")
            pg.click("nav >> text=Aksak")
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_selector(".result .chips", timeout=30000, state="attached")
            ok("aksak: drift chart", pg.locator(".drift svg").count() == 1)
            ok("aksak: the next step on the main button", pg.locator(".dockbar .btn.primary").inner_text() in ("Następna runda", "Jeszcze raz", "Wolniej", "W tempie"), pg.locator(".dockbar .btn.primary").inner_text())
            pg.screenshot(path=str(shots / "d06-aksak.png"))
            user.set("off")

            # --- Ustawienia: latency measured there ----------------------------------------------------------
            pg.click(".rail-foot >> text=Ustawienia")
            pg.get_by_role("button", name="Zmierz", exact=True).click()
            def tapper():
                time.sleep(0.25 + 0.6 * 2 + 0.04)
                for k in range(7):
                    user.hit(60, 80, 0.05)
                    time.sleep(0.6)
            threading.Thread(target=tapper, daemon=True).start()
            pg.wait_for_function("document.querySelector('.lat-msg').innerText.includes('Zapisane')", timeout=12000)
            ok("latency measured in settings", "ms" in pg.inner_text(".lat-msg"), pg.inner_text(".lat-msg"))

            # --- Plan dnia: today's series -------------------------------------------------------------------
            pg.click("nav >> text=Plan dnia")
            pg.wait_for_timeout(400)
            ok("home: series today", "Serie dziś" in pg.inner_text(".home") and "Siłownia akordów" in pg.inner_text(".series-list"))
            ok("home: cold start", "Zimny start" in pg.inner_text(".home") and "Echo" in pg.inner_text(".cold-list"), pg.inner_text(".cold-list") if pg.locator(".cold-list").count() else "")
            pg.screenshot(path=str(shots / "d07-home.png"), full_page=True)
            b.close()
    finally:
        server.terminate()
        server.wait(5)
        bus.close()
    print("JS errors:", "none" if not errors else errors)
    print("ALL OK" if all(results) and not errors else "FAILURES")


main()
