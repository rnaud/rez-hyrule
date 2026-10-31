import { pad, roman } from './util.js';
import { STAGES } from './stages.js';
import { ENEMY_TYPES } from './enemies.js';
import {
  ENEMY_LORE,
  BOSS_LORE,
  FRAGMENT_INFO,
  POWER_INFO,
  TRACKS,
  BESTIARY_ORDER,
  POWER_ORDER,
  MODE_INFO,
} from './catalog.js';

/* ------------------------------------------------------------------ */
/* small shared marks                                                 */
/* ------------------------------------------------------------------ */

const titleMark = () => `
  <svg class="title-mark" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="orbit" cx="100" cy="100" r="92" />
    <circle class="orbit orbit-2" cx="100" cy="100" r="79" />
    <path class="tri" d="M100 22 147 104 53 104Z" />
    <path class="tri" d="M54 108 100 190 8 190Z" />
    <path class="tri" d="M146 108 192 190 100 190Z" />
  </svg>`;

const rupeeMini = () => `
  <svg viewBox="0 0 24 32" style="width:13px;height:auto" aria-hidden="true">
    <path d="M12 1 22 8v16L12 31 2 24V8Z" fill="rgba(84,245,181,.12)" stroke="#54f5b5" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M7 9h7a5 5 0 0 1 0 10H7M7 9v14" fill="none" stroke="#54f5b5" stroke-width="1.2"/>
  </svg>`;

