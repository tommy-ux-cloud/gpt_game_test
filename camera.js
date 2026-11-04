import { W, H } from './engine.js';

export const VIEW_W = 1200, VIEW_H = 750;
// High, pitched orthographic framing: no sideways shear, with a 55-degree ground view.
// Normalize zoom so the determinant stays 1 and the view remains 1/9 of the world.
export const CAMERA_PITCH = 55;
const depthScale = Math.sqrt(Math.sin(CAMERA_PITCH * Math.PI / 180));
export const PROJECTION = { a: 1 / depthScale, c: 0, d: depthScale };
export const HOOK_HEIGHT = 40;
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
  aimToWorld(u, v) { return this.screenToWorld(u, v + HOOK_HEIGHT / this.height); }
  hookToScreen(point) { const screen = this.worldToScreen(point); return { x: screen.x, y: screen.y - HOOK_HEIGHT }; }
  corners() { return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => this.screenToWorld(u, v)); }
}
