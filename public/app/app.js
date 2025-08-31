// public/app/app.js
// ============================================================================
// 公開データは /app/datasets/... から直接 fetch します（server には依存しません）
// 必要なID（index.html）は以下を想定：
// - 利用者種別: input[name="userType"]（"personal" / "business"）
// - 事業者用ブロック: #businessFields, 会社名: #companyName, 電話: #phone
// - 住所: #citySelect, #townSelect, #chomeSelect
// - 鉄道: #lineSelect, #stationSelect, #walkSelect
// - 物件: #propertyType, #areaSqm, #structure, #totalFloors, #floor, #isCorner, #aspect
// - 連絡: #email
// - 送信: #submitBtn
// ============================================================================

const PREF = "hiroshima"; // 公開データは hiroshima 固定
const DATA_BASE = "/app/datasets";
const ADDRESS_BASE = `${DATA_BASE}/address/${PREF}`;
const RAIL_BASE = `${DATA_BASE}/rail/${PREF}`;

const els = {
  userTypeRadios: document.querySelectorAll('input[name="userType"]'),
  businessFields: document.getElementById("businessFields"),
  companyName: document.getElementById("companyName"),
  phone: document.getElementById("phone"),

  city: document.getElementById("citySelect"),
  town: document.getElementById("townSelect"),
  chome: document.getElementById("chomeSelect"),

  line: document.getElementById("lineSelect"),
  station: document.getElementById("stationSelect"),
  walk: document.getElementById("walkSelect"),

  propertyType: document.getElementById("propertyType"),
  areaSqm: document.getElementById("areaSqm"),
  structure: document.getElementById("structure"),
  totalFloors: document.getElementById("totalFloors"),
  floor: document.getElementById("floor"),
  isCorner: document.getElementById("isCorner"),
  aspect: document.getElementById("aspect"),

  email: document.getElementById("email"),
  submitBtn: document.getElementById("submitBtn"),
};

// ---------- utils ----------
function clearOptions(selectEl, placeholder = "選択してください") {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);
}

function appendOption(selectEl, value, label) {
  if (!selectEl) return;
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  selectEl.appendChild(opt);
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} (${res.status})`);
  }
  return res.json();
}

function initWalkSelect() {
  if (!els.walk) return;
  clearOptions(els.walk, "選択してください");
  for (let i = 1; i <= 60; i++) appendOption(els.walk, String(i), `${i}分`);
}

function initUserTypeToggle() {
  if (!els.businessFields || !els.userTypeRadios?.length) return;
  const toggle = () => {
    const v = document.querySelector('input[name="userType"]:checked')?.value;
    const isBiz = v === "business";
    els.businessFields.style.display = isBiz ? "block" : "none";
    if (els.companyName) els.companyName.required = isBiz;
    if (els.phone) els.phone.required = isBiz;
  };
  els.userTypeRadios.forEach((r) => r.addEventListener("change", toggle));
  toggle();
}

// ---------- 住所 ----------
async function loadCities() {
  if (!els.city || !els.town || !els.chome) return;

  // 期待形: { "広島市中区": "34101", ... }（オブジェクト）
  // 将来互換: { "cities":[{"name":"広島市中区","code":"34101"}, ...] } にも対応
  const idx = await getJSON(`${ADDRESS_BASE}/index.json`);

  clearOptions(els.city, "市区町村を選択");
  if (idx && typeof idx === "object" && !Array.isArray(idx)) {
    if (Array.isArray(idx.cities)) {
      // 互換（配列）
      idx.cities.forEach((c) => appendOption(els.city, String(c.code), c.name));
    } else {
      // 通常（辞書）
      Object.entries(idx).forEach(([name, code]) =>
        appendOption(els.city, String(code), name)
      );
    }
  }

  els.city.onchange = async () => {
    clearOptions(els.town, "町名を選択");
    clearOptions(els.chome, "丁目を選択");
    const code = els.city.value;
    if (!code) return;

    // 期待形: [ { town:"大手町", chome:["1丁目","2丁目"], lat:..., lng:... }, ... ]
    const towns = await getJSON(`${ADDRESS_BASE}/${code}.json`);
    if (!Array.isArray(towns)) return;

    // 重複登録防止のため、後段 onChange を都度差し替え
    els.town.onchange = null;

    towns.forEach((t) => {
      if (!t || !t.town) return;
      appendOption(els.town, t.town, t.town);
    });

    els.town.onchange = () => {
      clearOptions(els.chome, "丁目を選択");
      const selected = towns.find((x) => x.town === els.town.value);
      const chomes = selected?.chome ?? [];
      chomes.forEach((c) => {
        // "1丁目" でも 1 でも受け入れ
        const num = typeof c === "number" ? c : String(c).replace(/丁目?$/u, "");
        const label = typeof c === "number" ? `${c}丁目` : String(c);
        appendOption(els.chome, String(num), label);
      });
    };
  };
}

// ---------- 鉄道 ----------
async function loadLines() {
  if (!els.line || !els.station) return;

  // 期待形1: { "広電 本線": "hiroden-honsen.json", ... }（辞書）
  // 期待形2: { "lines":[ { code, name_ja, file }, ... ] }（配列） ← こちらもサポート
  const idx = await getJSON(`${RAIL_BASE}/index.json`);

  clearOptions(els.line, "路線を選択");

  if (idx && typeof idx === "object" && !Array.isArray(idx)) {
    if (Array.isArray(idx.lines)) {
      idx.lines.forEach((l) => {
        const file = l.file || `${l.code}.json`;
        const name = l.name_ja || l.name || l.code;
        appendOption(els.line, String(file), name);
      });
    } else {
      Object.entries(idx).forEach(([name, file]) =>
        appendOption(els.line, String(file), name)
      );
    }
  }

  els.line.onchange = async () => {
    clearOptions(els.station, "駅を選択");
    const file = els.line.value;
    if (!file) return;

    // 期待形: [ { station:"紙屋町東", lat:..., lng:... }, ... ]
    const stations = await getJSON(`${RAIL_BASE}/${file}`);
    if (!Array.isArray(stations)) return;

    stations.forEach((s) => {
      const name = s?.station || s?.name || s?.title;
      if (!name) return;
      appendOption(els.station, name, name);
    });
  };
}

// ---------- 初期化 ----------
async function bootstrap() {
  try {
    initWalkSelect();
    initUserTypeToggle();
    await Promise.all([loadCities(), loadLines()]);
  } catch (e) {
    console.error(e);
    alert("初期データの取得に失敗しました。ページを更新して再試行してください。");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

// ---------- 送信（ダミー） ----------
if (els.submitBtn) {
  els.submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    alert("送信処理は後で実装します（UI動作確認用）");
  });
}
