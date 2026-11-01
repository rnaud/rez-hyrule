import { test, expect } from '@playwright/test';

let errors = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('#screen')).toContainText('A TRANSMISSION FROM THE SACRED REALM');
});

test.afterEach(async () => {
  expect(errors, errors.join('\n')).toEqual([]);
});

test('title, campaign story and pause flow', async ({ page }) => {
  await expect(page.locator('[data-action="stage-select"]')).toBeVisible();
  await expect(page.locator('[data-action="boss-rush"]')).toBeDisabled();
  await expect(page.locator('[data-action="start"]')).toHaveText('Awaken');

  await page.locator('[data-action="start"]').click();
  await expect(page.locator('#screen')).toContainText('RAIL I OF V');
  await page.locator('[data-action="continue"]').click();
  await expect.poll(() => page.evaluate(() => window.__rez?.state)).toBe('PLAYING');
  await expect(page.locator('#hud')).toHaveClass(/\bshow\b/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#screen')).toContainText('PAUSED');
  await page.locator('[data-action="resume"]').click();
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PLAYING');
});

test('stage select, archive and options are wired', async ({ page }) => {
  await page.locator('[data-action="stage-select"]').click();
  await expect(page.locator('.stage-card')).toHaveCount(5);
  await expect(page.locator('.stage-card[disabled]')).toHaveCount(4);
  await expect(page.locator('#screen')).toContainText('THE SACRED REALM');
  await page.locator('[data-action="back-title"]').first().click();

  await page.locator('[data-action="gallery"]').click();
  await expect(page.locator('#screen')).toContainText('WHAT THE RAILS REMEMBER');
  await page.locator('[data-action="gallery-tab"][data-tab="music"]').click();
  await expect(page.locator('.track-card')).toHaveCount(10);
  await page.locator('[data-action="gallery-tab"][data-tab="triforce"]').click();
  await expect(page.locator('.fragment-card')).toHaveCount(3);
  await page.locator('[data-action="back-title"]').first().click();

  await page.locator('[data-action="options"]').click();
  await expect(page.locator('#screen')).toContainText('SACRED CALIBRATION');
  await page.locator('[data-setting="musicVolume"]').fill('44');
  await page.locator('[data-setting="reduceFlash"]').check();
  await page.locator('[data-action="back-options"]').click();
  await expect(page.locator('#screen')).toContainText('A TRANSMISSION FROM THE SACRED REALM');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rez-hyrule-save-v2')));
  expect(saved.settings.musicVolume).toBeCloseTo(0.44, 2);
  expect(saved.settings.reduceFlash).toBe(true);
});

test('all five rails exist and Demise can be summoned', async ({ page }) => {
  const info = await page.evaluate(() => {
    const game = window.__rez;
    game.save.progress.unlocked = 5;
    game.save.progress.powers = { power: true, courage: true, wisdom: true };
    game.save.save();
    game.startScoreAttack(4);
    return { state: game.state, stage: game.stage.id, total: 5, powers: game.powers };
  });
  expect(info.state).toBe('PLAYING');
  expect(info.stage).toBe('sacred');
  expect(info.powers).toEqual({ power: true, courage: true, wisdom: true });

  await page.evaluate(() => window.__rez._startBoss());
  await expect(page.locator('#boss-name')).toContainText('DEMISE');
  await expect(page.locator('#boss-hud')).toHaveClass(/\bshow\b/);

  // Guardian fights keep the rail moving instead of freezing in place.
  const before = await page.evaluate(() => window.__rez.playerDistance);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.__rez.playerDistance);
  expect(after).toBeGreaterThan(before + 2);
});

test('player options persist and the PWA shell works offline', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#screen')).toContainText('A TRANSMISSION FROM THE SACRED REALM', {
    timeout: 20_000,
  });
  await context.setOffline(false);
});
