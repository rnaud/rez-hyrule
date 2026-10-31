import * as THREE from 'three';
import {
  LineBatch,
  PRIM,
  seeded,
  getDotTexture,
  lineMaterial,
  clamp,
} from './util.js';

/* ------------------------------------------------------------------ */
/* little geometry helpers                                            */
/* ------------------------------------------------------------------ */

const _basis = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();

function at(frame, lateral, height, forward = 0) {
  return new THREE.Vector3()
    .copy(frame.pos)
    .addScaledVector(frame.right, lateral)
    .addScaledVector(frame.up, height)
    .addScaledVector(frame.fwd, forward);
}

function frameQuat(frame) {
  _basis.makeBasis(frame.right, frame.up, frame.fwd);
  return _quat.setFromRotationMatrix(_basis).clone();
}

function wireAt(batch, geometry, frame, lateral, height, scale, color, intensity = 1, opts = {}) {
  const p = at(frame, lateral, height);
  const q = frameQuat(frame);
  if (opts.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.spin));
  if (opts.tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.tilt[0], opts.tilt[1], opts.tilt[2])));
  const s = typeof scale === 'number' ? _scale.set(scale, scale, scale) : _scale.set(scale[0], scale[1], scale[2]);
  const m = new THREE.Matrix4().compose(p, q, s);
  batch.wire(geometry, m, color, intensity);
}

function polyWorld(batch, pts, color, intensity = 1, closed = false) {
  batch.points(pts, color, intensity, closed);
}

function circlePoints(center, radius, right, up, segments = 24) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(
      new THREE.Vector3()
        .copy(center)
        .addScaledVector(right, Math.cos(a) * radius)
        .addScaledVector(up, Math.sin(a) * radius)
    );
  }
  return pts;
}

function arcPoints(center, radius, right, up, start, end, segments = 18) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + (end - start) * (i / segments);
    pts.push(
      new THREE.Vector3()
        .copy(center)
        .addScaledVector(right, Math.cos(a) * radius)
        .addScaledVector(up, Math.sin(a) * radius)
    );
  }
  return pts;
}

function lineBetween(batch, a, b, color, intensity) {
  batch.seg(a, b, color, intensity);
}

function dashedLine(batch, a, b, color, intensity, dashes = 5) {
  const dir = new THREE.Vector3().subVectors(b, a);
  for (let i = 0; i < dashes; i++) {
    const t0 = i / dashes;
    const t1 = t0 + 0.55 / dashes;
    batch.seg(
      a.clone().addScaledVector(dir, t0),
      a.clone().addScaledVector(dir, t1),
      color,
      intensity
    );
  }
}

function buildPoints(positions, color, size, opacity = 0.8, map = getDotTexture(), fog = true) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    map,
    transparent: true,
    opacity,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    fog,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/* ------------------------------------------------------------------ */
/* shared architecture                                                */
/* ------------------------------------------------------------------ */

function addGround(batch, rail, opts) {
  const {
    width = 40,
    step = 13,
    lats = [0.5, 0.25],
    color,
    intensity = 0.35,
    edgeColor,
    edgeIntensity = 0.9,
    sag = 1.6,
    pathHalf = 3.5,
    endPadding = 120,
  } = opts;
  const start = -15;
  const end = rail.length + endPadding;
  const crossSegments = 10;

  for (let d = start; d < end; d += step) {
    const f = rail.frameAt(d);
    const pts = [];
    for (let i = 0; i <= crossSegments; i++) {
      const lat = (i / crossSegments - 0.5) * width * 2;
      const drop = Math.pow(Math.abs(lat) / (width || 1), 2) * sag;
      pts.push(at(f, lat, -drop));
    }
    polyWorld(batch, pts, color, intensity);
  }

  for (const frac of lats) {
    for (const side of [-1, 1]) {
      const lateral = frac * width * side;
      let prev = null;
      for (let d = start; d < end; d += step * 1.4) {
        const f = rail.frameAt(d);
        const drop = Math.pow(Math.abs(lateral) / (width || 1), 2) * sag;
        const p = at(f, lateral, -drop);
        if (prev) batch.seg(prev, p, color, intensity * 0.9);
        prev = p;
      }
    }
  }

  // Bright path edges, broken into soft segments.
  for (const side of [-1, 1]) {
    let prev = null;
    for (let d = start; d < end; d += 7) {
      const dashed = Math.floor(d / 7) % 3 === 0;
      const f = rail.frameAt(d);
      const p = at(f, side * pathHalf, 0.04);
      if (prev && !dashed) batch.seg(prev, p, edgeColor, edgeIntensity);
      prev = p;
    }
  }
}

function addBraid(batch, rail, opts) {
  // Weaving luminous ribbons alongside the rail.
  const { side = 1, lateral = 6, color, intensity = 0.4, step = 16 } = opts;
  for (let phase = 0; phase < 2; phase++) {
    let prev = null;
    for (let d = 0; d < rail.length + 80; d += step) {
      const f = rail.frameAt(d);
      const wobble = Math.sin(d * 0.04 + phase * Math.PI + side) * 1.4;
      const p = at(f, side * (lateral + wobble + phase * 0.8), 0.1 + Math.sin(d * 0.03 + phase) * 0.25);
      if (prev) batch.seg(prev, p, color, intensity);
      prev = p;
    }
  }
}

function addTuft(batch, frame, lateral, color, rng, intensity = 0.5) {
  const base = at(frame, lateral, 0);
  const count = 2 + Math.floor(rng.next() * 3);
  for (let i = 0; i < count; i++) {
    const tip = base
      .clone()
      .addScaledVector(frame.up, 0.5 + rng.next() * 1.6)
      .addScaledVector(frame.right, (rng.next() - 0.5) * 1.5)
      .addScaledVector(frame.fwd, (rng.next() - 0.5) * 0.7);
    batch.seg(base, tip, color, intensity * (0.5 + rng.next() * 0.7));
  }
}

function addTree(batch, frame, rng, opts) {
  const {
    lateral,
    scale = 1,
    trunkColor,
    leafColor,
    accentColor,
    height = 9,
    spread = 1,
    glow = false,
    style = 'oak',
  } = opts;
  const base = at(frame, lateral, 0);
  const h = height * scale;
  const lean = (rng.next() - 0.5) * 2.6 * scale;
  const leanFwd = (rng.next() - 0.5) * 2 * scale;
  const top = base
    .clone()
    .addScaledVector(frame.up, h)
    .addScaledVector(frame.right, lean)
    .addScaledVector(frame.fwd, leanFwd);

  // Trunk: a faceted column with cross-ties so it reads as a solid silhouette.
  const trunkPts = [];
  const seg = 6;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = base.clone().lerp(top, t);
    p.addScaledVector(frame.right, Math.sin(t * 3.4 + rng.next() * 0.2) * 0.18 * scale);
    trunkPts.push(p);
  }
  for (let side = -1; side <= 1; side += 2) {
    const rail = trunkPts.map((p, i) => {
      const w = (0.55 - (i / seg) * 0.38) * scale * spread;
      return p.clone().addScaledVector(frame.right, (Math.cos(i * 1.3) * 0.12 + side * w) * 1);
    });
    polyWorld(batch, rail, trunkColor, 0.85);
    if (side < 0) {
      for (let i = 0; i < rail.length - 1; i++) {
        if (i % 2 === 0) batch.seg(rail[i], trunkPts[i + 1].clone().addScaledVector(frame.right, 0.55 * scale), trunkColor, 0.32);
      }
    }
  }
  batch.circle(base.clone().addScaledVector(frame.up, 0.15), 0.75 * scale, frame.right, frame.fwd, trunkColor, 0.4, 8);
  // roots
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.next() * 0.3;
    const root = base
      .clone()
      .addScaledVector(frame.right, Math.cos(a) * 2.0 * scale)
      .addScaledVector(frame.fwd, Math.sin(a) * 1.5 * scale)
      .addScaledVector(frame.up, -0.05);
    batch.seg(base.clone().addScaledVector(frame.up, 0.35 * scale), root, trunkColor, 0.55);
  }

  // Branch limbs radiating from the crown fork.
  const crown = top.clone().addScaledVector(frame.up, -h * 0.18);
  const branchCount = style === 'pine' ? 4 : 6 + Math.floor(rng.next() * 2);
  const clusters = [];
  for (let i = 0; i < branchCount; i++) {
    const a = (i / branchCount) * Math.PI * 2 + rng.next() * 0.6;
    const reach = (2.1 + rng.next() * 2.6) * scale * spread;
    const rise = (0.8 + rng.next() * 1.8) * scale;
    const end = crown
      .clone()
      .addScaledVector(frame.right, Math.cos(a) * reach)
      .addScaledVector(frame.fwd, Math.sin(a) * reach * 0.72)
      .addScaledVector(frame.up, rise);
    const start = top.clone().lerp(crown, 0.55 + rng.next() * 0.35);
    lineBetween(batch, start, end, trunkColor, 0.38);
    clusters.push(end);
  }

  const leafPalette = [leafColor, accentColor || leafColor, leafColor];
  if (style === 'pine') {
    // Stacked, angular boughs.
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const c = base.clone().lerp(top, 0.32 + t * 0.55);
      const r = (2.8 - i * 0.5) * scale * spread;
      addPolyCone(batch, frame, c, r, 1.7 * scale, i % 2 ? accentColor : leafColor, 0.5);
    }
  } else {
    for (let i = 0; i < clusters.length; i++) {
      const center = clusters[i];
      const size = (1.8 + rng.next() * 1.25) * scale * spread;
      batch.polyhedron(PRIM.sphere, center, [size, size * 0.9, size], leafPalette[i % 3], 0.4 + rng.next() * 0.18, {
        x: rng.next() * 3,
        y: rng.next() * 3,
        z: rng.next() * 3,
      });
      // A little leaf lattice inside the cluster.
      for (let k = 0; k < 2; k++) {
        const a = rng.next() * Math.PI * 2;
        const p1 = center.clone().addScaledVector(frame.right, Math.cos(a) * size * 0.7);
        const p2 = p1.clone().addScaledVector(frame.up, size * 0.5).addScaledVector(frame.right, (rng.next() - 0.5) * 0.6);
        batch.seg(p1, p2, leafColor, 0.25);
      }
      if (glow && rng.next() < 0.6) {
        batch.circle(center, size * 0.68, frame.right, frame.up, accentColor || leafColor, 0.18, 7);
      }
    }
    // A soft central cap of leaves.
    if (clusters.length) {
      const mid = clusters.reduce((v, c) => v.add(c), new THREE.Vector3()).multiplyScalar(1 / clusters.length);
      batch.polyhedron(PRIM.sphere, mid, [2.4 * scale * spread, 1.9 * scale, 2.4 * scale * spread], leafColor, 0.32);
    }
  }

  // Hanging vines / moss for the woods.
  if (style === 'willow') {
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * Math.PI * 2;
      const p = crown
        .clone()
        .addScaledVector(frame.right, Math.cos(a) * 2.2 * scale)
        .addScaledVector(frame.fwd, Math.sin(a) * 1.6 * scale);
      polyWorld(batch, [
        p,
        p.clone().addScaledVector(frame.up, -1.6).addScaledVector(frame.right, (rng.next() - 0.5) * 0.6),
        p.clone().addScaledVector(frame.up, -3.4).addScaledVector(frame.right, (rng.next() - 0.5) * 0.9),
      ], accentColor || leafColor, 0.3);
    }
  }
}

