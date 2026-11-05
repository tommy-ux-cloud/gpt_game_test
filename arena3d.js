import * as THREE from './vendor/three.module.min.js';
import { createPig, createHookHead, animatePig, TEAM_STYLES } from './pig-model.js';
import { VIEW_W, VIEW_H, PROJECTION, HOOK_HEIGHT, CAMERA_PITCH } from './camera.js';
import { W, H, RIVER } from './engine.js';

// Match the existing world/ground/torso input projection exactly.
export const HOOK_WORLD_HEIGHT = HOOK_HEIGHT / (PROJECTION.a * Math.cos(CAMERA_PITCH * Math.PI / 180));
export function syncArenaCamera(threeCamera, follow) {
  const pitch = CAMERA_PITCH * Math.PI / 180, x = follow.x + VIEW_W / 2, z = follow.y + VIEW_H / 2;
  threeCamera.position.set(x, 1600 * Math.sin(pitch), z + 1600 * Math.cos(pitch));
  threeCamera.lookAt(x, 0, z); threeCamera.updateMatrixWorld();
}
export function createArenaCamera() {
  return new THREE.OrthographicCamera(-VIEW_W / PROJECTION.a / 2, VIEW_W / PROJECTION.a / 2, VIEW_H / PROJECTION.a / 2, -VIEW_H / PROJECTION.a / 2, 1, 4000);
}
function contactTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  g.addColorStop(0, '#000b'); g.addColorStop(.5, '#0005'); g.addColorStop(1, '#0000'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const contactGeometry = new THREE.PlaneGeometry(80, 65);
function contactShadow(texture) {
  const m = new THREE.Mesh(contactGeometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .8 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .8; return m;
}
function lightScene(scene) {
  scene.add(new THREE.HemisphereLight('#c6d8e6', '#66503b', 2));
  const sun = new THREE.DirectionalLight('#ffe1bc', 3.2); sun.position.set(-350, 800, 420); scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#88b6e4', 1.5); rim.position.set(250, 400, -350); scene.add(rim);
  return sun;
}
function rendererFor(canvas, width, height) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  return renderer;
}
let merchantTemplate;
function merchantModel() {
  if (merchantTemplate) return merchantTemplate.clone(true);
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#5c3e29', roughness: .9 }), canvas = new THREE.MeshStandardMaterial({ color: '#b6a275', roughness: 1, side: THREE.DoubleSide });
  const part = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  for (const x of [-39, 39]) for (const z of [-22, 22]) part(new THREE.BoxGeometry(5, 79, 5), wood, x, 40, z);
  part(new THREE.BoxGeometry(89, 21, 44), wood, 0, 21, 0);
  const roof = part(new THREE.CylinderGeometry(0, 62, 26, 4, 1, true), canvas, 0, 93, 0); roof.rotation.y = Math.PI / 4;
  const trader = new THREE.MeshStandardMaterial({ color: '#6b755e', roughness: .85 });
  part(new THREE.SphereGeometry(10, 12, 8), new THREE.MeshStandardMaterial({ color: '#d5b294' }), 0, 59, -7);
  part(new THREE.CylinderGeometry(12, 15, 28, 12), trader, 0, 37, -7);
  const gold = new THREE.MeshStandardMaterial({ color: '#d7ae53', metalness: .6, roughness: .4 });
  for (const x of [-23, 1, 24]) part(new THREE.CylinderGeometry(5, 5, 4, 10), gold, x, 34, 17);
  merchantTemplate = g; return g.clone(true);
}
export class Arena3D {
  constructor(overlay, floor) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'world-3d'; this.canvas.setAttribute('aria-hidden', 'true');
    this.renderer = rendererFor(this.canvas, VIEW_W, VIEW_H);
    overlay.before(this.canvas);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#172021');
    this.gameMaterials = new Map();
    this.camera = createArenaCamera(); this.sun = lightScene(this.scene);
    // Ground contact shadows avoid a second geometry pass for every moving fighter.
    this.sun.intensity = 1.45; this.scene.children.find(o => o.isHemisphereLight).intensity = 1.15;
    this.scene.children.filter(o => o.isDirectionalLight && o !== this.sun).forEach(o => { o.intensity = .65; });
    const texture = new THREE.CanvasTexture(floor); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texture }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; this.scene.add(ground);
    // A slight gloss catches light on the sunken river without hiding the map texture.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.right - RIVER.left - 12, H), new THREE.MeshBasicMaterial({ color: '#284c53', transparent: true, opacity: .23 }));
    water.rotation.x = -Math.PI / 2; water.position.set(W / 2, .25, H / 2); this.scene.add(water);
    this.shadowTexture = contactTexture(); this.rigs = []; this.hookViews = new Map(); this.seenHooks = new WeakSet(); this.arena = null;
    this.available = true; this.resolution = 1; this.frameSamples = [];
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.available = false; this.canvas.hidden = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.available = true; this.canvas.hidden = false; this.renderedTime = null; });
  }
  setGame(game) {
    if (this.actors) { this.scene.remove(this.actors); for (const rig of this.rigs) { rig.shadow.material.dispose(); rig.ring.material.dispose(); rig.ring.geometry.dispose(); } }
    this.actors = new THREE.Group(); this.scene.add(this.actors); this.rigs = [];
    for (const p of game.players) {
      const rig = createPig(p.team); rig.shadow = contactShadow(this.shadowTexture); rig.root.add(rig.shadow);
      rig.lastHp = p.hp; rig.shotAt = rig.hitAt = -Infinity; rig.deathAt = null;
      const ring = new THREE.Mesh(new THREE.RingGeometry(26, p.id === 0 ? 28 : 27, 40), new THREE.MeshBasicMaterial({ color: TEAM_STYLES[p.team].color, transparent: true, opacity: p.id === 0 ? .85 : .3, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 1; rig.root.add(ring); rig.ring = ring;
      this.actors.add(rig.root); this.rigs.push(rig);
      // The inspection scene retains full PBR materials; small on-field actors
      // use shared Phong materials to keep the live battle affordable on laptops.
      rig.root.traverse(o => {
        if (!o.isMesh || !o.material.isMeshStandardMaterial) return;
        if (!this.gameMaterials.has(o.material)) {
          const m = o.material; this.gameMaterials.set(m, new THREE.MeshPhongMaterial({ color: m.color, vertexColors: m.vertexColors, shininess: m.metalness > .5 ? 45 : 10, specular: m.metalness > .5 ? '#69727a' : '#292c30', emissive: m.emissive, emissiveIntensity: m.emissiveIntensity }));
        }
        o.material = this.gameMaterials.get(o.material);
      });
    }
    for (const merchant of game.merchants) { const m = merchantModel(); m.position.set(merchant.x, 0, merchant.y); this.actors.add(m); }
    for (const view of this.hookViews.values()) { this.scene.remove(view.root); view.chain.geometry.dispose(); view.chain.material.dispose(); }
    this.hookViews.clear(); this.seenHooks = new WeakSet(); this.arena = game;
  }
  hookView(hook, team) {
    const root = new THREE.Group(), head = createHookHead(team);
    head.traverse(o => { if (o.isMesh && this.gameMaterials.has(o.material)) o.material = this.gameMaterials.get(o.material); });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(180 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const chain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#b0b7b9' }));
    // A thin dark underlay gives the metallic links definition over light ground.
    root.add(head, chain); this.scene.add(root);
    return { root, head, chain };
  }
  render(game, follow) {
    if (!this.available) return false;
    if (this.arena === game && this.renderedTime === game.time && this.followX === follow.x && this.followY === follow.y) return true;
    if (this.arena !== game) this.setGame(game);
    this.renderedTime = game.time; this.followX = follow.x; this.followY = follow.y;
    const now = performance.now(), interval = now - (this.lastFrameAt ?? now); this.lastFrameAt = now;
    if (interval > 0 && interval < 1500) this.frameSamples.push(interval);
    if (this.frameSamples.length >= 24) {
      const average = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
      if (average > 45 && this.resolution > .5) { this.resolution -= .25; this.renderer.setPixelRatio(this.resolution); }
      this.frameSamples = [];
    }
    syncArenaCamera(this.camera, follow);
    const cx = follow.x + VIEW_W / 2, cz = follow.y + VIEW_H / 2;
    this.sun.position.set(cx - 350, 800, cz + 420); this.sun.target.position.set(cx, 0, cz);
    const active = new Map(game.hooks.map(h => [h.owner, h]));
    for (const p of game.players) {
      const rig = this.rigs[p.id], hook = active.get(p.id);
      if (hook && !this.seenHooks.has(hook)) { this.seenHooks.add(hook); rig.shotAt = game.time; }
      if (p.hp < rig.lastHp) rig.hitAt = game.time;
      if (p.hp <= 0 && rig.deathAt === null) rig.deathAt = game.time;
      if (p.hp > 0) rig.deathAt = null;
      rig.lastHp = p.hp;
      const deathAge = rig.deathAt === null ? -1 : game.time - rig.deathAt;
      // Cull off-screen animation and shadow work, retaining a margin for body height.
      const dx = (p.x - cx) * PROJECTION.a, dy = (p.y - cz) * PROJECTION.d;
      rig.root.visible = Math.abs(dx) < VIEW_W / 2 + 100 && Math.abs(dy) < VIEW_H / 2 + 150 && deathAge < .65;
      if (!rig.root.visible) continue;
      rig.root.position.set(p.x, 0, p.y);
      animatePig(rig, { time: game.time + p.id * .2, speed: Math.hypot(p.vx, p.vy), angle: p.angle, shotAge: game.time - rig.shotAt, hitAge: game.time - rig.hitAt, pulling: !!p.pull, deathAge });
      rig.heldHook.visible = !hook;
      rig.ring.visible = p.hp > 0; rig.ring.material.opacity = p.id === 0 ? .85 : p.shield > 0 ? .65 : .25;
    }
    const current = new Set(game.hooks);
    for (const [h, view] of this.hookViews) if (!current.has(h)) { this.scene.remove(view.root); view.chain.geometry.dispose(); view.chain.material.dispose(); this.hookViews.delete(h); }
    for (const h of game.hooks) {
      const p = game.players[h.owner];
      if (!this.hookViews.has(h)) this.hookViews.set(h, this.hookView(h, p.team));
      const view = this.hookViews.get(h);
      view.head.position.set(h.x, HOOK_WORLD_HEIGHT, h.y);
      view.head.scale.setScalar(h.radius); view.head.rotation.set(-Math.PI / 2, 0, -Math.atan2(h.y - p.y, h.x - p.x) - Math.PI / 2);
      const d = Math.hypot(h.x - p.x, h.y - p.y), count = Math.min(180, Math.ceil(d / 9));
      const positions = view.chain.geometry.getAttribute('position'); view.chain.geometry.setDrawRange(0, count * 2);
      for (let i = 0; i < count; i++) for (let j = 0; j < 2; j++) {
        const u = (i + j * .7) / count;
        positions.setXYZ(i * 2 + j, p.x + (h.x - p.x) * u, HOOK_WORLD_HEIGHT - Math.sin(u * Math.PI) * Math.min(8, d * .012), p.y + (h.y - p.y) * u);
      }
      positions.needsUpdate = true; view.chain.frustumCulled = false;
    }
    this.renderer.render(this.scene, this.camera); return true;
  }
}

export function createPigPreview(canvas) {
  const renderer = rendererFor(canvas, 700, 560), scene = new THREE.Scene(); scene.background = new THREE.Color('#181d23'); lightScene(scene);
  const camera = new THREE.PerspectiveCamera(32, 700 / 560, 1, 1500); camera.position.set(0, 110, 260); camera.lookAt(0, 55, 0);
  const rigs = [createPig(0), createPig(1)]; rigs.forEach((r, i) => { scene.add(r.root); r.root.visible = i === 0; });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(105, 64), new THREE.MeshStandardMaterial({ color: '#252b31', roughness: .85 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const shadow = contactShadow(contactTexture()); shadow.scale.setScalar(1.5); scene.add(shadow);
  const clock = new THREE.Clock(); let rotation = -.45, dragging = false, previousX = 0, current = 0, disposed = false;
  const down = e => { dragging = true; previousX = e.clientX; canvas.setPointerCapture(e.pointerId); };
  const move = e => { if (dragging) { rotation += (e.clientX - previousX) * .012; previousX = e.clientX; } };
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  const frame = () => {
    if (disposed) return;
    const time = clock.getElapsedTime(); animatePig(rigs[current], { time, angle: Math.PI / 2 - rotation });
    renderer.render(scene, camera); requestAnimationFrame(frame);
  }; frame();
  return {
    setTeam(team) { rigs.forEach((r, i) => { r.root.visible = team === i; }); current = team; },
    dispose() { disposed = true; canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); renderer.dispose(); renderer.forceContextLoss(); },
  };
}
