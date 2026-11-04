import { W, H } from './engine.js';

export const VIEW_W = 1200, VIEW_H = 750;
export class Camera {
  constructor() { this.x = 0; this.y = 0; this.width = VIEW_W; this.height = VIEW_H; }
  centerOn(point) {
    this.x = Math.max(0, Math.min(W - this.width, point.x - this.width / 2));
    this.y = Math.max(0, Math.min(H - this.height, point.y - this.height / 2));
  }
  pan(dx, dy) { this.centerOn({ x: this.x + this.width / 2 + dx, y: this.y + this.height / 2 + dy }); }
  screenToWorld(u, v) { return { x: this.x + u * this.width, y: this.y + v * this.height }; }
  minimapToWorld(u, v) { return { x: Math.max(0, Math.min(W, u * W)), y: Math.max(0, Math.min(H, v * H)) }; }
}
