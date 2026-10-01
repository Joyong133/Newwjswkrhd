import { CanvasArt, speckle, mottle } from '../core/canvasArt.js';
import { seeded, font, HAND, MONO, FONT, roundRect } from '../core/util.js';

// ---------------------------------------------------------------------------
// 실험실 환경용 절차적 텍스처 모음
// ---------------------------------------------------------------------------

export function floorArt(repeat) {
  return new CanvasArt(1024, 1024, (ctx, w, h) => {
    const rng = seeded(11);
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const v = 196 + Math.floor(rng() * 14) - 7;
        ctx.fillStyle = `rgb(${v}, ${v - 3}, ${v - 12})`;
        ctx.fillRect(i * s, j * s, s, s);
        mottleTile(ctx, i * s, j * s, s, rng);
      }
    }
    speckle(ctx, w, h, rng, 26000, ['#8d877c', '#6f6a61', '#f4f0e6', '#a69f92', '#59544c'], 0.6, 2.2);
    speckle(ctx, w, h, rng, 900, ['#4d7a8c', '#a0533f', '#3c3a36'], 1, 2.6);
    ctx.strokeStyle = 'rgba(70, 64, 56, 0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
    // 바닥 왁스 광택 얼룩
    mottle(ctx, w, h, rng, 30, 'rgba(255,255,255,1)', 0.05, 60, 200);
  }, { repeat });
}

function mottleTile(ctx, x, y, s, rng) {
  for (let k = 0; k < 6; k++) {
    const cx = x + rng() * s;
    const cy = y + rng() * s;
    const r = 30 + rng() * 80;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rng() > 0.5;
    g.addColorStop(0, dark ? 'rgba(90,80,70,0.08)' : 'rgba(255,255,250,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
  }
}

export function noiseArt(repeat, base = 238, seed = 3) {
  return new CanvasArt(512, 512, (ctx, w, h) => {
    const rng = seeded(seed);
    ctx.fillStyle = `rgb(${base},${base},${base})`;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, 9000, ['#ffffff', '#d9d9d9', '#c9c9c9'], 0.6, 1.8);
    mottle(ctx, w, h, rng, 40, 'rgba(120,120,120,1)', 0.035, 40, 160);
  }, { repeat });
}

export function ceilingArt(repeat) {
  return new CanvasArt(512, 512, (ctx, w, h) => {
    const rng = seeded(21);
    ctx.fillStyle = '#efefeb';
    ctx.fillRect(0, 0, w, h);
    // 미네랄 텍스 천장재의 구멍 패턴
    for (let i = 0; i < 3800; i++) {
      ctx.fillStyle = `rgba(120,118,110,${0.15 + rng() * 0.35})`;
      const x = rng() * w;
      const y = rng() * h;
      const l = 1 + rng() * 4;
      ctx.fillRect(x, y, rng() > 0.5 ? l : 1.2, rng() > 0.5 ? 1.2 : l);
    }
    ctx.fillStyle = '#d8d8d4';
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(0, h / 2 - 3, w, 6);
    ctx.fillRect(w / 2 - 3, 0, 6, h);
  }, { repeat });
}

export function epoxyArt(repeat) {
  return new CanvasArt(512, 512, (ctx, w, h) => {
    const rng = seeded(5);
    ctx.fillStyle = '#2c2f33';
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, rng, 60, 'rgba(90,96,104,1)', 0.12, 20, 90);
    speckle(ctx, w, h, rng, 4000, ['#3e434a', '#24272b', '#4a4f57'], 0.6, 1.6);
    // 미세 스크래치
    ctx.strokeStyle = 'rgba(160,170,180,0.06)';
    for (let i = 0; i < 60; i++) {
      ctx.beginPath();
      const x = rng() * w;
      const y = rng() * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 120, y + (rng() - 0.5) * 30);
      ctx.stroke();
    }
  }, { repeat });
}

