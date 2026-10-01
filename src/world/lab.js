import * as THREE from 'three';
import { M, box, cyl, plane, sphere, printPlane, screenPlane, cable, sagPoints } from './props.js';
import {
  floorArt, noiseArt, ceilingArt, woodArt, whiteboardArt, colorCodePosterArt, safetyPosterArt, bulletinArt,
  nightCityArt, rainArt, clockFaceArt, exitSignArt, roomSignArt, schematicScreenArt, reportScreenArt, canLabelArt, bookSpineArt,
} from './artwork.js';
import { rand, seeded } from '../core/util.js';

export const ROOM = { minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5, h: 3.0 };

export const LAYOUT = {
  benchA: { x: -3.5, z: -4.1, yaw: 0 },
  benchB: { x: 0, z: -4.1, yaw: 0 },
  benchC: { x: 3.5, z: -4.1, yaw: 0 },
  benchD: { x: 5.6, z: -0.4, yaw: -Math.PI / 2 },
  ta: { x: -3.2, z: 4.12, yaw: Math.PI },
  start: { x: 0, z: 2.6, yaw: 0 },
};

export const BENCH = { W: 2.4, D: 0.8, H: 0.92, shelfLift: 0.32 };

/** 실험대 앞 사용자가 설 위치(월드) */
export function standPoint(spec, dist = 0.74) {
  return {
    pos: new THREE.Vector3(spec.x + Math.sin(spec.yaw) * dist, 0, spec.z + Math.cos(spec.yaw) * dist),
    yaw: spec.yaw,
  };
}

/**
 * 실험실 전체를 만든다.
 * ctx: { scene, interaction, locomotion }
 */
