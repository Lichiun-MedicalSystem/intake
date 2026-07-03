# 居家醫療需求申請 — Plan 1（intake_form / Phase 1）實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有問診表單網頁加「居家醫療需求申請」分流，病人/家屬填基本資料 + 選填慢箋拍照，送出後資料進 Google Sheet 新分頁、慢箋存 Drive、Email 通知承辦人員。

**Architecture:** 純前端 `index.html`（無框架）新增 router 分流頁 + 居家表單畫面；沿用現有 `mode:'no-cors'` + `text/plain` POST JSON 到同一支 Apps Script。Apps Script（`程式碼.js`）依 `formType` 分流：`homecare` 寫新分頁「居家醫療申請」+ 慢箋 base64 存 Drive + `MailApp` 通知。單一資料源 = 該 Sheet 分頁（Plan 2 的 clinic-scheduler dashboard 之後讀它）。

**Tech Stack:** HTML/CSS/vanilla JS、Google Apps Script（`SpreadsheetApp` / `DriveApp` / `MailApp`）、clasp 部署。驗證用 Playwright（webapp-testing skill）跑前端流程 + 手動 end-to-end 驗 Apps Script。

## Global Constraints

- 無框架、單一 `intake_form/index.html`；沿用現有 `.header/.section/.field/.chip/.consent-*` 視覺與 `showScreen()` 切換模式。
- 送出用 `fetch(APPS_SCRIPT_URL, {method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(flat)})`；no-cors 無法讀 response，前端一律假設成功。
- **Apps Script 只改 `程式碼.js`（Google 端主檔）**；本 repo 的 `apps_script.js` 是參考版，最後同步更新。**絕不新增第二個含 `HEADERS` 宣告的檔**（重複宣告會整支編譯壞、連 doGet 都掛）。
- 部署走 clasp 三步驟，**沿用既有 Deploy ID `AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q`，URL 不變**。
- Spreadsheet ID：`17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E`；新分頁名稱：`居家醫療申請`。
- 慢箋照片：前端壓縮到最長邊 ~1280px、JPEG 0.7；Apps Script 存進 Drive 資料夾「居家醫療慢箋」，A 模式 `setSharing(ANYONE_WITH_LINK, VIEW)`。
- Email 通知收件者：`REDACTED@example.com`。
- **居家表單 v1 繁中 only**（不接現有 5 語 i18n）；多語為延後項。
- 民國年轉換沿用現有寫法：`String(parseInt(y)-1911).padStart(3,'0') + m + d`。
- 台灣民國 7 位數日期；前導 0 欄位（身分證/電話/生日）在 Apps Script 寫入時設純文字格式 `@`。

**前置（開工前確認一次，非程式碼）：** 確認擁有此 Apps Script 的 Google 帳號可用 `clasp`（`clasp login` 狀態）、且該帳號 `MailApp` 每日配額足夠（消費者帳號 100 封/日）。慢箋 Drive 資料夾由腳本自動建立，無須手動預建。

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `intake_form/index.html` | Modify | 新增 router 分流頁、居家同意/表單/感謝畫面、居家專屬 CSS（scoped 於 `#hcRoot`）、router 與居家送出 JS |
| `程式碼.js`（Google 端，經 clasp） | Modify | `doPost` 依 `formType` 分流；新增 `HOMECARE_HEADERS`、`handleHomecare_()`、Drive 存檔、Email 通知 |
| `intake_form/apps_script.js` | Modify | 同步 Google 端變更（參考版，最後一步更新） |
| `intake_form/CLAUDE.md`／`HANDOFF.md` | Modify | 記新分頁、formType 分流、Deploy 完成 |

**Playwright 驗證檔（暫時，驗完可留）：** `intake_form/tests/homecare_flow.spec.mjs`

---

## Task 1: Router 分流頁 + 現有流程改接

**Files:**
- Modify: `intake_form/index.html`（新增 `#s-router` 於 `#visitScreen` 之前；改 `showScreen()`）

**Interfaces:**
- Produces: `showScreen(id)` 支援新 id `'router'`、`'hcConsent'`、`'hcForm'`、`'hcThanks'`；全域 `startHomecare()` 進入居家分支。

