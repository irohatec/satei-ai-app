// server/adapters/mailer/index.js
// MAIL_PROVIDER の値で送信方法を切替える（1個ずつ実装中: まずはINDEX）

"use strict";

const PROVIDER = (process.env.MAIL_PROVIDER || "OFF").toUpperCase();

function loadAdapter() {
  switch (PROVIDER) {
    case "OFF":
      // 送信オフ（開発/検証用）
      return {
        async send() {
          return { ok: false, sent: false, provider: "OFF", error: "mail_disabled" };
        },
      };

    case "SMTP":
      // nodemailerアダプタは後続ステップで作成
      try {
        // 遅延読み込み（ファイル未作成でもサーバが落ちないように）
        // eslint-disable-next-line import/no-unresolved
        const smtp = require("./nodemailer");
        return smtp;
      } catch (err) {
        return {
          async send() {
            return {
              ok: false,
              sent: false,
              provider: "SMTP",
              error: "smtp_adapter_missing",
              details: err && err.message ? err.message : "nodemailer.js not found",
            };
          },
        };
      }

    case "RESEND":
      // 将来: Resend APIアダプタを追加予定
      return {
        async send() {
          return {
            ok: false,
            sent: false,
            provider: "RESEND",
            error: "unsupported_provider",
            details: "RESEND adapter not implemented yet",
          };
        },
      };

    default:
      return {
        async send() {
          return {
            ok: false,
            sent: false,
            provider: PROVIDER,
            error: "invalid_provider",
            details: `Unknown MAIL_PROVIDER: ${PROVIDER}`,
          };
        },
      };
  }
}

module.exports = loadAdapter();
