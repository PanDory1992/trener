"""Weekly dynamics report from the router's note files (13.11).

The router writes every key event to ../notes/notes-RRRR-Wtt.csv (one file per ISO week):
    unix_time,on|off,note,raw_velocity,out_velocity[,driver_delta]
out_velocity is what the instrument got (after the touch curve); older lines may lack it.
Pure functions, no server state, so they can be tested on their own (tests/test_notes_report.py).
"""

from __future__ import annotations

import datetime
import statistics
from pathlib import Path

BLACK = {1, 3, 6, 8, 10}
# MIDI dynamics (ppp 16, pp 33, p 49, mp 64, mf 80, f 96, ff 112), split at the midpoints
LEVELS = [("ppp", 25), ("pp", 41), ("p", 57), ("mp", 72), ("mf", 88), ("f", 104), ("ff", 120), ("fff", 128)]
SPLIT_NOTE = 60          # below middle C = left hand (good enough for accompaniment + melody)
PHRASE_GAP = (0.05, 0.4)  # successive notes of one hand closer than 0.05 s are a chord, further than 0.4 s a new phrase
MIN_NOTES = 300          # fewer: too little to judge the week


def week_file(folder: Path, day: datetime.date) -> Path:
    y, w, _ = day.isocalendar()
    return folder / f"notes-{y}-W{w:02d}.csv"


def week_label(day: datetime.date) -> str:
    y, w, _ = day.isocalendar()
    return f"{y}-W{w:02d}"


def read_rows(path: Path, since: float = 0.0, max_bytes: int = 8_000_000) -> list[tuple]:
    """Note-ons as (t, note, raw, out). Missing or broken file = []."""
    rows = []
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            f.seek(max(0, size - max_bytes))
            lines = f.read().decode("ascii", errors="ignore").splitlines()
    except OSError:
        return rows
    for line in lines:
        p = line.split(",")
        if len(p) < 4 or p[1] != "on":
            continue
        try:
            t, note, raw = float(p[0]), int(p[2]), int(p[3])
            out = int(p[4]) if len(p) > 4 and p[4].strip() else raw
        except ValueError:
            continue
        if t >= since:
            rows.append((t, note, raw, out))
    rows.sort()
    return rows


def level(v: int) -> str:
    for name, top in LEVELS:
        if v < top:
            return name
    return "fff"


def _pct(sorted_vals: list[int], q: float) -> int:
    return sorted_vals[min(len(sorted_vals) - 1, int(q * len(sorted_vals)))]


def _mean(vals):
    return round(sum(vals) / len(vals), 1) if vals else None