- [ ] **Step 1: 加 router HTML（插在 `<div class="visit-screen" id="visitScreen">` 之前）**

```html
<!-- ═══ 入口分流 ═══ -->
<div class="visit-screen" id="s-router">
  <div class="header">
    <img src="logo.png" alt="立群" class="logo-img">
    <h1>立群醫療體系</h1>
    <p class="subtitle">請選擇您要辦理的項目</p>
  </div>
  <div class="visit-choices">
    <div class="visit-choice" id="routerIntake">
      <div class="visit-choice-icon new">📋</div>
      <div>
        <div class="visit-choice-title">看診問診填寫</div>
        <div class="visit-choice-desc">初診 / 複診，看診前填寫問診表</div>
      </div>
    </div>
    <div class="visit-choice" id="routerHomecare">
      <div class="visit-choice-icon return">🏠</div>
      <div>
        <div class="visit-choice-title">居家醫療需求申請</div>
        <div class="visit-choice-desc">行動不便、需到府醫療服務（抽血／慢箋／傷口換藥等）</div>
      </div>
    </div>
  </div>
  <div class="footer">立群醫療體系 &copy; 2026</div>
</div>
```

- [ ] **Step 2: 改 `showScreen()`（把新 id 納入切換集合）**

找到現有：
```js
  function showScreen(id) {
    ['visitScreen', 'consentScreen', 'regScreen', 'formContainer'].forEach(s => {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    });
    window.scrollTo(0, 0);
  }
```
改為：
```js
  function showScreen(id) {
    ['s-router', 'visitScreen', 'consentScreen', 'regScreen', 'formContainer',
     'hcConsent', 'hcForm', 'hcThanks'].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
    window.scrollTo(0, 0);
  }
```

- [ ] **Step 3: `#visitScreen` 預設隱藏、router 綁事件**

在 `#visitScreen` 的 class 加 `hidden`（`<div class="visit-screen hidden" id="visitScreen">`），讓 router 成為首屏。
在 `// ── 初診/複診選擇 ──` 那段之前，加 router 綁定：
```js
  // ── 入口分流 ──
  document.getElementById('routerIntake').addEventListener('click', () => {
    showScreen('visitScreen');
  });
  document.getElementById('routerHomecare').addEventListener('click', () => {
    showScreen('hcConsent');
  });
```

- [ ] **Step 4: 建 Playwright 驗證檔 `intake_form/tests/homecare_flow.spec.mjs`**

```js
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';
import path from 'path';

const FORM = pathToFileURL(path.resolve('intake_form/index.html')).href;

test('router 顯示兩個入口，問診走原流程、居家走居家分支', async ({ page }) => {
  await page.goto(FORM);
  await expect(page.locator('#routerIntake')).toBeVisible();
  await expect(page.locator('#routerHomecare')).toBeVisible();

  await page.locator('#routerIntake').click();
  await expect(page.locator('#choiceNew')).toBeVisible();   // 現有初診/複診頁

  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await expect(page.locator('#hcConsent')).toBeVisible();    // 居家同意頁（Task 2 後才存在）
});
```

- [ ] **Step 5: 跑 Playwright（此時「居家分支」子測試會因 `#hcConsent` 尚未建立而失敗，router/問診子項應通過）**

用 webapp-testing skill 跑：`npx playwright test intake_form/tests/homecare_flow.spec.mjs`
Expected：router 兩個入口可見、`#routerIntake → #choiceNew` 通過；`#hcConsent` 斷言 FAIL（下一個 task 補齊）。

- [ ] **Step 6: Commit**

```bash
git add intake_form/index.html intake_form/tests/homecare_flow.spec.mjs
git commit -m "feat(homecare): 加入口分流 router 頁，問診走原流程"
```

---

## Task 2: 居家同意頁 + 申請表 + 感謝頁（含返回鍵、院區下拉）

**Files:**
- Modify: `intake_form/index.html`（新增居家 CSS scoped 於 `#hcRoot`、3 個畫面、返回/送出 JS 骨架）

