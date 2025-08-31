// server/routes/lead.js
// -----------------------------------------------------------------------------
// POST /lead
//   フロントの問い合わせを受けて、通知メールを送る（MVP）
//   - メール送信は MAIL_PROVIDER に従う（SMTP / OFF）
//   - OFF のときは送信スキップだが 200 を返す（研修・検証を止めない）
//   - 送信有効時に失敗したら 502 を返す
// 環境変数（Render の Environment Variables）
//   MAIL_PROVIDER=SMTP | OFF
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
//   MAIL_FROM   = '"Estimator" <no-reply@example.com>'
//   NOTIFY_TO   = 受信先メール（あなたの受信メール）
// -----------------------------------------------------------------------------

import express from "express";
// ★ ここがポイント：名前付き { sendMailIfEnabled } は使わず、デフォルトでアダプタを受け取る
//   server/adapters/mailer/index.js は CommonJS の module.exports を返すため、ESM からは default で受ける
import mailer from "../adapters/mailer/index.js";

const router = express.Router();

// ────────────── Helpers ──────────────
function isValidEmail(v) {
  if (typeof v !== "string") return false;
  // ざっくりチェック（厳密すぎない）
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function sanitize(str, max = 5000) {
  if (str == null) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) : s;
}

function pickReceiveTo() {
  // NOTIFY_TO 優先、なければ MAIL_TO（どちらか1つでOK）
  return process.env.NOTIFY_TO || process.env.MAIL_TO || "";
}

function isMailEnabled() {
  // MAIL_PROVIDER が OFF なら送らない（MVPはこれで十分）
  const provider = (process.env.MAIL_PROVIDER || "OFF").toUpperCase();
  if (provider === "OFF") return false;

  // （任意）互換のため MAIL_ENABLED=false が明示されたら無効化
  if ((process.env.MAIL_ENABLED || "").toLowerCase() === "false") return false;

  return true;
}

// ────────────── Route ──────────────
router.post("/", async (req, res, next) => {
  try {
    const { email, name, phone, companyName, note, estimate } = req.body || {};

    // 受付用の最低限チェック（メールは必須）
    if (!isValidEmail(email || "")) {
      return res.status(400).json({ ok: false, error: "invalid_email" });
    }

    // 受信先
    const to = pickReceiveTo();
    if (!to) {
      // 受信先が未設定でも 500 ではなく分かりやすい 500/設定不足で返す
      return res.status(500).json({ ok: false, error: "server_misconfigured", detail: "NOTIFY_TO (or MAIL_TO) is empty" });
    }

    // 件名・本文
    const subject = "【査定アプリ】新規リード通知";
    const lines = [];
    lines.push("【新規リードの通知】");
    lines.push("");
    lines.push(`日時: ${new Date().toISOString()}`);
    if (companyName) lines.push(`会社名: ${sanitize(companyName, 200)}`);
    if (name)        lines.push(`氏名: ${sanitize(name, 200)}`);
    if (phone)       lines.push(`電話: ${sanitize(phone, 100)}`);
    lines.push(`メール: ${sanitize(email, 320)}`);

    if (note) {
      lines.push("");
      lines.push("----- ユーザーからのメッセージ -----");
      lines.push(sanitize(note, 2000));
    }

    if (estimate && typeof estimate === "object") {
      lines.push("");
      lines.push("----- 添付 estimate JSON（一部/省略可） -----");
      try {
        const pretty = JSON.stringify(estimate, null, 2);
        // メールの負荷にならない範囲で 4,000 文字に制限
        lines.push(sanitize(pretty, 4000));
      } catch {
        lines.push("(estimate の整形に失敗しました)");
      }
    }

    const text = lines.join("\n");

    // 送信可否
    const enabled = isMailEnabled();

    if (!enabled) {
      // 送信スキップ（MVP仕様：200で返す）
      return res.json({
        ok: true,
        mailed: false,
        message: "MAIL_PROVIDER=OFF（または MAIL_ENABLED=false）のため送信をスキップしました。",
      });
    }

    // 実送信（adapter は { send({to, subject, text, html}) } を想定）
    const from = process.env.MAIL_FROM || '"Estimator" <no-reply@example.com>';
    const result = await mailer.send({
      to,
      subject,
      text,
      html: undefined, // テキストのみ
      from,            // nodemailer 側で利用
    });

    // アダプタの戻り値規約に合わせて判定（nodemailer.js は { ok, sent, messageId }）
    if (!result || result.ok === false) {
      // 送信有効だったのに失敗 → 502
      return res.status(502).json({
        ok: false,
        error: "mail_send_failed",
        detail: result?.error || "unknown_error",
      });
    }

    // 成功
    return res.json({
      ok: true,
      mailed: true,
      provider: (process.env.MAIL_PROVIDER || "").toUpperCase(),
      messageId: result.messageId || undefined,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
