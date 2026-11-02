import { test, expect } from '@playwright/test';

/**
 * The Retroid Pocket Nova presents its built-in controls to Chrome as a
 * standard-mapped gamepad. This test drives the same API with a fake standard
 * pad so the controller path is exercised on every push.
 */
test('standard gamepad can navigate, aim, focus and pause', async ({ browser }) => {
  const errors = [];
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.addInitScript(() => {
    window.__fakePad = {
      connected: true,
      id: 'Retroid Pocket Nova Controller (STANDARD GAMEPAD)',
      index: 0,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__fakePad],
    });
  });

  const press = async (index) => {
    await page.evaluate((i) => {
      const button = window.__fakePad.buttons[i];
      button.pressed = true;
      button.value = 1;
    }, index);
    await page.waitForTimeout(140);
    await page.evaluate((i) => {
      const button = window.__fakePad.buttons[i];
      button.pressed = false;
      button.value = 0;
    }, index);
    await page.waitForTimeout(180);
  };

  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#screen')).toContainText('A TRANSMISSION FROM THE SACRED REALM');
  await expect(page.locator('[data-action="start"]')).toBeInViewport();
  await page.waitForTimeout(500);

  // D-pad focuses the first menu action; A confirms it.
  await page.evaluate(() => {
    window.__fakePad.buttons[13].pressed = true;
    window.__fakePad.buttons[13].value = 1;
  });
  await page.waitForTimeout(240);
  await page.evaluate(() => {
    window.__fakePad.buttons[13].pressed = false;
    window.__fakePad.buttons[13].value = 0;
  });
  await page.waitForTimeout(150);
  await expect(page.locator('button.pad-focus')).toHaveAttribute('data-action', 'start');

  await press(0);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('STORY');
  await press(0);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PLAYING');

  // The in-game hint switches to controller controls.
  await expect(page.locator('#hint')).toContainText('RT / A');
  await expect(page.locator('#hint')).toContainText('START PAUSE');

  // Android needs a real tap to resume Web Audio after a controller-only start.
  await page.evaluate(() => window.__rez.audio.ctx.suspend());
  await page.evaluate(() => window.__rez._checkSoundPrompt());
  await expect(page.locator('#sound-prompt')).toBeVisible();
  await page.locator('#sound-prompt').click();
  await expect(page.locator('#sound-prompt')).toBeHidden();

  // Right stick moves the reticle.
  const before = await page.evaluate(() => window.__rez.input.aim.x);
  await page.evaluate(() => {
    window.__fakePad.axes[2] = 1;
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__fakePad.axes[2] = 0;
  });
  const after = await page.evaluate(() => window.__rez.input.aim.x);
  expect(after).toBeGreaterThan(before + 20);

  // X awakens Nayru's Focus.
  await page.evaluate(() => {
    const game = window.__rez;
    game.powers.wisdom = true;
    game.wisdomCooldown = 0;
    game._syncHudPowers();
  });
  await press(2);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__rez.wisdomActive)).toBeGreaterThan(0);

  // RT holds locks; Start pauses; A resumes.
  await page.evaluate(() => {
    window.__fakePad.buttons[7].pressed = true;
    window.__fakePad.buttons[7].value = 1;
  });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__rez.input.holding)).toBe(true);
  await page.evaluate(() => {
    window.__fakePad.buttons[7].pressed = false;
    window.__fakePad.buttons[7].value = 0;
  });
  await page.waitForTimeout(200);
  await press(9);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PAUSED');
  await press(0);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PLAYING');

  // Every Options control is reachable, including sliders and selects.
  await press(9);
  await page.evaluate(() => window.__rez.openOptions('PAUSED'));
  await press(13);
  await expect(page.locator('[data-setting="musicVolume"]')).toBeFocused();
  const volume = await page.locator('[data-setting="musicVolume"]').inputValue();
  await press(14);
  await expect(page.locator('[data-setting="musicVolume"]')).toHaveValue(String(Number(volume) - 1));
  await press(13);
  await press(13);
  await press(13);
  await expect(page.locator('[data-setting="lockAssist"]')).toBeFocused();
  await press(15);
  await expect(page.locator('[data-setting="lockAssist"]')).toHaveValue('high');
  await press(13);
  await press(13);
  await press(13);
  await expect(page.locator('[data-setting="gamepad"]')).toBeFocused();
  await press(0);
  await expect(page.locator('[data-setting="gamepad"]')).not.toBeChecked();
  // Menu navigation stays available so the controller can turn itself back on.
  await press(0);
  await expect(page.locator('[data-setting="gamepad"]')).toBeChecked();
  await press(1);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PAUSED');
  // Start always resumes, even with a different menu action focused.
  await page.locator('[data-action="fullscreen"]').focus();
  await press(9);
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('PLAYING');

  expect(errors, errors.join('\n')).toEqual([]);
  await context.close();
});
