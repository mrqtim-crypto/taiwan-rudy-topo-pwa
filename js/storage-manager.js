/**
 * 離線圖資儲存管理器 (支援 OPFS - Origin Private File System 及 IndexedDB)
 */

export class StorageManager {
  constructor() {
    this.dbName = 'rudy_topo_offline_db';
    this.storeName = 'tiles_metadata';
    this.opfsRoot = null;
    this.isOpfsSupported = false;
  }

  async init() {
    if (navigator.storage && navigator.storage.getDirectory) {
      try {
        this.opfsRoot = await navigator.storage.getDirectory();
        this.isOpfsSupported = true;
        console.log('[StorageManager] OPFS initialized successfully.');
      } catch (e) {
        console.warn('[StorageManager] OPFS failed, falling back to IndexedDB:', e);
        this.isOpfsSupported = false;
      }
    }
  }

  /**
   * 取得已儲存的離線圖資檔案列表
   */
  async listOfflineMaps() {
    if (this.isOpfsSupported && this.opfsRoot) {
      const files = [];
      try {
        // @ts-ignore
        for await (const [name, handle] of this.opfsRoot.entries()) {
          if (handle.kind === 'file' && (name.endsWith('.pmtiles') || name.endsWith('.mbtiles'))) {
            const file = await handle.getFile();
            files.push({
              name,
              size: file.size,
              lastModified: file.lastModified,
              fileHandle: handle
            });
          }
        }
      } catch (err) {
        console.error('[StorageManager] Error listing OPFS files:', err);
      }
      return files;
    }
    return [];
  }

  /**
   * 將 File 物件儲存至 OPFS
   */
  async saveFileToOPFS(fileName, fileOrBlob, onProgress = null) {
    if (!this.isOpfsSupported || !this.opfsRoot) {
      throw new Error('瀏覽器不支援 OPFS 本地大容量儲存');
    }

    const fileHandle = await this.opfsRoot.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    if (fileOrBlob.stream && onProgress) {
      const total = fileOrBlob.size;
      let loaded = 0;
      const reader = fileOrBlob.stream().getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        loaded += value.length;
        if (onProgress) {
          onProgress({ loaded, total, percent: Math.round((loaded / total) * 100) });
        }
      }
    } else {
      await writable.write(fileOrBlob);
    }

    await writable.close();
    return fileHandle;
  }

  /**
   * 從 OPFS 讀取 File 物件
   */
  async getFileFromOPFS(fileName) {
    if (!this.isOpfsSupported || !this.opfsRoot) {
      throw new Error('OPFS 不可用');
    }
    const fileHandle = await this.opfsRoot.getFileHandle(fileName);
    return await fileHandle.getFile();
  }

  /**
   * 刪除 OPFS 中的圖資
   */
  async deleteFile(fileName) {
    if (this.isOpfsSupported && this.opfsRoot) {
      await this.opfsRoot.removeEntry(fileName);
      return true;
    }
    return false;
  }

  /**
   * 下載線上圖資並串流寫入 OPFS
   * @param {string} url 
   * @param {string} targetFileName 
   * @param {Function} onProgress 
   * @param {AbortSignal} signal 
   */
  async downloadAndStoreMap(url, targetFileName, onProgress, signal) {
    if (!this.isOpfsSupported || !this.opfsRoot) {
      throw new Error('此瀏覽器未啟用 OPFS，無法直接進行大檔離線儲存');
    }

    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`下載失敗：HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let loaded = 0;

    const fileHandle = await this.opfsRoot.getFileHandle(targetFileName, { create: true });
    const writable = await fileHandle.createWritable();

    const reader = response.body.getReader();
    const startTime = Date.now();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writable.write(value);
        loaded += value.length;

        if (onProgress) {
          const elapsedSec = (Date.now() - startTime) / 1000;
          const speedBps = elapsedSec > 0 ? loaded / elapsedSec : 0;
          onProgress({
            loaded,
            total,
            percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
            speed: speedBps
          });
        }
      }
      await writable.close();
      return await fileHandle.getFile();
    } catch (err) {
      await writable.abort();
      // 清除未完成的檔案
      try {
        await this.opfsRoot.removeEntry(targetFileName);
      } catch (e) {}
      throw err;
    }
  }

  /**
   * 查詢瀏覽器儲存空間配額
   */
  async getStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percent: estimate.quota ? Math.round((estimate.usage / estimate.quota) * 100) : 0
      };
    }
    return { usage: 0, quota: 0, percent: 0 };
  }
}
