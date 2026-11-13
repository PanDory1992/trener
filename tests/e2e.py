"""End-to-end test: fake router + fake pianist + the real Trener server + a browser.

Run: python3 tests/e2e.py <out-dir>
"""
import json
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TRENER = HERE.parent
SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-e2e")
FONTS = Path("/tmp/claude-0/-home-claude/53b6de72-3dcb-5eb9-86f4-0a2fa82cd438/scratchpad/fonts")
# udp_bus.py (the router's bus) lives next to the trener folder on the PC (CodexPedalModes); in a cloud copy, in outputs/szyna
sys.path.insert(0, str(HERE.parent.parent))
sys.path.insert(0, "/mnt/user-data/outputs/szyna")
from udp_bus import UdpBus  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

CLICKS = {96, 84}


class FakeUser:
    def __init__(self):
        self.mode = "off"
        self.trainer = []          # (time, note, vel) note-ons from the trainer
        self.last = 0.0
        self.replayed_upto = 0
        self.bus = None
        self.lock = threading.Lock()
        self.log = []
        self.statuses = set()

    def set(self, mode):
        with self.lock:
            self.mode = mode
            self.replayed_upto = len(self.trainer)

    def on_play(self, packets):
        now = time.time()
        for p in packets:
            self.statuses.add(p[0])
            on = p[0] & 0xF0 == 0x90 and p[2] > 0
            if on:
                with self.lock:
                    self.trainer.append((now, p[1], p[2]))
                    self.last = now
                if self.mode == "mirror" and p[1] not in CLICKS:
                    threading.Timer(0.0, self.hit, (p[1] + 24, p[2], 0.15)).start()

    def hit(self, note, vel, hold=0.2):
        self.bus.note(True, note, vel, vel)
        self.log.append(("on", note, vel, time.time()))
        threading.Timer(hold, lambda: self.bus.note(False, note, 0, 0)).start()

    def chord(self, notes, hold=0.8, vel=70):
        for n in notes:
            self.bus.note(True, n, vel, vel)
            time.sleep(0.008)
        time.sleep(hold)
        for n in notes:
            self.bus.note(False, n, 0, 0)

    def seq(self, items, gap=0.35):
        for it in items:
            self.chord(it if isinstance(it, list) else [it], hold=gap * 0.8)
            time.sleep(gap * 0.2)

    def loop(self):
        while True:
            time.sleep(0.05)
            if self.mode not in ("echo", "melody", "chord"):
                continue
            with self.lock:
                fresh = self.trainer[self.replayed_upto:]
                quiet = time.time() - self.last > 0.9
            if not fresh or not quiet:
                continue
            with self.lock:
                self.replayed_upto = len(self.trainer)
            notes = [n for n in fresh if n[1] not in CLICKS]
            if self.mode == "melody":   # drop chords (the cadence)
                times = [n[0] for n in notes]
                notes = [n for n in notes if sum(abs(t - n[0]) < 0.02 for t in times) == 1]
            if not notes:
                continue
            t0 = notes[0][0]
            start = time.time() + 0.2
            for (t, note, vel) in notes:
                delay = start + (t - t0) - time.time()
                if delay > 0:
                    time.sleep(delay)
                self.hit(note, vel, 0.6 if self.mode == "chord" else 0.2)


def pick_style(pg, name):
    """Jam: choose a style in the play bar's list by the start of its name ("Pop", "Half-time shuffle")."""
    pg.evaluate("""(n) => { const s = document.querySelector('select.jam-style');
      const o = [...s.options].find((x) => x.textContent.startsWith(n));
      if (!o) throw new Error('no style ' + n);
      s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }""", name)
    pg.wait_for_timeout(150)


