"""Trener: local server between the browser UI and the router's UDP bus (07.11.2026).

Run by "Trener.bat". Listens on port 47810: this PC freely, other devices in the home
network (iPhone, another computer) only with the key from klucz-telefonu.txt
(open http://<PC>:47810/?k=<key> once; a cookie remembers it). --local-only: this PC only.
  GET  /                 the app (web/index.html)
  GET  /api/events       Server-Sent Events: every bus event + {"t":"link"} router status
  POST /api/play         {"lead":0.3,"events":[{"t":0.0,"m":[144,60,80]},...]}
                         or {"at":<unix time>,...}; returns {"t0":..,"now":..}
                         Notes are played on Pianoteq through the router at t0 + t.
  POST /api/stop         cancel everything scheduled, release held notes
  GET  /api/now          {"now": unix time} (the router's clock: same machine)
  GET  /api/data         saved progress (trener-dane.json)
  POST /api/data         save progress (atomic, daily backup)
  GET  /api/insights     a few numbers from notes.csv (last 3 days of playing)
  GET  /api/phone        (this PC only) the address with the key, for the QR code
Stdlib only, so it runs with the same Python as the router.
"""

from __future__ import annotations

import heapq
import json
import logging
import mimetypes
import os
import re
import secrets
import subprocess
import queue
import socket
import statistics
import sys
import threading
import time
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA_FILE = ROOT / "trener-dane.json"
NOTES_CSV = ROOT.parent / "notes.csv"
ROUTER = ("127.0.0.1", 47800)
HTTP_ADDR = ("0.0.0.0", 47810)
VERSION = "1.8"
KEY_FILE = ROOT / "klucz-telefonu.txt"
_build = {"at": 0.0, "id": ""}


def web_build() -> str:
    """A short fingerprint of the app files on disk: a page with another one is an old version."""
    now = time.time()
    if now - _build["at"] < 2 and _build["id"]:
        return _build["id"]
    import hashlib
    h = hashlib.sha1()
    for p in sorted(WEB.rglob("*")):
        if p.is_file():
            st = p.stat()
            h.update(f"{p.relative_to(WEB).as_posix()}|{st.st_size}|{st.st_mtime_ns}\n".encode())
    _build.update(at=now, id=h.hexdigest()[:12])
    return _build["id"]
LOCAL = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}
HELLO_EVERY = 3.0
ROUTER_SILENT_S = 4.0
IDLE_EXIT_S = 45 * 60          # no browser connected for this long: exit
MAX_EVENTS = 4000
BLACK = {1, 3, 6, 8, 10}

log = logging.getLogger("trener")


