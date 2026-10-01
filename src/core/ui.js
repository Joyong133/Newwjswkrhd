import * as THREE from 'three';
import { CanvasArt } from './canvasArt.js';
import { COLORS, FONT, font, roundRect, wrapText, damp, clamp } from './util.js';

/** 홀로그램 카드 배경 */
export function drawCard(ctx, w, h, { accent = COLORS.accent, radius = 36, alpha = 0.9, glow = true } = {}) {
  ctx.clearRect(0, 0, w, h);
  const pad = 6;
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, radius);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(14, 26, 48, ${alpha})`);
  g.addColorStop(1, `rgba(6, 11, 22, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fill();
  if (glow) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.strokeStyle = hexA(accent, 0.55);
    ctx.stroke();
    ctx.restore();
  }
  // 상단 액센트 바
  ctx.save();
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, radius);
  ctx.clip();
  const bar = ctx.createLinearGradient(0, 0, w, 0);
  bar.addColorStop(0, hexA(accent, 0.0));
  bar.addColorStop(0.5, hexA(accent, 0.9));
  bar.addColorStop(1, hexA(accent, 0.0));
  ctx.fillStyle = bar;
  ctx.fillRect(0, pad, w, 5);
  // 미세한 스캔라인
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = '#9fd8ff';
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

export function hexA(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 체크 / 진행 표시 아이콘 */
export function drawStatusDot(ctx, x, y, r, state) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (state === 'done') {
    ctx.fillStyle = COLORS.ok;
    ctx.fill();
    ctx.strokeStyle = '#04261a';
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.5, y - r * 0.35);
    ctx.stroke();
  } else if (state === 'active') {
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = r * 0.25;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
  } else if (state === 'bad') {
    ctx.fillStyle = COLORS.bad;
    ctx.fill();
    ctx.strokeStyle = '#2a0606';
    ctx.lineWidth = r * 0.25;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y - r * 0.35);
    ctx.lineTo(x + r * 0.35, y + r * 0.35);
    ctx.moveTo(x + r * 0.35, y - r * 0.35);
    ctx.lineTo(x - r * 0.35, y + r * 0.35);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(160, 180, 210, 0.45)';
    ctx.lineWidth = r * 0.2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 레이로 누를 수 있는 버튼이 포함된 캔버스 패널.
 * draw(ctx, w, h, panel) 안에서 panel.button(...)으로 버튼을 선언한다.
 */
export class Panel {
  constructor({ width, height, px = 1024, draw, transparent = true, name = 'panel', renderOrder = 0 }) {
    this.width = width;
    this.height = height;
    this.buttons = [];
    this.hoverId = null;
    this.pressedId = null;
    this.userDraw = draw;
    const pxW = px;
    const pxH = Math.round((px * height) / width);
    this.art = new CanvasArt(pxW, pxH, (ctx, w, h) => {
      this.buttons = [];
      this.userDraw(ctx, w, h, this);
    });
    this.material = new THREE.MeshBasicMaterial({
      map: this.art.texture,
      transparent,
      toneMapped: false,
      depthWrite: !transparent,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.material);
    this.mesh.name = name;
    this.mesh.renderOrder = renderOrder;
    this.mesh.userData.panel = this;
  }

  get pxWidth() { return this.art.width; }
  get pxHeight() { return this.art.height; }

  redraw() {
    this.art.redraw();
  }

  setDraw(draw) {
    this.userDraw = draw;
    this.redraw();
  }

  /** 버튼 그리기 + 히트 영역 등록 */
  button(ctx, { id, x, y, w, h, label, sub = null, onClick, style = 'default', enabled = true, size = null }) {
    const hover = this.hoverId === id && enabled;
    const pressed = this.pressedId === id;
    this.buttons.push({ id, x, y, w, h, onClick, enabled });
    ctx.save();
    roundRect(ctx, x, y, w, h, Math.min(h * 0.32, 26));
    let fill;
    let stroke;
    let textColor = COLORS.text;
    if (style === 'primary') {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, hover ? '#6ae6ff' : '#38d9ff');
      g.addColorStop(1, hover ? '#6af0b8' : '#3ddc97');
      fill = g;
      textColor = '#03131c';
      stroke = 'rgba(255,255,255,0.4)';
    } else if (style === 'danger') {
      fill = hover ? 'rgba(255, 93, 93, 0.35)' : 'rgba(255, 93, 93, 0.18)';
      stroke = 'rgba(255, 120, 120, 0.7)';
    } else {
      fill = hover ? 'rgba(56, 217, 255, 0.24)' : 'rgba(255, 255, 255, 0.07)';
      stroke = hover ? 'rgba(120, 225, 255, 0.95)' : 'rgba(150, 190, 230, 0.35)';
    }
    if (!enabled) {
      fill = 'rgba(255,255,255,0.04)';
      stroke = 'rgba(255,255,255,0.1)';
      textColor = 'rgba(200,210,230,0.35)';
    }
    if (pressed) ctx.translate(0, 3);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = hover ? 4 : 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = size || Math.round(h * 0.38);
    ctx.font = font(fs, 700);
    if (sub) {
      ctx.fillText(label, x + w / 2, y + h * 0.4);
      ctx.font = font(Math.round(fs * 0.6), 500);
      ctx.globalAlpha = 0.75;
      ctx.fillText(sub, x + w / 2, y + h * 0.72);
    } else {
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
    ctx.restore();
  }

  hitTest(uv) {
    const px = uv.x * this.pxWidth;
    const py = (1 - uv.y) * this.pxHeight;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.redraw();
  }

  click(id) {
    const b = this.buttons.find((bb) => bb.id === id);
    if (!b || !b.enabled) return false;
    this.pressedId = id;
    this.redraw();
    setTimeout(() => {
      this.pressedId = null;
      this.redraw();
    }, 120);
    b.onClick?.();
    return true;
  }
}

/** 호버한 물체 위에 뜨는 정보 라벨 */
export class Tooltip {
  constructor(scene) {
    this.text = '';
    this.title = '';
    this.panel = new Panel({
      width: 0.26,
      height: 0.1,
      px: 640,
      name: 'tooltip',
      renderOrder: 20,
      draw: (ctx, w, h) => this.draw(ctx, w, h),
    });
    this.panel.material.depthTest = false;
    this.mesh = this.panel.mesh;
    this.mesh.visible = false;
    this.opacity = 0;
    scene.add(this.mesh);
    this.target = new THREE.Vector3();
    this.lines = 1;
  }