function addPolyCone(batch, frame, center, radius, height, color, intensity) {
  const ring = [];
  const seg = 7;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    ring.push(center.clone().addScaledVector(frame.right, Math.cos(a) * radius).addScaledVector(frame.fwd, Math.sin(a) * radius * 0.8));
  }
  const tip = center.clone().addScaledVector(frame.up, height);
  for (let i = 0; i < seg; i++) {
    batch.seg(ring[i], ring[(i + 1) % seg], color, intensity * 0.8);
    batch.seg(ring[i], tip, color, intensity);
  }
}


function addLantern(batch, frame, lateral, color, glowColor, rng, height = 3.6) {
  const base = at(frame, lateral, 0);
  const hook = base.clone().addScaledVector(frame.up, height);
  batch.seg(base, hook, 0x57706a, 0.45);
  batch.seg(hook, hook.clone().addScaledVector(frame.right, lateral > 0 ? -0.55 : 0.55), 0x57706a, 0.4);
  const c = hook.clone().addScaledVector(frame.right, lateral > 0 ? -0.55 : 0.55).addScaledVector(frame.up, -0.35);
  // lantern cage
  batch.seg(c.clone().addScaledVector(frame.up, 0.25), c.clone().addScaledVector(frame.up, -0.35), color, 0.8);
  batch.circle(c, 0.24, frame.right, frame.up, color, 0.7, 6);
  batch.circle(c, 0.24, frame.right, frame.fwd, color, 0.4, 6);
  return c;
}

function addColumn(batch, frame, lateral, opts) {
  const { color, accent, height = 7, broken = false, rng } = opts;
  const base = at(frame, lateral, 0);
  const top = base.clone().addScaledVector(frame.up, height);
  // fluting
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const off = frame.right.clone().multiplyScalar(Math.cos(a) * 0.55).addScaledVector(frame.fwd, Math.sin(a) * 0.55);
    const cap = base.clone().add(off);
    const end = top.clone().add(off).addScaledVector(frame.right, broken ? (rng?.next() ?? 0.5) * 1.2 - 0.6 : 0);
    batch.seg(cap, end, color, 0.55);
  }
  batch.circle(base, 0.65, frame.right, frame.fwd, color, 0.6, 8);
  batch.circle(top, 0.7, frame.right, frame.fwd, accent, 0.7, 8);
  if (broken) {
    // snapped crown
    const shard = top.clone().addScaledVector(frame.up, 0.8).addScaledVector(frame.right, 0.7);
    batch.seg(top, shard, accent, 0.6);
  } else {
    // capital
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      batch.seg(
        top.clone().addScaledVector(frame.right, Math.cos(a) * 0.7),
        top.clone().addScaledVector(frame.right, Math.cos(a) * 1.15),
        accent,
        0.6
      );
    }
  }
}

function addGate(batch, rail, d, opts) {
  const {
    color,
    accent,
    width = 5.2,
    height = 7,
    style = 'stone',
    rng = seeded(1),
  } = opts;
  const f = rail.frameAt(d);
  const leftBase = at(f, -width, 0);
  const rightBase = at(f, width, 0);
  const leftTop = at(f, -width, height * 0.65);
  const rightTop = at(f, width, height * 0.65);

  for (const base of [leftBase, rightBase]) {
    for (const s of [-0.5, 0, 0.5]) {
      const b = base.clone().addScaledVector(f.right, s);
      batch.seg(b, b.clone().addScaledVector(f.up, height * 0.68), color, 0.55);
    }
  }
  // arch
  const center = at(f, 0, height * 0.65);
  polyWorld(batch, arcPoints(center, width, f.right, f.up, 0, Math.PI, 24), accent, 0.8);
  polyWorld(batch, arcPoints(center, width * 0.9, f.right, f.up, 0, Math.PI, 24), color, 0.35);
  // inner rays
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * Math.PI;
    const inner = center.clone().addScaledVector(f.right, Math.cos(a) * width * 0.2).addScaledVector(f.up, Math.sin(a) * width * 0.2);
    const outer = center.clone().addScaledVector(f.right, Math.cos(a) * width * 0.92).addScaledVector(f.up, Math.sin(a) * width * 0.92);
    batch.seg(inner, outer, color, 0.22);
  }
  // triforce eye above the arch
  const crest = at(f, 0, height * 0.65 + width * 0.5);
  const s = 1.4;
  const tri = (cx, cy, size) => {
    const pts = [
      crest.clone().addScaledVector(f.right, cx).addScaledVector(f.up, cy + size),
      crest.clone().addScaledVector(f.right, cx - size * 0.86).addScaledVector(f.up, cy - size * 0.5),
      crest.clone().addScaledVector(f.right, cx + size * 0.86).addScaledVector(f.up, cy - size * 0.5),
    ];
    polyWorld(batch, pts, accent, 0.9, true);
  };
  tri(0, s * 0.62, s * 0.55);
  tri(-s * 0.52, -s * 0.25, s * 0.55);
  tri(s * 0.52, -s * 0.25, s * 0.55);

  if (style === 'woods') {
    // organic diagonal branches
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      const start = at(f, Math.cos(a) * width, Math.sin(a) * width * 0.7 + height * 0.45);
      const end = at(f, Math.cos(a) * width * 1.5, Math.sin(a) * width * 0.5 + height * 0.9);
      batch.seg(start, end, color, 0.4);
    }
  } else if (style === 'malice') {
    // hanging malice thorns
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      const p = center.clone().addScaledVector(f.right, Math.cos(a) * width * 0.8).addScaledVector(f.up, Math.sin(a) * width * 0.8);
      batch.seg(p, p.clone().addScaledVector(f.up, -1.5 - rng.next() * 2.5), accent, 0.55);
    }
  } else if (style === 'lava') {
    for (let i = 0; i < 4; i++) {
      const b = at(f, -width + rng.next() * width * 2, 0.1);
      polyWorld(batch, [
        b,
        b.clone().addScaledVector(f.right, (rng.next() - 0.5) * 2).addScaledVector(f.up, 0.2),
        b.clone().addScaledVector(f.right, (rng.next() - 0.5) * 4).addScaledVector(f.up, 0.05),
      ], accent, 0.5);
    }
  }
}

function addBannerPost(batch, frame, lateral, poleColor, clothColor, accentColor, rng) {
  const base = at(frame, lateral, 0);
  const top = base.clone().addScaledVector(frame.up, 4.4 + rng.next() * 1.6);
  batch.seg(base, top, poleColor, 0.6);
  batch.circle(base.clone().addScaledVector(frame.up, 0.15), 0.3, frame.right, frame.fwd, poleColor, 0.4, 6);
  const inward = lateral > 0 ? -1 : 1;
  const armEnd = top.clone().addScaledVector(frame.right, inward * 1.7);
  batch.seg(top, armEnd, poleColor, 0.5);
  // hanging pennant
  const a = armEnd.clone().addScaledVector(frame.up, -0.15);
  const b = a.clone().addScaledVector(frame.right, inward * 0.2).addScaledVector(frame.up, -1.8);
  const c = a.clone().addScaledVector(frame.right, inward * 1.5).addScaledVector(frame.up, -0.9);
  polyWorld(batch, [a, b, c], clothColor, 0.6, true);
  polyWorld(batch, [
    a.clone().addScaledVector(frame.up, -0.2),
    a.clone().addScaledVector(frame.right, inward * 1.2).addScaledVector(frame.up, -0.85),
  ], accentColor, 0.5);
}

