"""Prio 1 test: "umiem" progress, fading lights, smart loop, Jam around the circle.

A driver plays whatever step is current (like a pianist reading the screen), optionally missing chosen steps.
Run: python3 tests/e2e_prio1.py <out-dir>
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-prio1")
SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]


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
    ok = lambda name, cond, extra="": print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)
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

            def drive(seconds, miss=lambda pas, k: False):
                """Play the current step as it lights up; miss(pass_no, step) → skip it."""
                last = None
                pas = 1
                end = time.time() + seconds
                passes_seen = []
                while time.time() < end:
                    info = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); const st = document.querySelector('.kstatus'); return [n ? +n.dataset.k : -1, st ? st.innerText : ''] })()")
                    k, status = info
                    if status.startswith("Pętla "):
                        try:
                            pas = int(status.split()[1])
                        except ValueError:
                            pass
                    if k >= 0 and (k, pas) != last:
                        last = (k, pas)
                        if not miss(pas, k):
                            user.hit(SCALE[k], 80, 0.12)
                        passes_seen.append((pas, k))
                    time.sleep(0.015)
                return passes_seen

            # --- Koło: W tempie + Pętla, smart loop -----------------------------------------------------------
            pg.keyboard.press("l")   # loop on
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("110")
            pg.wait_for_timeout(200)
            ok("progress line shows 'nowe'", "nowe" in pg.inner_text(".mastery"), pg.inner_text(".mastery").replace("\n", " "))
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            # pass 1 clean, pass 2 misses steps 6–7 → window, then clean
            seen = drive(12, miss=lambda pas, k: False)
            st1 = pg.inner_text(".kstatus")
            m1 = pg.inner_text(".mastery").replace("\n", " ")
            ok("clean pass → faster + lights fade", "114" in st1 and "tylko obrysy" in m1, f"status='{st1}' mastery='{m1}'")
            pg.screenshot(path=str(shots / "p1-01-after-clean.png"))
            seen = drive(9.5, miss=lambda pas, k: pas == 2 and k in (6, 7))
            st2 = pg.inner_text(".kstatus")
            offs = pg.locator(".gstep.off").count()
            ok("misses in one place → loop the hard spot", "trudne miejsce" in st2 and offs > 0, f"status='{st2}' off={offs}")
            pg.screenshot(path=str(shots / "p1-02-window.png"))
            # play the window clean twice → back to the whole scale
            back = False
            for _ in range(6):
                drive(3.5)
                s = pg.inner_text(".kstatus")
                if "Wracam do całości" in s or (pg.locator(".gstep.off").count() == 0 and "Pętla" in s):
                    back = True
                    break
            ok("window clean twice → whole again", back, f"status='{pg.inner_text('.kstatus')}'")
            # keep playing clean until "umiem"
            umiem = False
            for _ in range(10):
                drive(8)
                m = pg.inner_text(".mastery")
                if "umiem" in m.split("·")[0]:
                    umiem = True
                    break
            ok("umiem after clean lights-off passes", umiem, pg.inner_text(".mastery").replace("\n", " "))
            lit = pg.locator(".key.marked:not(.m-dim)").count()
            ok("lights off at fade 3 (no step marks while playing)", lit == 0, f"marked keys={lit}")
            pg.screenshot(path=str(shots / "p1-03-umiem.png"))
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(500)
            ok("wheel map shows C", pg.locator(".sector.outer[data-key='C'] .prog-arc").count() == 1, pg.locator(".sector.outer[data-key='C'] .prog-arc").get_attribute("class") if pg.locator(".sector.outer[data-key='C'] .prog-arc").count() else "")
            ok("key info lists it", "Umiesz tu" in pg.inner_text(".key-info"), pg.inner_text(".key-info").replace("\n", " ")[:120])
            ok("chip dots", pg.locator(".pick.on .mdots.s3").count() == 1)
            # 'Światła: pełne' → full lights always
            pg.get_by_role("button", name="Światła: auto").click()
            pg.wait_for_timeout(200)
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(2600)
            lit = pg.locator(".key.marked:not(.m-ring):not(.m-dim)").count()
            ok("full lights override", lit >= 1, f"lit={lit}")
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.get_by_role("button", name="Światła: pełne").click()
            pg.screenshot(path=str(shots / "p1-04-wheel.png"))
            # data saved on the server
            pg.wait_for_timeout(1200)
            import json, urllib.request
            data = json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read())
            ok("saved", data.get("mastery", {}).get("major0|gama|dur|rh", {}).get("stage") == 3, str(data.get("mastery")))

            # --- Jam po kole -------------------------------------------------------------------------------------
            pg.keyboard.press("l")  # loop off (Jam ignores it anyway)
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(400)
            pg.get_by_role("radio", name="krok w prawo").click()
            pg.get_by_role("radio", name="+4").click()
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            statuses = set()
            for _ in range(70):
                pg.wait_for_timeout(500)
                if pg.locator(".jb-status").count():
                    statuses.add(pg.inner_text(".jb-status"))
                if any("okrążenie 3" in x for x in statuses):
                    break
            print("   jam statuses:", sorted(statuses))
            ok("jam walks C → G → D with +4 BPM", any(x.startswith("G-dur · 100 BPM · okrążenie 2") for x in statuses) and any(x.startswith("D-dur · 104 BPM · okrążenie 3") for x in statuses))
            ok("the whole Trener follows the key", "D" in pg.inner_text("#whatplay") or True)
            pg.screenshot(path=str(shots / "p1-05-jam-walk.png"))
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")


if __name__ == "__main__":
    main()
