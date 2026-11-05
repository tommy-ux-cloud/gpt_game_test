import { Arena, W, H, RIVER, UPGRADES, upgradeValue, SHOP_RANGE } from './engine.js';
import { Camera, VIEW_W, VIEW_H, PROJECTION, HOOK_HEIGHT } from './camera.js';
import { Arena3D, createPigPreview } from './arena3d.js';

const $ = id => document.getElementById(id);
const canvas = $('arena'), ctx = canvas.getContext('2d');
canvas.width = VIEW_W; canvas.height = VIEW_H;
const camera = new Camera();
const mouse = { u: .5, v: .5, inside: false };
const minimap = $('minimap'), mini = minimap.getContext('2d');
let shopIntent = null, shopCache = "";
const money = value => Number.isInteger(value) ? String(value) : value.toFixed(1);
let game = new Arena(), state = 'menu', aim = { x: W / 2 + 180, y: H / 2 - 110 }, particles = [], numbers = [], sound = false, audio;
camera.centerOn(game.players[0]);
let seed = 81;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const floor = document.createElement('canvas'); floor.width = W; floor.height = H;
const f = floor.getContext('2d');
f.fillStyle = '#303b2d'; f.fillRect(0, 0, W, H);
// A deterministic, hand-drawn stone yard. No remote assets are required.
for (let y = 0; y < H; y += 52) for (let x = -60; x < W; x += 74) {
  const px = x + ((y / 52) % 2) * 37, shade = 42 + Math.floor(rand() * 13);
  f.fillStyle = '#132016'; f.beginPath(); f.roundRect(px + 2, y + 7, 69, 45, 4); f.fill();
  f.fillStyle = `rgb(${shade + 3},${shade + 13},${shade})`;
  f.beginPath(); f.roundRect(px + 2, y + 2, 69, 47, 4); f.fill();
  f.strokeStyle = '#a7b58b38'; f.strokeRect(px + 5, y + 5, 61, 1);
  f.fillStyle = '#0c170f55'; f.fillRect(px + 5, y + 43, 61, 4);
  if (rand() > .6) { f.fillStyle = '#70804d26'; f.fillRect(px + rand() * 30, y + 36, 25, 6); }
}
for (let i = 0; i < 2400; i++) { f.fillStyle = rand() > .5 ? '#9aad6820' : '#0a190b20'; f.fillRect(rand() * W, rand() * H, rand() * 4 + 1, 2); }
// The river divides the map into left and right territories.
f.fillStyle = '#142e2e'; f.fillRect(RIVER.left, 0, RIVER.right - RIVER.left, H);
for (const x of [RIVER.left - 11, RIVER.right]) for (let y = -10; y < H; y += 61) {
  f.fillStyle = '#151f1b'; f.fillRect(x, y, 16, 59);
  f.fillStyle = '#566048'; f.fillRect(x, y + 2, 8, 55);
  f.fillStyle = '#78836744'; f.fillRect(x, y + 4, 2, 50);
}
for (const x of [RIVER.left / 2, (RIVER.right + W) / 2]) {
  f.strokeStyle = '#b0bc6a18'; f.lineWidth = 3;
  f.beginPath(); f.arc(x, H / 2, 83, 0, Math.PI * 2); f.stroke();
  f.beginPath(); f.arc(x, H / 2, 68, 0, Math.PI * 2); f.stroke();
  f.save(); f.translate(x, H / 2); f.rotate(Math.PI / 4); f.strokeRect(-36, -36, 72, 72); f.restore();
}
// Edge foliage and boundary stones.
for (let i = 0; i < 160; i++) {
  const x = rand() < .5 ? rand() * 22 : W - rand() * 22, y = rand() * H;
  f.fillStyle = ['#33472a', '#465635', '#263b28'][Math.floor(rand() * 3)];
  f.beginPath(); f.ellipse(x, y, rand() * 17 + 4, rand() * 9 + 3, rand() * 3, 0, 7); f.fill();
}

let world3d = null;
try { world3d = new Arena3D(canvas, floor); } catch (error) { console.warn('3D renderer unavailable; using Canvas fallback.', error.message); }

