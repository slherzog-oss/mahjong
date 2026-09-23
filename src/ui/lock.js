// Einfache clientseitige Passwortsperre vor der App. Keine echte Sicherheit
// (statisches Hosting ohne Server) - hält nur zufällige Besucher fern.
const HASH_HEX = 'a0c5612d37ee0f460d61663c1545cc2f7d561d9b98e23964ca977ab062e295f2';
const STORAGE_KEY = 'mahjong.unlocked.v1';

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function isUnlocked() {
  try { return storage()?.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function setUnlocked() {
  try { storage()?.setItem(STORAGE_KEY, '1'); } catch { /* ignorieren */ }
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function tryUnlock(input) {
  const hex = await sha256Hex(input);
  const ok = hex === HASH_HEX;
  if (ok) setUnlocked();
  return ok;
}

export function renderLock(t, { error = false } = {}) {
  return `
  <section class="screen lock-screen">
    <div class="lock-card">
      <h1>${t('lock.title')}</h1>
      <p class="muted">${t('lock.subtitle')}</p>
      <input type="password" class="lock-input" placeholder="${t('lock.placeholder')}" autocomplete="current-password" autofocus>
      ${error ? `<p class="lock-error">${t('lock.wrong')}</p>` : ''}
      <button type="button" class="btn primary lock-submit" data-action="unlock">${t('lock.submit')}</button>
    </div>
  </section>`;
}