def open_jam_settings(pg):
    """Jam: unfold "Więcej ustawień" (barwa, takty, co okrążenie, perkusista, klawisze zespołu)."""
    pg.evaluate("(() => { const d = document.querySelector('details.jam-set'); if (d && !d.open) d.open = true; })()")
    pg.wait_for_timeout(100)


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "node_modules"))
    (SCRATCH / "CodexPedalModes" / "notes.csv").write_text(
        "".join(f"{time.time() - 3600 + i},on,{61 if i % 5 == 0 else 60},{1 if i % 9 == 0 else 80},70\n" for i in range(300)))

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

    page = None
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1440, "height": 900})
            page.route("https://fonts.googleapis.com/**", fonts)
            page.route("https://fonts.gstatic.com/**", fonts)
            page.on("console", lambda m: m.type == "error" and errors.append(m.text))
            page.on("pageerror", lambda e: errors.append(str(e)))
            try:
                page.goto("http://127.0.0.1:47810/")
                page.wait_for_timeout(2500)
                page.screenshot(path=str(shots / "01-kolo.png"))
                print("link:", page.inner_text("#link"))

                # --- Koło tonacji ----------------------------------------------------------------
                # "Co ja gram?" names a held chord
                threading.Thread(target=user.chord, args=([64, 67, 72], 1.2)).start()
                page.wait_for_timeout(600)
                print("co ja gram:", page.inner_text("#whatplay").replace("\n", " | "))
                page.wait_for_timeout(900)
                # Gama C-dur, prawa ręka, wait mode: play it up and down
                page.get_by_role("button", name="Graj ze mną", exact=True).click()
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "02-gama-wait.png"))
                scale = [60, 62, 64, 65, 67, 69, 71, 72]
                user.seq(scale + scale[-2::-1], gap=0.3)
                page.wait_for_timeout(500)
                print("gama:", page.inner_text(".kstatus"), "| done steps:", page.locator(".gstep.done").count())
                # pick G-dur on the wheel, then Pokaż
                page.locator(".sector.outer[data-key='G']").click()
                page.wait_for_timeout(400)
                page.get_by_role("button", name="Pokaż", exact=True).click()
                page.wait_for_timeout(3600)
                page.screenshot(path=str(shots / "03-gama-show-G.png"))
                n_before = len(user.trainer)
                page.get_by_role("button", name="■ Stop", exact=True).click()
                page.wait_for_timeout(1500)
                print("after stop: buttons", page.inner_text(".play-row").replace("\n", " | ")[:60], "| notes after stop:", len(user.trainer) - n_before)
                # Akordy tab: family, click a chord, wait mode with real chords
                page.get_by_role("tab", name="Akordy").click()
                page.wait_for_timeout(300)
                page.locator(".fam-card").nth(5).click()
                page.wait_for_timeout(500)
                page.screenshot(path=str(shots / "04-akordy.png"))
                page.get_by_role("button", name="Graj ze mną", exact=True).click()
                fam = [[55, 59, 62], [57, 60, 64], [59, 62, 66], [60, 64, 67], [62, 66, 69], [64, 67, 71], [66, 69, 72]]
                user.seq(fam, gap=0.6)
                page.wait_for_timeout(500)
                print("akordy:", page.inner_text(".kstatus"))
                # Progresje + tempo mode
                page.get_by_role("tab", name="Progresje").click()
                page.wait_for_timeout(300)
                page.get_by_role("radio", name="W tempie").click()
                page.get_by_role("button", name="Graj ze mną", exact=True).click()
                page.wait_for_timeout(3500)
                page.screenshot(path=str(shots / "05-progresje-tempo.png"))
                page.keyboard.press("p")
                page.get_by_role("radio", name="Prowadzę").click()
                page.get_by_role("tab", name="Akompaniament").click()
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "06-akomp.png"))
                # minor key
                page.locator(".sector.inner[data-key='Em']").click()
                page.get_by_role("tab", name="Gama").click()
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "07-gama-em.png"))

                # --- Jam ----------------------------------------------------------------------
                page.click("nav >> text=Jam")
                page.wait_for_timeout(400)
                page.screenshot(path=str(shots / "08-jam-idle.png"))
                pick_style(page, "Bossa nova")
                before = len(user.trainer)
                page.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
                page.wait_for_timeout(3500)
                threading.Thread(target=user.seq, args=([64, 66, 67, 69, 71, 72, 74],), kwargs={"gap": 0.25}).start()
                page.wait_for_timeout(2500)
                page.screenshot(path=str(shots / "09-jam-bossa.png"))
                print("jam board:", page.inner_text(".jam-board").replace("\n", " | ")[:160])
                print("jam trainer notes:", len(user.trainer) - before, "trail:", page.inner_text(".trail").replace("\n", " "))
                page.get_by_role("radio", name="Ty: akordy").click()
                page.locator("label:has-text('Perkusja i bas') input").check()
                page.wait_for_timeout(7000)
                page.screenshot(path=str(shots / "10-jam-band.png"))
                print("channels seen:", sorted({hex(x) for x in user.statuses}))
                page.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()
                page.locator(".jam-actions").get_by_role("button", name="Zapisz ten jam", exact=True).click()
                page.locator("select").nth(1).select_option("custom")
                page.wait_for_timeout(300)
                page.locator(".pe-addbar").get_by_role("button", name="+ Akord").click()
                page.locator(".pe-add .pe-tabs").get_by_role("tab", name="Propozycje").click()
                for i in [0, 5, 3, 4]:
                    page.locator(".pe-add details.pe-grp").first.locator(".pe-chip").nth(i).click()
                    page.wait_for_timeout(120)
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "11-jam-custom.png"))
                print("custom:", " | ".join(page.locator(".pe-list .pe-num").all_inner_texts()))
                page.locator("label:has-text('Perkusja i bas') input").uncheck()

                # Echo: perfect copies should pass and raise the level
                user.set("echo")
                page.click("nav >> text=Echo")
                page.get_by_role("button", name="Start", exact=True).click()
                page.wait_for_selector(".result .chips", timeout=20000)
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "02-echo-result.png"))
                print("echo status:", page.inner_text(".status"))
                page.get_by_role("button", name="Dodaj do fiszek", exact=True).click()
                page.wait_for_timeout(5000)  # auto next + another round
                print("echo level:", page.inner_text(".level-num"))

                # Dynamics
                user.set("echo")
                page.click("nav >> text=Echo dynamiki")
                page.get_by_role("button", name="Start", exact=True).click()
                page.wait_for_selector(".result .chips", timeout=25000)
                page.wait_for_timeout(300)
                page.screenshot(path=str(shots / "03-dynamika.png"))
                print("dyn status:", page.inner_text(".status"))

                # Chords: listen → the fake user plays it back as a chord
                user.set("chord")
                page.click("nav >> text=Siłownia akordów")
                page.get_by_role("button", name="Start", exact=True).click()
                page.wait_for_timeout(400)
                page.get_by_role("button", name="Posłuchaj tego akordu", exact=True).click()
                page.wait_for_timeout(3500)
                page.screenshot(path=str(shots / "04-akordy.png"))
                print("chords status:", page.inner_text(".status"))

                # Ear
                user.set("melody")
                page.click("nav >> text=Ze słuchu")
                page.get_by_role("button", name="Nowa melodia", exact=True).click()
                page.wait_for_function("document.querySelector('.status').innerText.includes('Znalezione')", timeout=20000)
                page.wait_for_timeout(600)
                page.screenshot(path=str(shots / "05-ucho.png"))
                print("ear status:", page.inner_text(".status"))

                # Aksak: mirror the bass
                user.set("mirror")
                page.click("nav >> text=Aksak")
                page.get_by_role("button", name="Start", exact=True).click()
                page.wait_for_timeout(9000)
                page.screenshot(path=str(shots / "06-aksak-live.png"))
                page.wait_for_selector(".result .chips", timeout=30000)
                page.screenshot(path=str(shots / "07-aksak-result.png"))
                print("aksak:", page.inner_text(".result"))

                # Target notes: mirror the left hand two octaves up (chord tones on the beat)
                page.click("nav >> text=Nuty docelowe")
                page.get_by_role("button", name="Start", exact=True).click()
                page.wait_for_timeout(14000)
                page.screenshot(path=str(shots / "08-docelowe-live.png"))
                print("target score:", page.inner_text(".score-row"))
                page.get_by_role("button", name="■ Stop", exact=True).click()

                # Cards
                user.set("echo")
                page.click("nav >> text=Fiszki")
                page.wait_for_timeout(500)
                page.screenshot(path=str(shots / "19-fiszki.png"))
                page.get_by_role("button", name="Powtórz teraz", exact=True).click()
                page.wait_for_timeout(9000)
                page.screenshot(path=str(shots / "20-fiszki-done.png"))
                print("cards:", page.inner_text(".stage")[:200])

                # Home again + plan run
                user.set("off")
                page.click("nav >> text=Plan dnia")
                page.wait_for_timeout(500)
                page.screenshot(path=str(shots / "21-home-after.png"))
                page.get_by_role("button", name="Zacznij", exact=True).click()
                page.wait_for_timeout(1500)
                page.screenshot(path=str(shots / "22-run.png"))
                page.get_by_role("button", name="Następny blok", exact=True).click()
                page.wait_for_timeout(800)
                page.screenshot(path=str(shots / "23-overlay.png"))
                page.locator(".overlay").get_by_role("button", name="Dalej", exact=True).click()
                page.wait_for_timeout(800)
                print("runbar:", page.inner_text("#runbar"))
                page.click("nav >> text=Jak to działa", no_wait_after=True) if False else None
                page.set_viewport_size({"width": 390, "height": 844})
                page.wait_for_timeout(500)
                page.screenshot(path=str(shots / "24-mobile.png"))
                ch1 = sorted(hex(x) for x in user.statuses if x in (0x90, 0x80))
                print("CHANNEL 1 FROM TRENER:", ch1 or "none (all on channel 3)")
                assert not ch1, f"Trener played on channel 1: {ch1}"
            except Exception as exc:
                print("FAILED:", str(exc).splitlines()[0])
                page.screenshot(path=str(shots / "zz-fail.png"))
                print("stage at failure:", page.inner_text(".stage")[:500].replace("\n", " | "))
                print("fake user log:", user.log[-12:])
                print("trainer notes:", [(round(t % 100, 2), n, v) for t, n, v in user.trainer[-14:]])
            b.close()
            page = None
        data = json.loads((app_dir / "trener-dane.json").read_text())
        print("saved modes:", {k: v["level"] for k, v in data["modes"].items()}, "cards:", len(data["cards"]))
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")


if __name__ == "__main__":
    main()
