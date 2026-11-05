import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, segmentHit, segmentHitTime, RIVER, TARGET, W, H, SHOP_RANGE, UPGRADES } from '../engine.js';

function isolated() {
  const g = new Arena(() => .5);
  for (const p of g.players) { p.shield = 0; p.aiTimer = 99999; p.regen = 0; }
  for (const p of g.players.slice(2)) { p.hp = 0; p.dead = 99999; }
  return g;
}
function advance(g, seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) g.tick(1 / 60); }
function finishHook(g) {
  for (let i = 0; i < 600 && g.hooks.length; i++) g.tick(1 / 60);
  assert.equal(g.hooks.length, 0, 'hook must finish its return within the test deadline');
}
function battle() {
  const g = isolated(); g.move = () => {};
  g.players[0].x = RIVER.left - 130; g.players[1].x = RIVER.right + 130;
  g.players[0].y = g.players[1].y = H / 2;
  return g;
}
function atShop(g, side = 0) {
  const p = g.players[0], m = g.merchants[side]; p.x = m.x; p.y = m.y; return p;
}
function emptyReturning() {
  const g = battle(), [owner, target] = g.players;
  owner.x = 500; owner.y = H / 2;
  target.x = 900; target.y = owner.y + 100;
  g.fire(0, 1500, owner.y);
  for (let i = 0; i < 120 && !g.hooks[0]?.returning; i++) g.tick(1 / 60);
  assert.equal(target.hp, 100); assert.equal(g.hooks[0]?.returning, true); return g;
}

