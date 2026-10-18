import * as THREE from 'three';
import { Panel, drawCard } from '../core/panel.js';
import { C, font, MONO, roundRect, wrapLines, drawWrapped, shuffle, hexA, disposeTree, clamp } from '../core/util.js';
import { SIMS } from '../sims/index.js';
import { GRADE_COLORS, gradeOf } from '../progress.js';

// 강의 보드 캔버스 레이아웃(px)
const BW = 2048;
const BOARD_W = 2.1;
const BOARD_H = 1.2;
const GRAPH = { x: 40, y: 170, w: 1220, h: 760 };
const CTRL_X = 1300;
const OPT_MARK = ['①', '②', '③', '④'];

/** 학습 위치(학생이 서는 곳)와 각 구성 요소의 로컬 좌표 */
export const STATION_LAYOUT = {
  spot: new THREE.Vector3(0, 0, 2.0),
  board: new THREE.Vector3(0, 1.55, 0),
  list: new THREE.Vector3(-1.7, 1.38, 0.75),
  pedestal: new THREE.Vector3(1.62, 0, 0.9),
};

export class YearStation {
  constructor({ year, yaw, radius, ctx }) {
    this.year = year;
    this.ctx = ctx;
    this.color = year.color;
    this.colorHex = new THREE.Color(year.color);
    this.root = new THREE.Group();
    this.root.name = `year${year.year}`;
    this.root.rotation.y = yaw;
    this.root.position.set(-Math.sin(yaw) * radius, 0, -Math.cos(yaw) * radius);
    this.yaw = yaw;
    ctx.scene.add(this.root);

    this.subjectIdx = 0;
    this.tab = 'lesson';
    this.slide = 0;
    this.quiz = null;
    this.sim = null;
    this.active = false;
    this.graphTimer = 0;
    this.simDirty = false;
    this.boardTimer = 0;

    this.buildArch();
    this.buildList();
    this.buildBoard();
    this.buildPedestal();
    this.selectSubject(0, false);
    ctx.progress.on(() => {
      this.list.invalidate();
      this.sign.invalidate();
    });
  }

  get subject() {
    return this.year.subjects[this.subjectIdx];
  }

