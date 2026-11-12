"""Ustawienia → Klik metronomu: the click moves from the piano (C7) to channel 16, pad and accent as chosen.

Run: python3 tests/e2e_click.py <out-dir>
"""
import json
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, FakeUser, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-click")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log", "CHANGES-*.md"))
    user = FakeUser()
    played = []
    orig = user.on_play

    def on_play(packets):
        for p in packets:
            if p[0] & 0xF0 == 0x90 and p[2] > 0:
                played.append((time.time(), p[0], p[1], p[2]))
        orig(packets)
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

            # 1. default: the click is the piano's high C
            pg.screenshot(path=str(SCRATCH / "start.png"))
            pg.get_by_role("tab", name="Gama", exact=True).click()
            pg.get_by_role("radio", name="W tempie").click()
            played.clear()
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(3000)
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            piano_clicks = [x for x in played if x[1] == 0x90 and x[2] == 96]
            ok("default click on the piano (C7)", len(piano_clicks) >= 2 and not any(x[1] == 0x9F for x in played), f"{len(piano_clicks)} clicks")

            # 2. settings: channel 16, pad 3, accent on pad 8
            pg.click(".nav-item[data-view=settings]")
            pg.wait_for_timeout(400)
            ok("pad choice hidden while on the piano", not pg.locator(".click-pads").is_visible())
            row = pg.locator(".set-row", has_text="Klik metronomu")
            row.locator("select").first.select_option("ch16")
            ok("pad choice shown for channel 16", pg.locator(".click-pads").is_visible())
            row.locator(".click-pads select").nth(0).select_option("3")
            row.locator(".click-pads select").nth(1).select_option("8")
            played.clear()
            row.get_by_role("button", name="Posłuchaj").click()
            pg.wait_for_timeout(5600)
            notes = [(x[1], x[2]) for x in played]
            ok("Posłuchaj: 8 clicks on channel 16, bar starts on pad 8 (G1)", len(notes) == 8 and notes[0] == (0x9F, 43) and notes[1] == (0x9F, 38) and notes[4] == (0x9F, 43), str(notes))
            pg.wait_for_timeout(2500)
            s = json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read())["settings"]
            ok("saved", s.get("clickOut") == "ch16" and s.get("clickSound") == 3 and s.get("clickAccent") == 8, str({k: s.get(k) for k in ("clickOut", "clickSound", "clickAccent")}))
            pg.screenshot(path=str(SCRATCH / "settings.png"))

            # 3. guide W tempie now clicks on channel 16; no click key lights up on the keyboard
            pg.click(".nav-item[data-view=kolo]")
            pg.wait_for_timeout(600)
            played.clear()
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(1200)
            lit = pg.evaluate("[...document.querySelectorAll('.key')].filter((k) => +k.dataset.note >= 36 && +k.dataset.note <= 43 && k.className.includes('trainer')).length")
            pg.wait_for_timeout(1800)
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            ch16 = [x for x in played if x[1] == 0x9F]
            ok("W tempie clicks on channel 16, piano C7 silent", len(ch16) >= 2 and not any(x[1] == 0x90 and x[2] == 96 for x in played), f"{len(ch16)} clicks")
            ok("click pads do not light keys", lit == 0, f"lit={lit}")

            # 4. reload: the setting is applied at start
            pg.reload()
            pg.wait_for_timeout(1500)
            played.clear()
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(2500)
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            ok("after reload still channel 16", any(x[1] == 0x9F for x in played) and not any(x[1] == 0x90 and x[2] == 96 for x in played))
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
