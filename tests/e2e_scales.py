"""Every scale chip on the Gama card renders and can be played (fake router not needed)."""
import subprocess, sys, time, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/trener-scales")
if OUT.exists(): shutil.rmtree(OUT)
app = OUT / "trener"
shutil.copytree(HERE.parent, app, ignore=shutil.ignore_patterns("tests", "klucz-telefonu.txt", "trener-dane*.json", "trener.log"))
srv = subprocess.Popen([sys.executable, str(app / "trener_serwer.py"), "--no-idle-exit"])
time.sleep(1.2)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.route("https://fonts.**", lambda r: r.fulfill(body="", content_type="text/css"))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto("http://127.0.0.1:47810/")
        pg.wait_for_timeout(1500)
        for key in ["C", "Am"]:
            ring = "outer" if key == "C" else "inner"
            pg.locator(f".sector.{ring}[data-key='{key}']").click()
            pg.wait_for_timeout(300)
            for i in range(pg.locator(".kcard .chips-row").first.locator(".pick").count()):
                chip = pg.locator(".kcard .chips-row").first.locator(".pick").nth(i)
                name = chip.inner_text()
                chip.click()
                pg.wait_for_timeout(150)
                steps = pg.locator(".gstep").count()
                title = pg.inner_text(".kcard-head h2")
                for hand in ["Lewa", "Obie", "Prawa"]:
                    pg.get_by_role("radio", name=hand).click()
                pg.get_by_role("button", name="Pokaż", exact=True).click()
                pg.wait_for_timeout(100)
                pg.get_by_role("button", name="■ Stop", exact=True).click()
                print(f"{key:3} {name:12} steps={steps:2}  {title}")
        b.close()
finally:
    srv.terminate()
print("JS errors:", errors or "none")