export function buildLab({ scene, interaction, locomotion }) {
  const root = new THREE.Group();
  root.name = 'lab';
  scene.add(root);
  const S = { static: true };
  const refs = { root, benches: {} };

  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxy = (w, h, d, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.updateMatrixWorld(true);
    scene.add(m);
    interaction.addBlocker(m);
    return m;
  };

  // ----------------------------------------------------------------------
  // 바닥 / 천장 / 벽
  // ----------------------------------------------------------------------
  const floorMat = new THREE.MeshStandardMaterial({ map: floorArt([5, 3.75]).texture, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.8 });
  const floor = plane(12, 9, floorMat, { rx: -Math.PI / 2, receive: true, ...S, parent: root });
  floor.name = 'floor';
  proxy(12, 0.02, 9, 0, -0.01, 0);

  const ceilTex = ceilingArt([10, 7.5]).texture;
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 });
  plane(12, 9, ceilMat, { rx: Math.PI / 2, y: ROOM.h, receive: false, ...S, parent: root });

  const wallTex = noiseArt([4, 2], 240, 17).texture;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xedeae3, map: wallTex, roughness: 0.92 });
  const lowerMat = new THREE.MeshStandardMaterial({ color: 0xa9c8b9, map: wallTex, roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x6f7c84, roughness: 0.5 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.6 });
  const T = 0.15;

  // 북쪽 벽(창문)
  const windows = [[-5, -2], [-1.5, 1.5], [2, 5]];
  const winY0 = 1.45;
  const winY1 = 2.65;
  box(12, winY0, T, wallMat, { x: 0, y: winY0 / 2, z: ROOM.minZ - T / 2, ...S, parent: root });
  box(12, ROOM.h - winY1, T, wallMat, { x: 0, y: (ROOM.h + winY1) / 2, z: ROOM.minZ - T / 2, ...S, parent: root });
  const pillars = [[-6, -5], [-2, -1.5], [1.5, 2], [5, 6]];
  for (const [a, b] of pillars) {
    box(b - a, winY1 - winY0, T, wallMat, { x: (a + b) / 2, y: (winY0 + winY1) / 2, z: ROOM.minZ - T / 2, ...S, parent: root });
  }
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.35, metalness: 0.7 });
  const cityArt = nightCityArt();
  const cityMat = new THREE.MeshBasicMaterial({ map: cityArt.texture, toneMapped: false, color: 0xb0b0b0 });
  refs.cityMat = cityMat;
  const city = plane(18, 6.2, cityMat, { x: 0, y: 1.9, z: -9, cast: false, receive: false, parent: root });
  city.raycast = () => {};
  // 창밖 비 (스크롤되는 빗줄기)
  const rain = rainArt();
  refs.rainTex = rain.texture;
  const rainMat = new THREE.MeshBasicMaterial({ map: rain.texture, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  refs.rainMat = rainMat;
  for (const [a, b] of windows) {
    const cx = (a + b) / 2;
    const w = b - a;
    const glass = plane(w, winY1 - winY0, M.glass, { x: cx, y: (winY0 + winY1) / 2, z: ROOM.minZ - 0.06, cast: false, parent: root });
    glass.renderOrder = 3;
    const rp = plane(w, winY1 - winY0, rainMat, { x: cx, y: (winY0 + winY1) / 2, z: ROOM.minZ - 0.07, cast: false, parent: root });
    rp.renderOrder = 2;
    // 창틀
    box(w, 0.05, 0.08, frameMat, { x: cx, y: winY0 + 0.025, z: ROOM.minZ - 0.04, ...S, parent: root });
    box(w, 0.05, 0.08, frameMat, { x: cx, y: winY1 - 0.025, z: ROOM.minZ - 0.04, ...S, parent: root });
    box(0.05, winY1 - winY0, 0.08, frameMat, { x: a + 0.025, y: (winY0 + winY1) / 2, z: ROOM.minZ - 0.04, ...S, parent: root });
    box(0.05, winY1 - winY0, 0.08, frameMat, { x: b - 0.025, y: (winY0 + winY1) / 2, z: ROOM.minZ - 0.04, ...S, parent: root });
    box(0.04, winY1 - winY0, 0.06, frameMat, { x: cx, y: (winY0 + winY1) / 2, z: ROOM.minZ - 0.04, ...S, parent: root });
    // 창턱
    box(w + 0.1, 0.03, 0.18, M.plasticLight, { x: cx, y: winY0 - 0.01, z: ROOM.minZ + 0.04, ...S, parent: root });
  }
  // 반쯤 내린 블라인드 (가운데 창)
  const blindMat = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    box(2.9, 0.003, 0.05, blindMat, { x: 3.5, y: winY1 - 0.06 - i * 0.045, z: ROOM.minZ + 0.05, rx: 0.5, ...S, parent: root });
  }
  box(3.0, 0.05, 0.06, frameMat, { x: 3.5, y: winY1 - 0.02, z: ROOM.minZ + 0.05, ...S, parent: root });

  // 나머지 벽
  box(12, ROOM.h, T, wallMat, { x: 0, y: ROOM.h / 2, z: ROOM.maxZ + T / 2, ...S, parent: root });
  box(T, ROOM.h, 9, wallMat, { x: ROOM.minX - T / 2, y: ROOM.h / 2, z: 0, ...S, parent: root });
  box(T, ROOM.h, 9, wallMat, { x: ROOM.maxX + T / 2, y: ROOM.h / 2, z: 0, ...S, parent: root });
  proxy(12, ROOM.h, 0.1, 0, ROOM.h / 2, ROOM.maxZ + 0.05);
  proxy(0.1, ROOM.h, 9, ROOM.minX - 0.05, ROOM.h / 2, 0);
  proxy(0.1, ROOM.h, 9, ROOM.maxX + 0.05, ROOM.h / 2, 0);
  proxy(12, winY0, 0.1, 0, winY0 / 2, ROOM.minZ - 0.05);

  // 하단 페인트 + 몰딩 + 걸레받이
  const wain = 1.05;
  box(12, wain, 0.01, lowerMat, { x: 0, y: wain / 2, z: ROOM.maxZ - 0.005, ...S, parent: root });
  box(0.01, wain, 9, lowerMat, { x: ROOM.minX + 0.005, y: wain / 2, z: 0, ...S, parent: root });
  box(0.01, wain, 9, lowerMat, { x: ROOM.maxX - 0.005, y: wain / 2, z: 0, ...S, parent: root });
  box(12, wain, 0.01, lowerMat, { x: 0, y: wain / 2, z: ROOM.minZ + 0.005, ...S, parent: root });
  box(12, 0.03, 0.025, trimMat, { x: 0, y: wain, z: ROOM.maxZ - 0.012, ...S, parent: root });
  box(0.025, 0.03, 9, trimMat, { x: ROOM.minX + 0.012, y: wain, z: 0, ...S, parent: root });
  box(0.025, 0.03, 9, trimMat, { x: ROOM.maxX - 0.012, y: wain, z: 0, ...S, parent: root });
  box(12, 0.1, 0.02, baseMat, { x: 0, y: 0.05, z: ROOM.maxZ - 0.01, ...S, parent: root });
  box(12, 0.1, 0.02, baseMat, { x: 0, y: 0.05, z: ROOM.minZ + 0.01, ...S, parent: root });
  box(0.02, 0.1, 9, baseMat, { x: ROOM.minX + 0.01, y: 0.05, z: 0, ...S, parent: root });
  box(0.02, 0.1, 9, baseMat, { x: ROOM.maxX - 0.01, y: 0.05, z: 0, ...S, parent: root });

  // 벽 콘센트
  const outletPlate = M.plasticWhite;
  for (const [x, z, ry] of [[-5.99, 1.8, Math.PI / 2], [-5.99, -1.8, Math.PI / 2], [5.99, 1.4, -Math.PI / 2], [2.2, 4.49, Math.PI], [-1.2, 4.49, Math.PI]]) {
    const g = new THREE.Group();
    g.position.set(x, 0.32, z);
    g.rotation.y = ry;
    g.add(box(0.08, 0.12, 0.01, outletPlate, { ...S }));
    g.add(box(0.012, 0.02, 0.004, M.plasticDark, { x: -0.015, z: 0.006, ...S }));
    g.add(box(0.012, 0.02, 0.004, M.plasticDark, { x: 0.015, z: 0.006, ...S }));
    root.add(g);
  }

  // ----------------------------------------------------------------------
  // 천장 조명
  // ----------------------------------------------------------------------
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e8, emissiveIntensity: 2.4, roughness: 0.6 });
  const flickerMat = panelMat.clone();
  refs.flickerMat = flickerMat;
  const lightFrame = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.4, metalness: 0.3 });
  refs.lightPanels = [];
  for (const x of [-3.6, 0, 3.6]) {
    for (const z of [-2.8, 0.1, 2.9]) {
      const flick = x === 3.6 && z === 2.9;
      box(1.24, 0.03, 0.64, lightFrame, { x, y: ROOM.h - 0.012, z, cast: false, ...S, parent: root });
      const p = box(1.18, 0.012, 0.58, flick ? flickerMat : panelMat, { x, y: ROOM.h - 0.03, z, cast: false, receive: false, static: !flick, parent: root });
      refs.lightPanels.push(p);
    }
  }
  refs.flickerPanelPos = new THREE.Vector3(3.6, ROOM.h - 0.1, 2.9);
  // 환기구 / 스프링클러
  for (const [x, z] of [[-1.8, -1.4], [1.8, 1.5], [-4.8, 1.5]]) {
    box(0.5, 0.02, 0.5, lightFrame, { x, y: ROOM.h - 0.01, z, cast: false, ...S, parent: root });
    for (let i = 0; i < 6; i++) box(0.44, 0.012, 0.012, M.steelDark, { x, y: ROOM.h - 0.024, z: z - 0.2 + i * 0.08, cast: false, ...S, parent: root });
  }
  for (const [x, z] of [[-1.8, 1.5], [1.8, -1.4], [-4.8, -1.4], [4.8, 0.1]]) {
    cyl(0.012, 0.02, 0.04, M.chrome, { x, y: ROOM.h - 0.02, z, cast: false, ...S, parent: root });
    cyl(0.03, 0.03, 0.004, M.chrome, { x, y: ROOM.h - 0.045, z, cast: false, ...S, parent: root });
  }

  // ----------------------------------------------------------------------
  // 실험대
  // ----------------------------------------------------------------------
  for (const key of ['benchA', 'benchB', 'benchC', 'benchD']) {
    refs.benches[key] = buildBench(root, LAYOUT[key], { interaction, locomotion, proxy, drawerSide: key === 'benchD' ? 1 : -1 });
  }

  // ----------------------------------------------------------------------
  // 가운데 아일랜드 테이블(컴퓨터석)
  // ----------------------------------------------------------------------
  buildIsland(root, { interaction, locomotion, proxy });

  // ----------------------------------------------------------------------
  // 서쪽 벽: 화이트보드, 게시판, 포스터
  // ----------------------------------------------------------------------
  const wb = whiteboardArt();
  const wbMat = new THREE.MeshStandardMaterial({ map: wb.texture, roughness: 0.22, metalness: 0.0, envMapIntensity: 0.9 });
  const wbGroup = new THREE.Group();
  wbGroup.position.set(ROOM.minX + 0.02, 1.58, 0);
  wbGroup.rotation.y = Math.PI / 2;
  root.add(wbGroup);
  box(3.3, 1.32, 0.02, wbMat, { z: 0.012, ...S, parent: wbGroup });
  const wbFrame = frameMat;
  box(3.36, 0.035, 0.035, wbFrame, { y: 0.675, z: 0.02, ...S, parent: wbGroup });
  box(3.36, 0.035, 0.035, wbFrame, { y: -0.675, z: 0.02, ...S, parent: wbGroup });
  box(0.035, 1.38, 0.035, wbFrame, { x: -1.68, z: 0.02, ...S, parent: wbGroup });
  box(0.035, 1.38, 0.035, wbFrame, { x: 1.68, z: 0.02, ...S, parent: wbGroup });
  box(1.2, 0.02, 0.08, wbFrame, { y: -0.7, z: 0.06, ...S, parent: wbGroup });
  [[0x1f4fb5, -0.4], [0xc8262b, -0.3], [0x23262b, -0.2], [0x1d7a46, 0.1]].forEach(([c, x]) => {
    const mk = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
    cyl(0.009, 0.009, 0.13, mk, { x, y: -0.68, z: 0.07, rz: Math.PI / 2, ...S, parent: wbGroup });
  });
  box(0.14, 0.035, 0.05, M.plasticDark, { x: 0.35, y: -0.67, z: 0.07, ...S, parent: wbGroup });
  box(0.14, 0.012, 0.05, new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 1 }), { x: 0.35, y: -0.69, z: 0.07, ...S, parent: wbGroup });
  proxy(0.08, 1.4, 3.4, ROOM.minX + 0.04, 1.58, 0);

  // 실 표지판
  const sign = roomSignArt();
  printPlane(0.9, 0.225, sign.texture, { x: ROOM.minX + 0.012, y: 2.55, z: 0, ry: Math.PI / 2, roughness: 0.4, ...S, parent: root });

  // 게시판
  const bul = bulletinArt();
  const bulMat = new THREE.MeshStandardMaterial({ map: bul.texture, roughness: 0.92 });
  box(0.025, 1.0, 1.5, M.steelDark, { x: ROOM.minX + 0.012, y: 1.62, z: -2.95, ...S, parent: root });
  plane(1.46, 0.97, bulMat, { x: ROOM.minX + 0.027, y: 1.62, z: -2.95, ry: Math.PI / 2, ...S, parent: root });

  // 포스터
  printPlane(0.6, 0.8, colorCodePosterArt().texture, { x: ROOM.minX + 0.012, y: 1.6, z: 2.35, ry: Math.PI / 2, roughness: 0.55, ...S, parent: root });
  printPlane(0.6, 0.8, safetyPosterArt().texture, { x: ROOM.maxX - 0.012, y: 1.6, z: 1.7, ry: -Math.PI / 2, roughness: 0.55, ...S, parent: root });

  // ----------------------------------------------------------------------
  // 동쪽 벽: 문, 비상구, 소화기
  // ----------------------------------------------------------------------
  const doorTex = woodArt([1, 2], [150, 106, 66]).texture;
  const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6 });
  const doorG = new THREE.Group();
  doorG.position.set(ROOM.maxX - 0.03, 0, 3.3);
  doorG.rotation.y = -Math.PI / 2;
  root.add(doorG);
  box(1.12, 2.18, 0.05, trimMat, { y: 1.09, ...S, parent: doorG });
  box(1.0, 2.1, 0.05, doorMat, { y: 1.05, z: 0.02, ...S, parent: doorG });
  box(0.18, 0.9, 0.01, M.glass, { x: 0.25, y: 1.45, z: 0.046, static: false, parent: doorG });
  box(0.16, 0.88, 0.005, new THREE.MeshBasicMaterial({ color: 0x0c1220 }), { x: 0.25, y: 1.45, z: 0.043, ...S, parent: doorG });
  cyl(0.012, 0.012, 0.13, M.chrome, { x: -0.38, y: 1.0, z: 0.09, rz: Math.PI / 2, ...S, parent: doorG });
  cyl(0.02, 0.02, 0.05, M.chrome, { x: -0.44, y: 1.0, z: 0.06, rx: Math.PI / 2, ...S, parent: doorG });
  box(0.08, 0.2, 0.012, M.chrome, { x: -0.44, y: 1.0, z: 0.05, ...S, parent: doorG });
  const exit = exitSignArt();
  const exitBox = box(0.42, 0.16, 0.06, M.plasticWhite, { x: 0, y: 2.38, z: 0.03, ...S, parent: doorG });
  screenPlane(0.4, 0.15, exit.texture, { x: 0, y: 2.38, z: 0.062, parent: doorG });
  void exitBox;
  // 소화기
  const fire = new THREE.Group();
  fire.position.set(ROOM.maxX - 0.15, 0, 2.45);
  root.add(fire);
  cyl(0.075, 0.075, 0.48, new THREE.MeshStandardMaterial({ color: 0xc61f1f, roughness: 0.35, metalness: 0.2 }), { y: 0.26, ...S, parent: fire });
  sphere(0.075, new THREE.MeshStandardMaterial({ color: 0xc61f1f, roughness: 0.35, metalness: 0.2 }), { y: 0.5, ...S, parent: fire });
  cyl(0.02, 0.025, 0.06, M.blackPlastic, { y: 0.58, ...S, parent: fire });
  box(0.1, 0.012, 0.025, M.blackPlastic, { y: 0.62, x: 0.03, ...S, parent: fire });
  box(0.09, 0.11, 0.003, M.paper, { y: 0.28, z: 0.075, ...S, parent: fire });

  // ----------------------------------------------------------------------
  // 남쪽 벽: 조교석, 책장, 시계
  // ----------------------------------------------------------------------
  refs.ta = buildTADesk(root, LAYOUT.ta, { interaction, locomotion, proxy });
  buildBookshelf(root, { x: 1.6, z: ROOM.maxZ - 0.2 }, { interaction, locomotion, proxy });

  const clock = new THREE.Group();
  clock.position.set(-0.4, 2.45, ROOM.maxZ - 0.03);
  clock.rotation.y = Math.PI;
  root.add(clock);
  const faceMat = new THREE.MeshStandardMaterial({ map: clockFaceArt().texture, roughness: 0.4 });
  const rim = cyl(0.19, 0.19, 0.045, M.plasticDark, { rx: Math.PI / 2, z: 0.0, ...S, parent: clock });
  void rim;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.175, 48), faceMat);
  face.position.z = 0.0235;
  face.userData.static = true;
  clock.add(face);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
  const mkHand = (len, w, mat = handMat) => {
    const g = new THREE.Group();
    const m = box(w, len, 0.003, mat, { y: len / 2 - 0.015, cast: false });
    g.add(m);
    g.position.z = 0.03;
    clock.add(g);
    return g;
  };
  refs.clock = {
    hour: mkHand(0.09, 0.012),
    minute: mkHand(0.135, 0.008),
    second: mkHand(0.15, 0.003, new THREE.MeshStandardMaterial({ color: 0xc8262b })),
    group: clock,
  };
  cyl(0.008, 0.008, 0.01, M.blackPlastic, { rx: Math.PI / 2, z: 0.034, parent: clock });

  // 쓰레기통
  const bin = cyl(0.17, 0.14, 0.42, new THREE.MeshStandardMaterial({ color: 0x5c6f7d, roughness: 0.6 }), { x: -1.9, y: 0.21, z: 4.15, ...S, parent: root });
  void bin;

  // ----------------------------------------------------------------------
  // 조명
  // ----------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xfff7ec, 0x5b5248, 1.25);
  scene.add(hemi);
  refs.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xfff3e2, 1.55);
  sun.position.set(1.5, 9, 2.5);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6.5;
  sun.shadow.camera.right = 6.5;
  sun.shadow.camera.top = 5;
  sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 4;
  sun.shadow.camera.far = 12;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  refs.sun = sun;

  return refs;
}

