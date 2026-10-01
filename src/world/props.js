import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { epoxyArt, esdMatArt, noiseArt } from './artwork.js';

// ---------------------------------------------------------------------------
// 공용 머티리얼
// ---------------------------------------------------------------------------
export const M = {};

export function initMaterials() {
  const std = (name, params) => {
    const m = new THREE.MeshStandardMaterial(params);
    m.name = name;
    M[name] = m;
    return m;
  };
  const noise = noiseArt([2, 2], 236, 7).texture;
  M.noiseTex = noise;
  std('epoxy', { map: epoxyArt([2, 1]).texture, roughness: 0.32, metalness: 0.0 });
  std('esd', { map: esdMatArt().texture, roughness: 0.82 });
  std('steel', { color: 0xc4cad0, roughness: 0.38, metalness: 0.75 });
  std('steelDark', { color: 0x5a6068, roughness: 0.45, metalness: 0.7 });
  std('cabinet', { color: 0xd9dee3, roughness: 0.55, metalness: 0.15, map: noise });
  std('cabinetDark', { color: 0x8b949e, roughness: 0.5, metalness: 0.2 });
  std('plasticDark', { color: 0x23262b, roughness: 0.55 });
  std('plasticMid', { color: 0x3c4148, roughness: 0.5 });
  std('plasticLight', { color: 0xd8dbdf, roughness: 0.5 });
  std('plasticWhite', { color: 0xf1f1ee, roughness: 0.45 });
  std('rubber', { color: 0x161616, roughness: 0.92 });
  std('chrome', { color: 0xe6e9ed, roughness: 0.18, metalness: 1.0 });
  std('copper', { color: 0xd08a54, roughness: 0.3, metalness: 1.0 });
  std('gold', { color: 0xe3b65c, roughness: 0.28, metalness: 1.0 });
  std('solder', { color: 0xdfe3e8, roughness: 0.12, metalness: 1.0 });
  std('lead', { color: 0xc9cdd2, roughness: 0.3, metalness: 0.9 });
  std('brass', { color: 0xc9a14a, roughness: 0.35, metalness: 1.0 });
  std('redPlastic', { color: 0xc42a2a, roughness: 0.4 });
  std('blackPlastic', { color: 0x151515, roughness: 0.42 });
  std('bluePlastic', { color: 0x2259b8, roughness: 0.4 });
  std('yellowPlastic', { color: 0xf0c419, roughness: 0.45 });
  std('greenPlastic', { color: 0x2f9a52, roughness: 0.4 });
  std('cableBlack', { color: 0x1b1c1e, roughness: 0.55 });
  std('cableRed', { color: 0xb3221f, roughness: 0.5 });
  std('cableBlue', { color: 0x1f4fae, roughness: 0.5 });
  std('cableYellow', { color: 0xd8b21e, roughness: 0.5 });
  std('cableGreen', { color: 0x1f8a46, roughness: 0.5 });
  std('cableGray', { color: 0x9aa0a6, roughness: 0.55 });
  std('screenOff', { color: 0x0b0d10, roughness: 0.15, metalness: 0.2 });
  std('fabric', { color: 0x33475e, roughness: 0.95 });
  std('paper', { color: 0xf6f5f0, roughness: 0.9 });
  std('cork', { color: 0xb88b58, roughness: 0.95 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xaecbe0, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false });
  M.glass.name = 'glass';
  M.glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

// ---------------------------------------------------------------------------
// 지오메트리 헬퍼
// ---------------------------------------------------------------------------
const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

export function place(mesh, o = {}) {
  if (o.x !== undefined || o.y !== undefined || o.z !== undefined) mesh.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.scale) mesh.scale.setScalar(o.scale);
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.receive ?? true;
  mesh.userData.static = o.static ?? false;
  if (o.name) mesh.name = o.name;
  if (o.parent) o.parent.add(mesh);
  return mesh;
}

