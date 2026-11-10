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

test('the canticle wakes two voices, sings words, and returns to the synth score', async ({ page }) => {
  await expect(page.locator('[data-action="canticle"]')).toBeVisible();
  await page.locator('[data-action="canticle"]').click();
  await expect(page.locator('#screen')).toContainText('THE CANTICLE');
  await expect(page.locator('#screen')).toContainText('A VOICE MADE OF AIR');
  await expect(page.locator('.voice-chip')).toHaveCount(3);
  await expect(page.locator('.stage-card')).toHaveCount(5);

  await page.locator('[data-action="canticle-voice"][data-voice="child"]').click();
  await expect(page.locator('.voice-chip.active')).toContainText('Child');

  await page.locator('[data-action="canticle-stage"][data-stage="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__rez.state), { timeout: 40_000 }).toBe('PLAYING');
  await expect.poll(() => page.evaluate(() => window.__rez.mode)).toBe('canticle');
  await expect.poll(() => page.evaluate(() => window.__rez.audio === window.__rez.canticle)).toBe(true);
  await expect(page.locator('#run-meta')).toContainText('THE CANTICLE');

  // The wasm engine and its AudioWorklet are live, wearing the chosen body.
  const engine = await page.evaluate(() => {
    const c = window.__rez.canticle;
    return {
      hasCantor: !!c.cantor,
      hasBeatbox: !!c.beatbox,
      running: c.running,
      sampleRate: c.ctx.sampleRate,
      body: c.bodyMix,
      ensemble: c.ensemble,
    };
  });
  expect(engine.hasCantor).toBe(true);
  expect(engine.hasBeatbox).toBe(true);
  expect(engine.running).toBe(true);
  expect(engine.sampleRate).toBeGreaterThan(8000);
  expect(engine.body).toEqual({ female: 1, child: 1 });
  expect(engine.ensemble).toBe('ensemble');

  // The words on screen are the words the engine is singing.
  await expect(page.locator('#canticle-line')).toHaveClass(/show/, { timeout: 20_000 });
  await expect(page.locator('.lyric-syl').first()).toBeVisible();
  const lyric = await page.evaluate(() => window.__rez.canticle.lyricNow());
  expect(lyric.text.length).toBeGreaterThan(3);
  expect(lyric.syllables.length).toBeGreaterThan(2);

  // Both voices reach the output: the cantor has signal, and the beatbox is
  // scheduled into the same audio clock.
  const levels = await page.evaluate(async () => {
    const c = window.__rez.canticle;
    const analyser = c.ctx.createAnalyser();
    analyser.fftSize = 2048;
    c.cantor.gain.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 90));
      analyser.getFloatTimeDomainData(buf);
      for (const x of buf) peak = Math.max(peak, Math.abs(x));
    }
    return { peak, beatPlaying: c._beatStarted, bars: c.barIndex, load: c.load };
  });
  expect(levels.peak).toBeGreaterThan(0.01);
  expect(levels.beatPlaying).toBe(true);
  expect(levels.bars).toBeGreaterThan(1);

  // The game plays normally: a lock is a sung note, not an oscillator.
  await expect.poll(() => page.evaluate(() => window.__rez.canticle.load)).toBeLessThan(1);

  // Back to the title: the vocal engine stops and the generative score returns.
  await page.evaluate(() => window.__rez._returnToTitle());
  await expect.poll(() => page.evaluate(() => window.__rez.state)).toBe('TITLE');
  await expect.poll(() => page.evaluate(() => window.__rez.audio === window.__rez.baseAudio)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__rez.canticle.started)).toBe(false);
});

test('the voice engine is cached for offline play', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.reload({ waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  const served = await page.evaluate(async () => {
    const wasm = await fetch(new URL('chimera/chimera.wasm', document.baseURI));
    const bytes = (await wasm.arrayBuffer()).byteLength;
    const worklet = await fetch(new URL('chimera/worklet.js', document.baseURI));
    return { wasm: wasm.status, bytes, worklet: worklet.status };
  });
  expect(served.wasm).toBe(200);
  expect(served.bytes).toBeGreaterThan(500_000);
  expect(served.worklet).toBe(200);

  // The mode starts from the cache with the network gone.
  await page.locator('[data-action="canticle"]').click();
  await page.locator('[data-action="canticle-stage"][data-stage="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__rez.state), { timeout: 40_000 }).toBe('PLAYING');
  await context.setOffline(false);
});

test('canticle options and the cantor-only ensemble are wired', async ({ page }) => {
  await page.locator('[data-action="options"]').click();
  await expect(page.locator('[data-setting="canticleEnsemble"]')).toHaveValue('ensemble');
  await page.locator('[data-setting="canticleEnsemble"]').selectOption('cantor');
  await expect(page.locator('[data-setting="canticleEnsemble"]')).toHaveValue('cantor');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rez-hyrule-save-v2')));
  expect(saved.settings.canticleEnsemble).toBe('cantor');
  await page.locator('[data-action="back-options"]').click();

  await page.locator('[data-action="canticle"]').click();
  await page.locator('[data-action="canticle-stage"][data-stage="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__rez.state), { timeout: 40_000 }).toBe('PLAYING');
  const ensemble = await page.evaluate(() => ({
    voice: window.__rez.canticle.ensemble,
    beatbox: !!window.__rez.canticle.beatbox,
  }));
  expect(ensemble.voice).toBe('cantor');
  expect(ensemble.beatbox).toBe(false);

  // With no beatboxer, every effect must still be sung rather than skipped. This
  // watches the planner rather than the speakers: a real-time peak measurement is
  // too sensitive to the audio thread's block cadence on CI runners.
  const scheduled = await page.evaluate(async () => {
    const c = window.__rez.canticle;
    c.stopMusic(0.05);
    await new Promise((resolve) => setTimeout(resolve, 650));
    c.cantor.stopSpeech();
    const calls = [];
    const original = c.cantor.schedule.bind(c.cantor);
    c.cantor.schedule = (gestures, lead = 0) => {
      calls.push({ n: gestures.length, lead });
      original(gestures, lead);
    };
    const out = {};
    for (const name of ['damage', 'hitMarker', 'lockBlip', 'explode', 'pickup', 'fanfare', 'bossRoar']) {
      const before = calls.length;
      c[name]();
      await new Promise((resolve) => setTimeout(resolve, 120));
      out[name] = calls.slice(before);
    }
    c.cantor.schedule = original;
    return out;
  });
  for (const [name, calls] of Object.entries(scheduled)) {
    expect(calls.length, `${name} has a sung fallback`).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.n).toBeGreaterThan(0);
      expect(call.lead).toBeGreaterThan(0);
    }
  }
});