export function esdMatArt() {
  return new CanvasArt(1024, 512, (ctx, w, h) => {
    const rng = seeded(8);
    ctx.fillStyle = '#4f7896';
    ctx.fillRect(0, 0, w, h);
    mottle(ctx, w, h, rng, 50, 'rgba(30,50,70,1)', 0.12, 30, 120);
    speckle(ctx, w, h, rng, 6000, ['#5d88a8', '#46708e', '#6a94b2'], 0.6, 1.5);
    ctx.strokeStyle = 'rgba(200,225,245,0.12)';
    ctx.lineWidth = 1;
    for (let x = 32; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 32; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,240,250,0.55)';
    ctx.font = font(26, 700);
    ctx.fillText('⚡ ESD PROTECTED AREA', 24, h - 26);
    ctx.font = font(18, 500);
    ctx.fillText('정전기 방지 매트 · 접지 확인', w - 270, h - 26);
    // 접지 스냅 버튼
    ctx.beginPath();
    ctx.arc(w - 30, 30, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#c9ced4';
    ctx.fill();
  });
}

export function woodArt(repeat, tone = [176, 128, 82]) {
  return new CanvasArt(512, 512, (ctx, w, h) => {
    const rng = seeded(13);
    ctx.fillStyle = `rgb(${tone[0]},${tone[1]},${tone[2]})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const y = rng() * h;
      ctx.strokeStyle = `rgba(${60 + rng() * 40},${35 + rng() * 25},${15},${0.08 + rng() * 0.14})`;
      ctx.lineWidth = 0.5 + rng() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 6 + (rng() - 0.5) * 2);
      ctx.stroke();
    }
  }, { repeat });
}

export function whiteboardArt() {
  return new CanvasArt(2048, 820, (ctx, w, h) => {
    const rng = seeded(31);
    ctx.fillStyle = '#f7f8f6';
    ctx.fillRect(0, 0, w, h);
    // 지워진 잔상(고스팅)
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#5a6b8a';
    ctx.font = font(70, 400, HAND);
    ctx.fillText('KCL : ΣI = 0      KVL : ΣV = 0', 980, 760);
    ctx.fillText('τ = RC', 300, 700);
    ctx.globalAlpha = 1;
    mottle(ctx, w, h, rng, 25, 'rgba(160,170,180,1)', 0.05, 80, 260);

    const blue = '#1f4fb5';
    const red = '#c8262b';
    const black = '#23262b';
    const green = '#1d7a46';

    ctx.fillStyle = blue;
    ctx.font = font(96, 400, HAND);
    ctx.fillText('기초회로실험 Ⅱ  —  7주차', 70, 120);
    ctx.fillRect(70, 138, 820, 4);

    ctx.font = font(64, 400, HAND);
    ctx.fillStyle = black;
    const todo = ['오늘 할 일', '① LED 전류제한 저항 계산하기', '② 함수발생기 → 오실로스코프 파형 관측', '③ 74LS 시리즈로 반가산기 만들기', '④ 555 타이머 키트 납땜'];
    todo.forEach((t, i) => {
      ctx.fillStyle = i === 0 ? green : black;
      ctx.fillText(t, 80, 230 + i * 78);
    });

    ctx.fillStyle = blue;
    ctx.font = font(76, 400, HAND);
    ctx.fillText('V = I · R', 1080, 240);
    ctx.fillText('I = (Vs − Vf) / R', 1080, 330);
    ctx.fillText('P = V · I = I²R', 1080, 420);
    ctx.fillText('f = 1 / T', 1600, 240);
    ctx.fillStyle = green;
    ctx.fillText('S = A ⊕ B', 1080, 520);
    ctx.fillText('C = A · B', 1440, 520);

    // 회로 스케치: 전원 - 저항 - LED
    ctx.strokeStyle = black;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const ox = 1500;
    const oy = 610;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, oy + 150);
    ctx.lineTo(ox + 360, oy + 150);
    ctx.lineTo(ox + 360, oy);
    ctx.lineTo(ox + 260, oy);
    ctx.moveTo(ox + 140, oy);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    // 저항 지그재그
    ctx.beginPath();
    ctx.moveTo(ox + 140, oy);
    for (let k = 0; k < 6; k++) ctx.lineTo(ox + 150 + k * 18, oy + (k % 2 ? 18 : -18));
    ctx.lineTo(ox + 260, oy);
    ctx.stroke();
    // 전지
    ctx.beginPath();
    ctx.moveTo(ox - 30, oy + 60);
    ctx.lineTo(ox + 30, oy + 60);
    ctx.moveTo(ox - 16, oy + 80);
    ctx.lineTo(ox + 16, oy + 80);
    ctx.stroke();
    // LED 삼각형
    ctx.beginPath();
    ctx.moveTo(ox + 330, oy + 50);
    ctx.lineTo(ox + 390, oy + 50);
    ctx.lineTo(ox + 360, oy + 100);
    ctx.closePath();
    ctx.moveTo(ox + 330, oy + 100);
    ctx.lineTo(ox + 390, oy + 100);
    ctx.stroke();
    ctx.font = font(52, 400, HAND);
    ctx.fillStyle = black;
    ctx.fillText('R = ?', ox + 160, oy - 30);
    ctx.fillText('5V', ox - 110, oy + 85);

    // 사인파 스케치
    ctx.strokeStyle = blue;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= 360; x += 4) {
      const y = 660 + Math.sin((x / 360) * Math.PI * 4) * 55;
      if (x === 0) ctx.moveTo(1000 + x, y);
      else ctx.lineTo(1000 + x, y);
    }
    ctx.stroke();
    ctx.fillStyle = blue;
    ctx.font = font(46, 400, HAND);
    ctx.fillText('Vpp', 1370, 620);

    ctx.fillStyle = red;
    ctx.font = font(62, 400, HAND);
    ctx.fillText('※ 실험 끝나면 인두 전원 OFF!!  — 조교', 80, 680);
    ctx.font = font(70, 400, HAND);
    ctx.fillText('중간고사 D-3', 1660, 110);
    ctx.font = font(54, 400, HAND);
    ctx.fillText('보고서 마감: 내일 09:00', 1600, 400);
    ctx.fillStyle = green;
    ctx.font = font(56, 400, HAND);
    ctx.fillText('전자과 화이팅!! ٩(ˊᗜˋ)و', 80, 780);
    ctx.fillStyle = '#7b7f86';
    ctx.font = font(36, 400, HAND);
    ctx.fillText('살려줘…', 1890, 790);
  });
}

export function colorCodePosterArt() {
  return new CanvasArt(768, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#fbfaf5';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b2a44';
    ctx.fillRect(0, 0, w, 150);
    ctx.fillStyle = '#fff';
    ctx.font = font(52, 900);
    ctx.fillText('저항 색 코드표', 40, 80);
    ctx.font = font(26, 500);
    ctx.fillStyle = '#9fc4ff';
    ctx.fillText('RESISTOR COLOR CODE · 4-BAND', 40, 124);
    const rows = [
      ['검정', '#111', 0, '×1'],
      ['갈색', '#7a4a21', 1, '×10'],
      ['빨강', '#d0262b', 2, '×100'],
      ['주황', '#f08a1c', 3, '×1k'],
      ['노랑', '#f2d21b', 4, '×10k'],
      ['초록', '#2d9a46', 5, '×100k'],
      ['파랑', '#2f5fd0', 6, '×1M'],
      ['보라', '#7c3fc0', 7, ''],
      ['회색', '#8a8a8a', 8, ''],
      ['흰색', '#f4f4f4', 9, ''],
    ];
    ctx.font = font(30, 700);
    rows.forEach(([name, col, digit, mult], i) => {
      const y = 190 + i * 62;
      ctx.fillStyle = i % 2 ? '#f0efe8' : '#fbfaf5';
      ctx.fillRect(30, y - 40, w - 60, 62);
      ctx.fillStyle = col;
      ctx.fillRect(50, y - 30, 110, 42);
      ctx.strokeStyle = '#999';
      ctx.strokeRect(50, y - 30, 110, 42);
      ctx.fillStyle = '#222';
      ctx.fillText(name, 190, y);
      ctx.fillText(String(digit), 360, y);
      ctx.fillText(mult, 470, y);
    });
    ctx.fillStyle = '#555';
    ctx.font = font(24, 500);
    ctx.fillText('금색 ±5%   은색 ±10%', 50, 840);
    // 예시 저항
    ctx.fillStyle = '#d8c7a0';
    roundRect(ctx, 180, 890, 400, 70, 30);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.fillRect(60, 921, 120, 8);
    ctx.fillRect(580, 921, 120, 8);
    [['#d0262b', 240], ['#d0262b', 300], ['#7a4a21', 360], ['#c9a43a', 500]].forEach(([c, x]) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, 890, 28, 70);
    });
    ctx.fillStyle = '#222';
    ctx.font = font(30, 700);
    ctx.fillText('= 220 Ω ±5%', 280, 1005);
  });
}

export function safetyPosterArt() {
  return new CanvasArt(768, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#fffdf2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8b400';
    ctx.fillRect(0, 0, w, 170);
    for (let x = -60; x < w; x += 60) {
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(x, 170);
      ctx.lineTo(x + 30, 170);
      ctx.lineTo(x + 60, 200);
      ctx.lineTo(x + 30, 200);
      ctx.fill();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.font = font(60, 900);
    ctx.fillText('실험실 안전수칙', 40, 100);
    ctx.font = font(26, 700);
    ctx.fillText('LAB SAFETY RULES', 44, 145);
    const rules = [
      '음식물 반입 금지 (에너지드링크 포함)',
      '인두는 사용 후 반드시 거치대에',
      '전원 인가 전 회로 결선 재확인',
      '정전기 주의 — ESD 매트·손목밴드',
      '납 연기는 흄 추출기로 배출',
      '퇴실 시 모든 장비 전원 OFF',
    ];
    ctx.font = font(30, 500);
    rules.forEach((r, i) => {
      const y = 280 + i * 110;
      ctx.fillStyle = '#c8262b';
      ctx.beginPath();
      ctx.arc(70, y - 10, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = font(30, 900);
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 70, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#222';
      ctx.font = font(31, 700);
      ctx.fillText(r, 120, y);
    });
    ctx.fillStyle = '#666';
    ctx.font = font(22, 500);
    ctx.fillText('전자공학부 실험실 안전관리위원회', 40, h - 40);
  });
}

export function bulletinArt() {
  return new CanvasArt(1536, 1024, (ctx, w, h) => {
    const rng = seeded(41);
    ctx.fillStyle = '#b98a57';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, 30000, ['#a97a48', '#c99a66', '#8e6438', '#d4a974'], 0.8, 2.4);
    const flyer = (x, y, fw, fh, rot, bg, draw) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, fw, fh);
      ctx.shadowColor = 'transparent';
      draw(fw, fh);
      // 압정
      ctx.fillStyle = '#d32f2f';
      ctx.beginPath();
      ctx.arc(fw / 2, 16, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    flyer(60, 60, 440, 560, -0.03, '#ffffff', (fw) => {
      ctx.fillStyle = '#123a7a';
      ctx.fillRect(0, 40, fw, 150);
      ctx.fillStyle = '#fff';
      ctx.font = font(30, 500);
      ctx.fillText('제 31회 전자공학과', 30, 95);
      ctx.font = font(52, 900);
      ctx.fillText('학술제', 30, 160);
      ctx.fillStyle = '#222';
      ctx.font = font(26, 700);
      ctx.fillText('캡스톤디자인 작품 모집', 30, 250);
      ctx.font = font(22, 500);
      ['• 일시: 11월 둘째 주', '• 장소: 공학관 1층 로비', '• 시상: 대상 · 금상 · 은상', '• 문의: 학생회실 (B동 105호)'].forEach((t, i) => ctx.fillText(t, 30, 310 + i * 44));
      ctx.fillStyle = '#123a7a';
      ctx.font = font(22, 700);
      ctx.fillText('IDEA → CIRCUIT → PRODUCT', 30, 520);
    });
    flyer(540, 90, 400, 400, 0.04, '#ffe45c', (fw) => {
      ctx.fillStyle = '#111';
      ctx.font = font(40, 900);
      ctx.fillText('로봇 동아리', 30, 100);
      ctx.font = font(72, 900);
      ctx.fillText('VOLT', 30, 190);
      ctx.font = font(26, 700);
      ctx.fillText('신입 부원 모집!', 30, 250);
      ctx.font = font(22, 500);
      ctx.fillText('아두이노 · 모터 · 센서', 30, 300);
      ctx.fillText('납땜 못해도 OK 🔧', 30, 340);
    });
    flyer(990, 50, 480, 330, -0.02, '#e9f3ff', (fw) => {
      ctx.fillStyle = '#0d4f8b';
      ctx.font = font(28, 700);
      ctx.fillText('IEEE 학생지회 세미나', 30, 90);
      ctx.fillStyle = '#111';
      ctx.font = font(40, 900);
      ctx.fillText('반도체의 미래', 30, 160);
      ctx.font = font(22, 500);
      ctx.fillText('— 3nm 이후의 트랜지스터', 30, 210);
      ctx.fillText('목요일 18:00 · 대강당 · 피자 제공 🍕', 30, 270);
    });
    flyer(980, 430, 260, 300, 0.05, '#ffffff', () => {
      ctx.fillStyle = '#c62828';
      ctx.font = font(36, 900);
      ctx.fillText('분실물', 30, 90);
      ctx.fillStyle = '#222';
      ctx.font = font(22, 500);
      ctx.fillText('공학용 계산기', 30, 140);
      ctx.fillText('(이름 스티커 有)', 30, 175);
      ctx.fillText('조교실로 찾아가세요', 30, 230);
    });
    flyer(1270, 420, 230, 330, -0.06, '#ffd6e8', () => {
      ctx.fillStyle = '#7a1f4a';
      ctx.font = font(34, 900);
      ctx.fillText('전자과 MT', 24, 90);
      ctx.font = font(22, 500);
      ctx.fillText('가평 · 1박 2일', 24, 140);
      ctx.fillText('고기 무한 🍖', 24, 180);
      ctx.fillText('신청: 과대표', 24, 220);
    });
    flyer(560, 560, 380, 260, 0.02, '#ffffff', () => {
      ctx.fillStyle = '#222';
      ctx.font = font(30, 900);
      ctx.fillText('📢 조교실 공지', 26, 80);
      ctx.font = font(22, 500);
      ctx.fillText('실험 보고서는 출력해서', 26, 130);
      ctx.fillText('조교석 제출함에 넣을 것.', 26, 165);
      ctx.fillText('(이메일 제출 X)', 26, 200);
    });
    flyer(90, 680, 400, 260, 0.03, '#e8ffe9', () => {
      ctx.fillStyle = '#1d6b35';
      ctx.font = font(28, 900);
      ctx.fillText('전공 스터디 모집', 26, 80);
      ctx.fillStyle = '#222';
      ctx.font = font(22, 500);
      ctx.fillText('회로이론 · 전자기학 같이 버텨요', 26, 130);
      ctx.fillText('매주 화 21:00 · 302호', 26, 170);
    });
  });
}

export function nightCityArt() {
  return new CanvasArt(2048, 640, (ctx, w, h) => {
    const rng = seeded(77);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05070d');
    sky.addColorStop(0.55, '#121a2c');
    sky.addColorStop(0.8, '#2b2a3a');
    sky.addColorStop(1, '#3b3140');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // 흐린 구름 + 도시 불빛 반사
    mottle(ctx, w, h * 0.7, rng, 40, 'rgba(70,80,110,1)', 0.12, 80, 260);

    // 먼 산 실루엣
    ctx.fillStyle = '#0b0f19';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * 0.6 - Math.sin(x * 0.002) * 40 - Math.sin(x * 0.009) * 14);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    // 아파트 단지
    const drawBlock = (x, bw, bh, label) => {
      const top = h - bh;
      ctx.fillStyle = '#10141f';
      ctx.fillRect(x, top, bw, bh);
      const cols = Math.floor(bw / 16);
      const rows = Math.floor((bh - 30) / 14);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() < 0.38) {
            const warm = rng() < 0.7;
            ctx.fillStyle = warm ? `rgba(255, ${200 + rng() * 40}, ${120 + rng() * 60}, ${0.55 + rng() * 0.4})` : `rgba(190, 220, 255, ${0.4 + rng() * 0.4})`;
            ctx.fillRect(x + 4 + c * 16, top + 24 + r * 14, 9, 7);
          }
        }
      }
      if (label) {
        ctx.fillStyle = 'rgba(220,230,255,0.5)';
        ctx.font = font(14, 700);
        ctx.fillText(label, x + 6, top + 16);
      }
      // 옥상 항공장애등
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(x + bw - 6, top - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    let x = 10;
    let k = 101;
    while (x < w) {
      const bw = 90 + rng() * 120;
      const bh = 200 + rng() * 210;
      drawBlock(x, bw, bh, rng() < 0.6 ? `${k}동` : null);
      x += bw + 20 + rng() * 60;
      k++;
    }
    // 교회 십자가 (한국 야경 필수 요소)
    [[480, 250], [1320, 230], [1830, 300]].forEach(([cx, cy]) => {
      ctx.save();
      ctx.shadowColor = '#ff2a2a';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#ff4040';
      ctx.fillRect(cx - 3, cy - 22, 6, 44);
      ctx.fillRect(cx - 14, cy - 10, 28, 6);
      ctx.restore();
    });
    // 캠퍼스 가로등 / 도로
    const road = ctx.createLinearGradient(0, h - 60, 0, h);
    road.addColorStop(0, 'rgba(255,180,90,0)');
    road.addColorStop(1, 'rgba(255,170,80,0.35)');
    ctx.fillStyle = road;
    ctx.fillRect(0, h - 60, w, 60);
    for (let i = 0; i < 18; i++) {
      const lx = 40 + i * 115 + rng() * 20;
      const g = ctx.createRadialGradient(lx, h - 50, 0, lx, h - 50, 40);
      g.addColorStop(0, 'rgba(255,210,140,0.9)');
      g.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 40, h - 90, 80, 80);
    }
  });
}

export function rainArt() {
  return new CanvasArt(512, 1024, (ctx, w, h) => {
    const rng = seeded(99);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const l = 20 + rng() * 60;
      const g = ctx.createLinearGradient(x, y, x, y + l);
      g.addColorStop(0, 'rgba(200,220,255,0)');
      g.addColorStop(1, `rgba(210,230,255,${0.25 + rng() * 0.35})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + l);
      ctx.stroke();
    }
    // 유리에 맺힌 물방울
    for (let i = 0; i < 260; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const r = 1.5 + rng() * 4;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.65)');
      g.addColorStop(0.6, 'rgba(170,190,220,0.25)');
      g.addColorStop(1, 'rgba(120,140,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [3, 1] });
}

export function clockFaceArt() {
  return new CanvasArt(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#fbfbf8';
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const long = i % 5 === 0;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(a);
      ctx.fillRect(-(long ? 5 : 2), -c + 16, long ? 10 : 4, long ? 34 : 14);
      ctx.restore();
    }
    ctx.font = font(54, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillText(String(i), c + Math.sin(a) * (c - 100), c - Math.cos(a) * (c - 100));
    }
    ctx.font = font(22, 500);
    ctx.fillStyle = '#777';
    ctx.fillText('공과대학', c, c + 90);
  });
}

