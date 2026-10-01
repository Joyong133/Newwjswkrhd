import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const DEG = Math.PI / 180;

export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const HAND = '"Nanum Pen Script", "Noto Sans KR", cursive';
export const MONO = '"Share Tech Mono", "Consolas", "Menlo", monospace';

export const font = (size, weight = 500, family = FONT) => `${weight} ${size}px ${family}`;

export const COLORS = {
  panel: 'rgba(9, 16, 30, 0.9)',
  panelEdge: 'rgba(110, 200, 255, 0.35)',
  text: '#e8f1ff',
  muted: '#93a7c4',
  accent: '#38d9ff',
  ok: '#3ddc97',
  warn: '#ffb547',
  bad: '#ff5d5d',
  magenta: '#ff5ec4',
};

/** 0.0136, 'A' → "13.6 mA" */
export function formatSI(value, unit, sig = 3) {
  if (!Number.isFinite(value)) return `— ${unit}`;
  const abs = Math.abs(value);
  if (abs < 1e-12) return `0 ${unit}`;
  const prefixes = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];
  for (const [f, p] of prefixes) {
    if (abs >= f * 0.9995) return `${(value / f).toPrecision(sig)} ${p}${unit}`;
  }
  return `${(value / 1e-9).toPrecision(sig)} n${unit}`;
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

/** 줄바꿈 처리된 텍스트. 반환값: 사용한 높이 */
export function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const paragraphs = String(text).split('\n');
  let cy = y;
  for (const para of paragraphs) {
    // 한글은 글자 단위, 영문은 단어 단위로 끊는다.
    const tokens = para.match(/[A-Za-z0-9.,%°µΩ()+\-=/·:'"!?]+|\s+|./gu) || [''];
    let line = '';
    for (const tok of tokens) {
      const test = line + tok;
      if (ctx.measureText(test).width > maxWidth && line.trim() !== '') {
        ctx.fillText(line.trimEnd(), x, cy);
        cy += lineHeight;
        line = tok.trimStart();
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy - y;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export function worldPos(obj, target = new THREE.Vector3()) {
  return obj.getWorldPosition(target);
}

export function worldQuat(obj, target = new THREE.Quaternion()) {
  return obj.getWorldQuaternion(target);
}

/** 오브젝트의 월드 변환을 지정한 위치/회전으로 맞춘다(부모 고려). */
export function setWorldTransform(obj, pos, quat) {
  const parent = obj.parent;
  if (!parent) {
    obj.position.copy(pos);
    obj.quaternion.copy(quat);
    return;
  }
  parent.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const m = new THREE.Matrix4().compose(pos, quat, _s.set(1, 1, 1));
  m.premultiply(inv);
  m.decompose(obj.position, obj.quaternion, _s);
}

export function yawOf(quat) {
  _v.set(0, 0, -1).applyQuaternion(quat);
  return Math.atan2(-_v.x, -_v.z);
}

export function quatFromYaw(yaw, target = new THREE.Quaternion()) {
  return target.setFromAxisAngle(_v.set(0, 1, 0), yaw);
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export { _q as tmpQuat };
