import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

/** Frame-rate independent exponential smoothing. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Shortest signed angle difference. */
export const angleDelta = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

export const dampAngle = (current, target, lambda, dt) =>
  current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));

export const pad = (n, width = 7) => String(Math.max(0, Math.floor(n))).padStart(width, '0');

export const roman = (n) =>
  ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function prettyDate(dateKey) {
  if (!dateKey) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[m - 1]} ${String(d).padStart(2, '0')} · ${y}`;
}

export const formatTime = (seconds) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(seed) {
  const rng = mulberry32(seed);
  return {
    next: rng,
    range: (a, b) => a + (b - a) * rng(),
    int: (a, b) => Math.floor(a + (b - a + 1) * rng()),
    pick: (arr) => arr[Math.floor(rng() * arr.length)],
    sign: () => (rng() < 0.5 ? -1 : 1),
    chance: (p) => rng() < p,
  };
}

const colorCache = new Map();
/** Parse a color once; intensities above 1 are allowed for additive glow. */
export function col(value, intensity = 1) {
  const key = `${value}|${intensity}`;
  let c = colorCache.get(key);
  if (!c) {
    c = new THREE.Color(value);
    if (intensity !== 1) c.multiplyScalar(intensity);
    colorCache.set(key, c);
  }
  return c;
}

const lineMaterialCache = new Map();
export function lineMaterial(color, { opacity = 1, vertexColors = false, blending = THREE.AdditiveBlending } = {}) {
  const key = `${color}|${opacity}|${vertexColors}|${blending}`;
  let mat = lineMaterialCache.get(key);
  if (!mat) {
    mat = new THREE.LineBasicMaterial({
      color: vertexColors ? 0xffffff : color,
      vertexColors,
      transparent: opacity < 1 || vertexColors,
      opacity,
      blending,
      depthWrite: false,
      fog: true,
    });
    mat.userData.shared = true;
    lineMaterialCache.set(key, mat);
  }
  return mat;
}

const edgeCache = new WeakMap();
export function edgesOf(geometry, threshold = 1) {
  let map = edgeCache.get(geometry);
  if (!map) {
    map = new Map();
    edgeCache.set(geometry, map);
  }
  if (!map.has(threshold)) {
    const edges = new THREE.EdgesGeometry(geometry, threshold);
    edges.userData.shared = true;
    map.set(threshold, edges);
  }
  return map.get(threshold);
}

/* ------------------------------------------------------------------ */
/* Batched line construction — all static stage geometry ends up in a  */
/* handful of draw calls.                                              */
/* ------------------------------------------------------------------ */

export class LineBatch {
  constructor() {
    this.positions = [];
    this.colors = [];
    this._v = new THREE.Vector3();
  }

  seg(a, b, color, intensity = 1) {
    if (!Number.isFinite(a.x + a.y + a.z + b.x + b.y + b.z)) return this;
    const c = col(color, intensity);
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    this.colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    return this;
  }

  points(pts, color, intensity = 1, closed = false) {
    for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1], color, intensity);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], color, intensity);
    return this;
  }

  /** Transform the edge geometry of a primitive into the batch. */
  wire(geometry, matrix, color, intensity = 1, threshold = 1) {
    const edges = edgesOf(geometry, threshold);
    const pos = edges.getAttribute('position');
    const v = this._v;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      if (!Number.isFinite(v.x + v.y + v.z)) continue;
      const c = col(color, intensity);
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(c.r, c.g, c.b);
    }
    return this;
  }

  box(size, position, color, intensity = 1, rotation = null) {
    const geo = getUnitBox();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rotation) q.setFromEuler(new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0));
    m.compose(position, q, new THREE.Vector3(size.x, size.y, size.z));
    return this.wire(geo, m, color, intensity);
  }

  polyhedron(geometry, position, scale, color, intensity = 1, rotation = null, threshold = 1) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    if (rotation) q.setFromEuler(new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0));
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
    m.compose(position, q, s);
    return this.wire(geometry, m, color, intensity, threshold);
  }

  /** A circle in the plane spanned by u and v. */
  circle(center, radius, u, v, color, intensity = 1, segments = 32) {
    const uu = u || new THREE.Vector3(1, 0, 0);
    const vv = v || new THREE.Vector3(0, 1, 0);
    let prev = null;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      const p = new THREE.Vector3()
        .copy(center)
        .addScaledVector(uu, Math.cos(a) * radius)
        .addScaledVector(vv, Math.sin(a) * radius);
      if (prev) this.seg(prev, p, color, intensity);
      prev = p;
    }
    return this;
  }

  build(opacity = 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.computeBoundingSphere();
    const mat = lineMaterial(0xffffff, { opacity, vertexColors: true });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = true;
    lines.renderOrder = 1;
    return lines;
  }
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const getUnitBox = () => unitBox;

/* Shared primitive geometries used to build props and creatures. */
export const PRIM = {
  box: unitBox,
  sphere: new THREE.IcosahedronGeometry(1, 1),
  sphereHi: new THREE.IcosahedronGeometry(1, 2),
  tetra: new THREE.TetrahedronGeometry(1),
  octa: new THREE.OctahedronGeometry(1),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone5: new THREE.ConeGeometry(1, 1, 5),
  cone6: new THREE.ConeGeometry(1, 1, 6),
  cylinder5: new THREE.CylinderGeometry(1, 1, 1, 5),
  cylinder6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cylinder8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cylinder12: new THREE.CylinderGeometry(1, 1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.08, 4, 24),
  ring: new THREE.RingGeometry(0.82, 1, 6),
};

/* ------------------------------------------------------------------ */
/* Glow textures & sprites                                             */
/* ------------------------------------------------------------------ */

let dotTexture = null;
export function getDotTexture() {
  if (dotTexture) return dotTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dotTexture = new THREE.CanvasTexture(canvas);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

let triangleTexture = null;
export function getTriangleTexture() {
  if (triangleTexture) return triangleTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(64, 20);
  ctx.lineTo(110, 100);
  ctx.lineTo(18, 100);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.stroke();
  triangleTexture = new THREE.CanvasTexture(canvas);
  triangleTexture.colorSpace = THREE.SRGBColorSpace;
  return triangleTexture;
}

const spriteMaterials = new Map();
export function glowSpriteMaterial(color, opacity = 0.85) {
  const key = `${color}|${opacity}`;
  let mat = spriteMaterials.get(key);
  if (!mat) {
    mat = new THREE.SpriteMaterial({
      map: getDotTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    mat.userData.shared = true;
    spriteMaterials.set(key, mat);
  }
  return mat;
}

export function glowSprite(color, scale = 1, opacity = 0.85) {
  const s = new THREE.Sprite(glowSpriteMaterial(color, opacity));
  s.scale.setScalar(scale);
  return s;
}

/** Build a LineSegments object from the edges of a primitive. */
export function makeWire(geometry, color, { opacity = 1, threshold = 1, scale = 1, position = null } = {}) {
  const lines = new THREE.LineSegments(
    edgesOf(geometry, threshold),
    lineMaterial(color, { opacity, vertexColors: false })
  );
  lines.scale.setScalar(scale);
  if (position) lines.position.copy(position);
  return lines;
}

/** Build a LineSegments object from an arbitrary list of points (segments). */
export function makeLines(points, color, { opacity = 1, closed = false } = {}) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    segs.push(points[i], points[i + 1]);
  }
  if (closed && points.length > 2) segs.push(points[points.length - 1], points[0]);
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  return new THREE.LineSegments(geo, lineMaterial(color, { opacity }));
}

export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose?.();
    const mat = child.material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m?.userData?.shared || m.dispose?.());
      else if (!mat.userData?.shared) mat.dispose?.();
    }
  });
  obj.parent?.remove(obj);
}

/** Triangle outline points for the Triforce made of 3 triangles. */
export function triforceSegments(size = 1, center = new THREE.Vector3(0, 0, 0)) {
  const h = size * 0.866;
  const out = [];
  const tri = (cx, cy, s, flipped = false) => {
    const a = new THREE.Vector3(cx, cy + (flipped ? -s * 0.5 : s * 0.5), 0).add(center);
    const b = new THREE.Vector3(cx - s * 0.866, cy + (flipped ? s * 0.5 : -s * 0.5), 0).add(center);
    const c = new THREE.Vector3(cx + s * 0.866, cy + (flipped ? s * 0.5 : -s * 0.5), 0).add(center);
    out.push(a, b, b, c, c, a);
  };
  tri(0, h * 0.28, size * 0.5);
  tri(-size * 0.5, -h * 0.18, size * 0.5);
  tri(size * 0.5, -h * 0.18, size * 0.5);
  return out;
}

/** Recursively mark shared materials/geometries so disposeObject leaves them alone. */
export function markShared(object, shared = true) {
  object.traverse((c) => {
    if (c.geometry) c.geometry.userData.shared = shared;
    if (c.material) c.material.userData.shared = shared;
  });
  return object;
}

for (const geo of Object.values(PRIM)) geo.userData.shared = true;
unitBox.userData.shared = true;
