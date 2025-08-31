// server/calc/strategies/v1.js
// -----------------------------------------------------------------------------
// v1: 超シンプル査定（MVP）
// - 単価: baseline.json（無ければ内蔵デフォルト）を「万円/㎡」として利用
// - 面積: 土地=landArea、建物=buildingArea、戸建=土地4:建物6の合算
// - 徒歩: 近いほど上方補正
// - 築年: 戸建/マンションは年数で下方補正（床面積がある場合）
// - 角地: +3% ボーナス
// - 単位は最終的に「万円」
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1坪(=tsubo) → ㎡
const TSUBO_TO_SQM = 3.305785;

// baseline のデフォルト（baseline.jsonが無い場合のフォールバック）
const DEFAULT_BASELINE = {
  unit: "man_per_sqm",
  base: {
    land: 10,       // 土地: 1㎡あたり 10万円
    house: 20,      // 戸建
    mansion: 35,    // 分譲マンション（専有）
    building: 40,   // 事業用ビル
    apartment: 30   // 一棟アパート
  },
  walkMultipliers: [
    { max: 5, mult: 1.10 },
    { max: 10, mult: 1.05 },
    { max: 20, mult: 0.98 },
    { max: 60, mult: 0.95 },
    { max: 9999, mult: 0.90 }
  ],
  cornerBonus: 1.03,
  age: {
    // 年あたりの減価（上限下限を設定）
    house: { perYear: 0.010, minFactor: 0.50 },    // 戸建は劣化大きめ
    mansion: { perYear: 0.005, minFactor: 0.60 },  // マンションは劣化小さめ
    building: { perYear: 0.006, minFactor: 0.55 },
    apartment: { perYear: 0.007, minFactor: 0.55 }
  },
  mixWeight: { // 戸建の面積配分（合算用）
    land: 0.4,
    building: 0.6
  }
};

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadBaseline() {
  const file = path.join(__dirname, "..", "baseline.json");
  return safeReadJson(file) || DEFAULT_BASELINE;
}

function toSqm(value, unit /* 'sqm' | 'tsubo' */) {
  const v = Number(value || 0);
  if (!v || v < 0) return 0;
  return unit === "tsubo" ? v * TSUBO_TO_SQM : v;
}

function pickWalkMultiplier(walkMin, table) {
  const w = Number(walkMin || 0);
  for (const r of table) {
    if (w <= r.max) return r.mult;
  }
  return 1.0;
}

function ageFactor(propertyType, buildYear, baseline) {
  const year = Number(buildYear || 0);
  if (!year) return 1.0;                // 不明なら補正なし
  const now = new Date().getFullYear();
  const age = Math.max(0, now - year);

  const rule = baseline.age[propertyType];
  if (!rule) return 1.0;

  const f = 1 - rule.perYear * age;
  return Math.max(rule.minFactor, f);
}

// メイン計算
export function estimateV1(input) {
  const bl = loadBaseline();

  const type = String(input.propertyType || "").toLowerCase(); // land/house/mansion/building/apartment
  const unit = input.areaUnit === "tsubo" ? "tsubo" : "sqm";

  // 面積（㎡）の決定
  const landSqm = toSqm(input.landArea, unit);
  const bldgSqm = toSqm(input.buildingArea, unit);

  let targetSqm = 0;
  if (type === "land") {
    targetSqm = landSqm;
  } else if (type === "house") {
    // 戸建は土地+建物の合算（重み付け）
    targetSqm = landSqm * (bl.mixWeight.land ?? 0.4) + bldgSqm * (bl.mixWeight.building ?? 0.6);
  } else {
    // マンション/ビル/アパートは建物面積に寄せる
    targetSqm = bldgSqm || landSqm; // 念のためフォールバック
  }

  // 単価（万円/㎡）
  const baseUnit =
    bl.base[type] ??
    bl.base.mansion ?? // 保険
    DEFAULT_BASELINE.base.mansion;

  // 各種補正
  const walkMult = pickWalkMultiplier(input.walkMinutes, bl.walkMultipliers || []);
  const cornerMult = input.isCorner ? (bl.cornerBonus || 1.03) : 1.0;
  const ageMult = ageFactor(type, input.buildYear, bl);

  const unitPrice = baseUnit * walkMult * cornerMult * ageMult;
  const priceMan = Math.max(0, unitPrice * targetSqm); // 万円

  // 目安レンジ（±12%）
  const low = Math.round(priceMan * 0.88);
  const high = Math.round(priceMan * 1.12);

  return {
    ok: true,
    priceMan: Math.round(priceMan),
    rangeMan: { low, high },
    breakdown: {
      unitManPerSqm: round1(unitPrice),
      baseUnit: baseUnit,
      targetSqm: round1(targetSqm),
      multipliers: {
        walk: round3(walkMult),
        corner: round3(cornerMult),
        age: round3(ageMult)
      }
    }
  };
}

function round1(n){ return Math.round((Number(n)||0)*10)/10; }
function round3(n){ return Math.round((Number(n)||0)*1000)/1000; }

export default { estimate: estimateV1 };