**Interfaces:**
- Consumes: `showScreen()`（Task 1）
- Produces: DOM 節點 `#hcConsent #hcForm #hcThanks`；表單欄位 id：`hcBranch, hcPatientName, hcSex, hcNationalId, hcBirthday, hcPhoneDay, hcPhoneNight, hcAddress, hcLiving, hcLang, hcWelfare, hcContactName, hcContactRelation, hcContactPhone, hcReason, hcPreferredTime`；chip 群組用 `.hc-chips[data-single]` + `.hc-chip.on`；全域 `hcPick(el)`。

- [ ] **Step 1: 貼入居家專屬 CSS（scoped）**

把 `intake_form/homecare_mockup.html` `<style>` 中「router 之後」的這些規則段落複製進 `index.html` 的 `<style>` 末端，**每條選擇器前綴 `#hcRoot ` 以隔離**（避免與問診表 `.section/.chip/.field` 衝突），並把 class 名 `.choice→.hc-choice`、`.chip→.hc-chip`、`.chips→.hc-chips`、`.section→.hc-section`、`.field→.hc-field`、`.photo-zone→.hc-photo-zone`、`.thumbs→.hc-thumbs`、`.thumb→.hc-thumb`、`.back-btn→.hc-back`、`.note→.hc-note`、`.two→.hc-two`、`.btn/.btn-primary/.btn-ghost→.hc-btn/.hc-btn-primary/.hc-btn-ghost`、`.submit→.hc-submit`、`.card/.card-title/.consent-text/.btn-row→.hc-card/.hc-card-title/.hc-consent-text/.hc-btn-row`、`.thanks→.hc-thanks` 一併改名。`select` 規則前綴 `#hcRoot select`。

> 目的：居家畫面自帶樣式、與現有問診表零干擾。mockup 已是設計定稿，直接沿用其視覺。

- [ ] **Step 2: 貼入 3 個居家畫面（包在 `#hcRoot` 內，插在 `#formContainer` 之後）**

從 `homecare_mockup.html` 複製 `#s-consent`、`#s-form`、`#s-thanks` 三個 `<section>`，改成：
- 外層包 `<div id="hcRoot">…</div>`
- section id 改為 `id="hcConsent"`、`id="hcForm"`、`id="hcThanks"`，並各加 `class="hidden"`（初始隱藏）
- 內部 class 依 Step 1 改名（`.hc-*`）
- 返回鍵 `onclick`：hcConsent 的返回 → `showScreen('s-router')`；hcForm 的返回 → `showScreen('hcConsent')`
- 同意按鈕 → `showScreen('hcForm')`；不同意 → `showScreen('s-router')`
- 表單欄位補上 Interfaces 指定的 `id`（院區 `<select id="hcBranch">`、`<input id="hcPatientName">`、`<input id="hcNationalId">`、`<input type="date" id="hcBirthday">`、`<input id="hcPhoneDay">`、`<input id="hcPhoneNight">`、`<input id="hcAddress">`、`<input id="hcContactName">`、`<input id="hcContactRelation">`、`<input id="hcContactPhone">`、`<textarea id="hcReason">`）
- **chip 群組容器的 `data-field` 值必須精確對應**（送出時 `collectHomecare()` 用它取值）：性別 `data-field="sex"`、居住狀況 `data-field="living"`、常用語言 `data-field="lang"`、社福身分別 `data-field="welfare"`、希望聯絡時段 `data-field="preferred"`。範例：`<div class="hc-chips" data-single data-field="sex">`
- 送出按鈕：`<button class="hc-btn hc-btn-primary" id="hcSubmitBtn">送出申請</button>`
- 移除 mockup 左上角 `.mock-tag` 那行

- [ ] **Step 3: 加居家 chip 單選 JS（`hcPick`）**

```js
  // ── 居家 chip 單選（記錄選值到 dataset）──
  function hcPick(el) {
    const box = el.parentElement;
    box.querySelectorAll('.hc-chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    box.dataset.value = el.textContent.trim();
  }
```
把居家畫面裡 chip 的 `onclick="pick(this)"` 全部改成 `onclick="hcPick(this)"`。

- [ ] **Step 4: 跑 Playwright 驗證居家畫面出現、返回鍵可用**