function addWaystone(batch, frame, lateral, stoneColor, accentColor, rng) {
  const base = at(frame, lateral, 0);
  const height = 2.2 + rng.next() * 1.6;
  const top = base.clone().addScaledVector(frame.up, height);
  // Monolith silhouette, slightly tapered.
  const width = 0.55;
  polyWorld(batch, [
    base.clone().addScaledVector(frame.right, -width),
    base.clone().addScaledVector(frame.right, width),
    top.clone().addScaledVector(frame.right, width * 0.55),
    top.clone().addScaledVector(frame.right, -width * 0.55),
  ], stoneColor, 0.65, true);
  polyWorld(batch, [
    top.clone().addScaledVector(frame.right, -width * 0.55),
    top.clone().addScaledVector(frame.up, 0.8),
    top.clone().addScaledVector(frame.right, width * 0.55),
  ], accentColor, 0.45);
  // runic eye / triforce facing the path
  const c = base.clone().addScaledVector(frame.up, height * 0.58).addScaledVector(frame.right, width * 0.7);
  batch.circle(c, 0.3, frame.fwd, frame.up, accentColor, 0.55, 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    batch.seg(
      c.clone().addScaledVector(frame.fwd, 0.04),
      c.clone().addScaledVector(frame.up, Math.sin(a) * 0.3).addScaledVector(frame.fwd, Math.cos(a) * 0.3 + 0.04),
      accentColor,
      0.3
    );
  }
  // ground glow
  batch.circle(base.clone().addScaledVector(frame.up, 0.04), 1.1, frame.right, frame.fwd, accentColor, 0.18, 10);
}

function addCastleSilhouette(batch, frame, lateral, palette, rng, scale = 1) {
  const P = (lat, h, fwd = 0) =>
    new THREE.Vector3()
      .copy(frame.pos)
      .addScaledVector(frame.right, lateral + lat * scale)
      .addScaledVector(frame.up, h * scale)
      .addScaledVector(frame.fwd, fwd * scale);
  const baseY = 0;
  const wallY = 8;
  // curtain wall
  batch.seg(P(-16, baseY, 0), P(16, baseY, 0), palette.secondary, 0.28);
  batch.seg(P(-16, wallY, 0), P(16, wallY, 0), palette.secondary, 0.36);
  for (let i = 0; i < 9; i++) {
    const x = -15 + i * 3.6;
    batch.seg(P(x, wallY, 0), P(x, wallY + 1.6, 0), palette.secondary, 0.26);
  }
  // keep
  for (const [x, h, w] of [
    [0, 30, 5],
    [-5.5, 23, 3],
    [5.5, 23, 3],
    [-10.5, 17, 2.4],
    [10.5, 17, 2.4],
  ]) {
    batch.seg(P(x - w, baseY, 0), P(x - w * 0.7, h, 0), palette.secondary, 0.36);
    batch.seg(P(x + w, baseY, 0), P(x + w * 0.7, h, 0), palette.secondary, 0.36);
    polyWorld(batch, [
      P(x - w * 0.7, h, 0),
      P(x, h + 8, 0),
      P(x + w * 0.7, h, 0),
    ], palette.accent, 0.4, true);
    // windows
    for (let k = 0; k < 2; k++) {
      const wy = 7 + k * 8;
      if (wy > h - 4) break;
      polyWorld(batch, [P(x - 1, wy, 0), P(x, wy + 2.2, 0), P(x + 1, wy, 0), P(x, wy - 2.2, 0)], palette.accent, 0.32, true);
    }
    // pennant
    batch.seg(P(x, h + 8, 0), P(x + 3, h + 9, 0), palette.accent, 0.3);
    batch.seg(P(x + 3, h + 9, 0), P(x + 2.4, h + 7, 0), palette.accent, 0.22);
  }
  // long bridge approach
  batch.seg(P(0, baseY, 0), P(0, baseY, 22), palette.secondary, 0.22);
  batch.seg(P(-1.4, baseY + 0.8, 0), P(-1.4, baseY + 0.8, 22), palette.secondary, 0.16);
  batch.seg(P(1.4, baseY + 0.8, 0), P(1.4, baseY + 0.8, 22), palette.secondary, 0.16);
  // moonlit halo behind the castle
  batch.circle(P(0, 26, -2), 24 * scale, palette.accent, 0.06, 40, frame.right, frame.up);
}

function addRidge(batch, rail, side, palette, rng, startD, steps, spread = 1) {
  let prevPeak = null;
  let prevBase = null;
  for (let i = 0; i < steps; i++) {
    const d = startD + i * 52;
    const f = rail.frameAt(d);
    const lat = side * (72 + i * 3 + rng.next() * 18) * spread;
    const base = at(f, lat, -2);
    const peak = base
      .clone()
      .addScaledVector(f.up, 24 + rng.next() * 26)
      .addScaledVector(f.right, (rng.next() - 0.5) * 30);
    if (prevPeak) {
      batch.seg(prevPeak, peak, palette.secondary, 0.16);
      batch.seg(prevBase, peak, palette.secondary, 0.09);
      batch.seg(prevBase, base, palette.secondary, 0.12);
    }
    prevPeak = peak;
    prevBase = base;
  }
}

function addMasterSword(batch, frame, lateral, palette, rng, scale = 1) {
  const base = at(frame, lateral, 0);
  const up = frame.up;
  const right = frame.right;
  const fwd = frame.fwd;
  const P = (dx, dy, dz = 0) => base.clone().addScaledVector(right, dx * scale).addScaledVector(up, dy * scale).addScaledVector(fwd, dz * scale);
  // Stone pedestal and cracked earth
  polyWorld(batch, [P(-4, 0), P(-2.4, 1.5), P(0, 2.6), P(2.4, 1.5), P(4, 0)], palette.secondary, 0.55, true);
  polyWorld(batch, [P(-4, 0), P(-2.6, -0.7), P(0, 0.2), P(2.8, -0.8), P(5, 0.1)], palette.primary, 0.25);
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    const p = P(Math.cos(a) * 3, 0.1, Math.sin(a) * 3);
    batch.seg(p, p.clone().addScaledVector(right, (rng.next() - 0.5) * 3).addScaledVector(fwd, (rng.next() - 0.5) * 3), palette.accent, 0.25);
  }
  // The blade, planted point-first into the earth.
  const bladeTop = P(0, 22, 0);
  const bladeW = 1.7;
  const tipY = 3.2;
  // glowing fuller
  polyWorld(batch, [P(0, tipY, 0), P(0, 20, 0)], 0xbff5ff, 0.9);
  // edges
  polyWorld(batch, [P(-bladeW * 0.5, 12.5, 0), P(-bladeW * 0.5, 19.5, 0), P(0, 21.8, 0), P(bladeW * 0.5, 19.5, 0), P(bladeW * 0.5, 12.5, 0), P(0, tipY, 0)], 0x9fe8f8, 0.5, true);
  polyWorld(batch, [P(-bladeW * 0.5, 12.5, 0), P(0, tipY, 0), P(bladeW * 0.5, 12.5, 0)], 0x9fe8f8, 0.35);
  // crossguard
  const guardY = 21.6;
  polyWorld(batch, [P(-3.4, guardY, 0), P(-1.1, guardY - 0.5, 0), P(1.1, guardY - 0.5, 0), P(3.4, guardY, 0)], palette.accent, 0.85);
  polyWorld(batch, [P(-3.4, guardY, 0), P(-2.2, guardY - 1.1, 0), P(-1.1, guardY - 0.5, 0)], palette.accent, 0.55);
  polyWorld(batch, [P(3.4, guardY, 0), P(2.2, guardY - 1.1, 0), P(1.1, guardY - 0.5, 0)], palette.accent, 0.55);
  // hilt and pommel
  polyWorld(batch, [P(-0.6, guardY + 0.2, 0), P(-0.45, guardY + 4.2, 0), P(0.45, guardY + 4.2, 0), P(0.6, guardY + 0.2, 0)], 0x3e9e7a, 0.7, true);
  for (let i = 0; i < 3; i++) {
    const y = guardY + 0.8 + i * 1.15;
    batch.seg(P(-0.5, y, 0.1), P(0.5, y + 0.4, 0.1), palette.accent, 0.3);
  }
  polyWorld(batch, [P(0, 26.4, 0), P(0.6, 25.6, 0), P(0, 24.8, 0), P(-0.6, 25.6, 0)], 0x8df7ff, 0.85, true);
  // faint aura around the blade
  batch.circle(P(0, 12, 0), 5.5, right, up, 0x8df7ff, 0.1, 20);
  batch.circle(base.clone().addScaledVector(up, 0.15), 5, right, fwd, palette.accent, 0.25, 20);
  batch.seg(P(0, 12, 0), P(0, 4, 0), 0xffffff, 0.18);
}

