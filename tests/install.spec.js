import { test, expect } from '@playwright/test';

test('Android install action handles fallback, controller, dismissal and installation', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__rez);
  await page.evaluate(() => window.__rez.openOptions());
  const install = page.locator('[data-install]');
  const status = page.locator('[data-install-status]');
  await install.click();
  await expect(status).toContainText('Add to Home screen');

  await page.evaluate(() => {
    window.__installCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { window.__installCalls++; };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(event);
  });
  // Controller-generated clicks must preserve the prompt for a real tap.
  await install.evaluate((button) => button.click());
  await expect(status).toContainText('Tap Install app');
  expect(await page.evaluate(() => window.__installCalls)).toBe(0);
  await install.click();
  await expect(status).toContainText('Installation dismissed');
  expect(await page.evaluate(() => window.__installCalls)).toBe(1);
  await install.click();
  expect(await page.evaluate(() => window.__installCalls)).toBe(1);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(status).toContainText('Installed.');
  await install.click();
  await expect(status).toContainText('already installed');
});
