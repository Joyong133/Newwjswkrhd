import { font } from '../core/util.js';

/*
 * 교통안전표지를 캔버스로 그린다. drawSign(ctx, id, cx, cy, size)
 * size = 표지 한 변(지름) 픽셀
 */
const RED = '#d7262e';
const BLUE = '#1f5fbf';
const YELLOW = '#ffcc12';
const INK = '#111111';

function triangle(c, cx, cy, s, down = false) {
  const h = s * 0.87;
  c.beginPath();
  if (!down) {
    c.moveTo(cx, cy - h / 2);
    c.lineTo(cx + s / 2, cy + h / 2);
    c.lineTo(cx - s / 2, cy + h / 2);
  } else {
    c.moveTo(cx - s / 2, cy - h / 2);
    c.lineTo(cx + s / 2, cy - h / 2);
    c.lineTo(cx, cy + h / 2);
  }
  c.closePath();
}

/** 주의표지: 노란 바탕 + 빨간 테두리 삼각형 */
function caution(c, cx, cy, s, draw) {
  c.save();
  c.lineJoin = 'round';
  triangle(c, cx, cy + s * 0.04, s);
  c.fillStyle = RED;
  c.fill();
  c.lineWidth = s * 0.04;
  c.strokeStyle = RED;
  c.stroke();
  triangle(c, cx, cy + s * 0.09, s * 0.72);
  c.fillStyle = YELLOW;
  c.fill();
  c.restore();
  c.save();
  c.translate(cx, cy + s * 0.14);
  c.scale(s / 100, s / 100);
  c.fillStyle = INK;
  c.strokeStyle = INK;
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  draw(c);
  c.restore();
}

/** 규제표지: 흰 바탕 + 빨간 테두리 원 */
function regulatory(c, cx, cy, s, draw, slash = false) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, s / 2, 0, Math.PI * 2);
  c.fillStyle = RED;
  c.fill();
  c.beginPath();
  c.arc(cx, cy, s * 0.39, 0, Math.PI * 2);
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
  c.save();
  c.translate(cx, cy);
  c.scale(s / 100, s / 100);
  c.fillStyle = INK;
  c.strokeStyle = INK;
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  draw(c);
  if (slash) {
    c.strokeStyle = RED;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(-27, -27);
    c.lineTo(27, 27);
    c.stroke();
  }
  c.restore();
}

/** 지시표지: 파란 원 + 흰 그림 */
function mandatory(c, cx, cy, s, draw) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, s / 2, 0, Math.PI * 2);
  c.fillStyle = BLUE;
  c.fill();
  c.lineWidth = s * 0.025;
  c.strokeStyle = '#ffffff';
  c.beginPath();
  c.arc(cx, cy, s * 0.46, 0, Math.PI * 2);
  c.stroke();
  c.translate(cx, cy);
  c.scale(s / 100, s / 100);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#ffffff';
  c.lineWidth = 8;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  draw(c);
  c.restore();
}

function arrowHead(c, x, y, ang, size = 14) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, -size);
  c.lineTo(size * 0.9, size * 0.4);
  c.lineTo(-size * 0.9, size * 0.4);
  c.closePath();
  c.fill();
  c.restore();
}

function car(c, x, y, w, col) {
  c.fillStyle = col;
  c.beginPath();
  c.roundRect(x - w / 2, y - w * 0.9, w, w * 1.8, w * 0.25);
  c.fill();
}

