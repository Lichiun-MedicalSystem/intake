# 居家醫療需求申請 — 設計文件（spec）

- 日期：2026-07-02
- 狀態：設計定案，待寫實作計畫
- 相關 repo：`Lichiun-MedicalSystem/intake`（表單 + Apps Script）、`Lichiun-MedicalSystem/clinic-scheduler`（清單頁）
- Mockup：`intake_form/homecare_mockup.html`

---

## 1. 目標

在現有問診表單網頁入口，新增「居家醫療需求申請」流程：病人或家屬線上填寫健保居家醫療收案申請書「第一部分：基本資料」+ 選填慢箋照片，送出後由**一位中央專人**（全六院區統籌）在 clinic-scheduler 的登入後頁面查看清單、電話聯繫、記錄處理狀態。

## 2. 非目標（不做）

- ❌ **不數位化**附圖那張健保「居家醫療收案申請書」的專業端（ADL 巴氏量表、肌力分級、ICD 診斷碼、醫囑、照護計畫、簽章）—— 維持紙本，由醫療人員到府評估時填，具法律效力。
- ❌ **不整合進 Lab Clipper 個管中樞**（`event_store.py` / `case_center.html` / 掃描機一律不動）。個管中樞綁各院區機器給各院區護理師用；居家 lead 由中央一人處理，集中在 clinic-scheduler 一頁更合適。
- ❌ **不做資料搬移 / 雙資料源**：intake Sheet 為單一資料源，clinic-scheduler 即時讀它，不複製、不刪 intake（見決策 D6）。
- ❌ v1 **不做**公開表單濫用防護、不做保存期限自動清理（見 §9 延後項）。

## 3. 關鍵決策

| # | 決策 | 理由 |
|---|------|------|
| D1 | 只做病人端「需求登記」，專業端表格維持紙本 | 附圖是到府評估後填的正式文件，病人手機不可能填 |
| D2 | 一位中央專人統籌全六院區 | 承辦人員確認；決定了「集中一頁」而非「各院區個管中樞」 |
| D3 | 入口頁放最前面（router）分流〔問診〕/〔居家〕 | 現有問診流程零改動、風險最低 |
| D4 | 欄位 = 附圖第一部分整段 + 院區下拉 + 申請說明 + 慢箋拍照 | 承辦人員定案 |
| D5 | 通知走 **Email** 給 `chiao1988ju@gmail.com` | 承辦人員不使用 Telegram；Apps Script `MailApp` 零設定 |
| D6 | 單一資料源 = intake Sheet；clinic-scheduler 即時讀 | 「省空間」是假需求（Sheet 上限千萬格）；即時性已由讀同一份 Sheet 滿足 |
| D7 | 清單頁做進 **clinic-scheduler**（登入後） | 已有登入系統（PII 天生受保護）+ 已有 gspread + Service Account |
| D8 | 慢箋照片走 **A 模式**（知道連結可看）+ 提示只拍藥物 | A 最快；「只拍藥物名稱、不拍個資」大幅降低外流風險 |
| D9 | 院區改用**下拉欄位**讓家屬/專員自選（非 QR 自動帶） | 要支援「帶出門跑長照、家屬掃碼」情境（無院區脈絡） |

## 4. 架構與資料流

```
[病人/家屬手機]
  intake_form/index.html  ── router → 居家分支 → 同意 → 表單(+慢箋拍照)
        │  POST (no-cors, JSON, formType=homecare, 慢箋 base64 陣列)
        ▼
[Apps Script doPost]（擁有 intake 試算表的 Google 帳號）
  1) 寫入「居家醫療申請」分頁（處理狀態=待聯絡）
  2) 慢箋 base64 → DriveApp 存進「居家醫療慢箋」資料夾
       → 設「知道連結可看」→ 連結寫回該列
  3) MailApp.sendEmail → chiao1988ju@gmail.com（姓名/電話/院區/需求）
        │
        ▼
[Google Sheet「居家醫療申請」分頁]  ←── 單一資料源
        ▲   讀清單 / 回寫處理狀態（gspread, Service Account 編輯權）
        │
[clinic-scheduler 後端 FastAPI]  GET /api/homecare、POST /api/homecare/{row}/status
        │  (登入後 API)
        ▼
[clinic-scheduler 前端 Next.js]  /homecare 卡片清單（登入後可見）
  承辦人員：看清單 → 點電話直撥 → 看慢箋縮圖 → 按「已聯絡/已收案」回寫狀態
```