export function exitSignArt() {
  return new CanvasArt(512, 192, (ctx, w, h) => {
    ctx.fillStyle = '#0f9d58';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(76, 900);
    ctx.textBaseline = 'middle';
    ctx.fillText('비상구', 190, h / 2 + 4);
    // 달리는 사람 픽토그램(단순화)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(95, 45, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(90, 70);
    ctx.lineTo(80, 120);
    ctx.lineTo(55, 160);
    ctx.moveTo(80, 120);
    ctx.lineTo(115, 150);
    ctx.moveTo(60, 95);
    ctx.lineTo(90, 75);
    ctx.lineTo(125, 100);
    ctx.stroke();
  });
}

export function roomSignArt() {
  return new CanvasArt(1024, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#1d2a3f');
    g.addColorStop(1, '#2c3e5c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#38d9ff';
    ctx.fillRect(0, 0, 14, h);
    ctx.fillStyle = '#fff';
    ctx.font = font(92, 900);
    ctx.fillText('302', 50, 120);
    ctx.font = font(52, 700);
    ctx.fillText('회로실험실', 260, 112);
    ctx.font = font(30, 500);
    ctx.fillStyle = '#a9c3e8';
    ctx.fillText('Circuits Laboratory · 전자공학부', 52, 200);
  });
}

