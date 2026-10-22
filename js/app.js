import { RudyMap } from './map.js';
import { StorageManager } from './storage-manager.js';
import { GpxManager } from './gpx-manager.js';
import { GpsTracker } from './gps-tracker.js';
import { OfflineTileDownloader } from './offline-tile-downloader.js';

class RudyApp {
  constructor() {
    this.map = new RudyMap('map');
    this.storage = new StorageManager();
    this.gpx = new GpxManager();
    this.gps = new GpsTracker();
    this.tileDownloader = new OfflineTileDownloader('taiwan-rudy-topo-v1.4.0');

    this.followGps = false;
    this.currentPos = null;
  }

  async init() {
    this.registerServiceWorker();
    this.bindDomElements();
    this.setupEventListeners();

    try {
      await this.storage.init();
    } catch (e) {
      console.warn('[Storage] Init warning:', e);
    }

    await this.map.init();
    await this.refreshOfflineMapsList();

    this.setupGpsCallbacks();
    this.gps.startWatching();
    this.setupRouteInteraction();

    console.log('[RudyApp] Initialized with One-Click Offline Downloader.');
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
    this.btnOpenLayers = document.getElementById('btn-open-layers');
    this.layerPickerMenu = document.getElementById('layer-picker-menu');
    this.btnOpenMaps = document.getElementById('btn-open-maps');
    this.btnOpenGpx = document.getElementById('btn-open-gpx');
    this.btnOpenInfo = document.getElementById('btn-open-info');

    // 模態視窗
    this.modalMaps = document.getElementById('modal-maps');
    this.modalGpx = document.getElementById('modal-gpx');
    this.modalInfo = document.getElementById('modal-info');

    // 一鍵下載離線圖磚 DOM
    this.packProgressContainer = document.getElementById('pack-progress-container');
    this.packProgressTitle = document.getElementById('pack-progress-title');
    this.packProgressPercent = document.getElementById('pack-progress-percent');
    this.packProgressBar = document.getElementById('pack-progress-bar');
    this.packProgressDetail = document.getElementById('pack-progress-detail');
    this.btnCancelPack = document.getElementById('btn-cancel-pack');

    // PMTiles 本地檔案上傳 DOM
    this.fileInputMap = document.getElementById('file-input-map');
    this.offlineMapsList = document.getElementById('offline-maps-list');
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

    // 圖層切換選單開關 (參考 taiwan-peak)
    this.btnOpenLayers.addEventListener('click', (e) => {
      e.stopPropagation();
      this.layerPickerMenu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!this.layerPickerMenu.contains(e.target) && e.target !== this.btnOpenLayers) {
        this.layerPickerMenu.classList.remove('show');
      }
    });