擴充 `homecare_flow.spec.mjs` 加：
```js
test('居家：同意→表單→返回，欄位齊全', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await expect(page.locator('#hcConsent')).toBeVisible();
  await page.getByText('我已閱讀並同意').click();
  await expect(page.locator('#hcForm')).toBeVisible();
  for (const id of ['hcBranch','hcPatientName','hcNationalId','hcContactPhone']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }
  await page.locator('#hcForm .hc-back').click();
  await expect(page.locator('#hcConsent')).toBeVisible();
});
```
Run: `npx playwright test intake_form/tests/homecare_flow.spec.mjs`
Expected: 全部 PASS（含 Task 1 的居家子項現在也過）。

- [ ] **Step 5: Commit**

```bash
git add intake_form/index.html intake_form/tests/homecare_flow.spec.mjs
git commit -m "feat(homecare): 居家同意/申請表/感謝頁 + 院區下拉 + 返回鍵"
```

---

## Task 3: 慢箋拍照 — 前端壓縮 + 預覽

**Files:**
- Modify: `intake_form/index.html`（`addHcPhotos()` 壓縮 + 縮圖；全域陣列 `hcPhotos`）

**Interfaces:**
- Consumes: `#rxFile`（Task 2 貼入的 file input，需確認 `accept="image/*" capture="environment" multiple onchange="addHcPhotos(this)"`）、`#rxThumbs` 容器
- Produces: 全域 `let hcPhotos = []`（元素為壓縮後 dataURL 字串，`data:image/jpeg;base64,...`）；`addHcPhotos(input)`

- [ ] **Step 1: 加壓縮 + 預覽 JS**

```js
  // ── 慢箋照片：壓縮到最長邊 1280、JPEG 0.7，存 dataURL ──
  let hcPhotos = [];
  function addHcPhotos(input) {
    const box = document.getElementById('rxThumbs');
    [...input.files].forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const max = 1280;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            if (w >= h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          hcPhotos.push(dataUrl);
          const thumb = document.createElement('img');
          thumb.className = 'hc-thumb';
          thumb.src = dataUrl;
          box.appendChild(thumb);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
    input.value = ''; // 允許重複選同一檔
  }
```
確認 file input 的 `onchange` 是 `addHcPhotos(this)`（若 Task 2 貼入時為 mockup 的 `addPhotos`，改名為 `addHcPhotos`）。

- [ ] **Step 2: Playwright 驗證選圖後產生縮圖 + `hcPhotos` 有值**

擴充測試（用 Playwright 的 `setInputFiles` 塞一張小圖）：
```js
test('慢箋：選圖後出現縮圖且 hcPhotos 累積', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.getByText('我已閱讀並同意').click();
  // 1x1 png
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
  await page.locator('#rxFile').setInputFiles({ name:'rx.png', mimeType:'image/png', buffer: png });
  await expect(page.locator('#rxThumbs .hc-thumb')).toHaveCount(1);
  const n = await page.evaluate(() => window.hcPhotos ? window.hcPhotos.length : (typeof hcPhotos!=='undefined'?hcPhotos.length:0));
  expect(n).toBe(1);
});
```
Run: `npx playwright test intake_form/tests/homecare_flow.spec.mjs`
Expected: PASS（縮圖數 1、hcPhotos 長度 1）。若 `hcPhotos` 非全域可見，將宣告移至可被 `page.evaluate` 讀到的作用域（掛到 `window.hcPhotos`）。

- [ ] **Step 3: Commit**

```bash
git add intake_form/index.html intake_form/tests/homecare_flow.spec.mjs
git commit -m "feat(homecare): 慢箋拍照前端壓縮 + 縮圖預覽"
```

---

## Task 4: 居家送出 — 驗證 + 組 payload + POST

**Files:**
- Modify: `intake_form/index.html`（`#hcSubmitBtn` handler、`collectHomecare()`）

**Interfaces:**
- Consumes: `APPS_SCRIPT_URL`（既有常數）、表單欄位 id（Task 2）、`hcPhotos`（Task 3）、`showScreen()`
- Produces: POST body 為 `JSON.stringify(flat)`，`flat` 欄位見 Step 1（**`formType:'homecare'` 為分流鍵**）

- [ ] **Step 1: 加 `collectHomecare()` + 送出 handler**