class Bus:
    """Listener on the router's bus, plus the note scheduler."""

    def __init__(self, router=ROUTER, name="trener"):
        self.router = router
        self.name = name
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        if hasattr(socket, "SIO_UDP_CONNRESET"):
            self.sock.ioctl(socket.SIO_UDP_CONNRESET, False)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.settimeout(0.25)
        self.clients: list[queue.Queue] = []
        self.clients_lock = threading.Lock()
        self.last_heard = 0.0
        self.linked = False
        self.last_client_seen = time.time()
        self.heap: list = []
        self.seq = 0
        self.held: set[tuple[int, int]] = set()
        self.cv = threading.Condition()
        self.stop_event = threading.Event()

    # --- browser side -----------------------------------------------------
    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=2000)
        with self.clients_lock:
            self.clients.append(q)
        self.last_client_seen = time.time()
        return q

    def unsubscribe(self, q):
        with self.clients_lock:
            if q in self.clients:
                self.clients.remove(q)
        self.last_client_seen = time.time()

    def broadcast(self, event: dict):
        data = json.dumps(event, separators=(",", ":"))
        with self.clients_lock:
            for q in list(self.clients):
                try:
                    q.put_nowait(data)
                except queue.Full:
                    pass

    # --- router side -------------------------------------------------------
    def send(self, msg: dict):
        try:
            self.sock.sendto(json.dumps(msg, separators=(",", ":")).encode(), self.router)
        except OSError:
            pass

    def listen(self):
        last_hello = 0.0
        while not self.stop_event.is_set():
            now = time.time()
            if now - last_hello >= HELLO_EVERY:
                self.send({"t": "hello", "name": self.name})
                last_hello = now
            linked = now - self.last_heard < ROUTER_SILENT_S
            if linked != self.linked:
                self.linked = linked
                self.broadcast({"t": "link", "router": linked, "now": now})
            try:
                data, _ = self.sock.recvfrom(16384)
            except (socket.timeout, OSError):
                continue
            self.last_heard = time.time()
            try:
                event = json.loads(data)
            except ValueError:
                continue
            if isinstance(event, dict):
                event["now"] = round(self.last_heard, 4)
                self.broadcast(event)

    # --- scheduler ------------------------------------------------------------
    def schedule(self, t0: float, events: list) -> int:
        n = 0
        with self.cv:
            for e in events[:MAX_EVENTS]:
                m = e.get("m") if isinstance(e, dict) else None
                t = e.get("t") if isinstance(e, dict) else None
                if (not isinstance(m, list) or len(m) != 3 or not all(isinstance(b, int) for b in m)
                        or m[0] & 0xE0 != 0x80 or not 0 <= m[1] < 128 or not 0 <= m[2] < 128
                        or not isinstance(t, (int, float)) or not 0 <= t < 900):
                    continue
                self.seq += 1
                heapq.heappush(self.heap, (t0 + float(t), self.seq, m))
                n += 1
            self.cv.notify()
        return n

    def stop_all(self):
        with self.cv:
            self.heap.clear()
            held = sorted(self.held)
            self.held.clear()
            self.cv.notify()
        if held:
            self.send({"t": "play", "midi": [[0x80 | ch, note, 0] for ch, note in held]})

    def player(self):
        # Coarse waits on the condition (Windows timer ~15 ms), the last <20 ms with
        # time.sleep, which Python 3.11+ runs on a high-resolution timer.
        while not self.stop_event.is_set():
            with self.cv:
                while not self.heap and not self.stop_event.is_set():
                    self.cv.wait(0.5)
                if self.stop_event.is_set():
                    return
                wait = self.heap[0][0] - time.time()
                if wait > 0.02:
                    self.cv.wait(wait - 0.016)
                    continue
            if wait > 0.0005:
                time.sleep(wait)
            with self.cv:
                batch = []
                now = time.time()
                while self.heap and self.heap[0][0] <= now + 0.001 and len(batch) < 64:
                    batch.append(heapq.heappop(self.heap)[2])
                for m in batch:
                    key = (m[0] & 0x0F, m[1])
                    if m[0] & 0xF0 == 0x90 and m[2] > 0:
                        self.held.add(key)
                    else:
                        self.held.discard(key)
            if batch:
                self.send({"t": "play", "midi": batch})

    def start(self):
        threading.Thread(target=self.listen, name="bus-listen", daemon=True).start()
        threading.Thread(target=self.player, name="bus-player", daemon=True).start()
        return self

    def close(self):
        self.stop_all()
        self.send({"t": "bye"})
        self.stop_event.set()
        with self.cv:
            self.cv.notify_all()


# --- insights from notes.csv ---------------------------------------------------
_insight_cache = {"at": 0.0, "value": None}


def insights(path: Path = NOTES_CSV, days: int = 3) -> dict:
    if time.time() - _insight_cache["at"] < 60 and _insight_cache["value"] is not None:
        return _insight_cache["value"]
    out = {"ok": False}
    try:
        size = path.stat().st_size
        with path.open("rb") as f:
            f.seek(max(0, size - 3_000_000))
            raw = f.read().decode("ascii", errors="ignore").splitlines()[1:]
        since = time.time() - days * 86400
        white, black, per_day = [], [], {}
        for line in raw:
            parts = line.split(",")
            if len(parts) < 4 or parts[1] != "on":
                continue
            try:
                t, note, vel = float(parts[0]), int(parts[2]), int(parts[3])
            except ValueError:
                continue
            if t < since:
                continue
            (black if note % 12 in BLACK else white).append(vel)
            day = datetime.fromtimestamp(t).date().isoformat()
            per_day[day] = per_day.get(day, 0) + 1
        if white or black:
            out = {
                "ok": True, "days": days, "notes": len(white) + len(black),
                "white_ones": round(sum(v == 1 for v in white) / max(1, len(white)), 4),
                "black_ones": round(sum(v == 1 for v in black) / max(1, len(black)), 4),
                "black_share": round(len(black) / max(1, len(white) + len(black)), 4),
                "white_median": statistics.median(white) if white else None,
                "per_day": per_day,
            }
    except OSError:
        pass
    _insight_cache.update(at=time.time(), value=out)
    return out


