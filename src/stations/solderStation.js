import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { Grabbable, Button, Interactable, PanelItem, SnapZone } from '../core/interaction.js';
import { M, box, cyl, sphere, makeInstrumentCase, makeIndicator, makeKnob, screenPlane, printPlane, markStatic } from '../world/props.js';
import { BENCH } from '../world/lab.js';
import { COLORS, clamp, font, roundRect } from '../core/util.js';
import { createStationPanel, draw7seg, panelLabel, lcdBackground, makeGlow } from './common.js';
import { makeIC, makeResistor, makeLED, setLEDBrightness } from './components.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PCB_W = 0.2;
const PCB_H = 0.14;
const PCB_T = 0.004;

// 사용자가 납땜할 패드 10개 + 미리 납땜된 패드
const PADS = [
  { id: 'R1a', x: -0.07, y: -0.045, part: 'R1' }, { id: 'R1b', x: -0.03, y: -0.045, part: 'R1' },
  { id: 'R2a', x: 0.03, y: -0.045, part: 'R2' }, { id: 'R2b', x: 0.07, y: -0.045, part: 'R2' },
  { id: 'C1a', x: -0.068, y: 0.035, part: 'C1' }, { id: 'C1b', x: -0.048, y: 0.035, part: 'C1' },
  { id: 'D1a', x: 0.0305, y: 0.045, part: 'LED1' }, { id: 'D1b', x: 0.0495, y: 0.045, part: 'LED1' },
  { id: 'D2a', x: 0.0655, y: 0.045, part: 'LED2' }, { id: 'D2b', x: 0.0845, y: 0.045, part: 'LED2' },
];
const PRE = [];
for (const px of [-0.0143, -0.0048, 0.0048, 0.0143]) for (const py of [-0.0143, 0.0143]) PRE.push({ x: px, y: py });
PRE.push({ x: -0.085, y: -0.012 }, { x: -0.085, y: 0.004 });

