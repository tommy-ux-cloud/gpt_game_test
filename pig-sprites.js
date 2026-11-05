// Eight views and two opposing walking steps, generated from the approved art.
// Atlas rows 0–1 contain step A; rows 2–3 contain step B, in the same view order.
export const SPRITE_ASSETS = ['assets/pig-blue-atlas.png', 'assets/pig-red-atlas.png'];
export const DIRECTIONS = ['正面', '左前', '左側', '左後', '背面', '右後', '右側', '右前'];
export const SPRITE_HEIGHT = 104;
export function directionFor(angle) {
  if (!Number.isFinite(angle)) return 0;
  return ((Math.round((angle - Math.PI / 2) / (Math.PI / 4)) % 8) + 8) % 8;
}
export function frameFor(angle, time = 0, moving = false, phase = 0) {
  return directionFor(angle) + (moving && Math.floor(time * 8 + phase) % 2 ? 8 : 0);
}
// Measure actual alpha, not the transparent cell margin. Feet anchor to the world
// point; a median of dark torso pixels keeps the chest centered, excluding the hook.
export function measureAtlas(data, width, height) {
  const frames = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const x0 = Math.round(col * width / 4), x1 = Math.round((col + 1) * width / 4);
    const y0 = Math.round(row * height / 4), y1 = Math.round((row + 1) * height / 4);
    let left = x1, right = x0, top = y1, bottom = y0, count = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (data[(y * width + x) * 4 + 3] < 64) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
    }
    if (count < 16 || right <= left || bottom <= top) throw new Error(`Empty character frame ${frames.length}`);
    const torso = [];
    for (let y = Math.round(top + (bottom - top) * .44); y < top + (bottom - top) * .72; y++) for (let x = left; x <= right; x++) {
      const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 180 && r > 12 && Math.max(r, g, b) < 106 && Math.abs(r - g) < 18 && Math.abs(g - b) < 18) torso.push(x);
    }
    torso.sort((a, b) => a - b);
    const anchorX = torso.length ? torso[Math.floor(torso.length / 2)] : (left + right) / 2;
    frames.push({ x: left, y: top, width: right - left + 1, height: bottom - top + 1, anchorX: anchorX - left, anchorY: bottom - top + 1 });
  }
  return frames;
}
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Character image could not be loaded'));
    image.src = new URL(source, document.baseURI).href;
  });
}
export class PigSprites {
  constructor() { this.loaded = false; this.images = []; this.frames = []; this.reset(); }
  reset() { this.states = new Map(); this.hooks = new WeakSet(); }
  async load() {
    const images = await Promise.all(SPRITE_ASSETS.map(loadImage));
    const frames = images.map(image => {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
      return measureAtlas(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    });
    this.images = images; this.frames = frames; this.loaded = true;
  }
  update(game) {
    for (const p of game.players) {
      let state = this.states.get(p.id);
      if (!state) { state = { hp: p.hp, hitAt: -Infinity, shotAt: -Infinity, deathAt: -Infinity }; this.states.set(p.id, state); }
      if (p.hp < state.hp) state.hitAt = game.time;
      if (p.hp <= 0 && state.hp > 0) state.deathAt = game.time;
      if (p.hp > 0) state.deathAt = -Infinity;
      state.hp = p.hp;
    }
    for (const hook of game.hooks) if (!this.hooks.has(hook)) { this.hooks.add(hook); const state = this.states.get(hook.owner); if (state) state.shotAt = game.time; }
  }
  dying(id, time) { const state = this.states.get(id); return !!state && time - state.deathAt < .5; }
  draw(ctx, p, time, height = SPRITE_HEIGHT) {
    if (!this.loaded) return false;
    const moving = Math.hypot(p.vx, p.vy) > 5 && !p.pull && p.hp > 0;
    const index = frameFor(p.angle, time, moving, p.id * .37), frame = this.frames[p.team][index];
    const state = this.states.get(p.id), deathAge = state ? time - state.deathAt : Infinity;
    const shotAge = state ? time - state.shotAt : Infinity;
    const scale = height / frame.height;
    ctx.save();
    if (p.hp <= 0) {
      if (deathAge >= .5) { ctx.restore(); return false; }
      ctx.globalAlpha *= Math.max(0, 1 - deathAge / .5); ctx.rotate(-Math.min(1, deathAge / .4) * .9); ctx.translate(-deathAge * 20, 0);
    } else {
      const bob = moving ? Math.abs(Math.sin(time * Math.PI * 8 + p.id)) * 1.5 : Math.sin(time * 2.5 + p.id) * .35;
      ctx.translate(0, -bob);
      if (p.pull) ctx.rotate(Math.cos(p.angle) * -.09);
      if (shotAge < .28) ctx.rotate(Math.sin(shotAge / .28 * Math.PI) * -.055);
      if (state && time - state.hitAt < .16) ctx.translate(Math.sin((time - state.hitAt) * 45) * 1.8, 0);
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.images[p.team], frame.x, frame.y, frame.width, frame.height, -frame.anchorX * scale, -frame.anchorY * scale, frame.width * scale, frame.height * scale);
    ctx.restore(); return true;
  }
}
export function createSpritePreview(canvas, sprites, onDirection = () => {}) {
  const ctx = canvas.getContext('2d');
  let team = 0, direction = 0, dragging = false, previousX = 0, disposed = false, raf;
  const draw = now => {
    if (disposed) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const backdrop = ctx.createRadialGradient(350, 260, 60, 350, 300, 430); backdrop.addColorStop(0, '#30343b'); backdrop.addColorStop(1, '#171c23');
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(350, 502, 112, 23, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(350, 503);
    sprites.draw(ctx, { id: -1, team, hp: 100, vx: 0, vy: 0, angle: Math.PI / 2 + direction * Math.PI / 4 }, now / 1000, 440);
    ctx.restore(); raf = requestAnimationFrame(draw);
  };
  const setDirection = value => { direction = (value % 8 + 8) % 8; onDirection(direction); };
  const down = e => { dragging = true; previousX = e.clientX; canvas.setPointerCapture(e.pointerId); };
  const move = e => { if (!dragging) return; const step = Math.trunc((e.clientX - previousX) / 35); if (step) { setDirection(direction + step); previousX = e.clientX; } };
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  raf = requestAnimationFrame(draw); onDirection(direction);
  return {
    setTeam(value) { team = value; }, setDirection,
    dispose() { disposed = true; cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); },
  };
}
