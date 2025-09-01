// server/routes/estimate.js  （全文・テスト用最小版）
// Router を default export。常に200でダミー金額を返し、疎通を確認します。
import { Router } from "express";

const router = Router();

// ダミー応答（まずは500/404を確実に解消するための最小実装）
router.post("/estimate", (req, res) => {
  return res.json({
    ok: true,
    priceMinMan: 1863,   // 最安値（ダミー）
    priceMan: 2380,      // 中央値（ダミー）
    priceMaxMan: 2520,   // 最高値（ダミー）
    note: "router default export test"
  });
});

export default router;
export { router };
