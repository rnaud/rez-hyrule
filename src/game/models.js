import * as THREE from 'three';
import {
  PRIM,
  edgesOf,
  lineMaterial,
  glowSprite,
  triforceSegments,
} from './util.js';

/* ------------------------------------------------------------------ */
/* construction helpers                                               */
/* ------------------------------------------------------------------ */

const fillMaterials = new Map();
function fillMaterial(color, opacity = 0.22) {
  const key = `${color}|${opacity}`;
  let m = fillMaterials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      fog: true,
    });
    m.userData.shared = true;
    fillMaterials.set(key, m);
  }
  return m;
}

function V(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function applyTransform(obj, { pos, rot, scale } = {}) {
  if (pos) obj.position.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
  if (rot) obj.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
  if (scale !== undefined) {
    if (typeof scale === 'number') obj.scale.setScalar(scale);
    else obj.scale.set(scale[0], scale[1], scale[2]);
  }
}

function addWire(parent, geometry, color, opts = {}) {
  const { opacity = 1, threshold = 1, name } = opts;
  const line = new THREE.LineSegments(edgesOf(geometry, threshold), lineMaterial(color, { opacity }));
  line.renderOrder = 3;
  applyTransform(line, opts);
  if (name) line.name = name;
  parent.add(line);
  return line;
}

function addFill(parent, geometry, color, opacity = 0.2, opts = {}) {
  const mesh = new THREE.Mesh(geometry, fillMaterial(color, opacity));
  mesh.renderOrder = 1;
  applyTransform(mesh, opts);
  parent.add(mesh);
  return mesh;
}

function addPath(parent, points, color, opts = {}) {
  const { opacity = 1, closed = false, name } = opts;
  const vecs = points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2])));
  const segs = [];
  for (let i = 0; i < vecs.length - 1; i++) segs.push(vecs[i], vecs[i + 1]);
  if (closed && vecs.length > 2) segs.push(vecs[vecs.length - 1], vecs[0]);
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  geo.userData.shared = true;
  const line = new THREE.LineSegments(geo, lineMaterial(color, { opacity }));
  line.renderOrder = 3;
  applyTransform(line, opts);
  if (name) line.name = name;
  parent.add(line);
  return line;
}

