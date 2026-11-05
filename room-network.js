import { Arena, W, H, UPGRADES } from './engine.js';

export const WIRE_VERSION = 1;
const PREFIX = 'hook-arena-v1-';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const noOp = () => {};
const clock = () => performance.now();
export function roomCode() { return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => alphabet[n % alphabet.length]).join(''); }
export function normalizeRoom(value) { return String(value).toUpperCase().replace(/[\s-]/g, ''); }
export function validRoom(value) { return /^[A-HJ-NP-Z2-9]{8}$/.test(value); }
export function playerName(value, fallback = '玩家') { return String(value ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 12) || fallback; }
export function createPeer(id) {
  if (!globalThis.Peer || !globalThis.RTCPeerConnection) throw new Error('這個瀏覽器無法啟用 P2P，請使用最新版 Chrome、Edge 或 Firefox。');
  return new globalThis.Peer(id, { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } });
}
function failure(error) {
  if (error?.type === 'peer-unavailable') return '找不到房間，請核對房號並確認房主仍在線上。';
  if (error?.type === 'unavailable-id') return '這個房號已被使用，請重新建立房間。';
  if (error?.type === 'webrtc') return '無法建立 P2P 直連；這個網路可能需要中繼，本版尚未提供 TURN 中繼。';
  return '配對服務或網路連線失敗，請稍後重試；單機模式仍可使用。';
}
function send(connection, message, state = false) {
  if (!connection?.open || (state && connection.dataChannel?.bufferedAmount > 65536)) return false;
  try { connection.send(message); return true; } catch { return false; }
}
const playerKeys = ['id', 'name', 'team', 'color', 'x', 'y', 'vx', 'vy', 'angle', 'hp', 'maxHp', 'regen', 'moveSpeed', 'hookRadius', 'hookCooldown', 'hookSpeed', 'hookRange', 'hookDamage', 'gold', 'levels', 'kills', 'streak', 'deaths', 'cooldown', 'dead', 'shield', 'moveTarget'];
const hookIds = new WeakMap(); let nextHookId = 1;
const hookKeys = ['netId', 'owner', 'x', 'y', 'dx', 'dy', 'distance', 'returning', 'victim', 'hasHit', 'range', 'speed', 'returnSpeed', 'radius', 'damage'];
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
export function snapshot(game, { epoch = 0, started = false, sequence = 0, hostHidden = false } = {}) {
  return { type: 'state', v: WIRE_VERSION, epoch, started, sequence, hostHidden, teamSize: game.teamSize, targetKills: game.targetKills, time: game.time, winner: game.winner,
    teams: game.teams, humans: [...game.humans], players: game.players.map(p => ({ ...pick(p, playerKeys), pullOwner: p.pull?.owner ?? null })), hooks: game.hooks.map(h => { if (!hookIds.has(h)) hookIds.set(h, nextHookId++); return { ...pick(h, hookKeys), netId: hookIds.get(h) }; }) };
}
export function readSnapshot(message, game = null) {
  if (message?.v !== WIRE_VERSION || ![5, 6, 7, 8].includes(message.teamSize) || !Array.isArray(message.players) || message.players.length !== message.teamSize * 2 || !Array.isArray(message.hooks) || message.hooks.length > 16) throw new Error('無效的房間資料');
  if (!game || game.teamSize !== message.teamSize || game.targetKills !== message.targetKills) game = new Arena(Math.random, { teamSize: message.teamSize, targetKills: message.targetKills });
  for (let i = 0; i < message.players.length; i++) {
    const data = message.players[i];
    if (data.id !== i || ![0, 1].includes(data.team) || ![data.x, data.y, data.hp, data.maxHp, data.angle, data.cooldown].every(Number.isFinite)) throw new Error('無效的角色資料');
    const clean = pick(data, playerKeys); clean.name = playerName(clean.name); clean.color = game.teams[data.team].color;
    Object.assign(game.players[i], clean);
  }
  const oldHooks = new Map(game.hooks.map(h => [h.netId, h]));
  game.hooks = message.hooks.map(h => {
    if (!Number.isSafeInteger(h.netId) || h.netId < 1 || !Number.isInteger(h.owner) || !game.players[h.owner] || ![h.x, h.y, h.radius].every(Number.isFinite)) throw new Error('無效的鉤子資料');
    return Object.assign(oldHooks.get(h.netId) || {}, pick(h, hookKeys));
  });
  game.players.forEach((p, i) => { p.pull = message.players[i].pullOwner === null ? null : game.hooks.find(h => h.owner === message.players[i].pullOwner) || null; });
  game.humans = new Set(message.humans.filter(id => Number.isInteger(id) && game.players[id]));
  game.teams.forEach((t, i) => { t.score = Number.isFinite(message.teams?.[i]?.score) ? message.teams[i].score : 0; });
  game.time = Number.isFinite(message.time) ? message.time : game.time; game.winner = [0, 1].includes(message.winner) ? message.winner : null;
  return game;
}
// Only operations enter the host. Client-supplied player IDs, HP, gold, cooldown
// and outcomes are never applied; the connection's assigned slot is authoritative.
export function applyCommand(game, id, command) {
  const p = game.players[id];
  if (!p || !game.humans.has(id) || !command || typeof command !== 'object') return false;
  const coordinates = Number.isFinite(command.x) && Number.isFinite(command.y) && Math.abs(command.x) < W * 3 && Math.abs(command.y) < H * 3;
  switch (command.action) {
    case 'aim': if (!coordinates) return false; game.humanAims.set(id, { x: command.x, y: command.y }); return true;
    case 'move': return coordinates && game.moveTo(id, command.x, command.y);
    case 'fire': return coordinates && game.fire(id, command.x, command.y);
    case 'stop': game.stopMove(id); return true;
    case 'buy': return UPGRADES.some(u => u.key === command.key) && game.buy(id, command.key);
    default: return false;
  }
}
class BaseRoom {
  constructor(options) {
    this.options = options; this.makePeer = options.makePeer || createPeer; this.onChange = options.onChange || noOp; this.onGame = options.onGame || noOp; this.onEvents = options.onEvents || noOp; this.onError = options.onError || noOp;
    this.closed = false; this.ready = false; this.started = false; this.epoch = 0; this.localId = 0; this.message = ''; this.connections = new Map(); this.name = playerName(options.name);
  }
  changed() { this.onChange(this); }
  connectPeer(id) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('配對服務連線逾時，請稍後重試。')); this.close(); }, 18000);
      this.openTimer = timeout; this.rejectOpen = reject;
      try { this.peer = this.makePeer(id); } catch (error) { clearTimeout(timeout); reject(error); return; }
      this.peer.on('open', () => { clearTimeout(timeout); if (this.closed) return; this.ready = true; this.rejectOpen = null; resolve(); });
      this.peer.on('error', error => {
        const message = failure(error); this.message = message;
        if (!this.ready) { clearTimeout(timeout); reject(new Error(message)); }
        else if (['network', 'socket-error', 'server-error'].includes(error?.type) && [...this.connections.values()].some(c => c.open)) { this.message = '配對服務暫時中斷；已建立的 P2P 連線仍可使用。'; this.changed(); }
        else this.onError(message);
      });
      this.peer.on('disconnected', () => { if (!this.closed) { this.message = '配對服務暫時中斷；已建立的 P2P 連線仍可使用。'; this.changed(); } });
    });
  }
  close() {
    this.closed = true; this.ready = false; this.rejectOpen?.(new Error('連線已取消。')); this.rejectOpen = null; this.rejectJoin?.(new Error('連線已取消。')); this.rejectJoin = null; clearTimeout(this.openTimer); clearTimeout(this.joinTimer); clearInterval(this.timer);
    for (const connection of this.connections.values()) connection.close(); this.connections.clear(); this.peer?.destroy();
  }
}
export class HostRoom extends BaseRoom {
  constructor(options = {}) {
    super(options); this.role = 'host'; this.code = options.code || roomCode(); this.config = { teamSize: options.teamSize || 5, targetKills: options.targetKills ?? 30 };
    if (options.targetKills === null) this.config.targetKills = null;
    this.members = new Map(); this.sequence = 0; this.pendingEvents = []; this.aim = null; this.name = playerName(options.name, '房主');
    this.newGame();
  }
  newGame() {
    this.game = new Arena(Math.random, this.config); this.game.players[0].name = this.name;
    this.game.humans = new Set([0]);
    for (const member of this.members.values()) { this.game.humans.add(member.id); this.game.players[member.id].name = member.name; }
    this.epoch++; this.started = false; this.pendingEvents = []; this.onGame(this.game, 0, this.epoch); this.changed();
  }
  async open() {
    await this.connectPeer(PREFIX + this.code);
    this.peer.on('connection', connection => this.accept(connection));
    this.lastTick = clock(); this.lastBroadcast = 0;
    this.timer = setInterval(() => this.tick(), 20); this.changed(); return this;
  }
  accept(connection) {
    if (this.closed || this.connections.has(connection.peer) || this.connections.size >= this.game.players.length) { connection.close(); return; }
    this.connections.set(connection.peer, connection);
    const timeout = setTimeout(() => { if (!this.members.has(connection.peer)) { connection.close(); drop(); } }, 12000);
    connection.on('data', message => {
      if (this.closed || !message || typeof message !== 'object') return;
      if (message.type === 'hello') {
        if (this.members.has(connection.peer)) return;
        if (message.v !== WIRE_VERSION || this.started || this.members.size >= this.game.players.length - 1) { send(connection, { type: 'rejected', reason: this.started ? '房間已開戰，請等房主下一場再加入。' : '房間已滿或遊戲版本不同。' }); setTimeout(() => { connection.close(); drop(); }, 200); return; }
        const counts = [0, 0]; for (const id of this.game.humans) counts[this.game.players[id].team]++;
        const team = counts[0] <= counts[1] ? 0 : 1;
        const p = this.game.players.find(p => p.team === team && !this.game.humans.has(p.id));
        if (!p) { connection.close(); return; }
        const member = { id: p.id, name: playerName(message.name, `玩家${p.id + 1}`), count: 0, window: clock() };
        this.members.set(connection.peer, member); this.game.humans.add(p.id); p.name = member.name; clearTimeout(timeout);
        send(connection, { type: 'welcome', v: WIRE_VERSION, id: p.id }); this.broadcast(true); this.changed();
      } else if (message.type === 'command' && this.started && message.epoch === this.epoch) {
        const member = this.members.get(connection.peer); if (!member) return;
        const now = clock(); if (now - member.window > 1000) { member.window = now; member.count = 0; }
        if (++member.count <= 100) applyCommand(this.game, member.id, message);
      } else if (message.type === 'ping' && Number.isFinite(message.time)) send(connection, { type: 'pong', time: message.time });
    });
    const drop = () => {
      clearTimeout(timeout); if (this.connections.get(connection.peer) !== connection) return;
      this.connections.delete(connection.peer); const member = this.members.get(connection.peer);
      if (member) { this.members.delete(connection.peer); this.game.humans.delete(member.id); this.game.humanAims.delete(member.id); this.game.players[member.id].name = `AI ${member.id + 1}`; this.game.stopMove(member.id); }
      if (!this.closed) { this.broadcast(true); this.changed(); }
    };
    connection.on('close', drop); connection.on('error', () => { drop(); connection.close(); });
  }
  start() { if (!this.ready || this.closed) return; this.started = true; this.lastTick = clock(); this.broadcast(true); this.changed(); }
  rematch() { this.newGame(); this.broadcast(true); }
  command(command) { return this.started && applyCommand(this.game, 0, command); }
  tick(now = clock()) {
    if (this.closed) return;
    const dt = Math.min(.05, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (this.started && !hidden && this.game.winner === null) {
      this.game.tick(dt, { aim: this.game.humanAims.get(0) });
      const events = this.game.events.splice(0); if (events.length) { this.pendingEvents.push(...events); this.onEvents(events); }
    }
    if (now - this.lastBroadcast >= 50) { this.lastBroadcast = now; this.broadcast(); }
  }
  broadcast(force = false) {
    const message = snapshot(this.game, { epoch: this.epoch, started: this.started, sequence: ++this.sequence, hostHidden: typeof document !== 'undefined' && document.hidden });
    for (const [peer, connection] of this.connections) if (this.members.has(peer)) {
      if (this.pendingEvents.length) send(connection, { type: 'events', epoch: this.epoch, events: this.pendingEvents });
      send(connection, message, !force);
    }
    this.pendingEvents = [];
  }
}
export class ClientRoom extends BaseRoom {
  constructor(options = {}) { super(options); this.name = playerName(options.name, ''); this.role = 'client'; this.code = normalizeRoom(options.code); this.sequence = -1; this.ping = null; this.lastState = clock(); this.targets = null; }
  async open() {
    if (!validRoom(this.code)) throw new Error('房號需為 8 位英文字母或數字。');
    await this.connectPeer();
    return new Promise((resolve, reject) => {
      this.rejectJoin = reject;
      this.joinTimer = setTimeout(() => { reject(new Error('房間連線逾時。請核對房號；若網路需要 TURN 中繼，這個版本可能無法直連。')); this.close(); }, 20000);
      const connection = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { v: WIRE_VERSION } });
      this.connection = connection; this.connections.set('host', connection);
      connection.on('open', () => send(connection, { type: 'hello', v: WIRE_VERSION, name: this.name }));
      connection.on('data', message => {
        if (this.closed || !message || typeof message !== 'object') return;
        if (message.type === 'welcome' && message.v === WIRE_VERSION && Number.isInteger(message.id) && message.id >= 0 && message.id < 16) { this.localId = message.id; return; }
        if (message.type === 'rejected') { const error = new Error(String(message.reason).slice(0, 100)); clearTimeout(this.joinTimer); reject(error); this.onError(error.message); this.close(); return; }
        if (message.type === 'state' && message.sequence > this.sequence) {
          try {
            if (!message.humans?.includes(this.localId)) throw new Error('角色不在房間內');
            const changed = this.epoch !== message.epoch;
            const previous = !changed && this.game ? this.game.players.map(p => ({ x: p.x, y: p.y, hp: p.hp })) : null;
            const oldHeads = new Map((!changed && this.game ? this.game.hooks : []).map(h => [h.netId, { x: h.x, y: h.y }]));
            this.game = readSnapshot(message, changed ? null : this.game); this.targets = this.game.players.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy }));
            if (previous) this.game.players.forEach((p, i) => { if (previous[i].hp > 0 && p.hp > 0 && Math.hypot(p.x - previous[i].x, p.y - previous[i].y) < 300) { p.x = previous[i].x; p.y = previous[i].y; } });
            this.headTargets = new Map(this.game.hooks.map(h => [h.netId, { x: h.x, y: h.y }]));
            this.game.hooks.forEach(h => { const old = oldHeads.get(h.netId); if (old) { h.x = old.x; h.y = old.y; } });
            this.epoch = message.epoch; this.sequence = message.sequence; this.started = message.started; this.hostHidden = message.hostHidden; this.lastState = clock();
            if (changed) this.onGame(this.game, this.localId, this.epoch);
            this.changed(); clearTimeout(this.joinTimer); this.rejectJoin = null; resolve(this);
          } catch { this.onError('收到不相容的房間資料，請確認所有人使用同一個遊戲版本。'); this.close(); }
        } else if (message.type === 'events' && message.epoch === this.epoch && Array.isArray(message.events)) this.onEvents(message.events.slice(0, 100));
        else if (message.type === 'pong' && Number.isFinite(message.time)) { this.ping = Math.round(clock() - message.time); this.changed(); }
      });
      const lost = () => { if (!this.closed) { clearTimeout(this.joinTimer); reject(new Error('與房主的連線已中斷。')); this.onError('與房主的連線已中斷，房間已結束；目前不支援房主轉移。'); this.close(); } };
      connection.on('close', lost); connection.on('error', lost);
      this.timer = setInterval(() => {
        if (this.game && clock() - this.lastState > 15000) { lost(); return; }
        send(connection, { type: 'ping', time: clock() });
      }, 2000);
    });
  }
  command(command) { return this.started && send(this.connection, { ...command, type: 'command', epoch: this.epoch }); }
  advance(dt) {
    if (!this.targets || !this.game) return;
    const blend = 1 - Math.exp(-dt * 24), lead = Math.min(.05, (clock() - this.lastState) / 1000);
    this.game.players.forEach((p, i) => { const t = this.targets[i]; p.x += (t.x + t.vx * lead - p.x) * blend; p.y += (t.y + t.vy * lead - p.y) * blend; });
    for (const h of this.game.hooks) {
      const target = this.headTargets?.get(h.netId); if (!target) continue;
      let x = target.x, y = target.y;
      if (h.returning) {
        const owner = this.game.players[h.owner], d = Math.hypot(owner.x - x, owner.y - y), step = Math.min(d, h.returnSpeed * lead);
        x += (owner.x - x) / (d || 1) * step; y += (owner.y - y) / (d || 1) * step;
      } else { const step = Math.min(Math.max(0, h.range - h.distance), h.speed * lead); x += h.dx * step; y += h.dy * step; }
      h.x += (x - h.x) * blend; h.y += (y - h.y) * blend;
      if (h.victim !== null && this.game.players[h.victim]) { this.game.players[h.victim].x = h.x; this.game.players[h.victim].y = h.y; }
    }
  }
}
