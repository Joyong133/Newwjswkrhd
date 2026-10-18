import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Panel } from '../core/panel.js';
import { C, font, MONO, clamp, roundRect } from '../core/util.js';
import { WHEELBASE } from './vehicle.js';

/*
 * 운전석(차 로컬 좌표: x 오른쪽, y 위, −z 앞, 원점 = 뒷바퀴 축 중심 바닥)
 * 운전석은 왼쪽(한국 좌측 운전석)
 */
export const EYE = new THREE.Vector3(-0.37, 1.17, -1.12);
const WHEEL_C = new THREE.Vector3(-0.37, 0.86, -1.58);
const WHEEL_R = 0.19;
const WHEEL_TILT = -0.42;
const LEVER_PIVOT = new THREE.Vector3(-0.02, 0.74, -1.28);
const LEVER_LEN = 0.17;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
}

export class Cockpit {
  constructor({ vehicle, interact, audio }) {
    this.vehicle = vehicle;
    this.interact = interact;
    this.audio = audio;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';
    this.wheelHands = new Map();
    this.leverHands = new Map();
    this.lever = 0;
    this.blink = 0;
    this.hazardBlink = false;
    this.listeners = {};
    this.buildBody();
    this.buildWheel();
    this.buildLever();
    this.buildButtons();
    this.buildDash();
  }

  on(evt, fn) {
    (this.listeners[evt] ||= []).push(fn);
  }

  emit(evt, ...a) {
    for (const fn of this.listeners[evt] || []) fn(...a);
  }

