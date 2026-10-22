/**
 * 台灣離線圖磚批次下載器 (相容 iOS Safari Cache Storage)
 * 解決 iOS 無法下載外部大檔問題，支援一鍵將台灣全境或百岳登山區等高線地圖預先下載快取！
 */

export class OfflineTileDownloader {
  constructor(cacheName) {
    this.cacheName = cacheName;
    this.isDownloading = false;
    this.abortController = null;
  }

  // 經緯度轉圖磚 X/Y 坐標
  lon2tile(lon, zoom) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
  }

  lat2tile(lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
  }

  /**
   * 計算邊界範圍內的所有圖磚 URL
   * @param {Array} bounds [[minLng, minLat], [maxLng, maxLat]]
   * @param {Array<number>} zooms [8, 9, 10, 11, 12, 13]
   */
  getTileUrlsForBounds(bounds, zooms) {
    const minLng = bounds[0][0];
    const minLat = bounds[0][1];
    const maxLng = bounds[1][0];
    const maxLat = bounds[1][1];

    const urls = [];

    for (const z of zooms) {
      const minX = Math.min(this.lon2tile(minLng, z), this.lon2tile(maxLng, z));
      const maxX = Math.max(this.lon2tile(minLng, z), this.lon2tile(maxLng, z));
      const minY = Math.min(this.lat2tile(maxLat, z), this.lat2tile(minLat, z));
      const maxY = Math.max(this.lat2tile(maxLat, z), this.lat2tile(minLat, z));

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          // OpenTopoMap 包含完整等高線與山徑
          urls.push(`https://tile.opentopomap.org/${z}/${x}/${y}.png`);
        }
      }
    }

    return urls;
  }

  /**
   * 批次下載圖磚並直接存入瀏覽器 Service Worker Cache
   * @param {Array<string>} urls 
   * @param {Function} onProgress ({ current, total, percent })
   */
  async downloadTiles(urls, onProgress) {
    if (!('caches' in window)) {
      throw new Error('您的瀏覽器不支援 Cache 離線快取功能');
    }

    this.isDownloading = true;
    this.abortController = new AbortController();
    const cache = await caches.open(this.cacheName);

    const total = urls.length;
    let completed = 0;
    const concurrency = 4; // 同時 4 個請求，避免 iOS 連線超載
    let index = 0;

    const worker = async () => {
      while (index < urls.length) {
        if (!this.isDownloading) break;

        const url = urls[index++];
        try {
          // 檢查是否已快取過，避免重複下載
          const existing = await cache.match(url);
          if (!existing) {
            const resp = await fetch(url, {
              signal: this.abortController.signal,
              headers: { Accept: 'image/png,image/*,*/*' }
            });
            if (resp.ok) {
              await cache.put(url, resp);
            }
          }
        } catch (e) {
          if (e.name === 'AbortError') return;
          console.warn('[TileDownloader] Skip failed tile:', url);
        }

        completed++;
        if (onProgress) {
          const percent = Math.round((completed / total) * 100);
          onProgress({ current: completed, total, percent });
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    this.isDownloading = false;
  }

  cancel() {
    this.isDownloading = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
