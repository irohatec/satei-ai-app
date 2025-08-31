// server.js
// ------------------------------------------------------------
// エントリポイント（calc集約型 v0.3 構成）
// 優先順: 静的 /app → API(動的に読み込み) → /health → 404 → エラーハンドラ
// まだ routes や middlewares が無くても起動できる実装。
// ------------------------------------------------------------
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import fs from "fs";

// ==== env ====
dotenv.config();

// ==== __dirname 相当 ====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==== アプリ基本設定 ====
const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// ---- ミドルウェア（最低限） ----
// ※ helmetのCSPはフロントのinlineスクリプト等と衝突しやすいので初期は無効化
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ---- 静的配信（/app パスにぶら下げ、相対参照前提） ----
const publicDir = path.join(__dirname, "public", "app");
if (fs.existsSync(publicDir)) {
  app.use("/app", express.static(publicDir, {
    etag: true,
    lastModified: true,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
  }));
}

// ---- ルート動的マウント（存在すれば読み込み） ----
async function tryMountRoute(routePath, mountPoint) {
  const abs = path.join(__dirname, routePath);
  if (fs.existsSync(abs)) {
    try {
      const mod = await import(pathToFileURL(abs).href);
      if (typeof mod.default === "function") {
        app.use(mountPoint, mod.default);
        console.log(`[mount] ${mountPoint} -> ${routePath}`);
      } else {
        console.warn(`[skip] ${routePath} はデフォルトエクスポート関数ではありません。`);
      }
    } catch (e) {
      console.error(`[error] ${routePath} の読み込みに失敗:`, e.message);
    }
  } else {
    console.warn(`[skip] ${routePath} は未作成です。`);
  }
}

// /estimate と /lead は次ファイル以降で実装予定
await tryMountRoute("server/routes/estimate.js", "/estimate");
await tryMountRoute("server/routes/lead.js", "/lead");

// ---- ヘルスチェック ----
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// ---- 404（静的・APIのどれにも該当しない場合） ----
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/index.html") {
    // ルートに来たら /app/ に誘導（UIは /app/index.html を想定）
    return res.redirect(302, "/app/");
  }
  res.status(404).json({ ok: false, error: "NOT_FOUND", path: req.path });
});

// ---- 簡易エラーハンドラ（middlewares/errors.js 作成前の一時版） ----
/* eslint-disable no-unused-vars */
app.use((err, req, res, next) => {
  console.error("[unhandled]", err);
  const status = err?.status || 500;
  res.status(status).json({
    ok: false,
    error: err?.code || "INTERNAL_ERROR",
    message: process.env.NODE_ENV === "production" ? "Server Error" : String(err?.message || err)
  });
});
/* eslint-enable no-unused-vars */

// ---- サーバ起動 ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`UI: http://localhost:${PORT}/app/`);
});
