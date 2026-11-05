import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Arena } from '../engine.js';
import { applyCommand, snapshot, readSnapshot, HostRoom, playerName, normalizeRoom, validRoom, WIRE_VERSION } from '../room-network.js';

test('a remote human stays idle until commanded and aims/moves independently of the host', () => {
  const g = new Arena(); g.humans.add(1); const a = { x: g.players[1].x, y: g.players[1].y };
  for (let i = 0; i < 40; i++) g.tick(.025);
  assert.equal(g.players[1].x, a.x); assert.equal(g.players[1].y, a.y);
  assert.equal(applyCommand(g, 1, { action: 'move', id: 0, x: a.x + 150, y: a.y + 80 }), true);
  applyCommand(g, 1, { action: 'aim', x: a.x, y: a.y - 200 });
  for (let i = 0; i < 10; i++) g.tick(.025);
  assert.ok(g.players[1].x > a.x); assert.ok(g.players[1].y > a.y); assert.equal(g.players[0].moveTarget, null);
  assert.ok(g.players[1].angle < -Math.PI / 2);
});
test('host accepts only bound human operations and enforces cooldown, wallet, distance and numeric inputs', () => {
  const g = new Arena(); g.humans.add(1); const p = g.players[1]; p.shield = 0;
  assert.equal(applyCommand(g, 2, { action: 'fire', x: 1800, y: 1125 }), false);
  assert.equal(applyCommand(g, 1, { action: 'move', x: NaN, y: 100 }), false);
  assert.equal(applyCommand(g, 1, { action: 'aim', x: Infinity, y: 100 }), false);
  assert.equal(applyCommand(g, 1, { action: 'gold', gold: 9999 }), false);
  assert.equal(applyCommand(g, 1, { action: 'buy', key: 'maxHp' }), false);
  assert.equal(p.gold, 0); p.gold = 1;
  assert.equal(applyCommand(g, 1, { action: 'buy', key: 'maxHp' }), false);
  p.x = g.merchants[1].x; p.y = g.merchants[1].y;
  assert.equal(applyCommand(g, 1, { action: 'buy', key: 'maxHp' }), true); assert.equal(p.gold, 0); assert.equal(p.maxHp, 105);
  assert.equal(applyCommand(g, 1, { action: 'fire', id: 0, x: p.x - 300, y: p.y }), true);
  assert.equal(g.hooks[0].owner, 1); assert.equal(applyCommand(g, 1, { action: 'fire', x: p.x - 300, y: p.y }), false);
});
test('snapshots serialize active pulls without cycles and restore shops, teams, upgrades and human slots', () => {
  const g = new Arena(Math.random, { teamSize: 8, targetKills: null }); g.humans.add(1); g.players[1].shield = 0;
  g.fire(0, g.players[1].x, g.players[1].y); g.hit(g.hooks[0], g.players[1]);
  g.players[0].gold = 4; g.players[0].levels.hookDamage = 2; g.teams[0].score = 3;
  const encoded = JSON.stringify(snapshot(g, { started: true, epoch: 2, sequence: 18 }));
  const restored = readSnapshot(JSON.parse(encoded));
  assert.equal(restored.players.length, 16); assert.equal(restored.targetKills, null); assert.equal(restored.teams[0].score, 3);
  assert.equal(restored.players[1].pull, restored.hooks[0]); assert.equal(restored.players[0].gold, 4); assert.equal(restored.players[0].levels.hookDamage, 2);
  assert.deepEqual([...restored.humans], [0, 1]); assert.equal(restored.merchants.length, 2);
});
test('room hello balances human teams, rejects late joins, and disconnect returns a slot to AI', () => {
  class Connection extends EventEmitter { constructor(peer) { super(); this.peer = peer; this.open = true; this.messages = []; } send(m) { this.messages.push(m); } close() { this.open = false; this.emit('close'); } }
  const room = new HostRoom({ code: 'ABCD2345', name: 'Host' });
  const a = new Connection('a'), b = new Connection('b'); room.accept(a); room.accept(b);
  a.emit('data', { type: 'hello', v: WIRE_VERSION, name: '<img onerror=x>' }); b.emit('data', { type: 'hello', v: WIRE_VERSION, name: 'Guest B' });
  const duplicate = new Connection('a'); room.accept(duplicate); assert.equal(duplicate.open, false); assert.equal(room.connections.get('a'), a);
  const aid = room.members.get('a').id, bid = room.members.get('b').id;
  assert.equal(room.game.players[aid].team, 1); assert.equal(room.game.players[bid].team, 0);
  assert.ok(!room.game.players[aid].name.includes('<'));
  room.ready = true; room.start();
  a.emit('data', { type: 'command', epoch: room.epoch, action: 'move', id: 0, x: 2400, y: 1000 }); assert.equal(room.game.players[0].moveTarget, null); assert.ok(room.game.players[aid].moveTarget);
  const late = new Connection('late'); room.accept(late); late.emit('data', { type: 'hello', v: WIRE_VERSION, name: 'Late' }); assert.equal(late.messages.at(-1).type, 'rejected'); late.close();
  a.close(); assert.equal(room.game.humans.has(aid), false); assert.equal(room.game.players[aid].moveTarget, null);
  const oldEpoch = room.epoch; room.rematch(); assert.equal(room.started, false); assert.equal(room.game.humans.has(bid), true); assert.equal(room.game.teams[0].score, 0);
  room.start(); b.emit('data', { type: 'command', epoch: oldEpoch, action: 'move', x: 1200, y: 1000 }); assert.equal(room.game.players[bid].moveTarget, null);
  b.emit('data', { type: 'command', epoch: room.epoch, action: 'move', x: 1200, y: 1000 }); assert.ok(room.game.players[bid].moveTarget);
  b.close(); room.close();
});
test('nicknames and room IDs stay suitable for text display and invalid snapshots are rejected', () => {
  assert.equal(playerName('<script>'), 'script'); assert.equal(playerName('   ', '房主'), '房主'); assert.ok(playerName('123456789012345').length <= 12);
  assert.equal(normalizeRoom('abcd-2345'), 'ABCD2345'); assert.equal(validRoom('ABCD2345'), true); assert.equal(validRoom('I000O111'), false);
  assert.throws(() => readSnapshot({ v: 99 }), /無效/);
  const data = snapshot(new Arena()); data.players[0].x = NaN; assert.throws(() => readSnapshot(data), /無效/);
});

