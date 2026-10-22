/**
 * GPS 即時定位追蹤、航跡記錄與統計引擎
 */

export class GpsTracker {
  constructor() {
    this.watchId = null;
    this.wakeLock = null;
    this.isTracking = false;
    this.isRecording = false;

    // 航跡數據
    this.trackPoints = []; // [{ lat, lng, ele, time, speed, accuracy }]
    this.startTime = null;
    this.totalDistanceMeters = 0;
    this.totalAscent = 0;
    this.totalDescent = 0;
    this.currentElevation = 0;
    this.maxElevation = -9999;
    this.minElevation = 9999;

    // 回呼函式
    this.onLocationUpdate = null;
    this.onStatsUpdate = null;
  }

  /**
   * 啟動 GPS 定位監聽
   */
  startWatching() {
    if (!('geolocation' in navigator)) {
      alert('您的裝置或瀏覽器不支援 Geolocation GPS 定位功能');
      return false;
    }

    if (this.watchId !== null) return true;

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 1000
    };

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handlePositionSuccess(pos),
      (err) => this.handlePositionError(err),
      options
    );

    this.requestWakeLock();
    this.isTracking = true;
    return true;
  }

  /**
   * 停止 GPS 定位監聽
   */
  stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.releaseWakeLock();
    this.isTracking = false;
  }

  /**
   * 開始記錄軌跡
   */
  startRecording() {
    this.isRecording = true;
    this.startTime = this.startTime || Date.now();
    this.startWatching();
  }

  /**
   * 暫停記錄軌跡
   */
  pauseRecording() {
    this.isRecording = false;
  }

  /**
   * 重設並清除目前記錄的軌跡
   */
  resetRecording() {
    this.isRecording = false;
    this.trackPoints = [];
    this.startTime = null;
    this.totalDistanceMeters = 0;
    this.totalAscent = 0;
    this.totalDescent = 0;
    this.maxElevation = -9999;
    this.minElevation = 9999;
    this.currentElevation = 0;

    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.getStats());
    }
  }

  /**
   * 處理 GPS 位置回報
   */
  handlePositionSuccess(pos) {
    const coords = pos.coords;
    const lat = coords.latitude;
    const lng = coords.longitude;
    const ele = coords.altitude !== null ? Math.round(coords.altitude) : 0;
    const speed = coords.speed !== null && coords.speed >= 0 ? coords.speed * 3.6 : 0; // km/h
    const accuracy = Math.round(coords.accuracy);
    const timestamp = pos.timestamp;

    this.currentElevation = ele;

    const currentPoint = {
      lat,
      lng,
      ele,
      time: new Date(timestamp),
      speed,
      accuracy
    };

    // 若處於記錄狀態且定位精確度合理 (< 50m)，記錄航跡點
    if (this.isRecording) {
      const prevPoint = this.trackPoints.length > 0 ? this.trackPoints[this.trackPoints.length - 1] : null;

      if (prevPoint) {
        const dist = this.haversineDistance(prevPoint.lat, prevPoint.lng, lat, lng);
        // 避開原地漂移 (距離大於 3 公尺才採計)
        if (dist >= 3) {
          this.totalDistanceMeters += dist;
          const eleDiff = ele - prevPoint.ele;
          if (eleDiff > 1) {
            this.totalAscent += eleDiff;
          } else if (eleDiff < -1) {
            this.totalDescent += Math.abs(eleDiff);
          }

          if (ele > this.maxElevation) this.maxElevation = ele;
          if (ele < this.minElevation) this.minElevation = ele;

          this.trackPoints.push(currentPoint);
        }
      } else {
        this.trackPoints.push(currentPoint);
        this.maxElevation = ele;
        this.minElevation = ele;
      }

      if (this.onStatsUpdate) {
        this.onStatsUpdate(this.getStats());
      }
    }

    if (this.onLocationUpdate) {
      this.onLocationUpdate(currentPoint);
    }
  }

  handlePositionError(err) {
    console.warn('[GPS] Position error:', err.message);
  }

  /**
   * 取得即時統計數據
   */
  getStats() {
    const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
    const totalKm = this.totalDistanceMeters / 1000;
    const elapsedHours = elapsedMs / (1000 * 3600);
    const avgSpeed = elapsedHours > 0 ? totalKm / elapsedHours : 0;

    return {
      distanceKm: totalKm.toFixed(2),
      elapsedTimeFormatted: this.formatDuration(elapsedMs),
      ascentM: Math.round(this.totalAscent),
      descentM: Math.round(this.totalDescent),
      currentEleM: this.currentElevation,
      maxEleM: this.maxElevation === -9999 ? 0 : this.maxElevation,
      minEleM: this.minElevation === 9999 ? 0 : this.minElevation,
      avgSpeedKmh: avgSpeed.toFixed(1),
      pointsCount: this.trackPoints.length
    };
  }

  /**
   * 產出標準 GPX 格式字串
   */
  exportGPX(trackName = '魯地圖登山軌跡') {
    if (this.trackPoints.length === 0) {
      throw new Error('目前沒有記錄任何軌跡點，無法匯出');
    }

    const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Taiwan Rudy TOPO Offline PWA" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>`;

    const gpxPoints = this.trackPoints.map((pt) => {
      return `      <trkpt lat="${pt.lat}" lon="${pt.lng}">
        <ele>${pt.ele}</ele>
        <time>${pt.time.toISOString()}</time>
      </trkpt>`;
    }).join('\n');

    const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

    return gpxHeader + '\n' + gpxPoints + gpxFooter;
  }

  /**
   * 申請螢幕防休眠 Wake Lock
   */
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[GPS] Screen Wake Lock acquired.');
      } catch (err) {
        console.warn('[GPS] Wake Lock request error:', err);
      }
    }
  }

  /**
   * 釋放螢幕防休眠
   */
  async releaseWakeLock() {
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        console.log('[GPS] Screen Wake Lock released.');
      } catch (err) {}
    }
  }

  /**
   * Haversine 兩經緯度距離計算 (單位：公尺)
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // 地球平均半徑 (m)
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
