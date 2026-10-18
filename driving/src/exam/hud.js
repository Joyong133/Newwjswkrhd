import { Panel, drawCard } from '../core/panel.js';
import { C, font, drawWrapped } from '../core/util.js';

/** 앞유리 아래쪽에 뜨는 시험관 안내판 */
export class Hud {
  constructor() {
    this.title = '';
    this.text = '';
    this.score = null;
    this.flashText = '';
    this.flashKind = 'bad';
    this.flashT = 0;
    this.panel = new Panel({ width: 0.62, height: 0.15, px: 1240, name: 'hud', draw: (c, w, h) => this.draw(c, w, h) });
  }

  set({ title, score }) {
    if (title !== undefined) this.title = title;
    if (score !== undefined) this.score = score;
    this.panel.invalidate();
  }

  say(text) {
    this.text = text;
    this.panel.invalidate();
  }

  flash(text, kind = 'bad') {
    this.flashText = text;
    this.flashKind = kind;
    this.flashT = 2.5;
    this.panel.invalidate();
  }

  draw(c, w, h) {
    const accent = this.flashT > 0 ? (this.flashKind === 'bad' ? C.bad : C.warn) : C.accent;
    drawCard(c, w, h, { accent, radius: 34, alpha: 0.9 });
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = accent;
    c.font = font(30, 800);
    c.fillText(this.title, 40, 46);
    if (this.score !== null) {
      c.textAlign = 'right';
      c.font = font(44, 900);
      c.fillStyle = this.score >= 80 ? C.ok : C.bad;
      c.fillText(`${this.score}점`, w - 40, 52);
      c.textAlign = 'left';
    }
    c.fillStyle = this.flashT > 0 ? accent : C.text;
    c.font = font(46, 800);
    c.textBaseline = 'top';
    drawWrapped(c, this.flashT > 0 ? this.flashText : this.text, 40, 92, w - 80, 56, 3);
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.panel.invalidate();
    }
    this.panel.flush();
  }
}
