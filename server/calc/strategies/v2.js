// server/calc/strategies/v2.js
// -----------------------------------------------------------------------------
// 将来用の高度査定ロジック（雛形）
//
// v2 では以下の拡張を想定：
//  - baseline.json に加えて「成約データ deal.csv / deal.json」を参照
//  - 回帰分析や近傍類似検索などで統計的に補正
//  - 季節要因や市況トレンドを加味
//
// 現段階では v1 と同じレスポンス構造を返すダミー実装。
// 実装準備が整うまで "NOT_IMPLEMENTED" フラグを返します。
// -----------------------------------------------------------------------------

export default async function estimateV2(estimateInput = {}) {
  return {
    ok: true,
    strategy: "v2",
    implemented: false,
    message: "Strategy v2 is not implemented yet. Using placeholder response.",
    input_echo: estimateInput
  };
}
