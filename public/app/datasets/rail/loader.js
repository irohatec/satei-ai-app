// server/datasets/rail/loader.js
// -----------------------------------------------------------------------------
// 路線・駅データローダー
//
// 想定データ構成：
// server/datasets/rail/<pref>/index.json
//   例:
//   {
//     "広電 本線": "hiroden-honsen.json",
//     "JR 山陽本線": "jr-sanyo.json",
//     "アストラムライン": "astram.json"
//   }
//
// server/datasets/rail/<pref>/<file>.json
//   例: hiroden-honsen.json
//   [
//     { "station": "紙屋町東", "lat": 34.393, "lng": 132.456 },
//     { "station": "八丁堀",   "lat": 34.392, "lng": 132.463 }
//   ]
//
// 提供関数：
//   - listLines(pref): string[]
//   - listStations(pref, lineName): {station, lat?, lng?}[]
//   - getStation(pref, lineName, stationName): {station, lat?, lng?} | null
// -----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ルート（この loader.js があるディレクトリ）
const DATASET_ROOT = path.join(__dirname);

// 安全読み込み
function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw || "{}");
  } catch {
    return null;
  }
}

// 都道府県フォルダのパス
function prefDir(pref) {
  return path.join(DATASET_ROOT, pref);
}

// 路線 index.json（路線名 → ファイル名）の取得
function readLineIndex(pref) {
  const file = path.join(prefDir(pref), "index.json");
  const idx = safeReadJson(file);
  return idx && typeof idx === "object" ? idx : {};
}

// 路線ファイルのフルパスを取得（index.json の値 or 推測）
function lineFilePath(pref, lineName) {
  const idx = readLineIndex(pref);
  const entry = idx[lineName];
  if (typeof entry === "string") {
    return path.join(prefDir(pref), entry);
  }
  // index.json にファイル名が無い場合は、lineName をスラグ化して推測（フォールバック）
  const slug = lineName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-ぁ-んァ-ン一-龯]/g, "");
  return path.join(prefDir(pref), `${slug}.json`);
}

// ----------------- 公開関数 -----------------

// 路線一覧
export function listLines(pref) {
  const idx = readLineIndex(pref);
  return Object.keys(idx);
}

// 指定路線の駅一覧
export function listStations(pref, lineName) {
  const file = lineFilePath(pref, lineName);
  const arr = safeReadJson(file);
  if (!Array.isArray(arr)) return [];
  // 正規化（station プロパティを必須に）
  return arr
    .map((r) => ({
      station: r.station || r.name || r.title || null,
      lat: typeof r.lat === "number" ? r.lat : null,
      lng: typeof r.lng === "number" ? r.lng : null
    }))
    .filter((r) => !!r.station);
}

// 特定駅の情報を取得
export function getStation(pref, lineName, stationName) {
  const list = listStations(pref, lineName);
  return list.find((s) => s.station === stationName) || null;
}
