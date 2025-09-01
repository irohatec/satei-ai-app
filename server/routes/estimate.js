// server/routes/estimate.js  ← Routerをそのままexport（最小テスト版）
import { Router } from "express";

const router = Router();

// 常に200を返すダミー。まずは500エラーを消すための動作確認用です
router.post("/estimate", (req, res) => {
  return res.json({
    ok: true,
    priceMinMan: 1863,
    priceMan: 2380,
    priceMaxMan: 2520,
    note: "router default export test"
  });
});

// ★ここがポイント：Routerを“そのまま”デフォルトで渡す
export default router;
export { router };
