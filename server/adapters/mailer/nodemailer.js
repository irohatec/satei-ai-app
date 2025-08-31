// server/adapters/mailer/nodemailer.js
// nodemailer を使った SMTP メール送信アダプタ

"use strict";

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true", // trueなら465, falseなら587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * メール送信処理
 * @param {Object} params
 * @param {string} params.to - 送信先アドレス
 * @param {string} params.subject - 件名
 * @param {string} params.text - テキスト本文
 * @param {string} [params.html] - HTML本文（任意）
 */
async function send({ to, subject, text, html }) {
  const from = process.env.MAIL_FROM || "noreply@example.com";

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    return { ok: true, sent: true, messageId: info.messageId };
  } catch (error) {
    console.error("Mailer error:", error);
    return { ok: false, sent: false, error: error.message };
  }
}

module.exports = { send };
