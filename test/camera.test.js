import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, VIEW_W, VIEW_H, PROJECTION, HOOK_HEIGHT, CAMERA_PITCH } from '../camera.js';
import { W, H } from '../engine.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} != ${b}`);

test('tilted viewport preserves one ninth of the world area', () => {
  const c = new Camera(); c.centerOn({ x: W / 2, y: H / 2 });
  const points = c.corners();
  const area = Math.abs(points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0)) / 2;
  close(area / (W * H), 1 / 9); close(PROJECTION.a * PROJECTION.d, 1);
});
test('fixed follow camera centers hero, and tilted visible corners never leave world boundaries', () => {
  const c = new Camera(); c.centerOn({ x: 1800, y: 1400 });
  assert.deepEqual(c.screenToWorld(.5, .5), { x: 1800, y: 1400 });
  for (const point of [{ x: -10000, y: -10000 }, { x: 10000, y: 10000 }, { x: 0, y: H }, { x: W, y: 0 }]) {
    c.centerOn(point);
    for (const p of c.corners()) assert.ok(p.x >= -.00001 && p.x <= W + .00001 && p.y >= -.00001 && p.y <= H + .00001);
  }
});
test('projected cursor converts back to the same world point after camera moves', () => {
  const c = new Camera();
  for (const hero of [{ x: 1500, y: 1000 }, { x: 2000, y: 1200 }, { x: 90, y: H / 2 }]) {
    c.centerOn(hero);
    for (const point of [{ x: 1710, y: 1000 }, { x: 2000, y: 1500 }, hero]) {
      const screen = c.worldToScreen(point), world = c.screenToWorld(screen.x / VIEW_W, screen.y / VIEW_H);
      close(world.x, point.x); close(world.y, point.y);
    }
  }
});
test('MOBA framing foreshortens depth without skewing straight map boundaries', () => {
  const c = new Camera(); c.centerOn({ x: 1700, y: 1300 });
  const center = c.worldToScreen({ x: 1700, y: 1300 });
  const down = c.worldToScreen({ x: 1700, y: 1400 });
  close(down.x - center.x, 0); close(down.y - center.y, 100 * PROJECTION.d);
  close(PROJECTION.d / PROJECTION.a, Math.sin(CAMERA_PITCH * Math.PI / 180));
  assert.equal(VIEW_W, 1200); assert.equal(VIEW_H, 750);
});

test('aiming at the visible torso maps to the target collision center while walking stays on the ground', () => {
  const c = new Camera();
  for (const hero of [{ x: 1580, y: 1015 }, { x: 90, y: H / 2 }, { x: W - 90, y: H / 2 }]) {
    c.centerOn(hero);
    const target = { x: hero.x + 300, y: hero.y + 60 };
    const body = c.hookToScreen(target), feet = c.worldToScreen(target);
    close(feet.y - body.y, HOOK_HEIGHT); close(feet.x, body.x);
    const aimed = c.aimToWorld(body.x / VIEW_W, body.y / VIEW_H);
    close(aimed.x, target.x); close(aimed.y, target.y);
    const ground = c.screenToWorld(body.x / VIEW_W, body.y / VIEW_H);
    close(ground.y, target.y - HOOK_HEIGHT / PROJECTION.d);
  }
});
