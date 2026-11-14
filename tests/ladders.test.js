import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, AXES, LADDERS } from '../web/js/ladders.js';
import * as M from '../web/js/music.js';

test('every axis has a ladder starting at 1', () => {
  for (const [id, axes] of Object.entries(AXES)) for (const [a] of axes) assert.equal(LADDERS[id][a][0][0], 1, `${id}.${a}`);
});

test('describe: now per axis, next = the nearest unlock, tempo said', () => {
  const d = describe('echo', { melodia: 3.4, rytm: 2.9, dynamika: 1 });
  assert.equal(d.now[0].text, '3 sąsiednie dźwięki, 4 nuty');
  assert.match(d.now[1].text, /^ćwierćnuty, 78 BPM$/);
  assert.equal(d.now[2].off, true);                       // dynamics not yet
  assert.deepEqual(d.next, { label: 'Melodia', text: '5 dźwięków skali', at: 3.5 });
  const f = describe('echo', { melodia: 3, rytm: 3, dynamika: 4 }, { focus: 'dynamika' });
  assert.equal(f.now.length, 1);
  assert.equal(f.now[0].text, 'akcenty i tarasy');
});

test('ladder agrees with the echo generator', () => {
  for (const [lv, n] of [[1, 3], [2, 4], [4, 5], [6, 6], [8, 7], [10, 8]]) assert.equal(M.echoMotif({ melodia: lv, rytm: 1, dynamika: 1 }, 5).notes.length, n, `melodia ${lv}`);
  assert.equal(M.echoMotif({ melodia: 1, rytm: 3, dynamika: 1 }, 5).tempo, 78);
});
