// public/app/app.js
// -----------------------------------------------------------------------------
// UI 初期化 + データローダ + /estimate 呼び出し
// ── 住所/沿線データの形式差（配列 or 連想オブジェクト）に両対応版 ──
// -----------------------------------------------------------------------------

const PREF = "hiroshima"; // 今回は固定

// DOM 参照
const els = {
  // ご利用区分
  businessFields: null,

  // エリア
  city: null,
  town: null,
  chome: null,
  addressDetail: null,

  // 最寄り
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

// ---------------- 共通ヘルパ ----------------
function $(id) { return document.getElementById(id); }

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
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
    const v = typeof it === "string" ? it : it[valueKey];
    const l = typeof it === "string" ? it : it[labelKey];
    if (v == null || l == null) return;
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(l);
    select.appendChild(opt);
  });
}

function range(n1, n2) {
  const out = [];
  for (let i = n1; i <= n2; i++) out.push(i);
  return out;
}

// ---------------- 住所ローダ（両形式対応） ----------------
// index.json: ① { "広島市中区":"34101", ... } ② { wards|cities|list: [ {name_ja|name, code}, ... ] } ③ 直接配列
function normalizeCityIndex(idx) {
  // 返り値: [{ value: "34101", label: "広島市中区" }, ...]
  const out = [];
  if (!idx) return out;

  // 直接配列
  if (Array.isArray(idx)) {
    idx.forEach((it) => {
      const label = it?.name_ja || it?.name || it?.label || it?.title;
      const value = it?.code ?? it?.value ?? it?.id;
      if (label && (value || value === 0)) out.push({ label, value: String(value) });
    });
    return out;
  }

  // オブジェクト内部の配列（wards / cities / list）
  const arr =
    (Array.isArray(idx.cities) && idx.cities) ||
    (Array.isArray(idx.wards) && idx.wards) ||
    (Array.isArray(idx.list) && idx.list) ||
    null;

  if (arr) {
    arr.forEach((it) => {
      const label = it?.name_ja || it?.name || it?.label || it?.title;
      const value = it?.code ?? it?.value ?? it?.id;
      if (label && (value || value === 0)) out.push({ label, value: String(value) });
    });
    return out;
  }

  // 連想オブジェクト形式
  Object.entries(idx).forEach(([label, value]) => {
    if (label && (value || value === 0)) out.push({ label, value: String(value) });
  });
  return out;
}

function normalizeTownsFile(data) {
  // 受け: [{ town, chome:[...] }, ...] / { towns:[...]} / { list:[...]}
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.towns)) arr = data.towns;
  else if (Array.isArray(data?.list)) arr = data.list;

  return arr
    .map((t) => {
      const name = t?.town || t?.name || t?.label || t?.title;
      const ch = t?.chome || t?.chomes || t?.blocks || t?.丁目 || [];
      const chomes = Array.isArray(ch) ? ch.map((x) => String(x)) : [];
      return name ? { name, chomes } : null;
    })
    .filter(Boolean);
}

async function loadCities() {
  const idx = await getJSON(`./datasets/address/${PREF}/index.json`);
  const cityItems = normalizeCityIndex(idx);
  fillOptions(els.city, cityItems, {
    valueKey: "value",
    labelKey: "label",
    placeholder: "市区町村を選択"
  });

  // 変更時は「コード」で町ファイルを読む（[object Object].json 問題を回避）
  els.city.onchange = async () => {
    const code = els.city.value;
    fillOptions(els.town, [], { placeholder: "町名を選択" });
    fillOptions(els.chome, [], { placeholder: "丁目を選択" });
    if (!code) return;

    const townsRaw = await getJSON(`./datasets/address/${PREF}/${encodeURIComponent(code)}.json`);
    const townList = normalizeTownsFile(townsRaw);
    // 保持
    els._townList = townList;
    fillOptions(
      els.town,
      townList.map((t) => t.name),
      { placeholder: "町名を選択" }
    );
  };

  els.town.onchange = () => {
    const list = els._townList || [];
    const selected = list.find((t) => t.name === els.town.value);
    const chomes = selected?.chomes ?? [];
    fillOptions(
      els.chome,
      chomes.map((c) => {
        const label = /丁目$/.test(c) ? c : `${c}丁目`;
        const value = String(c).replace(/丁目$/u, "");
        return { value, label };
      }),
      { valueKey: "value", labelKey: "label", placeholder: "丁目を選択" }
    );
  };
}

