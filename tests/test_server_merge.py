"""Server merge of saved data (python3 tests/test_server_merge.py)."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("ts", Path(__file__).resolve().parent.parent / "trener_serwer.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
old = {"mastery": {"a": {"passes": 5, "stage": 3}, "b": {"passes": 1}}, "days": {"d1": {"sec": 100, "notes": 50}}, "settings": {"x": 1}}
new = {"mastery": {"a": {"passes": 2, "stage": 1}, "c": {"passes": 1}}, "days": {"d1": {"sec": 80, "notes": 70}, "d2": {"sec": 5}}, "settings": {"x": 2}}
r = m.merge_data(new, old)
assert r["mastery"]["a"]["stage"] == 3, r
assert set(r["mastery"]) == {"a", "b", "c"}, r
assert r["days"]["d1"] == {"sec": 100, "notes": 70}, r
assert r["settings"]["x"] == 2, r
stale = {"settings": {}, "modes": {}}          # an old tab from before "umiem"
assert m.merge_data(stale, old)["mastery"]["a"]["passes"] == 5
assert m.merge_data(new, {})["mastery"] == new["mastery"]
# songs: union by id, the newest copy wins, deleted stay deleted
o = {"songs": [{"id": "a", "title": "A"}, {"id": "b", "title": "B"}]}
n = {"songs": [{"id": "a", "title": "A2"}, {"id": "c", "title": "C"}]}
r = m.merge_data(n, o)
assert [s["id"] for s in r["songs"]] == ["a", "c", "b"] and r["songs"][0]["title"] == "A2", r
r2 = m.merge_data({"songs": [{"id": "a"}], "songsDeleted": ["b"]}, o)
assert [s["id"] for s in r2["songs"]] == ["a"], r2
r3 = m.merge_data({"settings": {}}, r2)          # an old window without songs
assert [s["id"] for s in r3["songs"]] == ["a"] and r3["songsDeleted"] == ["b"], r3
# settings and modes: per field the newer stamp wins; a window opened earlier cannot put old values back
srv = {"settings": {"clickOut": "ch16", "gain": 1.1, "key": {"i": 3}}, "modes": {"jam": {"tempo": 90}, "echo": {"level": 4}},
       "at": {"settings.clickOut": 2000, "settings.gain": 1000, "modes.echo": 3000}}
stale = {"settings": {"clickOut": "piano", "gain": 0.9, "key": {"i": 0}}, "modes": {"jam": {"tempo": 120}, "echo": {"level": 2}},
         "at": {"settings.clickOut": 500, "settings.gain": 1500, "modes.jam": 4000}}
r = m.merge_data(stale, srv)
assert r["settings"]["clickOut"] == "ch16" and r["at"]["settings.clickOut"] == 2000, r   # newer on the server stays
assert r["settings"]["gain"] == 0.9, r                                                  # newer in the window wins
assert r["settings"]["key"] == {"i": 0}, r                                              # unstamped: the window as before
assert r["modes"]["echo"]["level"] == 4 and r["modes"]["jam"]["tempo"] == 120, r
old_client = {"settings": {"clickOut": "piano"}, "modes": {}}                          # a window from before 1.5
r = m.merge_data(old_client, srv)
assert r["settings"]["clickOut"] == "ch16" and r["modes"]["echo"]["level"] == 4, r
print("merge OK")