    document.querySelectorAll('.layer-opt-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const layerKey = e.currentTarget.getAttribute('data-layer');
        document.querySelectorAll('.layer-opt-btn').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.map.setBaseLayer(layerKey);

        const names = {
          topo: '等高線地形圖',
          satellite: '正射航照圖',
          osm: '開放街圖',
          cyclosm: '越野路網'
        };
        this.domStatusMode.textContent = names[layerKey] || '台灣登山底圖';
        this.layerPickerMenu.classList.remove('show');
      });
    });

    // 視窗開關
    this.setupModalToggle(this.btnOpenMaps, this.modalMaps);
    this.setupModalToggle(this.btnOpenGpx, this.modalGpx);
    this.setupModalToggle(this.btnOpenInfo, this.modalInfo);

    // 【一鍵離線圖磚下載】按鈕群監聽
    document.querySelectorAll('.btn-pack-download').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const packType = e.currentTarget.getAttribute('data-pack');
        await this.handlePackDownload(packType);
      });
    });

    // 取消下載
    this.btnCancelPack.addEventListener('click', () => {
      this.tileDownloader.cancel();
      this.packProgressContainer.style.display = 'none';
      alert('已取消下載');
    });

    // 本機 PMTiles 圖資載入 (相容 iOS Safari 檔案 App)
    this.fileInputMap.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        await this.map.loadPmtilesFile(file);
        this.updateMapStatusBadge(file.name);
        this.closeAllModals();

        await this.storage.saveFile(file.name, file);
        await this.refreshOfflineMapsList();
      } catch (err) {
        console.error(err);
        alert('載入圖資發生錯誤：' + err.message);
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

  /**
   * 處理台灣區域離線圖磚下載
   */
  async handlePackDownload(packType) {
    let bounds = null;
    let zooms = [11, 12, 13, 14];
    let title = '台灣山區離線等高線';

    if (packType === 'taiwan') {
      bounds = [[119.8, 21.8], [122.1, 25.3]];
      zooms = [8, 9, 10, 11]; // 全台覆蓋 Zoom 8~11，輕量化約 150 張圖磚
      title = '全台灣全境等高線離線包';
    } else if (packType === 'hehuan') {
      bounds = [[121.15, 23.95], [121.40, 24.20]];
      zooms = [11, 12, 13, 14];
      title = '合歡群峰/奇萊連峰/能高越嶺 (高精度)';
    } else if (packType === 'yushan') {
      bounds = [[120.85, 23.40], [121.10, 23.60]];
      zooms = [11, 12, 13, 14];
      title = '玉山群峰/八通關古道 (高精度)';
    } else if (packType === 'xueshan') {
      bounds = [[121.15, 24.35], [121.38, 24.55]];
      zooms = [11, 12, 13, 14];
      title = '雪山群峰/聖稜線/武陵四秀 (高精度)';
    } else if (packType === 'current-view') {
      const mapBounds = this.map.map.getBounds();
      bounds = [
        [mapBounds.getWest(), mapBounds.getSouth()],
        [mapBounds.getEast(), mapBounds.getNorth()]
      ];
      const curZoom = Math.floor(this.map.map.getZoom());
      zooms = [curZoom, Math.min(14, curZoom + 1), Math.min(14, curZoom + 2)];
      title = '目前地圖螢幕所視山區';
    }

    const tileUrls = this.tileDownloader.getTileUrlsForBounds(bounds, zooms);

    if (tileUrls.length === 0) {
      alert('所選範圍無有效圖磚，請重新選擇。');
      return;
    }

    if (tileUrls.length > 800) {
      if (!confirm(`該範圍較大（約 ${tileUrls.length} 張圖磚），下載約需 30~60 秒，確定開始下載嗎？`)) {
        return;
      }
    }

    // 展開進度條
    this.packProgressContainer.style.display = 'block';
    this.packProgressTitle.textContent = `正在快取：${title}`;
    this.packProgressBar.style.width = '0%';
    this.packProgressPercent.textContent = '0%';
    this.packProgressDetail.textContent = `準備下載 ${tileUrls.length} 張圖磚...`;

    try {
      await this.tileDownloader.downloadTiles(tileUrls, (prog) => {
        this.packProgressBar.style.width = `${prog.percent}%`;
        this.packProgressPercent.textContent = `${prog.percent}%`;
        this.packProgressDetail.textContent = `已快取 ${prog.current} / ${prog.total} 張圖磚`;
      });

      this.packProgressContainer.style.display = 'none';
      this.updateMapStatusBadge('已快取離線地圖');
      alert(`🎉「${title}」下載完成！\n該山區等高線與步道已永久快取於本機，離線無網路依然能正常使用！`);
      this.closeAllModals();
    } catch (err) {
      alert('下載發生異常：' + err.message);
      this.packProgressContainer.style.display = 'none';
    }
  }

  setupGpsCallbacks() {
    this.gps.onLocationUpdate = (pt) => {
      this.currentPos = pt;
      const twd = RudyMap.wgs84ToTwd97(pt.lat, pt.lng);

      this.domStatusCoord.textContent = `${twd.formatted} (${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)})`;
      this.domStatusEle.textContent = `${pt.ele} m`;
      this.pillGpsStatus.textContent = 'GPS 訊號良好';
      this.pillGpsAccuracy.textContent = `精度 ±${pt.accuracy}m`;

      this.map.updateGpsLocation(pt, this.followGps);
    };
  }

  setupRouteInteraction() {
    this.map.onFeatureSelected = (feature, clickCoord) => {
      if (!feature) {
        this.routeInfoCard.style.display = 'none';
        return;
      }

      const props = feature.properties || {};
      const layerId = feature.layer ? feature.layer.id : '';

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
        <div class="empty-hint">尚未載入本機 PMTiles 檔案。<br/>您可使用上方「一鍵下載」直接快取熱門百岳離線地圖！</div>
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
            <button class="btn-sm btn-primary btn-load-map">套用</button>
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
    this.domStatusMode.textContent = `離線地圖 (${name})`;
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
