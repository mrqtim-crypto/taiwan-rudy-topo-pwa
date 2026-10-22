import { RudyMap } from './map.js';
import { StorageManager } from './storage-manager.js';
import { GpxManager } from './gpx-manager.js';
import { GpsTracker } from './gps-tracker.js';

class RudyApp {
  constructor() {
    this.map = new RudyMap('map');
    this.storage = new StorageManager();
    this.gpx = new GpxManager();
    this.gps = new GpsTracker();

    this.followGps = false;
    this.currentPos = null;
    this.downloadAbortController = null;
  }

  async init() {
    this.registerServiceWorker();
    this.bindDomElements();
    this.setupEventListeners();

    // 初始化儲存與地圖
    await this.storage.init();
    await this.map.init();

    // 檢查是否有已儲存的離線圖資
    await this.refreshOfflineMapsList();

    // 啟動 GPS 監聽回呼
    this.setupGpsCallbacks();

    console.log('[RudyApp] Initialized successfully.');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[SW] Registered successfully, scope:', reg.scope))
          .catch((err) => console.warn('[SW] Registration failed:', err));
      });
    }
  }

  bindDomElements() {
    // 頂部狀態列
    this.domStatusCoord = document.getElementById('status-coord');
    this.domStatusEle = document.getElementById('status-ele');
    this.domStatusMode = document.getElementById('status-mode');

    // 浮動儀表板 HUD
    this.domHudTime = document.getElementById('hud-time');
    this.domHudDist = document.getElementById('hud-dist');
    this.domHudAscent = document.getElementById('hud-ascent');
    this.domHudEle = document.getElementById('hud-ele');
    this.domHudSpeed = document.getElementById('hud-speed');

    // 按鈕
    this.btnLocate = document.getElementById('btn-locate');
    this.btnRecordToggle = document.getElementById('btn-record-toggle');
    this.btnRecordStop = document.getElementById('btn-record-stop');

    // 側邊抽屜與面板
    this.btnOpenMaps = document.getElementById('btn-open-maps');
    this.btnOpenGpx = document.getElementById('btn-open-gpx');
    this.btnOpenInfo = document.getElementById('btn-open-info');

    this.modalMaps = document.getElementById('modal-maps');
    this.modalGpx = document.getElementById('modal-gpx');
    this.modalInfo = document.getElementById('modal-info');

    // 離線圖資相關 DOM
    this.fileInputMap = document.getElementById('file-input-map');
    this.offlineMapsList = document.getElementById('offline-maps-list');
    this.inputDownloadUrl = document.getElementById('input-download-url');
    this.btnStartDownload = document.getElementById('btn-start-download');
    this.downloadProgressContainer = document.getElementById('download-progress-container');
    this.downloadProgressBar = document.getElementById('download-progress-bar');
    this.downloadProgressText = document.getElementById('download-progress-text');
    this.storageQuotaText = document.getElementById('storage-quota-text');

    // GPX 相關 DOM
    this.fileInputGpx = document.getElementById('file-input-gpx');
    this.gpxTracksList = document.getElementById('gpx-tracks-list');
  }

  setupEventListeners() {
    // 定位按鈕
    this.btnLocate.addEventListener('click', () => {
      this.followGps = !this.followGps;
      this.btnLocate.classList.toggle('active', this.followGps);
      this.gps.startWatching();
      if (this.currentPos) {
        this.map.updateGpsLocation(this.currentPos, true);
      }
    });

    // 記錄按鈕 (開始/暫停)
    this.btnRecordToggle.addEventListener('click', () => {
      if (!this.gps.isRecording) {
        this.gps.startRecording();
        this.btnRecordToggle.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M14 19V5h4v14h-4m-8 0V5h4v14H6Z"/></svg>
          <span>暫停記錄</span>
        `;
        this.btnRecordToggle.classList.add('recording');
        this.btnRecordStop.style.display = 'inline-flex';
      } else {
        this.gps.pauseRecording();
        this.btnRecordToggle.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7L8 5Z"/></svg>
          <span>繼續記錄</span>
        `;
        this.btnRecordToggle.classList.remove('recording');
      }
    });

    // 結束記錄按鈕 (產生 GPX 匯出)
    this.btnRecordStop.addEventListener('click', () => {
      if (confirm('確定結束軌跡記錄並匯出 GPX 檔案嗎？')) {
        try {
          const gpxString = this.gps.exportGPX(`魯地圖軌跡_${new Date().toLocaleDateString('zh-TW')}`);
          this.downloadStringAsFile(gpxString, `Taiwan_Topo_Track_${Date.now()}.gpx`, 'application/gpx+xml');
        } catch (e) {
          alert(e.message);
        }
        this.gps.resetRecording();
        this.btnRecordToggle.innerHTML = `
          <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 2a8 8 0 0 1 8 8a8 8 0 0 1-8 8a8 8 0 0 1-8-8a8 8 0 0 1 8-8m0 4a4 4 0 0 0-4 4a4 4 0 0 0 4 4a4 4 0 0 0 4-4a4 4 0 0 0-4-4Z"/></svg>
          <span>開始記錄</span>
        `;
        this.btnRecordToggle.classList.remove('recording');
        this.btnRecordStop.style.display = 'none';
        this.map.updateLiveTrackGeometry([]);
      }
    });

    // 彈出視窗開關
    this.setupModalToggle(this.btnOpenMaps, this.modalMaps);
    this.setupModalToggle(this.btnOpenGpx, this.modalGpx);
    this.setupModalToggle(this.btnOpenInfo, this.modalInfo);

    // 本機圖資選取上傳
    this.fileInputMap.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await this.storage.saveFileToOPFS(file.name, file);
        await this.refreshOfflineMapsList();
        await this.map.loadPmtilesFile(file);
        this.updateMapStatusBadge(file.name);
        this.closeAllModals();
        alert(`已成功載入並儲存離線魯地圖「${file.name}」！`);
      } catch (err) {
        console.error(err);
        alert('載入圖資發生錯誤：' + err.message);
      }
    });

    // 線上下載圖資
    this.btnStartDownload.addEventListener('click', async () => {
      const url = this.inputDownloadUrl.value.trim();
      if (!url) {
        alert('請輸入有效的圖資下載 URL（支援 .pmtiles）');
        return;
      }

      const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || `rudy_topo_${Date.now()}.pmtiles`;
      this.btnStartDownload.disabled = true;
      this.downloadProgressContainer.style.display = 'block';

      this.downloadAbortController = new AbortController();

      try {
        const file = await this.storage.downloadAndStoreMap(
          url,
          fileName,
          (prog) => {
            this.downloadProgressBar.style.width = `${prog.percent}%`;
            const loadedMb = (prog.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = prog.total > 0 ? (prog.total / (1024 * 1024)).toFixed(1) : '?';
            const speedKbs = (prog.speed / 1024).toFixed(0);
            this.downloadProgressText.textContent = `${prog.percent}% (${loadedMb} MB / ${totalMb} MB) - ${speedKbs} KB/s`;
          },
          this.downloadAbortController.signal
        );

        await this.refreshOfflineMapsList();
        await this.map.loadPmtilesFile(file);
        this.updateMapStatusBadge(fileName);
        alert(`下載完成！已套用離線魯地圖「${fileName}」`);
        this.closeAllModals();
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('下載失敗：' + err.message);
        }
      } finally {
        this.btnStartDownload.disabled = false;
        this.downloadProgressContainer.style.display = 'none';
      }
    });

    // GPX 檔案選取
    this.fileInputGpx.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        try {
          const trackItem = await this.gpx.loadFile(file);
          this.map.addGpxTrack(trackItem);
        } catch (err) {
          alert(`解析失敗: ${file.name} (${err.message})`);
        }
      }
      this.renderGpxList();
      this.closeAllModals();
    });

    // 全視窗拖曳 GPX / PMTiles 支援
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.pmtiles') || name.endsWith('.mbtiles')) {
          await this.storage.saveFileToOPFS(file.name, file);
          await this.map.loadPmtilesFile(file);
          this.updateMapStatusBadge(file.name);
          await this.refreshOfflineMapsList();
          alert(`已成功拖曳載入離線圖資「${file.name}」！`);
        } else if (name.endsWith('.gpx') || name.endsWith('.kml')) {
          const trackItem = await this.gpx.loadFile(file);
          this.map.addGpxTrack(trackItem);
          this.renderGpxList();
        }
      }
    });
  }

  setupGpsCallbacks() {
    this.gps.onLocationUpdate = (pt) => {
      this.currentPos = pt;
      const twd = RudyMap.wgs84ToTwd97(pt.lat, pt.lng);

      this.domStatusCoord.textContent = `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)} (${twd.formatted})`;
      this.domStatusEle.textContent = `${pt.ele} m`;
      this.domHudEle.textContent = `${pt.ele} m`;
      this.domHudSpeed.textContent = `${pt.speed.toFixed(1)} km/h`;

      this.map.updateGpsLocation(pt, this.followGps);

      if (this.gps.isRecording) {
        const coords = this.gps.trackPoints.map((p) => [p.lng, p.lat]);
        this.map.updateLiveTrackGeometry(coords);
      }
    };

    this.gps.onStatsUpdate = (stats) => {
      this.domHudTime.textContent = stats.elapsedTimeFormatted;
      this.domHudDist.textContent = `${stats.distanceKm} km`;
      this.domHudAscent.textContent = `+${stats.ascentM} m`;
    };
  }

  async refreshOfflineMapsList() {
    const list = await this.storage.listOfflineMaps();
    this.offlineMapsList.innerHTML = '';

    if (list.length === 0) {
      this.offlineMapsList.innerHTML = `
        <div class="empty-hint">尚未儲存任何離線圖資。<br/>請點擊上方按鈕匯入本地 PMTiles 魯地圖檔案，或透過下載精靈線上下載。</div>
      `;
    } else {
      list.forEach((item) => {
        const sizeMb = (item.size / (1024 * 1024)).toFixed(1);
        const el = document.createElement('div');
        el.className = 'map-item-card';
        el.innerHTML = `
          <div class="map-item-info">
            <div class="map-item-title">${item.name}</div>
            <div class="map-item-meta">${sizeMb} MB &bull; ${new Date(item.lastModified).toLocaleDateString('zh-TW')}</div>
          </div>
          <div class="map-item-actions">
            <button class="btn-sm btn-primary btn-load-map">載入地圖</button>
            <button class="btn-sm btn-danger btn-del-map">刪除</button>
          </div>
        `;

        el.querySelector('.btn-load-map').addEventListener('click', async () => {
          const file = await this.storage.getFileFromOPFS(item.name);
          await this.map.loadPmtilesFile(file);
          this.updateMapStatusBadge(item.name);
          this.closeAllModals();
        });

        el.querySelector('.btn-del-map').addEventListener('click', async () => {
          if (confirm(`確定要刪除離線圖資「${item.name}」嗎？`)) {
            await this.storage.deleteFile(item.name);
            await this.refreshOfflineMapsList();
          }
        });

        this.offlineMapsList.appendChild(el);
      });
    }

    // 更新儲存空間
    const quota = await this.storage.getStorageQuota();
    if (quota.quota > 0) {
      const usedMb = (quota.usage / (1024 * 1024)).toFixed(0);
      const totalMb = (quota.quota / (1024 * 1024)).toFixed(0);
      this.storageQuotaText.textContent = `本機離線空間已使用：${usedMb} MB / 可用上限：${totalMb} MB (${quota.percent}%)`;
    }
  }

  renderGpxList() {
    const tracks = this.gpx.getAllTracks();
    this.gpxTracksList.innerHTML = '';

    if (tracks.length === 0) {
      this.gpxTracksList.innerHTML = `<div class="empty-hint">尚未匯入任何 GPX 軌跡。</div>`;
      return;
    }

    tracks.forEach((trk) => {
      const el = document.createElement('div');
      el.className = 'gpx-item-card';
      el.innerHTML = `
        <div class="gpx-color-dot" style="background-color: ${trk.color};"></div>
        <div class="gpx-item-info">
          <div class="gpx-item-title">${trk.name}</div>
          <div class="gpx-item-meta">${trk.stats.distanceKm} km &bull; 爬升 +${trk.stats.ascentM}m &bull; 最高 ${trk.stats.maxEleM}m</div>
        </div>
        <div class="gpx-item-actions">
          <button class="btn-icon btn-zoom-trk" title="聚焦軌跡">
            <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"/></svg>
          </button>
          <button class="btn-icon btn-vis-trk" title="顯示/隱藏">
            <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3Z"/></svg>
          </button>
          <button class="btn-icon btn-del-trk" title="移除">
            <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12Z"/></svg>
          </button>
        </div>
      `;

      el.querySelector('.btn-zoom-trk').addEventListener('click', () => {
        this.map.fitBounds(trk.bounds);
        this.closeAllModals();
      });

      el.querySelector('.btn-vis-trk').addEventListener('click', (e) => {
        trk.visible = !trk.visible;
        this.map.setTrackVisibility(trk.id, trk.visible);
        e.currentTarget.style.opacity = trk.visible ? '1' : '0.4';
      });

      el.querySelector('.btn-del-trk').addEventListener('click', () => {
        this.map.removeGpxTrack(trk.id);
        this.gpx.removeTrack(trk.id);
        this.renderGpxList();
      });

      this.gpxTracksList.appendChild(el);
    });
  }

  updateMapStatusBadge(name) {
    this.domStatusMode.textContent = `離線魯地圖 (${name})`;
    this.domStatusMode.classList.add('offline-active');
  }

  setupModalToggle(triggerBtn, modalEl) {
    triggerBtn.addEventListener('click', () => {
      const isVisible = modalEl.classList.contains('show');
      this.closeAllModals();
      if (!isVisible) {
        modalEl.classList.add('show');
      }
    });

    const closeBtn = modalEl.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeAllModals());
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('show'));
  }

  downloadStringAsFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

// 啟動應用程式
window.addEventListener('DOMContentLoaded', () => {
  const app = new RudyApp();
  app.init();
});
