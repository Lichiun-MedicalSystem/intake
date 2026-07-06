import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';
import path from 'path';

const FORM = pathToFileURL(path.resolve('index.html')).href;

test('?form=homecare 掃專屬 QR 直接進居家同意頁（跳過分流）', async ({ page }) => {
  await page.goto(FORM + '?form=homecare');
  await expect(page.locator('#hcConsent')).toBeVisible();
  await expect(page.locator('#s-router')).toBeHidden();
});

test('?form=homecare&branch=立群診所 預選院區', async ({ page }) => {
  await page.goto(FORM + '?form=homecare&branch=' + encodeURIComponent('立群診所'));
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();
  await expect(page.locator('#hcBranch')).toHaveValue('立群診所');
});

test('router 顯示兩個入口，問診走原流程、居家走居家分支', async ({ page }) => {
  await page.goto(FORM);
  await expect(page.locator('#routerIntake')).toBeVisible();
  await expect(page.locator('#routerHomecare')).toBeVisible();

  await page.locator('#routerIntake').click();
  await expect(page.locator('#choiceNew')).toBeVisible();

  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await expect(page.locator('#hcConsent')).toBeVisible();
});

test('居家：同意→表單→返回，欄位齊全', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await expect(page.locator('#hcConsent')).toBeVisible();
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();
  await expect(page.locator('#hcForm')).toBeVisible();
  for (const id of ['hcBranch','hcPatientName','hcNationalId','hcContactPhone']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }
  await page.locator('#hcForm .hc-back').click();
  await expect(page.locator('#hcConsent')).toBeVisible();
});

test('居家 chip 單選：點擊後 data-value 更新且互斥', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();
  const grp = page.locator('.hc-chips[data-field="sex"]');
  await grp.getByText('男').click();
  await expect(grp).toHaveAttribute('data-value', '男');
  await grp.getByText('女').click();
  await expect(grp).toHaveAttribute('data-value', '女');
  await expect(grp.locator('.hc-chip.on')).toHaveCount(1);
});

test('慢箋：選圖後出現縮圖且 hcPhotos 累積', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
  await page.locator('#rxFile').setInputFiles({ name:'rx.png', mimeType:'image/png', buffer: png });
  await expect(page.locator('#rxThumbs .hc-thumb')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.hcPhotos.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.hcPhotos[0].startsWith('data:image/jpeg'))).toBe(true);
});

// 填齊所有必填欄位（A123456789 為通過檢查碼的合法身分證、0912345678 為合法手機）
async function fillAllRequired(page) {
  await page.selectOption('#hcBranch', { label: '立群診所' });
  await page.fill('#hcPatientName', '測試病人');
  await page.locator('.hc-chips[data-field="sex"]').getByText('女').click();
  await page.fill('#hcNationalId', 'A123456789');
  await page.fill('#hcBirthday', '1950-08-15');
  await page.fill('#hcPhoneDay', '0912345678');
  await page.fill('#hcAddress', '台中市測試路1號');
  await page.locator('.hc-chips[data-field="living"]').getByText('家人同住').click();
  await page.locator('.hc-chips[data-field="lang"]').getByText('台語').click();
  await page.locator('.hc-chips[data-field="welfare"]').getByText('無', { exact: true }).click();
  await page.fill('#hcContactName', '測試兒子');
  await page.fill('#hcContactRelation', '兒子');
  await page.fill('#hcContactPhone', '0912345678');
}

test('居家：缺必填擋下；填齊必填送出到感謝頁且 payload 正確', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();

  page.on('dialog', d => d.accept());          // 缺必填會 alert
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcForm')).toBeVisible();   // 沒前進

  let posted = null;
  await page.route('**/script.google.com/**', route => {
    posted = route.request().postData();
    route.fulfill({ status: 200, body: '' });
  });
  await fillAllRequired(page);
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcThanks')).toBeVisible();
  expect(posted).toContain('"formType":"homecare"');
  expect(posted).toContain('測試病人');
});

test('居家：身分證檢查碼錯 / 手機少一碼 → 擋下不送出', async ({ page }) => {
  await page.goto(FORM);
  await page.locator('#routerHomecare').click();
  await page.locator('#hcConsent').getByText('我已閱讀並同意').click();
  page.on('dialog', d => d.accept());

  await fillAllRequired(page);
  await page.fill('#hcNationalId', 'A123456788');   // 檢查碼錯
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcForm')).toBeVisible();   // 被擋，沒進感謝頁

  await page.fill('#hcNationalId', 'A123456789');   // 修正身分證
  await page.fill('#hcPhoneDay', '091234567');      // 手機少一碼
  await page.locator('#hcSubmitBtn').click();
  await expect(page.locator('#hcForm')).toBeVisible();   // 仍被擋
});
