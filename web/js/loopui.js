// The "Pętla" switch: the same state everywhere (dock, phone top bar, cards).
import { loopOn, onLoop, toggleLoop } from './loop.js';
import { el } from './ui.js';

const TITLE = 'Pętla: to, co gra Trener, powtarza się, aż zaczniesz grać albo naciśniesz Stop (klawisz L).';

/** A toggle button bound to the shared loop state. variant: 'chip' | 'dock' | 'mini' */
export function loopButton(variant = 'chip') {
  const b = el('button', {
    class: `loop-btn loop-${variant}`, type: 'button', title: TITLE, 'aria-pressed': String(loopOn()),
    onclick: () => toggleLoop(),
  },
  el('span', { class: 'loop-icon', 'aria-hidden': 'true' }, '⟳'),
  variant === 'mini' ? null : el('span', { class: 'loop-label' }, 'Pętla'));
  const sync = (on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
  sync(loopOn());
  const off = onLoop(sync);
  // stop listening once the button leaves the page
  const mo = new MutationObserver(() => { if (!b.isConnected) { off(); mo.disconnect(); } });
  queueMicrotask(() => { if (b.parentNode) mo.observe(document.body, { childList: true, subtree: true }); });
  return b;
}
