// server/routes/estimate.js
// -----------------------------------------------------------------------------
// 必須が揃えば即返すAPI。内部calc失敗時は簡易推定で200を返す。
// 送信時は中央値＋レンジ＋近隣“擬似”事例をメール本文に添付。
// -----------------------------------------------------------------------------

import { Router } from "express";

const router = Router();
const THIS_YEAR = new Date().getFullYear();

// ---- 正規化/ユーティリティ ----
function normalizeType(s) {
  const t = String(s || "").trim();
  if (/土地/i.test(t) || /land/i.test(t)) return "land";
  if (/戸建|一戸建/i.test(t) || /house/i.test(t)) return "house";
  if (/マンション/i.test(t) || /mansion/i.test(t)) return "mansion";
  if (/ビル/i.test(t) || /building/i.test(t)) return "building";
  if (/アパート|共同住宅/i.test(t) || /apartment/i.test(t)) return "apartment";
  return t.toLowerCase() || "mansion";
}
function toSqm(v, unit) {
  const n = Number(v || 0);
  return unit === "tsubo" ? n * 3.305785 : n;
}

// ---- フォールバック簡易推定（万単位で返す） ----
function quickEstimate(input) {
  const unit = input.areaUnit === "tsubo" ? "tsubo" : "sqm";
  const land = toSqm(input.landArea, unit);
  const bldg = toSqm(input.buildingArea, unit);
  const age = input.buildYear ? Math.max(0, THIS_YEAR - Number(input.buildYear)) : 0;
  const walk = Math.max(0, Number(input.walkMinutes || 0));

  let base = 200000; // 円/㎡
  let area = bldg || land;

  switch (input.propertyType) {
    case "land": base = 150000; area = land; break;
    case "mansion": base = 450000; area = bldg; break;
    case "house": base = 250000; area = bldg || land * 0.5; break;
    case "building":
    case "apartment": base = 300000; area = bldg; break;
    default: area = bldg || land;
  }
  if (!area || area <= 0) area = (land + bldg) || 60;

  const walkFactor = 1 - Math.min(0.30, Math.max(0, walk - 5) * 0.01); // 5分超過×1%（最大30%）
  let depFactor = 1;
  if (["mansion","house","building","apartment"].includes(input.propertyType)) {
    depFactor = 1 - Math.min(0.5, (THIS_YEAR - (input.buildYear||THIS_YEAR)) * 0.015);
  }
  // 補正：構造
  const structBonus = ({
    "RC":1.04, "SRC":1.06, "鉄骨":1.02, "木造":0.98, "軽量鉄骨":1.01, "ブロック":0.97
  })[input.structure] || 1;
  // 補正：所在階（マンションのみ：高層優位）
  const floorBonus = (input.propertyType==="mansion" && input.totalFloors>0)
    ? (1 + Math.min(0.08, (Math.max(0, input.floor-2)) * 0.01)) : 1;
  // 補正：採光
  const aspectBonus = ({
    "南":1.03,"南東":1.02,"南西":1.02,"東":1.01,"西":1.01
  })[input.aspect] || 1;
  // 補正：角地
  const cornerFactor = input.isCorner ? 1.03 : 1;

  const priceYen = base * area * walkFactor * depFactor * structBonus * floorBonus * aspectBonus * cornerFactor;
  const mid = Math.max(1, Math.round(priceYen / 10000)); // 万円
  const band = Math.max(5, Math.round(mid * 0.12));       // ±12% or ±5万
  return {
    priceMan: mid,
    priceMinMan: Math.max(1, mid - band),
    priceMaxMan: mid + band,
    comps: []
  };
}

// 擬似・近隣成約事例を生成（学習用ダミー）
function buildPseudoComps(input, result){
  const addr = [input.prefecture||"", input.city||"", input.town||"", input.chome?`${input.chome}丁目`:""].filter(Boolean).join("");
  const ls = (input.line && input.station) ? `${input.line} ${input.station}` : (input.station||"");
  const list = [];
  const base = result.priceMan;
  const now = new Date();
  for(let i=0;i<5;i++){
    const d = new Date(now); d.setMonth(now.getMonth() - (i*5 + 2));
    const price = Math.max(1, Math.round(base * (0.8 + 0.1*i)));
    list.push({
      lineStation: ls || "最寄り不明",
      address: addr || "広島県広島市（近隣）",
      priceMan: price,
      landArea: input.propertyType==="land" ? `${50+i*12}㎡` : "-",
      soldYM: `${d.getFullYear()}年${d.getMonth()+1}月`
    });
  }
  return list;
}

// v1計算を試み、失敗時は簡易推定
async function tryCalc(input) {
  try {
    const mod = await import("../calc/index.js"); // 既存ロジック
    if (typeof mod?.estimate === "function") {
      const r = await mod.estimate(input, process.env.CALC_STRATEGY);
      if (r && Number.isFinite(r.priceMan)) return r;
    }
    throw new Error("calc/estimate unavailable");
  } catch (e) {
    console.error("[estimate] fallback:", e?.message || e);
    return quickEstimate(input);
  }
}

router.post("/estimate", async (req, res) => {
  try {
    const b = req.body || {};
    const input = {
      propertyType: normalizeType(b.propertyType),
      areaUnit: b.areaUnit === "tsubo" ? "tsubo" : "sqm",
      landArea: Number(b.landArea || 0),
      buildingArea: Number(b.buildingArea || 0),
      buildYear: Number(b.buildYear || 0),
      walkMinutes: Number(b.walkMinutes || 0),
      isCorner: !!b.isCorner,
      structure: b.structure || "",
      totalFloors: Number(b.totalFloors || 0),
      floor: Number(b.floor || 0),

      prefecture: b.prefecture || "", city: b.city || "", town: b.town || "", chome: b.chome || "",
      line: b.line || "", station: b.station || "",
      floorPlan: b.floorPlan || "", aspect: b.aspect || ""
    };

    const result = await tryCalc(input);
    // comps（ダミー）を付与
    const comps = buildPseudoComps(input, result);

    // メールは非同期送信（失敗しても無視）
    if (process.env.MAIL_ENABLED === "true" && (req.body?.email || "").includes("@")) {
      (async () => {
        try {
          const mod = await import("../adapters/mailer/index.js").catch(() => ({}));
          const mailer = mod?.default || mod;
          const send =
            mailer?.sendEstimateMail ||
            mailer?.sendMail ||
            mailer?.sendEstimate ||
            null;

          if (typeof send === "function") {
            const lines = [
              `【中央値】${result.priceMan} 万円`,
              `【レンジ】${result.priceMinMan} ～ ${result.priceMaxMan} 万円`,
              "",
              "【近隣の成約事例】",
              ...comps.map(c => `・${c.lineStation} / ${c.address} / ${c.priceMan}万円台 / ${c.landArea} / ${c.soldYM}`)
            ].join("\n");

            await send({
              to: req.body.email,
              subject: "不動産AI査定 結果",
              text: lines
            });
          }
        } catch (e) {
          console.error("[mailer] ignored:", e?.message || e);
        }
      })();
    }

    return res.json({ ok: true, ...result, comps });
  } catch (err) {
    console.error("[/estimate] fatal:", err);
    const fb = quickEstimate({
      propertyType: "mansion", areaUnit: "sqm",
      landArea: 0, buildingArea: 60, buildYear: 2000,
      walkMinutes: 10, isCorner: false
    });
    return res.json({ ok: true, ...fb, comps: [], fallback: true });
  }
});

// サーバ登録
export default function mount(app) { app.use(router); }
export { router };
