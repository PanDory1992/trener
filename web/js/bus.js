// Connection to the local Trener server: live events (SSE) and playing notes.

const listeners = new Set();
// On another device (iPhone) the address carries the key: pass it on to every request.
import { toTrainerCh } from './outch.js';

const KEY = new URLSearchParams(location.search).get('k');
export function api(url) { return KEY ? `${url}${url.includes('?') ? '&' : '?'}k=${encodeURIComponent(KEY)}` : url; }
export const remote = !['127.0.0.1', 'localhost', '[::1]', ''].includes(location.hostname);
let offset = 0;          // server time - local time (s)
let offsetKnown = false;
let source = null;
export const link = { server: false, router: false };

function local() { return Date.now() / 1000; }
export function now() { return local() + offset; }

function noteClock(serverNow) {
  if (typeof serverNow !== 'number') return;
  const est = serverNow - local();
  // events arrive late, never early: the largest estimate is the closest one
  if (!offsetKnown || est > offset || Math.abs(est - offset) > 2) offset = est;
  offsetKnown = true;
}

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(e) { for (const fn of [...listeners]) { try { fn(e); } catch (err) { console.error(err); } } }

export function connect() {
  if (source) source.close();
  source = new EventSource(api('/api/events'));
  source.onopen = () => { link.server = true; emit({ t: 'server', up: true }); };
  source.onerror = () => {
    link.server = false; link.router = false;
    emit({ t: 'server', up: false });
  };
  source.onmessage = (msg) => {
    let e;
    try { e = JSON.parse(msg.data); } catch { return; }
    noteClock(e.now);
    if (e.t === 'link') link.router = !!e.router;
    if (e.t === 'state' || e.t === 'note' || e.t === 'welcome') link.router = true;
    emit(e);
  };
  fetch(api('/api/now')).then((r) => r.json()).then((j) => noteClock(j.now)).catch(() => {});
}

async function post(url, body) {
  const r = await fetch(api(url), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** Play events [{t, m}] starting `lead` seconds from now (or at server time `at`). Returns t0. */
export async function play(events, { lead = 0.35, at = null } = {}) {
  events = toTrainerCh(events);   // Trener's piano never plays on your channel 1
  const res = await post('/api/play', at ? { at, events } : { lead, events });
  noteClock(res.now);
  return res.t0;
}

export function stop() { return post('/api/stop', {}).catch(() => {}); }

/** Run fn at server time t (setTimeout based; fine for the UI). Returns a cancel function. */
export function at(t, fn) {
  const id = setTimeout(fn, Math.max(0, (t - now()) * 1000));
  return () => clearTimeout(id);
}

export async function getJSON(url) {
  const r = await fetch(api(url));
  return r.json();
}

export function saveData(obj) { return post('/api/data', obj); }
