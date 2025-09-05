/*
 * File: public/app/js/zoning.js
 * 機能: 国土数値情報 A29（用途地域）GeoJSONをブラウザで読み込み、
 *       指定座標（lon, lat）に対して用途地域名(A29_005)と
 *       建蔽率/容積率（bcr/far）を PIP（Point-in-Polygon）で簡易判定するユーティリティ。
 *
 * 提供関数:
 *   - await Zoning.load():  初回ロード（GeoJSON取得と簡易インデックス作成）
 *   - Zoning.query(lon, lat): 1点判定 → { name, bcr, far, props, feature } | null
 *   - Zoning.count():       読み込み済みフィーチャ数
 *
 * 前提データ:
 *   - /app/datasets/zoning/hiroshima/A29_2019_34.geojson（約18MB）
 *
 * 注意:
 *   - 本GeoJSONは「簡易変換」由来（穴ポリゴン未対応）を想定。境界付近では誤判定の可能性あり。
 *   - 9999（不明）は null として扱う（bcr/far）。
 *   - 経度(lon), 緯度(lat) は WGS84 / GeoJSON 順（[lon, lat]）で入力。
 */

(function (global) {
  'use strict';

  const DATA_URL = "/app/datasets/zoning/hiroshima/A29_2019_34.geojson";

  const Zoning = {
    _loaded: false,
    _features: [],   // { f:Feature, bbox:[minX,minY,maxX,maxY], area:number }
    _count: 0,

    /**
     * 初回ロード（GeoJSONを読み込み→簡易インデックス作成）
     * @returns {Promise<number>} 読み込んだフィーチャ数
     */
    async load() {
      if (this._loaded) return this._count;

      const res = await fetch(DATA_URL, { cache: "force-cache" });
      if (!res.ok) throw new Error("A29 GeoJSONの取得に失敗: HTTP " + res.status);

      const gj = await res.json();
      if (!gj || !Array.isArray(gj.features)) {
        throw new Error("GeoJSON形式エラー");
      }

      this._features = gj.features
        .filter(f => f && f.geometry)
        .map(f => {
          const bbox = bboxOfFeature(f);
          const area = featureAreaApprox(f); // 粗い面積（複数当たり時の優先用）
          return { f, bbox, area };
        });

      this._count = this._features.length;
      this._loaded = true;
      return this._count;
    },

    /**
     * 1点の用途地域判定（Point-in-Polygon）
     * @param {number} lon 経度（東経は正）
     * @param {number} lat 緯度（北緯は正）
     * @returns {null|{name:string,bcr:?number,far:?number,props:object,feature:object}}
     */
    query(lon, lat) {
      if (!this._loaded) throw new Error("Zoning.load() を先に実行してください。");
      if (!isFinite(lon) || !isFinite(lat)) return null;

      // 1) bbox で粗選別
      const candidates = [];
      for (const it of this._features) {
        const b = it.bbox;
        if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        if (pointInFeature(lon, lat, it.f)) candidates.push(it);
      }
      if (candidates.length === 0) return null;

      // 2) 最大面積のものを優先（境界付近の重複対策）
      candidates.sort((a, b) => b.area - a.area);
      const picked = candidates[0].f;
      const p = picked.properties || {};
      const name = p.A29_005 ?? "(名称なし)";
      const bcr  = toRateOrNull(p.bcr ?? p.A29_006);
      const far  = toRateOrNull(p.far ?? p.A29_007);

      return { name, bcr, far, props: p, feature: picked };
    },

    /** 読み込み済みフィーチャ数 */
    count() { return this._count; }
  };

  // ---------- 内部ユーティリティ ----------

  function toRateOrNull(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return n === 9999 ? null : n;
  }

  function bboxOfFeature(f) {
    let minX =  Infinity, minY =  Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    const g = f.geometry;
    const t = g?.type;
    const c = g?.coordinates;
    if (t === "Polygon") {
      scanPolygon(c, update);
    } else if (t === "MultiPolygon") {
      for (const poly of c) scanPolygon(poly, update);
    }
    return [minX, minY, maxX, maxY];

    function update(x, y) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }

  function scanPolygon(polyCoords, cb) {
    // polyCoords = [ ring1, ring2(hole)… ], ring = [ [x,y], … ]
    if (!Array.isArray(polyCoords)) return;
    for (const ring of polyCoords) {
      if (!Array.isArray(ring)) continue;
      for (const pt of ring) cb(pt[0], pt[1]);
    }
  }

  function pointInFeature(lon, lat, f) {
    const g = f.geometry;
    if (!g) return false;
    if (g.type === "Polygon") {
      return pointInPolygon(lon, lat, g.coordinates);
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates) {
        if (pointInPolygon(lon, lat, poly)) return true;
      }
      return false;
    }
    return false;
  }

  // Ray casting（偶奇ルール）: 外環のみ採用、穴は未対応（簡易変換前提）
  function pointInPolygon(lon, lat, polyCoords) {
    if (!polyCoords || polyCoords.length === 0) return false;
    const outer = polyCoords[0]; // 外環のみ
    let inside = false;
    for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
      const xi = outer[i][0], yi = outer[i][1];
      const xj = outer[j][0], yj = outer[j][1];
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // 面積（近似）：外環のみ、穴は無視（大まかな優先判定用）
  function featureAreaApprox(f) {
    const g = f.geometry;
    if (!g) return 0;
    if (g.type === "Polygon")  return polygonArea(g.coordinates);
    if (g.type === "MultiPolygon") {
      let s = 0;
      for (const p of g.coordinates) s += polygonArea(p);
      return s;
    }
    return 0;
  }
  function polygonArea(polyCoords) {
    if (!polyCoords || polyCoords.length === 0) return 0;
    const ring = polyCoords[0];
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      sum += (xj * yi - xi * yj);
    }
    return Math.abs(sum) / 2;
  }

  // グローバル公開
  global.Zoning = Zoning;

})(window);
