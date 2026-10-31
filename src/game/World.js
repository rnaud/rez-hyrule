import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { damp, getDotTexture } from './util.js';

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020709);
    this.scene.fog = new THREE.Fog(0x03110c, 55, 250);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);
    this.camera.position.set(0, 6, 8);

    this.skyUniforms = {
      uHorizon: { value: new THREE.Color(0x0b2a1f) },
      uZenith: { value: new THREE.Color(0x020a08) },
      uGlow: { value: new THREE.Color(0x1b8f6a) },
      uTime: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uHorizon;
        uniform vec3 uZenith;
        uniform vec3 uGlow;
        uniform float uTime;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          float horizon = smoothstep(0.36, 0.56, h);
          vec3 col = mix(uHorizon, uZenith, smoothstep(0.46, 0.95, h));
          col = mix(uHorizon * 0.7, col, horizon);
          float band = exp(-pow((h - 0.485) * 24.0, 2.0));
          col += uGlow * band * 0.55;
          float a = sin(vDir.x * 3.2 + uTime * 0.035) * cos(vDir.z * 2.4 - uTime * 0.026);
          float arc = smoothstep(0.58, 0.95, h) * (a * 0.5 + 0.5);
          col += uGlow * arc * 0.045;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this._makeCelestial();

    this.playerLayer = new THREE.Group();
    this.playerLayer.name = 'playerLayer';
    this.enemyLayer = new THREE.Group();
    this.enemyLayer.name = 'enemyLayer';
    this.projectileLayer = new THREE.Group();
    this.projectileLayer.name = 'projectileLayer';
    this.beamLayer = new THREE.Group();
    this.beamLayer.name = 'beamLayer';
    this.bossLayer = new THREE.Group();
    this.bossLayer.name = 'bossLayer';
    this.bossFxLayer = new THREE.Group();
    this.bossFxLayer.name = 'bossFxLayer';
    this.environmentLayer = new THREE.Group();
    this.environmentLayer.name = 'environmentLayer';
    for (const layer of [
      this.environmentLayer,
      this.enemyLayer,
      this.bossLayer,
      this.playerLayer,
      this.projectileLayer,
      this.bossFxLayer,
      this.beamLayer,
    ]) {
      this.scene.add(layer);
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.38, 0.72);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.outputPass);

    this.camPos = new THREE.Vector3(0, 6, 8);
    this.camLook = new THREE.Vector3(0, 3, -20);
    this.smoothLook = this.camLook.clone();
    this.roll = 0;
    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeAmount = 0;
    this.fovPunch = 0;
    this.baseFov = 62;
    this.initialized = false;
    const mkFrame = () => ({
      pos: new THREE.Vector3(),
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
    });
    this._camFrame = mkFrame();
    this._lookFrame = mkFrame();
    this.time = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  _celestialLine(points, color, opacity, closed = false) {
    const segs = [];
    for (let i = 0; i < points.length - 1; i++) segs.push(points[i], points[i + 1]);
    if (closed && points.length > 1) segs.push(points[points.length - 1], points[0]);
    const geo = new THREE.BufferGeometry().setFromPoints(segs);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const line = new THREE.LineSegments(geo, mat);
    line.renderOrder = -2;
    this.celestial.add(line);
    return line;
  }

  _makeCelestial() {
    this.celestial = new THREE.Group();
    this.celestial.name = 'celestial';
    this.scene.add(this.celestial);
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.celestialMats = [];

    // A distant, quiet moon.
    const moonCenter = V(-105, 105, -340);
    const moonR = 25;
    const ringPts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      ringPts.push(V(moonCenter.x + Math.cos(a) * moonR, moonCenter.y + Math.sin(a) * moonR, moonCenter.z));
    }
    this.moonLine = this._celestialLine(ringPts, 0xffe6b0, 0.5, true);
    const craterPts = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2;
      const cx = moonCenter.x + Math.cos(a) * 9;
      const cy = moonCenter.y + Math.sin(a) * 7;
      const r = 4 + i * 1.5;
      for (let k = 0; k < 18; k++) {
        const aa = (k / 18) * Math.PI * 2;
        craterPts.push(V(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r * 0.7, moonCenter.z));
      }
    }
    this._celestialLine(craterPts, 0xffe6b0, 0.12);

    const moonGlowMat = new THREE.SpriteMaterial({
      map: getDotTexture(),
      color: 0xffe2a0,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.celestialMats.push(moonGlowMat);
    const moonGlow = new THREE.Sprite(moonGlowMat);
    moonGlow.position.copy(moonCenter);
    moonGlow.scale.setScalar(120);
    moonGlow.renderOrder = -3;
    this.celestial.add(moonGlow);

    // A triforce in the vault of the sky.
    const tCenter = V(128, 118, -380);
    const s = 18;
    this.triforceLines = [];
    const tri = (cx, cy, size, flip = false) => {
      const pts = flip
        ? [
            V(tCenter.x + cx, tCenter.y + cy - size * 0.55, tCenter.z),
            V(tCenter.x + cx - size * 0.9, tCenter.y + cy + size * 0.5, tCenter.z),
            V(tCenter.x + cx + size * 0.9, tCenter.y + cy + size * 0.5, tCenter.z),
          ]
        : [
            V(tCenter.x + cx, tCenter.y + cy + size * 0.55, tCenter.z),
            V(tCenter.x + cx - size * 0.9, tCenter.y + cy - size * 0.5, tCenter.z),
            V(tCenter.x + cx + size * 0.9, tCenter.y + cy - size * 0.5, tCenter.z),
          ];
      this.triforceLines.push(this._celestialLine(pts, 0xf6d783, 0.4, true));
    };
    tri(0, s * 0.8, s * 0.55);
    tri(-s * 0.46, -s * 0.05, s * 0.55);
    tri(s * 0.46, -s * 0.05, s * 0.55);
    const orbitPts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      orbitPts.push(V(tCenter.x + Math.cos(a) * 54, tCenter.y + Math.sin(a) * 54, tCenter.z));
    }
    this._celestialLine(orbitPts, 0x8fe8c0, 0.09, true);

    this.celestial.traverse((c) => {
      if (c.material && !c.material.userData) c.material.userData = {};
      if (c.material) c.material.userData.shared = true;
      c.frustumCulled = false;
    });
  }

  setStage(stage) {
    const p = stage.palette;
    this.scene.background = new THREE.Color(p.bg);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.skyUniforms.uHorizon.value.set(p.fog).multiplyScalar(0.75);
    this.skyUniforms.uZenith.value.set(p.bg);
    this.skyUniforms.uGlow.value.set(p.primary).multiplyScalar(0.055);
    const moonTint = stage.id === 'woods' ? p.cyan : stage.id === 'mountain' ? p.primary : p.accent;
    this.moonLine.material.color.set(moonTint);
    this.triforceLines.forEach((line, i) => line.material.color.set(i === 1 ? p.primary : p.accent));
    this.celestialMats[0].color.set(moonTint);
    this.bloom.strength = stage.id === 'castle' ? 0.95 : stage.id === 'woods' ? 0.72 : 0.8;
    this.bloom.radius = 0.4;
    this.bloom.threshold = 0.72;
    this.initialized = false;
    this.smoothLook.set(0, 3, -20);
    this.roll = 0;
    this.fovPunch = 0;
  }

  shake(amount = 0.3, duration = 0.35) {
    if (amount >= this.shakeAmount || this.shakeTime <= 0) {
      this.shakeAmount = amount;
      this.shakeDuration = duration;
      this.shakeTime = duration;
    } else {
      this.shakeAmount = Math.max(this.shakeAmount, amount * 0.6);
    }
  }

  punchFov(amount = 2) {
    this.fovPunch = Math.min(7, this.fovPunch + amount);
  }

  /**
   * Chase camera: a little behind and above the hero, looking down the rail.
   */
  updateCamera(dt, rail, distance, player, options = {}) {
    this.time += dt;
    const { reticleX = 0, reticleY = 0, boss = false, mode = 'play' } = options;
    const ahead = 30;
    const behind = 9.0;
    const height = 3.35;

    const f = rail.frameAt(distance, this._camFrame);
    const lookF = rail.frameAt(Math.min(distance + ahead, rail.length - 1), this._lookFrame);
    const lateral = player ? player.lateral : 0;

    const desiredPos = f.pos
      .clone()
      .addScaledVector(f.right, lateral * 0.68 + reticleX * 0.55)
      .addScaledVector(f.up, 2.65 + height)
      .addScaledVector(f.fwd, -behind);

    const desiredLook = lookF.pos
      .clone()
      .addScaledVector(lookF.right, lateral * 0.9 + reticleX * 1.6)
      .addScaledVector(lookF.up, 3.2 - reticleY * 0.8)
      .addScaledVector(lookF.fwd, 4);

    if (!this.initialized) {
      this.camPos.copy(desiredPos);
      this.smoothLook.copy(desiredLook);
      this.initialized = true;
    } else {
      const posLambda = boss ? 14 : 22;
      this.camPos.x = damp(this.camPos.x, desiredPos.x, posLambda, dt);
      this.camPos.y = damp(this.camPos.y, desiredPos.y, posLambda, dt);
      this.camPos.z = damp(this.camPos.z, desiredPos.z, posLambda, dt);
      this.smoothLook.x = damp(this.smoothLook.x, desiredLook.x, 16, dt);
      this.smoothLook.y = damp(this.smoothLook.y, desiredLook.y, 16, dt);
      this.smoothLook.z = damp(this.smoothLook.z, desiredLook.z, 16, dt);
    }

    // bank with the curve, then with the reticle
    let targetRoll = -reticleX * 0.035;
    if (mode !== 'title') targetRoll += rail.bankAt(distance, 0.7);
    this.roll = damp(this.roll, targetRoll, 3.2, dt);

    this.sky.position.copy(this.camPos);
    this.skyUniforms.uTime.value = this.time;
    this.celestial.position.copy(this.camPos);
    this.celestial.quaternion.copy(this.camera.quaternion);
    this.camera.position.copy(this.camPos);
    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const k = (this.shakeTime / Math.max(0.001, this.shakeDuration)) * this.shakeAmount;
      this.camera.position.x += (Math.random() - 0.5) * k * 2.4;
      this.camera.position.y += (Math.random() - 0.5) * k * 2.2;
      this.camera.position.z += (Math.random() - 0.5) * k * 1.2;
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.smoothLook);
    this.camera.rotateZ(this.roll);
    if (this.celestial) {
      this.celestial.position.copy(this.camera.position);
      this.celestial.quaternion.copy(this.camera.quaternion);
    }

    // subtle breathing and speed bob
    if (mode === 'play' && player) {
      this.camera.position.y += Math.sin(this.time * 1.6) * 0.035;
      this.camera.rotateX(Math.sin(this.time * 1.1) * 0.0015);
    }

    const portraitBoost = this.camera.aspect < 0.9 ? (0.9 - this.camera.aspect) * 34 : 0;
    const fovTarget = this.baseFov + portraitBoost + (boss ? -2.2 : 0) + this.fovPunch + Math.abs(reticleY) * 0.8;
    this.camera.fov = damp(this.camera.fov, fovTarget, 4, dt);
    this.camera.updateProjectionMatrix();
    this.fovPunch = Math.max(0, this.fovPunch - dt * 18);
  }

  render() {
    this.composer.render();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.bloom.resolution.set(w, h);
    if (this.onResize) this.onResize(pr);
  }

  dispose() {
    this.composer.dispose?.();
    this.renderer.dispose();
  }
}
