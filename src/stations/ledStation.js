import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { Grabbable, Knob, Button, Interactable, PanelItem, SnapZone } from '../core/interaction.js';
import { M, box, cyl, makeInstrumentCase, makeKnob, makePushButton, makeJack, makeIndicator, screenPlane, printPlane, markStatic } from '../world/props.js';
import { BENCH } from '../world/lab.js';
import { COLORS, clamp, font, formatSI, roundRect } from '../core/util.js';
import { createStationPanel, draw7seg, lcdBackground, panelLabel, monoText } from './common.js';
import { PITCH, makeResistor, makeLED, setLEDBrightness, burnLED, resetLED, formatOhms, jumper } from './components.js';

const VF = 2.0; // 적색 LED 순방향 전압
const R_LED = 8; // LED 동저항

/**
 * 실험 1: LED와 옴의 법칙
 */
export class LedStation {
  constructor(ctx) {
    this.ctx = ctx;
    const { bench, interaction } = ctx;
    this.bench = bench;
    this.root = new THREE.Group();
    this.root.position.y = BENCH.H + 0.004;
    bench.add(this.root);
    this.top = 0;

    this.volts = 5.0;
    this.psOn = false;
    this.current = 0;
    this.overTimer = 0;
    this.warnTimer = 0;
    this.okTimer = 0;
    this.burnt = 0;
    this.done = false;
    this.state = 'idle';
    this.lastHintKey = '';

    this.buildBreadboard();
    this.buildPowerSupply();
    this.buildMultimeter();
    this.buildTray();
    this.buildParts();
    this.buildPanel();
    this.buildLight();

    interaction.on('grab', (item) => {
      if (this.parts.includes(item)) this.ctx.missions.touch('led');
    });
  }

