// public/app/app.js
// 広島の販売/成約データから 市区→町→丁目→駅 をUIへ反映
// 変更点：
// - JSON内の NaN/Infinity を null に変換してから parse
// - 町=五十音、丁目=数値昇順（漢数字OK）
// - 丁目キーのバリエーション拡張（所在丁目/町丁目/丁目名/住居表示丁目 等）
// - 住所からの抽出時は「選択中の町名 + ◯丁目」を最優先で抽出
// - 丁目が1つも見つからない場合でも (丁目なし) を表示し選択可能に

(() => {
  const DATA_ROOT = "/app/datasets/sales/hiroshima/";
  const INDEX_URL = `${DATA_ROOT}index.json`;

  // ---------------- DOM参照 & 自動生成 ----------------
  const els = {
    city:    document.getElementById("citySelect"),
    town:    document.getElementById("townSelect")    || document.getElementById("town"),
    chome:   document.getElementById("chomeSelect")   || document.getElementById("chome"),
    station: document.getElementById("stationSelect") || document.getElementById("station"),
    walk:    document.getElementById("walkMinutesSelect") || document.getElementById("walk"),
    result:  document.getElementById("resultBox")     || document.getElementById("resultPrice"),
  };

  // 必須の city が無ければ終了
  if (!els.city) {
    console.error("[app.js] #citySelect が見つかりません。");
    return;
  }

  // 足りないセレクトは自動生成（市区の直後に差し込む）
  function createLabeledSelect(id, labelText, afterEl) {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.cssText = "display:block;font-size:.9rem;color:#374151;margin:10px 0 6px";
    const select = document.createElement("select");
    select.id = id;
    select.style.cssText = "width:100%;padding:.6rem .7rem;border:1px solid #d1d5db;border-radius:.5rem;background:#fff;font-size:1rem";
    wrap.appendChild(label);
    wrap.appendChild(select);
    if (afterEl && afterEl.parentNode) {
      afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling);
    } else {
      document.body.appendChild(wrap);
    }
    return select;
  }
  if (!els.town)   els.town   = createLabeledSelect("townSelect",   "町名",   els.city);
  if (!els.chome)  els.chome  = createLabeledSelect("chomeSelect",  "丁目",   els.town);
  if (!els.station)els.station= createLabeledSelect("stationSelect", "駅",     els.chome);
  if (!els.walk)   els.walk   = createLabeledSelect("walkMinutesSelect", "徒歩分", els.station);

  // ---------------- 汎用 ----------------
  const opt = (v, t = v) => { const o = document.createElement("option"); o.value = v ?? ""; o.textContent = (t ?? "").toString(); return o; };
  function resetSelect(sel, placeholder = "選択してください") { sel.innerHTML = ""; sel.appendChild(opt("", placeholder)); }
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const jaSort = (a, b) => String(a||"").localeCompare(String(b||""), "ja");

  // 漢数字→数値（簡易）
  const kanjiMap = { "〇":0,"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10,"百":100 };
  function kanjiToNumber(s) {
    if (!s) return NaN;
    let total = 0, num = 0;
    for (const ch of s) {
      const v = kanjiMap[ch];
      if (v == null) { const m = s.match(/\d+/); return m ? Number(m[0]) : NaN; }
      if (v >= 10) { num = (num || 1) * v; total += num; num = 0; }
      else { num = num * 10 + v; }
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
  function sortChomes(chomes) {
    return chomes.sort((a,b) => {
      const na = chomeToNumber(a); const nb = chomeToNumber(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      if (isFinite(na)) return -1;
      if (isFinite(nb)) return 1;
      return jaSort(a,b);
    });
  }

  // JSON テキストを安全に parse（NaN/Infinity を nullへ）
  async function safeFetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    const text = await res.text();
    const sanitized = text
      .replace(/\bNaN\b/g, "null")
      .replace(/\bInfinity\b/g, "null")
      .replace(/\b-Infinity\b/g, "null");
    return JSON.parse(sanitized);
  }

  // 値の取り出し（優先キー順）
  const pick = (r, keys) => { for (const k of keys) { if (r[k] != null && r[k] !== "") return r[k]; } return ""; };

  // 町名抽出：専用カラムが最優先 → 住所から推定
  function extractTown(r) {
    const direct = pick(r, ["町名","町","町（丁目）","大字町丁目名","地区名","小字名","town"]);
    if (direct) return String(direct).trim();

    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";
    const s = String(addr).replace(/\s/g,"");
    const m1 = s.match(/(.+?)(\d+|[一二三四五六七八九十百]+)丁目/);
    if (m1) {
      // 市区部分を大まかに除去 → 残りを町として扱う
      return m1[1].replace(/^.*?(市|区|郡|町|村)/,"").replace(/[-ー－の之]/g,"");
    }
    const m2 = s.match(/(.*?市|.*?区|.*?郡)?(.*?町)/);
    if (m2 && m2[2]) return m2[2];
    return "";
  }

  // 丁目抽出（町名を考慮したパターンを最優先）
  function extractChome(r, townHint = "") {
    // 1) 丁目系のカラム候補
    const direct = pick(r, [
      "丁目","所在丁目","町丁目","丁目名","住居表示丁目","chome","丁目番号","町字丁目","地番丁目"
    ]);
    if (direct) return String(direct).trim();

    // 2) 住所から抽出
    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";

    const s = String(addr).replace(/\s/g,"");
    // 2-1) 「（町名）＋（◯丁目）」の形を最優先
    if (townHint) {
      const reTownChome = new RegExp(`${townHint}(\\d+|[一二三四五六七八九十百]+)丁目`);
      const mTown = s.match(reTownChome);
      if (mTown) return mTown[1];
    }
    // 2-2) どこかに「◯丁目」があれば拾う
    const m = s.match(/(\d+|[一二三四五六七八九十百]+)丁目/);
    if (m) return m[1];

    // 2-3) 「◯-◯-◯」等の先頭を丁目と見なすのは誤検知が多いので行わない
    return "";
  }

  const extractStation = (r) => pick(r, ["最寄駅","最寄り駅","駅名","station","沿線駅名"]);

  // ---------------- 状態 ----------------
  let cityFiles = [];        // [{city,file,count}]
  let cityRecs = [];         // 市区の全レコード
  let townToRecs = new Map();// 町→配列
  let townList = [];
  let chomeToRecs = new Map();

  function showStatus(msg) { if (els.result) els.result.textContent = msg; }

  // ---------------- ロード：市区一覧 ----------------
  async function loadCityIndex() {
    resetSelect(els.city, "読み込み中…");
    const idx = await safeFetchJSON(INDEX_URL);
    cityFiles = (idx.files || []).map(f => ({ city: f.city || f.name, file: f.file, count: f.count ?? null }))
      .filter(x => x.city && x.file);
    resetSelect(els.city);
    cityFiles.sort((a,b)=>jaSort(a.city,b.city)).forEach(cf => els.city.appendChild(opt(cf.file, cf.city)));
  }

  // ---------------- 市区→町/丁目/駅 ----------------
  async function onCityChange() {
    resetSelect(els.town);
    resetSelect(els.chome);
    resetSelect(els.station);
    resetSelect(els.walk);
    cityRecs = []; townToRecs.clear(); chomeToRecs.clear();

    const file = els.city.value;
    if (!file) { showStatus("市区を選択してください。"); return; }

    try {
      const recs = await safeFetchJSON(`${DATA_ROOT}${encodeURIComponent(file)}`);
      cityRecs = Array.isArray(recs) ? recs : [];

      // 町インデックス
      const towns = [];
      for (const r of cityRecs) {
        const t = extractTown(r) || "(不明)";
        if (!townToRecs.has(t)) townToRecs.set(t, []);
        townToRecs.get(t).push(r);
        towns.push(t);
      }
      townList = uniq(towns).sort(jaSort);
      townList.forEach(t => els.town.appendChild(opt(t, t)));

      // 駅候補（市区全体）
      const stations = uniq(cityRecs.map(extractStation)).sort(jaSort);
      stations.forEach(s => els.station.appendChild(opt(s, s)));

      // 徒歩候補
      [1,3,5,7,10,12,15,20,25,30].forEach(n => els.walk.appendChild(opt(String(n), `${n}`)));

      showStatus(`市区データ：${cityRecs.length}件／町候補：${townList.length}件`);
    } catch (e) {
      console.error("[onCityChange] failed:", e);
      showStatus("データの読み込みに失敗しました。");
      resetSelect(els.town, "（読み込み失敗）");
    }
  }

  // ---------------- 町→丁目 ----------------
  function onTownChange() {
    resetSelect(els.chome);
    chomeToRecs.clear();

    const town = els.town.value;
    const base = townToRecs.get(town) || [];

    const chListRaw = [];
    for (const r of base) {
      const c = extractChome(r, town) || ""; // 町名ヒントを渡して抽出
      chListRaw.push(c || "(—)");
      const key = c || "(—)";
      if (!chomeToRecs.has(key)) chomeToRecs.set(key, []);
      chomeToRecs.get(key).push(r);
    }

    let chList = uniq(chListRaw);
    // すべて "(—)" しか無い＝丁目情報が実質無い
    const onlyNoChome = (chList.length === 1 && chList[0] === "(—)");

    if (onlyNoChome) {
      // 丁目なしの環境でも選べるように固定表示
      els.chome.appendChild(opt("(—)", "(丁目なし)"));
      els.chome.disabled = false; // 選択可能のままにする
    } else {
      // 丁目がある → 数値昇順＋表示テキスト「◯丁目」
      chList = chList.filter(x => x !== "(—)");
      sortChomes(chList).forEach(c => els.chome.appendChild(opt(c, `${c}丁目`)));
      els.chome.appendChild(opt("(—)", "(丁目なし)")); // 任意で最後に追加
      els.chome.disabled = false;
    }
  }

  // ---------------- 初期化 ----------------
  async function boot() {
    resetSelect(els.town);
    resetSelect(els.chome);
    resetSelect(els.station);
    resetSelect(els.walk);

    try { await loadCityIndex(); }
    catch (e) {
      console.error("[boot] index load failed:", e);
      resetSelect(els.city, "（読み込み失敗）");
    }

    els.city.addEventListener("change", onCityChange);
    els.town.addEventListener("change", onTownChange);
  }

  boot();
})();
