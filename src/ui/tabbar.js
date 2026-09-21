// Schwebende Tab-Leiste am unteren Rand: Play / Guide / Calculator / Settings.
import { t } from '../i18n/index.js';

const TABS = [
  { id: 'play', icon: '🀄', key: 'play' },
  { id: 'guide', icon: '📘', key: 'guide' },
  { id: 'calculator', icon: '🧮', key: 'calculator' },
  { id: 'settings', icon: '⚙️', key: 'settings' },
];

export function renderTabBar(active) {
  const labels = t('tabs');
  return `
  <nav class="tabbar">
    <div class="tabbar-inner">
      ${TABS.map((tb) => `
        <button class="tab-btn${active === tb.id ? ' active' : ''}" data-action="tab" data-tab="${tb.id}" aria-current="${active === tb.id ? 'page' : 'false'}">
          <span class="tab-icon" aria-hidden="true">${tb.icon}</span>
          <span class="tab-label">${labels[tb.key]}</span>
        </button>`).join('')}
    </div>
  </nav>`;
}
