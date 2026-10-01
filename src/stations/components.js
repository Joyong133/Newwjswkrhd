import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { M, box, cyl, sphere } from '../world/props.js';
import { font } from '../core/util.js';
import { makeGlow } from './common.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const pinCache = new Map();

// ---------------------------------------------------------------------------
// 전자 부품 모델 (실습 편의를 위해 실제보다 약 3.7배 크게)
// 원점 = 다리 끝(꽂히는 지점). 로컬 X축 = 다리가 놓인 방향.
// ---------------------------------------------------------------------------
export const PITCH = 0.0095; // 브레드보드 구멍 간격

const BAND = {
  0: '#111111', 1: '#7a4a21', 2: '#d0262b', 3: '#f08a1c', 4: '#f2d21b', 5: '#2d9a46', 6: '#2f5fd0', 7: '#7c3fc0', 8: '#8a8a8a', 9: '#f4f4f4', gold: '#c9a43a',
};
const BAND_NAME = { 0: '검정', 1: '갈색', 2: '빨강', 3: '주황', 4: '노랑', 5: '초록', 6: '파랑', 7: '보라', 8: '회색', 9: '흰색', gold: '금색' };

export function resistorBands(ohms) {
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const sig = Math.round(ohms / 10 ** exp);
  const d1 = Math.floor(sig / 10);
  const d2 = sig % 10;
  return [d1, d2, exp, 'gold'];
}

export function formatOhms(ohms) {
  if (ohms >= 1e6) return `${ohms / 1e6} MΩ`;
  if (ohms >= 1e3) return `${ohms / 1e3} kΩ`;
  return `${ohms} Ω`;
}

export function makeResistor(ohms, span = PITCH * 6) {
  const g = new THREE.Group();
  g.name = `R${ohms}`;
  const bands = resistorBands(ohms);
  const art = new CanvasArt(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#d9c9a3';
    ctx.fillRect(0, 0, w, h);
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(0,0,0,0.15)');
    grd.addColorStop(0.15, 'rgba(0,0,0,0)');
    grd.addColorStop(0.85, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    const pos = [0.2, 0.33, 0.46, 0.76];
    bands.forEach((b, i) => {
      ctx.fillStyle = BAND[b];
      ctx.fillRect(0, h * pos[i], w, h * 0.085);
    });
  }, { autoRedraw: false });
  const bodyMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.55 });
  const bodyLen = 0.027;
  const r = 0.0042;
  const lift = 0.013;
  // 몸통: 가운데가 살짝 잘록한 형태(Lathe)
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = (t - 0.5) * bodyLen;
    const bulge = Math.abs(t - 0.5) > 0.32 ? 1 : 0.86;
    const end = Math.sin(Math.min(1, Math.min(t, 1 - t) * 10) * Math.PI / 2);
    prof.push(new THREE.Vector2(Math.max(0.0006, r * bulge * end), y));
  }
  const bodyGeo = new THREE.LatheGeometry(prof, 20);
  bodyGeo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = lift;
  body.castShadow = true;
  g.add(body);
  // 다리(구부러진 ㄷ자) — 하나의 지오메트리
  const legR = 0.0007;
  const legKey = `rleg${span}`;
  if (!pinCache.has(legKey)) {
    const hz = new THREE.CylinderGeometry(legR, legR, span, 6);
    hz.rotateZ(Math.PI / 2);
    hz.translate(0, lift, 0);
    const parts = [hz];
    for (const s of [-1, 1]) {
      const v = new THREE.CylinderGeometry(legR, legR, lift, 6);
      v.translate((s * span) / 2, lift / 2, 0);
      parts.push(v);
    }
    pinCache.set(legKey, mergeGeometries(parts, false));
  }
  g.add(new THREE.Mesh(pinCache.get(legKey), M.lead));
  g.userData = {
    ohms,
    bands,
    bandText: bands.map((b) => BAND_NAME[b]).join(' · '),
    body,
  };
  return g;
}