  // -------------------------------------------------------------------------
  buildBody() {
    const g = this.group;
    const dark = mat(0x23262b, { roughness: 0.8 });
    const trim = mat(0x3a3e45, { roughness: 0.7 });
    const paint = mat(0xf2f4f7, { roughness: 0.25, metalness: 0.3 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
      return mesh;
    };
    // 대시보드
    add(new RoundedBoxGeometry(1.72, 0.26, 0.5, 3, 0.05), dark, 0, 0.86, -1.98);
    add(new RoundedBoxGeometry(1.7, 0.06, 0.42, 3, 0.03), trim, 0, 1.0, -2.02, -0.12);
    // 계기판 덮개
    const cowl = add(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 24, 1, true, 0, Math.PI), mat(0x23262b, { roughness: 0.8, side: THREE.DoubleSide }), -0.37, 1.05, -1.9, 0, 0, Math.PI / 2);
    cowl.scale.set(1, 1, 0.8);
    // 센터 콘솔
    add(new RoundedBoxGeometry(0.3, 0.42, 0.9, 3, 0.04), dark, -0.02, 0.48, -1.32);
    add(new RoundedBoxGeometry(0.26, 0.03, 0.62, 3, 0.012), trim, -0.02, 0.705, -1.36);
    // 시트
    add(new RoundedBoxGeometry(0.52, 0.14, 0.52, 3, 0.05), mat(0x2c2f36), -0.37, 0.42, -0.98);
    add(new RoundedBoxGeometry(0.52, 0.72, 0.14, 3, 0.05), mat(0x2c2f36), -0.37, 0.8, -0.66, -0.2);
    // 문(좌우)
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.55, 1.5), trim, sx * 0.88, 0.7, -1.2);
      add(new THREE.BoxGeometry(0.08, 0.04, 1.5), dark, sx * 0.88, 0.99, -1.2);
    }
    // A 필러·지붕
    for (const sx of [-1, 1]) {
      const a = add(new THREE.BoxGeometry(0.07, 0.75, 0.07), dark, sx * 0.76, 1.24, -1.84, 0.95, 0, sx * -0.12);
      a.name = 'pillar';
      add(new THREE.BoxGeometry(0.07, 0.6, 0.08), dark, sx * 0.8, 1.25, -0.25);
    }
    add(new THREE.BoxGeometry(1.62, 0.06, 1.75), mat(0x9a9ca2, { roughness: 0.9 }), 0, 1.54, -0.75);
    add(new THREE.BoxGeometry(1.5, 0.1, 0.12), dark, 0, 1.5, -1.6);
    // 룸미러
    add(new RoundedBoxGeometry(0.24, 0.07, 0.03, 2, 0.015), dark, 0, 1.42, -1.6);
    add(new THREE.PlaneGeometry(0.22, 0.055), mat(0x9fb4c8, { metalness: 0.9, roughness: 0.1 }), 0, 1.42, -1.584);
    // 보닛
    const hood = add(new RoundedBoxGeometry(1.7, 0.12, 1.5, 3, 0.05), paint, 0, 0.95, -2.95, 0.08);
    hood.name = 'hood';
    // 사이드미러
    for (const sx of [-1, 1]) {
      add(new RoundedBoxGeometry(0.2, 0.13, 0.08, 2, 0.03), paint, sx * 1.0, 1.06, -1.8);
      add(new THREE.PlaneGeometry(0.17, 0.1), mat(0x9fb4c8, { metalness: 0.9, roughness: 0.1 }), sx * 1.0, 1.06, -1.758);
    }
    // 앞바퀴(보닛 옆 살짝 보임)
    this.frontWheels = [-1, 1].map((sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.78, 0.32, -WHEELBASE);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), mat(0x18191b, { roughness: 0.9 }));
      tire.rotation.z = Math.PI / 2;
      w.add(tire);
      g.add(w);
      return w;
    });
  }

  buildWheel() {
    const g = new THREE.Group();
    g.position.copy(WHEEL_C);
    g.rotation.x = WHEEL_TILT;
    this.group.add(g);
    this.wheelFrame = g;
    const spin = new THREE.Group();
    g.add(spin);
    this.wheelSpin = spin;
    const rimMat = mat(0x1b1d21, { roughness: 0.5 });
    this.rimMat = rimMat;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, 0.019, 12, 56), rimMat);
    spin.add(rim);
    const spokeMat = mat(0x3a3e45, { metalness: 0.4 });
    for (const a of [0, Math.PI, -Math.PI / 2]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(WHEEL_R, 0.035, 0.02), spokeMat);
      sp.position.set(Math.cos(a) * WHEEL_R * 0.5, Math.sin(a) * WHEEL_R * 0.5, -0.01);
      sp.rotation.z = a;
      spin.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 24), mat(0x2a2d33));
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.01;
    spin.add(hub);
    // 12시 표시(핸들 각도를 보기 쉽게)
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.042), mat(0xffb547, { emissive: 0x402800 }));
    top.position.set(0, WHEEL_R, 0);
    spin.add(top);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.32, 12), mat(0x1b1d21));
    col.rotation.x = Math.PI / 2;
    col.position.z = -0.17;
    g.add(col);
  }

  buildLever() {
    const pivot = new THREE.Group();
    pivot.position.copy(LEVER_PIVOT);
    this.group.add(pivot);
    this.leverPivot = pivot;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, LEVER_LEN, 10), mat(0x8a9099, { metalness: 0.7 }));
    rod.position.y = LEVER_LEN / 2;
    const knobMat = mat(0x38d9ff, { emissive: 0x0a2a33 });
    this.knobMat = knobMat;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), knobMat);
    knob.position.y = LEVER_LEN;
    pivot.add(rod, knob);
    this.leverKnob = knob;
    // 레버 받침과 안내 글자
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.3), mat(0x15171a));
    plate.position.set(LEVER_PIVOT.x, LEVER_PIVOT.y - 0.03, LEVER_PIVOT.z);
    this.group.add(plate);
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 640;
    const c = cv.getContext('2d');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(48, 900);
    c.fillStyle = '#3ddc97';
    c.fillText('▲ 가속', 128, 70);
    c.fillStyle = '#93a6c3';
    c.font = font(34, 700);
    c.fillText('놓으면 중립', 128, 320);
    c.font = font(48, 900);
    c.fillStyle = '#ff5d6c';
    c.fillText('▼ 브레이크', 128, 570);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.25), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(LEVER_PIVOT.x + 0.13, LEVER_PIVOT.y - 0.02, LEVER_PIVOT.z);
    this.group.add(label);
  }

  /** 손가락으로 누르는 버튼들 */
  buildButtons() {
    const veh = this.vehicle;
    const defs = [
      // 핸들 왼쪽 기둥
      { id: 'sigL', label: '◀ 좌 깜빡이', x: -0.67, y: 0.99, z: -1.6, on: () => veh.signal === 'left', blink: true, color: 0x3ddc97, press: () => this.setSignal('left') },
      { id: 'lights', label: '전조등', x: -0.67, y: 0.92, z: -1.62, on: () => veh.lights, color: 0x38d9ff, press: () => this.toggle('lights') },
      { id: 'wiper', label: '와이퍼', x: -0.67, y: 0.85, z: -1.64, on: () => veh.wiper, color: 0x38d9ff, press: () => this.toggle('wiper') },
      // 핸들 오른쪽 기둥
      { id: 'sigR', label: '우 깜빡이 ▶', x: -0.07, y: 0.99, z: -1.6, on: () => veh.signal === 'right', blink: true, color: 0x3ddc97, press: () => this.setSignal('right') },
      { id: 'engine', label: '시동', sub: 'START', x: -0.07, y: 0.92, z: -1.62, on: () => veh.engine, color: 0xff5d6c, press: () => this.toggleEngine() },
      { id: 'hazard', label: '▲ 비상등', x: -0.07, y: 0.85, z: -1.64, on: () => veh.hazard, blink: true, color: 0xff5d6c, press: () => this.toggle('hazard') },
      // 센터 콘솔: 기어
      { id: 'P', label: 'P', x: -0.07, y: 0.73, z: -1.56, on: () => veh.gear === 'P', color: 0xffb547, w: 0.055, press: () => this.setGear('P') },
      { id: 'R', label: 'R', x: 0.0, y: 0.73, z: -1.56, on: () => veh.gear === 'R', color: 0xffb547, w: 0.055, press: () => this.setGear('R') },
      { id: 'N', label: 'N', x: -0.07, y: 0.73, z: -1.49, on: () => veh.gear === 'N', color: 0xffb547, w: 0.055, press: () => this.setGear('N') },
      { id: 'D', label: 'D', x: 0.0, y: 0.73, z: -1.49, on: () => veh.gear === 'D', color: 0xffb547, w: 0.055, press: () => this.setGear('D') },
      // 콘솔 뒤쪽
      { id: 'pbrake', label: '주차브레이크', x: 0.09, y: 0.73, z: -1.2, on: () => veh.parkBrake, color: 0xff5d6c, w: 0.09, press: () => this.toggle('parkBrake') },
      { id: 'belt', label: '안전벨트', x: -0.15, y: 0.73, z: -1.08, on: () => veh.belt, color: 0x3ddc97, w: 0.09, press: () => this.toggle('belt') },
      // 대시보드 가운데
      { id: 'menu', label: '☰ 메뉴', x: 0.16, y: 0.99, z: -1.72, on: () => false, color: 0x38d9ff, w: 0.11, press: () => this.emit('menu') },
      { id: 'seat', label: '자리 맞춤', x: 0.16, y: 0.92, z: -1.72, on: () => false, color: 0x38d9ff, w: 0.11, press: () => this.emit('recenter') },
    ];
    this.buttons = defs.map((d) => {
      const w = d.w || 0.1;
      const h = 0.05;
      const flat = d.y < 0.8; // 콘솔 위 버튼은 위를 향해 눕힌다
      const m = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, emissive: 0x000000 });
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.022, 2, 0.008), m);
      mesh.position.set(d.x, d.y, d.z);
      if (flat) mesh.rotation.x = -Math.PI / 2 + 0.25;
      else mesh.rotation.x = -0.25;
      const cv = document.createElement('canvas');
      cv.width = Math.round(256 * (w / 0.1));
      cv.height = 128;
      const c = cv.getContext('2d');
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const fs = d.label.length > 4 ? 40 : 58;
      c.font = font(d.sub ? 50 : fs, 900);
      c.fillText(d.label, cv.width / 2, d.sub ? 50 : 66, cv.width - 16);
      if (d.sub) {
        c.font = font(30, 700);
        c.fillText(d.sub, cv.width / 2, 100);
      }
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      const lmat = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, color: 0xcfd8e6 });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.9), lmat);
      label.position.z = 0.0115;
      label.raycast = () => {};
      mesh.add(label);
      this.group.add(mesh);
      const btn = this.interact.addButton(mesh, { onPress: d.press, onHover: (on) => (mesh.userData.hover = on) });
      return { ...d, mesh, mat: m, lmat, btn };
    });
  }

  buildDash() {
    this.dash = new Panel({
      width: 0.34,
      height: 0.12,
      px: 900,
      name: 'dash',
      draw: (c, w, h) => this.drawDash(c, w, h),
    });
    this.dash.mesh.position.set(-0.37, 1.04, -1.86);
    this.dash.mesh.rotation.x = -0.2;
    this.group.add(this.dash.mesh);
    this.dashTimer = 0;
  }

  drawDash(c, w, h) {
    const v = this.vehicle;
    c.fillStyle = '#05080f';
    roundRect(c, 0, 0, w, h, 40);
    c.fill();
    const on = v.engine;
    // 속도
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = on ? '#ffffff' : '#3a4250';
    c.font = font(150, 800, MONO);
    c.fillText(Math.round(v.kmh).toString(), w / 2, h * 0.47);
    c.font = font(34, 700);
    c.fillStyle = C.muted;
    c.fillText('km/h', w / 2, h * 0.86);
    // 기어
    c.font = font(40, 800, MONO);
    ['P', 'R', 'N', 'D'].forEach((g, i) => {
      c.fillStyle = v.gear === g ? '#ffb547' : '#3a4250';
      c.fillText(g, w - 170 + i * 42, h * 0.3);
    });
    // 가속/브레이크 막대
    const bx = w - 190;
    const by = h * 0.55;
    roundRect(c, bx, by, 160, 22, 11);
    c.fillStyle = '#1a2230';
    c.fill();
    if (v.throttle > 0.02) {
      c.fillStyle = C.ok;
      c.fillRect(bx + 80, by + 3, 78 * v.throttle, 16);
    }
    if (v.brake > 0.02) {
      c.fillStyle = C.bad;
      c.fillRect(bx + 80 - 78 * v.brake, by + 3, 78 * v.brake, 16);
    }
    c.fillStyle = C.muted;
    c.font = font(24, 600);
    c.fillText('브레이크 · 가속', bx + 80, by + 48);
    // 방향지시등
    const lit = this.blink < 0.5;
    const arrow = (x, dir, active) => {
      c.fillStyle = active && lit ? '#3ddc97' : '#1e2a24';
      c.beginPath();
      c.moveTo(x + dir * 40, 50);
      c.lineTo(x, 22);
      c.lineTo(x, 78);
      c.closePath();
      c.fill();
    };
    arrow(60, -1, v.signal === 'left' || v.hazard);
    arrow(w - 60, 1, v.signal === 'right' || v.hazard);
    // 경고등
    c.font = font(28, 800);
    c.textAlign = 'left';
    const warn = [];
    if (on && !v.belt) warn.push(['벨트', C.bad]);
    if (v.parkBrake) warn.push(['(P) 주차브레이크', C.bad]);
    if (v.lights) warn.push(['전조등', C.accent]);
    if (v.wiper) warn.push(['와이퍼', C.accent]);
    if (!on) warn.push(['시동 꺼짐', '#93a6c3']);
    warn.forEach(([t, col], i) => {
      c.fillStyle = col;
      c.fillText(t, 30 + (i % 2) * 150, h * 0.62 + Math.floor(i / 2) * 38);
    });
  }

  // -------------------------------------------------------------------------
  // 조작
  // -------------------------------------------------------------------------
  setSignal(dir) {
    const v = this.vehicle;
    v.signal = v.signal === dir ? 'off' : dir;
    v.signalPeak = 0;
    this.emit('control', `signal-${v.signal}`);
  }

  toggle(key) {
    this.vehicle[key] = !this.vehicle[key];
    this.emit('control', key);
  }

  toggleEngine() {
    const v = this.vehicle;
    if (v.engine && Math.abs(v.v) > 0.3) return;
    v.engine = !v.engine;
    this.audio.play(v.engine ? 'start' : 'tick');
    this.emit('control', 'engine');
  }

  setGear(g) {
    const v = this.vehicle;
    if (!v.engine && g !== 'P' && g !== 'N') {
      this.emit('hint', '먼저 시동을 켜세요');
      return;
    }
    if ((g === 'P' || g === 'R') && Math.abs(v.v) > 0.5) {
      this.emit('hint', '완전히 멈춘 뒤 바꾸세요');
      return;
    }
    v.gear = g;
    this.emit('control', `gear-${g}`);
  }

  /** 포인터 손 위치 → 핸들 평면 로컬 좌표 */
  wheelLocal(p, out) {
    out.copy(p.grabPos);
    this.wheelFrame.worldToLocal(out);
    return out;
  }

  // -------------------------------------------------------------------------
  update(dt, { pointers, desktop }) {
    const veh = this.vehicle;
    this.group.updateMatrixWorld(true);

    // 잡기 시작/끝
    for (const p of pointers) {
      if (!p.active) continue;
      if (p.justGrab && !p.claimed) {
        const l = this.wheelLocal(p, _v);
        const r = Math.hypot(l.x, l.y);
        const tol = p.kind === 'hand' ? 0.075 : 0.09;
        const knob = this.leverKnob.getWorldPosition(_w);
        if (knob.distanceTo(p.grabPos) < (p.kind === 'hand' ? 0.07 : 0.08)) {
          p.claimed = 'lever';
          this.leverHands.set(p, this.group.worldToLocal(p.grabPos.clone()).z - (-this.lever * 0.12));
          p.pulse(0.5, 30);
          this.audio.play('grab');
        } else if (Math.abs(r - WHEEL_R) < tol && Math.abs(l.z) < tol) {
          p.claimed = 'wheel';
          this.wheelHands.set(p, Math.atan2(l.y, l.x));
          p.pulse(0.5, 30);
          this.audio.play('grab');
        }
      }
    }
    for (const [p] of this.wheelHands) {
      if (!p.active || !p.grab) {
        this.wheelHands.delete(p);
        if (p.claimed === 'wheel') p.claimed = null;
      }
    }
    for (const [p] of this.leverHands) {
      if (!p.active || !p.grab) {
        this.leverHands.delete(p);
        if (p.claimed === 'lever') p.claimed = null;
      }
    }

    // 핸들 돌리기: 잡은 손들의 각도 변화 평균
    let held = this.wheelHands.size > 0;
    if (held) {
      let sum = 0;
      for (const [p, prev] of this.wheelHands) {
        const l = this.wheelLocal(p, _v);
        const a = Math.atan2(l.y, l.x);
        let d = a - prev;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        sum += d;
        this.wheelHands.set(p, a);
      }
      const before = veh.steer;
      veh.steer += ((sum / this.wheelHands.size) * 180) / Math.PI;
      veh.steer = clamp(veh.steer, -450, 450);
      if (Math.floor(before / 30) !== Math.floor(veh.steer / 30)) for (const [p] of this.wheelHands) p.pulse(0.12, 10);
    }

    // 레버(손): 앞으로 밀면 가속, 당기면 브레이크, 놓으면 0 으로 복귀
    if (this.leverHands.size) {
      const [p, z0] = this.leverHands.entries().next().value;
      const z = this.group.worldToLocal(p.grabPos.clone()).z;
      this.lever = clamp((z0 - z) / 0.12, -1, 1);
    } else {
      this.lever += (0 - this.lever) * Math.min(1, dt * 10);
      if (Math.abs(this.lever) < 0.01) this.lever = 0;
    }

    // 페달 입력 합치기
    let thr = Math.max(0, this.lever);
    let brk = Math.max(0, -this.lever);
    let stickSteer = 0;
    for (const p of pointers) {
      if (!p.active || p.kind !== 'controller') continue;
      // 핸들을 잡은 컨트롤러의 트리거 = 페달(오른손 가속, 왼손 브레이크)
      // 핸들을 안 잡았으면 UI 를 가리키지 않을 때만 페달
      const pedal = p.claimed === 'wheel' || !p.hit;
      if (pedal && p.trigger > 0.05) {
        if (p.handedness === 'right') thr = Math.max(thr, p.trigger);
        else brk = Math.max(brk, p.trigger);
      }
      // 스틱 운전(핸들을 안 잡아도 됨)
      if (p.handedness === 'left') stickSteer = -p.axes.x;
      if (p.handedness === 'right') {
        if (p.axes.y < -0.15) thr = Math.max(thr, -p.axes.y);
        if (p.axes.y > 0.15) brk = Math.max(brk, p.axes.y);
      }
    }
    if (desktop) {
      const k = desktop.drive();
      thr = Math.max(thr, k.accel);
      brk = Math.max(brk, k.brake);
      stickSteer = k.steer;
    }
    if (Math.abs(stickSteer) > 0.15) {
      veh.steer += stickSteer * 300 * dt;
      held = true;
    }
    veh.throttle = thr;
    veh.brake = brk;
    // 손을 놓으면 주행 중 핸들이 조금씩 가운데로
    if (!held && Math.abs(veh.v) > 0.5) veh.steer -= veh.steer * Math.min(1, dt * 0.9 * Math.min(1, Math.abs(veh.v) / 4));

    // 시각 갱신
    this.wheelSpin.rotation.z = (veh.steer * Math.PI) / 180;
    this.rimMat.color.setHex(this.wheelHands.size ? 0x2b5f73 : 0x1b1d21);
    this.leverPivot.rotation.x = -this.lever * 0.45;
    this.knobMat.emissive.setHex(this.leverHands.size ? 0x1f6f88 : this.lever > 0.05 ? 0x0f5c3a : this.lever < -0.05 ? 0x5c0f18 : 0x0a2a33);
    for (const w of this.frontWheels) w.rotation.y = veh.roadWheelAngle;
    this.blink = (this.blink + dt * 1.6) % 1;
    const lit = this.blink < 0.5;
    if (lit !== this.lastLit && (veh.signal !== 'off' || veh.hazard)) this.audio.play(lit ? 'tick' : 'tock');
    this.lastLit = lit;
    for (const b of this.buttons) {
      const on = b.on();
      const show = on && (!b.blink || lit);
      b.mat.emissive.setHex(show ? b.color : b.mesh.userData.hover ? 0x1a3a48 : 0x000000);
      b.mat.emissiveIntensity = show ? 0.9 : 1;
      b.lmat.color.setHex(on ? 0xffffff : 0xcfd8e6);
    }
    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.dashTimer = 1 / 12;
      this.dash.redraw();
    }
  }

  /** 물리 갱신 뒤 차 위치 반영 */
  place() {
    const veh = this.vehicle;
    this.group.position.set(veh.x, veh.y, veh.z);
    this.group.rotation.set(veh.pitch, veh.heading, 0, 'YXZ');
    this.group.updateMatrixWorld(true);
  }
}
