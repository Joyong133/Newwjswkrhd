import * as THREE from 'three';
import { Panel, drawCard, drawStatusDot, hexA } from '../core/ui.js';
import { COLORS, font, roundRect, wrapText, MONO } from '../core/util.js';

// ---------------------------------------------------------------------------
// 7-세그먼트 표시기
// ---------------------------------------------------------------------------
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd',
  '-': 'g', ' ': '', E: 'adefg', r: 'eg', o: 'cdeg', L: 'def', H: 'bcefg', P: 'abefg', n: 'ceg', F: 'aefg', A: 'abcefg', C: 'adef', d: 'bcdeg', U: 'bcdef', t: 'defg', S: 'afgcd', I: 'bc', O: 'abcdef', u: 'cde',
};

export function draw7seg(ctx, text, x, y, dw, dh, on, off = null, { skew = 0.1, gap = 0.28 } = {}) {
  const chars = [];
  for (const ch of String(text)) {
    if (ch === '.' && chars.length) chars[chars.length - 1].dp = true;
    else chars.push({ ch, dp: false });
  }
  const t = dw * 0.17; // 세그먼트 두께
  const segPath = (name, ox, oy) => {
    const w = dw;
    const h = dh / 2;
    const p = [];
    const H = (x0, y0) => {
      p.push([x0 + t * 0.5, y0], [x0 + w - t * 0.5, y0], [x0 + w - t, y0 + t * 0.5], [x0 + w - t * 0.5, y0 + t], [x0 + t * 0.5, y0 + t], [x0, y0 + t * 0.5]);
    };
    const V = (x0, y0) => {
      p.push([x0 + t * 0.5, y0 + t * 0.5], [x0 + t, y0 + t], [x0 + t, y0 + h - t * 0.5], [x0 + t * 0.5, y0 + h], [x0, y0 + h - t * 0.5], [x0, y0 + t]);
    };
    switch (name) {
      case 'a': H(ox, oy); break;
      case 'g': H(ox, oy + h - t / 2); break;
      case 'd': H(ox, oy + dh - t); break;
      case 'f': V(ox, oy); break;
      case 'b': V(ox + w - t, oy); break;
      case 'e': V(ox, oy + h - t / 2); break;
      case 'c': V(ox + w - t, oy + h - t / 2); break;
      default: break;
    }
    return p;
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, -skew, 1, skew * dh, 0);
  chars.forEach((c, i) => {
    const ox = i * dw * (1 + gap);
    const lit = SEG[c.ch] ?? '';
    for (const s of 'abcdefg') {
      const isOn = lit.includes(s);
      if (!isOn && !off) continue;
      ctx.fillStyle = isOn ? on : off;
      if (isOn) {
        ctx.shadowColor = on;
        ctx.shadowBlur = dw * 0.25;
      } else ctx.shadowBlur = 0;
      const pts = segPath(s, ox, 0);
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    }
    // 소수점
    ctx.shadowBlur = c.dp ? dw * 0.25 : 0;
    if (c.dp || off) {
      ctx.fillStyle = c.dp ? on : off;
      ctx.beginPath();
      ctx.arc(ox + dw + dw * gap * 0.5, dh - t * 0.5, t * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 실험대 안내 패널(홀로그램)
// ---------------------------------------------------------------------------
/**
 * state: { num, title, goal, steps:[{text, state}], done, hint, hintKind, readout(ctx,x,y,w,h)?, formula }
 */
export function createStationPanel({ width = 0.56, height = 0.5, getState, buttons = [] }) {
  const panel = new Panel({
    width,
    height,
    px: 1100,
    name: 'stationPanel',
    draw: (ctx, w, h, p) => drawStationPanel(ctx, w, h, p, getState(), buttons),
  });
  return panel;
}

function drawStationPanel(ctx, w, h, panel, s, buttons) {
  const accent = s.done ? COLORS.ok : COLORS.accent;
  drawCard(ctx, w, h, { accent, radius: 40 });
  const pad = 48;
  let y = 52;
  // 헤더 칩
  ctx.textBaseline = 'top';
  ctx.font = font(30, 700);
  const chip = `실험 ${s.num}`;
  const cw = ctx.measureText(chip).width + 40;
  roundRect(ctx, pad, y, cw, 48, 24);
  ctx.fillStyle = hexA(accent, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillText(chip, pad + 20, y + 8);
  ctx.textAlign = 'right';
  ctx.font = font(28, 700);
  ctx.fillStyle = s.done ? COLORS.ok : COLORS.muted;
  ctx.fillText(s.done ? '✔ 완료' : '진행 중', w - pad, y + 10);
  ctx.textAlign = 'left';
  y += 70;
  ctx.fillStyle = COLORS.text;
  ctx.font = font(52, 900);
  ctx.fillText(s.title, pad, y);
  y += 72;
  ctx.font = font(30, 500);
  ctx.fillStyle = '#c5d4ea';
  y += wrapText(ctx, s.goal, pad, y, w - pad * 2, 42) + 14;

  // 단계
  for (const st of s.steps) {
    drawStatusDot(ctx, pad + 18, y + 20, 17, st.state);
    ctx.font = font(31, st.state === 'active' ? 700 : 500);
    ctx.fillStyle = st.state === 'done' ? '#8fe8c2' : st.state === 'active' ? COLORS.text : st.state === 'bad' ? '#ff9b9b' : '#8ea2bf';
    ctx.fillText(st.text, pad + 52, y + 2);
    y += 52;
  }
  y += 8;

  // 실시간 측정값 영역
  if (s.readout) {
    const rh = s.readoutHeight || 150;
    roundRect(ctx, pad, y, w - pad * 2, rh, 22);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 180, 230, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    s.readout(ctx, pad, y, w - pad * 2, rh);
    ctx.restore();
    y += rh + 18;
  }

  if (s.formula) {
    ctx.font = font(30, 700);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(s.formula, pad, y);
    y += 46;
  }

  // 힌트
  if (s.hint) {
    const kind = s.hintKind || 'info';
    const col = kind === 'bad' ? COLORS.bad : kind === 'warn' ? COLORS.warn : kind === 'ok' ? COLORS.ok : COLORS.accent;
    ctx.font = font(29, 500);
    const lines = measureLines(ctx, s.hint, w - pad * 2 - 70);
    const hh = Math.max(64, lines * 40 + 24);
    roundRect(ctx, pad, y, w - pad * 2, hh, 18);
    ctx.fillStyle = hexA(col, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.6);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = font(34, 700);
    ctx.fillText(kind === 'bad' ? '!' : kind === 'ok' ? '✔' : kind === 'warn' ? '⚠' : '💡', pad + 20, y + 14);
    ctx.fillStyle = COLORS.text;
    ctx.font = font(29, 500);
    wrapText(ctx, s.hint, pad + 66, y + 14, w - pad * 2 - 80, 40);
    y += hh + 16;
  }

  // 버튼
  const bh = 72;
  const by = h - bh - 40;
  const bw = (w - pad * 2 - (buttons.length - 1) * 18) / Math.max(1, buttons.length);
  buttons.forEach((b, i) => {
    panel.button(ctx, { id: b.id, x: pad + i * (bw + 18), y: by, w: bw, h: bh, label: b.label, onClick: b.onClick, style: b.style || 'default', size: 30 });
  });
}

function measureLines(ctx, text, maxW) {
  let lines = 0;
  for (const para of String(text).split('\n')) {
    let line = '';
    let n = 1;
    for (const ch of para) {
      const t = line + ch;
      if (ctx.measureText(t).width > maxW) {
        n++;
        line = ch;
      } else line = t;
    }
    lines += n;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 발광(글로우) 스프라이트
// ---------------------------------------------------------------------------
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function makeGlow(color, size = 0.06) {
  const mat = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.raycast = () => {};
  s.renderOrder = 9;
  s.userData.baseSize = size;
  return s;
}

// ---------------------------------------------------------------------------
// LCD 그리기 헬퍼
// ---------------------------------------------------------------------------
export function lcdBackground(ctx, w, h, color = '#0d1a14') {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function monoText(ctx, text, x, y, size, color, align = 'left') {
  ctx.font = `${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

/** 앞판 인쇄 라벨 */
export function panelLabel(ctx, text, x, y, size = 18, color = '#d9dee5', align = 'center', weight = 700) {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