// ---------------- 鉄道路線ローダ（両形式対応） ----------------
// index.json: ① { "広電 本線":"hiroden-honsen.json", ... } ② { lines:[{name_ja,file},...] } ③ 配列
function normalizeLinesIndex(idx) {
  const out = [];
  if (!idx) return out;

  if (Array.isArray(idx?.lines)) {
    idx.lines.forEach((l) => {
      const name = l?.name_ja || l?.name || l?.label || l?.code;
      const file = l?.file || (l?.code ? `${l.code}.json` : "");
      if (name && file) out.push({ name, file });
    });
    return out;
  }

  if (Array.isArray(idx)) {
    idx.forEach((l) => {
      const name = l?.name_ja || l?.name || l?.label || l?.code;
      const file = l?.file || (l?.code ? `${l.code}.json` : "");
      if (name && file) out.push({ name, file });
    });
    return out;
  }

  Object.entries(idx).forEach(([name, file]) => {
    if (name && file) out.push({ name, file: String(file) });
  });
  return out;
}

function normalizeStations(data) {
  let arr = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.stations)) arr = data.stations;
  else if (Array.isArray(data?.list)) arr = data.list;

  return arr
    .map((s) => s?.station || s?.name_ja || s?.name || s?.title)
    .filter(Boolean)
    .map(String);
}

async function loadLines() {
  const idx = await getJSON(`./datasets/rail/${PREF}/index.json`);
  const lineFiles = normalizeLinesIndex(idx);
  fillOptions(
    els.line,
    lineFiles.map((l) => ({ value: l.file, label: l.name })),
    { valueKey: "value", labelKey: "label", placeholder: "路線を選択" }
  );

  els.line.onchange = async () => {
    fillOptions(els.station, [], { placeholder: "駅を選択" });
    const file = els.line.value;
    if (!file) return;
    const stationsRaw = await getJSON(`./datasets/rail/${PREF}/${encodeURIComponent(file)}`);
    const stations = normalizeStations(stationsRaw);
    fillOptions(els.station, stations, { placeholder: "駅を選択" });
  };
}

// ---------------- 送信（/estimate） ----------------
async function sendEstimate() {
  const payload = {
    // ご利用区分
    userType: document.querySelector('input[name="userType"]:checked')?.value || "personal",

    // エリア
    prefecture: PREF,
    city: els.city.value ? els.city.options[els.city.selectedIndex].textContent : "",
    cityCode: els.city.value || "",
    town: els.town.value || "",
    chome: els.chome.value || "",
    addressDetail: els.addressDetail.value || "",

    // 最寄り
    line: els.line.value ? els.line.options[els.line.selectedIndex].textContent : "",
    lineFile: els.line.value || "",
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

  const man = Number(data.priceMan || 0);
  els.resultPrice.textContent = `${man.toLocaleString()} 万円`;
}

// ---------------- 初期化 ----------------
function initWalk() {
  fillOptions(els.walk, range(1, 60).map(String), { placeholder: "選択してください" });
}
function initFloors() {
  fillOptions(els.totalFloors, range(1, 100).map(String), { placeholder: "選択してください" });
  fillOptions(els.floor, range(1, 100).map(String), { placeholder: "選択してください" });
}
function initYears() {
  fillOptions(els.buildYear, range(1900, 2025).reverse().map(String), { placeholder: "年を選択" });
}
function initUserTypeToggle() {
  const radios = document.querySelectorAll('input[name="userType"]');
  const toggle = () => {
    const isBiz = document.querySelector('input[name="userType"]:checked')?.value === "business";
    els.businessFields.style.display = isBiz ? "grid" : "none";
  };
  radios.forEach((r) => r.addEventListener("change", toggle));
  toggle();
}

async function bootstrap() {
  // 要素参照
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

  // 初期UI
  initWalk();
  initFloors();
  initYears();
  initUserTypeToggle();

  // データ読み込み（片方で失敗してももう片方は続ける）
  await Promise.allSettled([loadCities(), loadLines()]);

  // ハンドラ
  els.submitBtn.addEventListener("click", sendEstimate);
}

document.addEventListener("DOMContentLoaded", bootstrap);
