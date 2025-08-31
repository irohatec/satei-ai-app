// server/lib/address.js
// ------------------------------------------------------------
// 目的: 旧リポの address データ (index.json + 34xxx.json) を
//       新リポからそのまま読み込んで使えるようにするユーティリティ。
// - 住所ディレクトリ配下の index.json で市区町村コードと名称を解決
// - 各 34xxx.json から 町・丁目の一覧や簡易ジオ情報を取得
// - 読み込み結果はメモリキャッシュして高速化
// ------------------------------------------------------------
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ★ データの配置先（そのまま使います）
// client-real-estate/server/data/address/hiroshima/{index.json, 34101.json, ...}
const DATA_DIR = path.join(__dirname, "..", "data", "address", "hiroshima");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// メモリキャッシュ
const cache = {
  index: null,          // { "広島市中区": "34101", ... } または { code, name } の配列 いずれにも対応
  townsByCode: new Map()// code -> { towns: [ { town, chome: ["1丁目","2丁目",...], lat, lng } ... ] }
};

// ユーティリティ: JSON を安全に読み込む
async function readJson(filePath) {
  const buf = await fs.readFile(filePath);
  try {
    return JSON.parse(buf.toString("utf-8"));
  } catch (e) {
    throw new Error(`Invalid JSON: ${filePath}`);
  }
}

// index.json を読み込む（形式の違いにゆるく対応）
async function loadIndex() {
  if (cache.index) return cache.index;

  const data = await readJson(INDEX_PATH);

  // 1) { "<市区町村名>": "<code>" } 形式
  if (data && !Array.isArray(data) && typeof data === "object") {
    cache.index = data;
    return cache.index;
  }

  // 2) [{ code:"34101", name:"広島市中区" }, ...] 形式にも対応
  if (Array.isArray(data)) {
    const obj = {};
    for (const row of data) {
      if (row && row.code && row.name) obj[row.name] = String(row.code);
    }
    cache.index = obj;
    return cache.index;
  }

  throw new Error("Unsupported index.json format");
}

// 市区町村リストを返す（[{name, code}]）
export async function listCities() {
  const idx = await loadIndex();
  return Object.entries(idx).map(([name, code]) => ({ name, code: String(code) }));
}

// 名称から市区町村コードを取得
export async function findCityCodeByName(cityName) {
  const idx = await loadIndex();
  // 完全一致
  if (idx[cityName]) return String(idx[cityName]);

  // ゆるい一致（例: "広島市 中区" → "広島市中区"）
  const normalized = String(cityName || "").replace(/\s+/g, "");
  for (const [name, code] of Object.entries(idx)) {
    if (name.replace(/\s+/g, "") === normalized) return String(code);
  }
  return null;
}

// 指定コードの 34xxx.json を読み込み、町・丁目配列を返す
export async function listTownsByCode(cityCode) {
  if (!cityCode) return [];
  if (cache.townsByCode.has(cityCode)) return cache.townsByCode.get(cityCode);

  const file = path.join(DATA_DIR, `${cityCode}.json`);
  const data = await readJson(file);

  // 想定形式にゆるく対応：
  // 例1: [{ town: "宇品神田", chome: ["1丁目","2丁目"], lat:34.37, lng:132.47 }, ...]
  // 例2: { "宇品神田": { chome:["1丁目",...], lat:..., lng:... }, ... }
  let towns = [];
  if (Array.isArray(data)) {
    towns = data.map(row => ({
      town: row.town || row.name || "",
      chome: Array.isArray(row.chome) ? row.chome : [],
      lat: row.lat ?? null,
      lng: row.lng ?? null
    })).filter(r => r.town);
  } else if (data && typeof data === "object") {
    towns = Object.entries(data).map(([name, v]) => ({
      town: name,
      chome: Array.isArray(v?.chome) ? v.chome : [],
      lat: v?.lat ?? null,
      lng: v?.lng ?? null
    }));
  } else {
    towns = [];
  }

  cache.townsByCode.set(cityCode, towns);
  return towns;
}

// 名称から町の候補を返す
export async function listTownsByCityName(cityName) {
  const code = await findCityCodeByName(cityName);
  if (!code) return [];
  return listTownsByCode(code);
}

// 町名から丁目の候補を返す
export async function listChome(cityName, townName) {
  if (!cityName || !townName) return [];
  const towns = await listTownsByCityName(cityName);
  const t = towns.find(r => r.town === townName);
  return t ? (t.chome || []) : [];
}

// 町レベルの簡易ジオ（lat/lng）取得
export async function getTownGeo(cityName, townName) {
  if (!cityName || !townName) return { lat: null, lng: null };
  const towns = await listTownsByCityName(cityName);
  const t = towns.find(r => r.town === townName);
  return t ? { lat: t.lat ?? null, lng: t.lng ?? null } : { lat: null, lng: null };
}

// 住所候補検索（フロントの入力補助などに利用可）
export async function searchTowns(cityName, q, limit = 20) {
  const kw = String(q || "").trim();
  if (!kw) return [];
  const towns = await listTownsByCityName(cityName);
  const res = towns.filter(r => r.town.includes(kw)).slice(0, limit);
  return res.map(r => r.town);
}