test('swept hook collision catches between-frame targets', () => {
  assert.equal(segmentHit(0, 0, 100, 0, 50, 20, 25), true);
  assert.equal(segmentHit(0, 0, 100, 0, 50, 30, 25), false);
});
test('two balanced teams start on their respective left and right territories', () => {
  const g = new Arena();
  assert.equal(g.players.filter(p => p.team === 0).length, 5);
  assert.equal(g.players.filter(p => p.team === 1).length, 5);
  assert.ok(g.players.every(p => p.team === 0 ? p.x < RIVER.left : p.x > RIVER.right));
  assert.ok(g.players.every(p => p.gold === 0));
});
test('right-click movement arrives exactly, independently of aiming', () => {
  const g = isolated(), p = g.players[0], x = p.x, y = p.y;
  g.moveTo(0, x - 100, y + 50); g.tick(.05, { aim: { x: W, y: 0 } });
  assert.ok(Math.abs(Math.hypot(p.x - x, p.y - y) - p.moveSpeed * .05) < .001);
  advance(g, 1); assert.equal(p.x, x - 100); assert.equal(p.y, y + 50); assert.equal(p.moveTarget, null);
});
test('vertical river blocks walking across either direction, including after being pulled across', () => {
  const g = isolated(), p = g.players[0];
  g.moveTo(0, W, H / 2); advance(g, 3); assert.equal(p.x, RIVER.left - 25);
  p.x = RIVER.right + 200; g.moveTo(0, 0, H / 2); advance(g, 3); assert.equal(p.x, RIVER.right + 25);
  g.moveTo(0, W + 100, -100); assert.deepEqual(p.moveTarget, { x: W - 45, y: 55 });
});
test('S stops an order and dead or pulled players cannot issue movement', () => {
  const g = isolated(), p = g.players[0]; g.moveTo(0, 100, 600); advance(g, .2);
  g.stopMove(0); const x = p.x; advance(g, .5); assert.equal(p.x, x);
  p.hp = 0; assert.equal(g.moveTo(0, 500, 500), false);
  p.hp = 100; p.pull = {}; assert.equal(g.moveTo(0, 500, 500), false);
});
test('outgoing hook crosses the vertical river, damages and pulls back onto the owner bank', () => {
  const g = battle(), [owner, target] = g.players;
  target.moveTarget = { x: 3000, y: 1000 };
  assert.equal(g.fire(0, target.x, target.y), true); assert.equal(g.fire(0, target.x, target.y), false);
  finishHook(g); assert.equal(target.hp, 45); assert.equal(target.pull, null); assert.equal(target.moveTarget, null);
  assert.ok(target.x < RIVER.left); assert.ok(target.x > owner.x, 'target lands on incoming hook side'); assert.equal(target.y, owner.y); assert.equal(g.hooks.length, 0);
});
test('empty returning hook catches an enemy stepping into the return path exactly once', () => {
  const g = emptyReturning(), [owner, target] = g.players;
  target.x = 1000; target.y = owner.y; advance(g, 1);
  assert.equal(target.hp, 45); assert.equal(target.pull, null); assert.equal(g.hooks.length, 0);
  assert.equal(g.events.filter(e => e.type === 'hit').length, 1);
});
test('return sweep includes its final step and respects spawn protection', () => {
  for (const protectedTarget of [false, true]) {
    const g = emptyReturning(), [owner, target] = g.players, h = g.hooks[0];
    h.x = owner.x + 35; h.y = owner.y; target.x = owner.x + 20; target.y = owner.y;
    if (protectedTarget) target.shield = 2;
    g.tick(.05); assert.equal(target.hp, protectedTarget ? 100 : 45); assert.equal(g.hooks.length, 0);
  }
});
test('allied hooks rescue without damage, kills, money or team score', () => {
  const g = battle(), [owner, target] = g.players; target.team = owner.team;
  g.fire(0, target.x, target.y); finishHook(g);
  assert.equal(target.hp, 100); assert.equal(target.pull, null); assert.ok(target.x < RIVER.left);
  assert.equal(owner.gold, 0); assert.equal(owner.kills, 0); assert.equal(g.teams[0].score, 0);
});
test('an enemy kill grants exactly one personal coin and one team point', () => {
  const g = battle(), [owner, target] = g.players; target.hp = 45;
  g.fire(0, target.x, target.y); advance(g, 1.5);
  assert.equal(owner.kills, 1); assert.equal(owner.gold, 1); assert.equal(g.teams[0].score, 1);
  assert.equal(target.hp, 0); assert.equal(target.deaths, 1);
  assert.equal(g.events.filter(e => e.type === 'kill').length, 1);
});
test('lethal outbound hit cannot award another kill or coin during return', () => {
  const g = battle(), [owner, target, other] = g.players;
  owner.x = 500; target.x = 1000; target.hp = 45; other.hp = 45; other.x = 750; other.y = owner.y + 100;
  g.fire(0, 1400, owner.y);
  for (let i = 0; i < 120 && target.hp > 0; i++) g.tick(1 / 60);
  other.y = owner.y; advance(g, 1); assert.equal(other.hp, 45); assert.equal(owner.gold, 1);
});
test('team victory sums teammate kills and stops the match at eight', () => {
  const g = battle(), target = g.players[1]; g.targetKills = 8;
  g.players[3].hp = 100;
  for (let i = 0; i < 8; i++) { target.hp = 45; g.hit({ owner: i % 2 ? 3 : 0 }, target); }
  assert.equal(g.players[0].kills, 4); assert.equal(g.players[3].kills, 4);
  assert.equal(g.players[0].gold, 7); assert.equal(g.players[3].gold, 7);
  assert.equal(g.teams[0].score, 8); assert.equal(g.winner, 0);
  const time = g.time; advance(g, 1); assert.equal(g.time, time);
});
test('respawns always use team territory even after dying on enemy territory', () => {
  for (const roll of [0, .5, 1]) {
    const g = new Arena(() => roll);
    for (const p of g.players) {
      p.x = p.team ? 500 : W - 500; p.maxHp = 120; p.gold = 2; p.levels.maxHp = 2;
      p.hp = 0; p.dead = .01; g.tick(.02);
      assert.ok(p.team === 0 ? p.x < RIVER.left : p.x > RIVER.right);
      assert.ok(p.y >= 55 && p.y <= H - 55); assert.equal(p.hp, 120); assert.ok(p.shield > 0);
      assert.equal(p.gold, 2); assert.equal(p.levels.maxHp, 2);
    }
  }
});
test('cancelled pulls never strand a victim inside the vertical river', () => {
  const g = battle(), [owner, target] = g.players;
  const h = { owner: 0, victim: 1, x: W / 2, y: H / 2 };
  target.x = W / 2; target.pull = h; owner.hp = 0; owner.dead = 3; g.hooks.push(h);
  g.tick(.02); assert.equal(target.pull, null); assert.ok(target.x <= RIVER.left - 25 || target.x >= RIVER.right + 25);
});
test('two neutral invulnerable merchants are centered on the outer side boundaries', () => {
  const g = new Arena(); const [left, right] = g.merchants;
  assert.equal(left.y, H / 2); assert.equal(right.y, H / 2);
  assert.ok(left.x < 100); assert.ok(right.x > W - 100);
  assert.ok(g.merchants.every(m => m.team === null && m.invulnerable && !m.hookable));
});
test('hooks pass through merchants without damaging, pulling or consuming the hook', () => {
  const g = battle(), [owner, target] = g.players, m = g.merchants[0];
  owner.x = 500; target.x = 55; owner.y = target.y = m.y;
  const before = JSON.stringify(g.merchants);
  g.fire(0, 0, m.y); advance(g, 1); assert.equal(target.hp, 45);
  assert.equal(JSON.stringify(g.merchants), before);
  g.hit({ owner: 0 }, m); assert.equal(JSON.stringify(g.merchants), before);
});
test('both teams can buy from either merchant when physically nearby', () => {
  const g = new Arena();
  for (const p of g.players) for (const m of g.merchants) {
    p.x = m.x; p.y = m.y; p.gold = 1;
    assert.equal(g.canShop(p.id, m.id), true); assert.equal(g.buy(p.id, 'maxHp', m.id), true); assert.equal(p.gold, 0);
  }
});
test('shop rejects insufficient money, distance, dead/pulled players, invalid item or merchant', () => {
  const g = new Arena(), p = atShop(g); p.gold = 0;
  assert.equal(g.buy(0, 'maxHp'), false); p.gold = 1;
  assert.equal(g.buy(0, 'password'), false); assert.equal(g.buy(0, 'maxHp', 99), false);
  p.x += SHOP_RANGE + 1; assert.equal(g.buy(0, 'maxHp'), false);
  atShop(g); p.hp = 0; assert.equal(g.buy(0, 'maxHp'), false);
  p.hp = 100; p.pull = {}; assert.equal(g.buy(0, 'maxHp'), false); assert.equal(p.gold, 1); assert.equal(p.maxHp, 100);
});
test('all eight upgrades cost one coin each and apply conservative increments', () => {
  const g = new Arena(), p = atShop(g); p.gold = 8;
  const before = { ...p };
  for (const u of UPGRADES) { const gold = p.gold; assert.equal(g.buy(0, u.key), true); assert.equal(p.gold, gold - 1); assert.equal(p.levels[u.key], 1); }
  assert.equal(p.maxHp, before.maxHp + 5); assert.equal(p.hp, 105);
  assert.equal(p.regen, before.regen + .1); assert.equal(p.moveSpeed, before.moveSpeed + 3);
  assert.equal(p.hookRadius, before.hookRadius + .75); assert.equal(p.hookCooldown, before.hookCooldown * .97);
  assert.equal(p.hookSpeed, before.hookSpeed + 25); assert.equal(p.hookRange, before.hookRange + 25); assert.equal(p.hookDamage, before.hookDamage + 2); assert.equal(p.gold, 0);
});
test('purchased regeneration and movement speed affect actual simulation', () => {
  const g = isolated(), p = atShop(g); p.regen = .5; p.gold = 2;
  g.buy(0, 'regen'); g.buy(0, 'moveSpeed'); p.hp = 50;
  g.moveTo(0, p.x + 500, p.y); const x = p.x; advance(g, 1);
  assert.ok(Math.abs(p.hp - 50.6) < .001); assert.ok(Math.abs(p.x - x - 188) < .001);
  p.hp = p.maxHp; advance(g, 1); assert.equal(p.hp, p.maxHp);
});
test('larger hook head changes actual hit detection on both cast legs', () => {
  for (const upgraded of [false, true]) {
    const g = battle(), [owner, target] = g.players;
    atShop(g); owner.gold = 1; if (upgraded) g.buy(0, 'hookRadius');
    owner.x = 500; target.x = 800; target.y = owner.y + 28.5;
    g.fire(0, 1500, owner.y); advance(g, 1.9);
    assert.equal(target.hp, upgraded ? 45 : 100);
  }
});
test('purchased hook range, speed and cooldown apply to the next cast', () => {
  const g = battle(), p = atShop(g); p.gold = 3;
  for (const key of ['hookRange', 'hookSpeed', 'hookCooldown']) g.buy(0, key);
  p.x = 500; p.y = H / 2; g.players[1].y += 200;
  g.fire(0, 3000, p.y); assert.equal(p.cooldown, 0);
  const h = g.hooks[0]; assert.equal(h.range, 845); assert.equal(h.speed, 675); assert.ok(h.returnSpeed > 650 * 1080 / 850);
  const x = h.x; g.tick(.05); assert.equal(h.x - x, 675 * .05);
  for (let i = 0; i < 120 && !h.returning; i++) g.tick(1 / 60);
  assert.equal(h.distance, 845); assert.equal(h.returning, true);
});
test('upgrading during an active hook does not change the existing projectile', () => {
  const g = battle(), p = atShop(g); p.gold = 1; g.fire(0, 900, p.y);
  const h = g.hooks[0]; g.buy(0, 'hookRange'); assert.equal(p.hookRange, 845); assert.equal(h.range, 820);
});
test('cooldown has a safe minimum and buying at the limit does not spend money', () => {
  const g = new Arena(), p = atShop(g); p.gold = 200;
  while (g.buy(0, 'hookCooldown')) { /* buy to the documented floor */ }
  assert.equal(p.hookCooldown, .8); const gold = p.gold;
  assert.equal(g.buy(0, 'hookCooldown'), false); assert.equal(p.gold, gold);
});
test('new match resets currency, upgrades, team points and player stats', () => {
  const g = new Arena(), p = atShop(g); p.gold = 2; g.buy(0, 'maxHp'); g.teams[0].score = 3;
  const fresh = new Arena(); assert.equal(fresh.players[0].gold, 0); assert.equal(fresh.players[0].maxHp, 100);
  assert.equal(fresh.players[0].levels.maxHp, 0); assert.equal(fresh.teams[0].score, 0);
});

