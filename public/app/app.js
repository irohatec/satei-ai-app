// public/app/app.js
// 目的：広島の成約/取引データから、市区→町→丁目→駅 をUIに反映
// 改善点：
//  - JSON中の NaN/Infinity を null へ置換してから parse（ブラウザJSON互換）
//  - 町は五十音順、丁目は数値昇順（漢数字も対応）
//  - 町/丁目/駅のセレクトがHTMLに無い場合は「自動生成して差し込む」

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

  // 参考：フォームに class が無くても見た目が崩れないよう最低限のスタイルを当てる
  function createLabeledSelect(id, labelText) {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.cssText = "display:block;font-size:.9rem;color:#374151;margin-bottom:6px";
    const select = document.createElement("select");
    select.id = id;
    select.style.cssText = "width:100%;padding:.6rem .7rem;border:1px solid #d1d5db;border-radius:.5rem;background:#fff;font-size:1rem";
    wrap.appendChild(label);
    wrap.appendChild(select);
    return { wrap, select };
  }
  function insertAfter(ref, node) {
    if (!ref || !ref.parentNode) { document.body.appendChild(node); return; }
    if (ref.nextSibling) ref.parentNode.insertBefore(node, ref.nextSibling);
    else ref.parentNode.appendChild(node);
  }
  function ensureSelectEl(currentEl, id, label, insertAfterEl) {
    if (currentEl && currentEl.tagName === "SELECT") return currentEl;
    const { wrap, select } = createLabeledSelect(id, label);
    insertAfter(insertAfterEl || els.city, wrap);
    return select;
  }

  // citySelect は必須
  if (!els.city) {
    console.error("[app.js] #citySelect が見つかりません。index.html に <select id=\"citySelect\"> を用意してください。");
    return;
  }
  // town/chome/station/walk が無ければ自動生成（市区セレクトの直後に差し込み）
  els.town   = ensureSelectEl(els.town,   "townSelect",   "町名", els.city);
  els.chome  = ensureSelectEl(els.chome,  "chomeSelect",  "丁目", els.town);
  els.station= ensureSelectEl(els.station,"stationSelect","駅",   els.chome);
  els.walk   = ensureSelectEl(els.walk,   "walkMinutesSelect","徒歩分", els.station);

  // ---------------- 汎用 ----------------
  const opt = (v, t = v) => { const o = document.createElement("option"); o.value = v ?? ""; o.textContent = (t ?? "").toString(); return o; };
  function resetSelect(sel, placeholder = "選択してください") { sel.innerHTML = ""; sel.appendChild(opt("", placeholder)); }
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const jaSort = (a, b) => String(a||"").localeCompare(String(b||""), "ja");

  // Kanji numeral → number（簡易）
  const kanjiMap = { "〇":0,"零":0,"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10,"百":100 };
  function kanjiToNumber(s) {
    if (!s) return NaN;
    let total = 0, num = 0;
    for (const ch of s) {
      const v = kanjiMap[ch];
      if (v == null) { const m = ch.match(/\d/); if (m) return Number((s.match(/\d+/)||[""])[0]); return NaN; }
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

  // フィールド抽出（候補キーの優先順）
  const pick = (r, keys) => { for (const k of keys) { if (r[k] != null && r[k] !== "") return r[k]; } return ""; };

  // 町名抽出（優先：専用カラム → 所在地から推定）
  function extractTown(r) {
    const direct = pick(r, ["町名","町","町（丁目）","大字町丁目名","地区名","小字名","town"]);
    if (direct) return String(direct).trim();

    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";

    const trimmed = String(addr).replace(/\s/g,"");
    // 「◯◯町◯丁目」
    const m1 = trimmed.match(/(.+?)(\d+|[一二三四五六七八九十百]+)丁目/);
    if (m1) {
      // 市区部分をおおまかに除去
      const afterCity = m1[1].replace(/^.*?(市|区|郡|町|村)/, "");
      return afterCity.replace(/[-ー－の之]/g,"");
    }
    // 「◯◯町」だけ
    const m2 = trimmed.match(/(.*?市|.*?区|.*?郡)?(.*?町)/);
    if (m2 && m2[2]) return m2[2];
    return "";
  }

  // 丁目抽出
  function extractChome(r) {
    const direct = pick(r, ["丁目","chome"]);
    if (direct) return String(direct).trim();
    const addr = pick(r, ["所在地","住所","所在","address"]);
    if (!addr) return "";
    const m = String(addr).match(/(\d+|[一二三四五六七八九十百]+)丁目/);
    return m ? String(m[1]) : "";
  }

  // 駅
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
    // 市区は五十音で
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

      // 反映状況：件数だけ出しておく（デバッグ用）
      showStatus(`市区データ：${cityRecs.length}件 / 町候補：${townList.length}件`);

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
    const chs = [];
    for (const r of base) {
      const c = extractChome(r) || "(—)";
      if (!chomeToRecs.has(c)) chomeToRecs.set(c, []);
      chomeToRecs.get(c).push(r);
      chs.push(c);
    }
    const list = uniq(chs);
    sortChomes(list).forEach(c => els.chome.appendChild(opt(c, c === "(—)" ? "(丁目なし)" : `${c}丁目`)));
  }

  // ---------------- 初期化 ----------------
  async function boot() {
    // 初期のプレースホルダ
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