  // -------------------------------------------------------------------------
  buildBreadboard() {
    const W = 0.36;
    const D = 0.13;
    const T = 0.014;
    const cols = 30;
    this.bb = { W, D, T, cols };
    const g = new THREE.Group();
    g.position.set(-0.06, 0, 0.15);
    this.root.add(g);
    this.bbGroup = g;
    const x0 = -((cols - 1) * PITCH) / 2;
    const colX = (c) => x0 + (c - 1) * PITCH;
    const rowZ = { rp: -0.056, rn: -0.0465, a: -0.032, b: -0.0225, c: -0.013, d: -0.0035, e: 0.006, f: 0.019, g: 0.0285, h: 0.038, i: 0.0475, j: 0.057 };
    this.colX = colX;
    this.rowZ = rowZ;

    const art = new CanvasArt(1440, 520, (ctx, w, h) => {
      const sx = w / W;
      const sz = h / D;
      const X = (x) => (x + W / 2) * sx;
      const Z = (z) => (z + D / 2) * sz;
      ctx.fillStyle = '#f3f1ea';
      ctx.fillRect(0, 0, w, h);
      // 가운데 홈
      ctx.fillStyle = '#d9d6cc';
      ctx.fillRect(0, Z(0.0125) - 10, w, 20);
      // 전원 레일 선
      ctx.fillStyle = '#d0262b';
      ctx.fillRect(X(colX(1) - 0.006), Z(rowZ.rp) - 22, X(colX(cols)) - X(colX(1)) + 0.012 * sx, 4);
      ctx.fillStyle = '#1f4fb5';
      ctx.fillRect(X(colX(1) - 0.006), Z(rowZ.rn) + 18, X(colX(cols)) - X(colX(1)) + 0.012 * sx, 4);
      ctx.font = font(26, 700);
      ctx.fillStyle = '#d0262b';
      ctx.fillText('+', 10, Z(rowZ.rp) + 9);
      ctx.fillStyle = '#1f4fb5';
      ctx.fillText('−', 12, Z(rowZ.rn) + 9);
      // 구멍
      const hole = (x, z) => {
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(X(x) - 6, Z(z) - 6, 12, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(X(x) - 8, Z(z) - 8, 16, 2);
      };
      for (let c = 1; c <= cols; c++) {
        if (c % 6 !== 0) {
          hole(colX(c), rowZ.rp);
          hole(colX(c), rowZ.rn);
        }
        for (const r of 'abcdefghij') hole(colX(c), rowZ[r]);
        if (c % 5 === 0 || c === 1) {
          ctx.fillStyle = '#7c7a73';
          ctx.font = font(18, 500);
          ctx.textAlign = 'center';
          ctx.fillText(String(c), X(colX(c)), Z(rowZ.a) - 16);
        }
      }
      ctx.textAlign = 'left';
      ctx.font = font(18, 500);
      ctx.fillStyle = '#7c7a73';
      for (const r of 'abcdefghij') ctx.fillText(r, 14, Z(rowZ[r]) + 6);
      // 실크 가이드: 저항 자리 / LED 자리
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#2f6fdc';
      roundRect(ctx, X(colX(6)) - 18, Z(rowZ.b) - 20, X(colX(12)) - X(colX(6)) + 36, 40, 10);
      ctx.stroke();
      ctx.strokeStyle = '#d0262b';
      roundRect(ctx, X(colX(12)) - 18, Z(rowZ.d) - 22, X(colX(14)) - X(colX(12)) + 36, 44, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(26, 900);
      ctx.fillStyle = '#2f6fdc';
      ctx.fillText('R', X(colX(9)) - 8, Z(rowZ.c) + 30);
      ctx.fillStyle = '#d0262b';
      ctx.fillText('LED', X(colX(12)) - 6, Z(rowZ.f) + 26);
      ctx.font = font(30, 900);
      ctx.fillText('+', X(colX(12)) - 40, Z(rowZ.d) + 10);
      ctx.fillStyle = '#1f4fb5';
      ctx.fillText('−', X(colX(14)) + 22, Z(rowZ.d) + 10);
    }, { autoRedraw: false });
    const topMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.55 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xece9e0, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, T, D), [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    body.position.y = T / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    this.bbTop = T;
    const ys = T + 0.0004;
    const P = (c, r) => new THREE.Vector3(colX(c), ys, rowZ[r]);

    // 미리 꽂혀 있는 점퍼선
    const red = M.cableRed;
    const black = M.cableBlack;
    const yellow = M.cableYellow;
    g.add(markStatic(jumper(P(6, 'rp'), P(6, 'a'), red, 0.006)));
    // 전류계(멀티미터) 프로브 지점
    this.probeA = P(14, 'a');
    this.probeB = P(20, 'rn');
    // 전원 단자 연결 지점
    this.railPlus = P(2, 'rp');
    this.railMinus = P(3, 'rn');
    void yellow;
    void black;
    // 레일 단자 핀
    for (const p of [this.railPlus, this.railMinus, this.probeA, this.probeB]) {
      const pin = cyl(0.0016, 0.0016, 0.006, M.chrome, { cast: false, static: true });
      pin.position.copy(p).add(new THREE.Vector3(0, 0.002, 0));
      g.add(pin);
    }

    // 스냅 존
    const ring = (w, d, color) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat);
      m.position.y = 0.017;
      m.raycast = () => {};
      return m;
    };
    this.rZone = new SnapZone({
      parent: g,
      position: new THREE.Vector3((colX(6) + colX(12)) / 2, T - 0.003, rowZ.b),
      accepts: (it) => it.kind === 'resistor',
      radius: 0.06,
      marker: ring(PITCH * 7, 0.016, 0x38d9ff),
      onSnap: () => this.onCircuitChange(),
      onUnsnap: () => this.onCircuitChange(),
      name: 'R-zone',
    });
    this.ledZone = new SnapZone({
      parent: g,
      position: new THREE.Vector3((colX(12) + colX(14)) / 2, T - 0.003, rowZ.d),
      accepts: (it) => it.kind === 'led',
      radius: 0.055,
      marker: ring(PITCH * 3, 0.024, 0xff5ec4),
      onSnap: (it, flipped) => {
        if (flipped && !it.object.userData.burnt) {
          this.ctx.toast.show('LED가 거꾸로 꽂혔어요!\n긴 다리(+)가 저항 쪽으로 가야 해요', 'warn');
          this.ctx.missions.mistake('led', 'reverse');
        }
        this.onCircuitChange();
      },
      onUnsnap: () => this.onCircuitChange(),
      name: 'LED-zone',
    });
    this.ctx.interaction.addZone(this.rZone);
    this.ctx.interaction.addZone(this.ledZone);

    this.ctx.interaction.add(new Interactable(body, {
      info: { title: '브레드보드', text: '같은 세로줄(a–e)의 구멍 5개는 서로 연결\n+/− 레일은 가로로 연결돼 있어요' },
      outline: false,
    })).type = 'info';
  }