function scoreKill(g, killerId, victimId) {
  const killer = g.players[killerId], victim = g.players[victimId];
  killer.hp = killer.maxHp; victim.hp = 45;
  g.hit({ owner: killerId }, victim);
  return g.events.findLast(e => e.type === 'kill');
}
test('default target is 30 and custom targets are applied at exact team thresholds', () => {
  assert.equal(new Arena().targetKills, 30); assert.equal(TARGET, 30);
  for (const targetKills of [1, 5, 50]) {
    const g = new Arena(() => .5, { targetKills });
    for (let i = 1; i <= targetKills; i++) {
      scoreKill(g, i % 2 ? 0 : 3, 1);
      assert.equal(g.winner, i === targetKills ? 0 : null);
    }
    const gold = g.players[0].gold; scoreKill(g, 0, 1); assert.equal(g.players[0].gold, gold);
  }
});
test('infinite practice continues after the default victory score', () => {
  const g = new Arena(() => .5, { targetKills: null });
  for (let i = 0; i < 100; i++) scoreKill(g, 0, 1);
  assert.equal(g.teams[0].score, 100); assert.equal(g.winner, null);
  const time = g.time; g.tick(.01); assert.ok(g.time > time);
});
test('invalid custom targets are rejected', () => {
  for (const targetKills of [0, -1, 1.5, NaN, Infinity, 10000, '30']) {
    assert.throws(() => new Arena(Math.random, { targetKills }), RangeError);
  }
});
test('kill rewards are 1 then 2 for all later kills within the same life', () => {
  const g = new Arena(() => .5, { targetKills: null });
  const expectedTotals = [1, 3, 5, 7, 9];
  for (let i = 0; i < expectedTotals.length; i++) {
    const event = scoreKill(g, 0, 1);
    assert.equal(g.players[0].gold, expectedTotals[i]); assert.equal(g.players[0].streak, i + 1);
    assert.equal(event.killReward, i === 0 ? 1 : 2); assert.equal(event.shutdownReward, 0);
  }
});
test('death immediately resets streak, retains wallet, and the next life starts at 1 coin', () => {
  const g = new Arena(); scoreKill(g, 0, 1); scoreKill(g, 0, 2);
  assert.equal(g.players[0].gold, 3); assert.equal(g.players[0].streak, 2);
  scoreKill(g, 1, 0); assert.equal(g.players[0].streak, 0); assert.equal(g.players[0].gold, 3);
  g.respawn(g.players[0]); const event = scoreKill(g, 0, 2);
  assert.equal(event.killReward, 1); assert.equal(g.players[0].gold, 4); assert.equal(g.players[0].streak, 1);
});
test('shutdown pays the full victim streak as an extra bounty including odd streaks', () => {
  for (const streak of [0, 1, 2, 3, 4, 7]) {
    const g = new Arena(); g.players[1].streak = streak;
    const event = scoreKill(g, 0, 1), bounty = streak >= 2 ? streak : 0;
    assert.equal(event.shutdownReward, bounty); assert.equal(event.reward, 1 + bounty);
    assert.equal(g.players[0].gold, 1 + bounty); assert.equal(g.players[1].streak, 0);
    assert.equal(event.endedStreak, streak);
  }
});
test('a killer on a streak receives both the 2-coin kill reward and shutdown bounty once', () => {
  const g = new Arena(); g.players[0].streak = 2; g.players[1].streak = 3; g.players[1].hp = 45;
  const h = { owner: 0 }; g.hit(h, g.players[1]); g.hit(h, g.players[1]);
  assert.equal(g.players[0].streak, 3); assert.equal(g.players[0].gold, 5);
  const events = g.events.filter(e => e.type === 'kill'); assert.equal(events.length, 1);
  assert.equal(events[0].killReward, 2); assert.equal(events[0].shutdownReward, 3);
});
test('teammate rescues do not change streaks or award shutdown money', () => {
  const g = new Arena(); g.players[0].streak = 2; g.players[3].streak = 5;
  g.hit({ owner: 0 }, g.players[3]);
  assert.equal(g.players[0].streak, 2); assert.equal(g.players[3].streak, 5); assert.equal(g.players[0].gold, 0);
});
test('upgrades still cost one coin even when funded by shutdown bounty', () => {
  const g = new Arena(); g.players[1].streak = 3; scoreKill(g, 0, 1);
  const p = atShop(g); assert.equal(p.gold, 4); assert.equal(g.buy(0, 'moveSpeed'), true);
  assert.equal(p.gold, 3); assert.equal(p.streak, 1);
});