# --- saved progress --------------------------------------------------------------
data_lock = threading.Lock()


def load_data() -> dict:
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def merge_data(new: dict, old: dict) -> dict:
    """Two windows (computer + iPhone, or an old tab) each send their whole copy. Progress must never go back:
    per thing in "mastery" the record with more passes wins; per day the larger counters win."""
    out = dict(new)
    om, nm = old.get("mastery"), new.get("mastery")
    if isinstance(om, dict):
        merged = dict(om)
        for k, r in (nm or {}).items():
            o = om.get(k)
            if not isinstance(o, dict) or not isinstance(r, dict) or (r.get("passes") or 0) >= (o.get("passes") or 0):
                merged[k] = r
        out["mastery"] = merged
    # songs: a window that never saw a song must not drop it; a deleted song stays deleted
    gone = set(old.get("songsDeleted") or []) | set(new.get("songsDeleted") or [])
    if isinstance(old.get("songs"), list) or isinstance(new.get("songs"), list) or gone:
        by_id = {}
        for s in (old.get("songs") or []):
            if isinstance(s, dict) and s.get("id"):
                by_id[s["id"]] = s
        order = [s.get("id") for s in (new.get("songs") or []) if isinstance(s, dict)]
        for s in (new.get("songs") or []):
            if isinstance(s, dict) and s.get("id"):
                by_id[s["id"]] = s
        ids = order + [i for i in by_id if i not in order]
        out["songs"] = [by_id[i] for i in ids if i in by_id and i not in gone]
        out["songsDeleted"] = sorted(gone)
    od, nd = old.get("days"), new.get("days")
    if isinstance(od, dict):
        days = dict(od)
        for d, rec in (nd or {}).items():
            o = od.get(d)
            if isinstance(o, dict) and isinstance(rec, dict):
                m = dict(o)
                for f, v in rec.items():
                    m[f] = max(v, o[f]) if isinstance(v, (int, float)) and isinstance(o.get(f), (int, float)) else v
                days[d] = m
            else:
                days[d] = rec
        out["days"] = days
    # settings and modes: per field the newer change wins (data["at"]["settings.gain"] = ms); a window opened
    # earlier cannot put old values back. Windows without "at" (old version) never win over a stamped change.
    oa, na = old.get("at"), new.get("at")
    if isinstance(oa, dict):
        na = na if isinstance(na, dict) else {}
        at = dict(na)
        for unit, ots in oa.items():
            nts = na.get(unit)
            nts = nts if isinstance(nts, (int, float)) else 0
            if not isinstance(ots, (int, float)) or ots <= nts:
                continue
            part, _, name = unit.partition(".")
            src = old.get(part)
            if part not in ("settings", "modes") or not isinstance(src, dict) or name not in src:
                continue
            dst = out.get(part)
            dst = dict(dst) if isinstance(dst, dict) else {}
            dst[name] = src[name]
            out[part] = dst
            at[unit] = ots
        out["at"] = at
    return out


def save_data(obj: dict) -> dict:
    with data_lock:
        obj = merge_data(obj, load_data())
        backup = DATA_FILE.with_name(f"trener-dane.kopia-{date.today():%Y%m%d}.json")
        if DATA_FILE.exists() and not backup.exists():
            try:
                backup.write_bytes(DATA_FILE.read_bytes())
            except OSError:
                pass
        tmp = DATA_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, DATA_FILE)
        # keep the 10 newest daily backups
        old = sorted(ROOT.glob("trener-dane.kopia-*.json"))[:-10]
        for p in old:
            try:
                p.unlink()
            except OSError:
                pass
        return obj