test('successive snapshots retain one hook identity so a client does not replay each cast animation', () => {
  const host = new Arena(); host.fire(0, 2100, 1125);
  let client = readSnapshot(JSON.parse(JSON.stringify(snapshot(host)))); const head = client.hooks[0];
  host.hooks[0].x += 30;
  client = readSnapshot(JSON.parse(JSON.stringify(snapshot(host))), client);
  assert.equal(client.hooks[0], head); assert.equal(client.hooks[0].x, host.hooks[0].x);
  host.hooks = []; host.players[0].cooldown = 0; host.fire(0, 2100, 1125);
  client = readSnapshot(JSON.parse(JSON.stringify(snapshot(host))), client);
  assert.notEqual(client.hooks[0].netId, head.netId);
});

test('8v8 rooms fill all 16 human slots evenly and reject an extra participant', () => {
  class Connection extends EventEmitter { constructor(peer) { super(); this.peer = peer; this.open = true; } send(message) { this.last = message; } close() { this.open = false; this.emit('close'); } }
  const room = new HostRoom({ code: 'ABCD2345', teamSize: 8 });
  for (let i = 0; i < 15; i++) { const c = new Connection('guest' + i); room.accept(c); c.emit('data', { type: 'hello', v: WIRE_VERSION, name: 'Guest' + i }); }
  assert.equal(room.game.humans.size, 16); assert.equal(room.members.size, 15);
  for (const team of [0, 1]) assert.equal([...room.game.humans].filter(id => room.game.players[id].team === team).length, 8);
  const extra = new Connection('extra'); room.accept(extra); extra.emit('data', { type: 'hello', v: WIRE_VERSION, name: 'Extra' }); assert.equal(extra.last.type, 'rejected');
  extra.close(); room.close();
});
