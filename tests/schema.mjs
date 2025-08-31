// tests/schema.mjs
// ------------------------------------------------------------
// APIレスポンスのスキーマ検証（/estimate と /lead）
// - MVP向けに最小限のチェックを実装
// ------------------------------------------------------------

import assert from "node:assert";
import fetch from "node-fetch";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

// 共通: JSONレスポンス取得
async function callApi(path, payload) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// スキーマ検証: /estimate
async function testEstimate() {
  console.log("→ /estimate schema check");

  const payload = {
    address: { pref: "広島県", city: "広島市中区", town: "紙屋町", chome: "1" },
    nearest_station: "紙屋町東",
    walk_minutes: 5,
    building_year: 2000,
    floor_area_sqm: 60,
    lot_area_sqm: 0,
  };

  const { status, data } = await callApi("/estimate", payload);

  assert.strictEqual(status, 200, "HTTP 200 expected");
  assert.strictEqual(typeof data, "object", "JSON object expected");
  assert.strictEqual(data.ok, true, "ok:true expected");

  const r = data.result || data;
  assert.ok(
    typeof r.price === "number" || typeof r.price === "undefined",
    "price must be number or undefined"
  );
  assert.ok(
    typeof (r.range_low ?? r.low) !== "undefined",
    "range_low or low must exist"
  );
  assert.ok(
    typeof (r.range_high ?? r.high) !== "undefined",
    "range_high or high must exist"
  );

  console.log("✓ /estimate OK");
}

// スキーマ検証: /lead
async function testLead() {
  console.log("→ /lead schema check");

  const payload = {
    name: "テスト太郎",
    email: "test@example.com",
    phone: "080-0000-0000",
    message: "スキーマ検証テスト",
  };

  const { status, data } = await callApi("/lead", payload);

  assert.strictEqual(status, 200, "HTTP 200 expected");
  assert.strictEqual(typeof data, "object", "JSON object expected");
  assert.ok(
    typeof data.ok === "boolean",
    "ok must be boolean"
  );

  console.log("✓ /lead OK");
}

// 実行
(async () => {
  try {
    await testEstimate();
    await testLead();
    console.log("=== schema.mjs ALL OK ===");
    process.exit(0);
  } catch (err) {
    console.error("Schema test failed:", err);
    process.exit(1);
  }
})();
