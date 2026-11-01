import { test, expect } from '@playwright/test';

test('volley follows tempo and cancels at transitions', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="continue"]').click();
  const result = await page.evaluate(async () => {
    const a = window.__rez.audio;
    await a.unlock();
    const original = a.playerNote.bind(a);
    const notes = [];
    a.playerNote = (harmonic, chain, time) => { notes.push(time); original(harmonic, chain, time); };
    a.playVolley(4, true, 3);
    const offsets = notes.map(t => (t - a.musicStart) / a.stepDur);
    const spacing = notes.slice(1).map((t, i) => t - notes[i]);
    const voices = a.volleyVoices.size;
    const step = a.stepDur;
    a.stopMusic(0.1);
    return { offsets, spacing, step, voices, remaining: a.volleyVoices.size };
  });
  expect(result.voices).toBe(4);
  expect(result.remaining).toBe(0);
  for (const n of result.offsets) expect(n).toBeCloseTo(Math.round(n), 6);
  for (const n of result.spacing) expect(n).toBeCloseTo(result.step, 6);
});

test('combat remains readable across stages and handheld viewport', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || /context.lost/i.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  for (const [stage, width, height] of [[1, 1440, 900], [4, 1440, 900], [4, 853, 480]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(stage => {
      const g = window.__rez;
      g.save.progress.unlocked = 5;
      g.startScoreAttack(stage);
      g._spawnWave();
    }, stage);
    await page.waitForTimeout(5500);
    expect(await page.evaluate(() => window.__rez.world.renderer.getContext().isContextLost())).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`stage-${stage}-${width}.png`) });
    if (stage === 4) {
      await page.evaluate(() => window.__rez._startBoss());
      await page.waitForTimeout(4000);
      await page.screenshot({ path: testInfo.outputPath(`boss-${width}.png`) });
    }
  }
  expect(errors).toEqual([]);
});
