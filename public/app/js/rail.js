/*
 * File: public/app/js/rail.js
 * 機能: 国土数値情報 N02（鉄道）から作成した駅ポイント GeoJSON
 *       (/app/datasets/rail/n02/hiroshima/N02_2024_stations.geojson)
 *       をブラウザで読み込み、最寄駅の検索（k件・距離閾値つき）を行うユーティリティ。
 *
 * 提供関数:
 *   await Rail.load()                      // 初回ロード（駅GeoJSON読込＋簡易グリッド索引化）
 *   Rail.count()                           // 駅件数
 *   Rail.nearest(lon, lat, opts?)          // 最寄駅検索（デフォルト 上位5件）
 *     - opts.k            : 取得件数（既定5）
 *     - opts.maxMeters    : 距離上限m（既定 20000）
 *     - opts.operatorLike : 事業者名部分一致（例 "広島電鉄"）
 *     - opts.lineLike     : 路線名部分一致（例 "本線"）
 *   Rail.searchByName(q)                   // 駅名の部分一致配列を返す（軽い候補表示用）
 *
 * 返却オブジェクト（nearestの各要素）:
 *   { name, line, operator, lon, lat, dist_m, props }  // propsはN02_*原属性
 *
 * 注意:
 *   - 駅はN02の駅ポリラインを重心点で点化したもの（簡易）。可視化・近傍検索用途には十分。
 *   - 緯度経度はWGS84、入力は [lon, lat] 順。
 */

(function (global) {
  'use strict';

  const STATIONS_URL = "/app/datasets/rail/n02/hiroshima/N02_2024_stations.geojson";

  // グリッド設定: 約1km四方（緯度方向）を目安に0.01度
  const GRID_DEG = 0.01;

  const Rail = {
    _loaded: false,
    _items: [],       // {lon, lat, name, line, operator, props}
    _grid: new Map(), // key="gy_gx" -> indices[]
    _minLon:  Infinity, _minLat:  Infinity,
    _maxLon: -Infinity, _maxLat: -Infinity,

    async load() {
      if (this._loaded) return this._items.length;
      const res = await fetch(STATIONS_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error("駅GeoJSONの取得に失敗: HTTP " + res.status);
      const gj = await res.json();
      if (!gj || !Array.isArray(gj.features)) throw new Error("GeoJSON形式エラー");

      // 正規化
      this._items = gj.features
        .filter(f => f && f.geometry && f.geometry.type === "Point")
        .map(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const name = p.N02_005 ?? "";
          const line = p.N02_003 ?? "";
          const operator = p.N02_004 ?? "";
          return { lon: +lon, lat: +lat, name, line, operator, props: p };
        });

      // BBox & グリッド索引
      for (let i = 0; i < this._items.length; i++) {
        const it = this._items[i];
        if (!isFinite(it.lon) || !isFinite(it.lat)) continue;
        if (it.lon < this._minLon) this._minLon = it.lon;
        if (it.lat < this._minLat) this._minLat = it.lat;
        if (it.lon > this._maxLon) this._maxLon = it.lon;
        if (it.lat > this._maxLat) this._maxLat = it.lat;

        const gx = gridX(it.lon), gy = gridY(it.lat);
        const key = gy + "_" + gx;
        if (!this._grid.has(key)) this._grid.set(key, []);
        this._grid.get(key).push(i);
      }

      this._loaded = true;
      return this._items.length;
    },

    count() { return this._items.length; },

    /**
     * 最寄駅検索
     * @param {number} lon 経度
     * @param {number} lat 緯度
     * @param {object} opts
     * @returns {Array<{name,line,operator,lon,lat,dist_m,props}>}
     */
    nearest(lon, lat, opts = {}) {
      if (!this._loaded) throw new Error("Rail.load() を先に実行してください。");
      if (!isFinite(lon) || !isFinite(lat)) return [];

      const k = Math.max(1, opts.k ?? 5);
      const maxMeters = Math.max(1, opts.maxMeters ?? 20000);
      const opLike = normStr(opts.operatorLike);
      const lnLike = normStr(opts.lineLike);

      // 近傍セルを同心で拡張しつつ候補を収集
      const gx0 = gridX(lon), gy0 = gridY(lat);
      const visited = new Set();
      let candidates = [];
      for (let radius = 0; radius <= 8; radius++) { // 半径8セル（≒約8km強）まで拡張
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            // 外周だけ捜査（重複削減）
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
            const gx = gx0 + dx, gy = gy0 + dy;
            const key = gy + "_" + gx;
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
                candidates.push({ it, dist_m: d });
              }
            }
          }
        }
        // ある程度たまれば打ち切り
        if (candidates.length >= k * 2) break;
      }

      if (candidates.length === 0) return [];

      candidates.sort((a, b) => a.dist_m - b.dist_m);
      candidates = candidates.slice(0, k);

      return candida