function addGiantGate(batch, rail, d, opts) {
  const { color, accent, width = 12, height = 15, rng = seeded(1) } = opts;
  const f = rail.frameAt(d);
  const inset = width * 0.22;
  for (const side of [-1, 1]) {
    const base = at(f, side * width, 0);
    const top = base.clone().addScaledVector(f.up, height * 0.72);
    for (let i = 0; i < 3; i++) {
      const b = base.clone().addScaledVector(f.right, (i - 1) * 1.0);
      batch.seg(b, b.clone().addScaledVector(f.up, height * 0.72), color, 0.5);
    }
    batch.circle(base, 1.5, f.right, f.fwd, color, 0.5, 8);
    batch.circle(top, 1.6, f.right, f.fwd, accent, 0.5, 8);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const p = base.clone().lerp(top, 0.4 + t * 0.6);
      batch.seg(p, p.clone().addScaledVector(f.right, side * -1.2), accent, 0.28);
    }
  }
  const center = at(f, 0, height * 0.72);
  polyWorld(batch, arcPoints(center, width, f.right, f.up, 0, Math.PI, 30), accent, 0.8);
  polyWorld(batch, arcPoints(center, width * 0.92, f.right, f.up, 0, Math.PI, 30), color, 0.25);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    batch.seg(
      center.clone().addScaledVector(f.right, Math.cos(a) * width * 0.2).addScaledVector(f.up, Math.sin(a) * width * 0.2),
      center.clone().addScaledVector(f.right, Math.cos(a) * width * 0.9).addScaledVector(f.up, Math.sin(a) * width * 0.9),
      color, 0.18
    );
  }
  // Triforce above the arch
  const crest = center.clone().addScaledVector(f.up, width * 0.55);
  const s = 2.6;
  const tri = (cx, cy, size) => {
    polyWorld(batch, [
      crest.clone().addScaledVector(f.right, cx).addScaledVector(f.up, cy + size),
      crest.clone().addScaledVector(f.right, cx - size * 0.86).addScaledVector(f.up, cy - size * 0.5),
      crest.clone().addScaledVector(f.right, cx + size * 0.86).addScaledVector(f.up, cy - size * 0.5),
    ], accent, 0.9, true);
  };
  tri(0, s * 0.62, s * 0.55);
  tri(-s * 0.52, -s * 0.25, s * 0.55);
  tri(s * 0.52, -s * 0.25, s * 0.55);
  batch.circle(crest, s * 2.4, f.right, f.up, color, 0.12, 30);
}

function addForestArch(batch, rail, d, p, rng, scene, dyn) {
  const f = rail.frameAt(d);
  const height = 11 + rng.next() * 3;
  const width = 8 + rng.next() * 2;
  const lightPositions = [];
  for (const side of [-1, 1]) {
    const base = at(f, side * width, 0);
    const top = at(f, side * (width * 0.35), height);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(
        base.clone().lerp(top, t)
          .addScaledVector(f.right, side * Math.sin(t * Math.PI) * 1.4)
          .addScaledVector(f.up, 0)
      );
    }
    polyWorld(batch, pts, p.secondary, 0.6);
    polyWorld(batch, pts.map((q) => q.clone().addScaledVector(f.right, side * 1.4)), p.primary, 0.35);
    // roots
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      batch.seg(base, base.clone().addScaledVector(f.right, Math.cos(a) * 3).addScaledVector(f.fwd, Math.sin(a) * 2), p.secondary, 0.35);
    }
    // hanging vines and a lantern
    for (let i = 0; i < 3; i++) {
      const q = pts[4].clone().addScaledVector(f.right, (i - 1) * 1.2);
      batch.seg(q, q.clone().addScaledVector(f.up, -2.2 - rng.next() * 2), p.primary, 0.28);
    }
    const lantern = top.clone().addScaledVector(f.up, -1.6).addScaledVector(f.right, side * -0.8);
    batch.circle(lantern, 0.4, f.right, f.up, p.accent, 0.6, 8);
    lightPositions.push(lantern.x, lantern.y, lantern.z);
  }
  // luminous canopy over the path
  for (let i = -2; i <= 2; i++) {
    const c = at(f, i * 3.2, height + 0.8 + Math.sin(i) * 0.8);
    batch.polyhedron(PRIM.sphere, c, [3.4, 2.4, 3.4], i % 2 ? p.primary : p.secondary, 0.25, {
      x: rng.next() * 3,
      y: rng.next() * 3,
      z: rng.next() * 3,
    });
  }
  if (lightPositions.length) {
    const points = buildPoints(lightPositions, p.accent, 2.2, 0.6);
    scene.add(points);
    dyn.push({ obj: points, type: 'twinkle', base: 0.6 });
  }
}

function addLavaRail(batch, rail, p, rng) {
  // Low stone balustrade, with molten light bleeding from below.
  for (let d = 0; d < rail.length + 60; d += 15) {
    const f = rail.frameAt(d);
    for (const side of [-1, 1]) {
      const base = at(f, side * 4.6, 0);
      const top = base.clone().addScaledVector(f.up, 1.25);
      batch.seg(base, top, p.secondary, 0.42);
      batch.seg(top, top.clone().addScaledVector(f.right, -side * 0.6), p.accent, 0.3);
      if (Math.floor(d / 15) % 2 === 0) {
        const nf = rail.frameAt(d + 15);
        const nt = at(nf, side * 4.6, 1.25);
        batch.seg(top, nt, p.primary, 0.18);
      }
      // molten glow under the rail
      const under = at(f, side * (5.8 + rng.next() * 1.8), -1.6);
      batch.seg(under, under.clone().addScaledVector(f.fwd, 10 + rng.next() * 8).addScaledVector(f.up, 0.4), p.primary, 0.3);
    }
  }
  // Chasm lava falls
  for (let i = 0; i < 6; i++) {
    const d = 140 + i * (rail.length / 6.5);
    const f = rail.frameAt(d);
    const side = i % 2 ? 1 : -1;
    const top = at(f, side * (12 + rng.next() * 8), 0.4);
    for (let k = 0; k < 6; k++) {
      const a = top.clone().addScaledVector(f.up, -k * 1.8).addScaledVector(f.right, Math.sin(k) * 0.4);
      const b = a.clone().addScaledVector(f.up, -1.7);
      batch.seg(a, b, p.primary, 0.25);
    }
    batch.circle(top.clone().addScaledVector(f.up, 0.2), 1.4, f.right, f.fwd, p.accent, 0.35, 10);
  }
  // Jagged obsidian teeth.
  for (let d = 20; d < rail.length; d += 23) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    const lat = side * (6.2 + rng.next() * 4.5);
    const base = at(f, lat, 0);
    const h = 1.4 + rng.next() * 3.6;
    batch.seg(base, base.clone().addScaledVector(f.up, h).addScaledVector(f.right, (rng.next() - 0.5) * 1.2), p.accent, 0.24);
  }
}

function addVolcano(batch, frame, lateral, palette, rng, scale = 1) {
  const P = (lat, h, fwd = 0) => new THREE.Vector3()
    .copy(frame.pos)
    .addScaledVector(frame.right, lateral + lat * scale)
    .addScaledVector(frame.up, h * scale)
    .addScaledVector(frame.fwd, fwd * scale);
  const base = P(0, 0);
  // cone silhouette
  polyWorld(batch, [P(-32, 0), P(-8, 43), P(0, 48), P(10, 43), P(34, 0)], palette.secondary, 0.55);
  polyWorld(batch, [P(-23, 0), P(-6, 40), P(-3, 45)], palette.secondary, 0.32);
  // glowing crater
  for (let i = 0; i < 3; i++) {
    batch.circle(P(0, 48, 0), 5 - i, frame.right, frame.fwd, i === 0 ? palette.accent : palette.primary, 0.8 - i * 0.15, 18);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const q = P(Math.cos(a) * 12, 0.5, Math.sin(a) * 8);
    const top = P(Math.cos(a) * 3, 45, Math.sin(a) * 2);
    polyWorld(batch, [q, q.clone().addScaledVector(frame.up, 5 * scale), top], palette.primary, 0.3);
  }
  // smoke / ash rings
  for (let i = 0; i < 6; i++) {
    const c = P((rng.next() - 0.5) * 14, 54 + i * 7, (rng.next() - 0.5) * 8);
    batch.circle(c, 5 + i * 3.5, frame.right, frame.up, i % 2 ? palette.accent : palette.secondary, 0.12, 24);
  }
  // halo
  batch.circle(P(0, 30), 42, frame.right, frame.up, palette.primary, 0.06, 30);
}

function addRuin(batch, rail, d, palette, rng) {
  const f = rail.frameAt(d);
  const side = rng.next() < 0.5 ? -1 : 1;
  const lat = side * (9 + rng.next() * 6);
  addColumn(batch, f, lat, {
    color: palette.secondary,
    accent: palette.accent,
    height: 3 + rng.next() * 4,
    broken: true,
    rng,
  });
  addColumn(batch, f, lat + side * 2.6, {
    color: palette.secondary,
    accent: palette.accent,
    height: 2 + rng.next() * 3,
    broken: rng.next() < 0.7,
    rng,
  });
  // fallen lintel
  const a = at(f, lat - 1.2, 0.2);
  const b = a.clone().addScaledVector(f.right, 5.2).addScaledVector(f.up, 0.5);
  batch.seg(a, b, palette.secondary, 0.5);
  batch.seg(a.clone().addScaledVector(f.up, 0.45), b.clone().addScaledVector(f.up, 0.6), palette.accent, 0.3);
  // rubble
  for (let i = 0; i < 3; i++) {
    const p = at(f, lat + (rng.next() - 0.5) * 8, 0.2);
    const s = 0.3 + rng.next() * 0.5;
    batch.polyhedron(PRIM.tetra, p, s, palette.secondary, 0.45, {
      x: rng.next() * 3,
      y: rng.next() * 3,
      z: rng.next() * 3,
    });
  }
}

