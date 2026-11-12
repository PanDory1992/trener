"""Trener 1.8: 33 styles in groups, the drummer's 4 levels. (Boilerplate from e2e_editor.)

Old docstring: the progression editor (like Chord Suggester), the band from editor steps (slash bass, rest,
section, modulation, arpeggio), a jam saved as a song, and "Co ja gram?" with full names and the pedal.

Run: python3 tests/e2e_editor.py <out-dir>
"""
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, FakeUser, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-drummer")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log"))
    user = FakeUser()
    played = []
    lock = threading.Lock()

    def on_play(packets):
        now = time.time()
        with lock:
            for p in packets:
                if p[0] & 0xF0 == 0x90 and p[2] > 0:
                    played.append((now, p[0] & 15, p[1], p[2]))
        user.on_play(packets)

    bus = UdpBus(on_play=on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.route("https://fonts.googleapis.com/**", fonts)
            pg.route("https://fonts.gstatic.com/**", fonts)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            pg.on("dialog", lambda d: d.accept("Mój test jam") if d.type == "prompt" else d.accept())
            downloads = []
            pg.on("download", lambda d: downloads.append(d))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(600)
            groups = pg.locator(".groove-group").all_inner_texts()
            ok("three style groups", len(groups) == 3, str(groups))
            ok("33 style cards", pg.locator(".groove-grid .groove").count() >= 33, str(pg.locator(".groove-grid .groove").count()))
            pg.locator(".groove", has_text="Half-time shuffle").click()
            pg.wait_for_timeout(200)
            pg.locator("label:has-text('Zespół (perkusja') input").check()
            pg.wait_for_timeout(200)
            seg = pg.locator(".jc", has_text="Perkusista")
            ok("drummer control shows 4 levels", seg.get_by_role("radio").count() == 4)
            ok("default level 3", seg.get_by_role("radio", name="3. Z życiem").get_attribute("aria-checked") == "true")
            pg.screenshot(path=str(SCRATCH / "d1-styles.png"), full_page=True)
            res = {}
            for lv, name in [(1, "1. Prosto"), (4, "4. Bogato")]:
                seg = pg.locator(".jc", has_text="Perkusista")
                seg.get_by_role("radio", name=name).click()
                pg.wait_for_timeout(200)
                with lock:
                    n0 = len(played)
                pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
                pg.wait_for_timeout(9000)
                pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
                pg.wait_for_timeout(400)
                with lock:
                    drums = [x for x in played[n0:] if x[1] == 9]
                res[lv] = drums
            g1 = sum(1 for x in res[1] if x[2] == 38 and x[3] < 50)
            g4 = sum(1 for x in res[4] if x[2] == 38 and x[3] < 50)
            ok("level 1: no ghost notes on the snare", g1 == 0, f"ghosts={g1}")
            ok("level 4: ghost notes and more hits", g4 > 0 and len(res[4]) > len(res[1]) * 0.9, f"ghosts={g4} hits {len(res[1])} → {len(res[4])}")
            vel4 = {x[3] for x in res[4] if x[2] == 42}
            ok("level 4: hi-hat velocities vary", len(vel4) >= 5, str(sorted(vel4))[:80])
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
