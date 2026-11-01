import * as THREE from 'three';
import { createEnemyModel } from './models.js';
import { glowSprite, lineMaterial } from './util.js';

// Enemies arrive, then hold station in front of the hero for a few seconds.
// That dwell is the Rez heart of the combat: enough time to read a silhouette,
// sweep the reticle across it, and answer with a full lock-on volley.
// When their time is up they swoop past harmlessly; only enemy fire hurts.
export const ENEMY_TYPES = {
  keese: {
    label: 'Keese',
    hp: 1,
    score: 100,
    rupees: 1,
    radius: 1.35,
    scale: 1.28,
    approachSpeed: 32,
    station: 31,
    dwell: [4.2, 5.6],
    wobble: 3.2,
    wobbleSpeed: 2.1,
    heightWobble: 1.1,
    targets: true,
  },
  octorok: {
    label: 'Octorok',
    hp: 2,
    score: 160,
    rupees: 2,
    radius: 1.7,
    scale: 1.5,
    approachSpeed: 27,
    station: 42,
    dwell: [5.4, 6.8],
    wobble: 1.6,
    wobbleSpeed: 0.8,
    heightWobble: 0.5,
    fireRate: [1.8, 2.6],
    maxShots: 1,
    targets: true,
  },
  baba: {
    label: 'Deku Baba',
    hp: 3,
    score: 190,
    rupees: 2,
    radius: 1.8,
    scale: 1.35,
    approachSpeed: 30,
    station: 27,
    dwell: [4.2, 5.4],
    wobble: 1.1,
    wobbleSpeed: 0.65,
    heightWobble: 0.35,
    targets: true,
  },
  stalfos: {
    label: 'Stalfos',
    hp: 3,
    score: 220,
    rupees: 3,
    radius: 1.75,
    scale: 1.28,
    approachSpeed: 28,
    station: 31,
    dwell: [4.5, 5.8],
    wobble: 1.3,
    wobbleSpeed: 0.55,
    heightWobble: 0.25,
    targets: true,
  },
  beamos: {
    label: 'Beamos',
    hp: 4,
    score: 260,
    rupees: 3,
    radius: 2.0,
    scale: 1.35,
    approachSpeed: 24,
    station: 46,
    dwell: [5.8, 7.2],
    wobble: 0.6,
    wobbleSpeed: 0.4,
    heightWobble: 0.15,
    fireRate: [2.0, 3.0],
    maxShots: 1,
    targets: true,
  },
  wizzrobe: {
    label: 'Wizzrobe',
    hp: 2,
    score: 240,
    rupees: 3,
    radius: 1.65,
    scale: 1.3,
    approachSpeed: 26,
    station: 38,
    dwell: [5.0, 6.2],
    wobble: 1.8,
    wobbleSpeed: 0.5,
    heightWobble: 0.6,
    fireRate: [1.6, 2.4],
    maxShots: 2,
    targets: true,
  },
  armos: {
    label: 'Armos',
    hp: 5,
    score: 330,
    rupees: 4,
    radius: 2.2,
    scale: 1.45,
    approachSpeed: 18,
    station: 30,
    dwell: [5.8, 7.0],
    wobble: 0.4,
    wobbleSpeed: 0.35,
    heightWobble: 0.12,
    armor: 3,
    targets: true,
  },
  poe: {
    label: 'Poe',
    hp: 2,
    score: 270,
    rupees: 3,
    radius: 1.5,
    scale: 1.25,
    approachSpeed: 26,
    station: 36,
    dwell: [5.2, 6.4],
    wobble: 2.4,
    wobbleSpeed: 0.9,
    heightWobble: 1.2,
    fireRate: [2.0, 2.8],
    maxShots: 1,
    phaseEvery: 2.4,
    phaseDuration: 1.25,
    targets: true,
  },
  dekuScrub: {
    label: 'Deku Scrub',
    hp: 2,
    score: 190,
    rupees: 2,
    radius: 1.3,
    scale: 1.2,
    approachSpeed: 28,
    station: 31,
    dwell: [4.4, 5.5],
    wobble: 1.2,
    wobbleSpeed: 0.8,
    heightWobble: 0.4,
    fireRate: [1.2, 1.8],
    maxShots: 1,
    fires: 3,
    targets: true,
  },
  likelike: {
    label: 'Like Like',
    hp: 6,
    score: 380,
    rupees: 5,
    radius: 2.3,
    scale: 1.5,
    approachSpeed: 15,
    station: 25,
    dwell: [6.2, 7.6],
    wobble: 0.9,
    wobbleSpeed: 0.4,
    heightWobble: 0.2,
    stealsRupees: 25,
    targets: true,
  },
};