/** 모니터: 회로 시뮬레이터 화면 */
export function schematicScreenArt() {
  return new CanvasArt(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#e9ecef';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d5dae0';
    ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = '#333';
    ctx.font = font(20, 500);
    ctx.fillText('파일  편집  보기  시뮬레이션  도구     half_adder_sim.cir', 16, 27);
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(10, 50, w - 20, h - 60);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    for (let x = 10; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 50);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
    }
    for (let y = 50; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#1f3fbf';
    ctx.lineWidth = 3;
    const gate = (x, y, label) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 50, y);
      ctx.arc(x + 50, y + 40, 40, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x, y + 80);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#1f3fbf';
      ctx.font = font(18, 700);
      ctx.fillText(label, x + 14, y + 47);
    };
    gate(420, 150, 'XOR');
    gate(420, 350, 'AND');
    ctx.beginPath();
    ctx.moveTo(200, 180);
    ctx.lineTo(420, 180);
    ctx.moveTo(200, 210);
    ctx.lineTo(420, 210);
    ctx.moveTo(300, 180);
    ctx.lineTo(300, 380);
    ctx.lineTo(420, 380);
    ctx.moveTo(340, 210);
    ctx.lineTo(340, 410);
    ctx.lineTo(420, 410);
    ctx.moveTo(510, 190);
    ctx.lineTo(700, 190);
    ctx.moveTo(510, 390);
    ctx.lineTo(700, 390);
    ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.font = font(26, 700);
    ctx.fillText('A', 170, 188);
    ctx.fillText('B', 170, 218);
    ctx.fillText('SUM', 712, 198);
    ctx.fillText('CARRY', 712, 398);
    ctx.fillStyle = '#555';
    ctx.font = font(16, 500, MONO);
    ctx.fillText('.tran 1u 10m   ; 시뮬레이션 완료 (0 errors)', 30, h - 30);
  });
}

