"""iPhone test: the server reached over the network with the key, compact layout, landscape + portrait.

Run: python3 tests/e2e_phone.py <out-dir>
"""
import json
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import FONTS, TRENER, FakeUser, UdpBus  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-phone")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("192.168.255.255", 9))
    ip = s.getsockname()[0]
    s.close()
    return ip


def fonts(route):
    url = route.request.url
    if "googleapis" in url:
        css = ""
        for fam, f, w in [("Bricolage Grotesque", "fontsource-variable-bricolage-grotesque-5.1.0/package/files/bricolage-grotesque-latin-ext-wght-normal.woff2", "200 800"),
                          ("Bricolage Grotesque", "fontsource-variable-bricolage-grotesque-5.1.0/package/files/bricolage-grotesque-latin-wght-normal.woff2", "200 800"),
                          ("Atkinson Hyperlegible", "fontsource-atkinson-hyperlegible-5.1.0/package/files/atkinson-hyperlegible-latin-ext-400-normal.woff2", "400"),
                          ("Atkinson Hyperlegible", "fontsource-atkinson-hyperlegible-5.1.0/package/files/atkinson-hyperlegible-latin-400-normal.woff2", "400"),
                          ("Atkinson Hyperlegible", "fontsource-atkinson-hyperlegible-5.1.0/package/files/atkinson-hyperlegible-latin-ext-700-normal.woff2", "700"),
                          ("Atkinson Hyperlegible", "fontsource-atkinson-hyperlegible-5.1.0/package/files/atkinson-hyperlegible-latin-700-normal.woff2", "700")]:
            css += f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(https://fonts.gstatic.com/local/{f})}}\n"
        route.fulfill(body=css, content_type="text/css")
    else:
        rel = url.split("/local/", 1)[1]
        route.fulfill(body=(FONTS / rel).read_bytes(), content_type="font/woff2")


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules", "klucz-telefonu.txt", "trener-dane*.json"))
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
    ip = lan_ip()
    try:
        try:
            urllib.request.urlopen(f"http://{ip}:47810/", timeout=2)
            print("WITHOUT KEY: 200 (bad)")
        except urllib.error.HTTPError as e:
            print("without key:", e.code)
        with sync_playwright() as p:
            b = p.chromium.launch()
            # the PC window: the QR code
            pc = b.new_page(viewport={"width": 1440, "height": 900})
            pc.route("https://fonts.googleapis.com/**", fonts)
            pc.route("https://fonts.gstatic.com/**", fonts)
            pc.on("pageerror", lambda e: errors.append("pc: " + str(e)))
            pc.goto("http://127.0.0.1:47810/")
            pc.wait_for_timeout(1500)
            pc.get_by_role("button", name="Na telefonie").click()
            pc.wait_for_timeout(500)
            pc.screenshot(path=str(shots / "p01-pc-qr.png"))
            url = pc.inner_text(".phone-url code")
            print("qr url:", url.replace(app_dir.as_posix(), ""), "| qr svg:", pc.locator(".qr svg").count())
            url = url.replace(url.split("//")[1].split(":")[0], ip)   # the container's address
            pc.get_by_role("button", name="Gotowe").click()

            dev = dict(p.devices["iPhone 13 Pro Max"])
            land = dict(dev, viewport={"width": dev["viewport"]["height"], "height": dev["viewport"]["width"]})
            ctx = b.new_context(**land)
            ph = ctx.new_page()
            ph.route("https://fonts.googleapis.com/**", fonts)
            ph.route("https://fonts.gstatic.com/**", fonts)
            ph.on("console", lambda m: m.type == "error" and errors.append("phone: " + m.text))
            ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
            ph.goto(url)
            ph.wait_for_timeout(2500)
            print("phone link:", ph.locator("#link").get_attribute("class"), "| compact:", ph.evaluate("document.body.classList.contains('compact')"))
            print("phone keyboard keys:", ph.locator(".key").count(), "| page scroll height vs viewport:", ph.evaluate("[document.documentElement.scrollHeight, innerHeight]"))
            ph.screenshot(path=str(shots / "p02-kolo-landscape.png"))
            ph.locator(".key-pill").tap()
            ph.wait_for_timeout(400)
            ph.screenshot(path=str(shots / "p03-wheel-open.png"))
            ph.locator(".sector.outer[data-key='G']").tap()
            ph.wait_for_timeout(800)
            print("wheel closed after pick:", not ph.locator(".kolo.wheel-open").count(), "| pill:", ph.inner_text(".key-pill").replace("\n", " "))
            ph.get_by_role("button", name="Graj ze mną", exact=True).tap()
            ph.wait_for_timeout(300)
            scale = [55, 57, 59, 60, 62, 64, 66, 67]
            user.seq(scale[:5], gap=0.3)
            ph.wait_for_timeout(400)
            ph.screenshot(path=str(shots / "p04-gama-playing.png"))
            print("done steps:", ph.locator(".gstep.done").count(), "| whatmini:", ph.inner_text("#whatmini"))
            ph.get_by_role("button", name="■ Stop").tap()
            ph.get_by_role("tab", name="Akordy").tap()
            ph.wait_for_timeout(300)
            ph.locator(".fam-card").nth(1).tap()
            ph.wait_for_timeout(400)
            ph.screenshot(path=str(shots / "p05-akordy.png"))
            ph.get_by_role("tab", name="Progresje").tap()
            ph.wait_for_timeout(300)
            ph.screenshot(path=str(shots / "p06-progresje.png"))
            # menu → Jam
            ph.locator(".menu-btn").tap()
            ph.wait_for_timeout(400)
            ph.screenshot(path=str(shots / "p07-menu.png"))
            ph.locator(".rail").get_by_text("Jam", exact=True).tap()
            ph.wait_for_timeout(600)
            ph.screenshot(path=str(shots / "p08-jam.png"))
            ph.locator(".jam-actions").get_by_role("button", name="Start", exact=True).tap()
            ph.wait_for_timeout(4500)
            threading.Thread(target=user.seq, args=([67, 69, 71, 74, 76],), kwargs={"gap": 0.25}).start()
            ph.wait_for_timeout(2000)
            ph.screenshot(path=str(shots / "p09-jam-running.png"))
            print("jam trail:", ph.inner_text(".trail").replace("\n", " "))
            ph.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).tap()
            ph.locator(".jam-set > summary").tap()
            ph.wait_for_timeout(300)
            ph.screenshot(path=str(shots / "p10-jam-settings.png"))
            # portrait
            ph.set_viewport_size(dev["viewport"])
            ph.wait_for_timeout(600)
            ph.locator(".menu-btn").tap()
            ph.locator(".rail").get_by_text("Koło tonacji", exact=True).tap()
            ph.wait_for_timeout(600)
            ph.screenshot(path=str(shots / "p11-kolo-portrait.png"))
            print("portrait keys:", ph.locator(".key").count())
            vid = ph.evaluate("(() => { const v = document.querySelector('video'); return v ? [v.src.split('/').pop(), v.paused] : null })()")
            print("keep-awake video:", vid)
            ctx.close()
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")


if __name__ == "__main__":
    main()
