import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, segmentHit, RIVER, TARGET } from '../engine.js';

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
  assert.equal(g.moveTo(0, 433.4, 521.7), true);
  g.tick(.05, { aim: { x: 0, y: 0 } });
  assert.ok(Math.abs(Math.hypot(p.x - 330, p.y - 590) - 185 * .05) < .001);
  advance(g, 2);
  assert.equal(p.x, 433.4); assert.equal(p.y, 521.7);
  assert.equal(p.moveTarget, null); assert.equal(p.vx, 0); assert.equal(p.vy, 0);
  advance(g, 1); assert.equal(p.x, 433.4); assert.equal(p.y, 521.7);
});
test('move orders stay on the current bank and inside arena boundaries', () => {
  const g = isolated(), p = g.players[0];
  g.moveTo(0, 600, 100); advance(g, 4);
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
  p.x = target.x = 600; p.y = 530; target.y = 240;
  target.moveTarget = { x: 700, y: 240 };
  g.move = () => {};
  assert.equal(g.fire(0, 600, 240), true);
  assert.equal(g.fire(0, 600, 240), false);
  advance(g, 1);
  assert.equal(target.hp, 45); assert.equal(target.pull, null); assert.equal(target.moveTarget, null);
  assert.equal(target.y, p.y); assert.equal(g.hooks.length, 0);
});
test('second hook awards a kill, respawn restores health and protection', () => {
  const g = isolated(), [p, target] = g.players; g.move = () => {};
  p.x = target.x = 600; p.y = 530; target.y = 240; target.hp = 45;
  g.fire(0, 600, 240); advance(g, 1);
  assert.equal(p.kills, 1); assert.equal(target.deaths, 1); assert.equal(target.hp, 0);
  advance(g, 3); assert.equal(target.hp, 100); assert.ok(target.shield > 0);
});
test('spawn protection prevents damage and eight kills ends the match', () => {
  const g = isolated(), [p, target] = g.players; g.move = () => {};
  p.x = target.x = 600; p.y = 530; target.y = 240; target.shield = 2;
  g.fire(0, 600, 240); advance(g, 1); assert.equal(target.hp, 100);
  advance(g, 2); target.shield = 0; target.hp = 45; p.kills = TARGET - 1;
  g.fire(0, 600, 240); advance(g, 1); assert.equal(g.winner, 0);
  const time = g.time; advance(g, 1); assert.equal(g.time, time);
});
test('releasing a hook after owner dies never strands its victim in the river', () => {
  const g = isolated(), [p, target] = g.players;
  const h = { owner: 0, victim: 1, returning: true, x: 600, y: 370 };
  target.y = 370; target.pull = h; p.hp = 0; p.dead = 3; g.hooks.push(h);
  g.tick(.02); assert.equal(target.pull, null); assert.ok(target.y <= RIVER.top - 25 || target.y >= RIVER.bottom + 25);
});