function addShape(parent, triangles, color, opts = {}) {
  // Flat glowing plane from triangle definitions, in local XY.
  const positions = [];
  for (const t of triangles) {
    const [a, b, c] = t;
    positions.push(a[0], a[1], a[2] ?? 0, b[0], b[1], b[2] ?? 0, c[0], c[1], c[2] ?? 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.userData.shared = true;
  const mesh = new THREE.Mesh(geo, fillMaterial(color, opts.opacity ?? 0.16));
  mesh.renderOrder = 1;
  applyTransform(mesh, opts);
  parent.add(mesh);
  return mesh;
}

function addGlow(parent, color, size, pos, opacity = 0.9, name) {
  const s = glowSprite(color, size, opacity);
  s.position.set(pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0);
  s.renderOrder = 4;
  if (name) s.name = name;
  parent.add(s);
  return s;
}

function addTri(parent, points, color, opacity = 1) {
  return addPath(parent, points, color, { closed: true, opacity });
}

function addTriforce(parent, size, color, pos, rot = [0, 0, 0], opacity = 1) {
  const pts = triforceSegments(size);
  const group = new THREE.Group();
  const segs = pts;
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  geo.userData.shared = true;
  const line = new THREE.LineSegments(geo, lineMaterial(color, { opacity }));
  line.renderOrder = 3;
  group.add(line);
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(group);
  return group;
}

/* ------------------------------------------------------------------ */
/* THE HERO                                                           */
/* ------------------------------------------------------------------ */

export function createLink() {
  const root = new THREE.Group();
  root.name = 'link';

  const COL = {
    tunic: 0x58e396,
    tunicDark: 0x1f6646,
    skin: 0xe4b589,
    hair: 0xe8c45d,
    gold: 0xecc56b,
    boot: 0x8a5b33,
    shield: 0x4cb8dd,
    shieldDeep: 0x0e2f3c,
    sword: 0xc4ecff,
    steel: 0x8fc4de,
    fairy: 0xffe7a3,
  };

  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);

  // --- legs & boots ---
  const legGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.62, 5);
  for (const side of [-1, 1]) {
    addWire(body, legGeo, COL.tunicDark, {
      pos: [side * 0.16, 0.62, 0],
      rot: [0.04, 0, side * 0.03],
      opacity: 0.9,
    });
    addWire(body, new THREE.BoxGeometry(0.2, 0.16, 0.34), COL.boot, {
      pos: [side * 0.17, 0.28, -0.05],
      name: side < 0 ? 'legL' : 'legR',
    });
  }

  // --- tunic / torso ---
  const tunicGeo = new THREE.CylinderGeometry(0.34, 0.55, 0.92, 6);
  addFill(body, tunicGeo, 0x114c32, 0.85, { pos: [0, 1.18, 0] });
  addWire(body, tunicGeo, COL.tunic, { pos: [0, 1.18, 0] });
  // skirt hem
  addPath(body, [
    V(-0.55, 0.73, 0.18),
    V(0.55, 0.73, 0.18),
  ], COL.tunic, { opacity: 0.75 });
  // belt
  addWire(body, new THREE.TorusGeometry(0.42, 0.035, 4, 8), COL.gold, {
    pos: [0, 0.86, 0],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 0.82, 1],
  });
  addWire(body, new THREE.OctahedronGeometry(0.09), COL.gold, { pos: [0, 0.85, 0.4] });

  // --- shoulders / articulated arms ---
  const shoulderY = 1.55;
  for (const side of [-1, 1]) {
    // Layered pauldrons, not just floating joints.
    addWire(body, new THREE.IcosahedronGeometry(0.19), COL.tunic, {
      pos: [side * 0.4, shoulderY, 0],
      scale: [1.15, 0.7, 1],
    });
    addWire(body, new THREE.ConeGeometry(0.16, 0.3, 4), COL.tunicDark, {
      pos: [side * 0.47, shoulderY + 0.09, 0],
      rot: [0, 0, side * -1.1],
      scale: [1, 1, 0.65],
      opacity: 0.65,
    });
    addWire(body, new THREE.TorusGeometry(0.17, 0.018, 4, 8), COL.gold, {
      pos: [side * 0.4, shoulderY - 0.13, 0],
      rot: [Math.PI / 2, 0, 0],
      opacity: 0.55,
    });
  }

  function buildArm(side) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(side * 0.43, shoulderY - 0.02, 0);
    body.add(arm);

    // Sleeve / upper arm.
    addWire(arm, new THREE.CylinderGeometry(0.08, 0.065, 0.35, 5), COL.tunic, {
      pos: [0, -0.17, 0],
    });
    addWire(arm, new THREE.IcosahedronGeometry(0.085), COL.tunicDark, {
      pos: [0, -0.34, 0],
      opacity: 0.8,
    });

    const fore = new THREE.Group();
    fore.name = side < 0 ? 'foreL' : 'foreR';
    fore.position.set(0, -0.34, 0);
    arm.add(fore);

    // Forearm and fitted bracer.
    addWire(fore, new THREE.CylinderGeometry(0.064, 0.052, 0.34, 5), COL.skin, {
      pos: [0, -0.17, 0],
    });
    addWire(fore, new THREE.CylinderGeometry(0.078, 0.062, 0.13, 5), COL.tunicDark, {
      pos: [0, -0.27, 0],
      opacity: 0.75,
    });
    addWire(fore, new THREE.TorusGeometry(0.064, 0.015, 4, 8), COL.gold, {
      pos: [0, -0.23, 0],
      rot: [Math.PI / 2, 0, 0],
      opacity: 0.75,
    });

    const hand = new THREE.Group();
    hand.name = side < 0 ? 'handL' : 'handR';
    hand.position.set(0, -0.38, 0.02);
    fore.add(hand);
    addFill(hand, new THREE.IcosahedronGeometry(0.082), 0x332419, 0.82, { scale: [0.9, 1.05, 0.72] });
    addWire(hand, new THREE.IcosahedronGeometry(0.082), COL.skin, { scale: [0.9, 1.05, 0.72] });

    if (side < 0) {
      // Open left palm: fingers and a faint sacred sigil.
      for (let i = -1; i <= 1; i++) {
        addPath(hand, [
          V(i * 0.035, -0.045, 0.035),
          V(i * 0.065, -0.135, 0.075),
          V(i * 0.055, -0.19, 0.1),
        ], COL.skin, { opacity: 0.8 });
      }
      addPath(hand, [
        V(-0.065, -0.01, 0.03),
        V(-0.14, -0.055, 0.075),
        V(-0.15, -0.12, 0.1),
      ], COL.skin, { opacity: 0.75 });
      addGlow(hand, 0x8ef7ff, 0.5, [0, -0.035, 0.06], 0.18, 'handGlow');
      addPath(hand, [V(0, 0.105, 0.045), V(-0.11, -0.08, 0.045), V(0.11, -0.08, 0.045)], 0xbfffff, {
        closed: true,
        opacity: 0.55,
        name: 'handSigil',
      });
      addPath(hand, [V(0, 0.04, 0.046), V(-0.055, -0.04, 0.046), V(0.055, -0.04, 0.046)], 0xbfffff, {
        closed: true,
        opacity: 0.3,
      });
    } else {
      // Sword hand: knuckles wrap around the grip.
      for (let i = -1; i <= 1; i++) {
        addPath(hand, [
          V(i * 0.04, -0.025, 0.04),
          V(i * 0.055, -0.11, 0.12),
          V(i * 0.025, -0.16, 0.16),
        ], COL.skin, { opacity: 0.75 });
      }
    }
    return { arm, fore, hand };
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  const armL = leftArm.arm;
  const armR = rightArm.arm;
  const foreL = leftArm.fore;
  const foreR = rightArm.fore;
  const handL = leftArm.hand;
  const handR = rightArm.hand;

  // --- Master Sword, lengthened and brightened so it reads from the chase camera ---
  const sword = new THREE.Group();
  sword.name = 'sword';
  sword.position.set(0, 0.03, 0.04);
  sword.rotation.set(0.1, 0, -0.08);
  handR.add(sword);
  addWire(sword, new THREE.BoxGeometry(0.095, 1.12, 0.065), COL.sword, {
    pos: [0, -0.63, 0],
  });
  addWire(sword, new THREE.BoxGeometry(0.025, 1.08, 0.095), 0xf1ffff, {
    pos: [0, -0.64, 0],
    opacity: 0.55,
  });
  addWire(sword, new THREE.ConeGeometry(0.048, 0.2, 4), COL.sword, {
    pos: [0, -1.27, 0],
    rot: [Math.PI, 0, 0],
  });
  // Swept guard and wrapped grip.
  addWire(sword, new THREE.BoxGeometry(0.38, 0.055, 0.08), COL.gold, { pos: [0, -0.02, 0] });
  for (const side of [-1, 1]) {
    addPath(sword, [
      V(side * 0.2, -0.02, 0),
      V(side * 0.31, 0.075, 0),
      V(side * 0.24, 0.14, 0),
      V(side * 0.17, 0.035, 0),
    ], COL.gold, { opacity: 0.8 });
  }
  addWire(sword, new THREE.CylinderGeometry(0.04, 0.04, 0.26, 5), 0x2f7d5c, {
    pos: [0, 0.12, 0],
  });
  for (let i = 0; i < 3; i++) {
    addWire(sword, new THREE.TorusGeometry(0.042, 0.008, 3, 8), COL.gold, {
      pos: [0, 0.03 + i * 0.09, 0],
      rot: [Math.PI / 2, 0, 0],
      opacity: 0.65,
    });
  }
  addWire(sword, new THREE.OctahedronGeometry(0.085), COL.gold, { pos: [0, 0.29, 0] });
  addTriforce(sword, 0.09, COL.gold, [0, -0.02, 0.07], [0, 0, 0], 0.8);
  const swordGlow = addGlow(sword, 0xbff6ff, 0.32, [0, -0.66, 0], 0.26, 'swordGlow');
  swordGlow.renderOrder = 2;
  const tipGlow = addGlow(sword, 0xe6ffff, 0.24, [0, -1.29, 0], 0.35, 'tipGlow');
  tipGlow.renderOrder = 3;
  const swordTip = new THREE.Object3D();
  swordTip.name = 'swordTip';
  swordTip.position.set(0, -1.36, 0);
  sword.add(swordTip);

  // --- head ---
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.94, 0);
  body.add(head);
  const skullGeo = new THREE.IcosahedronGeometry(0.3, 1);
  addFill(head, skullGeo, 0x332419, 0.75);
  addWire(head, skullGeo, COL.skin, { scale: [1, 1.05, 0.95] });
  // ears
  for (const side of [-1, 1]) {
    addWire(head, new THREE.ConeGeometry(0.07, 0.28, 4), COL.skin, {
      pos: [side * 0.3, 0.03, 0],
      rot: [0, 0, side * -Math.PI / 2.3],
    });
  }
  // hair fringe visible from behind
  addPath(head, [
    V(-0.26, 0.24, 0.02),
    V(-0.12, 0.16, 0.26),
    V(0.05, 0.22, 0.25),
    V(0.2, 0.14, 0.12),
  ], COL.hair, { opacity: 0.9 });

  // --- green cap, trailing back toward camera ---
  const capPivot = new THREE.Group();
  capPivot.name = 'cap';
  capPivot.position.set(0, 2.1, 0.02);
  capPivot.rotation.x = 1.02;
  body.add(capPivot);
  const capGeo = new THREE.ConeGeometry(0.33, 1.05, 5);
  addFill(capPivot, capGeo, 0x0e3f2c, 0.78, { pos: [0, 0.4, 0] });
  addWire(capPivot, capGeo, COL.tunic, { pos: [0, 0.4, 0] });
  const capTip = new THREE.Group();
  capTip.name = 'capTip';
  capTip.position.set(0, 0.88, 0);
  capPivot.add(capTip);
  addWire(capTip, new THREE.ConeGeometry(0.11, 0.34, 4), COL.tunic, { pos: [0, 0.15, 0], rot: [0.2, 0, 0.3] });

  // --- Hylian shield on the back ---
  const shield = new THREE.Group();
  shield.name = 'shield';
  shield.position.set(0, 1.33, 0.42);
  // Keep the decorated face toward the chase camera; Link carries it across his back.
  shield.rotation.set(0.06, 0, 0.1);
  body.add(shield);
  const shieldGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.06, 6);
  addFill(shield, shieldGeo, COL.shieldDeep, 0.92, { rot: [Math.PI / 2, 0, 0] });
  addWire(shield, shieldGeo, COL.gold, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 1.1] });
  const inner = new THREE.CylinderGeometry(0.46, 0.46, 0.07, 6);
  addWire(shield, inner, COL.shield, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.02] });
  // A second ring of silver inlay catches the bloom.
  addWire(shield, new THREE.CylinderGeometry(0.34, 0.34, 0.075, 6), 0xbff6ff, {
    rot: [Math.PI / 2, 0, 0],
    pos: [0, 0, 0.04],
    opacity: 0.45,
  });
  addShape(shield, [
    [[0, 0.3, 0.09], [-0.18, 0.0, 0.09], [0.18, 0.0, 0.09]],
    [[-0.2, 0.02, 0.09], [-0.38, -0.3, 0.09], [-0.02, -0.3, 0.09]],
    [[0.2, 0.02, 0.09], [0.02, -0.3, 0.09], [0.38, -0.3, 0.09]],
  ], COL.gold, { opacity: 0.55 });
  addTriforce(shield, 0.42, COL.gold, [0, -0.03, 0.1], [0, 0, 0], 1);
  // shield crest wings
  addPath(shield, [
    V(-0.42, 0.1, 0.06),
    V(-0.55, 0.34, 0.06),
    V(-0.3, 0.26, 0.06),
    V(-0.2, 0.4, 0.06),
  ], COL.gold, { opacity: 0.65 });
  addPath(shield, [
    V(0.42, 0.1, 0.06),
    V(0.55, 0.34, 0.06),
    V(0.3, 0.26, 0.06),
    V(0.2, 0.4, 0.06),
  ], COL.gold, { opacity: 0.65 });

  // --- fairy companion ---
  const fairy = new THREE.Group();
  fairy.name = 'fairy';
  body.add(fairy);
  addGlow(fairy, COL.fairy, 0.3, [0, 0, 0], 0.55);
  const fairyRing = addPath(fairy, Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return V(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0);
  }), COL.fairy, { closed: true, opacity: 0.5 });
  fairyRing.renderOrder = 4;

  // --- sacred platform / aura ---
  const aura = new THREE.Group();
  aura.name = 'aura';
  aura.position.y = 0.02;
  root.add(aura);
  const ringPts = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return V(Math.cos(a) * 1.18, 0, Math.sin(a) * 1.18);
  });
  addPath(aura, ringPts, COL.gold, { opacity: 0.5 });
  const innerPts = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return V(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72);
  });
  addPath(aura, innerPts, COL.tunic, { opacity: 0.35 });
  addTri(aura, [V(0, 0, -0.58), V(0.5, 0, 0.29), V(-0.5, 0, 0.29)], COL.gold, 0.6);
  const runes = new THREE.Group();
  runes.name = 'runes';
  aura.add(runes);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addPath(runes, [
      V(Math.cos(a) * 1.36, 0, Math.sin(a) * 1.36),
      V(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55),
    ], COL.tunic, { opacity: 0.4 });
  }
  addGlow(aura, 0x7bffb4, 1.2, [0, 0.1, 0], 0.025);

  root.userData.parts = {
    body,
    head,
    cap: capPivot,
    capTip,
    armL,
    armR,
    foreL,
    foreR,
    handL,
    handR,
    sword,
    swordTip,
    swordGlow,
    tipGlow,
    handGlow: handL.getObjectByName('handGlow'),
    handSigil: handL.getObjectByName('handSigil'),
    shield,
    fairy,
    aura,
    runes,
    colors: COL,
  };

  markShared(root);
  return root;
}