// ---------------------------------------------------------------------------
// 실험대
// ---------------------------------------------------------------------------
export function buildBench(root, spec, { interaction, locomotion, proxy, drawerSide = -1 }) {
  const { W, D, H, shelfLift } = BENCH;
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.yaw;
  root.add(g);
  const S = { static: true };

  box(W, 0.04, D, M.epoxy, { y: H - 0.02, ...S, parent: g });
  box(W, 0.012, 0.02, M.plasticDark, { y: H - 0.03, z: D / 2 + 0.006, ...S, parent: g });
  box(1.36, 0.004, 0.56, M.esd, { y: H + 0.002, z: 0.08, ...S, parent: g });

  // 다리와 프레임
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(0.045, H - 0.04, 0.045, M.steel, { x: sx * (W / 2 - 0.06), y: (H - 0.04) / 2, z: sz * (D / 2 - 0.06), ...S, parent: g });
    }
    box(0.03, 0.03, D - 0.12, M.steel, { x: sx * (W / 2 - 0.06), y: 0.12, z: 0, ...S, parent: g });
  }
  box(W - 0.12, 0.03, 0.03, M.steel, { y: 0.12, z: -(D / 2 - 0.06), ...S, parent: g });
  box(W - 0.1, 0.06, 0.03, M.steel, { y: H - 0.07, z: -(D / 2 - 0.06), ...S, parent: g });

  // 서랍장
  const cx = drawerSide * (W / 2 - 0.36);
  box(0.58, H - 0.1, D - 0.1, M.cabinet, { x: cx, y: (H - 0.1) / 2 + 0.03, z: 0, ...S, parent: g });
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + i * 0.25;
    box(0.54, 0.22, 0.012, M.cabinet, { x: cx, y, z: (D - 0.1) / 2 + 0.006, ...S, parent: g });
    box(0.16, 0.014, 0.02, M.chrome, { x: cx, y: y + 0.06, z: (D - 0.1) / 2 + 0.02, ...S, parent: g });
    box(0.08, 0.03, 0.002, M.paper, { x: cx - 0.18, y: y + 0.06, z: (D - 0.1) / 2 + 0.013, ...S, parent: g });
  }

  // 장비 선반
  const shelfY = H + shelfLift;
  for (const sx of [-1, 1]) box(0.04, shelfLift + 0.32, 0.04, M.steel, { x: sx * (W / 2 - 0.04), y: H + (shelfLift + 0.32) / 2, z: -D / 2 + 0.04, ...S, parent: g });
  box(W - 0.02, 0.025, 0.3, M.cabinet, { y: shelfY - 0.0125, z: -D / 2 + 0.16, ...S, parent: g });
  box(W - 0.02, 0.05, 0.01, M.cabinetDark, { y: shelfY - 0.03, z: -D / 2 + 0.31, ...S, parent: g });
  box(W - 0.02, shelfLift + 0.32, 0.012, M.cabinetDark, { y: H + (shelfLift + 0.32) / 2, z: -D / 2 + 0.006, ...S, parent: g });

  // 멀티탭(선반 아래)
  const strip = new THREE.Group();
  strip.position.set(0, shelfY - 0.06, -D / 2 + 0.29);
  g.add(strip);
  box(1.4, 0.05, 0.05, M.plasticWhite, { ...S, parent: strip });
  const switchMat = new THREE.MeshStandardMaterial({ color: 0x441111, emissive: 0xff2a1a, emissiveIntensity: 1.4 });
  for (let i = 0; i < 5; i++) {
    const x = -0.55 + i * 0.25;
    box(0.04, 0.03, 0.004, M.plasticLight, { x, z: 0.026, ...S, parent: strip });
    box(0.008, 0.012, 0.004, M.plasticDark, { x: x - 0.01, z: 0.028, ...S, parent: strip });
    box(0.008, 0.012, 0.004, M.plasticDark, { x: x + 0.01, z: 0.028, ...S, parent: strip });
    box(0.016, 0.01, 0.006, switchMat, { x: x + 0.09, z: 0.027, ...S, parent: strip });
  }

  // 의자(스툴)
  const stool = new THREE.Group();
  stool.position.set(drawerSide * 0.9, 0, D / 2 + 0.55);
  g.add(stool);
  buildStool(stool);

  g.updateMatrixWorld(true);
  // 지지면/차단면/장애물 등록(월드 좌표)
  const worldBox = (w, h, d, x, y, z) => {
    const b = new THREE.Box3(new THREE.Vector3(-w / 2, -h / 2, -d / 2), new THREE.Vector3(w / 2, h / 2, d / 2));
    const m = new THREE.Matrix4().makeRotationY(spec.yaw).setPosition(new THREE.Vector3(spec.x, 0, spec.z).add(new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw)));
    return b.applyMatrix4(m);
  };
  const top = worldBox(W, 0.05, D, 0, H - 0.02, 0);
  top.max.y = H + 0.004;
  interaction.addSupportFromBox(top);
  const shelf = worldBox(W, 0.025, 0.3, 0, shelfY - 0.0125, -D / 2 + 0.16);
  interaction.addSupportFromBox(shelf);
  locomotion.addObstacle(worldBox(W, 1, D, 0, 0.5, 0));
  const off = new THREE.Vector3(0, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw);
  proxy(W, 0.05, D, spec.x + off.x, H - 0.02, spec.z + off.z, spec.yaw);
  const so = new THREE.Vector3(0, 0, -D / 2 + 0.16).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw);
  proxy(W, 0.025, 0.3, spec.x + so.x, shelfY - 0.0125, spec.z + so.z, spec.yaw);
  const bo = new THREE.Vector3(0, 0, -D / 2 + 0.006).applyAxisAngle(new THREE.Vector3(0, 1, 0), spec.yaw);
  proxy(W, shelfLift + 0.32, 0.012, spec.x + bo.x, H + (shelfLift + 0.32) / 2, spec.z + bo.z, spec.yaw);

  g.userData = { topY: H + 0.004, shelfY, W, D };
  return g;
}

