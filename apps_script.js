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
  'height',         // 身高
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
  '時間戳記', '日期時間', '院區', '診間', '姓名', '診號', '身高', '體重',
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
    // 解析 JSON（支援 application/json 和 text/plain 兩種格式）
    const raw = e.postData.contents;
    const data = JSON.parse(raw);

    // 居家醫療申請走獨立分頁與流程（寫「居家醫療申請」分頁 + 慢箋存 Drive + Email 通知）
    if (data.formType === 'homecare') {
      return handleHomecare_(data);
    }

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

    // 地址翻譯：非繁中填寫時，自動翻成繁中（覆蓋原文）
    if (data.address && data.language && data.language !== 'zh-Hant') {
      try {
        const translated = LanguageApp.translate(data.address, '', 'zh-TW');
        if (translated) data.address = translated;
      } catch (err) {
        // 翻譯失敗保留原文，不中斷送單
      }
    }

    // 按照 HEADERS 順序組成一列
    const row = HEADERS.map(key => data[key] || '');

    // 寫入試算表（用 setValues + 先設純文字格式，防止前導 0 被吃掉）
    const newRow = sheet.getLastRow() + 1;
    const textCols = ['patientId', 'nationalId', 'birthday', 'phone'];
    textCols.forEach(key => {
      const idx = HEADERS.indexOf(key);
      if (idx >= 0) {
        sheet.getRange(newRow, idx + 1).setNumberFormat('@');
      }
    });
    sheet.getRange(newRow, 1, 1, row.length).setValues([row]);

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

// ═══════════════════ 居家醫療申請 ═══════════════════
const HOMECARE_SHEET = '居家醫療申請';
const HOMECARE_HEADERS = [
  'timestamp', 'date', 'branch', 'patientName', 'sex', 'nationalId', 'birthday',
  'phoneDay', 'phoneNight', 'address', 'livingStatus', 'spokenLanguage', 'welfareStatus',
  'contactName', 'contactRelation', 'contactPhone', 'reason', 'preferredTime',
  'rxPhotoUrls', 'language', 'status', 'handledBy', 'handledAt', 'note',
];
const HOMECARE_HEADERS_ZH = [
  '時間戳記', '日期時間', '申請院區', '病人姓名', '性別', '身分證號', '出生日期',
  '電話(日)', '電話(夜)', '居住地址', '居住狀況', '常用語言', '社福身分別',
  '主要聯絡人', '與病人關係', '聯絡電話', '申請原因', '希望聯絡時段',
  '慢箋照片連結', '填寫語言', '處理狀態', '處理人', '處理時間', '備註',
];
const HOMECARE_NOTIFY_EMAIL = 'chiao1988ju@gmail.com';
const RX_FOLDER_NAME = '居家醫療慢箋';

/**
 * 居家醫療申請處理：寫「居家醫療申請」分頁 + 慢箋存 Drive + Email 通知。
 * 順序刻意「先寫列、再存慢箋、再寄信」——即使 Drive/Gmail 尚未授權或失敗，
 * 核心申請資料一定先落 Sheet，不會整筆遺失。
 */
function handleHomecare_(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // insertSheet 會把新分頁設為 active，問診 doPost 依賴 getActiveSheet() → 記住進入時的 active，最後還原
    const originalActive = ss.getActiveSheet();

    let sheet = ss.getSheetByName(HOMECARE_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(HOMECARE_SHEET);
      sheet.appendRow(HOMECARE_HEADERS_ZH);
      const hr = sheet.getRange(1, 1, 1, HOMECARE_HEADERS_ZH.length);
      hr.setFontWeight('bold').setBackground('#0E7490').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }

    // 先寫入列（rxPhotoUrls 先留空，成功存 Drive 後再回填該格）
    const rowObj = Object.assign({}, data, {
      rxPhotoUrls: '', status: '待聯絡', handledBy: '', handledAt: '', note: '',
    });
    const row = HOMECARE_HEADERS.map(function (k) { return rowObj[k] != null ? rowObj[k] : ''; });
    const newRow = sheet.getLastRow() + 1;
    ['nationalId', 'phoneDay', 'phoneNight', 'birthday', 'contactPhone'].forEach(function (k) {
      const idx = HOMECARE_HEADERS.indexOf(k);
      if (idx >= 0) sheet.getRange(newRow, idx + 1).setNumberFormat('@');
    });
    sheet.getRange(newRow, 1, 1, row.length).setValues([row]);

    // 慢箋存 Drive（best-effort；失敗不影響已寫入的列）
    let rxPhotoUrls = '';
    try {
      rxPhotoUrls = saveRxPhotos_(data.rxPhotos, data.patientName);
      if (rxPhotoUrls) {
        const idx = HOMECARE_HEADERS.indexOf('rxPhotoUrls');
        sheet.getRange(newRow, idx + 1).setValue(rxPhotoUrls);
      }
    } catch (photoErr) {
      console.error('居家慢箋存 Drive 失敗: ' + photoErr);
    }

    // insertSheet 造成的 active 變動還原，保護問診 doPost
    if (originalActive) ss.setActiveSheet(originalActive);

    // Email 通知承辦人員（失敗不影響已寫入資料）
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
      MailApp.sendEmail(HOMECARE_NOTIFY_EMAIL,
        '【居家醫療申請】' + (data.patientName || '') + ' — ' + (data.branch || ''), body);
    } catch (mailErr) {
      console.error('居家通知信寄送失敗: ' + mailErr);
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
 * 慢箋 base64 dataURL 陣列 → 存進「居家醫療慢箋」Drive 資料夾（A 模式：知道連結可看），
 * 回傳逗號分隔的檢視連結。無照片回空字串。
 */
function saveRxPhotos_(dataUrls, patientName) {
  if (!dataUrls || !dataUrls.length) return '';
  const it = DriveApp.getFoldersByName(RX_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(RX_FOLDER_NAME);
  const urls = [];
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd_HHmmss');
  dataUrls.forEach(function (du, i) {
    const m = String(du).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return;
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
      '慢箋_' + (patientName || '未署名') + '_' + stamp + '_' + (i + 1) + '.jpg');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    urls.push(file.getUrl());
  });
  return urls.join(',');
}

/**
 * 一次性授權用：在 Apps Script 編輯器手動選此函式按「執行」，
 * 觸發 Drive + Gmail 授權同意畫面（webapp executeAs=USER_DEPLOYING 需擁有者先授權這兩個 scope）。
 */
function __authorizeHomecareScopes() {
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
}
