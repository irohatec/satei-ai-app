// 個人/法人の切り替え
document.querySelectorAll("input[name=userType]").forEach(radio => {
  radio.addEventListener("change", () => {
    const businessFields = document.getElementById("businessFields");
    if (document.querySelector("input[name=userType]:checked").value === "business") {
      businessFields.style.display = "block";
    } else {
      businessFields.style.display = "none";
    }
  });
});

// 徒歩分のプルダウン生成
const walkSelect = document.getElementById("walkSelect");
for (let i = 1; i <= 60; i++) {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = i + "分";
  walkSelect.appendChild(opt);
}

// エリアデータロード
async function loadAddress() {
  try {
    const res = await fetch("/datasets/address");
    const data = await res.json(); // { cityCode: { name, towns: {townCode: {name, chomes:[]}} } }
    const citySelect = document.getElementById("citySelect");
    citySelect.innerHTML = '<option value="">選択してください</option>';
    Object.entries(data).forEach(([cityCode, cityObj]) => {
      const opt = document.createElement("option");
      opt.value = cityCode;
      opt.textContent = cityObj.name;
      citySelect.appendChild(opt);
    });

    citySelect.addEventListener("change", () => {
      const townSelect = document.getElementById("townSelect");
      townSelect.innerHTML = '<option value="">選択してください</option>';
      const chomeSelect = document.getElementById("chomeSelect");
      chomeSelect.innerHTML = '<option value="">選択してください</option>';

      const city = data[citySelect.value];
      if (city && city.towns) {
        Object.entries(city.towns).forEach(([townCode, townObj]) => {
          const opt = document.createElement("option");
          opt.value = townCode;
          opt.textContent = townObj.name;
          townSelect.appendChild(opt);
        });
      }
    });

    document.getElementById("townSelect").addEventListener("change", (e) => {
      const chomeSelect = document.getElementById("chomeSelect");
      chomeSelect.innerHTML = '<option value="">選択してください</option>';
      const city = data[citySelect.value];
      if (city && city.towns[e.target.value]) {
        (city.towns[e.target.value].chomes || []).forEach(chome => {
          const opt = document.createElement("option");
          opt.value = chome;
          opt.textContent = chome + "丁目";
          chomeSelect.appendChild(opt);
        });
      }
    });
  } catch (err) {
    console.error("住所データ取得失敗", err);
  }
}

// 鉄道データロード
async function loadRail() {
  try {
    const res = await fetch("/datasets/rail");
    const data = await res.json(); // { lineCode: { name, stations: {stationCode:{name}} } }
    const lineSelect = document.getElementById("lineSelect");
    lineSelect.innerHTML = '<option value="">選択してください</option>';
    Object.entries(data).forEach(([lineCode, lineObj]) => {
      const opt = document.createElement("option");
      opt.value = lineCode;
      opt.textContent = lineObj.name;
      lineSelect.appendChild(opt);
    });

    lineSelect.addEventListener("change", () => {
      const stationSelect = document.getElementById("stationSelect");
      stationSelect.innerHTML = '<option value="">選択してください</option>';
      const line = data[lineSelect.value];
      if (line && line.stations) {
        Object.entries(line.stations).forEach(([stationCode, stationObj]) => {
          const opt = document.createElement("option");
          opt.value = stationCode;
          opt.textContent = stationObj.name;
          stationSelect.appendChild(opt);
        });
      }
    });
  } catch (err) {
    console.error("鉄道データ取得失敗", err);
  }
}

// ページロード時に呼び出し
loadAddress();
loadRail();

// 送信処理（ダミー）
document.getElementById("submitBtn").addEventListener("click", async () => {
  alert("送信処理は後で実装します");
});
