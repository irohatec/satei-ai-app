// public/app/js/estimate-form-logic.js
// 目的：ハイブリッド必須ルールで「査定する」ボタンの活性制御＋送信ペイロード生成
// 前提：以下のID/要素がフォーム内に存在すること（必要に応じて書き換えてOK）
//
// 必須グループA（全部そろったらボタン有効）
// - 市区町村      : #citySelect          （例：<select id="citySelect">）
// - 丁目          : #chomeInput          （例：<input id="chomeInput">）
// - 種目          : #propertyTypeSelect  （"mansion" | "land" | "house"）
// - 面積          : <area-input id="area">（前に導入したWebComponent）
// - 築年          : <builtyear-input id="builtYear">
// - メールアドレス: #emailInput
// - 送信ボタン    : #estimateSubmitBtn
//
// 任意/準必須（マンション時のみ強く促すがブロックしない）
// - 沿線          : #lineSelect
// - 駅            : #stationSelect
// - 徒歩分        : #walkMinutesSelect
//
// 備考：IDが異なる場合は、下の SELECTORS を書き換えてください。

(function () {
  const SELECTORS = {
    city:        '#citySelect',
    chome:       '#chomeInput',
    type:        '#propertyTypeSelect',
    email:       '#emailInput',
    area:        '#area',            // <area-input>
    built:       '#builtYear',       // <builtyear-input>
    line:        '#lineSelect',
    station:     '#stationSelect',
    walk:        '#walkMinutesSelect',
    submit:      '#estimateSubmitBtn',
    toastHost:   '#toastHost'        // 任意：トースト表示のコンテナ（なければbodyに出す）
  };

  // ---- ユーティリティ ----
  const $ = (sel) => document.querySelector(sel);
  const getVal = (sel) => {
    const el = $(sel);
    if (!el) return null;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value.trim();
    return el.value ?? null;
  };
  const isEmail = (s) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  // トースト（軽量）
  function showToast(message, type = 'info') {
    const host = $(SELECTORS.toastHost) || document.body;
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    Object.assign(toast.style, {
      position: host === document.body ? 'fixed' : 'absolute',
      right: '16px',
      bottom: '16px',
      background: type === 'warn' ? '#fff7ed' : '#111827',
      color: type === 'warn' ? '#9a3412' : 'white',
      border: '1px solid ' + (type === 'warn' ? '#fed7aa' : '#374151'),
      borderRadius: '10px',
      padding: '10px 14px',
      boxShadow: '0 6px 20px rgba(0,0,0,.12)',
      zIndex: 2147483647,
      maxWidth: '92vw',
      fontSize: '14px',
    });
    host.appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
  }

  // ---- 要素参照 ----
  const els = {
    city:    $(SELECTORS.city),
    chome:   $(SELECTORS.chome),
    type:    $(SELECTORS.type),
    email:   $(SELECTORS.email),
    area:    $(SELECTORS.area),
    built:   $(SELECTORS.built),
    line:    $(SELECTORS.line),
    station: $(SELECTORS.station),
    walk:    $(SELECTORS.walk),
    submit:  $(SELECTORS.submit),
  };

  // 必須が揃ったか
  function isAllRequiredOK() {
    const city = getVal(SELECTORS.city);
    const chome = getVal(SELECTORS.chome);
    const type = getVal(SELECTORS.type);
    const email = getVal(SELECTORS.email);
    // area / built はWebComponentのプロパティを参照
    const areaOk = els.area && typeof els.area.valid === 'boolean' ? els.area.valid : false;
    const builtOk = els.built && typeof els.built.valid === 'boolean' ? els.built.valid : false;
    return !!city && !!chome && !!type && areaOk && builtOk && isEmail(email);
  }

  function needsStationForMansion() {
    const type = getVal(SELECTORS.type);
    if (type !== 'mansion') return false;
    const line = getVal(SELECTORS.line);
    const station = getVal(SELECTORS.station);
    const walk = getVal(SELECTORS.walk);
    return !(line && station && walk);
  }

  // 送信ペイロード（メール用テンプレ情報もここで組み立て）
  function buildPayload() {
    const type = getVal(SELECTORS.type);
    const city = getVal(SELECTORS.city);
    const chome = getVal(SELECTORS.chome);

    const payload = {
      property: {
        type,                                 // "mansion" | "land" | "house"
        area_sqm: els.area?.valueSqm ?? null, // 常に㎡
        built_year: els.built?.valueYear ?? null,
        built_age:  els.built?.valueAge ?? null,
      },
      location: {
        prefecture: '広島県',                  // 画面で選んでいるなら差し替え
        city,
        chome,
        line: getVal(SELECTORS.line),
        station: getVal(SELECTORS.station),
        walk_min: getVal(SELECTORS.walk) ? Number(getVal(SELECTORS.walk)) : null,
      },
      contact: {
        email: getVal(SELECTORS.email),
      },
      flags: {
        station_missing: needsStationForMansion(), // マンション＆駅情報欠落
      }
    };
    return payload;
  }

  // メール件名＆本文テンプレ（サーバーORフロントで使用可）
  function buildMailTemplate(payload, estimateResult /* 任意: {price, low, high} */) {
    const { property, location, flags } = payload;
    const subject = `【仮査定】${location.city || ''}${location.chome || ''}／${labelType(property.type)}／${fmtNum(property.area_sqm)}㎡・築${property.built_age ?? '-'}年`;

    const stationNote = flags.station_missing
      ? '\n※ 駅情報（沿線・駅・徒歩分）が未入力のため、推定レンジが広めです。ご入力いただければ±幅を縮小し、近隣の成約事例を添えて再送します。'
      : '';

    const estimateBlock = estimateResult
      ? `\n仮査定額：${fmtPrice(estimateResult.price)}（レンジ：${fmtPrice(estimateResult.low)}〜${fmtPrice(estimateResult.high)}）`
      : `\n仮査定額：算出中（入力内容を確認後にご連絡します）`;

    const body =
`以下の条件で仮査定を受け付けました。${estimateBlock}

【所在地】広島県 ${location.city || ''} ${location.chome || ''}
【種目】${labelType(property.type)}
【面積】${fmtNum(property.area_sqm)}㎡
【築年】${property.built_year ?? '-'}年（築${property.built_age ?? '-'}年）
【最寄り】${location.line || '-'} ${location.station || ''}／徒歩${location.walk_min ?? '-'}分
${stationNote}

ご入力ありがとうございました。最寄駅等をご提供いただければ、より精度の高い査定額と近隣の成約データを添えて再送いたします。`;

    return { subject, body };
  }

  function labelType(t) {
    switch (t) {
      case 'mansion': return '中古マンション';
      case 'house':   return '土地＋建物';
      case 'land':    return '土地';
      default:        return t || '-';
    }
  }
  function fmtNum(n) {
    if (n == null || !isFinite(Number(n))) return '-';
    return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 2 });
    }
  function fmtPrice(m) {
    if (m == null || !isFinite(Number(m))) return '- 円';
    // 万円単位で受け取るなら調整してください
    return Number(m).toLocaleString('ja-JP') + ' 円';
  }

  // ---- ボタン活性制御 ----
  function refreshSubmitState() {
    if (!els.submit) return;
    const ok = isAllRequiredOK();
    els.submit.disabled = !ok;
    // マンション＆駅未入力のときはヒント表示（ブロックはしない）
    if (ok && needsStationForMansion()) {
      els.submit.setAttribute('data-station-hint', 'true');
    } else {
      els.submit.removeAttribute('data-station-hint');
    }
  }

  // 監視イベント
  ['change','input'].forEach(ev => {
    [els.city, els.chome, els.type, els.email, els.line, els.station, els.walk].forEach(el => {
      if (el) el.addEventListener(ev, refreshSubmitState);
    });
  });
  if (els.area)  els.area.addEventListener('area-change', refreshSubmitState);
  if (els.built) els.built.addEventListener('builtyear-change', refreshSubmitState);

  // 初期
  document.addEventListener('DOMContentLoaded', refreshSubmitState);
  refreshSubmitState();

  // ---- 送信ハンドラ（例）----
  if (els.submit) {
    els.submit.addEventListener('click', async (e) => {
      // フォームが <button type="submit"> の場合は防止
      if (els.submit.getAttribute('type') !== 'button') e.preventDefault();

      if (!isAllRequiredOK()) {
        showToast('未入力の必須項目があります。', 'warn');
        return;
      }

      const payload = buildPayload();

      // マンションで駅情報がない→注意メッセージ（送信は継続）
      if (payload.flags.station_missing) {
        showToast('駅情報が未入力のため、推定幅が広めになります。入力で精度UP！', 'warn');
      }

      // ▼ここでサーバーへPOST（必要に応じてURL変更）
      // const res = await fetch('/lead', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      // const data = await res.json();

      // メールテンプレ生成（サーバー側で使うならpayloadだけ送ってサーバーで生成してOK）
      const mail = buildMailTemplate(payload /*, { price: 25000000, low: 21000000, high: 29000000 }*/);
      console.log('[preview mail]', mail);

      // 画面通知（実際は送信結果に応じて分岐）
      showToast('仮査定を受け付けました。結果はメールでお送りします。');
    });
  }
})();
