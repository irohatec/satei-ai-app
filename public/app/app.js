// public/app/app.js
// -----------------------------------------------------------------------------
// UI 初期化 + データローダ + /estimate 呼び出し
// -----------------------------------------------------------------------------

// 環境依存パス（/app 配下に datasets を置いたため相対でOK）
const PREF = "hiroshima"; // Render の環境変数 PREFECTURE と同じ想定（今回は固定）

// DOM
const els = {
  userTypePersonal: null,
  userTypeBusiness: null,
  businessFields: null,

  // エリア
  city: null,
  town: null,
  chome: null,
  addressDetail: null,

  // 駅
  line: null,
  station: null,
  walk: null,

  // 物件
  propertyType: null,
  areaUnit: null,
  landArea: null,
  buildingArea: null,
  buildYear: null,
  floorPlan: null,
  structure: null,
  totalFloors: null,
  floor: null,
  aspect: null,
  isCorner: null,

  // 送信
  email: null,
  submitBtn: null,

  // 結果
  resultPrice: null
};

// ---------------- UI: 共通ヘルパ ----------------
function $(id) { return document.getElementById(id); }

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.json();
}

function fillOptions(select, items, { valueKey = "value", labelKey = "label", placeholder } = {}) {
  select.innerHTML = "";
  if (placeholder) {
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    select.appendChild(opt0);
  }
  items.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = typeof it === "string" ? it : it[valueKey];
    opt.textContent = typeof it === "string" ? it : it[labelKey];
    select.appendChild(opt);
  });
}

function range(n1, n2) {
  const arr = [];
  for (let i = n1; i <= n2; i++) arr.push(i);
  return arr;
}

// ---------------- 住所データローダ ----------------
// /app/datasets/address/hiroshima/index.json : { "広島市中区":"34101", ... }
// /app/datasets/address/hiroshima/34101.json : [{ town:"○○", chome:["1丁目",...], ... }, ...]
let CITY_INDEX = {}; // name -> code
let CURRENT_TOWN_LIST = []; // [{ town, chome:[] }, ...]

async function loadCities() {
  const idx = await getJSON(`./datasets/address/${PREF}/index.json`);
  CITY_INDEX = idx || {};
  const cityNames = Object.keys(CITY_INDEX);
  fillOptions(els.city, cityNames, { placeholder: "市区町村を選択" });
}

async function loadTownsByCity(cityName) {
  const code = CITY_INDEX[cityName];
  if (!code) {
    fillOptions(els.town, [], { placeholder: "町名を選択" });
    fillOptions(els.chome, [], { placeholder: "丁目を選択" });
    CURRENT_TOWN_LIST = [];
    return;
  }
  const arr = await getJSON(`./datasets/address/${PREF}/${code}.json`);
  CURRENT_TOWN_LIST = Array.isArray(arr) ? arr : [];
  const townNames = CURRENT_TOWN_LIST.map((t) => t.town);
  fillOptions(els.town, townNames, { placeholder: "町名を選択" });
  fillOptions(els.chome, [], { placeholder: "丁目を選択" });
}

function loadChomeByTown(townName) {
  const t = CURRENT_TOWN_LIST.find((x) => x.town === townName);
  const chomes = (t && Array.isArray(t.chome)) ? t.chome : [];
  fillOptions(els.chome, chomes, { placeholder: "丁目を選択" });
}

// ---------------- 鉄道データローダ ----------------
// /app/datasets/rail/hiroshima/index.json : { lines: [{ code, name_ja, file }, ...] }
// /app/datasets/rail/hiroshima/<file>.json : [{ station:"○○駅", lat?, lng? }, ...]
let LINE_INDEX = []; // [{ code, name_ja, file }]
async function loadLines() {
  const data = await getJSON(`./datasets/rail/${PREF}/index.json`);
  LINE_INDEX = Array.isArray(data?.lines) ? data.lines : [];
  const opts = LINE_INDEX.map((l) => ({ value: l.code, label: l.name_ja || l.code }));
  fillOptions(els.line, opts, { valueKey: "value", labelKey: "label", placeholder: "路線を選択" });
  fillOptions(els.station, [], { placeholder: "駅を選択" });
}