  draw(ctx, w, h) {
    if (!this.title && !this.text) return;
    ctx.clearRect(0, 0, w, h);
    ctx.font = font(40, 700);
    const lines = this.text ? this.text.split('\n') : [];
    ctx.font = font(30, 500);
    const contentH = 64 + lines.length * 42 + 20;
    const boxH = Math.min(h - 8, contentH);
    roundRect(ctx, 4, 4, w - 8, boxH, 26);
    ctx.fillStyle = 'rgba(7, 13, 26, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(56, 217, 255, 0.7)';
    ctx.stroke();
    ctx.fillStyle = COLORS.accent;
    ctx.font = font(38, 700);
    ctx.textBaseline = 'top';
    ctx.fillText(this.title, 28, 22);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(29, 500);
    lines.forEach((ln, i) => ctx.fillText(ln, 28, 72 + i * 42));
  }

  show(title, text, worldPos, camera) {
    if (title !== this.title || text !== this.text) {
      this.title = title;
      this.text = text;
      const lines = text ? text.split('\n').length : 0;
      if (lines !== this.lines) {
        this.lines = lines;
      }
      this.panel.redraw();
    }
    this.target.copy(worldPos);
    this.visibleWanted = true;
    this.camera = camera;
  }

  hide() {
    this.visibleWanted = false;
  }

  update(dt, camera) {
    this.opacity = damp(this.opacity, this.visibleWanted ? 1 : 0, 14, dt);
    this.mesh.visible = this.opacity > 0.02;
    this.panel.material.opacity = this.opacity;
    if (!this.mesh.visible) return;
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    this.mesh.position.copy(this.target);
    // 시선 방향에 따라 크기 보정(멀수록 크게)
    const d = camPos.distanceTo(this.target);
    const s = clamp(d / 0.8, 0.7, 3.2);
    this.mesh.scale.setScalar(s);
    this.mesh.position.y += 0.05 * s;
    this.mesh.lookAt(camPos);
  }
}

/** 머리를 느슨하게 따라오는 알림(토스트) */
export class Toast {
  constructor(camera, scene) {
    this.camera = camera;
    this.queue = [];
    this.current = null;
    this.timer = 0;
    this.opacity = 0;
    this.kind = 'ok';
    this.panel = new Panel({
      width: 0.62,
      height: 0.16,
      px: 1024,
      name: 'toast',
      renderOrder: 30,
      draw: (ctx, w, h) => this.draw(ctx, w, h),
    });
    this.panel.material.depthTest = false;
    this.mesh = this.panel.mesh;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.initialized = false;
    this.listeners = [];
  }

  draw(ctx, w, h) {
    if (!this.current) return;
    const accent = this.current.kind === 'error' ? COLORS.bad : this.current.kind === 'warn' ? COLORS.warn : COLORS.ok;
    drawCard(ctx, w, h, { accent, radius: 40, alpha: 0.94 });
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = this.current.text.split('\n');
    const big = lines.length === 1 ? 50 : 44;
    ctx.font = font(big, 700);
    if (lines.length === 1) {
      ctx.fillText(lines[0], w / 2, h / 2 + 2);
    } else {
      ctx.fillText(lines[0], w / 2, h * 0.36);
      ctx.font = font(32, 500);
      ctx.fillStyle = '#c9d8ee';
      ctx.fillText(lines.slice(1).join('  '), w / 2, h * 0.68);
    }
  }

  show(text, kind = 'ok', duration = 3.2) {
    // 같은 메시지 연타 방지
    if (this.current && this.current.text === text) {
      this.timer = Math.max(this.timer, duration * 0.6);
      return;
    }
    if (this.queue.some((q) => q.text === text)) return;
    this.queue.push({ text, kind, duration });
    for (const fn of this.listeners) fn(text, kind, duration);
  }

  onShow(fn) {
    this.listeners.push(fn);
  }

  update(dt) {
    if (!this.current && this.queue.length) {
      this.current = this.queue.shift();
      this.timer = this.current.duration;
      this.panel.redraw();
    }
    if (this.current) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.opacity = damp(this.opacity, 0, 12, dt);
        if (this.opacity < 0.03) {
          this.current = null;
          this.opacity = 0;
        }
      } else {
        this.opacity = damp(this.opacity, 1, 12, dt);
      }
    }
    this.mesh.visible = this.opacity > 0.02;
    this.panel.material.opacity = this.opacity;

    // 머리 앞 1.1m, 약간 아래를 부드럽게 따라온다
    const cam = this.camera;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const target = camPos.clone().addScaledVector(dir, 1.1);
    target.y = camPos.y - 0.22;
    if (!this.initialized || !this.mesh.visible) {
      this.pos.copy(target);
      this.initialized = true;
    } else {
      this.pos.lerp(target, 1 - Math.exp(-4 * dt));
    }
    this.mesh.position.copy(this.pos);
    this.mesh.lookAt(camPos);
  }
}

export { wrapText, FONT };
