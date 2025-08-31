// server/middlewares/errors.js
// 最後尾に配置するエラーハンドラ（Express標準の4引数版）
// すべての例外を { ok:false, error, details } でJSON返却します。

"use strict";

/**
 * 簡易なID生成（依存なし）
 */
function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * エラー内容を安全にシリアライズ
 */
function toPlainError(err) {
  if (!err) return { error: "unknown_error" };
  const code = err.code || err.name || "Error";
  const msg = typeof err.message === "string" ? err.message : String(err);
  return { code, message: msg };
}

/**
 * Express エラーミドルウェア
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  // ユーザに紐づくリクエストID（ヘッダ or 生成）
  const requestId = req.headers["x-request-id"] || genId();

  // ステータスの決定（明示が無ければ500）
  const status = Number(err && err.status) || 500;

  // 公開用エラー情報
  const { code, message } = toPlainError(err);

  // 本番では詳細を控えめに、開発では詳細を返す
  const isProd = process.env.NODE_ENV === "production";
  const payload = {
    ok: false,
    error: code,
    details: isProd ? undefined : message,
    request_id: requestId,
  };

  // すでにヘッダ送信済みなら何もしない
  if (res.headersSent) {
    return;
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Request-Id", requestId);
  res.status(status).json(payload);
};
