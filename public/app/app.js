// public/app/app.js
// =============================================================================
// /datasets 配下（server/datasets を静的公開）から JSON を直接取得して
// セレクトを埋める。PREF は 'hiroshima' 固定（必要に応じて変更可）。
// =============================================================================

const PREF = "hiroshima"; // 必要なら env を埋め込む方式に変更可
const ADDRESS_BASE = `/datasets/address/${PREF}`;
const RAIL_BASE = `/datasets/rail/${PREF}`;

// DOM 取得（index.html 側の id に合わせてください）
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

// -----------------------------------------------------------------------------
function clearOptions(selectEl, placeholder = "選択してください") {
  selectEl.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  selectEl.appendChild(opt0);
}

function appendOption(selectEl, value, label) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  selectEl.appendChild(opt);
}

// -----------------------------------------------------------------------------
function initWalkSelect() {
  if (!els.walk) return;
  clearOptions(els.walk, "選択してください");
  for (let i = 1; i <= 60; i++) {
    appendOption(els.walk, String(i), `${i}分`);
  }
}

function initUserTypeToggle() {
  if (!els.businessFields || !els.userTypeRadios?.length) return;
  const toggle = () => {
    const v = document.querySelector('input[name="userType"]:checked')?.value;
    const isBiz = v === "business";
    els.businessFields.style.display = isBiz ? "block" : "none";
    // 必須制御（HTML 側で required を使う場合はここで付け替え）
    if (els.companyName) els.companyName.required = isBiz;
    if (els.phone) els.phone.required = isBiz;
  };
  els.userTypeRadios.forEach((r) => r.addEventListener("change", toggle));
  toggle();
}

// ----------------------------- 住所（広島） -----------------------------------
async function loadCities() {
  // /datasets/address/hiroshima/index.json
  const res = await fetch(`${ADDRESS_BASE}/index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error("市区町村 index.json の取得に失敗");
  const index = await res.json(); // { "広島市中区": "34101", ... }

  clearOptions(els.city);
  Object.entries(index).forEach(([name, code]) => {
    appendOption(els.city, String(code), name); // value=コード, label=市区町村名
  });

  // 都市コード → 町名リスト
  els.city.addEventListener("change", async () => {
    clearOptions(els.town);
    clearOptions(els.chome);
    const code = els.city.value;
    if (!code) return;
    const townsRes = await fetch(`${ADDRESS_BASE}/${code}.json`, {
      cache: "no-cache",
    });
    if (!townsRes.ok) return;
    const towns = await townsRes.json(); // [ { town, chome:[...] }, ... ]
    towns.forEach((t) => {
      appendOption(els.town, t.town, t.town); // value/label = 町名
    });

    // 町名 → 丁目
    els.town.addEventListener(
      "change",
      () => {
        clearOptions(els.chome);
        const t = towns.find((x) => x.town === els.town.value);
        if (!t) return;
        // 丁目は ["1丁目","2丁目",...] or [1,2,...] のどちらでも対応
        const chomes = Array.isArray(t.chome) ? t.chome : [];
        chomes.forEach((c) => {
          // "1丁目" → 1 を抽出して value にする（数字で使いたい場面に備える）
          const num =
            typeof c === "number"
              ? c
              : String(c).replace(/丁目?$/u, ""); // "1丁目" → "1"
          appendOption(els.chome, String(num), typeof c === "number" ? `${c}丁目` : String(c));
        });
      },
      { once: true } // 都市変更のたびにハンドラを積み上げない
    );
  });
}

// ----------------------------- 鉄道（広島） -----------------------------------
async function loadLines() {
  // /datasets/rail/hiroshima/index.json
  const res = await fetch(`${RAIL_BASE}/index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error("路線 index.json の取得に失敗");
  const index = await res.json(); // { "広電 本線": "hiroden-honsen.json", ... }

  clearOptions(els.line);
  Object.entries(index).forEach(([name, file]) => {
    appendOption(els.line, String(file), name); // value=ファイル名, label=路線名
  });

  els.line.addEventListener("change", async () => {
    clearOptions(els.station);
    const file = els.line.value;
    if (!file) return;
    const stRes = await fetch(`${RAIL_BASE}/${file}`, { cache: "no-cache" });
    if (!stRes.ok) return;
    const stations = await stRes.json(); // [ { station, lat?, lng? }, ... ]
    stations.forEach((s) => {
      if (!s || !s.station) return;
      appendOption(els.station, s.station, s.station); // value/label = 駅名
    });
  });
}

// ----------------------------- 初期化 -----------------------------------------
async function bootstrap() {
  try {
    initWalkSelect();
    initUserTypeToggle();
    if (els.city && els.town && els.chome) await loadCities();
    if (els.line && els.station) await loadLines();
  } catch (e) {
    console.error(e);
    alert("初期データの取得に失敗しました。ページを再読み込みしてみてください。");
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);

// ----------------------------- 送信ダミー -------------------------------------
// 必要に応じて /estimate → /lead の順で送信実装を追加してください。
if (els.submitBtn) {
  els.submitBtn.addEventListener("click", () => {
    alert("送信処理は後で実装します（UI動作確認用）");
  });
}