const heartMini = () => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="rgba(255,80,110,.2)" stroke="#ff6f8c" stroke-width="1.4"/>
  </svg>`;

const triforceSVG = (cls = '') => `
  <svg class="${cls}" viewBox="0 0 200 180" aria-hidden="true">
    <path d="M100 10 148 94 52 94Z" />
    <path d="M52 94 100 178 4 178Z" />
    <path d="M148 94 196 178 100 178Z" />
  </svg>`;

const goldKicker = (text) => `<div class="results-kicker">${text}</div>`;

const formatCount = (value, width = 0) => pad(value, width);

const controlsMarkup = () => `
  <div class="title-controls">
    <div class="control desktop-only"><span class="keys"><span class="keycap">MOUSE</span></span> Aim the light</div>
    <div class="control desktop-only"><span class="keys"><span class="keycap">HOLD</span><span class="keycap">LMB</span></span> Lock onto foes</div>
    <div class="control desktop-only"><span class="keys"><span class="keycap">RELEASE</span></span> Strike in harmony</div>
    <div class="control desktop-only"><span class="keys"><span class="keycap">ESC</span></span> Pause</div>
    <div class="control touch-only"><span class="keys"><span class="keycap">DRAG</span></span> Aim the light</div>
    <div class="control touch-only"><span class="keys"><span class="keycap">HOLD</span></span> Lock onto foes</div>
    <div class="control touch-only"><span class="keys"><span class="keycap">RELEASE</span></span> Strike in harmony</div>
    <div class="control touch-only"><span class="keys"><span class="keycap">Ⅱ</span></span> Pause</div>
  </div>`;

const footMarkup = (highScore, progress = {}) => {
  const fragmentCount = Object.values(progress.fragments || {}).filter(Boolean).length;
  const bossCount = Object.keys(progress.bosses || {}).length;
  return `
  <div class="title-foot">
    <span class="high-score">${rupeeMini()} BEST SPIRIT SCORE <b>${pad(highScore || 0)}</b></span>
    <span>TRIFORCE ${fragmentCount}/3 · GUARDIANS ${bossCount}/5</span>
    <span class="blink">A TRIBUTE IN THREE.JS · HEADPHONES RECOMMENDED</span>
  </div>`;
};

/* ------------------------------------------------------------------ */
/* title & menus                                                      */
/* ------------------------------------------------------------------ */

export function screenTitle({ highScore = 0, progress = {}, daily = {}, unlockedBosses = 0 } = {}) {
  const campaignComplete = !!progress.campaignComplete;
  const currentStage = progress.campaignStage || 0;
  const campaignLabel = campaignComplete ? 'New Campaign' : currentStage > 0 ? 'Continue Campaign' : 'Awaken';
  const campaignNote = campaignComplete
    ? 'All five rails are open. Walk them again.'
    : currentStage > 0
      ? `Resume at ${STAGES[Math.min(currentStage, STAGES.length - 1)]?.name || 'the rail'}`
      : 'Five rails. Five guardians. One Triforce.';
  const bossRushLocked = unlockedBosses < 1;
  const fragmentCount = Object.values(progress.fragments || {}).filter(Boolean).length;
  const heardTracks = Object.values(progress.tracks || {}).filter(Boolean).length;
  const bestBossRush = progress.bossRushBest || 0;
  const dailyBest = daily?.date ? daily.score : 0;
  const dailyLabel = daily?.date || 'TODAY';

  return `
    <div class="screen-inner">
      <div class="title-topline">A TRANSMISSION FROM THE SACRED REALM</div>
      ${titleMark()}
      <div class="title-logo">
        <div class="logo-rez">REZ</div>
        <div class="logo-divider">the legend of</div>
        <div class="logo-hyrule">HY<span class="accent">RULE</span></div>
      </div>
      <p class="title-tagline">Awaken the Triforce. <em>Become the light on the rails.</em></p>
      <div class="title-actions">
        <button class="btn btn-primary" data-action="start">${campaignLabel}</button>
      </div>
      <div class="title-campaign-note">${campaignNote}</div>
      <div class="title-modes">
        <button class="mode-btn" data-action="stage-select">
          <span class="mode-icon">⌖</span>
          <span class="mode-name">Stage Select</span>
          <span class="mode-sub">Score Attack · ${progress.unlocked || 1} of 5 rails open</span>
        </button>
        <button class="mode-btn" data-action="boss-rush" ${bossRushLocked ? 'disabled' : ''}>
          <span class="mode-icon">♜</span>
          <span class="mode-name">Boss Rush</span>
          <span class="mode-sub">${bossRushLocked ? 'Defeat a guardian first' : `Best ${pad(bestBossRush)}`}</span>
        </button>
        <button class="mode-btn" data-action="daily">
          <span class="mode-icon">☼</span>
          <span class="mode-name">Daily Rail</span>
          <span class="mode-sub">${dailyLabel} · Best ${pad(dailyBest)}</span>
        </button>
        <button class="mode-btn" data-action="gallery">
          <span class="mode-icon">✦</span>
          <span class="mode-name">The Archive</span>
          <span class="mode-sub">${fragmentCount}/3 relics · ${heardTracks}/10 songs</span>
        </button>
        <button class="mode-btn" data-action="options">
          <span class="mode-icon">⚙</span>
          <span class="mode-name">Options</span>
          <span class="mode-sub">Sound · Aim · Accessibility</span>
        </button>
      </div>
      ${controlsMarkup()}
      ${footMarkup(highScore, progress)}
    </div>`;
}

export function screenStageSelect({ progress = {} } = {}) {
  const unlocked = progress.unlocked || 1;
  const cards = STAGES.map((stage, index) => {
    const locked = index + 1 > unlocked;
    const best = progress.stageBest?.[stage.id];
    return `
      <button class="stage-card ${locked ? 'locked' : ''}" data-action="score-stage" data-stage="${index}" ${locked ? 'disabled' : ''}>
        <span class="stage-num">${roman(index + 1)}</span>
        <span class="stage-info">
          <h3>${stage.name}</h3>
          <p>${stage.chapter} · ${stage.boss.shortName}</p>
        </span>
        <span class="stage-best">
          ${
            best
              ? `<span class="best-score">${pad(best.score)}</span><span class="best-label">BEST · ${best.rank || '—'}</span>`
              : `<span class="stage-locked-note">${locked ? 'CLEAR THE PREVIOUS RAIL' : 'NO RECORD'}</span>`
          }
        </span>
        <span class="stage-rank">${best?.rank || (locked ? '·' : '')}</span>
      </button>`;
  }).join('');

  return `
    <div class="screen-inner wide">
      <div class="screen-heading">
        <div class="kicker">SCORE ATTACK</div>
        <h1>CHOOSE A RAIL</h1>
        <p>Every rail can be flown alone. Chase the best score, the highest rank, and a cleaner shot-down rate.</p>
      </div>
      <div class="stage-select-head">
        <div class="tiny-kicker">RAILS OPEN ${unlocked} / ${STAGES.length}</div>
        <button class="screen-back" data-action="back-title">← RETURN TO TITLE</button>
      </div>
      <div class="stage-list">${cards}</div>
      <div class="screen-actions">
        <button class="btn btn-ghost" data-action="back-title">Back</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* options                                                           */
/* ------------------------------------------------------------------ */

