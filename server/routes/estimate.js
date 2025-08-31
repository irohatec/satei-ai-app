// server/routes/estimate.js
// -----------------------------------------------------------------------------
// POST /estimate : フロントから受けた入力を v1 ロジックへ渡して査定額を返す
// 種目名の日本語→英語正規化 & 種目別バリデーション
// -----------------------------------------------------------------------------

import { Router } from "express";
import { estimate } from "../calc/index.js";

const router = Router();

function normalizeType(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (/land|土地/i.test(t)) return "land";
  if (/house|戸建|一戸建/i.test(t)) return "house";
  if (/mansion|マンション/i.test(t)) return "mansion";
  if (/building|ビル/i.test(t)) return "building";
  if (/apartment|アパート|共同住宅/i.test(t)) return "apartment";
  return t.toLowerCase();
}

router.post("/estimate", async (req, res) => {
  try {
    const b = req.body || {};
    const propertyType = normalizeType(b.propertyType);
    const areaUnit = b.areaUnit === "tsubo" ? "tsubo" : "sqm";

    const input = {
      propertyType,
      areaUnit,
      landArea: Number(b.landArea || 0),
      buildingArea: Number(b.buildingArea || 0),
      walkMinutes: Number(b.walkMinutes || 0),
      buildYear: Number(b.buildYear || 0),
      isCorner: !!b.isCorner,

      // 受け流し
      prefecture: b.prefecture,
      city: b.city,
      town: b.town,
      chome: b.chome,
      line: b.line,
      station: b.station,
      totalFloors: Number(b.totalFloors || 0),
      floor: Number(b.floor || 0),
      floorPlan: b.floorPlan || "",
      structure: b.structure || "",
      aspect: b.aspect || ""
    };

    // バリデーション（最小限）
    if (!input.propertyType) return res.status(400).json({ ok: false, error: "PROPERTY_TYPE_REQUIRED" });
    if (input.propertyType === "land") {
      if (input.landArea <= 0) return res.status(400).json({ ok: false, error: "LAND_AREA_REQUIRED" });
    } else if (input.propertyType === "house") {
      if (input.landArea <= 0 || input.buildingArea <= 0) {
        return res.status(400).json({ ok: false, error: "HOUSE_AREAS_REQUIRED" });
      }
      if (!input.buildYear) return res.status(400).json({ ok: false, error: "BUILD_YEAR_REQUIRED" });
    } else if (["mansion", "building", "apartment"].includes(input.propertyType)) {
      if (input.buildingArea <= 0) return res.status(400).json({ ok: false, error: "BUILDING_AREA_REQUIRED" });
      if (!input.buildYear) return res.status(400).json({ ok: false, error: "BUILD_YEAR_REQUIRED" });
    }

    const result = estimate(input, process.env.CALC_STRATEGY);

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/estimate] error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default function mount(app) {
  app.use(router);
}
export { router };