test('purchased hook damage applies to outgoing enemy hits and damage events', () => {
  const g = battle(), [owner, target] = g.players; atShop(g); owner.gold = 1;
  assert.equal(g.buy(0, 'hookDamage'), true); assert.equal(owner.hookDamage, 57); assert.equal(owner.gold, 0);
  owner.x = RIVER.left - 130; target.x = RIVER.right + 130; owner.y = target.y = H / 2;
  g.fire(0, target.x, target.y); advance(g, 1);
  assert.equal(target.hp, 43); assert.equal(g.events.find(e => e.type === 'hit').damage, 57);
});
test('upgraded returning hook deals damage once and still does not hurt allies', () => {
  for (const allied of [false, true]) {
    const g = battle(), [owner, target] = g.players; atShop(g); owner.gold = 1; g.buy(0, 'hookDamage');
    owner.x = 500; owner.y = H / 2; target.x = 900; target.y = owner.y + 100;
    if (allied) target.team = owner.team;
    g.fire(0, 1500, owner.y);
    for (let i = 0; i < 120 && !g.hooks[0]?.returning; i++) g.tick(1 / 60);
    assert.equal(target.hp, 100); target.x = 1000; target.y = owner.y; advance(g, 1);
    assert.equal(target.hp, allied ? 100 : 43); assert.equal(g.events.filter(e => e.type === 'hit').length, 1);
    assert.equal(owner.gold, 0);
  }
});
test('damage purchases affect future casts while an existing projectile keeps its original damage', () => {
  const g = battle(), [owner, target] = g.players; atShop(g); owner.gold = 1;
  target.x = 600; target.y = owner.y; g.fire(0, 900, owner.y);
  const h = g.hooks[0]; g.buy(0, 'hookDamage'); assert.equal(h.damage, 55); assert.equal(owner.hookDamage, 57);
  advance(g, 4); assert.equal(target.hp, 45);
  target.hp = 100; g.fire(0, target.x, target.y); advance(g, .5); assert.equal(target.hp, 43);
  owner.hp = 0; owner.dead = .01; advance(g, .1); assert.equal(owner.hookDamage, 57); assert.equal(owner.levels.hookDamage, 1);
  assert.equal(new Arena().players[0].hookDamage, 55);
});

