// Small, shared metal-link sprites keep long chains inexpensive in 8v8.
const LINK_STEP = 6.2, TILE_W = 14, TILE_H = 12, DETAIL_SCALE = 3;
function linkSprite(edgeOn, variant) {
  const canvas = document.createElement('canvas'); canvas.width = TILE_W * DETAIL_SCALE; canvas.height = TILE_H * DETAIL_SCALE;
  const ctx = canvas.getContext('2d'); ctx.scale(DETAIL_SCALE, DETAIL_SCALE);
  const x = TILE_W / 2, y = TILE_H / 2, ry = edgeOn ? 1.05 : 2.65;
  ctx.lineCap = 'round';
  // Dark rim, worn steel, and a narrow upper-edge reflection.
  ctx.strokeStyle = '#0b1012aa'; ctx.lineWidth = 2.7; ctx.beginPath(); ctx.ellipse(x + .35, y + .8, 4.3, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#20272a'; ctx.lineWidth = 2.25; ctx.beginPath(); ctx.ellipse(x, y, 4.3, ry, 0, 0, Math.PI * 2); ctx.stroke();
  const metal = ctx.createLinearGradient(0, y - ry - 1, 0, y + ry + 1);
  metal.addColorStop(0, variant === 1 ? '#b0a58c' : '#c1c1b3'); metal.addColorStop(.23, '#8c918b'); metal.addColorStop(.5, '#515b5e'); metal.addColorStop(.76, '#303b40'); metal.addColorStop(1, '#6c7270');
  ctx.strokeStyle = metal; ctx.lineWidth = edgeOn ? 1.35 : 1.45; ctx.beginPath(); ctx.ellipse(x, y, 4.3, ry, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#d4d3bd'; ctx.lineWidth = .4; ctx.beginPath(); ctx.ellipse(x - .1, y - .2, 4.2, ry, 0, Math.PI * 1.12, Math.PI * 1.82); ctx.stroke();
  if (variant === 1 || variant === 3) {
    ctx.strokeStyle = variant === 1 ? '#79553b' : '#6b5740'; ctx.lineWidth = .7; ctx.beginPath(); ctx.ellipse(x, y, 4.3, ry, 0, .25, .8); ctx.stroke();
  }
  ctx.strokeStyle = '#171e20'; ctx.lineWidth = .45; ctx.beginPath(); ctx.moveTo(x + 3.2, y - .9); ctx.lineTo(x + 4.3, y - .3); ctx.stroke();
  return canvas;
}
export class ChainRenderer {
  constructor() { this.links = null; }
  draw(ctx, owner, hook, time) {
    const dx = hook.x - owner.x, dy = hook.y - owner.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    this.links ||= Array.from({ length: 8 }, (_, i) => linkSprite(i % 2 === 1, Math.floor(i / 2)));
    const count = Math.max(1, Math.ceil(distance / LINK_STEP));
    const slack = Math.min(1, distance / 240) * (hook.hasHit ? .65 : hook.returning ? 3.5 : 1.25);
    const yAt = u => Math.sin(Math.PI * u) * (slack + Math.sin(u * 12 - time * 9) * slack * .22);
    // Edge-on links sit behind face-on links, so adjacent loops interlock.
    for (const parity of [1, 0]) for (let i = parity; i < count; i += 2) {
      const u = (i + .5) / count, next = Math.min(1, u + .015), prev = Math.max(0, u - .015);
      const tangentY = dy + (yAt(next) - yAt(prev)) / (next - prev);
      ctx.save(); ctx.translate(owner.x + dx * u, owner.y + dy * u + yAt(u)); ctx.rotate(Math.atan2(tangentY, dx));
      ctx.drawImage(this.links[i % 8], -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H); ctx.restore();
    }
    // A compact steel swivel joins the last loop to the enamel hook head.
    const angle = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(hook.x, hook.y); ctx.rotate(angle);
    ctx.fillStyle = '#303b40'; ctx.strokeStyle = '#969e96'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.roundRect(-Math.min(hook.radius * .7, 6), -1.75, 5, 3.5, 1.2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
