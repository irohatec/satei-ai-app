// public/app/app.js
// ------------------------------------------------------------
// 不動産 簡易査定：フロント挙動（index.html に完全対応）
// - 入力変更をデバウンスして /estimate を呼び出し、結果を #estimate-result に描画
// - 送信で /lead を呼び出し、#lead-result に結果表示
// ------------------------------------------------------------

(() => {
  "use strict";

  // ===== DOM参照（index.html のIDに一致） =====
  const $ = (id) => document.getElementById(id);

  // フォーム（査定）
  const estimateForm = $("estimate-form");
  const pref = $("pref");
  const city = $("city");
  const town = $("town");
  const chome = $("chome");
  const nearestStation = $("nearest_station");
  const walkMinutes = $("walk_minutes");
  const buildingYear = $("building_year");
  const floorArea = $("floor_area_sqm");
  const lotArea = $("lot_area_sqm");
  const btnEstimate = $("btn-estimate");
  const estimateResult = $("estimate-result");

  // フォーム（リード）
  const leadForm = $("lead-form");
  const leadName = $("lead_name");
  const leadEmail = $("lead_email");
  const leadPhone = $("lead_phone");
  const leadMessage = $("lead_message");
  const btnLead = $("btn-lead");
  const leadResult = $("lead-result");

  // ===== デバウンス =====
  let recalcTimer = null;
  const RECALC_DELAY_MS = 300;
  const scheduleRecalc = () => {
    clearTimeout(recalcTimer);
    recalcTimer = setTimeout(runEstimate, RECALC_DELAY_MS);
  };

  // ===== ユーティリティ =====
  const toNumOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const setDisabled = (el, on) => {
    if (!el) return;
    if (on) {
      el.setAttribute("disabled", "disabled");
    } else {
      el.removeAttribute("disabled");
    }
  };

  const safeHtml = (s) => String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const fmtJPY = (n) =>
    (Number.isFinite(n) && n >= 0) ? n.toLocaleString("ja-JP") : "—";

  // ===== /estimate 呼び出し =====
  async function runEstimate() {
    // 最低限の必須チェック
    if (!pref.value || !city.value || !town.value || !nearestStation.value) {
      estimateResult.innerHTML = `<div class="muted">必要項目（所在地・最寄駅）を入力すると自動計算します。</div>`;
      return;
    }

    const payload = {
      address: {
        pref: pref.value.trim(),
        city: city.value.trim(),
        town: town.value.trim(),
        chome: chome.value.trim() || null,
      },
      nearest_station: nearestStation.value.trim(),
      walk_minutes: toNumOrNull(walkMinutes.value),
      building_year: toNumOrNull(buildingYear.value),
      floor_area_sqm: toNumOrNull(floorArea.value),
      lot_area_sqm: toNumOrNull(lotArea.value),
    };

    setDisabled(btnEstimate, true);
    estimateResult.innerHTML = `<div class="muted">計算中…</div>`;

    try {
      const res = await fetch("/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // レスポンスは2系統想定（MVPの互換性確保）
      // A) { ok, id, result: { price, range_low, range_high, rounding, adjustments, basis } }
      // B) { ok, price, low, high, ... }
      const data = await res.json();

      if (!res.ok || !data) throw new Error("ESTIMATE_FAILED");

      const result = data.result || data;

      const price = Number(result.price ?? result.median ?? NaN);
      const low = Number(result.range_low ?? result.low ?? NaN);
      const high = Number(result.range_high ?? result.high ?? NaN);
      const rounding = result.rounding;
      const adjustments = result.adjustments || {};
      const basis = result.basis || {};

      // 表示
      estimateResult.innerHTML = `
        <div><strong>概算価格</strong>：${fmtJPY(price)}<span class="yen"> 円</span></div>
        <div>レンジ：${fmtJPY(low)} 〜 ${fmtJPY(high)} 円</div>
        ${rounding ? `<div class="muted">端数処理：${safeHtml(rounding)} 円単位</div>` : ``}
        ${
          Object.keys(adjustments).length
            ? `<div class="muted">補正：${Object.entries(adjustments)
                .map(([k, v]) => `${safeHtml(k)}=${safeHtml(v)}`)
                .join(", ")}</div>`
            : ``
        }
        ${
          Object.keys(basis).length
            ? `<div class="muted">基準：${Object.entries(basis)
                .map(([k, v]) => `${safeHtml(k)}=${safeHtml(v)}`)
                .join(", ")}</div>`
            : ``
        }
      `;
    } catch (err) {
      estimateResult.innerHTML = `<div class="result danger">計算に失敗しました。時間をおいてお試しください。</div>`;
    } finally {
      setDisabled(btnEstimate, false);
    }
  }

  // ===== /lead 呼び出し =====
  async function submitLead(e) {
    e.preventDefault();

    // どれか1つは連絡先が欲しい（メール or 電話）
    const hasContact = (leadEmail.value.trim() || leadPhone.value.trim());
    if (!hasContact) {
      leadResult.className = "result danger";
      leadResult.textContent = "メールアドレスまたは電話番号を入力してください。";
      return;
    }

    const leadPayload = {
      name: leadName.value.trim() || null,
      email: leadEmail.value.trim() || null,
      phone: leadPhone.value.trim() || null,
      message: leadMessage.value.trim() || null,
      meta: { source: "app_ui_v1" },
    };

    setDisabled(btnLead, true);
    leadResult.className = "result muted";
    leadResult.textContent = "送信中…";

    try {
      const res = await fetch("/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        const msg = data?.error || "LEAD_FAILED";
        throw new Error(msg);
      }

      leadResult.className = "result success";
      leadResult.textContent = "送信完了！追ってご連絡します。";
      leadForm.reset();
    } catch (err) {
      leadResult.className = "result danger";
      leadResult.textContent = "送信に失敗しました。時間をおいてお試しください。";
    } finally {
      setDisabled(btnLead, false);
    }
  }

  // ===== イベント登録 =====
  // 入力の都度：自動再計算（主要フィールド）
  [
    pref, city, town, chome,
    nearestStation, walkMinutes, buildingYear,
    floorArea, lotArea
  ].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", scheduleRecalc);
    el.addEventListener("change", scheduleRecalc);
  });

  // フォーム送信（手動査定ボタンでも再計算）
  estimateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    runEstimate();
  });

  // リード送信
  leadForm.addEventListener("submit", submitLead);

  // 初期計算（空なら案内文を表示）
  runEstimate();
})();
