import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { Knob, Button, Interactable, PanelItem } from '../core/interaction.js';
import { M, box, cyl, makeInstrumentCase, makeKnob, makePushButton, makeIndicator, makeBNC, screenPlane, printPlane, markStatic } from '../world/props.js';
import { BENCH } from '../world/lab.js';
import { COLORS, clamp, font, formatSI, roundRect, MONO } from '../core/util.js';
import { createStationPanel, panelLabel, lcdBackground } from './common.js';

const WAVES = {
  sine: { name: '사인파', icon: '∿', fn: (p) => Math.sin(p * Math.PI * 2) },
  square: { name: '구형파', icon: '⊓', fn: (p) => (p % 1 < 0.5 ? 1 : -1) },
  tri: { name: '삼각파', icon: '⋀', fn: (p) => { const x = p % 1; return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4; } },
};
const VDIV = [0.1, 0.2, 0.5, 1, 2, 5];
const TDIV = [10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3];
const TARGETS = [
  { wave: 'sine', f: 1000, vpp: 4 },
  { wave: 'square', f: 250, vpp: 2 },
  { wave: 'tri', f: 5000, vpp: 6 },
];

const fmtF = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2)} kHz` : `${f.toFixed(f >= 100 ? 0 : 1)} Hz`);
const fmtT = (t) => formatSI(t, 's', 3).replace(' ', '');

/**
 * 실험 2: 함수발생기 + 오실로스코프
 */
export class ScopeStation {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.position.y = BENCH.H + 0.004;
    ctx.bench.add(this.root);

    this.gen = { wave: 'sine', k: 20, amp: 1.0, on: false };
    this.scope = { v: 3, t: 6, run: true };
    this.round = 0;
    this.hold = 0;
    this.done = false;
    this.redrawTimer = 0;
    this.time = 0;
    this.roundDone = [false, false, false];

    this.buildScope();
    this.buildGenerator();
    this.buildCable();
    this.buildPanel();
    this.dirty();
  }

  get freq() {
    return 10 ** (this.gen.k / 10);
  }

  // -------------------------------------------------------------------------
  buildScope() {
    const { interaction } = this.ctx;
    const sc = makeInstrumentCase(0.42, 0.22, 0.17, 0x3a3f46, 0x23272c);
    sc.position.set(0.1, BENCH.shelfLift, -BENCH.D / 2 + 0.19);
    sc.rotation.x = -0.0;
    this.root.add(sc);
    interaction.addBlocker(sc.userData.body);
    const f = sc.userData.front;
    const labels = new CanvasArt(840, 440, (c, w, h) => {
      c.fillStyle = '#23272c';
      c.fillRect(0, 0, w, h);
      panelLabel(c, 'EE·LAB', 70, 410, 24, '#38d9ff', 'left', 900);
      panelLabel(c, 'DSO-2104  ·  100 MHz  ·  1 GSa/s', 160, 410, 17, '#9aa5b1', 'left', 500);
      panelLabel(c, 'POWER', 34, 380, 11, '#9aa5b1');
      panelLabel(c, 'VERTICAL', 620, 52, 17, '#f2c94c');
      panelLabel(c, 'HORIZONTAL', 740, 52, 17, '#9aa5b1');
      panelLabel(c, 'VOLTS/DIV', 620, 170, 15);
      panelLabel(c, 'TIME/DIV', 740, 170, 15);
      panelLabel(c, 'AUTO', 620, 262, 15, '#3ddc97');
      panelLabel(c, 'RUN/STOP', 740, 262, 15);
      panelLabel(c, 'CH1', 620, 398, 17, '#f2c94c');
      panelLabel(c, 'CH2', 740, 398, 17, '#4fc3f7');
      c.strokeStyle = 'rgba(220,220,220,0.2)';
      c.lineWidth = 2;
      c.strokeRect(560, 30, 250, 170);
    });
    printPlane(0.414, 0.214, labels.texture, { y: 0.11, z: 0.0005, roughness: 0.6, static: true, parent: f });

    // 화면
    this.screenArt = new CanvasArt(640, 440, (c, w, h) => this.drawScreen(c, w, h), { autoRedraw: false, mipmaps: false });
    box(0.232, 0.162, 0.004, M.plasticDark, { x: -0.07, y: 0.12, z: 0.001, static: true, parent: f });
    this.screen = screenPlane(0.22, 0.151, this.screenArt.texture, { x: -0.07, y: 0.12, z: 0.0035, parent: f });
    interaction.add(new Interactable(this.screen, {
      outline: false,
      info: () => ({ title: '오실로스코프 화면', text: `가로 1칸 = ${fmtT(TDIV[this.scope.t])} · 세로 1칸 = ${VDIV[this.scope.v]} V\n노란선 = 측정 신호, 분홍 점선 = 목표 파형` }),
    })).type = 'info';

    // 노브
    const mkKnob = (x, y, color, onStep, info) => {
      const k = makeKnob(0.016, 0.014, color);
      k.position.set(x, y, 0.002);
      f.add(k);
      interaction.add(new Knob(k, { detent: THREE.MathUtils.degToRad(24), grabRadius: 0.028, onStep, info }));
      return k;
    };
    mkKnob(0.1, 0.143, 0xd9b23a, (d) => {
      const v = clamp(this.scope.v + d, 0, VDIV.length - 1);
      if (v === this.scope.v) return false;
      this.scope.v = v;
      this.dirty();
      return true;
    }, () => ({ title: 'VOLTS/DIV (세로 감도)', text: `현재 ${VDIV[this.scope.v]} V/칸\n시계방향 = 크게 보기(감도↑)` }));
    mkKnob(0.16, 0.143, 0x8e99a6, (d) => {
      const t = clamp(this.scope.t - d, 0, TDIV.length - 1);
      if (t === this.scope.t) return false;
      this.scope.t = t;
      this.dirty();
      return true;
    }, () => ({ title: 'TIME/DIV (가로 시간축)', text: `현재 ${fmtT(TDIV[this.scope.t])}/칸\n시계방향 = 더 짧은 시간(확대)` }));

    const mkBtn = (x, y, color, onPress, info) => {
      const { group, cap } = makePushButton(0.026, 0.014, color);
      group.position.set(x, y, 0.002);
      f.add(group);
      interaction.add(new Button(group, { cap, colliders: [cap], onPress, info }));
      return group;
    };
    mkBtn(0.1, 0.092, 0x2f8f5f, () => this.autoSet(), { title: 'AUTO SET', text: '신호에 맞게 V/DIV, TIME/DIV 자동 설정' });
    this.runLed = makeIndicator(0x3ddc97, 0.003);
    this.runLed.position.set(0.16, 0.108, 0.003);
    this.runLed.userData.setOn(true);
    f.add(this.runLed);
    mkBtn(0.16, 0.092, 0x5a6470, () => {
      this.scope.run = !this.scope.run;
      this.runLed.userData.setOn(this.scope.run);
      this.dirty();
    }, () => ({ title: 'RUN / STOP', text: this.scope.run ? '실행 중 — 누르면 화면 정지' : '정지됨 — 누르면 다시 실행' }));

    const ch1 = makeBNC();
    ch1.position.set(0.1, 0.03, 0.002);
    f.add(ch1);
    const ch2 = makeBNC();
    ch2.position.set(0.16, 0.03, 0.002);
    f.add(ch2);
    this.ch1 = ch1;
    // 전원 버튼
    const pw = cyl(0.007, 0.007, 0.006, M.plasticLight, { rx: Math.PI / 2, x: -0.19, y: 0.022, z: 0.003, static: true, parent: f });
    void pw;
    sc.updateMatrixWorld(true);
    this.scopeCase = sc;
    interaction.add(new Interactable(sc.userData.body, {
      outline: false,
      info: { title: '디지털 오실로스코프', text: '전압이 시간에 따라 어떻게 변하는지 그려주는 장비' },
    })).type = 'info';
  }

  buildGenerator() {
    const { interaction } = this.ctx;
    const fg = makeInstrumentCase(0.28, 0.12, 0.25, 0xcfd3d7, 0x2c3138);
    fg.position.set(-0.4, 0, 0.0);
    fg.rotation.y = 0.18;
    this.root.add(fg);
    interaction.addBlocker(fg.userData.body);
    const f = fg.userData.front;
    const labels = new CanvasArt(560, 240, (c, w, h) => {
      c.fillStyle = '#2c3138';
      c.fillRect(0, 0, w, h);
      panelLabel(c, 'EE·LAB  FG-2000  FUNCTION GENERATOR', 24, 20, 15, '#aab4c0', 'left', 700);
      panelLabel(c, 'SINE', 50, 228, 13);
      panelLabel(c, 'SQUARE', 120, 228, 13);
      panelLabel(c, 'TRI', 190, 228, 13);
      panelLabel(c, 'FREQ', 390, 40, 15, '#38d9ff');
      panelLabel(c, 'AMPL', 492, 40, 15, '#f2c94c');
      panelLabel(c, 'OUTPUT', 492, 228, 13);
      panelLabel(c, '50Ω OUT', 390, 228, 13);
    });
    printPlane(0.274, 0.117, labels.texture, { y: 0.06, z: 0.0005, roughness: 0.6, static: true, parent: f });
    this.genArt = new CanvasArt(512, 168, (c, w, h) => this.drawGen(c, w, h), { autoRedraw: false, mipmaps: false });
    box(0.136, 0.05, 0.004, M.plasticDark, { x: -0.055, y: 0.074, z: 0.001, static: true, parent: f });
    markStatic(screenPlane(0.128, 0.042, this.genArt.texture, { x: -0.055, y: 0.074, z: 0.0035, parent: f }));

    // 파형 버튼
    this.waveLeds = {};
    ['sine', 'square', 'tri'].forEach((wv, i) => {
      const x = -0.115 + i * 0.035;
      const { group, cap } = makePushButton(0.024, 0.012, 0x4a525c);
      group.position.set(x, 0.022, 0.002);
      f.add(group);
      const led = makeIndicator(0x38d9ff, 0.0026);
      led.position.set(x, 0.036, 0.003);
      f.add(led);
      this.waveLeds[wv] = led;
      interaction.add(new Button(group, {
        cap,
        colliders: [cap],
        info: { title: `${WAVES[wv].name} ${WAVES[wv].icon}`, text: '파형 종류 선택' },
        onPress: () => {
          this.gen.wave = wv;
          this.ctx.missions.touch('scope');
          this.dirty();
        },
      }));
    });

    const fk = makeKnob(0.022, 0.016, 0x2a2d32, { capMaterial: M.chrome });
    fk.position.set(0.055, 0.06, 0.002);
    f.add(fk);
    interaction.add(new Knob(fk, {
      detent: THREE.MathUtils.degToRad(22),
      grabRadius: 0.032,
      info: () => ({ title: 'FREQ 주파수 노브', text: `현재 ${fmtF(this.freq)} · 한 칸에 약 ×1.26\n시계방향 = 주파수 ↑` }),
      onStep: (d) => {
        const k = clamp(this.gen.k + d, 10, 43);
        if (k === this.gen.k) return false;
        this.gen.k = k;
        this.ctx.missions.touch('scope');
        this.dirty();
        return true;
      },
    }));
    const ak = makeKnob(0.015, 0.014, 0x2a2d32);
    ak.position.set(0.107, 0.065, 0.002);
    f.add(ak);
    interaction.add(new Knob(ak, {
      detent: THREE.MathUtils.degToRad(22),
      grabRadius: 0.026,
      info: () => ({ title: 'AMPL 진폭 노브', text: `현재 ${this.gen.amp.toFixed(1)} Vpp · 0.5 V 단위\n시계방향 = 진폭 ↑` }),
      onStep: (d) => {
        const a = clamp(Math.round((this.gen.amp + d * 0.5) * 10) / 10, 0.5, 10);
        if (a === this.gen.amp) return false;
        this.gen.amp = a;
        this.ctx.missions.touch('scope');
        this.dirty();
        return true;
      },
    }));
    const { group: ob, cap: oc } = makePushButton(0.026, 0.013, 0x3a4048);
    ob.position.set(0.107, 0.022, 0.002);
    f.add(ob);
    this.outLed = makeIndicator(0x3ddc97, 0.0028);
    this.outLed.position.set(0.124, 0.022, 0.003);
    f.add(this.outLed);
    interaction.add(new Button(ob, {
      cap: oc,
      colliders: [oc],
      info: () => ({ title: 'OUTPUT', text: this.gen.on ? '출력 ON — 오실로스코프로 신호가 나가요' : '누르면 신호 출력 시작' }),
      onPress: () => {
        this.gen.on = !this.gen.on;
        this.outLed.userData.setOn(this.gen.on);
        this.ctx.audio.play('relay', ob, { volume: 0.6 });
        this.ctx.missions.touch('scope');
        this.dirty();
      },
    }));
    const bnc = makeBNC();
    bnc.position.set(0.055, 0.02, 0.002);
    f.add(bnc);
    this.genBnc = bnc;
    fg.updateMatrixWorld(true);
    this.genCase = fg;
    interaction.add(new Interactable(fg.userData.body, {
      outline: false,
      info: { title: '함수발생기', text: '원하는 모양·주파수·진폭의 전압 신호를 만들어요' },
    })).type = 'info';
  }

  buildCable() {
    this.root.updateMatrixWorld(true);
    const a = this.root.worldToLocal(this.genBnc.localToWorld(new THREE.Vector3(0, 0, 0.016)));
    const b = this.root.worldToLocal(this.ch1.localToWorld(new THREE.Vector3(0, 0, 0.016)));
    const pts = [
      a,
      a.clone().add(new THREE.Vector3(0.0, -0.0, 0.05)),
      new THREE.Vector3((a.x + b.x) / 2 - 0.05, 0.012, 0.16),
      new THREE.Vector3(b.x - 0.05, b.y - 0.17, b.z + 0.12),
      b.clone().add(new THREE.Vector3(0, -0.02, 0.06)),
      b,
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.0028, 8, false), M.cableBlack);
    tube.castShadow = true;
    tube.userData.static = true;
    this.root.add(tube);
    for (const [p, q] of [[a, pts[1]], [b, pts[4]]]) {
      const plug = cyl(0.0068, 0.0068, 0.02, M.chrome, { static: true });
      plug.position.copy(p).lerp(q, 0.15);
      plug.lookAt(this.root.localToWorld(q.clone()));
      plug.rotateX(Math.PI / 2);
      this.root.add(plug);
    }
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

  // -------------------------------------------------------------------------
  autoSet() {
    const vpp = this.gen.on ? this.gen.amp : 1;
    let v = VDIV.findIndex((d) => vpp / d <= 6);
    if (v < 0) v = VDIV.length - 1;
    const period = 1 / (this.gen.on ? this.freq : 1000);
    let t = TDIV.findIndex((d) => d * 10 >= period * 2.2);
    if (t < 0) t = TDIV.length - 1;
    this.scope.v = v;
    this.scope.t = t;
    this.ctx.audio.play('beep', this.scopeCase, { volume: 0.4 });
    this.dirty();
  }

  dirty() {
    this.screenArt.redraw();
    this.genArt.redraw();
    this.panel.redraw();
    for (const [w, led] of Object.entries(this.waveLeds)) led.userData.setOn(w === this.gen.wave, 2.5);
  }

  match() {
    const t = TARGETS[this.round];
    if (!t || !this.gen.on) return { wave: false, f: false, a: false, all: false };
    const wave = this.gen.wave === t.wave;
    const f = Math.abs(this.freq / t.f - 1) <= 0.03;
    const a = Math.abs(this.gen.amp / t.vpp - 1) <= 0.03;
    return { wave, f, a, all: wave && f && a };
  }

  drawGen(c, w, h) {
    lcdBackground(c, w, h, '#06141a');
    const on = this.gen.on;
    const cyan = '#5ff3ff';
    c.font = `40px ${MONO}`;
    c.fillStyle = cyan;
    c.fillText(`${WAVES[this.gen.wave].icon} ${this.gen.wave.toUpperCase()}`, 18, 56);
    c.font = `56px ${MONO}`;
    c.textAlign = 'right';
    c.fillText(fmtF(this.freq), w - 18, 62);
    c.font = `40px ${MONO}`;
    c.fillStyle = '#ffe17a';
    c.fillText(`${this.gen.amp.toFixed(1)} Vpp`, w - 18, 130);
    c.textAlign = 'left';
    c.fillStyle = on ? '#3ddc97' : 'rgba(255,90,80,0.9)';
    c.font = `32px ${MONO}`;
    c.fillText(on ? 'OUT ON' : 'OUT OFF', 18, 130);
  }

  drawScreen(c, w, h) {
    const gx = 20;
    const gy = 36;
    const gw = 600;
    const gh = 368;
    const dx = gw / 10;
    const dy = gh / 8;
    c.fillStyle = '#05080a';
    c.fillRect(0, 0, w, h);
    // 격자
    c.strokeStyle = 'rgba(160,180,190,0.18)';
    c.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      c.beginPath();
      c.moveTo(gx + i * dx, gy);
      c.lineTo(gx + i * dx, gy + gh);
      c.stroke();
    }
    for (let j = 0; j <= 8; j++) {
      c.beginPath();
      c.moveTo(gx, gy + j * dy);
      c.lineTo(gx + gw, gy + j * dy);
      c.stroke();
    }
    c.strokeStyle = 'rgba(190,210,220,0.35)';
    for (let i = 0; i <= 50; i++) {
      c.beginPath();
      c.moveTo(gx + (i * gw) / 50, gy + gh / 2 - 4);
      c.lineTo(gx + (i * gw) / 50, gy + gh / 2 + 4);
      c.stroke();
    }
    for (let j = 0; j <= 40; j++) {
      c.beginPath();
      c.moveTo(gx + gw / 2 - 4, gy + (j * gh) / 40);
      c.lineTo(gx + gw / 2 + 4, gy + (j * gh) / 40);
      c.stroke();
    }

    const vdiv = VDIV[this.scope.v];
    const tdiv = TDIV[this.scope.t];
    const cy = gy + gh / 2;
    const plot = (wave, f, vpp, color, width, dashed, noise) => {
      c.save();
      c.beginPath();
      c.rect(gx, gy, gw, gh);
      c.clip();
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineJoin = 'round';
      if (dashed) c.setLineDash([10, 8]);
      c.beginPath();
      const n = 600;
      let prevY = null;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * tdiv * 10;
        const v = (vpp / 2) * WAVES[wave].fn(f * t);
        let y = cy - (v / vdiv) * dy + (noise ? (Math.random() - 0.5) * noise : 0);
        y = clamp(y, gy - 10, gy + gh + 10);
        const x = gx + (i / n) * gw;
        if (i === 0) c.moveTo(x, y);
        else if (wave === 'square' && prevY !== null && Math.abs(y - prevY) > 4) {
          c.lineTo(x, prevY);
          c.lineTo(x, y);
        } else c.lineTo(x, y);
        prevY = y;
      }
      c.stroke();
      c.restore();
    };
    const target = TARGETS[this.round];
    if (target && !this.done) plot(target.wave, target.f, target.vpp, 'rgba(255, 94, 196, 0.75)', 3, true, 0);
    if (this.gen.on) {
      plot(this.gen.wave, this.freq, this.gen.amp, 'rgba(255, 214, 64, 0.22)', 9, false, 1.2);
      plot(this.gen.wave, this.freq, this.gen.amp, '#ffe14a', 2.6, false, 1.2);
    } else {
      c.strokeStyle = '#ffe14a';
      c.lineWidth = 2.4;
      c.beginPath();
      for (let x = 0; x <= gw; x += 6) {
        const y = cy + (Math.random() - 0.5) * 1.6;
        if (x === 0) c.moveTo(gx + x, y);
        else c.lineTo(gx + x, y);
      }
      c.stroke();
    }
    // 채널 마커
    c.fillStyle = '#ffe14a';
    c.beginPath();
    c.moveTo(gx - 16, cy - 8);
    c.lineTo(gx - 4, cy);
    c.lineTo(gx - 16, cy + 8);
    c.fill();
    // 상단 정보
    c.fillStyle = 'rgba(10,14,18,0.85)';
    c.fillRect(0, 0, w, 30);
    c.font = `20px ${MONO}`;
    c.fillStyle = this.scope.run ? '#3ddc97' : '#ff5d5d';
    c.fillText(this.scope.run ? 'RUN' : 'STOP', 10, 22);
    c.fillStyle = '#ffe14a';
    c.fillText(`CH1 ${vdiv >= 1 ? vdiv.toFixed(2) : (vdiv * 1000).toFixed(0) + 'm'}V`, 80, 22);
    c.fillStyle = '#e6edf3';
    c.fillText(`M ${fmtT(tdiv)}`, 260, 22);
    c.fillStyle = '#ffb547';
    c.fillText('T ↑ 0.00V', 420, 22);
    // 하단 측정값
    c.fillStyle = 'rgba(10,14,18,0.85)';
    c.fillRect(0, h - 34, w, 34);
    c.font = `20px ${MONO}`;
    c.fillStyle = '#ffe14a';
    if (this.gen.on) {
      c.fillText(`Freq ${fmtF(this.freq)}`, 14, h - 10);
      c.fillText(`Vpp ${this.gen.amp.toFixed(2)}V`, 230, h - 10);
      c.fillText(`Per ${fmtT(1 / this.freq)}`, 420, h - 10);
    } else {
      c.fillText('Freq ----  Vpp ----  (입력 없음)', 14, h - 10);
    }
    if (target && !this.done) {
      c.fillStyle = 'rgba(255,94,196,0.95)';
      c.font = font(18, 700);
      c.textAlign = 'right';
      c.fillText(`목표 ${WAVES[target.wave].icon} ${fmtF(target.f)} ${target.vpp}Vpp`, w - 14, 56);
      c.textAlign = 'left';
    }
  }

  panelState() {
    const m = this.match();
    const t = TARGETS[this.round];
    const steps = TARGETS.map((tg, i) => ({
      text: `${['①', '②', '③'][i]} ${WAVES[tg.wave].name} · ${fmtF(tg.f)} · ${tg.vpp} Vpp`,
      state: this.roundDone[i] ? 'done' : i === this.round ? 'active' : 'todo',
    }));
    let hint;
    if (this.done) hint = { text: '세 파형을 모두 만들었어요! 주기 T = 1/f 라는 걸 직접 눈으로 확인했죠.', kind: 'ok' };
    else if (!this.gen.on) hint = { text: '함수발생기 오른쪽 아래 OUTPUT 버튼을 눌러 신호를 내보내세요.', kind: 'info' };
    else if (!m.wave) hint = { text: `파형 버튼으로 ${WAVES[t.wave].name}(${WAVES[t.wave].icon})를 선택하세요.`, kind: 'info' };
    else if (!m.f) hint = { text: `FREQ 노브를 ${this.freq < t.f ? '시계방향' : '반시계방향'}으로 돌려 ${fmtF(t.f)}에 맞추세요. (지금 ${fmtF(this.freq)})`, kind: 'warn' };
    else if (!m.a) hint = { text: `AMPL 노브를 ${this.gen.amp < t.vpp ? '시계방향' : '반시계방향'}으로 돌려 ${t.vpp} Vpp에 맞추세요.`, kind: 'warn' };
    else hint = { text: '완벽해요! 분홍 점선과 노란 파형이 겹쳤어요. 잠시 유지…', kind: 'ok' };
    return {
      num: 2,
      title: '오실로스코프와 파형',
      goal: '함수발생기를 조작해 화면의 분홍 점선(목표 파형)과 똑같은 신호를 만드세요.',
      done: this.done,
      steps,
      readoutHeight: 150,
      readout: (c, x, y, w) => {
        const cells = [
          ['파형', WAVES[this.gen.wave].name, m.wave],
          ['주파수', fmtF(this.freq), m.f],
          ['진폭', `${this.gen.amp.toFixed(1)} Vpp`, m.a],
        ];
        const cw = w / 3;
        c.textBaseline = 'top';
        cells.forEach(([k, v, ok], i) => {
          c.font = font(24, 500);
          c.fillStyle = COLORS.muted;
          c.fillText(`${k} ${this.done ? '' : ok ? '✔' : ''}`, x + 24 + i * cw, y + 16);
          c.font = font(36, 900);
          c.fillStyle = this.done || ok ? COLORS.ok : COLORS.text;
          c.fillText(v, x + 24 + i * cw, y + 48);
        });
        // 유지 진행바
        const gx = x + 24;
        const gw = w - 48;
        roundRect(c, gx, y + 112, gw, 14, 7);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fill();
        roundRect(c, gx, y + 112, Math.max(14, gw * clamp(this.hold / 1.0, 0, 1)), 14, 7);
        c.fillStyle = COLORS.ok;
        if (this.hold > 0) c.fill();
      },
      formula: 'T = 1 / f      Vpp = 위 꼭짓점 − 아래 꼭짓점',
      hint: hint.text,
      hintKind: hint.kind,
    };
  }

  update(dt) {
    this.time += dt;
    // 일치 판정
    if (!this.done) {
      const m = this.match();
      if (m.all) {
        this.hold += dt;
        if (this.hold >= 1.0) this.completeRound();
      } else if (this.hold > 0) {
        this.hold = 0;
        this.panel.redraw();
      }
      this.panelTimer = (this.panelTimer || 0) - dt;
      if (this.hold > 0 && this.panelTimer <= 0) {
        this.panelTimer = 0.1;
        this.panel.redraw();
      }
    }
    // 화면 갱신(노이즈 애니메이션)
    this.redrawTimer -= dt;
    if (this.redrawTimer <= 0 && this.scope.run) {
      this.redrawTimer = 1 / 15;
      this.screenArt.redraw();
    }
  }

  completeRound() {
    const { audio, toast, missions } = this.ctx;
    this.roundDone[this.round] = true;
    this.hold = 0;
    const t = TARGETS[this.round];
    this.round++;
    if (this.round >= TARGETS.length) {
      this.done = true;
      missions.complete('scope', {});
      audio.play('success', null, { volume: 0.8 });
      toast.show('✔ 실험 2 완료!\n사인파 · 구형파 · 삼각파를 모두 만들었어요', 'ok', 4.5);
    } else {
      audio.play('chime', null, { volume: 0.8 });
      const n = TARGETS[this.round];
      toast.show(`파형 ${this.round}/3 일치! (${WAVES[t.wave].name} ${fmtF(t.f)})\n다음 목표: ${WAVES[n.wave].name} ${fmtF(n.f)} · ${n.vpp} Vpp`, 'ok', 3.5);
    }
    this.dirty();
  }

  reset() {
    this.gen = { wave: 'sine', k: 20, amp: 1.0, on: false };
    this.scope = { v: 3, t: 6, run: true };
    this.outLed.userData.setOn(false);
    this.runLed.userData.setOn(true);
    this.round = 0;
    this.hold = 0;
    this.done = false;
    this.roundDone = [false, false, false];
    this.dirty();
  }
}
