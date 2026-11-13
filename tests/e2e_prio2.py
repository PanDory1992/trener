"""Prio 2 test: Kostka, powtórki (spaced reviews on "umiem"), informacja po próbie (timing + dynamics),
wyzwania (Koło and Jam, Pytanie–odpowiedź), stałe kolory funkcji, phone layout.

A driver plays whatever step is current (like a pianist reading the screen), on time, late or early.
Run: python3 tests/e2e_prio2.py <out-dir>
"""
import json
import re
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
from e2e import TRENER, FakeUser, UdpBus, pick_style, open_jam_settings  # noqa: E402
from e2e_phone import fonts  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-prio2")
SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]
BEATS = [1] * 7 + [2] + [1] * 7          # the top note of a scale lasts 2 beats
TODAY = date.today()
D = lambda n: (TODAY + timedelta(days=n)).isoformat()   # noqa: E731

SEED = {
    "v": 1,
    "settings": {"hNames": False, "planMinutes": 30, "latencyMs": 0, "gain": 1, "autoCards": True, "clicks": True, "key": {"i": 0, "mode": "major"}},
    "modes": {}, "cards": [], "days": {}, "sessions": [],
    "mastery": {
        # "umiem" with a review due yesterday
        "major0|gama|dur|rh": {"stage": 3, "fade": 3, "cleanRun": 3, "best": 90, "passes": 14, "last": D(-2), "due": D(-1), "step": 1, "tail": "cccc"},
        # a weak spot, something ready for Bez świateł, and a flat key not touched for 10 days
        "major9|prog|iiVI": {"stage": 2, "fade": 1, "cleanRun": 0, "best": 70, "passes": 6, "last": D(-1), "tail": "ccxx"},
        "major1|gama|dur|rh": {"stage": 2, "fade": 2, "cleanRun": 0, "best": 80, "passes": 7, "last": D(-1), "tail": "cccc"},
        "major11|akordy|rodzina|3": {"stage": 1, "fade": 0, "cleanRun": 0, "best": 0, "passes": 2, "last": D(-10), "tail": "cc"},
        # a card that no longer exists: must be ignored everywhere
        "major5|prog|usunieta": {"stage": 3, "fade": 3, "cleanRun": 3, "best": 80, "passes": 9, "last": D(-5), "due": D(-1)},
    },
}