/* ------------------------------------------------------------------ */
/* BESTIARY                                                           */
/* ------------------------------------------------------------------ */

function makeKeese() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  addFill(body, PRIM.octa, 0x3b0d45, 0.42, { scale: [0.38, 0.48, 0.34] });
  addWire(body, PRIM.octa, 0xd77bff, { scale: [0.4, 0.5, 0.36] });
  // ears / horns
  for (const side of [-1, 1]) {
    addWire(body, new THREE.ConeGeometry(0.09, 0.36, 3), 0xff7cd6, {
      pos: [side * 0.16, 0.42, 0.02],
      rot: [0, 0, side * 0.38],
      scale: [1, 1, 0.6],
    });
  }
  addGlow(body, 0xff5fb9, 0.24, [-0.12, 0.08, 0.28], 0.8);
  addGlow(body, 0xff5fb9, 0.24, [0.12, 0.08, 0.28], 0.8);
  addPath(body, [
    V(-0.07, -0.3, 0),
    V(0, -0.48, 0.05),
    V(0.07, -0.3, 0),
  ], 0x9e4bff, { opacity: 0.8 });

  const wingPts = [
    V(0, 0, 0),
    V(0.42, 0.18, -0.04),
    V(0.96, 0.58, -0.1),
    V(0.7, 0.16, -0.02),
    V(0.46, -0.1, 0.02),
    V(0, -0.04, 0),
  ];
  const wingR = new THREE.Group();
  wingR.name = 'wingR';
  wingR.position.set(0.2, 0.12, 0);
  body.add(wingR);
  addPath(wingR, wingPts, 0xd77bff, { opacity: 0.85, closed: true });
  addPath(wingR, [V(0.18, 0.08, 0), V(0.62, 0.3, -0.03), V(0.9, 0.52, -0.07)], 0xff8fdc, { opacity: 0.6 });
  addShape(wingR, [
    [[0, 0, 0], [0.42, 0.18, -0.04], [0.96, 0.58, -0.1]],
    [[0, 0, 0], [0.96, 0.58, -0.1], [0.46, -0.1, 0.02]],
  ], 0x8b2bc4, 0.16);

  const wingL = wingR.clone();
  wingL.name = 'wingL';
  wingL.position.x = -0.2;
  wingL.scale.x = -1;
  body.add(wingL);

  body.position.y = 0.2;
  markShared(root);
  return root;
}

function makeOctorok() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);

  const domeGeo = new THREE.IcosahedronGeometry(0.62, 1);
  addFill(body, domeGeo, 0x043b3b, 0.5, { scale: [1, 0.9, 1] });
  addWire(body, domeGeo, 0x5ef7d4, { scale: [1, 0.9, 1] });
  addWire(body, PRIM.torus, 0xa8fff0, {
    pos: [0, -0.05, 0],
    rot: [Math.PI / 2, 0, 0],
    scale: [0.62, 0.62, 0.4],
    opacity: 0.6,
  });

  // snout
  addWire(body, new THREE.ConeGeometry(0.28, 0.5, 5), 0x5ef7d4, {
    pos: [0, 0.1, 0.6],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.7],
  });
  addGlow(body, 0xff76b8, 0.28, [-0.25, 0.3, 0.5], 0.8);
  addGlow(body, 0xff76b8, 0.28, [0.25, 0.3, 0.5], 0.8);

  // tentacles
  const tentacles = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.name = `tentacle${i}`;
    pivot.position.set(Math.cos(a) * 0.32, -0.34, Math.sin(a) * 0.32);
    pivot.rotation.y = -a;
    addPath(pivot, [
      V(0, 0, 0),
      V(0.08, -0.35, 0.05),
      V(0.18, -0.7, 0.12),
      V(0.12, -0.98, 0.16),
    ], 0x46e3c2, { opacity: 0.85 });
    body.add(pivot);
    tentacles.push(pivot);
  }

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addPath(body, [
      V(Math.cos(a) * 0.3, 0.58, Math.sin(a) * 0.3),
      V(Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4),
    ], 0x9ffff0, { opacity: 0.5 });
  }

  markShared(root);
  return root;
}

function makeBaba() {
  const root = new THREE.Group();
  const stem = new THREE.Group();
  root.add(stem);
  addPath(stem, [
    V(-0.28, -1.7, 0),
    V(-0.18, -1.1, 0.14),
    V(-0.06, -0.5, 0.05),
    V(0, 0, 0),
  ], 0x54d98b, { opacity: 0.9 });
  addPath(stem, [
    V(-0.28, -1.7, 0),
    V(-0.12, -1.2, 0.22),
    V(0.08, -0.7, 0.12),
    V(0, 0, 0),
  ], 0x1f7a4a, { opacity: 0.55 });
  // leaves
  for (const side of [-1, 1]) {
    addPath(stem, [
      V(0, -1.2, 0),
      V(side * 0.75, -0.95, 0.12),
      V(side * 0.62, -0.72, 0.2),
    ], 0x54d98b, { opacity: 0.75 });
  }

  const head = new THREE.Group();
  head.position.y = 0.22;
  stem.add(head);
  const bulb = new THREE.IcosahedronGeometry(0.62, 1);
  addFill(head, bulb, 0x1a4029, 0.45, { scale: [1, 0.85, 0.9] });
  addWire(head, bulb, 0x79ffb6, { scale: [1, 0.85, 0.9] });

  const jawUpper = new THREE.Group();
  jawUpper.name = 'jawUpper';
  jawUpper.position.set(0, 0.14, 0.18);
  head.add(jawUpper);
  addWire(jawUpper, new THREE.ConeGeometry(0.5, 0.55, 5), 0x9dffc9, {
    pos: [0, 0.15, 0.18],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.55],
    opacity: 0.95,
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addTri(jawUpper, [
      V(Math.cos(a) * 0.38, 0.02 + Math.sin(a) * 0.2, 0.36),
      V(Math.cos(a) * 0.45, 0.02 + Math.sin(a) * 0.25, 0.52),
      V(Math.cos(a + 0.3) * 0.3, 0.02 + Math.sin(a + 0.3) * 0.16, 0.4),
    ], 0xf4ffe0, 0.85);
  }
  const jawLower = new THREE.Group();
  jawLower.name = 'jawLower';
  jawLower.position.set(0, -0.18, 0.18);
  head.add(jawLower);
  addWire(jawLower, new THREE.ConeGeometry(0.44, 0.45, 5), 0x52d98d, {
    pos: [0, -0.12, 0.16],
    rot: [-Math.PI / 2, 0, 0],
    scale: [1, 1, 0.5],
    opacity: 0.9,
  });
  addGlow(head, 0xff67b3, 0.55, [0, 0.05, 0.42], 0.85);
  addGlow(head, 0xffe6f2, 0.18, [-0.25, 0.34, 0.35], 0.6);
  addGlow(head, 0xffe6f2, 0.18, [0.25, 0.34, 0.35], 0.6);

  // vines
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    addPath(head, [
      V(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5),
      V(Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8),
      V(Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7),
    ], 0x2d8a58, { opacity: 0.6 });
  }

  markShared(root);
  return root;
}