def week_stats(rows: list[tuple]) -> dict:
    if not rows:
        return {"notes": 0}
    outs = sorted(r[3] for r in rows)
    lo, hi = _pct(outs, 0.1), _pct(outs, 0.9)
    shares = {name: 0 for name, _ in LEVELS}
    for v in outs:
        shares[level(v)] += 1
    shares = {k: round(n / len(outs), 3) for k, n in shares.items()}
    jumps = []
    last = {}
    for t, note, _raw, out in rows:
        hand = note < SPLIT_NOTE
        prev = last.get(hand)
        if prev and PHRASE_GAP[0] <= t - prev[0] <= PHRASE_GAP[1]:
            jumps.append(abs(out - prev[1]))
        last[hand] = (t, out)
    # black vs white on the raw (hand) values without the "1"s: the keyboard's black-key hole and the router's
    # black-key curve would otherwise look like the hand's fault (13.11 data: out -12, raw only -3)
    black = [r[2] for r in rows if r[1] % 12 in BLACK and r[2] > 1]
    white = [r[2] for r in rows if r[1] % 12 not in BLACK and r[2] > 1]
    black_out = [r[3] for r in rows if r[1] % 12 in BLACK]
    white_out = [r[3] for r in rows if r[1] % 12 not in BLACK]
    left = [r[3] for r in rows if r[1] < SPLIT_NOTE]
    right = [r[3] for r in rows if r[1] >= SPLIT_NOTE]
    minutes = len({int(r[0] // 60) for r in rows})
    return {
        "notes": len(rows), "minutes": minutes,
        "lo": lo, "hi": hi, "lo_level": level(lo), "hi_level": level(hi), "span": hi - lo,
        "median": statistics.median(outs), "levels": shares,
        "soft_share": round(sum(shares[k] for k in ("ppp", "pp", "p")), 3),
        "even": statistics.median(jumps) if jumps else None,
        "black": _mean(black), "white": _mean(white), "black_out": _mean(black_out), "white_out": _mean(white_out), "left": _mean(left), "right": _mean(right),
        "black_ones": round(sum(r[2] == 1 for r in rows if r[1] % 12 in BLACK) / max(1, len(black_out)), 4),
    }


def task_for(s: dict) -> dict:
    """One concrete task for the coming week: the biggest gap first."""
    if s.get("notes", 0) < MIN_NOTES:
        return {"title": "Najpierw pograj", "text": "W tym tygodniu jest za mało nut, żeby coś ocenić. Zagraj kilka razy po 15 minut.", "mode": "wolne"}
    if s["span"] < 30:
        return {"title": "Więcej kontrastu",
                "text": f"Grasz prawie wszystko między {s['lo_level']} a {s['hi_level']}. Zagraj skalę C-dur crescendo od pp do f i z powrotem, 5 razy dziennie.",
                "mode": "dynamika"}
    if s["soft_share"] < 0.15:
        return {"title": "Graj ciszej",
                "text": f"Tylko {round(s['soft_share'] * 100)}% nut jest w p lub ciszej. Codziennie jedna piosenka w całości piano.",
                "mode": "dynamika"}
    if s["left"] is not None and s["right"] is not None and s["left"] - s["right"] > 8:
        return {"title": "Lewa ręka ciszej",
                "text": f"Lewa ręka gra średnio o {round(s['left'] - s['right'])} głośniej niż prawa. Akompaniament ma być pod melodią: lewa p, prawa mf.",
                "mode": "wolne"}
    if s["black"] is not None and s["white"] is not None and abs(s["black"] - s["white"]) > 8:
        louder = "głośniej" if s["black"] > s["white"] else "ciszej"
        return {"title": "Czarne klawisze",
                "text": f"Czarne klawisze uderzasz średnio o {round(abs(s['black'] - s['white']))} {louder} niż białe. Ćwicz skale z czarnymi (Es-dur, As-dur), słuchając równości.",
                "mode": "echo"}
    if s["even"] is not None and s["even"] > 14:
        return {"title": "Równe nuty",
                "text": f"Sąsiednie nuty różnią się średnio o {s['even']}. Zagraj powoli równe ósemki na jednej dynamice, potem Echo.",
                "mode": "echo"}
    return {"title": "Dobra równowaga",
            "text": f"Zakres {s['lo_level']}–{s['hi_level']}, równe nuty. Utrzymaj to i dodaj jedną piosenkę z wyraźnym crescendo.",
            "mode": "piosenki"}


def week_report(folder: Path, today: datetime.date | None = None) -> dict:
    today = today or datetime.date.today()
    prev_day = today - datetime.timedelta(days=7)
    cur = week_stats(read_rows(week_file(folder, today)))
    prev = week_stats(read_rows(week_file(folder, prev_day)))
    return {"ok": cur["notes"] > 0 or prev["notes"] > 0, "week": week_label(today), "prev_week": week_label(prev_day),
            "cur": cur, "prev": prev, "task": task_for(cur if cur["notes"] >= MIN_NOTES or prev["notes"] < MIN_NOTES else prev),
            "task_from": "cur" if cur["notes"] >= MIN_NOTES or prev["notes"] < MIN_NOTES else "prev"}


def recent_rows(folder: Path, days: int = 3, today: datetime.date | None = None) -> list[tuple]:
    """Note-ons of the last `days` days (this week's file and, if needed, last week's)."""
    today = today or datetime.date.today()
    since = datetime.datetime.combine(today - datetime.timedelta(days=days - 1), datetime.time()).timestamp()
    files = {week_file(folder, today - datetime.timedelta(days=k)) for k in range(days)}
    rows = []
    for f in sorted(files):
        rows += read_rows(f, since)
    return sorted(rows)