function addSpire(batch, rail, d, palette, rng, side, latBase) {
  const f = rail.frameAt(d);
  const height = 16 + rng.next() * 24;
  const lat = side * (latBase + rng.next() * 8);
  const base = at(f, lat, 0);
  const top = base.clone().addScaledVector(f.up, height).addScaledVector(f.right, side * -2);
  const mid = base.clone().lerp(top, 0.55);
  const w = 1.5 + rng.next() * 2;
  // tapering tower
  const edges = [
    base.clone().addScaledVector(f.right, w),
    base.clone().addScaledVector(f.right, -w),
    base.clone().addScaledVector(f.fwd, w),
    base.clone().addScaledVector(f.fwd, -w),
  ];
  for (const e of edges) batch.seg(e, top, palette.secondary, 0.35);
  polyWorld(batch, [
    base.clone().addScaledVector(f.right, w),
    base.clone().addScaledVector(f.fwd, w),
    base.clone().addScaledVector(f.right, -w),
    base.clone().addScaledVector(f.fwd, -w),
  ], palette.secondary, 0.35, true);
  // rings and windows
  for (let i = 1; i <= 3; i++) {
    const c = base.clone().lerp(top, i / 4.5);
    batch.circle(c, w * (1 - i / 6), f.right, f.fwd, palette.accent, 0.35, 8);
  }
  for (let i = 0; i < 2; i++) {
    const c = base.clone().lerp(top, 0.35 + i * 0.18);
    batch.seg(c.clone().addScaledVector(f.right, 0.3), c.clone().addScaledVector(f.up, 1.4), palette.accent, 0.4);
  }
  // spikes
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p = mid.clone().addScaledVector(f.right, Math.cos(a) * w * 0.9).addScaledVector(f.fwd, Math.sin(a) * w * 0.9);
    batch.seg(p, p.clone().addScaledVector(f.up, 2 + rng.next() * 3).addScaledVector(f.right, Math.cos(a) * 1.3), palette.primary, 0.4);
  }
  polyWorld(batch, [top, top.clone().addScaledVector(f.up, 4 + rng.next() * 6)], palette.accent, 0.45);
}

function addMaliceEye(batch, frame, lateral, height, size, color, accent) {
  const center = at(frame, lateral, height);
  const ring = circlePoints(center, size, frame.right, frame.up, 28);
  polyWorld(batch, ring, color, 0.75);
  const inner = circlePoints(center, size * 0.55, frame.right, frame.up, 20);
  polyWorld(batch, inner, accent, 0.55);
  // slit pupil
  polyWorld(batch, [
    center.clone().addScaledVector(frame.up, size * 0.5),
    center.clone().addScaledVector(frame.right, size * 0.16).addScaledVector(frame.up, 0),
    center.clone().addScaledVector(frame.up, -size * 0.5),
    center.clone().addScaledVector(frame.right, -size * 0.16),
  ], color, 0.9, true);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = center.clone().addScaledVector(frame.right, Math.cos(a) * size * 1.2).addScaledVector(frame.up, Math.sin(a) * size * 1.2);
    batch.seg(p, p.clone().addScaledVector(frame.right, Math.cos(a) * size * 0.5).addScaledVector(frame.up, Math.sin(a) * size * 0.5), color, 0.35);
  }
}

function addCrack(batch, frame, lateral, color, rng, len = 6) {
  const start = at(frame, lateral, 0.06);
  let p = start.clone();
  const pts = [p.clone()];
  for (let i = 0; i < 5; i++) {
    p = p.clone().addScaledVector(frame.fwd, len / 5).addScaledVector(frame.right, (rng.next() - 0.5) * 2.4);
    pts.push(p.clone());
  }
  polyWorld(batch, pts, color, 0.7);
  for (let i = 1; i < 4; i++) {
    const base = pts[i];
    const branch = base.clone().addScaledVector(frame.right, (rng.next() - 0.5) * 4).addScaledVector(frame.fwd, 1 + rng.next() * 2);
    batch.seg(base, branch, color, 0.35);
  }
}

/* ------------------------------------------------------------------ */
/* dynamic pieces                                                     */
/* ------------------------------------------------------------------ */

function makeRuneRing(rail, d, opts, scene) {
  const { radius = 9, color, accent, height = 8.5, speed = 0.25, tilt = 0 } = opts;
  const f = rail.frameAt(d);
  const group = new THREE.Group();
  group.position.copy(at(f, 0, height));
  const q = frameQuat(f);
  if (tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0)));
  group.quaternion.copy(q);
  // ring plane is local XY, facing along the rail
  const mk = (segments) =>
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    });
  const outer = mk(42);
  const outerLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(outer),
    lineMaterial(color, { opacity: 0.6 })
  );
  outerLine.renderOrder = 2;
  group.add(outerLine);
  const inner = mk(7).map((p) => p.clone().multiplyScalar(0.85));
  const innerLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(inner),
    lineMaterial(accent, { opacity: 0.65 })
  );
  group.add(innerLine);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9, 0),
      new THREE.Vector3(Math.cos(a + 0.22) * radius * 0.78, Math.sin(a + 0.22) * radius * 0.78, 0),
      new THREE.Vector3(Math.cos(a) * radius * 0.7, Math.sin(a) * radius * 0.7, 0),
    ]);
    group.add(new THREE.Line(geo, lineMaterial(accent, { opacity: 0.4 })));
  }
  group.renderOrder = 2;
  scene.add(group);
  return { obj: group, speed, type: 'spin' };
}

/* ------------------------------------------------------------------ */
/* stage builders                                                     */
/* ------------------------------------------------------------------ */

