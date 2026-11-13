"""Pedal coach and the weekly dynamics card (13.11): a chord change with the pedal held shows "rozmazane" in
"Co ja gram?", a change made right after the chord shows "czysta zmiana"; Plan dnia shows the week from the
router's note files and the pedal today.

Run: python3 tests/e2e_pedal.py <out-dir>
"""
import datetime
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-pedal")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log"))
    notes = SCRATCH / "CodexPedalModes" / "notes"
    notes.mkdir()
    y, w, _ = datetime.date.today().isocalendar()
    t0 = time.time() - 3600
    lines = []
    for i in range(600):
        note = 45 if i % 3 == 0 else 69 + i % 5
        v = 30 + (i * 13) % 80
        lines.append(f"{t0 + i * 0.3:.4f},on,{note},{v},{v},0.0\n")
    (notes / f"notes-{y}-W{w:02d}.csv").write_text("".join(lines), encoding="ascii")
    bus = UdpBus()
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    errors = []

    def chord(notes_):
        for n in notes_:
            bus.note(True, n, 80, 80, 0)
        time.sleep(0.3)
        for n in notes_:
            bus.note(False, n, 0, 0, 0)

    def pedal(down):
        bus.pedal("sustain", 64, 127 if down else 0)

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
            # blur: pedal held from C into F
            pedal(True); time.sleep(0.1)
            chord([48, 64, 67]); time.sleep(0.8)
            chord([53, 65, 69])
            pg.wait_for_selector(".wp-pedal.blur", timeout=3000)
            ok("blur shown", "rozmazane" in pg.inner_text(".wp-pedal"))
            pg.screenshot(path=str(SCRATCH / "pedal-blur.png"))
            # good: change right after the G chord
            time.sleep(0.5)
            for n in [55, 62, 71]:
                bus.note(True, n, 80, 80, 0)
            time.sleep(0.12); pedal(False); time.sleep(0.15); pedal(True)
            pg.wait_for_selector(".wp-pedal.good", timeout=3000)
            ok("good shown", "czysta" in pg.inner_text(".wp-pedal"))
            for n in [55, 62, 71]:
                bus.note(False, n, 0, 0, 0)
            pedal(False)
            pg.wait_for_timeout(500)
            pg.click("nav >> text=Plan dnia")
            pg.wait_for_timeout(800)
            home = pg.inner_text(".home")
            ok("week card", "Twoja dynamika w tym tygodniu" in home and "Zakres" in home and "Zadanie" in home, home[-600:].replace("\n", " | "))
            ok("pedal today", "Pedał dziś" in home and "50%" in home)
            ok("dyn bar", pg.locator(".dynbar i").count() == 8)
            pg.locator(".week-dyn").screenshot(path=str(SCRATCH / "pedal-week.png"))
            b.close()
    finally:
        server.terminate()
        server.wait(5)
        bus.close()
    print("JS errors:", "none" if not errors else errors)
    print("ALL OK" if all(results) and not errors else "FAILURES")


main()