async function loadStationsByLine(lineCode) {
  const line = LINE_INDEX.find((l) => l.code === lineCode);
  if (!line) {
    fillOptions(els.station, [], { placeholder: "駅を選択" });
    return;
  }
  const arr = await getJSON(`./datasets/rail/${PREF}/${line.file}`);
  const stations = (Array.isArray(arr) ? arr : []).map((s) => s.station || s.name).filter(Boolean);
  fillOptions(els.station, stations, { placeholder: "駅を選択" });
}

// ---------------- 送信（査定） ----------------
async function sendEstimate() {
  const payload = {
    // ご利用区分
    userType: document.querySelector('input[name="userType"]:checked')?.value || "personal",

    // エリア
    prefecture: PREF,
    city: els.city.value || "",
    town: els.town.value || "",
    chome: els.chome.value || "",
    addressDetail: els.addressDetail.value || "",

    // 最寄り
    line: els.line.value || "",
    station: els.station.value || "",
    walkMinutes: Number(els.walk.value || 0),

    // 物件
    propertyType: (els.propertyType.value || "").toLowerCase(),
    areaUnit: els.areaUnit.value || "sqm",
    landArea: Number(els.landArea.value || 0),
    buildingArea: Number(els.buildingArea.value || 0),
    buildYear: Number(els.buildYear.value || 0),
    floorPlan: els.floorPlan.value || "",
    structure: els.structure.value || "",
    totalFloors: Number(els.totalFloors.value || 0),
    floor: Number(els.floor.value || 0),
    aspect: els.aspect.value || "",
    isCorner: !!els.isCorner.checked,

    // 連絡
    email: els.email.value || ""
  };

  // API 呼び出し
  const res = await fetch("/estimate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data?.ok) {
    console.error("estimate error:", data);
    alert("査定に失敗しました。必須項目をご確認ください。");
    return;
  }

  // 表示更新
  const man = Number(data.priceMan || 0);
  els.resultPrice.textContent = `${man.toLocaleString()} 万円`;
}

// ---------------- 初期化 ----------------
async function bootstrap() {
  // 要素参照
  els.userTypePersonal = document.querySelector('input[name="userType"][value="personal"]');
  els.userTypeBusiness  = document.querySelector('input[name="userType"][value="business"]');
  els.businessFields = document.getElementById("businessFields");

  els.city = $("citySelect");
  els.town = $("townSelect");
  els.chome = $("chomeSelect");
  els.addressDetail = $("addressDetail");

  els.line = $("lineSelect");
  els.station = $("stationSelect");
  els.walk = $("walkSelect");

  els.propertyType = $("propertyType");
  els.areaUnit = $("areaUnit");
  els.landArea = $("landArea");
  els.buildingArea = $("buildingArea");
  els.buildYear = $("buildYear");
  els.floorPlan = $("floorPlan");
  els.structure = $("structure");
  els.totalFloors = $("totalFloors");
  els.floor = $("floor");
  els.aspect = $("aspect");
  els.isCorner = $("isCorner");

  els.email = $("email");
  els.submitBtn = $("submitBtn");

  els.resultPrice = $("resultPrice");

  // 個人/法人 表示切替
  document.querySelectorAll('input[name="userType"]').forEach((r) => {
    r.addEventListener("change", () => {
      const isBiz = document.querySelector('input[name="userType"]:checked')?.value === "business";
      els.businessFields.style.display = isBiz ? "grid" : "none";
    });
  });

  // 徒歩分 1..60
  fillOptions(els.walk, range(1, 60).map((i) => `${i}`), { placeholder: "選択してください" });

  // 建物階数 / 所在階 1..100
  fillOptions(els.totalFloors, range(1, 100).map(String), { placeholder: "選択してください" });
  fillOptions(els.floor, range(1, 100).map(String), { placeholder: "選択してください" });

  // 築年 1900..2025（固定）
  fillOptions(els.buildYear, range(1900, 2025).reverse().map(String), { placeholder: "年を選択" });

  // イベント: 住所
  els.city.addEventListener("change", (e) => loadTownsByCity(e.target.value));
  els.town.addEventListener("change", (e) => loadChomeByTown(e.target.value));

  // イベント: 路線
  els.line.addEventListener("change", (e) => loadStationsByLine(e.target.value));

  // 送信
  els.submitBtn.addEventListener("click", sendEstimate);

  // データロード
  await Promise.all([loadCities(), loadLines()]);
}

document.addEventListener("DOMContentLoaded", bootstrap);