let nextEnemyId = 1;

export class Enemy {
  constructor(game, type, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    if (!cfg) throw new Error(`Unknown enemy: ${type}`);
    this.game = game;
    this.type = type;
    this.cfg = cfg;
    this.id = nextEnemyId++;
    this.key = `e${this.id}`;

    this.rel = opts.rel ?? 160;
    this.lateral = opts.lateral ?? 0;
    this.height = opts.height ?? 0;
    this.baseLateral = this.lateral;
    this.baseHeight = this.height;
    const rand = () => game.random?.() ?? Math.random();
    this.phase = opts.phase ?? rand() * Math.PI * 2;
    this.hp = cfg.hp + game.difficulty.hpBonus;
    this.maxHp = this.hp;
    this.alive = true;
    this.age = 0;
    this.spawnT = 0;
    this.hitFlash = 0;
    this.mode = 'approach'; // approach -> hover -> leave
    this.station = cfg.station * (0.9 + rand() * 0.2);
    this.dwell = cfg.dwell[0] + rand() * (cfg.dwell[1] - cfg.dwell[0]);
    this.hoverAge = 0;
    this.leaveAge = 0;
    this.leaveLateral = 0;
    this.leaveSide = rand() < 0.5 ? -1 : 1;
    this.fireTimer = Infinity;
    this.shotsFired = 0;
    this.maxShots = cfg.maxShots ?? 0;
    this.teleported = false;
    this.armor = cfg.armor ?? 0;
    this.phased = false;
    this.phaseTimer = (cfg.phaseEvery ?? 2.4) * (0.45 + rand() * 0.3);
    this.phaseGlow = null;
    this.phaseVis = null;
    this.shieldGlow = null;
    this.worldPos = new THREE.Vector3();
    this.bob = 0;
    this.lunge = 0;
    this.dead = false;
    this.scale = cfg.scale * (opts.scale ?? 1);
    this.hitRadius = cfg.radius * this.scale;

    this.group = createEnemyModel(type);
    this.group.scale.setScalar(0.001);
    this.group.userData.enemy = this;
    this.baseScale = this.scale;
    game.enemyLayer.add(this.group);

    this.parts = {
      body: this.group.getObjectByName('body'),
      wingL: this.group.getObjectByName('wingL'),
      wingR: this.group.getObjectByName('wingR'),
      jawUpper: this.group.getObjectByName('jawUpper'),
      jawLower: this.group.getObjectByName('jawLower'),
      ring1: this.group.getObjectByName('ring1'),
      ring2: this.group.getObjectByName('ring2'),
      orb: this.group.getObjectByName('orb'),
      runes: this.group.getObjectByName('runes'),
      lantern: this.group.getObjectByName('lantern'),
      tentacles: [],
    };
    for (let i = 0; i < 6; i++) {
      const t = this.group.getObjectByName(`tentacle${i}`);
      if (t) this.parts.tentacles.push(t);
    }

    // A soft flash sprite for hit feedback (materials are shared between clones).
    this.flashSprite = glowSprite(opts.hitColor ?? 0xffe9f5, 2.6, 0);
    this.flashSprite.material = this.flashSprite.material.clone();
    this.flashSprite.material.userData.shared = false;
    this.flashSprite.position.y = 0.6;
    this.group.add(this.flashSprite);

    this.spawnWarp = glowSprite(0xffffff, 4.5, 0.6);
    this.spawnWarp.material = this.spawnWarp.material.clone();
    this.spawnWarp.material.userData.shared = false;
    this.spawnWarp.position.y = 0.3;
    this.group.add(this.spawnWarp);

    // Four compact acquisition corners; no competing full-screen circles.
    const haloPts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      haloPts.push(new THREE.Vector3(x * 1.1, y * 1.5, 0), new THREE.Vector3(x * 1.5, y * 1.5, 0),
        new THREE.Vector3(x * 1.5, y * 1.5, 0), new THREE.Vector3(x * 1.5, y * 1.1, 0));
    }
    this.haloGeo = new THREE.BufferGeometry().setFromPoints(haloPts);
    this.halo = new THREE.LineSegments(this.haloGeo, lineMaterial(0xffd38c, { opacity: 0.65 }));
    this.halo.material = this.halo.material.clone();
    this.halo.material.userData.shared = false;
    this.halo.renderOrder = 2;
    this.halo.scale.setScalar(1.05);
    this.halo.visible = false;
    this.group.add(this.halo);

