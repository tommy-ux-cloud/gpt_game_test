import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, segmentHit, RIVER, TARGET, W, H } from '../engine.js';

function isolated() {
  const g = new Arena(() => .5);
  for (const p of g.players) { p.shield = 0; p.aiTimer = 99999; }
  g.players[2].hp = g.players[3].hp = 0;
  g.players[2].dead = g.players[3].dead = 99999;
  return g;
}
function advance(g, seconds) { for (let i = 0; i < seconds * 60; i++) g.tick(1 / 60); }
test('swept collision catches targets between frames', () => {
  assert.equal(segmentHit(0, 0, 100, 0, 50, 20, 25), true);
  assert.equal(segmentHit(0, 0, 100, 0, 50, 30, 25), false);
});
test('right-click destination is reached exactly without overshooting or following aim', () => {
  const g = isolated(), p = g.players[0];
  const start = { x: p.x, y: p.y };
  assert.equal(g.moveTo(0, 733.4, 721.7), true);
  g.tick(.05, { aim: { x: 0, y: 0 } });
  assert.ok(Math.abs(Math.hypot(p.x - start.x, p.y - start.y) - 185 * .05) < .001);
  advance(g, 3);
  assert.equal(p.x, 733.4); assert.equal(p.y, 721.7);
  assert.equal(p.moveTarget, null); assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  advance(g, 1); assert.equal(p.x, 733.4); assert.equal(p.y, 721.7);
});
test('move orders stay on the current bank and inside arena boundaries', () => {
  const g = isolated(), p = g.players[0];
  g.moveTo(0, 600, 100); advance(g, 5);
  assert.equal(p.x, 600); assert.equal(p.y, RIVER.bottom + 25); assert.equal(p.moveTarget, null);
  p.y = 180; g.moveTo(0, -100, 900); advance(g, 5);
  assert.equal(p.x, 45); assert.equal(p.y, RIVER.top - 25); assert.equal(p.moveTarget, null);
});
test('new orders replace destinations, S stops movement, and dead or pulled players cannot move', () => {
  const g = isolated(), p = g.players[0];
  g.moveTo(0, 900, 600); advance(g, .3);
  const before = p.x; g.moveTo(0, 100, 600); advance(g, .3); assert.ok(p.x < before);
  g.stopMove(0); const x = p.x; advance(g, 1); assert.equal(p.x, x);
  p.hp = 0; p.dead = 3; assert.equal(g.moveTo(0, 400, 600), false);
  p.hp = 100; p.pull = {}; assert.equal(g.moveTo(0, 400, 600), false);
});
test('hook crosses river, damages, pulls target onto owner bank and respects cooldown', () => {
  const g = isolated(), [p, target] = g.players;
  p.x = target.x = 600; p.y = RIVER.bottom + 100; target.y = RIVER.top - 100;
  target.moveTarget = { x: 700, y: 240 };
  g.move = () => {};
  assert.equal(g.fire(0, target.x, target.y), true);
  assert.equal(g.fire(0, target.x, target.y), false);
  advance(g, 1);
  assert.equal(target.hp, 45); assert.equal(target.pull, null); assert.equal(target.moveTarget, null);
  assert.equal(target.y, p.y); assert.equal(g.hooks.length, 0);
});
test('second hook awards a kill, respawn restores health and protection', () => {
  const g = isolated(), [p, target] = g.players; g.move = () => {};
  p.x = target.x = 600; p.y = RIVER.bottom + 100; target.y = RIVER.top - 100; target.hp = 45;
  g.fire(0, target.x, target.y); advance(g, 1);
  assert.equal(p.kills, 1); assert.equal(target.deaths, 1); assert.equal(target.hp, 0);
  advance(g, 3); assert.equal(target.hp, 100); assert.ok(target.shield > 0);
});
test('spawn protection prevents damage and eight kills ends the match', () => {
  const g = isolated(), [p, target] = g.players; g.move = () => {};
  p.x = target.x = 600; p.y = RIVER.bottom + 100; target.y = RIVER.top - 100; target.shield = 2;
  g.fire(0, target.x, target.y); advance(g, 1); assert.equal(target.hp, 100);
  advance(g, 2); target.shield = 0; target.hp = 45; p.kills = TARGET - 1;
  g.fire(0, target.x, target.y); advance(g, 1); assert.equal(g.winner, 0);
  const time = g.time; advance(g, 1); assert.equal(g.time, time);
});
test('releasing a hook after owner dies never strands its victim in the river', () => {
  const g = isolated(), [p, target] = g.players;
  const h = { owner: 0, victim: 1, returning: true, x: 600, y: (RIVER.top + RIVER.bottom) / 2 };
  target.y = (RIVER.top + RIVER.bottom) / 2; target.pull = h; p.hp = 0; p.dead = 3; g.hooks.push(h);
  g.tick(.02); assert.equal(target.pull, null); assert.ok(target.y <= RIVER.top - 25 || target.y >= RIVER.bottom + 25);
});

