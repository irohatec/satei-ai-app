/*
 * File: public/app/js/hazard-flood-factor.js
 * 機能: 洪水浸水想定（A31a, 2024, 広島）GeoJSONをブラウザで読み込み、
 *       任意の [lon, lat] に対して PIP 判定し、想定浸水深クラスから
 *       “減価係数（仮ルール）”を算定するユーティリティ。
 *
 * 前提データ（既に配置済み）:
 *   /app/datasets/hazard/flood/hiroshima/flood_2024_river.geojson
 *
 * 提供関数:
 *   FloodFactor.configure(opts?)  // { dataUrl, gridDeg, factorTable } を上書き可
 *   await FloodFactor.load()      // 初回ロード（GeoJSON読込＋索引作成）
 *   FloodFactor.isLoaded()        // ロード済みか
 *   FloodFactor.evaluate(lon, lat, opts?)
 *     - 返却: {
 *         inFlood: boolean,
 *         depthClass: string|null,         // "0.5–3.0m" など（最も深いクラス）
 *         factor: number,                  // 係数（デフォ 1.0=減価なし）
 *         reasons: string[],               // 判定根拠の短い説明
 *         hitsCount: number,               // 該当ポリゴン数（表示上限とは別）
 *         sample: Array<{riverName, waterDepth}> // 代表的に数件
 *       }
 *
 * 備考:
 *   - waterDepth は A31a の属性を想定。表記ゆれ（"～" / "〜" / "m未満" / "m以上" など）を
 *     なるべく吸収して数値レンジ化します（完全一致は保証しません）。
 *   - 係数は“仮ルール”。 FloodFactor.configure({ factorTable: [...] }) で差し替え推奨。
 *   - 緯度経度は [lon, lat]（GeoJSON標準）。座標系はJGD2011の値をそのまま使用。
 */

