import * as THREE from 'three';
import { Panel, drawCard } from '../core/panel.js';
import { C, font, roundRect, hexA, drawWrapped } from '../core/util.js';

const HELP = [
  ['이동', '왼쪽 스틱으로 걷기 · 오른쪽 스틱으로 30° 회전 · 바닥을 가리키고 트리거 = 순간이동'],
  ['선택', '레이로 버튼을 가리키고 트리거(또는 그립) · 핸드 트래킹은 엄지·검지 집기'],
  ['메뉴', 'A·B·X·Y 버튼 아무거나 → 어디서든 빠른 이동 메뉴 (데스크톱은 M 키)'],
  ['공부 순서', '과목 선택 → 📖 강의 → 🔬 실습(홀로그램 실험대) → 📝 퀴즈로 학점 받기'],
  ['졸업', '24과목을 모두 B 이상으로 이수하면 졸업식이 열립니다 🎓'],
];

/** 중앙 안내 데스크: 전체 진도 + 학년 바로가기 + 도움말 */
export class Directory {
  constructor({ ctx, curriculum, stations }) {
    this.ctx = ctx;
    this.curriculum = curriculum;
    this.stations = stations;
    this.view = 'main';
    this.confirmReset = false;
    this.panel = new Panel({ width: 1.8, height: 1.12, px: 1800, name: 'directory', draw: (c, w, h, p) => this.draw(c, w, h, p) });
    this.panel.mesh.position.set(0, 1.5, 1.2);
    ctx.scene.add(this.panel.mesh);
    ctx.interact.addPanel(this.panel);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), new THREE.MeshStandardMaterial({ color: 0x141c2e, metalness: 0.6, roughness: 0.4 }));
    stand.position.set(0, 0.47, 1.17);
    ctx.scene.add(stand);
    ctx.progress.on(() => this.panel.invalidate());
  }

  draw(c, w, h, p) {
    const ov = this.ctx.progress.overall();
    drawCard(c, w, h, { accent: ov.graduated ? '#ffd166' : C.accent });
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillStyle = C.accent;
    c.font = font(30, 700);
    c.fillText('ELECTRONIC ENGINEERING · VR CAMPUS', 60, 46);
    c.fillStyle = C.text;
    c.font = font(76, 900);
    c.fillText('전자공학과 4년, VR 로 끝내기', 60, 88);
    if (this.view === 'help') return this.drawHelp(c, w, h, p);

    // 전체 진도
    const bx = 60;
    const by = 206;
    const bw = w - 120;
    roundRect(c, bx, by, bw, 26, 13);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fill();
    let x = bx;
    this.curriculum.forEach((y) => {
      const st = this.ctx.progress.yearStats(y);
      const seg = (bw * y.subjects.length) / ov.total;
      if (st.passed) {
        roundRect(c, x + 2, by + 2, (seg - 4) * (st.passed / st.total), 22, 11);
        c.fillStyle = y.color;
        c.fill();
      }
      x += seg;
    });
    c.fillStyle = C.muted;
    c.font = font(32, 600);
    c.fillText(`졸업 진도 ${ov.passed} / ${ov.total} 과목${ov.gpa !== null ? `   ·   평점 ${ov.gpa.toFixed(2)} / 4.5` : ''}`, 60, 248);
    if (ov.graduated) {
      c.fillStyle = '#ffd166';
      c.font = font(36, 900);
      c.textAlign = 'right';
      c.fillText('🎓 졸업 요건 충족!', w - 60, 246);
      c.textAlign = 'left';
    }

    // 학년 카드
    const cw = (w - 120 - 30) / 2;
    const ch = 250;
    this.curriculum.forEach((y, i) => {
      const cx = 60 + (i % 2) * (cw + 30);
      const cy = 320 + Math.floor(i / 2) * (ch + 26);
      const st = this.ctx.progress.yearStats(y);
      p.button(c, { id: `go${i}`, x: cx, y: cy, w: cw, h: ch, label: '', onClick: () => this.ctx.goYear(i) });
      c.fillStyle = y.color;
      c.fillRect(cx + 2, cy + 20, 8, ch - 40);
      c.textBaseline = 'top';
      c.font = font(54, 900);
      c.fillText(y.title, cx + 40, cy + 26);
      const tw = c.measureText(y.title).width;
      c.fillStyle = C.text;
      c.font = font(36, 700);
      c.fillText(y.theme, cx + 40 + tw + 24, cy + 40);
      c.fillStyle = C.muted;
      c.font = font(27, 500);
      c.fillText(y.subjects.map((s) => s.name).join(' · '), cx + 40, cy + 104, cw - 80);
      roundRect(c, cx + 40, cy + 160, cw - 300, 16, 8);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fill();
      if (st.passed) {
        roundRect(c, cx + 40, cy + 160, (cw - 300) * (st.passed / st.total), 16, 8);
        c.fillStyle = y.color;
        c.fill();
      }
      c.fillStyle = C.text;
      c.font = font(28, 600);
      c.fillText(`이수 ${st.passed}/${st.total}${st.gpa !== null ? ` · 평점 ${st.gpa.toFixed(1)}` : ''}`, cx + 40, cy + 190);
      c.fillStyle = y.color;
      c.font = font(40, 900);
      c.textAlign = 'right';
      c.fillText('이동 →', cx + cw - 36, cy + ch - 80);
      c.textAlign = 'left';
    });

    const fy = h - 130;
    p.button(c, { id: 'help', x: 60, y: fy, w: 380, h: 84, label: '❓ 조작법 · 공부 방법', size: 32, onClick: () => this.setView('help') });
    p.button(c, {
      id: 'reset',
      x: w - 60 - 380,
      y: fy,
      w: 380,
      h: 84,
      label: this.confirmReset ? '정말 초기화? 한 번 더!' : '진도 초기화',
      style: this.confirmReset ? 'bad' : 'ghost',
      size: 30,
      onClick: () => this.reset(),
    });
    c.fillStyle = C.muted;
    c.font = font(28, 500);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('바닥의 학년 길을 따라가거나 카드를 눌러 이동하세요', w / 2, fy + 42);
  }

  drawHelp(c, w, h, p) {
    let y = 230;
    HELP.forEach(([k, v]) => {
      c.fillStyle = C.accent;
      c.font = font(36, 800);
      c.textBaseline = 'top';
      c.fillText(k, 70, y);
      c.fillStyle = C.text;
      c.font = font(36, 500);
      y += drawWrapped(c, v, 300, y, w - 380, 50, 2) + 34;
    });
    p.button(c, { id: 'back', x: w / 2 - 220, y: h - 140, w: 440, h: 90, label: '← 돌아가기', style: 'primary', size: 38, onClick: () => this.setView('main') });
  }

  setView(v) {
    this.view = v;
    this.panel.invalidate();
  }

  reset() {
    if (!this.confirmReset) {
      this.confirmReset = true;
      setTimeout(() => {
        this.confirmReset = false;
        this.panel.invalidate();
      }, 3000);
    } else {
      this.confirmReset = false;
      this.ctx.progress.reset();
      this.ctx.notify('진도를 초기화했어요');
    }
    this.panel.invalidate();
  }

  update() {
    this.panel.flush();
  }
}

