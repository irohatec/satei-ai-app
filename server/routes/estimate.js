// server/routes/estimate.js  （全文）
// 目的：データ参照版のMVP
// - public/app/datasets を優先参照（address / rail / sales / baseprice）
// - 見つからない場合は安全フォールバックで必ず 200 + 価格を返す
// - ベース単価 × 面積 × 補正（徒歩/築年/構造/所在階/採光/角地）
// - 近隣成約（あれば）で中央値/レンジを微調整し、comps を添付
// - メールは（有効時のみ）バックグラウンド送信（失敗は握りつぶす）

import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const THIS_YEAR = new Date().getFullYear();

// ------------- パス解決（/server/routes からリポジトリ直下へ） -------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT_DIR   = path.resolve(__dirname, "..", ".."); // <repo>/ 直下
const PUB_DATA   = path.join(ROOT_DIR, "public", "app", "datasets");

// ------------- ユーティリティ -------------
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
const toNum = (v,def=0)=> Number.isFinite(Number(v)) ? Number(v) : def;

function safeReadJson(filePath){
  try{
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw || "null");
  }catch(_){ return null; }
}
function listJsonFiles(dir){
  try{
    return fs.readdirSync(dir)
      .filter(f => /\.json$/i.test(f))
      .map(f => path.join(dir, f));
  }catch(_){ return []; }
}

