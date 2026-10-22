/**
 * GPX 與 KML 軌跡檔案解析、管理與 GeoJSON 轉換模組
 */

export class GpxManager {
  constructor() {
    this.tracks = new Map(); // id -> { id, name, geojson, bounds, stats, color, visible }
    this.colorPalette = [
      '#EF4444', // Red
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Amber
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#06B6D4'  // Cyan
    ];
    this.colorIndex = 0;
  }

  /**
   * 載入並解析使用者選取或拖曳的檔案 (GPX 或 KML)
   */
  async loadFile(file) {
    const text = await file.text();
    const fileName = file.name;
    const isKml = fileName.toLowerCase().endsWith('.kml');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');

    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      throw new Error(`檔案「${fileName}」XML 格式解析失敗`);
    }

    const result = isKml ? this.parseKml(xmlDoc, fileName) : this.parseGpx(xmlDoc, fileName);
    const id = 'trk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const color = this.colorPalette[this.colorIndex % this.colorPalette.length];
    this.colorIndex++;

    const trackItem = {
      id,
      name: result.name || fileName.replace(/\.[^/.]+$/, ''),
      geojson: result.geojson,
      bounds: result.bounds,
      stats: result.stats,
      waypoints: result.waypoints,
      color,
      visible: true
    };

    this.tracks.set(id, trackItem);
    return trackItem;
  }

  /**
   * 解析 GPX XML 樹
   */
  parseGpx(xml, fileName) {
    let name = '';
    const nameNode = xml.querySelector('gpx > metadata > name') || xml.querySelector('gpx > trk > name');
    if (nameNode) name = nameNode.textContent.trim();

    const trkpts = xml.querySelectorAll('trkpt');
    const waypoints = [];
    const coordinates = [];
    const elevations = [];

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    let minEle = 9999, maxEle = -9999;
    let totalDistance = 0;
    let totalAscent = 0;
    let totalDescent = 0;

    // 解析軌跡點
    for (let i = 0; i < trkpts.length; i++) {
      const pt = trkpts[i];
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      const eleNode = pt.querySelector('ele');
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0;

      if (!isNaN(lat) && !isNaN(lon)) {
        coordinates.push([lon, lat, ele]);
        elevations.push(ele);

        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLng) minLng = lon;
        if (lon > maxLng) maxLng = lon;

        if (eleNode && !isNaN(ele)) {
          if (ele < minEle) minEle = ele;
          if (ele > maxEle) maxEle = ele;
        }

        if (coordinates.length > 1) {
          const prev = coordinates[coordinates.length - 2];
          const dist = this.haversineDistance(prev[1], prev[0], lat, lon);
          totalDistance += dist;

          const eleDiff = ele - prev[2];
          if (eleDiff > 0) totalAscent += eleDiff;
          else totalDescent += Math.abs(eleDiff);
        }
      }
    }

    // 解析航點
    const wpts = xml.querySelectorAll('wpt');
    for (let i = 0; i < wpts.length; i++) {
      const wpt = wpts[i];
      const lat = parseFloat(wpt.getAttribute('lat'));
      const lon = parseFloat(wpt.getAttribute('lon'));
      const eleNode = wpt.querySelector('ele');
      const nameNode = wpt.querySelector('name');
      const descNode = wpt.querySelector('desc');

      if (!isNaN(lat) && !isNaN(lon)) {
        waypoints.push({
          lat,
          lng: lon,
          ele: eleNode ? parseFloat(eleNode.textContent) : null,
          name: nameNode ? nameNode.textContent.trim() : '航點',
          desc: descNode ? descNode.textContent.trim() : ''
        });
      }
    }

    const geojson = {
      type: 'FeatureCollection',
      features: []
    };

    if (coordinates.length > 0) {
      geojson.features.push({
        type: 'Feature',
        properties: {
          name: name || fileName,
          type: 'track'
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      });
    }

    // 加入航點 Feature
    waypoints.forEach((wpt, index) => {
      geojson.features.push({
        type: 'Feature',
        properties: {
          name: wpt.name,
          desc: wpt.desc,
          ele: wpt.ele,
          type: 'waypoint'
        },
        geometry: {
          type: 'Point',
          coordinates: [wpt.lng, wpt.lat]
        }
      });
    });

    const bounds = coordinates.length > 0 ? [[minLng, minLat], [maxLng, maxLat]] : null;

    return {
      name,
      geojson,
      bounds,
      waypoints,
      stats: {
        distanceKm: (totalDistance / 1000).toFixed(2),
        ascentM: Math.round(totalAscent),
        descentM: Math.round(totalDescent),
        minEleM: minEle === 9999 ? 0 : Math.round(minEle),
        maxEleM: maxEle === -9999 ? 0 : Math.round(maxEle),
        pointsCount: coordinates.length,
        waypointsCount: waypoints.length
      }
    };
  }

  /**
   * 解析 KML 文件
   */
  parseKml(xml, fileName) {
    const coordinates = [];
    const coordNodes = xml.querySelectorAll('coordinates');
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

    for (let c = 0; c < coordNodes.length; c++) {
      const rawText = coordNodes[c].textContent.trim();
      const parts = rawText.split(/\s+/);
      for (const part of parts) {
        const coords = part.split(',').map(Number);
        if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          const lng = coords[0];
          const lat = coords[1];
          const ele = coords[2] || 0;
          coordinates.push([lng, lat, ele]);

          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLng) minLng = lng;
          if (lon > maxLng) maxLng = lng;
        }
      }
    }

    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: fileName },
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      ]
    };

    const bounds = coordinates.length > 0 ? [[minLng, minLat], [maxLng, maxLat]] : null;
    return {
      name: fileName,
      geojson,
      bounds,
      waypoints: [],
      stats: {
        distanceKm: '0.00',
        ascentM: 0,
        descentM: 0,
        minEleM: 0,
        maxEleM: 0,
        pointsCount: coordinates.length,
        waypointsCount: 0
      }
    };
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

  removeTrack(id) {
    return this.tracks.delete(id);
  }

  getAllTracks() {
    return Array.from(this.tracks.values());
  }
}
