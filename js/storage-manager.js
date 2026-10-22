/**
 * 離線圖資儲存管理器 (全面相容 iOS Safari 與 Android / 桌面端)
 * 使用 IndexedDB 儲存大型 PMTiles 二進位資料 (Blob)，避開 iOS Safari 不支援 OPFS createWritable 的問題
 */

export class StorageManager {
  constructor() {
    this.dbName = 'TaiwanRudyTopoDB';
    this.storeName = 'offline_maps';
    this.db = null;
  }

  /**
   * 初始化 IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'name' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[StorageManager] IndexedDB initialized successfully (iOS & Cross-platform compatible).');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[StorageManager] IndexedDB init error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * 取得已儲存的離線圖資檔案列表
   */
  async listOfflineMaps() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        const mapped = items.map((item) => ({
          name: item.name,
          size: item.size || (item.blob ? item.blob.size : 0),
          lastModified: item.lastModified || Date.now()
        }));
        resolve(mapped);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 將 File 或 Blob 物件儲存至 IndexedDB
   */
  async saveFile(fileName, fileOrBlob) {
    if (!this.db) await this.init();

    const record = {
      name: fileName,
      blob: fileOrBlob,
      size: fileOrBlob.size,
      lastModified: fileOrBlob.lastModified || Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`[StorageManager] Saved ${fileName} (${record.size} bytes) to IndexedDB.`);
        resolve(true);
      };

      request.onerror = (e) => {
        console.error('[StorageManager] Save file error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /**
   * 從 IndexedDB 取出 Blob 物件
   */
  async getFile(fileName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.storeName], 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(fileName);

      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          resolve(request.result.blob);
        } else {
          reject(new Error(`找不到圖資檔案「${fileName}」`));
        }
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 刪除已儲存的圖資
   */
  async deleteFile(fileName) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([this.storeName], 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(fileName);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * 線上下載圖資並存入 IndexedDB (使用 XMLHttpRequest 確保在 iOS Safari 進度回報與二進位串流最佳相容性)
   */
  async downloadAndStoreMap(url, targetFileName, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';

      xhr.onprogress = (event) => {
        if (onProgress && event.lengthComputable) {
          const loaded = event.loaded;
          const total = event.total;
          const percent = Math.round((loaded / total) * 100);
          onProgress({ loaded, total, percent });
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;
          try {
            await this.saveFile(targetFileName, blob);
            resolve(blob);
          } catch (err) {
            reject(new Error('儲存至本機離線空間時失敗：' + err.message));
          }
        } else {
          reject(new Error(`下載失敗：HTTP ${xhr.status} (請確認網址可公開下載且支援 CORS)`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('網路連線失敗或該網址不允許跨網域 (CORS) 下載。建議在 Safari 直接點擊下載檔案後，再使用「選取本機圖資」匯入。'));
      };

      xhr.send();
    });
  }

  /**
   * 查詢儲存空間配額
   */
  async getStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
          percent: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0
        };
      } catch (e) {}
    }
    return { usage: 0, quota: 0, percent: 0 };
  }
}
