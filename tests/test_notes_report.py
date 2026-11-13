"""python3 tests/test_notes_report.py  ->  ALL OK"""
import datetime
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import notes_report as nr  # noqa: E402

ok = True


def check(name, cond):
    global ok
    if not cond:
        ok = False
        print("BAD", name)


def write(folder, day, rows):
    f = nr.week_file(folder, day)
    f.write_text("".join(f"{t:.4f},{k},{n},{raw},{out},0.0\n" for t, k, n, raw, out in rows), encoding="ascii")


day = datetime.date(2026, 11, 13)
t0 = datetime.datetime(2026, 11, 13, 18).timestamp()
with tempfile.TemporaryDirectory() as d:
    folder = Path(d)
    check("no files", nr.week_report(folder, day)["ok"] is False)
    # this week: 400 notes, all mf, both hands, steady -> "more contrast"
    rows = []
    for i in range(400):
        note = 48 if i % 2 else 72
        rows += [(t0 + i * 0.25, "on", note, 90, 80), (t0 + i * 0.25 + 0.1, "off", note, 0, "")]
    write(folder, day, rows)
    r = nr.week_report(folder, day)
    check("ok", r["ok"] and r["cur"]["notes"] == 400 and r["prev"]["notes"] == 0)
    check("levels", r["cur"]["lo_level"] == r["cur"]["hi_level"] == "mf" and r["cur"]["span"] == 0)
    check("task contrast", r["task"]["title"] == "Więcej kontrastu" and r["task"]["mode"] == "dynamika")
    check("hands", r["cur"]["left"] == r["cur"]["right"] == 80)
    # left louder by 20 with a wide range -> "left hand softer"
    rows = []
    for i in range(400):
        left = i % 2 == 1
        v = (30 + (i * 7) % 90)
        rows.append((t0 + i * 0.25, "on", 40 if left else 70, v + (20 if left else 0), v + (20 if left else 0)))
    write(folder, day, rows)
    r = nr.week_report(folder, day)
    check("task left", r["task"]["title"] == "Lewa ręka ciszej")
    # black "1"s and a curve that lowers black keys do not blame the hand
    rows = []
    for i in range(400):
        black = i % 2 == 1
        v = 25 + (i * 11) % 90
        raw = 1 if black and i % 10 == 1 else v
        rows.append((t0 + i * 0.25, "on", 61 if black else 60, raw, v - (15 if black else 0)))
    write(folder, day, rows)
    s = nr.week_report(folder, day)["cur"]
    check("black raw", abs(s["black"] - s["white"]) < 8 and s["black_out"] < s["white_out"] - 10)
    check("black ones", 0.15 < s["black_ones"] < 0.25)
    # old 5-column lines and junk are read
    nr.week_file(folder, day).write_text("x\n1794600000.0,on,60,50\n1794600001.0,on,62,60,70\nbad,line\n", encoding="ascii")
    rr = nr.read_rows(nr.week_file(folder, day))
    check("old lines", rr == [(1794600000.0, 60, 50, 50), (1794600001.0, 62, 60, 70)])
    check("level", nr.level(1) == "ppp" and nr.level(64) == "mp" and nr.level(127) == "fff")
    # little playing: a task to play, not a verdict
    check("few", nr.task_for(nr.week_stats(rr))["title"] == "Najpierw pograj")

print("ALL OK" if ok else "FAILURES")
