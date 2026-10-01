import * as THREE from 'three';
import { rand } from './util.js';

/** 연기, 불꽃, 색종이용 경량 파티클 시스템(Points + 커스텀 셰이더) */
export class Particles {
  constructor({ max = 256, texture, blending = THREE.NormalBlending, sizeScale = 1 }) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.alphas = new Float32Array(max);
    this.sizes = new Float32Array(max);
    this.rots = new Float32Array(max);
    this.data = [];
    for (let i = 0; i < max; i++) this.data.push({ life: 0, max: 1, vel: new THREE.Vector3(), size0: 0, size1: 0, a0: 0, drag: 0, grav: 0, spin: 0 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rot', new THREE.BufferAttribute(this.rots, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uScale: { value: 900 * sizeScale } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float size;
        attribute float rot;
        attribute vec3 color;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRot;
        uniform float uScale;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vRot = rot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.05, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vRot;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv + 0.5;
          vec4 t = texture2D(uMap, uv);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          if (gl_FragColor.a < 0.004) discard;
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.raycast = () => {};
    this.cursor = 0;
    this.alive = 0;
  }

  emit(pos, count, opts = {}) {
    const {
      vel = new THREE.Vector3(0, 0.1, 0),
      spread = 0.02,
      velSpread = 0.05,
      life = [1, 2],
      size = [0.02, 0.06],
      alpha = 0.6,
      color = new THREE.Color(0xffffff),
      colorJitter = 0,
      drag = 0.8,
      gravity = 0,
      spin = 1,
    } = opts;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const d = this.data[i];
      d.life = d.max = rand(life[0], life[1]);
      d.vel.set(vel.x + rand(-velSpread, velSpread), vel.y + rand(-velSpread, velSpread) * 0.5, vel.z + rand(-velSpread, velSpread));
      d.size0 = size[0];
      d.size1 = size[1];
      d.a0 = alpha;
      d.drag = drag;
      d.grav = gravity;
      d.spin = rand(-spin, spin);
      this.positions[i * 3] = pos.x + rand(-spread, spread);
      this.positions[i * 3 + 1] = pos.y + rand(-spread, spread) * 0.5;
      this.positions[i * 3 + 2] = pos.z + rand(-spread, spread);
      const c = Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color;
      const j = colorJitter ? rand(-colorJitter, colorJitter) : 0;
      this.colors[i * 3] = Math.min(1, Math.max(0, c.r + j));
      this.colors[i * 3 + 1] = Math.min(1, Math.max(0, c.g + j));
      this.colors[i * 3 + 2] = Math.min(1, Math.max(0, c.b + j));
      this.rots[i] = rand(0, Math.PI * 2);
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const d = this.data[i];
      if (d.life <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      alive++;
      d.life -= dt;
      const t = 1 - Math.max(0, d.life) / d.max;
      d.vel.multiplyScalar(Math.exp(-d.drag * dt));
      d.vel.y -= d.grav * dt;
      this.positions[i * 3] += d.vel.x * dt;
      this.positions[i * 3 + 1] += d.vel.y * dt;
      this.positions[i * 3 + 2] += d.vel.z * dt;
      this.sizes[i] = d.size0 + (d.size1 - d.size0) * t;
      this.alphas[i] = d.a0 * Math.min(1, t * 6) * (1 - t) * (1 - t);
      this.rots[i] += d.spin * dt;
    }
    if (alive || this.alive) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
      g.attributes.rot.needsUpdate = true;
      g.attributes.color.needsUpdate = true;
    }
    this.alive = alive;
  }
}

/** 부드러운 연기/광원용 스프라이트 텍스처 */
export function makeSoftTexture(kind = 'smoke') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (kind === 'smoke') {
    for (let i = 0; i < 18; i++) {
      const x = 64 + (Math.random() - 0.5) * 40;
      const y = 64 + (Math.random() - 0.5) * 40;
      const r = 22 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
  } else if (kind === 'square') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 28, 48, 72);
  } else {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
