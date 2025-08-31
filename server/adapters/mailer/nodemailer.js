// server/adapters/mailer/nodemailer.js
// nodemailer を使った SMTP 送信アダプタ（ESM）

import nodemailer from "nodemailer";

// 環境変数は 2系統に両対応（どちらかセットでOK）
const HOST   = process.env.SMTP_HOST   || process.env.MAIL_HOST;
const PORT   = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
const SECURE = String(process.env.SMTP_SECURE || process.env.MAIL_SECURE || "false") === "true";
const USER   = process.env.SMTP_USER   || process.env.MAIL_USER;
const PASS   = process.env.SMTP_PASS   || process.env.MAIL_PASS;

const transporter = nodemailer.createTransport({
  host: HOST,
  port: PORT,
  secure: SECURE, // true: 465 / false: 587
  auth: USER || PASS ? { user: USER, pass: PASS } : undefined,
});

async function send({ to, subject, text, html, from }) {
  try {
    const mailFrom =
      from ||
      process.env.MAIL_FROM ||
      '"Estimator" <no-reply@example.com>';

    const info = await transporter.sendMail({
      from: mailFrom,
      to,
      subject,
      text,
      html,
    });

    return { ok: true, sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("[mailer][SMTP] send error:", error);
    return { ok: false, sent: false, error: error.message };
  }
}

export default { send };
