// /app データ直読み・堅牢版（駅 name_ja / 住所 wards 等も吸収）
const PREF = "hiroshima";
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
  areaUnit: document.getElementById("areaUnit"),
  landArea: document.getElementById("landArea"),
  buildingArea: document.getElementById("buildingArea"),
  buildYear: document.getElementById("buildYear"),
  floorPlan: document.getElementById("floorPlan"),
  structure: document.getElementById("structure"),
  totalFloors: document.getElementById("totalFloors"),
  floor: document.getElementById("floor"),
  isCorner: document.getElementById("isCorner"),
  aspect: document.getElementById("aspect"),

  email: document.getElementById("email"),
  message: document.getElementById("message"),
  submitBtn: document.getElementById("submitBtn"),
  errorBox: document.getElementById("errorBox"),
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
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.json();
}
function initWalkSelect() {
  clearOptions(els.walk, "選択してください");
  for (let i = 1; i <= 60; i++) appendOption(els.walk, String(i), `${i}分`);
}
function initUserTypeToggle() {
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
function initYears() {
  clearOptions(els.buildYear, "年を選択");
  for (let y = 2025; y >= 1900; y--) appendOption(els.buildYear, String(y), `${y}年`);
}
function initFloors() {
  clearOptions(els.totalFloors, "選択してください");
  clearOptions(els.floor, "選択してください");
  for (let f = 1; f <= 100; f++) {
    appendOption(els.totalFloors, String(f), `${f}階`);
    appendOption(els.floor, String(f), `${f}階`);
  }
}

// ---------- normalizers ----------
function normalizeCityIndex(data) {
  const out = [];
  if (!data) return out;
  if (Array.isArray(data)) {
    data.forEach((it) => {
      const name = it?.name_ja || it?.name || it?.label || it?.title || "";
      const code = it?.code ?? it?.value ?? "";
      if (name && code) out.push({ name, code: String(code) });
    });
    return out;
  }
  if (Array.isArray(data.cities)) {
    data.cities.forEach((c) => {
      const name = c?.name_ja || c?.name || c?.label || "";
      const code = c?.code ?? c?.value ?? "";
      if (name && code) out.push({ name, code: String(code) });
    });
    return out;
  }
  if (Array.isArray(data.wards)) {
    data.wards.forEach((w) => {
      const name = w?.name_ja || w?.name || w?.label || "";
      const code = w?.code ?? w?.value ?? "";
      if (name && code) out.push({ name, code: String(code) });
    });
    return out;
  }
  if (Array.isArray(data.list)) {
    data.list.forEach((w) => {
      const name = w?.name_ja || w?.name || w?.label || "";
      const code = w?.code ?? w?.value ?? "";
      if (name && code) out.push({ name, code: String(code) });
    });
    return out;
  }
  Object.entries(data).forEach(([name, code]) => {
    if (name && (code || code === 0)) out.push({ name, code: String(code) });
  });
  return out;
}
function normalizeTowns(data) {
  let arr = [];
  if (!data) return arr;
  if (Array.isArray(data)) arr = data;
  else {
    const key = ["towns", "neighborhoods", "areas", "list", "data"].find(
      (k) => Array.isArray(data[k])
    );
    arr = key ? data[key] : [];
  }
  return arr
    .map((t) => {
      const name = t?.town || t?.name || t?.label || t?.title;
      const ch = t?.chome || t?.chomes || t?.blocks || t?.丁目 || [];
      if (!name) return null;
      return { name, chomes: Array.isArray(ch) ? ch : [] };
    })
    .filter(Boolean);
}
function normalizeLinesIndex(data) {
  const out = [];
  if (!data) return out;
  if (Array.isArray(data.lines)) {
    data.lines.forEach((l) => {
      const file = l?.file || (l?.code ? `${l.code}.json` : "");
      const name = l?.name_ja || l?.name || l?.label || l?.code || "";
      if (file && name) out.push({ name, file });
    });
    return out;
  }
  Object.entries(data).forEach(([name, file]) => {
    if (name && file) out.push({ name, file: String(file) });
  });
  return out;
}
function normalizeStations(data) {
  let arr = [];
  if (!data) return arr;
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data.stations)) arr = data.stations;
  else if (Array.isArray(data.list)) arr = data.list;
  return arr
    .map((s) => {
      const name = s?.station || s?.name_ja || s?.name || s?.title;
      if (!name) return null;
      return { name, lat: s?.lat ?? null, lng: s?.lng ?? null };
    })
    .filter(Boolean);
}

// ---------- loaders ----------
async function loadCities() {
  const data = await getJSON(`${ADDRESS_BASE}/index.json`);
  const cities = normalizeCityIndex(data);
  clearOptions(els.city, "市区町村を選択");
  cities.forEach((c) => appendOption(els.city, c.code, c.name));

  els.city.onchange = async () => {
    clearOptions(els.town, "町名を選択");
    clearOptions(els.chome, "丁目を選択");
    const code = els.city.value;
    if (!code) return;

    const townsRaw = await getJSON(`${ADDRESS_BASE}/${encodeURIComponent(code)}.json`);
    const towns = normalizeTowns(townsRaw);
    towns.forEach((t) => appendOption(els.town, t.name, t.name));

    els.town.onchange = () => {
      clearOptions(els.chome, "丁目を選択");
      const selected = towns.find((x) => x.name === els.town.value);
      (selected?.chomes ?? []).forEach((c) => {
        const num = typeof c === "number" ? c : String(c).replace(/丁目?$/u, "");
        const label = typeof c === "number" ? `${c}丁目` : String(c);
        appendOption(els.chome, String(num), label);
      });
    };
  };
}
async function loadLines() {
  const idx = await getJSON(`${RAIL_BASE}/index.json`);
  const lines = normalizeLinesIndex(idx);
  clearOptions(els.line, "路線を選択");
  lines.forEach((l) => appendOption(els.line, l.file, l.name));

  els.line.onchange = async () => {
    clearOptions(els.station, "駅を選択");
    const file = els.line.value;
    if (!file) return;
    const stationsRaw = await getJSON(`${RAIL_BASE}/${encodeURIComponent(file)}`);
    const stations = normalizeStations(stationsRaw);
    stations.forEach((s) => appendOption(els.station, s.name, s.name));
  };
}

// ---------- boot ----------
async function bootstrap() {
  try {
    initWalkSelect();
    initUserTypeToggle();
    initYears();
    initFloors();
    await Promise.all([loadCities(), loadLines()]);
  } catch (e) {
    console.error(e);
    if (els.errorBox) {
      els.errorBox.style.display = "block";
      els.errorBox.textContent = "初期データの取得に失敗しました。再読み込みしてください。";
    } else {
      alert("初期データの取得に失敗しました。");
    }
  }
}
document.addEventListener("DOMContentLoaded", bootstrap);

// 送信（ダミー）
els?.submitBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  alert("送信処理は後で実装します（UI動作確認用）");
});
