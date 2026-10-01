import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { Grabbable, Button, Interactable, PanelItem, SnapZone } from '../core/interaction.js';
import { M, box, cyl, makeIndicator, printPlane, screenPlane, markStatic } from '../world/props.js';
import { BENCH } from '../world/lab.js';
import { COLORS, font, roundRect } from '../core/util.js';
import { createStationPanel, draw7seg, panelLabel, lcdBackground } from './common.js';
import { PITCH, makeIC } from './components.js';

const GATES = {
  AND: { part: 'SN74LS08N', desc: 'QUAD 2-IN AND', fn: (a, b) => a & b, sym: 'A · B', ko: 'AND (둘 다 1이면 1)' },
  OR: { part: 'SN74LS32N', desc: 'QUAD 2-IN OR', fn: (a, b) => a | b, sym: 'A + B', ko: 'OR (하나라도 1이면 1)' },
  XOR: { part: 'SN74LS86N', desc: 'QUAD 2-IN XOR', fn: (a, b) => a ^ b, sym: 'A ⊕ B', ko: 'XOR (서로 다르면 1)' },
  NAND: { part: 'SN74LS00N', desc: 'QUAD 2-IN NAND', fn: (a, b) => 1 - (a & b), sym: '¬(A · B)', ko: 'NAND (AND의 반대)' },
};
const ROWS = ['00', '01', '10', '11'];

/**
 * 실험 3: 74LS 시리즈로 반가산기 만들기
 */
export class LogicStation {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = new THREE.Group();
    this.root.position.y = BENCH.H + 0.004;
    ctx.bench.add(this.root);
    this.A = 0;
    this.B = 0;
    this.table = {};
    this.done = false;
    this.lastKey = '';

