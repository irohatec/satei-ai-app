// server.js（全文：cors依存なし版）
// 静的 /app 配信・/health・/estimate ルート登録・404・簡易CORS
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import estimateRouter from "./server/routes/estimate.js"; // ← Router（/ にpost定義）

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ===== 環境設定 =====
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "production";
const PUBLIC_APP_BASE = process.env.PUBLIC_APP_BASE || "/app";
const ENABLE_CORS = String(process.env.ENABLE_CORS || "false") === "true";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ===== ミドルウェア =====
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// 外部パッケージを使わない最小CORS
if (ENABLE_CORS) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
}

// 簡易ロガー
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ===== 静的配信 =====
// 例：/app/index.html, /app/style.css, /app/app.js, /app/datasets/...
const appDir = path.join(__dirname, "public", "app");
app.use(PUBLIC_APP_BASE, express.static(appDir, {
  extensions: ["html"],
  maxAge: NODE_ENV === "production" ? "1h" : 0,
}));

// ルートに来たら /app へリダイレクト
app.get("/", (_req, res) => res.redirect(PUBLIC_APP_BASE + "/"));

// favicon（未配置でも404にしない）
app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ===== ヘルスチェック =====
app.get("/health", (_req, res) => {
  res.json({ ok: true, env: NODE_ENV, timestamp: new Date().toISOString() });
});

// ===== API ルート登録 =====
// ベースパス `/estimate` に対して、ルーター側は `router.post("/")` で定義済み
app.use("/estimate", estimateRouter);

// ===== 404（最後尾） =====
app.use((req, res) => {
  return res.status(404).json({ ok: false, error: "NOT_FOUND", path: req.originalUrl });
});

// ===== エラーハンドラ =====
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err?.stack || err);
  res.status(500).json({ ok: false, error: "INTERNAL_SERVER_ERROR" });
});

// ===== 起動 =====
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
