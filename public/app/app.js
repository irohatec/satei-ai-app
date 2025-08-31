// public/app/app.js
// ============================================================================
// データは /app/datasets/... から直接 fetch（server 依存なし）
// 住所/路線の JSON 形式が多少違っても吸収する“堅牢版”
// ============================================================================

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
  areaSqm: document.getElementById("areaSqm"),
  structure: document.getElementById("structure"),
  totalFloors: document.getElementById("totalFloors"),
  floor: document.getElementById("floor"),
  isCorner: document.getElementById("isCorner"),
  aspect: document.getElementById("aspect"),

  email: document.getElementById("email"),
  submitBtn: document.getElementById("submitBtn"),
};

// ------------------------- utils -------------------------
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

// ------------------- normalizers（形式差異を吸収） -------------------
function normalizeCityIndex(data) {
  // 受け入れ例:
  // ① { "広島市中区": "34101", ... }（辞書）
  // ② { cities:[{name,code}, ...] } / { wards:[{name|name_ja,code}, ...] }
  // ③ { list:[{label,value}, ...] }
  const out = [];
  if (!data) return out;

  if (Array.isArray(data)) {
    // まれに配列で来るケース
    data.forEach((it) => {
      const name = it?.name_ja || it?.name || it?.label || it?.title || "";
      const code = it?.code ?? it?.value ?? "";
      if (name && code) out.push({ name, code: String(code) });
    });
    return out;
  }

  // オブジェクト
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

  // 辞書形式
  Object.entries(data).forEach(([name, code]) => {
    if (name && (code || code === 0)) out.push({ name, code: String(code) });
  });
  return out;
}

function normalizeTowns(data) {
  // 受け入れ例:
  // ① [ { town:"大手町", chome:[...] }, ... ]（配列）
  // ② { towns:[{ name|town, chome|chomes|blocks:[...] }, ...] }
  // ③ { list:[{ name, chome }, ...] } / { neighborhoods:[...] } など
  let arr = [];
  if (!data) return arr;

  if (Array.isArray(data)) {
    arr = data;
  } else {
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
  // 受け入れ例:
  // ① { "広電 本線": "hiroden-honsen.json", ... }
  // ② { lines:[{ code, name_ja|name, file }, ...] }
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

  // 辞書形式
  Object.entries(data).forEach(([name, file]) => {
    if (name && file) out.push({ name, file: String(file) });
  });
  return out;
}

function normalizeStations(data) {
  // 受け入れ例:
  // ① [ { station:"紙屋町東", lat, lng }, ... ]
  // ② { stations:[{ station|name|title, ... }, ...] }
  let arr = [];
  if (!data) return arr;

  if (Array.isArray(data)) {
    arr = data;
  } else if (Array.isArray(data.stations)) {
    arr = data.stations;
  } else if (Array.isArray(data.list)) {
    arr = data.list;
  }

  return arr
    .map((s) => {
      const name = s?.station || s?.name || s?.title;
      if (!name) return null;
      return { name, lat: s?.lat ?? null, lng: s?.lng ?? null };
    })
    .filter(Boolean);
}

// ------------------- 住所 -------------------
async function loadCities() {
  if (!els.city || !els.town || !els.chome) return;

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

    // 町名
    towns.forEach((t) => appendOption(els.town, t.name, t.name));

    // 丁目（町が変わったら更新）
    els.town.onchange = () => {
      clearOptions(els.chome, "丁目を選択");
      const selected = towns.find((x) => x.name === els.town.value);
      const chomes = selected?.chomes ?? [];
      chomes.forEach((c) => {
        const num = typeof c === "number" ? c : String(c).replace(/丁目?$/u, "");
        const label = typeof c === "number" ? `${c}丁目` : String(c);
        appendOption(els.chome, String(num), label);
      });
    };
  };
}

// ------------------- 鉄道 -------------------
async function loadLines() {
  if (!els.line || !els.station) return;

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

// ------------------- 初期化 -------------------
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

// ------------------- 送信ダミー -------------------
if (els.submitBtn) {
  els.submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    alert("送信処理は後で実装します（UI動作確認用）");
  });
}
