import { Panel, drawCard } from '../core/panel.js';
import { C, font, roundRect, drawWrapped, shuffle, hexA } from '../core/util.js';
import { QUESTIONS, CATEGORIES, questionsBy } from '../content/questions.js';
import { drawSign } from '../content/signs.js';

const MARK = ['①', '②', '③', '④'];
const KEY = 'vr-driving-v1';

/** 진도·오답·설정 저장 */
export class Store {
  constructor() {
    this.d = { wrong: [], bestMock: null, bestSkill: null, settings: {} };
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.d = { ...this.d, ...JSON.parse(raw) };
    } catch (e) { /* 저장 불가 */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.d));
    } catch (e) { /* 무시 */ }
  }

  setting(k, def) {
    return this.d.settings[k] ?? def;
  }

  set(k, v) {
    this.d.settings[k] = v;
    this.save();
  }
}

/**
 * 운전석 앞에 뜨는 큰 메뉴 패널(손가락으로 직접 누르거나 레이로 선택)
 * 페이지: home · cats · quiz · result · skillResult
 */
export class Menu {
  constructor({ store, audio, actions }) {
    this.store = store;
    this.audio = audio;
    this.actions = actions; // { startSkill, startFree, recenter, toggleGuide, toggleComfort, toggleSound, resume, stopDrive, isDriving }
    this.page = 'home';
    this.quiz = null;
    this.skill = null;
    this.panel = new Panel({ width: 0.84, height: 0.53, px: 1680, name: 'menu', draw: (c, w, h, p) => this.draw(c, w, h, p) });
  }

  get visible() {
    return this.panel.mesh.visible;
  }

  show(on) {
    this.panel.mesh.visible = on;
    if (on) this.panel.redraw();
  }

  go(page) {
    this.page = page;
    this.panel.invalidate();
  }

  // -------------------------------------------------------------------------
  draw(c, w, h, p) {
    drawCard(c, w, h, { alpha: 0.97 });
    if (this.page === 'home') this.drawHome(c, w, h, p);
    else if (this.page === 'cats') this.drawCats(c, w, h, p);
    else if (this.page === 'quiz') this.drawQuiz(c, w, h, p);
    else if (this.page === 'result') this.drawResult(c, w, h, p);
    else if (this.page === 'skillResult') this.drawSkill(c, w, h, p);
    else if (this.page === 'help') this.drawHelp(c, w, h, p);
  }

  header(c, title, sub = '') {
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = C.accent;
    c.font = font(30, 800);
    c.fillText(sub || 'VR 운전면허 연습장', 56, 40);
    c.fillStyle = C.text;
    c.font = font(62, 900);
    c.fillText(title, 56, 80);
  }

  backBtn(c, w, p, to = 'home') {
    p.button(c, { id: 'back', x: w - 56 - 220, y: 46, w: 220, h: 96, label: '← 처음', size: 38, onClick: () => this.go(to) });
  }