```js
  // ── 居家：蒐集欄位 ──
  function collectHomecare() {
    const chip = f => (document.querySelector(`.hc-chips[data-field="${f}"]`)?.dataset.value || '');
    const val = id => (document.getElementById(id)?.value.trim() || '');
    const birthRaw = val('hcBirthday'); // yyyy-MM-dd
    let birthday = '';
    if (birthRaw) {
      const [y, m, d] = birthRaw.split('-');
      birthday = String(parseInt(y) - 1911).padStart(3, '0') + m + d;
    }
    const now = new Date();
    const wd = '日一二三四五六'[now.getDay()];
    return {
      formType: 'homecare',
      timestamp: now.toISOString(),
      date: `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}（${wd}）${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      branch: val('hcBranch'),
      patientName: val('hcPatientName'),
      sex: chip('sex'),
      nationalId: val('hcNationalId').toUpperCase(),
      birthday: birthday,
      phoneDay: val('hcPhoneDay'),
      phoneNight: val('hcPhoneNight'),
      address: val('hcAddress'),
      livingStatus: chip('living'),
      spokenLanguage: chip('lang'),
      welfareStatus: chip('welfare'),
      contactName: val('hcContactName'),
      contactRelation: val('hcContactRelation'),
      contactPhone: val('hcContactPhone'),
      reason: val('hcReason'),
      preferredTime: chip('preferred'),
      language: 'zh-Hant',
      rxPhotos: hcPhotos,   // Apps Script 會存 Drive 後改成連結
    };
  }

  // ── 居家送出 ──
  document.getElementById('hcSubmitBtn').addEventListener('click', async () => {
    const data = collectHomecare();
    // 必填：院區、病人姓名、聯絡電話
    const miss = [];
    if (!data.branch) miss.push('申請院區');
    if (!data.patientName) miss.push('病人姓名');
    if (!data.contactPhone) miss.push('聯絡電話');
    if (miss.length) { alert('請填寫：' + miss.join('、')); return; }

    const btn = document.getElementById('hcSubmitBtn');
    btn.disabled = true;
    btn.textContent = '送出中...';
    if (APPS_SCRIPT_URL) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST', mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(data),
        });
      } catch (e) { console.error('居家送出失敗:', e); }
    } else {
      console.log('居家表單資料:', JSON.stringify(data, null, 2));
    }
    showScreen('hcThanks');
  });
```

- [ ] **Step 2: Playwright 驗證必填擋下 + 完整送出走到感謝頁**

擴充測試（攔截 POST 檢查 payload）：
```js
test('居家：缺必填擋下；填完送出到感謝頁且 payload 正確', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.getByText('我已閱讀並同意').click();

  page.on('dialog', d => d.accept());          // 缺必填會 alert
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcForm')).toBeVisible();   // 沒前進

  let posted = null;
  await page.route('**/script.google.com/**', route => {
    posted = route.request().postData();
    route.fulfill({ status: 200, body: '' });
  });
  await page.selectOption('#hcBranch', { label: '立群診所' });
  await page.fill('#hcPatientName', '測試病人');
  await page.fill('#hcContactPhone', '0912345678');
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcThanks')).toBeVisible();
  expect(posted).toContain('"formType":"homecare"');
  expect(posted).toContain('測試病人');
});
```
Run: `npx playwright test intake_form/tests/homecare_flow.spec.mjs`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add intake_form/index.html intake_form/tests/homecare_flow.spec.mjs
git commit -m "feat(homecare): 送出驗證 + 組 payload(formType=homecare) + no-cors POST"
```

---

## Task 5: Apps Script — doPost 依 formType 分流 + 寫居家分頁

**Files:**
- Modify: `程式碼.js`（Google 端，經 clasp pull/push）

**Interfaces:**
- Consumes: POST body `{formType:'homecare', ...}`（Task 4）
- Produces: `HOMECARE_HEADERS`、`HOMECARE_HEADERS_ZH`、`handleHomecare_(data)`、寫入分頁「居家醫療申請」

- [ ] **Step 1: `clasp pull` 取回線上現有 `程式碼.js`（確保基準一致）**

Run（在含 `.clasp.json` 的目錄）：`clasp pull`
Expected: 本地 `程式碼.js` 更新為線上版。

- [ ] **Step 2: 在 `程式碼.js` 頂部（現有 `HEADERS`/`HEADERS_ZH` 之後）新增居家表頭**

