"""Red-team regressions for Prio 1: mashing keys is not "clean", hints are not "lights off",
Jam: a key picked by hand during a walk is kept, and a fast Stop → Start never runs two bands at once.

Run: python3 tests/e2e_redteam.py <out-dir>
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-redteam")
SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]
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
            pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            def drive(seconds, extra=None):
                last = None
                end = time.time() + seconds
                while time.time() < end:
                    k = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); return n ? +n.dataset.k : -1 })()")
                    if k >= 0 and k != last:
                        last = k
                        user.hit(SCALE[k], 80, 0.1)
                        if extra:
                            user.hit(extra(SCALE[k]), 80, 0.1)
                    time.sleep(0.015)

            # 1. mashing: right note + a wrong neighbour on every step → never "clean"
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("100")
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            drive(13, extra=lambda n: n + 1)
            pg.wait_for_timeout(1200)
            m = pg.inner_text(".mastery").replace("\n", " ")
            ok("mashing is not clean", m.startswith("nowe") and "tylko obrysy" not in m, m)
            ok("mashing marks steps as part", pg.locator(".gstep.part").count() + pg.locator(".gstep.miss").count() > 0)

            # 2. hesitation at "lights when you hesitate": the pass is clean, but the lights must not fade further
            stopb = pg.get_by_role("button", name="■ Stop", exact=True)
            if stopb.count() and stopb.is_visible():
                stopb.click()
            pg.wait_for_timeout(300)
            pg.evaluate("""(async () => {
              const st = await import('/js/store.js');
              st.data.mastery = { 'major0|gama|dur|rh': { stage: 2, fade: 2, cleanRun: 0, best: 100, passes: 4 } };
              st.save && st.save();
            })()""")
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(300)
            pg.click("nav >> text=Koło tonacji")
            pg.wait_for_timeout(600)
            m0 = pg.inner_text(".mastery").replace("\n", " ")
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("100")
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            last = None
            end = time.time() + 12
            while time.time() < end:
                k = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); return n ? +n.dataset.k : -1 })()")
                if k >= 0 and k != last:
                    last = k
                    if k == 3:
                        time.sleep(0.38)   # hesitate: lights come on after 0.45 beat (0.27 s at 100 BPM)
                    user.hit(SCALE[k], 80, 0.1)
                time.sleep(0.015)
            pg.wait_for_timeout(1000)
            m1 = pg.inner_text(".mastery").replace("\n", " ")
            ok("hesitation pass keeps the light level", "światła, gdy się zawahasz" in m1 and "bez świateł" not in m1, f"before='{m0[:60]}' after='{m1[:80]}'")
            stopb = pg.get_by_role("button", name="■ Stop", exact=True)
            if stopb.count() and stopb.is_visible():
                stopb.click()
            pg.wait_for_timeout(300)

            # 3. Jam: walk right, pick a key by hand mid-run → kept on the next lap
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(400)
            pg.get_by_role("radio", name="krok w prawo").click()
            pg.get_by_role("radio", name="stałe").click()
            start = pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True)
            # 4. fast Stop → Start: only one band
            start.click()
            pg.wait_for_timeout(150)
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(1500)
            # pick F-dur by hand
            idx = pg.evaluate("""(() => { const s = document.querySelector('select.jam-key');
              const o = [...s.options].find((o) => o.textContent.startsWith('F-dur')); return o ? o.value : null })()""")
            pg.select_option("select.jam-key", idx)
            statuses = []
            for _ in range(60):
                pg.wait_for_timeout(400)
                if pg.locator(".jb-status").count():
                    s = pg.inner_text(".jb-status")
                    if not statuses or statuses[-1] != s:
                        statuses.append(s)
                if any("okrążenie 3" in x for x in statuses):
                    break
            print("   jam statuses:", statuses)
            lap2 = [x for x in statuses if "okrążenie 2" in x]
            lap3 = [x for x in statuses if "okrążenie 3" in x]
            ok("hand-picked key wins for the next lap", lap2 and lap2[0].startswith("F-dur"), str(lap2[:1]))
            ok("walk continues from it", lap3 and lap3[0].startswith("C-dur"), str(lap3[:1]))
            sel = pg.evaluate("document.querySelector('select.jam-key').selectedOptions[0].textContent")
            ok("key list follows the walk", sel.startswith("C-dur"), sel)
            # one band only: count trainer note-ons over one bar vs a clean single run is hard; check no lap was scheduled twice
            dup = len(statuses) != len(set(statuses))
            ok("no duplicated laps after fast Stop/Start", not dup, str(statuses))
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
