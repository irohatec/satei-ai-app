// server/routes/lead.js
// -----------------------------------------------------------------------------
// POST /lead
//   目的: フロントで入力されたメールアドレスや問い合わせ内容を受け取り、
//         MVPでは「メール送信のみ」を行う（保存は将来 Firebase へ移行予定）
// 入力例:
//   {
//     "email": "user@example.com",
//     "name": "山田太郎",
//     "note": "査定結果について相談希望",
//     "estimate": { ... }   // 任意: /estimate のリクエスト/レスポンスを添付してもOK
//   }
//
// 環境変数 (.env):
//   MAIL_ENABLED=true|false
//   MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS
//   MAIL_FROM, MAIL_TO
//
// 備考:
// - バリデーションは最小限（email 必須）
// - メール送信に失敗した場合は 502 を返す
// -----------------------------------------------------------------------------

import express from "express";
import { sendMailIfEnabled } from "../adapters/mailer/index.js";

const router = express.Router();

// ---- helpers ---------------------------------------------------

function isValidEmail(v) {
  if (typeof v !== "string") return false;
  // シンプルなメール判定（厳密すぎない）
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function sanitize(str, max = 5000) {
  if (str == null) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) : s;
}

// ---- route -----------------------------------------------------

router.post("/", async (req, res, next) => {
  try {
    const { email, name, note, estimate } = req.body || {};

    // 必須: email
    if (!isValidEmail(email)) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_EMAIL",
        message: "メールアドレスを正しく入力してください。"
      });
    }

    // メール本文（テキスト）
    const lines = [];
    lines.push("【新規リードの通知】");
    lines.push("");
    lines.push(`日時: ${new Date().toISOString()}`);
    lines.push(`氏名: ${sanitize(name || "(未入力)", 200)}`);
    lines.push(`メール: ${sanitize(email, 320)}`);
    if (note) {
      lines.push("");
      lines.push("----- ユーザーメモ -----");
      lines.push(sanitize(note, 2000));
    }
    if (estimate && typeof estimate === "object") {
      lines.push("");
      lines.push("----- 添付された査定情報 (JSON) -----");
      try {
        lines.push(JSON.stringify(estimate, null, 2));
      } catch {
        lines.push("(estimate を文字列化できませんでした)");
      }
    }
    const textBody = lines.join("\n");

    // 送信（.env の MAIL_ENABLED が true の時のみ実行）
    const sent = await sendMailIfEnabled({
      subject: "【査定アプリ】新規リードの通知",
      text: textBody
      // HTML化したい場合は html: "<p>...</p>" を追加
    });

    if (sent.error) {
      // 送信が有効化されているのに失敗した場合は 502
      return res.status(502).json({
        ok: false,
        error: "MAIL_SEND_FAILED",
        message: sent.message || "メール送信に失敗しました。"
      });
    }

    // 成功（メール無効化中でも 200 で返す：MVPの仕様）
    return res.json({
      ok: true,
      mailed: sent.enabled, // true=送信試行あり, false=MAIL_ENABLED=false で送信スキップ
      message: sent.enabled ? "通知メールを送信しました。" : "MAIL_ENABLED=false のため送信をスキップしました。"
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
