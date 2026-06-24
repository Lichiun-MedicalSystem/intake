# 交班紀錄 — intake（6 院區問診表單）
> 最後更新：2026-04-18

## 目前狀態
- 已正式上線，六院區病患候診時掃 QR code 填寫
- GitHub Pages 託管：https://lichiun-medicalsystem.github.io/intake/
- Repo：`Lichiun-MedicalSystem/intake`（獨立 git repo）

## 技術架構
- 前端：單一 `index.html`（純 HTML/CSS/JS，無框架）+ GitHub Pages
- 後端：Google Apps Script（`apps_script.js` 為參考版，實際程式碼在 Google 端）
- 資料：Google Sheet（Spreadsheet ID `17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E`）
- 部署 ID：`AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q`

## 已完成功能
- ✅ 基本資料 + 症狀 chip 多選（發燒/ENT/腸胃含天數、用藥）
- ✅ 多語言（繁中/英/越/泰/印尼）— `?lang=vi` URL 參數預選
- ✅ 多院區 QR code（`qrcode_{lichiun,yichiun,renchiun,zhichiun,jiachiun,shengchiun}.png`）
- ✅ 初診患者基本資料填寫流程（身分證、生日、電話、地址）
- ✅ 民國年日期（7 位數）native date picker + 自動轉換
- ✅ 個資法多語化、身高欄位、手機版語言列優化（最新 commit `a7c6d3b`）

## 跨專案依賴
- **lab_clipper `intake_viewer.py`** 讀取今日問診（透過 Apps Script `doGet?action=today&branch=...`）
- 症狀欄位值固定中文（資料層不跟著 UI 語言變動），讓 intake_viewer 英文醫學摘要有固定 key

## 已知問題 / 坑
- Apps Script 是「容器綁定腳本」，`clasp list` 找不到 — 用 CLAUDE.md 記的 Script ID
- `clasp push` 要覆蓋 `程式碼.js`，不可另增 `apps_script.js`（HEADERS 重複會編譯失敗）
- `mode: 'no-cors'` POST 無法讀 response — 前端只能假設成功

## 待辦
- [ ] APPS_SCRIPT_URL 防濫用機制（rate limiting）
- [ ] 評估自訂網域（如 `form.lichun.com.tw`）提升專業形象

## 下一步
- 穩定運行中，無排定新功能；新增院區照 CLAUDE.md 流程（產 QR code + deploy.bat 加選項）

---

## 進行中：居家醫療需求登記（v1，brainstorm 階段，2026-06-22）

### 已拍板決策
1. **範圍 = 只做病人端「需求登記」**。附圖那張健保「居家醫療收案申請書」（專業端：ADL/肌力/ICD/醫囑/簽章）**維持紙本人工填**，不數位化。
2. **一位中央專人統籌全六院區** → 因此**不整合進個管中樞**（不動 `event_store.py` / `case_center.html` / 掃描機）。中央專人改用「看集中清單 + Telegram 通知」。
3. **不開新專案**，全部落在本 repo（`intake_form/`）：`index.html` + Apps Script（`程式碼.js`）。

### 設計（待專人討論後定案）
- **表單分流**：最前面加 router 頁 → 〔📋 看診問診填寫〕走現有流程**零改動**；〔🏠 居家醫療需求申請〕→ 個資同意（目的改「居家醫療照護評估與聯繫」）→ 居家申請表 → 「專人會盡快聯絡您」。
- **居家申請欄位（2026-06-25 承辦人員定案 = 附圖第一部分基本資料整段）**：
  病人姓名✅、性別(男/女)、身分證號、出生日期(年月日→民國)、電話(日)/(夜)、居住地址、
  居住狀況(獨居/家人同住/親友同住/其他)、常用語言(國語/台語/客家語/原住民族語/其他)、
  主要聯絡人、與病人關係、聯絡電話/手機、
  社福身分別(無/低收入戶/中低收入戶/榮民/原住民/領有身心障礙證明)。
  - **院區 = 下拉欄位讓家屬/專員自填**（含「不確定/由專人安排」）；不用 QR 自動帶 —— 因為要支援「帶出門跑長照、家屬掃碼」情境（無院區脈絡）。
  - ✅ 加「申請原因/需求簡述」+「希望聯絡時段」（承辦人員確認保留）。
  - ✅ 加「📎 慢性處方箋拍照（選填，可多張）」：前端壓縮→base64 隨表單送→Apps Script 存私有 Drive 資料夾→Sheet 寫回照片連結。
  - ✅ 加返回鍵（同意頁/表單頁）。
  - ⚠️ 收**身分證號 + 慢箋照片** → PII 極重：Sheet 鎖私有、Drive 資料夾只分享給承辦人員。
- **後端**：同一試算表（`17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E`）**新增分頁「居家醫療申請」**；`doPost` 依 `formType`(intake/homecare) 決定寫哪頁；多一欄「處理狀態」(預設「待聯絡」)。
- **通知**：Apps Script `doPost` 收到 homecare 時 `UrlFetchApp.fetch` 打 Telegram sendMessage 推給中央專人（推姓名/電話/院區/需求）。純 Apps Script 內完成，不依賴 mini PC。

### ⚠️ 改 Apps Script 注意（CLAUDE.md 既有坑）
- 直接改 `程式碼.js`，**不要新增 apps_script.js 致 HEADERS 重複宣告**（會整支編譯壞、連問診 doGet 都掛）。
- `getActiveSheet()` → 要改成 `getSheetByName()` 分流寫入。
- Deploy ID（不要產生新 URL）：`AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q`

### ❓ 待確認
1. 入口頁放最前面（現有問診零改動）vs 「同意後再分流」——建議前者，待最終拍板。
2. ✅ 欄位清單全定案（附圖第一部分 + 院區下拉 + 申請說明 + 慢箋拍照 + 返回鍵）。
3. Telegram 通知推給誰（chat_id）？沿用薰承姍 bot 還是另設？
4. ✅ 確認「統一由專一承辦人員處理」。看 Google Sheet 分頁 + 手動改狀態是否足夠？還是要清單介面？
5. 公開表單濫用防護：v1 先裸奔接受風險，OK？
6. 2026-06-25 已做靜態 mockup：`intake_form/homecare_mockup.html`（純參考、未接後端）。

### 下一步
專人討論完 → 回填上面 ❓ → 進 writing-plans 寫實作計畫 → 改 index.html + 程式碼.js → clasp 重新部署（同 Deploy ID）。
