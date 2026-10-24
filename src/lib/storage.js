// Two storage layers:
//  - localStorage for small, synchronous things (settings, API key)
//  - IndexedDB for chats and image attachments, which outgrow localStorage's ~5 MB quota fast
// Every access is wrapped: private windows, blocked site data and sandboxed previews can throw.

export const local = {
  get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const DB_NAME = 'charcoal';
const DB_VERSION = 1;
const STORES = ['kv', 'images'];

let dbPromise = null;
const memory = { kv: new Map(), images: new Map() }; // fallback when IndexedDB is unavailable

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDb();
  if (!db) return fn(null, memory[store]);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const req = fn(os, null);
      if (!req) {
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
        return;
      }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(fn(null, memory[store]));
    }
  });
}

function makeStore(store) {
  return {
    get: (key) => run(store, 'readonly', (os, mem) => (os ? os.get(key) : mem.get(key))),
    set: (key, value) =>
      run(store, 'readwrite', (os, mem) => {
        if (os) return os.put(value, key);
        mem.set(key, value);
        return undefined;
      }),
    del: (key) =>
      run(store, 'readwrite', (os, mem) => {
        if (os) return os.delete(key);
        mem.delete(key);
        return undefined;
      }),
  };
}

export const kv = makeStore('kv');
export const imageStore = makeStore('images');