export function makeLED(color = 0xff2a2a, { span = PITCH * 2 } = {}) {
  const g = new THREE.Group();
  g.name = 'LED';
  const lensMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.0,
    roughness: 0.15,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
  });
  const r = 0.0093;
  const legH = 0.02;
  const lensKey = `lens${span}`;
  if (!pinCache.has(lensKey)) {
    const can = new THREE.CylinderGeometry(r, r, 0.012, 24);
    can.translate(0, legH + 0.006 + 0.0015, 0);
    const dome = new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(0, legH + 0.012 + 0.0015, 0);
    // 플랜지(캐소드 쪽이 평평)
    const flangeShape = new THREE.Shape();
    const fr = r * 1.13;
    flangeShape.absarc(0, 0, fr, Math.acos(0.82), Math.PI * 2 - Math.acos(0.82), false);
    flangeShape.closePath();
    const flange = new THREE.ExtrudeGeometry(flangeShape, { depth: 0.0018, bevelEnabled: false, curveSegments: 24 });
    flange.rotateX(-Math.PI / 2);
    flange.translate(0, legH, 0);
    const parts = [can, dome, flange].map((gg) => {
      const ni = gg.index ? gg.toNonIndexed() : gg;
      for (const k of Object.keys(ni.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ni.deleteAttribute(k);
      return ni;
    });
    pinCache.set(lensKey, mergeGeometries(parts, false));
    // 다리: 애노드(-X)가 더 길다 + 내부 리드프레임
    const legR = 0.00075;
    const anode = new THREE.CylinderGeometry(legR, legR, legH + 0.007, 6);
    anode.translate(-span / 2, (legH - 0.007) / 2, 0);
    const cathode = new THREE.CylinderGeometry(legR, legR, legH, 6);
    cathode.translate(span / 2, legH / 2, 0);
    const inner = new THREE.BoxGeometry(0.004, 0.009, 0.0012);
    inner.translate((span / 2) * 0.5, legH + 0.008, 0);
    const inner2 = new THREE.BoxGeometry(0.002, 0.007, 0.0012);
    inner2.translate((-span / 2) * 0.5, legH + 0.007, 0);
    const legParts = [anode, cathode, inner, inner2].map((gg) => gg.toNonIndexed());
    pinCache.set(`${lensKey}legs`, mergeGeometries(legParts, false));
  }
  const lens = new THREE.Mesh(pinCache.get(lensKey), lensMat);
  g.add(lens);
  g.add(new THREE.Mesh(pinCache.get(`${lensKey}legs`), M.lead));
  const glow = makeGlow(color, 0.05);
  glow.position.y = legH + 0.014;
  g.add(glow);
  g.userData = { lensMat, glow, color: new THREE.Color(color), burnt: false, top: legH + 0.022 };
  return g;
}

/** LED 밝기(0~2+) 적용 */
export function setLEDBrightness(led, b) {
  const u = led.userData;
  if (u.burnt) {
    u.lensMat.emissiveIntensity = 0;
    u.glow.material.opacity = 0;
    return;
  }
  u.lensMat.emissiveIntensity = b > 0.005 ? 0.4 + b * 5 : 0;
  u.glow.material.opacity = Math.min(1, b * 0.9);
  const s = u.glow.userData.baseSize * (0.6 + Math.min(2.5, b) * 0.9);
  u.glow.scale.setScalar(s);
}

export function burnLED(led) {
  const u = led.userData;
  u.burnt = true;
  u.lensMat.color.setHex(0x2a1410);
  u.lensMat.emissive.setHex(0x000000);
  u.lensMat.emissiveIntensity = 0;
  u.lensMat.opacity = 0.95;
  u.lensMat.roughness = 0.6;
  u.glow.material.opacity = 0;
}

export function resetLED(led) {
  const u = led.userData;
  u.burnt = false;
  u.lensMat.color.copy(u.color);
  u.lensMat.emissive.copy(u.color);
  u.lensMat.opacity = 0.82;
  u.lensMat.roughness = 0.15;
  setLEDBrightness(led, 0);
}

/** DIP 14핀 IC. 원점 = 핀 끝 중앙, X축 = 핀 1→7 방향(노치는 -X 쪽) */
export function makeIC(partNo, desc, { pins = 14 } = {}) {
  const g = new THREE.Group();
  g.name = partNo;
  const n = pins / 2;
  const len = n * PITCH + 0.004;
  const w = 0.022;
  const h = 0.011;
  const legH = 0.009;
  const art = new CanvasArt(512, 192, (ctx, cw, ch) => {
    ctx.fillStyle = '#16171a';
    ctx.fillRect(0, 0, cw, ch);
    // 노치 + 1번 핀 표시 (왼쪽)
    ctx.fillStyle = '#0b0b0c';
    ctx.beginPath();
    ctx.arc(0, ch / 2, 26, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.fillStyle = '#2b2d31';
    ctx.beginPath();
    ctx.arc(48, ch - 40, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.font = font(52, 700);
    ctx.textBaseline = 'middle';
    ctx.fillText(partNo, 80, ch / 2 - 22);
    ctx.font = font(30, 500);
    ctx.fillStyle = '#b8b8b8';
    ctx.fillText(desc, 82, ch / 2 + 34);
  }, { autoRedraw: false });
  const topMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.6 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), [bodyMat, bodyMat, topMat, bodyMat, bodyMat, bodyMat]);
  body.position.y = legH + h / 2;
  body.castShadow = true;
  g.add(body);
  // 핀은 하나의 지오메트리로 합친다(드로우콜 절약)
  const key = `${n}`;
  if (!pinCache.has(key)) {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * PITCH) / 2 + i * PITCH;
      for (const s of [-1, 1]) {
        const p = new THREE.BoxGeometry(0.0018, legH + 0.002, 0.0009);
        p.translate(x, (legH + 0.002) / 2, s * (w / 2 + 0.0015));
        const pt = new THREE.BoxGeometry(0.0018, 0.0009, 0.004);
        pt.translate(x, legH + 0.002, s * (w / 2 - 0.0002));
        parts.push(p, pt);
      }
    }
    pinCache.set(key, mergeGeometries(parts, false));
  }
  const pinMesh = new THREE.Mesh(pinCache.get(key), M.lead);
  g.add(pinMesh);
  g.userData = { partNo, body, top: legH + h };
  return g;
}

/** 전선(점퍼): 두 지점 사이를 아치형으로 */
export function jumper(a, b, mat, height = 0.012, radius = 0.0011) {
  const A = a.clone();
  const B = b.clone();
  const pts = [
    A.clone().add(new THREE.Vector3(0, -0.003, 0)),
    A.clone().add(new THREE.Vector3(0, height * 0.8, 0)),
    new THREE.Vector3().lerpVectors(A, B, 0.5).add(new THREE.Vector3(0, height, 0)),
    B.clone().add(new THREE.Vector3(0, height * 0.8, 0)),
    B.clone().add(new THREE.Vector3(0, -0.003, 0)),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, 24, radius, 6, false);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

export { box, cyl, sphere };