    if (cfg.armor) {
      this.shieldGlow = glowSprite(0xffd982, 4.6, 0.18);
      this.shieldGlow.material = this.shieldGlow.material.clone();
      this.shieldGlow.material.userData.shared = false;
      this.shieldGlow.position.y = 0.5;
      this.group.add(this.shieldGlow);
    }

    if (type === 'poe') {
      // A body double used while the Poe is intangible.
      this.phaseVis = new THREE.Group();
      const ghostGlow = glowSprite(0xb78bff, 3.2, 0.5);
      ghostGlow.material = ghostGlow.material.clone();
      ghostGlow.material.userData.shared = false;
      this.phaseVis.add(ghostGlow);
      const ringPts = [];
      for (let i = 0; i < 25; i++) {
        const a = (i / 24) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0));
      }
      this.phaseRingGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
      this.phaseRing = new THREE.LineLoop(this.phaseRingGeo, lineMaterial(0xc9a6ff, { opacity: 0.45 }));
      this.phaseVis.add(this.phaseRing);
      this.phaseVis.visible = false;
      game.enemyLayer.add(this.phaseVis);
      this.phaseGhostGlow = ghostGlow;
    }
  }

  get targetable() {
    return this.alive && !this.phased;
  }

  getTargetInfo() {
    return {
      key: this.key,
      pos: this.worldPos,
      radius: this.hitRadius,
      boss: false,
      kind: 'enemy',
      ref: this,
    };
  }

  update(dt, game) {
    if (!this.alive) return;
    this.age += dt;
    this.spawnT = Math.min(1, this.spawnT + dt * 2.6);

    const sp = this.cfg;

    // Approach, hold station, then peel past the hero. No collision damage:
    // missing a foe costs you the score and rupee, not a heart.
    if (this.mode === 'approach') {
      this.rel -= sp.approachSpeed * dt;
      if (this.rel <= this.station) {
        this.rel = this.station;
        this.mode = 'hover';
        this.hoverAge = 0;
        if (sp.fireRate) {
          this.fireTimer = 1.0 + game.random() * 1.4;
        }
      }
    } else if (this.mode === 'hover') {
      this.hoverAge += dt;
      this.rel = this.station + Math.sin(this.hoverAge * 0.9 + this.phase) * 1.3;
      if (this.hoverAge >= this.dwell) {
        this.mode = 'leave';
        this.leaveAge = 0;
        this.leaveLateral = 0;
        this.leaveSide = this.baseLateral >= 0 ? 1 : -1;
      }
    } else {
      this.leaveAge += dt;
      // A fast, clearly telegraphed pass-by.
      this.rel -= (52 + game.playerSpeed * 0.4) * dt;
      this.leaveLateral = Math.min(18, this.leaveLateral + this.leaveAge * 18 * dt);
      if (this.rel < -26 || this.leaveAge > 3.2) {
        this.remove();
        game.onEnemyLost(this);
        return;
      }
    }

    this.bob = Math.sin(this.age * 1.7 + this.phase) * 0.22;
    this.lunge = Math.max(0, this.lunge - dt * 1.6);

    // Per-creature movement.
    let lateral = this.baseLateral + this.leaveSide * this.leaveLateral;
    let height = this.baseHeight;
    if (this.type === 'keese') {
      lateral += Math.sin(this.age * sp.wobbleSpeed + this.phase) * sp.wobble;
      height += Math.sin(this.age * sp.wobbleSpeed * 1.4 + this.phase * 1.7) * sp.heightWobble;
    } else if (this.type === 'wizzrobe') {
      lateral += Math.sin(this.age * 0.7 + this.phase) * sp.wobble;
      height += Math.sin(this.age * 0.9 + this.phase) * sp.heightWobble;
    } else if (this.type === 'baba' || this.type === 'stalfos') {
      lateral += Math.sin(this.age * sp.wobbleSpeed + this.phase) * sp.wobble;
    } else {
      lateral += Math.sin(this.age * sp.wobbleSpeed + this.phase) * sp.wobble;
      height += Math.sin(this.age * sp.wobbleSpeed * 1.3) * sp.heightWobble;
    }

    // Lunge forward when near.
    if ((this.type === 'baba' || this.type === 'stalfos') && this.rel < 85) {
      height += Math.sin(this.age * 3) * 0.25;
    }

    const rail = game.rail;
    const world = rail.offsetAt(
      game.playerDistance + this.rel,
      lateral,
      2.6 + this.height + height + this.bob
    );
    this.worldPos.copy(world);
    this.group.position.copy(world);
    this.group.lookAt(game.camera.position.x, world.y, game.camera.position.z);

    // Spawn / death scale.
    const t = this.spawnT;
    const ease = t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);
    this.scale = this.baseScale * (0.2 + 0.8 * ease) * (1 + this.lunge * 0.12);
    this.group.scale.setScalar(this.scale);
    this.spawnWarp.material.opacity = Math.max(0, 0.6 * (1 - t));
    this.spawnWarp.scale.setScalar(4.5 * (1.2 - t * 0.4));

    this.halo.visible = this.mode === 'hover' && !this.phased;
    if (this.halo.visible) {
      const haloIn = Math.min(1, this.hoverAge * 2.2);
      this.halo.scale.setScalar(1.05 * (1.25 - haloIn * 0.2) * (1 + Math.sin(this.age * 3.2) * 0.025));
    }

    // Armored foes carry a visible ward until it is cracked.
    if (this.shieldGlow) {
      this.shieldGlow.visible = this.armor > 0;
      if (this.armor > 0) {
        this.shieldGlow.material.opacity = 0.12 + Math.sin(this.age * 3) * 0.04;
        this.shieldGlow.scale.setScalar(4.3 + Math.sin(this.age * 2.2) * 0.25);
      }
    }

    // Poes blink out of the material world; their floating wisp remains.
    if (this.type === 'poe') {
      if (this.mode === 'hover') {
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this.phased = !this.phased;
          this.phaseTimer = this.phased ? (sp.phaseDuration ?? 1.2) : (sp.phaseEvery ?? 2.4);
          if (this.phased) {
            game.fx?.teleport(this.worldPos);
            if (this.spawnT > 0.4) this.spawnT = 0.7;
          } else {
            game.fx?.sparkle(this.worldPos, 0xc9a6ff, 8);
          }
        }
      } else if (this.phased) {
        this.phased = false;
      }
      this.group.visible = !this.phased;
      if (this.phaseVis) {
        this.phaseVis.visible = this.phased;
        this.phaseVis.position.copy(this.worldPos);
        this.phaseVis.quaternion.copy(game.camera.quaternion);
        this.phaseGhostGlow.material.opacity = 0.35 + Math.sin(this.age * 5) * 0.12;
        this.phaseRing.rotation.z += dt * 1.2;
      }
    }

    this._animate(dt);

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.flashSprite.material.opacity = (this.hitFlash / 0.16) * 0.9;
    } else if (this.flashSprite.material.opacity !== 0) {
      this.flashSprite.material.opacity = 0;
    }

    if (this.shotsFired >= this.maxShots) {
      this.halo.rotation.z = 0;
      this.halo.material.color.setHex(0xffd38c);
      this.halo.material.opacity = 0.65;
    }

    // Ranged foes only fire while holding station, and only a small number of
    // times before they leave. Killing the caster clears its orbs in flight.
    if (
      this.mode === 'hover' &&
      !this.phased &&
      sp.fireRate &&
      this.shotsFired < this.maxShots
    ) {
      this.fireTimer -= dt;
      // A contracting red diamond announces the shot before it becomes dangerous.
      this.halo.material.color.setHex(this.fireTimer < 0.65 ? 0xff385b : 0xffd38c);
      if (this.fireTimer < 0.65) {
        this.halo.material.opacity = 1;
        this.halo.scale.setScalar(0.8 + Math.max(0, this.fireTimer));
        this.halo.rotation.z = Math.PI / 4;
      } else {
        this.halo.rotation.z = 0;
        this.halo.material.opacity = 0.65;
      }
      if (this.fireTimer <= 0) {
        this._fire(game);
        this.shotsFired += 1;
        this.fireTimer = sp.fireRate[0] + game.random() * (sp.fireRate[1] - sp.fireRate[0]);
      }
    }

    // One evasive hop for the Wizzrobe, so it is not completely static.
    if (
      this.type === 'wizzrobe' &&
      this.mode === 'hover' &&
      !this.teleported &&
      this.hoverAge > 1.9
    ) {
      this.teleported = true;
      game.spawnTeleport(this.worldPos);
      this.baseLateral = (game.random() < 0.5 ? -1 : 1) * (3 + game.random() * 7);
      this.baseHeight = -1.5 + game.random() * 6;
      this.spawnT = 0.35;
    }
  }

  _animate(dt) {
    const p = this.parts;
    const t = this.age;
    switch (this.type) {
      case 'keese': {
        const flap = Math.sin(t * 13 + this.phase) * 0.75;
        if (p.wingR) p.wingR.rotation.z = flap;
        if (p.wingL) p.wingL.rotation.z = -flap;
        if (p.body) p.body.rotation.z = Math.sin(t * 3) * 0.12;
        break;
      }
      case 'octorok': {
        for (let i = 0; i < p.tentacles.length; i++) {
          const ten = p.tentacles[i];
          ten.rotation.x = Math.sin(t * 4 + i * 0.9) * 0.35;
          ten.rotation.z = Math.cos(t * 3 + i) * 0.2;
        }
        if (p.body) p.body.rotation.z = Math.sin(t * 1.7) * 0.08;
        break;
      }
      case 'baba': {
        const open = this.rel < 80 ? 0.55 + Math.sin(t * 7) * 0.15 : 0.34 + Math.sin(t * 2.2) * 0.1;
        if (p.jawUpper) p.jawUpper.rotation.x = open * 0.55;
        if (p.jawLower) p.jawLower.rotation.x = -open * 0.6;
        break;
      }
      case 'stalfos': {
        if (p.body) {
          p.body.rotation.z = Math.sin(t * 4.5) * 0.035;
          p.body.position.y = Math.sin(t * 2.2) * 0.08;
        }
        break;
      }
      case 'beamos': {
        if (p.ring1) p.ring1.rotation.y += dt * 2.4;
        if (p.ring2) p.ring2.rotation.y -= dt * 1.6;
        break;
      }
      case 'wizzrobe': {
        if (p.runes) p.runes.rotation.y += dt * 0.9;
        if (p.orb) {
          const s = 0.9 + Math.sin(t * 4) * 0.18;
          p.orb.scale.setScalar(s);
        }
        break;
      }
      case 'armos': {
        if (p.body) {
          p.body.rotation.y = Math.sin(t * 0.4) * 0.12;
          p.body.position.y = Math.sin(t * 1.1) * 0.03;
        }
        break;
      }
      case 'poe': {
        if (p.body) {
          p.body.rotation.z = Math.sin(t * 1.2) * 0.05;
          p.body.position.y = Math.sin(t * 1.6 + this.phase) * 0.08;
        }
        if (p.lantern) {
          p.lantern.rotation.z = Math.sin(t * 1.7) * 0.12;
          p.lantern.scale.setScalar(0.92 + Math.sin(t * 4) * 0.08);
        }
        break;
      }
      case 'dekuScrub': {
        if (p.body) p.body.rotation.z = Math.sin(t * 2.4) * 0.035;
        if (p.jawUpper) p.jawUpper.rotation.x = Math.sin(t * 5) * 0.1;
        break;
      }
      case 'likelike': {
        if (p.body) {
          p.body.rotation.y = Math.sin(t * 0.7) * 0.15;
          p.body.scale.setScalar(1 + Math.sin(t * 2.2) * 0.025);
        }
        break;
      }
      default:
        break;
    }
  }

  _fire(game) {
    const cfg = this.cfg;
    const count = cfg.fires || 1;
    const origin = this.worldPos.clone();
    origin.y += 0.5;
    for (let i = 0; i < count; i++) {
      const delay = i * 0.22;
      game.spawnEnemyProjectile(this, {
        origin,
        delay,
        speed: this.type === 'beamos' ? 34 : 28,
        color:
          this.type === 'dekuScrub'
            ? 0x9dffb0
            : this.type === 'poe'
              ? 0xb78bff
              : this.type === 'wizzrobe'
                ? 0x9d7bff
                : 0xff4f9d,
        spread: i === 0 ? 0 : 0.9,
      });
    }
  }

  takeDamage(amount, game) {
    if (!this.alive || this.phased) return false;
    if (this.armor > 0) {
      this.armor -= amount;
      this.hitFlash = 0.16;
      this.flashSprite.material.opacity = 0.95;
      game.fx?.impact(this.worldPos, 0xffdf8a, { scale: 0.6 });
      game.audio?.wardClang?.();
      if (this.armor <= 0) {
        this.shieldGlow.visible = false;
        game.fx?.explode(this.worldPos, 0xffd982, { count: 20, scale: 0.8 });
        game.hud?.popup?.('ARMOR BROKEN', window.innerWidth * 0.5, window.innerHeight * 0.45, 'harmony');
      }
      return false;
    }
    this.hp -= amount;
    this.hitFlash = 0.16;
    this.flashSprite.material.opacity = 0.95;
    if (this.hp <= 0) {
      this.die(game);
      return true;
    }
    return false;
  }

  die(game) {
    if (!this.alive) return;
    this.alive = false;
    this.dead = true;
    game.onEnemyKilled(this);
    this.remove();
  }

  remove() {
    this.alive = false;
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.phaseVis) {
      if (this.phaseVis.parent) this.phaseVis.parent.remove(this.phaseVis);
      this.phaseGhostGlow?.material?.dispose?.();
      this.phaseRingGeo?.dispose?.();
    }
    this.flashSprite?.material?.dispose?.();
    this.spawnWarp?.material?.dispose?.();
    this.shieldGlow?.material?.dispose?.();
    this.haloGeo?.dispose?.();
  }

  dispose() {
    this.remove();
  }
}

