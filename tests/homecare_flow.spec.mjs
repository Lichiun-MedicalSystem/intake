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
