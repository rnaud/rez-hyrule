import * as THREE from 'three';
import { World } from './World.js';
import { Hud } from './Hud.js';
import { Input } from './Input.js';
import { AudioEngine } from './AudioEngine.js';
import { Player } from './Player.js';
import { Rail } from './Rail.js';
import { Effects } from './effects.js';
import { buildEnvironment } from './environment.js';
import { Enemy, pickEnemyType, makeFormation } from './enemies.js';
import { Projectile } from './projectiles.js';
import { Boss } from './boss.js';
import { STAGES, STAGE_DIFFICULTY } from './stages.js';
import {
  screenTitle,
  screenStory,
  screenResults,
  screenGameOver,
  screenVictory,
  screenPause,
  screenStageSelect,
  screenOptions,
  screenGallery,
  screenShrine,
  screenBossRushResults,
} from './screens.js';
import { TRACKS, POWER_INFO } from './catalog.js';
import { Save, DEFAULT_SETTINGS } from './Save.js';
import {
  clamp,
  damp,
  formatTime,
  roman,
  seeded,
  glowSprite,
  lineMaterial,
  TAU,
  hashString,
  localDateKey,
  prettyDate,
  pad,
} from './util.js';

const MAX_HEALTH = 24;
const ABILITY_COOLDOWN = 18;
const ABILITY_DURATION = 4.2;
const CAMPAIGN_POWERS = ['power', 'courage', 'wisdom'];
const SITE_URL = 'https://rnaud.github.io/rez-hyrule/';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.world = new World(canvas);
    this.camera = this.world.camera;
    this.playerLayer = this.world.playerLayer;
    this.enemyLayer = this.world.enemyLayer;
    this.projectileLayer = this.world.projectileLayer;
    this.beamLayer = this.world.beamLayer;
    this.bossLayer = this.world.bossLayer;
    this.bossFxLayer = this.world.bossFxLayer;
    this.save = new Save();
    this.settings = this.save.settings;
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
    this.input = new Input();
    this.hud = new Hud({
      onAction: (action, button) => this.handleAction(action, button),
      onHover: () => this.audio.uiHover(),
    });
    this.fx = new Effects(this.world.scene, this.world.camera);
    this.fx.setBeamGame(this);
    this.fx.setPixelRatio(this.world.renderer.getPixelRatio());
    this.world.onResize = (pr) => this.fx.setPixelRatio(pr);
    this.world.applyQuality(this.settings.quality);
    this.hud.applyPreferences(this.settings);
    this.input.setOptions({
      aimSpeed: this.settings.aimSpeed,
      gamepad: this.settings.gamepad,
    });

    this.state = 'BOOT';
    this.prevState = 'PLAYING';
    this.stageIndex = 0;
    this.stage = null;
    this.rail = null;
    this.environment = null;
    this.boss = null;
    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.locks = [];
    this.aimTarget = null;
    this.projectedTargets = [];
    this.fireQueue = [];
    this.fireTimer = 0;
    this.stageElapsed = 0;
    this.clock = 0;
    this.playerDistance = 20;
    this.playerSpeed = 0;
    this.speedTarget = 0;
    this.health = 16;
    this.maxHealth = 16;
    this.score = 0;
    this.rupees = 0;
    this.awaken = 1;
    this.awakenCharge = 0;
    this.quoteFlags = [];
    this.waveTimer = 1.2;
    this.waveCount = 0;
    this.invulnerable = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.clearTimer = 0;
    this.deathTimer = 0;
    this.bossTrigger = 0;
    this.isHarmonicRelease = false;
    this.stageEntryScore = 0;
    this.stats = this._emptyStats();
    this.runStats = this._emptyStats();
    this.highScore = this.save.progress.bestScore || 0;
    this._waveRng = seeded(4242);
    this.mode = 'campaign';
    this.runSeed = 4242;
    this.runPlayTime = 0;
    this.bossRushIndex = 0;
    this.bossRushCleared = 0;
    this.dailyInfo = null;
    this.pendingNextStage = null;
    this.shrinePurchases = {};
    this.shrineNextStage = null;
    this.pendingExtraLocks = 0;
    this.extraLocks = 0;
    this.powers = { ...this.save.progress.powers };
    this.shieldCharges = 0;
    this.wisdomActive = 0;
    this.wisdomCooldown = 0;
    this.harmonyChain = 0;
    this.harmonyTimer = 0;
    this.lastResult = null;
    this.lastShareText = '';
    this.optionsReturn = 'TITLE';
    this.galleryReturn = 'TITLE';
    this.galleryTab = 'bestiary';
    this.galleryTrack = null;
    this._lastChainDisplay = { combo: -1, harmony: -1 };
    this._dailyKey = localDateKey();
    this.isTouch =
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      (navigator.maxTouchPoints || 0) > 0;

    document.body.classList.toggle('is-touch', this.isTouch);

    document.getElementById('pause-btn')?.addEventListener('click', () => {
      if (this.state === 'PLAYING' || this.state === 'BOSS') this.pauseGame();
    });

    this.input.onLockStart = () => this.onLockStart();
    this.input.onLockEnd = () => this.onLockEnd();
    this.input.onKey = (code, event) => this.onKey(code, event);
    this.input.onAim = () => {};

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.state === 'PLAYING' || this.state === 'BOSS')) this.pauseGame();
    });
    window.addEventListener('blur', () => {
      if (this.state === 'PLAYING' || this.state === 'BOSS') this.pauseGame();
    });

    document.getElementById('ability-btn')?.addEventListener('click', () => this.activateWisdom());
    this.input.onPadButton = (button) => this.onPadButton(button);
    this.input.onPadActive = () => this.onPadActive();
    this.hud.screenEl.addEventListener('input', (e) => this.onSettingInput(e));
    this.hud.screenEl.addEventListener('change', (e) => this.onSettingInput(e));
    window.addEventListener('gamepadconnected', () => this._refreshPadStatus());
    window.addEventListener('gamepaddisconnected', () => this._refreshPadStatus());

    this.soundPromptEl = document.getElementById('sound-prompt');
    this.soundPromptEl?.addEventListener('click', (event) => {
      event.stopPropagation();
      this._unlockAudioGesture();
    });
    const unlockFromGesture = () => this._unlockAudioGesture();
    document.addEventListener('pointerdown', unlockFromGesture, { passive: true });
    document.addEventListener('keydown', unlockFromGesture);
    this._padHintShown = false;

    this.clock = 0;
  }

  _emptyStats() {
    return { killed: 0, spawned: 0, harmony: 0, shots: 0, hits: 0, maxAwaken: 1, bossKills: 0 };
  }

  _loadBest() {
    return this.save.progress.bestScore || 0;
  }

  _saveBest(score) {
    const progress = this.save.progress;
    const isBest = score > progress.bestScore;
    if (isBest) {
      progress.bestScore = Math.floor(score);
      this.save.save();
    }
    this.highScore = progress.bestScore;
    return isBest;
  }

  /* ------------------------------------------------------------------ */
  /* settings / menus                                                   */
  /* ------------------------------------------------------------------ */

  random() {
    return this.gameRng ? this.gameRng.next() : Math.random();
  }

  _refreshDailyInfo() {
    const key = localDateKey();
    this._dailyKey = key;
    const saved = this.save.progress.daily;
    this.dailyInfo = saved?.date === key ? { ...saved } : { date: key, score: 0, rank: '', stage: -1 };
    return this.dailyInfo;
  }

  _titleData() {
    const progress = this.save.progress;
    this._refreshDailyInfo();
    return {
      highScore: progress.bestScore || this.highScore || 0,
      progress,
      daily: this.dailyInfo,
      unlockedBosses: Object.keys(progress.bosses || {}).length,
    };
  }

  _showTitleScreen() {
    this.state = 'TITLE';
    this.input.setEnabled(false);
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.hideBoss();
    this.hud.subtitle('');
    this.hud.hint('');
    this.hud.setChain(0, 0);
    this.hud.showScreen(screenTitle(this._titleData()));
    document.body.classList.remove('is-playing');
  }

  applyAllSettings() {
    const s = this.settings;
    this.audio.setVolumes(s.musicVolume, s.sfxVolume);
    this.audio.setMuted(this.audio.muted);
    this.world.applyQuality(s.quality);
    this.world.shakeScale = s.reduceShake ? 0.18 : 1;
    this.world.fovScale = s.reduceShake ? 0.35 : 1;
    this.input.setOptions({ aimSpeed: s.aimSpeed, gamepad: s.gamepad });
    this.hud.applyPreferences(s);
  }

  onSettingInput(event) {
    const el = event.target.closest?.('[data-setting]');
    if (!el || this.state !== 'OPTIONS') return;
    const key = el.dataset.setting;
    let value;
    if (el.type === 'range') {
      value = Number(el.value);
    } else if (el.type === 'checkbox') {
      value = !!el.checked;
    } else {
      value = el.value;
    }
    if (key === 'musicVolume' || key === 'sfxVolume' || key === 'aimSpeed') value /= 100;
    if (key === 'aimSpeed') value = clamp(value, 0.5, 2);
    this.settings[key] = value;
    this.save.setSetting(key, value);
    this.applyAllSettings();
    this._updateSettingOutputs();
  }

  _updateSettingOutputs() {
    for (const output of this.hud.screenEl.querySelectorAll('[data-value-for]')) {
      const key = output.dataset.valueFor;
      const value = this.settings[key];
      if (typeof value === 'number') {
        output.textContent = `${Math.round(value * 100)}%`;
      }
    }
  }

  openOptions(returnState = this.state) {
    this.optionsReturn = returnState === 'PAUSED' ? 'PAUSED' : 'TITLE';
    if (this.optionsReturn === 'PAUSED') {
      this.audio.pause();
    } else {
      this.audio.unlock();
      this.audio.uiConfirm();
      this.audio.stopMusic(0.3);
    }
    this.state = 'OPTIONS';
    this.input.setEnabled(false);
    this.hud.hideReticle();
    document.body.classList.remove('is-playing');
    this.hud.showScreen(
      screenOptions({
        settings: this.settings,
        gamepadConnected: !!this.input.gamepadConnected,
        gamepadId: this._safeGamepadId(),
      }),
      { dim: true }
    );
  }

  _safeGamepadId() {
    return String(this.input.gamepadId || '').replace(/[<>&"']/g, '').slice(0, 52);
  }

  _unlockAudioGesture() {
    this.audio.unlock();
    window.setTimeout(() => {
      if (this.audio.running) this._showSoundPrompt(false);
    }, 220);
  }

  _showSoundPrompt(show) {
    if (!this.soundPromptEl) return;
    this.soundPromptEl.classList.toggle('hidden', !show);
  }

  _checkSoundPrompt() {
    window.setTimeout(() => {
      if (!this.audio.running && (this.state === 'PLAYING' || this.state === 'BOSS')) {
        this._showSoundPrompt(true);
      } else {
        this._showSoundPrompt(false);
      }
    }, 350);
  }

  closeOptions() {
    if (this.optionsReturn === 'PAUSED') {
      this.state = 'PAUSED';
      this.audio.pause();
      this._showPauseScreen();
      return;
    }
    this.optionsReturn = 'TITLE';
    this._showTitleScreen();
  }

  _refreshPadStatus() {
    if (this.state !== 'OPTIONS') return;
    const el = this.hud.screenEl.querySelector('.pad-status');
    if (!el) return;
    const connected = !!this.input.gamepadConnected;
    const label = connected
      ? `CONTROLLER CONNECTED${this._safeGamepadId() ? ` · ${this._safeGamepadId()}` : ''}`
      : 'NO CONTROLLER DETECTED';
    el.classList.toggle('connected', connected);
    el.innerHTML = '<span class="dot"></span><span class="pad-label"></span>';
    el.querySelector('.pad-label').textContent = label;
  }

  onPadActive() {
    if (this.state === 'PLAYING' || this.state === 'BOSS') {
      if (!this._padHintShown) {
        this._padHintShown = true;
        const ability = this.powers.wisdom ? '<span><span class="key">X</span> NAYRU’S FOCUS</span>' : '';
        this.hud.hint(
          `<span><span class="key">R/L STICK</span> AIM</span><span><span class="key">RT / A</span> LOCK & STRIKE</span><span><span class="key">START</span> PAUSE</span>${ability}`,
          8000
        );
      }
    } else if (this.state === 'OPTIONS') {
      this._refreshPadStatus();
    }
  }

  showStageSelect() {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.audio.stopMusic(0.3);
    this.state = 'STAGE_SELECT';
    this.input.setEnabled(false);
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.hideBoss();
    this.hud.showScreen(screenStageSelect({ progress: this.save.progress }), { dim: true });
    document.body.classList.remove('is-playing');
  }

  openGallery(returnState = 'TITLE') {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.audio.stopMusic(0.3);
    this.galleryReturn = returnState === 'VICTORY' ? 'VICTORY' : 'TITLE';
    this.state = 'GALLERY';
    this.input.setEnabled(false);
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.hideBoss();
    this.hud.hint('');
    this.hud.subtitle('');
    this.galleryTrack = null;
    this._renderGallery();
    document.body.classList.remove('is-playing');
  }

  _renderGallery() {
    this.hud.showScreen(
      screenGallery({
        tab: this.galleryTab,
        progress: this.save.progress,
        playingTrack: this.galleryTrack,
      }),
      { dim: true }
    );
  }

  closeGallery() {
    this.audio.stopMusic(0.25);
    this.galleryTrack = null;
    const back = this.galleryReturn;
    this.galleryReturn = 'TITLE';
    if (back === 'VICTORY') {
      this.showVictory();
    } else {
      this._showTitleScreen();
    }
  }

  _selectGalleryTab(tab) {
    if (!['bestiary', 'music', 'triforce'].includes(tab)) return;
    if (tab !== 'music' && this.galleryTrack) {
      this.audio.stopMusic(0.2);
      this.galleryTrack = null;
    }
    this.galleryTab = tab;
    this._renderGallery();
  }

  _previewTrack(trackId) {
    const track = TRACKS.find((entry) => entry.id === trackId);
    if (!track || !this.save.progress.tracks[trackId]) return;
    this.audio.unlock();
    if (this.galleryTrack === trackId) {
      this.audio.stopMusic(0.2);
      this.galleryTrack = null;
      this._renderGallery();
      return;
    }
    this.audio.stopMusic(0.15);
    if (track.kind === 'boss') {
      this.audio.startBossTheme({ ...track.config, style: track.stageId });
    } else {
      this.audio.startStage({ ...track.config, style: track.stageId });
      this.audio.setAwaken(10);
    }
    this.galleryTrack = trackId;
    this.galleryTab = 'music';
    this._renderGallery();
  }

  _shareResult() {
    if (!this.lastShareText) return;
    const write = async () => {
      try {
        await navigator.clipboard.writeText(this.lastShareText);
        this.hud.popup('RESULT COPIED', window.innerWidth * 0.5, window.innerHeight * 0.4, 'harmony');
      } catch {
        window.prompt('Copy your result:', this.lastShareText);
      }
    };
    write();
  }

  _clickPrimary() {
    const focused = document.activeElement;
    if (
      focused &&
      this.hud.screenEl.contains(focused) &&
      focused.tagName === 'BUTTON' &&
      !focused.disabled
    ) {
      focused.click();
      return true;
    }
    const btn =
      this.hud.screenEl.querySelector('.screen-actions .btn-primary, .results-actions .btn-primary, .over-actions .btn-primary, .title-actions .btn-primary, .btn-primary');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  _cycleScreenFocus(direction = 1) {
    const items = [...this.hud.screenEl.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')].filter(
      (el) => el.offsetParent !== null
    );
    if (!items.length) return;
    items.forEach((el) => el.classList.remove('pad-focus'));
    const current = items.indexOf(document.activeElement);
    const next =
      current === -1
        ? direction > 0
          ? 0
          : items.length - 1
        : (current + direction + items.length) % items.length;
    const target = items[next];
    target.classList.add('pad-focus');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------------------------ */
  /* boot / attract                                                     */
  /* ------------------------------------------------------------------ */

  start() {
    this.showTitle();
  }

  showTitle() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this._teardownWorld();
    const unlocked = this.save.progress.unlocked || 1;
    const resumeStage = clamp(this.save.progress.campaignStage || 0, 0, unlocked - 1);
    const previewIndex = this.save.progress.campaignComplete
      ? STAGES.length - 1
      : Math.min(STAGES.length - 1, resumeStage);
    this._buildPreview(previewIndex);
    this.audio.stopMusic(0.4);
    this._refreshDailyInfo();
    this._showTitleScreen();
  }

  _buildPreview(stageIndex) {
    this._teardownWorld();
    const stage = STAGES[stageIndex];
    this.stageIndex = stageIndex;
    this.stage = stage;
    this.difficulty = STAGE_DIFFICULTY[stageIndex];
    this.rail = new Rail(stage.rail);
    this.world.bossFxLayer.visible = true;
    this.world.bossLayer.visible = true;
    this.world.enemyLayer.visible = true;
    this.world.projectileLayer.visible = true;
    this.world.setStage(stage);
    this.environment = buildEnvironment(this.world.environmentLayer, stage, this.rail);
    this.player = new Player(this);
    this.player.setRail(this.rail);
    this.player.setVisible(true);
    this.player.setAwaken(1 + stageIndex);
    this.playerDistance = 18;
    this.playerSpeed = 8;
    this.speedTarget = 8;
    this.boss = null;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.player.update(0.016, this.playerDistance, this.clock);
    this.world.initialized = false;
    this.world.updateCamera(0.016, this.rail, this.playerDistance, this.player, {
      mode: 'title',
      boss: false,
      reticleX: 0,
      reticleY: 0,
    });
  }

  _teardownWorld() {
    this.hud.clearLocks();
    this.hud.hideBoss();
    if (this.environment) {
      this.environment.dispose();
      this.environment = null;
    }
    for (const enemy of this.enemies) enemy.remove();
    this.enemies = [];
    for (const p of this.projectiles) p.remove();
    this.projectiles = [];
    for (const pickup of this.pickups) pickup.group.parent?.remove(pickup.group);
    this.pickups = [];
    if (this.boss) {
      this.boss.dispose();
      this.boss = null;
    }
    this.fx.clear();
    this.locks = [];
    this.fireQueue = [];
    this.player?.dispose?.();
    this.player = null;
    this.rail = null;
    this.audio.stopMusic(0.15);
  }

  /* ------------------------------------------------------------------ */
  /* run / stage flow                                                   */
  /* ------------------------------------------------------------------ */

  _beginRun({ maxHealth = 16, seed = (Math.random() * 0xffffffff) >>> 0 } = {}) {
    this.score = 0;
    this.rupees = 0;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.runStats = this._emptyStats();
    this.runPlayTime = 0;
    this.runSeed = seed >>> 0;
    this.gameRng = seeded(this.runSeed);
    this.powers = { ...this.save.progress.powers };
    this.shieldCharges = this.powers.courage ? 1 : 0;
    this.wisdomActive = 0;
    this.wisdomCooldown = 0;
    this.extraLocks = 0;
    this.pendingExtraLocks = 0;
    this.pendingNextStage = null;
    this.shrinePurchases = {};
    this.shrineNextStage = null;
    this.harmonyChain = 0;
    this.harmonyTimer = 0;
    this.lastResult = null;
    this.lastShareText = '';
    this.bossRushCleared = 0;
    this._runTotalsSaved = false;
    this._pendingVictoryBest = null;
    this.save.progress.totalRuns += 1;
    this.save.save();
  }

  startNewGame() {
    this.startCampaign();
  }

  startCampaign() {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.mode = 'campaign';
    const progress = this.save.progress;
    let start = 0;
    if (!progress.campaignComplete) {
      start = clamp(progress.campaignStage || 0, 0, STAGES.length - 1);
    } else {
      progress.campaignComplete = false;
      progress.campaignStage = 0;
      this.save.save();
    }
    this._beginRun({ maxHealth: 16 });
    this._loadStage(start, { story: true });
  }

  startScoreAttack(index = 0) {
    const i = clamp(Number(index) || 0, 0, STAGES.length - 1);
    if (i + 1 > (this.save.progress.unlocked || 1)) return;
    this.audio.unlock();
    this.audio.uiConfirm();
    this.mode = 'score';
    this._beginRun({ maxHealth: 16, seed: (Math.random() * 0xffffffff) >>> 0 });
    this._loadStage(i, { story: false });
  }

  startDaily() {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.mode = 'daily';
    const date = localDateKey();
    const seed = hashString(`rez-hyrule-daily:${date}`) >>> 0;
    const stageIndex = seed % STAGES.length;
    this.dailyInfo = { date, seed, stageIndex };
    this._beginRun({ maxHealth: 16, seed });
    this._loadStage(stageIndex, { story: false });
  }

  startBossRush() {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.mode = 'bossrush';
    this.bossRushIndex = 0;
    this._beginRun({ maxHealth: 20, seed: (Math.random() * 0xffffffff) >>> 0 });
    this._loadStage(0, { story: false, bossOnly: true });
  }

  _runMetaText() {
    if (this.mode === 'bossrush') {
      return `BOSS RUSH · GUARDIAN ${roman(this.bossRushIndex + 1)} / ${roman(STAGES.length)}`;
    }
    if (this.mode === 'score') return `SCORE ATTACK · ${this.stage.chapter}`;
    if (this.mode === 'daily') return `DAILY RAIL · ${prettyDate(this.dailyInfo?.date || localDateKey())}`;
    return `CAMPAIGN · RAIL ${roman(this.stageIndex + 1)} / ${roman(STAGES.length)}`;
  }

  _syncHudPowers() {
    if (this.powers.courage) this.shieldCharges = Math.max(1, this.shieldCharges);
    this.shieldCharges = Math.max(0, this.shieldCharges);
    this.hud.setPowers(this.powers, this.shieldCharges);
    this.hud.setWisdom({
      active: this.wisdomActive,
      cooldown: this.wisdomCooldown,
      duration: ABILITY_DURATION,
    });
  }

  _loadStage(index, { story = true, bossOnly = false } = {}) {
    this.stageIndex = index;
    const stage = STAGES[index];
    this.stage = stage;
    this.difficulty = STAGE_DIFFICULTY[index];
    this._teardownWorld();
    this.audio.unlock();
    this.audio.stopMusic(0.2);
    this.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
    if (this.mode === 'campaign') this.save.setCampaignStage(index);

    this.rail = new Rail(stage.rail);
    this.world.bossFxLayer.visible = true;
    this.world.bossLayer.visible = true;
    this.world.enemyLayer.visible = true;
    this.world.projectileLayer.visible = true;
    this.world.setStage(stage);
    this.environment = buildEnvironment(this.world.environmentLayer, stage, this.rail);
    this.player = new Player(this);
    this.player.setRail(this.rail);
    this.player.setVisible(true);

    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.boss = null;
    this.locks = [];
    this.fireQueue = [];
    this.waveCount = 0;
    this.waveTimer = bossOnly ? 9999 : 1.15;
    this.quoteFlags = stage.story.quotes.map(() => false);
    this.playerDistance = 10;
    this.playerSpeed = 5;
    this.speedTarget = 5;
    this.bossTrigger = this.rail.length - 800;
    this.bossEnd = this.rail.length - 130;
    this.pendingNextStage = null;
    this.stageElapsed = 0;
    this.stats = this._emptyStats();
    this.awaken = clamp(1 + index, 1, 10);
    this.awakenCharge = 0;
    this.stats.maxAwaken = this.awaken;
    this.invulnerable = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.harmonyChain = 0;
    this.harmonyTimer = 0;
    this.clearTimer = 0;
    this.extraLocks = this.pendingExtraLocks || 0;
    this.pendingExtraLocks = 0;
    this.wisdomActive = 0;
    this.wisdomCooldown = 0;
    this._padHintShown = false;
    this.stageEntryScore = this.score;
    this.stageEntryRunStats = { ...this.runStats };
    this.stageEntryRupees = this.rupees;
    this._waveRng = seeded((this.runSeed + index * 7919) >>> 0);
    this.player.setAwaken(this.awaken);
    this.save.markTrack(`stage:${stage.id}`);

    this._syncHudPowers();
    this.hud.setHearts(this.health, this.maxHealth, { animate: false });
    this.hud.setAwaken(this.awaken);
    this.hud.setScore(this.score, false);
    this.hud.setRupees(this.rupees);
    this.hud.setChain(this.combo, this.harmonyChain);
    this.hud.setRunMeta(this._runMetaText());
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.subtitle('');
    this.hud.hint('');
    this.hud.clearLocks();
    this.world.initialized = false;
    this.player.update(0.016, this.playerDistance, this.clock);
    this.world.updateCamera(0.016, this.rail, this.playerDistance, this.player, {
      mode: 'story',
      reticleX: 0,
      reticleY: 0,
    });
    this.input.setEnabled(false);
    document.body.classList.remove('is-playing');

    if (bossOnly) {
      this._beginBossOnlyFight();
      return;
    }
    if (story) {
      this.state = 'STORY';
      this.hud.showScreen(
        screenStory({ stage, index, total: STAGES.length }),
        { dim: true }
      );
      this.speedTarget = 5;
    } else {
      this.beginPlay();
    }
  }

  _beginBossOnlyFight() {
    this.playerDistance = Math.max(140, this.rail.length - 800);
    this.playerSpeed = 0;
    this.speedTarget = 0;
    this.bossTrigger = this.playerDistance;
    this.bossEnd = this.rail.length - 130;
    this.stageElapsed = 0;
    this.hud.hideScreen();
    this.hud.showHud(true);
    this.hud.setHearts(this.health, this.maxHealth, { animate: false });
    this.hud.setScore(this.score, false);
    this.hud.setRupees(this.rupees);
    this.hud.setRunMeta(this._runMetaText());
    this.hud.setPowers(this.powers, this.shieldCharges);
    this.input.setEnabled(true);
    this.input.setAimCenter();
    document.body.classList.add('is-playing');
    this.player.update(0.016, this.playerDistance, this.clock);
    this.world.initialized = false;
    this.world.updateCamera(0.016, this.rail, this.playerDistance, this.player, {
      mode: 'play',
      boss: true,
      reticleX: 0,
      reticleY: 0,
    });
    this.state = 'PLAYING';
    this._startBoss();
    this._checkSoundPrompt();
  }

  beginPlay() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.audio.stopMusic(0.18);
    this.hud.hideScreen();
    this.state = 'PLAYING';
    this.input.setEnabled(true);
    this.input.setAimCenter();
    this.hud.showHud(true);
    this.hud.hideReticle();
    this.hud.setRunMeta(this._runMetaText());
    document.body.classList.add('is-playing');
    this.speedTarget = 30;
    this.stageElapsed = 0;
    this.waveTimer = 3.2;
    this.playerDistance = Math.max(10, Math.min(this.playerDistance, 26));
    this.playerSpeed = 8;
    this.quoteFlags = this.stage.story.quotes.map(() => false);
    this.audio.startStage({ ...this.stage.music, style: this.stage.id });
    this.audio.setAwaken(this.awaken);
    this._setAwaken(this.awaken, { silent: true });
    this.save.markTrack(`stage:${this.stage.id}`);
    const kicker =
      this.mode === 'score'
        ? `SCORE ATTACK · RAIL ${roman(this.stageIndex + 1)}`
        : this.mode === 'daily'
          ? `DAILY RAIL · ${prettyDate(this.dailyInfo?.date || localDateKey())}`
          : this.stage.chapter;
    this.hud.showBanner({
      kicker,
      title: this.stage.name,
      sub: this.stage.epithet,
      duration: 2200,
    });
    const abilityHint = this.powers.wisdom
      ? this.isTouch
        ? '<span><span class="key">◉</span> NAYRU’S FOCUS</span>'
        : '<span><span class="key">E / X</span> NAYRU’S FOCUS</span>'
      : '';
    const padAbilityHint = this.powers.wisdom
      ? '<span><span class="key">X</span> NAYRU’S FOCUS</span>'
      : '';
    const padHint = this.input.gamepadConnected
      ? `<span><span class="key">R/L STICK</span> AIM</span><span><span class="key">RT / A</span> LOCK & STRIKE</span><span><span class="key">START</span> PAUSE</span>${padAbilityHint}`
      : this.isTouch
        ? `<span><span class="key">HOLD</span> LOCK THE MALICE</span><span><span class="key">DRAG</span> ACROSS FOES</span><span><span class="key">RELEASE</span> STRIKE</span>${abilityHint}`
        : `<span><span class="key">HOLD LMB</span> LOCK THE MALICE</span><span><span class="key">RELEASE</span> STRIKE IN HARMONY</span><span><span class="key">SPACE</span> ALSO LOCKS</span>${abilityHint}`;
    this.hud.hint(padHint, 9000);
    this._padHintShown = this.input.gamepadConnected;
    if (this.stageIndex === 0 && this.mode === 'campaign') {
      window.setTimeout(() => {
        if (this.state === 'PLAYING') {
          this.hud.subtitle(
            'Malice holds at the edge of the rail. <span class="gold">Take your time — lock it before it slips away.</span>',
            5600
          );
        }
      }, 1800);
    }
    if (this.mode === 'daily') {
      window.setTimeout(() => {
        if (this.state === 'PLAYING' || this.state === 'BOSS') {
          const best = this.save.progress.daily?.date === (this.dailyInfo?.date || '') ? this.save.progress.daily.score : 0;
          this.hud.subtitle(
            `Today’s rail is seeded. <span class="gold">Best today: ${pad(best, 7)}.</span> Make it stranger.`,
            4200
          );
        }
      }, 3600);
    }
    this._syncHudPowers();
    this.audio.uiConfirm();
    this._checkSoundPrompt();
  }

  restartStage() {
    if (this.state === 'PAUSED') this.audio.resume();
    this.audio.stopMusic(0.25);
    this.hud.hideScreen();
    if (this.mode === 'score') {
      this.startScoreAttack(this.stageIndex);
      return;
    }
    if (this.mode === 'daily') {
      this.startDaily();
      return;
    }
    if (this.mode === 'bossrush') {
      this.startBossRush();
      return;
    }
    this.score = this.stageEntryScore ?? this.score;
    this.health = this.maxHealth;
    this._runTotalsSaved = false;
    this.rupees = this.stageEntryRupees ?? this.rupees;
    if (this.stageEntryRunStats) this.runStats = { ...this.stageEntryRunStats };
    this.shieldCharges = this.powers.courage ? 1 : 0;
    this._loadStage(this.stageIndex, { story: this.mode === 'campaign' });
    document.body.classList.remove('is-playing');
  }

  nextStage() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.showVictory();
      return;
    }
    const next = this.stageIndex + 1;
    this._loadStage(next, { story: this.mode === 'campaign' });
  }

  _startBoss() {
    if (this.boss) return;
    this.state = 'BOSS';
    // The rail keeps moving during a guardian fight. The boss maintains its
    // distance automatically; this is the cruise speed of the duel.
    this.speedTarget = this.mode === 'bossrush' ? 10.5 : 13;
    this.bossEnd = this.rail.length - 130;
    this.playerSpeed = Math.max(this.playerSpeed, 8);
    this.waveTimer = 9999;
    if (this.mode === 'bossrush') this.bossRushIndex = this.stageIndex;
    this.save.markBoss(this.stage.id);
    this.save.markTrack(`boss:${this.stage.id}`);
    this.hud.setRunMeta(this._runMetaText());
    this.hud.hint(
      this.input.gamepadConnected
        ? '<span><span class="key">RT / A</span> LOCK THE MALICE EYES</span><span>BREAK THEM ALL TO EXPOSE THE CORE</span>'
        : '<span><span class="key">LOCK</span> THE MALICE EYES</span><span>BREAK THEM ALL TO EXPOSE THE CORE</span>',
      10000
    );
    for (const enemy of this.enemies) {
      this.fx.sparkle(enemy.worldPos, 0x9dffdc, 3);
      enemy.remove();
    }
    this.enemies = [];
    for (const projectile of this.projectiles) projectile.remove();
    this.projectiles = [];
    this.boss = new Boss(this, this.stage.boss);
    this.boss.game = this;
    this.hud.showBoss({
      name: this.boss.name,
      sub: this.stage.boss.sub,
      phase: 'PHASE I',
    });
    const bossKicker =
      this.mode === 'bossrush'
        ? `BOSS RUSH · GUARDIAN ${roman(this.stageIndex + 1)} OF ${roman(STAGES.length)}`
        : 'GUARDIAN OF THE RAIL';
    this.hud.showBanner({
      kicker: bossKicker,
      title: this.stage.boss.shortName,
      sub: this.stage.boss.roarLine,
      kind: 'boss',
      duration: 2500,
    });
    this.hud.subtitle(this.stage.introBoss, 6000);
    this.audio.startBossTheme({ ...(this.stage.bossMusic || this.stage.music), style: this.stage.id });
    this.audio.bossRoar();
    this.world.shake(0.9, 1.1);
    this.hud.flash('fire');
    this.player.setCharging(false);
    this.locks = [];
    this.hud.clearLocks();
  }

  _grantBossRewards() {
    const stage = this.stage;
    const progress = this.save.progress;
    const bossWasSeen = !!progress.bosses[stage.id];
    this.save.markBoss(stage.id);
    this.save.markTrack(`boss:${stage.id}`);
    if (!bossWasSeen) this.save.progress.totalBosses = (this.save.progress.totalBosses || 0) + 1;

    if (stage.triforcePiece) {
      const added = this.save.addFragment(stage.triforcePiece);
      if (added) {
        this.hud.popup(`${stage.triforcePiece} RECOVERED`, window.innerWidth * 0.5, window.innerHeight * 0.32, 'harmony');
      }
    }

    const powerKey = CAMPAIGN_POWERS[this.stageIndex];
    if (powerKey) {
      const newlyUnlocked = this.save.unlockPower(powerKey);
      this.powers[powerKey] = true;
      if (newlyUnlocked) {
        if (powerKey === 'courage') this.shieldCharges = Math.max(1, this.shieldCharges);
        this.hud.popup(`${POWER_INFO[powerKey]?.name || powerKey.toUpperCase()} AWAKENED`, window.innerWidth * 0.5, window.innerHeight * 0.4, 'harmony');
        this.hud.subtitle(
          powerKey === 'power'
            ? '<span class="gold">Din’s Power awakens.</span> Your light now bites deeper into guardians and armor.'
            : powerKey === 'courage'
              ? '<span class="green">Farore’s Courage awakens.</span> A ward now shields you from the next wound on every rail.'
              : '<span class="cyan">Nayru’s Wisdom awakens.</span> Press E to slow the malice and paint your locks in peace.',
          6000
        );
        this.audio.awakenChord();
      }
    }

    if (this.mode === 'campaign') {
      const nextIndex = this.stageIndex + 1;
      if (nextIndex < STAGES.length) {
        this.save.unlockThrough(nextIndex);
        this.save.setCampaignStage(nextIndex);
        this.pendingNextStage = nextIndex;
      } else {
        this.pendingNextStage = null;
        this.save.completeCampaign();
      }
    }

    this._syncHudPowers();
    this.save.save();
  }

    onBossPhase(boss, phase) {
    if (!boss || boss !== this.boss) return;
    this.audio.setBossPhase?.(phase);
    this.hud.setBossMeta({
      phase: `PHASE ${roman(phase)}`,
      sub: phase === 3 ? 'THE CORE IS EXPOSED — STRIKE NOW' : this.stage.boss.sub,
    });
    if (phase === 2) {
      this.hud.subtitle('The guardian reels. Its eyes are failing — <span class="gold">keep the pressure.</span>', 4200);
    } else if (phase === 3) {
      this.hud.subtitle('The shell falls away. <span class="gold">There it is. The heart of the malice.</span>', 4200);
    }
  }

  onBossDamaged(boss, killed) {
    if (!boss || boss !== this.boss) return;
    this.hud.setBossHealth(boss.healthRatio);
  }

  onBossDefeated(boss) {
    if (['CLEAR', 'RESULTS', 'VICTORY', 'BOSS_RUSH_RESULTS'].includes(this.state)) return;
    this.state = 'CLEAR';
    this.input.setEnabled(false);
    this.hud.hideReticle();
    this.hud.clearLocks();
    this.hud.hint('');
    this.hud.subtitle('');
    this.locks = [];
    this.fireQueue = [];
    this.invulnerable = 999;
    this.clearTimer = 3.1;
    this.speedTarget = 0;
    this.score += 15000;
    this.stats.bossKills += 1;
    this.runStats.bossKills += 1;
    this.runPlayTime = (this.runPlayTime || 0) + this.stageElapsed;
    this.stats.maxAwaken = Math.max(this.stats.maxAwaken, this.awaken);
    this.runStats.maxAwaken = Math.max(this.runStats.maxAwaken, this.awaken);
    this.hud.setScore(this.score);
    this.hud.setBossHealth(0);
    this.audio.stopMusic(2.4);
    this.audio.stopDrone(1.6);
    this.audio.fanfare();
    this.world.shake(1.0, 1.6);
    this.world.punchFov(4);
    this.hud.flash('fire');

    this._grantBossRewards();
    if (this.mode === 'bossrush') {
      this.bossRushCleared = Math.max(this.bossRushCleared, this.stageIndex + 1);
    }

    // Every guardian yields a heart container and a breath of relief.
    const oldMax = this.maxHealth;
    this.maxHealth = Math.min(MAX_HEALTH, this.maxHealth + 4);
    const gainedContainer = this.maxHealth - oldMax;
    this.health = Math.min(this.maxHealth, this.health + 8 + gainedContainer);
    if (this.powers.courage) this.shieldCharges = Math.max(1, this.shieldCharges);
    this.hud.setHearts(this.health, this.maxHealth, { animate: true });
    this.hud.setRupees(this.rupees);
    this._syncHudPowers();

    for (const p of this.projectiles) p.remove();
    this.projectiles = [];
    for (const enemy of this.enemies) enemy.remove();
    this.enemies = [];
    for (const pickup of this.pickups) pickup.group.parent?.remove(pickup.group);
    this.pickups = [];
    this.enemyLayer.visible = false;
    this.projectileLayer.visible = false;
    document.body.classList.remove('is-playing');

    // Leaving the controller to rest while the cinematic plays.
    if (this.input.gamepadConnected) this.input.padDown = false;
  }

  _hideBossScene() {
    if (this.boss) this.boss.group.visible = false;
    this.world.bossFxLayer.visible = false;
  }

  _calculateRank() {
    const accuracy = this.stats.spawned > 0 ? this.stats.killed / this.stats.spawned : 1;
    const hitRatio = this.stats.shots > 0 ? this.stats.hits / this.stats.shots : 0;
    const harmonyRatio = this.stats.shots > 0 ? this.stats.harmony / this.stats.shots : 0;
    const rating = accuracy * 2.2 + hitRatio * 1.2 + harmonyRatio * 0.8 + this.stats.maxAwaken * 0.05;
    return rating >= 2.75 ? 'S' : rating >= 2.2 ? 'A' : rating >= 1.65 ? 'B' : 'C';
  }

  _finalizeRunTotals() {
    if (this._runTotalsSaved) return;
    this._runTotalsSaved = true;
    this.save.addTotals({
      kills: this.runStats.killed,
      time: (this.runPlayTime || 0) + (this.state === 'GAMEOVER' ? this.stageElapsed : 0),
    });
  }

  _resultStats() {
    return {
      ...this.stats,
      time: formatTime(this.stageElapsed),
      score: this.score,
      rupees: this.rupees,
    };
  }

  _buildShareText(mode, rank, accuracy) {
    const stageName = this.stage?.name || 'HYRULE';
    const modeLabel =
      mode === 'daily'
        ? `DAILY RAIL ${this.dailyInfo?.date || localDateKey()}`
        : mode === 'score'
          ? `SCORE ATTACK · ${stageName}`
          : `CAMPAIGN · ${stageName}`;
    return `REZ: HYRULE — ${modeLabel} — ${this.score.toLocaleString('en-US')} pts · Rank ${rank} · ${Math.round(accuracy * 100)}% shot down — ${SITE_URL}`;
  }

  _finishStage() {
    this._hideBossScene();
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.subtitle('');
    this.hud.hint('');

    const rank = this._calculateRank();
    if (this.mode === 'score') {
      this.save.recordStage(this.stage.id, {
        score: this.score,
        rank,
        accuracy:
          this.stats.spawned > 0 ? Math.round((this.stats.killed / this.stats.spawned) * 100) : 100,
      });
    }
    const isBest = this._saveBest(this.score);
    const accuracy = this.stats.spawned > 0 ? this.stats.killed / this.stats.spawned : 1;
    this.lastShareText = this._buildShareText(this.mode, rank, accuracy);
    this.lastResult = {
      mode: this.mode,
      stage: this.stage.id,
      stageName: this.stage.name,
      score: this.score,
      rank,
      accuracy,
    };

    if (this.mode === 'daily') {
      const date = this.dailyInfo?.date || localDateKey();
      this.save.recordDaily(date, this.stageIndex, this.score, rank);
    }

    if (this.mode === 'bossrush') {
      if (this.stageIndex < STAGES.length - 1) {
        const next = this.stageIndex + 1;
        this.bossRushIndex = next;
        this.health = this.maxHealth;
        this.shieldCharges = this.powers.courage ? 1 : 0;
        this.audio.stopMusic(0.25);
        this.hud.hideScreen();
        this._loadStage(next, { story: false, bossOnly: true });
        return;
      }
      this.showBossRushResults();
      return;
    }

    const nextIndex = this.stageIndex + 1;
    const nextStage = nextIndex < STAGES.length ? STAGES[nextIndex] : null;

    if (this.mode === 'campaign' && !nextStage) {
      this._pendingVictoryBest = isBest;
      this._finalizeRunTotals();
      this.save.completeCampaign();
      this.save.progress.bestRank = rank;
      this.save.save();
      this.showVictory();
      return;
    }

    this.state = 'RESULTS';
    this.pendingNextStage = this.mode === 'campaign' && nextStage ? nextIndex : null;
    const dailyBest =
      this.mode === 'daily' && this.save.progress.daily?.date === (this.dailyInfo?.date || '')
        ? this.save.progress.daily.score
        : null;
    this.hud.showScreen(
      screenResults({
        stage: this.stage,
        stats: this._resultStats(),
        rank,
        piece: this.stage.triforcePiece,
        best: this.highScore,
        isBest,
        mode: this.mode,
        nextStage,
        stageBest: this.save.progress.stageBest[this.stage.id] || null,
        dailyBest,
        dailyDate: this.dailyInfo?.date || localDateKey(),
      }),
      { dim: true }
    );
    this.audio.uiConfirm();
    this.save.save();
  }

  showBossRushResults() {
    this.state = 'BOSS_RUSH_RESULTS';
    this.input.setEnabled(false);
    this._hideBossScene();
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.hint('');
    this.hud.subtitle('');
    this.audio.stopMusic(0.6);
    this.audio.fanfare();
    this._finalizeRunTotals();
    const isBest = this.save.recordBossRush(this.score);
    this._saveBest(this.score);
    this.hud.showScreen(
      screenBossRushResults({
        score: this.score,
        best: this.save.progress.bossRushBest,
        time: formatTime(this.runPlayTime || this.stageElapsed),
        guardians: this.bossRushCleared || STAGES.length,
        isBest,
      }),
      { dim: true }
    );
    document.body.classList.remove('is-playing');
  }

  showVictory() {
    this.state = 'VICTORY';
    this.input.setEnabled(false);
    this._hideBossScene();
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hideReticle();
    this.hud.hint('');
    this.hud.subtitle('');
    this.audio.stopMusic(1);
    const isBest = this._pendingVictoryBest != null ? this._pendingVictoryBest : this.score > this.save.progress.bestScore;
    this._pendingVictoryBest = null;
    this._finalizeRunTotals();
    this.save.completeCampaign();
    this._saveBest(this.score);
    this.save.progress.bestRank = this.save.progress.bestRank || 'S';
    this.save.save();
    this.runStats.maxAwaken = Math.max(this.runStats.maxAwaken, this.awaken);
    this.hud.showScreen(
      screenVictory({
        score: this.score,
        best: this.highScore,
        stats: {
          killed: this.runStats.killed,
          harmony: this.runStats.harmony,
          time: formatTime(this.runPlayTime || this.stageElapsed),
        },
        isBest,
      }),
      { dim: true }
    );
    this.audio.fanfare();
    document.body.classList.remove('is-playing');
  }

  gameOver() {
    this.state = 'GAMEOVER';
    this.input.setEnabled(false);
    this.hud.hideReticle();
    this.hud.clearLocks();
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hint('');
    this.hud.subtitle('');
    this.audio.stopMusic(1.4);
    this.audio.defeat();
    this._saveBest(this.score);
    this._finalizeRunTotals();
    this.locks = [];
    this.fireQueue = [];
    this.hud.showScreen(
      screenGameOver({
        stage: this.stage,
        score: this.score,
        best: this.highScore,
        killed: this.stats.killed,
        spawned: this.stats.spawned,
        mode: this.mode,
      }),
      { dim: true }
    );
    document.body.classList.remove('is-playing');
  }

  _showPauseScreen() {
    this.hud.showScreen(
      screenPause({
        stage: this.stage,
        score: this.score,
        rupees: this.rupees,
        hearts: this.health,
        awakened: this.awaken,
        muted: this.audio.muted,
        mode: this.mode,
      }),
      { dim: true }
    );
  }

  pauseGame() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    this.prevState = this.state;
    this.state = 'PAUSED';
    this.input.setEnabled(false);
    this.audio.pause();
    this.hud.hideReticle();
    this.hud.clearLocks();
    this.locks = [];
    this.fireQueue = [];
    this._showPauseScreen();
    document.body.classList.remove('is-playing');
  }

  resumeGame() {
    if (this.state !== 'PAUSED') return;
    this.state = this.prevState;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.hud.hideScreen();
    this.input.setEnabled(true);
    this.audio.resume();
    this.hud.showHud(true);
    document.body.classList.add('is-playing');
    this.audio.uiConfirm();
  }

  /* ------------------------------------------------------------------ */
  /* shrine                                                             */
  /* ------------------------------------------------------------------ */

  openShrine() {
    if (this.mode !== 'campaign' || this.pendingNextStage == null) {
      this.showTitle();
      return;
    }
    this.audio.uiConfirm();
    this.state = 'SHRINE';
    this.input.setEnabled(false);
    this.hud.hideReticle();
    this.hud.clearLocks();
    this.hud.showHud(false);
    this.hud.subtitle('');
    this.hud.hint('');
    this.shrineNextStage = this.pendingNextStage;
    this.shrinePurchases = this.shrinePurchases || {};
    this._renderShrine();
    document.body.classList.remove('is-playing');
  }

  _renderShrine() {
    const nextStage = STAGES[this.shrineNextStage];
    this.hud.showScreen(
      screenShrine({
        rupees: this.rupees,
        health: this.health,
        maxHealth: this.maxHealth,
        shieldCharges: this.shieldCharges,
        purchases: this.shrinePurchases,
        nextStage,
      }),
      { dim: true }
    );
  }

  _buyShrine(offer) {
    if (this.state !== 'SHRINE' || !offer) return;
    const costs = { heal: 30, heart: 100, lock: 80, shield: 60 };
    const cost = costs[offer];
    if (!cost || this.shrinePurchases[offer] || this.rupees < cost) return;
    if (offer === 'heal' && this.health >= this.maxHealth) return;
    if (offer === 'heart' && this.maxHealth >= MAX_HEALTH) return;
    if (offer === 'shield' && this.shieldCharges >= 3) return;
    this.rupees -= cost;
    this.shrinePurchases[offer] = true;
    if (offer === 'heal') {
      this.health = this.maxHealth;
    } else if (offer === 'heart') {
      this.maxHealth = Math.min(MAX_HEALTH, this.maxHealth + 4);
      this.health = Math.min(this.maxHealth, this.health + 4);
    } else if (offer === 'lock') {
      this.pendingExtraLocks = (this.pendingExtraLocks || 0) + 2;
    } else if (offer === 'shield') {
      this.shieldCharges += 1;
    }
    this.hud.setRupees(this.rupees);
    this.hud.setHearts(this.health, this.maxHealth, { animate: true });
    this._syncHudPowers();
    this.audio.pickup();
    this._renderShrine();
  }

  _continueFromShrine() {
    if (this.shrineNextStage == null) return;
    this.audio.uiConfirm();
    const next = this.shrineNextStage;
    this.state = 'STORY';
    this.shrineNextStage = null;
    this._loadStage(next, { story: true });
  }

  /* ------------------------------------------------------------------ */
  /* actions & input                                                    */
  /* ------------------------------------------------------------------ */

  handleAction(action, button = null) {
    switch (action) {
      case 'start':
        this.audio.unlock();
        this.startCampaign();
        break;
      case 'stage-select':
        this.showStageSelect();
        break;
      case 'score-stage':
        this.startScoreAttack(Number(button?.dataset?.stage));
        break;
      case 'boss-rush':
        this.startBossRush();
        break;
      case 'daily':
        this.startDaily();
        break;
      case 'gallery':
        this.openGallery(this.state === 'VICTORY' ? 'VICTORY' : 'TITLE');
        break;
      case 'gallery-tab':
        this._selectGalleryTab(button?.dataset?.tab);
        break;
      case 'preview-track':
        this._previewTrack(button?.dataset?.track);
        break;
      case 'options':
        this.openOptions(this.state === 'PAUSED' ? 'PAUSED' : 'TITLE');
        break;
      case 'back-options':
        this.closeOptions();
        break;
      case 'reset-settings':
        Object.assign(this.save.settings, DEFAULT_SETTINGS);
        this.save.save();
        this.applyAllSettings();
        this._renderOptions();
        break;
      case 'continue':
        this.audio.unlock();
        this.audio.uiConfirm();
        this.beginPlay();
        break;
      case 'next-stage':
        this.audio.unlock();
        this.audio.uiConfirm();
        this.nextStage();
        break;
      case 'retry':
      case 'retry-stage':
        this.audio.unlock();
        this.audio.uiConfirm();
        this.restartStage();
        break;
      case 'retry-rush':
        this.audio.unlock();
        this.audio.uiConfirm();
        this.startBossRush();
        break;
      case 'open-shrine':
        this.openShrine();
        break;
      case 'shrine-buy':
        this._buyShrine(button?.dataset?.offer);
        break;
      case 'shrine-continue':
        this._continueFromShrine();
        break;
      case 'share-result':
        this._shareResult();
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      case 'back-title':
      case 'title':
        this._returnToTitle();
        break;
      case 'resume':
        this.resumeGame();
        break;
      case 'mute': {
        this.audio.unlock();
        this.audio.toggleMuted();
        if (this.state === 'PAUSED') this._showPauseScreen();
        break;
      }
      case 'restart-full':
        this.startCampaign();
        break;
      default:
        break;
    }
  }

  _returnToTitle() {
    this.audio.unlock();
    this.audio.uiConfirm();
    if (this.state === 'GALLERY') {
      this.galleryReturn = 'TITLE';
      this.closeGallery();
      return;
    }
    this.audio.stopMusic(0.2);
    this.galleryTrack = null;
    this.showTitle();
  }

  _renderOptions() {
    this.hud.showScreen(
      screenOptions({
        settings: this.settings,
        gamepadConnected: !!this.input.gamepadConnected,
        gamepadId: this._safeGamepadId(),
      }),
      { dim: true }
    );
  }

  activateWisdom() {
    if (!this.powers.wisdom) return;
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    if (this.wisdomActive > 0 || this.wisdomCooldown > 0) return;
    this.wisdomActive = ABILITY_DURATION;
    this.wisdomCooldown = ABILITY_COOLDOWN;
    this.audio.unlock();
    this.audio.uiConfirm();
    this.fx.spawnWave(this.player.getPosition(), 0x8ef7ff, { size: 6, life: 0.6 });
    this.hud.subtitle('<span class="cyan">Nayru’s Focus.</span> The malice slows; your hand does not.', 2600);
    this.hud.setWisdom({ active: this.wisdomActive, cooldown: this.wisdomCooldown, duration: ABILITY_DURATION });
    this.world.punchFov(1.5);
  }

  onPadButton(button) {
    if (button === 'start') {
      if (this.state === 'PAUSED') this.resumeGame();
      else this.onPadButton('confirm');
      return;
    }
    const control = document.activeElement;
    const isSetting = this.hud.screenEl.contains(control) && control.matches('[data-setting]');
    if (button === 'menu-left' || button === 'menu-right') {
      const direction = button === 'menu-right' ? 1 : -1;
      if (isSetting) {
        if (control.type === 'range') {
          direction > 0 ? control.stepUp() : control.stepDown();
        } else if (control.tagName === 'SELECT') {
          control.selectedIndex = clamp(control.selectedIndex + direction, 0, control.options.length - 1);
        } else if (control.type === 'checkbox') {
          control.checked = direction > 0;
        }
        this.onSettingInput({ target: control });
      } else this._cycleScreenFocus(direction);
      return;
    }
    if (button === 'confirm' && isSetting) {
      if (control.type === 'checkbox') {
        control.checked = !control.checked;
        this.onSettingInput({ target: control });
      }
      return;
    }
    if (button === 'menu-next' || button === 'menu-prev') {
      this._cycleScreenFocus(button === 'menu-next' ? 1 : -1);
      return;
    }
    if (button === 'ability') {
      this.activateWisdom();
      return;
    }
    if (button === 'pause') {
      if (this.state === 'PLAYING' || this.state === 'BOSS') this.pauseGame();
      else if (this.state === 'PAUSED') this.resumeGame();
      return;
    }
    if (button === 'back') {
      if (this.state === 'OPTIONS') this.closeOptions();
      else if (this.state === 'STAGE_SELECT' || this.state === 'GALLERY') this._returnToTitle();
      else if (this.state === 'PAUSED') this.resumeGame();
      return;
    }
    if (button === 'confirm') {
      // If a menu button has pad focus, let A press that instead of the default.
      const focused = document.activeElement;
      if (
        focused &&
        this.hud.screenEl.contains(focused) &&
        focused.tagName === 'BUTTON' &&
        !focused.disabled
      ) {
        focused.click();
        return;
      }
      switch (this.state) {
        case 'TITLE':
          this.startCampaign();
          break;
        case 'STORY':
          this.audio.uiConfirm();
          this.beginPlay();
          break;
        case 'PAUSED':
          this.resumeGame();
          break;
        case 'PLAYING':
        case 'BOSS':
          break;
        default:
          this._clickPrimary();
          break;
      }
    }
  }

  onKey(code, event) {
    if (event.repeat) return;
    if (code === 'KeyM') {
      this.audio.unlock();
      this.audio.toggleMuted();
      if (this.state === 'PAUSED') this._showPauseScreen();
      return;
    }
    if (code === 'KeyF') {
      this.toggleFullscreen();
      return;
    }
    if (code === 'KeyE') {
      this.activateWisdom();
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      switch (this.state) {
        case 'OPTIONS':
          this.closeOptions();
          break;
        case 'STAGE_SELECT':
        case 'GALLERY':
          this._returnToTitle();
          break;
        case 'PLAYING':
        case 'BOSS':
          this.pauseGame();
          break;
        case 'PAUSED':
          this.resumeGame();
          break;
        default:
          break;
      }
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.audio.unlock();
      switch (this.state) {
        case 'TITLE':
          this.startCampaign();
          break;
        case 'STORY':
          this.audio.uiConfirm();
          this.beginPlay();
          break;
        case 'PAUSED':
          this.resumeGame();
          break;
        case 'PLAYING':
        case 'BOSS':
        case 'STAGE_SELECT':
        case 'GALLERY':
          break;
        default:
          this._clickPrimary();
          break;
      }
    }
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        try {
          await screen.orientation?.lock?.('landscape');
        } catch {
          /* Some browsers expose fullscreen without orientation locking. */
        }
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* Fullscreen requires a user gesture on most browsers. */
    }
  }

  shake(amount = 0.3, duration = 0.35) {
    this.world.shake(amount, duration);
  }

  /* ------------------------------------------------------------------ */
  /* main loop                                                          */
  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this.state === 'PAUSED') {
      this.input.update(dt);
      return;
    }
    this.clock += dt;
    this.input.update(dt);
    const state = this.state;

    if (state === 'TITLE') {
      this._updateAttract(dt, 9);
      return;
    }
    if (state === 'STORY') {
      this._updateAttract(dt, 4.2);
      return;
    }
    if (
      state === 'RESULTS' ||
      state === 'GAMEOVER' ||
      state === 'VICTORY' ||
      state === 'OPTIONS' ||
      state === 'GALLERY' ||
      state === 'STAGE_SELECT' ||
      state === 'SHRINE' ||
      state === 'BOSS_RUSH_RESULTS'
    ) {
      this._updateMenuScene(dt);
      return;
    }
    if (state === 'PLAYING' || state === 'BOSS') {
      this._updatePlaying(dt);
      return;
    }
    if (state === 'CLEAR') {
      this._updateClear(dt);
    }
  }

  _updateAttract(dt, speed) {
    this.playerDistance = Math.min(this.playerDistance + speed * dt, this.rail.length - 80);
    if (this.playerDistance >= this.rail.length - 80) this.playerDistance = 12;
    this.player?.update(dt, this.playerDistance, this.clock);
    this.world.updateCamera(dt, this.rail, this.playerDistance, this.player, {
      mode: 'title',
      reticleX: 0,
      reticleY: 0,
    });
    this.environment?.update(dt, this.playerDistance, this.clock, this.enemies.some(e => e.alive) || !!this.boss);
    this.fx.update(dt);
  }

  _updateMenuScene(dt) {
    // Keep the world breathing gently behind the results screen.
    this.playerDistance = Math.min(this.playerDistance + dt * 2.4, this.rail.length - 40);
    this.player?.update(dt, this.playerDistance, this.clock);
    this.world.updateCamera(dt, this.rail, this.playerDistance, this.player, {
      mode: 'results',
      reticleX: 0,
      reticleY: 0,
    });
    this.environment?.update(dt, this.playerDistance, this.clock, this.enemies.some(e => e.alive) || !!this.boss);
    this.fx.update(dt);
  }

  _updatePlaying(dt) {
    this.stageElapsed += dt;
    const isBoss = this.state === 'BOSS';
    const difficulty = STAGE_DIFFICULTY[this.stageIndex];

    if (this.wisdomActive > 0) this.wisdomActive = Math.max(0, this.wisdomActive - dt);
    if (this.wisdomCooldown > 0) this.wisdomCooldown = Math.max(0, this.wisdomCooldown - dt);
    if (this.harmonyTimer > 0) {
      this.harmonyTimer = Math.max(0, this.harmonyTimer - dt);
      if (this.harmonyTimer === 0) this.harmonyChain = 0;
    }
    const maliceScale = this.wisdomActive > 0 ? 0.32 : 1;

    // Speed ramps smoothly toward the target.
    this.playerSpeed = damp(this.playerSpeed, this.speedTarget, isBoss ? 1.1 : 0.9, dt);
    if (!isBoss) {
      this.playerDistance = Math.min(this.rail.length - 24, this.playerDistance + this.playerSpeed * dt);
    } else {
      // Keep the duel moving down the rail, easing to a near-stop only if
      // the fight runs all the way to the end of the stage.
      const end = this.bossEnd ?? this.rail.length - 130;
      const remaining = end - this.playerDistance;
      if (remaining > 0.5) {
        const ease = clamp(remaining / 150, 0.22, 1);
        this.playerDistance = Math.min(end, this.playerDistance + this.playerSpeed * ease * dt);
      }
    }

    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Reticle aim.
    this.player.setAim(this.input.aim.x, this.input.aim.y, window.innerWidth, window.innerHeight);
    this.player.setCharging(this.locks.length > 0);
    this.player.update(dt, this.playerDistance, this.clock);
    this.world.updateCamera(dt, this.rail, this.playerDistance, this.player, {
      mode: 'play',
      reticleX: this.player.retX,
      reticleY: this.player.retY,
      boss: isBoss,
    });
    this.environment?.update(dt, this.playerDistance, this.clock, this.enemies.some(e => e.alive) || !!this.boss);

    // Boss & minion logic.
    if (this.boss) {
      this.boss.update(dt * maliceScale, this);
      if (!isBoss) {
        // Keep dying boss animation but no targeting.
      }
    }

    // Wave spawning.
    if (!isBoss) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0 && (!this.audio.running || this.audio.getBeatInfo().phase < 0.15)) {
        this._spawnWave();
        const beat = this.audio.beatDur;
        const bar = this.audio.getBeatInfo().bar;
        const breathing = Math.floor(bar / 8) % 4 === 2 ? 1.5 : 1;
        this.waveTimer = Math.max(2, Math.round(difficulty.spawnRate * breathing / beat)) * beat - beat * 0.15;
      }
      if (!this.boss && this.playerDistance >= this.bossTrigger && (!this.audio.running || this.audio.getBeatInfo().beat % 4 < 0.15)) {
        this._startBoss();
      }
    } else if (this.boss && this.boss.alive) {
      // boss minions are spawned by the boss; nothing extra
    }

    // Quotations.
    if (!isBoss) this._updateQuotes();

    // Enemies.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.enemies.splice(i, 1);
        continue;
      }
      e.update(dt * maliceScale, this);
    }

    // Projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.update(dt * maliceScale, this);
    }

    // Heart pickups.
    this._updatePickups(dt);

    // Firing queue.
    this._updateFireQueue(dt);

    // Targeting & HUD.
    this._updateTargeting(dt);
    this._updateBeatHud();
    this._syncChainHud();
    this.hud.setWisdom({
      active: this.wisdomActive,
      cooldown: this.wisdomCooldown,
      duration: ABILITY_DURATION,
    });

    this.fx.update(dt);

    // Heart/low health pulse.
    if (this.health <= 4 && this.health > 0) {
      this.hud.root.style.filter = `drop-shadow(0 0 ${(4 - this.health) * 2}px rgba(255,60,90,.3))`;
    } else if (this.hud.root.style.filter) {
      this.hud.root.style.filter = '';
    }
  }

  _updateBeatHud() {
    const info = this.audio.getBeatInfo();
    if (!info.playing) {
      this.hud.setBeat(0, 99, false);
      return;
    }
    this.hud.setBeat(info.phase, this.audio.beatError(), true);
  }

  _syncChainHud() {
    if (
      this._lastChainDisplay.combo !== this.combo ||
      this._lastChainDisplay.harmony !== this.harmonyChain
    ) {
      this._lastChainDisplay.combo = this.combo;
      this._lastChainDisplay.harmony = this.harmonyChain;
      this.hud.setChain(this.combo, this.harmonyChain);
    }
  }

  _updateClear(dt) {
    this.clearTimer -= dt;
    this.playerSpeed = damp(this.playerSpeed, 0, 2, dt);
    this.playerDistance = Math.min(this.rail.length - 20, this.playerDistance + this.playerSpeed * dt);
    this.player?.update(dt, this.playerDistance, this.clock);
    this.world.updateCamera(dt, this.rail, this.playerDistance, this.player, {
      mode: 'play',
      reticleX: 0,
      reticleY: 0,
      boss: true,
    });
    this.environment?.update(dt, this.playerDistance, this.clock, this.enemies.some(e => e.alive) || !!this.boss);
    this.boss?.update(dt * 0.55, this);
    for (const enemy of this.enemies) {
      if (enemy.alive) enemy.update(dt * 0.5, this);
    }
    this.fx.update(dt);
    if (this.clearTimer <= 0) this._finishStage();
  }

  /* ------------------------------------------------------------------ */
  /* combat                                                             */
  /* ------------------------------------------------------------------ */

  onLockStart() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    this.locks = [];
    this.fireQueue = [];
    this.isHarmonicRelease = false;
  }

  onLockEnd() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    const locks = this.locks.filter((lock) => lock.ref?.alive !== false && lock.pos);
    this.locks = [];
    this.player.setCharging(false);
    const error = this.audio.beatError();
    const timing = error < 0.055 ? 'perfect' : error < 0.12 ? 'harmony' : null;
    this.isHarmonicRelease = !!timing;

    if (locks.length === 0 && this.aimTarget && this.aimTarget.ref?.alive !== false) {
      // Simple tap shot.
      const info = this.aimTarget;
      this.fireQueue = [{ info, index: 0 }];
      this.stats.shots += 1;
      this.runStats.shots += 1;
      if (timing) this._registerHarmony(this.aimTarget.screen, timing);
    } else if (locks.length > 0) {
      this.fireQueue = locks.map((lock, i) => ({ info: lock.info, index: i }));
      this.stats.shots += locks.length;
      this.runStats.shots += locks.length;
      if (timing) {
        this._registerHarmony(
          {
            x: window.innerWidth / 2,
            y: window.innerHeight * 0.38,
          },
          timing
        );
      }
    }
    this.hud.clearLocks({ fire: true });
    this.hud.reticleFire();
    if (this.fireQueue.length) {
      this.audio.playVolley(this.fireQueue.length, this.isHarmonicRelease, this.harmonyChain);
      this.audio.fireWhoosh();
      this.player.firePulse();
      this.world.punchFov(0.7 + this.fireQueue.length * 0.12);
      this.fireTimer = 0;
    }
  }

  _updateFireQueue(dt) {
    if (!this.fireQueue.length) return;
    this.fireTimer -= dt;
    while (this.fireQueue.length && this.fireTimer <= 0) {
      const item = this.fireQueue.shift();
      const info = item.info;
      const ref = info.ref;
      if (!ref || ref.alive === false) {
        this.fireTimer = 0.04;
        continue;
      }
      const from = this.player.getSwordTip();
      const target = { pos: info.pos, ref, key: info.key };
      this.fx.fireBeam({
        from,
        target,
        color: this.isHarmonicRelease ? 0xa8fff0 : 0xffe5a4,
        duration: 0.3 + item.index * 0.015,
        onArrive: (t) => this._onBeamArrive(t, this.isHarmonicRelease),
      });
      // Musical response is scheduled once on the audio clock at release.
      this.fireTimer = 0.055;
    }
  }

  _onBeamArrive(targetInfo, harmonic) {
    const ref = targetInfo?.ref;
    if (!ref) return;
    const key = targetInfo.key;
    this.stats.hits += 1;
    this.runStats.hits += 1;
    let died = false;
    if (ref instanceof Enemy) {
      const damage = this.powers.power && ref.armor > 0 ? 2 : 1;
      died = ref.takeDamage(damage, this);
      if (!died) this._awardHitScore(18, harmonic);
    } else if (ref instanceof Projectile) {
      ref.takeDamage(1, this);
    } else if (this.boss && (ref.isCore !== undefined || this.boss.weakspots.includes(ref))) {
      const res = this.boss.takeDamageAt(key, 2 + (this.powers.power ? 1 : 0), this);
      if (res.hit) this._awardHitScore(res.killed ? 550 : 120, harmonic);
    }
  }

  _awardHitScore(amount, harmonic) {
    const comboMult = 1 + Math.min(5, this.combo) * 0.12;
    const harmonyMult = 1 + Math.min(10, this.harmonyChain) * 0.04;
    this.score += Math.round(amount * comboMult * harmonyMult * (harmonic ? 2 : 1));
    this.combo = Math.min(20, this.combo + 1);
    this.comboTimer = 3.2;
    this.hud.setScore(this.score);
  }

  _registerHarmony(screen, timing = 'harmony') {
    const perfect = timing === 'perfect';
    this.harmonyChain += 1;
    this.harmonyTimer = 8;
    this.stats.harmony += 1;
    this.runStats.harmony += 1;
    this._addAwakenCharge(perfect ? 3 : 2);
    const bonus = (perfect ? 320 : 150) + Math.min(10, this.harmonyChain) * 20;
    this.score += bonus;
    this.hud.setScore(this.score);
    this.hud.popup(
      perfect ? 'PERFECT HARMONY' : 'HARMONY',
      (screen?.x ?? window.innerWidth / 2) + 12,
      (screen?.y ?? window.innerHeight * 0.4) - 44,
      'harmony'
    );
    this.hud.popup(
      `+${bonus}${this.harmonyChain > 1 ? ` · CHAIN ×${this.harmonyChain}` : ''}`,
      (screen?.x ?? window.innerWidth / 2) + 12,
      (screen?.y ?? window.innerHeight * 0.4) - 22,
      perfect ? 'harmony' : ''
    );
    this._syncChainHud();
    if (perfect) {
      this.audio.awakenChord();
      this.world.punchFov(0.9);
    } else {
      this.audio.uiConfirm();
    }
  }

  onEnemyKilled(enemy) {
    if (!enemy) return;
    this._clearEnemyProjectiles(enemy);
    this.stats.killed += 1;
    this.runStats.killed += 1;
    this.combo = Math.min(20, this.combo + 1);
    this.comboTimer = 3.2;
    const base = enemy.cfg.score;
    this.score += Math.round(base * (1 + Math.min(8, this.combo) * 0.1));
    this.rupees += enemy.cfg.rupees;
    this.hud.setRupees(this.rupees);
    this.hud.setScore(this.score);
    const pos = enemy.worldPos.clone();
    this.fx.explode(pos, this.isHarmonicRelease ? 0x9dffdc : 0xff77b8, {
      count: 22 + enemy.maxHp * 6,
      scale: 0.8 + enemy.maxHp * 0.14,
    });
    this.audio.explode(0.8 + enemy.maxHp * 0.1);
    const screenPos = enemy.worldPos.clone().project(this.camera);
    if (screenPos.z < 1) {
      this.hud.popup(
        `+${Math.round(base * (1 + Math.min(8, this.combo) * 0.1))}`,
        (screenPos.x * 0.5 + 0.5) * window.innerWidth,
        (-screenPos.y * 0.5 + 0.5) * window.innerHeight,
        this.isHarmonicRelease ? 'harmony' : ''
      );
    }
    this._addAwakenCharge(1 + (this.isHarmonicRelease ? 1 : 0));
    this.world.shake(0.16 + enemy.maxHp * 0.02, 0.18);
    if (this.stats.killed % 9 === 0 || (this.health < this.maxHealth && this.random() < 0.12)) {
      this._spawnHeart(pos);
    }
    this._checkRupeeBlessing();
  }

  onEnemyLost(enemy) {
    // The foe peels away untouched.
    this._clearEnemyProjectiles(enemy);
    if (enemy?.cfg?.stealsRupees && this.rupees > 0) {
      const stolen = Math.min(this.rupees, enemy.cfg.stealsRupees);
      this.rupees -= stolen;
      this.hud.setRupees(this.rupees);
      this.hud.popup(
        `-${stolen} RUPees`,
        window.innerWidth * 0.5,
        window.innerHeight * 0.64,
        'warn'
      );
      this.audio.uiHover();
    }
  }

  _clearEnemyProjectiles(enemy) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.source !== enemy) continue;
      this.fx.impact(p.pos, 0xff9dc8, { scale: 0.5 });
      p.remove();
      this.projectiles.splice(i, 1);
    }
  }

  onProjectileShot(projectile) {
    this.score += 40;
    this.rupees += 1;
    this.hud.setScore(this.score);
    this.hud.setRupees(this.rupees);
    this.fx.explode(projectile.pos, 0x8df7ff, { count: 12, scale: 0.5 });
    this.audio.explode(0.5);
    this._addAwakenCharge(0.5);
  }

  onProjectileHitsPlayer(projectile) {
    this.damagePlayer(projectile.damage ?? 1, projectile.pos);
    this.fx.explode(projectile.pos, 0xff4f9d, { count: 22, scale: 0.9 });
    this.audio.explode(0.8);
  }

  damagePlayer(amount, source) {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    if (this.invulnerable > 0) return;

    // Farore’s Courage: the ward eats the wound instead of the hero.
    if (this.shieldCharges > 0) {
      this.shieldCharges -= 1;
      this.invulnerable = 1.1;
      this.hud.setPowers(this.powers, this.shieldCharges);
      this.hud.popup('WARD HOLDS', window.innerWidth * 0.5, window.innerHeight * 0.42, 'harmony');
      this.fx.spawnWave(this.player.getPosition(), 0x8effc0, { size: 4.2, life: 0.5 });
      this.audio.wardClang();
      this.player.damage();
      this.world.shake(0.25, 0.25);
      return;
    }

    this.invulnerable = 1.6;
    this.health = Math.max(0, this.health - amount);
    this.hud.setHearts(this.health, this.maxHealth);
    this.hud.damage();
    this.hud.flash('fire');
    this.player.damage();
    this.world.shake(0.55, 0.5);
    this.audio.damage();
    this.combo = 0;
    this.comboTimer = 0;
    this.harmonyChain = 0;
    this.harmonyTimer = 0;
    this._syncChainHud();
    this.fx.spawnWave(this.player.getPosition(), 0xff425d, { size: 3.4, life: 0.4 });
    this._damageAwaken();
    if (this.health <= 0) {
      this.deathTimer = 0.1;
      this.gameOver();
    }
  }

  _addAwakenCharge(amount) {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS') return;
    this.awakenCharge += amount;
    while (this.awakenCharge >= 4 && this.awaken < 10) {
      this.awakenCharge -= 4;
      this._setAwaken(this.awaken + 1);
    }
    this.stats.maxAwaken = Math.max(this.stats.maxAwaken, this.awaken);
    this.runStats.maxAwaken = Math.max(this.runStats.maxAwaken, this.awaken);
  }

  _damageAwaken() {
    const drain = 3;
    if (this.awakenCharge >= drain) {
      this.awakenCharge -= drain;
    } else if (this.awaken > 1) {
      this.awakenCharge = Math.max(0, 4 - (drain - this.awakenCharge));
      this._setAwaken(this.awaken - 1, { faded: true });
    } else {
      this.awakenCharge = 0;
    }
  }

  _setAwaken(level, { silent = false, faded = false } = {}) {
    this.awaken = clamp(Math.round(level), 1, 10);
    this.stats.maxAwaken = Math.max(this.stats.maxAwaken || 1, this.awaken);
    this.runStats.maxAwaken = Math.max(this.runStats.maxAwaken || 1, this.awaken);
    this.player?.setAwaken(this.awaken);
    this.audio.setAwaken(this.awaken);
    this.hud.setAwaken(this.awaken);
    if (!silent) {
      const maxLocks = this._maxLocks();
      this.hud.popup(
        faded ? 'AWAKEN FADES' : `AWAKEN ${roman(this.awaken)}`,
        window.innerWidth / 2,
        window.innerHeight * 0.32,
        faded ? 'warn' : 'harmony'
      );
      this.hud.subtitle(
        faded
          ? '<span class="malice">The light dims.</span> Hold the line. Let the harmony return.'
          : `<span class="green">Awaken ${roman(this.awaken)}.</span> The rail sings louder. Locks available: ${maxLocks}.`,
        3200
      );
      if (!faded) this.audio.awakenChord();
      this.world.punchFov(1.5);
    }
    if (this.locks.length > this._maxLocks()) this.locks = this.locks.slice(0, this._maxLocks());
  }

  _maxLocks() {
    return clamp(4 + Math.floor((this.awaken - 1) / 2) + (this.extraLocks || 0), 4, 8);
  }

  _checkRupeeBlessing() {
    if (this.rupees > 0 && Math.floor(this.rupees / 100) > Math.floor((this.rupees - 1) / 100)) {
      const heal = Math.min(2, this.maxHealth - this.health);
      if (heal > 0) {
        this.health += heal;
        this.hud.setHearts(this.health, this.maxHealth);
        this.fx.heal(this.player.getPosition());
        this.audio.pickup();
        this.hud.popup('+½ HEART', window.innerWidth / 2, window.innerHeight * 0.7, 'heart');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* pickups                                                            */
  /* ------------------------------------------------------------------ */

  _spawnHeart(pos) {
    const group = new THREE.Group();
    const glow = glowSprite(0xff8ba5, 3.2, 0.9);
    glow.material = glow.material.clone();
    group.add(glow);
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 25 }, (_, i) => {
          const a = (i / 24) * TAU;
          return new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0);
        })
      ),
      lineMaterial(0xffd9e2, { opacity: 0.8 })
    );
    group.add(ring);
    group.position.copy(pos);
    this.world.beamLayer.add(group);
    this.pickups.push({ group, glow, ring, age: 0 });
  }

  _updatePickups(dt) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.age += dt;
      const target = this.player.getHitPoint();
      const dir = target.clone().sub(pickup.group.position);
      const dist = dir.length();
      pickup.group.quaternion.copy(this.world.camera.quaternion);
      pickup.ring.rotation.z += dt * 2;
      pickup.glow.scale.setScalar(3.2 + Math.sin(this.clock * 6) * 0.4);
      if (pickup.age > 0.35 && dist > 0.1) {
        pickup.group.position.addScaledVector(dir.normalize(), Math.min(dist, 35 * dt + pickup.age * 6 * dt));
      }
      if (dist < 2.2 || pickup.age > 5) {
        if (dist < 2.2) {
          this.health = Math.min(this.maxHealth, this.health + 4);
          this.hud.setHearts(this.health, this.maxHealth);
          this.fx.heal(this.player.getPosition());
          this.audio.pickup();
          this.hud.popup('+♥', window.innerWidth * 0.5, window.innerHeight * 0.62, 'heart');
        }
        pickup.group.parent?.remove(pickup.group);
        pickup.group.traverse((c) => {
          if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
          if (c.material && !c.material.userData?.shared) c.material.dispose();
        });
        this.pickups.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* spawning & targeting                                               */
  /* ------------------------------------------------------------------ */

  _spawnWave() {
    const difficulty = STAGE_DIFFICULTY[this.stageIndex];
    const alive = this.enemies.filter((e) => e.alive).length;
    if (alive >= difficulty.maxActive) return;
    const rng = () => this._waveRng.next();
    const count = clamp(2 + Math.floor(rng() * 2) + (this.stageIndex >= 2 ? 1 : 0), 2, 5);
    const kinds = ['line', 'vee', 'sides', 'arc', 'stream'];
    const kind = this.waveCount % 3 === 2 ? 'arc' : kinds[Math.floor(rng() * kinds.length)];
    const slots = makeFormation(kind, count, rng, this.stageIndex);
    const weights = this.stage.enemies;
    const narrow = window.innerWidth / Math.max(1, window.innerHeight) < 1;
    const lateralLimit = narrow ? 9 : 14;
    for (const slot of slots) {
      if (this.enemies.filter((e) => e.alive).length >= difficulty.maxActive) break;
      const type = pickEnemyType(weights, rng);
      this.save.markEnemy(type);
      const enemy = new Enemy(this, type, {
        rel: clamp(slot.rel * 0.8, 102, 155),
        lateral: clamp(slot.lateral, -lateralLimit, lateralLimit),
        height: clamp(slot.height, -2.5, narrow ? 6 : 8),
        scale: 0.95 + rng() * 0.25,
      });
      this.enemies.push(enemy);
      this.stats.spawned += 1;
      this.runStats.spawned += 1;
    }
    this.waveCount++;
  }

  spawnBossMinions(boss, count) {
    if (!boss || !boss.alive) return;
    for (let i = 0; i < count; i++) {
      const type = pickEnemyType(this.stage.enemies, () => this.random());
      this.save.markEnemy(type);
      const narrow = window.innerWidth / Math.max(1, window.innerHeight) < 1;
      const enemy = new Enemy(this, type, {
        rel: 105 + this.random() * 45,
        lateral: (this.random() - 0.5) * (narrow ? 12 : 16),
        height: -1 + this.random() * (narrow ? 5 : 7),
        scale: 0.95 + this.random() * 0.2,
      });
      this.enemies.push(enemy);
      this.stats.spawned += 1;
      this.runStats.spawned += 1;
    }
    this.hud.subtitle('The guardian calls its children. <span class="malice">Thin them out.</span>', 3200);
  }

  spawnEnemyProjectile(enemy, opts) {
    const f = this.rail.frameAt(this.playerDistance);
    const lateral = (this.random() - 0.5) * (opts.spread || 1) * 1.8;
    const vertical = (this.random() - 0.5) * 1.4;
    const targetOffset = f.right
      .clone()
      .multiplyScalar(lateral)
      .addScaledVector(f.up, vertical);
    const p = new Projectile(this, {
      origin: opts.origin,
      target: this.getPlayerHitPoint(),
      targetOffset,
      speed: opts.speed || 30,
      delay: opts.delay || 0,
      color: opts.color || 0xff4f9d,
      boss: false,
      size: opts.size || 1,
      damage: 1,
      source: enemy,
      ttl: 7,
    });
    this.projectiles.push(p);
  }

  spawnBossProjectile(boss, opts) {
    if (!boss) return;
    const f = this.rail.frameAt(this.playerDistance);
    const offset = opts.offset || new THREE.Vector3();
    const targetOffset = f.right
      .clone()
      .multiplyScalar(offset.x)
      .addScaledVector(f.up, offset.y);
    const origin = (opts.origin || boss.core.pos).clone();
    origin.addScaledVector(f.right, (this.random() - 0.5) * 2);
    origin.addScaledVector(f.up, (this.random() - 0.5) * 2);
    const p = new Projectile(this, {
      origin,
      target: this.getPlayerHitPoint(),
      targetOffset,
      speed: opts.speed || 40,
      delay: opts.delay || 0,
      color: this.stage.palette.malice,
      boss: true,
      size: (opts.size || 1.2) * 1.15,
      damage: opts.damage ?? 2,
      ttl: 9,
    });
    this.projectiles.push(p);
  }

  getPlayerHitPoint() {
    return this.player ? this.player.getHitPoint(new THREE.Vector3()) : new THREE.Vector3();
  }

  _projectTargets() {
    const camera = this.world.camera;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const projected = [];
    const infos = [];
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.targetable !== false) infos.push(enemy.getTargetInfo());
    }
    for (const projectile of this.projectiles) {
      if (projectile.active) infos.push(projectile.getTargetInfo());
    }
    if (this.boss && this.boss.alive) infos.push(...this.boss.getTargetInfos());

    for (const info of infos) {
      const v = info.pos.clone().project(camera);
      if (v.z < -1.05 || v.z > 1.05) continue;
      if (v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) continue;
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const distance = camera.position.distanceTo(info.pos);
      const r = (info.radius / (distance * tan)) * (height * 0.5);
      const assist =
        this.settings.lockAssist === 'off' ? 0.78 : this.settings.lockAssist === 'high' ? 1.38 : 1;
      const hit = Math.max(18, r * 1.22) * assist;
      projected.push({
        info,
        x,
        y,
        r,
        hit,
        screenDist: Math.hypot(x - this.input.aim.x, y - this.input.aim.y),
      });
    }
    this.projectedTargets = projected;

    // Closest target to the reticle within its grace radius.
    let best = null;
    for (const p of projected) {
      if (p.screenDist > p.hit) continue;
      const norm = p.screenDist / p.hit;
      if (!best || norm < best.norm) {
        best = p;
        best.norm = norm;
      }
    }
    this.aimTarget = best ? { key: best.info.key, ref: best.info.ref, pos: best.info.pos, screen: { x: best.x, y: best.y }, boss: best.info.boss } : null;
    this._hoverProjected = best;
    return projected;
  }

  _updateTargeting(dt) {
    const projected = this._projectTargets();
    const maxLocks = this._maxLocks();

    // Acquire a target while the trigger is held.
    if (this.input.holding && this._hoverProjected) {
      const hover = this._hoverProjected;
      const key = hover.info.key;
      const already = this.locks.some((l) => l.info.key === key);
      if (!already && this.locks.length < maxLocks) {
        const ref = hover.info.ref;
        if (ref && ref.alive !== false) {
          this.locks.push({
            info: hover.info,
            ref,
            key,
            index: this.locks.length,
            pos: hover.info.pos,
          });
          this.audio.lockBlip(this.locks.length);
          this.world.punchFov(0.2);
        }
      }
    }

    // Drop dead targets.
    this.locks = this.locks.filter((l) => {
      const ref = l.info.ref;
      return ref && ref.alive !== false && ref.targetable !== false && l.info.pos;
    });
    this.player.setCharging(this.locks.length > 0);
    if (this.state === 'PLAYING' || this.state === 'BOSS') {
      this.hud.setReticle(
        this.input.aim.x,
        this.input.aim.y,
        {
          hot: !!this._hoverProjected,
          charging: this.locks.length > 0,
        },
        this.locks.length,
        maxLocks
      );
    }

    // Lock markers, projected every frame.
    const map = new Map(this.projectedTargets.map((p) => [p.info.key, p]));
    const markers = [];
    for (const lock of this.locks) {
      const p = map.get(lock.info.key);
      if (!p) continue;
      markers.push({
        key: lock.info.key,
        x: p.x,
        y: p.y,
        index: lock.index + 1,
        boss: lock.info.boss,
      });
    }
    if (markers.length) this.hud.setLocks(markers);
    else this.hud.clearLocks();
  }

  _updateQuotes() {
    const quotes = this.stage.story.quotes;
    const progress = this.playerDistance / Math.max(1, this.bossTrigger);
    for (let i = 0; i < quotes.length; i++) {
      if (!this.quoteFlags[i] && progress >= quotes[i].at) {
        this.quoteFlags[i] = true;
        this.hud.subtitle(quotes[i].text, 5200);
      }
    }
  }

}
