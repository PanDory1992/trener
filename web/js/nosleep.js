// Keep the iPhone screen on while Trener is open on it.
// The Wake Lock API needs https, which a home server does not have, so on other devices
// a silent, invisible looping video does the job (it must be started by a tap).
import { remote } from './bus.js';

let video = null;
let lock = null;

async function viaWakeLock() {
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
    return true;
  } catch { return false; }
}

function viaVideo() {
  if (!video) {
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.loop = true;
    video.title = 'Trener';
    video.src = 'cisza.mp4';
    Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: '0', bottom: '0' });
    document.body.append(video);
  }
  return video.play().then(() => true).catch(() => false);
}

async function keepAwake() {
  if (lock) return;
  if ('wakeLock' in navigator && window.isSecureContext && await viaWakeLock()) return;
  await viaVideo();
}

export function install() {
  if (!remote) return;            // the PC screen has its own power settings
  const kick = () => { keepAwake(); };
  document.addEventListener('pointerdown', kick, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
}
