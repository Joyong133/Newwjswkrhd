import * as THREE from 'three';
import { Panel, drawCard } from '../core/panel.js';
import { C, font } from '../core/util.js';

/** 어디서든 부를 수 있는 빠른 메뉴(XR: A·B·X·Y / 데스크톱: M) */
export class QuickMenu {
  constructor({ ctx, curriculum }) {
    this.ctx = ctx;
    this.curriculum = curriculum;
    this.open = false;
    this.panel = new Panel({ width: 0.84, height: 0.74, px: 1100, name: 'menu', draw: (c, w, h, p) => this.draw(c, w, h, p) });
    this.panel.mesh.visible = false;
    this.panel.mesh.renderOrder = 10;
    ctx.scene.add(this.panel.mesh);
    ctx.interact.addPanel(this.panel);
  }

  draw(c, w, h, p) {
    const { ctx } = this;
    drawCard(c, w, h, { alpha: 1 });
    c.fillStyle = C.text;
    c.font = font(52, 900);
    c.textBaseline = 'top';
    c.textAlign = 'left';
    c.fillText('빠른 메뉴', 50, 44);
    p.button(c, { id: 'close', x: w - 50 - 120, y: 36, w: 120, h: 80, label: '✕', size: 44, onClick: () => this.toggle(false) });
    p.button(c, { id: 'home', x: 50, y: 150, w: w - 100, h: 100, label: '🏛  중앙 홀', size: 40, onClick: () => this.go(() => ctx.goHome()) });
    const bw = (w - 100 - 24) / 2;
    this.curriculum.forEach((y, i) => {
      p.button(c, {
        id: `y${i}`,
        x: 50 + (i % 2) * (bw + 24),
        y: 270 + Math.floor(i / 2) * 120,
        w: bw,
        h: 100,
        label: `${y.title}`,
        sub: y.theme,
        active: true,
        color: y.color,
        size: 40,
        onClick: () => this.go(() => ctx.goYear(i)),
      });
    });
    const sy = 530;
    c.fillStyle = C.muted;
    c.font = font(30, 600);
    c.fillText('눈높이', 50, sy + 26);
    p.button(c, { id: 'hdown', x: 220, y: sy, w: 110, h: 84, label: '−', size: 46, onClick: () => ctx.adjustHeight(-0.1) });
    c.fillStyle = C.text;
    c.font = font(34, 700);
    c.textAlign = 'center';
    c.fillText(`${ctx.heightOffset >= 0 ? '+' : ''}${Math.round(ctx.heightOffset * 100)} cm`, 420, sy + 24);
    c.textAlign = 'left';
    p.button(c, { id: 'hup', x: 510, y: sy, w: 110, h: 84, label: '+', size: 46, onClick: () => ctx.adjustHeight(0.1) });
    p.button(c, { id: 'snd', x: 650, y: sy, w: 190, h: 84, label: ctx.audio.enabled ? '🔊 소리' : '🔇 소리', size: 30, onClick: () => ctx.toggleSound() });
    p.button(c, { id: 'tts', x: 856, y: sy, w: 194, h: 84, label: ctx.audio.speechOn ? '🗣 읽기 ON' : '🗣 읽기 OFF', size: 28, onClick: () => ctx.toggleSpeech() });
    c.fillStyle = C.dim;
    c.font = font(26, 500);
    c.fillText('앉아서 할 땐 눈높이를 + 로 올리세요', 50, sy + 104);
  }

  go(fn) {
    fn();
    this.toggle(false);
  }

  toggle(force) {
    this.open = force ?? !this.open;
    const m = this.panel.mesh;
    m.visible = this.open;
    if (this.open) {
      // 머리 앞 0.85 m, 약간 아래
      const cam = this.ctx.camera;
      const pos = cam.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
      dir.y = 0;
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
      dir.normalize();
      m.position.copy(pos).addScaledVector(dir, 0.85);
      m.position.y = pos.y - 0.12;
      m.lookAt(pos.x, m.position.y, pos.z);
      this.panel.redraw();
      this.ctx.audio.play('select');
    }
  }

  update() {
    this.panel.flush();
  }
}
