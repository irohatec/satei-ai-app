// server.js
// =============================================================================
// データ公開版：/datasets を静的公開し、/app は従来どおり配信します。
// - /            → /app/ にリダイレクト
// - /app/*       → public/app を静的配信
// - /datasets/*  → server/datasets を静的配信（←今回追加）
// - /health      → 生存確認
// - 404 / エラーハンドラ
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

// JSON ボディ
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

// ルートアクセスは /app/ へ
app.get("/", (_req, res) => {
  res.redirect(PUBLIC_APP_BASE + "/");
});

// -------------------------------------------------------------
// ★ 追加：/datasets を server/datasets から静的公開
//   例）/datasets/address/hiroshima/index.json
//       /datasets/address/hiroshima/34101.json
//       /datasets/rail/hiroshima/index.json
//       /datasets/rail/hiroshima/hiroden-honsen.json
// -------------------------------------------------------------
const datasetsDir = path.join(__dirname, "server", "datasets");
app.use(
  "/datasets",
  express.static(datasetsDir, {
    fallthrough: false, // 該当ファイルが無ければ 404 を返す
    maxAge: "1d",
    setHeaders: (res, filePath) => {
      // JSON は明示しておく（ブラウザでの見え方安定）
      if (filePath.endsWith(".json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
    },
  })
);

// -------------------------------------------------------------
// （任意）既存 API ルートの自動マウント（存在する場合のみ）
//   server/routes/estimate.js / lead.js が無い場合でもエラーにしない
// -------------------------------------------------------------
async function tryMountRouter(relPath, mountPath) {
  const abs = path.join(__dirname, relPath);
  if (fs.existsSync(abs)) {
    const mod = await import(pathToFileURL(abs).href);
    if (mod.default) app.use(mountPath, mod.default);
  }
}
await tryMountRouter("server/routes/estimate.js", "/estimate");
await tryMountRouter("server/routes/lead.js", "/lead");

// -------------------------------------------------------------
// ヘルスチェック
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
