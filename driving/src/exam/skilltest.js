import { shuffle } from '../core/util.js';

/*
 * 장내 기능시험(연습용 채점)
 * ※ 실제 시험의 세부 채점 기준과 다를 수 있습니다. 100점에서 감점, 80점 이상 합격.
 */
const DEVICE_TASKS = [
  { id: 'lights', say: '전조등을 켜세요', check: (v) => v.lights },
  { id: 'wiper', say: '와이퍼를 켜세요', check: (v) => v.wiper },
  { id: 'left', say: '좌측 방향지시등을 켜세요', check: (v) => v.signal === 'left' },
  { id: 'right', say: '우측 방향지시등을 켜세요', check: (v) => v.signal === 'right' },
];

export class Drive {
  /** mode: 'test' | 'free' */
  constructor({ mode, vehicle, course, hud, audio, onEnd }) {
    Object.assign(this, { mode, vehicle, course, hud, audio, onEnd });
    this.score = 100;
    this.log = [];
    this.t = 0;
    this.idx = 0;
    this.sFront = 0;
    this.state = mode === 'test' ? 'engine' : 'free';
    this.lineCool = 0;
    this.onLine = false;
    this.finished = false;
    this.slope = { stopped: false, sStop: 0, timer: 0, rolled: false, noStop: false, late: false };
    this.signal = { phase: 'idle', timer: 0 };
    this.accel = { max: 0, done: false, started: false };
    const [e0, e1] = course.zones.emerg;
    this.emerg = { at: e0 + Math.random() * (e1 - e0), phase: 'wait', t: 0 };
    this.stillT = 0;
    course.light.set('green');
    this.freeLightT = 0;
    if (mode === 'test') {
      this.devices = shuffle(DEVICE_TASKS).slice(0, 3);
      this.devIdx = 0;
      hud.set({ title: '기능시험', score: this.score });
      this.say('기능시험을 시작합니다. 시동을 켜세요');
    } else {
      hud.set({ title: '자유 주행', score: null });
      this.say('자유 주행 — 시동을 켜고 기어를 D 로 놓으세요');
    }
  }

  say(text, speak = true) {
    this.hud.say(text);
    if (speak) this.audio.speak(text);
  }

  deduct(points, reason) {
    if (this.finished) return;
    this.score -= points;
    this.log.push({ points, reason });
    this.hud.flash(`${reason} −${points}`, 'bad');
    this.hud.set({ score: this.score });
    this.audio.play('buzzer');
    if (this.score < 80) this.end(false, '감점 누적으로 80점 미만');
  }

  fail(reason) {
    if (this.finished) return;
    this.log.push({ points: 100, reason: `실격: ${reason}` });
    this.hud.flash(`실격 — ${reason}`, 'bad');
    this.audio.play('buzzer');
    this.end(false, reason);
  }

  end(pass, reason = '') {
    if (this.finished) return;
    this.finished = true;
    this.state = 'done';
    const msg = pass ? `합격! ${this.score}점` : `불합격 (${reason})`;
    this.say(msg);
    this.audio.play(pass ? 'fanfare' : 'bad');
    this.onEnd?.({ pass, score: Math.max(0, this.score), log: this.log, reason });
  }

  /** 계기 조작 이벤트 */
  control() {}

  update(dt) {
    const v = this.vehicle;
    const c = this.course;
    this.t += dt;
    const [fX, fZ] = v.front();
    const pr = c.project(fX, fZ, this.idx);
    this.idx = pr.i;
    this.sFront = pr.s;
    const stopped = Math.abs(v.v) < 0.05;
    this.stillT = stopped ? this.stillT + dt : 0;

    // 노면 판정(선 접촉 / 이탈)
    let line = false;
    let off = false;
    for (const [wx, wz] of v.wheels()) {
      const s = c.surface(wx, wz);
      if (!s.inner) line = true;
      if (!s.road) off = true;
    }
    v.offRoad = off;
    this.lineCool -= dt;
    const moving = Math.abs(v.v) > 0.1;
    if (line && moving && !this.onLine && this.lineCool <= 0) {
      this.onLine = true;
      this.lineCool = 2.5;
      if (this.mode === 'test' && this.state === 'drive') this.deduct(10, '차선(검지선) 접촉');
      else this.hud.flash('선을 밟았어요', 'warn');
      this.audio.play('warn');
    }
    if (!line) this.onLine = false;
    if (off && this.mode === 'test' && this.state === 'drive') this.fail('코스 이탈');

    if (this.mode === 'free') {
      this.freeLight(dt);
      return;
    }
    if (this.finished) return;
    switch (this.state) {
      case 'engine':
        if (v.engine) {
          this.state = 'belt';
          this.say('안전벨트를 매세요');
        }
        break;
      case 'belt':
        if (v.belt) {
          this.state = 'device';
          this.devT = 0;
          this.say(`기기 조작: ${this.devices[0].say}`);
        }
        break;
      case 'device': {
        const task = this.devices[this.devIdx];
        this.devT += dt;
        if (task.check(v)) {
          this.audio.play('ok');
          this.next();
        } else if (this.devT > 8) {
          this.deduct(5, `기기조작 미흡(${task.say.replace('을 켜세요', '').replace('를 켜세요', '')})`);
          this.next();
        }
        break;
      }
      case 'ready':
        if (v.gear === 'D' && v.v > 0.3) {
          if (!v.belt) this.deduct(5, '안전벨트 미착용');
          this.state = 'drive';
          this.say('차로를 지키며 진행하세요');
        }
        break;
      case 'drive':
        this.drive(dt, stopped);
        break;
      default:
        break;
    }
  }