/** 노트북: 한글 문서 보고서 */
export function reportScreenArt() {
  return new CanvasArt(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#dfe6ef';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2f6cc2';
    ctx.fillRect(0, 0, w, 48);
    ctx.fillStyle = '#fff';
    ctx.font = font(22, 700);
    ctx.fillText('기초회로실험_7주차_결과보고서.hwp', 18, 32);
    ctx.fillStyle = '#fff';
    ctx.fillRect(170, 70, w - 340, h - 70);
    ctx.fillStyle = '#111';
    ctx.font = font(30, 900);
    ctx.fillText('7주차 결과 보고서', 300, 130);
    ctx.font = font(18, 500);
    ctx.fillText('전자공학부 1학년 · 기초회로실험 Ⅱ', 300, 165);
    ctx.font = font(20, 700);
    ctx.fillText('1. 실험 목적', 210, 220);
    ctx.font = font(17, 400);
    ctx.fillStyle = '#333';
    ['옴의 법칙을 이용하여 LED의 전류제한 저항을 설계하고,', '함수발생기와 오실로스코프로 주기 신호를 관측한다.'].forEach((t, i) => ctx.fillText(t, 220, 255 + i * 30));
    ctx.fillStyle = '#111';
    ctx.font = font(20, 700);
    ctx.fillText('2. 실험 결과', 210, 340);
    ctx.fillStyle = '#999';
    ctx.font = font(17, 400);
    ctx.fillText('(작성 중…)', 220, 375);
    ctx.fillStyle = '#111';
    ctx.fillRect(320, 365, 2, 22);
  });
}

export function canLabelArt(name, c1, c2) {
  return new CanvasArt(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, c1);
    g.addColorStop(0.5, c2);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = font(46, 900);
    ctx.textAlign = 'center';
    ctx.fillText(name, w / 4, h / 2 + 10);
    ctx.fillText(name, (w * 3) / 4, h / 2 + 10);
    ctx.font = font(20, 700);
    ctx.fillText('⚡ ENERGY', w / 4, h / 2 + 50);
    ctx.fillText('⚡ ENERGY', (w * 3) / 4, h / 2 + 50);
  });
}

export function bookSpineArt(titles) {
  return new CanvasArt(1024, 256, (ctx, w, h) => {
    const n = titles.length;
    const bw = w / n;
    titles.forEach(([title, bg, fg], i) => {
      ctx.fillStyle = bg;
      ctx.fillRect(i * bw, 0, bw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(i * bw, 0, 3, h);
      ctx.save();
      ctx.translate(i * bw + bw / 2, h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = fg;
      ctx.font = font(Math.min(28, bw * 0.55), 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 0, 0);
      ctx.restore();
    });
  });
}

export { FONT };
