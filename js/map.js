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

    // 路線點擊回呼
    this.onFeatureSelected = null;

    // 狀態
    this.isOfflineMode = false;
  }

  /**
   * 初始化地圖
   */
  async init() {
    if (window.pmtiles && window.maplibregl) {
      this.pmtilesProtocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol('pmtiles', this.pmtilesProtocol.tile);
      console.log('[Map] PMTiles protocol registered successfully.');
    }

    this.map = new window.maplibregl.Map({
      container: this.containerId,
      style: defaultOnlineStyle,
      center: [120.957, 23.8], // 台灣地理中心
      zoom: 8.5,
      minZoom: 6,
      maxZoom: 18,
      attributionControl: false
    });

    this.map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    this.map.addControl(new window.maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-left');

    return new Promise((resolve) => {
      this.map.on('load', () => {
        this.setupGpsLayers();
        this.setupHighlightLayers();
        this.setupClickListeners();
        resolve();
      });
    });
  }

  /**
   * 載入離線魯地圖 PMTiles
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

    this.map.setStyle(rudyStyle);
    this.currentOfflineFileName = file.name;
    this.isOfflineMode = true;

    this.map.once('style.load', () => {
      this.setupGpsLayers();
      this.setupHighlightLayers();
      this.setupClickListeners();
      console.log('[Map] Rudy TOPO loaded:', file.name);
    });
  }

  /**
   * 建立高亮選取圖層
   */
  setupHighlightLayers() {
    if (!this.map.getSource('selected-highlight-source')) {
      this.map.addSource('selected-highlight-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // 被選取線條高亮 (外光暈)
      this.map.addLayer({
        id: 'selected-highlight-line-glow',
        type: 'line',
        source: 'selected-highlight-source',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#38BDF8',
          'line-width': 8,
          'line-opacity': 0.7,
          'line-blur': 2
        }
      });

      // 被選取線條核心
      this.map.addLayer({
        id: 'selected-highlight-line',
        type: 'line',
        source: 'selected-highlight-source',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 3
        }
      });

      // 被選取點位高亮 (光環)
      this.map.addLayer({
        id: 'selected-highlight-point',
        type: 'circle',
        source: 'selected-highlight-source',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 12,
          'circle-color': '#38BDF8',
          'circle-opacity': 0.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3
        }
      });
    }
  }

  /**
   * 設定路線與地標點擊事件監聽
   */
  setupClickListeners() {
    const clickableLayers = [
      'trail-path',
      'forestry-track',
      'roads',
      'mountain-peak-point',
      'mountain-peak-label',
      'poi-camp-hut',
      'poi-camp-hut-label'
    ];

    // 滑鼠移入手勢指標
    clickableLayers.forEach((layerId) => {
      if (this.map.getLayer(layerId)) {
        this.map.on('mouseenter', layerId, () => {
          this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', layerId, () => {
          this.map.getCanvas().style.cursor = '';
        });
      }
    });

    // 點擊事件
    this.map.on('click', (e) => {
      // 查詢點擊位置附近的圖層 (包含容差緩衝)
      const bbox = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6]
      ];

      // 找出存在的圖層
      const activeClickable = clickableLayers.filter((l) => this.map.getLayer(l));
      // 同時包含任何自訂載入的 GPX 路線
      const allLayers = this.map.getStyle().layers || [];
      const gpxLineLayers = allLayers.filter((l) => l.id.startsWith('gpx-line-')).map((l) => l.id);
      const queryLayers = [...activeClickable, ...gpxLineLayers];

      const features = this.map.queryRenderedFeatures(bbox, {
        layers: queryLayers.length > 0 ? queryLayers : undefined
      });

      if (features.length > 0) {
        const topFeature = features[0];
        this.highlightFeature(topFeature);

        if (this.onFeatureSelected) {
          this.onFeatureSelected(topFeature, [e.lngLat.lng, e.lngLat.lat]);
        }
      } else {
        // 點擊空白處清除選取
        this.clearHighlight();
        if (this.onFeatureSelected) {
          this.onFeatureSelected(null, null);
        }
      }
    });
  }

  /**
   * 高亮指定 Feature
   */
  highlightFeature(feature) {
    const source = this.map.getSource('selected-highlight-source');
    if (source && feature.geometry) {
      source.setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  }

  /**
   * 清除高亮
   */
  clearHighlight() {
    const source = this.map.getSource('selected-highlight-source');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

  /**
   * 建立 GPS 即時標記
   */
  setupGpsLayers() {
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
   * 更新 GPS 目前位置
   */
  updateGpsLocation(point, shouldPan = false) {
    if (!point || !this.map) return;

    const coords = [point.lng, point.lat];
    this.gpsMarker.setLngLat(coords).addTo(this.map);

    if (shouldPan) {
      this.map.easeTo({
        center: coords,
        zoom: Math.max(this.map.getZoom(), 15.5),
        duration: 800
      });
    }
  }

  /**
   * 載入 GPX 軌跡供背景參考
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
    }

    if (trackItem.bounds) {
      this.map.fitBounds(trackItem.bounds, { padding: 40, duration: 1000 });
    }
  }

  removeGpxTrack(trackId) {
    const layers = [
      `gpx-wpt-label-${trackId}`,
      `gpx-wpt-${trackId}`,
      `gpx-line-${trackId}`,
      `gpx-casing-${trackId}`
    ];
    layers.forEach((layerId) => {
      if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
    });
    if (this.map.getSource(`gpx-source-${trackId}`)) {
      this.map.removeSource(`gpx-source-${trackId}`);
    }
  }

  fitBounds(bounds) {
    if (bounds && this.map) {
      this.map.fitBounds(bounds, { padding: 40, duration: 1000 });
    }
  }

  /**
   * WGS84 經緯度轉 TWD97 (二度分帶投影)
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
