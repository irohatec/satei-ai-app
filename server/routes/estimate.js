// server/routes/estimate.js
// -----------------------------------------------------------------------------
// POST /estimate : フロントから受けた入力を v1 ロジックへ渡して査定額を返す
// -----------------------------------------------------------------------------

import { Router } from "express";
import { estimate } from "../calc/index.js";

const router = Router();

// 受信 → バリデーション（最小限） → ロジック呼び出し
router.post("/estimate", async (req, res) => {
  try {
    const b = req.body || {};

    // 必須最小セット（種目・単位・面積のどちらか）
    const propertyType = String(b.propertyType || "").toLowerCase(); // land/house/mansion/building/apartment
    const areaUnit = b.areaUnit === "tsubo" ? "tsubo" : "sqm";

    const input = {
      propertyType,
      areaUnit,
      landArea: Number(b.landArea || 0),
      buildingArea: Number(b.buildingArea || 0),
      walkMinutes: Number(b.walkMinutes || 0),
      buildYear: Number(b.buildYear || 0),
      isCorner: Boolean(b.isCorner),

      // 参考: UIから来るが v1 では直接使わない値（そのまま受け流し可能）
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

    // 最低限のチェック
    if (!input.propertyType) {
      return res.status(400).json({ ok: false, error: "PROPERTY_TYPE_REQUIRED" });
    }
    if (input.propertyType === "land" && input.landArea <= 0) {
      return res.status(400).json({ ok: false, error: "LAND_AREA_REQUIRED" });
    }
    if (["house", "mansion", "building", "apartment"].includes(input.propertyType) && input.buildingArea <= 0) {
      return res.status(400).json({ ok: false, error: "BUILDING_AREA_REQUIRED" });
    }

    const result = estimate(input, process.env.CALC_STRATEGY);

    return res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    console.error("[/estimate] error:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default function mount(app) {
  // どの書き方の server.js でも拾えるように router を使う
  app.use(router);
}

// 直接 router を使っている server.js 向け
export { router };