test('collision chooses the earliest surface contact, not the nearest character center', () => {
  const g = battle(), [owner, grazed, direct] = g.players;
  owner.x = 500; owner.y = H / 2;
  grazed.x = 550; grazed.y = owner.y + 27;
  direct.x = 560; direct.y = owner.y; direct.hp = 100;
  const h = { owner: 0, x: 600, y: owner.y, radius: 8, damage: 55, hasHit: false, victim: null };
  g.checkHit(h, 500, owner.y);
  assert.equal(h.victim, direct.id); assert.equal(direct.hp, 45); assert.equal(grazed.hp, 100);
});
test('returning collision also chooses the first surface touched', () => {
  const g = battle(), [owner, grazed, direct] = g.players;
  owner.x = 400; owner.y = H / 2;
  grazed.x = 550; grazed.y = owner.y + 27;
  direct.x = 540; direct.y = owner.y; direct.hp = 100;
  const h = { owner: 0, x: 500, y: owner.y, radius: 8, damage: 55, returning: true, hasHit: false, victim: null };
  g.checkHit(h, 600, owner.y); assert.equal(h.victim, direct.id); assert.equal(grazed.hp, 100);
});
test('swept circle time handles entry, tangency, overlap, stationary and missed segments', () => {
  assert.ok(Math.abs(segmentHitTime(0, 0, 100, 0, 50, 0, 10) - .4) < .00001);
  assert.equal(segmentHitTime(0, 0, 100, 0, 50, 10, 10), .5);
  assert.equal(segmentHitTime(0, 0, 0, 0, 5, 0, 10), 0);
  assert.equal(segmentHitTime(0, 0, 0, 0, 15, 0, 10), null);
  assert.equal(segmentHitTime(0, 0, 100, 0, 50, 11, 10), null);
  assert.equal(segmentHitTime(0, 0, 100, 0, -50, 0, 10), null);
});
test('moving-target sweep catches an actual crossing even when the endpoint misses', () => {
  const g = battle(), [owner, target] = g.players;
  owner.x = 500; owner.y = H / 2;
  target.x = 570; target.y = owner.y + 27.7;
  const starts = g.players.map(p => ({ x: p.x, y: p.y })); starts[target.id] = { x: 570, y: owner.y + 21 };
  const h = { owner: 0, x: 600, y: owner.y, radius: 8, damage: 55, hasHit: false, victim: null };
  // Ending inside the radius is not required: during the frame the paths intersect.
  target.y = owner.y + 29;
  assert.equal(segmentHit(500, owner.y, 600, owner.y, target.x, target.y, 28), false);
  g.checkHit(h, 500, owner.y, starts); assert.equal(target.hp, 45);
});
test('relative sweep rejects a moving target whose final position alone suggests a false hit', () => {
  const g = battle(), [owner, target] = g.players;
  owner.x = 500; owner.y = H / 2;
  target.x = 500; target.y = owner.y + 27;
  const starts = g.players.map(p => ({ x: p.x, y: p.y })); starts[target.id] = { x: 500, y: owner.y + 35 };
  const h = { owner: 0, x: 600, y: owner.y, radius: 8, damage: 55, hasHit: false, victim: null };
  assert.equal(segmentHit(500, owner.y, 600, owner.y, target.x, target.y, 28), true);
  g.checkHit(h, 500, owner.y, starts); assert.equal(target.hp, 100); assert.equal(h.hasHit, false);
});