/** Weighted enemy picker from a stage's bestiary. */
export function pickEnemyType(weights, rng = Math.random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [type, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return entries[0][0];
}

/** Build a formation of slots for a wave. */
export function makeFormation(kind, count, rng, stageIndex = 0) {
  const slots = [];
  const spread = 12 + stageIndex * 1.2;
  switch (kind) {
    case 'line':
      for (let i = 0; i < count; i++) {
        const n = count === 1 ? 0 : i / (count - 1) - 0.5;
        slots.push({
          lateral: n * spread * 2,
          height: (rng() - 0.5) * 3,
          rel: 150 + rng() * 38,
        });
      }
      break;
    case 'vee':
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const rank = Math.floor(i / 2);
        slots.push({
          lateral: side * (2.5 + rank * 4.4),
          height: -1 + rank * 1.6 + (rng() - 0.5) * 1.4,
          rel: 148 + rank * 17 + rng() * 14,
        });
      }
      break;
    case 'sides':
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        slots.push({
          lateral: side * (7 + Math.floor(i / 2) * 3.2 + rng() * 2),
          height: (rng() - 0.35) * 5,
          rel: 148 + rng() * 42,
        });
      }
      break;
    case 'stream':
      for (let i = 0; i < count; i++) {
        slots.push({
          lateral: (rng() - 0.5) * 14,
          height: (rng() - 0.4) * 6,
          rel: 190 + i * 22 + rng() * 12,
        });
      }
      break;
    case 'arc':
    default:
      for (let i = 0; i < count; i++) {
        const a = (i / Math.max(1, count - 1) - 0.5) * Math.PI * 0.95;
        slots.push({
          lateral: Math.sin(a) * spread,
          height: Math.cos(a) * 3.6 - 1.2,
          rel: 158 + Math.cos(a) * 12 + rng() * 10,
        });
      }
      break;
  }
  return slots;
}
