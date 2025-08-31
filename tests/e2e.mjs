// tests/e2e.mjs
// ------------------------------------------------------------
// End-to-End テスト（MVP用）
// サーバ起動後に /health, /estimate, /lead を実際に叩いて動作確認する
// ------------------------------------------------------------

import assert from "node:assert";
import fetch from "node-fetch";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

// 共通関数
async function get(path) {
  const res = await fetch(BASE + path);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function post(path, payload) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// /health
async function testHealth() {
  console.log("→ GET /health");
  const { status, data } = await get("/health");
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
  console.log("✓ /health OK");
}

// /estimate
async function testEstimate() {
  console.log("→ POST /estimate");
  const payload = {
    address: { pref: "広島県", city: "広島市中区", town: "紙屋町", chome: "1" },
    nearest_station: "紙屋町東",
    walk_minutes: 5,
    building_year: 2000,
    floor_area_sqm: 60,
    lot_area_sqm: 0,
  };
  const { status, data } = await post("/estimate", payload);
  assert.strictEqual(status, 200);
  assert.ok(data.ok === true);
  console.log("✓ /estimate OK");
}

// /lead
async function testLead() {
  console.log("→ POST /lead");
  const payload = {
    name: "E2Eテスト",
    email: "e2e@example.com",
    message: "テスト送信",
  };
  const { status, data } = await post("/lead", payload);
  assert.strictEqual(status, 200);
  assert.ok(typeof data.ok === "boolean");
  console.log("✓ /lead OK");
}

// 実行
(async () => {
  try {
    await testHealth();
    await testEstimate();
    await testLead();
    console.log("=== e2e.mjs ALL OK ===");
    process.exit(0);
  } catch (err) {
    console.error("E2E test failed:", err);
    process.exit(1);
  }
})();
