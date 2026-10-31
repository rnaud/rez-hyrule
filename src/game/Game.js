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
} from './screens.js';
import {
  clamp,
  damp,
  formatTime,
  roman,
  seeded,
  glowSprite,
  lineMaterial,
  TAU,
} from './util.js';

const BEST_KEY = 'rez-hyrule-best-v1';
const MAX_HEALTH = 24;

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
    this.audio = new AudioEngine();
    this.input = new Input();
    this.hud = new Hud({
      onAction: (action) => this.handleAction(action),
      onHover: () => this.audio.uiHover(),
    });
    this.fx = new Effects(this.world.scene, this.world.camera);
    this.fx.setBeamGame(this);
    this.fx.setPixelRatio(this.world.renderer.getPixelRatio());
    this.world.onResize = (pr) => this.fx.setPixelRatio(pr);

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
    this.highScore = this._loadBest();
    this._waveRng = seeded(4242);
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

    this.clock = 0;
  }

  _emptyStats() {
    return { killed: 0, spawned: 0, harmony: 0, shots: 0, hits: 0, maxAwaken: 1, bossKills: 0 };
  }

  _loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {
      return 0;
    }
  }

  _saveBest(score) {
    const prev = this.highScore;
    if (score > prev) {
      this.highScore = score;
      try {
        localStorage.setItem(BEST_KEY, String(Math.floor(score)));
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
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
    this._buildPreview(0);
    this.state = 'TITLE';
    this.input.setEnabled(false);
    this.hud.hideReticle();
    this.hud.showHud(false);
    this.hud.hideBoss();
    this.hud.subtitle('');
    this.hud.hint('');
    this.hud.showScreen(screenTitle({ highScore: this.highScore }));
    document.body.classList.remove('is-playing');
    this.audio.stopMusic(0.4);
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

  startNewGame() {
    this.audio.unlock();
    this.audio.uiConfirm();
    this.score = 0;
    this.rupees = 0;
    this.maxHealth = 16;
    this.health = 16;
    this.runStats = this._emptyStats();
    this.runPlayTime = 0;
    this.stageIndex = 0;
    this._teardownWorld();
    this._loadStage(0, { story: true });
  }

  _loadStage(index, { story = true, keepScore = true } = {}) {
    this.stageIndex = index;
    const stage = STAGES[index];
    this.stage = stage;
    this.difficulty = STAGE_DIFFICULTY[index];
    this._teardownWorld();
    this.audio.unlock();
    this.audio.stopMusic(0.2);

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
    this.waveTimer = 1.15;
    this.quoteFlags = stage.story.quotes.map(() => false);
    this.playerDistance = 10;
    this.playerSpeed = 5;
    this.speedTarget = 5;
    this.bossTrigger = this.rail.length - 330;
    this.stageElapsed = 0;
    this.stats = this._emptyStats();
    this.awaken = clamp(1 + index, 1, 10);
    this.awakenCharge = 0;
    this.stats.maxAwaken = this.awaken;
    this.health = Math.max(this.health, this.maxHealth);
    this.invulnerable = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.clearTimer = 0;
    this.stageEntryScore = keepScore ? this.score : 0;
    this.stageEntryRunStats = { ...this.runStats };
    this.stageEntryRupees = this.rupees;
    this.player.setAwaken(this.awaken);
    this.hud.setHearts(this.health, this.maxHealth, { animate: false });
    this.hud.setAwaken(this.awaken);
    this.hud.setScore(this.score, false);
    this.hud.setRupees(this.rupees);
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

  beginPlay() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.hud.hideScreen();
    this.state = 'PLAYING';
    this.input.setEnabled(true);
    this.input.setAimCenter();
    this.hud.showHud(true);
    this.hud.hideReticle();
    document.body.classList.add('is-playing');
    this.speedTarget = 30;
    this.stageElapsed = 0;
    this.waveTimer = 3.2;
    this.playerDistance = Math.max(10, Math.min(this.playerDistance, 26));
    this.playerSpeed = 8;
    this.quoteFlags = this.stage.story.quotes.map(() => false);
    this.audio.startStage({ ...this.stage.music });
    this.audio.setAwaken(this.awaken);
    this._setAwaken(this.awaken, { silent: true });
    this.hud.showBanner({
      kicker: this.stage.chapter,
      title: this.stage.name,
      sub: this.stage.epithet,
      duration: 2200,
    });
    this.hud.hint(
      this.isTouch
        ? '<span><span class="key">HOLD</span> LOCK THE MALICE</span><span><span class="key">DRAG</span> ACROSS FOES</span><span><span class="key">RELEASE</span> STRIKE</span>'
        : '<span><span class="key">HOLD LMB</span> LOCK THE MALICE</span><span><span class="key">RELEASE</span> STRIKE IN HARMONY</span><span><span class="key">SPACE</span> ALSO LOCKS</span>',
      9000
    );
    if (this.stageIndex === 0) {
      window.setTimeout(() => {
        if (this.state === 'PLAYING') {
          this.hud.subtitle(
            'Malice holds at the edge of the rail. <span class="gold">Take your time — lock it before it slips away.</span>',
            5600
          );
        }
      }, 1800);
    }
    this.audio.uiConfirm();
  }

  restartStage() {
    if (this.state === 'PAUSED') this.audio.resume();
    this.hud.hideScreen();
    this.audio.stopMusic(0.3);
    this.score = this.stageEntryScore ?? this.score;
    this.health = this.maxHealth;
    this.rupees = this.stageEntryRupees ?? this.rupees;
    if (this.stageEntryRunStats) this.runStats = { ...this.stageEntryRunStats };
    this._loadStage(this.stageIndex, { story: true });
    this.hud.setScore(this.score, false);
    this.hud.setRupees(this.rupees);
    this.hud.setHearts(this.health, this.maxHealth, { animate: false });
    document.body.classList.remove('is-playing');
  }

  nextStage() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.showVictory();
      return;
    }
    const next = this.stageIndex + 1;
    this._loadStage(next, { story: true });
  }

  _startBoss() {
    if (this.boss) return;
    this.state = 'BOSS';
    this.speedTarget = 0;
    this.waveTimer = 9999;
    this.hud.hint(
      '<span><span class="key">LOCK</span> THE MALICE EYES</span><span>BREAK THEM ALL TO EXPOSE THE CORE</span>',
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
    this.hud.showBanner({
      kicker: 'GUARDIAN OF THE RAIL',
      title: this.stage.boss.shortName,
      sub: this.stage.boss.roarLine,
      kind: 'boss',
      duration: 2500,
    });
    this.hud.subtitle(this.stage.introBoss, 6000);
    this.audio.setBoss(true);
    this.audio.bossRoar();
    this.world.shake(0.9, 1.1);
    this.hud.flash('fire');
    this.player.setCharging(false);
    this.locks = [];
    this.hud.clearLocks();
  }

  onBossPhase(boss, phase) {
    if (!boss || boss !== this.boss) return;
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
    if (this.state === 'CLEAR' || this.state === 'RESULTS' || this.state === 'VICTORY') return;
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
    this.hud.setScore(this.score);
    this.hud.setBossHealth(0);
    this.audio.stopMusic(2.4);
    this.audio.fanfare();
    this.audio.stopDrone(1.6);
    this.world.shake(1.0, 1.6);
    this.world.punchFov(4);
    this.hud.flash('fire');
    this.maxHealth = Math.min(MAX_HEALTH, this.maxHealth + 4);
    this.health = this.maxHealth;
    this.hud.setHearts(this.health, this.maxHealth, { animate: true });
    this.stats.maxAwaken = Math.max(this.stats.maxAwaken, this.awaken);
    this.runStats.maxAwaken = Math.max(this.runStats.maxAwaken, this.awaken);
    for (const p of this.projectiles) p.remove();
    this.projectiles = [];
    for (const enemy of this.enemies) enemy.remove();
    this.enemies = [];
    for (const pickup of this.pickups) pickup.group.parent?.remove(pickup.group);
    this.pickups = [];
    this.enemyLayer.visible = false;
    this.projectileLayer.visible = false;
    document.body.classList.remove('is-playing');
  }

  _hideBossScene() {
    if (this.boss) this.boss.group.visible = false;
    this.world.bossFxLayer.visible = false;
  }

  _finishStage() {
    if (this.stageIndex >= STAGES.length - 1) {
      this.showVictory();
      return;
    }
    this.state = 'RESULTS';
    this._hideBossScene();
    this.hud.hideBoss();
    this.hud.showHud(false);
    this.hud.hideReticle();
    const accuracy = this.stats.spawned > 0 ? this.stats.killed / this.stats.spawned : 1;
    const hitRatio = this.stats.shots > 0 ? this.stats.hits / this.stats.shots : 0;
    const harmonyRatio = this.stats.shots > 0 ? this.stats.harmony / this.stats.shots : 0;
    const rating = accuracy * 2.2 + hitRatio * 1.2 + harmonyRatio * 0.8 + this.stats.maxAwaken * 0.05;
    const rank = rating >= 2.75 ? 'S' : rating >= 2.2 ? 'A' : rating >= 1.65 ? 'B' : 'C';
    const isBest = this._saveBest(this.score);
    const best = this.highScore;
    this.hud.showScreen(
      screenResults({
        stage: this.stage,
        stats: {
          ...this.stats,
          time: formatTime(this.stageElapsed),
          score: this.score,
          rupees: this.rupees,
        },
        rank,
        piece: this.stage.triforcePiece,
        best,
        isBest,
      }),
      { dim: true }
    );
    this.audio.uiConfirm();
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
    const isBest = this._saveBest(this.score);
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
    this.locks = [];
    this.fireQueue = [];
    this._saveBest(this.score);
    this.hud.showScreen(
      screenGameOver({
        stage: this.stage,
        score: this.score,
        best: this.highScore,
        killed: this.stats.killed,
        spawned: this.stats.spawned,
      }),
      { dim: true }
    );
    document.body.classList.remove('is-playing');
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
    this.hud.showScreen(
      screenPause({
        stage: this.stage,
        score: this.score,
        rupees: this.rupees,
        hearts: this.health,
        awakened: this.awaken,
        muted: this.audio.muted,
      }),
      { dim: true }
    );
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

  handleAction(action) {
    switch (action) {
      case 'start':
        this.audio.unlock();
        this.startNewGame();
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
        this.audio.unlock();
        this.audio.uiConfirm();
        this.restartStage();
        break;
      case 'title':
        this.audio.unlock();
        this.audio.uiConfirm();
        this.showTitle();
        break;
      case 'resume':
        this.resumeGame();
        break;
      case 'mute':
        this.audio.unlock();
        this.audio.toggleMuted();
        this.hud.showScreen(
          screenPause({
            stage: this.stage,
            score: this.score,
            rupees: this.rupees,
            hearts: this.health,
            awakened: this.awaken,
            muted: this.audio.muted,
          }),
          { dim: true }
        );
        break;
      case 'restart-full':
        this.startNewGame();
        break;
      default:
        break;
    }
  }

  onKey(code, event) {
    if (event.repeat) return;
    if (code === 'KeyM') {
      this.audio.unlock();
      const muted = this.audio.toggleMuted();
      if (this.state === 'PAUSED') {
        this.hud.showScreen(
          screenPause({
            stage: this.stage,
            score: this.score,
            rupees: this.rupees,
            hearts: this.health,
            awakened: this.awaken,
            muted,
          }),
          { dim: true }
        );
      }
      return;
    }
    if (code === 'KeyF') {
      this.toggleFullscreen();
      return;
    }
    if (code === 'Escape' || code === 'KeyP') {
      if (this.state === 'PLAYING' || this.state === 'BOSS') this.pauseGame();
      else if (this.state === 'PAUSED') this.resumeGame();
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.audio.unlock();
      switch (this.state) {
        case 'TITLE':
          this.startNewGame();
          break;
        case 'STORY':
          this.audio.uiConfirm();
          this.beginPlay();
          break;
        case 'RESULTS':
          this.nextStage();
          break;
        case 'GAMEOVER':
          this.restartStage();
          break;
        case 'VICTORY':
          this.showTitle();
          break;
        case 'PAUSED':
          this.resumeGame();
          break;
        default:
          break;
      }
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  shake(amount = 0.3, duration = 0.35) {
    this.world.shake(amount, duration);
  }

  /* ------------------------------------------------------------------ */
  /* main loop                                                          */
  /* ------------------------------------------------------------------ */

  update(dt) {
    if (this.state === 'PAUSED') return;
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
    if (state === 'RESULTS' || state === 'GAMEOVER' || state === 'VICTORY') {
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
    this.environment?.update(dt, this.playerDistance, this.clock);
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
    this.environment?.update(dt, this.playerDistance, this.clock);
    this.fx.update(dt);
  }

  _updatePlaying(dt) {
    this.stageElapsed += dt;
    const isBoss = this.state === 'BOSS';
    const difficulty = STAGE_DIFFICULTY[this.stageIndex];

    // Speed ramps smoothly toward the target.
    this.playerSpeed = damp(this.playerSpeed, this.speedTarget, isBoss ? 1.2 : 0.9, dt);
    if (this.playerDistance < this.bossTrigger || !isBoss) {
      this.playerDistance = Math.min(this.rail.length - 24, this.playerDistance + this.playerSpeed * dt);
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
    this.environment?.update(dt, this.playerDistance, this.clock);

    // Boss & minion logic.
    if (this.boss) {
      this.boss.update(dt, this);
      if (!isBoss) {
        // Keep dying boss animation but no targeting.
      }
    }

    // Wave spawning.
    if (!isBoss) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this._spawnWave();
        this.waveTimer = difficulty.spawnRate * (0.82 + Math.random() * 0.4);
      }
      if (!this.boss && this.playerDistance >= this.bossTrigger) {
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
      e.update(dt, this);
    }

    // Projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.update(dt, this);
    }

    // Heart pickups.
    this._updatePickups(dt);

    // Firing queue.
    this._updateFireQueue(dt);

    // Targeting & HUD.
    this._updateTargeting(dt);

    this.fx.update(dt);

    // Heart/low health pulse.
    if (this.health <= 4 && this.health > 0) {
      this.hud.root.style.filter = `drop-shadow(0 0 ${(4 - this.health) * 2}px rgba(255,60,90,.3))`;
    } else if (this.hud.root.style.filter) {
      this.hud.root.style.filter = '';
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
    this.environment?.update(dt, this.playerDistance, this.clock);
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
    const onBeat = this.audio.isOnBeat(0.11);
    this.isHarmonicRelease = onBeat;

    if (locks.length === 0 && this.aimTarget && this.aimTarget.ref?.alive !== false) {
      // Simple tap shot.
      const info = this.aimTarget;
      this.fireQueue = [{ info, index: 0 }];
      this.stats.shots += 1;
      this.runStats.shots += 1;
      if (onBeat) this._registerHarmony(this.aimTarget.screen);
    } else if (locks.length > 0) {
      this.fireQueue = locks.map((lock, i) => ({ info: lock.info, index: i }));
      this.stats.shots += locks.length;
      this.runStats.shots += locks.length;
      if (onBeat) {
        this._registerHarmony({
          x: window.innerWidth / 2,
          y: window.innerHeight * 0.38,
        });
      }
    }
    this.hud.clearLocks({ fire: true });
    this.hud.reticleFire();
    if (this.fireQueue.length) {
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
      this.audio.playerNote(this.isHarmonicRelease);
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
      died = ref.takeDamage(1, this);
      if (!died) this._awardHitScore(18, harmonic);
    } else if (ref instanceof Projectile) {
      ref.takeDamage(1, this);
    } else if (this.boss && (ref.isCore !== undefined || this.boss.weakspots.includes(ref))) {
      const res = this.boss.takeDamageAt(key, 2, this);
      if (res.hit) this._awardHitScore(res.killed ? 550 : 120, harmonic);
    }
  }

  _awardHitScore(amount, harmonic) {
    const comboMult = 1 + Math.min(5, this.combo) * 0.12;
    this.score += Math.round(amount * comboMult * (harmonic ? 2 : 1));
    this.combo = Math.min(20, this.combo + 1);
    this.comboTimer = 3.2;
    this.hud.setScore(this.score);
  }

  _registerHarmony(screen) {
    this.stats.harmony += 1;
    this.runStats.harmony += 1;
    this._addAwakenCharge(2);
    this.score += 140;
    this.hud.setScore(this.score);
    this.hud.popup(
      'HARMONY',
      (screen?.x ?? window.innerWidth / 2) + 12,
      (screen?.y ?? window.innerHeight * 0.4) - 44,
      'harmony'
    );
    this.audio.awakenChord();
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
    if (this.stats.killed % 9 === 0 || (this.health < this.maxHealth && Math.random() < 0.12)) {
      this._spawnHeart(pos);
    }
    this._checkRupeeBlessing();
  }

  onEnemyLost(enemy) {
    // The foe peels away untouched; its stray orbs disperse with it.
    this._clearEnemyProjectiles(enemy);
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
    return clamp(4 + Math.floor((this.awaken - 1) / 2), 4, 8);
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
      const type = pickEnemyType(this.stage.enemies, Math.random);
      const narrow = window.innerWidth / Math.max(1, window.innerHeight) < 1;
      const enemy = new Enemy(this, type, {
        rel: 105 + Math.random() * 45,
        lateral: (Math.random() - 0.5) * (narrow ? 12 : 16),
        height: -1 + Math.random() * (narrow ? 5 : 7),
        scale: 0.95 + Math.random() * 0.2,
      });
      this.enemies.push(enemy);
      this.stats.spawned += 1;
      this.runStats.spawned += 1;
    }
    this.hud.subtitle('The guardian calls its children. <span class="malice">Thin them out.</span>', 3200);
  }

  spawnEnemyProjectile(enemy, opts) {
    const f = this.rail.frameAt(this.playerDistance);
    const lateral = (Math.random() - 0.5) * (opts.spread || 1) * 1.8;
    const vertical = (Math.random() - 0.5) * 1.4;
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
    origin.addScaledVector(f.right, (Math.random() - 0.5) * 2);
    origin.addScaledVector(f.up, (Math.random() - 0.5) * 2);
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
      if (enemy.alive) infos.push(enemy.getTargetInfo());
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
      const hit = Math.max(24, r * 1.22);
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
    this.locks = this.locks.filter((l) => l.info.ref && l.info.ref.alive !== false && l.info.pos);
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
