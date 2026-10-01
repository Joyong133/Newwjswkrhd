import * as THREE from 'three';

/**
 * 캔버스로 그린 절차적 텍스처.
 * 폰트(특히 한글 서브셋)가 늦게 로드되면 redrawAllArt()로 다시 그린다.
 */
const registry = new Set();
let maxAniso = 4;

export function setMaxAnisotropy(n) {
  maxAniso = Math.max(1, Math.min(8, n));
}

export class CanvasArt {
  constructor(width, height, draw, opts = {}) {
    const { srgb = true, repeat = null, aniso = true, autoRedraw = true, mipmaps = true } = opts;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.width = width;
    this.height = height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    this.texture.anisotropy = aniso ? maxAniso : 1;
    if (!mipmaps) {
      this.texture.generateMipmaps = false;
      this.texture.minFilter = THREE.LinearFilter;
    }
    if (repeat) {
      this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
      this.texture.repeat.set(repeat[0], repeat[1]);
    }
    this.drawFn = draw;
    this.autoRedraw = autoRedraw;
    this.redraw();
    registry.add(this);
  }

  redraw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawFn(ctx, this.width, this.height, this);
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  dispose() {
    registry.delete(this);
    this.texture.dispose();
  }
}

export function redrawAllArt() {
  for (const art of registry) if (art.autoRedraw) art.redraw();
}

/** 지정한 시드의 결정적 난수를 쓰는 노이즈 점 찍기 */
export function speckle(ctx, w, h, rng, count, colors, sizeMin = 0.5, sizeMax = 1.6) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    const s = sizeMin + rng() * (sizeMax - sizeMin);
    ctx.globalAlpha = 0.25 + rng() * 0.6;
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 부드러운 저주파 얼룩 */
export function mottle(ctx, w, h, rng, count, color, alpha = 0.05, rMin = 20, rMax = 120) {
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = rMin + rng() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}