  // -------------------------------------------------------------------------
  buildPowerSupply() {
    const { interaction, audio } = this.ctx;
    const ps = makeInstrumentCase(0.27, 0.15, 0.27, 0xd6d9dc, 0x2b2f35);
    ps.position.set(-0.42, BENCH.shelfLift, -BENCH.D / 2 + 0.17);
    this.root.add(ps);
    interaction.addBlocker(ps.userData.body);
    const front = ps.userData.front;
    const art = new CanvasArt(540, 300, (ctx, w, h) => {
      ctx.fillStyle = '#2b2f35';
      ctx.fillRect(0, 0, w, h);
      panelLabel(ctx, 'EE·LAB', 34, 26, 20, '#38d9ff', 'left', 900);
      panelLabel(ctx, 'DC POWER SUPPLY  PS-1203', 120, 26, 15, '#aab4c0', 'left', 500);
      panelLabel(ctx, 'VOLTAGE', 450, 64, 16);
      panelLabel(ctx, '0 – 12 V', 450, 172, 13, '#8f9aa6');
      panelLabel(ctx, 'OUTPUT', 450, 196, 16);
      panelLabel(ctx, '+', 70, 230, 22, '#ff6b6b');
      panelLabel(ctx, '−', 150, 230, 22, '#cfd6de');
      panelLabel(ctx, 'GND', 230, 230, 14, '#7fd99f');
      ctx.strokeStyle = 'rgba(200,210,220,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 40, 340, 140);
    }, { autoRedraw: true });
    printPlane(0.264, 0.147, art.texture, { y: 0.075, z: 0.0005, roughness: 0.6, static: true, parent: front });

    // 7세그먼트 표시창
    this.psArt = new CanvasArt(512, 224, (ctx, w, h) => {
      lcdBackground(ctx, w, h, '#120606');
      const on = this.psOn;
      draw7seg(ctx, this.volts.toFixed(2).padStart(5, '0'), 26, 30, 50, 92, '#ff3b2f', 'rgba(255,60,40,0.07)');
      monoText(ctx, 'V', 330, 118, 40, '#ff6b5e');
      const amps = on ? this.current : 0;
      draw7seg(ctx, amps.toFixed(3), 30, 150, 24, 44, '#3ddc97', 'rgba(60,220,150,0.07)');
      monoText(ctx, 'A', 180, 190, 26, '#3ddc97');
      ctx.font = font(22, 700);
      ctx.fillStyle = on ? '#3ddc97' : 'rgba(61,220,151,0.15)';
      ctx.fillText('OUT', 380, 70);
      ctx.fillStyle = on ? 'rgba(255,90,80,0.15)' : '#ff5a50';
      ctx.fillText('OFF', 380, 110);
      ctx.fillStyle = this.state === 'burn' ? '#ffb547' : 'rgba(255,181,71,0.12)';
      ctx.fillText('CC', 380, 150);
      ctx.fillStyle = 'rgba(255,181,71,0.5)';
      ctx.fillText('CV', 440, 150);
    }, { autoRedraw: false, mipmaps: false });
    markStatic(screenPlane(0.15, 0.065, this.psArt.texture, { x: -0.04, y: 0.094, z: 0.0015, parent: front }));

    // 전압 노브
    const knob = makeKnob(0.017, 0.016, 0x2a2d32);
    knob.position.set(0.075, 0.105, 0.0015);
    front.add(knob);
    interaction.add(new Knob(knob, {
      detent: THREE.MathUtils.degToRad(20),
      grabRadius: 0.03,
      info: () => ({ title: '전압 조절 노브', text: `현재 ${this.volts.toFixed(1)} V · 0.5 V 단위 (0–12 V)\n잡고 손목을 비틀거나 스틱 좌우로 조절` }),
      onStep: (dir) => {
        const v = clamp(Math.round((this.volts + dir * 0.5) * 10) / 10, 0, 12);
        if (v === this.volts) return false;
        this.volts = v;
        this.onCircuitChange();
        return true;
      },
    }));

    // 출력 버튼
    const { group: btnG, cap, capMat } = makePushButton(0.03, 0.016, 0x3a4048);
    btnG.position.set(0.075, 0.042, 0.0015);
    front.add(btnG);
    this.outLed = makeIndicator(0x3ddc97, 0.0035);
    this.outLed.position.set(0.075, 0.062, 0.003);
    front.add(this.outLed);
    void capMat;
    interaction.add(new Button(btnG, {
      cap,
      colliders: [cap],
      info: () => ({ title: 'OUTPUT 버튼', text: this.psOn ? '출력 켜짐 — 누르면 꺼져요' : '누르면 회로에 전원이 공급돼요' }),
      onPress: () => {
        this.psOn = !this.psOn;
        this.outLed.userData.setOn(this.psOn);
        audio.play('relay', btnG, { volume: 0.7 });
        this.ctx.missions.touch('led');
        this.onCircuitChange();
      },
    }));

    // 단자
    const jacks = [['red', -0.093], ['black', -0.053], ['green', -0.013]];
    this.psJacks = {};
    for (const [c, x] of jacks) {
      const j = makeJack(c === 'green' ? 'green' : c);
      j.position.set(x, 0.04, 0.0015);
      front.add(j);
      this.psJacks[c] = j;
    }

    ps.updateMatrixWorld(true);
    this.ps = ps;
    interaction.add(new Interactable(ps.userData.body, {
      info: () => ({ title: 'DC 전원공급기', text: `설정 ${this.volts.toFixed(1)} V · 출력 ${this.psOn ? 'ON' : 'OFF'}\n빨강(+) / 검정(−) 단자가 브레드보드 레일에 연결됨` }),
      outline: false,
    })).type = 'info';
  }

