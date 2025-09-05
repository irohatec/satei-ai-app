/*
 * File: public/app/js/valuation-features.js
 * 機能: 査定用の特徴量を1点からまとめて取得する統合ユーティリティ。
 *       - 用途地域（A29）: Zoning.query() を利用
 *       - 最寄駅 + 2022乗降人員（S12）: stations_with_ridership.geojson を検索
 *
 * 前提:
 *   1) zoning.js が先に読み込まれていること（window.Zoning を提供）
 *      <script src="/app/js/zoning.js"></script>
 *   2) データ設置済み:
 *      - /app/datasets/zoning/hiroshima/A29_2019_34.geojson
 *      - /app/datasets/rail/s12/hiroshima/stations_with_ridership.geojson
 *
 * 提供関数:
 *   await ValuationFeatures.load();  // 初回ロード（用途地域と駅データの準備）
 *   await ValuationFeatures.enrich(lon, lat, opts?)  // 1点の特徴量まとめ
 *     - opts.k:          最寄駅の取得件数（既定3）
 *     - opts.maxMeters:  検索距離上限m（既定20000）
 *     - opts.operatorLike / opts.lineLike: 事業者/路線名で部分一致フィルタ
 *
 * 返却:
 *   {
 *     input: { lon, lat },
 *     zoning: { name, bcr, far, props, feature } | null,
 *     stations: [
 *       { name, line, operator, ridership, lon, lat, dist_m, props }, ...
 *     ]
 *   }
 *
 * 注意:
 *   - 駅ポイントは N02 駅 × S12_2022 を結合済みのものを使用（ridership_2022）。
 *   - どちらのデータも行政境界・駅構内形状の厳密さは保証しません（公式の免責に準拠）。
 */

(function (global) {
  'use strict';

  const DATA_STATIONS = "/app/datasets/rail/s12/hiroshima/stations_with_ridership.geojson";
  const GRID_DEG = 0.01; // 約1km

  const ValuationFeatures = {
    _loaded: false,

    // 駅データ
    _items: [],        // {lon,lat,name,line,operator,ridership,props}
    _grid: new Map(),  // "gy_gx" -> indices

    /**
     * 初回ロード: 用途地域(Zoning)と駅データ（ridership付）を準備
     */
    async load() {
      if (this._loaded) return;

      // 1) 用途地域（zoning.js が前提）
      if (!global.Zoning || typeof global.Zoning.load !== "function") {
        throw new Error("zoning.js が読み込まれていません。（/app/js/zoning.js を先に読み込んでください）");
      }
      await Zoning.load();

      // 2) 駅 + 2022乗降人員
      const res = await fetch(DATA_STATIONS, { cache: "force-cache" });
      if (!res.ok) throw new Error("stations_with_ridership.geojson の取得に失敗: HTTP " + res.status);
      const gj = await res.json();

      this._items = (gj.features || [])
        .filter(f => f && f.geometry && f.geometry.type === "Point")
        .map(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          return {
            lon: +lon,
            lat: +lat,
            name: p.N02_005 ?? p.S12_name ?? "",
            line: p.N02_003 ?? p.S12_line ?? "",
            operator: p.N02_004 ?? p.S12_operator ?? "",
            ridership: p.ridership_2022 ?? null,
            props: p
          };
        });

      // 索引作成（1km格子）
      this._grid.clear();
      for (let i = 0; i < this._items.length; i++) {
        const it = this._items[i];
        const key = gridY(it.lat) + "_" + gridX(it.lon);
        if (!this._grid.has(key)) this._grid.set(key, []);
        this._grid.get(key).push(i);
      }

      this._loaded = true;
    },

    /**
     * 1点の特徴量をまとめて返す
     * @param {number} lon 経度
     * @param {number} lat 緯度
     * @param {object} opts {k,maxMeters,operatorLike,lineLike}
     * @returns {Promise<{input:{lon,lat}, zoning:object|null, stations:Array}>}
     */
    async enrich(lon, lat, opts = {}) {
      if (!this._loaded) await this.load();
      const zoning = safeZoning(lon, lat);
      const stations = this._nearestStations(lon, lat, opts);
      return { input: { lon, lat }, zoning, stations };
    },

    /**
     * 最寄駅検索（ridership付き）
     */
    _nearestStations(lon, lat, { k = 3, maxMeters = 20000, operatorLike = "", lineLike = "" } = {}) {
      const opLike = norm(operatorLike);
      const lnLike = norm(lineLike);
      const gx0 = gridX(lon), gy0 = gridY(lat);

      const visited = new Set();
      let candidates = [];

      // 同心に探索を広げる
      for (let r = 0; r <= 8; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 外周のみ
            const key = (gy0 + dy) + "_" + (gx0 + dx);
            if (visited.has(key)) continue;
            visited.add(key);

            const idxs = this._grid.get(key);
            if (!idxs) continue;

            for (const i of idxs) {
              const it = this._items[i];
              if (opLike && !containsLike(it.operator, opLike)) continue;
              if (lnLike && !containsLike(it.line, lnLike)) continue;
              const d = haversineMeters(lat, lon, it.lat, it.lon);
              if (d <= maxMeters) {
                candidates.push({ it, d });
              }
            }
          }
        }
        if (candidates.length >= k * 2) break;
      }

      candidates.sort((a, b) => a.d - b.d);
      candidates = candidates.slice(0, Math.max(1, k));

      return candidates.map(({ it, d }) => ({
        name: it.name,
        line: it.line,
        operator: it.operator,
        ridership: it.ridership,
        lon: it.lon,
        lat: it.lat,
        dist_m: Math.round(d),
        props: it.props
      }));
    }
  };

  // ---- 内部ユーティリティ ----
  function gridX(lon) { return Math.floor(lon / GRID_DEG); }
  function gridY(lat) { return Math.floor(lat / GRID_DEG); }

  function toRad(d) { return d * Math.PI / 180; }
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function norm(v) { return String(v ?? "").trim().toLowerCase(); }
  function containsLike(hay, needleLower) { return String(hay ?? "").toLowerCase().includes(needleLower); }

  function safeZoning(lon, lat) {
    try {
      return Zoning.query(lon, lat) || null;
    } catch {
      return null;
    }
  }

  // 公開
  global.ValuationFeatures = ValuationFeatures;

})(window);
