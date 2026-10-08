// Card file storage for static (localStorage) mode.
// xlsx files are too large for localStorage's ~5 MB quota, so card
// binaries live in IndexedDB and only metadata stays in the state JSON.

const DB_NAME = "coc-web-db";
const STORE = "cards";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export function idbPutCard(pcId: string, buf: ArrayBuffer): Promise<unknown | null> {
  return withStore("readwrite", (s) => s.put(buf, pcId));
}

export function idbGetCard(pcId: string): Promise<ArrayBuffer | null> {
  return withStore("readonly", (s) => s.get(pcId) as IDBRequest<ArrayBuffer>);
}

export function idbDeleteCard(pcId: string): Promise<unknown | null> {
  return withStore("readwrite", (s) => s.delete(pcId));
}