/** 매 프레임 갱신 가능한 케이블(튜브) */
class DynamicCable {
  constructor(material, radius = 0.0028, segments = 28, radial = 6) {
    this.seg = segments;
    this.rad = radial;
    this.radius = radius;
    const n = (segments + 1) * (radial + 1);
    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    const idx = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = (i + 1) * (radial + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {};
    this.curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  }

  update(a, aDir, b, bDir, slack = 0.12) {
    const c = this.curve;
    const d = a.distanceTo(b);
    c.v0.copy(a);
    c.v1.copy(a).addScaledVector(aDir, 0.05 + d * 0.25);
    c.v2.copy(b).addScaledVector(bDir, 0.05 + d * 0.25);
    c.v3.copy(b);
    // 중력으로 처짐
    const sag = Math.max(0, slack - d * 0.2);
    c.v1.y -= sag;
    c.v2.y -= sag;
    const P = new THREE.Vector3();
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let k = 0;
    for (let i = 0; i <= this.seg; i++) {
      const t = i / this.seg;
      c.getPoint(t, P);
      c.getTangent(t, T);
      N.crossVectors(T, up);
      if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
      N.normalize();
      B.crossVectors(T, N).normalize();
      for (let j = 0; j <= this.rad; j++) {
        const ang = (j / this.rad) * Math.PI * 2;
        const cx = Math.cos(ang);
        const sy = Math.sin(ang);
        const nx = N.x * cx + B.x * sy;
        const ny = N.y * cx + B.y * sy;
        const nz = N.z * cx + B.z * sy;
        this.nrm[k] = nx;
        this.nrm[k + 1] = ny;
        this.nrm[k + 2] = nz;
        this.pos[k] = P.x + nx * this.radius;
        this.pos[k + 1] = P.y + ny * this.radius;
        this.pos[k + 2] = P.z + nz * this.radius;
        k += 3;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
  }
}

/**
 * 실험 4: 555 깜빡이 키트 납땜
 */
export class SolderStation {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.position.y = BENCH.H + 0.004;
    ctx.bench.add(this.root);
    this.power = false;
    this.temp = 25;
    this.soldered = 0;
    this.done = false;
    this.finale = -1;
    this.time = 0;
    this.burnCooldown = 0;
    this.hapticT = 0;

    this.buildStation();
    this.buildStand();
    this.buildIron();
    this.buildBoard();
    this.buildFumeExtractor();
    this.buildPanel();
    this.ctx.interaction.on('grab', (item) => {
      if (item === this.iron) {
        this.ctx.missions.touch('solder');
        if (!this.warned) {
          this.warned = true;
          this.ctx.toast.show('⚠ 인두 팁은 350°C!\n팁 끝을 납땜 포인트(파란 고리)에 대고 잠시 기다리세요', 'warn', 4);
        }
        this.panel.redraw();
      }
    });
  }

  // -------------------------------------------------------------------------
  buildStation() {
    const { interaction } = this.ctx;
    const st = makeInstrumentCase(0.16, 0.1, 0.2, 0x2e3237, 0x1f2226);
    st.position.set(-0.62, 0, -0.08);
    st.rotation.y = 0.2;
    this.root.add(st);
    interaction.addBlocker(st.userData.body);
    const f = st.userData.front;
    const art = new CanvasArt(330, 210, (c, w, h) => {
      c.fillStyle = '#1f2226';
      c.fillRect(0, 0, w, h);
      panelLabel(c, 'EE·LAB  SOLDERING STATION', 18, 20, 13, '#ff8a3d', 'left', 900);
      panelLabel(c, 'TEMP', 250, 60, 13);
      panelLabel(c, 'POWER', 54, 186, 13);
      panelLabel(c, '200–480°C', 250, 186, 12, '#8f9aa6');
    });
    printPlane(0.156, 0.097, art.texture, { y: 0.05, z: 0.0005, roughness: 0.6, static: true, parent: f });
    this.tempArt = new CanvasArt(320, 150, (c, w, h) => {
      lcdBackground(c, w, h, '#140603');
      draw7seg(c, String(Math.round(this.temp)).padStart(3, ' '), 22, 24, 54, 100, '#ff6a1a', 'rgba(255,106,26,0.08)');
      c.fillStyle = '#ff6a1a';
      c.font = font(34, 900);
      c.fillText('°C', 250, 80);
      c.font = font(22, 700);
      c.fillStyle = this.power && this.temp < 340 ? '#ffd166' : 'rgba(255,209,102,0.15)';
      c.fillText('HEAT', 250, 128);
    }, { autoRedraw: false, mipmaps: false });
    box(0.088, 0.044, 0.004, M.plasticDark, { x: -0.025, y: 0.062, z: 0.001, static: true, parent: f });
    markStatic(screenPlane(0.082, 0.038, this.tempArt.texture, { x: -0.025, y: 0.062, z: 0.0035, parent: f }));
    const knob = makeKnob(0.013, 0.012, 0x2a2d32);
    knob.position.set(0.05, 0.062, 0.002);
    knob.rotation.z = -1.2;
    f.add(markStatic(knob));
    // 전원 로커 스위치
    const sw = new THREE.Group();
    sw.position.set(-0.045, 0.02, 0.002);
    f.add(sw);
    box(0.026, 0.02, 0.006, M.plasticDark, { z: 0.003, static: true, parent: sw });
    this.rockerMat = new THREE.MeshStandardMaterial({ color: 0x8a1c14, emissive: 0xff3b1f, emissiveIntensity: 0, roughness: 0.4 });
    this.rocker = box(0.02, 0.014, 0.008, this.rockerMat, { z: 0.007, parent: sw });
    this.rocker.rotation.x = 0.25;
    interaction.add(new Button(sw, {
      cap: this.rocker,
      travel: 0,
      colliders: [this.rocker],
      info: () => ({ title: '인두 스테이션 전원', text: this.power ? `켜짐 · ${Math.round(this.temp)}°C` : '꺼짐 — 눌러서 켜고 350°C까지 예열' }),
      onPress: () => {
        this.power = !this.power;
        this.rocker.rotation.x = this.power ? -0.25 : 0.25;
        this.rockerMat.emissiveIntensity = this.power ? 1.6 : 0;
        this.ctx.audio.play('relay', sw, { volume: 0.6 });
        this.ctx.missions.touch('solder');
        if (this.power) this.ctx.audio.play('beep', sw, { volume: 0.3 });
        this.panel.redraw();
      },
    }));
    st.updateMatrixWorld(true);
    this.stationBox = st;
    interaction.add(new Interactable(st.userData.body, {
      outline: false,
      info: () => ({ title: '온도조절 인두 스테이션', text: `설정 350°C · 현재 ${Math.round(this.temp)}°C\n납(Sn63/Pb37)은 약 183°C에서 녹아요` }),
    })).type = 'info';
    // 케이블 출구(뒤쪽 앞면 오른쪽)
    this.cableOut = new THREE.Object3D();
    this.cableOut.position.set(0.06, 0.02, 0.006);
    f.add(this.cableOut);
  }

  buildStand() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.set(-0.36, 0, 0.02);
    g.rotation.y = 0.35;
    this.root.add(g);
    box(0.1, 0.018, 0.16, M.steelDark, { y: 0.009, round: 0.004, parent: g });
    // 스펀지 트레이 + 스펀지
    box(0.06, 0.012, 0.055, M.blackPlastic, { x: 0.0, y: 0.022, z: 0.048, parent: g });
    const sponge = new THREE.MeshStandardMaterial({ color: 0xe8c33b, roughness: 1 });
    box(0.052, 0.01, 0.046, sponge, { x: 0.0, y: 0.03, z: 0.048, parent: g });
    // 황동 수세미
    const brassWool = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.7, metalness: 0.9 });
    sphere(0.016, brassWool, { x: 0.03, y: 0.03, z: -0.045, scale: 1, parent: g });
    // 거치대 코일
    const holder = new THREE.Object3D();
    holder.position.set(-0.02, 0.105, 0.03);
    holder.rotation.x = -0.62;
    g.add(holder);
    const turns = 6;
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.016, Math.sin(a) * 0.016, -0.035 - t * 0.085));
    }
    const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0016, 6, false), M.chrome);
    coil.castShadow = true;
    holder.add(coil);
    // 코일을 받치는 기둥
    cyl(0.003, 0.003, 0.09, M.chrome, { x: -0.02, y: 0.06, z: -0.02, parent: g });
    cyl(0.003, 0.003, 0.06, M.chrome, { x: -0.02, y: 0.045, z: -0.06, parent: g });
    const zone = new SnapZone({
      parent: holder,
      position: new THREE.Vector3(0, 0, 0),
      accepts: (it) => it.kind === 'iron',
      radius: 0.14,
      allowFlip: false,
      onSnap: () => this.panel?.redraw(),
      name: 'iron-stand',
    });
    interaction.addZone(zone);
    this.standZone = zone;
    this.standGroup = g;
    markStatic(g);
  }

  buildIron() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.name = 'solderingIron';
    // 원점 = 손잡이 중앙, 팁 방향 = -Z
    const grip = new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.75 });
    const handle = cyl(0.0115, 0.0105, 0.1, grip, { rx: Math.PI / 2, z: 0.02, parent: g });
    for (let i = 0; i < 6; i++) cyl(0.012, 0.012, 0.004, M.rubber, { rx: Math.PI / 2, z: -0.015 + i * 0.012, parent: g });
    cyl(0.014, 0.012, 0.008, M.blackPlastic, { rx: Math.PI / 2, z: -0.032, parent: g });
    cyl(0.008, 0.0105, 0.016, M.blackPlastic, { rx: Math.PI / 2, z: 0.078, parent: g });
    cyl(0.0055, 0.0055, 0.07, M.chrome, { rx: Math.PI / 2, z: -0.071, parent: g });
    cyl(0.0042, 0.0055, 0.012, M.steelDark, { rx: Math.PI / 2, z: -0.112, parent: g });
    this.tipMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.25, emissive: 0xff5a14, emissiveIntensity: 0 });
    const tipGeo = new THREE.ConeGeometry(0.0042, 0.022, 16);
    tipGeo.rotateX(-Math.PI / 2);
    const tip = new THREE.Mesh(tipGeo, this.tipMat);
    tip.position.z = -0.129;
    g.add(tip);
    this.tipGlow = makeGlow(0xff6a20, 0.03);
    this.tipGlow.position.z = -0.139;
    g.add(this.tipGlow);
    this.tipLocal = new THREE.Vector3(0, 0, -0.14);
    this.cableLocal = new THREE.Vector3(0, 0, 0.086);
    this.root.add(g);

    const item = new Grabbable(g, {
      kind: 'iron',
      grabRadius: 0.05,
      center: new THREE.Vector3(0, 0, 0.0),
      snapToHand: true,
      holdOffset: { pos: new THREE.Vector3(0, -0.005, -0.01), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.75) },
      tip: this.tipLocal.clone(),
      desktopQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0.25, 0)),
      restHeight: 0.012,
      restQuat: new THREE.Quaternion(),
      outline: [handle],
      info: () => ({ title: '납땜 인두', text: `팁 온도 ${Math.round(this.temp)}°C · 손잡이만 잡으세요!\n팁을 패드에 대고 0.8초 유지 → 납이 녹아 접합` }),
    });
    interaction.add(item);
    item.setHomeZone(this.standZone);
    interaction.snapInto(item, this.standZone, false);
    this.iron = item;

    this.cable = new DynamicCable(M.cableGray, 0.0025);
    this.root.add(this.cable.mesh);
    // 인두가 바닥에 떨어지면 거치대로
    item.respawnOnFloor = true;
  }

  // -------------------------------------------------------------------------
  buildBoard() {
    const { interaction } = this.ctx;
    // 바이스(PCB 홀더)
    const vise = new THREE.Group();
    vise.position.set(0.04, 0, 0.13);
    this.root.add(vise);
    box(0.24, 0.02, 0.1, M.steelDark, { y: 0.01, round: 0.004, static: true, parent: vise });
    for (const sx of [-1, 1]) {
      box(0.016, 0.075, 0.03, M.steelDark, { x: sx * 0.115, y: 0.055, static: true, parent: vise });
      cyl(0.008, 0.008, 0.02, M.chrome, { x: sx * 0.115, y: 0.085, rz: Math.PI / 2, static: true, parent: vise });
    }
    // 기울기 → 뒤집기 피벗
    const tilt = new THREE.Group();
    tilt.position.set(0, 0.085, 0);
    tilt.rotation.x = -(Math.PI / 2 - 0.45);
    vise.add(tilt);
    const flip = new THREE.Group();
    tilt.add(flip);
    this.flipGroup = flip;
    // 집게
    for (const sx of [-1, 1]) box(0.012, 0.03, 0.012, M.chrome, { x: sx * (PCB_W / 2 + 0.002), parent: flip });

    const fr4 = new THREE.MeshStandardMaterial({ color: 0x5f6b3a, roughness: 0.7 });
    box(PCB_W, PCB_H, PCB_T, fr4, { parent: flip });
    const solderArt = new CanvasArt(1200, 840, (c, w, h) => this.drawPCB(c, w, h, 'bottom'));
    const compArt = new CanvasArt(1200, 840, (c, w, h) => this.drawPCB(c, w, h, 'top'));
    const bMat = new THREE.MeshStandardMaterial({ map: solderArt.texture, roughness: 0.35, metalness: 0.0 });
    const tMat = new THREE.MeshStandardMaterial({ map: compArt.texture, roughness: 0.35 });
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(PCB_W, PCB_H), bMat);
    bottom.position.z = PCB_T / 2 + 0.0003;
    bottom.receiveShadow = true;
    flip.add(bottom);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(PCB_W, PCB_H), tMat);
    top.rotation.y = Math.PI;
    top.position.z = -PCB_T / 2 - 0.0003;
    flip.add(top);
    interaction.addBlocker(bottom);
    interaction.add(new Interactable(bottom, {
      outline: false,
      info: () => ({ title: '555 타이머 깜빡이 키트', text: `납땜 면(뒷면) · 완료 ${this.soldered}/10\nNE555 + LED 2개 + 저항 + 콘덴서` }),
    })).type = 'info';

    // 패드, 리드, 납땜 접합
    const padMat = new THREE.MeshStandardMaterial({ color: 0xd9c9a0, metalness: 0.9, roughness: 0.3 });
    const padGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.0006, 20);
    padGeo.rotateX(Math.PI / 2);
    const leadGeo = new THREE.CylinderGeometry(0.0007, 0.0007, 0.006, 6);
    leadGeo.rotateX(Math.PI / 2);
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      prof.push(new THREE.Vector2(0.0043 * (1 - t) ** 1.6 + 0.0007, t * 0.0052));
    }
    const jointGeo = new THREE.LatheGeometry(prof, 20);
    jointGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
    const ringGeo = new THREE.RingGeometry(0.0055, 0.0072, 24);
    this.pads = [];
    const z0 = PCB_T / 2 + 0.0004;
    // 패드·리드·미리 된 납땜은 각각 하나의 지오메트리로 합친다
    const padParts = [];
    const leadParts = [];
    const preParts = [];
    const all = PRE.map((p) => ({ ...p, pre: true })).concat(PADS);
    for (const p of all) {
      padParts.push(padGeo.clone().translate(p.x, p.y, z0));
      leadParts.push(leadGeo.clone().translate(p.x, p.y, z0 + 0.003));
      if (p.pre) preParts.push(jointGeo.clone().translate(p.x, p.y, z0));
    }
    const strip = (arr) => arr.map((gg) => {
      const ni = gg.index ? gg.toNonIndexed() : gg;
      for (const k of Object.keys(ni.attributes)) if (!['position', 'normal'].includes(k)) ni.deleteAttribute(k);
      return ni;
    });
    flip.add(new THREE.Mesh(mergeGeometries(strip(padParts)), padMat));
    flip.add(new THREE.Mesh(mergeGeometries(strip(leadParts)), M.lead));
    flip.add(new THREE.Mesh(mergeGeometries(strip(preParts)), M.solder));
    for (const p of PADS) {
      const joint = new THREE.Mesh(jointGeo, M.solder);
      joint.position.set(p.x, p.y, z0);
      joint.scale.setScalar(0.001);
      joint.visible = false;
      flip.add(joint);
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.set(p.x, p.y, z0 + 0.0008);
      ring.raycast = () => {};
      flip.add(ring);
      const anchor = new THREE.Object3D();
      anchor.position.set(p.x, p.y, z0);
      flip.add(anchor);
      this.pads.push({ ...p, pad: anchor, joint, ring, progress: 0, done: false, world: new THREE.Vector3() });
    }

    // 부품면(뒷면) 부품
    const comp = new THREE.Group();
    comp.rotation.y = Math.PI;
    comp.position.z = -PCB_T / 2;
    flip.add(comp);
    // 부품면 좌표는 x가 반전된다
    const at = (obj, x, y) => {
      obj.position.set(-x, y, 0);
      obj.rotation.x = Math.PI / 2;
      comp.add(obj);
      return obj;
    };
    const ic = makeIC('NE555P', 'TIMER', { pins: 8 });
    at(ic, 0, 0).rotation.y = 0;
    ic.rotation.set(Math.PI / 2, 0, 0);
    const r1 = makeResistor(1000, 0.04);
    at(r1, -0.05, -0.045);
    const r2 = makeResistor(10000, 0.04);
    at(r2, 0.05, -0.045);
    this.kitLeds = [makeLED(0xff2a2a, { span: 0.019 }), makeLED(0x2aff5a, { span: 0.019 })];
    at(this.kitLeds[0], 0.04, 0.045);
    at(this.kitLeds[1], 0.075, 0.045);
    // 전해 콘덴서
    const cap = new THREE.Group();
    const capMat = new THREE.MeshStandardMaterial({ color: 0x1e3f8a, roughness: 0.35 });
    cyl(0.0085, 0.0085, 0.024, capMat, { y: 0.016, parent: cap });
    cyl(0.0086, 0.0086, 0.024, new THREE.MeshStandardMaterial({ color: 0xc9d4e6, roughness: 0.4 }), { y: 0.016, seg: 8, parent: cap }).scale.set(0.3, 1, 1.02);
    cyl(0.0075, 0.0075, 0.001, M.chrome, { y: 0.0285, parent: cap });
    at(cap, -0.058, 0.035);
    // 배터리 클립 선
    const wires = new THREE.Group();
    at(wires, -0.085, -0.004);
    for (const [col, dz] of [[M.cableRed, 0.008], [M.cableBlack, -0.008]]) {
      const pts = [new THREE.Vector3(0, 0, dz), new THREE.Vector3(0, 0.02, dz), new THREE.Vector3(0.03, 0.04, dz * 2), new THREE.Vector3(0.08, 0.03, dz * 3)];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0015, 6, false), col);
      wires.add(tube);
    }
    this.compGroup = comp;
  }

  drawPCB(c, w, h, side) {
    const X = (x) => (side === 'bottom' ? (x / PCB_W + 0.5) * w : (0.5 - x / PCB_W) * w);
    const Y = (y) => (0.5 - y / PCB_H) * h;
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1f6f3d');
    g.addColorStop(1, '#155a30');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // 구리 배선(솔더마스크 아래)
    c.strokeStyle = side === 'bottom' ? '#2f9a58' : 'rgba(47,154,88,0.5)';
    c.lineWidth = 14;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const tr = (pts) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
      c.stroke();
    };
    tr([[-0.085, 0.004], [-0.085, 0.05], [-0.068, 0.05], [-0.068, 0.035]]);
    tr([[-0.03, -0.045], [-0.03, -0.0143], [-0.0143, -0.0143]]);
    tr([[0.03, -0.045], [0.03, -0.025], [0.0143, -0.025], [0.0143, -0.0143]]);
    tr([[-0.07, -0.045], [-0.085, -0.03], [-0.085, -0.012]]);
    tr([[0.07, -0.045], [0.09, -0.02], [0.09, 0.03], [0.0845, 0.045]]);
    tr([[-0.048, 0.035], [-0.0143, 0.035], [-0.0143, 0.0143]]);
    tr([[0.0305, 0.045], [0.0048, 0.03], [0.0048, 0.0143]]);
    tr([[0.0495, 0.045], [0.0655, 0.045]]);
    tr([[-0.0048, 0.0143], [-0.0048, 0.025], [0.0143, 0.025], [0.0143, 0.0143]]);
    // 테두리 그라운드
    c.lineWidth = 10;
    c.strokeRect(14, 14, w - 28, h - 28);
    if (side === 'top') {
      // 실크스크린
      c.strokeStyle = '#f2f2f2';
      c.fillStyle = '#f2f2f2';
      c.lineWidth = 4;
      c.font = font(30, 700);
      const outline = (x, y, ww, hh, label, lx = 0, ly = -0.012) => {
        c.strokeRect(X(x) - (ww / PCB_W) * w * 0.5, Y(y) - (hh / PCB_H) * h * 0.5, (ww / PCB_W) * w, (hh / PCB_H) * h);
        c.fillText(label, X(x + lx) - 20, Y(y + ly));
      };
      outline(-0.05, -0.045, 0.034, 0.012, 'R1', 0, -0.014);
      outline(0.05, -0.045, 0.034, 0.012, 'R2', 0, -0.014);
      outline(0, 0, 0.04, 0.03, 'U1 NE555', 0.0, -0.024);
      for (const [x, label] of [[0.04, 'LED1'], [0.075, 'LED2']]) {
        c.beginPath();
        c.arc(X(x), Y(0.045), (0.011 / PCB_W) * w, 0, Math.PI * 2);
        c.stroke();
        c.fillText(label, X(x) - 30, Y(0.045) - 50);
      }
      c.beginPath();
      c.arc(X(-0.058), Y(0.035), (0.01 / PCB_W) * w, 0, Math.PI * 2);
      c.stroke();
      c.fillText('C1 +', X(-0.058) - 30, Y(0.035) - 48);
      c.fillText('BAT 9V', X(-0.085) - 40, Y(-0.03));
      c.font = font(34, 900);
      c.fillText('EE-LAB BLINKY v1.0', X(0.02) - 140, Y(-0.06));
    } else {
      // 패드 주변 구리 링
      for (const p of PADS.concat(PRE)) {
        c.fillStyle = '#c9b27a';
        c.beginPath();
        c.arc(X(p.x), Y(p.y), 30, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.font = font(26, 700);
      c.save();
      c.scale(-1, 1);
      c.fillText('BOTTOM · SOLDER SIDE', -w + 40, h - 40);
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = font(24, 700);
      const lab = { R1a: 'R1', R2a: 'R2', C1a: 'C1', D1a: 'LED1', D2a: 'LED2' };
      for (const p of PADS) if (lab[p.id]) c.fillText(lab[p.id], X(p.x) - 20, Y(p.y) + 62);
    }
  }

  buildFumeExtractor() {
    const g = new THREE.Group();
    g.position.set(0.46, 0, -0.12);
    g.rotation.y = -0.5;
    this.root.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5 });
    box(0.14, 0.15, 0.06, body, { y: 0.085, round: 0.008, parent: g });
    box(0.12, 0.012, 0.08, body, { y: 0.006, static: true, parent: g });
    const filter = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 1 });
    box(0.115, 0.125, 0.006, filter, { y: 0.085, z: 0.031, static: true, parent: g });
    // 회전하는 팬
    const fan = new THREE.Group();
    fan.position.set(0, 0.085, 0.036);
    g.add(fan);
    for (let i = 0; i < 5; i++) {
      const blade = box(0.022, 0.05, 0.002, M.plasticMid, { y: 0.025, rz: 0.4, cast: false });
      const arm = new THREE.Group();
      arm.rotation.z = (i / 5) * Math.PI * 2;
      arm.add(blade);
      fan.add(arm);
    }
    cyl(0.012, 0.012, 0.006, M.plasticDark, { rx: Math.PI / 2, parent: fan });
    // 그릴
    for (let i = -2; i <= 2; i++) box(0.12, 0.002, 0.003, M.chrome, { y: 0.085 + i * 0.025, z: 0.041, cast: false, static: true, parent: g });
    const art = new CanvasArt(256, 64, (c, w, h) => {
      c.fillStyle = '#2b2f35';
      c.fillRect(0, 0, w, h);
      panelLabel(c, 'FUME EXTRACTOR', w / 2, h / 2, 22, '#cfd6de');
    });
    printPlane(0.12, 0.03, art.texture, { y: 0.16 - 0.004, z: 0.0305, static: true, parent: g });
    this.fan = fan;
    this.fanSound = this.ctx.audio.loop('fan', fan, { volume: 0.18, ref: 0.5, rolloff: 2 });
    this.ctx.interaction.add(new Interactable(g.children[0], {
      outline: false,
      info: { title: '흄 추출기', text: '납땜 연기(플럭스 흄)를 빨아들여 필터로 걸러줘요' },
    })).type = 'info';
  }

  buildPanel() {
    const { interaction } = this.ctx;
    this.panel = createStationPanel({
      width: 0.56,
      height: 0.62,
      getState: () => this.panelState(),
      buttons: [],
    });
    this.panel.mesh.position.set(-0.98, 0.62, -0.02);
    this.panel.mesh.rotation.y = 0.35;
    this.root.add(this.panel.mesh);
    interaction.add(new PanelItem(this.panel));
  }

  panelState() {
    const held = this.iron.state === 'held';
    let hint;
    if (this.done) hint = { text: '깜빡깜빡! 직접 만든 회로가 동작해요. 인두는 거치대에 꽂아두세요.', kind: 'ok' };
    else if (this.finale >= 0) hint = { text: '전원 테스트 중…', kind: 'info' };
    else if (!this.power) hint = { text: '왼쪽 인두 스테이션의 빨간 전원 스위치를 켜서 인두를 예열하세요.', kind: 'info' };
    else if (this.temp < 300) hint = { text: `예열 중… ${Math.round(this.temp)}°C (300°C 이상이면 납이 잘 녹아요)`, kind: 'warn' };
    else if (!held) hint = { text: '거치대의 인두 손잡이(파란 부분)를 잡으세요.', kind: 'info' };
    else hint = { text: '파란 고리가 있는 패드에 인두 팁을 대고 0.8초 유지하세요. 작은 원뿔 모양 납이 생기면 성공!', kind: 'info' };
    return {
      num: 4,
      title: '555 깜빡이 키트 납땜',
      goal: '인두로 패드 10곳을 납땜해 깜빡이 회로를 완성하세요.',
      done: this.done,
      steps: [
        { text: `인두 스테이션 전원 켜기 (${Math.round(this.temp)}°C)`, state: this.power && this.temp >= 300 ? 'done' : 'active' },
        { text: '인두 손잡이 잡기', state: held || this.soldered > 0 || this.done ? 'done' : this.power ? 'active' : 'todo' },
        { text: `납땜 포인트 완성 (${this.soldered}/10)`, state: this.soldered >= 10 ? 'done' : held ? 'active' : 'todo' },
        { text: '전원 테스트 — LED 깜빡임 확인', state: this.done ? 'done' : this.finale >= 0 ? 'active' : 'todo' },
      ],
      readoutHeight: 110,
      readout: (c, x, y, w) => {
        c.textBaseline = 'top';
        c.font = font(24, 500);
        c.fillStyle = COLORS.muted;
        c.fillText('진행도', x + 24, y + 16);
        const gx = x + 24;
        const gw = w - 48;
        for (let i = 0; i < 10; i++) {
          const pw = gw / 10 - 8;
          const p = this.pads[i];
          roundRect(c, gx + i * (pw + 8), y + 54, pw, 34, 8);
          c.fillStyle = p.done ? COLORS.ok : p.progress > 0 ? `rgba(255,181,71,${0.3 + p.progress * 0.6})` : 'rgba(255,255,255,0.08)';
          c.fill();
        }
      },
      formula: '좋은 납땜 = 반짝이는 원뿔(화산) 모양',
      hint: hint.text,
      hintKind: hint.kind,
    };
  }

  // -------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const { particles, audio } = this.ctx;
    // 온도
    const target = this.power ? 350 : 25;
    const prevT = Math.round(this.temp);
    this.temp += clamp(target - this.temp, -dt * 40, dt * 110);
    if (Math.round(this.temp) !== prevT) {
      this.tempArt.redraw();
      if ((prevT < 300 && this.temp >= 300) || (prevT >= 300 && this.temp < 300)) this.panel.redraw();
    }
    const hot = clamp((this.temp - 150) / 200, 0, 1);
    this.tipMat.emissiveIntensity = hot * 0.6;
    this.tipGlow.material.opacity = hot * 0.25;
    this.fan.rotation.z -= dt * 18;
    if (!this.fanSound.playing && audio.ctx.state === 'running') this.fanSound.start();

    // 인두 케이블
    const ironObj = this.iron.object;
    ironObj.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    const a = this.root.worldToLocal(this.cableOut.getWorldPosition(new THREE.Vector3()));
    const aDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.cableOut.getWorldQuaternion(new THREE.Quaternion())).transformDirection(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
    const b = this.root.worldToLocal(ironObj.localToWorld(this.cableLocal.clone()));
    const bDir = new THREE.Vector3(0, 0, 1).transformDirection(ironObj.matrixWorld).transformDirection(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
    this.cable.update(a, aDir.normalize(), b, bDir.normalize(), 0.16);

    // 납땜
    let heating = null;
    if (this.iron.state === 'held' && !this.done && this.finale < 0) {
      const tip = ironObj.localToWorld(this.tipLocal.clone());
      for (const p of this.pads) {
        if (p.done) continue;
        p.pad.getWorldPosition(p.world);
        if (p.world.distanceTo(tip) < 0.013) {
          heating = p;
          break;
        }
      }
      if (heating) {
        if (this.temp < 250) {
          if (!this.coldWarned) {
            this.coldWarned = true;
            this.ctx.toast.show('인두가 차가워요 🧊\n스테이션 전원을 켜고 예열하세요', 'warn', 3);
          }
        } else {
          const speed = this.temp >= 300 ? 1 / 0.8 : 1 / 2.0;
          heating.progress = Math.min(1, heating.progress + dt * speed);
          heating.joint.visible = true;
          const s = 0.15 + heating.progress * 0.85;
          heating.joint.scale.set(s, s, heating.progress);
          if (Math.random() < dt * 30) {
            particles.smoke.emit(heating.world, 1, { vel: new THREE.Vector3(0, 0.09, 0), velSpread: 0.025, life: [1.2, 2.4], size: [0.008, 0.06], alpha: 0.4, color: new THREE.Color(0.9, 0.9, 0.9), drag: 0.4 });
          }
          this.hapticT -= dt;
          if (this.hapticT <= 0) {
            this.hapticT = 0.08;
            this.iron.holder?.pulse(0.25 + heating.progress * 0.3, 40);
          }
          if (heating.progress >= 1) this.finishPad(heating);
          else if (Math.random() < dt * 4) this.panel.redraw();
        }
      }
      // 다른 손으로 팁을 만지면
      this.burnCooldown -= dt;
      if (this.temp > 200 && this.burnCooldown <= 0) {
        for (const p of this.ctx.pointers()) {
          if (!p.active || p === this.iron.holder || p.kind !== 'xr') continue;
          if (p.gripPos.distanceTo(tip) < 0.035 || p.tipPos.distanceTo(tip) < 0.025) {
            this.burnCooldown = 3;
            p.pulse(1.0, 300);
            audio.play('hiss', tip, { volume: 0.8 });
            particles.smoke.emit(tip, 8, { vel: new THREE.Vector3(0, 0.1, 0), velSpread: 0.04, life: [0.6, 1.2], size: [0.01, 0.04], alpha: 0.4, color: new THREE.Color(0.8, 0.8, 0.8) });
            this.ctx.toast.show('앗 뜨거워!! 🔥\n인두 팁은 절대 맨손으로 만지면 안 돼요', 'error', 3);
            this.ctx.missions.mistake('solder', 'burnHand');
          }
        }
      }
    }
    // 지글지글 소리
    if (heating && this.temp >= 250) {
      if (!this.sizzle) this.sizzle = audio.loop('sizzle', ironObj, { volume: 0.5, ref: 0.4, autoplay: false });
      if (!this.sizzle.playing) this.sizzle.start();
    } else if (this.sizzle?.playing) this.sizzle.stop();

    // 힌트 고리 깜빡임
    const k = 0.45 + 0.4 * Math.sin(this.time * 5);
    for (const p of this.pads) {
      p.ring.visible = !p.done && this.finale < 0;
      p.ring.material.opacity = p === heating ? 1 : k;
      p.ring.material.color.setHex(p === heating ? 0xffb547 : 0x38d9ff);
    }

    // 피날레: 보드 뒤집기 → LED 깜빡임
    if (this.finale >= 0) {
      this.finale += dt;
      const t = clamp((this.finale - 0.6) / 1.4, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.flipGroup.rotation.y = e * Math.PI;
      if (this.finale > 2.2) {
        const phase = Math.floor((this.finale - 2.2) * 2.4) % 2;
        setLEDBrightness(this.kitLeds[0], phase ? 1.4 : 0);
        setLEDBrightness(this.kitLeds[1], phase ? 0 : 1.4);
        if (!this.done && this.finale > 3.6) this.complete();
      }
    }
  }

  finishPad(p) {
    p.done = true;
    p.joint.scale.setScalar(1);
    this.soldered++;
    const { audio, particles } = this.ctx;
    audio.play('snap', p.world, { volume: 0.5, rate: 1.6 });
    particles.smoke.emit(p.world, 6, { vel: new THREE.Vector3(0, 0.12, 0), velSpread: 0.03, life: [1.2, 2.2], size: [0.01, 0.07], alpha: 0.45, color: new THREE.Color(0.92, 0.92, 0.92) });
    this.iron.holder?.pulse(0.6, 60);
    this.panel.redraw();
    if (this.soldered === 5) this.ctx.toast.show('절반 완료! 👍\n반짝이는 원뿔 모양이 좋은 납땜이에요', 'ok', 2.5);
    if (this.soldered >= PADS.length) {
      this.finale = 0;
      audio.play('chime', null, { volume: 0.7 });
      this.ctx.toast.show('납땜 완료! 전원 테스트를 해볼까요?\n보드를 뒤집어 앞면을 확인합니다', 'ok', 3.5);
      this.panel.redraw();
    }
  }

  complete() {
    this.done = true;
    const { missions, audio, toast } = this.ctx;
    if (missions.complete('solder', { joints: PADS.length })) {
      audio.play('success', null, { volume: 0.8 });
      toast.show('✔ 실험 4 완료!\n내가 만든 555 깜빡이가 동작해요 ✨', 'ok', 4.5);
    }
    this.panel.redraw();
  }

  reset() {
    this.power = false;
    this.rocker.rotation.x = 0.25;
    this.rockerMat.emissiveIntensity = 0;
    this.temp = 25;
    this.soldered = 0;
    this.done = false;
    this.finale = -1;
    this.warned = false;
    this.coldWarned = false;
    this.flipGroup.rotation.y = 0;
    for (const p of this.pads) {
      p.done = false;
      p.progress = 0;
      p.joint.visible = false;
      p.joint.scale.setScalar(0.001);
    }
    for (const l of this.kitLeds) setLEDBrightness(l, 0);
    this.ctx.interaction.sendHome(this.iron, true);
    this.tempArt.redraw();
    this.panel.redraw();
  }
}
