/**
 * 立群診所 問診表單 — Google Apps Script
 *
 * 使用方式：
 * 1. 在 Google Sheets 中開啟「擴充功能 → Apps Script」
 * 2. 將此程式碼貼入，取代預設內容
 * 3. 點擊「部署 → 管理部署 → 編輯 → 新版本 → 部署」
 */

// 表頭欄位（與表單送出的 key 對應）
const HEADERS = [
  'timestamp',      // 時間戳記
  'date',           // 日期時間
  'branch',         // 院區
  'clinic',         // 診間
  'name',           // 姓名
  'patientId',      // 診號
  'weight',         // 體重
  'docs',           // 需要文件
  'medPreference',  // 藥物偏好
  'allergy',        // 藥物過敏
  'pregnancy',      // 懷孕
  'fever',          // 發燒/畏寒
  'feverDays',      // 發燒天數
  'ent',            // 耳鼻喉症狀
  'entDays',        // 耳鼻喉天數
  'entMedicated',   // 耳鼻喉用藥
  'gi',             // 腸胃症狀
  'giDays',         // 腸胃天數
  'giMedicated',    // 腸胃用藥
  'chronic',        // 慢性病
  'other',          // 其他需求
  'otherNotes',     // 其他問題
  'language',       // 填寫語言
  'isNewPatient',   // 初/複診
  'nationalId',     // 身分證字號
  'birthday',       // 生日（民國）
  'phone',          // 電話
  'address',        // 地址
];

// 表頭中文名稱（第一次執行時自動寫入）
const HEADERS_ZH = [
  '時間戳記', '日期時間', '院區', '診間', '姓名', '診號', '體重',
  '需要文件', '藥物偏好', '藥物過敏', '懷孕',
  '發燒/畏寒', '發燒天數',
  '耳鼻喉症狀', '耳鼻喉天數', '耳鼻喉用藥',
  '腸胃症狀', '腸胃天數', '腸胃用藥',
  '慢性病', '其他需求', '其他問題', '填寫語言',
  '初/複診', '身分證字號', '生日', '電話', '地址',
];

/**
 * POST 請求處理（表單送出時觸發）
 */
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // 如果是空白試算表，先寫入表頭
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS_ZH);
      // 設定表頭格式
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_ZH.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#0E7490');
      headerRange.setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    // 解析 JSON（支援 application/json 和 text/plain 兩種格式）
    const raw = e.postData.contents;
    const data = JSON.parse(raw);

    // 按照 HEADERS 順序組成一列
    const row = HEADERS.map(key => data[key] || '');

    // 寫入試算表
    sheet.appendRow(row);

    // 自動調整欄寬（僅前幾次）
    if (sheet.getLastRow() <= 3) {
      sheet.autoResizeColumns(1, HEADERS.length);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET 請求處理（Lab Clipper 桌面端用來讀取今日問診資料）
 *
 * 參數：
 *   ?action=today    回傳今日所有問診資料（預設）
 *   ?action=ping     測試連線
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'today';

  if (action === 'ping') {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', message: '立群診所問診表單 API 運作中' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // action === 'today'
  try {
    const filterBranch = (e && e.parameter && e.parameter.branch) || '';
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', patients: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 取得今天的日期字串（台灣時區）
    const now = new Date();
    const taiwanOffset = 8 * 60; // UTC+8
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const taiwanNow = new Date(utcMs + taiwanOffset * 60000);
    const todayStr = Utilities.formatDate(taiwanNow, 'Asia/Taipei', 'yyyy/MM/dd');

    // 讀取所有資料列
    const dataRange = sheet.getRange(2, 1, lastRow - 1, HEADERS.length);
    const rows = dataRange.getValues();

    const patients = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // 用 date 欄位（index 1）判斷是否為今天，格式為 "2026/04/05（六）13:20"
      const dateCell = String(row[1]);
      if (!dateCell.startsWith(todayStr)) continue;

      const patient = {};
      for (let j = 0; j < HEADERS.length; j++) {
        patient[HEADERS[j]] = String(row[j] || '');
      }

      // 如果有指定院區篩選，只回傳該院區的資料
      if (filterBranch && patient.branch !== filterBranch) continue;

      patients.push(patient);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', patients: patients }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