```js
// 居家醫療申請分頁表頭
const HOMECARE_SHEET = '居家醫療申請';
const HOMECARE_HEADERS = [
  'timestamp','date','branch','patientName','sex','nationalId','birthday',
  'phoneDay','phoneNight','address','livingStatus','spokenLanguage','welfareStatus',
  'contactName','contactRelation','contactPhone','reason','preferredTime',
  'rxPhotoUrls','language','status','handledBy','handledAt','note',
];
const HOMECARE_HEADERS_ZH = [
  '時間戳記','日期時間','申請院區','病人姓名','性別','身分證號','出生日期',
  '電話(日)','電話(夜)','居住地址','居住狀況','常用語言','社福身分別',
  '主要聯絡人','與病人關係','聯絡電話','申請原因','希望聯絡時段',
  '慢箋照片連結','填寫語言','處理狀態','處理人','處理時間','備註',
];
const HOMECARE_NOTIFY_EMAIL = 'REDACTED@example.com';
const RX_FOLDER_NAME = '居家醫療慢箋';
```

- [ ] **Step 3: 在 `doPost` 解析 data 後、寫問診之前，加 formType 分流**

找到 `doPost` 內 `const data = JSON.parse(raw);` 之後，插入：
```js
    // 居家醫療申請走獨立分頁與流程
    if (data.formType === 'homecare') {
      return handleHomecare_(data);
    }
```
（其餘問診邏輯完全不動。）

- [ ] **Step 4: 檔案末端新增 `handleHomecare_()`（本 task 只做「寫分頁」，Drive/Email 在 Task 6/7 補）**

```js
function handleHomecare_(data) {
  try {
    const ss = SpreadsheetApp.openById('17Zv7FAPNgILDkwpr3urnFpPs9wt56rWgcxmvV_NT28E');
    let sheet = ss.getSheetByName(HOMECARE_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(HOMECARE_SHEET);
      sheet.appendRow(HOMECARE_HEADERS_ZH);
      const hr = sheet.getRange(1, 1, 1, HOMECARE_HEADERS_ZH.length);
      hr.setFontWeight('bold').setBackground('#0E7490').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    // rxPhotoUrls 在 Task 6 產生；本 task 先留空字串
    const rxPhotoUrls = '';

    const rowObj = Object.assign({}, data, {
      rxPhotoUrls: rxPhotoUrls,
      status: '待聯絡',
      handledBy: '', handledAt: '', note: '',
    });
    const row = HOMECARE_HEADERS.map(k => (rowObj[k] != null ? rowObj[k] : ''));

    const newRow = sheet.getLastRow() + 1;
    ['nationalId','phoneDay','phoneNight','birthday','contactPhone'].forEach(k => {
      const idx = HOMECARE_HEADERS.indexOf(k);
      if (idx >= 0) sheet.getRange(newRow, idx + 1).setNumberFormat('@');
    });
    sheet.getRange(newRow, 1, 1, row.length).setValues([row]);

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

- [ ] **Step 5: `clasp push -f`（驗證編譯通過，無 HEADERS 重複）**

Run: `clasp push -f`
Expected: `Pushed N files.` 無錯誤（若報 `HEADERS has already been declared` 表示誤加了重複宣告檔 → 移除，只留 `程式碼.js`）。

- [ ] **Step 6: 建測試部署並實測寫入（不動正式 Deploy ID）**

Run: `clasp deploy`（產生**臨時**新部署，取得測試 `/exec` URL）
用該測試 URL 手動 POST 一筆：
```bash
curl -s -L -X POST "<測試 exec URL>" -H "Content-Type: text/plain" \
  -d '{"formType":"homecare","timestamp":"t","date":"2026/07/02（三）10:00","branch":"立群診所","patientName":"測試病人","contactPhone":"0912345678"}'
