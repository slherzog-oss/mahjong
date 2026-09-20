// Persistenz-Adapter: einheitliche asynchrone Schnittstelle über IndexedDB,
// localStorage oder Speicher (Tests). Alle Methoden liefern Promises.
//
//   adapter.get(store, key) → value | undefined
//   adapter.set(store, key, value)
//   adapter.remove(store, key)
//   adapter.list(store) → [{ key, value }]
//
// Stores: 'saves' (laufendes Spiel unter 'current'), 'archive' (beendete Partien).

export const DB_NAME = 'mahjong';
export const DB_VERSION = 1;
export const STORES = ['saves', 'archive'];

export function memoryAdapter() {
  const data = new Map(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    async get(store, key) { return data.get(store).get(key); },
    async set(store, key, value) { data.get(store).set(key, structuredClone(value)); },
    async remove(store, key) { data.get(store).delete(key); },
    async list(store) { return [...data.get(store)].map(([key, value]) => ({ key, value })); },
  };
}

export function localStorageAdapter(storage = globalThis.localStorage) {
  const k = (store, key) => `mahjong.${store}.${key}`;
  const prefix = (store) => `mahjong.${store}.`;
  return {
    kind: 'localStorage',
    async get(store, key) {
      const raw = storage.getItem(k(store, key));
      return raw == null ? undefined : JSON.parse(raw);
    },
    async set(store, key, value) { storage.setItem(k(store, key), JSON.stringify(value)); },
    async remove(store, key) { storage.removeItem(k(store, key)); },
    async list(store) {
      const out = [];
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (name.startsWith(prefix(store))) out.push({ key: name.slice(prefix(store).length), value: JSON.parse(storage.getItem(name)) });
      }
      return out;
    },
  };
}

export function indexedDbAdapter(idb = globalThis.indexedDB) {
  let dbPromise = null;
  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blockiert'));
      });
    }
    return dbPromise;
  }
  function tx(store, mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }
  return {
    kind: 'indexedDB',
    get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
    set: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)),
    remove: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
    async list(store) {
      const [keys, values] = await Promise.all([
        tx(store, 'readonly', (s) => s.getAllKeys()),
        tx(store, 'readonly', (s) => s.getAll()),
      ]);
      return keys.map((key, i) => ({ key, value: values[i] }));
    },
  };
}

/** Bester verfügbarer Adapter: IndexedDB → localStorage → Speicher. */
export function defaultAdapter() {
  try {
    if (globalThis.indexedDB) return indexedDbAdapter();
  } catch { /* weiter */ }
  try {
    if (globalThis.localStorage) return localStorageAdapter();
  } catch { /* weiter */ }
  return memoryAdapter();
}

/** Bittet den Browser, den Speicher nicht automatisch zu räumen. */
export async function requestPersistentStorage() {
  try {
    if (navigator?.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignorieren */ }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator?.storage?.estimate) return await navigator.storage.estimate();
  } catch { /* ignorieren */ }
  return null;
}
