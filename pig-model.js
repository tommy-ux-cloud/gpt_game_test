import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// The character is an original articulated mesh, in world units, facing local +Z.
// Shared geometry/materials keep additional fighters inexpensive to allocate.
export const TEAM_STYLES = [
  { name: '藍鉤隊', color: '#6bbdff', enamel: '#1962b3', glow: '#48aaff' },
  { name: '赤鉤隊', color: '#ff777c', enamel: '#a92534', glow: '#ff4557' },
];
let materials, prototype;
const batchMaterials = new Map();
const sphere = new THREE.SphereGeometry(1, 12, 8);
const headSphere = new THREE.SphereGeometry(1, 24, 16);
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const torus = new THREE.TorusGeometry(1, .15, 6, 18);

function grain(kind) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind === 'denim' ? '#798797' : kind === 'skin' ? '#e9c6c3' : '#92908a'; ctx.fillRect(0, 0, 256, 256);
  let seed = 139;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 11000; i++) {
    const a = random() * .23;
    ctx.fillStyle = random() < .5 ? `rgba(15,12,9,${a})` : `rgba(255,241,230,${a})`;
    ctx.fillRect(random() * 256, random() * 256, kind === 'skin' ? 1 : 2, 1);
  }
  if (kind === 'denim' || kind === 'cloth') {
    ctx.strokeStyle = '#dedac81f'; ctx.lineWidth = .6;
    for (let i = -256; i < 512; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - 256, 256); ctx.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'skin' ? 3 : 2, 2); return texture;
}
function palette() {
  if (materials) return materials;
  const skinNoise = grain('skin'), cloth = grain('cloth'), denim = grain('denim'), metal = grain('metal');
  const material = (color, roughness, metalness = 0, bumpMap = null, bumpScale = .15) => new THREE.MeshStandardMaterial({ color, roughness, metalness, bumpMap, bumpScale });
  materials = {
    skin: material('#e8aca9', .67, 0, skinNoise, .22),
    cheek: material('#cf8a8d', .75, 0, skinNoise), innerEar: material('#ba777b', .75),
    nose: material('#d68d90', .52, 0, skinNoise, .16), nostril: material('#563a42', .8),
    shirt: material('#242829', .92, 0, cloth, .28), seam: material('#57504a', .95),
    shorts: material('#344e70', .92, 0, denim, .4), denimSeam: material('#9c947e', .85),
    leather: material('#553c2c', .87, 0, cloth, .22), leatherEdge: material('#886047', .86),
    iron: material('#656c71', .45, .82, metal, .12), ironDark: material('#32383e', .58, .7, metal),
    gold: material('#b7925a', .4, .66), hoof: material('#bcae99', .65, 0, skinNoise),
    eyes: material('#12283b', .14, .1), shine: new THREE.MeshBasicMaterial({ color: '#f1eded' }),
    crest: material('#df7c31', .65, .12), mouth: material('#643b42', .85),
  };
  materials.team = TEAM_STYLES.map(t => ({
    enamel: material(t.enamel, .32, .72, metal, .13),
    edge: new THREE.MeshStandardMaterial({ color: t.color, roughness: .25, metalness: .65, emissive: t.glow, emissiveIntensity: .65 }),
  }));
  return materials;
}
function mesh(parent, geometry, material, position, scale, rotation) {
  const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.scale.set(...scale);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function ball(parent, mat, pos, scale, rotation, detailed = false) { return mesh(parent, detailed ? headSphere : sphere, mat, pos, scale, rotation); }
function cube(parent, mat, pos, scale, rotation) { return mesh(parent, box, mat, pos, scale, rotation); }
function bar(parent, mat, a, b, radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start);
  const m = mesh(parent, cylinder, mat, start.add(end).multiplyScalar(.5).toArray(), [radius, d.length(), radius]);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
// Batch rigid subassemblies by material; arms, legs and head retain separate pivots.
function batch(group) {
  group.updateMatrixWorld(true);
  const m = palette(), bins = new Map();
  const skin = new Set([m.skin, m.cheek, m.innerEar, m.nose, m.hoof]);
  const cloth = new Set([m.shirt, m.seam, m.shorts, m.denimSeam, m.leather, m.leatherEdge, m.nostril, m.mouth, m.crest]);
  group.traverse(o => {
    if (!o.isMesh) return;
    const family = skin.has(o.material) ? 'skin' : cloth.has(o.material) ? 'cloth' : o.material === m.eyes ? 'eyes' : o.material === m.shine ? 'shine' : 'metal';
    if (!batchMaterials.has(family)) {
      const base = family === 'skin' ? m.skin : family === 'cloth' ? m.shirt : family === 'eyes' ? m.eyes : family === 'shine' ? m.shine : m.iron;
      const material = base.clone(); material.color.set('#ffffff'); material.vertexColors = true; batchMaterials.set(family, material);
    }
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const colors = new Float32Array(g.getAttribute('position').count * 3), color = o.material.color;
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!bins.has(family)) bins.set(family, []);
    bins.get(family).push(g);
  });
  group.clear(); group.position.set(0, 0, 0); group.rotation.set(0, 0, 0);
  for (const [family, geometries] of bins) {
    const unindexed = geometries.map(g => g.index ? g.toNonIndexed() : g), g = mergeGeometries(unindexed);
    const mesh = new THREE.Mesh(g, batchMaterials.get(family)); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    new Set([...geometries, ...unindexed]).forEach(g => g.dispose());
  }
}
function earGeometry(sign, inner = false) {
  const s = new THREE.Shape();
  if (inner) {
    s.moveTo(sign * 19, 13); s.lineTo(sign * 24, 21); s.lineTo(sign * 30, 13); s.quadraticCurveTo(sign * 25, 9, sign * 19, 13);
  } else {
    s.moveTo(sign * 14, 10); s.quadraticCurveTo(sign * 16, 22, sign * 24, 25);
    s.lineTo(sign * 34, 12); s.quadraticCurveTo(sign * 29, 5, sign * 22, 8); s.closePath();
  }
  return new THREE.ExtrudeGeometry(s, { depth: inner ? .8 : 3, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: inner ? .5 : 1.1, bevelThickness: inner ? .5 : 1.2, curveSegments: 8 });
}
function head(m) {
  const group = new THREE.Group();
  ball(group, m.skin, [0, 0, 0], [24, 22, 20], null, true);
  for (const sign of [-1, 1]) {
    mesh(group, earGeometry(sign), m.skin, [0, 0, -1], [1, 1, 1], [0, sign * -.22, 0]);
    mesh(group, earGeometry(sign, true), m.innerEar, [0, 0, 3.2], [1, 1, 1], [0, sign * -.22, 0]);
    ball(group, m.cheek, [sign * 14, -6, 15], [7.3, 4.4, 1.5]);
    ball(group, m.eyes, [sign * 10, 4, 18.4], [3.6, 4.5, 2.6]);
    ball(group, m.shine, [sign * 10 - .8, 5.5, 20.6], [.8, 1, .4]);
    ball(group, m.skin, [sign * 10.4, 10, 17], [6.1, 1.6, 2.2], [0, 0, sign * -.13]);
  }
  ball(group, m.nose, [0, -3.2, 21], [11, 8, 7.5], null, true);
  for (const sign of [-1, 1]) ball(group, m.nostril, [sign * 3.6, -3, 27.8], [1.8, 2.8, .7], [0, 0, sign * -.15]);
  ball(group, m.mouth, [0, -14, 16.2], [2.3, 2.5, .8]);
  // Tiny stylized bristles and worn eyebrow scratches read at inspection scale.
  for (let i = 0; i < 9; i++) bar(group, m.leatherEdge, [-8 + i * 2, 20.5, -2], [-9 + i * 2, 23, -3], .14);
  batch(group); group.name = 'head'; group.position.y = 87; return group;
}
function torso(m) {
  const group = new THREE.Group();
  ball(group, m.shirt, [0, 49, 0], [22, 25, 16], null, true);
  ball(group, m.leather, [0, 30, .5], [22.5, 4, 16.7]);
  cube(group, m.gold, [0, 30, 17.5], [6, 5.7, 2]); cube(group, m.ironDark, [0, 30, 18.7], [3.3, 3, .8]);
  // Diagonal chest strap follows the belly surface.
  const strapVertices = [], strapUV = [];
  const surface = (x, y) => 16 * Math.sqrt(Math.max(.05, 1 - (x / 22) ** 2 - ((y - 49) / 25) ** 2)) + 1.8;
  for (let i = 0; i < 14; i++) {
    const points = [];
    for (const [t, side] of [[i / 14, -1], [i / 14, 1], [(i + 1) / 14, -1], [(i + 1) / 14, 1]]) {
      const x = -14 + t * 28 + side * 2.3, y = 68 - t * 33 + side * 1.95;
      points.push([x, y, surface(x, y)]);
    }
    for (const j of [0, 2, 1, 1, 2, 3]) { strapVertices.push(...points[j]); strapUV.push(j % 2, i / 14); }
    if (i % 2 === 0) ball(group, m.leatherEdge, points[0].map((v, k) => k === 2 ? v + .4 : v), [.45, .6, .3]);
  }
  const strap = new THREE.BufferGeometry(); strap.setAttribute('position', new THREE.Float32BufferAttribute(strapVertices, 3)); strap.setAttribute('uv', new THREE.Float32BufferAttribute(strapUV, 2)); strap.computeVertexNormals();
  mesh(group, strap, m.leather, [0, 0, 0], [1, 1, 1]);
  cube(group, m.iron, [-9, 60, 15.7], [5.5, 7, 1.2], [0, 0, -.65]);
  cube(group, m.leather, [-17.7, 31, 12], [10, 11, 6], [0, -.2, -.05]);
  cube(group, m.leatherEdge, [-17.7, 34, 15.3], [10, 3, 1]);
  ball(group, m.gold, [-17.7, 32, 16], [1.2, 1.2, .6]);
  // Orange spiral emblem from the supplied shirt design.
  const crestPoints = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 3.4, r = 3.8 * (1 - i / 46); crestPoints.push(new THREE.Vector3(10 + Math.cos(a) * r, 55 + Math.sin(a) * r, 15.6)); }
  mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(crestPoints), 40, .65, 5, false), m.crest, [0, 0, 0], [1, 1, 1]);
  // Small curled tail at the back, visible when turning.
  const tail = Array.from({ length: 28 }, (_, i) => { const a = i / 27 * Math.PI * 3; return new THREE.Vector3(Math.cos(a) * 3.5, 31 + Math.sin(a) * 3.5, -16 - i * .2); });
  mesh(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tail), 26, 1.1, 5, false), m.skin, [0, 0, 0], [1, 1, 1]);
  batch(group); group.name = 'torso'; return group;
}
function leg(m, sign) {
  const group = new THREE.Group();
  ball(group, m.shorts, [0, -4, 0], [10.5, 13.5, 12]);
  ball(group, m.shorts, [0, -13, .6], [10.8, 3, 12.3]);
  for (let i = -6; i <= 6; i += 3) cube(group, m.denimSeam, [i, -14.2, 11.1], [1.2, .55, .6]);
  ball(group, m.skin, [0, -20, 0], [7, 8, 8]);
  for (const toe of [-1, 1]) ball(group, m.hoof, [toe * 3.7, -25, 3], [4.4, 5.6, 9]);
  batch(group); group.name = sign < 0 ? 'legL' : 'legR'; group.position.set(sign * 10, 31, 0); return group;
}
function arm(m, sign) {
  const group = new THREE.Group();
  ball(group, m.skin, [0, -12, 0], [7, 17, 7]);
  ball(group, m.shirt, [0, -3, 0], [9, 9, 9]);
  ball(group, m.leather, [0, -22, 0], [7.8, 5.5, 8]);
  for (let i = -1; i <= 1; i++) ball(group, m.iron, [i * 3, -22, 7.5], [1, 1, .6]);
  ball(group, m.skin, [0, -29, 2], [7.4, 7.4, 7.5]);
  // A domed steel pauldron, layered rim and brass rivets.
  if (sign < 0) {
    ball(group, m.ironDark, [0, 2, 0], [12, 8, 11]);
    ball(group, m.iron, [0, 4, 0], [10.7, 7.2, 10.5]);
    for (let i = -1; i <= 1; i++) { cube(group, m.iron, [i * 5, 1, 9], [4.4, 7, 1.5], [0, 0, i * .12]); ball(group, m.gold, [i * 5, 1, 10], [1.2, 1.2, 1.1]); }
  }
  batch(group); group.name = sign < 0 ? 'armL' : 'armR'; group.position.set(sign * 24.5, 66, 0);
  group.rotation.z = sign * .14; return group;
}

