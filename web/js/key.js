// The key you are in, shared by the wheel, the jam and "Co ja gram?".
import * as store from './store.js';
import { keyAt, wheelIndex } from './theory.js';

const fns = new Set();

export function getKey() {
  const k = store.data.settings.key || { i: 0, mode: 'major' };
  return keyAt(k.i, k.mode);
}

export function setKey(key) {
  const i = wheelIndex(key);
  if (i < 0) return;
  store.data.settings.key = { i, mode: key.mode };
  store.save();
  for (const fn of fns) fn(getKey());
}

export function onKeyChange(fn) { fns.add(fn); return () => fns.delete(fn); }
