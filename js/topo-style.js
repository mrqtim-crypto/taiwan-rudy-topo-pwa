/**
 * 台灣魯地圖 (Taiwan Rudy TOPO) 風格定義
 * 針對 iOS 行動裝置效能優化版：分級縮放載入，遠看只繪製計曲線，近看才展開細部首曲線與小路，極致省電與順暢！
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
      // 背景底色
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#F4F2EB'
        }
      },
      // 國家公園與自然保護區 (zoom >= 8 顯示)
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
      // 水體面 (湖泊水庫)
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
      // 主要水系與溪流 (zoom >= 11 顯示)
      {
        id: 'waterway',
        type: 'line',
        source: sourceId,
        'source-layer': 'waterway',
        minzoom: 11,
        paint: {
          'line-color': '#0284C7',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 0.8,
            15, 2.0
          ]
        }
      },
      // 【iOS 效能優化】等高線 - 首曲線 (一般 10m/20m) 僅在 zoom >= 13 時才渲染，遠看完全不消耗 GPU
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
      // 等高線 - 計曲線 (每 100m 加粗) zoom >= 10 開始渲染
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
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.8,
            14, 1.4
          ]
        }
      },
      // 計曲線高程文字 (zoom >= 13 顯示，避免文字過密卡頓)
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
          'text-font': ['Open Sans Regular'],
          'text-max-angle': 30
        },
        paint: {
          'text-color': '#78350F',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.2
        }
      },
      // 主要公路 / 聯絡道路 (zoom >= 8 顯示)
      {
        id: 'roads',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        minzoom: 8,
        filter: ['in', 'class', 'primary', 'secondary', 'tertiary'],
        paint: {
          'line-color': '#F59E0B',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            8, 1.0,
            14, 3.0
          ]
        }
      },
      // 林道 (zoom >= 11 顯示)
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
      // 登山步道 / 山徑 (zoom >= 11 顯示，清晰高對比紅線)
      {
        id: 'trail-path',
        type: 'line',
        source: sourceId,
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['==', 'class', 'path'],
        paint: {
          'line-color': '#DC2626',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            11, 1.2,
            14, 2.4,
            17, 3.2
          ],
          'line-dasharray': [3, 2]
        }
      },
      // 山屋與營地 (zoom >= 11 顯示)
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
        id: 'poi-camp-hut-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'poi',
        minzoom: 12,
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
      // 山峰與百岳三角點 (zoom >= 10 顯示)
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
      },
      // 山峰名稱與標高 (zoom >= 11 顯示)
      {
        id: 'mountain-peak-label',
        type: 'symbol',
        source: sourceId,
        'source-layer': 'poi',
        minzoom: 11,
        filter: ['==', 'class', 'peak'],
        layout: {
          'text-field': [
            'case',
            ['has', 'ele'],
            ['concat', ['get', 'name'], '\n▲', ['to-string', ['get', 'ele']], 'm'],
            ['get', 'name']
          ],
          'text-size': 11.5,
          'text-offset': [0, -1.4],
          'text-anchor': 'bottom',
          'text-font': ['Open Sans Bold']
        },
        paint: {
          'text-color': '#7F1D1D',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2.2
        }
      }
    ]
  };
}

/**
 * 預設備援底圖樣式 (僅涵蓋台灣區域)
 */
export const defaultOnlineStyle = {
  version: 8,
  sources: {
    'opentopo-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.opentopomap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '&copy; OpenTopoMap contributors'
    }
  },
  layers: [
    {
      id: 'opentopo-base',
      type: 'raster',
      source: 'opentopo-tiles',
      minzoom: 6,
      maxzoom: 18
    }
  ]
};