  next() {
    this.devIdx++;
    this.devT = 0;
    if (this.devIdx < this.devices.length) {
      this.say(this.devices[this.devIdx].say);
    } else {
      this.state = 'ready';
      this.say('조작 완료. 방향지시등과 와이퍼를 끄고, 기어를 D 로 놓고 출발하세요');
    }
  }

  drive(dt, stopped) {
    const v = this.vehicle;
    const z = this.course.zones;
    const s = this.sFront;

    // ---- 경사로: 정지 구간에서 정지 → 30초 안에 출발, 1 m 이상 밀리면 감점
    const sl = this.slope;
    if (!sl.announced && s > z.rampStart - 6) {
      sl.announced = true;
      this.say('경사로 — 정지 구간에 멈추세요');
    }
    if (!sl.stopped && !sl.noStop && s >= z.rampStop[0] && s <= z.rampStop[1] && this.stillT > 0.5) {
      sl.stopped = true;
      sl.sStop = s;
      sl.timer = 0;
      this.audio.play('ok');
      this.say('좋아요. 출발하세요 (뒤로 밀리지 않게)');
    }
    if (!sl.stopped && !sl.noStop && s > z.rampStop[1]) {
      sl.noStop = true;
      this.deduct(10, '경사로 정지구간 미정지');
    }
    if (sl.stopped && !sl.passed) {
      sl.timer += dt;
      if (!sl.rolled && sl.sStop - s > 1.0) {
        sl.rolled = true;
        this.deduct(10, '경사로 뒤로 1 m 이상 밀림');
      }
      if (!sl.late && sl.timer > 30) {
        sl.late = true;
        this.deduct(10, '경사로 30초 내 미통과');
      }
      if (s > z.rampStop[1] + 1) sl.passed = true;
    }

    // ---- 직각주행 안내
    const m = this.course.marks;
    if (!this.crankSaid && s > m.crank - 8) {
      this.crankSaid = true;
      this.say('직각주행 — 선을 밟지 않게 천천히');
    }

    // ---- 신호교차로
    const sig = this.signal;
    const light = this.course.light;
    if (sig.phase === 'idle' && s > z.stopLine - 30) {
      sig.phase = 'red';
      sig.timer = 4 + Math.random() * 4;
      light.set('yellow');
      sig.yellow = 1.2;
      this.say('신호교차로 — 신호에 따르세요');
    }
    if (sig.phase === 'red') {
      if (sig.yellow > 0) {
        sig.yellow -= dt;
        if (sig.yellow <= 0) light.set('red');
      } else {
        // 차가 정지선 근처에 오면 대기 시간 차감
        if (s > z.stopLine - 15) sig.timer -= dt;
        if (sig.timer <= 0) {
          sig.phase = 'green';
          light.set('green');
          this.audio.play('ok');
          this.say('출발하세요');
        }
      }
      if (s > z.stopLine + 0.4 && light.state === 'red') this.fail('신호 위반');
    }

    // ---- 가속구간: 구간 안에서 20 km/h 이상
    const ac = this.accel;
    if (!ac.started && s > z.accel[0] - 8) {
      ac.started = true;
      this.say('가속구간 — 시속 20킬로미터 이상으로 가속하세요');
    }
    if (s >= z.accel[0] && s <= z.accel[1]) ac.max = Math.max(ac.max, v.kmh);
    if (!ac.done && s > z.accel[1]) {
      ac.done = true;
      if (ac.max < 20) this.deduct(10, `가속 미흡(최고 ${ac.max.toFixed(0)} km/h)`);
      else this.audio.play('ok');
      this.say('감속하세요');
    }

    // ---- 돌발: 경고음 → 2초 안에 정지 + 비상등 → 비상등 끄고 출발
    const em = this.emerg;
    if (em.phase === 'wait' && s > em.at) {
      em.phase = 'alarm';
      em.t = 0;
      this.audio.play('alarm');
      this.say('돌발! 즉시 정지하고 비상등을 켜세요', false);
    }
    if (em.phase === 'alarm') {
      em.t += dt;
      if (!em.stopped && Math.abs(v.v) < 0.05) em.stopped = true;
      if (!em.stopFail && !em.stopped && em.t > 2.0) {
        em.stopFail = true;
        this.deduct(10, '돌발 시 2초 내 미정지');
      }
      if (!em.hazOk && v.hazard) em.hazOk = true;
      if (!em.hazFail && !em.hazOk && em.t > 4.0) {
        em.hazFail = true;
        this.deduct(10, '돌발 시 비상등 미점등');
      }
      if ((em.stopped || em.stopFail) && (em.hazOk || em.hazFail) && em.t > 3) {
        em.phase = 'resume';
        this.say('비상등을 끄고 출발하세요');
      }
    }
    if (em.phase === 'resume' && !v.hazard && v.v > 0.3) {
      em.phase = 'done';
      this.say('종료 구역에 정지한 뒤 기어를 P 로 놓으세요');
    }

    // ---- 종료
    if (s >= z.finishBox[0] - 0.5 && s <= z.finishBox[1] + 1.5 && stopped && v.gear === 'P') {
      if (em.phase !== 'done' && em.phase !== 'resume') this.deduct(10, '돌발 구간 미수행');
      if (!this.finished) this.end(this.score >= 80);
    }
    if (s > z.finishBox[1] + 6) this.fail('종료 구역 통과');
  }

  /** 자유 주행: 신호등이 스스로 바뀐다 */
  freeLight(dt) {
    this.freeLightT += dt;
    const cyc = this.freeLightT % 22;
    this.course.light.set(cyc < 12 ? 'green' : cyc < 14 ? 'yellow' : 'red');
  }
}