function buildField(batch, rail, p, rng, scene, dyn) {
  addGround(batch, rail, {
    width: 38,
    step: 13,
    lats: [0.08, 0.22, 0.4, 0.64, 0.9],
    color: p.secondary,
    intensity: 0.17,
    edgeColor: p.primary,
    edgeIntensity: 0.8,
    sag: 2,
    pathHalf: 3.6,
  });
  addBraid(batch, rail, { side: -1, lateral: 8, color: p.primary, intensity: 0.18 });
  addBraid(batch, rail, { side: 1, lateral: 10, color: p.cyan, intensity: 0.12 });

  // Sacred chevrons down the middle of the road.
  for (let d = 20; d < rail.length; d += 16) {
    const f = rail.frameAt(d);
    const a = at(f, -2.5, 0.03);
    const b = at(f, 0, 0.03, 2.6);
    const c = at(f, 2.5, 0.03);
    batch.seg(a, b, p.accent, 0.16);
    batch.seg(b, c, p.accent, 0.16);
    if (Math.floor(d / 16) % 4 === 0) {
      batch.circle(at(f, 0, 0.04), 0.45, f.right, f.fwd, p.primary, 0.25, 6);
    }
  }

  const lightPositions = [];
  const flowerPositions = [];

  // Meadow grasses, wildflowers and stones.
  for (let d = 8; d < rail.length + 60; d += 7) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    addTuft(batch, f, side * (4.6 + rng.next() * 2.6), p.primary, rng, 0.34);
    if (rng.next() < 0.65) addTuft(batch, f, -side * (6 + rng.next() * 12), p.primary, rng, 0.24);
    if (rng.next() < 0.45) addTuft(batch, f, side * (12 + rng.next() * 18), p.cyan, rng, 0.16);
    if (rng.next() < 0.12) {
      const c = at(f, side * (5 + rng.next() * 20), 0.3 + rng.next() * 0.3);
      flowerPositions.push(c.x, c.y, c.z);
    }
    if (rng.next() < 0.14) {
      const q = at(f, side * (4.5 + rng.next() * 10), 0.05);
      batch.polyhedron(PRIM.tetra, q, 0.22 + rng.next() * 0.3, p.secondary, 0.4, {
        x: rng.next() * 3,
        y: rng.next() * 3,
        z: rng.next() * 3,
      });
    }
  }

  // Trees, in loose hedgerows.
  for (let d = 26; d < rail.length + 50; d += 17 + rng.next() * 9) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    const lat = side * (18 + rng.next() * 17);
    addTree(batch, f, rng, {
      lateral: lat,
      scale: 0.7 + rng.next() * 0.5,
      trunkColor: p.secondary,
      leafColor: p.primary,
      accentColor: rng.next() < 0.25 ? p.cyan : p.accent,
      height: 7 + rng.next() * 4,
      spread: 0.8 + rng.next() * 0.45,
      glow: rng.next() < 0.4,
      style: 'oak',
    });
    if (rng.next() < 0.4) {
      const f2 = rail.frameAt(d + 6 + rng.next() * 3);
      addTree(batch, f2, rng, {
        lateral: side * (26 + rng.next() * 14),
        scale: 0.6 + rng.next() * 0.45,
        trunkColor: p.secondary,
        leafColor: rng.next() < 0.5 ? p.primary : p.accent,
        accentColor: p.cyan,
        height: 6 + rng.next() * 4,
        spread: 0.75 + rng.next() * 0.4,
        style: 'oak',
      });
    }
  }

  // Waystones and banners line the sacred road.
  for (let d = 38; d < rail.length; d += 42) {
    const f = rail.frameAt(d);
    const side = Math.floor(d / 42) % 2 === 0 ? -1 : 1;
    addWaystone(batch, f, side * 5.2, p.secondary, p.accent, rng);
    if (Math.floor(d / 42) % 2 === 0) {
      const c = at(f, side * 5.2, 2.4);
      lightPositions.push(c.x, c.y, c.z);
    }
  }
  for (let d = 64; d < rail.length; d += 78) {
    const f = rail.frameAt(d);
    const side = Math.floor(d / 78) % 2 === 0 ? -1 : 1;
    addBannerPost(batch, f, side * 4.7, p.secondary, p.primary, p.accent, rng);
  }

  // Gateways and ruins.
  for (let d = 120; d < rail.length; d += 172) addGate(batch, rail, d, { color: p.secondary, accent: p.accent, width: 5.4, height: 8.5, style: 'stone' });
  for (let d = 520; d < rail.length; d += 560) addGiantGate(batch, rail, d, { color: p.secondary, accent: p.accent, width: 11, height: 16 });
  for (let d = 190; d < rail.length; d += 240) addRuin(batch, rail, d + rng.next() * 40, p, rng);

  // A grand processional arch, then monuments of the hero.
  addGiantGate(batch, rail, 92, { color: p.secondary, accent: p.accent, width: 13, height: 19 });
  const swordStart = rail.frameAt(72);
  addMasterSword(batch, swordStart, 25, p, rng, 0.85);
  const swordA = rail.frameAt(165);
  addMasterSword(batch, swordA, 24, p, rng, 1.15);
  const swordB = rail.frameAt(rail.length * 0.55);
  addMasterSword(batch, swordB, -22, p, rng, 1.35);
  const swordC = rail.frameAt(rail.length - 160);
  addMasterSword(batch, swordC, 28, p, rng, 1.1);
  for (const [sw, lat] of [[swordStart, 25], [swordA, 24], [swordB, -22], [swordC, 28]]) {
    const glowPoint = at(sw, lat, 13);
    lightPositions.push(glowPoint.x, glowPoint.y, glowPoint.z);
  }

  // Landmark castles in the distance.
  const castleA = rail.frameAt(Math.min(rail.length - 120, 240));
  addCastleSilhouette(batch, castleA, -46, p, rng, 1.15);
  const castleB = rail.frameAt(rail.length * 0.62);
  addCastleSilhouette(batch, castleB, 52, p, rng, 1.1);
  const castleC = rail.frameAt(rail.length - 90);
  addCastleSilhouette(batch, castleC, -28, p, rng, 0.7);

  // Rolling ridge silhouettes.
  addRidge(batch, rail, -1, p, rng, 0, 12, 1);
  addRidge(batch, rail, 1, p, rng, 90, 10, 1.2);
  addRidge(batch, rail, -1, p, rng, 700, 10, 1.35);

  // Moon glow points in the canopy and over the fields.
  const lanterns = buildPoints(lightPositions, p.accent, 2.0, 0.5);
  scene.add(lanterns);
  dyn.push({ obj: lanterns, type: 'twinkle', base: 0.5 });
  const flowers = buildPoints(flowerPositions, p.cyan, 0.9, 0.35);
  scene.add(flowers);
  dyn.push({ obj: flowers, type: 'twinkle', base: 0.35, speed: 0.9 });

  // Standing stones near the end, and the guardian's gate.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const f = rail.frameAt(rail.length - 240 + Math.sin(a) * 5);
    addColumn(batch, f, Math.cos(a) * 13, {
      color: p.secondary,
      accent: p.accent,
      height: 4.2 + (i % 3) * 1.2,
      broken: i % 3 === 2,
      rng,
    });
  }
  addGate(batch, rail, rail.length - 250, { color: p.secondary, accent: p.accent, width: 8, height: 12, style: 'stone' });

  for (let d = 220; d < rail.length; d += 320) dyn.push(makeRuneRing(rail, d, { radius: 6, color: p.accent, accent: p.primary, height: 5.6, speed: 0.18 }, scene));
}

function buildWoods(batch, rail, p, rng, scene, dyn) {
  addGround(batch, rail, {
    width: 24,
    step: 11,
    lats: [0.2, 0.45, 0.75],
    color: p.secondary,
    intensity: 0.2,
    edgeColor: p.primary,
    edgeIntensity: 0.55,
    sag: 1.2,
    pathHalf: 3.2,
  });

  // dense tree walls, some leaning over the path
  for (let d = 20; d < rail.length + 60; d += 16 + rng.next() * 12) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    const lat = side * (8 + rng.next() * 16);
    addTree(batch, f, rng, {
      lateral: lat,
      scale: 1.1 + rng.next() * 0.8,
      trunkColor: p.secondary,
      leafColor: p.primary,
      accentColor: p.cyan,
      height: 12 + rng.next() * 11,
      spread: 1 + rng.next() * 0.6,
      glow: rng.next() < 0.4,
    });
    // arching boughs over the path
    if (rng.next() < 0.42) {
      const start = at(f, lat, 7 + rng.next() * 5);
      const end = at(f, -lat * 0.5, 9 + rng.next() * 4, 4);
      batch.seg(start, end, p.secondary, 0.35);
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        const q = start.clone().lerp(end, t).addScaledVector(f.up, Math.sin(t * Math.PI) * 2);
        batch.seg(q, q.clone().addScaledVector(f.up, -1.4 - rng.next() * 2), p.primary, 0.3);
        if (rng.next() < 0.4) batch.seg(q, q.clone().addScaledVector(f.up, 0.7), p.cyan, 0.2);
      }
    }
  }

  // lanterns line the way
  const lightPositions = [];
  for (let d = 55; d < rail.length; d += 42) {
    const f = rail.frameAt(d);
    const side = Math.floor(d / 42) % 2 === 0 ? -1 : 1;
    const c = addLantern(batch, f, side * 5.4, p.accent, p.primary, rng, 3.4 + rng.next() * 0.7);
    lightPositions.push(c.x, c.y, c.z);
    // mushroom ring beneath
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const m = at(f, side * (3.2 + Math.cos(a)), 0);
      batch.seg(m, m.clone().addScaledVector(f.up, 0.25 + rng.next() * 0.2), p.cyan, 0.4);
      batch.circle(m.clone().addScaledVector(f.up, 0.35), 0.22, f.right, f.fwd, p.accent, 0.4, 6);
    }
  }
  if (lightPositions.length) {
    const lanterns = buildPoints(lightPositions, p.accent, 3.4, 0.8);
    scene.add(lanterns);
    dyn.push({ obj: lanterns, type: 'twinkle', base: 0.8 });
  }

  for (let d = 120; d < rail.length; d += 220) addGate(batch, rail, d, { color: p.secondary, accent: p.accent, width: 4.8, height: 9, style: 'woods', rng });
  for (let d = 90; d < rail.length; d += 170) addForestArch(batch, rail, d, p, rng, scene, dyn);
  for (let d = 300; d < rail.length; d += 360) {
    const f = rail.frameAt(d);
    addColumn(batch, f, -12, { color: p.secondary, accent: p.primary, height: 5 + rng.next() * 2, broken: true, rng });
  }
  const sporePositions = [];
  for (let i = 0; i < 300; i++) {
    const d = rng.next() * rail.length;
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 18, 0.4 + rng.next() * 6);
    sporePositions.push(c.x, c.y, c.z);
  }
  const spores = buildPoints(sporePositions, p.accent, 1.15, 0.5);
  scene.add(spores);
  dyn.push({ obj: spores, type: 'twinkle', base: 0.5, speed: 1.2 });

  // giant elder tree silhouette
  const elderF = rail.frameAt(rail.length * 0.5);
  const elderBase = at(elderF, 44, 0);
  const elderTop = elderBase.clone().addScaledVector(elderF.up, 58);
  batch.seg(elderBase, elderTop, p.secondary, 0.3);
  batch.seg(
    elderBase.clone().addScaledVector(elderF.right, 7),
    elderTop.clone().addScaledVector(elderF.right, 3),
    p.secondary,
    0.25
  );
  for (let i = 0; i < 5; i++) {
    const c = elderTop.clone().addScaledVector(elderF.up, -6 + i * 1.5);
    batch.circle(c, 16 + i * 2, elderF.right, elderF.up, p.primary, 0.15 + (4 - i) * 0.03, 28);
  }

  // moon glow through the canopy
  const moonF = rail.frameAt(rail.length * 0.35);
  const moonC = at(moonF, -35, 64);
  batch.circle(moonC, 9, moonF.right, moonF.up, p.accent, 0.35, 34);
  batch.circle(moonC, 12, moonF.right, moonF.up, p.primary, 0.12, 34);

  // hanging wisps
  const wispPositions = [];
  for (let i = 0; i < 220; i++) {
    const d = rng.next() * rail.length;
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 30, 1 + rng.next() * 13);
    wispPositions.push(c.x, c.y, c.z);
  }
  const wisps = buildPoints(wispPositions, p.cyan, 1.35, 0.65);
  scene.add(wisps);
  dyn.push({ obj: wisps, type: 'twinkle', base: 0.65 });

  for (let d = 260; d < rail.length; d += 300) dyn.push(makeRuneRing(rail, d, { radius: 5, color: p.cyan, accent: p.accent, height: 7.4, speed: -0.2 }, scene));

  // arena: ring of lanterns
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const f = rail.frameAt(rail.length - 230 + Math.sin(a) * 4);
    addLantern(batch, f, Math.cos(a) * 12, p.accent, p.primary, rng, 3.5);
  }
}

