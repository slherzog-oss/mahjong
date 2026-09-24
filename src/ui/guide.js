// Guide-Tab: Tiles/Rules/Scoring/Points/FAQ plus unser Lexikon, Übungshände und Post-Game-Analyse.
import { t, getLanguage } from '../i18n/index.js';
import { WINDS, DRAGONS, FLOWERS, SEASONS } from '../core/tiles.js';
import { tileHtml } from './tiles.js';
import { renderLexicon } from './lexicon.js';
import { renderAnalysisList, renderAnalysis } from './analysis.js';

const L = (obj) => obj[getLanguage()] ?? obj.de;

const NAV = ['tiles', 'rules', 'scoring', 'points', 'faq'];

function tilesPage() {
  const suitRow = (base, suffix) => `<div class="tile-demo">${Array.from({ length: 9 }, (_, i) => tileHtml(base + i)).join('')}</div>`;
  return `
  <div class="guide-page">
    <p>${L({ de: 'Mahjong wird mit 136 Steinen gespielt: drei Farben 1–9, vier Winde, drei Drachen – dazu acht Bonussteine (Blumen und Jahreszeiten). Jede Art gibt es 4-mal, außer den Bonussteinen (je 1-mal).', en: 'Mahjong is played with 136 tiles: three suits 1–9, four winds, three dragons — plus eight bonus tiles (flowers and seasons). Each kind exists four times, except the bonus tiles (once each).' })}</p>
    <h3>${L({ de: 'Bambus', en: 'Bamboo' })}</h3>${suitRow(0)}
    <h3>${L({ de: 'Kreise', en: 'Circles' })}</h3>${suitRow(9)}
    <h3>${L({ de: 'Zeichen', en: 'Characters' })}</h3>${suitRow(18)}
    <h3>${L({ de: 'Winde', en: 'Winds' })}</h3>
    <div class="tile-demo">${WINDS.map((_, i) => tileHtml(27 + i)).join('')}</div>
    <h3>${L({ de: 'Drachen', en: 'Dragons' })}</h3>
    <div class="tile-demo">${DRAGONS.map((_, i) => tileHtml(31 + i)).join('')}</div>
    <h3>${L({ de: 'Blumen & Jahreszeiten', en: 'Flowers & seasons' })}</h3>
    <div class="tile-demo">${[...FLOWERS, ...SEASONS].map((_, i) => tileHtml(34 + i)).join('')}</div>
    <p class="muted small">${L({ de: 'Bonussteine gehören zu keinem Satz; sie werden sofort offen gelegt und bringen Zusatzpunkte, besonders wenn sie zum eigenen Sitzwind passen.', en: 'Bonus tiles belong to no set; they are revealed immediately and score extra, especially when they match your own seat.' })}</p>
  </div>`;
}

function rulesPage() {
  const steps = t('tut.steps');
  return `
  <div class="guide-page">
    ${steps.map((s) => `<div class="guide-card"><h3>${s.title}</h3><p>${s.text}</p></div>`).join('')}
  </div>`;
}

function pointsPage() {
  return `
  <div class="guide-page">
    <div class="guide-card">
      <h3>${L({ de: 'Chinese Classical', en: 'Chinese Classical' })}</h3>
      <p>${L({ de: 'Jede Hand ergibt Grundpunkte (aus Sätzen, Paar und Bonussteinen) und Verdopplungen. Grundpunkte × 2^Verdopplungen, gedeckelt beim Limit. Der Gewinner kassiert von allen drei anderen; Ost zahlt und bekommt doppelt.', en: 'Every hand earns base points (from sets, pair and bonus tiles) and doubles. Base points × 2^doubles, capped at the limit. The winner collects from all three others; East pays and receives double.' })}</p>
    </div>
    <div class="guide-card">
      <h3>${L({ de: 'Hong Kong Old Style', en: 'Hong Kong Old Style' })}</h3>
      <p>${L({ de: 'Nur der Gewinner zählt, in Fan. Die Fan-Zahl bestimmt über eine Umrechnungstabelle den Punktwert. Selbstzug: alle drei zahlen den Grundwert. Abwurf: nur der Abwerfende zahlt, je nach Einstellung doppelt oder dreifach.', en: 'Only the winner counts, in fan. The fan count maps to a point value via a conversion table. Self-draw: all three pay the base value. Discard: only the discarder pays, double or triple depending on the setting.' })}</p>
    </div>
    <div class="guide-card">
      <h3>${L({ de: 'Riichi', en: 'Riichi' })}</h3>
      <p>${L({ de: 'Han und Fu ergeben die Grundpunkte (Bo-Punkte-Tafel), gedeckelt bei Mangan/Haneman/Baiman/Sanbaiman/Yakuman. Tsumo: alle zahlen, Ost doppelt. Ron: nur der Abwerfende zahlt den vollen Betrag.', en: 'Han and fu map to base points via the standard scoring table, capped at mangan/haneman/baiman/sanbaiman/yakuman. Tsumo: everyone pays, East double. Ron: only the discarder pays the full amount.' })}</p>
    </div>
  </div>`;
}

