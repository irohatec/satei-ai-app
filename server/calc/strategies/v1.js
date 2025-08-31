// server/calc/strategies/v1.js
// -----------------------------------------------------------------------------
// MVP の簡易査定ロジック（baseline の“値が薄くても動く”設計）
//
// 入力: estimateInput (UI から来る JSON)
// 出力: { ok, price, low, high, unit_ppsqm, factors, tags }
//
// 依存: server/calc/baseline.json
//  - city_unit_ppsqm: { [city_code]: number, default?: number }
//  - station_unit_ppsqm: { [line]: { [station]: number } }
//  - coefficients: { walk[], built_year[], structure{}, floor[], orientation{base{}, corner_bonus{}} }
//  - range_rules: { missing_0, missing_1, missing_2, missing_3_plus, count_keys[] }
//
// 備考:
// - 市区町村単価は city_code キーを想定（city 名しか無い場合は default を使用）
// - 未定義の係数はすべて 1.00 として扱う
// - 面積は "sqm" or "tsubo" を許容（坪→㎡換算: 1坪=3.305785㎡）
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ========== fs helper ==========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASELINE_PATH = path.join(__dirname, "..", "baseline.json");

// ========== small utils ==========
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const toBool = (v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
};

const roundTo = (value, unit = 10000) => {
  // 1万円単位に丸め（変更したければ unit を変える）
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / unit) * unit;
};

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// ㎡換算（坪→㎡）
const toSqm = (area, unit) => {
  const a = toNum(area, 0);
  if (unit === "tsubo") return a * 3.305785;
  return a; // "sqm" or 不明 → ㎡扱い
};

// 係数配列から閾値マッチを選ぶ（walk など）
function pickByThreshold(rules, key, value) {
  if (!Array.isArray(rules) || rules.length === 0) return 1.0;
  const v = toNum(value, 0);
  // walk: {max_min, k} を上から順に評価
  if (key === "walk") {
    for (const r of rules) {
      if (typeof r?.max_min === "number" && v <= r.max_min) return toNum(r.k, 1.0);
    }
    return 1.0;
  }
  // built_year: {lte|gt, k} を上から順に評価、土地は特例
  if (key === "built_year") {
    // 物件種別が土地なら land=1.0 を優先
    const landRule = rules.find((r) => Object.prototype.hasOwnProperty.call(r, "land"));
    if (landRule) return toNum(landRule.land, 1.0);

    for (const r of rules) {
      if (typeof r?.lte === "number" && v <= r.lte) return toNum(r.k, 1.0);
      if (typeof r?.gt === "number" && v > r.gt) return toNum(r.k, 1.0);
    }
    return 1.0;
  }
  return 1.0;
}

// structure: マップ形式
function pickFromMap(map, key) {
  if (!map || typeof map !== "object") return 1.0;
  if (key && Object.prototype.hasOwnProperty.call(map, key)) return toNum(map[key], 1.0);
  if (Object.prototype.hasOwnProperty.call(map, "default")) return toNum(map.default, 1.0);
  return 1.0;
}

// floor: [ {gte|eq|default, k}, ... ]
function pickFloor(rules, floor) {
  if (!Array.isArray(rules) || rules.length === 0) return 1.0;
  const f = toNum(floor, 0);
  for (const r of rules) {
    if (typeof r?.eq === "number" && f === r.eq) return toNum(r.k, 1.0);
    if (typeof r?.gte === "number" && f >= r.gte) return toNum(r.k, 1.0);
    if (Object.prototype.hasOwnProperty.call(r, "default")) return toNum(r.default, 1.0);
  }
  return 1.0;
}

// orientation × corner_lot
function pickOrientationFactor(orientationCfg, aspect, isCorner) {
  if (!orientationCfg || typeof orientationCfg !== "object") return 1.0;
  const baseMap = orientationCfg.base || {};
  const bonusMap = orientationCfg.corner_bonus || {};

  const asp = aspect || "default";
  const base = pickFromMap(baseMap, asp); // 1.00前後
  const bonus = isCorner ? pickFromMap(bonusMap, asp) - 1.0 : 0.0; // bonusMap は 0.02 のような“加点値”を想定
  // base × (1 + bonus)
  return base * (1.0 + clamp(bonus, -0.2, 0.5));
}

// レンジ幅：未入力項目数に応じて決定
function computeRangeWidth(rangeRules, input) {
  const rr = rangeRules || {};
  const keys = Array.isArray(rr.count_keys) ? rr.count_keys : ["station", "minutes", "builtYear"];
  let missing = 0;
  for (const k of keys) {
    const val = input?.[k];
    if (val === undefined || val === null || val === "" || Number.isNaN(Number(val))) missing++;
  }
  if (missing <= 0) return toNum(rr.missing_0, 0.06);
  if (missing === 1) return toNum(rr.missing_1, 0.08);
  if (missing === 2) return toNum(rr.missing_2, 0.10);
  return toNum(rr.missing_3_plus, 0.12);
}

