// "Pętla": when on, whatever the trainer plays repeats until you start playing (or press Stop).
import * as store from './store.js';

const fns = new Set();
export function loopOn() { return !!store.data.settings.loop; }
export function setLoop(v) {
  store.data.settings.loop = !!v;
  store.save();
  for (const fn of fns) fn(loopOn());
}
export function toggleLoop() { setLoop(!loopOn()); }
export function onLoop(fn) { fns.add(fn); return () => fns.delete(fn); }