test('stationary practice spawns just the player and a high-health regenerating dummy', () => {
  const g = new Arena(() => .5, { mode: 'dummy', targetKills: 1 });
  assert.equal(g.players.length, 2); assert.equal(g.targetKills, null);
  const target = g.players[1]; assert.equal(target.dummy, true); assert.equal(target.team, 1);
  assert.equal(target.hp, 1000000); assert.equal(target.regen, 100000); assert.equal(target.shield, 0);
  const start = { x: target.x, y: target.y }; advance(g, 30);
  assert.equal(target.x, start.x); assert.equal(target.y, start.y); assert.equal(g.hooks.length, 0);
  assert.equal(g.players[0].hp, 100); assert.equal(g.winner, null);
});
test('practice dummy cannot walk, cast or buy and never runs AI', () => {
  const g = new Arena(() => .5, { mode: 'dummy' }), target = g.players[1]; target.gold = 10;
  assert.equal(g.moveTo(1, 3000, 1000), false); assert.equal(g.fire(1, 500, 1000), false);
  target.x = g.merchants[1].x; target.y = g.merchants[1].y;
  assert.equal(g.buy(1, 'hookDamage'), false); advance(g, 5); assert.equal(target.gold, 10); assert.equal(g.hooks.length, 0);
});
test('practice hit pulls normally, regenerates and returns to its original position', () => {
  const g = new Arena(() => .5, { mode: 'dummy' }), [p, target] = g.players;
  g.fire(0, target.x, target.y);
  for (let i = 0; i < 300 && g.hooks.length; i++) g.tick(1 / 60);
  assert.equal(g.practice.shots, 1); assert.equal(g.practice.hits, 1); assert.equal(g.practice.damage, 55);
  assert.ok(target.x < RIVER.left); assert.equal(p.gold, 0); assert.equal(p.kills, 0);
  advance(g, 1); assert.equal(target.x, target.home.x); assert.equal(target.y, target.home.y); assert.equal(target.hp, target.maxHp);
  assert.equal(target.pull, null); assert.equal(g.winner, null);
});
test('extreme damage to a practice dummy never grants kill rewards and restores it', () => {
  const g = new Arena(() => .5, { mode: 'dummy' }), [p, target] = g.players;
  p.hookDamage = 2000000; g.fire(0, target.x, target.y); advance(g, 2);
  assert.equal(target.hp, target.maxHp); assert.equal(target.x, target.home.x); assert.equal(target.deaths, 0);
  assert.equal(p.gold, 0); assert.equal(p.kills, 0); assert.equal(p.streak, 0); assert.equal(g.teams[0].score, 0);
  assert.equal(g.practice.hits, 1); assert.equal(g.practice.damage, 1000000); assert.equal(g.winner, null);
});
test('R reset cancels in-flight hooks, restores the dummy and clears cooldown without wiping practice counters', () => {
  const g = new Arena(() => .5, { mode: 'dummy' }), [p, target] = g.players;
  g.fire(0, target.x, target.y); advance(g, .1); assert.equal(g.hooks.length, 1);
  assert.equal(g.resetTraining(), true); assert.equal(g.hooks.length, 0); assert.equal(p.cooldown, 0);
  assert.equal(target.hp, target.maxHp); assert.equal(target.pull, null); assert.equal(g.practice.shots, 1);
  assert.equal(g.fire(0, target.x, target.y), true); assert.equal(g.practice.shots, 2);
  assert.equal(new Arena().resetTraining(), false);
});
test('cooldown starts at full duration only after the hook returns, for misses and hits', () => {
  for (const hit of [false, true]) {
    const g = battle(), [p, target] = g.players;
    if (!hit) target.y += 150;
    g.fire(0, 3000, p.y); assert.equal(p.cooldown, 0);
    let frames = 0;
    while (g.hooks.length && frames++ < 500) {
      assert.equal(p.cooldown, 0); assert.equal(g.fire(0, 3000, p.y), false); g.tick(.01);
    }
    assert.ok(frames < 500); assert.equal(p.cooldown, p.hookCooldown);
    advance(g, .5); assert.ok(Math.abs(p.cooldown - 1.9) < .001); assert.equal(g.fire(0, 3000, p.y), false);
    advance(g, 2); assert.equal(p.cooldown, 0); assert.equal(g.fire(0, 3000, p.y), true);
  }
});
test('cooldown upgrade is applied when the current hook finishes returning', () => {
  const g = battle(), p = atShop(g); p.gold = 1;
  g.fire(0, 900, p.y); g.buy(0, 'hookCooldown');
  for (let i = 0; i < 500 && g.hooks.length; i++) { assert.equal(p.cooldown, 0); g.tick(.01); }
  assert.equal(p.cooldown, 2.4 * .97);
});
test('normal and infinite matches have the selected 5v5 through 8v8 roster', () => {
  for (const targetKills of [30, null]) for (const teamSize of [5, 6, 7, 8]) {
    const g = new Arena(() => .5, { targetKills, teamSize });
    assert.equal(g.mode, 'team'); assert.equal(g.players.length, teamSize * 2); assert.equal(g.players.some(p => p.dummy), false);
  }
  assert.throws(() => new Arena(Math.random, { mode: 'invalid' }), RangeError);
});

