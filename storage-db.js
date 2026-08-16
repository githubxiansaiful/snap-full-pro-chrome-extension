/**
 * SnapFull - IndexedDB & Storage Engine
 * Stores full-page screenshots in IndexedDB without touching chrome.storage.local quota.
 */

const DB_NAME = 'SnapFullDB';
const DB_VERSION = 1;
const STORE_SCREENSHOTS = 'screenshots';
const STORE_HISTORY = 'history';

class SnapDB {
  static dbInstance = null;

  static async getDB() {
    if (this.dbInstance) return this.dbInstance;

    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return resolve(null);
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_SCREENSHOTS)) {
          db.createObjectStore(STORE_SCREENSHOTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_HISTORY)) {
          const histStore = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
          histStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      req.onsuccess = () => {
        this.dbInstance = req.result;
        resolve(req.result);
      };

      req.onerror = () => {
        console.warn('IndexedDB open failed:', req.error);
        resolve(null);
      };

      req.onblocked = () => {
        console.warn('IndexedDB open blocked');
        resolve(null);
      };
    });
  }

  /**
   * Save screenshot item to IndexedDB & save light metadata to history
   */
  static async saveScreenshot(item) {
    // 1. Save lightweight metadata to history (Safe for chrome.storage.local, max 20 items, only thumbnails)
    try {
      const histMeta = {
        id: item.id,
        timestamp: item.timestamp,
        title: item.title || 'Screenshot',
        url: item.url || '',
        type: item.type || 'full',
        width: item.width || 0,
        height: item.height || 0,
        thumbnail: item.thumbnail || '' // Small compressed jpeg ~3-5kb
      };

      const res = await chrome.storage.local.get(['snapfull_history']);
      let list = res.snapfull_history || [];
      list.unshift(histMeta);
      if (list.length > 20) list = list.slice(0, 20);
      await chrome.storage.local.set({ snapfull_history: list });
    } catch (e) {
      console.warn('Could not save history to chrome.storage:', e);
    }

    // 2. Save full payload to IndexedDB
    try {
      const db = await this.getDB();
      if (!db) return true;

      const tx = db.transaction([STORE_SCREENSHOTS, STORE_HISTORY], 'readwrite');
      tx.objectStore(STORE_SCREENSHOTS).put(item);
      tx.objectStore(STORE_HISTORY).put({
        id: item.id,
        timestamp: item.timestamp,
        title: item.title,
        url: item.url,
        type: item.type,
        width: item.width,
        height: item.height,
        thumbnail: item.thumbnail || ''
      });

      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => {
          console.warn('IndexedDB tx error:', tx.error);
          resolve(true); // Don't crash capture flow
        };
        tx.onabort = () => resolve(true);
      });
    } catch (e) {
      console.warn('IndexedDB save failed:', e);
      return true;
    }
  }

  /**
   * Retrieve full screenshot by ID
   */
  static async getScreenshot(id) {
    try {
      const db = await this.getDB();
      if (!db) return null;

      const tx = db.transaction(STORE_SCREENSHOTS, 'readonly');
      const store = tx.objectStore(STORE_SCREENSHOTS);
      const req = store.get(id);

      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('IndexedDB get failed:', e);
      return null;
    }
  }

  /**
   * Get history list
   */
  static async getHistory(limit = 20) {
    // Check chrome.storage.local first
    try {
      const res = await chrome.storage.local.get(['snapfull_history']);
      if (res.snapfull_history && res.snapfull_history.length > 0) {
        return res.snapfull_history.slice(0, limit);
      }
    } catch (e) {}

    // Fallback to IndexedDB
    try {
      const db = await this.getDB();
      if (!db) return [];

      const tx = db.transaction(STORE_HISTORY, 'readonly');
      const store = tx.objectStore(STORE_HISTORY);
      const req = store.getAll();

      return new Promise((resolve) => {
        req.onsuccess = () => {
          let list = req.result || [];
          list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          resolve(list.slice(0, limit));
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * Delete screenshot by ID
   */
  static async deleteScreenshot(id) {
    try {
      const res = await chrome.storage.local.get(['snapfull_history']);
      if (res.snapfull_history) {
        const updated = res.snapfull_history.filter(h => h.id !== id);
        await chrome.storage.local.set({ snapfull_history: updated });
      }
    } catch (e) {}

    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction([STORE_SCREENSHOTS, STORE_HISTORY], 'readwrite');
      tx.objectStore(STORE_SCREENSHOTS).delete(id);
      tx.objectStore(STORE_HISTORY).delete(id);
    } catch (e) {}
  }

  /**
   * Clear all history & storage
   */
  static async clearAll() {
    try {
      await chrome.storage.local.remove(['snapfull_history']);
    } catch (e) {}

    try {
      const db = await this.getDB();
      if (!db) return;
      const tx = db.transaction([STORE_SCREENSHOTS, STORE_HISTORY], 'readwrite');
      tx.objectStore(STORE_SCREENSHOTS).clear();
      tx.objectStore(STORE_HISTORY).clear();
    } catch (e) {}
  }
}

// Global export
const globalScope = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis);
globalScope.SnapDB = SnapDB;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SnapDB;
}
