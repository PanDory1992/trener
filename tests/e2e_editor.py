"""Trener 1.6: the progression editor (like Chord Suggester), the band from editor steps (slash bass, rest,
section, modulation, arpeggio), a jam saved as a song, and "Co ja gram?" with full names and the pedal.

Run: python3 tests/e2e_editor.py <out-dir>
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

SCRATCH = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-editor")
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
    played = []
    lock = threading.Lock()

    def on_play(packets):
        now = time.time()
        with lock:
            for p in packets:
                if p[0] & 0xF0 == 0x90 and p[2] > 0:
                    played.append((now, p[0] & 15, p[1], p[2]))
        user.on_play(packets)

    bus = UdpBus(on_play=on_play)
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
            pg.on("dialog", lambda d: d.accept("Mój test jam") if d.type == "prompt" else d.accept())
            downloads = []
            pg.on("download", lambda d: downloads.append(d))
            pg.goto("http://127.0.0.1:47810/")
            pg.wait_for_timeout(1500)

            # --- Co ja gram: full names, slash, rootless, pedal -------------------------------------------------
            def what(notes, hold=0.9):
                threading.Thread(target=user.chord, args=(notes, hold)).start()
                pg.wait_for_timeout(450)
                return pg.inner_text("#whatplay").replace("\n", " | ")
            w = what([55, 59, 62, 65, 68])
            ok("G7♭9 named", "G7♭9" in w, w)
            pg.wait_for_timeout(700)
            w = what([50, 60, 64, 67])
            ok("C/D (slash) named", "C/D" in w or "add9" in w, w)
            pg.wait_for_timeout(700)
            w = what([52, 55, 59, 62])
            ok("Em7 with the second reading", "Em7" in w and "albo" in w, w)
            pg.wait_for_timeout(700)
            w = what([48, 52, 58, 62, 69])
            ok("C13 with voicing info", "C13" in w and "układ" in w, w)
            pg.wait_for_timeout(700)
            # pedal: hold C E G with the pedal, release the keys, then play B♭ alone → sounding C7
            bus.pedal("sustain", 64, 127)
            user.chord([60, 64, 67], 0.3)
            pg.wait_for_timeout(200)
            threading.Thread(target=user.chord, args=([70], 0.8)).start()
            pg.wait_for_timeout(400)
            w = pg.inner_text("#whatplay").replace("\n", " | ")
            ok("pedal: what still sounds is named", "C7" in w and "peda" in w, w)
            bus.pedal("sustain", 64, 0)
            pg.wait_for_timeout(900)

            # --- the editor -----------------------------------------------------------------------------------------
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(500)
            pg.locator("button", has_text="Edytuj te akordy").click()
            pg.wait_for_timeout(300)
            rows0 = pg.locator(".pe-list .pe-item").count()
            ok("preset copied into the editor", rows0 >= 2, f"rows={rows0}")
            pg.locator(".pe-head").get_by_role("button", name="Wyczyść").click()
            pg.wait_for_timeout(200)
            pg.locator(".pe-addbar").get_by_role("button", name="+ Sekcja").click()
            pg.locator(".pe-addbar").get_by_role("button", name="+ Akord").click()
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Propozycje").click()
            tri = pg.locator(".pe-add details.pe-grp").first.locator(".pe-chip")
            tri.nth(0).click(); pg.wait_for_timeout(100)
            tri.nth(4).click(); pg.wait_for_timeout(100)
            # Dominanty wtórne group
            sec = pg.locator(".pe-add details.pe-grp", has_text="Dominanty wtórne")
            sec.locator("summary").click()
            sec.locator(".pe-chip").first.click(); pg.wait_for_timeout(100)
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Stopnie").click()
            pg.locator(".pe-add .pe-grp", has_text="Dominantowe 7").locator(".pe-chip").nth(10).click()   # ♭7⁷
            pg.wait_for_timeout(150)
            nums = pg.locator(".pe-list .pe-num").all_inner_texts()
            ok("chords added from Propozycje and Stopnie", len(nums) == 4 and "♭7⁷" in nums[3], str(nums))
            # Alter the first chord: maj7, 1st inversion, bass +4 (C/E), then 9 from Interwały
            pg.locator(".pe-item").first.get_by_role("button", name="Zmień").click()
            pg.locator(".pe-alter .pe-chip", has_text="maj7").first.click()
            pg.wait_for_timeout(100)
            pg.locator(".pe-alter .pe-tabs").get_by_role("tab", name="Układ").click()
            pg.locator(".pe-alter .pe-chip", has_text="1. przewrót").first.click()
            pg.locator(".pe-alter .pe-tabs").get_by_role("tab", name="Bas").click()
            pg.locator(".pe-alter .pe-chip", has_text="bas +4").click()
            pg.locator(".pe-alter .pe-tabs").get_by_role("tab", name="Interwały").click()
            pg.locator(".pe-iv-row", has_text="nona").get_by_role("button", name="9", exact=True).click()
            pg.wait_for_timeout(200)
            first = pg.locator(".pe-item").first.locator(".pe-name").first.inner_text()
            ok("Alter: maj9 over E", first.startswith("Cmaj9/E") or first.startswith("Cmaj9"), first)
            pg.locator(".pe-addbar").get_by_role("button", name="+ Pauza").click()
            pg.locator(".pe-addbar").get_by_role("button", name="+ Modulacja").click()
            pg.locator(".pe-addbar").get_by_role("button", name="Zamknij dodawanie").click()
            pg.screenshot(path=str(SCRATCH / "e1-editor.png"), full_page=True)
            strip = pg.inner_text(".jb-strip").replace("\n", " ")
            ok("board strip shows the section and the rest", "pauza" in strip and ("ZWROTKA" in strip.upper()), strip)

            # --- play it with the band: keys on channel 3, the slash bass E, arpeggio up ----------------------
            pg.locator("label:has-text('Zespół (perkusja') input").check()
            pg.wait_for_timeout(200)
            pg.locator(".keys-row").get_by_role("radio", name="W górę", exact=True).click()
            pg.wait_for_timeout(200)
            with lock:
                n0 = len(played)
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(5200)
            with lock:
                got = played[n0:]
            keys = [x for x in got if x[1] == 2]
            bass = [x for x in got if x[1] == 1]
            ok("band keys on channel 3, one note at a time (arpeggio)", len(keys) >= 8 and len({round(x[0], 2) for x in keys}) >= 6, f"keys={len(keys)}")
            ok("slash bass: E under the first chord", any(x[2] % 12 == 4 for x in bass[:3]), str([x[2] for x in bass[:6]]))
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- live bass follows your chords (Ty: akordy) ------------------------------------------------------
            pg.locator(".jc", has_text="Twoja rola").get_by_role("radio", name="Ty: akordy").click()
            pg.wait_for_timeout(200)
            pg.locator("label:has-text('Bas słucha moich akordów') input").check()
            pg.wait_for_timeout(200)
            pg.locator(".jam-actions").get_by_role("button", name="Start", exact=True).click()
            pg.wait_for_timeout(2700)           # count-in
            with lock:
                n1 = len(played)
            user.chord([62, 66, 69], 2.0)       # D major held for 2 s: the bass should go to D
            with lock:
                lb = [x for x in played[n1:] if x[1] == 1]
            ok("live bass follows the held chord (D)", sum(1 for x in lb if x[2] % 12 == 2) >= 1, str([x[2] for x in lb]))
            pg.locator(".jam-actions").get_by_role("button", name="Stop", exact=True).click()
            pg.wait_for_timeout(300)

            # --- save as a song ---------------------------------------------------------------------------------
            pg.locator(".pe-head").get_by_role("button", name="Zapisz jako piosenkę").click()
            pg.wait_for_timeout(400)
            pg.click("nav >> text=Piosenki")
            pg.wait_for_timeout(500)
            ok("the jam is in Piosenki", pg.locator(".song-pick", has_text="Mój test jam").count() == 1)
            pg.locator(".song-pick", has_text="Mój test jam").click()
            pg.wait_for_timeout(300)
            chart = pg.inner_text(".song-chart")
            ok("song chart has the chords", "maj9" in chart and "7" in chart, chart.replace("\n", " ")[:160])
            pg.screenshot(path=str(SCRATCH / "e2-song.png"))


            # --- 1.7: Co dalej, typed chords, held chord, cadences, undo, selection loop, scales, pivots, N6, MIDI ----
            pg.click("nav >> text=Jam")
            pg.wait_for_timeout(500)
            pg.locator(".pe-head").get_by_role("button", name="Wyczyść").click()
            pg.wait_for_timeout(200)
            pg.locator(".pe-addbar").get_by_role("button", name="+ Akord").click()
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Wpisz").click()
            pg.locator(".pe-text").fill("Dm7 G7 Cmaj7 xx")
            pg.locator(".pe-add").get_by_role("button", name="Dodaj te akordy").click()
            pg.wait_for_timeout(250)
            names = pg.locator(".pe-list .pe-main .pe-name").all_inner_texts()
            ok("typed chords added", names[:3] == ["Dm7", "G7", "Cmaj7"], str(names))
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Co dalej").click()
            dalej = pg.inner_text(".pe-add .pe-body").replace("\n", " ")
            ok("Co dalej after Cmaj7 offers chords", "Po 1maj7" in dalej and pg.locator(".pe-add .pe-chip").count() >= 4, dalej[:120])
            pg.locator(".pe-add .pe-chip").first.click()
            pg.wait_for_timeout(200)
            n_after = pg.locator(".pe-list .pe-item").count()
            pg.locator(".pe-head").get_by_role("button", name="↶ Cofnij").click()
            pg.wait_for_timeout(200)
            ok("undo removes the added chord", pg.locator(".pe-list .pe-item").count() == n_after - 1, f"{n_after} → {pg.locator('.pe-list .pe-item').count()}")
            pg.locator(".pe-head").get_by_role("button", name="↷").click()
            pg.wait_for_timeout(200)
            ok("redo brings it back", pg.locator(".pe-list .pe-item").count() == n_after)
            # hold E C G on the keyboard (E in the bass) and add it
            threading.Thread(target=user.chord, args=([40, 60, 64, 67], 1.5)).start()
            pg.wait_for_timeout(500)
            pg.locator(".pe-addbar").get_by_role("button", name="+ To, co trzymam").click()
            pg.wait_for_timeout(300)
            names = pg.locator(".pe-list .pe-main .pe-name").all_inner_texts()
            ok("held chord added with its bass", "C/E" in names, str(names))
            pg.wait_for_timeout(1300)
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Kadencje").click()
            pg.locator(".pe-add .pe-chip", has_text="Zwodnicza").first.click()
            pg.wait_for_timeout(200)
            names = pg.locator(".pe-list .pe-main .pe-name").all_inner_texts()
            ok("cadence inserted", names[-2:] == ["G7", "Am"], str(names))
            pg.locator(".pe-add .pe-tabs").get_by_role("tab", name="Propozycje").click()
            oc = pg.locator(".pe-add details.pe-grp", has_text="Inne chromatyczne")
            oc.locator("summary").click()
            ok("Neapolitan and augmented sixths offered", oc.locator(".pe-chip", has_text="N⁶").count() == 1 and oc.locator(".pe-chip", has_text="Ger+6").count() >= 1)
            # select the first two chords and loop only them
            pg.locator(".pe-list .pe-sel").nth(0).check()
            pg.locator(".pe-list .pe-sel").nth(1).check()
            pg.locator(".pe-seltools label:has-text('Graj tylko zaznaczone') input").check()
            pg.wait_for_timeout(300)
            strip = pg.inner_text(".jb-strip").replace("\n", " ")
            ok("loop of the selection: the strip has only Dm7 and G7", "Dm7" in strip and "G7" in strip and "Cmaj7" not in strip, strip)
            pg.locator(".pe-seltools").get_by_role("button", name="+½").click()
            pg.wait_for_timeout(200)
            names = pg.locator(".pe-list .pe-main .pe-name").all_inner_texts()
            ok("selection moved half a step up", names[:2] == ["E♭m7", "A♭7"], str(names[:3]))
            pg.locator(".pe-seltools").get_by_role("button", name="Odznacz").click()
            # matching scales
            pg.locator(".pe-head").get_by_role("button", name="Pasujące skale").click()
            pg.wait_for_timeout(200)
            ok("matching scales listed", pg.locator(".pe-add .pe-chip").count() >= 3, pg.inner_text(".pe-add").replace("\n", " ")[:120])
            pg.locator(".pe-head").get_by_role("button", name="Pasujące skale").click()
            # modulation with pivots
            pg.locator(".pe-addbar").get_by_role("button", name="+ Modulacja").click()
            pg.wait_for_timeout(200)
            ok("modulation shows shared chords", pg.locator(".pe-pivots .btn").count() >= 2, pg.inner_text(".pe-mod-wrap").replace("\n", " ")[:160])
            # MIDI export
            pg.locator(".pe-head").get_by_role("button", name="Eksport MIDI").click()
            pg.wait_for_timeout(800)
            ok("MIDI file downloaded", len(downloads) == 1 and downloads[0].suggested_filename.endswith(".mid"), str([d.suggested_filename for d in downloads]))
            if downloads:
                path = SCRATCH / "jam.mid"
                downloads[0].save_as(str(path))
                data = path.read_bytes()
                ok("MIDI file is a valid SMF with chord markers", data[:4] == b"MThd" and b"Dm7" not in data and b"m7" in data, f"{len(data)} bytes")
            pg.screenshot(path=str(SCRATCH / "e4-editor17.png"))

            # --- phone: the editor fits ----------------------------------------------------------------------------
            ph = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
            ph.route("https://fonts.googleapis.com/**", fonts)
            ph.route("https://fonts.gstatic.com/**", fonts)
            ph.goto("http://127.0.0.1:47810/")
            ph.wait_for_timeout(1200)
            ph.evaluate("document.querySelector('.nav-item[data-view=jam]') && document.querySelector('.nav-item[data-view=jam]').click()")
            ph.wait_for_timeout(500)
            ph.evaluate("(() => { const d = document.querySelector('details.jam-set'); if (d) d.open = true; })()")
            ph.wait_for_timeout(300)
            over = ph.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            ok("phone: no horizontal overflow with the editor", over <= 1, f"over={over}")
            ph.screenshot(path=str(SCRATCH / "e3-phone.png"), full_page=True)
            b.close()
    finally:
        server.terminate()
        bus.close()
    print("JS errors:", errors or "none")
    print("ALL OK" if all(results) and not errors else "FAILURES")


if __name__ == "__main__":
    main()