const optionRange = (key, label, desc, value, min, max, step, display, format = 'percent') => `
  <div class="option-row">
    <div>
      <div class="option-label">${label}</div>
      <div class="option-desc">${desc}</div>
    </div>
    <div class="option-control">
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-setting="${key}" data-format="${format}" aria-label="${label}" />
      <output class="option-value" data-value-for="${key}">${display}</output>
    </div>
  </div>`;

const optionSelect = (key, label, desc, values, selected) => `
  <div class="option-row">
    <div>
      <div class="option-label">${label}</div>
      <div class="option-desc">${desc}</div>
    </div>
    <div class="option-control">
      <select data-setting="${key}" aria-label="${label}">
        ${values
          .map(
            ([value, text]) =>
              `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`
          )
          .join('')}
      </select>
    </div>
  </div>`;

const optionToggle = (key, label, desc, checked) => `
  <div class="option-row">
    <div>
      <div class="option-label">${label}</div>
      <div class="option-desc">${desc}</div>
    </div>
    <div class="option-control">
      <input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''} aria-label="${label}" />
    </div>
  </div>`;

export function screenOptions({ settings = {}, gamepadConnected = false } = {}) {
  return `
    <div class="screen-inner options-inner">
      <div class="screen-heading">
        <div class="kicker">SACRED CALIBRATION</div>
        <h1>OPTIONS</h1>
        <p>Shape the ritual to your hands. Every change is saved automatically.</p>
      </div>
      <div class="options-grid">
        <div class="option-divider">SOUND</div>
        ${optionRange('musicVolume', 'Music', 'The generative score. Turn it up.', Math.round((settings.musicVolume ?? 0.7) * 100), 0, 100, 1, `${Math.round((settings.musicVolume ?? 0.7) * 100)}%`)}
        ${optionRange('sfxVolume', 'Sound effects', 'Locks, shots, impacts and voices of the malice.', Math.round((settings.sfxVolume ?? 0.85) * 100), 0, 100, 1, `${Math.round((settings.sfxVolume ?? 0.85) * 100)}%`)}
        <div class="option-divider">CONTROL</div>
        ${optionRange('aimSpeed', 'Aim speed', 'Keyboard and controller reticle speed. Mouse aiming is direct.', Math.round((settings.aimSpeed ?? 1) * 100), 50, 200, 5, `${Math.round((settings.aimSpeed ?? 1) * 100)}%`, 'percent')}
        ${optionSelect('lockAssist', 'Lock assist', 'How forgiving the reticle is when painting a lock.', [['off', 'Off'], ['normal', 'Normal'], ['high', 'High']], settings.lockAssist || 'normal')}
        ${optionSelect('reticleSize', 'Reticle size', 'Scale of the targeting sigil.', [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']], settings.reticleSize || 'normal')}
        ${optionSelect('reticleColor', 'Reticle color', 'The color of the targeting sigil.', [['gold', 'Gold'], ['green', 'Hylian green'], ['cyan', 'Cyan'], ['rose', 'Rose']], settings.reticleColor || 'gold')}
        ${optionToggle('gamepad', 'Gamepad support', 'Use a controller to aim, lock, pause and call Nayru’s Focus.', settings.gamepad !== false)}
        <div class="option-divider">ACCESSIBILITY & VISUALS</div>
        ${optionToggle('reduceShake', 'Reduce screen shake', 'Soften camera movement and hide flickering ambient overlays.', !!settings.reduceShake)}
        ${optionToggle('reduceFlash', 'Reduce flashing', 'Replace bright full-screen flashes with a soft pulse.', !!settings.reduceFlash)}
        ${optionToggle('subtitles', 'Narration subtitles', 'Show story and combat subtitles.', settings.subtitles !== false)}
        ${optionSelect('quality', 'Visual quality', 'Bloom and render resolution. Lower settings help older devices.', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], settings.quality || 'high')}
      </div>
      <div class="options-foot">
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <span class="pad-status ${gamepadConnected ? 'connected' : ''}"><span class="dot"></span>${gamepadConnected ? 'CONTROLLER CONNECTED' : 'NO CONTROLLER DETECTED'}</span>
          <span class="option-desc">Gamepad: LMB/RT locks · A fires · X is Nayru’s Focus · Start pauses.</span>
        </div>
        <div class="options-actions">
          <button class="btn btn-ghost" data-action="reset-settings">Restore defaults</button>
          <button class="btn btn-primary" data-action="back-options">Back</button>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* archive / gallery                                                  */
/* ------------------------------------------------------------------ */

export function screenGallery({ tab = 'bestiary', progress = {}, playingTrack = null } = {}) {
  const enemies = progress.enemies || {};
  const bosses = progress.bosses || {};
  const tracksSeen = progress.tracks || {};
  const fragments = progress.fragments || {};
  const powers = progress.powers || {};
  const seenEnemyCount = BESTIARY_ORDER.filter((type) => enemies[type]).length;
  const seenBossCount = STAGES.filter((stage) => bosses[stage.id]).length;
  const seenTrackCount = TRACKS.filter((track) => tracksSeen[track.id]).length;

  const tabs = [
    ['bestiary', `BESTIARY ${seenEnemyCount + seenBossCount}/${BESTIARY_ORDER.length + STAGES.length}`],
    ['music', `MUSIC ROOM ${seenTrackCount}/${TRACKS.length}`],
    ['triforce', 'TRIFORCE'],
  ];

  const bestiary = `
    <div class="gallery-section-title">Creatures of the rails · ${seenEnemyCount} / ${BESTIARY_ORDER.length} observed</div>
    <div class="gallery-grid">
      ${BESTIARY_ORDER.map((type) => {
        const cfg = ENEMY_TYPES[type];
        const seen = !!enemies[type];
        const lore = ENEMY_LORE[type];
        return `<article class="gallery-card ${seen ? '' : 'locked'}">
          <h4>${seen ? cfg.label : '?????'}</h4>
          <p>${seen ? lore.lore : 'The archive has not yet witnessed this creature.'}</p>
          <div class="gc-meta"><span>${seen ? lore.tag : 'UNSEEN'}</span><span class="${seen ? 'gc-tag' : 'gc-lock'}">${seen ? `THREAT ${lore.threat}` : 'LOCKED'}</span></div>
        </article>`;
      }).join('')}
    </div>
    <div class="gallery-section-title">Guardians · ${seenBossCount} / ${STAGES.length} remembered</div>
    <div class="gallery-grid">
      ${STAGES.map((stage) => {
        const seen = !!bosses[stage.id];
        const lore = BOSS_LORE[stage.id];
        return `<article class="gallery-card ${seen ? '' : 'locked'}">
          <h4>${seen ? stage.boss.name : '?????'}</h4>
          <p>${seen ? lore.lore : 'The seal has not yet been broken before you.'}</p>
          <div class="gc-meta"><span>${seen ? lore.tag : 'UNSEEN'}</span><span class="${seen ? 'gc-tag' : 'gc-lock'}">${seen ? 'VANQUISHED' : 'LOCKED'}</span></div>
        </article>`;
      }).join('')}
    </div>`;

  const music = `
    <div class="gallery-section-title">Songs of the sacred rails · ${seenTrackCount} / ${TRACKS.length} heard</div>
    <div>
      ${TRACKS.map((track, index) => {
        const heard = !!tracksSeen[track.id];
        const playing = playingTrack === track.id;
        return `<div class="track-card ${heard ? '' : 'locked'}">
          <span class="track-no">${String(index + 1).padStart(2, '0')}</span>
          <div class="track-meta">
            <h4>${heard ? track.title : 'Unheard song'}</h4>
            <p>${heard ? `${track.subtitle} · ${track.bpm} BPM · ${track.key} ${track.mode}` : 'Clear or encounter this rail to unlock the recording.'}</p>
          </div>
          ${heard ? `<button class="track-btn ${playing ? 'playing' : ''}" data-action="preview-track" data-track="${track.id}">${playing ? 'STOP' : 'LISTEN'}</button>` : '<span class="stage-lock">✦</span>'}
        </div>`;
      }).join('')}
    </div>`;

  const triforce = `
    <div class="gallery-section-title">The three lights · ${Object.values(fragments).filter(Boolean).length} / 3 recovered</div>
    <div class="fragment-grid">
      ${['power', 'courage', 'wisdom'].map((key) => {
        const unlocked = !!fragments[key];
        return `<article class="fragment-card ${unlocked ? 'unlocked' : ''}">
          ${triforceSVG('')}
          <h4>${unlocked ? FRAGMENT_INFO[key].name : '?????'}</h4>
          <p>${unlocked ? FRAGMENT_INFO[key].lore : 'A light that has not yet answered your hand.'}</p>
        </article>`;
      }).join('')}
    </div>
    <div class="gallery-section-title">Goddess powers</div>
    <div class="gallery-grid">
      ${POWER_ORDER.map((key) => {
        const unlocked = !!powers[key];
        const info = POWER_INFO[key];
        return `<article class="gallery-card ${unlocked ? '' : 'locked'}">
          <h4>${unlocked ? info.name : '?????'}</h4>
          <p>${unlocked ? info.lore : 'A blessing yet to be earned from a guardian.'}</p>
          <div class="gc-meta"><span>${info.goddess}</span><span class="${unlocked ? 'gc-tag' : 'gc-lock'}">${unlocked ? 'AWAKENED' : 'LOCKED'}</span></div>
        </article>`;
      }).join('')}
    </div>
    <div class="gallery-section-title">A legend assembled</div>
    <div class="gallery-grid">
      <article class="gallery-card ${Object.values(fragments).every(Boolean) ? '' : 'locked'}">
        <h4>${Object.values(fragments).every(Boolean) ? 'THE TRIFORCE' : '?????'}</h4>
        <p>${Object.values(fragments).every(Boolean) ? 'Power, Courage, Wisdom. The three are one, and the Sacred Realm has answered.' : 'Gather all three fragments from the guardians of the first three rails.'}</p>
        <div class="gc-meta"><span>THE THREE ARE ONE</span><span class="${Object.values(fragments).every(Boolean) ? 'gc-tag' : 'gc-lock'}">${Object.values(fragments).every(Boolean) ? 'RESTORED' : 'INCOMPLETE'}</span></div>
      </article>
    </div>`;

  return `
    <div class="screen-inner wide">
      <div class="gallery-head">
        <div class="screen-heading" style="text-align:left;align-items:flex-start">
          <div class="kicker">THE ARCHIVE OF HYRULE</div>
          <h1 style="text-align:left">WHAT THE RAILS REMEMBER</h1>
          <p style="text-align:left;margin-left:0">A record of every creature, song and light gathered on the sacred line.</p>
        </div>
        <button class="screen-back" data-action="back-title">← RETURN TO TITLE</button>
      </div>
      <div class="gallery-tabs">
        ${tabs
          .map(
            ([key, label]) =>
              `<button class="gallery-tab ${tab === key ? 'active' : ''}" data-action="gallery-tab" data-tab="${key}">${label}</button>`
          )
          .join('')}
      </div>
      <div class="gallery-body">
        ${tab === 'music' ? music : tab === 'triforce' ? triforce : bestiary}
      </div>
      <div class="gallery-footer">
        <span class="tiny-kicker">${seenEnemyCount + seenBossCount} records · ${seenTrackCount} songs · ${Object.values(fragments).filter(Boolean).length} relics</span>
        <button class="btn btn-ghost" data-action="back-title">Back to title</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* shrine                                                             */
/* ------------------------------------------------------------------ */

export function screenShrine({ rupees = 0, health = 0, maxHealth = 16, shieldCharges = 0, purchases = {}, nextStage = null } = {}) {
  const offers = [
    {
      key: 'heal',
      title: 'Heart of the Wild',
      desc: 'Restore every heart before the next rail.',
      cost: 30,
      disabled: health >= maxHealth || !!purchases.heal,
    },
    {
      key: 'heart',
      title: 'Goddess’s Vessel',
      desc: 'Add one permanent heart to this run.',
      cost: 100,
      disabled: maxHealth >= 24 || !!purchases.heart,
    },
    {
      key: 'lock',
      title: 'Cracked Sigil',
      desc: 'Two extra lock-ons for the next rail only.',
      cost: 80,
      disabled: !!purchases.lock,
    },
    {
      key: 'shield',
      title: 'Farore’s Ward',
      desc: 'A charm that blocks the next wound. Stacks up to three.',
      cost: 60,
      disabled: shieldCharges >= 3 || !!purchases.shield,
    },
  ];
  return `
    <div class="screen-inner shrine-inner">
      <div class="shrine-head">
        <div class="kicker">BETWEEN THE RAILS</div>
        <h1 class="shrine-title">THE SHADOW SHRINE</h1>
        <p class="shrine-poem">A little light, traded for a little shadow. The goddesses do not mind a bargain made in good faith.</p>
        <div class="shrine-wallet">${rupeeMini()} ${pad(rupees, 3)} RUPees · ${heartMini()} ${(health / 4).toFixed(health % 4 === 0 ? 0 : 1)} / ${(maxHealth / 4).toFixed(0)} HEARTS</div>
      </div>
      <div class="shrine-grid">
        ${offers
          .map(
            (offer) => `<button class="shrine-offer" data-action="shrine-buy" data-offer="${offer.key}" ${offer.disabled ? 'disabled' : ''}>
              ${purchases[offer.key] ? '<span class="offer-sold">CLAIMED</span>' : ''}
              <h4>${offer.title}</h4>
              <p>${offer.desc}</p>
              <span class="offer-cost">${offer.disabled && !purchases[offer.key] && rupees < offer.cost ? 'NOT ENOUGH RUPees' : `${pad(offer.cost, 3)} RUPees`}</span>
            </button>`
          )
          .join('')}
      </div>
      <div class="shrine-actions">
        <button class="btn btn-primary" data-action="shrine-continue">${nextStage ? `Descend to ${nextStage.name}` : 'Continue the legend'}</button>
      </div>
      <div class="title-foot" style="margin-top:20px">
        <span>Purchases are for this run only. Heart containers from guardians remain.</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* story                                                              */
/* ------------------------------------------------------------------ */

export function screenStory({ stage, index, total }) {
  return `
    <div class="screen-inner">
      <div class="story-kicker"><i></i> ${stage.chapter} <i></i></div>
      <h1 class="story-title">${stage.name}</h1>
      <div class="story-subtitle">RAIL ${roman(index + 1)} OF ${roman(total)} · ${stage.epithet}</div>
      <div class="story-rule"><i></i><span>△</span><i></i></div>
      <p class="story-poem">${stage.story.poem}</p>
      <button class="btn btn-primary story-continue" data-action="continue">Enter the rail</button>
      <div class="story-tip desktop-only">
        <span><span class="keycap">ENTER</span> AWAKEN</span>
        <span><span class="keycap">M</span> MUTE</span>
        <span><span class="keycap">E</span> NAYRU’S FOCUS</span>
        <span><span class="keycap">F</span> FULLSCREEN</span>
      </div>
      <div class="story-tip touch-only">
        <span>TAP THE RAIL TO AWAKEN · HEADPHONES RECOMMENDED</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* results                                                            */
/* ------------------------------------------------------------------ */

export function screenResults({
  stage,
  stats,
  rank,
  piece,
  best,
  isBest,
  mode = 'campaign',
  nextStage = null,
  stageBest = null,
  dailyBest = null,
  dailyDate = '',
}) {
  const accuracy = stats.spawned > 0 ? Math.round((stats.killed / stats.spawned) * 100) : 100;
  const rows = [
    ['FOES VANQUISHED', pad(stats.killed, 3)],
    ['SHOT DOWN RATE', `${accuracy}%`],
    ['HARMONY STRIKES', pad(stats.harmony, 3)],
    ['RUPees COLLECTED', pad(stats.rupees, 4)],
    ['AWAKEN LEVEL', `${roman(stats.maxAwaken)}`],
    ['RAIL TIME', stats.time],
  ];
  const kicker =
    mode === 'score'
      ? `SCORE ATTACK · ${stage.chapter}`
      : mode === 'daily'
        ? `DAILY RAIL · ${dailyDate || 'TODAY'}`
        : `STAGE CLEAR · ${stage.chapter}`;
  const primary =
    mode === 'campaign'
      ? `<button class="btn btn-primary" data-action="open-shrine">${nextStage ? `Visit the Shrine` : 'Continue'}</button>`
      : mode === 'daily'
        ? `<button class="btn btn-primary" data-action="retry-stage">Try again</button>
           <button class="btn btn-ghost" data-action="share-result">Share result</button>
           <button class="btn btn-ghost" data-action="back-title">Title</button>`
        : `<button class="btn btn-primary" data-action="stage-select">Choose another rail</button>
           <button class="btn btn-ghost" data-action="retry-stage">Rail again</button>
           <button class="btn btn-ghost" data-action="share-result">Share result</button>`;
  return `
    <div class="screen-inner results-inner">
      <div class="results-head">
        <div class="results-kicker">${kicker}</div>
        <h1 class="results-title">${stage.clearTitle}</h1>
      </div>
      <div class="results-side">
        <div class="rank-block">
          <span class="rank-label">RANK</span>
          <span class="rank-letter">${rank}</span>
        </div>
        ${
          piece
            ? `<div class="triforce-piece">
                <svg viewBox="0 0 200 180" aria-hidden="true">
                  <path d="M100 10 148 94 52 94Z" />
                  <path d="M52 94 100 178 4 178Z" />
                  <path d="M148 94 196 178 100 178Z" />
                </svg>
                <div class="tp-text">
                  <span class="tp-kicker">A FRAGMENT REAWAKENED</span>
                  <span class="tp-name">${piece}</span>
                </div>
              </div>`
            : ''
        }
      </div>
      <div class="results-grid">
        ${rows
          .map(([k, v]) => `<div class="result-row"><span>${k}</span><b>${v}</b></div>`)
          .join('')}
        <div class="result-row total"><span>SPIRIT SCORE</span><b>${pad(stats.score)}</b></div>
      </div>
      <div style="text-align:center">
        ${
          mode === 'campaign'
            ? `<div class="heart-container-note">${heartMini()} ${nextStage ? 'HEART CONTAINER ATTAINED · THE HERO ENDURES' : 'THE LEGEND IS COMPLETE'}</div>`
            : ''
        }
        ${isBest ? '<div class="results-kicker" style="margin-top:14px">NEW BEST SPIRIT SCORE</div>' : ''}
        ${stageBest ? `<div class="tiny-kicker" style="margin-top:8px">RAIL BEST ${pad(stageBest.score)} · ${stageBest.rank || '—'}</div>` : ''}
        ${mode === 'daily' && dailyBest ? `<div class="tiny-kicker" style="margin-top:6px">TODAY’S BEST ${pad(dailyBest)}</div>` : ''}
      </div>
      <div class="results-actions">${primary}</div>
      <div class="title-foot" style="margin-top:18px">
        <span>BEST SPIRIT SCORE <b style="color:var(--gold);font-variant-numeric:tabular-nums">${pad(best)}</b></span>
        <span>${accuracy >= 90 ? 'THE SPIRITS APPROVE' : accuracy >= 65 ? 'THE RAIL HOLDS' : 'THE MALICE WHISPERS'}</span>
      </div>
    </div>`;
}

export function screenBossRushResults({ score = 0, best = 0, time = '00:00', guardians = 5, isBest = false } = {}) {
  return `
    <div class="screen-inner over-inner">
      <div class="over-kicker">THE GAUNTLET IS SILENT</div>
      <h1 class="over-title restored">ALL GUARDIANS FALLEN</h1>
      <p class="over-poem">
        No rails between them. No rest between the names.<br />
        You walked the whole dark line, and it broke beneath you.<br />
        <span class="green">The guardians will remember.</span>
      </p>
      <div class="rush-stats">
        <div class="rush-stat"><span class="label">GUARDIANS</span><span class="value">${guardians} / 5</span></div>
        <div class="rush-stat"><span class="label">SPIRIT SCORE</span><span class="value">${pad(score)}</span></div>
        <div class="rush-stat"><span class="label">RUN TIME</span><span class="value">${time}</span></div>
      </div>
      <div class="final-score">
        <span class="label">BEST GAUNTLET</span>
        <span class="value">${pad(best)}</span>
        ${isBest ? '<span class="results-kicker" style="margin-top:10px">A NEW GAUNTLET RECORD</span>' : ''}
      </div>
      <div class="over-actions">
        <button class="btn btn-primary" data-action="retry-rush">Run it again</button>
        <button class="btn btn-ghost" data-action="back-title">Return to title</button>
      </div>
    </div>`;
}

export function screenGameOver({ stage, score, best, killed, spawned, mode = 'campaign' }) {
  const accuracy = spawned > 0 ? Math.round((killed / spawned) * 100) : 0;
  const retryAction = mode === 'bossrush' ? 'retry-rush' : mode === 'score' || mode === 'daily' ? 'retry-stage' : 'retry';
  const retryLabel = mode === 'bossrush' ? 'Try the gauntlet again' : 'Rise again';
  const modeNote = mode === 'daily' ? 'Daily Rail' : mode === 'score' ? 'Score Attack' : mode === 'bossrush' ? 'Boss Rush' : stage.name;
  return `
    <div class="screen-inner over-inner">
      <div class="over-kicker">THE RAIL FALLS SILENT · ${modeNote}</div>
      <h1 class="over-title fallen">THE HERO HAS FALLEN</h1>
      <p class="over-poem">
        Even a spirit may stumble in the dark.<br />
        The Triforce waits at the end of the line — <span class="gold">try once more.</span>
      </p>
      <div class="final-score">
        <span class="label">SPIRIT SCORE · ${stage.name}</span>
        <span class="value">${pad(score)}</span>
        <span class="tiny-kicker" style="margin-top:8px">BEST ${pad(best)} · ${accuracy}% SHOT DOWN</span>
      </div>
      <div class="over-actions">
        <button class="btn btn-primary" data-action="${retryAction}">${retryLabel}</button>
        <button class="btn btn-ghost" data-action="back-title">Abandon the rail</button>
      </div>
    </div>`;
}

export function screenVictory({ score, best, stats, isBest }) {
  return `
    <div class="screen-inner over-inner">
      <div class="over-kicker">THE THREE ARE ONE</div>
      <svg class="victory-triforce" viewBox="0 0 200 180" aria-hidden="true">
        <path class="vt-tri" d="M100 10 148 94 52 94Z" />
        <path class="vt-tri" d="M52 94 100 178 4 178Z" />
        <path class="vt-tri" d="M148 94 196 178 100 178Z" />
      </svg>
      <h1 class="over-title restored">HYRULE RESTORED</h1>
      <p class="over-poem">
        Demise is sealed. The Sacred Realm closes like a hand at rest.<br />
        Power, Courage, Wisdom — gathered in a single heart.<br />
        <span class="green">The legend is yours now.</span>
      </p>
      <div class="final-score">
        <span class="label">FINAL SPIRIT SCORE</span>
        <span class="value">${pad(score)}</span>
        <span class="tiny-kicker" style="margin-top:8px">${stats.killed} FOES · ${stats.harmony} HARMONY STRIKES · ${stats.time} · BEST ${pad(best)}</span>
        ${isBest ? '<span class="results-kicker" style="margin-top:10px">A NEW LEGEND</span>' : ''}
      </div>
      <div class="over-actions">
        <button class="btn btn-primary" data-action="back-title">Walk the rails again</button>
        <button class="btn btn-ghost" data-action="gallery">Open the Archive</button>
      </div>
      <div class="title-foot" style="margin-top:26px">
        <span>${rupeeMini()} A TRIBUTE TO REZ AND THE LEGEND OF ZELDA</span>
        <span>FIVE RAILS · FIVE GUARDIANS · ONE TRIFORCE</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* pause                                                              */
/* ------------------------------------------------------------------ */

export function screenPause({ stage, score, rupees, hearts, awakened, muted, mode = 'campaign' }) {
  const modeLabel = mode === 'score' ? 'SCORE ATTACK' : mode === 'daily' ? 'DAILY RAIL' : mode === 'bossrush' ? 'BOSS RUSH' : stage.name;
  return `
    <div class="screen-inner pause-inner">
      <div class="tiny-kicker" style="margin-bottom:10px">${modeLabel}</div>
      <h1 class="pause-title">PAUSED</h1>
      <p class="pause-sub">The rail waits. The music holds its breath.</p>
      <div class="pause-stats">
        <div class="pause-stat"><span class="label">SCORE</span><span class="value">${pad(score)}</span></div>
        <div class="pause-stat"><span class="label">RUPees</span><span class="value">${pad(rupees, 3)}</span></div>
        <div class="pause-stat"><span class="label">HEARTS</span><span class="value">${(hearts / 4).toFixed(hearts % 4 === 0 ? 0 : 1)}</span></div>
        <div class="pause-stat"><span class="label">AWAKEN</span><span class="value">${roman(awakened)}</span></div>
      </div>
      <div class="pause-actions">
        <button class="btn btn-primary" data-action="resume">Return to the rail</button>
        <button class="btn btn-ghost" data-action="options">Options</button>
        <button class="btn btn-ghost" data-action="mute">${muted ? 'Unmute music' : 'Mute music'}</button>
        <button class="btn btn-ghost" data-action="retry">Restart stage</button>
        <button class="btn btn-ghost" data-action="back-title">Abandon the rail</button>
      </div>
      <div class="title-foot desktop-only" style="margin-top:24px">
        <span><span class="keycap">ESC</span> RESUME</span>
        <span><span class="keycap">M</span> MUTE</span>
        <span><span class="keycap">E</span> NAYRU’S FOCUS</span>
      </div>
    </div>`;
}

export { MODE_INFO };
