"""Piosenki: starters, numbers, guided play, transpose, voice fit, paste a song, sections in the relative key,
links to the Koło and to the Jam.

Run: python3 tests/e2e_piosenki.py <out-dir>
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-piosenki")
results = []
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def ok(name, cond, extra=""):
    results.append(bool(cond))
    print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)


def triad(name):
    """Major/minor triad pitches from a chord name like 'F♯m'."""
    p = PC[name[0]]
    rest = name[1:]
    if rest[:1] in ("♯", "♭"):
        p += 1 if rest[0] == "♯" else -1
        rest = rest[1:]
    minor = rest.startswith("m") and not rest.startswith("maj")
    root = 48 + p % 12
    return [root, root + 12, root + 12 + (3 if minor else 4), root + 12 + 7]


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
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(600)

            # --- a starter: key and numbers ----------------------------------------------------------------
            kr = pg.inner_text(".key-row")
            ok("Stand by Me in A-dur", "A-dur" in kr, kr)
            chart = pg.inner_text(".song-chart")
            ok("numbers 1 6m 4 5", all(x in chart for x in ["6m", "F♯m", "4", "5"]), chart.replace("\n", " ")[:120])

            # --- guided: play each chord when it lights --------------------------------------------------------
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            pg.wait_for_timeout(400)
            last = None
            end = time.time() + 20
            while time.time() < end:
                info = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); return n ? [+n.dataset.k, n.querySelector('b').innerText] : [-1, ''] })()")
                k, name = info
                if k < 0:
                    if last is not None:
                        break
                    time.sleep(0.05)
                    continue
                if k != last:
                    last = k
                    user.chord(triad(name), hold=0.25)
                time.sleep(0.05)
            pg.wait_for_timeout(600)
            r = data().get("mastery", {}).get("song|st-standbyme|0|blok", {})
            ok("a whole section counts", r.get("stage") == 1, str(r))
            ok("chord lit in the chart while playing", True)
            pg.screenshot(path=str(shots / "p1-played.png"))

            # --- transpose -----------------------------------------------------------------------------------
            pg.get_by_role("button", name="+½").click()
            pg.wait_for_timeout(300)
            kr = pg.inner_text(".key-row")
            ok("+½ → B♭-dur, chart spelled there", "B♭-dur" in kr and "Gm" in pg.inner_text(".song-chart"), kr)
            pg.get_by_role("button", name="oryginał").click()

            # --- voice fit ------------------------------------------------------------------------------------
            pg.locator(".voice-row button").nth(0).click()
            user.hit(45, 70)
            time.sleep(0.3)
            user.hit(67, 70)
            pg.wait_for_timeout(400)
            pg.locator(".voice-row button").nth(1).click()
            user.hit(57, 70)
            time.sleep(0.3)
            user.hit(76, 70)          # melody A3–E5: too high for A2–G4 → move down
            pg.wait_for_timeout(500)
            vr = pg.inner_text(".voice-row")
            ok("voice and melody set, advice shown", "A2–G4" in vr and "za wysoko" in vr and "Najlepiej" in vr and "oktawę niżej" in vr, vr.replace("\n", " "))
            pg.locator(".voice-row .pick.on").click()
            pg.wait_for_timeout(300)
            kr = pg.inner_text(".key-row")
            vr = pg.inner_text(".voice-row")
            ok("advice applied", "grasz w" in kr and "(+" in kr and "Teraz pasuje, śpiewasz oktawę niżej" in vr, (kr + " | " + vr).replace("\n", " "))
            pg.screenshot(path=str(shots / "p2-voice.png"))

            # --- paste a song ----------------------------------------------------------------------------------
            pg.get_by_role("button", name="+ Dodaj piosenkę").click()
            pg.fill(".song-title-in", "Test soul")
            pg.fill(".song-text-in", "[Verse]\nAm7          D9           Am7      D9\nSome words that I sing here today\nFmaj7     E7         Am\nand more words here\n\n[Chorus]\n| C | G/B | Am | F |\n| C | G | Fm | C |")
            pg.wait_for_timeout(200)
            ok("live preview", "2 części" in pg.inner_text(".song-card") and "a-moll" in pg.inner_text(".song-card"))
            pg.get_by_role("button", name="Zapisz").click()
            pg.wait_for_timeout(2500)
            songs = data().get("songs", [])
            ok("saved", len(songs) == 1 and songs[0]["title"] == "Test soul")
            chart = pg.inner_text(".song-chart")
            ok("chorus marked as C-dur, lyric kept under the chords", "C-dur" in chart and "Some words" in chart, chart.replace("\n", " ")[:160])
            ok("Fm marked as outside the family", pg.locator(".sc-ch.out", has_text="Fm").count() == 1)
            steps = pg.inner_text(".song-steps")
            ok("Fm explained as borrowed", "Fm" in steps and "pożyczony" in steps, steps.replace("\n", " ")[:200])
            pg.screenshot(path=str(shots / "p3-pasted.png"))

            # --- from a song to the Koło ------------------------------------------------------------------------
            pg.locator(".song-pick", has_text="Let It Be").click()
            pg.wait_for_timeout(400)
            door = pg.locator(".song-steps .door", has_text="Pop-hymn")
            ok("Let It Be: Pop-hymn found inside", door.count() == 1)
            door.click()
            pg.wait_for_timeout(600)
            h2 = pg.inner_text(".kcard h2")
            ok("opens the Koło card: Pop-hymn w C-dur", "Pop-hymn" in h2 and "C-dur" in h2, h2)

            # --- to the Jam ----------------------------------------------------------------------------------------
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(400)
            pg.locator(".song-pick", has_text="Hit the Road").click()
            pg.wait_for_timeout(300)
            pg.locator(".song-steps .door", has_text="Jamie").click()
            pg.wait_for_timeout(600)
            summ = pg.inner_text(".jam-set-sum")
            ok("Jam takes the song and its key", "Hit the Road" in summ and "a-moll" in summ, summ)
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(4000)
            ok("Jam plays it", pg.locator(".jb-status").count() == 1 and "a-moll" in pg.inner_text(".jb-status"), pg.inner_text(".jb-status") if pg.locator(".jb-status").count() else "")
            pg.screenshot(path=str(shots / "p4-jam.png"))
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