// Haversine（m）
function haversine(lat1,lon1,lat2,lon2){
  const toRad = d=> d*Math.PI/180;
  const R=6371000;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

// ------------- 入力正規化 -------------
function normType(s=""){
  if (/土地|land/i.test(s)) return "land";
  if (/戸建|一戸建|house/i.test(s)) return "house";
  if (/マンション|mansion/i.test(s)) return "mansion";
  if (/ビル|building/i.test(s)) return "building";
  if (/アパート|共同住宅|apartment/i.test(s)) return "apartment";
  return (s || "mansion").toLowerCase();
}
function toSqm(v, unit){ return unit==="tsubo" ? toNum(v)*3.305785 : toNum(v); }

// ------------- 住所座標の推定（address データから町名の lat/lng を得る） -------------
function getSubjectLatLng(pref, cityCode, town){
  if(!pref || !cityCode || !town) return null;
  const cityFile = path.join(PUB_DATA, "address", pref, `${cityCode}.json`);
  const arr = safeReadJson(cityFile);
  if(!Array.isArray(arr)) return null;
  const hit = arr.find(x => (x?.town || x?.name) === town);
  if(!hit || typeof hit.lat!=="number" || typeof hit.lng!=="number") return null;
  return { lat: hit.lat, lng: hit.lng };
}

// ------------- ベース単価（baseprice） -------------
function lookupBasePriceYenPerSqm(pref, type, latlng){
  // 1) baseprice/<pref>/ にファイルがあれば、最寄ポイントの priceYenPerSqm を距離重みで推定
  const dir = path.join(PUB_DATA, "baseprice", pref);
  const files = listJsonFiles(dir);
  if (files.length && latlng){
    // 使いそうなファイル名の優先候補
    const keys = [
      "mansion","house","residential","residence","land","building","apartment","all"
    ];
    const sorted = files.sort((a,b)=>{
      const sa = keys.findIndex(k => a.toLowerCase().includes(k));
      const sb = keys.findIndex(k => b.toLowerCase().includes(k));
      return (sa===-1?99:sa) - (sb===-1?99:sb);
    });
    // 近い点5つくらいの逆距離重み
    for(const f of sorted){
      const data = safeReadJson(f);
      if(!data) continue;

      // 形式１：FeatureCollection（Point/Polygon 想定、Point優先）
      if (data.type==="FeatureCollection" && Array.isArray(data.features)){
        const pts = data.features
          .map(ft=>{
            const p = ft?.properties||{};
            // geometry.coordinates: [lng,lat] のPointのみ扱う
            const g = ft?.geometry;
            if (!g || g.type!=="Point" || !Array.isArray(g.coordinates)) return null;
            const lng = Number(g.coordinates[0]), lat = Number(g.coordinates[1]);
            const price = Number(p.priceYenPerSqm || p.price || p.unit_price || p.unitYen);
            if(!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(price)) return null;
            const d = haversine(latlng.lat, latlng.lng, lat, lng);
            return { lat,lng, price, d };
          })
          .filter(Boolean)
          .sort((a,b)=> a.d - b.d)
          .slice(0, 5);

        if (pts.length){
          // 5km 以内を採用（離れすぎると無視）
          const valid = pts.filter(p=> p.d <= 5000);
          const baseArr = (valid.length? valid : pts);
          let wsum=0, psum=0;
          baseArr.forEach(p=>{
            const w = 1/Math.max(1, p.d); // 逆距離重み
            wsum+=w; psum+=w*p.price;
          });
          if (wsum>0) return psum/wsum;
        }
      }

      // 形式２：単純配列 [{lat,lng,priceYenPerSqm}, ...]
      if (Array.isArray(data)){
        const pts = data
          .map(r=>{
            const lat=Number(r.lat), lng=Number(r.lng);
            const price=Number(r.priceYenPerSqm || r.price || r.unit_price || r.unitYen);
            if(!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(price)) return null;
            const d = haversine(latlng.lat, latlng.lng, lat, lng);
            return {lat,lng,price,d};
          })
          .filter(Boolean)
          .sort((a,b)=> a.d - b.d)
          .slice(0, 5);
        if (pts.length){
          const valid = pts.filter(p=> p.d <= 5000);
          const baseArr = (valid.length? valid : pts);
          let wsum=0, psum=0;
          baseArr.forEach(p=>{ const w=1/Math.max(1,p.d); wsum+=w; psum+=w*p.price; });
          if (wsum>0) return psum/wsum;
        }
      }
    }
  }

  // 2) フォールバック：種目別の仮基準単価
  switch (type){
    case "land":     return 150000;
    case "mansion":  return 450000;
    case "house":    return 250000;
    case "building":
    case "apartment":return 300000;
    default:         return 200000;
  }
}

// ------------- 成約データ（sales） -------------
function loadAllSales(pref){
  const dir = path.join(PUB_DATA, "sales", pref);
  const out = [];
  // index.json に records/list があれば読む
  const idx = safeReadJson(path.join(dir, "index.json"));
  if (idx){
    const arr = Array.isArray(idx.records) ? idx.records
             : Array.isArray(idx.list)    ? idx.list
             : Array.isArray(idx)         ? idx
             : [];
    arr.forEach(x => out.push(x));
  }
  // フォルダ内の *.json を総当たり
  listJsonFiles(dir).forEach(fp=>{
    if (path.basename(fp).toLowerCase()==="index.json") return;
    const d = safeReadJson(fp);
    if (!d) return;
    const arr = Array.isArray(d) ? d
              : Array.isArray(d.records) ? d.records
              : Array.isArray(d.list)    ? d.list
              : [];
    arr.forEach(x => out.push(x));
  });
  return out;
}

function normalizeSaleRow(r){
  // 受け取り多様性を吸収 → 万円ベースに正規化
  const priceMan =
    Number.isFinite(r?.priceMan) ? Number(r.priceMan) :
    Number.isFinite(r?.price_10k) ? Number(r.price_10k) :
    Number.isFinite(r?.price) ? (Number(r.price) > 1e6 ? Math.round(Number(r.price)/10000) : Number(r.price)) :
    Number.isFinite(r?.priceYen) ? Math.round(Number(r.priceYen)/10000) :
    null;

  const bldg = Number.isFinite(r?.bldgArea) ? Number(r.bldgArea) : Number(r?.bldg_area);
  const land = Number.isFinite(r?.landArea) ? Number(r.landArea) : Number(r?.land_area);
  const year = Number.isFinite(r?.buildYear) ? Number(r.buildYear)
              : Number.isFinite(r?.year_built) ? Number(r.year_built) : null;
  const walk = Number.isFinite(r?.walkMinutes) ? Number(r.walkMinutes)
              : Number.isFinite(r?.walk) ? Number(r.walk) : null;

  const station = r.station || r.station_name || r.sta || "";
  const lineStation = r.lineStation || r.linestation || (station ? (r.line? `${r.line} ${station}` : station) : "");
  const address = r.address || r.addr || r.loc || "";
  const lat = Number.isFinite(r?.lat) ? Number(r.lat) : null;
  const lng = Number.isFinite(r?.lng) ? Number(r.lng) : null;
  const type = normType(r?.type || r?.propertyType);
  const soldYM = r.soldYM || r.sold_ym || r.trans_ym || "";

  if (!priceMan) return null;
  return { priceMan, bldgArea: bldg||0, landArea: land||0, buildYear: year||0,
           walkMinutes: walk||null, lineStation, address, lat, lng, type, soldYM };
}

function filterSimilarComps(all, subject, latlng){
  // 条件：同種目、面積±30%、築±5年、徒歩±15分、同じ市区/町名を優先
  const type = subject.propertyType;
  const area = (type==="land" ? subject.landArea : subject.buildingArea) || subject.buildingArea || subject.landArea || 0;
  const minA = area*0.7, maxA = area*1.3;
  const minY = subject.buildYear ? subject.buildYear-5 : null;
  const maxY = subject.buildYear ? subject.buildYear+5 : null;

  const textKey = (subject.city||"") + (subject.town||"");

  const cand = [];
  for (const raw of all){
    const r = normalizeSaleRow(raw);
    if(!r) continue;
    if (r.type && r.type!==type) continue;

    const rArea = (type==="land" ? r.landArea : r.bldgArea) || r.bldgArea || r.landArea || 0;
    if (area>0 && rArea>0 && (rArea<minA || rArea>maxA)) continue;

    if (minY && maxY && r.buildYear && (r.buildYear<minY || r.buildYear>maxY)) continue;
    if (subject.walkMinutes && r.walkMinutes!=null){
      if (Math.abs(subject.walkMinutes - r.walkMinutes) > 15) continue;
    }

    let dist = 999999;
    if (latlng && Number.isFinite(r.lat) && Number.isFinite(r.lng)){
      dist = haversine(latlng.lat, latlng.lng, r.lat, r.lng);
    }else if (textKey && r.address && (r.address.includes(subject.city||"") || r.address.includes(subject.town||""))){
      dist = 1500; // 文字一致の擬似距離
    }

    cand.push({ ...r, _dist: dist });
  }

  // 距離→面積近似→新しさ の順でソート
  cand.sort((a,b)=>{
    const d = a._dist - b._dist;
    if (Math.abs(d)>1e-6) return d;
    const aA = (type==="land"?a.landArea:a.bldgArea); const bA=(type==="land"?b.landArea:b.bldgArea);
    const dv = Math.abs(aA-area) - Math.abs(bA-area);
    if (Math.abs(dv)>1e-6) return dv;
    return (b.buildYear||0) - (a.buildYear||0);
  });

  return cand.slice(0, 12); // 多めに拾う（後で統計に使用）
}

// ------------- 簡易推定（安全フォールバック） -------------
function quickEstimate(input, baseYenPerSqm){
  const unit = input.areaUnit==="tsubo" ? "tsubo" : "sqm";
  const land = toSqm(input.landArea, unit);
  const bldg = toSqm(input.buildingArea, unit);
  const age  = input.buildYear ? clamp(THIS_YEAR - Number(input.buildYear), 0, 120) : 0;
  const walk = clamp(Number(input.walkMinutes||0), 0, 120);

  let base = baseYenPerSqm || 200000;
  let area = bldg || land;
  switch (input.propertyType){
    case "land":     area=land; break;
    case "mansion":  area=bldg; break;
    case "house":    area=bldg || land*0.5; break;
    case "building":
    case "apartment":area=bldg; break;
  }
  if (!area || area<=0) area = (land + bldg) || 60;

  // 徒歩（5分超過×1% 最大30%）
  const walkFactor = 1 - Math.min(0.30, Math.max(0, walk-5)*0.01);
  // 築年（最大50%）
  const depFactor  = ["mansion","house","building","apartment"].includes(input.propertyType)
    ? (1 - Math.min(0.50, age*0.015)) : 1;
  // 構造
  const structBonus = ({RC:1.04, SRC:1.06, "鉄骨":1.02, "木造":0.98, "軽量鉄骨":1.01, "ブロック":0.97}[input.structure] || 1);
  // 所在階（マンションのみ）
  const floorBonus  = (input.propertyType==="mansion" && input.totalFloors>0)
    ? (1 + Math.min(0.08, Math.max(0, (Number(input.floor||0)-2))*0.01)) : 1;
  // 採光
  const aspectBonus = ({"南":1.03,"南東":1.02,"南西":1.02,"東":1.01,"西":1.01}[input.aspect] || 1);
  // 角地
  const cornerBonus = input.isCorner ? 1.03 : 1;

  const priceYen = base * area * walkFactor * depFactor * structBonus * floorBonus * aspectBonus * cornerBonus;
  const mid  = Math.max(1, Math.round(priceYen/10000)); // 万円
  let   band = Math.max(5, Math.round(mid*0.12));       // ±12% or ±5万円
  return { priceMan: mid, priceMinMan: Math.max(1, mid-band), priceMaxMan: mid+band, baseYenPerSqm: Math.round(base) };
}

// ------------- 中央値・レンジの補正（成約がある場合） -------------
function refineByComps(subject, est, comps){
  if (!Array.isArray(comps) || comps.length<3) return est;

  // 価格（万円）の分位を計算
  const xs = comps.map(c=> Number(c.priceMan)).filter(Number.isFinite).sort((a,b)=> a-b);
  if (xs.length<3) return est;

  const p = q => {
    const idx = (xs.length-1)*q;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo===hi) return xs[lo];
    const w = idx - lo;
    return xs[lo]*(1-w) + xs[hi]*w;
  };
  const p25 = Math.round(p(0.25));
  const p50 = Math.round(p(0.50));
  const p75 = Math.round(p(0.75));

  // 中央値を近傍中央値に寄せ、レンジはIQRで置換（過度な乖離は±15%まで）
  const mid0 = est.priceMan;
  const mid1 = Math.round(mid0*0.5 + p50*0.5); // 50/50ブレンド
  const min1 = Math.max(1, Math.min(mid1 - Math.round((mid1*0.15)), p25));
  const max1 = Math.max(p75, mid1 + Math.round((mid1*0.15)));

  return { ...est, priceMan: mid1, priceMinMan: min1, priceMaxMan: max1 };
}