function buildMountain(batch, rail, p, rng, scene, dyn) {
  addGround(batch, rail, {
    width: 28,
    step: 12,
    lats: [0.18, 0.42, 0.7],
    color: p.secondary,
    intensity: 0.24,
    edgeColor: p.primary,
    edgeIntensity: 0.75,
    sag: 2.4,
    pathHalf: 3.4,
  });
  addBraid(batch, rail, { side: -1, lateral: 6.6, color: p.primary, intensity: 0.25 });
  addBraid(batch, rail, { side: 1, lateral: 7.2, color: p.accent, intensity: 0.2 });

  addLavaRail(batch, rail, p, rng);

  // lava fissures
  for (let d = 18; d < rail.length + 40; d += 12) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    addCrack(batch, f, side * (5 + rng.next() * 17), p.primary, rng, 5 + rng.next() * 8);
    if (rng.next() < 0.5) addCrack(batch, f, -side * (6 + rng.next() * 12), p.accent, rng, 3 + rng.next() * 6);
  }
  // glowing fissure points
  const fissureLights = [];
  for (let d = 25; d < rail.length; d += 17) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    const c = at(f, side * (5 + rng.next() * 15), 0.25);
    fissureLights.push(c.x, c.y, c.z);
  }
  const fissures = buildPoints(fissureLights, p.accent, 1.2, 0.55);
  scene.add(fissures);
  dyn.push({ obj: fissures, type: 'twinkle', base: 0.55, speed: 1.6 });
  // lava river far below
  for (const side of [-1, 1]) {
    let prev = null;
    for (let d = 0; d < rail.length + 80; d += 20) {
      const f = rail.frameAt(d);
      const q = at(f, side * (30 + Math.sin(d * 0.02) * 4), -4 + Math.sin(d * 0.05) * 0.6);
      if (prev) batch.seg(prev, q, p.primary, 0.22);
      prev = q;
    }
  }

  // jagged peaks
  for (let d = 20; d < rail.length + 60; d += 26 + rng.next() * 25) {
    const f = rail.frameAt(d);
    const side = rng.next() < 0.5 ? -1 : 1;
    const lat = side * (10 + rng.next() * 22);
    const size = 2.5 + rng.next() * 5.5;
    const base = at(f, lat, 0);
    wireAt(batch, PRIM.octa, f, lat, size * 0.55, [size * 0.7, size, size * 0.7], p.secondary, 0.5, {
      spin: rng.next() * 3,
      tilt: [rng.next() * 0.5, 0, rng.next() * 0.5],
    });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const q = base.clone().addScaledVector(f.right, Math.cos(a) * size * 0.7).addScaledVector(f.fwd, Math.sin(a) * size * 0.7);
      batch.seg(q, q.clone().addScaledVector(f.up, 1 + rng.next() * 3.5).addScaledVector(f.right, Math.cos(a) * 1.2), p.accent, 0.3);
    }
  }

  // stone arches / chains
  for (let d = 130; d < rail.length; d += 170) {
    addGate(batch, rail, d, { color: p.secondary, accent: p.accent, width: 5.6, height: 9, style: 'lava', rng });
    const f = rail.frameAt(d + 8);
    for (const side of [-1, 1]) {
      const top = at(f, side * 3.5, 7.2);
      const chainPts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 5) * Math.PI;
        chainPts.push(
          top.clone()
            .addScaledVector(f.right, side * -i * 0.2)
            .addScaledVector(f.up, -i * 0.8)
        );
      }
      polyWorld(batch, chainPts, p.secondary, 0.35);
    }
  }

  // nearer volcanoes crown the horizon, others smoulder in the distance
  addVolcano(batch, rail.frameAt(380), -34, p, rng, 1.35);
  addVolcano(batch, rail.frameAt(rail.length * 0.72), 108, p, rng, 1.3);
  addGiantGate(batch, rail, 150, { color: p.secondary, accent: p.accent, width: 10, height: 15 });
  addGiantGate(batch, rail, rail.length * 0.52, { color: p.secondary, accent: p.primary, width: 12, height: 17 });
  addGiantGate(batch, rail, rail.length * 0.84, { color: p.secondary, accent: p.accent, width: 9, height: 14 });

  // volcano silhouette and smoke
  const vf = rail.frameAt(rail.length * 0.55);
  const vb = at(vf, -80, -2);
  polyWorld(batch, [
    vb.clone().addScaledVector(vf.right, -50),
    vb.clone().addScaledVector(vf.up, 60).addScaledVector(vf.right, 8),
    vb.clone().addScaledVector(vf.right, 65),
  ], p.secondary, 0.25);
  polyWorld(batch, [
    vb.clone().addScaledVector(vf.up, 57).addScaledVector(vf.right, 5),
    vb.clone().addScaledVector(vf.up, 100).addScaledVector(vf.right, -6),
    vb.clone().addScaledVector(vf.up, 150).addScaledVector(vf.right, 14),
  ], p.primary, 0.12);
  for (let i = 0; i < 6; i++) {
    const c = vb.clone().addScaledVector(vf.up, 62 + i * 12).addScaledVector(vf.right, 8 + i * 2);
    batch.circle(c, 10 + i * 4, vf.right, vf.up, p.secondary, 0.14, 24);
  }

  // embers
  const emberPositions = [];
  for (let i = 0; i < 520; i++) {
    const d = rng.next() * rail.length;
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 44, 0.2 + rng.next() * 18);
    emberPositions.push(c.x, c.y, c.z);
  }
  const embers = buildPoints(emberPositions, p.accent, 1.25, 0.75);
  scene.add(embers);
  dyn.push({ obj: embers, type: 'twinkle', base: 0.7 });

  // molten fountains
  for (let i = 0; i < 3; i++) {
    const f = rail.frameAt(rail.length * (0.25 + i * 0.2));
    const base = at(f, (i % 2 === 0 ? 1 : -1) * (12 + i * 4), 0);
    const pts = [];
    for (let k = 0; k < 9; k++) {
      pts.push(
        base.clone()
          .addScaledVector(f.up, k * 1.6)
          .addScaledVector(f.right, Math.sin(k * 0.9) * 1.2)
      );
    }
    polyWorld(batch, pts, p.accent, 0.45);
    for (let k = 0; k < 3; k++) {
      batch.circle(base.clone().addScaledVector(f.up, 3 + k * 3.4), 1.2, f.right, f.fwd, p.primary, 0.25, 10);
    }
  }

  // arena: obsidian ring
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const f = rail.frameAt(rail.length - 230);
    const q = at(f, Math.cos(a) * 14, 0.2);
    batch.circle(q, 1.4, f.right, f.fwd, p.accent, 0.3, 6);
    batch.seg(q, q.clone().addScaledVector(f.up, 2 + rng.next() * 4), p.secondary, 0.4);
  }

  for (let d = 240; d < rail.length; d += 280) dyn.push(makeRuneRing(rail, d, { radius: 6, color: p.accent, accent: p.primary, height: 6.6, speed: -0.22 }, scene));
}

