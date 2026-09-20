// Web Worker für rechenintensive Analysen (Monte-Carlo, Post-Game-Analyse).
// Nachrichten: { id, type: 'mc', state, seat, runs } → { id, type: 'mc', result }
//              { id, type: 'analyze', record, seat } → { id, type: 'analyze', result }
import { simulate } from './montecarlo.js';
import { analyzeGame } from '../replay/analyzer.js';

self.onmessage = (ev) => {
  const { id, type } = ev.data;
  try {
    if (type === 'mc') {
      const { state, seat, runs } = ev.data;
      self.postMessage({ id, type, result: simulate(state, seat, { runs, seed: `${state.seed}-${state.log.length}` }) });
    } else if (type === 'analyze') {
      const { record, seat } = ev.data;
      const result = analyzeGame(record, { seat, onProgress: (done, total) => self.postMessage({ id, type: 'progress', done, total }) });
      self.postMessage({ id, type, result });
    }
  } catch (e) {
    self.postMessage({ id, type, error: e.message });
  }
};
