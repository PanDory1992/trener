"""Pętla (loop) test: fake router + fake pianist + real server + browser.

Run: python3 tests/e2e_loop.py <out-dir>
"""
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
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)
            pg.keyboard.press("l")
            pg.click("nav >> text=Nuty docelowe")
            pg.wait_for_timeout(400)
            pg.get_by_role("button", name="Start", exact=True).click()
            reached = None
            for _ in range(400):
                pg.wait_for_timeout(500)
                st = pg.inner_text(".status-wrap")
                if "Chorus 6" in st:
                    reached = st
                    break
            print("OK " if reached else "BAD", "chorus 6 reached:", reached, "| score:", pg.inner_text(".score-row").replace("\n", " "))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(800)
            cards = pg.locator(".chorus-cards .cc").count()
            print("OK " if cards >= 5 else "BAD", "results after stop:", cards, "choruses")
            t = time.time()
            pg.wait_for_timeout(1500)
            with user.lock:
                after = [x for x in user.trainer if x[0] >= t]
            print("OK " if not after else "BAD", "silent after stop", len(after))
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")


if __name__ == "__main__":
    main()
