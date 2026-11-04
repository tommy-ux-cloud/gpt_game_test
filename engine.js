export const W = 3600, H = 2250, COOLDOWN = 2.4, TARGET = 8, HOOK_RANGE = 820;
export const RIVER = { top: 1050, bottom: 1200 };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function segmentHit(ax, ay, bx, by, x, y, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + t * dx - x, ay + t * dy - y) <= radius;
}
export class Arena {
  constructor(random = Math.random) {
    this.random = random; this.time = 0; this.hooks = []; this.events = []; this.winner = null;
    this.players = [
      { name: '你', color: '#d6ed90', x: W * .38, y: RIVER.bottom + 90 },
      { name: '赤牙', color: '#ed9981', x: W * .38, y: RIVER.top - 90 },
      { name: '幽潮', color: '#8cbfc9', x: W * .62, y: RIVER.top - 90 },
      { name: '鐵顎', color: '#c6a0d5', x: W * .62, y: RIVER.bottom + 90 },
    ].map((p, id) => ({ ...p, id, hp: 100, kills: 0, deaths: 0, cooldown: 0, dead: 0, shield: 1.5, angle: -Math.PI / 2, vx: 0, vy: 0, aiTimer: 1 + id * .7, phase: id * 1.8, pull: null, moveTarget: null }));
  }
  moveTo(id, x, y) {
    const p = this.players[id];
    if (this.winner !== null || p.hp <= 0 || p.pull || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    // There is no bridge: orders across the river stop at the current bank.
    p.moveTarget = {
      x: clamp(x, 45, W - 45),
      y: p.y < RIVER.top ? clamp(y, 55, RIVER.top - 25) : clamp(y, RIVER.bottom + 25, H - 100),
    };
    return true;
  }
  stopMove(id) {
    const p = this.players[id];
    p.moveTarget = null; p.vx = p.vy = 0;
  }
  fire(id, x, y) {
    const p = this.players[id];
    if (this.winner !== null || p.hp <= 0 || p.cooldown > 0 || p.pull || this.hooks.some(h => h.owner === id)) return false;
    const angle = Math.atan2(y - p.y, x - p.x);
    p.angle = angle; p.cooldown = COOLDOWN;
    this.hooks.push({ owner: id, x: p.x, y: p.y, dx: Math.cos(angle), dy: Math.sin(angle), distance: 0, returning: false, victim: null, hasHit: false });
    this.events.push({ type: 'fire', x: p.x, y: p.y, color: p.color }); return true;
  }
  move(p, dx, dy, dt) {
    const speed = 185, mag = Math.hypot(dx, dy) || 1;
    p.vx = dx / mag * speed; p.vy = dy / mag * speed;
    p.x = clamp(p.x + p.vx * dt, 45, W - 45);
    const y = clamp(p.y + p.vy * dt, 55, H - 100);
    p.y = p.y < RIVER.top ? Math.min(y, RIVER.top - 25) : Math.max(y, RIVER.bottom + 25);
  }
  hit(h, target) {
    const owner = this.players[h.owner];
    // A cast catches one character total, including lethal hits and the return trip.
    h.hasHit = true; h.x = target.x; h.y = target.y;
    target.hp = Math.max(0, target.hp - 55);
    this.events.push({ type: 'hit', x: target.x, y: target.y, color: target.color, damage: 55 });
    if (target.hp === 0) {
      target.deaths++; target.dead = 3; target.pull = null; this.stopMove(target.id); owner.kills++;
      this.events.push({ type: 'kill', owner: owner.id, victim: target.id, x: target.x, y: target.y, color: target.color });
      if (owner.kills >= TARGET) { this.winner = owner.id; this.events.push({ type: 'win', owner: owner.id }); }
    } else {
      target.pull = h; this.stopMove(target.id); h.victim = target.id;
    }
    h.returning = true;
  }
  checkHit(h, ox, oy) {
    if (h.hasHit) return;
    const target = this.players.filter(p => p.id !== h.owner && p.hp > 0 && p.shield <= 0 && !p.pull && segmentHit(ox, oy, h.x, h.y, p.x, p.y, 28))
      .sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy))[0];
    if (target) this.hit(h, target);
  }
  tick(dt, input = {}) {
    if (this.winner !== null) return;
    dt = Math.min(dt, .05); this.time += dt;
    for (const p of this.players) {
      p.cooldown = Math.max(0, p.cooldown - dt); p.shield = Math.max(0, p.shield - dt);
      if (p.hp <= 0) {
        p.dead -= dt;
        if (p.dead <= 0) {
          p.hp = 100; p.x = W * (.15 + this.random() * .7); p.y = p.id % 2 ? RIVER.top - 90 : RIVER.bottom + 90; p.shield = 2; p.cooldown = .6;
          this.events.push({ type: 'spawn', x: p.x, y: p.y, color: p.color });
        }
        continue;
      }
      if (p.pull) { p.vx = p.vy = 0; continue; }
      if (p.id === 0) {
        if (p.moveTarget) {
          const dx = p.moveTarget.x - p.x, dy = p.moveTarget.y - p.y;
          if (Math.hypot(dx, dy) <= 185 * dt) {
            p.x = p.moveTarget.x; p.y = p.moveTarget.y; this.stopMove(p.id);
          } else this.move(p, dx, dy, dt);
        } else p.vx = p.vy = 0;
        if (input.aim) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
      } else {
        const enemies = this.players.filter(e => e.id !== p.id && e.hp > 0 && !e.pull);
        const target = enemies.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (!target) continue;
        p.angle = Math.atan2(target.y - p.y, target.x - p.x);
        let dx = Math.sin(this.time * .8 + p.phase) * .75 + (target.x - p.x) / 1000;
        let dy = Math.cos(this.time * 1.1 + p.phase) * .65;
        for (const h of this.hooks) {
          if (h.owner === p.id || h.hasHit) continue;
          if (Math.hypot(h.x - p.x, h.y - p.y) < 170) { dx += -h.dy * .7; dy += h.dx * .7; }
        }
        this.move(p, dx, dy, dt);
        p.aiTimer -= dt;
        if (p.aiTimer <= 0) {
          const distance = Math.hypot(target.x - p.x, target.y - p.y);
          if (distance < HOOK_RANGE - 10) this.fire(p.id, target.x + target.vx * distance / 1100 + (this.random() - .5) * 95, target.y + target.vy * distance / 1100 + (this.random() - .5) * 95);
          p.aiTimer = 2.8 + this.random() * 1.7;
        }
      }
    }
    this.hooks = this.hooks.filter(h => {
      const owner = this.players[h.owner];
      if (owner.hp <= 0 || owner.pull) { this.release(h); return false; }
      if (h.returning) {
        const dx = owner.x - h.x, dy = owner.y - h.y, d = Math.hypot(dx, dy), step = 1080 * dt;
        const ox = h.x, oy = h.y, travel = Math.min(d, step);
        h.x += dx / (d || 1) * travel; h.y += dy / (d || 1) * travel;
        // Sweep the complete return segment, including the final step at the owner.
        this.checkHit(h, ox, oy);
        if (h.victim !== null) { const p = this.players[h.victim]; p.x = h.x; p.y = h.y; }
        if (d <= step) { this.release(h, owner); return false; }
      } else {
        const ox = h.x, oy = h.y, step = Math.min(850 * dt, HOOK_RANGE - h.distance);
        h.x += h.dx * step; h.y += h.dy * step; h.distance += step;
        this.checkHit(h, ox, oy);
        if (h.distance >= HOOK_RANGE || h.x < 20 || h.x > W - 20 || h.y < 25 || h.y > H - 35) h.returning = true;
      }
      return true;
    });
  }
  release(h, owner) {
    if (h.victim === null) return;
    const p = this.players[h.victim]; p.pull = null;
    if (owner) { p.x = clamp(owner.x + (p.x > owner.x ? 38 : -38), 45, W - 45); p.y = owner.y; }
    if (p.y > RIVER.top - 25 && p.y < RIVER.bottom + 25) p.y = p.y < (RIVER.top + RIVER.bottom) / 2 ? RIVER.top - 25 : RIVER.bottom + 25;
  }
}