function makeStalfos() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bone = 0xdceee1;
  const ghost = 0x6fe8ff;

  // legs
  for (const side of [-1, 1]) {
    addWire(body, new THREE.CylinderGeometry(0.06, 0.05, 0.8, 4), bone, {
      pos: [side * 0.17, 0.4, 0],
      rot: [0.12, 0, side * 0.06],
      opacity: 0.85,
    });
    addWire(body, new THREE.CylinderGeometry(0.055, 0.05, 0.72, 4), bone, {
      pos: [side * 0.23, 1.0, -0.03],
      rot: [-0.15, 0, side * 0.02],
      opacity: 0.8,
    });
  }
  // pelvis / spine
  addWire(body, new THREE.BoxGeometry(0.5, 0.18, 0.28), bone, { pos: [0, 0.8, 0], opacity: 0.8 });
  addWire(body, new THREE.CylinderGeometry(0.05, 0.05, 0.7, 4), bone, { pos: [0, 1.25, 0], opacity: 0.8 });
  for (let i = 0; i < 3; i++) {
    const y = 1.05 + i * 0.16;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const a = (k / 5) * Math.PI;
      pts.push(V(Math.cos(a) * 0.33, y - Math.sin(a) * 0.05, Math.sin(a) * 0.2));
    }
    addPath(body, pts, bone, { opacity: 0.62 });
  }
  // shoulders
  addWire(body, new THREE.BoxGeometry(1.0, 0.1, 0.16), bone, { pos: [0, 1.55, 0], opacity: 0.8 });
  // skull
  const skull = new THREE.IcosahedronGeometry(0.34, 1);
  addFill(body, skull, 0x213329, 0.35, { pos: [0, 1.8, 0], scale: [1, 1.05, 0.92] });
  addWire(body, skull, bone, { pos: [0, 1.8, 0], scale: [1, 1.05, 0.92] });
  addWire(body, new THREE.BoxGeometry(0.3, 0.12, 0.2), bone, { pos: [0, 1.58, 0.12], opacity: 0.8 });
  addGlow(body, 0x8bf5ff, 0.32, [-0.13, 1.82, 0.28], 0.95);
  addGlow(body, 0xff7ab5, 0.3, [0.13, 1.82, 0.28], 0.75);
  addPath(body, [
    V(-0.19, 2.02, 0.05),
    V(-0.28, 2.26, 0),
  ], bone, { opacity: 0.8 });
  addPath(body, [
    V(0.19, 2.02, 0.05),
    V(0.29, 2.28, 0),
  ], bone, { opacity: 0.8 });
  // arms
  addPath(body, [
    V(-0.5, 1.52, 0),
    V(-0.66, 1.12, 0.12),
    V(-0.55, 0.82, 0.34),
  ], bone, { opacity: 0.8 });
  addPath(body, [
    V(0.5, 1.52, 0),
    V(0.7, 1.15, 0.08),
    V(0.6, 0.88, -0.1),
  ], bone, { opacity: 0.8 });
  // rusty sword
  addWire(body, new THREE.BoxGeometry(0.05, 0.9, 0.08), 0xa9e4e0, {
    pos: [-0.58, 0.5, 0.5],
    rot: [0.5, 0, 0.35],
  });
  addWire(body, new THREE.BoxGeometry(0.22, 0.05, 0.05), 0x8b6b3d, {
    pos: [-0.72, 0.93, 0.32],
    rot: [0.5, 0, 0.35],
  });
  // tattered cloak
  addPath(body, [
    V(-0.4, 1.48, -0.15),
    V(-0.6, 0.7, -0.25),
    V(-0.28, 0.95, -0.2),
    V(0.05, 0.55, -0.24),
    V(0.3, 0.9, -0.2),
    V(0.55, 0.7, -0.18),
    V(0.42, 1.5, -0.12),
  ], 0x2f6b5b, { opacity: 0.35 });

  markShared(root);
  return root;
}

function makeBeamos() {
  const root = new THREE.Group();
  const base = new THREE.Group();
  root.add(base);
  const stone = 0xe0a85a;
  const eye = 0xff5b8f;

  addWire(base, new THREE.CylinderGeometry(0.55, 0.7, 0.3, 6), stone, { pos: [0, 0.15, 0] });
  addWire(base, new THREE.CylinderGeometry(0.5, 0.58, 0.4, 6), 0xb47933, { pos: [0, 0.5, 0], opacity: 0.8 });
  addWire(base, new THREE.CylinderGeometry(0.42, 0.5, 1.25, 6), stone, { pos: [0, 1.32, 0], opacity: 0.85 });
  addFill(base, new THREE.CylinderGeometry(0.42, 0.5, 1.25, 6), 0x2a1808, 0.35, { pos: [0, 1.32, 0] });

  // rotating stone rings
  const ring1 = new THREE.Group();
  ring1.name = 'ring1';
  ring1.position.y = 1.42;
  base.add(ring1);
  addWire(ring1, PRIM.torus, 0xffd58a, { rot: [Math.PI / 2, 0, 0], scale: [0.62, 0.62, 0.7], opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    addWire(ring1, new THREE.ConeGeometry(0.1, 0.3, 4), stone, {
      pos: [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62],
      rot: [0, -a, Math.PI / 2],
      opacity: 0.8,
    });
  }
  const ring2 = new THREE.Group();
  ring2.name = 'ring2';
  ring2.position.y = 0.92;
  base.add(ring2);
  addWire(ring2, PRIM.torus, 0xffd58a, { rot: [Math.PI / 2, 0, 0], scale: [0.6, 0.6, 0.7], opacity: 0.6 });

  // head + eye
  addWire(base, new THREE.IcosahedronGeometry(0.44, 1), stone, {
    pos: [0, 2.1, 0],
    scale: [1, 0.85, 1],
  });
  addGlow(base, eye, 1.15, [0, 2.12, 0.36], 0.9, 'eye');
  addWire(base, new THREE.TorusGeometry(0.2, 0.03, 4, 8), 0xffd0e0, {
    pos: [0, 2.12, 0.42],
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    addWire(base, new THREE.ConeGeometry(0.12, 0.55, 3), stone, {
      pos: [Math.cos(a) * 0.32, 2.45, Math.sin(a) * 0.32],
      rot: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4],
      opacity: 0.65,
    });
  }

  markShared(root);
  return root;
}

function makeWizzrobe() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const violet = 0xc48bff;
  const cyan = 0x72ecff;

  const robeGeo = new THREE.ConeGeometry(0.62, 1.7, 6);
  addFill(body, robeGeo, 0x200d3a, 0.55, { pos: [0, 0.85, 0] });
  addWire(body, robeGeo, violet, { pos: [0, 0.85, 0], opacity: 0.95 });
  addWire(body, new THREE.TorusGeometry(0.63, 0.04, 4, 8), cyan, {
    pos: [0, 0.02, 0],
    rot: [Math.PI / 2, 0, 0],
    opacity: 0.7,
  });
  // hood
  addWire(body, new THREE.ConeGeometry(0.4, 0.8, 5), violet, { pos: [0, 1.95, 0], rot: [0.16, 0, 0] });
  addWire(body, new THREE.IcosahedronGeometry(0.26), 0x2b1547, { pos: [0, 1.75, 0.16], opacity: 0.8 });
  addGlow(body, cyan, 0.33, [-0.1, 1.78, 0.36], 0.95);
  addGlow(body, 0xff6abe, 0.33, [0.1, 1.78, 0.36], 0.9);
  // sleeves
  addPath(body, [
    V(-0.36, 1.4, 0.05),
    V(-0.8, 1.15, 0.24),
    V(-1.02, 0.98, 0.38),
  ], violet, { opacity: 0.8 });
  addPath(body, [
    V(0.36, 1.4, 0.05),
    V(0.8, 1.2, 0.2),
    V(1.0, 1.05, 0.32),
  ], violet, { opacity: 0.8 });
  addGlow(body, cyan, 0.22, [-1.02, 0.98, 0.4], 0.75);
  addGlow(body, cyan, 0.22, [1.0, 1.05, 0.34], 0.75);
  // staff
  const staff = new THREE.Group();
  staff.position.set(1.0, 0.9, 0.3);
  staff.rotation.z = -0.18;
  body.add(staff);
  addWire(staff, new THREE.CylinderGeometry(0.035, 0.045, 1.6, 4), 0x7a552f, { pos: [0, 0.2, 0] });
  addWire(staff, new THREE.OctahedronGeometry(0.16), cyan, { pos: [0, 1.05, 0], scale: [1, 1.4, 1] });
  const orb = addGlow(staff, cyan, 0.9, [0, 1.05, 0], 0.95, 'orb');
  // arcane ring
  const runes = new THREE.Group();
  runes.name = 'runes';
  runes.position.y = 1.0;
  body.add(runes);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addPath(runes, [
      V(Math.cos(a) * 1.0, 0.5, Math.sin(a) * 1.0),
      V(Math.cos(a + 0.35) * 1.15, 0.52, Math.sin(a + 0.35) * 1.15),
    ], 0x9b6bff, { opacity: 0.45 });
  }

  markShared(root);
  return root;
}
function makeArmos() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const stone = 0xd9b66f;
  const dark = 0x745734;
  const cyan = 0x8ef7ff;
  const gold = 0xffdc7c;

  // Squat stone legs and skirt.
  for (const side of [-1, 1]) {
    addWire(body, new THREE.BoxGeometry(0.5, 0.7, 0.6), dark, {
      pos: [side * 0.52, 0.4, 0],
      rot: [0.04, 0, side * 0.05],
      opacity: 0.8,
    });
  }
  addWire(body, new THREE.CylinderGeometry(0.9, 1.15, 0.55, 6), stone, { pos: [0, 0.85, 0] });
  // Torso and shoulders.
  const chest = new THREE.BoxGeometry(1.5, 1.35, 0.9);
  addFill(body, chest, 0x272014, 0.5, { pos: [0, 1.8, 0] });
  addWire(body, chest, stone, { pos: [0, 1.8, 0] });
  addWire(body, new THREE.BoxGeometry(2.1, 0.28, 0.9), dark, { pos: [0, 2.35, 0], opacity: 0.75 });
  // Head with a single watching eye.
  const head = new THREE.IcosahedronGeometry(0.55, 0);
  addFill(body, head, 0x1e1a12, 0.65, { pos: [0, 2.9, 0], scale: [0.95, 1.1, 0.85] });
  addWire(body, head, stone, { pos: [0, 2.9, 0], scale: [0.95, 1.1, 0.85] });
  addWire(body, new THREE.ConeGeometry(0.25, 0.8, 4), gold, { pos: [0, 3.55, 0], rot: [0, 0.4, 0], opacity: 0.7 });
  addGlow(body, cyan, 0.8, [0, 2.9, 0.42], 0.95);
  addWire(body, new THREE.TorusGeometry(0.32, 0.06, 4, 10), gold, { pos: [0, 2.9, 0.47], opacity: 0.8 });
  // Shield arm.
  for (const side of [-1, 1]) {
    addWire(body, new THREE.CylinderGeometry(0.18, 0.2, 1.1, 4), stone, {
      pos: [side * 1.05, 1.85, 0.05],
      rot: [0.1, 0, side * -0.3],
      opacity: 0.8,
    });
    addWire(body, new THREE.IcosahedronGeometry(0.24), dark, { pos: [side * 1.25, 1.25, 0.1] });
  }
  const shield = new THREE.Group();
  shield.position.set(-1.3, 1.55, 0.35);
  shield.rotation.set(0.1, 0.35, 0.2);
  body.add(shield);
  const shieldGeo = new THREE.CylinderGeometry(0.82, 0.82, 0.12, 6);
  addFill(shield, shieldGeo, 0x20281f, 0.7, { rot: [Math.PI / 2, 0, 0] });
  addWire(shield, shieldGeo, gold, { rot: [Math.PI / 2, 0, 0] });
  addWire(shield, new THREE.CylinderGeometry(0.5, 0.5, 0.14, 6), cyan, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.03], opacity: 0.6 });
  addTriforce(shield, 0.25, gold, [0, 0.02, 0.1], [0, 0, 0], 0.8);
  // A heavy stone blade.
  const blade = new THREE.Group();
  blade.position.set(1.25, 1.2, 0.1);
  blade.rotation.z = -0.25;
  body.add(blade);
  addWire(blade, new THREE.BoxGeometry(0.18, 1.7, 0.28), stone, { pos: [0, -0.7, 0], opacity: 0.8 });
  addWire(blade, new THREE.BoxGeometry(0.55, 0.14, 0.3), gold, { pos: [0, 0.1, 0] });
  // Carved runes.
  for (let i = 0; i < 3; i++) {
    addPath(body, [
      V(-0.5 + i * 0.5, 1.45, 0.47),
      V(-0.3 + i * 0.5, 1.8, 0.47),
      V(-0.5 + i * 0.5, 2.15, 0.47),
    ], cyan, { opacity: 0.35 });
  }

  markShared(root);
  return root;
}

