// server.js
// =============================================================================
// データ公開（B案）：/datasets を静的公開する最小変更版
// - /            → /app/ にリダイレクト
// - /app/*       → public/app を静的配信
// - /datasets/*  → server/datasets を静的配信（★今回の追加）
// - /estimate, /lead があれば自動マウント
// - /health, 404, エラーハンドラ
// =============================================================================

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// -------------------------------------------------------------
// 基本設定
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const PUBLIC_APP_BASE = process.env.PUBLIC_APP_BASE || "/app";

app.use(express.json());

// -------------------------------------------------------------
// 静的配信（/app）
// -------------------------------------------------------------
const appStaticDir = path.join(__dirname, "public", "app");
app.use(
  PUBLIC_APP_BASE,
  express.static(appStaticDir, {
    index: "index.html",
    maxAge: "1h",
  })
);

// ルートは /app/ へ
app.get("/", (_req, res) => res.redirect(PUBLIC_APP_BASE + "/"));

// -------------------------------------------------------------
// ★ 追加：/datasets を server/datasets から静的公開
//   例）/datasets/address/hiroshima/index.json
//       /datasets/rail/hiroshima/index.json
// -------------------------------------------------------------
const datasetsDir = path.join(__dirname, "server", "datasets");
app.use(
  "/datasets",
  express.static(datasetsDir, {
    fallthrough: false,
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    },
  })
);

// -------------------------------------------------------------
// 既存 API の自動マウント（存在する場合のみ）
// -------------------------------------------------------------
async function tryMount(relPath, mountPath) {
  const abs = path.join(__dirname, relPath);
  if (fs.existsSync(abs)) {
    const mod = await import(pathToFileURL(abs).href);
    if (mod.default) app.use(mountPath, mod.default);
  }
}
await tryMount("server/routes/estimate.js", "/estimate");
await tryMount("server/routes/lead.js", "/lead");

// -------------------------------------------------------------
// /health
// -------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// 404
// -------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "NOT_FOUND", path: req.path });
});

// -------------------------------------------------------------
// エラーハンドラ
// -------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR" });
});

// -------------------------------------------------------------
// 起動
// -------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
