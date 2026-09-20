// Schnelle Fertigstellungschance (Kettenmodell, PLAN.md 4.6).
//
// Die Hand muss (shanten + 1) Verbesserungen erreichen. Für Stufe j wird die
// Zahl nützlicher Steine u_j geschätzt: u_0 = aktuelles Ukeire, dann linear
// abnehmend bis zu einem typischen Warten von TENPAI_WAIT Steinen. Je eigenem
// Zug ist die Trefferwahrscheinlichkeit u_j / R_t, wobei die unbekannten Steine
// R_t pro Runde um 4 abnehmen (alle vier Spieler ziehen).
//
// Das ist eine Näherung für die Anzeige nach jedem Zug; die genaue
// Monte-Carlo-Rechnung folgt in Stufe 3.

export const TENPAI_WAIT = 5;

/**
 * @param shanten aktueller Shanten (>= 0; -1 → 1)
 * @param ukeireTotal gewichtetes Ukeire auf der aktuellen Stufe
 * @param unseen Zahl der unbekannten Steine (Wand + fremde Hände)
 * @param drawsLeft eigene verbleibende Züge
 * @returns Wahrscheinlichkeit 0..1
 */
export function completionChance({ shanten, ukeireTotal, unseen, drawsLeft }) {
  if (shanten < 0) return 1;
  if (drawsLeft <= 0 || unseen <= 0 || ukeireTotal <= 0) return 0;
  const stages = shanten + 1;
  const u = [];
  for (let j = 0; j < stages; j++) {
    const f = stages === 1 ? 0 : j / (stages - 1);
    u.push(Math.max(1, ukeireTotal * (1 - f) + TENPAI_WAIT * f));
  }
  // dp[j] = Wahrscheinlichkeit, genau j Stufen geschafft zu haben
  let dp = new Array(stages + 1).fill(0);
  dp[0] = 1;
  let R = unseen;
  for (let t = 0; t < drawsLeft && R > 0; t++) {
    const next = new Array(stages + 1).fill(0);
    for (let j = 0; j <= stages; j++) {
      if (dp[j] === 0) continue;
      if (j === stages) {
        next[j] += dp[j];
        continue;
      }
      const p = Math.min(1, u[j] / R);
      next[j + 1] += dp[j] * p;
      next[j] += dp[j] * (1 - p);
    }
    dp = next;
    R -= 4;
  }
  return dp[stages];
}

/** Eigene verbleibende Züge aus der lebenden Wand. */
export function drawsLeftFor(livingCount) {
  return Math.floor(livingCount / 4);
}
