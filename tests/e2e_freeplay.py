"""Free play counts, Gama walks through keys (po kole / pół tonu), Jam a semitone up, new-version banner.

Run: python3 tests/e2e_freeplay.py <out-dir>
"""
import json
import os
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-freeplay")
DUR = [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def pc_of(name):
    p = PC[name[0]]
    for ch in name[1:]:
        p += {"♯": 1, "♭": -1, "𝄪": 2, "𝄫": -2}.get(ch, 0)
    return p % 12


def tonic_rh(pc):
    return 60 + pc - (12 if pc > 6 else 0)


def data():
    return json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read())


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
            toasts = lambda: pg.inner_text(".toasts") if pg.locator(".toasts").count() else ""

            def run(notes, step=0.6, jitter=None):
                for i, n in enumerate(notes):
                    user.hit(n, 75, 0.1)
                    time.sleep(step + (jitter(i) if jitter else 0))

            # --- 1. free play -----------------------------------------------------------------------------
            run([60 + x for x in DUR])
            pg.wait_for_timeout(700)
            t = toasts()
            ok("free C major recognised", "Rozpoznałem" in t and "od C" in t, t.replace("\n", " | ")[:200])
            r = data().get("mastery", {}).get("major0|gama|dur|rh", {})
            ok("steady with the scale lit = in tempo, lights on screen (not umiem material)", r.get("stage") == 2 and r.get("cleanRun") == 0 and abs(r.get("best", 0) - 100) <= 3, str(r))
            m = pg.inner_text(".mastery")
            ok("progress line updated", m.startswith("w tempie"), m.replace("\n", " ")[:80])
            pg.screenshot(path=str(shots / "f1-free-c.png"))
            time.sleep(1.5)
            run([62 + x for x in DUR], step=0.5)   # D major, other key: no lights for it on screen
            pg.wait_for_timeout(700)
            r = data()["mastery"].get("major2|gama|dur|rh", {})
            ok("free D major in another key counts without lights", r.get("stage") == 2 and r.get("cleanRun") == 1 and r.get("fade") == 1, str(r))
            ok("wheel map shows D", pg.locator(".sector.outer[data-key='D'] .prog-arc").count() == 1)
            time.sleep(1.5)
            run([55 + x for x in DUR], step=0.45, jitter=lambda i: 0.4 if i % 4 == 1 else 0)   # G, uneven
            pg.wait_for_timeout(700)
            r = data()["mastery"].get("major1|gama|dur|rh", {})
            ok("uneven G major = whole, not in tempo", r.get("stage") == 1, str(r))
            time.sleep(1.5)
            notes = [60 + x for x in DUR]
            notes.insert(6, 61)
            run(notes)
            pg.wait_for_timeout(500)
            r = data()["mastery"].get("major0|gama|dur|rh", {})
            ok("a wrong note: not counted", r.get("passes") == 1, str(r))
            time.sleep(1.5)
            # both hands in octaves
            for x in DUR:
                user.hit(48 + x, 75, 0.1)
                time.sleep(0.015)
                user.hit(60 + x, 75, 0.1)
                time.sleep(0.5)
            pg.wait_for_timeout(700)
            r = data()["mastery"].get("major0|gama|dur|both", {})
            ok("both hands recognised", r.get("stage", 0) >= 1, str(r))

            # --- 2. walk a semitone up with Prowadzę -----------------------------------------------------------
            open_jam_settings(pg)
            pg.get_by_role("radio", name="pół tonu w górę").click()
            pg.wait_for_timeout(300)
            ok("walk option shows the next key", "następna: D♭-dur" in pg.inner_text(".kcard"), "")
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(400)

            def guided(n_keys):
                seen = []
                last = None
                end = time.time() + 40
                while time.time() < end and len(seen) < n_keys:
                    info = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); const w = document.querySelector('.wc-name'); return [n ? +n.dataset.k : -1, n ? n.querySelector('b').innerText : '', w ? w.textContent : ''] })()")
                    k, name, wheel = info
                    if k >= 0 and (k, wheel) != last:
                        last = (k, wheel)
                        if k == 0 and (not seen or seen[-1] != wheel):
                            seen.append(wheel)
                        user.hit(60 + pc_of(name), 75, 0.1)
                    time.sleep(0.05)
                return seen

            seen = guided(3)
            ok("Prowadzę walks C → D♭ → D", seen[:3] == ["C-dur", "D♭-dur", "D-dur"], str(seen))
            ok("card title follows", "od D" in pg.inner_text(".kcard h2"), pg.inner_text(".kcard h2"))
            mm = data()["mastery"]
            ok("each key counted", mm.get("major7|gama|dur|rh", {}).get("stage", 0) >= 1, str(mm.get("major7|gama|dur|rh")))
            pg.screenshot(path=str(shots / "f2-walk-wait.png"))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- 3. walk po kole in W tempie (Pętla off: walking keeps it going) -------------------------------
            pg.locator(".sector.outer[data-key='C']").first.click()
            pg.wait_for_timeout(300)
            pg.get_by_role("radio", name="po kole →").click()
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("110")
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            last = None
            wheels = []
            end = time.time() + 24
            while time.time() < end:
                info = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); const w = document.querySelector('.wc-name'); const s = document.querySelector('.kstatus'); return [n ? +n.dataset.k : -1, n ? n.querySelector('b').innerText : '', w ? w.textContent : '', s ? s.innerText : ''] })()")
                k, name, wheel, status = info
                if not wheels or wheels[-1] != wheel:
                    wheels.append(wheel)
                if k >= 0 and (k, wheel) != last:
                    last = (k, wheel)
                    user.hit(60 + pc_of(name), 75, 0.1)
                if len(wheels) >= 3:
                    break
                time.sleep(0.012)
            ok("W tempie walks C → G → D on clean passes", wheels[:3] == ["C-dur", "G-dur", "D-dur"], str(wheels))
            st = pg.inner_text(".kstatus")
            ok("same tempo when walking", "110 BPM" in st, st)
            pg.screenshot(path=str(shots / "f3-walk-tempo.png"))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.get_by_role("radio", name="ta sama tonacja").click()
            pg.get_by_role("radio", name="Prowadzę").click()

            # --- 4. Jam a semitone up ----------------------------------------------------------------------------
            pg.locator(".sector.outer[data-key='C']").first.click()
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(400)
            open_jam_settings(pg)
            pg.get_by_role("radio", name="pół tonu w górę").click()
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            statuses = []
            for _ in range(70):
                pg.wait_for_timeout(400)
                if pg.locator(".jb-status").count():
                    s = pg.inner_text(".jb-status")
                    if not statuses or statuses[-1] != s:
                        statuses.append(s)
                if any("okrążenie 3" in x for x in statuses):
                    break
            ok("Jam C → D♭ → D", [x.split(" ·")[0] for x in statuses[:3]] == ["C-dur", "D♭-dur", "D-dur"], str(statuses))
            pg.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()

            # --- 4b. a stale window (old tab / other device) saves its copy: progress is kept ------------------------
            before = data()["mastery"]
            stale = dict(data()); stale.pop("mastery", None)
            req = urllib.request.Request("http://127.0.0.1:47810/api/data", data=json.dumps(stale).encode(), headers={"Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(req).read()
            ok("stale save without progress keeps progress", data()["mastery"] == before)
            older = json.loads(json.dumps(data())); older["mastery"]["major2|gama|dur|rh"] = {"stage": 0, "fade": 0, "cleanRun": 0, "best": 0, "passes": 0}
            req = urllib.request.Request("http://127.0.0.1:47810/api/data", data=json.dumps(older).encode(), headers={"Content-Type": "application/json"}, method="POST")
            urllib.request.urlopen(req).read()
            ok("older record never overwrites a newer one", data()["mastery"]["major2|gama|dur|rh"]["stage"] == 2)

            # --- 5. new version on disk → banner ------------------------------------------------------------------
            ok("no banner before", pg.locator("#update-bar").count() == 0)
            f = app_dir / "web" / "js" / "help.js"
            os.utime(f, None)
            time.sleep(2.2)
            pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            pg.wait_for_timeout(800)
            ok("banner after a deploy", pg.locator("#update-bar").count() == 1, pg.inner_text("#update-bar") if pg.locator("#update-bar").count() else "")
            pg.screenshot(path=str(shots / "f5-banner.png"))
            pg.locator("#update-bar button").click()
            pg.wait_for_timeout(1800)
            ok("refresh clears it, progress kept", pg.locator("#update-bar").count() == 0 and data()["mastery"].get("major2|gama|dur|rh", {}).get("stage") == 2)
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
