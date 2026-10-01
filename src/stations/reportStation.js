import * as THREE from 'three';
import { CanvasArt } from '../core/canvasArt.js';
import { Grabbable, Interactable, PanelItem, SnapZone } from '../core/interaction.js';
import { M, box, cyl, makeIndicator, printPlane, screenPlane, markStatic } from '../world/props.js';
import { Panel, drawCard } from '../core/ui.js';
import { COLORS, font, wrapText, roundRect, HAND, easeInOut } from '../core/util.js';

const DESK_H = 0.76;

/**
 * 조교석: 프린터 → 보고서 → 제출함 → 최종 평가
 */
export class ReportStation {
  constructor(ctx) {
    this.ctx = ctx;
    this.desk = ctx.desk;
    this.root = new THREE.Group();
    this.root.position.y = DESK_H;
    this.desk.add(this.root);
    this.printing = -1;
    this.submitted = false;
    this.time = 0;

    this.buildPrinter();
    this.buildBox();
    this.buildPaper();
    this.buildResults();
    this.buildNamePlate();

    ctx.missions.on((type) => {
      if (type === 'allDone') setTimeout(() => this.startPrint(), 1800);
    });
  }

  buildNamePlate() {
    const art = new CanvasArt(512, 128, (c, w, h) => {
      c.fillStyle = '#1b1d21';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e9d8a6';
      c.font = font(52, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('조교석', w / 2, h / 2 - 8);
      c.font = font(22, 500);
      c.fillText('기초회로실험 Ⅱ · 질문은 이메일로', w / 2, h - 22);
    });
    printPlane(0.23, 0.057, art.texture, { x: -0.35, y: 0.032, z: 0.3 + 0.0155, rx: -0.3, roughness: 0.4, static: true, parent: this.root });
  }

  buildPrinter() {
    const g = new THREE.Group();
    g.position.set(-0.58, 0, -0.02);
    this.root.add(g);
    const body = new THREE.MeshStandardMaterial({ color: 0xe4e6e8, roughness: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.5 });
    box(0.4, 0.17, 0.32, body, { y: 0.085, round: 0.012, parent: g });
    box(0.36, 0.03, 0.18, dark, { y: 0.185, z: -0.08, rx: -0.5, static: true, parent: g });
    box(0.3, 0.014, 0.004, M.plasticDark, { y: 0.06, z: 0.161, static: true, parent: g });
    // 출력 트레이
    box(0.26, 0.004, 0.16, new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.5 }), { y: 0.03, z: 0.22, rx: 0.05, static: true, parent: g });
    // 조작부
    const art = new CanvasArt(256, 96, (c, w, h) => {
      c.fillStyle = '#3a3f46';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#9bd3ff';
      c.fillRect(10, 14, 130, 50);
      c.fillStyle = '#0d2233';
      c.font = font(20, 700);
      c.fillText(this.printing >= 0 && this.printing < 3 ? '인쇄 중…' : '대기', 20, 46);
      c.fillStyle = '#ddd';
      c.font = font(16, 700);
      c.fillText('EE-PRINT', 160, 40);
    }, { autoRedraw: false });
    this.printerArt = art;
    screenPlane(0.1, 0.0375, art.texture, { x: 0.12, y: 0.175, z: 0.12, rx: -0.5, parent: g });
    this.printLed = makeIndicator(0x3ddc97, 0.004);
    this.printLed.position.set(0.17, 0.12, 0.161);
    this.printLed.userData.setOn(true, 2);
    g.add(this.printLed);
    this.printer = g;
    this.ctx.interaction.add(new Interactable(g.children[0], {
      outline: false,
      info: () => ({ title: '프린터', text: this.ctx.missions.allDone ? '보고서를 출력했어요 — 종이를 집어 제출함에!' : '실험 4개를 모두 끝내면 보고서가 자동 출력돼요' }),
    })).type = 'info';
    g.updateMatrixWorld(true);
  }

  buildBox() {
    const g = new THREE.Group();
    g.position.set(0.22, 0, 0.12);
    g.rotation.y = 0.1;
    this.root.add(g);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2d5d9f, roughness: 0.5 });
    box(0.27, 0.006, 0.36, mat, { y: 0.003, parent: g });
    for (const s of [-1, 1]) box(0.006, 0.06, 0.36, mat, { x: s * 0.135, y: 0.03, parent: g });
    box(0.27, 0.06, 0.006, mat, { z: -0.18, y: 0.03, parent: g });
    box(0.27, 0.035, 0.006, mat, { z: 0.18, y: 0.0175, parent: g });
    const art = new CanvasArt(512, 80, (c, w, h) => {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b2a44';
      c.font = font(34, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('📥 보고서 제출함 (7주차)', w / 2, h / 2 + 2);
    });
    printPlane(0.25, 0.032, art.texture, { y: 0.0175, z: 0.1835, parent: g });
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.35), new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    marker.position.y = 0.03;
    marker.raycast = () => {};
    this.zone = new SnapZone({
      parent: g,
      position: new THREE.Vector3(0, 0.008, 0),
      accepts: (it) => it.kind === 'report',
      radius: 0.2,
      allowFlip: false,
      marker,
      onSnap: () => this.submit(),
      name: 'report-box',
    });
    this.ctx.interaction.addZone(this.zone);
    this.boxGroup = g;
    g.traverse((o) => { if (o.isMesh && o !== marker) o.userData.static = true; });
  }

  buildPaper() {
    this.paperArt = new CanvasArt(840, 1188, (c, w, h) => this.drawPaper(c, w, h), { autoRedraw: true });
    const paperMat = new THREE.MeshStandardMaterial({ map: this.paperArt.texture, roughness: 0.85 });
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.0016, 0.297), [M.paper, M.paper, paperMat, M.paper, M.paper, M.paper]);
    sheet.position.y = 0.0008;
    sheet.castShadow = true;
    g.add(sheet);
    // 스테이플러 심
    box(0.012, 0.0008, 0.0015, M.chrome, { x: -0.09, y: 0.0018, z: -0.135, ry: 0.6, parent: g });
    g.visible = false;
    this.root.add(g);
    // 출력 트레이 위 위치(홈)
    this.paperHome = { pos: new THREE.Vector3(-0.58, 0.04, 0.2), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.05) };
    g.position.copy(this.paperHome.pos);
    g.quaternion.copy(this.paperHome.quat);
    const item = new Grabbable(g, {
      kind: 'report',
      grabRadius: 0.1,
      center: new THREE.Vector3(0, 0, 0),
      restHeight: 0.001,
      desktopQuat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.9),
      holdOffset: null,
      info: { title: '실험 보고서 (출력본)', text: '조교석 오른쪽 파란 제출함에 넣으세요' },
    });
    item.enabled = false;
    this.ctx.interaction.add(item);
    item.setHomePose(this.root);
    this.paper = item;
  }

  drawPaper(c, w, h) {
    const { missions } = this.ctx;
    c.fillStyle = '#fbfaf6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.font = font(46, 900);
    c.fillText('기초회로실험 Ⅱ', w / 2, 110);
    c.font = font(38, 700);
    c.fillText('7주차 결과 보고서', w / 2, 170);
    c.textAlign = 'left';
    c.font = font(24, 500);
    c.fillStyle = '#444';
    c.fillText('전자공학부 1학년 · 이름: VR 체험자 · 실험실: B동 302호', 60, 240);
    c.fillRect(60, 260, w - 120, 3);
    const m = (id) => missions.get(id);
    const led = m('led').stats;
    const lines = [
      ['1. LED와 옴의 법칙', led.ohms ? `V = ${led.volts?.toFixed(1)} V, R = ${led.ohms >= 1000 ? `${led.ohms / 1000} kΩ` : `${led.ohms} Ω`} → I = ${(led.current * 1000).toFixed(1)} mA${led.burnt ? ` (LED ${led.burnt}개 소손 😅)` : ''}` : '—'],
      ['2. 오실로스코프와 파형', '사인파 1 kHz/4 Vpp, 구형파 250 Hz/2 Vpp, 삼각파 5 kHz/6 Vpp 생성 및 관측 완료'],
      ['3. 디지털 논리', `반가산기: S = A ⊕ B (74LS86), C = A · B (74LS08) — 진리표 4행 확인`],
      ['4. 납땜', '555 깜빡이 키트 납땜 10곳, LED 교대 점멸 동작 확인'],
    ];
    let y = 320;
    for (const [t, d] of lines) {
      c.fillStyle = '#1b2a44';
      c.font = font(30, 900);
      c.fillText(t, 60, y);
      c.fillStyle = '#333';
      c.font = font(24, 500);
      y += 44;
      y += wrapText(c, d, 80, y, w - 160, 34) + 26;
    }
    c.fillStyle = '#1b2a44';
    c.font = font(30, 900);
    c.fillText('5. 고찰', 60, y);
    c.fillStyle = '#2a4d9b';
    c.font = font(40, 400, HAND);
    y += 54;
    wrapText(c, '이론으로만 보던 V = IR이 눈앞에서 LED 밝기로 바뀌는 게 신기했다. 다음엔 LED를 덜 태우자...', 80, y, w - 160, 48);
    c.fillStyle = '#999';
    c.font = font(20, 500);
    c.fillText(`소요 시간 ${fmtTime(missions.elapsed())} · 실수 ${missions.mistakes}회`, 60, h - 60);
    // 조교 확인 도장 자리
    c.strokeStyle = this.submitted ? '#c8262b' : '#bbb';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(w - 130, h - 140, 70, 0, Math.PI * 2);
    c.stroke();
    if (this.submitted) {
      c.fillStyle = '#c8262b';
      c.font = font(34, 900);
      c.textAlign = 'center';
      c.fillText(missions.grade().grade, w - 130, h - 128);
      c.textAlign = 'left';
    } else {
      c.fillStyle = '#bbb';
      c.font = font(20, 500);
      c.textAlign = 'center';
      c.fillText('조교 확인', w - 130, h - 134);
      c.textAlign = 'left';
    }
  }

  buildResults() {
    this.results = new Panel({
      width: 1.0,
      height: 0.8,
      px: 1500,
      name: 'results',
      draw: (c, w, h, p) => this.drawResults(c, w, h, p),
    });
    this.results.mesh.position.set(0, 0.86, -0.05);
    this.results.mesh.rotation.y = 0;
    this.results.mesh.visible = false;
    this.root.add(this.results.mesh);
    this.resultsItem = new PanelItem(this.results);
    this.resultsItem.enabled = false;
    this.ctx.interaction.add(this.resultsItem);
  }

  drawResults(c, w, h, p) {
    const { missions } = this.ctx;
    const { grade, score } = missions.grade();
    drawCard(c, w, h, { accent: COLORS.ok, radius: 50 });
    const pad = 70;
    c.textBaseline = 'top';
    c.fillStyle = COLORS.ok;
    c.font = font(32, 700);
    c.fillText('기초회로실험 Ⅱ · 최종 평가', pad, 60);
    c.fillStyle = COLORS.text;
    c.font = font(70, 900);
    c.fillText('수고했어요, 전자공학도! 🎓', pad, 108);
    // 학점
    const gx = w - pad - 300;
    roundRect(c, gx, 210, 300, 300, 40);
    const g = c.createLinearGradient(gx, 210, gx + 300, 510);
    g.addColorStop(0, 'rgba(56,217,255,0.25)');
    g.addColorStop(1, 'rgba(61,220,151,0.25)');
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = COLORS.ok;
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.font = font(150, 900);
    c.fillText(grade, gx + 150, 250);
    c.font = font(34, 700);
    c.fillStyle = COLORS.muted;
    c.fillText(`${score}점`, gx + 150, 440);
    c.textAlign = 'left';

    const rows = missions.list.map((m) => [`${m.num}. ${m.title}`, this.ctx.hub.statLine(m)]);
    let y = 230;
    for (const [t, d] of rows) {
      c.fillStyle = COLORS.ok;
      c.font = font(34, 700);
      c.fillText(`✔ ${t}`, pad, y);
      c.fillStyle = COLORS.muted;
      c.font = font(26, 500);
      c.fillText(d, pad + 48, y + 46);
      y += 98;
    }
    c.fillStyle = COLORS.text;
    c.font = font(30, 500);
    c.fillText(`총 소요 시간 ${fmtTime(missions.elapsed())}   ·   실수 ${missions.mistakes}회`, pad, y + 6);
    const comments = {
      'A+': '완벽해요! 조교님이 "혹시 학부연구생 할래요?"라고 물어볼 기세 ✨',
      A0: '훌륭해요! 이 정도면 전공 실험 에이스.',
      'B+': '좋아요! LED 몇 개의 희생은 공학도의 통과의례예요.',
      B0: '무난하게 통과! 다음 주엔 더 잘할 수 있어요.',
      'C+': '고생 많았어요. 실험은 실수하면서 배우는 거예요.',
      C0: '밤샘 실험의 흔적이 보여요… 그래도 끝까지 해냈어요!',
      'D+': '끝까지 해낸 것만으로도 대단해요. 커피 한 잔 하세요 ☕',
    };
    c.fillStyle = '#c5d4ea';
    c.font = font(30, 500);
    wrapText(c, comments[grade], pad, y + 60, w - pad * 2 - 20, 42);
    p.button(c, { id: 'again', x: pad, y: h - 150, w: 420, h: 96, label: '처음부터 다시 하기 ↺', style: 'primary', size: 36, onClick: () => this.ctx.resetAll?.() });
    p.button(c, { id: 'close', x: pad + 450, y: h - 150, w: 360, h: 96, label: '실험실 둘러보기', size: 34, onClick: () => this.hideResults() });
  }

  hideResults() {
    this.results.mesh.visible = false;
    this.resultsItem.enabled = false;
  }

  startPrint() {
    if (this.printing >= 0 || this.submitted) return;
    this.printing = 0;
    this.paperArt.redraw();
    this.printerArt.redraw();
    this.ctx.audio.play('printer', this.printer, { volume: 0.8 });
    const g = this.paper.object;
    this.root.attach(g);
    g.visible = true;
    g.position.set(-0.58, 0.06, 0.02);
    g.quaternion.copy(this.paperHome.quat);
    this.paper.state = 'tween';
  }

  submit() {
    if (this.submitted) return;
    this.submitted = true;
    const { missions, audio, particles, toast } = this.ctx;
    missions.submitted = true;
    missions.emit('submitted');
    missions.emit('change');
    this.paperArt.redraw();
    audio.play('fanfare', null, { volume: 0.9 });
    toast.show('📥 보고서 제출 완료!\n조교석 위에 최종 평가가 떴어요', 'ok', 4.5);
    const pos = this.boxGroup.getWorldPosition(new THREE.Vector3());
    pos.y += 0.6;
    const colors = [0x38d9ff, 0x3ddc97, 0xffb547, 0xff5ec4, 0xffffff, 0x9b7bff].map((cc) => new THREE.Color(cc));
    for (let i = 0; i < 4; i++) {
      setTimeout(() => particles.confetti.emit(pos, 90, { vel: new THREE.Vector3(0, 1.4, 0), velSpread: 1.2, life: [2.2, 3.6], size: [0.025, 0.02], alpha: 1, color: colors, drag: 1.2, gravity: 1.4, spin: 8 }), i * 260);
    }
    for (const p of this.ctx.pointers()) p.pulse(0.6, 200);
    setTimeout(() => this.showResults(), 900);
  }

  showResults() {
    this.results.redraw();
    this.results.mesh.visible = true;
    this.resultsItem.enabled = true;
    this.resultsAppear = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.printing >= 0 && this.printing < 3) {
      this.printing += dt;
      const t = Math.min(1, this.printing / 2.4);
      const e = easeInOut(t);
      const g = this.paper.object;
      g.position.lerpVectors(new THREE.Vector3(-0.58, 0.06, 0.02), this.paperHome.pos, e);
      if (this.printing >= 2.6) {
        this.printing = 3;
        this.paper.state = 'free';
        this.paper.enabled = true;
        this.printerArt.redraw();
        this.ctx.audio.play('paper', g, { volume: 0.7 });
        this.ctx.toast.show('보고서 출력 완료! 🖨️\n종이를 집어서 파란 제출함에 넣으세요', 'ok', 4);
      }
    }
    if (this.results.mesh.visible && this.resultsAppear !== undefined && this.resultsAppear < 1) {
      this.resultsAppear = Math.min(1, this.resultsAppear + dt * 2.5);
      const s = 0.6 + 0.4 * easeInOut(this.resultsAppear);
      this.results.mesh.scale.setScalar(s);
    }
  }

  reset() {
    this.printing = -1;
    this.submitted = false;
    this.hideResults();
    const g = this.paper.object;
    if (this.paper.zone) this.ctx.interaction.unsnap(this.paper);
    if (this.paper.holder) {
      this.paper.holder.held = null;
      this.paper.holder = null;
    }
    this.root.attach(g);
    g.visible = false;
    g.position.copy(this.paperHome.pos);
    g.quaternion.copy(this.paperHome.quat);
    this.paper.state = 'free';
    this.paper.enabled = false;
    this.printerArt.redraw();
    this.paperArt.redraw();
  }
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}