## 5. 表單欄位（intake_form/index.html）

新增最前面 router 頁：〔📋 看診問診填寫〕→ 走現有流程（不改）；〔🏠 居家醫療需求申請〕→ 居家同意頁（蒐集目的改「居家醫療照護評估與聯繫」）→ 居家申請表 → 感謝頁「專人會盡快聯絡您」。返回鍵在同意頁/表單頁。

居家申請表欄位（`*` = 必填）：

| 區塊 | 欄位 | 型別 |
|------|------|------|
| 🏥 申請院區 | 申請/服務院區 `*` | 下拉：立群/義群/仁群/智群/佳群/聖群/不確定—由專人安排 |
| 👤 病人基本資料 | 病人姓名 `*` | text |
| | 性別 | 單選 男/女 |
| | 身分證號 | text |
| | 出生日期 | date → 存民國 |
| | 電話（日）/（夜） | tel × 2 |
| | 居住地址 | text |
| | 居住狀況 | 單選 獨居/家人同住/親友同住/其他 |
| | 常用語言 | 單選 國語/台語/客家語/原住民族語/其他 |
| | 社會福利身分別 | 單選 無/低收入戶/中低收入戶/榮民/原住民/領有身心障礙證明 |
| 📞 主要聯絡人 | 姓名 | text |
| | 與病人關係 | text |
| | 聯絡電話/手機 `*` | tel |
| 📝 申請說明 | 申請原因/需求簡述 | textarea |
| | 希望聯絡時段 | 單選 上午/下午/晚上/皆可 |
| 📎 慢性處方箋拍照（選填） | 照片（可多張） | file, `accept=image/*` `capture=environment` |

慢箋拍照區下方紅字提示：**「⚠️ 請盡量只拍藥物名稱／劑量的部分，避免拍到姓名、身分證等個人資料。」**

## 6. Google Sheet 分頁「居家醫療申請」

同一份問診試算表（`17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E`）新增分頁，欄位（英文 key / 中文表頭）：

`timestamp` 時間戳記、`date` 日期時間、`branch` 申請院區、`patientName` 病人姓名、`sex` 性別、`nationalId` 身分證號、`birthday` 出生日期、`phoneDay` 電話(日)、`phoneNight` 電話(夜)、`address` 居住地址、`livingStatus` 居住狀況、`spokenLanguage` 常用語言、`welfareStatus` 社福身分別、`contactName` 主要聯絡人、`contactRelation` 與病人關係、`contactPhone` 聯絡電話、`reason` 申請原因、`preferredTime` 希望聯絡時段、`rxPhotoUrls` 慢箋照片連結（多張逗號分隔）、`language` 填寫語言、`status` 處理狀態、`handledBy` 處理人、`handledAt` 處理時間、`note` 備註。

- `status` 預設「待聯絡」；三態：待聯絡 / 已聯絡 / 已收案。
- 前導 0 欄位（nationalId/phone*/birthday）設純文字格式（沿用現有問診寫法）。

## 7. Apps Script 變更（`程式碼.js`）

