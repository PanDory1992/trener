"""Ćwiczenia → Palce: five fingers, fingers on call, even fingers (weak/late finger found), thumb crossing hole,
scales in contrary motion over two octaves.

Run: python3 tests/e2e_palce.py <out-dir>
"""
import json
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from e2e import TRENER, FakeUser, UdpBus  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-palce")
RH_C = {1: 60, 2: 62, 3: 64, 4: 65, 5: 67}
results = []


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def data():
    return json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read())


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log", "CHANGES-*.md"))
    D = lambda n: (date.today() + timedelta(days=n)).isoformat()   # noqa: E731
    seed = {"v": 1, "settings": {"latencyMs": 0, "key": {"i": 0, "mode": "major"}}, "modes": {}, "cards": [], "days": {}, "sessions": [],
            "mastery": {"palce|piec|major0|skoki|rh": {"stage": 3, "fade": 3, "cleanRun": 3, "best": 72, "passes": 10, "last": D(-2), "due": D(-1), "step": 0, "tail": "cccc"}}}
    (app_dir / "trener-dane.json").write_text(json.dumps(seed), encoding="utf-8")
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
            ok("nav group renamed to Ćwiczenia", pg.locator(".nav-group", has_text="Ćwiczenia").count() == 1)
            pg.click("nav >> text=Palce")
            pg.wait_for_timeout(500)
            mark = pg.evaluate("document.querySelector(\".key[data-note='64'] .key-mark\").innerText")
            ok("finger numbers on the keys (E = 3)", mark.startswith("3"), repr(mark))

            now = "(() => { const n = document.querySelector('.gstep.now'); return n ? [+n.dataset.k, n.querySelector('b').innerText] : [-1, ''] })()"

            def drive(seconds, play):
                last = None
                end = time.time() + seconds
                while time.time() < end:
                    k, label = pg.evaluate(now)
                    if k >= 0 and k != last:
                        last = k
                        play(label)
                    elif k < 0 and last is not None:
                        break
                    time.sleep(0.01)

            # --- 1. five fingers, Prowadzę ---------------------------------------------------------------
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(300)
            drive(15, lambda label: user.hit(RH_C[int(label[1])], 80, 0.1) or time.sleep(0.15))
            pg.wait_for_timeout(2500)
            r = data().get("mastery", {}).get("palce|piec|major0|gora|rh", {})
            ok("five fingers counted", r.get("stage") == 1, str(r))
            ok("finger panel after a pass", "twoje palce" in pg.inner_text(".finger-stats").lower())
            pg.screenshot(path=str(shots / "p1-piec.png"))

            # --- 2. even fingers: 4 soft and late --------------------------------------------------------
            pg.get_by_role("tab", name="Równość").click()
            pg.get_by_role("radio", name="4–5").click()
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("80")
            pg.wait_for_timeout(200)
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()

            def trill(label):
                f = int(label[1])
                if f == 4:
                    time.sleep(0.06)
                    user.hit(RH_C[4], 40, 0.1)
                else:
                    user.hit(RH_C[5], 95, 0.1)
            drive(14, trill)
            pg.wait_for_timeout(800)
            fs = pg.inner_text(".finger-stats")
            ok("weak finger found", "Najciszej gra palec P4" in fs, fs.replace("\n", " | "))
            ok("late finger found", "spóźnia się P4" in fs, "")
            pg.screenshot(path=str(shots / "p2-rownosc.png"))

            # --- 3. on call: no lights, a new draw each pass ---------------------------------------------------
            pg.get_by_role("tab", name="Na zawołanie").click()
            pg.get_by_role("radio", name="Prowadzę").click()
            pg.wait_for_timeout(200)
            first = pg.inner_text(".gstrip")
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(400)
            lit = pg.locator(".key.marked:not(.m-ring):not(.m-dim)").count()
            ok("no lights for calls", lit == 0, f"lit={lit}")
            seen = []
            last_k = None
            end = time.time() + 14
            while time.time() < end and len(seen) < 14:
                k, label = pg.evaluate(now)
                if k >= 0 and k != last_k and label:
                    last_k = k
                    seen.append(label)
                    user.hit(RH_C[int(label[1])], 80, 0.1)
                time.sleep(0.02)
            second = pg.inner_text(".gstrip")
            ok("calls: 12 played, a new draw after the pass", len(seen) >= 13 and first != second, f"seen={len(seen)}")
            pg.get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- 4. thumb: a hole before F --------------------------------------------------------------------------
            pg.get_by_role("tab", name="Kciuk").click()
            pg.get_by_role("radio", name="W tempie").click()
            pg.locator(".tempo-field input").fill("70")
            pg.wait_for_timeout(200)
            names = {"C": 60, "D": 62, "E": 64, "F": 65, "G": 67, "A": 69, "B": 71}
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            prev = {"l": None}

            def thumb(label):
                if label == "F" and prev["l"] == "E":
                    time.sleep(0.32)
                prev["l"] = label
                user.hit(names[label], 80, 0.1)
            drive(14, thumb)
            pg.wait_for_timeout(800)
            fs = pg.inner_text(".finger-stats")
            ok("thumb hole measured", "dziura" in fs and "przed F" in fs, fs.replace("\n", " | "))
            pg.screenshot(path=str(shots / "p3-kciuk.png"))

            # --- 5. contrary motion, two octaves -------------------------------------------------------------------------
            pg.get_by_role("tab", name="Gamy").click()
            pg.get_by_role("radio", name="Ruch przeciwny").click()
            pg.get_by_role("radio", name="2 oktawy").click()
            pg.get_by_role("radio", name="Prowadzę").click()
            pg.wait_for_timeout(300)
            lo = pg.evaluate("Math.min(...[...document.querySelectorAll('.key')].map((k) => +k.dataset.note))")
            hi = pg.evaluate("Math.max(...[...document.querySelectorAll('.key')].map((k) => +k.dataset.note))")
            ok("keyboard widened for two octaves each way", lo <= 36 and hi >= 84, f"{lo}..{hi}")
            sub = pg.inner_text(".gstep:nth-child(2)")
            ok("contrary: same fingers in both hands", "P② L②" in sub, sub.replace("\n", " "))
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(300)

            def both(_label):
                ns = pg.evaluate("[...document.querySelectorAll('.key.marked:not(.m-ring):not(.m-dim)')].map((k) => +k.dataset.note)")
                for n in ns:
                    user.hit(n, 80, 0.15)
                time.sleep(0.12)
            drive(25, both)
            pg.wait_for_timeout(2500)
            r = data()["mastery"].get("palce|gamy|major0|contra|2", {})
            ok("contrary two octaves counted", r.get("stage") == 1, str(r))
            pg.screenshot(path=str(shots / "p4-contra.png"))

            # --- 6. a Palce item in today's reviews: Koło → Do powtórki → Palce, one pass without lights -----------
            pg.click("nav >> text=Koło")
            pg.wait_for_timeout(800)
            due = pg.locator(".p2-due")
            ok("Koło counts the Palce review", due.count() == 1 and "1" in due.inner_text(), due.inner_text() if due.count() else "none")
            due.click()
            pg.wait_for_timeout(800)
            ban = pg.inner_text(".palce-card .p2-review") if pg.locator(".palce-card .p2-review").count() else ""
            ok("review opens Palce on the right exercise", "Powtórka 1 z 1" in ban and "pięć palców" in ban and pg.locator(".tab.on", has_text="Pięć palców").count() == 1, ban.replace("\n", " "))
            lit = pg.locator(".key.marked:not(.m-ring):not(.m-dim)").count()
            ok("review without lights", lit == 0, f"lit={lit}")
            seq = [1, 3, 5, 3, 1, 3, 5, 3, 1]
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            last_k = None
            end = time.time() + 15
            while time.time() < end:
                k, _l = pg.evaluate(now)
                if k >= 0 and k != last_k:
                    last_k = k
                    user.hit(RH_C[seq[k]], 80, 0.1)
                elif k < 0 and last_k is not None:
                    break
                time.sleep(0.01)
            pg.wait_for_timeout(2500)
            ban = pg.inner_text(".palce-card .p2-review") if pg.locator(".palce-card .p2-review").count() else ""
            ok("clean review: banner says the next one is in 2 days", "czysto" in ban and "2 dni" in ban, ban.replace("\n", " "))
            r = data()["mastery"].get("palce|piec|major0|skoki|rh", {})
            ok("clean review saved: still umiem, next in 2 days", r.get("stage") == 3 and r.get("due") == D(2) and r.get("step") == 1, str(r))
            pg.screenshot(path=str(shots / "p6-review.png"))

            # phone layout
            ph = b.new_page(viewport={"width": 926, "height": 428}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ph.route("https://fonts.googleapis.com/**", fonts)
            ph.route("https://fonts.gstatic.com/**", fonts)
            ph.goto("http://127.0.0.1:47810/")
            ph.wait_for_timeout(1200)
            ph.evaluate("document.querySelector('.menu-btn').click()")
            ph.wait_for_timeout(300)
            ph.click("nav >> text=Palce")
            ph.wait_for_timeout(600)
            ph.screenshot(path=str(shots / "p5-phone.png"))
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
