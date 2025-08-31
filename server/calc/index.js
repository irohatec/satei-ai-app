// server/calc/index.js
// -----------------------------------------------------------------------------
// 戦略切替の“窓口”。
// 環境変数 CALC_STRATEGY（v1|v2）または config/app.json を見て
// 適切な strategy を読み込み、estimate(input) を実行して結果を返す。
// v2 が未実装/未配置でも、必ず v1 にフォールバックして動作します。
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// config/app.json（任意）
const CONFIG_PATH = path.join(__dirname, "..", "..", "config", "app.json");

// strategy ファイルの場所
const STRATEGY_DIR = path.join(__dirname, "strategies");

// 既定戦略
const DEFAULT_STRATEGY = "v1";

// 設定から strategy 名を取得
function getStrategyFromConfig() {
  // 1) 環境変数優先
  const envName = (process.env.CALC_STRATEGY || "").trim().toLowerCase();
  if (envName === "v1" || envName === "v2") return envName;

  // 2) config/app.json（あれば）
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const cfg = JSON.parse(raw || "{}");
      const name = (cfg?.calc_strategy || "").trim().toLowerCase();
      if (name === "v1" || name === "v2") return name;
    }
  } catch {
    // 読めなくても無視して既定へ
  }

  // 3) 既定
  return DEFAULT_STRATEGY;
}

// strategy モジュールを動的に読み込み（存在しなければ null）
async function tryImportStrategy(name) {
  try {
    const filePath = path.join(STRATEGY_DIR, `${name}.js`);
    if (!fs.existsSync(filePath)) return null;
    const mod = await import(pathToFileURL(filePath).href);
    return typeof mod.default === "function" ? mod.default : null;
  } catch {
    return null;
  }
}

/**
 * 主関数：見つかった strategy で査定を実行。
 * @param {object} estimateInput - UI から渡ってくる入力 JSON
 * @returns {Promise<object>} - { ok, price, low, high, unit_ppsqm, factors, tags } など
 */
export default async function estimate(estimateInput = {}) {
  // 希望戦略を取得
  const requested = getStrategyFromConfig();

  // まずは希望戦略を試す
  let strategyFn = await tryImportStrategy(requested);

  // 無ければ v1 にフォールバック
  if (!strategyFn && requested !== "v1") {
    strategyFn = await tryImportStrategy("v1");
  }

  // それでも無ければエラー（通常はありえない）
  if (!strategyFn) {
    throw Object.assign(new Error("No available strategy (v1 not found)."), { status: 500 });
  }

  // 実行
  return strategyFn(estimateInput);
}

// 選ばれた戦略名を知りたい時用（デバッグ/テスト）
export function resolveStrategyName() {
  const requested = getStrategyFromConfig();
  const availableV1 = fs.existsSync(path.join(STRATEGY_DIR, "v1.js"));
  const availableV2 = fs.existsSync(path.join(STRATEGY_DIR, "v2.js"));

  if (requested === "v2" && availableV2) return "v2";
  if (availableV1) return "v1";
  return "(none)";
}