- `doPost`：讀 `data.formType`。`homecare` → `getSheetByName('居家醫療申請')` 寫入 + 慢箋存 Drive + Email 通知；否則沿用現有問診寫入。
- 慢箋：`data.rxPhotos`（base64 陣列）逐張 `Utilities.newBlob` → `DriveApp` 存進「居家醫療慢箋」資料夾（不存在則建）→ `setSharing(ANYONE_WITH_LINK, VIEW)` → 收集連結寫入 `rxPhotoUrls`。前端送出前先壓縮（canvas 縮到 ~1280px、JPEG 0.7）。
- Email：`MailApp.sendEmail(收件者, 主旨, 內文)`，內文含姓名/電話/院區/需求 + Sheet 連結。
- ⚠️ **直接改 `程式碼.js`，不要新增 `apps_script.js`**（HEADERS 重複宣告會整支編譯壞、連問診 doGet 都掛 — 見 CLAUDE.md）。
- 部署：`clasp push -f` → `clasp version` → `clasp deploy -V N -i AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q`（**同 Deploy ID，URL 不變**）。

## 8. clinic-scheduler 變更

**後端（FastAPI，`backend/`）**
- `GET /api/homecare`：gspread 讀「居家醫療申請」分頁 → 回列表（登入後）。
- `POST /api/homecare/{row}/status`：更新該列 `status` + `handledBy`（取自 token）+ `handledAt`。
- gspread `update()` 用 kwargs（`update(values=..., range_name=...)`）。

**前端（Next.js，`frontend/`）**
- 新頁 `/homecare`：卡片清單（姓名、`tel:` 點擊直撥、院區、需求、慢箋 `<img>` 縮圖點開放大）、篩選分頁（待聯絡/已聯絡/已收案）、狀態按鈕 → 呼叫回寫 API。
- Sidebar 加導覽連結；沿用現有登入保護。**v1：任何登入者皆可看 `/homecare`**（角色細分權限延後，量小且內部）。
- ⚠️ 寫完立刻刪未使用變數（`@typescript-eslint/no-unused-vars` 在 Vercel build 是 hard error）。
- 部署：`git push origin master` → Render + Vercel 自動 redeploy。

## 9. 前置作業與延後項

**前置（實作前要完成）**
1. 問診試算表 `17Zv7…` **share 給 `clinic-scheduler@ai-assistant-492908.iam.gserviceaccount.com`（編輯權限）**。
2. 「居家醫療慢箋」Drive 資料夾 share 給 `chiao1988ju@gmail.com`（檢視）。
3. 承辦人員 `chiao1988ju@gmail.com` 在 clinic-scheduler `users` 分頁開登入帳號（帳密轉交）。
4. 確認擁有 intake Apps Script 的 Google 帳號（Drive 擁有權 + MailApp 每日配額；消費者帳號 100 封/日足夠）。

**延後（v1.1+）**
- 保存期限自動清理：Apps Script 定時觸發，狀態=已收案且超過 N 天 → 刪該列 + 刪對應慢箋 Drive 檔（資料最小化）。
- 公開表單濫用防護（honeypot / 簡易驗證），被亂填再加。
- 慢箋改 B 模式（後端代理、只給登入者看），若 A 模式外流風險不可接受再升級。

## 10. 分階段實作（可獨立驗證）

- **Phase 1（只動 intake_form）**：router 分流 + 居家表單 + Apps Script 寫新分頁 + Email 通知 + 慢箋存 Drive(A)。
  驗收：手機送單 → Sheet 出現該列 + 收到 Email + 慢箋連結可開。
- **Phase 2（clinic-scheduler 後端）**：讀清單 + 回寫狀態 API。
  驗收：curl / 單元測試通過；需先完成前置 #1。
- **Phase 3（clinic-scheduler 前端）**：`/homecare` 清單頁 + 導覽 + 登入保護。
  驗收：承辦人員登入 → 看到清單、點電話、看慢箋、改狀態成功回寫。

## 11. 隱私備註

- 表單收身分證號 + 慢箋照片 → 高敏感 PII。Sheet 務必私有、Drive 資料夾只分享承辦人員；clinic-scheduler 清單頁一律登入後才可見。
- 慢箋 A 模式靠「只拍藥物」降低外流衝擊；長期若要更嚴謹走 B 模式或加保存期限清理。
