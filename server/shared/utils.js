// server/shared/utils.js
// ------------------------------------------------------------
// 汎用ユーティリティ関数集（MVP用）
// ------------------------------------------------------------

"use strict";

/**
 * 数値を安全にパース（失敗時はデフォルト値を返す）
 * @param {any} v 入力値
 * @param {number} def デフォルト値
 */
function toNumberSafe(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * 金額フォーマット（3桁カンマ区切り、日本円想定）
 * @param {number} n
 * @returns {string}
 */
function formatJPY(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ja-JP") + " 円";
}

/**
 * ランダムID（簡易版）
 * @returns {string}
 */
function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 安全なJSONパース
 * @param {string} str 
 * @param {any} fallback 
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {
  toNumberSafe,
  formatJPY,
  randomId,
  safeJsonParse,
};
