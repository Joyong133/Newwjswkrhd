import * as THREE from 'three';
import { font } from '../core/util.js';
import { drawSign } from '../content/signs.js';

export const ROAD_W = 4.0; // 일반 차로 폭
export const CRANK_W = 5.5; // 직각주행 구간 폭
const RAMP = { up: 9, flat: 7, down: 9, grade: 0.1 };
const RAMP_LEN = RAMP.up + RAMP.flat + RAMP.down;

/*
 * 장내 기능시험 코스
 *  출발 → 차로준수 → 경사로 → 직각주행 → 신호교차로 → 가속구간 → 돌발 → 종료
 *  heading 0 = 북쪽(−Z), 양수 = 왼쪽(반시계) 회전. 전진 벡터 = (−sin h, −cos h)
 */
function buildPath() {
  const pts = [];
  const marks = {};
  let x = 0;
  let z = 0;
  let h = 0;
  let s = 0;
  let w = ROAD_W;
  const STEP = 0.5;
  const push = () => pts.push({ x, z, h, s, w });
  push();
  const S = (len) => {
    const n = Math.ceil(len / STEP);
    const d = len / n;
    for (let i = 0; i < n; i++) {
      x += -Math.sin(h) * d;
      z += -Math.cos(h) * d;
      s += d;
      push();
    }
  };
  const T = (dir, r, deg = 90) => {
    const tot = (deg * Math.PI) / 180;
    const arc = r * tot;
    const n = Math.ceil(arc / STEP);
    const dh = (tot / n) * dir;
    const ds = arc / n;
    for (let i = 0; i < n; i++) {
      h += dh / 2;
      x += -Math.sin(h) * ds;
      z += -Math.cos(h) * ds;
      h += dh / 2;
      s += ds;
      push();
    }
  };
  const mark = (k) => (marks[k] = s);

  mark('start');
  S(10);
  mark('lane');
  S(26);
  mark('slope');
  S(4 + RAMP_LEN + 4);
  T(-1, 9);
  S(4);
  mark('crank');
  w = CRANK_W;
  pts[pts.length - 1].w = w;
  S(8);
  mark('crankC1');
  T(-1, 3.5);
  S(5);
  mark('crankC2');
  T(1, 3.5);
  S(10);
  mark('crankEnd');
  w = ROAD_W;
  S(6);
  T(-1, 9);
  S(8);
  mark('signal');
  S(32);
  mark('accel');
  S(52);
  T(-1, 9);
  mark('emerg');
  S(48);
  T(-1, 9);
  mark('finish');
  S(34);
  mark('end');
  return { pts, marks, length: s };
}