```
Expected: 回 `{"status":"ok"}`；到試算表確認出現「居家醫療申請」分頁且該列資料正確、`處理狀態`=待聯絡、身分證/電話為純文字（不吃前導 0）。驗完 `clasp undeploy <臨時 deploymentId>` 移除臨時部署。

- [ ] **Step 7: Commit（把 `程式碼.js` 同步回本地 repo 供追蹤）**

```bash
git add 程式碼.js
git commit -m "feat(homecare): Apps Script doPost 依 formType 分流，寫居家醫療申請分頁"
```

---

## Task 6: Apps Script — 慢箋存 Drive（A 模式）+ 連結回寫

**Files:**
- Modify: `程式碼.js`（`handleHomecare_` 內補 Drive 存檔；新增 `saveRxPhotos_()`）

**Interfaces:**
- Consumes: `data.rxPhotos`（dataURL 陣列）、`RX_FOLDER_NAME`
- Produces: `saveRxPhotos_(dataUrls, patientName) -> string`（回逗號分隔的可檢視連結）

- [ ] **Step 1: 新增 `saveRxPhotos_()`**

```js
function saveRxPhotos_(dataUrls, patientName) {
  if (!dataUrls || !dataUrls.length) return '';
  // 找/建慢箋資料夾
  let folder;
  const it = DriveApp.getFoldersByName(RX_FOLDER_NAME);
  folder = it.hasNext() ? it.next() : DriveApp.createFolder(RX_FOLDER_NAME);
  const urls = [];
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
  dataUrls.forEach((du, i) => {
    const m = String(du).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return;
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
      `慢箋_${patientName || '未署名'}_${stamp}_${i + 1}.jpg`);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    urls.push(file.getUrl());
  });
  return urls.join(',');
}
```

- [ ] **Step 2: 在 `handleHomecare_` 內接上（取代 Task 5 的 `const rxPhotoUrls = '';`）**

```js
    const rxPhotoUrls = saveRxPhotos_(data.rxPhotos, data.patientName);
```

- [ ] **Step 3: `clasp push -f`**

Run: `clasp push -f`
Expected: 成功、無編譯錯誤。

- [ ] **Step 4: 臨時部署實測慢箋**

`clasp deploy` 取臨時 URL，POST 一筆帶 `rxPhotos`（一張 1x1 png 的 dataURL）：
```bash
curl -s -L -X POST "<測試 exec URL>" -H "Content-Type: text/plain" \
  -d '{"formType":"homecare","branch":"立群診所","patientName":"測試病人","contactPhone":"0912345678","rxPhotos":["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="]}'
```
Expected: `{"status":"ok"}`；Drive 出現「居家醫療慢箋」資料夾 + 一個檔；Sheet「慢箋照片連結」欄有 URL，用無痕視窗開該 URL 可看到圖（A 模式）。驗完 `clasp undeploy` 移除臨時部署。

- [ ] **Step 5: 手動把「居家醫療慢箋」資料夾分享給承辦人員**

在 Drive 右鍵資料夾 → 共用 → 加 `REDACTED@example.com`（檢視者）。
Expected: 承辦人員可在自己 Drive「與我共用」看到該資料夾。

- [ ] **Step 6: Commit**

```bash
git add 程式碼.js
git commit -m "feat(homecare): 慢箋 base64 存 Drive(A 模式) 並回寫連結"
```

---

## Task 7: Apps Script — Email 通知承辦人員

**Files:**
- Modify: `程式碼.js`（`handleHomecare_` 內、寫列成功後寄信）

**Interfaces:**
- Consumes: `HOMECARE_NOTIFY_EMAIL`、寫入後的 `rowObj`、Spreadsheet URL
- Produces: `MailApp.sendEmail` 一封

- [ ] **Step 1: 在 `handleHomecare_` 的 `setValues` 之後、`return ok` 之前，插入寄信**

```js
    try {
      const sheetUrl = ss.getUrl() + '#gid=' + sheet.getSheetId();
      const body =
        '有一筆新的居家醫療需求申請：\n\n' +
        '院區：' + (data.branch || '') + '\n' +
        '病人姓名：' + (data.patientName || '') + '\n' +
        '聯絡電話：' + (data.contactPhone || '') + '\n' +
        '主要聯絡人：' + (data.contactName || '') + '（' + (data.contactRelation || '') + '）\n' +
        '申請原因：' + (data.reason || '') + '\n' +
        '希望聯絡時段：' + (data.preferredTime || '') + '\n' +
        '慢箋照片：' + (rxPhotoUrls || '（無）') + '\n\n' +
        '請至清單查看與聯繫：\n' + sheetUrl;
      MailApp.sendEmail(HOMECARE_NOTIFY_EMAIL, '【居家醫療申請】' + (data.patientName || '') + ' — ' + (data.branch || ''), body);
    } catch (mailErr) {
      // 寄信失敗不影響已寫入的資料；記 log 供排查
      console.error('居家通知信寄送失敗: ' + mailErr);
    }
