import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';
import { createPig, createHookHead, animatePig, TEAM_STYLES } from '../pig-model.js';
import { createArenaCamera, syncArenaCamera, HOOK_WORLD_HEIGHT } from '../arena3d.js';
import { Camera, VIEW_W, VIEW_H } from '../camera.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < .00001, `${a} != ${b}`);
test('3D orthographic ground and hook plane match mouse input at center and map edges', () => {
  const follow = new Camera(), camera = createArenaCamera();
  for (const hero of [{ x: 1580, y: 1125 }, { x: 90, y: 100 }, { x: 3510, y: 2150 }]) {
    follow.centerOn(hero); syncArenaCamera(camera, follow);
    for (const point of [hero, { x: hero.x + 150, y: hero.y - 100 }]) {
      for (const [height, expected] of [[0, follow.worldToScreen(point)], [HOOK_WORLD_HEIGHT, follow.hookToScreen(point)]]) {
        const screen = new THREE.Vector3(point.x, height, point.y).project(camera);
        close((screen.x + 1) * VIEW_W / 2, expected.x); close((1 - screen.y) * VIEW_H / 2, expected.y);
      }
    }
  }
});
test('both teams use articulated pig meshes and shared geometry with distinct hook enamel', () => {
  const blue = createPig(0), red = createPig(1);
  for (const rig of [blue, red]) {
    for (const key of ['head', 'armL', 'armR', 'legL', 'legR', 'heldHook']) assert.ok(rig[key]?.isObject3D, key);
    const box = new THREE.Box3().setFromObject(rig.root);
    assert.ok(box.max.y > 110 && box.max.y < 140); assert.ok(box.max.x - box.min.x > 50);
  }
  assert.equal(blue.head.children[0].geometry, red.head.children[0].geometry);
  assert.notEqual(blue.heldHook.children[0].children[0].material, red.heldHook.children[0].children[0].material);
  assert.equal(TEAM_STYLES.length, 2);
});
test('flight hook geometry stays inside the actual collision radius for either team', () => {
  for (const team of [0, 1]) {
    const hook = createHookHead(team); hook.updateMatrixWorld(true);
    hook.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        assert.ok(p.length() <= 1.00001, `${p.length()} exceeds visible hit radius`);
      }
    });
  }
});
test('walking, casting, pull and death poses animate then return to a neutral living pose', () => {
  const rig = createPig();
  animatePig(rig, { time: .1, speed: 185, shotAge: 0, pulling: false });
  assert.ok(Math.abs(rig.legL.rotation.x) > .1); assert.ok(rig.armR.rotation.x < -1);
  animatePig(rig, { pulling: true }); assert.equal(rig.armL.rotation.x, -1.05);
  animatePig(rig, { deathAge: .5 }); assert.equal(rig.body.rotation.z, -Math.PI / 2); assert.ok(rig.body.position.x > 0);
  animatePig(rig, { time: 0, speed: 0 });
  assert.equal(rig.body.position.x, 0); assert.equal(rig.body.rotation.z, 0); assert.equal(rig.legL.rotation.x, 0);
});
