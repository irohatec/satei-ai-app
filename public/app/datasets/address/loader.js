// server/datasets/address/loader.js
// -----------------------------------------------------------------------------
// 住所データローダー
//
// 想定データ構成：
// server/datasets/address/<pref>/index.json
//   { "広島市中区": "34101", "広島市東区": "34102", ... }
//
// server/datasets/address/<pref>/34101.json
//   [
//     { "town": "宇品神田", "chome": ["1丁目","2丁目","3丁目"], "lat": 34.37, "lng": 132.47 },
//     { "town": "大手町",   "chome": ["1丁目","2丁目"], "lat": 34.39, "lng": 132.45 }
//   ]
//
// 出力関数：
//   - listCities(pref)
//   - listTowns(pref, cityName)
//   - listChome(pref, cityName, townName)
//   - getTownGeo(pref, cityName, townName)
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 住所データのルートディレクトリ
const DATASET_ROOT = path.join(__dirname);

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// pref ディレクトリの絶対パス
function prefDir(pref) {
  return path.join(DATASET_ROOT, pref);
}

// index.json を読み、市区町村名→コードの辞書を返す
function readCityIndex(pref) {
  const file = path.join(prefDir(pref), "index.json");
  return safeReadJson(file) || {};
}

// ----------------- 公開関数 -----------------

// 市区町村一覧
export function listCities(pref) {
  const index = readCityIndex(pref);
  return Object.keys(index);
}

// 町名一覧
export function listTowns(pref, cityName) {
  const index = readCityIndex(pref);
  const code = index[cityName];
  if (!code) return [];
  const file = path.join(prefDir(pref), `${code}.json`);
  const arr = safeReadJson(file);
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => t.town);
}

// 丁目一覧
export function listChome(pref, cityName, townName) {
  const index = readCityIndex(pref);
  const code = index[cityName];
  if (!code) return [];
  const file = path.join(prefDir(pref), `${code}.json`);
  const arr = safeReadJson(file);
  if (!Array.isArray(arr)) return [];
  const t = arr.find((x) => x.town === townName);
  return t?.chome || [];
}

// 緯度経度
export function getTownGeo(pref, cityName, townName) {
  const index = readCityIndex(pref);
  const code = index[cityName];
  if (!code) return null;
  const file = path.join(prefDir(pref), `${code}.json`);
  const arr = safeReadJson(file);
  if (!Array.isArray(arr)) return null;
  const t = arr.find((x) => x.town === townName);
  if (!t) return null;
  return { lat: t.lat, lng: t.lng };
}
