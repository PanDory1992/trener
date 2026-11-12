"""Two windows (PC + iMac): settings changed in one survive the other's saves and reach it.

Run: python3 tests/e2e_settings_sync.py <out-dir>
"""
import json
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, FakeUser, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-sync")
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def server_settings():
    return json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read()).get("settings", {})


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log", "CHANGES-*.md"))
    user = FakeUser()
    bus = UdpBus(on_play=user.on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    errors = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pages = []
            for _ in range(2):
                pg = b.new_page(viewport={"width": 1440, "height": 900})
                pg.route("https://fonts.googleapis.com/**", fonts)
                pg.route("https://fonts.gstatic.com/**", fonts)
                pg.on("pageerror", lambda e: errors.append(str(e)))
                pg.goto("http://127.0.0.1:47810/")
                pg.wait_for_timeout(1500)
                pages.append(pg)
            pc, imac = pages

            # the iMac changes the click and the names
            imac.click(".nav-item[data-view=settings]")
            imac.wait_for_timeout(400)
            row = imac.locator(".set-row", has_text="Klik metronomu")
            row.locator("select").first.select_option("ch16")
            row.locator(".click-pads select").nth(0).select_option("5")
            imac.locator(".set-row", has_text="Nazwy dźwięków").locator("select").select_option("h")
            imac.wait_for_timeout(1500)
            s = server_settings()
            ok("saved from the iMac", s.get("clickOut") == "ch16" and s.get("clickSound") == 5 and s.get("hNames") is True, str(s))

            # the PC (opened earlier, old settings in memory) saves progress twice
            pc.evaluate("import('/js/store.js').then((st) => { st.dayRec().notes = (st.dayRec().notes || 0) + 1; return st.save(true); })")
            pc.wait_for_timeout(600)
            s = server_settings()
            ok("the PC's save does not put old settings back", s.get("clickOut") == "ch16" and s.get("clickSound") == 5 and s.get("hNames") is True, str(s))
            cfg = pc.evaluate("import('/js/click.js').then((c) => c.clickConfig())")
            names = pc.evaluate("import('/js/music.js').then((m) => m.prefs.hNames)")
            ok("the PC picked the new settings up from that save", cfg == {"out": "ch16", "sound": 5, "accent": 0} and names is True, f"{cfg} hNames={names}")

            # the PC changes the gain: that change wins, the iMac's click stays
            pc.click(".nav-item[data-view=settings]")
            pc.wait_for_timeout(400)
            ok("the PC's settings page shows the iMac's click", pc.locator(".set-row", has_text="Klik metronomu").locator("select").first.input_value() == "ch16")
            pc.locator(".set-row", has_text="Głośność trenera").locator("input").fill("1.2")
            pc.locator(".set-row", has_text="Głośność trenera").locator("input").dispatch_event("input")
            pc.wait_for_timeout(1500)
            imac.evaluate("import('/js/store.js').then((st) => st.save(true))")
            imac.wait_for_timeout(600)
            s = server_settings()
            ok("newest change per setting wins", s.get("gain") == 1.2 and s.get("clickOut") == "ch16", str(s))
            g = imac.evaluate("import('/js/store.js').then((st) => st.data.settings.gain)")
            ok("the iMac got the PC's gain", g == 1.2, str(g))
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