function makePoe() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const violet = 0xb78bff;
  const pale = 0xe8dcff;
  const cyan = 0x8ef7ff;

  // Specter robe.
  const robe = new THREE.ConeGeometry(0.7, 1.8, 6);
  addFill(body, robe, 0x1d1136, 0.62, { pos: [0, 0.9, 0], scale: [1, 1, 0.9] });
  addWire(body, robe, violet, { pos: [0, 0.9, 0], scale: [1, 1, 0.9], opacity: 0.95 });
  // Hood.
  addWire(body, new THREE.ConeGeometry(0.45, 0.85, 5), violet, { pos: [0, 1.85, 0.05], rot: [0.25, 0, 0] });
  addFill(body, new THREE.IcosahedronGeometry(0.3), 0x0c0616, 0.8, { pos: [0, 1.65, 0.24], scale: [1, 1, 0.5] });
  addGlow(body, cyan, 0.32, [-0.11, 1.68, 0.44], 0.95);
  addGlow(body, violet, 0.3, [0.11, 1.68, 0.44], 0.85);
  // Wispy tail.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addPath(body, [
      V(Math.cos(a) * 0.32, 0.35, Math.sin(a) * 0.28),
      V(Math.cos(a) * 0.55, -0.35, Math.sin(a) * 0.42),
      V(Math.cos(a) * 0.3, -0.95 - i * 0.06, Math.sin(a) * 0.2),
    ], violet, { opacity: 0.35 });
  }
  // Lantern arm and floating soul-light.
  const arm = new THREE.Group();
  arm.position.set(0.62, 1.2, 0.25);
  body.add(arm);
  addPath(arm, [V(0, 0, 0), V(0.18, -0.38, 0.12), V(0.12, -0.65, 0.22)], pale, { opacity: 0.55 });
  const lantern = new THREE.Group();
  lantern.name = 'lantern';
  lantern.position.set(0.12, -0.8, 0.24);
  arm.add(lantern);
  addWire(lantern, new THREE.OctahedronGeometry(0.28), cyan, { scale: [1, 1.25, 1], opacity: 0.85 });
  addGlow(lantern, cyan, 0.9, [0, 0, 0], 0.9);
  const flame = addWire(lantern, new THREE.ConeGeometry(0.1, 0.3, 4), 0xd9ffff, { pos: [0, 0.42, 0], opacity: 0.7 });
  flame.name = 'flame';
  // Tiny hooked hands.
  addWire(body, new THREE.ConeGeometry(0.1, 0.3, 4), pale, { pos: [-0.6, 1.15, 0.12], rot: [0, 0, -1.2], opacity: 0.7 });

  markShared(root);
  return root;
}

function makeDekuScrub() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  body.position.y = 0.6;
  root.add(body);
  const green = 0x8dffae;
  const dark = 0x2a6b3d;
  const gold = 0xffdc7c;

  // Bulb body.
  const bulb = new THREE.IcosahedronGeometry(0.65, 1);
  addFill(body, bulb, 0x123b22, 0.55, { scale: [1, 0.9, 0.9] });
  addWire(body, bulb, green, { scale: [1, 0.9, 0.9], opacity: 0.95 });
  // Stubby feet.
  for (const side of [-1, 1]) {
    addWire(body, new THREE.CylinderGeometry(0.1, 0.12, 0.35, 4), dark, { pos: [side * 0.22, -0.62, 0], opacity: 0.8 });
  }
  // Snout / seed gun.
  addWire(body, new THREE.ConeGeometry(0.3, 0.7, 5), green, {
    pos: [0, -0.02, 0.55],
    rot: [Math.PI / 2, 0, 0],
    scale: [1, 1, 0.75],
  });
  addPath(body, [V(0, 0.3, 0.3), V(0, 0.58, 0.62), V(0, 0.3, 0.82)], gold, { opacity: 0.65 });
  // Leaf cap.
  const leaf = new THREE.Group();
  leaf.position.y = 0.55;
  body.add(leaf);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p1 = V(Math.cos(a) * 0.25, 0.1, Math.sin(a) * 0.18);
    const p2 = V(Math.cos(a) * 1.0, 0.9, Math.sin(a) * 0.65);
    const p3 = V(Math.cos(a + 0.6) * 0.45, 0.65, Math.sin(a + 0.6) * 0.4);
    addPath(leaf, [p1, p2, p3, p1], green, { opacity: 0.6 });
  }
  addGlow(body, 0xff9bd4, 0.2, [-0.23, 0.3, 0.48], 0.8);
  addGlow(body, 0xff9bd4, 0.2, [0.23, 0.3, 0.48], 0.8);
  // A little wooden stem.
  addWire(body, new THREE.CylinderGeometry(0.13, 0.18, 0.65, 4), 0x6b4b2a, { pos: [0, -0.5, 0], opacity: 0.7 });

  markShared(root);
  return root;
}

