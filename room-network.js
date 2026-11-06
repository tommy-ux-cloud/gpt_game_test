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
  // Use the public ICE service configuration shipped by this PeerJS version.
  // The previous STUN-only override accidentally disabled its built-in TURN.
  const defaults = globalThis.peerjs?.util?.defaultConfig || {};
  const servers = defaults.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }];
  const tcp = servers.flatMap(server => (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(url => typeof url === 'string' && url.startsWith('turn:') && !url.includes('?')).map(url => ({ ...server, urls: url + '?transport=tcp' })));
  return new globalThis.Peer(id, { debug: 0, secure: true, pingInterval: 5000, config: { ...defaults, iceServers: [...servers, ...tcp, { urls: 'stun:stun.cloudflare.com:3478' }] } });
}
function failure(error) {
  if (error?.type === 'peer-unavailable') return '找不到已註冊的房間；請確認房號及房主畫面已顯示「可以加入」。';
  if (error?.type === 'unavailable-id') return '這個房號已被使用，請重新建立房間。';
  if (error?.type === 'webrtc') return '無法與房主建立資料通道；直連或官方預設中繼均可能受網路限制，可重試加入。';
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
    this.closed = false; this.ready = false; this.signalReady = false; this.everOpened = false; this.signalState = 'connecting'; this.phase = 'signaling'; this.joined = false; this.reconnectAttempts = 0;
    this.started = false; this.epoch = 0; this.localId = 0; this.message = ''; this.connections = new Map(); this.name = playerName(options.name);
  }
  changed() { this.onChange(this); }
  peerCreated() {}
  connectPeer(id) {
    return new Promise((resolve, reject) => {
      this.rejectOpen = reject;
      const failInitial = message => {
        if (this.closed || this.everOpened) return;
        this.rejectOpen = null; this.close(); this.signalState = 'failed'; this.phase = 'failed'; this.message = message;
        reject(new Error(message)); this.changed();
      };
      this.openTimer = setTimeout(() => failInitial('配對服務連線逾時，房間尚未建立。請按「重試連線」。'), this.options.openTimeoutMs ?? 18000);
      try { this.peer = this.makePeer(id); this.peerCreated(this.peer); } catch (error) { failInitial(error.message); return; }
      this.peer.on('open', () => {
        if (this.closed) return;
        clearTimeout(this.openTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.reconnectWatchdog);
        this.reconnectTimer = this.reconnectWatchdog = null; this.reconnectAttempts = 0;
        this.signalReady = this.ready = this.everOpened = true; this.signalState = 'registered'; this.message = ''; this.rejectOpen = null;
        if (!this.joined) this.phase = this.role === 'host' ? (this.started ? 'connected' : 'lobby') : 'connecting-host';
        resolve(); this.changed();
      });
      this.peer.on('error', error => {
        if (this.closed) return;
        this.lastErrorType = error?.type || 'unknown';
        if (!this.everOpened) { failInitial(failure(error)); return; }
        if (this.role === 'host' && ['peer-unavailable', 'webrtc', 'negotiation-failed', 'connection-closed'].includes(error?.type)) {
          // A failed guest is not a failed room. PeerJS emits some guest errors
          // on the Peer itself, rather than only on the DataConnection.
          if (this.signalReady) this.message = '有玩家未能連上；房間仍開放，可以重新加入。';
          this.changed(); return;
        }
        if (['network', 'socket-error', 'socket-closed', 'server-error', 'unavailable-id'].includes(error?.type)) { this.signalLost(); return; }
        if (this.role === 'host' || (this.joined && this.connection?.open)) { this.message = '配對發生錯誤，房間保留；已有的資料通道仍可使用。'; this.changed(); return; }
        if (!this.joined) this.failJoining?.(failure(error));
        else this.onError(failure(error));
      });
      this.peer.on('disconnected', () => { if (!this.closed && this.everOpened) this.signalLost(); });
    });
  }
  signalLost() {
    if (this.closed) return;
    this.signalReady = false; clearTimeout(this.reconnectWatchdog); this.reconnectWatchdog = null;
    this.queueReconnect();
  }
  queueReconnect(immediate = false) {
    if (this.closed || this.signalReady || this.reconnectTimer) return;
    const delays = this.options.reconnectDelays || [1000, 2500, 5000];
    if (this.peer?.destroyed || this.reconnectAttempts >= delays.length) {
      this.signalState = 'unavailable'; this.message = '配對暫時無法恢復，房間與既有對局保留；可按「重試連線」或自行離開。'; this.changed(); return;
    }
    this.signalState = 'reconnecting'; this.message = '配對服務中斷，正在自動重連；房間與既有對局保留。'; this.changed();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null; if (this.closed || this.signalReady) return;
      this.reconnectAttempts++;
      this.reconnectWatchdog = setTimeout(() => {
        this.reconnectWatchdog = null; if (this.closed || this.signalReady) return;
        if (!this.peer.disconnected) this.peer.disconnect();
        this.queueReconnect();
      }, this.options.reconnectTimeoutMs ?? 10000);
      try { if (this.peer.disconnected) this.peer.reconnect(); }
      catch { clearTimeout(this.reconnectWatchdog); this.reconnectWatchdog = null; this.queueReconnect(); }
    }, immediate ? 0 : delays[this.reconnectAttempts]);
  }
  retrySignaling() {
    if (this.closed || !this.everOpened || this.peer?.destroyed) return false;
    clearTimeout(this.reconnectTimer); clearTimeout(this.reconnectWatchdog); this.reconnectTimer = this.reconnectWatchdog = null;
    this.signalReady = false; this.reconnectAttempts = 0;
    if (!this.peer.disconnected) this.peer.disconnect();
    this.queueReconnect(true); return true;
  }
  diagnostics() {
    return { build: '0.13.1', role: this.role, phase: this.phase, registered: this.signalReady, roomReady: this.ready, joined: this.joined, signaling: this.signalState, error: this.lastErrorType || null, ice: this.connection?.peerConnection?.iceConnectionState || null, dataOpen: !!this.connection?.open, retry: this.reconnectAttempts };
  }
  close() {
    this.closed = true; this.ready = this.signalReady = false; this.rejectOpen?.(new Error('連線已取消。')); this.rejectOpen = null; this.rejectJoin?.(new Error('連線已取消。')); this.rejectJoin = null;
    clearTimeout(this.openTimer); clearTimeout(this.joinTimer); clearTimeout(this.reconnectTimer); clearTimeout(this.reconnectWatchdog); clearInterval(this.timer);
    this.reconnectTimer = this.reconnectWatchdog = null;
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
  peerCreated(peer) { peer.on('connection', connection => this.accept(connection)); }
  async open() {
    await this.connectPeer(PREFIX + this.code);
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
        this.members.set(connection.peer, member); if (this.signalReady) this.message = ''; this.game.humans.add(p.id); p.name = member.name; clearTimeout(timeout);
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
  start() { if (!this.ready || this.closed) return; this.started = true; this.phase = 'connected'; if (this.signalReady) this.message = ''; this.lastTick = clock(); this.broadcast(true); this.changed(); }
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
      this.failJoining = message => { if (this.closed || this.joined) return; this.rejectJoin = null; this.close(); this.phase = 'failed'; this.signalState = 'failed'; this.message = message; reject(new Error(message)); this.changed(); };
      this.joinTimer = setTimeout(() => this.failJoining('已連上配對服務，但仍無法與房主建立通道。請確認房主已可加入，再重試；網路或中繼服務也可能受限。'), this.options.joinTimeoutMs ?? 25000);
      const connection = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { v: WIRE_VERSION } });
      if (!connection) { this.failJoining('配對連線剛中斷，尚未連上房主，請按「重試加入」。'); return; }
      this.connection = connection; this.connections.set('host', connection);
      connection.on('open', () => { this.phase = 'synchronizing'; this.changed(); send(connection, { type: 'hello', v: WIRE_VERSION, name: this.name }); });
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
            this.joined = true; this.phase = 'connected';
            this.epoch = message.epoch; this.sequence = message.sequence; this.started = message.started; this.hostHidden = message.hostHidden; this.lastState = clock();
            if (changed) this.onGame(this.game, this.localId, this.epoch);
            this.changed(); clearTimeout(this.joinTimer); this.rejectJoin = null; resolve(this);
          } catch { this.onError('收到不相容的房間資料，請確認所有人使用同一個遊戲版本。'); this.close(); }
        } else if (message.type === 'events' && message.epoch === this.epoch && Array.isArray(message.events)) this.onEvents(message.events.slice(0, 100));
        else if (message.type === 'pong' && Number.isFinite(message.time)) { this.ping = Math.round(clock() - message.time); this.changed(); }
      });
      const lost = error => { if (!this.closed) {
        if (!this.joined) { this.failJoining(error?.type === 'negotiation-failed' ? failure({ type: 'webrtc' }) : '尚未與房主建立連線，並非已開始的對局結束。請確認房主已可加入，再重試。'); return; }
        clearTimeout(this.joinTimer); this.onError('與房主的連線已中斷，房間已結束；目前不支援房主轉移。'); this.close();
      } };
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