let hookGeometry, hookEdgeGeometry;
function hookShape() {
  if (hookGeometry) return hookGeometry;
  const s = new THREE.Shape();
  s.moveTo(-.37, -.8); s.lineTo(-.13, -.8); s.lineTo(-.13, -.25);
  s.bezierCurveTo(.85, -.36, .98, .51, .72, .83);
  s.bezierCurveTo(.4, 1.08, -.38, .94, -.77, .12);
  s.bezierCurveTo(-.12, .61, .46, .65, .48, .22);
  s.bezierCurveTo(.47, -.02, .08, .02, -.37, -.07); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .16, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 1, curveSegments: 9 });
  g.translate(0, 0, -.08);
  // Keep every visible vertex inside the unit sphere around the hit center.
  const positions = g.getAttribute('position'); let radius = 0;
  for (let i = 0; i < positions.count; i++) radius = Math.max(radius, Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)));
  g.scale(1 / radius, 1 / radius, 1 / radius); hookGeometry = g; return g;
}
export function createHookHead(team = 0) {
  const m = palette(), group = new THREE.Group(); group.name = 'teamHook';
  const blade = new THREE.Mesh(hookShape(), m.team[team].enamel); blade.castShadow = true; group.add(blade);
  const path = [[-.65, .1, .12], [-.38, .58, .12], [.03, .79, .12], [.58, .69, .12], [.67, .35, .12], [.53, -.04, .12], [-.05, -.18, .12]].map(p => new THREE.Vector3(...p));
  hookEdgeGeometry ||= new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 26, .025, 5, false);
  const edge = new THREE.Mesh(hookEdgeGeometry, m.team[team].edge); group.add(edge);
  return group;
}
export function createPig(team = 0) {
  const m = palette();
  if (!prototype) {
    prototype = new THREE.Group(); prototype.add(torso(m), head(m), leg(m, -1), leg(m, 1), arm(m, -1), arm(m, 1));
  }
  const root = new THREE.Group(), body = prototype.clone(true); root.name = 'pinkPig'; root.add(body);
  const rig = { root, body, head: body.getObjectByName('head'), armL: body.getObjectByName('armL'), armR: body.getObjectByName('armR'), legL: body.getObjectByName('legL'), legR: body.getObjectByName('legR') };
  const held = new THREE.Group(); held.name = 'heldHook';
  const blade = createHookHead(team); blade.scale.setScalar(16); blade.position.y = 5; held.add(blade);
  bar(held, m.leather, [0, -16, 0], [0, -3, 0], 2.2);
  mesh(held, torus, m.ironDark, [0, -18, 0], [3.4, 4, 3.4]);
  for (let i = 0; i < 4; i++) mesh(held, torus, m.ironDark, [Math.sin(i) * 2, -23 - i * 4, 0], [2.1, 3.1, 2.1], [0, (i % 2) * Math.PI / 2, 0]);
  const chainParts = new THREE.Group();
  for (const child of [...held.children].slice(1)) chainParts.add(child);
  batch(chainParts); held.add(chainParts);
  held.position.set(1, -24, 8); rig.armR.add(held); rig.heldHook = held;
  return rig;
}
export function animatePig(rig, { time = 0, speed = 0, angle = Math.PI / 2, shotAge = Infinity, pulling = false, hitAge = Infinity, deathAge = -1 } = {}) {
  const moving = Math.min(1, Math.abs(speed) / 185), phase = time * 10.5;
  const swing = Math.sin(phase) * .5 * moving;
  rig.root.rotation.y = Math.PI / 2 - angle;
  rig.body.position.y = Math.abs(Math.cos(phase)) * 1.8 * moving + Math.sin(time * 2.4) * .35;
  rig.body.rotation.set(pulling ? -.27 : Math.sin(phase) * .025 * moving, 0, Math.sin(phase * .5) * .025 * moving);
  rig.legL.rotation.x = swing; rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -.65 * swing; rig.armR.rotation.x = .65 * swing;
  rig.head.rotation.set(0, Math.sin(time * .8) * .035 * (1 - moving), 0);
  const cast = Math.max(0, 1 - shotAge / .48);
  rig.armR.rotation.x -= cast * 1.5;
  if (pulling) { rig.armL.rotation.x = -1.05; rig.armR.rotation.x = -1.05; }
  if (hitAge < .22) rig.body.rotation.z += Math.sin(hitAge / .22 * Math.PI) * .14;
  if (deathAge >= 0) {
    const d = Math.min(1, deathAge / .5);
    rig.body.rotation.z = -d * Math.PI / 2;
    rig.body.position.y = 21 * d;
    rig.body.position.x = 27 * d;
  } else rig.body.position.x = 0;
}
