// public/app/app.js
// 広島の5つの成約データを UI に反映（市区→町→丁目 / 駅）
// - JSON内の NaN / Infinity を null に置換してから parse
// - 町は五十音順、丁目は数値昇順で並べ替え

(() => {
  const DATA_ROOT = "/app/datasets/sales/hiroshima/";
  const INDEX_URL = `${DATA_ROOT}index.json`;

  // ---- DOM ----
  const els = {
    city:    document.getElementById("citySelect"),
    town:    document.getElementById("townSelect")    || document.getElementById("town")    || document.getElementById("townInput"),
    chome:   document.getElementById("chomeSelect")   || document.getElementById("chome"),
    line:    document.getElementById("lineSelect")    || document.getElementById("line"),
    station: document.getElementById("stationSelect") || document.getElementById("station"),
    walk:    document.getElementById("walkMinutesSelect") || document.getElementById("walk"),
    result:  document.getElementById("resultBox")     || document.getElementById("resultPrice"),
  };

  // ---- util ----
  const jaSort = (a, b) => String(a||"").localeCompare(String(b||""), "ja");
  const opt = (v, t = v) => { const o = document.createElement("option"); o.value = v ?? ""; o.textContent = (t ?? "").toString(); return o; };
  function resetSelect(sel, placeholder = "選択してください") { if (!sel) return; sel.innerHTML = ""; sel.appendChild(opt("", placeholder)); }
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];

  // Kanji numeral → number（簡易）
  const kanjiMap = { "〇":0,"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10,"百":100 };
  function kanjiToNumber(s) {
    if (!s) return NaN;
    // 例: 十五 → 15, 二十 → 20, 三十六 → 36
    let total = 0, num = 0, lastUnit = 1;
    for (const ch of s) {
      const v = kanjiMap[ch];
      if (v == null) { const m = ch.match(/\d/); if (m) return Number((s.match(/\d+/)||[""])[0]); return NaN; }
      if (v === 10 || v === 100) {
        num = (num || 1) * v;
        total += num; num = 0; lastUnit = v;
      } else {
        num = num * 10 + v;
      }
    }
    return total + num;
  }
  function chomeToNumber(x) {
    if (!x) return NaN;
    const s = String(x);
    const m = s.match(/\d+/);
    if (m) return Number(m[0]);
    const k = s.replace(/丁目|丁|ちょうめ|ﾁｮｲﾒ|ち目/gi,"");
    return kanjiToNumber(k);
  }

  // 安全JSON（NaN/Infinity を null へ）
  async function safeFetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    const text = await res.text();
    // 例: ... "unit_price": NaN, ... → null へ
    const sanitized = text
      .replace(/\bNaN\b/g, "null")
      .replace(/\bInfinity\b/g, "null")
      .replace(/\b-Infinity\b/g, "null");
    try {
      return JSON.parse(sanitized);
    } catch (e) {
      console.error("[safeFetchJSON] parse error:", e, { url, sample: sanitized.slice(0, 300) });
      throw e;
    }
  }

  // レコードから任意キーを優先順で取り出す
  function pick(r, keys) { for (const k of keys) { if (r[k]!=null && r[k]!=="" ) return r[k]; } return ""; }

  // 市区名（念のため複数候補）
  function recCity(r) { return pick(r, ["city","市区町村名","市区町村","市区名"]); }

  // 住所由来の町/丁目を抽出
  function extractTown(r) {
    // まず明示カラム
    const direct = pick(r, ["町名","町","町（丁目）","大字町丁目名","地区名","小字名","town"]);
    if (direct) return String(direct).trim();

    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";
    // 例: 広島県広島市中区大手町3丁目12-1 → 「大手町」
    // 市区以降にマッチさせる
    // 「◯◯町◯丁目」→ 町名
    const m1 = addr.match(/(.+?)(\d+|[一二三四五六七八九十百]+)丁目/);
    if (m1) return m1[1].replace(/.*?区|.*?市|.*?郡|.*?町|.*?村/,"").replace(/\s/g,"").replace(/[-ー－の之]/g,"").trim();
    // 「◯◯町」だけ
    const m2 = addr.replace(/\s/g,"").match(/(.*?区|.*?市|.*?郡)?(.*?町)/);
    if (m2 && m2[2]) return m2[2].trim();
    return "";
  }
  function extractChome(r) {
    const direct = pick(r, ["丁目","chome"]);
    if (direct) return String(direct).trim();
    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";
    const m = addr.match(/(\d+|[一二三四五六七八九十百]+)丁目/);
    return m ? String(m[1]) : "";
  }
  function extractStation(r) { return pick(r, ["最寄駅","最寄り駅","駅名","station","沿線駅名"]); }

  // 並び順
  function sortTowns(towns) { return towns.sort(jaSort); }
  function sortChomes(chomes) {
    return chomes.sort((a,b) => {
      const na = chomeToNumber(a); const nb = chomeToNumber(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      if (isFinite(na)) return -1;
      if (isFinite(nb)) return 1;
      return jaSort(a,b);
    });
  }

  // 状態
  let cityFiles = [];        // [{city,file,count}]
  let cityRecs = [];         // レコード全体
  let townToRecs = new Map();// 町→レコード[]
  let townList = [];         // 五十音順
  let chomeToRecs = new Map();// 丁目→レコード[]（町選択時）

  function showStatus(msg) { if (els.result) els.result.textContent = msg; }

  // 1) index.json → 市区プルダウン
  async function loadCityIndex() {
    resetSelect(els.city, "読み込み中…");
    const idx = await safeFetchJSON(INDEX_URL);
    cityFiles = (idx.files || []).map(f => ({ city: f.city || f.name, file: f.file, count: f.count ?? null }))
      .filter(x => x.city && x.file);
    resetSelect(els.city);
    for (const cf of cityFiles.sort((a,b)=>jaSort(a.city,b.city))) {
      els.city.appendChild(opt(cf.file, cf.city));
    }
  }

  // 2) 市区データ → 町/丁目/駅
  async function onCityChange() {
    resetSelect(els.town);
    resetSelect(els.chome);
    resetSelect(els.station);
    resetSelect(els.walk);
    cityRecs = []; townToRecs.clear(); chomeToRecs.clear();

    const file = els.city?.value;
    if (!file) { showStatus("市区を選択してください。"); return; }

    try {
      const recs = await safeFetchJSON(`${DATA_ROOT}${encodeURIComponent(file)}`);
      cityRecs = Array.isArray(recs) ? recs : [];
      // 町インデックス
      const towns = [];
      for (const r of cityRecs) {
        const t = extractTown(r);
        const key = t || "(不明)";
        if (!townToRecs.has(key)) townToRecs.set(key, []);
        townToRecs.get(key).push(r);
        towns.push(key);
      }
      townList = uniq(towns);
      sortTowns(townList);
      resetSelect(els.town);
      townList.forEach(t => els.town.appendChild(opt(t, t)));

      // 駅候補（市区全体）
      const stations = uniq(cityRecs.map(extractStation)).sort(jaSort);
      resetSelect(els.station);
      stations.forEach(s => els.station.appendChild(opt(s, s)));

      // 徒歩候補
      resetSelect(els.walk);
      [1,3,5,7,10,12,15,20,25,30].forEach(n => els.walk.appendChild(opt(String(n), `${n}`)));

      // 反映状況
      showFiveBuckets();

    } catch (e) {
      console.error("[onCityChange] failed:", e);
      showStatus("データの読み込みに失敗しました。");
      resetSelect(els.town, "（読み込み失敗）");
    }
  }

  // 3) 町 → 丁目
  function onTownChange() {
    resetSelect(els.chome);
    chomeToRecs.clear();
    const town = els.town?.value;
    const base = townToRecs.get(town) || [];
    const chs = [];
    for (const r of base) {
      const c = extractChome(r) || "(—)";
      if (!chomeToRecs.has(c)) chomeToRecs.set(c, []);
      chomeToRecs.get(c).push(r);
      chs.push(c);
    }
    const chList = uniq(chs);
    sortChomes(chList);
    chList.forEach(c => els.chome.appendChild(opt(c, (c === "(—)") ? "(丁目なし)" : `${c}丁目`)));
  }

  // 4) 5区分の件数（反映確認用）
  function showFiveBuckets() {
    const buckets = { trade_land:0, trade_house:0, trade_mansion:0, contract_house:0, contract_mansion:0 };
    for (const r of cityRecs) {
      const deal = String(pick(r, ["_deal_type","deal_type","種別"])).toLowerCase(); // trade|contract
      let asset = String(pick(r, ["_asset_type","asset_type","用途"])).toLowerCase(); // land|house|mansion
      if (/マンション/.test(asset)) asset = "mansion";
      if (/戸建|建物/.test(asset)) asset = "house";
      if (/土地/.test(asset)) asset = "land";
      const key = `${deal}_${asset}`;
      if (key in buckets) buckets[key]++;
    }
    const total = Object.values(buckets).reduce((a,b)=>a+b,0);
    if (els.result) {
      els.result.textContent = `データ読込：合計 ${total} 件（取引-土地:${buckets.trade_land} / 取引-土地建物:${buckets.trade_house} / 取引-ﾏﾝｼｮﾝ:${buckets.trade_mansion} / 成約-戸建:${buckets.contract_house} / 成約-ﾏﾝｼｮﾝ:${buckets.contract_mansion}）`;
    }
  }

  // 初期化
  async function boot() {
    // セレクタが一部ないページでも落ちないようにプレースホルダを整える
    ["town","chome","station","walk"].forEach(id => { if (!els[id]) return; resetSelect(els[id]); });
    try {
      await loadCityIndex();
    } catch (e) {
      console.error("[boot] index load failed:", e);
      resetSelect(els.city, "（読み込み失敗）");
    }
    // イベント
    els.city && els.city.addEventListener("change", onCityChange);
    els.town && els.town.addEventListener("change", onTownChange);
  }

  boot();
})();
