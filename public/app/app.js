// public/app/app.js
// -----------------------------------------------------------------------------
// 入力の必須が揃ったら自動で /estimate を呼び、中央値＋レンジを即時表示
// 補正（構造/所在階/採光/角地/徒歩）を入れるたびに再計算
// 「査定を送信」はメール送信用（画面は即時表示のまま）
// -----------------------------------------------------------------------------

const PREF = "hiroshima";

// DOM
const els = {
  businessFields: null,

  city: null, town: null, chome: null, addressDetail: null,
  line: null, station: null, walk: null,

  propertyType: null, areaUnit: null,
  landArea: null, buildingArea: null,
  buildYear: null, floorPlan: null, structure: null,
  totalFloors: null, floor: null, aspect: null, isCorner: null,

  email: null, submitBtn: null,
  resultMin: null, resultMid: null, resultMax: null, resultCard: null,

  landReq: null, bldgReq: null, buildYearReq: null
};

function $(id){ return document.getElementById(id); }
async function getJSON(url){ const r=await fetch(url,{cache:"no-cache"}); if(!r.ok) throw new Error(url); return r.json(); }
function fillOptions(select, items, {valueKey="value", labelKey="label", placeholder}={}){
  select.innerHTML = "";
  if (placeholder){
    const o = document.createElement("option"); o.value=""; o.textContent=placeholder; select.appendChild(o);
  }
  items.forEach(it=>{
    const v = typeof it==="string" ? it : it[valueKey];
    const l = typeof it==="string" ? it : it[labelKey];
    if(v==null||l==null) return;
    const o = document.createElement("option"); o.value=String(v); o.textContent=String(l); select.appendChild(o);
  });
}
function range(a,b){ const out=[]; for(let i=a;i<=b;i++) out.push(i); return out; }

// ---------- 住所 ----------
function normalizeCityIndex(idx){
  const out=[];
  if(!idx) return out;
  if(Array.isArray(idx)){
    idx.forEach(it=>{
      const label=it?.name_ja||it?.name||it?.label||it?.title;
      const value=it?.code??it?.value??it?.id;
      if(label&&(value||value===0)) out.push({label, value:String(value)});
    }); return out;
  }
  const arr=(idx.cities||idx.wards||idx.list);
  if(Array.isArray(arr)){
    arr.forEach(it=>{
      const label=it?.name_ja||it?.name||it?.label||it?.title;
      const value=it?.code??it?.value??it?.id;
      if(label&&(value||value===0)) out.push({label, value:String(value)});
    }); return out;
  }
  Object.entries(idx).forEach(([label,value])=>{
    if(label&&(value||value===0)) out.push({label, value:String(value)});
  });
  return out;
}
function normalizeTownsFile(data){
  let arr=[]; if(Array.isArray(data)) arr=data; else if(Array.isArray(data?.towns)) arr=data.towns; else if(Array.isArray(data?.list)) arr=data.list;
  return arr.map(t=>{
    const name=t?.town||t?.name||t?.label||t?.title;
    const ch=t?.chome||t?.chomes||t?.blocks||t?.丁目||[];
    const chomes=Array.isArray(ch)?ch.map(x=>String(x)):[];
    return name?{name, chomes}:null;
  }).filter(Boolean);
}
async function loadCities(){
  const idx = await getJSON(`./datasets/address/${PREF}/index.json`);
  // ★ 市区町村をフリガナ順（五十音順）にソート
  const cityItems = normalizeCityIndex(idx).sort((a,b)=> (a.label||"").localeCompare(b.label||"", "ja"));
  fillOptions(els.city, cityItems, {valueKey:"value", labelKey:"label", placeholder:"市区町村を選択"});
  els.city.onchange = async ()=>{
    const code = els.city.value;
    fillOptions(els.town, [], {placeholder:"町名を選択"}); fillOptions(els.chome, [], {placeholder:"丁目を選択"});
    if(!code) return;
    const townsRaw = await getJSON(`./datasets/address/${PREF}/${encodeURIComponent(code)}.json`);
    // ★ 町名もフリガナ順（五十音順）にソート
    const list = normalizeTownsFile(townsRaw).sort((a,b)=>(a.name||"").localeCompare(b.name||"","ja"));
    els._townList = list;
    fillOptions(els.town, list.map(t=>t.name), {placeholder:"町名を選択"});
    debouncedCompute();
  };
  els.town.onchange = ()=>{
    const list = els._townList||[]; const t = list.find(x=>x.name===els.town.value);
    const chomes = t?.chomes || [];
    fillOptions(els.chome, chomes.map(c=>{
      const label=/丁目$/.test(c)?c:`${c}丁目`; const value=String(c).replace(/丁目$/u,"");
      return {value,label};
    }), {valueKey:"value", labelKey:"label", placeholder:"丁目を選択"});
    debouncedCompute();
  };
  els.chome.onchange = debouncedCompute;
}