// ========== メイン計算関数 ==========

export default async function estimateV1(estimateInput = {}) {
  // 1) baseline を読み取り
  let baseline = {};
  try {
    const raw = fs.readFileSync(BASELINE_PATH, "utf-8");
    baseline = JSON.parse(raw || "{}");
  } catch (e) {
    // baseline が読めなくても動作（全てデフォルト扱い）
    baseline = {};
  }

  const {
    city,              // 例: "広島市中区"（city_code は無い前提 → default フォールバック）
    city_code,         // 将来: "34101"（あれば優先）
    line,              // 例: "広電 本線"
    station,           // 例: "八丁堀"
    minutes,           // 徒歩分
    ptype,             // "マンション" | "戸建" | "土地"
    area,              // 数値
    areaUnit,          // "sqm" | "tsubo"
    builtYear,         // 西暦 or null
    structure,         // "鉄筋コンクリート造" など
    floor,             // マンションの所在階
    aspect,            // "SE" など
    corner_lot         // true/false
  } = estimateInput;

  // 2) 基準単価を決める（駅→市区町村→default）
  const stationTable = baseline.station_unit_ppsqm || {};
  const lineTable = line ? stationTable[line] : null;
  const unitFromStation = (lineTable && station && typeof lineTable[station] === "number")
    ? toNum(lineTable[station], NaN)
    : NaN;

  const cityTable = baseline.city_unit_ppsqm || {};
  const unitFromCityCode = (city_code && typeof cityTable[city_code] === "number")
    ? toNum(cityTable[city_code], NaN)
    : NaN;

  const unitDefault = typeof cityTable.default === "number" ? toNum(cityTable.default) : 600000; // 最後の砦

  const baseUnit =
    Number.isFinite(unitFromStation) ? unitFromStation
    : Number.isFinite(unitFromCityCode) ? unitFromCityCode
    : unitDefault;

  // 3) 面積（㎡換算）
  const areaSqm = toSqm(area, areaUnit);
  const baseInfo = {
    source: Number.isFinite(unitFromStation)
      ? "station"
      : Number.isFinite(unitFromCityCode)
        ? "city"
        : "default",
    line: line || null,
    station: station || null,
    city_code: city_code || null,
    unit_ppsqm: baseUnit
  };

  // 4) 係数を取得（未定義は 1.00）
  const coefs = baseline.coefficients || {};

  const kWalk = pickByThreshold(coefs.walk, "walk", minutes);
  const kBuilt = (ptype === "土地")
    ? 1.0
    : pickByThreshold(coefs.built_year, "built_year", builtYear);
  const kStructure = pickFromMap(coefs.structure, structure);
  const kFloor = pickFloor(coefs.floor, floor);
  const kOrientCorner = pickOrientationFactor(coefs.orientation, aspect, toBool(corner_lot));

  // 5) 価格を計算
  const productK = kWalk * kBuilt * kStructure * kFloor * kOrientCorner;
  const rawPrice = baseUnit * areaSqm * productK;

  // 6) レンジ幅を決定
  const width = computeRangeWidth(baseline.range_rules, { station, minutes, builtYear });
  const low = rawPrice * (1 - width);
  const high = rawPrice * (1 + width);

  // 7) 丸め（1万円単位）
  const priceRounded = roundTo(rawPrice, 10000);
  const lowRounded = roundTo(low, 10000);
  const highRounded = roundTo(high, 10000);

  // 8) タグ
  const tags = [];
  if (Number.isFinite(areaSqm) && areaSqm > 0) tags.push(`面積 ${Math.round(areaSqm)}㎡`);
  if (station) tags.push(`駅 ${station}`);
  if (Number.isFinite(toNum(minutes))) tags.push(`徒歩 ${toNum(minutes)}分`);
  if (Number.isFinite(toNum(builtYear)) && ptype !== "土地") tags.push(`築 ${toNum(builtYear)}`);
  if (toBool(corner_lot)) tags.push("角地");
  if (aspect) tags.push(`採光 ${aspect}`);
  if (ptype) tags.push(`種別 ${ptype}`);

  // 9) factors（根拠内訳）
  const factors = {
    base: baseInfo,
    walk: Number(kWalk.toFixed(3)),
    built_year: Number(kBuilt.toFixed(3)),
    structure: Number(kStructure.toFixed(3)),
    floor: Number(kFloor.toFixed(3)),
    orientation_corner: Number(kOrientCorner.toFixed(3))
  };

  return {
    ok: true,
    price: priceRounded,
    low: lowRounded,
    high: highRounded,
    unit_ppsqm: baseUnit,
    factors,
    tags
  };
}