function buildStool(g) {
  const S = { static: true };
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.7 });
  cyl(0.18, 0.17, 0.06, seatMat, { y: 0.66, seg: 24, ...S, parent: g });
  cyl(0.025, 0.025, 0.55, M.chrome, { y: 0.37, ...S, parent: g });
  cyl(0.13, 0.13, 0.015, M.chrome, { y: 0.32, seg: 24, open: true, ...S, parent: g });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(0.26, 0.025, 0.035, M.plasticDark, { x: Math.cos(a) * 0.13, y: 0.06, z: Math.sin(a) * 0.13, ry: -a, ...S, parent: g });
    sphere(0.022, M.blackPlastic, { x: Math.cos(a) * 0.26, y: 0.022, z: Math.sin(a) * 0.26, ...S, parent: g });
  }
}

// ---------------------------------------------------------------------------
// 가운데 컴퓨터 아일랜드
// ---------------------------------------------------------------------------
function buildIsland(root, { interaction, locomotion, proxy }) {
  const S = { static: true };
  const g = new THREE.Group();
  g.position.set(0, 0, 0.35);
  root.add(g);
  const W = 3.6;
  const D = 1.4;
  const H = 0.76;
  const topMat = new THREE.MeshStandardMaterial({ map: woodArt([2, 1], [196, 170, 136]).texture, roughness: 0.55 });
  box(W, 0.035, D, topMat, { y: H - 0.0175, ...S, parent: g });
  box(W - 0.2, H - 0.06, 0.04, M.cabinet, { y: (H - 0.06) / 2, ...S, parent: g });
  for (const sx of [-1, 1]) box(0.05, H - 0.035, D - 0.1, M.cabinet, { x: sx * (W / 2 - 0.06), y: (H - 0.035) / 2, ...S, parent: g });
  // 칸막이
  box(W - 0.1, 0.3, 0.02, new THREE.MeshStandardMaterial({ color: 0x8fa1ad, roughness: 0.8 }), { y: H + 0.15, ...S, parent: g });

  const schem = schematicScreenArt();
  const report = reportScreenArt();
  const monitor = (x, z, ry, tex) => {
    const m = new THREE.Group();
    m.position.set(x, H, z);
    m.rotation.y = ry;
    g.add(m);
    box(0.22, 0.012, 0.16, M.plasticDark, { y: 0.006, ...S, parent: m });
    box(0.04, 0.26, 0.03, M.plasticDark, { y: 0.14, z: -0.04, ...S, parent: m });
    box(0.58, 0.36, 0.035, M.plasticDark, { y: 0.39, z: -0.02, round: 0.008, ...S, parent: m });
    screenPlane(0.55, 0.33, tex, { y: 0.39, z: -0.001, parent: m });
    // 키보드 / 마우스
    box(0.42, 0.018, 0.14, M.plasticDark, { y: 0.009, z: 0.26, ...S, parent: m });
    box(0.4, 0.004, 0.12, M.plasticMid, { y: 0.02, z: 0.26, ...S, parent: m });
    box(0.06, 0.025, 0.1, M.plasticDark, { x: 0.3, y: 0.012, z: 0.27, round: 0.01, ...S, parent: m });
  };
  monitor(-0.9, 0.12, 0, schem.texture);
  monitor(0.9, 0.12, 0, schem.texture);
  monitor(-0.9, -0.12, Math.PI, schem.texture);
  // 노트북(보고서 작성 중)
  const lap = new THREE.Group();
  lap.position.set(0.95, H, -0.32);
  lap.rotation.y = Math.PI + 0.15;
  g.add(lap);
  box(0.34, 0.014, 0.23, new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.6 }), { y: 0.007, ...S, parent: lap });
  const lid = new THREE.Group();
  lid.position.set(0, 0.014, -0.115);
  lid.rotation.x = -0.32;
  lap.add(lid);
  box(0.34, 0.22, 0.008, new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.35, metalness: 0.6 }), { y: 0.11, z: -0.004, ...S, parent: lid });
  screenPlane(0.31, 0.19, report.texture, { y: 0.11, z: 0.0005, parent: lid });

  // 책, 계산기, 에너지드링크, 컵
  const books = [['회로이론', '#20406e'], ['전자기학', '#7a2230'], ['신호 및 시스템', '#1f6b4c'], ['디지털 논리회로', '#5d3f8c']];
  const rng = seeded(5);
  books.forEach(([title, col], i) => {
    const art = bookSpineArt([[title, col, '#ffffff']]);
    const coverMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
    const pageMat = M.paper;
    const b = new THREE.Group();
    b.position.set(-0.15 + rng() * 0.04, H + 0.018 + i * 0.036, 0.42 + rng() * 0.03);
    b.rotation.y = (rng() - 0.5) * 0.3;
    g.add(b);
    box(0.19, 0.034, 0.26, coverMat, { ...S, parent: b });
    box(0.185, 0.028, 0.004, pageMat, { z: 0.129, ...S, parent: b });
    box(0.004, 0.028, 0.25, pageMat, { x: 0.094, ...S, parent: b });
    printPlane(0.26, 0.034, art.texture, { x: -0.0955, ry: -Math.PI / 2, rz: 0, ...S, parent: b });
  });
  const calc = new THREE.Group();
  calc.position.set(0.25, H + 0.008, 0.45);
  calc.rotation.y = -0.4;
  g.add(calc);
  box(0.085, 0.016, 0.16, new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.4 }), { ...S, parent: calc });
  box(0.065, 0.002, 0.03, new THREE.MeshStandardMaterial({ color: 0x9fb39a, roughness: 0.3 }), { y: 0.009, z: -0.05, ...S, parent: calc });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) box(0.01, 0.003, 0.008, M.plasticLight, { x: -0.028 + c * 0.014, y: 0.009, z: -0.015 + r * 0.014, ...S, parent: calc });

  const canArt = canLabelArt('VOLT UP', '#11151c', '#1b6dd8');
  const canMat = new THREE.MeshStandardMaterial({ map: canArt.texture, roughness: 0.25, metalness: 0.6 });
  [[0.42, 0.38], [0.5, 0.31], [-1.55, -0.4]].forEach(([x, z], i) => {
    cyl(0.033, 0.033, 0.12, canMat, { x, y: H + 0.06, z, ry: i, ...S, parent: g });
    cyl(0.03, 0.033, 0.006, M.chrome, { x, y: H + 0.123, z, ...S, parent: g });
  });
  // 종이컵 커피
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 });
  cyl(0.042, 0.03, 0.095, cupMat, { x: -0.55, y: H + 0.048, z: 0.47, open: true, ...S, parent: g });
  cyl(0.04, 0.04, 0.002, new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.2 }), { x: -0.55, y: H + 0.085, z: 0.47, ...S, parent: g });
  // 백팩
  const bag = new THREE.Group();
  bag.position.set(1.45, 0, 1.05);
  g.add(bag);
  box(0.32, 0.42, 0.18, new THREE.MeshStandardMaterial({ color: 0x2e3a4c, roughness: 0.92 }), { y: 0.21, round: 0.05, ...S, parent: bag });
  box(0.26, 0.18, 0.06, new THREE.MeshStandardMaterial({ color: 0x24303f, roughness: 0.92 }), { y: 0.14, z: 0.1, round: 0.025, ...S, parent: bag });

  // 스툴
  for (const [x, z] of [[-0.9, 0.95], [0.9, 0.95], [-0.9, -0.95], [0.6, -0.95]]) {
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    g.add(s);
    buildStool(s);
  }

  g.updateMatrixWorld(true);
  interaction.addSupport(-W / 2, W / 2, 0.35 - D / 2, 0.35 + D / 2, H);
  locomotion.addObstacle(new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0.35 - D / 2), new THREE.Vector3(W / 2, 1, 0.35 + D / 2)));
  proxy(W, 0.04, D, 0, H - 0.02, 0.35);
  proxy(W, 0.3, 0.03, 0, H + 0.15, 0.35);
}

