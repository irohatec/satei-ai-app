// public/app/js/builtyear-input.js
// 「築年」入力用 Web Component（和暦/西暦切替、築年数自動計算、1981/2000境界の注意表示）
// 使い方: <builtyear-input id="built" required></builtyear-input>
// 値の取得: el.valueYear  // 西暦（Number or null）
//           el.valueAge   // 築年数（Number or null）
// 変更イベント: el.addEventListener('builtyear-change', e => console.log(e.detail))
//               // e.detail = { year, era, eraYear, mode, age, flags: { pre1981, y1981to1999, post2000 }, valid }

class BuiltYearInput extends HTMLElement {
  // 端数は年単位で扱う（簡易査定用）
  static NOW_YEAR = new Date().getFullYear(); // 例: 2025
  static MIN_YEAR = 1960;
  static MAX_YEAR = BuiltYearInput.NOW_YEAR;

  // 和暦定義（年の基点）
  static ERA = {
    R: { key: "R", jp: "令和", start: 2019 }, // 令和1=2019
    H: { key: "H", jp: "平成", start: 1989 }, // 平成1=1989
    S: { key: "S", jp: "昭和", start: 1926 }, // 昭和1=1926
    // 必要なら大正・明治も追加可
  };

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { display:block; font-family: ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue","Hiragino Kaku Gothic ProN","BIZ UDPGothic","Noto Sans JP"; }
        .field { display:grid; gap:.5rem; }
        .label { font-size:.9rem; color:#374151; }
        .req { color:#ef4444; margin-left:.25rem; }
        .row { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
        select, input[type="number"] { padding:.55rem .6rem; border:1px solid #d1d5db; border-radius:.5rem; background:white; font-size:1rem; }
        .seg { background:#f3f4f6; border:1px solid #e5e7eb; border-radius:.5rem; display:inline-flex; overflow:hidden }
        .seg button { padding:.45rem .7rem; border:0; background:transparent; cursor:pointer; font-size:.95rem; }
        .seg button.active { background:#fff; }
        .badges { display:flex; gap:.5rem; flex-wrap:wrap; }
        .badge { background:#f3f4f6; border:1px solid #e5e7eb; border-radius:.375rem; padding:.15rem .45rem; font-size:.85rem; color:#374151; }
        .warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .ok { background:#ecfeff; border-color:#a5f3fc; color:#075985; }
        .error { font-size:.85rem; color:#b91c1c; display:none; }
        .error.show { display:block; }
      </style>
      <div class="field">
        <label class="label">
          <span class="text"></span>
          <span class="req" hidden>（必須）</span>
        </label>

        <div class="seg" role="tablist" aria-label="入力方式">
          <button id="mode_west" class="active" role="tab" aria-selected="true">西暦</button>
          <button id="mode_era" role="tab" aria-selected="false">和暦</button>
        </div>

        <!-- 西暦入力 -->
        <div id="westRow" class="row">
          <select id="westYear" aria-label="建築年（西暦）"></select>
        </div>

        <!-- 和暦入力 -->
        <div id="eraRow" class="row" style="display:none">
          <select id="era" aria-label="元号">
            <option value="R">令和</option>
            <option value="H">平成</option>
            <option value="S">昭和</option>
          </select>
          <input id="eraYear" type="number" inputmode="numeric" min="1" step="1" placeholder="年（例：12）">
          <span aria-hidden="true">年</span>
        </div>

        <div class="badges">
          <span id="ageBadge" class="badge">築 - 年</span>
          <span id="guideBadge" class="badge">基準: 1981/2000</span>
          <span id="flagBadge" class="badge ok">2000年基準以降の可能性</span>
        </div>

        <div id="error" class="error">入力値が範囲外です。${BuiltYearInput.MIN_YEAR}〜${BuiltYearInput.MAX_YEAR}年で選択してください。</div>
      </div>
    `;

    this.$ = {
      text: shadow.querySelector(".text"),
      req: shadow.querySelector(".req"),
      modeWest: shadow.getElementById("mode_west"),
      modeEra: shadow.getElementById("mode_era"),
      westRow: shadow.getElementById("westRow"),
      westYear: shadow.getElementById("westYear"),
      eraRow: shadow.getElementById("eraRow"),
      era: shadow.getElementById("era"),
      eraYear: shadow.getElementById("eraYear"),
      ageBadge: shadow.getElementById("ageBadge"),
      flagBadge: shadow.getElementById("flagBadge"),
      error: shadow.getElementById("error"),
    };

    // ラベル
    this.$.text.textContent = this.getAttribute("label") || "築年";
    if (this.hasAttribute("required")) this.$.req.hidden = false;

    // 西暦プルダウンの組み立て（最新→古い順）
    for (let y = BuiltYearInput.MAX_YEAR; y >= BuiltYearInput.MIN_YEAR; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = `${y}年（築${BuiltYearInput.NOW_YEAR - y}年）`;
      this.$.westYear.appendChild(opt);
    }

    // 初期値（属性）
    const initYearAttr = this.getAttribute("year");
    if (initYearAttr) this.$.westYear.value = initYearAttr;

    // モード切替
    this.$.modeWest.addEventListener("click", () => this._setMode("west"));
    this.$.modeEra.addEventListener("click", () => this._setMode("era"));

    // 入力変更
    this.$.westYear.addEventListener("change", () => this._onChange());
    this.$.era.addEventListener("change", () => this._onChange());
    this.$.eraYear.addEventListener("input", () => this._onChange());

    // 初回描画
    this._setMode(this.getAttribute("mode") === "era" ? "era" : "west", true);
    this._onChange(true);
  }

  // 公開値
  get valueYear() {
    const y = this._currentYear();
    return Number.isFinite(y) ? y : null;
  }
  get valueAge() {
    const y = this.valueYear;
    return y ? (BuiltYearInput.NOW_YEAR - y) : null;
  }
  get valid() {
    const y = this.valueYear;
    if (y == null) return !this.hasAttribute("required");
    return y >= BuiltYearInput.MIN_YEAR && y <= BuiltYearInput.MAX_YEAR;
  }

  // 内部：モード
  _setMode(mode, initial=false) {
    const isEra = mode === "era";
    this.$.modeWest.classList.toggle("active", !isEra);
    this.$.modeWest.setAttribute("aria-selected", String(!isEra));
    this.$.modeEra.classList.toggle("active", isEra);
    this.$.modeEra.setAttribute("aria-selected", String(isEra));

    this.$.westRow.style.display = isEra ? "none" : "flex";
    this.$.eraRow.style.display = isEra ? "flex" : "none";
    this._onChange(initial);
  }

  // 内部：現在の西暦
  _currentYear() {
    // west
    if (this.$.westRow.style.display !== "none") {
      const v = parseInt(this.$.westYear.value, 10);
      return Number.isFinite(v) ? v : NaN;
    }
    // era
    const era = this.$.era.value;
    const eYear = parseInt(this.$.eraYear.value, 10);
    const def = BuiltYearInput.ERA[era];
    if (!def || !Number.isFinite(eYear) || eYear < 1) return NaN;
    const y = def.start + (eYear - 1);
    return y;
  }

  _flags(year) {
    return {
      pre1981: year < 1981,
      y1981to1999: year >= 1981 && year <= 1999,
      post2000: year >= 2000,
    };
  }

  _onChange(initial=false) {
    const year = this._currentYear();
    const validRange = Number.isFinite(year) &&
      year >= BuiltYearInput.MIN_YEAR && year <= BuiltYearInput.MAX_YEAR;

    // 築年数表示
    if (Number.isFinite(year)) {
      const age = BuiltYearInput.NOW_YEAR - year;
      this.$.ageBadge.textContent = `築 ${age} 年（${year}年築）`;
    } else {
      this.$.ageBadge.textContent = `築 - 年`;
    }

    // 注意表示（色替え）
    let label = "2000年基準以降の可能性";
    let cls = "ok";
    if (Number.isFinite(year)) {
      const f = this._flags(year);
      if (f.pre1981)      { label = "1981年基準“以前”の可能性"; cls = "warn"; }
      else if (f.y1981to1999) { label = "1981〜1999年（新耐震〜2000改正前）"; cls = "warn"; }
      else                { label = "2000年基準以降の可能性"; cls = "ok"; }
    }
    this.$.flagBadge.textContent = label;
    this.$.flagBadge.className = `badge ${cls}`;

    // エラー
    this.$.error.classList.toggle("show", !validRange && (this.hasAttribute("required") || this._hasSomeInput()));

    // イベント発火
    const detail = {
      mode: (this.$.westRow.style.display === "none") ? "era" : "west",
      year: Number.isFinite(year) ? year : null,
      age: Number.isFinite(year) ? (BuiltYearInput.NOW_YEAR - year) : null,
      era: this.$.era.value || null,
      eraYear: this.$.eraYear.value ? parseInt(this.$.eraYear.value, 10) : null,
      flags: Number.isFinite(year) ? this._flags(year) : { pre1981:false, y1981to1999:false, post2000:false },
      valid: validRange || (!this.hasAttribute("required") && !this._hasSomeInput()),
    };
    if (!initial || this.hasAttribute("emit-initial")) {
      this.dispatchEvent(new CustomEvent("builtyear-change", { detail }));
    }
  }

  _hasSomeInput() {
    // 何か入力されているか（requiredでない場合の挙動に利用）
    if (this.$.westRow.style.display !== "none") {
      return !!this.$.westYear.value;
    }
    return !!this.$.eraYear.value;
  }
}

customElements.define("builtyear-input", BuiltYearInput);
