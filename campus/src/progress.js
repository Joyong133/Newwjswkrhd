/** 학습 진도·퀴즈 성적 저장(브라우저 localStorage, 실패해도 동작) */
const KEY = 'ee-vr-campus-v1';

export const GRADE_POINTS = { 'A+': 4.5, A: 4.0, B: 3.0, C: 2.0, F: 0 };

export function gradeOf(ratio) {
  if (ratio >= 0.999) return 'A+';
  if (ratio >= 0.75) return 'A';
  if (ratio >= 0.5) return 'B';
  if (ratio > 0) return 'C';
  return 'F';
}

export const GRADE_COLORS = { 'A+': '#3ddc97', A: '#38d9ff', B: '#ffb547', C: '#ff9f5d', F: '#ff5d6c' };

export class Progress {
  constructor(curriculum) {
    this.curriculum = curriculum;
    this.data = { subjects: {}, settings: {} };
    this.listeners = [];
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { subjects: {}, settings: {}, ...JSON.parse(raw) };
    } catch (e) { /* 저장소 사용 불가: 메모리만 사용 */ }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) { /* 무시 */ }
    for (const fn of this.listeners) fn();
  }

  on(fn) {
    this.listeners.push(fn);
  }

  subject(id) {
    if (!this.data.subjects[id]) this.data.subjects[id] = { seen: [], best: null, tries: 0, sim: false };
    return this.data.subjects[id];
  }

  markSeen(id, lessonIndex) {
    const s = this.subject(id);
    if (!s.seen.includes(lessonIndex)) {
      s.seen.push(lessonIndex);
      this.save();
    }
  }

  markSim(id) {
    const s = this.subject(id);
    if (!s.sim) {
      s.sim = true;
      this.save();
    }
  }

  recordQuiz(id, correct, total) {
    const s = this.subject(id);
    s.tries++;
    const ratio = correct / total;
    if (s.best === null || ratio > s.best) s.best = ratio;
    this.save();
  }

  /** 과목 성적: 퀴즈를 풀지 않았으면 null */
  grade(id) {
    const s = this.data.subjects[id];
    if (!s || s.best === null) return null;
    return gradeOf(s.best);
  }

  passed(id) {
    const g = this.grade(id);
    return g !== null && g !== 'F' && g !== 'C';
  }

  /** 강의 열람 비율 0..1 */
  lessonRatio(subject) {
    const s = this.data.subjects[subject.id];
    return s ? Math.min(1, s.seen.length / subject.lessons.length) : 0;
  }

  yearStats(year) {
    let passed = 0;
    let pts = 0;
    let graded = 0;
    for (const sub of year.subjects) {
      const g = this.grade(sub.id);
      if (this.passed(sub.id)) passed++;
      if (g) {
        pts += GRADE_POINTS[g];
        graded++;
      }
    }
    return { passed, total: year.subjects.length, gpa: graded ? pts / graded : null };
  }

  overall() {
    let passed = 0;
    let total = 0;
    let pts = 0;
    let graded = 0;
    for (const y of this.curriculum) {
      for (const sub of y.subjects) {
        total++;
        if (this.passed(sub.id)) passed++;
        const g = this.grade(sub.id);
        if (g) {
          pts += GRADE_POINTS[g];
          graded++;
        }
      }
    }
    return { passed, total, gpa: graded ? pts / graded : null, graduated: passed === total };
  }

  setting(key, def) {
    return this.data.settings[key] ?? def;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  reset() {
    this.data = { subjects: {}, settings: this.data.settings };
    this.save();
  }
}
