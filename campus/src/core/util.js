import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const TAU = Math.PI * 2;

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const MONO = '"JetBrains Mono", "Consolas", "Menlo", monospace';
export const font = (size, weight = 500, family = FONT) => `${weight} ${size}px ${family}`;

export const C = {
  bg: '#060a14',
  panel: 'rgba(8, 14, 28, 0.94)',
  panel2: 'rgba(255, 255, 255, 0.05)',
  line: 'rgba(140, 190, 255, 0.22)',
  text: '#eaf2ff',
  muted: '#93a6c3',
  dim: '#5d6f8c',
  accent: '#38d9ff',
  ok: '#3ddc97',
  warn: '#ffb547',
  bad: '#ff5d6c',
  pink: '#ff6ec7',
  violet: '#a78bfa',
};

/** 학년별 테마 색 */
export const YEAR_COLORS = ['#38d9ff', '#3ddc97', '#ffb547', '#c084fc'];

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 한글은 글자 단위, 영문·수식은 단어 단위로 줄을 나눈다 */
export function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const tokens = para.match(/[A-Za-z0-9.,%°µΩ()[\]{}+\-−=/·:;'"!?^_*<>≤≥≈∝→←↔×÷√∫∑πθωτλΔ]+|\s+|./gu) || [''];
    let line = '';
    for (const tok of tokens) {
      const test = line + tok;
      if (ctx.measureText(test).width > maxWidth && line.trim() !== '') {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** 줄바꿈해서 그리고 사용한 높이를 돌려준다 */
export function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const lines = wrapLines(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 0.0136, 'A' → "13.6 mA" */
export function si(value, unit, digits = 3) {
  if (!Number.isFinite(value)) return `— ${unit}`;
  const abs = Math.abs(value);
  if (abs < 1e-15) return `0 ${unit}`;
  const prefixes = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of prefixes) {
    if (abs >= f * 0.9995) return `${+(value / f).toPrecision(digits)} ${p}${unit}`;
  }
  return `${+(value / 1e-12).toPrecision(digits)} p${unit}`;
}

/** 오브젝트 트리의 지오메트리/머티리얼/텍스처 해제 */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      if (m.map && !m.map.userData?.shared) m.map.dispose();
      m.dispose();
    }
  });
}

const _v = new THREE.Vector3();
export function yawOf(quat) {
  _v.set(0, 0, -1).applyQuaternion(quat);
  return Math.atan2(-_v.x, -_v.z);
}

/** 화살표 메시(원기둥 + 원뿔). 길이 1, +Y 방향. setArrow로 방향/길이 지정 */
const arrowShaft = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
arrowShaft.translate(0, 0.5, 0);
arrowShaft.userData.shared = true;
const arrowHead = new THREE.ConeGeometry(1, 1, 10);
arrowHead.translate(0, -0.5, 0);
arrowHead.userData.shared = true;

export function makeArrow(color, thickness = 0.006) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(arrowShaft, mat);
  const head = new THREE.Mesh(arrowHead, mat);
  g.add(shaft, head);
  g.userData = { shaft, head, thickness, mat };
  return g;
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
export function setArrow(arrow, from, vec, headLen = null) {
  const len = vec.length();
  const { shaft, head, thickness } = arrow.userData;
  arrow.visible = len > 1e-5;
  if (!arrow.visible) return;
  arrow.position.copy(from);
  _dir.copy(vec).divideScalar(len);
  arrow.quaternion.setFromUnitVectors(_up, _dir);
  const hl = Math.min(len * 0.45, headLen ?? thickness * 4.5);
  shaft.scale.set(thickness, Math.max(1e-4, len - hl), thickness);
  head.scale.set(thickness * 2.2, hl, thickness * 2.2);
  head.position.y = len;
}

/** 캔버스로 만든 텍스트 스프라이트(평면) */
export function makeLabel(text, { size = 0.05, color = '#eaf2ff', bg = null, weight = 700, px = 64, family = FONT } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font(px, weight, family);
  const w = Math.ceil(ctx.measureText(text).width + px * 0.6);
  const h = Math.ceil(px * 1.4);
  canvas.width = w;
  canvas.height = h;
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    if (bg) {
      ctx.fillStyle = bg;
      roundRect(ctx, 0, 0, w, h, h * 0.3);
      ctx.fill();
    }
    ctx.font = font(px, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + px * 0.04);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  draw();
  labelRegistry.add(draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((size * w) / h, size), mat);
  mesh.raycast = () => {};
  mesh.renderOrder = 3;
  mesh.userData.disposeLabel = () => labelRegistry.delete(draw);
  return mesh;
}

export const labelRegistry = new Set();
