// Free play block: no grading, just a mirror of how you play.
import { DYN } from '../music.js';
import { el, status, fill, add } from '../ui.js';

export const id = 'wolne';
const BANDS = [['pp', 0, 40], ['p', 40, 56], ['mp', 56, 70], ['mf', 70, 86], ['f', 86, 104], ['ff', 104, 128]];

export function mount(stage) {
  const vels = [];
  let count = 0;
  const bars = el('div', { class: 'dyn-bars' });
  const counter = el('div', { class: 'stat big' }, el('b', {}, '0'), el('span', {}, 'nut'));
  add(stage, 
    el('header', { class: 'mode-head' }, el('div', { class: 'mode-title' },
      el('h1', {}, 'Granie dla przyjemności'),
      el('p', { class: 'mode-sub' }, 'Zagraj, co lubisz. Bez oceniania. Obok widać tylko, jakich głośności używasz: im szerszy wachlarz, tym więcej muzyki.'))),
    el('div', { class: 'status-wrap' }, status('Graj.', 'turn')),
    el('div', { class: 'free-wrap' }, counter, bars));
  render();

  function render() {
    const recent = vels.slice(-80);
    const max = Math.max(1, ...BANDS.map(([, lo, hi]) => recent.filter((v) => v >= lo && v < hi).length));
    fill(bars, ...BANDS.map(([name, lo, hi]) => {
      const n = recent.filter((v) => v >= lo && v < hi).length;
      return el('div', { class: 'dyn-bar' }, el('i', { style: { height: `${(n / max) * 100}%` } }), el('span', {}, name));
    }));
    counter.querySelector('b').textContent = String(count);
  }

  return {
    onNote(e) { if (e.on) { vels.push(e.vel); count++; render(); } },
    destroy() {},
  };
}
void DYN;
