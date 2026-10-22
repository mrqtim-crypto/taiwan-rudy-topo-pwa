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
  }

  async init() {
    this.registerServiceWorker();
    this.bindDomElements();
    this.setupEventListeners();

    // 初始化儲存與地圖
    try {
      await this.storage.init();
    } catch (e) {
      console.warn('[Storage] Init warning:', e);
    }

    await this.map.init();

    // 載入已儲存的離線圖資列表
    await this.refreshOfflineMapsList();

    // 啟動 GPS 監聽回呼與自動定位
    this.setupGpsCallbacks();
    this.gps.startWatching();

    // 綁定地圖路線點擊事件
    this.setupRouteInteraction();

    console.log('[RudyApp] Initialized successfully in clean exploration mode.');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('[SW] Registered, scope:', reg.scope))
          .catch((err) => console.warn('[SW] Registration failed:', err));
      });
    }
  }

  bindDomElements() {
    // 頂部狀態列
    this.domStatusCoord = document.getElementById('status-coord');
    this.domStatusEle = document.getElementById('status-ele');
    this.domStatusMode = document.getElementById('status-mode');

    // 底部定位膠囊
    this.pillGpsStatus = document.getElementById('pill-gps-status');
    this.pillGpsAccuracy = document.getElementById('pill-gps-accuracy');

    // 路線詳細資訊卡
    this.routeInfoCard = document.getElementById('route-info-card');
    this.routeTypeBadge = document.getElementById('route-type-badge');
    this.routeTitle = document.getElementById('route-title');
    this.routeDist = document.getElementById('route-dist');
    this.routeExtra = document.getElementById('route-extra');
    this.btnCloseRouteCard = document.getElementById('btn-close-route-card');

    // 右側功能按鈕
    this.btnLocate = document.getElementById('btn-locate');
    this.btnOpenMaps = document.getElementById('btn-open-maps');
    this.btnOpenGpx = document.getElementById('btn-open-gpx');
    this.btnOpenInfo = document.getElementById('btn-open-info');

    // 模態視窗
    this.modalMaps = document.getElementById('modal-maps');
    this.modalGpx = document.getElementById('modal-gpx');
    this.modalInfo = document.getElementById('modal-info');

    // 圖資管理 DOM
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
    // 定位準心按鈕
    this.btnLocate.addEventListener('click', () => {
      this.followGps = !this.followGps;
      this.btnLocate.classList.toggle('active', this.followGps);
      this.gps.startWatching();
      if (this.currentPos) {
        this.map.updateGpsLocation(this.currentPos, true);
      }
    });

    // 關閉路線卡片按鈕
    this.btnCloseRouteCard.addEventListener('click', () => {
      this.routeInfoCard.style.display = 'none';
      this.map.clearHighlight();
    });

    // 視窗開關
    this.setupModalToggle(this.btnOpenMaps, this.modalMaps);
    this.setupModalToggle(this.btnOpenGpx, this.modalGpx);
    this.setupModalToggle(this.btnOpenInfo, this.modalInfo);

    // 本機圖資載入 (相容 iOS Safari 檔案 App)
    this.fileInputMap.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        // 先立即渲染在地圖上，帶給使用者最流暢的即時體驗
        await this.map.loadPmtilesFile(file);
        this.updateMapStatusBadge(file.name);
        this.closeAllModals();

        // 背景非同步存入本機離線空間 (IndexedDB)
        await this.storage.saveFile(file.name, file);
        await this.refreshOfflineMapsList();
        console.log(`[App] Offline map ${file.name} cached.`);
      } catch (err) {
        console.error(err);
        alert('載入圖資發生錯誤：' + err.message);
      }
    });

    // 線上下載圖資
    this.btnStartDownload.addEventListener('click', async () => {
      const url = this.inputDownloadUrl.value.trim();
      if (!url) {
        alert('請輸入圖資 PMTiles 下載網址');
        return;
      }

      const fileName = url.substring(url.lastIndexOf('/') + 1).split('?')[0] || `rudy_topo_${Date.now()}.pmtiles`;
      this.btnStartDownload.disabled = true;
      this.downloadProgressContainer.style.display = 'block';

      try {
        const blob = await this.storage.downloadAndStoreMap(
          url,
          fileName,
          (prog) => {
            this.downloadProgressBar.style.width = `${prog.percent}%`;
            const loadedMb = (prog.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = prog.total > 0 ? (prog.total / (1024 * 1024)).toFixed(1) : '?';
            this.downloadProgressText.textContent = `${prog.percent}% (${loadedMb} MB / ${totalMb} MB)`;
          }
        );

        await this.refreshOfflineMapsList();
        await this.map.loadPmtilesFile(blob);
        this.updateMapStatusBadge(fileName);
        alert(`下載完成！已套用離線魯地圖「${fileName}」`);
        this.closeAllModals();
      } catch (err) {
        alert(err.message);
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
          alert(`解析失敗: ${file.name}`);
        }
      }
      this.renderGpxList();
      this.closeAllModals();
    });

    // 拖曳檔案進視窗
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith('.pmtiles') || name.endsWith('.mbtiles')) {
          await this.map.loadPmtilesFile(file);
          this.updateMapStatusBadge(file.name);
          await this.storage.saveFile(file.name, file);
          await this.refreshOfflineMapsList();
          alert(`已成功載入離線魯地圖「${file.name}」！`);
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

      // 頂部狀態列
      this.domStatusCoord.textContent = `${twd.formatted} (${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)})`;
      this.domStatusEle.textContent = `${pt.ele} m`;

      // 底部定位膠囊
      this.pillGpsStatus.textContent = 'GPS 訊號良好';
      this.pillGpsAccuracy.textContent = `精度 ±${pt.accuracy}m`;

      // 地圖更新位置
      this.map.updateGpsLocation(pt, this.followGps);
    };
  }

  /**
   * 路線與地標點選互動邏輯
   */
  setupRouteInteraction() {
    this.map.onFeatureSelected = (feature, clickCoord) => {
      if (!feature) {
        this.routeInfoCard.style.display = 'none';
        return;
      }

      const props = feature.properties || {};
      const layerId = feature.layer ? feature.layer.id : '';

      // 計算路線與目前 GPS 位置的直線距離
      let distanceText = '尚未取得 GPS 定位';
      if (this.currentPos && clickCoord) {
        const distMeters = this.haversineDistance(
          this.currentPos.lat,
          this.currentPos.lng,
          clickCoord[1],
          clickCoord[0]
        );

        if (distMeters < 30) {
          distanceText = `🌟 約 ${Math.round(distMeters)} 公尺（就在您身旁！）`;
        } else if (distMeters < 1000) {
          distanceText = `約 ${Math.round(distMeters)} 公尺`;
        } else {
          distanceText = `約 ${(distMeters / 1000).toFixed(2)} 公里`;
        }
      }

      // 判斷路線或地標類別
      let badgeText = '登山步道';
      let titleText = props.name || '登山山徑 (未命名)';
      let extraText = '山林路徑';

      if (layerId.includes('peak')) {
        badgeText = '山峰 / 三角點';
        titleText = props.name ? `▲ ${props.name}` : '山峰山頭';
        extraText = props.ele ? `標高：${props.ele} 公尺` : '台灣高山山頭';
      } else if (layerId.includes('camp') || layerId.includes('hut')) {
        badgeText = '避難山屋 / 營地';
        titleText = props.name || '山屋營地';
        extraText = '登山宿營與水源地';
      } else if (layerId.includes('forestry') || props.class === 'track') {
        badgeText = '林道 / 產道';
        titleText = props.name || '林道路段';
        extraText = '林務局林道或土石產道';
      } else if (layerId.includes('roads') || props.class === 'primary' || props.class === 'secondary') {
        badgeText = '鋪面公路';
        titleText = props.name || props.ref || '公路幹道';
        extraText = '車行鋪面道路';
      } else if (layerId.startsWith('gpx-')) {
        badgeText = '匯入路線';
        titleText = props.name || 'GPX 航跡';
        extraText = '自訂 GPX 路線';
      } else {
        badgeText = '健行山徑';
        titleText = props.name || '登山步道';
        extraText = '傳統登山路徑';
      }

      // 更新卡片內容並顯示
      this.routeTypeBadge.textContent = badgeText;
      this.routeTitle.textContent = titleText;
      this.routeDist.textContent = distanceText;
      this.routeExtra.textContent = extraText;
      this.routeInfoCard.style.display = 'flex';
    };
  }

  async refreshOfflineMapsList() {
    const list = await this.storage.listOfflineMaps();
    this.offlineMapsList.innerHTML = '';

    if (list.length === 0) {
      this.offlineMapsList.innerHTML = `
        <div class="empty-hint">尚未儲存離線魯地圖。<br/>請點擊上方按鈕選取本機 PMTiles 圖資，或透過下方推薦來源下載。</div>
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
          const blob = await this.storage.getFile(item.name);
          await this.map.loadPmtilesFile(blob);
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

    const quota = await this.storage.getStorageQuota();
    if (quota.quota > 0) {
      const usedMb = (quota.usage / (1024 * 1024)).toFixed(0);
      const totalMb = (quota.quota / (1024 * 1024)).toFixed(0);
      this.storageQuotaText.textContent = `本機離線空間已使用：${usedMb} MB / 可用上限：${totalMb} MB`;
    }
  }

  renderGpxList() {
    const tracks = this.gpx.getAllTracks();
    this.gpxTracksList.innerHTML = '';

    if (tracks.length === 0) {
      this.gpxTracksList.innerHTML = `<div class="empty-hint">尚未載入任何 GPX 路線</div>`;
      return;
    }

    tracks.forEach((trk) => {
      const el = document.createElement('div');
      el.className = 'gpx-item-card';
      el.innerHTML = `
        <div class="gpx-color-dot" style="background-color: ${trk.color};"></div>
        <div class="gpx-item-info">
          <div class="gpx-item-title">${trk.name}</div>
          <div class="gpx-item-meta">${trk.stats.distanceKm} km &bull; 爬升 +${trk.stats.ascentM}m</div>
        </div>
        <div class="gpx-item-actions">
          <button class="btn-icon btn-zoom-trk" title="縮放至此路線">
            <svg class="icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.516 6.516 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"/></svg>
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

      el.querySelector('.btn-del-trk').addEventListener('click', () => {
        this.map.removeGpxTrack(trk.id);
        this.gpx.removeTrack(trk.id);
        this.renderGpxList();
      });

      this.gpxTracksList.appendChild(el);
    });
  }

  updateMapStatusBadge(name) {
    this.domStatusMode.textContent = `魯地圖 (${name})`;
    this.domStatusMode.classList.add('offline-active');
  }

  setupModalToggle(triggerBtn, modalEl) {
    triggerBtn.addEventListener('click', () => {
      const isVisible = modalEl.classList.contains('show');
      this.closeAllModals();
      if (!isVisible) modalEl.classList.add('show');
    });

    const closeBtn = modalEl.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeAllModals());
    }
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('show'));
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new RudyApp();
  app.init();
});