// ------------- メイン API（/estimate のベースパスに対して "/" を受ける） -------------
router.post("/", async (req, res) => {
  try{
    const b = req.body || {};
    const input = {
      propertyType: normType(b.propertyType),
      areaUnit: b.areaUnit==="tsubo" ? "tsubo" : "sqm",
      landArea: toNum(b.landArea||0),
      buildingArea: toNum(b.buildingArea||0),
      buildYear: toNum(b.buildYear||0),
      walkMinutes: toNum(b.walkMinutes||0),
      isCorner: !!b.isCorner,
      structure: b.structure || "",
      totalFloors: toNum(b.totalFloors||0),
      floor: toNum(b.floor||0),

      prefecture: (b.prefecture||"").toLowerCase() || "hiroshima",
      city: b.city || "", town: b.town || "", chome: b.chome || "",
      cityCode: b.cityCode || "",
      line: b.line || "", station: b.station || "",
      aspect: b.aspect || "", floorPlan: b.floorPlan || ""
    };

    // 住所座標（subject点）
    const latlng = getSubjectLatLng(input.prefecture, input.cityCode, input.town);

    // ベース単価（baseprice があれば参照）
    const baseYenPerSqm = lookupBasePriceYenPerSqm(input.prefecture, input.propertyType, latlng||undefined);

    // 成約データ（あれば）
    const salesAll = loadAllSales(input.prefecture);
    const compsRaw = filterSimilarComps(salesAll, input, latlng||null);
    const comps = compsRaw.slice(0, 8); // 返却は最大8件

    // 簡易推定
    let est = quickEstimate(input, baseYenPerSqm);

    // 近傍成約で微調整
    est = refineByComps(input, est, comps);

    // レスポンス
    res.json({
      ok: true,
      ...est,
      comps
    });

    // ---- メール送信（有効時のみ・非同期、失敗は握り） ----
    if (process.env.MAIL_ENABLED === "true" && (req.body?.email || "").includes("@")){
      setTimeout(async ()=>{
        try{
          const mod = await import("../adapters/mailer/index.js").catch(()=> ({}));
          const mailer = mod?.default || mod;
          const send = mailer?.sendEstimateMail || mailer?.sendMail || mailer?.send || null;
          if (typeof send === "function"){
            const lines = [
              `【中央値】${est.priceMan} 万円`,
              `【レンジ】${est.priceMinMan} ～ ${est.priceMaxMan} 万円`,
              "", "【近隣の成約事例】",
              ...(comps.length ? comps : [{lineStation:"-",address:"近隣事例なし",priceMan:"-",landArea:"-",soldYM:"-"}])
                .map(c=>`・${c.lineStation||"-"} / ${c.address||"-"} / ${c.priceMan}万円台 / ${(c.bldgArea||c.landArea)?(c.bldgArea?`${c.bldgArea}㎡`:`${c.landArea}㎡`):"-"} / ${c.soldYM||"-"}`)
            ].join("\n");
            await send({ to: req.body.email, subject: "不動産AI査定 結果", text: lines });
          }
        }catch(e){ /* ignore */ }
      }, 0);
    }

  }catch(err){
    console.error("[/estimate] fatal:", err);
    // 理論上ここに来ないようガードしているが、最終保険
    return res.json({ ok:true, priceMinMan:95, priceMan:100, priceMaxMan:112, comps:[], fallback:true });
  }
});

export default router;
export { router };