/** 졸업장(졸업하면 중앙에 나타남) */
export function makeDiploma(progress) {
  const panel = new Panel({
    width: 1.3,
    height: 0.92,
    px: 1300,
    name: 'diploma',
    draw: (c, w, h) => {
      const ov = progress.overall();
      c.fillStyle = '#f7f0dc';
      roundRect(c, 10, 10, w - 20, h - 20, 30);
      c.fill();
      c.strokeStyle = '#b8902f';
      c.lineWidth = 12;
      c.stroke();
      c.strokeStyle = 'rgba(184,144,47,0.5)';
      c.lineWidth = 3;
      roundRect(c, 40, 40, w - 80, h - 80, 20);
      c.stroke();
      c.fillStyle = '#3a2a08';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(96, 900);
      c.fillText('졸 업 장', w / 2, 170);
      c.font = font(40, 600);
      c.fillText('위 사람은 전자공학과 4년 전 과정 24과목을', w / 2, 330);
      c.fillText('우수한 성적으로 이수하였으므로', w / 2, 390);
      c.fillText('공학사 학위를 수여합니다.', w / 2, 450);
      c.font = font(46, 800);
      c.fillStyle = '#7a5410';
      c.fillText(`평점 ${ov.gpa !== null ? ov.gpa.toFixed(2) : '-'} / 4.5`, w / 2, 560);
      c.font = font(34, 600);
      c.fillStyle = '#3a2a08';
      const d = new Date();
      c.fillText(`${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 · 전자공학과 VR 캠퍼스`, w / 2, 680);
      c.fillStyle = hexA('#c0392b', 0.85);
      c.beginPath();
      c.arc(w - 200, h - 190, 70, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.font = font(40, 900);
      c.fillText('EE', w - 200, h - 190);
    },
  });
  panel.mesh.position.set(0, 1.75, -0.6);
  return panel;
}
