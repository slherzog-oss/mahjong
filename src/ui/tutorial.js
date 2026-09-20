// Einführung (Tutorial) als Schritt-Overlay; einmal beim ersten Start, danach
// über die Einstellungen abrufbar.
import { t } from '../i18n/index.js';

export function renderTutorial(step) {
  const steps = t('tut.steps');
  const s = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  return `
  <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="tut-title">
    <div class="dialog">
      <div class="dots">${steps.map((_, i) => `<span class="dot${i === step ? ' on' : ''}"></span>`).join('')}</div>
      <h3 id="tut-title">${s.title}</h3>
      <p>${s.text}</p>
      <div class="dialog-actions">
        <button class="btn small" data-action="tutorial-skip">${t('tut.skip')}</button>
        <button class="btn primary" data-action="${last ? 'tutorial-done' : 'tutorial-next'}">${last ? t('tut.done') : t('tut.next')}</button>
      </div>
    </div>
  </div>`;
}