function tone(freq, duration = .08, type = 'sine', volume = .035) {
  if (!sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain(); o.connect(g); g.connect(audio.destination);
  o.type = type; o.frequency.setValueAtTime(freq, audio.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .45, audio.currentTime + duration);
  g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  o.start(); o.stop(audio.currentTime + duration);
}
function burst(x, y, color, count = 20) {
  for (let i = 0; i < count; i++) { const a = Math.random() * 7, v = 40 + Math.random() * 160; particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .4 + Math.random() * .4, color }); }
}
function events() {
  for (const e of game.events.splice(0)) {
    if (e.type === 'fire') tone(230, .12, 'triangle');
    if (e.type === 'hit') { burst(e.x + HOOK_HEIGHT * PROJECTION.c / PROJECTION.d / PROJECTION.a, e.y - HOOK_HEIGHT / PROJECTION.d, e.color); numbers.push({ x: e.x, y: e.y - HOOK_HEIGHT / PROJECTION.d - 35, life: .9, text: e.damage ? `−${e.damage}` : '救援' }); tone(100, .2, 'sawtooth', .025); }
    if (e.type === 'spawn') { burst(e.x, e.y, e.color, 30); camera.centerOn(game.players[0]); }
    if (e.type === 'purchase' && e.player === 0) { tone(650, .12); shopCache = ''; }
    if (e.type === 'kill') {
      burst(e.x, e.y, e.color, 45); tone(440, .3, 'triangle');
      const div = document.createElement('div');
      div.textContent = `${game.players[e.owner].name}  ↪  ${game.players[e.victim].name} · 共 +${money(e.reward)} 金錢${e.streak >= 2 ? ` · ${e.streak} 連殺` : ''}${e.shutdownReward ? ` · 終結 ${e.endedStreak} 連殺（已含獎金 $${money(e.shutdownReward)}）` : ''}`;
      if (e.owner === 0) numbers.push({ x: game.players[0].x, y: game.players[0].y - 125, life: 1.6, text: `+$${money(e.reward)}` });
      $('feed').prepend(div); while ($('feed').children.length > 4) $('feed').lastChild.remove();
      setTimeout(() => div.remove(), 5000);
    }
    if (e.type === 'win') {
      state = 'ended'; $('shop').close(); shopIntent = null;
      showOverlay(`${game.teams[e.team].name} 贏得這一戰`, `你的戰績：${game.players[0].kills} 擊殺 / ${game.players[0].deaths} 陣亡。再來一局，試試不同的預判。`, '再次挑戰');
    }
  }
}
function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function standAt(x, y) {
  const screen = camera.worldToScreen({ x, y });
  ctx.save(); ctx.setTransform(1, 0, 0, 1, screen.x, screen.y);
}
function drawMerchant(merchant, rendered3d = false) {
  if (rendered3d) {
    standAt(merchant.x, merchant.y); ctx.textAlign = 'center'; ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#f1d895';
    ctx.fillText(merchant.name, 0, -93); ctx.font = '10px Arial'; ctx.fillText('中立 · 無敵 · B 購買', 0, 32); ctx.restore(); return;
  }
  standAt(merchant.x, merchant.y);
  ctx.fillStyle = '#0007'; ctx.beginPath(); ctx.ellipse(5, 7, 55, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5d432a'; ctx.fillRect(-34, -66, 6, 69); ctx.fillRect(30, -66, 6, 69);
  ctx.fillStyle = '#bfac7d'; ctx.beginPath(); ctx.moveTo(-50, -65); ctx.lineTo(-5, -91); ctx.lineTo(49, -65); ctx.lineTo(2, -48); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e7d49a'; ctx.beginPath(); ctx.moveTo(-50, -65); ctx.lineTo(2, -48); ctx.lineTo(2, -39); ctx.lineTo(-50, -56); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a18a50'; ctx.beginPath(); ctx.moveTo(2, -48); ctx.lineTo(49, -65); ctx.lineTo(49, -56); ctx.lineTo(2, -39); ctx.closePath(); ctx.fill();
  circle(0, -30, 10, '#d7c79d'); ctx.fillStyle = '#50614a'; ctx.fillRect(-11, -22, 22, 25);
  ctx.fillStyle = '#614a30'; ctx.fillRect(-41, -7, 80, 25); ctx.fillStyle = '#8e7048'; ctx.fillRect(-41, -7, 80, 6);
  ctx.fillStyle = '#473622'; ctx.beginPath(); ctx.moveTo(39, -7); ctx.lineTo(49, -15); ctx.lineTo(49, 10); ctx.lineTo(39, 18); ctx.closePath(); ctx.fill();
  for (const x of [-24, 0, 23]) { circle(x, -8, 5, '#e1c66a'); circle(x + 1, -11, 4, '#f5dc88'); }
  ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#f1d895'; ctx.fillText(merchant.name, 0, -110);
  ctx.font = '10px Arial'; ctx.fillText('中立 · 無敵 · B 購買', 0, 36); ctx.restore();
}
function drawPlayer(p, t, rendered3d = false) {
  standAt(p.x, p.y);
  if (!rendered3d) {
    // A readable pig fallback for browsers without WebGL.
    ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(0, 4, 27, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#365578'; ctx.beginPath(); ctx.roundRect(-20, -25, 40, 20, 6); ctx.fill();
    circle(-12, -3, 8, '#c8b7a2'); circle(12, -3, 8, '#c8b7a2');
    ctx.fillStyle = '#282b2d'; ctx.beginPath(); ctx.ellipse(0, -38, 23, 25, 0, 0, 7); ctx.fill();
    circle(-26, -37, 8, '#d99c9c'); circle(26, -37, 8, '#d99c9c');
    circle(-18, -82, 10, '#e0a8a5'); circle(18, -82, 10, '#e0a8a5');
    circle(0, -66, 24, '#e6b0ac'); circle(-10, -69, 3.5, '#193040'); circle(10, -69, 3.5, '#193040');
    ctx.fillStyle = '#cf898c'; ctx.beginPath(); ctx.ellipse(0, -58, 11, 8, 0, 0, 7); ctx.fill();
    circle(-4, -58, 2, '#633940'); circle(4, -58, 2, '#633940');
    ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(32, -28, 10, -.8, 3.8); ctx.stroke();
    if (p.id === 0 || p.shield > 0) { ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 5, 31, 11, 0, 0, 7); ctx.stroke(); }
  }
  const name = p.name + (p.id !== 0 && p.team === 0 ? ' · 隊友' : '');
  ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#09101b'; ctx.fillText(name, 1, -103);
  ctx.fillStyle = p.id === 0 ? '#c6e6ff' : '#e0e1df'; ctx.fillText(name, 0, -104);
  ctx.fillStyle = '#111b17'; ctx.fillRect(-23, -96, 46, 5); ctx.fillStyle = p.color; ctx.fillRect(-22, -95, 44 * p.hp / p.maxHp, 3);
  ctx.restore();
}
function draw(t) {
  const rendered3d = world3d?.render(game, camera) || false;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.save(); ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.transform(PROJECTION.a, 0, PROJECTION.c, PROJECTION.d, 0, 0);
  ctx.translate(-camera.x - VIEW_W / 2, -camera.y - VIEW_H / 2);
  if (!rendered3d) {
    ctx.drawImage(floor, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(RIVER.left + 6, 0, RIVER.right - RIVER.left - 7, H); ctx.clip();
    for (let i = 0; i < 40; i++) {
      const x = RIVER.left + 15 + (i * 29) % (RIVER.right - RIVER.left - 30), y = (i * 67 + t * (12 + i % 4)) % (H + 120) - 60;
      ctx.strokeStyle = i % 3 ? '#71998a16' : '#a3c0a927'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x - 3, y + 13, x + 3, y + 30, x, y + 46); ctx.stroke();
    }
    ctx.restore();
  }
  for (const merchant of game.merchants) {
    ctx.save(); ctx.translate(merchant.x, merchant.y);
    ctx.strokeStyle = '#dfc47c55'; ctx.lineWidth = 2; ctx.setLineDash([5, 8]);
    ctx.beginPath(); ctx.arc(0, 0, SHOP_RANGE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  const destination = game.players[0].moveTarget;
  if (destination && state === 'playing') {
    ctx.save(); ctx.translate(destination.x, destination.y);
    ctx.strokeStyle = '#d6ed90bb'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 15 + Math.sin(t * 7) * 2, 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, 4); ctx.lineTo(6, -4); ctx.stroke(); ctx.restore();
  }
  ctx.save();
  const liftY = -HOOK_HEIGHT / PROJECTION.d, liftX = -PROJECTION.c * liftY / PROJECTION.a;
  ctx.translate(liftX, liftY);
  if (state === 'playing' && game.players[0].hp > 0 && !game.players[0].pull) {
    const p = game.players[0], a = Math.atan2(aim.y - p.y, aim.x - p.x), d = Math.min(p.hookRange, Math.hypot(aim.x - p.x, aim.y - p.y));
    ctx.strokeStyle = '#d6ed9030'; ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#d6ed9099'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(aim.x, aim.y, 11, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aim.x - 17, aim.y); ctx.lineTo(aim.x - 7, aim.y); ctx.moveTo(aim.x + 7, aim.y); ctx.lineTo(aim.x + 17, aim.y); ctx.moveTo(aim.x, aim.y - 17); ctx.lineTo(aim.x, aim.y - 7); ctx.stroke();
  }
  if (!rendered3d) for (const h of game.hooks) {
    const p = game.players[h.owner], angle = Math.atan2(h.y - p.y, h.x - p.x), d = Math.hypot(h.x - p.x, h.y - p.y);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
    ctx.strokeStyle = '#111b15'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(d, 2); ctx.stroke();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // The visible head is centered on, and bounded by, its actual world-space radius.
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.atan2(h.y - p.y, h.x - p.x));
    const r = h.radius;
    ctx.fillStyle = '#e3e4c921'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1.5, r * .2); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-r * .75, -r * .25); ctx.lineTo(r * .3, -r * .25);
    ctx.bezierCurveTo(r * .95, -r * .25, r * .95, r * .7, r * .1, r * .7); ctx.lineTo(r * .1, r * .15); ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  const actors = [
    ...game.players.filter(p => p.hp > 0).map(p => ({ y: p.y, draw: () => drawPlayer(p, t, rendered3d) })),
    ...game.merchants.map(m => ({ y: m.y, draw: () => drawMerchant(m, rendered3d) })),
  ];
  actors.sort((a, b) => a.y - b.y).forEach(actor => actor.draw());
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); circle(p.x, p.y, 2.5, p.color); } ctx.globalAlpha = 1;
  for (const n of numbers) { ctx.globalAlpha = Math.min(1, n.life * 2); ctx.fillStyle = '#f2d1a4'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.fillText(n.text, n.x, n.y); } ctx.globalAlpha = 1;
  ctx.restore();
  // HUD shading is fixed to the viewport, separate from world coordinates.
  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_W * .22, VIEW_W / 2, VIEW_H / 2, VIEW_W * .65); vignette.addColorStop(0, '#06100900'); vignette.addColorStop(1, '#061009aa'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (game.players[0].hp <= 0 && state === 'playing') {
    ctx.fillStyle = '#101b14cc'; ctx.fillRect(VIEW_W / 2 - 210, VIEW_H / 2 - 120, 420, 85); ctx.textAlign = 'center'; ctx.font = 'bold 23px Arial'; ctx.fillStyle = '#d6ed90'; ctx.fillText(`重新集結 · ${Math.ceil(game.players[0].dead)} 秒後重生`, VIEW_W / 2, VIEW_H / 2 - 70);
  }
}
function drawMinimap() {
  const mw = minimap.width, mh = minimap.height;
  mini.drawImage(floor, 0, 0, mw, mh);
  for (const p of game.players) {
    if (p.hp <= 0) continue;
    mini.fillStyle = p.color; mini.beginPath(); mini.arc(p.x / W * mw, p.y / H * mh, p.id === 0 ? 4 : 3, 0, Math.PI * 2); mini.fill();
  }
  for (const m of game.merchants) { mini.fillStyle = '#f0cf7e'; mini.fillRect(m.x / W * mw - 3, m.y / H * mh - 3, 6, 6); }
  mini.fillStyle = '#d6ed9020'; mini.strokeStyle = '#e2f5aa'; mini.lineWidth = 1.5;
  const corners = camera.corners(); mini.beginPath();
  corners.forEach((p, i) => i ? mini.lineTo(p.x / W * mw, p.y / H * mh) : mini.moveTo(p.x / W * mw, p.y / H * mh));
  mini.closePath(); mini.fill(); mini.stroke();
  $('camera-mode').textContent = world3d?.available ? '3D 角色 · 固定跟隨 · 55° 高位斜俯視' : '相容繪圖模式 · 固定跟隨 · 55° 高位斜俯視';
}
function updateCamera() {
  camera.centerOn(game.players[0]);
  aim = camera.aimToWorld(mouse.u, mouse.v);
}
const formatStat = (p, key) => key === 'hookCooldown' || key === 'regen' ? p[key].toFixed(2) : key === 'hookRadius' ? p[key].toFixed(2) : Math.round(p[key]);
function shopView() {
  if (!$('shop').open) return;
  const p = game.players[0], nearby = game.canShop(0);
  const cache = [p.gold, nearby, p.hp <= 0, ...UPGRADES.map(u => p[u.key])].join('|');
  if (cache === shopCache) return; shopCache = cache;
  $('shop-gold').textContent = `${money(p.gold)} 金錢`;
  $('shop-status').textContent = p.hp <= 0 ? '重生後才能購買' : nearby ? '商人在附近 · 每次升級 1 金錢' : '靠近任一商人才能購買；兩邊商人都對所有人開放。';
  $('shop-travel').hidden = nearby || p.hp <= 0;
  $('shop-items').innerHTML = UPGRADES.map(u => {
    const next = upgradeValue(p, u.key), capped = next === p[u.key];
    return `<div class="shop-item"><div><strong>${u.name} <small>Lv.${p.levels[u.key]}</small></strong><p>${formatStat(p, u.key)} → ${formatStat({[u.key]:next}, u.key)} <span>${u.unit}</span></p><small>每級 ${u.step}</small></div><button data-upgrade="${u.key}" ${!nearby || p.gold < 1 || capped ? 'disabled' : ''}>${capped ? '已達上限' : '升級 · 1 金錢'}</button></div>`;
  }).join('');
}
function openShop() { if (state !== 'playing') return; shopCache = ''; $('shop').showModal(); shopView(); }
function travelToMerchant(merchant) {
  const p = game.players[0];
  if (p.hp <= 0 || p.pull) return;
  const reachable = merchant.x < W / 2 ? p.x < RIVER.left : p.x > RIVER.right;
  if (!reachable) return;
  if (game.moveTo(0, merchant.x + (merchant.x < W / 2 ? 100 : -100), merchant.y)) shopIntent = merchant.id;
  if ($('shop').open) $('shop').close();
}
let scoreCache = '';
function hud() {
  const p = game.players[0]; $('timer').textContent = `${String(Math.floor(game.time / 60)).padStart(2, '0')}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  $('hp-text').innerHTML = `${Math.ceil(p.hp)} <small>/ ${p.maxHp}</small>`; $('hp-bar').style.width = `${p.hp / p.maxHp * 100}%`;
  const activeHook = game.hooks.find(h => h.owner === 0);
  $('cooldown').style.width = `${activeHook ? 0 : Math.max(0, 1 - p.cooldown / p.hookCooldown) * 100}%`;
  $('hook-status').textContent = p.hp <= 0 ? `重生倒數 ${Math.ceil(p.dead)} 秒` : p.pull ? '被鉤中了！' : activeHook ? (activeHook.returning ? '鉤子回收中' : '鉤子飛行中') : p.cooldown > 0 ? `鎖鏈冷卻 · ${p.cooldown.toFixed(1)}s` : '鎖鏈就緒';
  $('hook-description').textContent = activeHook ? '回到身上後開始冷卻' : '滑鼠瞄準 / 按 Q 出鉤';
  const training = game.mode === 'dummy';
  $('training-reset').hidden = !training;
  $('gold-text').textContent = `${money(p.gold)} 金錢`;
  $('target-label').textContent = training ? '固定靶人 · 100 萬生命 · 每秒回血 10 萬' : game.targetKills === null ? '無限練習 · 不設擊殺上限' : `隊伍率先 ${game.targetKills} 擊殺獲勝`;
  $('mode-description').textContent = training ? '靶場練習 · 1 位固定靶人' : game.targetKills === null ? `${game.teamSize} 對 ${game.teamSize} · 無限對戰` : `${game.teamSize} 對 ${game.teamSize} · 率先 ${game.targetKills} 擊殺`;
  $('streak-text').textContent = training ? `出鉤 ${game.practice.shots} · 命中 ${game.practice.hits} · 累計傷害 ${game.practice.damage}` : p.streak >= 2 ? `${p.streak} 連殺 · 下次擊殺 $2` : p.streak === 1 ? '1 連殺 · 下次擊殺 $2' : '本條命首殺 $1';
  $('team-score').innerHTML = `<span>${game.teams[0].score}</span> : <span>${game.teams[1].score}</span>`;
  shopView();
  const score = game.players.map(p => `${p.kills},${p.deaths},${p.streak}`).join('|');
  if (score !== scoreCache) {
    scoreCache = score;
    $('scores').innerHTML = game.teams.map((team, id) => {
      const members = game.players.filter(p => p.team === id);
      return `<div class="score-team-title" style="--team:${team.color}">${team.name}<span>${members.length} 人</span></div>` + members.map(p => `<div class="score-row" style="--player:${p.color}"><span class="avatar">${p.id === 0 ? '↪' : ['♜', '◈', '♟'][p.id % 3]}</span><span class="name">${p.name}${p.streak >= 2 ? `<b class="streak-badge">${p.streak} 連殺</b>` : ''}<em>${p.dummy ? '固定靶人' : p.id === 0 ? '玩家' : 'AI'}</em>${p.id === 0 ? '<small>YOU</small>' : ''}</span><span class="stats">${p.kills} <span>/ ${p.deaths}</span></span></div>`).join('');
    }).join('');
  }
}
function showOverlay(title, description, button) {
  $('overlay-title').textContent = title; $('overlay-description').textContent = description; $('play-button').innerHTML = `${button} <span>→</span>`; $('overlay').hidden = false;
  $('match-settings').hidden = state === 'paused';
  $('reset-button').hidden = state !== 'paused';
  $('overlay-hint').textContent = state === 'paused' ? 'Esc / P 繼續遊戲' : '右鍵移動 · Q 出鉤 · B 商店 · S 停止';
}
function pause() {
  if (state === 'playing') { state = 'paused'; mouse.inside = false; showOverlay('稍作喘息。', '鎖鏈已收好。準備好了，就再度進場。', '繼續對戰'); }
  else if (state === 'paused' && !$('help').open) { state = 'playing'; $('overlay').hidden = true; canvas.focus(); }
  $('pause-button').textContent = state === 'paused' ? '▶' : 'Ⅱ';
}
$('play-button').onclick = () => {
  if (state !== 'paused') {
    const input = $('kill-target');
    const mode = $('game-mode').value;
    if (mode === 'team' && !$('endless-mode').checked && !input.reportValidity()) return;
    game = new Arena(Math.random, { mode, teamSize: Number($('team-size').value), targetKills: mode === 'dummy' || $('endless-mode').checked ? null : input.valueAsNumber });
    particles = []; numbers = []; $('feed').replaceChildren(); scoreCache = ''; shopIntent = null; camera.centerOn(game.players[0]);
  }
  state = 'playing'; $('overlay').hidden = true; $('pause-button').textContent = 'Ⅱ'; canvas.focus();
};
function modeSettings() {
  const training = $('game-mode').value === 'dummy';
  $('team-settings').hidden = training; $('practice-note').hidden = !training;
  $('endless-mode').disabled = training;
  $('team-size').disabled = training;
  $('kill-target').disabled = training || $('endless-mode').checked;
}
$('game-mode').onchange = modeSettings;
$('endless-mode').onchange = modeSettings;
function resetTraining() {
  if (state === 'playing' && game.resetTraining()) { particles = []; numbers = []; }
}
$('training-reset').onclick = resetTraining;
$('reset-button').onclick = () => {
  state = 'setup';
  showOverlay('設定下一場對局', '自訂隊伍擊殺目標，或選擇無限練習。新局會重設金錢、連殺與升級。', '開始新對局');
};
$('pause-button').onclick = pause;
$('fullscreen-button').onclick = () => {
  const expanded = $('arena-shell').classList.toggle('expanded');
  document.body.classList.toggle('arena-expanded', expanded);
  $('fullscreen-button').textContent = expanded ? '返回一般畫面' : '放大競技場';
  $('fullscreen-button').setAttribute('aria-pressed', String(expanded));
  canvas.focus();
};
$('sound-button').onclick = () => { sound = !sound; if (sound) { audio ||= new AudioContext(); audio.resume(); tone(400); } $('sound-button').textContent = `音效 ${sound ? '開' : '關'}`; $('sound-button').setAttribute('aria-label', sound ? '關閉音效' : '開啟音效'); };
let helpPaused = false;
$('help-button').onclick = () => { helpPaused = state === 'playing'; if (helpPaused) pause(); $('help').showModal(); };
$('close-help').onclick = () => $('help').close();
$('help').addEventListener('close', () => { if (helpPaused && state === 'paused') pause(); helpPaused = false; });
let characterPreview = null, characterPaused = false;
$('character-button').onclick = () => {
  characterPaused = state === 'playing'; if (characterPaused) pause();
  $('character-viewer').showModal();
  $('character-viewer-note').textContent = '拖曳角色可旋轉查看 · 第一版 3D 造型';
  for (const b of document.querySelectorAll('[data-preview-team]')) b.setAttribute('aria-pressed', String(b.dataset.previewTeam === '0'));
  try { characterPreview = createPigPreview($('character-canvas')); }
  catch { $('character-viewer-note').textContent = '此瀏覽器無法啟用 3D 預覽，可使用支援 WebGL 的桌面瀏覽器查看。'; }
};
$('close-character').onclick = () => $('character-viewer').close();
$('character-viewer').addEventListener('close', () => {
  characterPreview?.dispose(); characterPreview = null;
  // A canvas with a lost/disposed WebGL context cannot be reused for the next preview.
  const old = $('character-canvas'), fresh = old.cloneNode(false); old.replaceWith(fresh);
  if (characterPaused && state === 'paused') pause(); characterPaused = false;
});
for (const button of document.querySelectorAll('[data-preview-team]')) button.onclick = () => {
  const team = Number(button.dataset.previewTeam); characterPreview?.setTeam(team);
  for (const b of document.querySelectorAll('[data-preview-team]')) b.setAttribute('aria-pressed', String(b === button));
};
window.addEventListener('keydown', e => {
  if ($('help').open || $('shop').open || $('character-viewer').open) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) pause(); return; }
  if (state !== 'playing' || e.target instanceof HTMLButtonElement) return;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyQ') { e.preventDefault(); aim = camera.aimToWorld(mouse.u, mouse.v); if (!e.repeat) game.fire(0, aim.x, aim.y); }
  if (e.code === 'KeyS') { e.preventDefault(); shopIntent = null; game.stopMove(0); }
  if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); resetTraining(); }
  if (e.code === 'KeyB' && !e.repeat) { e.preventDefault(); openShop(); }
});
window.addEventListener('blur', () => { mouse.inside = false; if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  mouse.u = (e.clientX - rect.left) / rect.width; mouse.v = (e.clientY - rect.top) / rect.height; mouse.inside = true;
  aim = camera.aimToWorld(mouse.u, mouse.v);
}
canvas.addEventListener('pointermove', pointer);
canvas.addEventListener('pointerleave', () => { mouse.inside = false; });
canvas.addEventListener('pointerdown', e => {
  if (state !== 'playing') return;
  pointer(e); canvas.focus();
  const merchant = game.merchants.find(m => { const screen = camera.worldToScreen(m); return Math.abs(mouse.u * VIEW_W - screen.x) < 55 && mouse.v * VIEW_H > screen.y - 100 && mouse.v * VIEW_H < screen.y + 35; });
  if (merchant && (e.button === 0 || e.button === 2)) { if (game.canShop(0, merchant.id)) openShop(); else travelToMerchant(merchant); return; }
  if (e.button === 2) { e.preventDefault(); shopIntent = null; const ground = camera.screenToWorld(mouse.u, mouse.v); game.moveTo(0, ground.x, ground.y); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
$('shop-button').onclick = openShop;
$('close-shop').onclick = () => $('shop').close();
$('shop').addEventListener('close', () => { canvas.focus(); });
$('shop-items').addEventListener('click', e => {
  const button = e.target.closest('button[data-upgrade]');
  if (!button || button.disabled || state !== 'playing') return;
  game.buy(0, button.dataset.upgrade); shopView();
});
$('shop-travel').onclick = () => {
  const p = game.players[0], merchant = game.merchants.find(m => p.x < RIVER.left ? m.x < W / 2 : m.x > W / 2);
  travelToMerchant(merchant);
};
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (state === 'playing') {
    updateCamera(); game.tick(dt, { aim }); events();
    if (game.players[0].hp <= 0 || game.players[0].pull) shopIntent = null;
    if (shopIntent !== null && game.canShop(0, shopIntent)) { shopIntent = null; game.stopMove(0); openShop(); }
    camera.centerOn(game.players[0]);
    aim = camera.aimToWorld(mouse.u, mouse.v);
    particles = particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });
    numbers = numbers.filter(n => { n.y -= dt * 30; n.life -= dt; return n.life > 0; });
  }
  draw(game.time); drawMinimap(); hud(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