function faqPage() {
  const items = [
    { q: { de: 'Was bedeutet "Rufen"?', en: 'What does "calling" mean?' }, a: { de: 'Wenn ein Gegner einen Stein abwirft, kannst du ihn beanspruchen: Chow (nur vom linken Nachbarn), Pung oder Kong (von jedem) oder Mahjong. Das öffnet deine Hand und macht sie meist weniger wert.', en: 'When an opponent discards a tile you can claim it: Chow (only from your left neighbour), Pung or Kong (from anyone) or Mahjong. This exposes your hand and usually lowers its value.' } },
    { q: { de: 'Was ist Shanten?', en: 'What is shanten?' }, a: { de: 'Die Anzahl der Steine, die deiner Hand noch fehlen, um bereit (fertig) zu sein. 0 = bereit, -1 = fertig/gewonnen.', en: 'How many tiles your hand is still missing before it is ready. 0 = ready, -1 = complete/won.' } },
    { q: { de: 'Was zeigt die Gewinnchance?', en: 'What does the win chance show?' }, a: { de: 'Eine Monte-Carlo-Simulation schätzt, wie wahrscheinlich du als Erster fertig wirst, bevor die Wand leer ist.', en: 'A Monte-Carlo simulation estimates how likely you are to finish first, before the wall runs out.' } },
    { q: { de: 'Was ist Furiten (Riichi)?', en: 'What is furiten (Riichi)?' }, a: { de: 'Wenn einer deiner eigenen Abwürfe unter deinen Wartesteinen ist, darfst du nicht per Ron gewinnen – nur noch per Selbstzug.', en: 'If one of your own discards is among your waits, you may not win by ron — only by self-draw.' } },
  ];
  return `<div class="guide-page">${items.map((it) => `<details class="faq-item"><summary>${L(it.q)}</summary><p>${L(it.a)}</p></details>`).join('')}</div>`;
}

export function renderGuide(ui, snap) {
  const g = ui.guide;
  if (g.section === 'lexicon') return renderLexicon(ui);
  if (g.section === 'analysis-list') return renderAnalysisList(ui);
  if (g.section === 'analysis') return renderAnalysis(ui);

  const page = g.section ?? 'tiles';
  const body = page === 'tiles' ? tilesPage()
    : page === 'rules' ? rulesPage()
    : page === 'points' ? pointsPage()
    : page === 'faq' ? faqPage()
    : '';
  return `
  <section class="screen guide-tab">
    <div class="guide-header"><h2>${t('tabs').guide}</h2></div>
    <nav class="guide-nav">
      ${NAV.map((id) => `<button class="chip${page === id ? ' active' : ''}" data-action="guide-nav" data-section="${id}">${t('guideNav')[id]}</button>`).join('')}
    </nav>
    ${body}
    <div class="guide-page">
      <div class="row" style="gap:8px;flex-wrap:wrap;">
        <button class="btn small" data-action="practice-list">${t('practiceTitle')}</button>
        <button class="btn small" data-action="analysis-list">${t('analysis')}</button>
      </div>
    </div>
  </section>`;
}