// ---------------------------------------------------------------------------
// 조교석
// ---------------------------------------------------------------------------
function buildTADesk(root, spec, { interaction, locomotion, proxy }) {
  const S = { static: true };
  const g = new THREE.Group();
  g.position.set(spec.x, 0, spec.z);
  g.rotation.y = spec.yaw;
  root.add(g);
  const W = 1.8;
  const D = 0.75;
  const H = 0.76;
  const topMat = new THREE.MeshStandardMaterial({ map: woodArt([2, 1], [120, 84, 56]).texture, roughness: 0.5 });
  box(W, 0.035, D, topMat, { y: H - 0.0175, ...S, parent: g });
  box(W - 0.04, H - 0.04, 0.02, topMat, { y: (H - 0.04) / 2, z: D / 2 - 0.05, ...S, parent: g });
  for (const sx of [-1, 1]) box(0.03, H - 0.035, D - 0.04, topMat, { x: sx * (W / 2 - 0.015), y: (H - 0.035) / 2, ...S, parent: g });
  // 명패
  const plate = new THREE.Group();
  plate.position.set(-0.35, H, 0.3);
  g.add(plate);
  box(0.24, 0.06, 0.03, M.plasticDark, { y: 0.03, rx: -0.3, ...S, parent: plate });

  // 모니터
  const mon = new THREE.Group();
  mon.position.set(0.1, H, -0.15);
  g.add(mon);
  box(0.22, 0.012, 0.16, M.plasticDark, { y: 0.006, ...S, parent: mon });
  box(0.04, 0.26, 0.03, M.plasticDark, { y: 0.14, z: -0.04, ...S, parent: mon });
  box(0.58, 0.36, 0.035, M.plasticDark, { y: 0.39, z: -0.02, round: 0.008, ...S, parent: mon });
  screenPlane(0.55, 0.33, schematicScreenArt().texture, { y: 0.39, z: -0.001, parent: mon });
  // 서류 더미
  for (let i = 0; i < 6; i++) {
    box(0.21, 0.004, 0.297, M.paper, { x: 0.62 + (i % 2) * 0.006, y: H + 0.002 + i * 0.0045, z: 0.05, ry: (i % 3) * 0.03, ...S, parent: g });
  }
  // 머그컵
  cyl(0.04, 0.04, 0.09, new THREE.MeshStandardMaterial({ color: 0x2f6fb2, roughness: 0.3 }), { x: 0.4, y: H + 0.045, z: 0.25, ...S, parent: g });
  // 사무용 의자
  const chair = new THREE.Group();
  chair.position.set(0, 0, -0.55);
  chair.rotation.y = 0.2;
  g.add(chair);
  buildStool(chair);
  box(0.4, 0.45, 0.06, new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 }), { y: 0.98, z: -0.2, round: 0.03, ...S, parent: chair });

  g.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(spec.x, H - 0.02, spec.z), new THREE.Vector3(W, 0.04, D));
  interaction.addSupportFromBox(top);
  locomotion.addObstacle(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(spec.x, 0.5, spec.z), new THREE.Vector3(W, 1, D)));
  proxy(W, 0.04, D, spec.x, H - 0.02, spec.z);
  g.userData = { topY: H, W, D };
  return g;
}