```

- [ ] **Step 2: `clasp push -f`**

Run: `clasp push -f`
Expected: 成功。

- [ ] **Step 3: 臨時部署實測 Email**

`clasp deploy` 取臨時 URL，POST 一筆（收件者可先暫時改成自己的 email 測、確認後改回 `REDACTED@example.com`）。
Expected: 收到主旨「【居家醫療申請】測試病人 — 立群診所」的信，內文含電話/需求/慢箋連結/Sheet 連結。驗完 `clasp undeploy` 移除臨時部署。

- [ ] **Step 4: Commit**

```bash
git add 程式碼.js
git commit -m "feat(homecare): 送單後 MailApp 通知承辦人員"
```

---

## Task 8: 正式部署 + end-to-end 驗證 + 文件同步

**Files:**
- Modify: `intake_form/apps_script.js`（同步 Google 端）、`intake_form/CLAUDE.md`、`intake_form/HANDOFF.md`

- [ ] **Step 1: 正式部署到既有 Deploy ID（URL 不變）**

```bash
clasp push -f
clasp version "居家醫療申請：分流寫分頁 + 慢箋 Drive + Email 通知"
clasp deploy -V <上一步回傳的版本號 N> -i AKfycbyVFakl4ORVX2mFFgC4h_a694Ow8jBvfTFDQQWuxxi5uxSWM5Q4FMU2TvGUqv4x59Q
```
Expected: 部署成功，Deploy ID 不變。

- [ ] **Step 2: end-to-end 手動驗證（用正式線上表單）**

打開 https://lichiun-medicalsystem.github.io/intake/ → 選「居家醫療需求申請」→ 同意 → 填院區+姓名+電話+拍一張慢箋 → 送出。
Expected（全部成立才算過）：
1. 表單顯示感謝頁「專人會盡快與您聯絡」。
2. 試算表「居家醫療申請」分頁新增該列、`處理狀態`=待聯絡。
3. 慢箋連結可開、Drive 資料夾有檔。
4. `REDACTED@example.com` 收到通知信。
5. 回表單首頁點「看診問診填寫」→ 走原初診/複診流程且能正常送出（**確認沒破壞現有問診**）。

- [ ] **Step 3: 驗證現有問診回歸（Playwright）**

Run: `npx playwright test intake_form/tests/homecare_flow.spec.mjs`
Expected: 全綠。若現有問診有既有測試也一併跑。

- [ ] **Step 4: 同步 `apps_script.js` 參考版**

把最終 `程式碼.js` 的內容覆蓋更新到 `intake_form/apps_script.js`（保持參考版與線上一致）。

- [ ] **Step 5: 更新 `intake_form/CLAUDE.md` + `HANDOFF.md`**

- CLAUDE.md「表單結構」下補一段「居家醫療申請分流（formType=homecare）→ 居家醫療申請分頁 + 慢箋 Drive + Email 通知」。
- HANDOFF.md 把「進行中：居家醫療需求登記」標記 Phase 1 完成，列出 Plan 2（clinic-scheduler dashboard）為下一步。

- [ ] **Step 6: Commit + push**

```bash
git add intake_form/apps_script.js intake_form/CLAUDE.md intake_form/HANDOFF.md 程式碼.js
git commit -m "feat(homecare): Phase 1 正式部署 + 文件同步"
git push origin master
```

---

## 延後項（不在本計畫，記錄以免遺漏）

- Plan 2：clinic-scheduler 後端 API + 前端 `/homecare` 清單頁（讀此分頁、回寫狀態、慢箋縮圖）。前置：`17Zv7…` share 給 `clinic-scheduler@ai-assistant-492908.iam.gserviceaccount.com`（編輯）、承辦人員開 clinic-scheduler 登入帳號。
- 保存期限自動清理（已收案 N 天後刪列 + 刪 Drive 檔）。
- 公開表單濫用防護。
- 居家表單多語（繁中以外）。