  drawHome(c, w, h, p) {
    const driving = this.actions.isDriving();
    this.header(c, '무엇을 연습할까요?');
    const d = this.store.d;
    const big = (id, x, y, bw, bh, label, sub, style, fn) => p.button(c, { id, x, y, w: bw, h: bh, label, sub, style, size: 50, onClick: fn });
    const bw = (w - 112 - 30) / 2;
    big('skill', 56, 190, bw, 190, '🚗 기능시험', d.bestSkill !== null ? `최고 ${d.bestSkill}점 · 80점 합격` : '코스 주행 · 80점 이상 합격', 'primary', () => this.actions.startSkill());
    big('free', 56 + bw + 30, 190, bw, 190, '🛣 자유 주행', '채점 없이 코스 연습', 'default', () => this.actions.startFree());
    const tw = (w - 112 - 60) / 3;
    big('cats', 56, 410, tw, 170, '📝 학과 연습', '분야별 10문제', 'default', () => this.go('cats'));
    big('mock', 56 + tw + 30, 410, tw, 170, '🧪 모의고사', d.bestMock !== null ? `최고 ${d.bestMock}점` : '40문항 · 실전처럼', 'default', () => this.startQuiz('mock'));
    big('wrong', 56 + 2 * (tw + 30), 410, tw, 170, '❌ 오답노트', `${d.wrong.length}문제`, 'default', () => this.startQuiz('wrong'));
    const sy = 610;
    const sw = (w - 112 - 4 * 20) / 5;
    const st = this.store;
    const small = (i, id, label, fn, active = false) => p.button(c, { id, x: 56 + i * (sw + 20), y: sy, w: sw, h: 110, label, size: 32, active, onClick: fn });
    small(0, 'seat', '🪑 자리 맞춤', () => this.actions.recenter());
    small(1, 'guide', `가이드선 ${st.setting('guide', true) ? 'ON' : 'OFF'}`, () => this.actions.toggleGuide(), st.setting('guide', true));
    small(2, 'comfort', `멀미 방지 ${st.setting('comfort', true) ? 'ON' : 'OFF'}`, () => this.actions.toggleComfort(), st.setting('comfort', true));
    small(3, 'sound', `소리 ${st.setting('sound', true) ? 'ON' : 'OFF'}`, () => this.actions.toggleSound(), st.setting('sound', true));
    small(4, 'help', '❓ 조작법', () => this.go('help'));
    if (driving) {
      p.button(c, { id: 'resume', x: 56, y: 760, w: bw, h: 110, label: '▶ 주행 계속', style: 'primary', size: 40, onClick: () => this.actions.resume() });
      p.button(c, { id: 'stop', x: 56 + bw + 30, y: 760, w: bw, h: 110, label: '■ 주행 그만두기', style: 'bad', size: 40, onClick: () => this.actions.stopDrive() });
    } else {
      c.fillStyle = C.muted;
      c.font = font(30, 500);
      c.textBaseline = 'top';
      drawWrapped(c, '손가락으로 버튼을 직접 눌러도 되고, 멀리서 가리킨 뒤 엄지·검지를 집어도 됩니다. 운전 중엔 대시보드의 ☰ 메뉴 버튼으로 이 화면을 열 수 있어요.', 56, 770, w - 112, 42, 3);
    }
  }

  drawHelp(c, w, h, p) {
    this.header(c, '조작법');
    this.backBtn(c, w, p);
    const rows = [
      ['핸들', '림(바깥 고리)을 엄지·검지로 집어서(컨트롤러는 그립) 돌리기. 양손 가능'],
      ['가속·브레이크', '오른쪽 레버를 집어서 앞으로 밀면 가속, 몸 쪽으로 당기면 브레이크. 놓으면 중립'],
      ['컨트롤러', '오른 트리거 가속 · 왼 트리거 브레이크 · 왼 스틱 핸들 · 오른 스틱 위/아래 가속/브레이크'],
      ['버튼', '시동·기어(P R N D)·깜빡이·비상등·벨트는 손가락으로 꾹 눌러요'],
      ['자리', '시야가 운전석에 안 맞으면 대시보드 [자리 맞춤]. 앉아서 정면을 보고 누르세요'],
      ['데스크톱', '↑↓←→ 운전 · E 시동 · B 벨트 · 1~4 기어 P R N D · Z/C 깜빡이 · X 비상등 · L 전조등 · M 메뉴'],
    ];
    let y = 190;
    rows.forEach(([k, v]) => {
      c.fillStyle = C.accent;
      c.font = font(36, 800);
      c.textBaseline = 'top';
      c.fillText(k, 56, y);
      c.fillStyle = C.text;
      c.font = font(34, 500);
      y += drawWrapped(c, v, 340, y, w - 400, 46, 2) + 22;
    });
  }

  drawCats(c, w, h, p) {
    this.header(c, '학과 연습 — 분야 선택');
    this.backBtn(c, w, p);
    const bw = (w - 112 - 30) / 2;
    CATEGORIES.forEach((cat, i) => {
      const n = questionsBy(cat.id).length;
      p.button(c, {
        id: `cat-${cat.id}`,
        x: 56 + (i % 2) * (bw + 30),
        y: 190 + Math.floor(i / 2) * 200,
        w: bw,
        h: 176,
        label: `${cat.icon} ${cat.name}`,
        sub: `${n}문제 중 무작위 ${Math.min(10, n)}문제 · 바로 해설`,
        size: 46,
        onClick: () => this.startQuiz('cat', cat.id),
      });
    });
  }

