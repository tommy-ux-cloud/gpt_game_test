import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, VIEW_W, VIEW_H, PROJECTION } from '../camera.js';
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
test('screen positions include oblique ground offset, not only flat x and y', () => {
  const c = new Camera(); c.centerOn({ x: 1700, y: 1300 });
  const center = c.worldToScreen({ x: 1700, y: 1300 });
  const down = c.worldToScreen({ x: 1700, y: 1400 });
  close(down.x - center.x, 18); close(down.y - center.y, 80);
  assert.equal(VIEW_W, 1200); assert.equal(VIEW_H, 750);
});