(function (global) {
  'use strict';

  // ===== 設定（必要に応じて configure で上書き） =====
  const DEFAULTS = {
    dataUrl: "/app/datasets/hazard/flood/hiroshima/flood_2024_river.geojson",
    gridDeg: 0.02, // ≒2km グリッド（広範囲データのためやや粗め。必要なら 0.01 に調整）
    // 最深クラスの下限（min）でマッチさせるシンプルな仮ルール（大きい順に評価）
    factorTable: [
      { min: 10.0, label: "10m以上",     factor: 0.70 },
      { min:  5.0, label: "5.0–10.0m",  factor: 0.80 },
      { min:  3.0, label: "3.0–5.0m",   factor: 0.85 },
      { min:  0.5, label: "0.5–3.0m",   factor: 0.90 },
      { min:  0.0, label: "0–0.5m",     factor: 0.97 }
    ]
  };

  const FloodFactor = {
    _conf: { ...DEFAULTS },
    _loaded: false,
    _items: [],       // { bbox:[minX,minY,maxX,maxY], polys:[ [ring0, hole1, ...], ... ], props:{waterDepth, riverName, creatingType} }
    _grid: new Map(), // "gy_gx" -> indices[]

    configure(opts = {}) {
      if (opts.dataUrl)  this._conf.dataUrl  = String(opts.dataUrl);
      if (Number.isFinite(opts.gridDeg)) this._conf.gridDeg = Math.max(0.001, +opts.gridDeg);
      if (Array.isArray(opts.factorTable) && opts.factorTable.length) {
        // 大きいmin順にソート
        this._conf.factorTable = [...opts.factorTable].sort((a,b)=>b.min - a.min);
      }
    },

    isLoaded(){ return this._loaded; },

    async load() {
      if (this._loaded) return this._items.length;
      const res = await fetch(this._conf.dataUrl, { cache: "force-cache" });
      if (!res.ok) throw new Error("flood geojson load failed: HTTP " + res.status);
      const gj = await res.json();
      const feats = Array.isArray(gj.features) ? gj.features : [];

      // 形状を正規化して軽量構造へ
      for (const f of feats) {
        const g = f.geometry;
        if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;

        const polys = [];
        if (g.type === "Polygon") {
          polys.push(_normalizePolygon(g.coordinates));
        } else {
          for (const p of g.coordinates) polys.push(_normalizePolygon(p));
        }
        const bbox = _bboxOfPolys(polys);

        // 最小限の属性のみ保持（必要に応じて追加可）
        const p = f.properties || {};
        const rec = {
          bbox,
          polys,
          props: {
            waterDepth: p.waterDepth ?? "",
            riverName: p.riverName ?? "",
            creatingType: p.creatingType ?? ""
          }
        };
        const idx = this._items.length;
        this._items.push(rec);

        // BBox が跨るセル全部に登録
        const gx0 = _gridX(bbox[0], this._conf.gridDeg);
        const gy0 = _gridY(bbox[1], this._conf.gridDeg);
        const gx1 = _gridX(bbox[2], this._conf.gridDeg);
        const gy1 = _gridY(bbox[3], this._conf.gridDeg);
        for (let gy = gy0; gy <= gy1; gy++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            const key = gy + "_" + gx;
            if (!this._grid.has(key)) this._grid.set(key, []);
            this._grid.get(key).push(idx);
          }
        }
      }

      this._loaded = true;
      return this._items.length;
    },

    /**
     * 1点を評価する
     * @param {number} lon
     * @param {number} lat
     * @param {object} opts
     *   - searchRadiusCells: 近傍セル探索半径（既定 2）
     *   - limit: PIP確定の上限件数（既定 200）
     * @returns {{inFlood:boolean, depthClass:string|null, factor:number, reasons:string[], hitsCount:number, sample:Array}}
     */
    evaluate(lon, lat, opts = {}) {
      if (!this._loaded) throw new Error("FloodFactor.load() を先に実行してください。");
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return { inFlood:false, depthClass:null, factor:1.0, reasons:["座標が不正です"], hitsCount:0, sample:[] };
      }
      const radius = Math.max(0, opts.searchRadiusCells ?? 2);
      const limit  = Math.max(1, opts.limit ?? 200);

      // 近傍セル探索 → BBox で絞り込み → PIP 確定
      const gx0 = _gridX(lon, this._conf.gridDeg);
      const gy0 = _gridY(lat, this._conf.gridDeg);
      const visited = new Set();
      const candIdx = new Set();

      for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 外周だけ
            const key = (gy0 + dy) + "_" + (gx0 + dx);
            if (visited.has(key)) continue;
            visited.add(key);
            const arr = this._grid.get(key);
            if (arr) arr.forEach(i => candIdx.add(i));
          }
        }
      }

      const hits = [];
      for (const i of candIdx) {
        const it = this._items[i];
        if (!_inBBox(lon, lat, it.bbox)) continue;
        if (_pointInPolys(lon, lat, it.polys)) {
          hits.push(it);
          if (hits.length >= limit) break;
        }
      }

      if (hits.length === 0) {
        return {
          inFlood: false,
          depthClass: null,
          factor: 1.0,
          reasons: ["洪水浸水想定区域の該当なし"],
          hitsCount: 0,
          sample: []
        };
      }

      // 最深クラスを選ぶ（max depth の大きいもの）
      let best = { min: 0, max: 0, label: null };
      const sample = [];
      for (const h of hits.slice(0, 8)) {
        const wd = h.props.waterDepth || "";
        const cls = _depthClassify(wd);
        if (cls.label) {
          if (cls.max === Infinity || cls.max > best.max || (best.max !== Infinity && cls.min > best.min)) {
            best = cls;
          }
        }
        sample.push({ riverName: h.props.riverName || "", waterDepth: wd });
      }

      // 係数を決定（factorTable は大きい min 順）
      let factor = 1.0, depthLabel = best.label;
      if (depthLabel) {
        const ft = this._conf.factorTable;
        for (const row of ft) {
          if (best.min >= row.min) { factor = row.factor; break; }
        }
      }

      const reasons = [
        "洪水想定区域内",
        depthLabel ? `想定浸水深クラス: ${depthLabel}` : "浸水深クラス不明（属性なし）"
      ];

      return {
        inFlood: true,
        depthClass: depthLabel || null,
        factor,
        reasons,
        hitsCount: hits.length,
        sample
      };
    }
  };

  // ===== 幾何・文字列ユーティリティ =====
  function _gridX(lon, gridDeg){ return Math.floor(lon / gridDeg); }
  function _gridY(lat, gridDeg){ return Math.floor(lat / gridDeg); }

  function _normalizePolygon(coords){
    // coords = [outer, hole1, ...], ring = [[lon,lat], ...]
    const fix = (ring)=>{
      if (!ring || ring.length < 4) return [];
      const out = ring.map(p=>[+p[0], +p[1]]);
      const a = out[0], b = out[out.length-1];
      if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
      return out;
    };
    return (coords || []).map(fix).filter(r => r.length >= 4);
  }

  function _bboxOfRing(ring){
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const p of ring){
      const x=p[0], y=p[1];
      if (x<minX) minX=x; if (y<minY) minY=y;
      if (x>maxX) maxX=x; if (y>maxY) maxY=y;
    }
    return [minX,minY,maxX,maxY];
  }
  function _bboxOfPolys(polys){
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for (const poly of polys){
      for (let i=0;i<poly.length;i++){
        const b=_bboxOfRing(poly[i]);
        if (b[0]<minX) minX=b[0];
        if (b[1]<minY) minY=b[1];
        if (b[2]>maxX) maxX=b[2];
        if (b[3]>maxY) maxY=b[3];
      }
    }
    return [minX,minY,maxX,maxY];
  }
  function _inBBox(x,y,b){ return x>=b[0] && x<=b[2] && y>=b[1] && y<=b[3]; }

  // Ray casting: 偶奇ルール
  function _pointInRing(x, y, ring){
    let inside=false;
    for (let i=0, j=ring.length-1; i<ring.length; j=i++){
      const xi=ring[i][0], yi=ring[i][1];
      const xj=ring[j][0], yj=ring[j][1];
      const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function _pointInPolygon(x, y, poly){
    if (!poly || poly.length===0) return false;
    if (!_pointInRing(x, y, poly[0])) return false;   // 外環
    for (let i=1;i<poly.length;i++){                  // 穴
      if (_pointInRing(x, y, poly[i])) return false;
    }
    return true;
  }
  function _pointInPolys(x, y, polys){
    for (const poly of polys){ if (_pointInPolygon(x,y,poly)) return true; }
    return false;
  }

  // 想定浸水深テキスト → 数値レンジ＋正規ラベル
  // 例: "0.5m未満" / "0.5～3.0m" / "5.0～10.0m" / "10m以上" / "3m程度" 等をなるべく解釈
  function _depthClassify(src){
    if (!src) return { min:0, max:0, label:null };
    const s = String(src).replace(/〜/g,"～").replace(/\s/g,"").toLowerCase();

    // "10m以上"
    const m_ge = s.match(/(\d+(?:\.\d+)?)m?以上/);
    if (m_ge) {
      const v = parseFloat(m_ge[1]);
      return { min:v, max:Infinity, label:`${v}m以上` };
    }
    // "Xm未満"
    const m_lt = s.match(/(\d+(?:\.\d+)?)m?未満/);
    if (m_lt) {
      const v = parseFloat(m_lt[1]);
      return { min:0, max:v, label:`0–${v}m` };
    }
    // "a～bm"
    const m_rng = s.match(/(\d+(?:\.\d+)?)\s*～\s*(\d+(?:\.\d+)?)m?/);
    if (m_rng) {
      const a = parseFloat(m_rng[1]), b = parseFloat(m_rng[2]);
      const min = Math.min(a,b), max = Math.max(a,b);
      return { min, max, label:`${min}–${max}m` };
    }
    // "Xm程度" / "Xm"
    const m_eq = s.match(/(\d+(?:\.\d+)?)m?(?:程度)?/);
    if (m_eq) {
      const v = parseFloat(m_eq[1]);
      return { min:v, max:v, label:`${v}m` };
    }
    return { min:0, max:0, label:null };
  }

  // 公開
  global.FloodFactor = FloodFactor;

})(window);