  // -------------------------------------------------------------------------
  buildMultimeter() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.set(0.27, 0.0, 0.06);
    g.rotation.set(0, -0.3, 0);
    this.root.add(g);
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.75;
    tilt.position.y = 0.08;
    g.add(tilt);
    const holster = new THREE.MeshStandardMaterial({ color: 0xf2c218, roughness: 0.65 });
    box(0.092, 0.18, 0.04, holster, { round: 0.012, parent: tilt });
    box(0.078, 0.165, 0.004, M.plasticDark, { z: 0.019, static: true, parent: tilt });
    const faceArt = new CanvasArt(256, 540, (ctx, w, h) => {
      ctx.fillStyle = '#25282d';
      ctx.fillRect(0, 0, w, h);
      panelLabel(ctx, 'EE-DMM 17', w / 2, 30, 18, '#f2c218');
      // 다이얼 눈금
      const cx = w / 2;
      const cy = 330;
      const labels = ['OFF', 'V~', 'V⎓', 'mV', 'Ω', '→|', 'mA', 'A'];
      labels.forEach((l, i) => {
        const a = -Math.PI * 0.85 + (i / (labels.length - 1)) * Math.PI * 1.7 - Math.PI / 2;
        panelLabel(ctx, l, cx + Math.cos(a) * 100, cy + Math.sin(a) * 100, 18, l === 'mA' ? '#ff6b6b' : '#e1e5ea');
      });
      panelLabel(ctx, 'COM', 60, 500, 16);
      panelLabel(ctx, 'mA', 128, 500, 16, '#ff6b6b');
      panelLabel(ctx, 'VΩ', 196, 500, 16);
    }, { autoRedraw: true });
    printPlane(0.078, 0.165, faceArt.texture, { z: 0.0215, roughness: 0.5, static: true, parent: tilt });
    this.dmmArt = new CanvasArt(384, 192, (ctx, w, h) => {
      lcdBackground(ctx, w, h, '#a9b9a0');
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, 0, w, h);
      const ma = this.current * 1000;
      const txt = this.state === 'burn' || !this.psOn ? '0.00' : ma >= 100 ? ma.toFixed(0) : ma >= 10 ? ma.toFixed(1) : ma.toFixed(2);
      draw7seg(ctx, txt.padStart(4, ' '), 32, 40, 52, 100, '#1b211a', 'rgba(20,30,20,0.06)');
      ctx.fillStyle = '#1b211a';
      ctx.font = font(30, 900);
      ctx.fillText('mA', 300, 140);
      ctx.font = font(20, 700);
      ctx.fillText('DC', 300, 70);
      ctx.fillText('AUTO', 24, 30);
    }, { autoRedraw: false, mipmaps: false });
    markStatic(screenPlane(0.066, 0.033, this.dmmArt.texture, { y: 0.052, z: 0.022, parent: tilt }));
    // 다이얼
    const dial = makeKnob(0.024, 0.01, 0x1d1f23);
    dial.position.set(0, -0.008, 0.021);
    dial.rotation.z = -0.95;
    tilt.add(markStatic(dial));
    g.updateMatrixWorld(true);
    interaction.add(new Interactable(tilt.children[0], {
      info: () => ({ title: '디지털 멀티미터 (전류계)', text: `회로에 직렬로 연결 — 흐르는 전류 측정\n현재 ${formatSI(this.psOn ? this.current : 0, 'A')}` }),
      outline: false,
    })).type = 'info';

    // 케이블: 멀티미터 단자 → 브레드보드
    this.dmmGroup = tilt;
    this.dmmJacks = { com: new THREE.Vector3(-0.026, -0.074, 0.022), ma: new THREE.Vector3(0, -0.074, 0.022) };
  }

  // -------------------------------------------------------------------------
  buildTray() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.set(0.66, 0, 0.14);
    this.root.add(g);
    const W = 0.3;
    const D = 0.2;
    const H = 0.03;
    const mat = new THREE.MeshStandardMaterial({ color: 0x7fb6e8, roughness: 0.25, transparent: true, opacity: 0.55 });
    box(W, 0.004, D, new THREE.MeshStandardMaterial({ color: 0x3d6f9c, roughness: 0.5 }), { y: 0.002, static: true, parent: g });
    for (const sx of [-1, 1]) box(0.004, H, D, mat, { x: (sx * W) / 2, y: H / 2, static: true, parent: g });
    for (const sz of [-1, 0, 1]) box(W, H, 0.004, mat, { z: (sz * D) / 2, y: H / 2, static: true, parent: g });
    for (const sx of [-1, 1]) box(0.004, H, D, mat, { x: (sx * W) / 6, y: H / 2, static: true, parent: g });
    const labels = ['10 Ω', '220 Ω', '1 kΩ', '10 kΩ', 'LED', 'LED'];
    const labelArt = new CanvasArt(768, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f5f3ea';
      ctx.fillRect(0, 0, w, h);
      ctx.font = font(30, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      labels.slice(3).forEach((l, i) => {
        ctx.fillStyle = l === 'LED' ? '#c8262b' : '#1b2a44';
        ctx.fillText(l, (w / 3) * (i + 0.5), h / 2 + 2);
      });
    });
    printPlane(W - 0.01, 0.022, labelArt.texture, { y: H * 0.6, z: D / 2 + 0.0025, static: true, parent: g });
    const labelArt2 = new CanvasArt(768, 64, (ctx, w, h) => {
      ctx.fillStyle = '#f5f3ea';
      ctx.fillRect(0, 0, w, h);
      ctx.font = font(30, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      labels.slice(0, 3).forEach((l, i) => {
        ctx.fillStyle = '#1b2a44';
        ctx.fillText(l, (w / 3) * (i + 0.5), h / 2 + 2);
      });
    });
    // 뒷줄 라벨은 칸막이 앞면(사용자 쪽)
    printPlane(W - 0.01, 0.022, labelArt2.texture, { y: H * 0.6, z: 0.0025, static: true, parent: g });
    this.trayZones = [];
    for (let i = 0; i < 6; i++) {
      const row = i < 3 ? -1 : 1;
      const col = i % 3;
      const pos = new THREE.Vector3((col - 1) * (W / 3), 0.004, (row * D) / 4);
      const z = new SnapZone({
        parent: g,
        position: pos,
        accepts: (it) => (i >= 4 ? it.kind === 'led' : it.kind === 'resistor') && !it.object.userData.burnt,
        radius: 0.05,
        name: `tray${i}`,
      });
      interaction.addZone(z);
      this.trayZones.push(z);
    }
    this.tray = g;
  }

  // -------------------------------------------------------------------------
  buildParts() {
    const { interaction } = this.ctx;
    this.parts = [];
    this.resistors = [];
    const values = [10, 220, 1000, 10000];
    values.forEach((ohms, i) => {
      const r = makeResistor(ohms);
      this.root.add(r);
      const item = new Grabbable(r, {
        kind: 'resistor',
        grabRadius: 0.03,
        center: new THREE.Vector3(0, 0.013, 0),
        restHeight: 0,
        desktopQuat: new THREE.Quaternion(),
        info: () => ({ title: `저항 ${formatOhms(ohms)}`, text: `색띠: ${r.userData.bandText}\n허용오차 ±5% · 정격 1/4 W` }),
      });
      interaction.add(item);
      item.setHomeZone(this.trayZones[i]);
      interaction.snapInto(item, this.trayZones[i], false);
      this.parts.push(item);
      this.resistors.push(item);
    });
    this.leds = [];
    for (let i = 0; i < 6; i++) {
      const led = makeLED(0xff2a2a);
      this.root.add(led);
      const item = new Grabbable(led, {
        kind: 'led',
        grabRadius: 0.028,
        center: new THREE.Vector3(0, 0.026, 0),
        restHeight: 0.0105,
        restQuat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        info: () => (led.userData.burnt
          ? { title: '타버린 LED 💀', text: '과전류로 소손됨 — 아무 데나 놓으면 버려져요' }
          : { title: '적색 LED', text: `V_F ≈ ${VF.toFixed(1)} V · 권장 전류 5–20 mA\n긴 다리 = 애노드(+) · 테두리 평평한 쪽 = 캐소드(−)` }),
        onRelease: (p, zone) => {
          if (led.userData.burnt && !zone) this.discardLED(item);
        },
      });
      interaction.add(item);
      this.leds.push(item);
      this.parts.push(item);
      if (i < 2) {
        item.setHomeZone(this.trayZones[4 + i]);
        interaction.snapInto(item, this.trayZones[4 + i], false);
      } else {
        led.visible = false;
        item.enabled = false;
        item.spare = true;
      }
    }

    // 전원 케이블(장식) — 월드 위치가 확정된 뒤 생성
    this.root.updateMatrixWorld(true);
    this.buildCables();
  }

  buildCables() {
    const toLocal = (obj, v) => this.root.worldToLocal(obj.localToWorld(v.clone()));
    const jackR = toLocal(this.psJacks.red, new THREE.Vector3(0, 0, 0.012));
    const jackB = toLocal(this.psJacks.black, new THREE.Vector3(0, 0, 0.012));
    const railP = toLocal(this.bbGroup, this.railPlus);
    const railN = toLocal(this.bbGroup, this.railMinus);
    const mk = (a, b, mat, sag, out = 0.06) => {
      const pts = [
        a,
        a.clone().add(new THREE.Vector3(0, -0.01, out)),
        new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) + 0.02 - sag, (a.z + b.z) / 2 + 0.12),
        b.clone().add(new THREE.Vector3(0, 0.05, 0.02)),
        b.clone().add(new THREE.Vector3(0, 0.006, 0)),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0022, 7, false), mat);
      m.castShadow = true;
      m.userData.static = true;
      this.root.add(m);
      // 바나나 플러그
      const plug = cyl(0.0045, 0.0045, 0.022, mat === M.cableRed ? M.redPlastic : M.blackPlastic, { rx: Math.PI / 2, static: true });
      plug.position.copy(a).add(new THREE.Vector3(0, 0, 0.006));
      this.root.add(plug);
    };
    mk(jackR, railP, M.cableRed, 0.02);
    mk(jackB, railN, M.cableBlack, 0.0);
    // 멀티미터 리드
    const ma = toLocal(this.dmmGroup, this.dmmJacks.ma);
    const com = toLocal(this.dmmGroup, this.dmmJacks.com);
    const pa = toLocal(this.bbGroup, this.probeA);
    const pb = toLocal(this.bbGroup, this.probeB);
    const lead = (a, b, mat) => {
      const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
      mid.y = 0.004;
      mid.z += 0.05;
      const pts = [a, a.clone().add(new THREE.Vector3(0, -0.01, 0.02)), mid, b.clone().add(new THREE.Vector3(0.0, 0.03, 0.01)), b.clone().add(new THREE.Vector3(0, 0.006, 0))];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0018, 7, false), mat);
      m.castShadow = true;
      m.userData.static = true;
      this.root.add(m);
      const tip = cyl(0.0035, 0.0028, 0.03, mat === M.cableRed ? M.redPlastic : M.blackPlastic, { static: true });
      tip.position.copy(b).add(new THREE.Vector3(0, 0.02, 0));
      this.root.add(tip);
    };
    lead(ma, pa, M.cableRed);
    lead(com, pb, M.cableBlack);
  }

  discardLED(item) {
    const obj = item.object;
    item.enabled = false;
    const start = performance.now();
    const s0 = obj.scale.x;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / 400);
      obj.scale.setScalar(s0 * (1 - t));
      if (t < 1) requestAnimationFrame(tick);
      else {
        obj.visible = false;
        obj.scale.setScalar(1);
        resetLED(obj);
        item.spare = true;
        item.state = 'free';
        this.ctx.interaction.scene.attach(obj);
        obj.position.set(0, -10, 0);
      }
    };
    this.ctx.audio.play('paper', obj, { volume: 0.4, rate: 1.4 });
    tick();
  }

  spawnSpareLED() {
    const zone = this.trayZones.slice(4).find((z) => !z.occupant);
    const spare = this.leds.find((l) => l.spare);
    if (!spare) return;
    spare.spare = false;
    resetLED(spare.object);
    spare.object.visible = true;
    spare.enabled = true;
    if (zone) {
      spare.setHomeZone(zone);
      this.ctx.interaction.scene.attach(spare.object);
      zone.worldPos(spare.object.position).y += 0.12;
      this.ctx.interaction.snapInto(spare, zone, true);
    } else {
      spare.homeZone = null;
      this.ctx.interaction.scene.attach(spare.object);
      this.trayZones[4].worldPos(spare.object.position).y += 0.15;
      spare.state = 'falling';
      spare.velocity.set(0, 0, 0);
    }
    this.ctx.toast.show('새 LED가 부품함에 보충됐어요', 'ok', 2.2);
  }

  // -------------------------------------------------------------------------
  buildPanel() {
    const { interaction } = this.ctx;
    this.panel = createStationPanel({
      width: 0.56,
      height: 0.62,
      getState: () => this.panelState(),
      buttons: [
        { id: 'reset', label: '부품 정리', onClick: () => this.resetParts() },
      ],
    });
    this.panel.mesh.position.set(-0.98, 0.62, -0.02);
    this.panel.mesh.rotation.y = 0.35;
    this.root.add(this.panel.mesh);
    interaction.add(new PanelItem(this.panel));
  }

  buildLight() {
    this.light = new THREE.PointLight(0xff3020, 0, 0.9, 2);
    this.light.position.set(0, 0.05, 0);
    this.root.add(this.light);
  }

  panelState() {
    const rIn = !!this.rZone.occupant;
    const led = this.ledZone.occupant;
    const ledOk = led && !led.object.userData.burnt && !this.ledZone.flipped;
    const ok = this.done;
    const step = (cond, prev = true) => (cond ? 'done' : prev ? 'active' : 'todo');
    const hint = this.hint();
    return {
      num: 1,
      title: 'LED와 옴의 법칙',
      goal: 'LED에 5–25 mA의 적정 전류가 흐르도록 저항을 골라 회로를 완성하세요.',
      done: ok,
      steps: [
        { text: '저항을 브레드보드 R 자리에 꽂기', state: step(rIn) },
        { text: 'LED 꽂기 (긴 다리 = +, 저항 쪽)', state: led && this.ledZone.flipped ? 'bad' : step(ledOk, rIn) },
        { text: '전원공급기 OUTPUT 켜기', state: step(this.psOn, rIn && ledOk) },
        { text: '적정 전류 5–25 mA 만들기', state: step(ok, rIn && ledOk && this.psOn) },
      ],
      readoutHeight: 150,
      readout: (ctx, x, y, w) => this.drawReadout(ctx, x, y, w),
      formula: `I = (Vₛ − V_F) / R     (적색 LED V_F ≈ ${VF.toFixed(1)} V)`,
      hint: hint.text,
      hintKind: hint.kind,
    };
  }

  drawReadout(ctx, x, y, w) {
    const r = this.rZone.occupant?.object.userData.ohms;
    const I = this.psOn ? this.current : 0;
    ctx.font = font(30, 700);
    ctx.fillStyle = COLORS.text;
    ctx.textBaseline = 'top';
    const cells = [
      ['전압 Vₛ', `${this.volts.toFixed(1)} V`, this.psOn ? COLORS.text : COLORS.muted],
      ['저항 R', r ? formatOhms(r) : '—', COLORS.text],
      ['전류 I', formatSI(I, 'A'), this.state === 'ok' ? COLORS.ok : this.state === 'over' || this.state === 'burn' ? COLORS.bad : this.state === 'dim' ? COLORS.warn : COLORS.text],
    ];
    const cw = w / 3;
    cells.forEach(([k, v, col], i) => {
      ctx.font = font(24, 500);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(k, x + 24 + i * cw, y + 16);
      ctx.font = font(40, 900);
      ctx.fillStyle = col;
      ctx.fillText(v, x + 24 + i * cw, y + 46);
    });
    // 전류 게이지 0–50 mA
    const gx = x + 24;
    const gy = y + 112;
    const gw = w - 48;
    const max = 0.05;
    roundRect(ctx, gx, gy, gw, 16, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.fillStyle = 'rgba(61,220,151,0.35)';
    ctx.fillRect(gx + (0.005 / max) * gw, gy, ((0.025 - 0.005) / max) * gw, 16);
    const k = clamp(I / max, 0, 1);
    ctx.fillStyle = this.state === 'ok' ? COLORS.ok : I > 0.025 ? COLORS.bad : COLORS.warn;
    ctx.fillRect(gx, gy + 4, k * gw, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(gx + k * gw - 2, gy - 4, 4, 24);
  }

  hint() {
    const led = this.ledZone.occupant;
    if (this.done) return { text: `성공! ${formatSI(this.current, 'A')}로 LED가 안정적으로 켜졌어요. 다음 실험대로 이동하세요.`, kind: 'ok' };
    if (!this.rZone.occupant) return { text: '오른쪽 부품함에서 저항을 하나 집어 파란 점선(R) 자리에 꽂아보세요. 색띠로 저항값을 읽을 수 있어요.', kind: 'info' };
    if (!led) return { text: '부품함의 LED를 빨간 점선 자리에 꽂으세요. 긴 다리(+)가 왼쪽 저항 쪽이에요.', kind: 'info' };
    if (led.object.userData.burnt) return { text: '타버린 LED를 빼서 버리고 새 LED를 꽂으세요. 이번엔 전류를 계산해서!', kind: 'bad' };
    if (this.ledZone.flipped) return { text: 'LED가 거꾸로예요. 다이오드는 한 방향으로만 전류가 흘러요. 빼서 돌려 꽂으세요.', kind: 'bad' };
    if (!this.psOn) return { text: '전원공급기의 OUTPUT 버튼을 눌러 전원을 넣어보세요.', kind: 'info' };
    if (this.state === 'over') return { text: `전류가 너무 커요 (${formatSI(this.current, 'A')})! LED가 곧 타버려요 — 저항을 키우거나 전압을 낮추세요.`, kind: 'bad' };
    if (this.state === 'dim') {
      const r = this.rZone.occupant.object.userData.ohms;
      return { text: `너무 어두워요 (${formatSI(this.current, 'A')}). ${r >= 1000 ? '저항을 줄이거나 노브로 전압을 높여보세요.' : '전압을 조금 높여보세요.'}`, kind: 'warn' };
    }
    if (this.state === 'ok') return { text: '좋아요! 전류가 적정 범위예요. 잠시 유지해 보세요…', kind: 'ok' };
    return { text: '전압 노브를 잡고 손목을 비틀어 전압을 바꿔보세요.', kind: 'info' };
  }

  onCircuitChange() {
    this.evaluate(0);
    this.panel.redraw();
    this.psArt.redraw();
    this.dmmArt.redraw();
  }

  evaluate(dt) {
    const r = this.rZone.occupant?.object.userData.ohms;
    const ledItem = this.ledZone.occupant;
    const led = ledItem?.object;
    let I = 0;
    let state = 'open';
    if (r && led && !led.userData.burnt && !this.ledZone.flipped && this.psOn) {
      I = Math.max(0, (this.volts - VF) / (r + R_LED));
      if (this.volts > VF - 0.3 && this.volts <= VF) I = Math.max(I, ((this.volts - (VF - 0.3)) / 0.3) * 0.0002);
      state = I > 0.026 ? 'over' : I >= 0.005 ? 'ok' : 'dim';
    } else if (led?.userData.burnt) state = 'burn';
    this.current = I;
    const prev = this.state;
    this.state = state;
    if (prev !== state) this.panel.redraw();

    if (led && !led.userData.burnt) setLEDBrightness(led, I / 0.018);
    for (const l of this.leds) if (l.object !== led) setLEDBrightness(l.object, 0);
    if (led && !led.userData.burnt && I > 0) {
      led.getWorldPosition(this.light.position);
      this.root.worldToLocal(this.light.position);
      this.light.position.y += 0.03;
      this.light.intensity = Math.min(0.35, (I / 0.02) * 0.12);
    } else this.light.intensity = 0;

    if (!dt) return;
    // 과전류 → 소손
    if (state === 'over') {
      const fast = I > 0.045;
      this.overTimer += dt * (fast ? 1 : 0.18);
      if (this.overTimer > 0.4) this.burn(ledItem, I);
    } else this.overTimer = Math.max(0, this.overTimer - dt);

    if (state === 'ok' && !this.done) {
      this.okTimer += dt;
      if (this.okTimer > 1.2) this.complete(I, r);
    } else this.okTimer = 0;
  }

  burn(item, I) {
    const led = item.object;
    burnLED(led);
    this.burnt++;
    this.overTimer = 0;
    const pos = led.getWorldPosition(new THREE.Vector3());
    pos.y += 0.03;
    const { particles, audio, toast, missions } = this.ctx;
    audio.play('pop', pos, { volume: 1.0 });
    particles.sparks.emit(pos, 40, { vel: new THREE.Vector3(0, 0.6, 0), velSpread: 0.9, life: [0.25, 0.6], size: [0.01, 0.002], alpha: 1, color: [new THREE.Color(1, 0.7, 0.2), new THREE.Color(1, 0.4, 0.1), new THREE.Color(1, 1, 0.6)], drag: 2, gravity: 2.5 });
    particles.smoke.emit(pos, 26, { vel: new THREE.Vector3(0, 0.12, 0), velSpread: 0.05, life: [1.5, 3.2], size: [0.02, 0.12], alpha: 0.5, color: new THREE.Color(0.55, 0.55, 0.55), colorJitter: 0.08, drag: 0.6 });
    for (const p of this.ctx.pointers()) p.pulse(1.0, 120);
    toast.show(`펑! 💥 LED가 타버렸어요\n전류 ${formatSI(I, 'A')} — LED 최대 정격은 약 20 mA`, 'error', 4);
    missions.mistake('led', 'burnt');
    this.flash = 0.12;
    this.onCircuitChange();
    setTimeout(() => this.spawnSpareLED(), 1500);
  }

  complete(I, r) {
    this.done = true;
    const ok = this.ctx.missions.complete('led', { current: I, ohms: r, volts: this.volts, burnt: this.burnt });
    if (ok) {
      this.ctx.audio.play('success', null, { volume: 0.8 });
      this.ctx.toast.show(`✔ 실험 1 완료!\nV=${this.volts.toFixed(1)} V, R=${formatOhms(r)} → I=${formatSI(I, 'A')}`, 'ok', 4.5);
    }
    this.panel.redraw();
  }

  resetParts() {
    const { interaction } = this.ctx;
    for (const item of this.parts) {
      if (!item.enabled || item.spare) continue;
      if (item.object.userData.burnt) {
        if (item.zone) interaction.unsnap(item);
        this.discardLED(item);
        continue;
      }
      if (item.homeZone && item.zone === item.homeZone) continue;
      interaction.sendHome(item, true);
    }
    // LED가 2개 미만이면 보충
    setTimeout(() => {
      const live = this.leds.filter((l) => l.enabled && !l.spare && !l.object.userData.burnt).length;
      for (let i = live; i < 2; i++) this.spawnSpareLED();
    }, 700);
  }

  reset() {
    this.psOn = false;
    this.outLed.userData.setOn(false);
    this.volts = 5;
    this.done = false;
    this.burnt = 0;
    this.resetParts();
    this.onCircuitChange();
  }

  update(dt) {
    this.evaluate(dt);
    if (this.flash > 0) {
      this.flash -= dt;
      this.light.intensity = 3;
    }
    // 표시창 갱신(값이 변할 때만)
    const key = `${this.psOn}|${this.volts}|${this.current.toFixed(5)}|${this.state}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.psArt.redraw();
      this.dmmArt.redraw();
      this.panel.redraw();
    }
  }
}