function person(c, x, y, k = 1) {
  c.beginPath();
  c.arc(x, y - 18 * k, 5 * k, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 5 * k;
  c.beginPath();
  c.moveTo(x, y - 12 * k);
  c.lineTo(x, y + 2 * k);
  c.moveTo(x, y + 2 * k);
  c.lineTo(x - 6 * k, y + 14 * k);
  c.moveTo(x, y + 2 * k);
  c.lineTo(x + 6 * k, y + 14 * k);
  c.moveTo(x - 7 * k, y - 6 * k);
  c.lineTo(x + 7 * k, y - 4 * k);
  c.stroke();
}

export const SIGNS = {
  curveRight: {
    name: '우로 굽은 도로',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(-6, 20);
        g.lineTo(-6, 0);
        g.quadraticCurveTo(-6, -14, 8, -14);
        g.stroke();
        arrowHead(g, 12, -14, Math.PI / 2, 10);
      }),
  },
  crosswalkWarn: {
    name: '횡단보도',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        person(g, 0, 2, 1.1);
        for (let i = -2; i <= 2; i++) g.fillRect(i * 9 - 3, 18, 6, 4);
      }),
  },
  children: {
    name: '어린이 보호',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        person(g, -9, 6, 0.95);
        person(g, 10, 9, 0.75);
      }),
  },
  slippery: {
    name: '미끄러운 도로',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        car(g, 0, -6, 12, INK);
        g.lineWidth = 3;
        for (const sx of [-1, 1]) {
          g.beginPath();
          g.moveTo(sx * 4, 8);
          g.bezierCurveTo(sx * 14, 12, sx * -4, 18, sx * 8, 22);
          g.stroke();
        }
      }),
  },
  railroad: {
    name: '철길건널목',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        g.lineWidth = 3;
        g.strokeRect(-14, -6, 28, 12);
        g.fillRect(-16, 8, 32, 4);
        for (let i = -12; i <= 12; i += 6) g.fillRect(i - 1, 12, 2, 6);
        g.fillRect(-10, -12, 6, 6);
      }),
  },
  signalAhead: {
    name: '신호기',
    draw: (c, x, y, s) =>
      caution(c, x, y, s, (g) => {
        g.fillRect(-8, -16, 16, 36);
        [['#e53935', -9], ['#ffb300', 2], ['#43a047', 13]].forEach(([col, yy]) => {
          g.fillStyle = col;
          g.beginPath();
          g.arc(0, yy, 4.5, 0, Math.PI * 2);
          g.fill();
        });
      }),
  },
  noEntry: {
    name: '진입 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.fillStyle = RED;
        g.beginPath();
        g.arc(0, 0, 39, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.fillRect(-28, -7, 56, 14);
      }),
  },
  noVehicles: {
    name: '통행 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.font = font(17, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('통행금지', 0, 1);
      }),
  },
  speed50: {
    name: '최고속도 제한(50)',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.font = font(40, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('50', 0, 3);
      }),
  },
  speed30: {
    name: '최고속도 제한(30)',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.font = font(40, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('30', 0, 3);
      }),
  },
  noParking: {
    name: '주차 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.font = font(46, 900);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('P', 0, 3);
      }, true),
  },
  noUturn: {
    name: '유턴 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(8, 22);
        g.lineTo(8, -6);
        g.arc(-4, -6, 12, 0, Math.PI, true);
        g.lineTo(-16, 10);
        g.stroke();
        arrowHead(g, -16, 14, Math.PI, 9);
      }, true),
  },
  noLeft: {
    name: '좌회전 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(8, 24);
        g.lineTo(8, -4);
        g.quadraticCurveTo(8, -12, 0, -12);
        g.lineTo(-12, -12);
        g.stroke();
        arrowHead(g, -16, -12, -Math.PI / 2, 9);
      }, true),
  },
  noOvertake: {
    name: '앞지르기 금지',
    draw: (c, x, y, s) =>
      regulatory(c, x, y, s, (g) => {
        car(g, -11, 2, 14, RED);
        car(g, 11, 2, 14, INK);
      }),
  },
  stop: {
    name: '일시정지',
    draw: (c, x, y, s) => {
      c.save();
      triangle(c, x, y, s, true);
      c.fillStyle = RED;
      c.fill();
      triangle(c, x, y - s * 0.03, s * 0.82, true);
      c.lineWidth = s * 0.03;
      c.strokeStyle = '#fff';
      c.stroke();
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(s * 0.17, 900);
      c.fillText('일시정지', x, y - s * 0.2);
      c.font = font(s * 0.12, 800);
      c.fillText('STOP', x, y - s * 0.04);
      c.restore();
    },
  },
  slow: {
    name: '서행',
    draw: (c, x, y, s) => {
      c.save();
      triangle(c, x, y, s, true);
      c.fillStyle = RED;
      c.fill();
      triangle(c, x, y - s * 0.035, s * 0.74, true);
      c.fillStyle = '#fff';
      c.fill();
      c.fillStyle = RED;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(s * 0.15, 900);
      c.fillText('천천히', x, y - s * 0.2);
      c.font = font(s * 0.11, 800);
      c.fillText('SLOW', x, y - s * 0.05);
      c.restore();
    },
  },
  goStraight: {
    name: '직진',
    draw: (c, x, y, s) =>
      mandatory(c, x, y, s, (g) => {
        g.beginPath();
        g.moveTo(0, 26);
        g.lineTo(0, -12);
        g.stroke();
        arrowHead(g, 0, -18, 0, 15);
      }),
  },
  turnRight: {
    name: '우회전',
    draw: (c, x, y, s) =>
      mandatory(c, x, y, s, (g) => {
        g.beginPath();
        g.moveTo(-8, 26);
        g.lineTo(-8, 0);
        g.quadraticCurveTo(-8, -10, 4, -10);
        g.lineTo(10, -10);
        g.stroke();
        arrowHead(g, 18, -10, Math.PI / 2, 14);
      }),
  },
  roundabout: {
    name: '회전교차로',
    draw: (c, x, y, s) =>
      mandatory(c, x, y, s, (g) => {
        g.lineWidth = 7;
        for (let k = 0; k < 3; k++) {
          const a0 = (k * 2 * Math.PI) / 3 - 0.2;
          g.beginPath();
          g.arc(0, 0, 22, a0, a0 - 1.5, true);
          g.stroke();
          const a1 = a0 - 1.55;
          arrowHead(g, Math.cos(a1) * 22, Math.sin(a1) * 22, a1 - Math.PI, 9);
        }
      }),
  },
  bikeOnly: {
    name: '자전거 전용도로',
    draw: (c, x, y, s) =>
      mandatory(c, x, y, s, (g) => {
        g.lineWidth = 5;
        g.beginPath();
        g.arc(-15, 10, 11, 0, Math.PI * 2);
        g.arc(17, 10, 11, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(-15, 10);
        g.lineTo(-3, -8);
        g.lineTo(12, -8);
        g.lineTo(17, 10);
        g.moveTo(-3, -8);
        g.lineTo(2, 10);
        g.lineTo(12, -8);
        g.moveTo(-6, -14);
        g.lineTo(2, -14);
        g.stroke();
      }),
  },
};

export function drawSign(c, id, cx, cy, size) {
  const s = SIGNS[id];
  if (s) s.draw(c, cx, cy, size);
}
