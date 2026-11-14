"""Pętla (loop) test: fake router + fake pianist + real server + browser.

Run: python3 tests/e2e_loop.py <out-dir>
"""
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import CLICKS, TRENER, FakeUser, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-loop")


def notes_since(user, t):
    with user.lock:
        return [n for n in user.trainer if n[0] >= t and n[1] not in CLICKS]


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log"))
    user = FakeUser()
    bus = UdpBus(on_play=user.on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False,
                            "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    threading.Thread(target=user.loop, daemon=True).start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    shots = SCRATCH / "shots"
    shots.mkdir()
    errors = []
    ok = lambda name, cond, extra="": print(f"{'OK ' if cond else 'BAD'} {name} {extra}")
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.route("https://fonts.googleapis.com/**", fonts)
            pg.route("https://fonts.gstatic.com/**", fonts)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            # the switch: dock button and L key share the state
            pg.keyboard.press("l")
            pg.wait_for_timeout(200)
            ok("L turns loop on", pg.locator(".loop-dock.on").count() == 1 and pg.locator(".loop-chip.on").count() == 1)
            pg.screenshot(path=str(shots / "l01-kolo-loop-on.png"))

            # --- Koło: Pokaż in a loop (pentatonic, fast) --------------------------------------
            pg.get_by_role("tab", name="Pentatoniki i blues").click(); pg.get_by_role("button", name=re.compile(r"^penta dur")).click()
            pg.locator(".tempo-field input").fill("140")
            t = time.time()
            pg.get_by_role("button", name="Pokaż", exact=True).click()
            # count-in 4 beats (1.7 s) + 11 steps (12 beats, 5.1 s) per pass
            pg.wait_for_timeout(13500)
            n = notes_since(user, t)
            status = pg.inner_text(".kstatus")
            ok("Pokaż repeats", len(n) >= 22, f"notes={len(n)} status='{status}'")
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            t = time.time()
            pg.wait_for_timeout(1500)
            ok("Stop silences the loop", len(notes_since(user, t)) == 0)

            # --- Koło: Prowadzę loops back to the start ------------------------------------------------
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(300)
            penta = [60, 62, 64, 67, 69, 72]
            user.seq(penta + penta[-2::-1], gap=0.25)
            pg.wait_for_timeout(200)
            st1 = pg.inner_text(".kstatus")
            pg.wait_for_timeout(1200)
            now_step = pg.locator(".gstep.now").count()
            ok("Prowadzę restarts", "Pętla" in st1 and now_step == 1, f"status='{st1}' now={now_step}")
            user.seq(penta[:3], gap=0.25)
            pg.wait_for_timeout(200)
            ok("second round counts", pg.locator(".gstep.done").count() == 3, f"done={pg.locator('.gstep.done').count()}")
            pg.get_by_role("button", name="■ Stop", exact=True).click()

            # --- Koło: W tempie loops ---------------------------------------------------------------------
            pg.get_by_role("radio", name="W tempie").click()
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(13500)
            st = pg.inner_text(".kstatus")
            ok("W tempie repeats", any(f"Pętla {n}" in st or f"Pętla: {n}" in st for n in (2, 3, 4)), f"status='{st}'")
            pg.screenshot(path=str(shots / "l02-tempo-loop.png"))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.get_by_role("radio", name="Prowadzę").click()
            pg.get_by_role("tab", name=re.compile("Podstawowe")).click(); pg.get_by_role("button", name=re.compile(r"^dur(\s|$)")).first.click()

            # --- Echo: the motif repeats until you play --------------------------------------------------
            pg.click("nav >> text=Echo")
            pg.wait_for_timeout(400)
            t = time.time()
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(7000)
            n = notes_since(user, t)
            motif_len = len(pg.locator(".nchip").all()) or None
            first = [x[1] for x in n]
            ok("Echo repeats", len(n) >= 4, f"notes={len(n)} {first[:12]}")
            pg.screenshot(path=str(shots / "l03-echo-loop.png"))
            user.hit(first[0], 80, 0.2)
            t = time.time()
            pg.wait_for_timeout(2500)
            ok("your note stops the echo loop", len(notes_since(user, t)) == 0, f"after={len(notes_since(user, t))}")
            pg.keyboard.press("p")

            # --- Ze słuchu: melody repeats until you play -------------------------------------------------
            pg.click("nav >> text=Ze słuchu")
            pg.wait_for_timeout(400)
            t = time.time()
            pg.get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(9000)
            n = notes_since(user, t)
            ok("Ucho repeats", len(n) >= 6, f"notes={len(n)}")
            user.hit(60, 80, 0.2)
            t = time.time()
            pg.wait_for_timeout(2500)
            ok("your note stops the ucho loop", len(notes_since(user, t)) == 0)
            pg.keyboard.press("p")

            # --- Siłownia: chord repeats ------------------------------------------------------------------
            pg.click("nav >> text=Siłownia akordów")
            pg.wait_for_timeout(500)
            t = time.time()
            pg.keyboard.press("r")
            pg.wait_for_timeout(5000)
            n = notes_since(user, t)
            ok("chord repeats", len(n) >= 6, f"notes={len(n)}")
            user.hit(40, 80, 0.2)
            t = time.time()
            pg.wait_for_timeout(2500)
            ok("your note stops the chord loop", len(notes_since(user, t)) == 0)

            # --- Aksak: rounds follow each other -----------------------------------------------------------
            pg.click("nav >> text=Aksak")
            pg.wait_for_timeout(400)
            pg.get_by_role("button", name="Start", exact=True).click()
            seen = False
            for _ in range(60):
                pg.wait_for_timeout(500)
                if "Pętla: kolejna runda" in pg.inner_text(".status-wrap") or pg.locator(".result .chip").count():
                    seen = True
                    break
            pg.wait_for_timeout(1500)
            st = pg.inner_text(".status-wrap")
            t = time.time()
            pg.wait_for_timeout(1500)
            still = len(notes_since(user, t)) > 0 or any(n for n in user.trainer if n[0] >= t)
            ok("Aksak continues into round 2", seen and still, f"status='{st}' results={pg.locator('.result .chip').count()}")
            pg.screenshot(path=str(shots / "l04-aksak-loop.png"))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            t = time.time()
            pg.wait_for_timeout(1500)
            with user.lock:
                after = [x for x in user.trainer if x[0] >= t]
            ok("Aksak Stop silences", not after, f"after={len(after)}")

            # --- loop off: Pokaż plays once ------------------------------------------------------------------
            pg.keyboard.press("l")
            pg.click("nav >> text=Koło tonacji")
            pg.wait_for_timeout(400)
            pg.get_by_role("tab", name="Pentatoniki i blues").click(); pg.get_by_role("button", name=re.compile(r"^penta dur")).click()
            pg.locator(".tempo-field input").fill("140")
            t = time.time()
            pg.get_by_role("button", name="Pokaż", exact=True).click()
            pg.wait_for_timeout(9500)
            n = notes_since(user, t)
            ok("loop off: one pass", 10 <= len(n) <= 12 and pg.locator(".loop-dock.on").count() == 0, f"notes={len(n)}")

            # phone: the mini switch
            pg.set_viewport_size({"width": 926, "height": 428})
            pg.wait_for_timeout(400)
            pg.locator(".loop-mini").click()
            ok("phone switch", pg.locator(".loop-mini.on").count() == 1)
            pg.screenshot(path=str(shots / "l05-phone.png"))
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")


if __name__ == "__main__":
    main()
