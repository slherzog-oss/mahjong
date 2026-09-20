// PWA-Schicht: Service-Worker-Registrierung, Update-Hinweis, Installations-Knopf,
// Wake Lock, Standalone-Erkennung. Alles optional; ohne Unterstützung passiert nichts.

export const pwa = {
  updateReady: false,
  installPrompt: null,
  installed: false,
  version: null,
  listeners: new Set(),
};

function emit() {
  for (const l of pwa.listeners) l(pwa);
}

export function onPwaChange(fn) {
  pwa.listeners.add(fn);
  return () => pwa.listeners.delete(fn);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return null;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    const track = (worker) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          pwa.updateReady = true;
          emit();
        }
      });
    };
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data?.type === 'version') {
        pwa.version = ev.data.version;
        emit();
      }
    });
    navigator.serviceWorker.controller?.postMessage('version');
    // Beim Sichtbarwerden nach Updates suchen
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    pwa.registration = reg;
    return reg;
  } catch (e) {
    console.warn('Service Worker nicht registriert', e);
    return null;
  }
}

export function applyUpdate() {
  const w = pwa.registration?.waiting;
  if (w) w.postMessage('skipWaiting');
}

export function checkForUpdate() {
  return pwa.registration?.update().catch(() => {}) ?? Promise.resolve();
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  pwa.installPrompt = ev;
  emit();
});
window.addEventListener('appinstalled', () => {
  pwa.installed = true;
  pwa.installPrompt = null;
  emit();
});

export async function promptInstall() {
  const ev = pwa.installPrompt;
  if (!ev) return false;
  ev.prompt();
  const res = await ev.userChoice.catch(() => null);
  pwa.installPrompt = null;
  emit();
  return res?.outcome === 'accepted';
}

// Wake Lock während einer laufenden Hand
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* nicht verfügbar */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pwa.wantAwake) keepAwake(true);
});

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* ignorieren */ }
}
