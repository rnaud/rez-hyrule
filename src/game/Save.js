/**
 * A single local save for progress, unlocks, gallery and player options.
 * Everything lives in localStorage so the game remains a static site.
 */

const SAVE_KEY = 'rez-hyrule-save-v2';
const LEGACY_BEST_KEY = 'rez-hyrule-best-v1';

const DEFAULT_SETTINGS = {
  musicVolume: 0.7,
  sfxVolume: 0.85,
  aimSpeed: 1,
  lockAssist: 'normal',
  reticleSize: 'normal',
  reticleColor: 'gold',
  reduceShake: false,
  reduceFlash: false,
  quality: 'high',
  gamepad: true,
  subtitles: true,
  canticleVoice: 'female',
  canticleEnsemble: 'ensemble',
};

const DEFAULT_PROGRESS = {
  unlocked: 1,
  bestScore: 0,
  bestRank: '',
  stageBest: {},
  bosses: {},
  enemies: {},
  tracks: {},
  fragments: { power: false, courage: false, wisdom: false },
  powers: { power: false, courage: false, wisdom: false },
  campaignStage: 0,
  campaignComplete: false,
  bossRushBest: 0,
  bossRushRuns: 0,
  daily: { date: '', score: 0, rank: '', stage: -1 },
  canticleBest: {},
  canticleRuns: 0,
  totalKills: 0,
  totalBosses: 0,
  totalRuns: 0,
  totalTime: 0,
};

const DEFAULT_SAVE = {
  version: 2,
  settings: DEFAULT_SETTINGS,
  progress: DEFAULT_PROGRESS,
};

function deepMerge(base, incoming) {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base.slice();
  if (base && typeof base === 'object') {
    const out = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(incoming || {})]);
    for (const key of keys) {
      out[key] = key in base ? deepMerge(base[key], incoming?.[key]) : incoming[key];
    }
    return out;
  }
  return incoming === undefined ? base : incoming;
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export class Save {
  constructor() {
    this.data = this._load();
    this._scheduleWrite = this._scheduleWrite.bind(this);
    this._pending = null;
  }

  _load() {
    let parsed = null;
    try {
      parsed = JSON.parse(readStorage(SAVE_KEY) || 'null');
    } catch {
      parsed = null;
    }
    const data = deepMerge(DEFAULT_SAVE, parsed || {});
    if (!data.progress.bestScore) {
      const legacy = Number(readStorage(LEGACY_BEST_KEY) || 0) || 0;
      if (legacy > 0) data.progress.bestScore = legacy;
    }
    return data;
  }

  get settings() {
    return this.data.settings;
  }

  get progress() {
    return this.data.progress;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      /* Storage can be unavailable or full; the game should keep running. */
    }
  }

  flush() {
    if (this._pending) {
      clearTimeout(this._pending);
      this._pending = null;
    }
    this.save();
  }

  _scheduleWrite() {
    if (this._pending) return;
    this._pending = window.setTimeout(() => {
      this._pending = null;
      this.save();
    }, 120);
  }

  setSetting(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return;
    this.data.settings[key] = value;
    this.save();
  }

  markEnemy(type) {
    if (!type || this.progress.enemies[type]) return;
    this.progress.enemies[type] = true;
    this._scheduleWrite();
  }

  markBoss(stageId) {
    if (!stageId || this.progress.bosses[stageId]) return;
    this.progress.bosses[stageId] = true;
    this._scheduleWrite();
  }

  markTrack(trackId) {
    if (!trackId || this.progress.tracks[trackId]) return;
    this.progress.tracks[trackId] = true;
    this._scheduleWrite();
  }

  addFragment(piece) {
    const key = String(piece || '').toLowerCase();
    if (!(key in this.progress.fragments)) return false;
    if (this.progress.fragments[key]) return false;
    this.progress.fragments[key] = true;
    this.save();
    return true;
  }

  unlockPower(power) {
    if (!(power in this.progress.powers)) return false;
    if (this.progress.powers[power]) return false;
    this.progress.powers[power] = true;
    this.save();
    return true;
  }

  unlockThrough(index) {
    const next = Math.max(1, Math.min(5, index + 1));
    if (next > this.progress.unlocked) {
      this.progress.unlocked = next;
      this._scheduleWrite();
    }
  }

  setCampaignStage(index) {
    this.progress.campaignStage = Math.max(0, Math.min(4, index));
    this._scheduleWrite();
  }

  completeCampaign() {
    this.progress.campaignComplete = true;
    this.progress.unlocked = 5;
    this.progress.campaignStage = 4;
    this.save();
  }

  recordBest(score, rank = '') {
    const progress = this.progress;
    progress.totalRuns += 1;
    let isBest = false;
    if (score > progress.bestScore) {
      progress.bestScore = Math.floor(score);
      isBest = true;
    }
    if (rank) progress.bestRank = rank;
    this._scheduleWrite();
    return isBest;
  }

  recordStage(stageId, { score = 0, rank = '', accuracy = 0 } = {}) {
    const prev = this.progress.stageBest[stageId];
    let isBest = false;
    if (!prev || score > prev.score) {
      this.progress.stageBest[stageId] = { score: Math.floor(score), rank, accuracy };
      isBest = true;
    }
    this._scheduleWrite();
    return isBest;
  }

  recordDaily(date, stageIndex, score, rank) {
    const daily = this.progress.daily;
    if (daily.date !== date) {
      this.progress.daily = { date, score: Math.floor(score), rank, stage: stageIndex };
      this.save();
      return true;
    }
    if (score > daily.score) {
      daily.score = Math.floor(score);
      daily.rank = rank;
      daily.stage = stageIndex;
      this.save();
      return true;
    }
    return false;
  }

  recordCanticle(stageId, { score = 0, rank = '', accuracy = 0 } = {}) {
    const best = this.progress.canticleBest || (this.progress.canticleBest = {});
    const prev = best[stageId];
    let isBest = false;
    if (!prev || score > prev.score) {
      best[stageId] = { score: Math.floor(score), rank, accuracy };
      isBest = true;
    }
    this.progress.canticleRuns = (this.progress.canticleRuns || 0) + 1;
    this.save();
    return isBest;
  }

  recordBossRush(score) {
    this.progress.bossRushRuns += 1;
    if (score > this.progress.bossRushBest) {
      this.progress.bossRushBest = Math.floor(score);
      this.save();
      return true;
    }
    this._scheduleWrite();
    return false;
  }

  addTotals({ kills = 0, time = 0 } = {}) {
    this.progress.totalKills += kills;
    this.progress.totalTime += time;
    this._scheduleWrite();
  }

  resetProgress() {
    this.data.progress = deepMerge(DEFAULT_PROGRESS, {});
    this.save();
  }
}

export { DEFAULT_SETTINGS };
