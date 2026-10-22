/**
 * 台灣魯地圖 (Taiwan Rudy TOPO) 風格定義
 * 模擬 MOI/社群魯地圖配色：清晰的等高線、山徑階層、山峰三角點、水系與避難設施
 */

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
      // 背景底色 (山林大地色)
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#F4F2EB'
        }
      },
      // 國家公園與自然保護區面
      {
        id: 'park-boundary',
        type: 'fill',
        source: sourceId,
        'source-layer': 'boundary',
        filter: ['any', ['==', 'boundary', 'national_park'], ['==', 'boundary', 'protected_area']],
        paint: {
          'fill-color': '#DCFCE7',
          'fill-opacity': 0.35
        }
      },
      // 水體面 (湖泊、水庫、水塘)
      {
        id: 'water-polygon',
        type: 'fill',
        source: sourceId,
        'source-layer': 'water',
        paint: {
          'fill-color': '#BAE6FD',
          'fill-opacity': 0.8
        }
      },
      // 水系線 (溪流、主要河川)
      {
        id: 'waterway',
        type: 'line',
        source: sourceId,
        'source-layer': 'waterway',
        paint: {
          'line-color': '#0284C7',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.8,
            15, 2.5
          ]
        }
      },
      // 等高線 - 首曲線 (一般 10m / 20m 間距)
      {
        id: 'contour-minor',
        type: 'line',
        source: sourceId,
        'source-layer': 'contour',
        filter: ['all', ['!=', ['%', ['get', 'ele'], 100], 0]],
        paint: {
          'line-color': '#B45309',
          'line-opacity': 0.45,
          'line-width': 0.6
        }
      },
      // 等高線 - 計曲線 (每 100m 加粗)
      {
        id: 'contour-major',
        type: 'line',
        source: sourceId,
        'source-layer': 'contour',
        filter: ['all', ['==', ['%', ['get', 'ele'], 100], 0]],
        paint: {
          'line-color': '#78350F',
          'line-opacity': 0.8,
          'line-width': 1.4
        }
      },
      // 等高線標高文字 (計曲線標示海拔)
      {
        id: 'contour-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'contour',
        filter: ['all', ['==', ['%', ['get', 'ele'], 100], 0]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['concat', ['to-string', ['get', 'ele']], 'm'],
          'text-size': 10,
          'text-font': ['Open Sans Regular'],
          'text-max-angle': 25
        },
        paint: {
          'text-color': '#78350F',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5
        }
      },
      // 鋪面道路 / 省道 / 縣道 (底層)
      {
        id: 'roads',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        filter: ['in', 'class', 'primary', 'secondary', 'tertiary'],
        paint: {
          'line-color': '#F59E0B',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 1.5,
            15, 4
          ]
        }
      },
      // 林道 (Forestry Track)
      {
        id: 'forestry-track',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        filter: ['==', 'class', 'track'],
        paint: {
          'line-color': '#854D0E',
          'line-width': 1.8,
          'line-dasharray': [4, 2]
        }
      },
      // 一般健行步道 (Hiking Path - 清晰紅棕色)
      {
        id: 'trail-path',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        filter: ['==', 'class', 'path'],
        paint: {
          'line-color': '#DC2626',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 1.2,
            14, 2.4,
            17, 3.5
          ],
          'line-dasharray': [3, 2]
        }
      },
      // 山屋與營地標記 (Hut / Campsite)
      {
        id: 'poi-camp-hut',
        type: 'circle',
        source: sourceId,
        'source-layer': 'poi',
        filter: ['in', 'class', 'shelter', 'camp_site', 'alpine_hut'],
        paint: {
          'circle-radius': 5.5,
          'circle-color': '#16A34A',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2
        }
      },
      {
        id: 'poi-camp-hut-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'poi',
        filter: ['in', 'class', 'shelter', 'camp_site', 'alpine_hut'],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-font': ['Open Sans Bold']
        },
        paint: {
          'text-color': '#166534',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2
        }
      },
      // 山峰與百岳三角點 (Peak / Summit)
      {
        id: 'mountain-peak-point',
        type: 'circle',
        source: sourceId,
        'source-layer': 'poi',
        filter: ['==', 'class', 'peak'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#991B1B',
          'circle-stroke-color': '#FEF08A',
          'circle-stroke-width': 2
        }
      },
      // 山峰名稱與標高文字標籤
      {
        id: 'mountain-peak-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'poi',
        filter: ['==', 'class', 'peak'],
        layout: {
          'text-field': [
            'case',
            ['has', 'ele'],
            ['concat', ['get', 'name'], '\n▲', ['to-string', ['get', 'ele']], 'm'],
            ['get', 'name']
          ],
          'text-size': 12,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
          'text-font': ['Open Sans Bold']
        },
        paint: {
          'text-color': '#7F1D1D',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2.5
        }
      }
    ]
  };
}

/**
 * 預設備援底圖樣式 (當尚未載入魯地圖 PMTiles 時使用之台灣高對比地形底圖)
 */
export const defaultOnlineStyle = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors | Rudy TOPO PWA'
    },
    'opentopo-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.opentopomap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenTopoMap | Rudy TOPO PWA'
    }
  },
  layers: [
    {
      id: 'opentopo-base',
      type: 'raster',
      source: 'opentopo-tiles',
      minzoom: 0,
      maxzoom: 18
    }
  ]
};
