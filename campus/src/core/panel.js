import * as THREE from 'three';
import { C, font, roundRect, labelRegistry } from './util.js';

/** 글꼴이 늦게 도착했을 때 다시 그릴 캔버스 목록 */
const registry = new Set();
let maxAniso = 4;

export function setMaxAnisotropy(n) {
  maxAniso = Math.max(1, Math.min(8, n));
}

export function redrawAll() {
  for (const p of registry) p.redraw();
  for (const fn of labelRegistry) fn();
}

/**
 * 캔버스 텍스처로 그린 평면 패널.
 * draw(ctx, w, h, panel) 안에서 panel.button(...)으로 누를 수 있는 버튼을 선언한다.
 */
export class Panel {
  constructor({ width, height, px = 1024, draw, transparent = true, name = 'panel', depthTest = true, mipmaps = true }) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.round((px * height) / width);
    this.ctx = this.canvas.getContext('2d');
    this.buttons = [];
    this.hoverId = null;
    this.pressedId = null;
    this.drawFn = draw;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = maxAniso;
    if (!mipmaps) {
      this.texture.generateMipmaps = false;
      this.texture.minFilter = THREE.LinearFilter;
    }
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent,
      toneMapped: false,
      depthWrite: !transparent,
      depthTest,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.name = name;
    this.mesh.userData.panel = this;
    this.dirty = false;
    registry.add(this);
    this.redraw();
  }

  get pxW() { return this.canvas.width; }
  get pxH() { return this.canvas.height; }

  /** 다음 프레임에 한 번만 다시 그리기(여러 번 호출돼도 1회) */
  invalidate() {
    this.dirty = true;
  }

  flush() {
    if (this.dirty) this.redraw();
  }

  redraw() {
    this.dirty = false;
    this.buttons = [];
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.pxW, this.pxH);
    this.drawFn?.(ctx, this.pxW, this.pxH, this);
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  setDraw(fn) {
    this.drawFn = fn;
    this.redraw();
  }

  /**
   * 버튼 그리기 + 히트 영역 등록.
   * style: default | primary | ghost | tab | ok | bad | dim
   */
  button(ctx, { id, x, y, w, h, label, sub = null, onClick, style = 'default', enabled = true, size = null, active = false, align = 'center', color = null }) {
    const hover = this.hoverId === id && enabled;
    const pressed = this.pressedId === id;
    this.buttons.push({ id, x, y, w, h, onClick, enabled });
    ctx.save();
    if (pressed) ctx.translate(0, 3);
    roundRect(ctx, x, y, w, h, Math.min(h * 0.3, 24));
    let fill = hover ? 'rgba(56, 217, 255, 0.22)' : 'rgba(255, 255, 255, 0.06)';
    let stroke = hover ? 'rgba(120, 225, 255, 0.95)' : 'rgba(150, 190, 230, 0.3)';
    let text = C.text;
    if (style === 'primary') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, hover ? '#7deaff' : '#38d9ff');
      g.addColorStop(1, hover ? '#7ef2c4' : '#3ddc97');
      fill = g;
      stroke = 'rgba(255,255,255,0.5)';
      text = '#03121a';
    } else if (style === 'tab') {
      fill = active ? (color || C.accent) : hover ? 'rgba(56, 217, 255, 0.18)' : 'rgba(255,255,255,0.04)';
      stroke = active ? 'rgba(255,255,255,0.4)' : stroke;
      text = active ? '#04121c' : C.text;
    } else if (style === 'ok') {
      fill = 'rgba(61, 220, 151, 0.28)';
      stroke = C.ok;
    } else if (style === 'bad') {
      fill = 'rgba(255, 93, 108, 0.25)';
      stroke = C.bad;
    } else if (style === 'ghost') {
      fill = hover ? 'rgba(56, 217, 255, 0.14)' : 'rgba(0,0,0,0)';
      stroke = hover ? 'rgba(120, 225, 255, 0.8)' : 'rgba(150, 190, 230, 0.18)';
    } else if (style === 'dim') {
      fill = 'rgba(255,255,255,0.03)';
      stroke = 'rgba(255,255,255,0.1)';
      text = C.muted;
    }
    if (active && style === 'default') {
      fill = color ? color + '44' : 'rgba(56,217,255,0.25)';
      stroke = color || C.accent;
    }
    if (!enabled) {
      fill = 'rgba(255,255,255,0.03)';
      stroke = 'rgba(255,255,255,0.08)';
      text = 'rgba(200,210,230,0.3)';
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = hover ? 4 : 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = text;
    ctx.textBaseline = 'middle';
    const fs = size || Math.round(h * 0.4);
    ctx.font = font(fs, 700);
    const tx = align === 'left' ? x + fs * 0.8 : x + w / 2;
    ctx.textAlign = align;
    if (sub) {
      ctx.fillText(label, tx, y + h * 0.38, w - fs);
      ctx.font = font(Math.round(fs * 0.62), 500);
      ctx.globalAlpha = 0.75;
      ctx.fillText(sub, tx, y + h * 0.72, w - fs);
    } else {
      ctx.fillText(label, tx, y + h / 2 + 2, w - fs * 0.6);
    }
    ctx.restore();
  }

  hitTest(uv) {
    const px = uv.x * this.pxW;
    const py = (1 - uv.y) * this.pxH;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.invalidate();
  }

  click(id) {
    const b = this.buttons.find((bb) => bb.id === id);
    if (!b || !b.enabled) return false;
    this.pressedId = id;
    this.invalidate();
    setTimeout(() => {
      this.pressedId = null;
      this.invalidate();
    }, 110);
    b.onClick?.();
    return true;
  }

  dispose() {
    registry.delete(this);
    this.texture.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

/** 홀로그램 카드 배경 */
export function drawCard(ctx, w, h, { accent = C.accent, radius = 36, alpha = 1 } = {}) {
  const pad = 6;
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, radius);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(13, 24, 46, ${alpha})`);
  g.addColorStop(1, `rgba(5, 9, 20, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = accent + 'aa';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, radius);
  ctx.clip();
  const bar = ctx.createLinearGradient(0, 0, w, 0);
  bar.addColorStop(0, accent + '00');
  bar.addColorStop(0.5, accent + 'ee');
  bar.addColorStop(1, accent + '00');
  ctx.fillStyle = bar;
  ctx.fillRect(0, pad, w, 6);
  ctx.restore();
}
