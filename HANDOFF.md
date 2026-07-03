# 交班紀錄 — intake（六院區問診 + 居家醫療申請表單）
> 最後更新：2026-07-03

## 目前狀態
- ✅ 問診表單：六院區上線中（掃 QR 填 → Google Sheet → Lab Clipper 桌面讀今日）
- ✅ 居家醫療需求申請（Phase 1）：2026-07-03 完成上線
- ⬜ Plan 2：clinic-scheduler 清單頁（未做）

## 架構
- 前端：單一 `index.html`（純 HTML/CSS/JS）+ GitHub Pages（**public** repo）
  - 入口 router 分流〔📋 問診〕/〔🏠 居家醫療〕
  - `?form=homecare` 直接進居家（專屬 QR `qrcode_homecare.png`）；`?branch=` 預選院區
- 後端：Google Apps Script（`apps_script.js` = 公開參考版、email 已遮蔽；真值只在 Google 端 `程式碼.js`）
  - `doPost` 依 `formType` 分流；居家 → 慢箋存 Drive(A 模式) + MailApp 通知承辦人

## 關鍵 ID / 資源
- 問診主表：`17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E`
- 居家專屬試算表：`1nnhrmL5Bt0ZQKhdScbbuQEgP4_W3J2g9KRYH0Dxsi84`（存 Script Prop `HOMECARE_SS_ID`；只分享承辦人）
- Apps Script Deploy ID（勿換）：`AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q`（現 @16）
- 慢箋 Drive 資料夾：「居家醫療慢箋」；承辦人 email 在 Google 端 程式碼.js

## 待做項目
1. **Plan 2 = clinic-scheduler 清單頁**：後端讀居家專屬試算表 `1nnhrmL5…` + 前端 `/homecare`（登入後）。前置：該表 share 給 `clinic-scheduler@ai-assistant-492908.iam.gserviceaccount.com`（編輯）+ 承辦人開 clinic-scheduler 登入帳號。
2. （可選）六院區各自居家 QR（`?form=homecare&branch=X`）
3. （可選）git 歷史徹底清 email；慢箋改 B 模式（登入才可看）；慢箋 EXIF 轉向

## 已知問題 / 坑
- clasp push 只改 `程式碼.js`，勿新增第二含 `HEADERS` 檔（編譯壞、連 doGet 都掛）
- **問診 doPost/doGet 用 `getSheets()[0]`**：加第二分頁後 `getActiveSheet()` 會被「人在 UI 點分頁」污染 → 問診資料損毀（最終 review 抓到，已修，**勿回退**）
- GitHub Pages 偶發「build 成功、deploy 卡 `try again later`」= GitHub 端間歇故障（非程式）；重推或等即可
- 新增 Drive/Gmail scope 後擁有者要在編輯器跑 `__authorizeHomecareScopes` 授權一次（已做）
- push 需 `gh auth switch -u Lichiun-MedicalSystem`（intake 是集團 repo）

## 關鍵決策
- 居家只做病人端登記（專業端「收案申請書」維持紙本、具簽章法律效力）
- 一位中央承辦人統籌 → 居家資料**獨立試算表**只分享她（Google 無法只分享單一分頁，隱藏分頁不安全）
- 慢箋 A 模式（知道連結可看）+ 提示「只拍藥物」降低外流衝擊
