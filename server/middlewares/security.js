// server/middlewares/security.js
// セキュリティ関連ミドルウェア（MVPはCORSのみ）

"use strict";

const cors = require("cors");

/**
 * CORS設定
 * - ALLOWED_ORIGINS 環境変数で許可するオリジンを指定（カンマ区切り）
 * - 未指定なら "*" （全許可）
 */
function buildCorsOptions() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) {
    return { origin: "*" };
  }
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // curl / Postman 対応
      if (origins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  };
}

module.exports = function applySecurity(app) {
  // CORS
  app.use(cors(buildCorsOptions()));

  // 将来ここに helmet や rate-limit を追加可能
};
