/**
 * 台灣登山多圖層樣式定義 (參考 taiwan-peak 的多底圖切換與魯地圖登山風格)
 */

export const BASE_LAYERS = {
  topo: {
    id: 'topo',
    name: '🏔️ 台灣等高線地形圖 (OpenTopoMap)',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxzoom: 17
  },
  satellite: {
    id: 'satellite',
    name: '🛰️ 台灣高空正射航照圖 (Esri Satellite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxzoom: 18
  },
  osm: {
    id: 'osm',
    name: '🗺️ 開放街圖 (OSM Standard)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxzoom: 18
  },
  cyclosm: {
    id: 'cyclosm',
    name: '🚲 越野與自行車地圖 (CyclOSM)',
    url: 'https://tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    maxzoom: 17
  }
};

export function getBaseStyle(layerKey = 'topo') {
  const layer = BASE_LAYERS[layerKey] || BASE_LAYERS.topo;

  return {
    version: 8,
    sources: {
      'base-tiles': {
        type: 'raster',
        tiles: [layer.url],
        tileSize: 256,
        attribution: '&copy; Taiwan Mountain Map'
      }
    },
    layers: [
      {
        id: 'base-raster-layer',
        type: 'raster',
        source: 'base-tiles',
        minzoom: 6,
        maxzoom: layer.maxzoom || 18
      }
    ]
  };
}

export function createRudyTopoStyle(sourceId = 'rudy-source', sourceUrl = '') {
  return {
    version: 8,
    name: 'Taiwan Rudy TOPO Offline',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      [sourceId]: {
        type: 'vector',
        url: sourceUrl || undefined
      }
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#F4F2EB'
        }
      },
      {
        id: 'park-boundary',
        type: 'fill',
        source: sourceId,
        'source-layer': 'boundary',
        minzoom: 8,
        filter: ['any', ['==', 'boundary', 'national_park'], ['==', 'boundary', 'protected_area']],
        paint: {
          'fill-color': '#DCFCE7',
          'fill-opacity': 0.3
        }
      },
      {
        id: 'water-polygon',
        type: 'fill',
        source: sourceId,
        'source-layer': 'water',
        minzoom: 8,
        paint: {
          'fill-color': '#BAE6FD',
          'fill-opacity': 0.75
        }
      },
      {
        id: 'waterway',
        type: 'line',
        source: sourceId,
        'source-layer': 'waterway',
        minzoom: 11,
        paint: {
          'line-color': '#0284C7',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 15, 2.0]
        }
      },
      {
        id: 'contour-minor',
        type: 'line',
        source: sourceId,
        'source-layer': 'contour',
        minzoom: 13,
        filter: ['all', ['!=', ['%', ['get', 'ele'], 100], 0]],
        paint: {
          'line-color': '#B45309',
          'line-opacity': 0.35,
          'line-width': 0.5
        }
      },
      {
        id: 'contour-major',
        type: 'line',
        source: sourceId,
        'source-layer': 'contour',
        minzoom: 10,
        filter: ['all', ['==', ['%', ['get', 'ele'], 100], 0]],
        paint: {
          'line-color': '#78350F',
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.4]
        }
      },
      {
        id: 'contour-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'contour',
        minzoom: 13,
        filter: ['all', ['==', ['%', ['get', 'ele'], 100], 0]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
          'text-size': 9.5,
          'text-font': ['Open Sans Regular']
        },
        paint: {
          'text-color': '#78350F',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.2
        }
      },
      {
        id: 'roads',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', 'class', 'primary', 'secondary', 'tertiary'],
        paint: {
          'line-color': '#F59E0B',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.0, 14, 3.0]
        }
      },
      {
        id: 'forestry-track',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', 'class', 'track'],
        paint: {
          'line-color': '#854D0E',
          'line-width': 1.5,
          'line-dasharray': [4, 2]
        }
      },
      {
        id: 'trail-path',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', 'class', 'path'],
        paint: {
          'line-color': '#DC2626',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 14, 2.4, 17, 3.2],
          'line-dasharray': [3, 2]
        }
      },
      {
        id: 'poi-camp-hut',
        type: 'circle',
        source: sourceId,
        'source-layer': 'poi',
        minzoom: 11,
        filter: ['in', 'class', 'shelter', 'camp_site', 'alpine_hut'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#16A34A',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 1.8
        }
      },
      {
        id: 'mountain-peak-point',
        type: 'circle',
        source: sourceId,
        'source-layer': 'poi',
        minzoom: 10,
        filter: ['==', 'class', 'peak'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#991B1B',
          'circle-stroke-color': '#FEF08A',
          'circle-stroke-width': 1.8
        }
      }
    ]
  };
}

export const defaultOnlineStyle = getBaseStyle('topo');
