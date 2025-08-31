// server/calc/index.js
// -----------------------------------------------------------------------------
// 査定ストラテジ切替ハブ（既定: v1）
// -----------------------------------------------------------------------------

import v1 from "./strategies/v1.js";

const DEFAULT_STRATEGY = "v1";

function pickStrategy(name) {
  const key = String(name || "").toLowerCase() || DEFAULT_STRATEGY;
  switch (key) {
    case "v1":
    default:
      return v1;
  }
}

/** 外部公開: 入力→査定結果 */
export function estimate(input, strategyName = process.env.CALC_STRATEGY || DEFAULT_STRATEGY) {
  const strat = pickStrategy(strategyName);
  if (!strat || typeof strat.estimate !== "function") {
    throw new Error(`Unknown calc strategy: ${strategyName}`);
  }
  return strat.estimate(input);
}

export default { estimate };
