import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, VIEW_W, VIEW_H } from '../camera.js';
import { W, H } from '../engine.js';

test('viewport shows one ninth of the world, preserving the map aspect ratio', () => {
  assert.equal(VIEW_W * VIEW_H / (W * H), 1 / 9);
  assert.equal(VIEW_W / VIEW_H, W / H);
});
test('camera centers on the hero while world edges remain clamped', () => {
  const c = new Camera(); c.centerOn({ x: 1800, y: 1400 });
  assert.deepEqual(c.screenToWorld(.5, .5), { x: 1800, y: 1400 });
  c.pan(-10000, -10000); assert.equal(c.x, 0); assert.equal(c.y, 0);
  c.pan(10000, 10000); assert.equal(c.x, W - VIEW_W); assert.equal(c.y, H - VIEW_H);
  c.centerOn({ x: 0, y: 0 }); assert.deepEqual(c.screenToWorld(0, 0), { x: 0, y: 0 });
});
test('mouse targeting includes the camera offset and updates after the camera moves', () => {
  const c = new Camera(); c.centerOn({ x: 1700, y: 1300 });
  const before = c.screenToWorld(.75, .25);
  c.pan(300, -100); const after = c.screenToWorld(.75, .25);
  assert.equal(after.x - before.x, 300); assert.equal(after.y - before.y, -100);
  assert.deepEqual(after, { x: c.x + 900, y: c.y + 187.5 });
});
test('minimap navigates the whole world and clamps dragging beyond map edges', () => {
  const c = new Camera(); c.centerOn(c.minimapToWorld(.5, .5));
  assert.deepEqual(c.screenToWorld(.5, .5), { x: W / 2, y: H / 2 });
  c.centerOn(c.minimapToWorld(1.2, -1));
  assert.equal(c.x, W - VIEW_W); assert.equal(c.y, 0);
});