function makeLikeLike() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const ochre = 0xd6a35d;
  const dark = 0x6b3c20;
  const purple = 0xb978d6;
  const maw = 0x3a0f24;

  // Stacked fleshy rings form the tube.
  for (let i = 0; i < 5; i++) {
    const y = 0.2 + i * 0.42;
    const r = 0.75 + Math.sin(i * 1.4) * 0.12;
    addWire(body, PRIM.torus, i === 4 ? ochre : purple, {
      pos: [0, y, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [r, r, 0.8],
      opacity: i === 0 ? 0.4 : 0.55,
    });
    if (i > 0) {
      addPath(body, [
        V(-r, y - 0.2, 0),
        V(0, y - 0.16, r * 0.8),
        V(r, y - 0.2, 0),
      ], dark, { opacity: 0.3 });
    }
  }
  // Bulbous head and gaping maw.
  addWire(body, new THREE.IcosahedronGeometry(1.05, 1), ochre, {
    pos: [0, 2.15, 0],
    scale: [1, 0.8, 0.9],
    opacity: 0.85,
  });
  addFill(body, new THREE.IcosahedronGeometry(1.0, 1), 0x2a0f1c, 0.5, { pos: [0, 2.2, 0.1], scale: [0.9, 0.7, 0.65] });
  addWire(body, new THREE.TorusGeometry(0.68, 0.16, 5, 12), ochre, { pos: [0, 2.15, 0.72], opacity: 0.85 });
  addWire(body, new THREE.TorusGeometry(0.42, 0.1, 4, 10), maw, { pos: [0, 2.15, 0.85], opacity: 0.9 });
  addGlow(body, 0xd07bff, 1.2, [0, 2.15, 0.9], 0.55);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    addTri(body, [
      V(Math.cos(a) * 0.6, 2.15 + Math.sin(a) * 0.6, 0.78),
      V(Math.cos(a + 0.16) * 0.45, 2.15 + Math.sin(a + 0.16) * 0.45, 1.02),
      V(Math.cos(a + 0.3) * 0.55, 2.15 + Math.sin(a + 0.3) * 0.55, 0.78),
    ], 0xfff1cf, 0.45);
  }
  // Two small eyes above the maw.
  addGlow(body, 0xffce5c, 0.3, [-0.34, 2.85, 0.5], 0.85);
  addGlow(body, 0xffce5c, 0.3, [0.34, 2.85, 0.5], 0.85);
  // Tentacle fringe.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addPath(body, [
      V(Math.cos(a) * 0.9, 0.4, Math.sin(a) * 0.7),
      V(Math.cos(a) * 1.3, -0.15, Math.sin(a) * 1.0),
      V(Math.cos(a) * 1.05, -0.7, Math.sin(a) * 0.7),
    ], dark, { opacity: 0.5 });
  }
  // Coin-like glints caught in its hide.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    addWire(body, new THREE.OctahedronGeometry(0.11), 0xffdc7c, {
      pos: [Math.cos(a) * 0.95, 1.15 + i * 0.28, Math.sin(a) * 0.8],
      opacity: 0.7,
    });
  }

  markShared(root);
  return root;
}

/* ------------------------------------------------------------------ */
/* GUARDIANS                                                          */
/* ------------------------------------------------------------------ */

function makeGohma() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.5;
  root.add(body);
  const shell = 0xff5b9e;
  const dark = 0x7d1f55;
  const gold = 0xf6d77b;

  // carapace
  const carapace = new THREE.IcosahedronGeometry(3, 1);
  addFill(body, carapace, 0x2a061c, 0.55, { scale: [1.15, 0.85, 1] });
  addWire(body, carapace, shell, { scale: [1.15, 0.85, 1] });
  addWire(body, carapace, gold, { scale: [1.2, 0.9, 1.05], opacity: 0.25 });
  // ridges
  for (let i = 0; i < 3; i++) {
    addWire(body, PRIM.torus, gold, {
      pos: [0, 0.2 + i * 0.4, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [3.1 - i * 0.45, 3.1 - i * 0.45, 0.3],
      opacity: 0.35,
    });
  }
  // mandibles
  for (const side of [-1, 1]) {
    const mand = new THREE.Group();
    mand.name = side < 0 ? 'mandL' : 'mandR';
    mand.position.set(side * 1.1, -1.9, 1.4);
    body.add(mand);
    addPath(mand, [
      V(0, 0, 0),
      V(side * 0.8, -0.9, 0.8),
      V(side * 0.4, -1.7, 1.5),
      V(-side * 0.2, -1.9, 2.1),
    ], gold, { opacity: 0.9 });
    addPath(mand, [
      V(0, 0, 0),
      V(side * 0.3, -0.8, 1.1),
      V(-side * 0.1, -1.4, 1.8),
    ], shell, { opacity: 0.6 });
  }
  // legs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const leg = new THREE.Group();
    leg.name = `leg${i}`;
    leg.position.set(Math.cos(a) * 2.7, -0.8, Math.sin(a) * 2.2);
    leg.rotation.y = -a;
    body.add(leg);
    addPath(leg, [
      V(0, 0, 0),
      V(0.9, -1.1, 0.3),
      V(1.9, -2.3, 0.6),
      V(3.0, -2.9, 0.4),
    ], dark, { opacity: 0.9 });
    addPath(leg, [
      V(0.9, -1.1, 0.3),
      V(1.0, -2.1, -0.2),
    ], shell, { opacity: 0.6 });
    addPath(leg, [
      V(1.9, -2.3, 0.6),
      V(2.2, -2.8, 0.9),
    ], gold, { opacity: 0.5 });
  }
  // crown spikes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addWire(body, new THREE.ConeGeometry(0.3, 1.4, 4), shell, {
      pos: [Math.cos(a) * 2.2, 2.6, Math.sin(a) * 1.7],
      rot: [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4],
      opacity: 0.75,
    });
  }
  // inner glow
  addGlow(body, 0xff3f92, 7.5, [0, 0.3, 1.2], 0.22);
  addGlow(body, 0xffb1d5, 2.4, [0, 0.5, 2.4], 0.35);

  root.scale.setScalar(1.4);
  markShared(root);
  return root;
}

function makeBloom() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.2;
  root.add(body);
  const leaf = 0x8dffb2;
  const dark = 0x1f7a4a;
  const violet = 0xc26bff;
  const gold = 0xf4d98a;

  // great stem / root
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    addPath(body, [
      V(0, -1, 0),
      V(Math.cos(a) * 1.2, -3.4, Math.sin(a) * 1.2),
      V(Math.cos(a) * 2.6, -5.2, Math.sin(a) * 2.2),
      V(Math.cos(a) * 3.4, -4.2, Math.sin(a) * 3.0),
    ], i % 2 ? dark : leaf, { opacity: 0.6 });
  }

  // central seed heart
  const core = new THREE.IcosahedronGeometry(2, 1);
  addFill(body, core, 0x361344, 0.6, { scale: [1, 1.1, 1] });
  addWire(body, core, violet, { scale: [1, 1.1, 1] });
  addWire(body, core, gold, { scale: [1.06, 1.16, 1.06], opacity: 0.3 });
  addGlow(body, 0xffb0ff, 5.2, [0, 0, 2], 0.35);

  // petals
  const petalPts = (len, wid) => [
    V(0, 0, 0.4),
    V(wid * 0.7, len * 0.35, 0.8),
    V(wid, len * 0.8, 0.4),
    V(wid * 0.3, len, 0),
    V(0, len * 0.7, -0.3),
    V(-wid * 0.3, len, 0),
    V(-wid, len * 0.8, 0.4),
    V(-wid * 0.7, len * 0.35, 0.8),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.Group();
    petal.name = `petal${i}`;
    petal.position.set(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6);
    petal.rotation.y = -a + Math.PI / 2;
    petal.rotation.x = -0.25;
    body.add(petal);
    const pts = petalPts(5.5, 1.8);
    addPath(petal, pts, violet, { opacity: 0.85, closed: true });
    addPath(petal, [pts[0], pts[3], pts[6]], leaf, { opacity: 0.45 });
    addPath(petal, [pts[1], pts[2], pts[3], pts[4]], gold, { opacity: 0.4 });
  }

  // mouth ring & teeth
  addWire(body, new THREE.TorusGeometry(2.35, 0.14, 5, 14), gold, {
    pos: [0, 0, 1.6],
    opacity: 0.8,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    addTri(body, [
      V(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 1.6),
      V(Math.cos(a + 0.12) * 2.1, Math.sin(a + 0.12) * 2.1, 2.2),
      V(Math.cos(a - 0.12) * 2.1, Math.sin(a - 0.12) * 2.1, 2.2),
    ], 0xfff3d0, 0.7);
  }
  // vines around
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    addPath(body, [
      V(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6),
      V(Math.cos(a) * 4.2, 1.4, Math.sin(a) * 3.6),
      V(Math.cos(a) * 5.4, 0.6, Math.sin(a) * 4.4),
    ], dark, { opacity: 0.55 });
  }

  markShared(root);
  return root;
}