function canvasTex(cv, { aniso = 8, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export class Course {
  constructor(scene, maxAniso = 8) {
    const { pts, marks, length } = buildPath();
    this.pts = pts;
    this.marks = marks;
    this.length = length;
    this.root = new THREE.Group();
    scene.add(this.root);

    // 주요 지점(s 값)
    const m = marks;
    this.zones = {
      startBox: [m.start + 1, m.start + 6],
      rampStart: m.slope + 4,
      rampStop: [m.slope + 4 + RAMP.up + 0.6, m.slope + 4 + RAMP.up + RAMP.flat - 0.6],
      stopLine: m.signal + 18,
      crossCenter: m.signal + 24,
      accel: [m.accel + 10, m.accel + 40],
      emerg: [m.emerg + 10, m.emerg + 30],
      finishBox: [m.end - 9, m.end - 2],
    };

    // 범위
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const margin = 30;
    minX -= margin;
    maxX += margin;
    minZ -= margin;
    maxZ += margin;
    const span = Math.max(maxX - minX, maxZ - minZ);
    this.bounds = { minX, minZ, span };
    this.px = 2048 / span;

    this.buildTextures(maxAniso);
    this.buildRamp();
    this.buildTrafficLight();
    this.buildProps();
    this.buildGuide();
  }

  /** 월드 → 캔버스 좌표 */
  cx(x) {
    return (x - this.bounds.minX) * this.px;
  }

  cz(z) {
    return (z - this.bounds.minZ) * this.px;
  }

  pointAt(s) {
    const pts = this.pts;
    let i = Math.min(pts.length - 1, Math.max(0, Math.round((s / this.length) * (pts.length - 1))));
    while (i > 0 && pts[i].s > s) i--;
    while (i < pts.length - 1 && pts[i + 1].s <= s) i++;
    return pts[i];
  }

  /** 가장 가까운 중심선 점 찾기(직전 인덱스 근처부터) */
  project(x, z, hint = 0) {
    const pts = this.pts;
    let best = hint;
    let bd = Infinity;
    const lo = Math.max(0, hint - 40);
    const hi = Math.min(pts.length - 1, hint + 60);
    for (let i = lo; i <= hi; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (bd > 64) {
      // 크게 벗어났으면 전체 탐색
      for (let i = 0; i < pts.length; i++) {
        const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    const p = pts[best];
    // 진행 방향으로 보정한 s
    const fx = -Math.sin(p.h);
    const fz = -Math.cos(p.h);
    const along = (x - p.x) * fx + (z - p.z) * fz;
    return { i: best, s: p.s + along, dist: Math.sqrt(bd) };
  }

  /** 노면 판정: inner = 선 안쪽, road = 도로(선 포함 + 여유) */
  surface(x, z) {
    const X = Math.round(this.cx(x) / this.maskScale);
    const Y = Math.round(this.cz(z) / this.maskScale);
    if (X < 0 || Y < 0 || X >= this.maskW || Y >= this.maskW) return { inner: false, road: false };
    const i = (Y * this.maskW + X) * 4;
    return { inner: this.mask[i] > 128, road: this.mask[i + 1] > 128 };
  }

  /** 경사로 높이 */
  elevation(x, z) {
    const r = this.ramp;
    const dx = x - r.x;
    const t = r.z0 - z; // 북쪽으로 진행한 거리
    if (Math.abs(dx) > ROAD_W / 2 + 0.4 || t < 0 || t > RAMP_LEN) return 0;
    return rampProfile(t);
  }

  // -------------------------------------------------------------------------
  buildTextures(maxAniso) {
    const N = 2048;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const c = cv.getContext('2d');
    const px = this.px;
    // 바탕: 연한 콘크리트 + 잔디 섬
    c.fillStyle = '#5f7f45';
    c.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = `rgba(${40 + Math.random() * 40},${80 + Math.random() * 50},${30 + Math.random() * 30},0.35)`;
      c.fillRect(Math.random() * N, Math.random() * N, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    const pieces = this.pieces();
    const strokePath = (list, width, style, join = 'miter') => {
      c.strokeStyle = style;
      c.lineWidth = width * px;
      c.lineJoin = join;
      c.lineCap = 'butt';
      c.beginPath();
      list.forEach((p, i) => (i ? c.lineTo(this.cx(p.x), this.cz(p.z)) : c.moveTo(this.cx(p.x), this.cz(p.z))));
      c.stroke();
    };
    // 연석(회색 띠)
    for (const pc of pieces) strokePath(pc.pts, pc.w + 1.2, '#b9b9b0');
    this.drawCross(c, '#b9b9b0', 1.2);
    // 흰 차선(가장자리)
    for (const pc of pieces) strokePath(pc.pts, pc.w, '#f2f2f2');
    this.drawCross(c, '#f2f2f2', 0);
    // 아스팔트
    for (const pc of pieces) strokePath(pc.pts, pc.w - 0.3, '#3a3d42');
    this.drawCross(c, '#3a3d42', -0.3);
    this.drawMarkings(c);

    const tex = canvasTex(cv, { aniso: maxAniso });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(this.bounds.span, this.bounds.span), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(this.bounds.minX + this.bounds.span / 2, 0, this.bounds.minZ + this.bounds.span / 2);
    this.root.add(ground);

    // 판정용 마스크(작은 해상도): R = 선 안쪽, G = 도로 + 여유 1 m
    const MW = 1024;
    this.maskScale = N / MW;
    this.maskW = MW;
    const mc = document.createElement('canvas');
    mc.width = mc.height = MW;
    const g = mc.getContext('2d');
    g.scale(1 / this.maskScale, 1 / this.maskScale);
    g.fillStyle = '#000';
    g.fillRect(0, 0, N, N);
    const strokeM = (list, width, style) => {
      g.strokeStyle = style;
      g.lineWidth = width * px;
      g.lineJoin = 'miter';
      g.beginPath();
      list.forEach((p, i) => (i ? g.lineTo(this.cx(p.x), this.cz(p.z)) : g.moveTo(this.cx(p.x), this.cz(p.z))));
      g.stroke();
    };
    for (const pc of pieces) strokeM(pc.pts, pc.w + 2.4, '#00ff00');
    this.drawCross(g, '#00ff00', 2.4);
    for (const pc of pieces) strokeM(pc.pts, pc.w - 0.55, '#ffff00');
    this.drawCross(g, '#ffff00', -0.55);
    this.mask = g.getImageData(0, 0, MW, MW).data;
  }

  /** 폭이 같은 구간끼리 묶은 중심선 조각 */
  pieces() {
    const out = [];
    let cur = null;
    for (const p of this.pts) {
      if (!cur || cur.w !== p.w) {
        if (cur) cur.pts.push(p);
        cur = { w: p.w, pts: cur ? [cur.pts[cur.pts.length - 1], p] : [p] };
        out.push(cur);
      } else cur.pts.push(p);
    }
    return out;
  }

  /** 신호교차로의 동서 방향 교차 도로 */
  drawCross(c, style, extra) {
    const p = this.pointAt(this.zones.crossCenter);
    const L = 30;
    const W = 8 + extra;
    c.save();
    c.translate(this.cx(p.x), this.cz(p.z));
    c.rotate(-p.h);
    c.fillStyle = style;
    c.fillRect(-L * this.px, (-W / 2) * this.px, 2 * L * this.px, W * this.px);
    c.restore();
  }

  drawMarkings(c) {
    const px = this.px;
    const at = (s, fn) => {
      const p = this.pointAt(s);
      c.save();
      c.translate(this.cx(p.x), this.cz(p.z));
      c.rotate(-p.h);
      c.scale(px, px);
      fn(c, p);
      c.restore();
    };
    // 로컬 좌표: 오른쪽 = +x, 진행 방향 = −y
    const text = (s, str, size = 1.6, color = '#f2f2f2') =>
      at(s, (g) => {
        g.fillStyle = color;
        g.font = font(size, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(str, 0, 0);
      });
    const bar = (s, color = '#f2f2f2', thick = 0.45, width = ROAD_W - 0.3) => at(s, (g) => {
      g.fillStyle = color;
      g.fillRect(-width / 2, -thick / 2, width, thick);
    });
    const z = this.zones;
    // 출발·종료 박스
    for (const [a, b, label] of [[...z.startBox, '출발'], [...z.finishBox, '종료']]) {
      const len = b - a;
      at((a + b) / 2, (g) => {
        g.strokeStyle = '#ffd400';
        g.lineWidth = 0.18;
        g.strokeRect(-1.4, -len / 2, 2.8, len);
        g.fillStyle = '#ffd400';
        g.font = font(1.1, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, 0, 0);
      });
    }
    text(this.marks.lane + 4, '차로준수', 1.0);
    text(this.marks.slope + 1.5, '경사로', 1.2);
    text(this.marks.crank + 3, '직각주행', 1.2);
    text(this.marks.signal + 6, '신호교차로', 1.0);
    bar(z.stopLine);
    // 횡단보도
    at(z.stopLine + 2.2, (g) => {
      g.fillStyle = '#f2f2f2';
      for (let k = -1.6; k <= 1.6; k += 0.8) g.fillRect(k - 0.25, -1.4, 0.5, 2.8);
    });
    // 가속구간
    bar(z.accel[0], '#ffd400', 0.3);
    bar(z.accel[1], '#ffd400', 0.3);
    text(z.accel[0] + 4, '가속구간', 1.1, '#ffd400');
    text(z.accel[0] + 7, '20km/h 이상', 0.9, '#ffd400');
    text(this.marks.emerg + 4, '돌발', 1.2);
    // 방향 화살표
    for (let s = this.marks.lane + 12; s < this.length - 12; s += 22) {
      const near = Object.values(z).some((v) => (Array.isArray(v) ? Math.abs(v[0] - s) < 8 || Math.abs(v[1] - s) < 8 : Math.abs(v - s) < 8));
      if (near || (s > this.marks.crank - 4 && s < this.marks.crankEnd + 4) || (s > z.rampStart - 4 && s < z.rampStart + RAMP_LEN + 2)) continue;
      at(s, (g) => {
        g.fillStyle = 'rgba(242,242,242,0.9)';
        g.fillRect(-0.12, -0.2, 0.24, 2.2);
        g.beginPath();
        g.moveTo(0, -1.2);
        g.lineTo(0.55, -0.15);
        g.lineTo(-0.55, -0.15);
        g.closePath();
        g.fill();
      });
    }
  }

  // -------------------------------------------------------------------------
  buildRamp() {
    const p0 = this.pointAt(this.zones.rampStart);
    this.ramp = { x: p0.x, z0: p0.z };
    const segs = 50;
    const geo = new THREE.PlaneGeometry(ROAD_W + 0.8, RAMP_LEN, 1, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = RAMP_LEN / 2 - pos.getZ(i); // 북쪽(−Z)으로 진행한 거리
      pos.setY(i, rampProfile(t) + 0.01);
    }
    geo.computeVertexNormals();
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 1400;
    const c = cv.getContext('2d');
    const k = cv.height / RAMP_LEN;
    const wpx = cv.width / (ROAD_W + 0.8);
    c.fillStyle = '#b9b9b0';
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#f2f2f2';
    c.fillRect(0.4 * wpx, 0, ROAD_W * wpx, cv.height);
    c.fillStyle = '#44474c';
    c.fillRect(0.55 * wpx, 0, (ROAD_W - 0.3) * wpx, cv.height);
    // 정지 구간(위쪽 = 북쪽 끝 = t 큼). 텍스처 v 는 위가 북쪽
    const [a, b] = this.zones.rampStop.map((s) => s - this.zones.rampStart);
    c.strokeStyle = '#ffd400';
    c.lineWidth = 8;
    c.strokeRect(0.7 * wpx, cv.height - b * k, (ROAD_W - 0.6) * wpx, (b - a) * k);
    c.save();
    c.translate(cv.width / 2, cv.height - ((a + b) / 2) * k);
    c.fillStyle = '#ffd400';
    c.font = font(46, 900);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('정지', 0, 0);
    c.restore();
    const tex = canvasTex(cv);
    const ramp = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    ramp.position.set(p0.x, 0, p0.z - RAMP_LEN / 2);
    this.root.add(ramp);
    // 옆벽
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.9 });
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.25, 1, RAMP_LEN, 1, 1, segs);
      const ps = g.attributes.position;
      for (let i = 0; i < ps.count; i++) {
        const t = RAMP_LEN / 2 - ps.getZ(i);
        const top = rampProfile(t) + 0.15;
        ps.setY(i, ps.getY(i) > 0 ? top : 0);
      }
      g.computeVertexNormals();
      const wall = new THREE.Mesh(g, wallMat);
      wall.position.set(p0.x + sx * (ROAD_W / 2 + 0.55), 0, p0.z - RAMP_LEN / 2);
      this.root.add(wall);
    }
  }

  buildTrafficLight() {
    const p = this.pointAt(this.zones.stopLine);
    const right = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
    const fwd = new THREE.Vector3(-Math.sin(p.h), 0, -Math.cos(p.h));
    const base = new THREE.Vector3(p.x, 0, p.z).addScaledVector(right, ROAD_W / 2 + 1.2).addScaledVector(fwd, 4);
    const g = new THREE.Group();
    g.position.copy(base);
    g.rotation.y = p.h;
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 12), metal);
    pole.position.y = 2.6;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 10), metal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-1.6, 5.0, 0);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 }));
    housing.position.set(-2.6, 4.75, 0);
    g.add(pole, arm, housing);
    const lamps = {};
    [['red', 0xff2a2a, -0.38], ['yellow', 0xffb300, 0], ['green', 0x22dd66, 0.38]].forEach(([k, col, x]) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), mat);
      lamp.position.set(-2.6 + x, 4.75, 0.16);
      g.add(lamp);
      lamps[k] = { mat, col };
    });
    this.root.add(g);
    this.light = {
      state: 'green',
      lamps,
      set: (st) => {
        this.light.state = st;
        for (const [k, l] of Object.entries(lamps)) l.mat.color.setHex(k === st ? l.col : 0x222222);
      },
    };
    this.light.set('green');
  }

  buildProps() {
    const root = this.root;
    // 구간 안내 표지판(오른쪽 길가)
    const boards = [
      [this.marks.lane + 1, '① 차로준수', '차선을 밟지 마세요'],
      [this.marks.slope - 2, '② 경사로', '정지 구간에서 멈춘 뒤 출발'],
      [this.marks.crank - 5, '③ 직각주행', '선을 밟지 말고 통과'],
      [this.marks.signal + 2, '④ 신호교차로', '신호에 따라 직진'],
      [this.zones.accel[0] - 6, '⑤ 가속구간', '20 km/h 이상 가속'],
      [this.marks.emerg + 2, '⑥ 돌발상황', '경고음 → 즉시 정지·비상등'],
      [this.zones.finishBox[0] - 8, '⑦ 종료', '종료 구역에 정지 → P'],
    ];
    for (const [s, title, sub] of boards) root.add(this.board(s, title, sub));
    // 실제 교통표지
    const signPost = (s, id, side = 1) => {
      const p = this.pointAt(s);
      const right = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
      const g = new THREE.Group();
      g.position.set(p.x, 0, p.z).addScaledVector(right, side * (ROAD_W / 2 + 1.4));
      g.rotation.y = p.h;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5 }));
      pole.position.y = 1.1;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      drawSign(cv.getContext('2d'), id, 128, 128, 230);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: canvasTex(cv, { aniso: 4 }), transparent: true, side: THREE.DoubleSide }));
      face.position.y = 2.35;
      g.add(pole, face);
      root.add(g);
    };
    signPost(this.marks.slope - 6, 'slow');
    signPost(this.marks.signal - 2, 'signalAhead');
    signPost(this.zones.stopLine - 6, 'crosswalkWarn');
    signPost(this.marks.lane + 14, 'speed30');
    signPost(this.marks.emerg + 22, 'children');
    signPost(this.marks.crank - 10, 'curveRight');

    // 직각주행 모서리 고깔
    const coneGeo = new THREE.ConeGeometry(0.18, 0.55, 14);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });
    for (const k of ['crankC1', 'crankC2']) {
      // 모서리 안쪽·바깥쪽 길가에 고깔
      const p = this.pointAt(this.marks[k] + 2.75);
      const right = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
      for (const side of [-1, 1]) {
        const c = new THREE.Mesh(coneGeo, coneMat);
        c.position.set(p.x, 0.27, p.z).addScaledVector(right, side * (CRANK_W / 2 + 0.9));
        root.add(c);
      }
    }
    // 시험장 건물
    const st = this.pointAt(this.marks.start + 4);
    const bld = new THREE.Group();
    bld.position.set(st.x - 18, 0, st.z + 4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 9), new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 }));
    body.position.y = 3.5;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.5, 9.6), new THREE.MeshStandardMaterial({ color: 0x2f5f9f }));
    roof.position.y = 7.2;
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x7fb3d8, metalness: 0.4, roughness: 0.15 });
    for (let k = -2; k <= 2; k++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.6), glassMat);
      win.position.set(7.01, 4.5, k * 2.5);
      win.rotation.y = Math.PI / 2;
      bld.add(win);
    }
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 160;
    const g = cv.getContext('2d');
    g.fillStyle = '#2f5f9f';
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = '#ffffff';
    g.font = font(84, 900);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VR 운전면허시험장', 512, 84);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: canvasTex(cv, { aniso: 4 }) }));
    sign.position.set(7.02, 6.2, 0);
    sign.rotation.y = Math.PI / 2;
    bld.add(body, roof, sign);
    root.add(bld);

    // 나무
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6);
    const leafGeo = new THREE.ConeGeometry(1.4, 3.6, 8);
    const { minX, minZ, span } = this.bounds;
    let placed = 0;
    for (let k = 0; k < 400 && placed < 90; k++) {
      const x = minX + Math.random() * span;
      const z = minZ + Math.random() * span;
      const pr = this.project(x, z, 0);
      if (pr.dist < 9 || Math.hypot(x - bld.position.x, z - bld.position.z) < 12) continue;
      const t = new THREE.Group();
      const tr = new THREE.Mesh(trunkGeo, trunkMat);
      tr.position.y = 0.8;
      const lf = new THREE.Mesh(leafGeo, leafMat);
      lf.position.y = 3.2;
      t.add(tr, lf);
      t.position.set(x, 0, z);
      t.scale.setScalar(0.8 + Math.random() * 0.6);
      root.add(t);
      placed++;
    }
    // 바깥 잔디 + 먼 산
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x55743d, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(minX + span / 2, -0.25, minZ + span / 2);
    root.add(grass);
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x4d6b55, roughness: 1, flatShading: true });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 30, 20 + Math.random() * 25, 7), hillMat);
      hill.position.set(minX + span / 2 + Math.cos(a) * 230, 8, minZ + span / 2 + Math.sin(a) * 230);
      root.add(hill);
    }
  }

  board(s, title, sub) {
    const p = this.pointAt(s);
    const right = new THREE.Vector3(Math.cos(p.h), 0, -Math.sin(p.h));
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z).addScaledVector(right, ROAD_W / 2 + 2.2);
    g.rotation.y = p.h;
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 300;
    const c = cv.getContext('2d');
    c.fillStyle = '#1d4f91';
    c.fillRect(0, 0, 640, 300);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 10;
    c.strokeRect(12, 12, 616, 276);
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(78, 900);
    c.fillText(title, 320, 120);
    c.font = font(38, 600);
    c.fillText(sub, 320, 215);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.125), new THREE.MeshBasicMaterial({ map: canvasTex(cv, { aniso: 4 }) }));
    face.position.y = 2.2;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.5 });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), legMat);
      leg.position.set(sx * 1.0, 1.1, -0.02);
      g.add(leg);
    }
    g.add(face);
    return g;
  }

  /** 주행 가이드선(파란 점선) */
  buildGuide() {
    const arr = [];
    for (const p of this.pts) arr.push(p.x, this.elevation(p.x, p.z) + 0.04, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x38d9ff, dashSize: 1.2, gapSize: 0.9, transparent: true, opacity: 0.85 }));
    line.computeLineDistances();
    this.guide = line;
    this.root.add(line);
  }
}

function rampProfile(t) {
  if (t <= 0 || t >= RAMP_LEN) return 0;
  if (t < RAMP.up) return t * RAMP.grade;
  if (t < RAMP.up + RAMP.flat) return RAMP.up * RAMP.grade;
  return (RAMP_LEN - t) * RAMP.grade;
}
