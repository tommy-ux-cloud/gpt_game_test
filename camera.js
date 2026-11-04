import { W, H } from './engine.js';

export const VIEW_W = 1200, VIEW_H = 750;
// The tilted ground preserves area (1.25 × .8 = 1), so each view is still 1/9 of the map.
export const PROJECTION = { a: 1.25, c: .18, d: .8 };
export class Camera {
  constructor() { this.x = 0; this.y = 0; this.width = VIEW_W; this.height = VIEW_H; }
  centerOn(point) {
    const halfY = this.height / 2 / PROJECTION.d;
    const halfX = this.width / 2 / PROJECTION.a + Math.abs(PROJECTION.c / PROJECTION.a) * halfY;
    const cx = Math.max(halfX, Math.min(W - halfX, point.x));
    const cy = Math.max(halfY, Math.min(H - halfY, point.y));
    this.x = cx - this.width / 2; this.y = cy - this.height / 2;
  }
  screenToWorld(u, v) {
    const dy = (v - .5) * this.height / PROJECTION.d;
    const dx = ((u - .5) * this.width - PROJECTION.c * dy) / PROJECTION.a;
    return { x: this.x + this.width / 2 + dx, y: this.y + this.height / 2 + dy };
  }
  worldToScreen(point) {
    const dx = point.x - this.x - this.width / 2, dy = point.y - this.y - this.height / 2;
    return { x: this.width / 2 + PROJECTION.a * dx + PROJECTION.c * dy, y: this.height / 2 + PROJECTION.d * dy };
  }
  corners() { return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => this.screenToWorld(u, v)); }
}
