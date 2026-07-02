import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'url';
import path from 'path';

const FORM = pathToFileURL(path.resolve('index.html')).href;

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
