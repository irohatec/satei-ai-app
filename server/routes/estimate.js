// server/routes/estimate.js
// -----------------------------------------------------------------------------
// POST /estimate
//   入力: UI から送られる JSON
//   出力: calc/index.js が返す査定結果 or エラー
//
// このファイル自体は「入口の薄いラッパ」であり、
// 実際の計算ロジックは server/calc/index.js に委譲します。
// -----------------------------------------------------------------------------

import express from "express";
import estimate from "../calc/index.js";

const router = express.Router();

// POST /estimate
router.post("/", async (req, res, next) => {
  try {
    const input = req.body || {};

    // calc/index.js の戦略に委譲
    const result = await estimate(input);

    return res.json(result);
  } catch (err) {
    // 想定外エラーは next に渡してエラーハンドラへ
    return next(err);
  }
});

export default router;
