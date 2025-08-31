// server/shared/logger.js
// ------------------------------------------------------------
// シンプルなロガー（MVP向け）
// - console に統一フォーマットで出力
// - 将来は外部サービス（Datadog, Cloud Logging等）に差し替え可能
// ------------------------------------------------------------

"use strict";

const LEVELS = ["debug", "info", "warn", "error"];

/**
 * 共通ロガー
 * @param {"debug"|"info"|"warn"|"error"} level 
 * @param {string} msg 
 * @param {object} [meta] 追加情報（オブジェクト）
 */
function log(level, msg, meta = {}) {
  if (!LEVELS.includes(level)) level = "info";
  const ts = new Date().toISOString();
  const base = { ts, level, msg, ...meta };
  const line = JSON.stringify(base);

  // エラーレベル以上は stderr
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  debug: (msg, meta) => log("debug", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