function buildCastle(batch, rail, p, rng, scene, dyn) {
  addGround(batch, rail, {
    width: 19,
    step: 9,
    lats: [0.25, 0.6, 0.95],
    color: p.secondary,
    intensity: 0.28,
    edgeColor: p.primary,
    edgeIntensity: 0.7,
    sag: 0.5,
    pathHalf: 3.4,
  });
  // central carpet / guide
  for (let d = 0; d < rail.length; d += 14) {
    const f = rail.frameAt(d);
    batch.seg(at(f, -2.4, 0.02), at(f, 2.4, 0.02), p.accent, 0.16);
  }

  // colonnade walls
  for (let d = 12; d < rail.length + 80; d += 22) {
    const f = rail.frameAt(d);
    for (const side of [-1, 1]) {
      const lat = side * 10.5;
      addColumn(batch, f, lat, { color: p.secondary, accent: p.accent, height: 11, broken: false, rng });
      // wall panel behind
      const base = at(f, side * 13.5, 0);
      const top = base.clone().addScaledVector(f.up, 12);
      batch.seg(base, top, p.secondary, 0.22);
      batch.seg(base.clone().addScaledVector(f.up, 6), top, p.secondary, 0.16);
      // gothic window
      if (Math.floor(d / 22) % 2 === 0) {
        const c = at(f, side * 13.4, 7.2);
        polyWorld(batch, [
          c.clone().addScaledVector(f.up, -3.2),
          c.clone().addScaledVector(f.up, 1.4).addScaledVector(f.right, -1.2),
          c.clone().addScaledVector(f.up, 3.4),
          c.clone().addScaledVector(f.up, 1.4).addScaledVector(f.right, 1.2),
          c.clone().addScaledVector(f.up, -3.2),
        ], p.cyan, 0.28);
        batch.seg(c.clone().addScaledVector(f.up, -3), c.clone().addScaledVector(f.up, 3.2), p.malice, 0.2);
      }
      // buttress
      if (Math.floor(d / 22) % 3 === 0) {
        const b = at(f, side * 15, 0);
        polyWorld(batch, [b, b.clone().addScaledVector(f.up, 8).addScaledVector(f.right, -side * 3), b.clone().addScaledVector(f.up, 10)], p.secondary, 0.2);
      }
    }
    // vaulted ceiling ribs
    if (Math.floor(d / 22) % 2 === 0) {
      polyWorld(batch, arcPoints(at(f, 0, 12), 11, f.right, f.up, 0, Math.PI, 16), p.secondary, 0.18);
    }
  }

  // braziers
  const lights = [];
  for (let d = 40; d < rail.length; d += 36) {
    const f = rail.frameAt(d);
    const side = Math.floor(d / 36) % 2 === 0 ? -1 : 1;
    const base = at(f, side * 7.2, 0);
    const top = base.clone().addScaledVector(f.up, 2.6);
    batch.seg(base, top, p.secondary, 0.4);
    batch.circle(top, 0.55, f.right, f.fwd, p.accent, 0.5, 8);
    // flame lines
    for (let i = 0; i < 3; i++) {
      const flame = top.clone().addScaledVector(f.up, 0.3 + i * 0.25).addScaledVector(f.right, (rng.next() - 0.5) * 0.3);
      batch.seg(top.clone().addScaledVector(f.up, -0.1), flame.clone().addScaledVector(f.up, 0.6), p.malice, 0.3 - i * 0.06);
    }
    lights.push(top.x, top.y + 0.35, top.z);
  }
  const brazierLights = buildPoints(lights, p.malice, 3.2, 0.75);
  scene.add(brazierLights);
  dyn.push({ obj: brazierLights, type: 'twinkle', base: 0.75 });

  // gates and wall eyes
  for (let d = 150; d < rail.length; d += 220) {
    addGate(batch, rail, d, { color: p.secondary, accent: p.accent, width: 5.6, height: 9.5, style: 'malice', rng });
    const f = rail.frameAt(d + 40);
    addMaliceEye(batch, f, -13.4, 5.5, 1.6, p.malice, p.accent);
    addMaliceEye(batch, f, 13.4, 8.2, 1.2, p.malice, p.accent);
  }
  // hanging chains
  for (let d = 80; d < rail.length; d += 110) {
    const f = rail.frameAt(d);
    const side = Math.floor(d / 110) % 2 === 0 ? -1 : 1;
    const top = at(f, side * 8.6, 12);
    for (let i = 0; i < 7; i++) {
      const p1 = top.clone().addScaledVector(f.up, -i * 0.9);
      const p2 = p1.clone().addScaledVector(f.up, -0.9).addScaledVector(f.right, i % 2 ? 0.25 : -0.25);
      if (i % 2 === 0) batch.seg(p1, p2, p.secondary, 0.3);
    }
    const lamp = top.clone().addScaledVector(f.up, -6.5);
    batch.circle(lamp, 0.5, f.right, f.up, p.malice, 0.5, 8);
    batch.seg(lamp, lamp.clone().addScaledVector(f.up, -0.8), p.accent, 0.4);
  }

  // throne silhouette at the end
  const tf = rail.frameAt(rail.length - 150);
  const throne = at(tf, 0, 0);
  for (let i = 0; i < 9; i++) {
    const h = 18 + i * 2;
    const lat = (i - 4) * 4.4;
    const base = throne.clone().addScaledVector(tf.right, lat);
    batch.seg(base, base.clone().addScaledVector(tf.up, h), p.secondary, 0.3);
    batch.seg(base.clone().addScaledVector(tf.up, h), base.clone().addScaledVector(tf.up, h - 2).addScaledVector(tf.right, i % 2 ? 1.2 : -1.2), p.malice, 0.3);
  }
  addMaliceEye(batch, tf, 0, 20, 4.4, p.malice, p.accent);
  batch.circle(throne.clone().addScaledVector(tf.up, 20), 8, tf.right, tf.up, p.accent, 0.2, 32);

  // floating rubble
  const rubblePositions = [];
  for (let i = 0; i < 150; i++) {
    const d = rng.next() * rail.length;
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 26, 2 + rng.next() * 16);
    rubblePositions.push(c.x, c.y, c.z);
  }
  const rubble = buildPoints(rubblePositions, p.malice, 1.4, 0.55);
  scene.add(rubble);
  dyn.push({ obj: rubble, type: 'twinkle', base: 0.55 });

  // distant spires
  for (let i = 0; i < 6; i++) {
    const d = rail.length * (0.15 + i * 0.14);
    addSpire(batch, rail, d, p, rng, i % 2 ? 1 : -1, 40 + rng.next() * 30);
  }

  for (let d = 220; d < rail.length; d += 260) dyn.push(makeRuneRing(rail, d, { radius: 5.5, color: p.malice, accent: p.accent, height: 5.4, speed: 0.3 }, scene));

  // arena dais
  const af = rail.frameAt(rail.length - 220);
  for (let i = 0; i < 4; i++) {
    const c = at(af, 0, i * 0.15);
    batch.circle(c, 18 - i * 3.5, p.accent, 0.4 - i * 0.08, 40, af.right, af.fwd);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addColumn(batch, af, Math.cos(a) * 16, { color: p.secondary, accent: p.malice, height: 13, broken: false, rng });
  }
  addMaliceEye(batch, af, 0, 14, 3.2, p.malice, p.accent);
}

/* ------------------------------------------------------------------ */
/* public builder                                                     */
/* ------------------------------------------------------------------ */

export function buildEnvironment(scene, stage, rail) {
  const p = stage.palette;
  const group = new THREE.Group();
  group.name = 'environment';
  scene.add(group);

  const batch = new LineBatch();
  const rng = seeded(stage.rail.seed * 7 + 3);
  const dyn = [];

  const builders = {
    field: buildField,
    woods: buildWoods,
    mountain: buildMountain,
    castle: buildCastle,
  };
  (builders[stage.id] || buildField)(batch, rail, p, rng, group, dyn);

  // Stars / dust above the world.
  const stars = [];
  for (let i = 0; i < 360; i++) {
    const d = rng.next() * (rail.length + 200);
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 360, 25 + rng.next() * 160, rng.next() * 40);
    stars.push(c.x, c.y, c.z);
  }
  const starPoints = buildPoints(stars, p.accent, 0.85, 0.5, getDotTexture(), false);
  group.add(starPoints);

  // Near-field drifting motes.
  const motes = [];
  for (let i = 0; i < 260; i++) {
    const d = rng.next() * rail.length;
    const f = rail.frameAt(d);
    const c = at(f, (rng.next() - 0.5) * 26, 0.5 + rng.next() * 12);
    motes.push(c.x, c.y, c.z);
  }
  const motePoints = buildPoints(motes, p.primary, 0.9, 0.38);
  group.add(motePoints);
  dyn.push({ obj: motePoints, type: 'twinkle', base: 0.38, speed: 0.6 });

  const lines = batch.build(1);
  group.add(lines);

  // Move the dynamic objects that were added to the scene during build into our group.
  for (const d of dyn) {
    if (d.obj && d.obj.parent === scene && d.obj.type !== 'none') {
      scene.remove(d.obj);
      group.add(d.obj);
    }
  }

  function update(dt, playerDistance, elapsed) {
    for (const d of dyn) {
      if (!d.obj) continue;
      if (d.type === 'spin') {
        d.obj.rotateZ(d.speed * dt);
      } else if (d.type === 'twinkle') {
        const mat = d.obj.material;
        if (mat) mat.opacity = clamp(d.base + Math.sin(elapsed * 1.7 + d.obj.id) * 0.16, 0, 1);
      }
    }
  }

  function dispose() {
    group.traverse((child) => {
      if (child.geometry && !child.geometry.userData?.shared) child.geometry.dispose();
      if (child.material && !child.material.userData?.shared) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
        else child.material.dispose?.();
      }
    });
    if (group.parent) group.parent.remove(group);
  }

  return { group, update, dispose, lines };
}

/* ------------------------------------------------------------------ */
/* extra dynamic set-pieces                                           */
/* ------------------------------------------------------------------ */

export function buildWarpGate(scene, color = 0x7bffc4) {
  const group = new THREE.Group();
  const geoms = [];
  for (let i = 0; i < 3; i++) {
    const pts = [];
    const r = 3 + i * 0.9;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, lineMaterial(color, { opacity: 0.5 - i * 0.1 }));
    line.renderOrder = 2;
    group.add(line);
    geoms.push(geo);
  }
  group.visible = false;
  scene.add(group);
  return {
    group,
    show(pos) {
      group.position.copy(pos);
      group.visible = true;
    },
    hide() {
      group.visible = false;
    },
    update(dt, camera) {
      group.quaternion.copy(camera.quaternion);
      group.rotation.z += dt * 0.6;
    },
    dispose() {
      geoms.forEach((g) => g.dispose());
      group.removeFromParent();
    },
  };
}