    this.buildTrainer();
    this.buildFoam();
    this.buildChips();
    this.buildPanel();
    this.evaluate();
  }

  buildTrainer() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.set(-0.05, 0, 0.1);
    this.root.add(g);
    const W = 0.52;
    const shape = new THREE.Shape();
    shape.moveTo(-0.17, 0);
    shape.lineTo(-0.17, 0.045);
    shape.lineTo(0.17, 0.13);
    shape.lineTo(0.17, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
    geo.rotateY(Math.PI / 2);
    geo.translate(-W / 2, 0, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e57, roughness: 0.45, metalness: 0.1 });
    const body = new THREE.Mesh(geo, bodyMat);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    interaction.addBlocker(body);
    // 기울어진 상판
    const slope = Math.atan2(0.085, 0.34);
    const face = new THREE.Group();
    face.position.set(0, 0.0875 + 0.0045, 0);
    face.rotation.x = -(Math.PI / 2 - slope);
    g.add(face);
    this.face = face;
    const FW = 0.5;
    const FH = 0.34;
    const art = new CanvasArt(1500, 1020, (c, w, h) => this.drawFace(c, w, h));
    const faceMat = new THREE.MeshStandardMaterial({ map: art.texture, roughness: 0.5 });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), faceMat);
    plate.position.z = 0.0005;
    plate.receiveShadow = true;
    plate.userData.static = true;
    face.add(plate);
    this.faceArt = art;
    const P = (px, py) => new THREE.Vector3((px / 1500 - 0.5) * FW, (0.5 - py / 1020) * FH, 0);
    this.P = P;

    // 입력 토글 스위치
    this.switches = {};
    for (const [name, py] of [['A', 360], ['B', 640]]) {
      const pos = P(150, py);
      const sw = new THREE.Group();
      sw.position.copy(pos);
      face.add(sw);
      box(0.03, 0.045, 0.012, M.plasticDark, { z: 0.006, static: true, parent: sw });
      const pivot = new THREE.Group();
      pivot.position.z = 0.012;
      sw.add(pivot);
      const lever = cyl(0.0035, 0.0045, 0.03, M.chrome, { y: 0.015, parent: pivot });
      const tip = cyl(0.006, 0.006, 0.012, name === 'A' ? M.redPlastic : M.bluePlastic, { y: 0.032, parent: pivot });
      pivot.rotation.x = -0.5;
      const led = makeIndicator(0xff3b2f, 0.0045);
      led.position.copy(P(290, py));
      led.position.z = 0.003;
      face.add(led);
      const hit = box(0.05, 0.06, 0.04, new THREE.MeshBasicMaterial({ visible: false }), { z: 0.02, cast: false, parent: sw });
      this.switches[name] = { pivot, led };
      interaction.add(new Button(sw, {
        cap: pivot,
        travel: 0,
        colliders: [hit],
        outline: [lever, tip],
        info: () => ({ title: `입력 스위치 ${name}`, text: `현재 ${this[name]} (${this[name] ? 'HIGH 5V' : 'LOW 0V'}) — 눌러서 전환` }),
        onPress: () => {
          this[name] = this[name] ? 0 : 1;
          this.ctx.missions.touch('logic');
          this.evaluate();
        },
      }));
      void lever;
    }

    // IC 소켓
    this.sockets = {};
    for (const [name, py] of [['SUM', 330], ['CARRY', 690]]) {
      const pos = P(720, py);
      const sock = new THREE.Group();
      sock.position.copy(pos);
      face.add(sock);
      const len = 7 * PITCH + 0.012;
      box(len, 0.034, 0.008, M.blackPlastic, { z: 0.004, static: true, parent: sock });
      // 구멍 줄
      for (let i = 0; i < 7; i++) {
        for (const s of [-1, 1]) {
          box(0.0026, 0.0026, 0.002, M.gold, { x: -3 * PITCH + i * PITCH, y: s * 0.0125, z: 0.0085, cast: false, static: true, parent: sock });
        }
      }
      // 노치 표시
      cyl(0.003, 0.003, 0.002, M.plasticLight, { x: -len / 2 + 0.005, z: 0.0085, rx: Math.PI / 2, cast: false, static: true, parent: sock });
      const marker = new THREE.Mesh(new THREE.BoxGeometry(len + 0.01, 0.04, 0.03), new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
      marker.raycast = () => {};
      marker.position.y = 0.015;
      const zone = new SnapZone({
        parent: sock,
        position: new THREE.Vector3(0, 0, 0.0075),
        quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        accepts: (it) => it.kind === 'ic',
        radius: 0.06,
        marker,
        onSnap: (it, flipped) => this.onChip(name, it, flipped),
        onUnsnap: () => this.onChip(name, null, false),
        name: `socket-${name}`,
      });
      interaction.addZone(zone);
      this.sockets[name] = zone;
    }

    // 출력 LED (큰 LED)
    this.outLeds = {};
    for (const [name, py, color] of [['S', 330, 0x34ff7a], ['C', 690, 0xffb020]]) {
      const pos = P(1210, py);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.85 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.011, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
      led.rotation.x = Math.PI / 2;
      led.position.copy(pos);
      led.userData.static = true;
      face.add(led);
      cyl(0.013, 0.013, 0.004, M.chrome, { x: pos.x, y: pos.y, z: 0.001, rx: Math.PI / 2, static: true, parent: face });
      this.outLeds[name] = mat;
    }
    // 7세그먼트 (출력값)
    this.segArt = new CanvasArt(160, 220, (c, w, h) => {
      lcdBackground(c, w, h, '#120404');
      const v = this.outValue;
      draw7seg(c, v === null ? '-' : String(v), 38, 26, 76, 160, '#ff3b2f', 'rgba(255,60,40,0.08)', { skew: 0.08 });
    }, { autoRedraw: false, mipmaps: false });
    const segPos = P(1370, 510);
    box(0.034, 0.046, 0.006, M.plasticDark, { x: segPos.x, y: segPos.y, z: 0.003, static: true, parent: face });
    markStatic(screenPlane(0.029, 0.04, this.segArt.texture, { x: segPos.x, y: segPos.y, z: 0.0065, parent: face }));
    // 전원 LED
    const pled = makeIndicator(0x3ddc97, 0.0035);
    pled.position.copy(P(1400, 100));
    pled.position.z = 0.003;
    pled.userData.setOn(true);
    face.add(pled);

    g.updateMatrixWorld(true);
    this.trainer = g;
    interaction.add(new Interactable(body, {
      outline: false,
      info: { title: '디지털 논리 트레이너', text: '+5V 전원 · 입력 스위치 A/B · IC 소켓 2개 · 출력 LED\n분홍(SUM)·주황(CARRY) LED로 결과 확인' },
    })).type = 'info';
  }

  drawFace(c, w, h) {
    c.fillStyle = '#e9edf2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b2a44';
    c.fillRect(0, 0, w, 120);
    panelLabel(c, 'DIGITAL LOGIC TRAINER  DL-74', 40, 60, 40, '#ffffff', 'left', 900);
    panelLabel(c, '+5V', 1340, 60, 32, '#3ddc97', 'left', 700);
    panelLabel(c, '반가산기 (Half Adder) 실습 보드', 860, 60, 30, '#9fc4ff', 'left', 500);
    // 배선
    c.strokeStyle = '#4a5568';
    c.lineWidth = 7;
    c.lineCap = 'round';
    const line = (pts) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    };
    // A → 두 소켓 위쪽 입력, B → 아래쪽 입력
    line([[290, 360], [430, 360], [430, 300], [560, 300]]);
    line([[430, 360], [430, 660], [560, 660]]);
    line([[290, 640], [470, 640], [470, 360], [560, 360]]);
    line([[470, 640], [470, 720], [560, 720]]);
    line([[880, 330], [1180, 330]]);
    line([[880, 690], [1180, 690]]);
    c.fillStyle = '#4a5568';
    for (const [x, y] of [[430, 360], [470, 640]]) {
      c.beginPath();
      c.arc(x, y, 12, 0, Math.PI * 2);
      c.fill();
    }
    // 소켓 테두리 + 라벨
    for (const [label, y, col] of [['SUM 게이트', 330, '#18a058'], ['CARRY 게이트', 690, '#d98e04']]) {
      c.strokeStyle = col;
      c.lineWidth = 5;
      c.setLineDash([16, 10]);
      roundRect(c, 545, y - 115, 350, 230, 22);
      c.stroke();
      c.setLineDash([]);
      panelLabel(c, label, 720, y - 140, 36, col, 'center', 900);
      // 노치 방향 안내
      panelLabel(c, '◀ 노치', 600, y + 140, 26, '#5b6675', 'center', 700);
    }
    panelLabel(c, 'A', 70, 360, 60, '#d0262b', 'center', 900);
    panelLabel(c, 'B', 70, 640, 60, '#1f4fb5', 'center', 900);
    panelLabel(c, 'S', 1270, 330, 54, '#18a058', 'center', 900);
    panelLabel(c, 'C', 1270, 690, 54, '#d98e04', 'center', 900);
    panelLabel(c, 'SUM', 1210, 250, 26, '#18a058', 'center', 700);
    panelLabel(c, 'CARRY', 1210, 610, 26, '#d98e04', 'center', 700);
    panelLabel(c, '출력값', 1370, 380, 26, '#5b6675', 'center', 700);
    panelLabel(c, '= 2C + S', 1370, 640, 26, '#5b6675', 'center', 700);
    panelLabel(c, 'INPUT', 150, 200, 30, '#5b6675', 'center', 700);
    panelLabel(c, 'OUTPUT', 1250, 160, 30, '#5b6675', 'center', 700);
    panelLabel(c, '74LS 시리즈 IC를 소켓에 꽂고 입력 스위치를 바꿔가며 진리표를 확인하세요', w / 2, h - 50, 30, '#3b4656', 'center', 500);
  }

  buildFoam() {
    const { interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.set(0.5, 0, 0.12);
    g.rotation.y = -0.12;
    this.root.add(g);
    const foamMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1d, roughness: 1.0 });
    box(0.2, 0.016, 0.26, foamMat, { y: 0.008, static: true, parent: g });
    const art = new CanvasArt(512, 96, (c, w, h) => {
      c.fillStyle = '#f7d44c';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#111';
      c.font = font(34, 900);
      c.fillText('⚡ IC 보관함 · 정전기 주의', 20, 60);
    });
    printPlane(0.2, 0.035, art.texture, { y: 0.009, z: 0.1305, static: true, parent: g });
    this.foamZones = [];
    for (let i = 0; i < 4; i++) {
      const z = new SnapZone({
        parent: g,
        position: new THREE.Vector3(0, 0.013, -0.09 + i * 0.058),
        accepts: (it) => it.kind === 'ic',
        radius: 0.045,
        name: `foam${i}`,
      });
      interaction.addZone(z);
      this.foamZones.push(z);
    }
  }

  buildChips() {
    const { interaction } = this.ctx;
    this.chips = [];
    ['AND', 'OR', 'XOR', 'NAND'].forEach((gate, i) => {
      const G = GATES[gate];
      const ic = makeIC(G.part, G.desc);
      ic.userData.gate = gate;
      this.root.add(ic);
      const item = new Grabbable(ic, {
        kind: 'ic',
        grabRadius: 0.04,
        center: new THREE.Vector3(0, 0.014, 0),
        restHeight: 0,
        info: { title: `${G.part} · ${gate}`, text: `${G.ko}\nY = ${G.sym} · 게이트 4개 내장 · 노치(홈) = 1번 핀 쪽` },
      });
      interaction.add(item);
      item.setHomeZone(this.foamZones[i]);
      interaction.snapInto(item, this.foamZones[i], false);
      this.chips.push(item);
    });
  }

  buildPanel() {
    const { interaction } = this.ctx;
    this.panel = createStationPanel({
      width: 0.56,
      height: 0.72,
      getState: () => this.panelState(),
      buttons: [{ id: 'reset', label: 'IC 정리', onClick: () => this.resetChips() }],
    });
    this.panel.mesh.position.set(-0.98, 0.67, -0.02);
    this.panel.mesh.rotation.y = 0.35;
    this.root.add(this.panel.mesh);
    interaction.add(new PanelItem(this.panel));
  }

  onChip(name, item, flipped) {
    this.table = {};
    if (item) {
      this.ctx.missions.touch('logic');
      if (flipped) {
        const pos = item.object.getWorldPosition(new THREE.Vector3());
        this.ctx.particles.smoke.emit(pos, 10, { vel: new THREE.Vector3(0, 0.08, 0), velSpread: 0.03, life: [1, 2], size: [0.01, 0.05], alpha: 0.35, color: new THREE.Color(0.7, 0.7, 0.7) });
        this.ctx.audio.play('hiss', pos, { volume: 0.4 });
        this.ctx.toast.show('IC를 거꾸로 꽂았어요! 🔥\n노치(홈)가 소켓 왼쪽(◀ 노치)으로 가야 해요', 'warn', 4);
        this.ctx.missions.mistake('logic', 'reverse');
      }
    }
    this.evaluate();
  }

  chipState(name) {
    const z = this.sockets[name];
    const it = z.occupant;
    if (!it) return { gate: null, ok: false };
    return { gate: it.object.userData.gate, ok: !z.flipped };
  }

  evaluate() {
    const s = this.chipState('SUM');
    const c = this.chipState('CARRY');
    const A = this.A;
    const B = this.B;
    const S = s.gate && s.ok ? GATES[s.gate].fn(A, B) : 0;
    const C = c.gate && c.ok ? GATES[c.gate].fn(A, B) : 0;
    this.S = S;
    this.C = C;
    this.outValue = s.gate || c.gate ? 2 * C + S : null;
    // 표시
    this.switches.A.pivot.rotation.x = A ? 0.5 : -0.5;
    this.switches.B.pivot.rotation.x = B ? 0.5 : -0.5;
    this.switches.A.led.userData.setOn(!!A, 3);
    this.switches.B.led.userData.setOn(!!B, 3);
    this.outLeds.S.emissiveIntensity = S ? 3.2 : 0;
    this.outLeds.C.emissiveIntensity = C ? 3.2 : 0;
    // 진리표 기록 (두 소켓 모두 정상일 때)
    if (s.gate && c.gate && s.ok && c.ok && !this.done) {
      const key = `${A}${B}`;
      const ok = S === (A ^ B) && C === (A & B);
      const prev = this.table[key];
      this.table[key] = { S, C, ok };
      if (!prev) {
        this.ctx.audio.play(ok ? 'beep' : 'error', this.trainer, { volume: ok ? 0.35 : 0.35 });
        if (!ok) this.ctx.missions.mistake('logic', 'wrongRow');
      }
      if (ROWS.every((r) => this.table[r]?.ok)) this.complete(s.gate, c.gate);
      else if (ROWS.every((r) => this.table[r]) && !this.toldWrong) {
        this.toldWrong = true;
        this.ctx.toast.show('진리표가 맞지 않아요 🤔\n표의 ✗ 줄을 보고 다른 IC로 바꿔보세요', 'warn', 4);
      }
    }
    this.segArt.redraw();
    this.panel.redraw();
  }

  complete(sumGate, carryGate) {
    this.done = true;
    const { missions, audio, toast } = this.ctx;
    if (missions.complete('logic', { sum: sumGate, carry: carryGate })) {
      audio.play('success', null, { volume: 0.8 });
      toast.show('✔ 실험 3 완료!\nS = A ⊕ B (XOR), C = A · B (AND) — 1+1 = 10₂', 'ok', 4.5);
    }
  }

  panelState() {
    const s = this.chipState('SUM');
    const c = this.chipState('CARRY');
    const tested = ROWS.filter((r) => this.table[r]).length;
    const anyWrong = ROWS.some((r) => this.table[r] && !this.table[r].ok);
    let hint;
    if (this.done) hint = { text: '반가산기 완성! 이 회로를 이어 붙이면 CPU 속 덧셈기(가산기)가 돼요.', kind: 'ok' };
    else if (!s.gate || !c.gate) hint = { text: '오른쪽 IC 보관함에서 칩을 집어 SUM·CARRY 소켓에 꽂으세요. 칩 윗면의 번호로 게이트 종류를 알 수 있어요.', kind: 'info' };
    else if (!s.ok || !c.ok) hint = { text: 'IC가 거꾸로 꽂혀 있어요. 노치(반원 홈)가 왼쪽으로 오게 다시 꽂으세요.', kind: 'bad' };
    else if (anyWrong) {
      const sWrong = ROWS.some((r) => this.table[r] && this.table[r].S !== ((+r[0]) ^ (+r[1])));
      hint = { text: sWrong ? 'SUM이 틀렸어요. SUM은 A와 B가 "서로 다를 때만" 1이에요. 어떤 게이트일까요?' : 'CARRY가 틀렸어요. 받아올림은 A와 B가 "둘 다 1일 때만" 생겨요.', kind: 'bad' };
    } else if (tested < 4) hint = { text: `입력 스위치 A, B를 바꿔가며 4가지 경우를 모두 확인하세요. (${tested}/4)`, kind: 'info' };
    else hint = { text: '확인 중…', kind: 'info' };
    return {
      num: 3,
      title: '디지털 논리: 반가산기',
      goal: '두 개의 IC로 1비트 덧셈기를 만드세요. A + B = (C S)₂',
      done: this.done,
      steps: [
        { text: 'SUM 소켓에 IC 꽂기', state: s.gate ? (s.ok ? 'done' : 'bad') : 'active' },
        { text: 'CARRY 소켓에 IC 꽂기', state: c.gate ? (c.ok ? 'done' : 'bad') : s.gate ? 'active' : 'todo' },
        { text: `입력 4가지 모두 확인하기 (${tested}/4)`, state: tested === 4 ? 'done' : s.gate && c.gate ? 'active' : 'todo' },
        { text: '진리표가 정답과 일치', state: this.done ? 'done' : anyWrong ? 'bad' : 'todo' },
      ],
      readoutHeight: 250,
      readout: (ctx, x, y, w) => this.drawTable(ctx, x, y, w),
      formula: null,
      hint: hint.text,
      hintKind: hint.kind,
    };
  }

  drawTable(c, x, y, w) {
    const cols = ['A', 'B', 'S', 'C', '정답 S C', ''];
    const cx = [0, 70, 170, 240, 360, 560].map((v) => x + 30 + v * (w / 640));
    c.textBaseline = 'top';
    c.font = font(26, 700);
    c.fillStyle = COLORS.muted;
    cols.forEach((t, i) => c.fillText(t, cx[i], y + 14));
    ROWS.forEach((r, i) => {
      const ry = y + 56 + i * 46;
      const cur = `${this.A}${this.B}` === r;
      if (cur) {
        roundRect(c, x + 10, ry - 6, w - 20, 42, 10);
        c.fillStyle = 'rgba(56,217,255,0.12)';
        c.fill();
      }
      const rec = this.table[r];
      c.font = font(30, 900);
      c.fillStyle = COLORS.text;
      c.fillText(r[0], cx[0], ry);
      c.fillText(r[1], cx[1], ry);
      c.fillStyle = rec ? (rec.ok ? COLORS.ok : COLORS.bad) : 'rgba(200,210,230,0.3)';
      c.fillText(rec ? String(rec.S) : '?', cx[2], ry);
      c.fillText(rec ? String(rec.C) : '?', cx[3], ry);
      c.fillStyle = 'rgba(200,210,230,0.55)';
      c.font = font(28, 700);
      const a = +r[0];
      const b = +r[1];
      c.fillText(`${a ^ b}   ${a & b}`, cx[4] + 10, ry);
      c.fillStyle = rec ? (rec.ok ? COLORS.ok : COLORS.bad) : 'transparent';
      c.fillText(rec ? (rec.ok ? '✔' : '✗') : '', cx[5], ry);
    });
  }

  resetChips() {
    for (const ch of this.chips) {
      if (ch.zone && ch.zone === ch.homeZone) continue;
      this.ctx.interaction.sendHome(ch, true);
    }
  }

  reset() {
    this.A = 0;
    this.B = 0;
    this.table = {};
    this.done = false;
    this.toldWrong = false;
    this.resetChips();
    this.evaluate();
  }

  update() {}
}
