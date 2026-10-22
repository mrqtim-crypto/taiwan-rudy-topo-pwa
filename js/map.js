/**
 * 地圖渲染控制器 (參考 taiwan-peak 的多圖層切換與百岳地標系統)
 */

import { createRudyTopoStyle, getBaseStyle } from './topo-style.js';
import { TAIWAN_PEAKS } from './taiwan-peaks-data.js';

const TAIWAN_BOUNDS = [
  [118.0, 21.3],
  [122.5, 26.2]
];

export class RudyMap {
  constructor(containerId) {
    this.containerId = containerId;
    this.map = null;
    this.pmtilesProtocol = null;
    this.currentOfflineFileName = null;
    this.currentBaseLayer = 'topo';

    this.gpsMarker = null;
    this.onFeatureSelected = null;
    this.isOfflineMode = false;
  }

  async init() {
    if (window.pmtiles && window.maplibregl) {
      this.pmtilesProtocol = new window.pmtiles.Protocol();
      window.maplibregl.addProtocol('pmtiles', this.pmtilesProtocol.tile);
      console.log('[Map] PMTiles protocol registered.');
    }

    const optimizedPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.map = new window.maplibregl.Map({
      container: this.containerId,
      style: getBaseStyle('topo'),
      center: [120.957, 23.8],
      zoom: 8.5,
      minZoom: 7,
      maxZoom: 17.5,
      maxBounds: TAIWAN_BOUNDS,
      pixelRatio: optimizedPixelRatio,
      maxTileCacheSize: 45,
      touchPitch: false,
      dragRotate: true,
      attributionControl: false
    });

    this.map.addControl(new window.maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'top-right');
    this.map.addControl(new window.maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    return new Promise((resolve) => {
      this.map.on('load', () => {
        this.setupGpsLayers();
        this.setupHighlightLayers();
        this.setupTaiwanPeaksLayer();
        this.setupClickListeners();
        resolve();
      });
    });
  }

  /**
   * 切換底圖圖層 (例如 taiwan-peak 的圖層選單)
   */
  setBaseLayer(layerKey) {
    if (this.currentBaseLayer === layerKey) return;
    this.currentBaseLayer = layerKey;
    const style = getBaseStyle(layerKey);

    this.map.setStyle(style);
    this.map.once('style.load', () => {
      this.setupGpsLayers();
      this.setupHighlightLayers();
      this.setupTaiwanPeaksLayer();
      this.setupClickListeners();
      console.log(`[Map] Switched base layer to ${layerKey}`);
    });
  }

  /**
   * 載入離線魯地圖 PMTiles
   */
  async loadPmtilesFile(fileOrBlob) {
    if (!this.pmtilesProtocol) {
      throw new Error('PMTiles 通訊協定未初始化');
    }

    const fileSource = new window.pmtiles.FileSource(fileOrBlob);
    const p = new window.pmtiles.PMTiles(fileSource);
    this.pmtilesProtocol.add(p);

    const fileName = fileOrBlob.name || 'taiwan_topo.pmtiles';
    const sourceUrl = `pmtiles://${fileName}`;
    const sourceId = 'taiwan-rudy-vector';
    const rudyStyle = createRudyTopoStyle(sourceId, sourceUrl);

    this.map.setStyle(rudyStyle);
    this.currentOfflineFileName = fileName;
    this.isOfflineMode = true;

    this.map.once('style.load', () => {
      this.setupGpsLayers();
      this.setupHighlightLayers();
      this.setupTaiwanPeaksLayer();
      this.setupClickListeners();
      console.log('[Map] Rudy TOPO loaded.');
    });
  }

  /**
   * 建立台灣百岳地標圖層
   */
  setupTaiwanPeaksLayer() {
    if (this.map.getSource('taiwan-peaks-source')) return;

    const geojson = {
      type: 'FeatureCollection',
      features: TAIWAN_PEAKS.map((peak) => ({
        type: 'Feature',
        properties: {
          name: peak.name,
          ele: peak.ele,
          rank: peak.rank,
          area: peak.area,
          type: 'peak'
        },
        geometry: {
          type: 'Point',
          coordinates: [peak.lng, peak.lat]
        }
      }))
    };

    this.map.addSource('taiwan-peaks-source', {
      type: 'geojson',
      data: geojson
    });

    // 百岳紅金三角標記
    this.map.addLayer({
      id: 'taiwan-peaks-circle',
      type: 'circle',
      source: 'taiwan-peaks-source',
      minzoom: 8,
      paint: {
        'circle-radius': 6,
        'circle-color': '#DC2626',
        'circle-stroke-color': '#FEF08A',
        'circle-stroke-width': 2.5
      }
    });

    // 山名與標高標籤
    this.map.addLayer({
      id: 'taiwan-peaks-label',
      type: 'symbol',
      source: 'taiwan-peaks-source',
      minzoom: 9.5,
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n▲', ['to-string', ['get', 'ele']], 'm'],
        'text-size': 11,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
        'text-font': ['Open Sans Bold']
      },
      paint: {
        'text-color': '#7F1D1D',
        'text-halo-color': '#FFFFFF',
        'text-halo-width': 2.5
      }
    });
  }

