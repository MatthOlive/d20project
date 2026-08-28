const DATABASE_NAME = "d20-local-game-cache";
const STORE_NAME = "snapshots";
const DATABASE_VERSION = 1;
const MAX_MEMORY_SNAPSHOTS = 100;
const MAX_STORED_SNAPSHOTS = 250;
const PRUNE_EVERY_WRITES = 25;

export type LocalGameSnapshot<T> = {
  key: string;
  savedAt: number;
  data: T;
};

const memoryCache = new Map<string, LocalGameSnapshot<unknown>>();
let databasePromise: Promise<IDBDatabase | null> | null = null;
let writesSincePrune = 0;

function remember(snapshot: LocalGameSnapshot<unknown>) {
  memoryCache.delete(snapshot.key);
  memoryCache.set(snapshot.key, snapshot);
  while (memoryCache.size > MAX_MEMORY_SNAPSHOTS) {
    const oldestKey = memoryCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      database.onclose = () => {
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      resolve(null);
    };
    request.onblocked = () => {
      databasePromise = null;
      resolve(null);
    };
  });
  return databasePromise;
}

async function pruneStoredSnapshots(database: IDBDatabase) {
  const snapshots = await new Promise<LocalGameSnapshot<unknown>[]>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as LocalGameSnapshot<unknown>[]);
    request.onerror = () => resolve([]);
  });
  if (snapshots.length <= MAX_STORED_SNAPSHOTS) return;

  const staleKeys = snapshots
    .sort((left, right) => left.savedAt - right.savedAt)
    .slice(0, snapshots.length - MAX_STORED_SNAPSHOTS)
    .map((snapshot) => snapshot.key);
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const key of staleKeys) store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function readLocalGameSnapshot<T>(key: string): Promise<LocalGameSnapshot<T> | null> {
  const memoryValue = memoryCache.get(key) as LocalGameSnapshot<T> | undefined;
  if (memoryValue) return memoryValue;

  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const snapshot = request.result as LocalGameSnapshot<T> | undefined;
      if (snapshot) remember(snapshot as LocalGameSnapshot<unknown>);
      resolve(snapshot ?? null);
    };
    request.onerror = () => resolve(null);
  });
}

export async function writeLocalGameSnapshot<T>(key: string, data: T): Promise<void> {
  const snapshot: LocalGameSnapshot<T> = { key, savedAt: Date.now(), data };
  remember(snapshot as LocalGameSnapshot<unknown>);

  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(snapshot);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });

  writesSincePrune += 1;
  if (writesSincePrune >= PRUNE_EVERY_WRITES) {
    writesSincePrune = 0;
    void pruneStoredSnapshots(database);
  }
}