  /** 순간이동용: 학습 위치(월드)와 바라볼 방향 */
  spot() {
    const p = STATION_LAYOUT.spot.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.root.position);
    return { pos: p, yaw: this.yaw };
  }

  // -------------------------------------------------------------------------
  // 구조물: 아치 + 학년 간판 + 바닥 표시
  // -------------------------------------------------------------------------
  buildArch() {
    const { root, color } = this;
    const dark = new THREE.MeshStandardMaterial({ color: 0x141c2e, roughness: 0.6, metalness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.5, 0.22), dark);
      pillar.position.set(sx * 3.2, 1.75, -0.35);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 3.3, 0.02), glow);
      strip.position.set(sx * 3.2, 1.75, -0.23);
      root.add(pillar, strip);
      this.ctx.interact.addBlocker(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.62, 0.22, 0.24), dark);
    beam.position.set(0, 3.55, -0.35);
    const beamStrip = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.025, 0.02), glow);
    beamStrip.position.set(0, 3.45, -0.22);
    root.add(beam, beamStrip);
    // 뒷벽(은은한 그라데이션 스크린)
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(6.2, 3.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.03), toneMapped: false }),
    );
    back.position.set(0, 1.75, -0.4);
    root.add(back);

    this.sign = new Panel({
      width: 3.4,
      height: 0.62,
      px: 1600,
      name: 'sign',
      draw: (c, w, h) => {
        const y = this.year;
        const st = this.ctx.progress.yearStats(y);
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        c.fillStyle = color;
        c.shadowColor = color;
        c.shadowBlur = 24;
        c.font = font(118, 900);
        c.fillText(`${y.title} · ${y.theme}`, w / 2, h * 0.38);
        c.shadowBlur = 0;
        c.fillStyle = C.muted;
        c.font = font(40, 500);
        c.fillText(`${y.desc}   ·   이수 ${st.passed}/${st.total}`, w / 2, h * 0.82);
      },
    });
    this.sign.mesh.position.set(0, 2.82, -0.3);
    root.add(this.sign.mesh);

    // 학습 위치 표시
    const spot = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.44, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.38, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, toneMapped: false }));
    inner.rotation.x = -Math.PI / 2;
    spot.add(ring, inner);
    spot.position.copy(STATION_LAYOUT.spot).setY(0.012);
    spot.traverse((o) => (o.raycast = () => {}));
    root.add(spot);
    this.spotRing = ring;
  }

  // -------------------------------------------------------------------------
  // 과목 목록 패널
  // -------------------------------------------------------------------------
  buildList() {
    const n = this.year.subjects.length;
    this.list = new Panel({
      width: 0.98,
      height: 1.38,
      px: 1024,
      name: 'subjects',
      draw: (c, w, h, p) => {
        drawCard(c, w, h, { accent: this.color });
        c.textBaseline = 'top';
        c.textAlign = 'left';
        c.fillStyle = this.color;
        c.font = font(30, 700);
        c.fillText('과목 선택', 50, 40);
        c.fillStyle = C.text;
        c.font = font(56, 900);
        c.fillText(`${this.year.title} 전공 과목`, 50, 82);
        const top = 175;
        const rowH = Math.min(150, (h - top - 140) / n);
        this.year.subjects.forEach((s, i) => {
          const y = top + i * rowH;
          const sel = i === this.subjectIdx;
          p.button(c, { id: `s${i}`, x: 36, y, w: w - 72, h: rowH - 14, label: '', active: sel, color: this.color, onClick: () => this.selectSubject(i) });
          const g = this.ctx.progress.grade(s.id);
          const lr = this.ctx.progress.lessonRatio(s);
          c.fillStyle = sel ? '#ffffff' : C.text;
          c.font = font(40, 800);
          c.textBaseline = 'top';
          c.fillText(s.name, 70, y + 18, w - 300);
          c.fillStyle = C.muted;
          c.font = font(24, 500, MONO);
          c.fillText(`${s.code} · ${s.sem}학기`, 70, y + 72);
          // 강의 진도 막대
          const bx = 70;
          const by = y + rowH - 40;
          const bw = w - 330;
          roundRect(c, bx, by, bw, 8, 4);
          c.fillStyle = 'rgba(255,255,255,0.1)';
          c.fill();
          if (lr > 0) {
            roundRect(c, bx, by, bw * lr, 8, 4);
            c.fillStyle = this.color;
            c.fill();
          }
          // 성적 배지
          const cx = w - 120;
          const cy = y + (rowH - 14) / 2;
          c.beginPath();
          c.arc(cx, cy, 44, 0, Math.PI * 2);
          c.fillStyle = g ? hexA(GRADE_COLORS[g], 0.22) : 'rgba(255,255,255,0.05)';
          c.fill();
          c.lineWidth = 3;
          c.strokeStyle = g ? GRADE_COLORS[g] : 'rgba(255,255,255,0.15)';
          c.stroke();
          c.fillStyle = g ? GRADE_COLORS[g] : C.dim;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.font = font(g === 'A+' ? 36 : 40, 900);
          c.fillText(g || '–', cx, cy + 2);
          c.textAlign = 'left';
        });
        const st = this.ctx.progress.yearStats(this.year);
        c.fillStyle = C.muted;
        c.font = font(28, 600);
        c.textBaseline = 'middle';
        c.fillText(`이수 ${st.passed}/${st.total}${st.gpa !== null ? ` · 평점 ${st.gpa.toFixed(2)}` : ''}`, 50, h - 78, w - 420);
        p.button(c, { id: 'home', x: w - 36 - 300, y: h - 120, w: 300, h: 84, label: '🏛 중앙 홀로', size: 32, onClick: () => this.ctx.goHome() });
      },
    });
    this.list.mesh.position.copy(STATION_LAYOUT.list);
    const toSpot = STATION_LAYOUT.spot.clone().sub(STATION_LAYOUT.list);
    this.list.mesh.rotation.y = Math.atan2(toSpot.x, toSpot.z) * 0.85;
    this.root.add(this.list.mesh);
    this.ctx.interact.addPanel(this.list);
  }

  // -------------------------------------------------------------------------
  // 강의 보드(강의 / 실습 / 퀴즈)
  // -------------------------------------------------------------------------
  buildBoard() {
    this.board = new Panel({ width: BOARD_W, height: BOARD_H, px: BW, name: 'board', draw: (c, w, h, p) => this.drawBoard(c, w, h, p) });
    this.board.mesh.position.copy(STATION_LAYOUT.board);
    this.root.add(this.board.mesh);
    this.ctx.interact.addPanel(this.board);
    // 보드 프레임
    const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.08, BOARD_H + 0.08, 0.04), new THREE.MeshStandardMaterial({ color: 0x0c1322, roughness: 0.5, metalness: 0.4 }));
    frame.position.copy(STATION_LAYOUT.board).add(new THREE.Vector3(0, 0, -0.03));
    this.root.add(frame);
    // 그래프(실습 탭에서 보드 위에 겹쳐 그리는 별도 캔버스 → 매 프레임 갱신해도 가볍다)
    const pxH = this.board.pxH;
    this.graph = new Panel({
      width: (GRAPH.w / BW) * BOARD_W,
      height: (GRAPH.h / pxH) * BOARD_H,
      px: 1024,
      name: 'graph',
      transparent: false,
      mipmaps: false,
      draw: (c, w, h) => {
        const s = this.sim;
        if (s?.inst.draw) s.inst.draw(c, w, h, s.P);
      },
    });
    const gx = ((GRAPH.x + GRAPH.w / 2) / BW - 0.5) * BOARD_W;
    const gy = (0.5 - (GRAPH.y + GRAPH.h / 2) / pxH) * BOARD_H;
    this.graph.mesh.position.copy(STATION_LAYOUT.board).add(new THREE.Vector3(gx, gy, 0.004));
    this.graph.mesh.visible = false;
    this.root.add(this.graph.mesh);
  }

  drawBoard(c, w, h, p) {
    const s = this.subject;
    drawCard(c, w, h, { accent: this.color, radius: 40 });
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = C.text;
    c.font = font(64, 900);
    c.fillText(s.name, 64, 34, 1000);
    c.fillStyle = C.muted;
    c.font = font(28, 500, MONO);
    c.fillText(`${s.code} · ${this.year.title} ${s.sem.split('-')[1]}학기`, 66, 112);
    const tabs = [
      ['lesson', '📖 강의'],
      ['sim', '🔬 실습'],
      ['quiz', '📝 퀴즈'],
    ];
    tabs.forEach(([id, label], i) => {
      p.button(c, { id: `tab-${id}`, x: w - 64 - (3 - i) * 250 + 10, y: 40, w: 236, h: 86, label, style: 'tab', active: this.tab === id, color: this.color, size: 36, onClick: () => this.setTab(id) });
    });
    c.strokeStyle = hexA(this.color, 0.35);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(50, 152);
    c.lineTo(w - 50, 152);
    c.stroke();
    if (this.tab === 'lesson') this.drawLesson(c, w, h, p);
    else if (this.tab === 'sim') this.drawSim(c, w, h, p);
    else this.drawQuiz(c, w, h, p);
  }

  drawLesson(c, w, h, p) {
    const s = this.subject;
    const L = s.lessons[this.slide];
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillStyle = this.color;
    c.font = font(34, 700);
    c.fillText(`LESSON ${this.slide + 1}`, 70, 186);
    c.fillStyle = C.text;
    c.font = font(58, 800);
    c.fillText(L.t, 70, 228, w - 140);
    let y = 320;
    if (L.f) {
      c.font = font(46, 600);
      const lines = wrapLines(c, L.f, w - 220);
      const bh = 40 + lines.length * 60;
      roundRect(c, 70, y, w - 140, bh, 22);
      c.fillStyle = hexA(this.color, 0.1);
      c.fill();
      c.strokeStyle = hexA(this.color, 0.5);
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#fff6c9';
      c.textAlign = 'center';
      lines.forEach((ln, i) => c.fillText(ln, w / 2, y + 26 + i * 60));
      c.textAlign = 'left';
      y += bh + 40;
    }
    c.font = font(42, 500);
    for (const b of L.b) {
      c.fillStyle = this.color;
      c.beginPath();
      c.arc(92, y + 26, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = C.text;
      const used = drawWrapped(c, b, 122, y, w - 210, 58);
      y += used + 20;
      if (y > 1000) break;
    }
    // 하단 내비게이션
    const n = s.lessons.length;
    const by = h - 128;
    p.button(c, { id: 'prev', x: 64, y: by, w: 280, h: 88, label: '◀ 이전', enabled: this.slide > 0, size: 36, onClick: () => this.gotoSlide(this.slide - 1) });
    p.button(c, { id: 'read', x: 364, y: by, w: 300, h: 88, label: '🔊 읽어주기', style: 'ghost', size: 34, onClick: () => this.readAloud() });
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.arc(w / 2 - ((n - 1) * 40) / 2 + i * 40, by + 44, i === this.slide ? 13 : 9, 0, Math.PI * 2);
      c.fillStyle = i === this.slide ? this.color : 'rgba(255,255,255,0.2)';
      c.fill();
    }
    if (this.slide < n - 1) p.button(c, { id: 'next', x: w - 64 - 320, y: by, w: 320, h: 88, label: '다음 ▶', style: 'primary', size: 38, onClick: () => this.gotoSlide(this.slide + 1) });
    else p.button(c, { id: 'next', x: w - 64 - 400, y: by, w: 400, h: 88, label: '🔬 실습 해보기 ▶', style: 'primary', size: 36, onClick: () => this.setTab('sim') });
  }

  drawSim(c, w, h, p) {
    const sim = this.sim;
    if (!sim) return;
    const { def, inst, P } = sim;
    const hasGraph = !!inst.draw;
    if (!hasGraph) {
      roundRect(c, GRAPH.x, GRAPH.y, GRAPH.w, GRAPH.h, 24);
      c.fillStyle = 'rgba(255,255,255,0.03)';
      c.fill();
      c.strokeStyle = hexA(this.color, 0.3);
      c.stroke();
      c.fillStyle = this.color;
      c.font = font(120, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('↘', GRAPH.x + GRAPH.w / 2, GRAPH.y + GRAPH.h / 2 - 90);
      c.fillStyle = C.text;
      c.font = font(48, 800);
      c.fillText('오른쪽 홀로그램 실험대를 보세요', GRAPH.x + GRAPH.w / 2, GRAPH.y + GRAPH.h / 2 + 40);
      c.fillStyle = C.muted;
      c.font = font(32, 500);
      c.fillText('값을 바꾸면 3D 실험이 바로 반응합니다', GRAPH.x + GRAPH.w / 2, GRAPH.y + GRAPH.h / 2 + 110);
    }
    // 힌트
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = '#ffe066';
    c.font = font(32, 800);
    c.fillText('💡 해보기', GRAPH.x + 8, GRAPH.y + GRAPH.h + 22);
    c.fillStyle = C.text;
    c.font = font(31, 500);
    drawWrapped(c, def.hint, GRAPH.x + 8, GRAPH.y + GRAPH.h + 66, GRAPH.w - 16, 44, 4);

    // 오른쪽 조작부
    const x0 = CTRL_X;
    const cw = w - 50 - x0;
    c.fillStyle = C.text;
    c.font = font(38, 800);
    drawWrapped(c, def.title, x0, 178, cw, 48, 2);
    let y = 290;
    def.params.forEach((pd) => {
      const isChoice = !!pd.options;
      const v = P[pd.id];
      c.fillStyle = C.muted;
      c.font = font(28, 600);
      c.textBaseline = 'top';
      c.fillText(pd.label, x0, y);
      const ry = y + 40;
      const canDec = isChoice || v > pd.min + 1e-9;
      const canInc = isChoice || v < pd.max - 1e-9;
      p.button(c, { id: `p-${pd.id}-dec`, x: x0, y: ry, w: 96, h: 76, label: isChoice ? '◀' : '−', size: 42, enabled: canDec, onClick: () => this.stepParam(pd, -1) });
      p.button(c, { id: `p-${pd.id}-inc`, x: x0 + cw - 96, y: ry, w: 96, h: 76, label: isChoice ? '▶' : '+', size: 42, enabled: canInc, onClick: () => this.stepParam(pd, 1) });
      roundRect(c, x0 + 108, ry, cw - 216, 76, 18);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fill();
      c.strokeStyle = hexA(this.color, 0.4);
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#ffffff';
      c.font = font(36, 800);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const txt = isChoice ? pd.options[v] : pd.fmt ? pd.fmt(v) : String(v);
      c.fillText(txt, x0 + cw / 2, ry + 40, cw - 240);
      c.textAlign = 'left';
      y += 134;
    });
    const acts = def.actions || [];
    if (acts.length) {
      const aw = (cw - (acts.length - 1) * 16) / acts.length;
      acts.forEach((a, i) => {
        const label = inst.actionLabel?.(a.id) ?? a.label;
        p.button(c, { id: `a-${a.id}`, x: x0 + i * (aw + 16), y: y + 4, w: aw, h: 80, label, style: i === acts.length - 1 ? 'primary' : 'default', size: 32, onClick: () => this.doAction(a.id) });
      });
      y += 104;
    }
    // 측정값
    const lines = inst.readout?.(P) || [];
    const ry = Math.max(y + 10, 900);
    roundRect(c, x0, ry, cw, h - 50 - ry, 22);
    c.fillStyle = hexA(this.color, 0.08);
    c.fill();
    c.strokeStyle = hexA(this.color, 0.35);
    c.stroke();
    c.fillStyle = this.color;
    c.font = font(26, 700);
    c.textBaseline = 'top';
    c.fillText('측정 · 결과', x0 + 24, ry + 18);
    c.fillStyle = C.text;
    c.font = font(30, 600);
    let ly = ry + 60;
    for (const ln of lines) {
      ly += drawWrapped(c, ln, x0 + 24, ly, cw - 48, 40, 2) + 4;
    }
  }

  drawQuiz(c, w, h, p) {
    const s = this.subject;
    const q = this.quiz;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    if (!q || q.state === 'intro') {
      const best = this.ctx.progress.subject(s.id);
      c.fillStyle = C.text;
      c.font = font(64, 900);
      c.fillText(`${s.name} 퀴즈`, 70, 210);
      c.fillStyle = C.muted;
      c.font = font(38, 500);
      c.fillText(`${s.quiz.length}문제 · 50% 이상 맞히면 이수 · 보기 순서는 매번 바뀌어요`, 70, 300);
      if (best.best !== null) {
        const g = gradeOf(best.best);
        c.fillStyle = GRADE_COLORS[g];
        c.font = font(44, 800);
        c.fillText(`지금까지 최고 성적: ${g}  (${Math.round(best.best * 100)}점 · ${best.tries}회 응시)`, 70, 380);
      }
      const lr = this.ctx.progress.lessonRatio(s);
      if (lr < 1) {
        c.fillStyle = C.warn;
        c.font = font(34, 600);
        c.fillText(`📖 아직 안 본 강의가 있어요 (${Math.round(lr * 100)}% 열람). 강의를 먼저 보면 더 쉬워요!`, 70, 470);
      }
      p.button(c, { id: 'qstart', x: w / 2 - 260, y: 640, w: 520, h: 130, label: '퀴즈 시작 ▶', style: 'primary', size: 50, onClick: () => this.startQuiz() });
      return;
    }
    if (q.state === 'done') {
      const ratio = q.correct / q.items.length;
      const g = gradeOf(ratio);
      c.textAlign = 'center';
      c.fillStyle = GRADE_COLORS[g];
      c.shadowColor = GRADE_COLORS[g];
      c.shadowBlur = 40;
      c.font = font(260, 900);
      c.fillText(g, w / 2, 190);
      c.shadowBlur = 0;
      c.fillStyle = C.text;
      c.font = font(50, 800);
      c.fillText(`${q.items.length}문제 중 ${q.correct}개 정답`, w / 2, 500);
      c.fillStyle = C.muted;
      c.font = font(36, 500);
      c.fillText(ratio >= 0.5 ? (ratio === 1 ? '완벽해요! 이 과목을 이수했습니다 🎉' : '이수 완료! 틀린 문제는 강의를 다시 확인해 보세요.') : '아쉬워요. 강의와 실습을 다시 보고 도전해 보세요!', w / 2, 580);
      p.button(c, { id: 'qretry', x: w / 2 - 560, y: 720, w: 520, h: 120, label: '🔁 다시 풀기', size: 44, onClick: () => this.startQuiz() });
      const nextIdx = this.subjectIdx + 1;
      if (nextIdx < this.year.subjects.length) {
        p.button(c, { id: 'qnext', x: w / 2 + 40, y: 720, w: 520, h: 120, label: `다음 과목 ▶`, sub: this.year.subjects[nextIdx].name, style: 'primary', size: 42, onClick: () => this.selectSubject(nextIdx) });
      } else {
        p.button(c, { id: 'qhome', x: w / 2 + 40, y: 720, w: 520, h: 120, label: '중앙 홀로 ▶', sub: '다른 학년으로 이동', style: 'primary', size: 42, onClick: () => this.ctx.goHome() });
      }
      return;
    }
    const it = q.items[q.idx];
    c.fillStyle = this.color;
    c.font = font(34, 800);
    c.fillText(`문제 ${q.idx + 1} / ${q.items.length}`, 70, 186);
    for (let i = 0; i < q.items.length; i++) {
      const r = q.results[i];
      c.beginPath();
      c.arc(380 + i * 40, 205, 12, 0, Math.PI * 2);
      c.fillStyle = r === true ? C.ok : r === false ? C.bad : i === q.idx ? this.color : 'rgba(255,255,255,0.15)';
      c.fill();
    }
    c.fillStyle = C.text;
    c.font = font(50, 800);
    drawWrapped(c, it.q, 70, 250, w - 140, 66, 3);
    const ow = (w - 140 - 30) / 2;
    const oh = 132;
    it.opts.forEach((o, i) => {
      const x = 70 + (i % 2) * (ow + 30);
      const y = 470 + Math.floor(i / 2) * (oh + 24);
      let style = 'default';
      if (q.answered) {
        if (o.correct) style = 'ok';
        else if (i === q.chosen) style = 'bad';
        else style = 'dim';
      }
      p.button(c, { id: `opt${i}`, x, y, w: ow, h: oh, label: `${OPT_MARK[i]}  ${o.text}`, style, size: 38, align: 'left', enabled: !q.answered || o.correct || i === q.chosen, onClick: () => this.answer(i) });
    });
    if (q.answered) {
      const ok = it.opts[q.chosen].correct;
      const ey = 790;
      roundRect(c, 70, ey, w - 140 - 440, 230, 22);
      c.fillStyle = ok ? 'rgba(61,220,151,0.1)' : 'rgba(255,93,108,0.1)';
      c.fill();
      c.fillStyle = ok ? C.ok : C.bad;
      c.font = font(40, 900);
      c.textBaseline = 'top';
      c.fillText(ok ? '⭕ 정답!' : '❌ 오답', 100, ey + 22);
      c.fillStyle = C.text;
      c.font = font(34, 500);
      drawWrapped(c, it.e, 100, ey + 82, w - 140 - 500, 46, 3);
      const last = q.idx === q.items.length - 1;
      p.button(c, { id: 'qnextq', x: w - 70 - 410, y: ey + 70, w: 410, h: 110, label: last ? '결과 보기 ▶' : '다음 문제 ▶', style: 'primary', size: 42, onClick: () => this.nextQuestion() });
    }
  }

  // -------------------------------------------------------------------------
  // 홀로그램 실험대
  // -------------------------------------------------------------------------
  buildPedestal() {
    const g = new THREE.Group();
    g.position.copy(STATION_LAYOUT.pedestal);
    const toSpot = STATION_LAYOUT.spot.clone().sub(STATION_LAYOUT.pedestal);
    g.rotation.y = Math.atan2(toSpot.x, toSpot.z);
    this.root.add(g);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.84, 40), new THREE.MeshStandardMaterial({ color: 0x141c2e, roughness: 0.4, metalness: 0.6 }));
    body.position.y = 0.42;
    g.add(body);
    this.ctx.interact.addBlocker(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.02, 40), new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.8 }));
    top.position.y = 0.85;
    g.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: this.color, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.862;
    g.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.3, 0.9, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    beam.position.y = 1.31;
    beam.raycast = () => {};
    g.add(beam);
    this.simRoot = new THREE.Group();
    this.simRoot.position.y = 0.87;
    g.add(this.simRoot);
    // 3D 가 없는 실습일 때 보여 줄 회전 홀로그램
    this.idle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: this.color, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false }));
    this.idle.position.y = 0.4;
    this.simRoot.add(this.idle);
    this.beam = beam;
  }

  loadSim() {
    this.disposeSim();
    const def = SIMS[this.subject.sim];
    if (!def) return;
    const group = new THREE.Group();
    this.simRoot.add(group);
    const P = {};
    for (const pd of def.params) P[pd.id] = pd.value;
    const removers = [];
    const env = {
      group,
      audio: this.ctx.audio,
      addClickable: (mesh, opts) => removers.push(this.ctx.interact.addClickable(mesh, opts)),
      setParam: (id, v) => this.setParam(id, v),
      refresh: () => {
        this.simDirty = true;
      },
    };
    const inst = def.create(env);
    this.sim = { def, inst, P, group, removers };
    inst.onParam?.(P, undefined);
    this.idle.visible = group.children.length === 0;
    this.graph.redraw();
  }

  disposeSim() {
    const s = this.sim;
    if (!s) return;
    s.inst.dispose?.();
    for (const r of s.removers) r();
    s.group.traverse((o) => o.userData.disposeLabel?.());
    disposeTree(s.group);
    this.simRoot.remove(s.group);
    this.sim = null;
  }

  stepParam(pd, dir) {
    const v = this.sim.P[pd.id];
    let nv;
    if (pd.options) nv = (v + dir + pd.options.length) % pd.options.length;
    else nv = clamp(+(v + dir * pd.step).toFixed(6), pd.min, pd.max);
    this.setParam(pd.id, nv);
  }

  setParam(id, v) {
    const s = this.sim;
    if (!s || s.P[id] === v) return;
    s.P[id] = v;
    s.inst.onParam?.(s.P, id);
    this.ctx.progress.markSim(this.subject.id);
    this.board.invalidate();
    this.graph.invalidate();
  }

  doAction(id) {
    const s = this.sim;
    s.inst.onAction?.(id, s.P);
    this.ctx.progress.markSim(this.subject.id);
    this.board.invalidate();
    this.graph.invalidate();
  }

  // -------------------------------------------------------------------------
  // 상태 전환
  // -------------------------------------------------------------------------
  selectSubject(i, sound = true) {
    this.subjectIdx = i;
    this.slide = 0;
    this.tab = 'lesson';
    this.quiz = null;
    this.ctx.audio.stopSpeech();
    this.ctx.progress.markSeen(this.subject.id, 0);
    this.loadSim();
    this.graph.mesh.visible = false;
    this.list.invalidate();
    this.board.invalidate();
    if (sound) this.ctx.audio.play('select');
  }

  setTab(t) {
    this.tab = t;
    this.ctx.audio.stopSpeech();
    if (t === 'quiz' && (!this.quiz || this.quiz.state === 'done')) this.quiz = { state: 'intro' };
    this.graph.mesh.visible = t === 'sim' && !!this.sim?.inst.draw;
    if (this.graph.mesh.visible) this.graph.redraw();
    this.board.invalidate();
  }

  gotoSlide(i) {
    const n = this.subject.lessons.length;
    this.slide = clamp(i, 0, n - 1);
    this.ctx.progress.markSeen(this.subject.id, this.slide);
    this.ctx.audio.stopSpeech();
    this.ctx.audio.play('page');
    this.board.invalidate();
    this.list.invalidate();
  }

  readAloud() {
    const L = this.subject.lessons[this.slide];
    const ok = this.ctx.audio.speak(`${L.t}. ${L.b.join(' ')}`);
    if (!ok) this.ctx.notify?.('이 브라우저는 읽어주기를 지원하지 않아요');
  }

  startQuiz() {
    const items = shuffle(this.subject.quiz).map((q) => ({
      q: q.q,
      e: q.e,
      opts: shuffle(q.o.map((text, i) => ({ text, correct: i === q.a }))),
    }));
    this.quiz = { state: 'run', items, idx: 0, answered: false, chosen: -1, correct: 0, results: [] };
    this.board.invalidate();
  }

  answer(i) {
    const q = this.quiz;
    if (!q || q.answered) return;
    q.answered = true;
    q.chosen = i;
    const ok = q.items[q.idx].opts[i].correct;
    q.results[q.idx] = ok;
    if (ok) q.correct++;
    this.ctx.audio.play(ok ? 'ok' : 'bad');
    this.board.invalidate();
  }

  nextQuestion() {
    const q = this.quiz;
    if (q.idx < q.items.length - 1) {
      q.idx++;
      q.answered = false;
      q.chosen = -1;
    } else {
      q.state = 'done';
      const before = this.ctx.progress.overall().graduated;
      this.ctx.progress.recordQuiz(this.subject.id, q.correct, q.items.length);
      const ratio = q.correct / q.items.length;
      this.ctx.audio.play(ratio === 1 ? 'fanfare' : ratio >= 0.5 ? 'ok' : 'bad');
      if (!before && this.ctx.progress.overall().graduated) this.ctx.onGraduate?.();
    }
    this.board.invalidate();
  }

  // -------------------------------------------------------------------------
  update(dt, headPos, time) {
    const sp = this.spot().pos;
    const d = Math.hypot(headPos.x - sp.x, headPos.z - sp.z);
    this.active = d < 6;
    this.spotRing.material.opacity = 0.5 + Math.sin(time * 2.5) * 0.25;
    this.beam.material.opacity = 0.04 + Math.sin(time * 1.7) * 0.015;
    if (this.idle.visible) {
      this.idle.rotation.y += dt * 0.6;
      this.idle.rotation.x += dt * 0.25;
    }
    if (this.active && this.sim) {
      this.sim.inst.update?.(dt, this.sim.P);
      if (this.graph.mesh.visible && this.sim.inst.animated) {
        this.graphTimer -= dt;
        if (this.graphTimer <= 0) {
          this.graphTimer = 1 / 30;
          this.graph.redraw();
        }
      }
      if (this.simDirty) {
        this.boardTimer -= dt;
        if (this.boardTimer <= 0) {
          this.boardTimer = 0.2;
          this.simDirty = false;
          if (this.tab === 'sim') this.board.invalidate();
          this.graph.invalidate();
        }
      }
    }
    this.board.flush();
    this.list.flush();
    this.graph.flush();
    this.sign.flush();
  }
}