  // -------------------------------------------------------------------------
  startQuiz(kind, cat = null) {
    let pool;
    if (kind === 'mock') pool = shuffle(QUESTIONS).slice(0, 40);
    else if (kind === 'wrong') pool = shuffle(QUESTIONS.filter((q) => this.store.d.wrong.includes(q.id)));
    else pool = shuffle(questionsBy(cat)).slice(0, 10);
    if (!pool.length) {
      this.audio.play('bad');
      return;
    }
    const items = pool.map((q) => ({ ...q, opts: shuffle(q.o.map((t, i) => ({ t, ok: i === q.a }))) }));
    this.quiz = { kind, cat, items, idx: 0, answered: false, chosen: -1, correct: 0, results: [] };
    this.go('quiz');
  }

  answer(i) {
    const q = this.quiz;
    if (q.answered) return;
    q.answered = true;
    q.chosen = i;
    const it = q.items[q.idx];
    const ok = it.opts[i].ok;
    q.results[q.idx] = ok;
    if (ok) q.correct++;
    const wrong = this.store.d.wrong;
    if (!ok && !wrong.includes(it.id)) wrong.push(it.id);
    if (ok && q.kind === 'wrong') this.store.d.wrong = wrong.filter((x) => x !== it.id);
    this.store.save();
    this.audio.play(ok ? 'ok' : 'bad');
    // 모의고사는 해설 없이 바로 다음 문제로
    if (q.kind === 'mock') setTimeout(() => this.next(), 450);
    this.panel.invalidate();
  }

  next() {
    const q = this.quiz;
    if (q.idx < q.items.length - 1) {
      q.idx++;
      q.answered = false;
      q.chosen = -1;
      this.panel.invalidate();
    } else {
      if (q.kind === 'mock') {
        const sc = Math.round((q.correct / q.items.length) * 100);
        if (this.store.d.bestMock === null || sc > this.store.d.bestMock) this.store.d.bestMock = sc;
        this.store.save();
      }
      this.audio.play(q.correct / q.items.length >= 0.6 ? 'fanfare' : 'bad');
      this.go('result');
    }
  }

  drawQuiz(c, w, h, p) {
    const q = this.quiz;
    const it = q.items[q.idx];
    const title = q.kind === 'mock' ? '모의고사' : q.kind === 'wrong' ? '오답노트' : CATEGORIES.find((x) => x.id === q.cat).name;
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = C.accent;
    c.font = font(32, 800);
    c.fillText(`${title} · ${q.idx + 1} / ${q.items.length}`, 56, 40);
    p.button(c, { id: 'quit', x: w - 56 - 200, y: 30, w: 200, h: 80, label: '그만', size: 34, onClick: () => this.go('home') });
    // 진행 막대
    roundRect(c, 56, 92, w - 112 - 220, 12, 6);
    c.fillStyle = 'rgba(255,255,255,0.1)';
    c.fill();
    roundRect(c, 56, 92, (w - 112 - 220) * ((q.idx + (q.answered ? 1 : 0)) / q.items.length), 12, 6);
    c.fillStyle = C.accent;
    c.fill();
    let tx = 56;
    if (it.sign) {
      roundRect(c, 56, 136, 250, 250, 24);
      c.fillStyle = '#f4f6f8';
      c.fill();
      drawSign(c, it.sign, 181, 261, 210);
      tx = 340;
    }
    c.fillStyle = C.text;
    c.font = font(46, 800);
    c.textBaseline = 'top';
    drawWrapped(c, it.q, tx, 140, w - tx - 56, 60, 4);
    const ow = (w - 112 - 30) / 2;
    const oh = 150;
    it.opts.forEach((o, i) => {
      const x = 56 + (i % 2) * (ow + 30);
      const y = 410 + Math.floor(i / 2) * (oh + 22);
      let style = 'default';
      if (q.answered && q.kind !== 'mock') {
        if (o.ok) style = 'ok';
        else if (i === q.chosen) style = 'bad';
        else style = 'dim';
      } else if (q.answered && i === q.chosen) style = 'tab';
      p.button(c, { id: `o${i}`, x, y, w: ow, h: oh, label: `${MARK[i]} ${o.t}`, size: o.t.length > 22 ? 30 : 36, align: 'left', active: style === 'tab', style, onClick: () => this.answer(i) });
    });
    if (q.answered && q.kind !== 'mock') {
      const ok = it.opts[q.chosen].ok;
      const ey = 760;
      roundRect(c, 56, ey, w - 112 - 340, h - ey - 40, 22);
      c.fillStyle = ok ? hexA(C.ok, 0.1) : hexA(C.bad, 0.1);
      c.fill();
      c.fillStyle = ok ? C.ok : C.bad;
      c.font = font(36, 900);
      c.fillText(ok ? '⭕ 정답' : '❌ 오답', 84, ey + 18);
      c.fillStyle = C.text;
      c.font = font(30, 500);
      drawWrapped(c, it.e, 84, ey + 66, w - 112 - 400, 40, 3);
      p.button(c, { id: 'next', x: w - 56 - 310, y: ey + 20, w: 310, h: h - ey - 80, label: q.idx === q.items.length - 1 ? '결과 ▶' : '다음 ▶', style: 'primary', size: 46, onClick: () => this.next() });
    }
  }