# --- other devices -----------------------------------------------------------------------
def phone_key() -> str:
    try:
        k = KEY_FILE.read_text(encoding="utf-8").strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", k):
            return k
    except OSError:
        pass
    k = secrets.token_urlsafe(9)
    KEY_FILE.write_text(k + "\n", encoding="utf-8")
    return k


def lan_ips() -> list[str]:
    """Addresses of this PC in the home network, the likely one first."""
    out = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.255.255", 9))      # no packet is sent; picks the outgoing interface
        out.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in out:
                out.append(ip)
    except OSError:
        pass
    private = re.compile(r"^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)")
    return [ip for ip in out if private.match(ip)] or [ip for ip in out if not ip.startswith("127.")]


DENIED = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trener</title><body style="font-family:system-ui;background:#1b1830;color:#f1edf9;padding:28px;line-height:1.5">
<h1>Trener</h1><p>Ten adres potrzebuje klucza. Na komputerze, w oknie Trenera, kliknij <b>Na telefonie</b>
i zeskanuj kod QR aparatem.</p></body>"""


# --- HTTP ---------------------------------------------------------------------------
def make_handler(bus: Bus):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass

        def _json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 5_000_000:
                raise ValueError("too large")
            return json.loads(self.rfile.read(n) or b"{}")

        def _local(self):
            return self.client_address[0] in LOCAL

        def _allowed(self):
            """This PC always; other devices with the key (?k= in the URL, or the cookie it sets)."""
            if self._local():
                return True
            key = phone_key()
            k = parse_qs(urlparse(self.path).query).get("k", [""])[0]
            if k and secrets.compare_digest(k, key):
                return True
            cookie = self.headers.get("Cookie") or ""
            return any(c.strip() == f"trener_k={key}" for c in cookie.split(";"))

        def _deny(self):
            body = DENIED.encode("utf-8")
            self.close_connection = True       # an unread request body must not become the next request
            self.send_response(403)
            self.send_header("Connection", "close")
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlparse(self.path)
            path = url.path
            if not self._allowed():
                return self._deny()
            if path == "/api/phone":
                if not self._local():
                    return self._deny()
                ips = lan_ips()
                key = phone_key()
                return self._json({"key": key, "ips": ips, "urls": [f"http://{ip}:{HTTP_ADDR[1]}/?k={key}" for ip in ips]})
            if path == "/api/events":
                return self._events()
            if path == "/api/now":
                return self._json({"now": time.time(), "router": bus.linked, "version": VERSION, "build": web_build(), "remote": not self._local()})
            if path == "/api/data":
                return self._json(load_data())
            if path == "/api/insights":
                return self._json(insights())
            if path == "/":
                path = "/index.html"
            target = (WEB / path.lstrip("/")).resolve()
            if WEB.resolve() not in target.parents or not target.is_file():
                self.send_error(404)
                return
            body = target.read_bytes()
            # fixed types: the Windows registry sometimes maps .js/.css to text/plain
            ctype = {".js": "text/javascript", ".css": "text/css", ".html": "text/html",
                     ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png",
                     ".mp4": "video/mp4", ".ico": "image/x-icon"}.get(
                target.suffix, mimetypes.guess_type(target.name)[0] or "application/octet-stream")
            # byte ranges: Safari on iPhone plays video only from servers that support them
            status, total = 200, len(body)
            m = re.fullmatch(r"bytes=(\d*)-(\d*)", (self.headers.get("Range") or "").strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else total - 1
                else:
                    a = max(0, total - int(m.group(2))); b = total - 1
                b = min(b, total - 1)
                if a <= b:
                    status, body = 206, body[a:b + 1]
            self.send_response(status)
            self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text") else ""))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {a}-{b}/{total}")
            self.send_header("Cache-Control", "no-cache")
            if not self._local():
                # the key stays in the address (so "Add to Home Screen" keeps it) and in a cookie
                self.send_header("Set-Cookie", f"trener_k={phone_key()}; Max-Age=31536000; Path=/; SameSite=Lax")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            path = urlparse(self.path).path
            if not self._allowed():
                return self._deny()
            if path == "/api/quit":
                if not self._local():
                    return self._deny()
                self._json({"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            try:
                body = self._body()
            except (ValueError, json.JSONDecodeError):
                return self._json({"error": "bad json"}, 400)
            if path == "/api/play":
                now = time.time()
                t0 = body.get("at")
                if not isinstance(t0, (int, float)) or t0 < now - 1 or t0 > now + 600:
                    lead = body.get("lead", 0.25)
                    t0 = now + (lead if isinstance(lead, (int, float)) and 0 <= lead <= 10 else 0.25)
                n = bus.schedule(float(t0), body.get("events") or [])
                return self._json({"t0": t0, "now": now, "scheduled": n})
            if path == "/api/stop":
                bus.stop_all()
                return self._json({"ok": True})
            if path == "/api/data":
                if not isinstance(body, dict):
                    return self._json({"error": "object expected"}, 400)
                merged = save_data(body)
                return self._json({"ok": True, "mastery": merged.get("mastery", {}), "songs": merged.get("songs"),
                                   "settings": merged.get("settings"), "at": merged.get("at")})
            self.send_error(404)

        def _events(self):
            q = bus.subscribe()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            try:
                first = {"t": "link", "router": bus.linked, "now": time.time()}
                self.wfile.write(f"data: {json.dumps(first)}\n\n".encode())
                self.wfile.flush()
                while not bus.stop_event.is_set():
                    try:
                        data = q.get(timeout=5)
                        self.wfile.write(f"data: {data}\n\n".encode())
                    except queue.Empty:
                        self.wfile.write(f"data: {json.dumps({'t': 'tick', 'now': time.time()})}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                bus.unsubscribe(q)

    return Handler


class Server(ThreadingHTTPServer):
    # Windows lets a second process bind a port with SO_REUSEADDR: never use it there
    allow_reuse_address = os.name != "nt"


def take_over_port(port: int) -> bool:
    """False if this version already runs. An older Trener (before 1.2) is closed first."""
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/now", timeout=1.5) as r:
            info = json.loads(r.read() or b"{}")
    except Exception:
        return True                      # nothing there
    if info.get("version") == VERSION:
        return False
    if info.get("version"):              # 1.2+: ask it to quit
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/quit", data=b"{}", method="POST")
            urllib.request.urlopen(req, timeout=1.5).read()
        except Exception:
            pass
    elif os.name == "nt":                # 1.0/1.1 had no quit: end the process that listens on the port
        try:
            out = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True, timeout=5,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
            for line in out.splitlines():
                parts = line.split()
                # state names are translated in some Windows languages: a listening socket has no remote end
                if len(parts) >= 5 and parts[1].endswith(f":{port}") and parts[2] in ("0.0.0.0:0", "[::]:0") and parts[4].isdigit():
                    pid = int(parts[4])
                    if pid != os.getpid():
                        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, timeout=5,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                        log.info("Closed old Trener (pid %s)", pid)
        except Exception as e:
            log.warning("Could not close old Trener: %s", e)
    for _ in range(20):                  # wait until the port is free
        time.sleep(0.2)
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                pass
        except OSError:
            return True
    return True


def main(argv=None):
    argv = argv or sys.argv[1:]
    logging.basicConfig(filename=ROOT / "trener.log", level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    addr = ("127.0.0.1", HTTP_ADDR[1]) if "--local-only" in argv else HTTP_ADDR
    if not take_over_port(addr[1]):
        log.info("Trener %s already running", VERSION)
        return 0
    try:
        server = Server(addr, make_handler(bus := Bus().start()))
    except OSError as e:
        log.info("Port %s busy (%s): Trener already running", addr[1], e)
        return 0
    server.daemon_threads = True
    phone_key()
    log.info("Trener %s up on http://%s:%s (network: %s)", VERSION, *addr, ", ".join(lan_ips()))

    def watchdog():
        while True:
            time.sleep(30)
            with bus.clients_lock:
                busy = bool(bus.clients)
            if not busy and time.time() - bus.last_client_seen > IDLE_EXIT_S:
                log.info("No window open for %d min: exiting", IDLE_EXIT_S // 60)
                bus.close()
                server.shutdown()
                return

    if "--no-idle-exit" not in argv:
        threading.Thread(target=watchdog, daemon=True).start()
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        bus.close()
        log.info("Trener stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
