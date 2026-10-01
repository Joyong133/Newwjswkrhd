/** 미션 진행 상황 관리 */
export class Missions {
  constructor() {
    this.list = [
      { id: 'led', num: 1, title: 'LED와 옴의 법칙', short: 'LED 회로', where: '왼쪽 실험대', status: 'todo', stats: {} },
      { id: 'scope', num: 2, title: '오실로스코프와 파형', short: '파형 관측', where: '가운데 실험대', status: 'todo', stats: {} },
      { id: 'logic', num: 3, title: '디지털 논리: 반가산기', short: '논리회로', where: '오른쪽 실험대', status: 'todo', stats: {} },
      { id: 'solder', num: 4, title: '555 깜빡이 키트 납땜', short: '납땜', where: '동쪽 벽 납땜 작업대', status: 'todo', stats: {} },
    ];
    this.started = false;
    this.startTime = 0;
    this.endTime = 0;
    this.submitted = false;
    this.mistakes = 0;
    this.listeners = [];
    this.now = () => performance.now() / 1000;
  }

  get(id) {
    return this.list.find((m) => m.id === id);
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners) fn(type, data);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.startTime = this.now();
    this.emit('start');
  }

  /** 다음에 할(권장 순서) 미션 */
  get current() {
    return this.list.find((m) => m.status !== 'done') || null;
  }

  get doneCount() {
    return this.list.filter((m) => m.status === 'done').length;
  }

  get allDone() {
    return this.doneCount === this.list.length;
  }

  touch(id) {
    const m = this.get(id);
    if (m && m.status === 'todo') {
      m.status = 'active';
      m.startedAt = this.now();
      this.emit('change', m);
    }
  }

  complete(id, stats = {}) {
    const m = this.get(id);
    if (!m || m.status === 'done') return false;
    if (!m.startedAt) m.startedAt = this.now();
    m.status = 'done';
    m.doneAt = this.now();
    Object.assign(m.stats, stats);
    this.emit('complete', m);
    this.emit('change', m);
    if (this.allDone) {
      this.endTime = this.now();
      this.emit('allDone');
    }
    return true;
  }

  mistake(id, kind) {
    this.mistakes++;
    const m = this.get(id);
    if (m) {
      m.stats.mistakes = (m.stats.mistakes || 0) + 1;
      m.stats[kind] = (m.stats[kind] || 0) + 1;
    }
    this.emit('mistake', { id, kind });
  }

  elapsed() {
    if (!this.started) return 0;
    return (this.endTime || this.now()) - this.startTime;
  }

  /** 최종 학점 */
  grade() {
    const t = this.elapsed() / 60;
    let score = 100;
    score -= this.mistakes * 4;
    if (t > 12) score -= Math.min(15, (t - 12) * 1.5);
    score = Math.max(55, Math.round(score));
    const table = [[97, 'A+'], [92, 'A0'], [87, 'B+'], [82, 'B0'], [77, 'C+'], [72, 'C0'], [0, 'D+']];
    const g = table.find(([s]) => score >= s)[1];
    return { score, grade: g };
  }

  reset() {
    for (const m of this.list) {
      m.status = 'todo';
      m.stats = {};
      m.startedAt = m.doneAt = 0;
    }
    this.mistakes = 0;
    this.endTime = 0;
    this.submitted = false;
    this.startTime = this.now();
    this.emit('reset');
    this.emit('change');
  }
}
