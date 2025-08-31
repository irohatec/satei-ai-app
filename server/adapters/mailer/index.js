// server/adapters/mailer/index.js
// MAIL_PROVIDER で送信方法を切替（OFF / SMTP）
// ESM（"type": "module"）に対応し、default export を提供します。

const PROVIDER = (process.env.MAIL_PROVIDER || "OFF").toUpperCase();

let adapter;

switch (PROVIDER) {
  case "OFF":
    // 送信オフ（研修・検証に便利）
    adapter = {
      async send() {
        return {
          ok: false,
          sent: false,
          provider: "OFF",
          skipped: true,
          reason: "MAIL_PROVIDER=OFF",
        };
      },
    };
    break;

  case "SMTP": {
    // nodemailer アダプタを動的 import（Top-level await）
    const mod = await import("./nodemailer.js");
    adapter = mod.default;
    break;
  }

  default:
    adapter = {
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
    break;
}

export default adapter;