function buildBookshelf(root, { x, z }, { locomotion, proxy }) {
  const S = { static: true };
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  root.add(g);
  const W = 1.5;
  const D = 0.34;
  const H = 1.9;
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.7 });
  box(W, H, 0.02, mat, { y: H / 2, z: -D / 2 + 0.01, ...S, parent: g });
  for (const sx of [-1, 1]) box(0.025, H, D, mat, { x: sx * (W / 2 - 0.0125), y: H / 2, ...S, parent: g });
  const titles = [
    [['회로이론', '#20406e', '#fff'], ['전자회로 1', '#7a2230', '#fff'], ['전자회로 2', '#7a2230', '#fff'], ['전자기학', '#1f6b4c', '#fff'], ['공업수학', '#c8a32a', '#111'], ['반도체공학', '#2c2c2c', '#eee'], ['신호 및 시스템', '#5d3f8c', '#fff'], ['제어공학', '#14606e', '#fff']],
    [['실험 보고서 2023', '#e6e0d0', '#333'], ['실험 보고서 2024', '#e6e0d0', '#333'], ['실험 보고서 2025', '#e6e0d0', '#333'], ['데이터시트 모음', '#1b2a44', '#fff'], ['74LS 시리즈', '#1b2a44', '#fff'], ['OP-AMP 응용', '#8c3f20', '#fff'], ['PCB 설계', '#1f6b4c', '#fff']],
    [['디지털 논리회로', '#5d3f8c', '#fff'], ['C 프로그래밍', '#c0392b', '#fff'], ['마이크로프로세서', '#2c3e50', '#fff'], ['통신이론', '#16a085', '#fff'], ['전력전자', '#8e44ad', '#fff'], ['임베디드 시스템', '#d35400', '#fff']],
  ];
  for (let i = 0; i < 5; i++) {
    const y = 0.05 + i * 0.45;
    box(W - 0.05, 0.022, D - 0.02, mat, { y, ...S, parent: g });
    if (i < 3) {
      const row = titles[i];
      const art = bookSpineArt(row);
      const spineMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.65 });
      const bw = 0.9;
      const bh = 0.3;
      const bookBlock = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.24), [M.paper, M.paper, M.paper, M.paper, spineMat, M.paper]);
      bookBlock.position.set(-0.2 + rand(-0.05, 0.05), y + 0.011 + bh / 2, 0.02);
      bookBlock.castShadow = bookBlock.receiveShadow = true;
      g.add(bookBlock);
    }
  }
  // 바인더
  for (let i = 0; i < 4; i++) {
    box(0.06, 0.3, 0.26, new THREE.MeshStandardMaterial({ color: [0x2d5d9f, 0xb03a2e, 0x1e8449, 0x2d5d9f][i], roughness: 0.5 }), { x: 0.35 + i * 0.065, y: 1.4 + 0.161, z: 0.01, ...S, parent: g });
  }
  // 상자
  box(0.4, 0.25, 0.3, new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 }), { x: 0.4, y: 0.06 + 0.125, z: 0, ...S, parent: g });
  g.updateMatrixWorld(true);
  locomotion.addObstacle(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, 0.5, z), new THREE.Vector3(W, 1, D)));
  proxy(W, H, D, x, H / 2, z);
}

export { sagPoints, cable };
