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

# --- the hand week by week (15.11): raw white keys, p10 and median, oldest first -------------------------
with tempfile.TemporaryDirectory() as d:
    folder = Path(d)
    for k, (soft, usual) in enumerate(((80, 100), (70, 98))):          # two weeks ago, then last week
        dd = day - datetime.timedelta(days=7 * (1 - k))
        tt = datetime.datetime.combine(dd, datetime.time(18)).timestamp()
        rows = [(tt + i * 0.3, "on", 72 if i % 4 else 73, soft if i % 3 == 0 else usual, 80) for i in range(400)]
        rows += [(tt + 500, "on", 72, 1, 10)] * 50                          # "1"s do not count
        write(folder, dd, rows)
    h = nr.week_report(folder, day)["hand"]
    check("hand: two weeks, oldest first", [x["week"] for x in h] == [nr.week_label(day - datetime.timedelta(days=7)), nr.week_label(day)])
    check("hand: p10 drops (black 73 and 1s ignored)", h[0]["p10"] == 80 and h[1]["p10"] == 70 and h[1]["median"] == 98)
    check("hand: cached", nr.hand_week(nr.week_file(folder, day)) is nr.hand_week(nr.week_file(folder, day)))

# --- 1.17 Zeszyt: the day's playing in phrases ------------------------------------------------------------------
with tempfile.TemporaryDirectory() as d:
    folder = Path(d)
    t0 = datetime.datetime.combine(day, datetime.time(20)).timestamp()
    rows = []
    for i in range(8):                                   # phrase 1: eight notes, each held 0.3 s
        rows += [(t0 + i * 0.5, "on", 60 + i, 70, 72), (t0 + i * 0.5 + 0.3, "off", 60 + i, 0, 0)]
    rows += [(t0 + 2.0, "on", 48, 60, 60), (t0 + 9.0, "off", 48, 0, 0)]      # a long bass note keeps it going
    rows += [(t0 + 20, "on", 72, 80, 80), (t0 + 20.2, "off", 72, 0, 0)] * 1    # phrase 2: too short, left out
    for i in range(6):                                   # phrase 3, after a pause
        rows += [(t0 + 30 + i, "on", 64, 90, 90), (t0 + 30 + i + 0.5, "off", 64, 0, 0)]
    rows += [(t0 - 86400, "on", 60, 50, 50)]             # yesterday: not today
    write(folder, day, sorted(rows))
    ph = nr.day_phrases(folder, day)
    check("phrases: two, the short one left out", [p["n"] for p in ph] == [9, 6])
    check("phrases: times from the start, lengths from the releases", ph[0]["notes"][0] == [60, 0.0, 0.3, 72] and [48, 2.0, 7.0, 60] in ph[0]["notes"])
    check("phrases: duration", ph[0]["dur"] == 9.0 and ph[1]["dur"] == 5.5)

print("ALL OK" if ok else "FAILURES")
