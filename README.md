# Real Estate Simple Estimation App (calc集約型構成)

不動産の**簡易査定**を行うミニアプリ。  
**calc 集約型**＝「査定計算に関する**材料（baseline）**と**レシピ（strategy）**を `server/calc/` に集約」し、データとロジックの差し替えを最小コストにします。

---

## 1. 目的と哲学

- まずは **v1（単純計算）で通す** → 後から **v2（本格計算）へ差し替え**  
- **JSON を正（SSOT）** とし、住所/沿線は既存 JSON 資産を再利用  
- 仕様変更時は **`server/calc/`（査定）** と **`server/datasets/`（辞書）** を見れば迷わない

---

## 2. ディレクトリ構成