  drawResult(c, w, h, p) {
    const q = this.quiz;
    const sc = Math.round((q.correct / q.items.length) * 100);
    this.header(c, q.kind === 'mock' ? '모의고사 결과' : '연습 결과');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const pass2 = sc >= 60;
    const pass1 = sc >= 70;
    c.fillStyle = pass2 ? C.ok : C.bad;
    c.font = font(170, 900);
    c.fillText(`${sc}점`, w / 2, 330);
    c.font = font(40, 700);
    c.fillStyle = C.text;
    c.fillText(`${q.items.length}문제 중 ${q.correct}개 정답`, w / 2, 460);
    if (q.kind === 'mock') {
      c.font = font(38, 800);
      c.fillStyle = pass1 ? C.ok : C.bad;
      c.fillText(`1종 보통(70점) ${pass1 ? '합격' : '불합격'}`, w / 2 - 300, 540);
      c.fillStyle = pass2 ? C.ok : C.bad;
      c.fillText(`2종 보통(60점) ${pass2 ? '합격' : '불합격'}`, w / 2 + 300, 540);
    }
    c.fillStyle = C.muted;
    c.font = font(30, 500);
    c.fillText(`틀린 문제는 오답노트에 저장됐어요 (현재 ${this.store.d.wrong.length}문제)`, w / 2, 610);
    const bw = (w - 112 - 60) / 3;
    p.button(c, { id: 'again', x: 56, y: 680, w: bw, h: 130, label: '🔁 다시', size: 42, onClick: () => this.startQuiz(q.kind, q.cat) });
    p.button(c, { id: 'wrongs', x: 56 + bw + 30, y: 680, w: bw, h: 130, label: '❌ 오답노트', size: 42, onClick: () => this.startQuiz('wrong') });
    p.button(c, { id: 'home', x: 56 + 2 * (bw + 30), y: 680, w: bw, h: 130, label: '처음으로', style: 'primary', size: 42, onClick: () => this.go('home') });
  }

  showSkillResult(res) {
    this.skill = res;
    if (res.pass && (this.store.d.bestSkill === null || res.score > this.store.d.bestSkill)) this.store.d.bestSkill = res.score;
    this.store.save();
    this.go('skillResult');
  }

  drawSkill(c, w, h, p) {
    const r = this.skill;
    this.header(c, '기능시험 결과');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = r.pass ? C.ok : C.bad;
    c.font = font(110, 900);
    c.fillText(r.pass ? `합격 ${r.score}점` : '불합격', w / 2, 250);
    if (!r.pass) {
      c.font = font(36, 700);
      c.fillText(r.reason, w / 2, 340);
    }
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillStyle = C.text;
    c.font = font(32, 700);
    c.fillText(r.log.length ? '감점 내역' : '감점 없음 — 완벽해요! 🎉', 120, 390);
    c.font = font(30, 500);
    r.log.slice(0, 6).forEach((l, i) => {
      c.fillStyle = C.bad;
      c.fillText(`• ${l.reason}${l.points < 100 ? `  −${l.points}` : ''}`, 120, 440 + i * 42);
    });
    const bw = (w - 112 - 30) / 2;
    p.button(c, { id: 'retry', x: 56, y: h - 170, w: bw, h: 120, label: '🔁 다시 도전', style: 'primary', size: 44, onClick: () => this.actions.startSkill() });
    p.button(c, { id: 'home', x: 56 + bw + 30, y: h - 170, w: bw, h: 120, label: '처음으로', size: 44, onClick: () => this.go('home') });
  }
}
