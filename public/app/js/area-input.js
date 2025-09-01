<script>
// public/app/js/area-input.js
// 面積入力 Web Component（㎡/坪 切替、範囲チェック、小数OK、ヘルプ表示）
// 使い方: <area-input id="area" label="専有面積" required></area-input>
// 値の取得: document.getElementById('area').valueSqm  // 常に㎡で取得
// 変更イベント: element.addEventListener('area-change', e => console.log(e.detail))  // { sqm, unit, raw }

class AreaInput extends HTMLElement {
  static TUBO_TO_SQM = 3.305785;      // 1坪=3.305785㎡
  static MIN_SQM = 10;                // 入力許容最小(㎡)
  static MAX_SQM = 1000;              // 入力許容最大(㎡)

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { display:block; font-family: ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue","Hiragino Kaku Gothic ProN","BIZ UDPGothic","Noto Sans JP",Arial,"Apple Color Emoji","Segoe UI Emoji"; }
        .field { display:grid; gap:.5rem; }
        .row { display:flex; gap:.5rem; align-items:center; }
        .label { font-size:.9rem; color:#374151; }
        .req { color:#ef4444; margin-left:.25rem; }
        input[type="number"] { flex:1; padding:.6rem .7rem; border:1px solid #d1d5db; border-radius:.5rem; font-size:1rem; }
        select { padding:.55rem .6rem; border:1px solid #d1d5db; border-radius:.5rem; background:white; }
        .help { font-size:.8rem; color:#6b7280; }
        .meta { font-size:.85rem; color:#374151; display:flex; gap:1rem; flex-wrap:wrap; }
        .error { font-size:.85rem; color:#b91c1c; display:none; }
        .error.show { display:block; }
        .badge { background:#f3f4f6; border:1px solid #e5e7eb; border-radius:.375rem; padding:.15rem .4rem; }
        .unit { min-width:5.5rem; }
      </style>
      <div class="field">
        <label class="label">
          <span class="text"></span>
          <span class="req" part="required" hidden>（必須）</span>
        </label>
        <div class="row">
          <input id="val" type="number" inputmode="decimal" step="0.01" placeholder="例）65.3">
          <select id="unit" class="unit" aria-label="単位">
            <option value="sqm">㎡（平方メートル）</option>
            <option value="tsubo">坪</option>
          </select>
        </div>
        <div class="meta">
          <span id="converted" class="badge">≈ 0 坪</span>
          <span id="range" class="badge">許容範囲: ${AreaInput.MIN_SQM}〜${AreaInput.MAX_SQM} ㎡</span>
        </div>
        <div id="error" class="error">入力値が範囲外です。${AreaInput.MIN_SQM}〜${AreaInput.MAX_SQM}㎡の間で入力してください。</div>
        <div class="help">※ 登記簿・パンフレット等に記載の<span id="helpWord">専有面積</span>を入力してください。小数もOKです。</div>
      </div>
    `;

    this.$ = {
      val: shadow.getElementById("val"),
      unit: shadow.getElementById("unit"),
      converted: shadow.getElementById("converted"),
      error: shadow.getElementById("error"),
      text: shadow.querySelector(".text"),
      req: shadow.querySelector(".req"),
      helpWord: shadow.getElementById("helpWord"),
    };

    // 初期ラベル
    this.$.text.textContent = this.getAttribute("label") || "面積";
    if (this.hasAttribute("required")) this.$.req.hidden = false;
    if (this.hasAttribute("help-word")) this.$.helpWord.textContent = this.getAttribute("help-word");

    // 初期値
    const defaultUnit = (this.getAttribute("unit") || "sqm").toLowerCase();
    if (defaultUnit === "tsubo") this.$.unit.value = "tsubo";
    const init = this.getAttribute("value");
    if (init) this.$.val.value = init;

    // イベント
    this.$.val.addEventListener("input", () => this._onChange());
    this.$.unit.addEventListener("change", () => this._onChange());

    // 初回描画
    this._onChange(true);
  }

  // 公開プロパティ: 現在の㎡換算値（Number or null）
  get valueSqm() {
    const { sqm } = this._calc();
    return isFinite(sqm) ? sqm : null;
  }
  // 公開プロパティ: 現在の単位
  get unit() { return this.$.unit.value; }

  // バリデーション
  get valid() {
    const sqm = this.valueSqm;
    if (sqm == null) return !this.hasAttribute("required"); // 未入力 OK（必須でなければ）
    return sqm >= AreaInput.MIN_SQM && sqm <= AreaInput.MAX_SQM;
  }

  // 内部計算
  _calc() {
    const raw = parseFloat(this.$.val.value);
    const unit = this.$.unit.value;
    if (!isFinite(raw)) return { sqm: NaN, tsubo: NaN, unit, raw: null };

    if (unit === "sqm") {
      const sqm = raw;
      const tsubo = raw / AreaInput.TUBO_TO_SQM;
      return { sqm, tsubo, unit, raw };
    } else {
      const tsubo = raw;
      const sqm = raw * AreaInput.TUBO_TO_SQM;
      return { sqm, tsubo, unit, raw };
    }
  }

  // 表示更新 & イベント発火
  _onChange(initial=false) {
    const { sqm, tsubo } = this._calc();

    // 変換表示（小数2桁）
    if (this.$.unit.value === "sqm") {
      this.$.converted.textContent = isFinite(tsubo) ? `≈ ${tsubo.toFixed(2)} 坪` : "≈ 0 坪";
    } else {
      this.$.converted.textContent = isFinite(sqm) ? `≈ ${sqm.toFixed(2)} ㎡` : "≈ 0 ㎡";
    }

    // 範囲チェック
    const showErr = isFinite(sqm) && (sqm < AreaInput.MIN_SQM || sqm > AreaInput.MAX_SQM);
    this.$.error.classList.toggle("show", showErr);

    // 変更イベント（初期描画でも発火させたい場合は initial=true で通す）
    const detail = {
      sqm: isFinite(sqm) ? Number(sqm.toFixed(2)) : null,
      unit: this.$.unit.value,
      raw: this.$.val.value === "" ? null : Number(parseFloat(this.$.val.value).toFixed(2)),
      valid: !showErr && (this.$.val.value !== "" || !this.hasAttribute("required")),
    };
    if (!initial || this.hasAttribute("emit-initial")) {
      this.dispatchEvent(new CustomEvent("area-change", { detail }));
    }
  }
}

customElements.define("area-input", AreaInput);
</script>
