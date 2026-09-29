import type { AppData } from '../types.js';

const DB_NAME = 'nourish-memory';
const DB_VERSION = 1;
const STORE = 'state';
const KEY = 'app';
const LOCAL_FALLBACK = 'nourish-memory-app-v1';

function indexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local database.'));
  });
}

export async function loadLocalData(): Promise<AppData | null> {
  if (!indexedDbAvailable()) return loadFallback();
  try {
    const db = await openDb();
    const value = await new Promise<AppData | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as AppData | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('Could not read local data.'));
    });
    db.close();
    return value;
  } catch {
    return loadFallback();
  }
}

export async function saveLocalData(data: AppData): Promise<void> {
  if (!indexedDbAvailable()) return saveFallback(data);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save local data.'));
    });
    db.close();
  } catch {
    saveFallback(data);
  }
}

function loadFallback(): AppData | null {
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK);
    return raw ? JSON.parse(raw) as AppData : null;
  } catch { return null; }
}

function saveFallback(data: AppData): void {
  try { localStorage.setItem(LOCAL_FALLBACK, JSON.stringify(data)); } catch { /* storage may be unavailable */ }
}
