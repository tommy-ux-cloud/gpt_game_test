export const W = 3600, H = 2250, COOLDOWN = 2.4, TARGET = 8, HOOK_RANGE = 820;
export const RIVER = { left: 1710, right: 1890 };
export const SHOP_RANGE = 230;
export const UPGRADES = [
  { key: 'maxHp', name: '最大生命', unit: 'HP', step: '+5' },
  { key: 'regen', name: '回血速度', unit: 'HP / 秒', step: '+0.1 / 秒' },
  { key: 'moveSpeed', name: '移動速度', unit: ' / 秒', step: '+3' },
  { key: 'hookRadius', name: '鉤子頭大小', unit: '半徑', step: '+0.75' },
  { key: 'hookCooldown', name: '鉤子冷卻', unit: '秒', step: '縮短 3%' },
  { key: 'hookSpeed', name: '鉤子速度', unit: ' / 秒', step: '+25' },
  { key: 'hookRange', name: '鉤子長度', unit: '射程', step: '+25' },
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function segmentHit(ax, ay, bx, by, x, y, radius) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(ax + t * dx - x, ay + t * dy - y) <= radius;
}
export function upgradeValue(p, key) {
  const additions = { maxHp: 5, regen: .1, moveSpeed: 3, hookRadius: .75, hookSpeed: 25, hookRange: 25 };
  return key === 'hookCooldown' ? Math.max(.8, p.hookCooldown * .97) : p[key] + additions[key];
}
export class Arena {
  constructor(random = Math.random) {
    this.random = random; this.time = 0; this.hooks = []; this.events = []; this.winner = null;
    this.teams = [{ name: '翠葉隊', color: '#d6ed90', score: 0 }, { name: '赤牙隊', color: '#ed9981', score: 0 }];
    this.merchants = [
      { id: 0, name: '西境商人', x: 90, y: H / 2, team: null, invulnerable: true, hookable: false },
      { id: 1, name: '東境商人', x: W - 90, y: H / 2, team: null, invulnerable: true, hookable: false },
    ];
    this.players = [
      { name: '你', team: 0, x: RIVER.left - 130, y: H / 2 - 110 },
      { name: '赤牙', team: 1, x: RIVER.right + 130, y: H / 2 - 110 },
      { name: '幽潮', team: 1, x: RIVER.right + 130, y: H / 2 + 110 },
      { name: '鐵顎', team: 0, x: RIVER.left - 130, y: H / 2 + 110 },
    ].map((p, id) => ({ ...p, id, color: this.teams[p.team].color, hp: 100, maxHp: 100, regen: .5, moveSpeed: 185,
      hookRadius: 8, hookCooldown: COOLDOWN, hookSpeed: 850, hookRange: HOOK_RANGE, gold: 0,
      levels: Object.fromEntries(UPGRADES.map(u => [u.key, 0])), kills: 0, deaths: 0, cooldown: 0, dead: 0,
      shield: 1.5, angle: p.team ? Math.PI : 0, vx: 0, vy: 0, aiTimer: 1 + id * .7, phase: id * 1.8, pull: null, moveTarget: null }));
  }
  bounds(p) {
    return p.x < RIVER.left ? { min: 45, max: RIVER.left - 25 } : { min: RIVER.right + 25, max: W - 45 };
  }
  moveTo(id, x, y) {
    const p = this.players[id];
    if (this.winner !== null || !p || p.hp <= 0 || p.pull || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const bounds = this.bounds(p);
    p.moveTarget = { x: clamp(x, bounds.min, bounds.max), y: clamp(y, 55, H - 55) };
    return true;
  }
  stopMove(id) { const p = this.players[id]; p.moveTarget = null; p.vx = p.vy = 0; }
  canShop(id, merchantId) {
    const p = this.players[id];
    return !!p && this.winner === null && p.hp > 0 && !p.pull && this.merchants.some(m =>
      (merchantId === undefined || m.id === merchantId) && Math.hypot(p.x - m.x, p.y - m.y) <= SHOP_RANGE);
  }
  buy(id, key, merchantId) {
    const p = this.players[id];
    if (!this.canShop(id, merchantId) || p.gold < 1 || !UPGRADES.some(u => u.key === key)) return false;
    const next = upgradeValue(p, key);
    if (!Number.isFinite(next) || next === p[key]) return false;
    p.gold--; p[key] = next; p.levels[key]++;
    if (key === 'maxHp') p.hp = Math.min(p.maxHp, p.hp + 5);
    this.events.push({ type: 'purchase', player: id, key }); return true;
  }
  fire(id, x, y) {
    const p = this.players[id];
    if (this.winner !== null || p.hp <= 0 || p.cooldown > 0 || p.pull || this.hooks.some(h => h.owner === id)) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const angle = Math.atan2(y - p.y, x - p.x);
    p.angle = angle; p.cooldown = p.hookCooldown;
    this.hooks.push({ owner: id, x: p.x, y: p.y, dx: Math.cos(angle), dy: Math.sin(angle), distance: 0,
      returning: false, victim: null, hasHit: false, range: p.hookRange, speed: p.hookSpeed,
      returnSpeed: p.hookSpeed * 1080 / 850, radius: p.hookRadius });
    this.events.push({ type: 'fire', x: p.x, y: p.y, color: p.color }); return true;
  }
  move(p, dx, dy, dt) {
    const mag = Math.hypot(dx, dy) || 1, bounds = this.bounds(p), ox = p.x, oy = p.y;
    p.x = clamp(p.x + dx / mag * p.moveSpeed * dt, bounds.min, bounds.max);
    p.y = clamp(p.y + dy / mag * p.moveSpeed * dt, 55, H - 55);
    p.vx = dt ? (p.x - ox) / dt : 0; p.vy = dt ? (p.y - oy) / dt : 0;
  }
  hit(h, target) {
    const owner = this.players[h.owner];
    if (!owner || !this.players.includes(target) || target.hp <= 0) return;
    h.hasHit = true; h.x = target.x; h.y = target.y;
    const damage = owner.team === target.team ? 0 : 55;
    target.hp = Math.max(0, target.hp - damage);
    this.events.push({ type: 'hit', x: target.x, y: target.y, color: target.color, damage });
    this.stopMove(target.id);
    if (target.hp === 0) {
      target.deaths++; target.dead = 3; target.pull = null; owner.kills++; owner.gold++;
      this.teams[owner.team].score++;
      this.events.push({ type: 'kill', owner: owner.id, victim: target.id, x: target.x, y: target.y, color: target.color });
      if (this.teams[owner.team].score >= TARGET) { this.winner = owner.team; this.events.push({ type: 'win', team: owner.team }); }
    } else { target.pull = h; h.victim = target.id; }
    h.returning = true;
  }
  checkHit(h, ox, oy) {
    if (h.hasHit) return;
    // Merchants are deliberately outside the player collision set, on both legs.
    const target = this.players.filter(p => p.id !== h.owner && p.hp > 0 && p.shield <= 0 && !p.pull && segmentHit(ox, oy, h.x, h.y, p.x, p.y, 20 + h.radius))
      .sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy))[0];
    if (target) this.hit(h, target);
  }
  respawn(p) {
    p.x = p.team === 0 ? 180 + this.random() * (RIVER.left - 360) : RIVER.right + 180 + this.random() * (W - RIVER.right - 360);
    p.y = 100 + this.random() * (H - 200); p.hp = p.maxHp; p.shield = 2; p.cooldown = .6; p.pull = null; this.stopMove(p.id);
    this.events.push({ type: 'spawn', player: p.id, x: p.x, y: p.y, color: p.color });
  }
  tick(dt, input = {}) {
    if (this.winner !== null) return;
    dt = Math.min(dt, .05); this.time += dt;
    for (const p of this.players) {
      p.cooldown = Math.max(0, p.cooldown - dt); p.shield = Math.max(0, p.shield - dt);
      if (p.hp <= 0) { p.dead -= dt; if (p.dead <= 0) this.respawn(p); continue; }
      p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      if (p.pull) { p.vx = p.vy = 0; continue; }
      if (p.id === 0) {
        if (p.moveTarget) {
          const dx = p.moveTarget.x - p.x, dy = p.moveTarget.y - p.y;
          if (Math.hypot(dx, dy) <= p.moveSpeed * dt) { p.x = p.moveTarget.x; p.y = p.moveTarget.y; this.stopMove(p.id); }
          else this.move(p, dx, dy, dt);
        } else p.vx = p.vy = 0;
        if (input.aim) p.angle = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
      } else {
        const merchant = [...this.merchants].sort((a, b) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
        if (p.gold > 0) {
          if (this.canShop(p.id, merchant.id)) {
            const items = UPGRADES.filter(u => upgradeValue(p, u.key) !== p[u.key]);
            this.buy(p.id, items[Math.floor(this.random() * items.length)].key, merchant.id);
          } else { this.move(p, merchant.x - p.x, merchant.y - p.y, dt); continue; }
        }
        const enemies = this.players.filter(e => e.team !== p.team && e.hp > 0 && !e.pull);
        const target = enemies.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        if (!target) continue;
        p.angle = Math.atan2(target.y - p.y, target.x - p.x);
        const distance = Math.hypot(target.x - p.x, target.y - p.y);
        let dx = (target.x - p.x) / 450 + Math.sin(this.time + p.phase) * .6;
        let dy = (target.y - p.y) / 450 + Math.cos(this.time * 1.1 + p.phase) * .7;
        if (distance < p.hookRange * .6) dx = Math.sin(this.time + p.phase) * .7;
        for (const h of this.hooks) {
          if (h.owner === p.id || h.hasHit) continue;
          if (Math.hypot(h.x - p.x, h.y - p.y) < 170) { dx += -h.dy * .7; dy += h.dx * .7; }
        }
        this.move(p, dx, dy, dt); p.aiTimer -= dt;
        if (p.aiTimer <= 0) {
          if (distance < p.hookRange - 10) this.fire(p.id, target.x + target.vx * distance / p.hookSpeed + (this.random() - .5) * 95, target.y + target.vy * distance / p.hookSpeed + (this.random() - .5) * 95);
          p.aiTimer = p.hookCooldown + .4 + this.random() * 1.5;
        }
      }
    }
    this.hooks = this.hooks.filter(h => {
      const owner = this.players[h.owner];
      if (owner.hp <= 0 || owner.pull) { this.release(h); return false; }
      if (h.returning) {
        const dx = owner.x - h.x, dy = owner.y - h.y, d = Math.hypot(dx, dy), step = h.returnSpeed * dt;
        const ox = h.x, oy = h.y, travel = Math.min(d, step);
        h.x += dx / (d || 1) * travel; h.y += dy / (d || 1) * travel;
        this.checkHit(h, ox, oy);
        if (h.victim !== null) { const p = this.players[h.victim]; p.x = h.x; p.y = h.y; }
        if (d <= step) { this.release(h, owner); return false; }
      } else {
        const ox = h.x, oy = h.y, step = Math.min(h.speed * dt, h.range - h.distance);
        h.x += h.dx * step; h.y += h.dy * step; h.distance += step; this.checkHit(h, ox, oy);
        if (h.distance >= h.range || h.x < 20 || h.x > W - 20 || h.y < 25 || h.y > H - 35) h.returning = true;
      }
      return true;
    });
  }
  release(h, owner) {
    if (h.victim === null) return;
    const p = this.players[h.victim]; p.pull = null;
    if (owner) { p.x = clamp(owner.x + (h.dx >= 0 ? 38 : -38), 45, W - 45); p.y = owner.y; }
    if (p.x > RIVER.left - 25 && p.x < RIVER.right + 25) p.x = p.x < W / 2 ? RIVER.left - 25 : RIVER.right + 25;
  }
}