function makeDodongo() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hide = 0xff8a4a;
  const stone = 0x6b2f18;
  const lava = 0xffd34e;
  const ember = 0xff4a2e;

  // hulking body
  const torso = new THREE.IcosahedronGeometry(3.2, 1);
  addFill(body, torso, 0x2e0c04, 0.6, { scale: [1.35, 0.95, 1.1] });
  addWire(body, torso, hide, { scale: [1.35, 0.95, 1.1] });
  addWire(body, torso, stone, { scale: [1.4, 1.0, 1.14], opacity: 0.3 });

  // back plates
  for (let i = 0; i < 5; i++) {
    addWire(body, new THREE.ConeGeometry(0.55, 2.1, 4), stone, {
      pos: [(i - 2) * 1.1, 3.1, -1.0 + Math.abs(i - 2) * 0.3],
      rot: [0.2, 0, 0],
      opacity: 0.7,
    });
  }
  // lava seams
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    addPath(body, [
      V(Math.cos(a) * 3.4, 1.4, 1.0 + Math.sin(a) * 1.4),
      V(Math.cos(a + 0.2) * 3.0, 0.2, 1.2 + Math.sin(a + 0.2) * 1.5),
    ], lava, { opacity: 0.55 });
  }

  // head
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 1.5, 2.4);
  body.add(head);
  const skull = new THREE.IcosahedronGeometry(1.9, 1);
  addFill(head, skull, 0x3a1005, 0.65, { scale: [1.1, 0.85, 1] });
  addWire(head, skull, hide, { scale: [1.1, 0.85, 1] });
  // snout
  addWire(head, new THREE.ConeGeometry(1.15, 2.0, 5), hide, {
    pos: [0, -0.3, 1.6],
    rot: [Math.PI / 2, 0, 0],
    scale: [1.2, 1, 0.8],
  });
  // horns
  for (const side of [-1, 1]) {
    addWire(head, new THREE.ConeGeometry(0.35, 1.9, 5), 0xffe6c2, {
      pos: [side * 1.2, 1.3, 0.3],
      rot: [-0.3, 0, side * -0.7],
      opacity: 0.9,
    });
    addGlow(head, ember, 0.8, [side * 0.72, 0.5, 1.3], 0.9);
  }
  // jaw
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.8, 1.2);
  head.add(jaw);
  addWire(jaw, new THREE.BoxGeometry(2.2, 0.5, 2.0), stone, { pos: [0, -0.2, 0.8], opacity: 0.85 });
  for (let i = 0; i < 6; i++) {
    addWire(jaw, new THREE.ConeGeometry(0.11, 0.42, 3), 0xfff1c9, {
      pos: [-0.9 + i * 0.36, 0.08, 1.6],
      rot: [0, 0, i % 2 ? 0.1 : -0.1],
      opacity: 0.8,
    });
  }
  addGlow(head, 0xff8a2a, 2.6, [0, -0.5, 2.2], 0.4);

  // limbs
  const limbU = [
    [V(-2.4, -0.6, 1.6), V(-3.4, -2.6, 2.0), V(-2.8, -4.2, 2.4)],
    [V(2.4, -0.6, 1.6), V(3.4, -2.6, 2.0), V(2.8, -4.2, 2.4)],
    [V(-2.2, -1.0, -1.4), V(-3.2, -2.8, -1.6), V(-2.6, -4.1, -1.4)],
    [V(2.2, -1.0, -1.4), V(3.2, -2.8, -1.6), V(2.6, -4.1, -1.4)],
  ];
  limbU.forEach((pts, i) => {
    const limb = new THREE.Group();
    limb.name = `limb${i}`;
    body.add(limb);
    addPath(limb, pts, stone, { opacity: 0.85 });
    addWire(limb, new THREE.ConeGeometry(0.4, 0.9, 4), 0xffe2b0, {
      pos: pts[2].toArray(),
      rot: [0, 0, 0],
      opacity: 0.6,
    });
  });
  // crown of fire
  addGlow(body, 0xff612e, 8, [0, 3, 0], 0.2);

  root.scale.setScalar(0.9);
  markShared(root);
  return root;
}

function makeGanon() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const malice = 0xff2f8f;
  const bone = 0xf0dcc8;
  const gold = 0xf6d879;
  const voidCol = 0x2a0624;

  // wall of malice tendrils
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    addPath(body, [
      V(Math.cos(a) * 2.2, -2 + Math.sin(a * 2) * 1.4, Math.sin(a) * 1.7),
      V(Math.cos(a) * 4.0, -2.8 + Math.sin(a * 3) * 1.8, Math.sin(a) * 3.2),
      V(Math.cos(a) * 5.6, -1.0 + Math.sin(a * 2) * 2.6, Math.sin(a) * 4.4),
    ], i % 2 ? malice : 0x7d1f63, { opacity: 0.45 });
  }

  // massive skull
  const skull = new THREE.IcosahedronGeometry(3, 2);
  addFill(body, skull, 0x1b0518, 0.7, { scale: [1.2, 0.95, 0.95] });
  addWire(body, skull, bone, { scale: [1.2, 0.95, 0.95], opacity: 0.85 });
  addWire(body, skull, malice, { scale: [1.25, 1.0, 1.0], opacity: 0.22 });
  // snout / pig-like jaw
  addWire(body, new THREE.ConeGeometry(1.6, 2.4, 6), bone, {
    pos: [0, -1.4, 2.2],
    rot: [Math.PI / 2, 0, 0],
    scale: [1.25, 1, 0.7],
    opacity: 0.8,
  });
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -2.0, 1.2);
  body.add(jaw);
  addPath(jaw, [
    V(-1.7, 0, 0.6),
    V(-1.2, -0.8, 2.0),
    V(0, -0.95, 2.4),
    V(1.2, -0.8, 2.0),
    V(1.7, 0, 0.6),
  ], bone, { opacity: 0.75 });
  for (let i = 0; i < 7; i++) {
    addTri(jaw, [
      V(-1.2 + i * 0.4, -0.1, 1.9),
      V(-1.05 + i * 0.4, 0.4, 2.1),
      V(-1.35 + i * 0.4, -0.15, 2.2),
    ], 0xffe9c9, 0.65);
  }
  // sockets (weak spot eyes sit over these)
  for (const side of [-1, 1]) {
    addWire(body, new THREE.TorusGeometry(1.0, 0.14, 5, 10), gold, {
      pos: [side * 2.0, 1.0, 2.1],
      rot: [0, side * 0.35, 0],
      opacity: 0.65,
    });
    addGlow(body, malice, 2.4, [side * 2.0, 1.0, 1.9], 0.25);
  }
  // horns
  for (const side of [-1, 1]) {
    addWire(body, new THREE.ConeGeometry(0.55, 4.2, 5), bone, {
      pos: [side * 3.0, 3.3, 0],
      rot: [-0.2, 0, side * -0.55],
      opacity: 0.8,
    });
    addPath(body, [
      V(side * 1.6, 2.8, 0.4),
      V(side * 3.4, 4.7, 0.1),
      V(side * 4.1, 5.6, -0.3),
    ], gold, { opacity: 0.5 });
  }
  // broken crown
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const height = i % 2 === 0 ? 1.3 : 0.7;
    addTri(body, [
      V(Math.cos(a) * 2.6, 3.2, Math.sin(a) * 1.6),
      V(Math.cos(a) * 2.9, 3.2 + height, Math.sin(a) * 1.8),
      V(Math.cos(a + 0.32) * 2.7, 3.2, Math.sin(a + 0.32) * 1.7),
    ], gold, 0.6);
  }
  // forehead triforce, inverted and corrupted
  const crest = addTriforce(body, 1.5, malice, [0, 2.6, 2.9], [Math.PI, 0, 0], 0.9);
  crest.name = 'crest';
  addWire(body, new THREE.TorusGeometry(2.0, 0.06, 4, 18), gold, {
    pos: [0, 0.8, 2.6],
    opacity: 0.35,
  });
  addGlow(body, 0xff2f8f, 11, [0, 0.2, 1.2], 0.18);

  markShared(root);
  return root;
}

