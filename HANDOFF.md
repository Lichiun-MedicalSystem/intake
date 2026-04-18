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
