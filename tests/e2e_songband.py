"""Piosenki → "Zespół gra ze mną": the band plays the song right there (drums+bass, or the whole band on 3),
the chord that sounds lights up, Stop is silent, the style is remembered per song, a long song goes in pieces.

Run: python3 tests/e2e_songband.py <out-dir>
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
from e2e import TRENER, FakeUser, UdpBus, pick_style, open_jam_settings  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-songband")
results = []
played = []     # (time, status, note)


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def data():
    return json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read())


def since(t0):
    return [(t, s, n) for (t, s, n) in played if t >= t0]


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log"))
    user = FakeUser()

    def on_play(packets):
        now = time.time()
        for p in packets:
            if p[0] & 0xF0 == 0x90 and p[2] > 0:
                played.append((now, p[0], p[1]))
        user.on_play(packets)
    bus = UdpBus(on_play=on_play)
    user.bus = bus
    bus.state_fn = lambda: {"v": 1, "connected": True, "mode": "sustain", "pedal": 0, "una_corda": False, "touch": "acoustic", "ones": "context", "updated": time.time()}
    bus.start()
    threading.Thread(target=lambda: [(bus.state(bus.state_fn()), time.sleep(1)) for _ in iter(int, 1)], daemon=True).start()
    server = subprocess.Popen([sys.executable, str(app_dir / "trener_serwer.py"), "--no-idle-exit"])
    time.sleep(1.2)
    shots = SCRATCH / "shots"
    shots.mkdir()
    errors = []
    posts = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1440, "height": 900})
            pg.route("https://fonts.googleapis.com/**", fonts)
            pg.route("https://fonts.gstatic.com/**", fonts)
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            pg.on("request", lambda r: "/api/play" in r.url and posts.append(time.time()))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(600)
            pg.locator(".song-pick", has_text="Stand by Me").click()
            pg.wait_for_timeout(400)
            pg.locator(".tempo-field input").fill("160")
            pg.locator(".tempo-field input").dispatch_event("input")

            # --- 1. drums + bass, this section ----------------------------------------------------------------------
            row = pg.locator("#dockbar")
            who = row.locator(".who-seg")
            ok("the play bar asks who plays: Sam / Perkusja i bas / Cały zespół", who.get_by_role("radio").count() == 3 and "Perkusja i bas" in who.inner_text())
            ok("Sam: Pokaż and Graj ze mną in the bar", row.get_by_role("button", name="Graj ze mną").count() == 1 and row.get_by_role("button", name="Pokaż").count() == 1)
            ok("the bar is not on the card any more", pg.locator("#stage .play-row").count() == 0)
            who.get_by_role("radio", name="Perkusja i bas").click()
            pg.wait_for_timeout(300)
            ok("band: style list and both buttons", row.locator(".band-style").count() == 1 and row.get_by_role("button", name="▶ Cała piosenka").count() == 1)
            t0 = time.time()
            row.get_by_role("button", name="▶ Ta część").click()
            pg.wait_for_timeout(3500)
            got = since(t0)
            st = {s for _, s, _ in got}
            ok("Perkusja i bas: drums (10) and bass (2)", 0x99 in st and 0x91 in st, str(sorted(hex(x) for x in st)))
            ok("Perkusja i bas: no keys (3), nothing on your channel 1", 0x92 not in st and 0x90 not in st)
            lit = pg.locator(".sc-ch.band-now")
            ok("the chord that sounds lights up", lit.count() == 1, lit.inner_text() if lit.count() else "")
            status = pg.inner_text(".kstatus")
            ok("status says the band plays and where", "Zespół gra" in status and "Zwrotka" in status, status)
            ok("button turns into Stop", "■ Stop" in row.inner_text())
            pg.screenshot(path=str(shots / "b1-rytm.png"))
            row.get_by_role("button", name="■ Stop").click()
            pg.wait_for_timeout(500)
            t1 = time.time()
            pg.wait_for_timeout(1500)
            ok("Stop: silence", not since(t1), str(len(since(t1))))
            ok("Stop: no chord lit", pg.locator(".sc-ch.band-now").count() == 0)

            # --- 2. the whole band, style remembered per song ---------------------------------------------------------
            row.locator(".who-seg").get_by_role("radio", name="Cały zespół").click()
            pg.wait_for_timeout(300)
            pg.locator(".band-style").select_option("ballada")
            pg.wait_for_timeout(1500)     # the page saves 0.8 s after a change
            meta = data()["modes"]["piosenki"]["meta"]
            ok("style saved for this song", any(isinstance(m, dict) and m.get("style") == "ballada" for m in meta.values()), str(meta)[:200])
            t2 = time.time()
            row.get_by_role("button", name="▶ Cała piosenka").click()
            pg.wait_for_timeout(3500)
            st = {s for _, s, _ in since(t2)}
            ok("Cały zespół: drums, bass and keys on 3", {0x99, 0x91, 0x92} <= st and 0x90 not in st, str(sorted(hex(x) for x in st)))
            pg.screenshot(path=str(shots / "b2-calosc.png"))
            # going back to "Sam" stops the band
            row.locator(".who-seg").get_by_role("radio", name="Sam").click()
            pg.wait_for_timeout(500)
            t4 = time.time()
            pg.wait_for_timeout(1200)
            ok("Sam stops the band", not since(t4) and "■ Stop" not in row.inner_text(), str(len(since(t4))))
            row.locator(".who-seg").get_by_role("radio", name="Cały zespół").click()
            pg.wait_for_timeout(300)

            # --- 3. a long song goes in pieces (the server takes 4000 events per request) -------------------------------
            pg.locator(".song-add").click()
            pg.wait_for_timeout(300)
            text = "\n".join(["[Zwrotka]"] + ["| C Am | F G | Em Am | Dm G |"] * 10 + ["[Refren]"] + ["| F | G | Em | Am |"] * 10)
            pg.locator(".song-title-in").fill("Długa próba")
            pg.locator(".song-text-in").fill(text)
            pg.get_by_role("button", name="Zapisz", exact=True).click()
            pg.wait_for_timeout(600)
            pg.locator(".band-style").select_option("funk")
            pg.wait_for_timeout(300)
            n0 = len(posts)
            t3 = time.time()
            row.get_by_role("button", name="▶ Cała piosenka").click()
            pg.wait_for_timeout(2500)
            ok("80 bars sent in more than one piece", len(posts) - n0 >= 2, f"{len(posts) - n0} requests")
            ok("and it plays", len(since(t3)) > 10, str(len(since(t3))))
            ok("song saved in the data", any(s.get("title") == "Długa próba" for s in data()["songs"]))
            row.get_by_role("button", name="■ Stop").click()
            pg.wait_for_timeout(300)

            # --- 4. phone width: the row wraps, no horizontal scroll -----------------------------------------------------
            pg.set_viewport_size({"width": 390, "height": 844})
            pg.wait_for_timeout(500)
            over = pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            ok("phone: no horizontal overflow", over <= 1, str(over))
            pg.screenshot(path=str(shots / "b3-phone.png"), full_page=True)
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