// ---------- 鉄道 ----------
function normalizeLinesIndex(idx){
  const out=[];
  if(!idx) return out;
  if(Array.isArray(idx?.lines)){
    idx.lines.forEach(l=>{
      const name=l?.name_ja||l?.name||l?.label||l?.code;
      const file=l?.file||(l?.code?`${l.code}.json`:"");
      if(name && file) out.push({name, file});
    }); return out;
  }
  if(Array.isArray(idx)){
    idx.forEach(l=>{
      const name=l?.name_ja||l?.name||l?.label||l?.code;
      const file=l?.file||(l?.code?`${l.code}.json`:"");
      if(name && file) out.push({name, file});
    }); return out;
  }
  Object.entries(idx).forEach(([name,file])=>{
    if(name && file) out.push({name, file:String(file)});
  });
  return out;
}
function normalizeStations(data){
  let arr=[]; if(Array.isArray(data)) arr=data; else if(Array.isArray(data?.stations)) arr=data.stations; else if(Array.isArray(data?.list)) arr=data.list;
  return arr.map(s=>s?.station||s?.name_ja||s?.name||s?.title).filter(Boolean).map(String);
}
async function loadLines(){
  const idx = await getJSON(`./datasets/rail/${PREF}/index.json`);
  const lineFiles = normalizeLinesIndex(idx);
  fillOptions(els.line, lineFiles.map(l=>({value:l.file, label:l.name})), {valueKey:"value", labelKey:"label", placeholder:"路線を選択"});
  els.line.onchange = async ()=>{
    fillOptions(els.station, [], {placeholder:"駅を選択"});
    const file = els.line.value; if(!file) return;
    const raw = await getJSON(`./datasets/rail/${PREF}/${encodeURIComponent(file)}`);
    const stations = normalizeStations(raw);
    fillOptions(els.station, stations, {placeholder:"駅を選択"});
    debouncedCompute();
  };
  els.station.onchange = debouncedCompute;
}

// ---------- 必須/補正 ----------
function normalizeTypeName(s){
  const t=String(s||"").trim();
  if(!t) return "";
  if(/土地/.test(t)) return "land";
  if(/戸建|一戸建/.test(t)) return "house";
  if(/マンション/.test(t)) return "mansion";
  if(/(ビル|売ビル)/.test(t)) return "building";
  if(/(アパート|共同住宅)/.test(t)) return "apartment";
  return t.toLowerCase();
}
function setDisabled(el, disabled){ el.disabled=!!disabled; el.classList.toggle("disabled",!!disabled); }
function setReqSpan(span, on){ span.textContent = on ? "（必須）" : ""; }
function updateRequiredUI(){
  const type = normalizeTypeName(els.propertyType.value);
  let needLand=false, needBldg=false, needYear=false;
  if(type==="land"){ needLand=true; needBldg=false; needYear=false; }
  else if(type==="house"){ needLand=true; needBldg=true; needYear=true; }
  else if(["mansion","building","apartment"].includes(type)){ needLand=false; needBldg=true; needYear=true; }
  setReqSpan(els.landReq, needLand);
  setReqSpan(els.bldgReq, needBldg);
  setReqSpan(els.buildYearReq, needYear);
  setDisabled(els.landArea, !needLand && type!=="house");
  setDisabled(els.buildingArea, !needBldg && type!=="house");
  setDisabled(els.buildYear, !needYear && type==="land");
}

// ---------- 送信/自動査定 ----------
function buildPayload(){
  return {
    userType: document.querySelector('input[name="userType"]:checked')?.value || "personal",

    prefecture: PREF,
    city: els.city.value ? els.city.options[els.city.selectedIndex].textContent : "",
    cityCode: els.city.value || "",
    town: els.town.value || "",
    chome: els.chome.value || "",
    addressDetail: els.addressDetail.value || "",

    line: els.line.value ? els.line.options[els.line.selectedIndex].textContent : "",
    lineFile: els.line.value || "",
    station: els.station.value || "",
    walkMinutes: Number(els.walk.value || 0),

    propertyType: normalizeTypeName(els.propertyType.value),
    areaUnit: els.areaUnit.value || "sqm",
    landArea: Number(els.landArea.value || 0),
    buildingArea: Number(els.buildingArea.value || 0),
    buildYear: Number(els.buildYear.value || 0),
    floorPlan: els.floorPlan.value || "",
    structure: els.structure.value || "",
    totalFloors: Number(els.totalFloors.value || 0),
    floor: Number(els.floor.value || 0),
    aspect: els.aspect.value || "",
    isCorner: !!els.isCorner.checked,

    email: els.email.value || ""
  };
}

