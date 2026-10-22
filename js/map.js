/**
 * 地圖渲染控制器 (基於 MapLibre GL + PMTiles)
 */

import { createRudyTopoStyle, defaultOnlineStyle } from './topo-style.js';

export class RudyMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.pmtilesProtocol = null;
    this.currentOfflineFileName = null;

    // GPS 標記
    this.gpsMarker = null;
    this.gpsAccuracyCircle = null;

    // 狀態
    this.isOfflineMode = false;
  }

  /**
   * 初始化地圖
   */
  async init() {
    // 註冊 PMTiles 通訊協定
    if (window.pmtiles && window.maplibregl) {
      this.pmtilesProtocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol('pmtiles', this.pmtilesProtocol.tile);
      console.log('[Map] PMTiles protocol registered successfully.');
    } else {
      console.error('[Map] MapLibre or PMTiles library not loaded.');
    }

    // 建立地圖 (預設中心設為台灣中心/合歡山玉山區域)
    this.map = new window.maplibregl.Map({
      container: this.containerId,
      style: defaultOnlineStyle,
      center: [120.957, 23.8], // 台灣中心
      zoom: 8.5,
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false
    });

    // 導航控制 (縮放、旋轉指南針)
    this.map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.addControl(new window.maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-left');

    return new Promise((resolve) => {
      this.map.on('load', () => {
        this.setupGpsLayers();
        resolve();
      });
    });
  }

  /**
   * 載入離線魯地圖 PMTiles File 物件
   * @param {File} file 
   */
  async loadPmtilesFile(file) {
    if (!this.pmtilesProtocol) {
      throw new Error('PMTiles 通訊協定未初始化');
    }

    const fileSource = new window.pmtiles.FileSource(file);
    const p = new window.pmtiles.PMTiles(fileSource);
    this.pmtilesProtocol.add(p);

    const sourceUrl = `pmtiles://${file.name}`;
    const sourceId = 'taiwan-rudy-vector';
    const rudyStyle = createRudyTopoStyle(sourceId, sourceUrl);

    // 切換地圖樣式為魯地圖向量風格
    this.map.setStyle(rudyStyle);
    this.currentOfflineFileName = file.name;
    this.isOfflineMode = true;

    // 等待 style 載入後重新建立 GPS 與軌跡圖層
    this.map.once('style.load', () => {
      this.setupGpsLayers();
      console.log('[Map] Rudy TOPO PMTiles loaded successfully:', file.name);
    });
  }

  /**
   * 建立 GPS 即時航跡與定位圖層
   */
  setupGpsLayers() {
    if (!this.map.getSource('gps-live-track')) {
      this.map.addSource('gps-live-track', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      this.map.addLayer({
        id: 'gps-live-track-casing',
        type: 'line',
        source: 'gps-live-track',
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 6,
          'line-opacity': 0.8
        }
      });

      this.map.addLayer({
        id: 'gps-live-track-line',
        type: 'line',
        source: 'gps-live-track',
        paint: {
          'line-color': '#EC4899', // 螢光粉紅，極易辨識
          'line-width': 4
        }
      });
    }

    // 準備 GPS 標記元素
    if (!this.gpsMarker) {
      const el = document.createElement('div');
      el.className = 'gps-current-marker';
      el.innerHTML = `
        <div class="gps-pulse"></div>
        <div class="gps-dot"></div>
      `;
      this.gpsMarker = new window.maplibregl.Marker({ element: el });
    }
  }

  /**
   * 更新 GPS 目前位置與航跡
   */
  updateGpsLocation(point, shouldPan = false) {
    if (!point || !this.map) return;

    const coords = [point.lng, point.lat];
    this.gpsMarker.setLngLat(coords).addTo(this.map);

    if (shouldPan) {
      this.map.easeTo({
        center: coords,
        zoom: Math.max(this.map.getZoom(), 15),
        duration: 800
      });
    }
  }

  /**
   * 更新即時記錄航跡線
   */
  updateLiveTrackGeometry(coordinates) {
    const source = this.map.getSource('gps-live-track');
    if (source) {
      source.setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    }
  }

  /**
   * 新增或更新 GPX 軌跡圖層
   */
  addGpxTrack(trackItem) {
    const sourceId = `gpx-source-${trackItem.id}`;
    const lineLayerId = `gpx-line-${trackItem.id}`;
    const casingLayerId = `gpx-casing-${trackItem.id}`;
    const wptLayerId = `gpx-wpt-${trackItem.id}`;
    const wptLabelId = `gpx-wpt-label-${trackItem.id}`;

    if (!this.map.getSource(sourceId)) {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: trackItem.geojson
      });

      // 外框光暈
      this.map.addLayer({
        id: casingLayerId,
        type: 'line',
        source: sourceId,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 5,
          'line-opacity': 0.7
        }
      });

      // 主線
      this.map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': trackItem.color,
          'line-width': 3.5
        }
      });

      // 航點圓點
      this.map.addLayer({
        id: wptLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': trackItem.color,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2
        }
      });

      // 航點文字標籤
      this.map.addLayer({
        id: wptLabelId,
        type: 'symbol',
        source: sourceId,
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-font': ['Open Sans Bold']
        },
        paint: {
          'text-color': '#1E293B',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2
        }
      });

      // 點擊航點彈出資訊
      this.map.on('click', wptLayerId, (e) => {
        const feat = e.features[0];
        const props = feat.properties;
        const coords = feat.geometry.coordinates.slice();

        new window.maplibregl.Popup()
          .setLngLat(coords)
          .setHTML(`
            <div style="font-size: 13px; line-height: 1.5; color: #111;">
              <strong>${props.name || '航點'}</strong><br/>
              ${props.ele ? `標高：${props.ele} m<br/>` : ''}
              ${props.desc ? `說明：${props.desc}<br/>` : ''}
              <span style="font-size: 11px; color: #666;">經緯度：${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}</span>
            </div>
          `)
          .addTo(this.map);
      });
    }

    if (trackItem.bounds) {
      this.map.fitBounds(trackItem.bounds, { padding: 40, duration: 1000 });
    }
  }

  /**
   * 移除 GPX 圖層
   */
  removeGpxTrack(trackId) {
    const sourceId = `gpx-source-${trackId}`;
    const layers = [
      `gpx-wpt-label-${trackId}`,
      `gpx-wpt-${trackId}`,
      `gpx-line-${trackId}`,
      `gpx-casing-${trackId}`
    ];

    layers.forEach((layerId) => {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
    });

    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }
  }

  /**
   * 設為或取消軌跡顯示
   */
  setTrackVisibility(trackId, visible) {
    const visibility = visible ? 'visible' : 'none';
    const layers = [
      `gpx-wpt-label-${trackId}`,
      `gpx-wpt-${trackId}`,
      `gpx-line-${trackId}`,
      `gpx-casing-${trackId}`
    ];
    layers.forEach((l) => {
      if (this.map.getLayer(l)) {
        this.map.setLayoutProperty(l, 'visibility', visibility);
      }
    });
  }

  /**
   * 縮放至指定邊界
   */
  fitBounds(bounds) {
    if (bounds && this.map) {
      this.map.fitBounds(bounds, { padding: 40, duration: 1000 });
    }
  }

  /**
   * WGS84 轉 TWD97 (二度分帶投影，中央經線 121度)
   * 台灣登山常需報 TWD97 6碼坐標給搜救隊或核對紙圖
   */
  static wgs84ToTwd97(lat, lng) {
    const a = 6378137.0;
    const b = 6356752.314245;
    const lon0 = 121 * Math.PI / 180;
    const k0 = 0.9999;
    const dx = 250000;

    const phi = lat * Math.PI / 180;
    const lambda = lng * Math.PI / 180;

    const e = Math.sqrt(1 - (b * b) / (a * a));
    const e2 = (e * e) / (1 - e * e);

    const N = a / Math.sqrt(1 - e * e * Math.sin(phi) * Math.sin(phi));
    const T = Math.tan(phi) * Math.tan(phi);
    const C = e2 * Math.cos(phi) * Math.cos(phi);
    const A = (lambda - lon0) * Math.cos(phi);

    const M = a * (
      (1 - e * e / 4 - 3 * e * e * e * e / 64 - 5 * e * e * e * e * e * e / 256) * phi -
      (3 * e * e / 8 + 3 * e * e * e * e / 32 + 45 * e * e * e * e * e * e / 1024) * Math.sin(2 * phi) +
      (15 * e * e * e * e / 256 + 45 * e * e * e * e * e * e / 1024) * Math.sin(4 * phi) -
      (35 * e * e * e * e * e * e / 3072) * Math.sin(6 * phi)
    );

    const x = dx + k0 * N * (A + (1 - T + C) * Math.pow(A, 3) / 6 + (5 - 18 * T + T * T + 72 * C - 58 * e2) * Math.pow(A, 5) / 120);
    const y = k0 * (M + N * Math.tan(phi) * (
      (A * A) / 2 +
      (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24 +
      (61 - 58 * T + T * T + 600 * C - 330 * e2) * Math.pow(A, 6) / 720
    ));

    return {
      x: Math.round(x),
      y: Math.round(y),
      formatted: `TWD97: ${Math.round(x)}, ${Math.round(y)}`
    };
  }
}
