// public/app/app.js

// 簡易ロジック（デモ用）
function calculatePrice() {
  const area = Number(document.getElementById("area").value) || 0;
  const walk = Number(document.getElementById("walk").value) || 0;
  const year = Number(document.getElementById("year").value) || new Date().getFullYear();

  // 仮の基準単価（㎡あたり）
  let pricePerSqm = 300000; // 30万円/㎡

  // 徒歩補正（1分ごとに -1%）
  pricePerSqm *= (1 - walk * 0.01);

  // 築年補正（2000年基準）
  if (year < 2000) {
    pricePerSqm *= 0.8;
  }

  const estimate = Math.round(pricePerSqm * area);

  document.getElementById("price-display").innerText = estimate.toLocaleString() + " 円";
  document.getElementById("price-range").innerText = 
    Math.round(estimate * 0.9).toLocaleString() + " ~ " + 
    Math.round(estimate * 1.1).toLocaleString() + " 円";
}

// 入力のたびにリアルタイム計算
["area", "walk", "year"].forEach(id => {
  document.getElementById(id).addEventListener("input", calculatePrice);
});

// フォーム送信
document.getElementById("submit-btn").addEventListener("click", async () => {
  const data = {
    userType: document.querySelector("input[name=userType]:checked").value,
    prefecture: document.getElementById("prefecture").value,
    city: document.getElementById("city").value,
    town: document.getElementById("town").value,
    chome: document.getElementById("chome").value,
    type: document.getElementById("type").value,
    area: document.getElementById("area").value,
    year: document.getElementById("year").value,
    line: document.getElementById("line").value,
    station: document.getElementById("station").value,
    walk: document.getElementById("walk").value,
    corner: document.getElementById("corner").checked,
    aspect: document.getElementById("aspect").value,
    structure: document.getElementById("structure").value,
    floor: document.getElementById("floor").value,
    email: document.getElementById("email").value
  };

  try {
    const res = await fetch("/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    alert("送信しました: " + JSON.stringify(result));
  } catch (err) {
    alert("送信エラー: " + err.message);
  }
});
