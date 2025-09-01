// public/app/app.js
// 実在データで UI を構成：
//  - 住所:  /app/datasets/address/hiroshima/  … index.json, 34101.json など（JISコード）
//  - 鉄道:  /app/datasets/rail/hiroshima/     … index.json, jr-*.json, hiroden-*.json 等
// 備考:
//  - 成約/取引データは裏側の査定で参照（UIの候補は実在データのみで生成）
//  - HTMLに town/chome/line/station が無くても自動で生成します

(() => {
  const ADDR_ROOT = "/app/datasets/address/hiroshima/";
  const RAIL_ROOT = "/app/datasets/rail/hiroshima/";

  // ---------- DOM ----------
  const els = {
    city:    document.getElementById("citySelect"),
    town:    document.getElementById("townSelect")    || document.getElementById("town"),
    chome:   document.getElementById("chomeSelect")   || document.getElementById("chome"),
    line:    document.getElementById("lineSelect")    || document.getElementById("line"),
    station: document.getElementById("stationSelect") || document.getElementById("station"),
    walk:    document.getElementById("walkMinutesSelect") || document.getElementById("walk"),
    notes:   document.getElementById("notes") || null,
  };

  if (!els.city) { console.error("[app.js] #citySelect がありません"); return; }

  // 足りないセレクトは自動生成（市区の直後に差し込む）
  function createLabeledSelect(id, labelText, afterEl) {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.cssText = "display:block;font-size:.9rem;color:#374151;margin:10px 0 6px";
    const select = document.createElement("select");
    select.id = id;
    select.style.cssText = "width:100%;padding:.6rem .7rem;border:1px solid #d1d5db;border-radius:.5rem;background:#fff;font-size:1rem";
    wrap.appendChild(label); wrap.appendChild(select);
    if (afterEl && afterEl.parentNode) afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling);
    else document.body.appendChild(wrap);
    return select;
  }
  // 「その他の丁目」手入力
  function createInlineInput(id, placeholder, afterEl) {
    const box = document.createElement("div");
    box.style.cssText = "margin-top:6px";
    const input = document.createElement("input");
    input.type = "number"; input.min = "1"; input.step = "1";
    input.id = id; input.placeholder = placeholder;
    input.style.cssText = "width:100%;padding:.6rem .7rem;border:1px solid #d1d5db;border-radius:.5rem;background:#fff;font-size:1rem";
    box.appendChild(input);
    if (afterEl && afterEl.parentNode) afterEl.parentNode.insertBefore(box, afterEl.nextSibling);
    else document.body.appendChild(box);
    return { box, input };
  }

  if (!els.town)    els.town    = createLabeledSelect("townSelect",    "町名",    els.city);
  if (!els.chome)   els.chome   = createLabeledSelect("chomeSelect",   "丁目",    els.town);
  if (!els.line)    els.line    = createLabeledSelect("lineSelect",    "沿線",    els.chome);
  if (!els.station) els.station = createLabeledSelect("stationSelect", "駅",      els.line);
  if (!els.walk)    els.walk    = createLabeledSelect("walkMinutesSelect", "徒歩分", els.station);

  const otherChomeUI = createInlineInput("chomeOtherInput", "（数値で入力：例 4）", els.chome);
  otherChomeUI.box.style.display = "none";

  // ---------- utils ----------
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

  // JSONテキストを安全にparse（NaN/Infinity → null）
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

  // 値取り出し（候補キー）
  const pick = (r, keys) => { for (const k of keys) { if (r[k] != null && r[k] !== "") return r[k]; } return ""; };

  // ---------- 住所データ（実在） ----------
  // 住所 index.json は { files: [{ code:"34101", name:"広島市中区", file:"34101.json" }, ...] } を想定
  let addrIndex = [];
  let addrCityRecs = [];       // 選択中の市区の住所レコード
  // city rec から 町/丁目を取り出す（実在データ用）
  function townFromAddr(r) {
    return pick(r, ["town","町名","大字名","町字名","地域名","行政町名","地区名"]);
  }
  function chomeFromAddr(r) {
    const direct = pick(r, ["chome","丁目","住居表示丁目","町丁目","所在丁目","字丁目","丁目名"]);
    if (direct) return String(direct);
    const addr = pick(r, ["address","所在地","住所"]);
    if (!addr) return "";
    const s = String(addr).replace(/\s/g,"");
    const m = s.match(/(\d+|[一二三四五六七八九十百]+)丁目/);
    return m ? m[1] : "";
  }

  async function loadAddrIndex() {
    const idx = await safeFetchJSON(`${ADDR_ROOT}index.json`);
    addrIndex = (idx.files || [])
      .map(f => ({ code: f.code || f.jis || f.file?.replace(".json",""), name: f.name || f.city, file: f.file }))
      .filter(x => x.name && x.file);
    // 市区は五十音
    resetSelect(els.city);
    addrIndex.sort((a,b)=>jaSort(a.name,b.name)).forEach(c => els.city.appendChild(opt(c.file, c.name)));
  }

  async function onCityChange() {
    resetSelect(els.town);
    resetSelect(els.chome);
    otherChomeUI.box.style.display = "none";

    const file = els.city.value;
    if (!file) return;

    // 市区の住所データをロード
    const recs = await safeFetchJSON(`${ADDR_ROOT}${encodeURIComponent(file)}`);
    addrCityRecs = Array.isArray(recs) ? recs : (recs.records || []);

    // 町名一覧（実在）
    const towns = uniq(addrCityRecs.map(townFromAddr).filter(Boolean)).sort(jaSort);
    towns.forEach(t => els.town.appendChild(opt(t, t)));

    // 丁目は町選択後に生成
  }

  function onTownChange() {
    resetSelect(els.chome);
    otherChomeUI.box.style.display = "none";

    const town = els.town.value;
    if (!town) return;

    const base = addrCityRecs.filter(r => (townFromAddr(r) || "") === town);

    // 実在の丁目（数値昇順）
    let chs = uniq(base.map(chomeFromAddr).filter(Boolean));
    if (chs.length) {
      chs = sortChomes(chs);
      chs.forEach(c => els.chome.appendChild(opt(c, `${c}丁目`)));
      els.chome.appendChild(opt("_other_", "その他の丁目…")); // 欠番補完
    } else {
      // 丁目という概念が無い町：固定表示
      els.chome.appendChild(opt("(—)", "(丁目なし)"));
    }
  }

  // 「その他の丁目…」を選んだら数値入力を出す
  function onChomeChange() {
    const val = els.chome.value;
    const show = (val === "_other_");
    otherChomeUI.box.style.display = show ? "block" : "none";
  }

  // ---------- 鉄道データ（実在） ----------
  // rail/index.json は { files: [{ line:"広電本線", file:"hiroden-honsen.json" }, ...] } を想定
  let railIndex = [];
  function stationNameFrom(r) {
    return pick(r, ["name","駅名","station","stop","停留場"]);
  }
  function stationsArrayFrom(json) {
    // 可能性: { line:"", stations:[{name:""}, …] } / あるいは配列そのもの
    if (Array.isArray(json)) return json;
    if (json.stations) return json.stations;
    if (json.data) return json.data;
    return [];
  }

  async function loadRailIndex() {
    const idx = await safeFetchJSON(`${RAIL_ROOT}index.json`);
    railIndex = (idx.files || [])
      .map(f => ({ line: f.line || f.name, file: f.file }))
      .filter(x => x.line && x.file);

    // 沿線プルダウン
    resetSelect(els.line, "選択してください");
    railIndex.sort((a,b)=>jaSort(a.line,b.line)).forEach(l => els.line.appendChild(opt(l.file, l.line)));

    // 徒歩候補
    resetSelect(els.walk, "未選択");
    [1,3,5,7,10,12,15,20,25,30].forEach(n => els.walk.appendChild(opt(String(n), String(n))));
  }

  async function onLineChange() {
    resetSelect(els.station);
    const file = els.line.value;
    if (!file) return;
    const json = await safeFetchJSON(`${RAIL_ROOT}${encodeURIComponent(file)}`);
    const stations = stationsArrayFrom(json)
      .map(stationNameFrom)
      .filter(Boolean);
    uniq(stations).sort(jaSort).forEach(s => els.station.appendChild(opt(s, s)));
  }

  // ---------- 初期化 ----------
  async function boot() {
    resetSelect(els.city, "読み込み中…");
    resetSelect(els.town);
    resetSelect(els.chome);
    resetSelect(els.line, "読み込み中…");
    resetSelect(els.station);
    resetSelect(els.walk);

    await Promise.all([loadAddrIndex(), loadRailIndex()]);

    els.city.addEventListener("change", onCityChange);
    els.town.addEventListener("change", onTownChange);
    els.chome.addEventListener("change", onChomeChange);
    els.line.addEventListener("change", onLineChange);
  }

  boot();
})();
