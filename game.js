import { Arena, W, H, COOLDOWN } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('arena'), ctx = canvas.getContext('2d');
let game = new Arena(), state = 'menu', aim = { x: 600, y: 200 }, particles = [], numbers = [], sound = false, audio;
let seed = 81;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const floor = document.createElement('canvas'); floor.width = W; floor.height = H;
const f = floor.getContext('2d');
f.fillStyle = '#303b2d'; f.fillRect(0, 0, W, H);
// A deterministic, hand-drawn stone yard. No remote assets are required.
for (let y = 0; y < H; y += 52) for (let x = -60; x < W; x += 74) {
  const px = x + ((y / 52) % 2) * 37, shade = 42 + Math.floor(rand() * 13);
  f.fillStyle = `rgb(${shade + 3},${shade + 13},${shade})`;
  f.beginPath(); f.roundRect(px + 2, y + 2, 69, 47, 4); f.fill();
  f.strokeStyle = '#87976b15'; f.strokeRect(px + 5, y + 5, 61, 1);
  if (rand() > .6) { f.fillStyle = '#70804d26'; f.fillRect(px + rand() * 30, y + 36, 25, 6); }
}
for (let i = 0; i < 2400; i++) { f.fillStyle = rand() > .5 ? '#9aad6820' : '#0a190b20'; f.fillRect(rand() * W, rand() * H, rand() * 4 + 1, 2); }
// River, masonry banks, and the arena's worn central sigil.
f.fillStyle = '#142e2e'; f.fillRect(0, 310, W, 130);
for (const y of [299, 440]) for (let x = -10; x < W; x += 61) {
  f.fillStyle = '#151f1b'; f.fillRect(x, y, 59, 16);
  f.fillStyle = '#566048'; f.fillRect(x + 2, y, 55, 8);
  f.fillStyle = '#78836744'; f.fillRect(x + 4, y, 50, 2);
}
for (const y of [155, 565]) {
  f.strokeStyle = '#b0bc6a18'; f.lineWidth = 3; f.beginPath(); f.arc(600, y, 83, 0, Math.PI * 2); f.stroke();
  f.beginPath(); f.arc(600, y, 68, 0, Math.PI * 2); f.stroke();
  f.save(); f.translate(600, y); f.rotate(Math.PI / 4); f.strokeRect(-36, -36, 72, 72); f.restore();
}
// Edge foliage and boundary stones.
for (let i = 0; i < 160; i++) {
  const x = rand() < .5 ? rand() * 22 : W - rand() * 22, y = rand() * H;
  f.fillStyle = ['#33472a', '#465635', '#263b28'][Math.floor(rand() * 3)];
  f.beginPath(); f.ellipse(x, y, rand() * 17 + 4, rand() * 9 + 3, rand() * 3, 0, 7); f.fill();
}

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
    if (e.type === 'hit') { burst(e.x, e.y, e.color); numbers.push({ x: e.x, y: e.y - 35, life: .9, text: '−55' }); tone(100, .2, 'sawtooth', .025); }
    if (e.type === 'spawn') burst(e.x, e.y, e.color, 30);
    if (e.type === 'kill') {
      burst(e.x, e.y, e.color, 45); tone(440, .3, 'triangle');
      const div = document.createElement('div');
      div.textContent = `${game.players[e.owner].name}  ↪  ${game.players[e.victim].name}`;
      $('feed').prepend(div); while ($('feed').children.length > 4) $('feed').lastChild.remove();
      setTimeout(() => div.remove(), 5000);
    }
    if (e.type === 'win') {
      state = 'ended';
      showOverlay(e.owner === 0 ? '你，主宰了競技場。' : `${game.players[e.owner].name} 贏得這一戰`, `你的戰績：${game.players[0].kills} 擊殺 / ${game.players[0].deaths} 陣亡。再來一局，試試不同的預判。`, '再次挑戰');
    }
  }
}
function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function draw(t) {
  ctx.clearRect(0, 0, W, H); ctx.drawImage(floor, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 316, W, 123); ctx.clip();
  for (let i = 0; i < 40; i++) {
    const x = (i * 67 + t * (12 + i % 4)) % (W + 120) - 60, y = 325 + (i * 29) % 110;
    ctx.strokeStyle = i % 3 ? '#71998a16' : '#a3c0a927'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 13, y - 3, x + 30, y + 3, x + 46, y); ctx.stroke();
  }
  ctx.restore();
  const destination = game.players[0].moveTarget;
  if (destination && state === 'playing') {
    ctx.save(); ctx.translate(destination.x, destination.y);
    ctx.strokeStyle = '#d6ed90bb'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 15 + Math.sin(t * 7) * 2, 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, 4); ctx.lineTo(6, -4); ctx.stroke(); ctx.restore();
  }
  if (state === 'playing' && game.players[0].hp > 0 && !game.players[0].pull) {
    const p = game.players[0], a = Math.atan2(aim.y - p.y, aim.x - p.x), d = Math.min(820, Math.hypot(aim.x - p.x, aim.y - p.y));
    ctx.strokeStyle = '#d6ed9030'; ctx.setLineDash([4, 10]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#d6ed9099'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(aim.x, aim.y, 11, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(aim.x - 17, aim.y); ctx.lineTo(aim.x - 7, aim.y); ctx.moveTo(aim.x + 7, aim.y); ctx.lineTo(aim.x + 17, aim.y); ctx.moveTo(aim.x, aim.y - 17); ctx.lineTo(aim.x, aim.y - 7); ctx.stroke();
  }
  for (const h of game.hooks) {
    const p = game.players[h.owner], angle = Math.atan2(h.y - p.y, h.x - p.x), d = Math.hypot(h.x - p.x, h.y - p.y);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
    ctx.strokeStyle = '#111b15'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(d, 2); ctx.stroke();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.translate(d, 0); ctx.strokeStyle = '#e3e4c9'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(9, 0); ctx.bezierCurveTo(20, 0, 21, 17, 8, 18); ctx.lineTo(8, 10); ctx.stroke(); ctx.restore();
  }
  for (const p of [...game.players].sort((a, b) => a.y - b.y)) {
    if (p.hp <= 0) continue;
    const bob = Math.sin(t * 9 + p.id) * (Math.hypot(p.vx, p.vy) > 5 ? 2 : .4);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(0, 16, 28, 13, 0, 0, 7); ctx.fill();
    if (p.id === 0 || p.shield > 0) {
      ctx.strokeStyle = p.shield > 0 ? `${p.color}99` : '#d6ed9060'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 12, p.shield > 0 ? 35 : 30, p.shield > 0 ? 24 : 19, 0, 0, 7); ctx.stroke();
    }
    ctx.translate(0, bob); ctx.save(); ctx.rotate(p.angle + Math.PI / 2);
    // Original hooded chain hunters, with shoulder armour and a curved steel hook.
    circle(-18, 1, 11, '#151d18'); circle(18, 1, 11, '#151d18');
    circle(-18, -2, 9, p.color); circle(18, -2, 9, p.color);
    ctx.fillStyle = '#202b24'; ctx.beginPath(); ctx.roundRect(-17, -14, 34, 39, 12); ctx.fill();
    ctx.fillStyle = p.color; ctx.globalAlpha = .5; ctx.beginPath(); ctx.roundRect(-13, -10, 26, 24, 9); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#111b16'; ctx.fillRect(-14, 12, 28, 6);
    circle(0, -12, 13, '#101a15'); circle(0, -14, 10, '#5e6d4e');
    ctx.fillStyle = '#17221a'; ctx.beginPath(); ctx.moveTo(-11, -17); ctx.lineTo(0, -28); ctx.lineTo(12, -16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.color; ctx.fillRect(-6, -18, 4, 2); ctx.fillRect(3, -18, 4, 2);
    ctx.strokeStyle = '#c5cbb2'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(25, -2); ctx.lineTo(25, -19); ctx.bezierCurveTo(25, -31, 37, -28, 34, -18); ctx.stroke();
    ctx.restore();
    ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#0b140c'; ctx.fillText(p.name, 1, -46); ctx.fillStyle = p.id === 0 ? '#e1f5a6' : '#d5deca'; ctx.fillText(p.name, 0, -47);
    ctx.fillStyle = '#111b17'; ctx.fillRect(-23, -40, 46, 5); ctx.fillStyle = p.color; ctx.fillRect(-22, -39, 44 * p.hp / 100, 3);
    ctx.restore();
  }
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life); circle(p.x, p.y, 2.5, p.color); } ctx.globalAlpha = 1;
  for (const n of numbers) { ctx.globalAlpha = Math.min(1, n.life * 2); ctx.fillStyle = '#f2d1a4'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center'; ctx.fillText(n.text, n.x, n.y); } ctx.globalAlpha = 1;
  // Soft edge vignette keeps the action in focus.
  const vignette = ctx.createRadialGradient(600, 360, 250, 600, 360, 720); vignette.addColorStop(0, '#06100900'); vignette.addColorStop(1, '#061009aa'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  if (game.players[0].hp <= 0 && state === 'playing') {
    ctx.fillStyle = '#101b14cc'; ctx.fillRect(390, 200, 420, 85); ctx.textAlign = 'center'; ctx.font = 'bold 23px Arial'; ctx.fillStyle = '#d6ed90'; ctx.fillText(`重新集結 · ${Math.ceil(game.players[0].dead)} 秒後重生`, 600, 250);
  }
}
let scoreCache = '';
function hud() {
  const p = game.players[0]; $('timer').textContent = `${String(Math.floor(game.time / 60)).padStart(2, '0')}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
  $('hp-text').innerHTML = `${p.hp} <small>/ 100</small>`; $('hp-bar').style.width = `${p.hp}%`;
  $('cooldown').style.width = `${(1 - p.cooldown / COOLDOWN) * 100}%`;
  $('hook-status').textContent = p.hp <= 0 ? `重生倒數 ${Math.ceil(p.dead)} 秒` : p.pull ? '被鉤中了！' : p.cooldown > 0 ? `鎖鏈冷卻 · ${p.cooldown.toFixed(1)}s` : game.hooks.some(h => h.owner === 0) ? '鎖鏈飛行中' : '鎖鏈就緒';
  const score = game.players.map(p => `${p.kills},${p.deaths}`).join('|');
  if (score !== scoreCache) {
    scoreCache = score; $('scores').innerHTML = [...game.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map(p => `<div class="score-row" style="--player:${p.color}"><span class="avatar">${['↪', '♜', '◈', '♟'][p.id]}</span><span class="name">${p.name}${p.id === 0 ? '<small>YOU</small>' : ''}</span><span class="stats">${p.kills} <span>/ ${p.deaths}</span></span></div>`).join('');
  }
}
function showOverlay(title, description, button) {
  $('overlay-title').textContent = title; $('overlay-description').textContent = description; $('play-button').innerHTML = `${button} <span>→</span>`; $('overlay').hidden = false;
  $('overlay-hint').textContent = state === 'paused' ? 'Esc / P 繼續遊戲' : '右鍵移動 · 滑鼠瞄準 · Q 出鉤 · S 停止';
}
function pause() {
  if (state === 'playing') { state = 'paused'; showOverlay('稍作喘息。', '鎖鏈已收好。準備好了，就再度進場。', '繼續對戰'); }
  else if (state === 'paused' && !$('help').open) { state = 'playing'; $('overlay').hidden = true; canvas.focus(); }
  $('pause-button').textContent = state === 'paused' ? '▶' : 'Ⅱ';
}
$('play-button').onclick = () => {
  if (state !== 'paused') { game = new Arena(); particles = []; numbers = []; $('feed').replaceChildren(); scoreCache = ''; }
  state = 'playing'; $('overlay').hidden = true; $('pause-button').textContent = 'Ⅱ'; canvas.focus();
};
$('pause-button').onclick = pause;
$('sound-button').onclick = () => { sound = !sound; if (sound) { audio ||= new AudioContext(); audio.resume(); tone(400); } $('sound-button').textContent = `音效 ${sound ? '開' : '關'}`; $('sound-button').setAttribute('aria-label', sound ? '關閉音效' : '開啟音效'); };
let helpPaused = false;
$('help-button').onclick = () => { helpPaused = state === 'playing'; if (helpPaused) pause(); $('help').showModal(); };
$('close-help').onclick = () => $('help').close();
$('help').addEventListener('close', () => { if (helpPaused && state === 'paused') pause(); helpPaused = false; });
window.addEventListener('keydown', e => {
  if ($('help').open) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) pause(); return; }
  if (state !== 'playing' || e.target instanceof HTMLButtonElement) return;
  if (e.code === 'KeyQ') { e.preventDefault(); if (!e.repeat) game.fire(0, aim.x, aim.y); }
  if (e.code === 'KeyS') { e.preventDefault(); game.stopMove(0); }
});
window.addEventListener('blur', () => { if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
function pointer(e) { const rect = canvas.getBoundingClientRect(); aim = { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H }; }
canvas.addEventListener('pointermove', pointer);
canvas.addEventListener('pointerdown', e => {
  if (state !== 'playing') return;
  pointer(e); canvas.focus();
  if (e.button === 2) { e.preventDefault(); game.moveTo(0, aim.x, aim.y); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (state === 'playing') {
    game.tick(dt, { aim }); events();
    particles = particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });
    numbers = numbers.filter(n => { n.y -= dt * 30; n.life -= dt; return n.life > 0; });
  }
  draw(game.time); hud(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