function returningHook() {
  const g = isolated(), [owner, target] = g.players;
  g.move = () => {};
  owner.x = 400; owner.y = RIVER.bottom + 160;
  target.x = 600; target.y = owner.y + 100;
  g.fire(0, 1400, owner.y);
  for (let i = 0; i < 120 && !g.hooks[0]?.returning; i++) g.tick(1 / 60);
  assert.equal(target.hp, 100, 'outgoing hook missed');
  assert.equal(g.hooks[0]?.returning, true);
  return g;
}
test('empty returning hook catches a target that steps into its path and pulls once', () => {
  const g = returningHook(), [owner, target] = g.players;
  target.x = 900; target.y = owner.y;
  advance(g, 1);
  assert.equal(target.hp, 45); assert.equal(target.pull, null);
  assert.equal(target.y, owner.y); assert.ok(Math.abs(target.x - owner.x) <= 38);
  assert.equal(g.events.filter(e => e.type === 'hit').length, 1);
  assert.equal(g.hooks.length, 0);
});
test('return sweep catches a target between frames and includes the last step', () => {
  for (const finalStep of [false, true]) {
    const g = returningHook(), [owner, target] = g.players, h = g.hooks[0];
    h.x = owner.x + (finalStep ? 50 : 250); h.y = owner.y;
    target.x = h.x - 27; target.y = owner.y;
    g.tick(.05);
    assert.equal(target.hp, 45);
    if (finalStep) { assert.equal(g.hooks.length, 0); assert.equal(target.pull, null); }
  }
});
test('returning hook respects spawn protection, dead targets and already pulled targets', () => {
  for (const condition of ['protected', 'dead', 'pulled']) {
    const g = returningHook(), [owner, target] = g.players;
    target.x = 900; target.y = owner.y;
    if (condition === 'protected') target.shield = 2;
    if (condition === 'dead') { target.hp = 0; target.dead = 3; }
    if (condition === 'pulled') target.pull = {};
    advance(g, 1);
    assert.equal(target.hp, condition === 'dead' ? 0 : 100);
    assert.equal(g.events.filter(e => e.type === 'hit').length, 0);
  }
});
test('a lethal hit consumes the hook and cannot catch another target on return', () => {
  const g = isolated(), [owner, target, other] = g.players; g.move = () => {};
  owner.x = 400; owner.y = RIVER.bottom + 160;
  target.x = 900; target.y = owner.y; target.hp = 45;
  other.x = 650; other.y = owner.y + 100; other.hp = 100;
  g.fire(0, 1400, owner.y);
  for (let i = 0; i < 120 && target.hp > 0; i++) g.tick(1 / 60);
  assert.equal(target.hp, 0);
  other.y = owner.y; advance(g, 1);
  assert.equal(other.hp, 100); assert.equal(owner.kills, 1);
  assert.equal(g.events.filter(e => e.type === 'hit').length, 1);
});
test('returning hook catches the first eligible target along its return path', () => {
  const g = returningHook(), [owner, near, far] = g.players;
  near.x = 1000; near.y = owner.y;
  far.hp = 100; far.x = 750; far.y = owner.y;
  advance(g, 1);
  assert.equal(near.hp, 45); assert.equal(far.hp, 100);
});
test('enlarged map allows destinations beyond the original arena and legal respawns', () => {
  const g = isolated(), p = g.players[0];
  assert.equal(W, 1800); assert.equal(H, 1100);
  g.moveTo(0, W - 50, H - 110); advance(g, 10);
  assert.equal(p.x, W - 50); assert.equal(p.y, H - 110);
  p.hp = 0; p.dead = .01; advance(g, .1);
  assert.ok(p.x >= 45 && p.x <= W - 45);
  assert.ok(p.y >= RIVER.bottom + 25 && p.y <= H - 100);
});