function hasRequired(){
  return (
    !!els.city.value &&
    !!els.town.value &&
    !!els.line.value &&
    !!els.station.value &&
    !!els.propertyType.value &&
    !!els.buildYear.value
  );
}

async function computeEstimate(){
  if(!hasRequired()){
    // 足りない間は未表示に戻す
    els.resultMin.textContent = "—";
    els.resultMid.textContent = "—";
    els.resultMax.textContent = "—";
    return;
  }
  try{
    const res = await fetch("/estimate", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(buildPayload())
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data?.ok) throw new Error("estimate failed");
    els.resultMin.textContent = Number(data.priceMinMan||0).toLocaleString();
    els.resultMid.textContent = Number(data.priceMan||0).toLocaleString();
    els.resultMax.textContent = Number(data.priceMaxMan||0).toLocaleString();
  }catch(e){
    console.error("auto estimate error", e);
  }
}

let _t=null;
function debouncedCompute(){ clearTimeout(_t); _t=setTimeout(computeEstimate, 350); }

// 手動送信（メール獲得）
async function sendEstimate(){
  try{
    const res = await fetch("/estimate", {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(buildPayload())
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data?.ok) throw new Error("estimate failed");
    // 画面も更新しておく
    els.resultMin.textContent = Number(data.priceMinMan||0).toLocaleString();
    els.resultMid.textContent = Number(data.priceMan||0).toLocaleString();
    els.resultMax.textContent = Number(data.priceMaxMan||0).toLocaleString();
    els.resultCard.scrollIntoView({ behavior:"smooth", block:"start" });
    alert("査定結果を送信しました。（メールをご確認ください）");
  }catch(e){
    console.error("estimate error:", e);
    alert("送信に失敗しました。入力内容をご確認ください。");
  }
}

// ---------- 初期化 ----------
function initWalk(){ fillOptions(els.walk, range(1,60).map(String), {placeholder:"選択してください"}); }
function initFloors(){ fillOptions(els.totalFloors, range(1,100).map(String), {placeholder:"選択してください"}); fillOptions(els.floor, range(1,100).map(String), {placeholder:"選択してください"}); }
function initYears(){ fillOptions(els.buildYear, range(1900,2025).reverse().map(String), {placeholder:"年を選択"}); }
function initUserTypeToggle(){
  const radios=document.querySelectorAll('input[name="userType"]');
  const toggle=()=>{ const isBiz=document.querySelector('input[name="userType"]:checked')?.value==="business"; els.businessFields.style.display=isBiz?"grid":"none"; };
  radios.forEach(r=>r.addEventListener("change",toggle)); toggle();
}

async function bootstrap(){
  // refs
  els.businessFields = $("businessFields");

  els.city=$("citySelect"); els.town=$("townSelect"); els.chome=$("chomeSelect"); els.addressDetail=$("addressDetail");
  els.line=$("lineSelect"); els.station=$("stationSelect"); els.walk=$("walkSelect");

  els.propertyType=$("propertyType"); els.areaUnit=$("areaUnit");
  els.landArea=$("landArea"); els.buildingArea=$("buildingArea");
  els.buildYear=$("buildYear"); els.floorPlan=$("floorPlan"); els.structure=$("structure");
  els.totalFloors=$("totalFloors"); els.floor=$("floor"); els.aspect=$("aspect"); els.isCorner=$("isCorner");

  els.email=$("email"); els.submitBtn=$("submitBtn");
  els.resultMin=$("resultMin"); els.resultMid=$("resultMid"); els.resultMax=$("resultMax"); els.resultCard=$("resultCard");

  els.landReq=$("landReq"); els.bldgReq=$("bldgReq"); els.buildYearReq=$("buildYearReq");

  // init UI
  initWalk(); initFloors(); initYears(); initUserTypeToggle();
  updateRequiredUI();

  // load data
  await Promise.allSettled([loadCities(), loadLines()]);

  // 監視（必須＋補正）
  [
    els.city, els.town, els.chome, els.line, els.station, els.walk,
    els.propertyType, els.areaUnit, els.landArea, els.buildingArea,
    els.buildYear, els.floorPlan, els.structure, els.totalFloors,
    els.floor, els.aspect, els.isCorner
  ].forEach(el=>{
    if(!el) return;
    el.addEventListener("change", ()=>{ if(el===els.propertyType) updateRequiredUI(); debouncedCompute(); });
    if(el.tagName==="INPUT") el.addEventListener("input", debouncedCompute);
  });

  els.submitBtn.addEventListener("click", sendEstimate);
}
document.addEventListener("DOMContentLoaded", bootstrap);
