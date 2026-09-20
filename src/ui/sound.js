// Dezente Töne über WebAudio (keine Audiodateien). Wird nur bei aktivierter
// Einstellung aufgerufen; ohne AudioContext passiert nichts.
let ctx = null;

function context() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, { start = 0, duration = 0.08, type = 'sine', gain = 0.08 } = {}) {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + duration + 0.02);
}

const SOUNDS = {
  discard: () => tone(520, { duration: 0.05, type: 'triangle', gain: 0.05 }),
  claim: () => { tone(440, { duration: 0.09 }); tone(660, { start: 0.08, duration: 0.09 }); },
  call: () => { tone(880, { duration: 0.07, gain: 0.06 }); tone(880, { start: 0.12, duration: 0.07, gain: 0.06 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { start: i * 0.1, duration: 0.18, gain: 0.07 })),
  lose: () => { tone(330, { duration: 0.18, type: 'triangle' }); tone(262, { start: 0.15, duration: 0.25, type: 'triangle' }); },
};

export function playSound(name) {
  try { SOUNDS[name]?.(); } catch { /* ignorieren */ }
}
