import test from 'node:test';
import assert from 'node:assert/strict';
import { directionFor, frameFor, measureAtlas, PigSprites } from '../pig-sprites.js';

test('sprite directions follow the same world angles as Q aiming across every octant and wrap', () => {
  for (let direction = 0; direction < 8; direction++) {
    const angle = Math.PI / 2 + direction * Math.PI / 4;
    assert.equal(directionFor(angle), direction);
    assert.equal(directionFor(angle + Math.PI * 8), direction);
    assert.equal(directionFor(angle - Math.PI * 8), direction);
    assert.equal(directionFor(angle + .1), direction);
    assert.equal(directionFor(angle - .1), direction);
  }
  assert.equal(directionFor(0), 6); // world east
  assert.equal(directionFor(-Math.PI / 2), 4); // north/back
});
test('walking alternates paired atlas frames without changing direction, while idle is stable', () => {
  for (let direction = 0; direction < 8; direction++) {
    const angle = Math.PI / 2 + direction * Math.PI / 4;
    assert.equal(frameFor(angle, 0, true), direction);
    assert.equal(frameFor(angle, .125, true), direction + 8);
    assert.equal(frameFor(angle, .25, true), direction);
    assert.equal(frameFor(angle, .125, false), direction);
  }
});
function atlas() {
  const width = 96, height = 96, pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    for (let y = 5; y <= 21; y++) for (let x = 8; x <= 18; x++) {
      const i = ((row * 24 + y) * width + col * 24 + x) * 4;
      pixels.set(y >= 12 && y <= 16 ? [50, 50, 50, 255] : [190, 140, 135, 255], i);
    }
    pixels.set([255, 0, 0, 8], ((row * 24) * width + col * 24) * 4);
  }
  return { pixels, width, height };
}
test('atlas alpha measurement ignores transparent fringe and anchors all 16 frames at torso and feet', () => {
  const { pixels, width, height } = atlas(), frames = measureAtlas(pixels, width, height);
  assert.equal(frames.length, 16);
  frames.forEach((frame, i) => {
    assert.deepEqual(frame, { x: i % 4 * 24 + 8, y: Math.floor(i / 4) * 24 + 5, width: 11, height: 17, anchorX: 5, anchorY: 17 });
  });
  pixels.fill(0, 0, 24 * width * 4);
  assert.throws(() => measureAtlas(pixels, width, height), /Empty character frame/);
});
test('sprite hit/death state expires, revives, and resets cleanly for the next match', () => {
  const sprites = new PigSprites(), p = { id: 0, hp: 100 }, game = { time: 0, players: [p], hooks: [] };
  sprites.update(game); p.hp = 45; game.time = 1; sprites.update(game); assert.equal(sprites.states.get(0).hitAt, 1);
  p.hp = 0; game.time = 2; sprites.update(game); assert.equal(sprites.dying(0, 2.3), true); assert.equal(sprites.dying(0, 2.6), false);
  p.hp = 100; game.time = 5; sprites.update(game); assert.equal(sprites.dying(0, 5), false);
  const hook = { owner: 0 }; game.hooks = [hook]; sprites.update(game); assert.equal(sprites.states.get(0).shotAt, 5);
  game.time = 5.1; sprites.update(game); assert.equal(sprites.states.get(0).shotAt, 5);
  sprites.reset(); assert.equal(sprites.states.size, 0);
});