export function box(w, h, d, mat, o = {}) {
  const geo = o.round
    ? cached(`rb${w},${h},${d},${o.round}`, () => new RoundedBoxGeometry(w, h, d, 2, o.round))
    : cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  return place(new THREE.Mesh(geo, mat), o);
}

export function cyl(rt, rb, h, mat, o = {}) {
  const seg = o.seg || 20;
  const geo = cached(`c${rt},${rb},${h},${seg},${o.open ? 1 : 0}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open));
  return place(new THREE.Mesh(geo, mat), o);
}

export function sphere(r, mat, o = {}) {
  const geo = cached(`s${r},${o.seg || 16}`, () => new THREE.SphereGeometry(r, o.seg || 16, Math.max(8, (o.seg || 16) * 0.75)));
  return place(new THREE.Mesh(geo, mat), o);
}

export function plane(w, h, mat, o = {}) {
  const geo = cached(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));
  return place(new THREE.Mesh(geo, mat), { cast: false, ...o });
}

/** 늘어진 케이블(튜브) */
export function cable(points, radius, mat, o = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const geo = new THREE.TubeGeometry(curve, o.segments || Math.max(12, points.length * 10), radius, o.radial || 7, false);
  return place(new THREE.Mesh(geo, mat), { cast: false, ...o });
}

/** 두 점 사이를 중력으로 처지게 연결하는 점 목록 */
export function sagPoints(a, b, sag = 0.1, n = 8) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(A, B, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// 장비 부품
// ---------------------------------------------------------------------------

/** 서브트리의 메시를 정적(합치기 대상)으로 표시 */
export function markStatic(...objs) {
  for (const obj of objs) {
    if (!obj) continue;
    obj.traverse((o) => {
      if (o.isMesh) o.userData.static = true;
    });
  }
  return objs[0];
}

const knobMats = new Map();
function knobMaterial(color) {
  if (!knobMats.has(color)) knobMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 }));
  return knobMats.get(color);
}
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

/** 노브: 그룹(회전축 +Z) 반환. 앞면이 +Z. 몸통+널링은 하나의 지오메트리로 합친다 */
export function makeKnob(radius = 0.014, height = 0.014, color = 0x2a2d32, opts = {}) {
  const g = new THREE.Group();
  const mat = opts.material || knobMaterial(color);
  const geo = cached(`knob${radius},${height}`, () => {
    const parts = [];
    const b = new THREE.CylinderGeometry(radius * 0.92, radius, height, 28, 1);
    b.rotateX(Math.PI / 2);
    b.translate(0, 0, height / 2);
    parts.push(b.toNonIndexed());
    for (let i = 0; i < 18; i++) {
      const r = new THREE.BoxGeometry(radius * 0.08, radius * 0.08, height * 0.85);
      r.translate(0, radius * 0.96, height / 2);
      r.rotateZ((i / 18) * Math.PI * 2);
      parts.push(r.toNonIndexed());
    }
    for (const p of parts) p.deleteAttribute('uv');
    return mergeGeometries(parts, false);
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(cached(`cap${radius}`, () => {
    const c = new THREE.CylinderGeometry(radius * 0.72, radius * 0.72, 0.002, 28);
    c.rotateX(Math.PI / 2);
    return c;
  }), opts.capMaterial || M.chrome);
  cap.position.z = height + 0.0005;
  g.add(cap);
  const line = new THREE.Mesh(cached(`kline${radius}`, () => new THREE.BoxGeometry(radius * 0.12, radius * 0.7, 0.002)), opts.lineColor ? new THREE.MeshBasicMaterial({ color: opts.lineColor }) : lineMat);
  line.position.set(0, radius * 0.45, height + 0.0012);
  g.add(line);
  g.userData.body = body;
  return g;
}

/** 사각 푸시버튼: {group, cap} */
export function makePushButton(w = 0.018, h = 0.012, color = 0x3a3f46, opts = {}) {
  const group = new THREE.Group();
  const bezel = box(w + 0.004, h + 0.004, 0.003, M.plasticDark, { z: 0.0015, cast: false, static: true });
  group.add(bezel);
  const capMat = opts.material || new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: opts.emissive || 0x000000, emissiveIntensity: 0 });
  const cap = box(w, h, 0.007, capMat, { z: 0.0045, round: 0.0015 });
  group.add(cap);
  return { group, cap, capMat };
}

/** 바나나 단자 */
export function makeJack(color) {
  const g = new THREE.Group();
  const mat = color === 'red' ? M.redPlastic : color === 'black' ? M.blackPlastic : color === 'yellow' ? M.yellowPlastic : M.greenPlastic;
  const ring = cyl(0.0075, 0.0085, 0.008, mat, { rx: Math.PI / 2, z: 0.004, static: true });
  const hole = cyl(0.0025, 0.0025, 0.0015, M.rubber, { rx: Math.PI / 2, z: 0.0085, cast: false, static: true });
  g.add(ring, hole);
  return g;
}

/** BNC 커넥터 */
export function makeBNC() {
  const g = new THREE.Group();
  g.add(cyl(0.0065, 0.0065, 0.012, M.chrome, { rx: Math.PI / 2, z: 0.006, static: true }));
  g.add(cyl(0.0042, 0.0042, 0.004, M.plasticWhite, { rx: Math.PI / 2, z: 0.0125, cast: false, static: true }));
  g.add(cyl(0.0012, 0.0012, 0.002, M.gold, { rx: Math.PI / 2, z: 0.0145, cast: false, static: true }));
  return g;
}

/** 표시 LED (작은 원형) */
export function makeIndicator(color = 0x3ddc97, r = 0.003) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0, roughness: 0.3 });
  const m = sphere(r, mat, { cast: false, seg: 12 });
  m.scale.z = 0.6;
  m.userData.setOn = (on, k = 3) => {
    mat.emissiveIntensity = on ? k : 0;
    mat.color.setHex(on ? 0x333333 : 0x222222);
  };
  return m;
}

/** 캔버스 텍스처를 붙인 화면/라벨 평면 (자체발광) */
export function screenPlane(w, h, texture, o = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: o.toneMapped ?? false, transparent: !!o.transparent });
  const m = plane(w, h, mat, { cast: false, receive: false, ...o });
  m.userData.static = false;
  return m;
}

/** 일반 라벨(조명 받는 인쇄면) */
export function printPlane(w, h, texture, o = {}) {
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: o.roughness ?? 0.7, transparent: !!o.transparent, polygonOffset: true, polygonOffsetFactor: -1 });
  return plane(w, h, mat, { cast: false, ...o });
}

/** 장비 케이스: 앞면이 +Z. group.front(로컬 z=d/2)에 앞판 부품을 붙인다 */
export function makeInstrumentCase(w, h, d, bodyColor = 0x3b4047, frontColor = 0x2a2e33) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5, metalness: 0.15 });
  const frontMat = new THREE.MeshStandardMaterial({ color: frontColor, roughness: 0.55 });
  const body = box(w, h, d, bodyMat, { y: h / 2, round: 0.006 });
  group.add(body);
  const front = box(w - 0.006, h - 0.006, 0.006, frontMat, { y: h / 2, z: d / 2 - 0.001, static: true });
  group.add(front);
  // 고무 발
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    group.add(cyl(0.008, 0.008, 0.006, M.rubber, { x: sx * (w / 2 - 0.02), y: 0.003, z: sz * (d / 2 - 0.03), cast: false, static: true }));
  }
  // 손잡이(측면 핸들 바)
  const frontAnchor = new THREE.Group();
  frontAnchor.position.set(0, 0, d / 2 + 0.002);
  group.add(frontAnchor);
  group.userData = { front: frontAnchor, body, w, h, d };
  return group;
}

export { RoundedBoxGeometry };
