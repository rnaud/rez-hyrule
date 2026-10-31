import { pad, roman } from './util.js';

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

const footMarkup = (highScore) => `
  <div class="title-foot">
    <span class="high-score">${rupeeMini()} BEST SPIRIT SCORE <b>${pad(highScore || 0)}</b></span>
    <span class="blink">A TRIBUTE IN THREE.JS · HEADPHONES RECOMMENDED</span>
  </div>`;

export function screenTitle({ highScore = 0 } = {}) {
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
        <button class="btn btn-primary" data-action="start">Awaken</button>
      </div>
      ${controlsMarkup()}
      ${footMarkup(highScore)}
    </div>`;
}

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
        <span><span class="keycap">F</span> FULLSCREEN</span>
      </div>
      <div class="story-tip touch-only">
        <span>TAP THE RAIL TO AWAKEN · HEADPHONES RECOMMENDED</span>
      </div>
    </div>`;
}

export function screenResults({ stage, stats, rank, piece, best, isBest }) {
  const accuracy = stats.spawned > 0 ? Math.round((stats.killed / stats.spawned) * 100) : 100;
  const rows = [
    ['FOES VANQUISHED', pad(stats.killed, 3)],
    ['SHOT DOWN RATE', `${accuracy}%`],
    ['HARMONY STRIKES', pad(stats.harmony, 3)],
    ['RUPees COLLECTED', pad(stats.rupees, 4)],
    ['AWAKEN LEVEL', `${roman(stats.maxAwaken)}`],
    ['RAIL TIME', stats.time],
  ];
  return `
    <div class="screen-inner results-inner">
      <div class="results-head">
        <div class="results-kicker">STAGE CLEAR · ${stage.chapter}</div>
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
          .map(
            ([k, v]) =>
              `<div class="result-row"><span>${k}</span><b>${v}</b></div>`
          )
          .join('')}
        <div class="result-row total"><span>SPIRIT SCORE</span><b>${pad(stats.score)}</b></div>
      </div>
      <div style="text-align:center">
        <div class="heart-container-note">${heartMini()} HEART CONTAINER ATTAINED · THE HERO ENDURES</div>
        ${isBest ? '<div class="results-kicker" style="margin-top:14px">NEW BEST SPIRIT SCORE</div>' : ''}
      </div>
      <div class="results-actions">
        <button class="btn btn-primary" data-action="next-stage">${stage.nextLabel || 'Follow the light'}</button>
      </div>
      <div class="title-foot" style="margin-top:18px">
        <span>BEST SPIRIT SCORE <b style="color:var(--gold);font-variant-numeric:tabular-nums">${pad(best)}</b></span>
        <span>${accuracy >= 90 ? 'THE SPIRITS APPROVE' : accuracy >= 65 ? 'THE RAIL HOLDS' : 'THE MALICE WHISPERS'}</span>
      </div>
    </div>`;
}

export function screenGameOver({ stage, score, best, killed, spawned }) {
  const accuracy = spawned > 0 ? Math.round((killed / spawned) * 100) : 0;
  return `
    <div class="screen-inner over-inner">
      <div class="over-kicker">THE RAIL FALLS SILENT</div>
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
        <button class="btn btn-primary" data-action="retry">Rise again</button>
        <button class="btn btn-ghost" data-action="title">Abandon the rail</button>
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
        The malice recoils. The rails fall quiet.<br />
        Power, Courage, Wisdom — gathered in a single hand.<br />
        <span class="green">The legend is yours now.</span>
      </p>
      <div class="final-score">
        <span class="label">FINAL SPIRIT SCORE</span>
        <span class="value">${pad(score)}</span>
        <span class="tiny-kicker" style="margin-top:8px">${stats.killed} FOES · ${stats.harmony} HARMONY STRIKES · ${stats.time} · BEST ${pad(best)}</span>
        ${isBest ? '<span class="results-kicker" style="margin-top:10px">A NEW LEGEND</span>' : ''}
      </div>
      <div class="over-actions">
        <button class="btn btn-primary" data-action="title">Walk the rails again</button>
        <button class="btn btn-ghost" data-action="restart-full">New legend</button>
      </div>
      <div class="title-foot" style="margin-top:26px">
        <span>${rupeeMini()} A TRIBUTE TO REZ AND THE LEGEND OF ZELDA</span>
        <span>BUILT WITH THREE.JS</span>
      </div>
    </div>`;
}

export function screenPause({ stage, score, rupees, hearts, awakened, muted }) {
  return `
    <div class="screen-inner pause-inner">
      <div class="tiny-kicker" style="margin-bottom:10px">${stage.name}</div>
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
        <button class="btn btn-ghost" data-action="mute">${muted ? 'Unmute music' : 'Mute music'}</button>
        <button class="btn btn-ghost" data-action="retry">Restart stage</button>
        <button class="btn btn-ghost" data-action="title">Abandon the rail</button>
      </div>
      <div class="title-foot desktop-only" style="margin-top:24px">
        <span><span class="keycap">ESC</span> RESUME</span>
        <span><span class="keycap">M</span> MUTE</span>
      </div>
    </div>`;
}

