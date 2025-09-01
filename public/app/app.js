// public/app/app.js
// 目的：広島県の「5つの成約データ」を読み込み、UI（市区/町/丁目 等）に反映する
// データ場所（既に配置済み想定）：/app/datasets/sales/hiroshima/
//   - index.json … 市区ごとのファイル一覧
//   - 〈市区名〉.json … 各市区の明細（_deal_type, _asset_type を含む）

(() => {
  const DATA_ROOT = "/app/datasets/sales/hiroshima/";
  const INDEX_URL = `${DATA_ROOT}index.json`;

  // DOM参照（index.html のIDと対応）
  const els = {
    // ご利用区分
    businessFields: document.getElementById("businessFields"),
    // エリア
    city: document.getElementById("citySelect"),
    town: document.getElementById("townSelect"),
    chome: document.getElementById("chomeSelect"),
    // 交通
    line: document.getElementById("lineSelect"),
    station: document.getElementById("stationSelect"),
    walk: document.getElementById("walkSelect"),
    // 物件情報
    propertyType: document.getElementById("propertyType"),
    areaUnit: document.getElementById("areaUnit"),
    landArea: document.getElementById("landArea"),
    buildingArea: document.getElementById("buildingArea"),
    buildYear: document.getElementById("buildYear"),
    floorPlan: document.getElementById("floorPlan"),
    structure: document.getElementById("structure"),
    totalFloors: document.getElementById("totalFloors"),
    floor: document.getElementById("floor"),
    aspect: document.getElementById("aspect"),
    isCorner: document.getElementById("isCorner"),
    // 必須表示
    landReq: document.getElementById("landReq"),
    bldgReq: document.getElementById("bldgReq"),
    buildYearReq: document.getElementById("buildYearReq"),
    // 出力
    resultPrice: document.getElementById("resultPrice"),
    submitBtn: document.getElementById("submitBtn"),
  };

  // 内部状態
  let cityFiles = [];            // [{city, file, count}, ...]
  let cityRecords = [];          // 選択中市区の全レコード
  let townIndex = new Map();     // townName -> records[]
  let chomeIndex = new Map();    // chomeName -> records[]（townでフィルタ後に更新）

  // ---- 汎用ユーティリティ ----
  const opt = (v, t = v) => {
    const o = document.createElement("option");
    o.value = v ?? "";
    o.textContent = (t ?? "").toString();
    return o;
  };

  function resetSelect($sel, placeholder = "選択してください") {
    $sel.innerHTML = "";
    $sel.appendChild(opt("", placeholder));
  }

  function uniqSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  }

  // レコードから市区/町/丁目/駅などを柔軟に取り出す（項目名の揺れに対応）
  const getField = (r, keys) => {
    for (const k of keys) {
      if (r[k] != null && r[k] !== "") return r[k];
    }
    return "";
  };

  // 町名推定：候補列か、所在地文字列を解析
  function extractTown(r) {
    const explicit = getField(r, ["town", "地区名", "町名", "大字町丁目名", "小字名"]);
    if (explicit) return explicit;

    const addr = getField(r, ["所在地", "住所", "address"]);
    if (!addr) return "";

    // 例：〇〇町△△丁目 から 〇〇町 部分を取り出す
    const m = addr.match(/(.+?)(\d+|[一二三四五六七八九十]+)丁目/);
    if (m) return m[1].replace(/\s/g, "").trim();
    // 例：〇〇町… の最初の「…町」まで
    const m2 = addr.match(/(.+?町)/);
    if (m2) return m2[1].trim();
    return "";
  }

  // 丁目推定
  function extractChome(r) {
    const explicit = getField(r, ["丁目", "chome"]);
    if (explicit) return explicit.toString();

    const addr = getField(r, ["所在地", "住所", "address"]);
    if (!addr) return "";
    const m = addr.match(/(\d+|[一二三四五六七八九十]+)丁目/);
    return m ? m[1].toString() : "";
  }

  // 駅名推定
  function extractStationName(r) {
    return getField(r, ["最寄駅", "駅名", "station", "最寄り駅", "沿線駅名"]);
  }

  // データの5分類キー
  function bucketKey(r) {
    const deal = (getField(r, ["_deal_type", "deal_type", "種別"]) || "").toLowerCase(); // trade | contract
    let asset = (getField(r, ["_asset_type", "asset_type", "用途"]) || "").toLowerCase(); // land | house | mansion
    // 日本語→英語ざっくり対応
    if (/マンション/.test(asset)) asset = "mansion";
    if (/戸建|建物/.test(asset)) asset = "house";
    if (/土地/.test(asset)) asset = "land";
    return `${deal}_${asset}`;
  }

  // ---- 1) index.json を読み込み、市区をセット ----
  async function loadCityIndex() {
    resetSelect(els.city, "読み込み中…");
    try {
      const res = await fetch(INDEX_URL);
      if (!res.ok) throw new Error(`index.json HTTP ${res.status}`);
      const json = await res.json();
      cityFiles = (json.files || []).map(f => ({
        city: f.city || f.name || "",
        file: f.file,
        count: f.count ?? null,
      })).filter(x => x.city && x.file);

      resetSelect(els.city);
      cityFiles.forEach(cf => els.city.appendChild(opt(cf.file, cf.city)));
    } catch (e) {
      resetSelect(els.city, "（読み込み失敗）");
      console.error("[loadCityIndex] failed:", e);
    }
  }

  // ---- 2) 市区ファイルを読み込み、町/丁目/駅をセット ----
  async function onCityChange() {
    const file = els.city.value;
    resetSelect(els.town);
    resetSelect(els.chome);
    resetSelect(els.line, "—");
    resetSelect(els.station, "—");
    resetSelect(els.walk, "—");
    cityRecords = [];
    townIndex.clear();
    chomeIndex.clear();

    if (!file) return;

    try {
      const res = await fetch(`${DATA_ROOT}${encodeURIComponent(file)}`);
      if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
      const records = await res.json();
      cityRecords = Array.isArray(records) ? records : [];

      // 町インデックス作成
      const towns = [];
      for (const r of cityRecords) {
        const t = extractTown(r);
        if (!townIndex.has(t)) townIndex.set(t, []);
        townIndex.get(t).push(r);
        towns.push(t);
      }
      const townList = uniqSorted(towns);
      resetSelect(els.town);
      townList.forEach(t => els.town.appendChild(opt(t, t || "(不明)")));

      // 駅（市区全体）候補
      const stations = uniqSorted(cityRecords.map(extractStationName).filter(Boolean));
      resetSelect(els.station);
      stations.forEach(s => els.station.appendChild(opt(s)));

      // 徒歩候補（固定）
      resetSelect(els.walk);
      [1, 3, 5, 10, 15, 20, 25, 30].forEach(n => els.walk.appendChild(opt(String(n), `${n}`)));

      // 5分類の件数を査定欄に表示（データ反映の目印）
      showFiveBuckets();

    } catch (e) {
      console.error("[onCityChange] failed:", e);
      resetSelect(els.town, "（読み込み失敗）");
    }
  }

  // ---- 3) 町が変わったら丁目をセット ----
  function onTownChange() {
    resetSelect(els.chome);
    chomeIndex.clear();
    const townName = els.town.value;
    if (!townName && townIndex.size > 0) return;

    const base = townIndex.get(townName) || [];
    const chomes = [];
    for (const r of base) {
      const c = extractChome(r);
      if (!chomeIndex.has(c)) chomeIndex.set(c, []);
      chomeIndex.get(c).push(r);
      chomes.push(c);
    }
    uniqSorted(chomes).forEach(c => els.chome.appendChild(opt(c, c || "(—)")));
  }

  // ---- 4) 物件種目に応じて必須ラベルを調整 ----
  function onTypeChange() {
    const t = els.propertyType.value;
    // 必須表示
    els.landReq.textContent = (t === "土地" || t === "戸建") ? "（必須）" : "（任意）";
    els.bldgReq.textContent = (t === "マンション" || t === "戸建") ? "（必須）" : "（任意）";
    els.buildYearReq.textContent = (t === "マンション" || t === "戸建") ? "（必須）" : "（任意）";
  }

  // ---- 5) 5つの成約データの反映状況を表示（件数カウント） ----
  function showFiveBuckets() {
    const buckets = {
      trade_land: 0,
      trade_house: 0,     // = 土地と建物
      trade_mansion: 0,
      contract_house: 0,
      contract_mansion: 0
    };
    for (const r of cityRecords) {
      const key = bucketKey(r); // 例）"trade_mansion"
      if (key in buckets) buckets[key]++;
    }
    const total = Object.values(buckets).reduce((a,b)=>a+b,0);
    els.resultPrice.textContent =
      `データ読込：合計 ${total} 件 ` +
      `(取引-土地: ${buckets.trade_land} / 取引-土地建物: ${buckets.trade_house} / 取引-ﾏﾝｼｮﾝ: ${buckets.trade_mansion} / 成約-戸建: ${buckets.contract_house} / 成約-ﾏﾝｼｮﾝ: ${buckets.contract_mansion})`;
  }

  // ---- 6) 初期セットアップ ----
  function fillStaticChoices() {
    // 路線は未確定のため空（データから駅名のみ採取）
    resetSelect(els.line, "（任意）");
    // 建築年（1960〜今年）
    const now = new Date().getFullYear();
    els.buildYear.innerHTML = "";
    els.buildYear.appendChild(opt("", "選択してください"));
    for (let y = now; y >= 1960; y--) els.buildYear.appendChild(opt(String(y), `${y}年`));
    // 階数
    els.totalFloors.innerHTML = ""; els.totalFloors.appendChild(opt("", "選択してください"));
    for (let n = 1; n <= 60; n++) els.totalFloors.appendChild(opt(String(n)));
    els.floor.innerHTML = ""; els.floor.appendChild(opt("", "選択してください"));
    for (let n = 1; n <= 60; n++) els.floor.appendChild(opt(String(n)));
  }

  // ---- イベントバインド ----
  function bindEvents() {
    // ユーザー区分の補助表示
    document.querySelectorAll('input[name="userType"]').forEach(r =>
      r.addEventListener("change", (e) => {
        els.businessFields.style.display = (e.target.value === "business") ? "grid" : "none";
      })
    );

    els.city.addEventListener("change", onCityChange);
    els.town.addEventListener("change", onTownChange);
    els.propertyType.addEventListener("change", onTypeChange);

    // 単位切替（坪→㎡ / ㎡→坪）…必要あればここに追加
    els.areaUnit?.addEventListener("change", () => {
      // 表示だけ切り替え。実数変換は査定ロジック実装時に対応
    });
  }

  // ---- 起動 ----
  async function boot() {
    fillStaticChoices();
    bindEvents();
    await loadCityIndex(); // 市区プルダウンに一覧を反映
    // 既定では未選択。ユーザーが市区を選ぶと town/chome が動的に出ます
  }

  // 実行
  boot();
})();