  setupHighlightLayers() {
    if (!this.map.getSource('selected-highlight-source')) {
      this.map.addSource('selected-highlight-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      this.map.addLayer({
        id: 'selected-highlight-line-glow',
        type: 'line',
        source: 'selected-highlight-source',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#38BDF8',
          'line-width': 7,
          'line-opacity': 0.75
        }
      });

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

      this.map.addLayer({
        id: 'selected-highlight-point',
        type: 'circle',
        source: 'selected-highlight-source',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 11,
          'circle-color': '#38BDF8',
          'circle-opacity': 0.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2.5
        }
      });
    }
  }

  setupClickListeners() {
    const clickableLayers = [
      'taiwan-peaks-circle',
      'taiwan-peaks-label',
      'trail-path',
      'forestry-track',
      'roads',
      'mountain-peak-point',
      'mountain-peak-label',
      'poi-camp-hut',
      'poi-camp-hut-label'
    ];

    this.map.on('click', (e) => {
      const bbox = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8]
      ];

      const activeClickable = clickableLayers.filter((l) => this.map.getLayer(l));
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
          const clickCoords = topFeature.geometry.type === 'Point' 
            ? topFeature.geometry.coordinates 
            : [e.lngLat.lng, e.lngLat.lat];
          this.onFeatureSelected(topFeature, clickCoords);
        }
      } else {
        this.clearHighlight();
        if (this.onFeatureSelected) {
          this.onFeatureSelected(null, null);
        }
      }
    });
  }

  highlightFeature(feature) {
    const source = this.map.getSource('selected-highlight-source');
    if (source && feature.geometry) {
      source.setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }
  }

  clearHighlight() {
    const source = this.map.getSource('selected-highlight-source');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }

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

  updateGpsLocation(point, shouldPan = false) {
    if (!point || !this.map) return;

    const coords = [point.lng, point.lat];
    this.gpsMarker.setLngLat(coords).addTo(this.map);

    if (shouldPan) {
      this.map.easeTo({
        center: coords,
        zoom: Math.max(this.map.getZoom(), 15.2),
        duration: 600
      });
    }
  }

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
          'line-width': 4.5,
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
          'line-width': 3.0
        }
      });

      this.map.addLayer({
        id: wptLayerId,
        type: 'circle',
        source: sourceId,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5.5,
          'circle-color': trackItem.color,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 1.8
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
      this.map.fitBounds(trackItem.bounds, { padding: 40, duration: 800 });
    }
  }

  removeGpxTrack(trackId) {
    const layers = [
      `gpx-wpt-label-${trackId}`,
      `gpx-wpt-${trackId}`,
      `gpx-line-${trackId}`,
      `gpx-casing-${trackId}`
    ];
    layers.forEach((l) => {
      if (this.map.getLayer(l)) this.map.removeLayer(l);
    });
    if (this.map.getSource(`gpx-source-${trackId}`)) {
      this.map.removeSource(`gpx-source-${trackId}`);
    }
  }

  fitBounds(bounds) {
    if (bounds && this.map) {
      this.map.fitBounds(bounds, { padding: 40, duration: 800 });
    }
  }

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
