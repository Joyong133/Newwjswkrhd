import { C, font, MONO } from '../core/util.js';

/** 그래프 캔버스 배경(오실로스코프 느낌) */
export function graphBg(c, w, h) {
  c.fillStyle = '#040a12';
  c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(56, 217, 255, 0.35)';
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, w - 3, h - 3);
}

/** 데이터 좌표 → 픽셀 좌표 변환이 들어 있는 플롯 영역 */
export class Plot {
  constructor(c, x, y, w, h, { xmin = 0, xmax = 1, ymin = 0, ymax = 1 } = {}) {
    Object.assign(this, { c, x, y, w, h, xmin, xmax, ymin, ymax });
  }

  X(v) {
    return this.x + ((v - this.xmin) / (this.xmax - this.xmin)) * this.w;
  }

  Y(v) {
    return this.y + this.h - ((v - this.ymin) / (this.ymax - this.ymin)) * this.h;
  }

  axes({ xlabel = '', ylabel = '', xticks = null, yticks = null, xfmt = (v) => `${+v.toFixed(2)}`, yfmt = (v) => `${+v.toFixed(2)}`, title = '' } = {}) {
    const c = this.c;
    c.save();
    c.strokeStyle = 'rgba(120, 170, 220, 0.14)';
    c.lineWidth = 1.5;
    c.font = font(20, 500, MONO);
    c.fillStyle = C.dim;
    if (xticks) {
      c.textAlign = 'center';
      c.textBaseline = 'top';
      for (const t of xticks) {
        const px = this.X(t);
        c.beginPath();
        c.moveTo(px, this.y);
        c.lineTo(px, this.y + this.h);
        c.stroke();
        c.fillText(xfmt(t), px, this.y + this.h + 6);
      }
    }
    if (yticks) {
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (const t of yticks) {
        const py = this.Y(t);
        c.beginPath();
        c.moveTo(this.x, py);
        c.lineTo(this.x + this.w, py);
        c.stroke();
        c.fillText(yfmt(t), this.x - 8, py);
      }
    }
    // 0 축 강조
    c.strokeStyle = 'rgba(180, 210, 240, 0.45)';
    c.lineWidth = 2;
    if (this.ymin < 0 && this.ymax > 0) {
      c.beginPath();
      c.moveTo(this.x, this.Y(0));
      c.lineTo(this.x + this.w, this.Y(0));
      c.stroke();
    }
    if (this.xmin < 0 && this.xmax > 0) {
      c.beginPath();
      c.moveTo(this.X(0), this.y);
      c.lineTo(this.X(0), this.y + this.h);
      c.stroke();
    }
    c.strokeRect(this.x, this.y, this.w, this.h);
    c.fillStyle = C.muted;
    c.font = font(22, 600);
    if (xlabel) {
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText(xlabel, this.x + this.w - 6, this.y + this.h - 6);
    }
    if (ylabel) {
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(ylabel, this.x + 8, this.y + 6);
    }
    if (title) {
      c.fillStyle = C.text;
      c.font = font(24, 700);
      c.textAlign = 'left';
      c.textBaseline = 'bottom';
      c.fillText(title, this.x, this.y - 8);
    }
    c.restore();
  }

  clip(fn) {
    const c = this.c;
    c.save();
    c.beginPath();
    c.rect(this.x, this.y, this.w, this.h);
    c.clip();
    fn();
    c.restore();
  }

  fn(f, color, { width = 3.5, n = 400, dash = null, from = this.xmin, to = this.xmax, glow = false } = {}) {
    const c = this.c;
    this.clip(() => {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineJoin = 'round';
      if (dash) c.setLineDash(dash);
      if (glow) {
        c.shadowColor = color;
        c.shadowBlur = 10;
      }
      c.beginPath();
      let pen = false;
      for (let i = 0; i <= n; i++) {
        const xv = from + ((to - from) * i) / n;
        const yv = f(xv);
        if (!Number.isFinite(yv)) {
          pen = false;
          continue;
        }
        const py = Math.max(-1e4, Math.min(1e4, this.Y(yv)));
        if (!pen) c.moveTo(this.X(xv), py);
        else c.lineTo(this.X(xv), py);
        pen = true;
      }
      c.stroke();
    });
  }

  poly(points, color, { width = 3, dash = null, fill = null } = {}) {
    const c = this.c;
    this.clip(() => {
      c.beginPath();
      points.forEach(([xv, yv], i) => (i ? c.lineTo(this.X(xv), this.Y(yv)) : c.moveTo(this.X(xv), this.Y(yv))));
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      c.strokeStyle = color;
      c.lineWidth = width;
      if (dash) c.setLineDash(dash);
      c.stroke();
    });
  }

  dot(xv, yv, color, r = 8) {
    const c = this.c;
    c.save();
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 12;
    c.beginPath();
    c.arc(this.X(xv), this.Y(yv), r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  hline(yv, color, dash = [8, 8], width = 2) {
    this.poly([[this.xmin, yv], [this.xmax, yv]], color, { dash, width });
  }

  vline(xv, color, dash = [8, 8], width = 2) {
    this.poly([[xv, this.ymin], [xv, this.ymax]], color, { dash, width });
  }

  label(text, xv, yv, color = C.text, { size = 22, align = 'left', base = 'bottom', dx = 0, dy = 0 } = {}) {
    const c = this.c;
    c.save();
    c.font = font(size, 700);
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = base;
    c.fillText(text, this.X(xv) + dx, this.Y(yv) + dy);
    c.restore();
  }
}

/** 범례(색 막대 + 이름) */
export function legend(c, x, y, items) {
  c.save();
  c.font = font(22, 600);
  c.textBaseline = 'middle';
  let cx = x;
  for (const [color, name] of items) {
    c.fillStyle = color;
    c.fillRect(cx, y - 3, 26, 6);
    c.fillStyle = C.text;
    c.textAlign = 'left';
    c.fillText(name, cx + 34, y);
    cx += 34 + c.measureText(name).width + 28;
  }
  c.restore();
}

export function niceTicks(min, max, count = 5) {
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toPrecision(10));
  return out;
}
