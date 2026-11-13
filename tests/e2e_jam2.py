"""Jam variety: a song with half-bar chords, drum fills and a crash every 4 laps, the band following your dynamics,
the new grooves start.

Run: python3 tests/e2e_jam2.py <out-dir>
"""
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, FakeUser, UdpBus, pick_style, open_jam_settings  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-jam2")
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
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            # --- a song with half-bar chords into the Jam ------------------------------------------------------
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(400)
            pg.locator(".song-pick", has_text="Hit the Road").click()
            pg.locator(".song-steps .door", has_text="Jamie").click()
            pg.wait_for_timeout(600)
            pg.locator("label:has-text('Perkusja i bas') input").check()
            pg.wait_for_timeout(200)
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            # two chords per bar: the board shows Am then G within one bar (96 BPM → bar 2.5 s)
            names = []
            t_end = time.time() + 6
            while time.time() < t_end:
                n = pg.evaluate("(() => { const x = document.querySelector('.jb-chord.now .jb-name, .jb-now .jb-name, .jb-chord.now b'); return x ? x.innerText : '' })()")
                if n and (not names or names[-1] != n):
                    names.append(n)
                time.sleep(0.05)
            ok("half-bar chords change twice per bar", len(names) >= 3, str(names))

            # --- dynamics: soft, then loud ---------------------------------------------------------------------------
            def band_vel(t0, t1):
                with lock:
                    v = [x[3] for x in played if t0 <= x[0] < t1 and x[1] == 9 and x[2] in (36, 38)]
                return sum(v) / len(v) if v else 0
            for _ in range(8):
                user.hit(64, 30, 0.1)
                time.sleep(0.3)
            time.sleep(5.5)          # the next lap is scheduled with the soft average
            ts = time.time()
            time.sleep(2.4)
            soft = band_vel(ts, time.time())
            for _ in range(8):
                user.hit(64, 118, 0.1)
                time.sleep(0.3)
            time.sleep(5.5)
            tl = time.time()
            time.sleep(2.4)
            loud = band_vel(tl, time.time())
            ok("the band plays louder when you do", loud > soft * 1.2, f"soft={soft:.0f} loud={loud:.0f}")

            # --- fills and a crash within 4–5 laps -------------------------------------------------------------------
            time.sleep(8)
            with lock:
                toms = [x for x in played if x[1] == 9 and x[2] in (50, 48, 47, 45, 43)]
                crash = [x for x in played if x[1] == 9 and x[2] == 49]
            ok("drum fill came", len(toms) >= 4, f"tom hits={len(toms)}")
            ok("crash on the new part", len(crash) >= 1, f"crash={len(crash)}")
            pg.screenshot(path=str(SCRATCH / "j1-song.png"))
            pg.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- the new grooves start and play drums --------------------------------------------------------------
            for name in ["Bałkany 9/8", "Čoček", "Slow blues 12/8", "Rock half-time"]:
                pick_style(pg, name)
                with lock:
                    n0 = len(played)
                pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
                pg.wait_for_timeout(8000 if "Slow" in name else 3500)   # slow blues: the count-in bar alone is 4 s
                with lock:
                    drums = [x for x in played[n0:] if x[1] == 9]
                ok(f"{name} plays", len(drums) > 5, f"drum hits={len(drums)}")
                pg.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()
                pg.wait_for_timeout(300)
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