test('each selectable team size has unique IDs, names and separated spawns on the correct side', () => {
  for (const teamSize of [5, 6, 7, 8]) {
    const g = new Arena(() => .5, { teamSize });
    assert.equal(g.teamSize, teamSize); assert.equal(g.players.length, teamSize * 2);
    assert.deepEqual(g.players.map(p => p.id), Array.from({ length: teamSize * 2 }, (_, id) => id));
    assert.equal(new Set(g.players.map(p => p.name)).size, teamSize * 2);
    for (const team of [0, 1]) assert.equal(g.players.filter(p => p.team === team).length, teamSize);
    for (const p of g.players) {
      assert.ok(p.team === 0 ? p.x < RIVER.left : p.x > RIVER.right);
      assert.ok(p.y >= 55 && p.y <= H - 55);
      for (const other of g.players) if (p.id !== other.id) assert.ok(Math.hypot(p.x - other.x, p.y - other.y) > 40);
    }
  }
});
test('invalid team sizes are rejected and fixed-dummy practice remains two characters', () => {
  for (const teamSize of [0, 2, 4, 9, 16, 5.5, '8', NaN]) assert.throws(() => new Arena(Math.random, { teamSize }), RangeError);
  const g = new Arena(() => .5, { mode: 'dummy', teamSize: 8 });
  assert.equal(g.teamSize, 1); assert.equal(g.players.length, 2); assert.equal(g.players[1].dummy, true);
});
test('all 15 AI fighters participate in 8v8 and retain their team on respawn', () => {
  let seed = 42; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const g = new Arena(random, { teamSize: 8, targetKills: null });
  const starts = g.players.map(p => ({ x: p.x, y: p.y })); advance(g, 3);
  for (const p of g.players.slice(1)) assert.ok(Math.hypot(p.x - starts[p.id].x, p.y - starts[p.id].y) > 1, p.name);
  assert.ok(g.events.some(e => e.type === 'fire'));
  for (const p of g.players) {
    const team = p.team; g.respawn(p); assert.equal(p.team, team);
    assert.ok(p.team === 0 ? p.x < RIVER.left : p.x > RIVER.right);
  }
});
