import { clamp, pad } from './util.js';

const HEART_PATH =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

const MAX_PIPS = 8;

export class Hud {
  constructor({ onAction, onHover } = {}) {
    this.onAction = onAction || (() => {});
    this.onHover = onHover || (() => {});

    this.root = document.getElementById('hud');
    this.heartsEl = document.getElementById('hearts');
    this.awakenEl = document.getElementById('awaken-pips');
    this.awakenLevelEl = document.getElementById('awaken-level');
    this.scoreEl = document.getElementById('score');
    this.rupeesEl = document.getElementById('rupees');
    this.reticleEl = document.getElementById('reticle');
    this.reticleLocksEl = document.getElementById('reticle-locks');
    this.lockLayer = document.getElementById('lock-layer');
    this.popupLayer = document.getElementById('popup-layer');
    this.bannerEl = document.getElementById('banner');
    this.subtitleEl = document.getElementById('subtitle');
    this.hintEl = document.getElementById('hint');
    this.screenEl = document.getElementById('screen');
    this.flashEl = document.getElementById('flash');
    this.damageEl = document.getElementById('damage-flash');
    this.bossHud = document.getElementById('boss-hud');
    this.bossName = document.getElementById('boss-name');
    this.bossPhase = document.getElementById('boss-phase');
    this.bossSub = document.getElementById('boss-sub');
    this.bossFill = document.getElementById('boss-bar-fill');

    this.powerHud = document.getElementById('power-hud');
    this.powerPips = new Map(
      [...document.querySelectorAll('#power-hud .power-pip')].map((el) => [el.dataset.power, el])
    );
    this.shieldEl = document.getElementById('power-shields');
    this.abilityBtn = document.getElementById('ability-btn');
    this.abilityCd = document.getElementById('ability-cd');
    this.chainEl = document.getElementById('chain-hud');
    this.chainValueEl = document.getElementById('chain-value');
    this.chainHarmonyEl = document.getElementById('chain-harmony');
    this.runMetaEl = document.getElementById('run-meta');
    this.beatRingEl = document.getElementById('beat-ring');

    this.subtitlesEnabled = true;
    this.reduceFlash = false;
    this.reticlePrefs = { size: 'normal', color: 'gold' };

    this._heartRefs = [];
    this._lastQuarters = 0;
    this._lastAwaken = 0;
    this._pipEls = [];
    this._retPips = [];
    this._maxPips = 0;
    this._lockMarkers = new Map();
    this._timers = { banner: 0, subtitle: 0, hint: 0 };
    this._popupCount = 0;
    this._heartGen = 0;
    this._screenVisible = false;

    window.addEventListener('resize', () => this._applyReticlePrefs());

    this._injectHeartDefs();
    this._buildAwakenPips();
    this._buildReticlePips(4);

    this.screenEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      this.onAction(btn.dataset.action, btn);
    });
    this.screenEl.addEventListener('pointerover', (e) => {
      if (e.target.closest('.btn, .mode-btn, .stage-card, .shrine-offer, .gallery-tab, .track-btn')) this.onHover();
    });
  }

  _injectHeartDefs() {
    const wrapper = document.createElement('div');
    wrapper.id = 'heart-defs';
    wrapper.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none';
    wrapper.innerHTML = `
      <svg width="0" height="0" aria-hidden="true">
        <defs>
          <linearGradient id="heartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffd9dc" />
            <stop offset="35%" stop-color="#ff7a8f" />
            <stop offset="100%" stop-color="#d91f4c" />
          </linearGradient>
          <filter id="heartGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>`;
    document.body.appendChild(wrapper);
  }

  _buildAwakenPips() {
    this.awakenEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('i');
      pip.className = 'pip';
      this.awakenEl.appendChild(pip);
    }
    this._pipEls = [...this.awakenEl.children];
  }

  _buildReticlePips(maxLocks) {
    const max = clamp(maxLocks, 1, MAX_PIPS);
    const size = this.reticleEl.clientWidth || 136;
    if (max === this._maxPips && size === this._pipSize) return;
    this._maxPips = max;
    this._pipSize = size;
    this.reticleLocksEl.innerHTML = '';
    this._retPips = [];
    const half = size / 2;
    const r = size * 0.45;
    for (let i = 0; i < max; i++) {
      const pip = document.createElement('i');
      pip.className = 'ret-pip';
      const angle = -Math.PI / 2 + (i / max) * Math.PI * 2;
      pip.style.left = `${half + Math.cos(angle) * r}px`;
      pip.style.top = `${half + Math.sin(angle) * r}px`;
      this.reticleLocksEl.appendChild(pip);
      this._retPips.push(pip);
    }
  }

  applyPreferences(settings = {}) {
    this.subtitlesEnabled = settings.subtitles !== false;
    if (!this.subtitlesEnabled) this.subtitleEl.classList.remove('show');
    this.reduceFlash = !!settings.reduceFlash;
    document.body.classList.toggle('reduce-flash', this.reduceFlash);
    document.body.classList.toggle('reduce-motion', !!settings.reduceShake);
    this.reticlePrefs = {
      size: settings.reticleSize || this.reticlePrefs.size,
      color: settings.reticleColor || this.reticlePrefs.color,
    };
    this._applyReticlePrefs();
  }

  _applyReticlePrefs() {
    const base = window.innerWidth <= 760 ? 104 : 136;
    const scale = this.reticlePrefs.size === 'small' ? 0.82 : this.reticlePrefs.size === 'large' ? 1.18 : 1;
    document.documentElement.style.setProperty('--ret-size', `${Math.round(base * scale)}px`);
    const colors = {
      gold: '242, 210, 123',
      green: '129, 255, 194',
      cyan: '125, 235, 255',
      rose: '255, 145, 175',
    };
    document.documentElement.style.setProperty('--ret-rgb', colors[this.reticlePrefs.color] || colors.gold);
    this._maxPips = 0;
  }

  setBeat(phase, beatError, active = true) {
    if (!this.beatRingEl) return;
    const p = phase % 1;
    const scale = 0.9 + p * 0.22;
    const opacity = active ? Math.max(0, 0.55 - p * 0.45) : 0;
    this.beatRingEl.style.transform = `scale(${scale.toFixed(3)})`;
    this.beatRingEl.style.opacity = opacity.toFixed(3);
    this.reticleEl.classList.toggle('on-beat', active && beatError < 0.1);
  }

  setChain(combo, harmonyChain = 0) {
    if (!this.chainEl) return;
    const show = combo >= 2 || harmonyChain > 0;
    this.chainEl.classList.toggle('show', show);
    if (this.chainValueEl) this.chainValueEl.textContent = `×${Math.max(1, combo)}`;
    if (this.chainHarmonyEl) {
      this.chainHarmonyEl.textContent = harmonyChain > 0 ? `HARMONY ${harmonyChain}` : '';
      this.chainHarmonyEl.classList.toggle('show', harmonyChain > 0);
    }
  }

  setPowers({ power = false, courage = false, wisdom = false } = {}, shields = 0) {
    const unlocked = { power, courage, wisdom };
    for (const [key, el] of this.powerPips) {
      if (!el) continue;
      el.classList.toggle('unlocked', !!unlocked[key]);
    }
    if (this.shieldEl) {
      this.shieldEl.innerHTML = '';
      for (let i = 0; i < Math.min(3, shields); i++) {
        const pip = document.createElement('i');
        pip.className = 'ward-pip';
        this.shieldEl.appendChild(pip);
      }
    }
    if (this.abilityBtn) {
      this.abilityBtn.classList.toggle('hidden', !wisdom);
    }
  }

  setWisdom({ active = 0, cooldown = 0, duration = 4 } = {}) {
    if (!this.abilityBtn) return;
    const isActive = active > 0;
    const isCooling = cooldown > 0 && !isActive;
    this.abilityBtn.classList.toggle('active', isActive);
    this.abilityBtn.classList.toggle('cooling', isCooling);
    if (this.abilityCd) {
      this.abilityCd.textContent = isActive ? `${Math.ceil(active)}` : isCooling ? `${Math.ceil(cooldown)}` : '';
    }
    this.abilityBtn.setAttribute(
      'aria-label',
      isActive ? 'Nayru’s Focus active' : isCooling ? 'Nayru’s Focus cooling down' : 'Activate Nayru’s Focus'
    );
  }

  setRunMeta(text = '') {
    if (this.runMetaEl) this.runMetaEl.textContent = text;
  }

  showHud(show = true) {
    this.root.classList.toggle('hidden', !show);
    this.root.classList.toggle('show', show);
  }

  setScore(score, bump = true) {
    this.scoreEl.textContent = pad(score);
    if (bump) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
  }

  setRupees(rupees) {
    this.rupeesEl.textContent = pad(rupees, 3);
  }

  setAwaken(level) {
    const lv = clamp(Math.round(level), 1, 10);
    for (let i = 0; i < this._pipEls.length; i++) {
      this._pipEls[i].classList.toggle('on', i < lv);
    }
    this.awakenLevelEl.textContent = String(lv);
    if (lv > this._lastAwaken) {
      const pip = this._pipEls[Math.min(lv - 1, this._pipEls.length - 1)];
      pip?.animate?.(
        [
          { transform: 'rotate(45deg) scale(2.4)', boxShadow: '0 0 22px rgba(123,240,176,1)' },
          { transform: 'rotate(45deg) scale(1)', boxShadow: '0 0 8px rgba(123,240,176,.85)' },
        ],
        { duration: 550, easing: 'cubic-bezier(.2,1.5,.5,1)' }
      );
    }
    this._lastAwaken = lv;
  }

  _rebuildHearts(maxHearts) {
    this.heartsEl.innerHTML = '';
    this._heartRefs = [];
    for (let i = 0; i < maxHearts; i++) {
      const id = `hclip-${this._heartGen++}`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'heart');
      svg.innerHTML = `
        <defs>
          <clipPath id="${id}">
            <rect x="0" y="2.5" width="24" height="19" rx="1"></rect>
          </clipPath>
        </defs>
        <path class="heart-bg" d="${HEART_PATH}"></path>
        <g clip-path="url(#${id})" style="opacity:1">
          <path class="heart-fill" d="${HEART_PATH}"></path>
        </g>
        <path class="heart-outline" d="${HEART_PATH}"></path>`;
      this.heartsEl.appendChild(svg);
      this._heartRefs.push({
        svg,
        group: svg.querySelector('g'),
        clipRect: svg.querySelector('rect'),
        fill: svg.querySelector('.heart-fill'),
      });
    }
  }

  setHearts(quarters, maxQuarters = Math.max(12, quarters), { animate = true } = {}) {
    const maxHearts = Math.ceil(maxQuarters / 4);
    if (this._heartRefs.length !== maxHearts) this._rebuildHearts(maxHearts);
    const q = clamp(quarters, 0, maxQuarters);
    for (let i = 0; i < this._heartRefs.length; i++) {
      const fillQ = clamp(q - i * 4, 0, 4);
      const ref = this._heartRefs[i];
      const frac = fillQ / 4;
      const height = 19 * frac;
      ref.clipRect.setAttribute('y', String(2.5 + 19 - height));
      ref.clipRect.setAttribute('height', String(height));
      ref.group.style.opacity = fillQ > 0 ? '1' : '0';
      ref.svg.classList.toggle('is-lost', fillQ === 0);
      if (animate && q > this._lastQuarters) {
        const wasEmpty = clamp(this._lastQuarters - i * 4, 0, 4) === 0;
        if (fillQ > 0 && wasEmpty) {
          ref.svg.classList.remove('is-new');
          void ref.svg.offsetWidth;
          ref.svg.classList.add('is-new');
        }
      }
    }
    this._lastQuarters = q;
  }

  setReticle(x, y, { hot = false, charging = false, firing = false } = {}, locks = 0, maxLocks = 4) {
    this.reticleEl.classList.remove('hidden');
    const ox = window.innerWidth * 0.5;
    const oy = window.innerHeight * 0.5;
    this.reticleEl.style.transform = `translate3d(${x - ox}px, ${y - oy}px, 0)`;
    this.reticleEl.classList.toggle('hot', hot);
    this.reticleEl.classList.toggle('charging', charging);
    this._buildReticlePips(maxLocks);
    for (let i = 0; i < this._retPips.length; i++) {
      this._retPips[i].classList.toggle('on', i < locks);
    }
    this.reticleEl.classList.toggle('lock-warning', locks >= maxLocks);
  }

  reticleFire() {
    this.reticleEl.classList.remove('firing');
    void this.reticleEl.offsetWidth;
    this.reticleEl.classList.add('firing');
    window.setTimeout(() => this.reticleEl.classList.remove('firing'), 240);
  }

  hideReticle() {
    this.reticleEl.classList.add('hidden');
  }

  setLocks(list) {
    const seen = new Set();
    for (const item of list) {
      seen.add(item.key);
      let marker = this._lockMarkers.get(item.key);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = `lock-marker${item.boss ? ' boss' : ''}`;
        marker.innerHTML = `
          <span class="lm-bracket tl"></span>
          <span class="lm-bracket tr"></span>
          <span class="lm-bracket bl"></span>
          <span class="lm-bracket br"></span>
          <span class="lm-ring"></span>
          <span class="lm-inner"></span>
          <span class="lm-num"></span>`;
        marker.querySelector('.lm-num').textContent = String(item.index);
        this.lockLayer.appendChild(marker);
        this._lockMarkers.set(item.key, marker);
      }
      marker.querySelector('.lm-num').textContent = String(item.index);
      marker.style.left = `${item.x}px`;
      marker.style.top = `${item.y}px`;
      marker.style.visibility = 'visible';
    }
    for (const [key, marker] of this._lockMarkers) {
      if (!seen.has(key)) {
        marker.remove();
        this._lockMarkers.delete(key);
      }
    }
  }

  clearLocks({ fire = false } = {}) {
    for (const marker of this._lockMarkers.values()) {
      if (fire) {
        marker.classList.add('fire');
        window.setTimeout(() => marker.remove(), 260);
      } else {
        marker.remove();
      }
    }
    this._lockMarkers.clear();
    this.reticleEl.classList.remove('lock-warning');
  }

  popup(text, x, y, type = '') {
    if (!this.popupLayer) return;
    if (this._popupCount > 16) {
      this.popupLayer.firstElementChild?.remove();
    } else {
      this._popupCount++;
    }
    const el = document.createElement('div');
    el.className = `popup ${type}`.trim();
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.popupLayer.appendChild(el);
    window.setTimeout(() => {
      el.remove();
      this._popupCount = Math.max(0, this._popupCount - 1);
    }, 1000);
  }

  showBanner({ kicker = '', title = '', sub = '', kind = '', duration = 2800 } = {}) {
    window.clearTimeout(this._timers.banner);
    this.bannerEl.classList.remove('hidden', 'show', 'boss');
    if (kind) this.bannerEl.classList.add(kind);
    this.bannerEl.querySelector('.banner-kicker').textContent = kicker;
    this.bannerEl.querySelector('.banner-title').textContent = title;
    this.bannerEl.querySelector('.banner-sub').textContent = sub;
    requestAnimationFrame(() => this.bannerEl.classList.add('show'));
    this._timers.banner = window.setTimeout(() => this.hideBanner(), duration);
  }

  hideBanner() {
    window.clearTimeout(this._timers.banner);
    this.bannerEl.classList.remove('show');
    window.setTimeout(() => this.bannerEl.classList.add('hidden'), 600);
  }

  subtitle(text, duration = 5200) {
    window.clearTimeout(this._timers.subtitle);
    if (!text || !this.subtitlesEnabled) {
      this.subtitleEl.classList.remove('show');
      return;
    }
    this.subtitleEl.innerHTML = text;
    this.subtitleEl.classList.add('show');
    this._timers.subtitle = window.setTimeout(() => this.subtitleEl.classList.remove('show'), duration);
  }

  hint(text, duration = 9000) {
    window.clearTimeout(this._timers.hint);
    if (!text) {
      this.hintEl.classList.remove('show');
      return;
    }
    this.hintEl.innerHTML = text;
    this.hintEl.classList.add('show');
    if (duration > 0) this._timers.hint = window.setTimeout(() => this.hintEl.classList.remove('show'), duration);
  }

  showBoss({ name, sub = 'STRIKE THE MALICE EYES', phase = 'PHASE I' }) {
    this.bossHud.classList.remove('hidden');
    this.bossName.textContent = name;
    this.bossSub.textContent = sub;
    this.bossPhase.textContent = phase;
    this.bossFill.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => this.bossHud.classList.add('show'));
  }

  setBossHealth(ratio) {
    this.bossFill.style.transform = `scaleX(${clamp(ratio, 0, 1)})`;
  }

  setBossMeta({ phase, sub }) {
    if (phase) this.bossPhase.textContent = phase;
    if (sub) this.bossSub.textContent = sub;
  }

  hideBoss() {
    this.bossHud.classList.remove('show');
    window.setTimeout(() => this.bossHud.classList.add('hidden'), 600);
  }

  showScreen(html, { dim = false } = {}) {
    this.screenEl.innerHTML = html;
    this.screenEl.classList.toggle('dim', dim);
    this.screenEl.classList.remove('hidden');
    this.screenEl.style.animation = 'none';
    void this.screenEl.offsetWidth;
    this.screenEl.style.animation = '';
    this._screenVisible = true;
  }

  hideScreen() {
    this.screenEl.classList.add('hidden');
    this.screenEl.classList.remove('dim');
    this.screenEl.innerHTML = '';
    this._screenVisible = false;
  }

  get screenVisible() {
    return this._screenVisible;
  }

  flash(kind = 'fire') {
    this.flashEl.classList.remove(kind);
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add(kind);
    window.setTimeout(() => this.flashEl.classList.remove(kind), 320);
  }

  damage() {
    this.damageEl.classList.remove('hit');
    void this.damageEl.offsetWidth;
    this.damageEl.classList.add('hit');
    window.setTimeout(() => this.damageEl.classList.remove('hit'), 600);
  }

  destroy() {
    for (const t of Object.values(this._timers)) window.clearTimeout(t);
    this.clearLocks();
  }
}