def main():
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    app_dir = SCRATCH / "CodexPedalModes" / "trener"
    shutil.copytree(TRENER, app_dir, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log", "CHANGES-*.md"))
    (app_dir / "trener-dane.json").write_text(json.dumps(SEED), encoding="utf-8")
    user = FakeUser()
    piano = []   # (time, status, note) of everything the trainer plays
    orig = user.on_play

    def on_play(packets):
        now = time.time()
        for p in packets:
            if p[0] & 0xF0 == 0x90 and p[2] > 0:
                piano.append((now, p[0], p[1]))
        orig(packets)
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
    results = []

    def ok(name, cond, extra=""):
        results.append(bool(cond))
        print(f"{'OK ' if cond else 'BAD'} {name} {extra}", flush=True)

    def mastery():
        return json.loads(urllib.request.urlopen("http://127.0.0.1:47810/api/data").read()).get("mastery", {})

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

            def drive(seconds, hit=lambda k: (0.0, 80), miss=lambda k: False, until_done=True):
                """Play each step when it lights: hit(k) → (delay s, may be < 0 = ahead of the next step, velocity)."""
                last = None
                end = time.time() + seconds
                timers = []
                while time.time() < end:
                    k, running = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); const b = [...document.querySelectorAll('.play-row .btn')].some((x) => x.textContent.includes('Stop')); return [n ? +n.dataset.k : -1, b] })()")
                    if until_done and not running and last is not None:
                        break
                    if k >= 0 and k != last:
                        last = k
                        dl, vel = hit(k)
                        if dl < 0:
                            # ahead: play the NEXT step, |dl| before it starts (its start = now + this step's beats)
                            nk = k + 1
                            if nk < len(SCALE) and not miss(nk):
                                t = threading.Timer(max(0, BEATS[k] * beat[0] + dl), user.hit, (SCALE[nk], hit(nk)[1], 0.12))
                                t.start(); timers.append(t)
                            if k == 0 and not miss(0):
                                user.hit(SCALE[0], vel, 0.12)
                        elif not miss(k):
                            t = threading.Timer(dl, user.hit, (SCALE[k], vel, 0.12))
                            t.start(); timers.append(t)
                    time.sleep(0.01)
                for t in timers:
                    t.join()
            beat = [60 / 100]

            def set_tempo(v):
                pg.locator(".tempo-field input").fill(str(v))
                beat[0] = 60 / v
                pg.wait_for_timeout(150)

            # --- 1. Koło: bar with Kostka, Do powtórki, a hint ----------------------------------------------------
            bar = pg.inner_text(".p2-bar")
            ok("Koło shows Kostka and 'Do powtórki: 1' (the removed card is ignored)", "Kostka" in bar and "Do powtórki: 1" in bar, bar.replace("\n", " "))
            ok("a gentle hint is shown", pg.locator(".p2-hint").count() == 1 and len(pg.inner_text(".p2-hint")) > 10, pg.inner_text(".p2-hint") if pg.locator(".p2-hint").count() else "")
            pg.screenshot(path=str(shots / "p2-01-kolo-bar.png"))

            # --- 2. Kostka opens a card with one sentence why ----------------------------------------------------
            kinds = set()
            for i in range(4):
                pg.locator(".p2-dice").click()
                pg.wait_for_timeout(500)
                why = pg.inner_text(".p2-why") if pg.locator(".p2-why").count() else ""
                kinds.add(why.split(":")[0])
                m = re.search(r"([A-H][♭♯]?-dur|[a-h][♭♯]?-moll)", why)
                center = pg.text_content(".wc-name")
                ok(f"dice {i + 1}: why + the right key on the wheel", why and m and m.group(1) == center, f"why='{why}' wheel='{center}'")
                if why.startswith("Słabe miejsce"):
                    ok("weak spot opens Progresje ii–V–I in E♭-dur, W tempie", "Jazzowe ii–V–I w E♭-dur" in pg.inner_text(".kcard-head h2") and pg.locator(".seg-ctl button.on", has_text="W tempie").count() == 1, pg.inner_text(".kcard-head h2"))
            print("   dice kinds:", sorted(kinds))
            pg.screenshot(path=str(shots / "p2-02-dice.png"))

            # --- 3. Powtórka: a failed review lowers "umiem" -------------------------------------------------------
            pg.locator(".p2-due").click()
            pg.wait_for_timeout(600)
            ban = pg.inner_text(".p2-review")
            ok("review opens Gama C-dur prawa, W tempie, with the prompt", "Powtórka 1 z 1" in ban and "Zagraj gamę C-dur prawą ręką" in ban and "Gama durowa od C" in pg.inner_text(".kcard-head h2"), ban.replace("\n", " "))
            set_tempo(100)
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            drive(16, miss=lambda k: 3 <= k <= 9)
            pg.wait_for_timeout(600)
            ban = pg.inner_text(".p2-review")
            ok("failed review: banner says so", "posypało się" in ban, ban.replace("\n", " "))
            pg.wait_for_timeout(1200)   # the save is debounced
            m = mastery().get("major0|gama|dur|rh", {})
            ok("failed review: stage 3 → 2, due tomorrow", m.get("stage") == 2 and m.get("due") == D(1), str(m))
            arc = pg.locator(".sector.outer[data-key='C'] .prog-arc").get_attribute("class") or ""
            ok("the arc on the wheel dims (no longer 'umiem' there)", "lvl1" in arc, arc)
            pg.screenshot(path=str(shots / "p2-03-review-failed.png"))
            fb = pg.inner_text(".p2-fb") if pg.locator(".p2-fb").count() else ""
            ok("timing panel after the review pass", "Rytm:" in fb, fb.replace("\n", " | "))
            pg.get_by_role("button", name="Koniec powtórek").click()
            pg.wait_for_timeout(300)
            ok("walk summary", "Powtórki zrobione: 0 z 1" in pg.inner_text(".p2-msg"), pg.inner_text(".p2-msg").replace("\n", " "))

            # --- 4. Informacja po próbie: late, then early with uneven dynamics ----------------------------------------
            pg.get_by_role("radio", name="W tempie").click()
            set_tempo(60)
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            drive(25, hit=lambda k: (0.17, 80))
            pg.wait_for_timeout(500)
            fb = pg.inner_text(".p2-fb")
            mm = re.search(r"średnio (\d+) ms za późno", fb)
            ok("late player: 'za późno' with plausible ms", mm and 80 <= int(mm.group(1)) <= 260, fb.replace("\n", " | "))
            ok("dynamics even at a constant velocity", "Dynamika: równa" in fb)
            pg.screenshot(path=str(shots / "p2-04-late.png"))
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            drive(25, hit=lambda k: (-0.15, 112 if 4 <= k <= 6 else 64))
            pg.wait_for_timeout(500)
            fb = pg.inner_text(".p2-fb")
            mm = re.search(r"średnio (\d+) ms za wcześnie", fb)
            ok("early player: 'za wcześnie' with plausible ms", mm and 60 <= int(mm.group(1)) <= 260, fb.replace("\n", " | "))
            ok("uneven dynamics names the loud steps", re.search(r"nierówna \(±\d+\): kroki? [4-8]", fb) and "głośniej" in fb, fb.replace("\n", " | "))
            pg.screenshot(path=str(shots / "p2-05-early-dyn.png"))

            # --- 5. Kolory funkcji on the Koło ------------------------------------------------------------------------
            pg.get_by_role("tab", name="Akordy").click()
            pg.wait_for_timeout(300)
            fns = pg.evaluate("[...document.querySelectorAll('.fam-card')].map((c) => (c.className.match(/fn-([TSDX])/) || [])[1])")
            ok("Akordy: family coloured T S T S D T D", fns == ["T", "S", "T", "S", "D", "T", "D"], str(fns))
            col = pg.evaluate("getComputedStyle(document.querySelector('.fam-card.fn-T .fc-num')).color")
            ok("tonika is blue", col == "rgb(92, 157, 255)", col)
            pg.locator(".fam-card").nth(4).click()
            pg.wait_for_timeout(300)
            strip = pg.evaluate("(() => { const k = document.querySelector('.key.m-fn'); return k ? [k.dataset.note % 12, getComputedStyle(k, '::after').backgroundColor] : null })()")
            ok("the root key of G gets a dominant-coloured strip", strip and strip[0] == 7 and strip[1] == "rgb(255, 92, 138)", str(strip))
            pg.screenshot(path=str(shots / "p2-06-akordy-fn.png"))
            pg.get_by_role("tab", name="Progresje").click()
            pg.wait_for_timeout(300)
            pg.locator(".prog-pick", has_text="Pop-hymn").click()
            pg.wait_for_timeout(300)
            steps_fn = pg.evaluate("[...document.querySelectorAll('.gstep')].map((g) => [g.querySelector('b').textContent, (g.className.match(/fn-([TSDX])/) || [])[1]])")
            ok("Progresje: strip coloured by function (1 5 6m 4 → T D T S)", [x[1] for x in steps_fn] == ["T", "D", "T", "S"], str(steps_fn))

            # --- 6. Wyzwanie on the Progresje card: chord tones only ----------------------------------------------------
            pg.locator(".chal-field select").select_option("ct")
            pg.locator(".tempo-field input").fill("120")
            pg.wait_for_timeout(100)
            chords = [[48, 60, 64, 67], [43, 59, 62, 67], [45, 60, 64, 69], [41, 60, 65, 69]]
            pg.get_by_role("button", name="Graj ze mną", exact=True).click()
            last = None
            end = time.time() + 14
            while time.time() < end:
                k, running = pg.evaluate("(() => { const n = document.querySelector('.gstep.now'); const b = [...document.querySelectorAll('.play-row .btn')].some((x) => x.textContent.includes('Stop')); return [n ? +n.dataset.k : -1, b] })()")
                if not running and last is not None:
                    break
                if k >= 0 and k != last:
                    last = k
                    notes = chords[k] + ([74] if k == 1 else [])   # D over G: a chord tone; plus F♯ in the last chord: not
                    threading.Thread(target=user.chord, args=(notes, 0.5, 70)).start()
                    if k == 3:
                        threading.Timer(0.6, user.hit, (78, 60, 0.1)).start()
                time.sleep(0.01)
            pg.wait_for_timeout(600)
            fb = pg.inner_text(".p2-fb")
            mm = re.search(r"Wyzwanie: (\d+) z (\d+) dźwięków to dźwięki akordu", fb)
            ok("Progresje challenge: plain count of chord tones", mm and int(mm.group(2)) >= 16 and int(mm.group(2)) - int(mm.group(1)) == 1, fb.replace("\n", " | "))
            ok("bass vs chord line (bass in the left hand)", "Bas" in fb, fb.replace("\n", " | "))
            pg.screenshot(path=str(shots / "p2-07-prog-chal.png"))

            # --- 7. Fiszki lists reviews; Plan dnia has Kostka, reviews and the end tip ----------------------------------
            pg.click("nav >> text=Fiszki")
            pg.wait_for_timeout(500)
            fz = pg.inner_text(".p2-rev") if pg.locator(".p2-rev").count() else ""
            ok("Fiszki: the lapsed scale shows under 'Następne' (tomorrow)", "jutro" in fz and "gama C-dur prawą ręką" in fz, fz.replace("\n", " | ")[:200])
            pg.screenshot(path=str(shots / "p2-08-fiszki.png"))
            pg.click("nav >> text=Plan dnia")
            pg.wait_for_timeout(1200)
            home = pg.inner_text(".p2-home")
            ok("Plan dnia: reviews panel with Kostka", "Powtórki z Koła" in home and "Kostka" in home, home.replace("\n", " | "))
            tip = pg.inner_text("#p2-endtip") if pg.locator("#p2-endtip").count() else ""
            ok("end of session: back to the first new thing of today", tip.startswith("Na koniec: wróć na chwilę do pierwszej nowej rzeczy z dziś:"), tip)
            pg.screenshot(path=str(shots / "p2-09-home.png"))
            if tip:
                pg.locator("#p2-endtip").get_by_role("button", name="Otwórz").click()
                pg.wait_for_timeout(500)
                ok("the tip opens the Koło", pg.locator(".kolo").count() == 1)
            pg.click("nav >> text=Plan dnia")
            pg.wait_for_timeout(900)
            ok("the tip is proposed once a day", pg.locator("#p2-endtip").count() == 0)

            # --- 8. Jam: Tercja na każdej zmianie, Tylko dźwięki akordu, Pytanie–odpowiedź -------------------------------
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(500)
            pg.get_by_role("radio", name="Ty: solo").click()
            pick_style(pg, "Pop")
            pg.locator("select.jam-prog").select_option("hymn")
            pg.locator(".jam-chal-pick select").select_option("third")
            third = {"C": 64, "G": 71, "Am": 72, "F": 69}
            fn_board = pg.evaluate("[...document.querySelectorAll('.jb-strip .cs')].map((c) => (c.className.match(/fn-([TSDX])/) || [])[1])")
            ok("Jam board: chords coloured by function", fn_board == ["T", "D", "T", "S"], str(fn_board))
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            seen = None
            missed = 0
            end = time.time() + 21
            while time.time() < end:
                name = pg.inner_text(".jb-name")
                if name != seen and name in third:
                    seen = name
                    if name == "F" and missed == 0:
                        missed = 1          # skip one change on purpose
                    else:
                        user.hit(third[name], 70, 0.15)
                time.sleep(0.01)
            chal = pg.inner_text(".jam-chal")
            mm = re.search(r"Tercja na zmianie: (\d+) z (\d+)", chal)
            ok("Jam: third on changes counted (one missed on purpose)", mm and int(mm.group(2)) >= 6 and int(mm.group(2)) - int(mm.group(1)) == 1, chal.replace("\n", " | "))
            ok("Jam: a plain line after a lap", re.search(r"Okrążenie \d+: \d+ z \d+ zmian z tercją\.", chal), chal.replace("\n", " | "))
            pg.locator(".jam-chal-pick select").select_option("ct")
            for n in [64, 67, 66, 72]:
                user.hit(n, 70, 0.1)
                time.sleep(0.2)
            pg.wait_for_timeout(300)
            chal = pg.inner_text(".jam-chal")
            ok("Jam: chord tones share, live", re.search(r"Dźwięki akordu: \d+ z 4", chal), chal.replace("\n", " | "))
            pg.screenshot(path=str(shots / "p2-10-jam-chal.png"))
            pg.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()
            pg.wait_for_timeout(500)
            # Pytanie–odpowiedź with the band (bass on its own channel): the piano is silent in your bars
            pg.locator("label:has-text('Perkusja i bas') input").check()
            pg.locator(".jam-chal-pick select").select_option("qa")
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            turns = []
            t_end = time.time() + 15
            while time.time() < t_end:
                tt = pg.inner_text(".jb-turn") if pg.locator(".jb-turn").count() else ""
                turns.append((time.time(), tt))
                time.sleep(0.03)
            pg.screenshot(path=str(shots / "p2-11-jam-qa.png"))
            pg.locator(".jam-actions").get_by_role("button", name="■ Stop", exact=True).click()
            kinds = {t for _, t in turns}
            ok("Pytanie–odpowiedź: the board says 'teraz ty' and 'słuchaj'", {"teraz ty", "słuchaj"} <= kinds, str(kinds))

            def state_at(t):
                st = ""
                for (x, s) in turns:
                    if x <= t:
                        st = s
                    else:
                        break
                return st
            # piano notes (channel 1, or the band's keys on channel 3; not the click) by what the board said a moment later (the board lags a bit)
            pn = [(t, s) for (t, s, n) in piano if s in (0x90, 0x92) and n != 96 and turns[0][0] + 0.5 < t < turns[-1][0] - 0.5]
            you = sum(1 for (t, _) in pn if state_at(t + 0.12) == "teraz ty" and state_at(t - 0.12) == "teraz ty")
            band = sum(1 for (t, _) in pn if state_at(t + 0.12) == "słuchaj")
            ok("the piano is silent in your bars (audible gap)", band >= 6 and you == 0, f"band={band} you={you}")
            chal = pg.inner_text(".jam-chal")
            ok("answers counted", re.search(r"Odpowiedzi .*: \d+ z \d+", chal), chal.replace("\n", " | "))

            # --- 9. Piosenki: chart numbers coloured, neutral for borrowed chords --------------------------------------
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(600)
            n_fn = pg.locator(".sc-ch i.fn").count()
            ok("Piosenki: chart numbers coloured by function", n_fn >= 4, f"{n_fn}")
            pg.screenshot(path=str(shots / "p2-12-piosenki.png"))

            # saved data: nothing lost, the review state is there
            pg.wait_for_timeout(1200)
            m = mastery()
            ok("server data: lapsed scale stage 2 due tomorrow, removed card untouched", m["major0|gama|dur|rh"]["stage"] == 2 and m["major0|gama|dur|rh"]["due"] == D(1) and "major5|prog|usunieta" in m)

            # --- 10. Phone: no horizontal overflow on the changed cards ---------------------------------------------------
            dev = dict(p.devices["iPhone 13 Pro Max"])
            for orient, vp in [("land", {"width": dev["viewport"]["height"], "height": dev["viewport"]["width"]}), ("port", dev["viewport"])]:
                ctx = b.new_context(**dict(dev, viewport=vp))
                ph = ctx.new_page()
                ph.route("https://fonts.googleapis.com/**", fonts)
                ph.route("https://fonts.gstatic.com/**", fonts)
                ph.on("pageerror", lambda e: errors.append("phone: " + str(e)))
                ph.goto("http://127.0.0.1:47810/")
                ph.wait_for_timeout(1500)
                over = []
                for tab in ["Gama", "Akordy", "Progresje", "Akompaniament"]:
                    ph.get_by_role("tab", name=tab).tap()
                    ph.wait_for_timeout(300)
                    w = ph.evaluate("(() => { const s = document.querySelector('.stage'); return [document.documentElement.scrollWidth, innerWidth, s.scrollWidth, s.clientWidth] })()")
                    if w[0] > w[1] or w[2] > w[3] + 1:
                        over.append((tab, w))
                    ph.screenshot(path=str(shots / f"p2-ph-{orient}-{tab}.png"))
                ph.locator(".p2-dice").tap()
                ph.wait_for_timeout(500)
                w = ph.evaluate("(() => { const s = document.querySelector('.stage'); return [document.documentElement.scrollWidth, innerWidth, s.scrollWidth, s.clientWidth] })()")
                if w[0] > w[1] or w[2] > w[3] + 1:
                    over.append(("dice", w))
                ph.screenshot(path=str(shots / f"p2-ph-{orient}-dice.png"))
                ph.get_by_role("tab", name="Gama").tap()
                ph.wait_for_timeout(300)
                vis = ph.evaluate("(() => { const b = [...document.querySelectorAll('.play-row .btn.primary')][0]; const r = b.getBoundingClientRect(); return !!b.closest('#dockbar') && r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth })()")
                ok(f"phone {orient}: Gama play button always on screen (in the play bar)", vis)
                for v in ["Jam", "Plan dnia", "Fiszki"]:
                    ph.locator(".menu-btn").tap()
                    ph.wait_for_timeout(300)
                    ph.locator(".rail").get_by_text(v, exact=True).tap()
                    ph.wait_for_timeout(600)
                    w = ph.evaluate("(() => { const s = document.querySelector('.stage'); return [document.documentElement.scrollWidth, innerWidth, s.scrollWidth, s.clientWidth] })()")
                    if w[0] > w[1] or w[2] > w[3] + 1:
                        over.append((v, w))
                    ph.screenshot(path=str(shots / f"p2-ph-{orient}-{v.replace(' ', '')}.png"))
                ok(f"phone {orient}: no horizontal overflow", not over, str(over))
                ctx.close()
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print(f"SUMMARY {sum(results)}/{len(results)} OK")


if __name__ == "__main__":
    main()
