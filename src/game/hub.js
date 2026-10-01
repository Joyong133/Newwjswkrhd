import * as THREE from 'three';
import { Panel, drawCard, drawStatusDot, hexA } from '../core/ui.js';
import { Button, PanelItem, Grabbable } from '../core/interaction.js';
import { COLORS, font, wrapText, roundRect } from '../core/util.js';
import { CanvasArt } from '../core/canvasArt.js';
import { LAYOUT, standPoint } from '../world/lab.js';

/**
 * 안내 UI: 환영/미션 보드, 순간이동 마커, 다음 목적지 표시, 손목 HUD, 데스크톱 HUD
 */
export class Hub {
  constructor(ctx) {
    this.ctx = ctx;
    this.started = false;
    this.time = 0;
    const { scene, interaction, missions } = ctx;

    this.stations = {
      start: { ...standPoint({ ...LAYOUT.start, z: LAYOUT.start.z + 0.0 }, 0), label: '⌂', name: '안내판' },
      led: { ...standPoint(LAYOUT.benchA), label: '1', name: 'LED 회로', bench: LAYOUT.benchA },
      scope: { ...standPoint(LAYOUT.benchB), label: '2', name: '오실로스코프', bench: LAYOUT.benchB },
      logic: { ...standPoint(LAYOUT.benchC), label: '3', name: '논리회로', bench: LAYOUT.benchC },
      solder: { ...standPoint(LAYOUT.benchD), label: '4', name: '납땜', bench: LAYOUT.benchD },
      report: { ...standPoint(LAYOUT.ta, 0.78), label: '✎', name: '보고서 제출', bench: LAYOUT.ta },
    };

    // ---------------------------------------------------------------------
    // 메인 보드(시작 지점)
    // ---------------------------------------------------------------------
    this.board = new Panel({
      width: 1.1,
      height: 0.78,
      px: 1600,
      name: 'missionBoard',
      draw: (c, w, h, p) => this.drawBoard(c, w, h, p),
    });
    this.board.mesh.position.set(0, 1.52, 1.62);
    scene.add(this.board.mesh);
    interaction.add(new PanelItem(this.board));
    // 받침대
    const stand = new THREE.Group();
    stand.position.set(0, 0, 1.66);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2a3340, roughness: 0.4, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.12, 12), standMat);
    pole.position.y = 0.56;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.025, 32), standMat);
    base.position.y = 0.0125;
    pole.castShadow = base.castShadow = true;
    stand.add(pole, base);
    scene.add(stand);
    this.boardGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.84), new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.06, depthWrite: false, toneMapped: false }));
    this.boardGlow.position.set(0, 1.52, 1.615);
    this.boardGlow.raycast = () => {};
    scene.add(this.boardGlow);

    // ---------------------------------------------------------------------
    // 순간이동 마커
    // ---------------------------------------------------------------------
    this.markers = {};
    for (const [id, st] of Object.entries(this.stations)) this.markers[id] = this.makeMarker(id, st);

    // 다음 목적지 표시(화살표)
    this.beacon = new THREE.Group();
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x38d9ff, emissive: 0x38d9ff, emissiveIntensity: 1.6, roughness: 0.3 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), arrowMat);
    cone.rotation.x = Math.PI;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), arrowMat);
    shaft.position.y = 0.12;
    this.beacon.add(cone, shaft);
    this.beacon.visible = false;
    this.beacon.traverse((o) => { o.raycast = () => {}; });
    scene.add(this.beacon);

    // ---------------------------------------------------------------------
    // 손목 HUD (XR 왼손)
    // ---------------------------------------------------------------------
    this.wrist = new Panel({
      width: 0.16,
      height: 0.085,
      px: 640,
      name: 'wristHud',
      draw: (c, w, h) => this.drawWrist(c, w, h),
    });
    this.wrist.mesh.visible = false;
    scene.add(this.wrist.mesh);

    this.buildPhone();

    // DOM HUD
    this.domObjective = document.getElementById('objective');
    this.domToast = document.getElementById('toast');
    ctx.toast.onShow((text, kind, dur) => this.showDomToast(text, kind, dur));

    missions.on((type, data) => {
      this.board.redraw();
      this.wrist.redraw();
      this.updateDom();
      if (type === 'allDone') this.onAllDone();
      if (type === 'complete') {
        const msg = {
          led: ['지윤', 'LED 몇 개 태웠어? 난 세 개 ㅋㅋㅋ 💥'],
          scope: ['조교님', '오실로스코프 프로브 배율 x1인지 꼭 확인하세요~'],
          logic: ['현우', 'XOR 이거 왜 이렇게 헷갈림… 반가산기 됨?'],
          solder: ['엄마', '밥은 먹고 다니니? 너무 늦게 자지 말고 🍚'],
        }[data.id];
        if (msg) setTimeout(() => this.phoneMessage(msg[0], msg[1]), 6000);
      }
      if (type === 'submitted') setTimeout(() => this.phoneMessage('조교님', '보고서 잘 받았습니다. 오늘 정말 수고 많았어요! 👏'), 7000);
    });
    this.updateDom();
  }

  makeMarker(id, st) {
    const { scene, interaction } = this.ctx;
    const g = new THREE.Group();
    g.position.copy(st.pos);
    g.position.y = 0.004;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const fillMat = new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), fillMat);
    fill.rotation.x = -Math.PI / 2;
    const art = new CanvasArt(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#38d9ff';
      c.font = font(st.label.length > 1 ? 90 : 150, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(st.label, w / 2, h / 2 + 8);
    });
    const labelMat = new THREE.MeshBasicMaterial({ map: art.texture, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.8 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), labelMat);
    label.rotation.x = -Math.PI / 2;
    label.rotation.z = -st.yaw;
    label.position.y = 0.002;
    // 진행 방향 화살표 (바라볼 방향)
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), ringMat);
    tri.rotation.x = -Math.PI / 2;
    tri.position.set(-Math.sin(st.yaw) * 0.36, 0.002, -Math.cos(st.yaw) * 0.36);
    tri.rotation.z = st.yaw;
    tri.scale.y = 0.3;
    g.add(ring, fill, label, tri);
    scene.add(g);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 24), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.015;
    g.add(hit);
    const m = { group: g, ringMat, fillMat, labelMat, hover: false, id };
    const btn = new Button(g, {
      colliders: [hit],
      outline: false,
      travel: 0,
      sound: null,
      poke: false,
      info: { title: `${st.name} (으)로 이동`, text: '트리거를 당기면 순간이동' },
      onHover: (on) => { m.hover = on; },
      onPress: () => this.teleport(id),
    });
    btn.tooltipLift = 0.25;
    interaction.add(btn);
    m.button = btn;
    return m;
  }

  teleport(id) {
    const st = this.stations[id];
    this.ctx.locomotion.teleport(st.pos, st.yaw);
  }

  // -------------------------------------------------------------------------
  drawBoard(c, w, h, p) {
    const { missions } = this.ctx;
    drawCard(c, w, h, { accent: missions.allDone ? COLORS.ok : COLORS.accent, radius: 48 });
    const pad = 70;
    c.textBaseline = 'top';
    if (!this.started) {
      c.fillStyle = COLORS.accent;
      c.font = font(30, 700);
      c.fillText('전자공학관 B동 302호 · 회로실험실 · 22:47', pad, 60);
      c.fillStyle = COLORS.text;
      c.font = font(78, 900);
      c.fillText('전자공학과의 밤', pad, 108);
      c.font = font(34, 500);
      c.fillStyle = '#c5d4ea';
      wrapText(c, '내일 아침 9시까지 기초회로실험 보고서를 내야 합니다. 텅 빈 실험실에서 실험 4개를 끝내고, 출력한 보고서를 조교석 제출함에 넣으세요.', pad, 220, w - pad * 2, 48);
      const items = [
        ['1', 'LED와 옴의 법칙', '저항을 골라 LED를 적정 전류로 밝히기'],
        ['2', '오실로스코프와 파형', '함수발생기로 목표 파형 3개 만들기'],
        ['3', '디지털 논리', '74LS IC를 꽂아 반가산기 완성'],
        ['4', '납땜', '555 깜빡이 키트 납땜 10곳'],
      ];
      items.forEach(([n, t, d], i) => {
        const x = pad + (i % 2) * ((w - pad * 2) / 2 + 10);
        const y = 350 + Math.floor(i / 2) * 120;
        roundRect(c, x, y, (w - pad * 2) / 2 - 10, 104, 22);
        c.fillStyle = 'rgba(255,255,255,0.05)';
        c.fill();
        c.fillStyle = COLORS.accent;
        c.font = font(44, 900);
        c.fillText(n, x + 26, y + 26);
        c.fillStyle = COLORS.text;
        c.font = font(34, 700);
        c.fillText(t, x + 80, y + 16);
        c.font = font(26, 500);
        c.fillStyle = COLORS.muted;
        c.fillText(d, x + 80, y + 60);
      });
      c.font = font(28, 500);
      c.fillStyle = COLORS.muted;
      wrapText(c, '조작: 트리거/그립 = 잡기·누르기 · 노브는 잡고 손목 비틀기 · 왼쪽 스틱 이동 · 오른쪽 스틱 회전 · 바닥의 원을 가리키고 트리거 = 순간이동', pad, 610, w - pad * 2 - 420, 40);
      p.button(c, { id: 'start', x: w - pad - 380, y: h - 170, w: 380, h: 110, label: '실험 시작 ▶', style: 'primary', size: 44, onClick: () => this.start() });
      this.seatedButton(c, p, pad, h - 160);
      return;
    }
    const done = missions.doneCount;
    c.fillStyle = COLORS.accent;
    c.font = font(30, 700);
    c.fillText('오늘의 실험 · 진행 현황', pad, 60);
    c.fillStyle = COLORS.text;
    c.font = font(64, 900);
    c.fillText(missions.allDone ? '모든 실험 완료! 🎉' : `실험 ${done} / 4 완료`, pad, 104);
    // 진행 바
    const bx = pad;
    const by = 196;
    const bw = w - pad * 2;
    roundRect(c, bx, by, bw, 18, 9);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    roundRect(c, bx, by, Math.max(18, (bw * done) / 4), 18, 9);
    const g = c.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, COLORS.accent);
    g.addColorStop(1, COLORS.ok);
    c.fillStyle = g;
    c.fill();

    const current = missions.current;
    missions.list.forEach((m, i) => {
      const y = 250 + i * 108;
      const isCur = current && current.id === m.id;
      roundRect(c, pad, y, w - pad * 2, 94, 22);
      c.fillStyle = isCur ? hexA(COLORS.accent, 0.12) : 'rgba(255,255,255,0.04)';
      c.fill();
      if (isCur) {
        c.strokeStyle = hexA(COLORS.accent, 0.6);
        c.lineWidth = 2;
        c.stroke();
      }
      drawStatusDot(c, pad + 46, y + 47, 22, m.status === 'done' ? 'done' : isCur ? 'active' : 'todo');
      c.fillStyle = m.status === 'done' ? '#9ff0cb' : COLORS.text;
      c.font = font(36, 700);
      c.fillText(`${m.num}. ${m.title}`, pad + 90, y + 14);
      c.font = font(25, 500);
      c.fillStyle = COLORS.muted;
      c.fillText(m.status === 'done' ? `완료 · ${this.statLine(m)}` : m.where, pad + 90, y + 56);
      p.button(c, { id: `go-${m.id}`, x: w - pad - 190, y: y + 17, w: 170, h: 60, label: '이동 →', size: 28, onClick: () => this.teleport(m.id) });
    });
    const y = 250 + 4 * 108 + 10;
    if (missions.allDone) {
      c.font = font(30, 700);
      c.fillStyle = COLORS.ok;
      c.fillText('프린터에서 보고서를 꺼내 조교석 제출함에 넣으세요!', pad, y + 20);
      p.button(c, { id: 'go-report', x: w - pad - 330, y: y + 4, w: 330, h: 70, label: '조교석으로 →', style: 'primary', size: 30, onClick: () => this.teleport('report') });
    } else {
      c.font = font(27, 500);
      c.fillStyle = COLORS.muted;
      c.fillText('실험 순서는 자유예요. 바닥의 파란 원을 가리키고 트리거로 순간이동!', pad, y + 22);
    }
    this.seatedButton(c, p, pad, h - 120);
  }

  seatedButton(c, p, x, y) {
    const on = this.ctx.locomotion.heightOffset > 0;
    p.button(c, {
      id: 'seated',
      x,
      y,
      w: 420,
      h: 76,
      label: on ? '🪑 앉은 자세 모드: 켜짐' : '🪑 앉아서 체험하기',
      size: 28,
      onClick: () => {
        this.ctx.locomotion.setSeated(!on);
        this.ctx.toast.show(on ? '서서 체험하기로 바꿨어요' : '앉은 자세 모드: 시점을 45cm 올렸어요', 'ok', 2.5);
        this.board.redraw();
      },
    });
  }

  // -------------------------------------------------------------------------
  // 아일랜드 위 스마트폰: 단톡방 메시지
  // -------------------------------------------------------------------------
  buildPhone() {
    const { scene, interaction } = this.ctx;
    this.messages = [];
    this.storyStart = performance.now();
    const g = new THREE.Group();
    g.name = 'phone';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.008, 0.152), new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.3, metalness: 0.6 }));
    body.position.y = 0.004;
    body.castShadow = true;
    g.add(body);
    this.phoneArt = new CanvasArt(384, 784, (c, w, h) => this.drawPhone(c, w, h), { autoRedraw: true });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.145), new THREE.MeshBasicMaterial({ map: this.phoneArt.texture, toneMapped: false }));
    screen.rotation.x = -Math.PI / 2;
    screen.position.y = 0.0082;
    screen.userData.noCollide = true;
    g.add(screen);
    g.position.set(0.32, 0.762, 0.82);
    g.rotation.y = 0.35;
    scene.add(g);
    const item = new Grabbable(g, {
      kind: 'phone',
      grabRadius: 0.06,
      restHeight: 0,
      colliders: [body],
      desktopQuat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2),
      info: () => ({ title: '내 스마트폰 📱', text: this.messages.length ? `새 메시지 ${this.messages.length}개 — 집어서 읽어보세요` : '22시대… 아직 조용하다' }),
    });
    interaction.add(item);
    item.setHomePose(scene);
    this.phone = item;
    this.phoneScreenMat = screen.material;
    setTimeout(() => this.phoneMessage('전자과 1학년 단톡', '민수: 다들 보고서 어디까지 함?? 나 아직 1번… 😇'), 25000);
  }

  storyTime() {
    const secs = 22 * 3600 + 47 * 60 + 12 + (performance.now() - this.storyStart) / 1000;
    const h = Math.floor(secs / 3600) % 24;
    const m = Math.floor(secs / 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  drawPhone(c, w, h) {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1a2a4a');
    g.addColorStop(1, '#3a1f4a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.font = font(26, 500);
    c.fillText('목요일 밤', w / 2, 90);
    c.font = font(96, 300);
    c.fillText(this.storyTime(), w / 2, 190);
    c.textAlign = 'left';
    const list = this.messages.slice(-4).reverse();
    list.forEach((m, i) => {
      const y = 250 + i * 128;
      roundRect(c, 18, y, w - 36, 112, 22);
      c.fillStyle = 'rgba(255,255,255,0.86)';
      c.fill();
      c.fillStyle = '#f7d000';
      roundRect(c, 32, y + 16, 34, 34, 9);
      c.fill();
      c.fillStyle = '#3a1d1d';
      c.font = font(18, 900);
      c.fillText('톡', 38, y + 40);
      c.fillStyle = '#111';
      c.font = font(20, 700);
      c.fillText(m.from, 78, y + 40);
      c.fillStyle = '#888';
      c.font = font(16, 500);
      c.textAlign = 'right';
      c.fillText(m.time, w - 34, y + 40);
      c.textAlign = 'left';
      c.fillStyle = '#222';
      c.font = font(18, 500);
      wrapText(c, m.text, 32, y + 74, w - 70, 24);
    });
    if (!list.length) {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.font = font(20, 500);
      c.textAlign = 'center';
      c.fillText('알림 없음', w / 2, 300);
      c.textAlign = 'left';
    }
  }

  phoneMessage(from, text) {
    this.messages.push({ from, text, time: this.storyTime() });
    this.phoneArt.redraw();
    this.ctx.audio.play('buzz', this.phone.object, { volume: 0.9, ref: 0.7 });
    this.phoneBuzz = 0.9;
    this.ctx.toast.show(`📱 ${from}\n${text}`, 'ok', 3.8);
  }

  statLine(m) {
    const s = m.stats;
    switch (m.id) {
      case 'led': return `${s.volts?.toFixed(1)} V · ${s.ohms >= 1000 ? `${s.ohms / 1000} kΩ` : `${s.ohms} Ω`} · ${(s.current * 1000).toFixed(1)} mA${s.burnt ? ` · LED ${s.burnt}개 희생` : ''}`;
      case 'scope': return `목표 파형 3개 일치${s.mistakes ? '' : ''}`;
      case 'logic': return `SUM=${s.sum || 'XOR'}, CARRY=${s.carry || 'AND'}`;
      case 'solder': return `납땜 ${s.joints || 10}곳 · 깜빡이 동작 확인`;
      default: return '';
    }
  }

  drawWrist(c, w, h) {
    const { missions } = this.ctx;
    drawCard(c, w, h, { accent: missions.allDone ? COLORS.ok : COLORS.accent, radius: 30 });
    const m = missions.current;
    c.textBaseline = 'top';
    c.fillStyle = COLORS.accent;
    c.font = font(28, 700);
    c.fillText(this.started ? `실험 ${missions.doneCount}/4 완료` : '안내판의 [실험 시작]을 누르세요', 34, 28);
    c.fillStyle = COLORS.text;
    c.font = font(40, 900);
    const title = !this.started ? '전자공학과의 밤' : missions.allDone ? (missions.submitted ? '수고했어요! 🎓' : '보고서 제출하기') : `${m.num}. ${m.title}`;
    c.fillText(title, 34, 80);
    c.font = font(26, 500);
    c.fillStyle = COLORS.muted;
    const sub = !this.started ? '' : missions.allDone ? (missions.submitted ? '최종 결과는 조교석에서' : '조교석 프린터 → 제출함') : m.where;
    c.fillText(sub, 34, 140);
    // 진행 점
    missions.list.forEach((mm, i) => {
      c.beginPath();
      c.arc(w - 180 + i * 40, 46, 12, 0, Math.PI * 2);
      c.fillStyle = mm.status === 'done' ? COLORS.ok : 'rgba(255,255,255,0.15)';
      c.fill();
    });
  }

  updateDom() {
    const { missions } = this.ctx;
    if (!this.domObjective) return;
    const m = missions.current;
    if (!this.started) this.domObjective.innerHTML = '<b>안내판</b>의 [실험 시작]을 클릭하세요';
    else if (missions.allDone) this.domObjective.innerHTML = missions.submitted ? '<b>🎓 수고했어요!</b>\n조교석에서 최종 결과를 확인하세요' : '<b>모든 실험 완료!</b>\n조교석 프린터에서 보고서를 꺼내 제출함에 넣으세요';
    else this.domObjective.innerHTML = `<b>실험 ${m.num}/4 · ${m.title}</b>\n${m.where} · 완료 ${missions.doneCount}/4`;
  }

  showDomToast(text, kind, dur) {
    const el = this.domToast;
    if (!el || this.ctx.isXR()) return;
    el.textContent = text;
    el.className = kind === 'error' ? 'error' : kind === 'warn' ? 'warn' : '';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.add('hidden'), dur * 1000);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.ctx.missions.start();
    this.ctx.audio.play('chime', null, { volume: 0.8 });
    this.ctx.toast.show('실험 시작!\n먼저 왼쪽 실험대(1)로 가볼까요?', 'ok', 3.5);
    this.board.redraw();
    this.wrist.redraw();
    this.updateDom();
  }

  onAllDone() {
    this.ctx.toast.show('🎉 실험 4개 모두 완료!\n조교석 프린터에서 보고서가 나오고 있어요', 'ok', 5);
  }

  /** 다음 목적지 id */
  nextTarget() {
    const { missions } = this.ctx;
    if (!this.started) return null;
    if (missions.allDone) return missions.submitted ? null : 'report';
    return missions.current?.id || null;
  }

  update(dt, { pointers, isXR, headPos }) {
    this.time += dt;
    const target = this.nextTarget();
    // 마커 표시
    for (const [id, m] of Object.entries(this.markers)) {
      const near = headPos.distanceTo(m.group.position) < 0.55;
      const isTarget = id === target;
      const pulse = isTarget ? 0.5 + 0.5 * Math.sin(this.time * 4) : 0;
      m.ringMat.opacity = near ? 0.12 : m.hover ? 1 : 0.35 + pulse * 0.5;
      m.fillMat.opacity = near ? 0.02 : m.hover ? 0.25 : 0.05 + pulse * 0.1;
      m.labelMat.opacity = near ? 0.15 : 0.85;
      const col = isTarget ? 0x3ddc97 : 0x38d9ff;
      m.ringMat.color.setHex(m.hover ? 0xffffff : col);
      m.button.enabled = !near;
      if (id === 'report') m.group.visible = this.ctx.missions.allDone;
    }
    // 화살표 비콘
    if (target && this.stations[target]?.bench) {
      const b = this.stations[target].bench;
      this.beacon.visible = true;
      this.beacon.position.set(b.x, 1.95 + Math.sin(this.time * 2.5) * 0.06, b.z);
      if (target === 'report') this.beacon.position.y = 1.55 + Math.sin(this.time * 2.5) * 0.06;
      this.beacon.rotation.y += dt * 1.5;
      const d = headPos.distanceTo(this.beacon.position);
      this.beacon.scale.setScalar(Math.min(2, Math.max(0.8, d / 2.5)));
    } else this.beacon.visible = false;

    this.boardGlow.material.opacity = 0.04 + 0.03 * Math.sin(this.time * 2);
    const st = this.storyTime();
    if (st !== this.lastStoryTime) {
      this.lastStoryTime = st;
      this.phoneArt.redraw();
    }
    if (this.phoneBuzz > 0) {
      this.phoneBuzz -= dt;
      const o = this.phone.object;
      if (this.phone.state !== 'held' && this.phone.state !== 'tween') {
        o.rotation.y += Math.sin(this.time * 90) * 0.004;
      } else this.phone.holder?.pulse(0.3, 30);
    }

    // 손목 HUD: 왼손 그립을 따라감
    const left = pointers.find((p) => p.kind === 'xr' && p.active && p.handedness === 'left');
    if (isXR && left) {
      const q = left.gripQuat;
      const off = left.isHand ? new THREE.Vector3(0.0, 0.03, 0.06) : new THREE.Vector3(0.0, 0.035, 0.09);
      this.wrist.mesh.position.copy(left.gripPos).add(off.applyQuaternion(q));
      // 손등 위에서 사용자를 향하도록
      const cam = this.ctx.camera.getWorldPosition(new THREE.Vector3());
      this.wrist.mesh.lookAt(cam);
      const facing = cam.clone().sub(this.wrist.mesh.position).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      this.wrist.mesh.visible = true;
      this.wrist.material.opacity = Math.max(0.25, Math.min(1, facing.dot(up) * 1.5 + 0.6));
    } else this.wrist.mesh.visible = false;
  }

  reset() {
    this.board.redraw();
    this.wrist.redraw();
    this.updateDom();
  }
}
