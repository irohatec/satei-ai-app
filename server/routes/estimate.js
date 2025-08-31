// server/routes/estimate.js  — 最小テスト版（常に200を返す）
import { Router } from "express";

const router = Router();

// 何も計算せず固定のダミー値を返す
router.post("/estimate", (req, res) => {
  return res.json({
    ok: true,
    priceMinMan: 1863,  // 最安値（ダミー）
    priceMan: 2380,     // 中央値（ダミー）
    priceMaxMan: 2520,  // 最高値（ダミー）
    note: "minimal test route"
  });
});

// サーバに登録
export default function mount(app) {
  app.use(router);
}
export { router };