function makeDemise() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  const bone = 0xe9dac4;
  const gold = 0xffd76e;
  const dark = 0x1b0a10;
  const red = 0xff2e62;
  const ember = 0xff8a3d;

  // A shroud of darkness and old war.
  const shroud = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    shroud.push(V(Math.cos(a) * 3.1, -3.3, Math.sin(a) * 1.9));
  }
  addPath(body, shroud, red, { opacity: 0.25, closed: true });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const p = V(Math.cos(a) * 2.4, -1.2 + (i % 3) * 0.25, Math.sin(a) * 1.5);
    batchlessBody(body, [
      p,
      p.clone().addScaledVector(V(Math.cos(a), 0, Math.sin(a)), 2.2).add(V(0, -1.5, 0)),
      p.clone().addScaledVector(V(Math.cos(a + 0.5), 0, Math.sin(a + 0.5)), 3.4).add(V(0, -2.4, 0)),
    ], i % 2 ? ember : red, 0.22);
  }

  // Skeletal lower torso.
  for (let i = 0; i < 3; i++) {
    addWire(body, new THREE.TorusGeometry(2.0 - i * 0.35, 0.11, 5, 18), bone, {
      pos: [0, -1.5 + i * 0.7, 0],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 0.75, 1],
      opacity: 0.55 - i * 0.1,
    });
  }
  addFill(body, new THREE.ConeGeometry(2.1, 3.2, 6), 0x100509, 0.65, { pos: [0, -0.7, 0], rot: [Math.PI, 0, 0] });
  addWire(body, new THREE.ConeGeometry(2.1, 3.2, 6), bone, { pos: [0, -0.7, 0], rot: [Math.PI, 0, 0], opacity: 0.35 });

  // Torso: a cracked, blackened carapace.
  const chest = new THREE.IcosahedronGeometry(2.5, 1);
  addFill(body, chest, 0x15070c, 0.75, { pos: [0, 1.7, 0], scale: [1.12, 1.2, 0.82] });
  addWire(body, chest, bone, { pos: [0, 1.7, 0], scale: [1.12, 1.2, 0.82], opacity: 0.7 });
  addWire(body, chest, gold, { pos: [0, 1.7, 0], scale: [1.18, 1.26, 0.86], opacity: 0.16 });
  for (let i = 0; i < 3; i++) {
    addPath(body, [
      V(-0.9 + i * 0.9, 3.0, 0.9),
      V(-0.65 + i * 0.9, 2.3, 1.25),
      V(-0.8 + i * 0.9, 1.4, 1.2),
      V(-0.5 + i * 0.9, 0.7, 0.8),
    ], i === 1 ? ember : red, { opacity: 0.5 });
  }
  // A sunken socket where the core will appear.
  addWire(body, new THREE.TorusGeometry(1.05, 0.13, 5, 12), gold, { pos: [0, 1.8, 2.05], opacity: 0.45 });
  addGlow(body, red, 2.2, [0, 1.8, 1.9], 0.2);
  // Shoulder plates and spikes.
  for (const side of [-1, 1]) {
    addWire(body, new THREE.ConeGeometry(0.65, 2.2, 4), bone, {
      pos: [side * 2.5, 2.9, 0.3],
      rot: [0.2, 0, side * -1.0],
      opacity: 0.7,
    });
    addWire(body, new THREE.IcosahedronGeometry(0.9, 0), dark, { pos: [side * 2.3, 2.1, 0.2], opacity: 0.5 });
  }

  // Arms. The right hand carries the demon blade.
  const armL = new THREE.Group();
  armL.name = 'mandL';
  armL.position.set(-2.35, 2.5, 0.15);
  armL.rotation.z = 0.35;
  body.add(armL);
  const armPts = [V(0, 0, 0), V(-0.65, -1.7, 0.35), V(-0.2, -3.2, 0.8), V(0.35, -3.7, 1.1)];
  addPath(armL, armPts, bone, { opacity: 0.55 });
  addPath(armL, armPts.map((q) => q.clone().add(V(0.25, 0, 0))), red, { opacity: 0.25 });
  for (let i = 0; i < 3; i++) {
    addPath(armL, [V(0.35, -3.7, 1.1), V(0.8 + i * 0.3, -4.2 - i * 0.2, 1.4 + i * 0.15)], gold, { opacity: 0.5 });
  }

  const armR = new THREE.Group();
  armR.name = 'mandR';
  armR.position.set(2.35, 2.5, 0.15);
  armR.rotation.z = -0.35;
  body.add(armR);
  const armRpts = [V(0, 0, 0), V(0.7, -1.6, 0.3), V(0.2, -3.0, 0.75), V(-0.3, -3.5, 1.0)];
  addPath(armR, armRpts, bone, { opacity: 0.55 });
  addPath(armR, armRpts.map((q) => q.clone().add(V(-0.25, 0, 0))), ember, { opacity: 0.25 });
  // Giant sword.
  const sword = new THREE.Group();
  sword.name = 'demonSword';
  sword.position.set(-0.4, -3.5, 1.0);
  sword.rotation.set(0.4, 0, -0.7);
  armR.add(sword);
  addWire(sword, new THREE.BoxGeometry(0.8, 8.5, 0.28), dark, { pos: [0, -3.1, 0], opacity: 0.8 });
  addWire(sword, new THREE.BoxGeometry(0.16, 8.0, 0.34), red, { pos: [0, -3.1, 0.02] });
  addPath(sword, [V(-0.35, 1.2, 0), V(0.35, 1.2, 0)], gold, { opacity: 0.8 });
  addWire(sword, new THREE.BoxGeometry(2.2, 0.35, 0.35), bone, { pos: [0, 1.35, 0], opacity: 0.85 });
  addPath(sword, [V(0, 1.5, 0), V(0, 3.0, 0)], gold, { opacity: 0.6 });
  addWire(sword, new THREE.OctahedronGeometry(0.25), red, { pos: [0, 3.1, 0], opacity: 0.9 });
  addGlow(sword, red, 2.6, [0, 2.4, 0], 0.35);

  // The horned skull.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 4.25, 0.15);
  body.add(head);
  const skull = new THREE.IcosahedronGeometry(1.35, 1);
  addFill(head, skull, 0x160c08, 0.72, { scale: [1, 0.92, 0.9] });
  addWire(head, skull, bone, { scale: [1, 0.92, 0.9], opacity: 0.9 });
  addWire(head, new THREE.ConeGeometry(0.45, 1.25, 5), bone, {
    pos: [0, -0.85, 0.9],
    rot: [Math.PI / 2, 0, 0],
    scale: [1.4, 1, 0.7],
    opacity: 0.7,
  });
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.9, 0.25);
  head.add(jaw);
  addWire(jaw, new THREE.BoxGeometry(1.5, 0.35, 1.25), bone, { pos: [0, -0.35, 0.45], opacity: 0.7 });
  for (let i = 0; i < 7; i++) {
    addTri(jaw, [
      V(-0.65 + i * 0.22, -0.15, 0.85),
      V(-0.55 + i * 0.22, 0.45, 1.05),
      V(-0.72 + i * 0.22, -0.15, 1.15),
    ], 0xfff0d4, 0.55);
  }
  addGlow(head, ember, 0.9, [-0.5, 0.2, 0.95], 0.9);
  addGlow(head, red, 0.9, [0.5, 0.2, 0.95], 0.9);
  // Horns, sweeping back like a broken crown.
  for (const side of [-1, 1]) {
    addPath(head, [
      V(side * 0.9, 0.75, 0.1),
      V(side * 2.6, 2.2, -0.2),
      V(side * 4.2, 3.0, -1.0),
      V(side * 5.0, 2.4, -1.8),
    ], bone, { opacity: 0.8 });
    addPath(head, [
      V(side * 1.4, 1.02, 0.1),
      V(side * 2.4, 1.8, -0.1),
      V(side * 3.0, 2.0, -0.4),
    ], gold, { opacity: 0.5 });
  }
  // Crown of embers.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addPath(head, [
      V(Math.cos(a) * 1.0, 0.7, Math.sin(a) * 0.5),
      V(Math.cos(a) * 2.2, 2.2 + (i % 2) * 1.2, Math.sin(a) * 1.0),
      V(Math.cos(a) * 2.8, 3.4 + (i % 3) * 1.0, Math.sin(a) * 1.4),
    ], i % 2 ? ember : red, { opacity: 0.3 });
  }
  // Crest of the sealed king, inverted and burning.
  const crest = addTriforce(head, 0.6, red, [0, 0.1, 1.1], [0, 0, Math.PI], 0.7);
  crest.name = 'crest';
  // Pauldron chains.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      addWire(body, new THREE.OctahedronGeometry(0.16), i % 2 ? gold : bone, {
        pos: [side * (1.7 + i * 0.35), 3.0 - i * 0.5, 0.8 - i * 0.15],
        opacity: 0.5,
      });
    }
  }
  addGlow(body, red, 7.5, [0, 1.7, 0.5], 0.15);
  addGlow(head, 0xffdc7c, 3.5, [0, 0.4, 0.4], 0.12);

  markShared(root);
  return root;
}

function batchlessBody(parent, points, color, opacity) {
  const vecs = points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2])));
  const segs = [];
  for (let i = 0; i < vecs.length - 1; i++) segs.push(vecs[i], vecs[i + 1]);
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  geo.userData.shared = true;
  const line = new THREE.LineSegments(geo, lineMaterial(color, { opacity }));
  line.renderOrder = 3;
  parent.add(line);
  return line;
}

/* ------------------------------------------------------------------ */
/* caches                                                             */
/* ------------------------------------------------------------------ */

const enemyTemplates = {};
const enemyFactories = {
  keese: makeKeese,
  octorok: makeOctorok,
  baba: makeBaba,
  stalfos: makeStalfos,
  beamos: makeBeamos,
  wizzrobe: makeWizzrobe,
  armos: makeArmos,
  poe: makePoe,
  dekuScrub: makeDekuScrub,
  likelike: makeLikeLike,
};

export function createEnemyModel(type) {
  if (!enemyTemplates[type]) {
    const factory = enemyFactories[type];
    if (!factory) throw new Error(`Unknown enemy type: ${type}`);
    enemyTemplates[type] = factory();
  }
  return enemyTemplates[type].clone(true);
}

const bossTemplates = {};
const bossFactories = {
  gohma: makeGohma,
  bloom: makeBloom,
  dodongo: makeDodongo,
  ganon: makeGanon,
  demise: makeDemise,
};

export function createBossModel(type) {
  if (!bossTemplates[type]) {
    const factory = bossFactories[type];
    if (!factory) throw new Error(`Unknown boss type: ${type}`);
    bossTemplates[type] = factory();
  }
  return bossTemplates[type].clone(true);
}

/** Make sure cloning/disposal never frees shared template resources. */
function markShared(root) {
  root.traverse((c) => {
    if (c.geometry) c.geometry.userData.shared = true;
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => (m.userData.shared = true));
      else c.material.userData.shared = true;
    }
  });
}

