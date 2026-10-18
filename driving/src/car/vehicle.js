import { clamp } from '../core/util.js';

export const WHEELBASE = 2.7;
export const TRACK = 1.56;
export const MAX_WHEEL_DEG = 450; // 핸들 최대 회전(한쪽)
const MAX_ROAD_WHEEL = (35 * Math.PI) / 180;
const G = 9.8;

/**
 * 자동변속 승용차의 단순 운동 모델(자전거 모델)
 *  위치 = 뒷바퀴 축 중심, heading 0 = 북(−Z), 양수 = 좌회전
 */
export class Vehicle {
  constructor() {
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.v = 0; // m/s, 전진 +
    this.steer = 0; // 핸들 각(도), 왼쪽 +
    this.gear = 'P';
    this.engine = false;
    this.belt = false;
    this.signal = 'off'; // off | left | right
    this.hazard = false;
    this.lights = false;
    this.wiper = false;
    this.parkBrake = false;
    this.throttle = 0;
    this.brake = 0;
    this.y = 0;
    this.pitch = 0;
    this.accel = 0;
    this.yawRate = 0;
    this.offRoad = false;
    this.signalPeak = 0;
  }

  get kmh() {
    return Math.abs(this.v) * 3.6;
  }

  get roadWheelAngle() {
    return (clamp(this.steer, -MAX_WHEEL_DEG, MAX_WHEEL_DEG) / MAX_WHEEL_DEG) * MAX_ROAD_WHEEL;
  }

  forward() {
    return [-Math.sin(this.heading), -Math.cos(this.heading)];
  }

  /** 앞바퀴 축 중심 */
  front() {
    const [fx, fz] = this.forward();
    return [this.x + fx * WHEELBASE, this.z + fz * WHEELBASE];
  }

  /** 네 바퀴 위치 [FL, FR, RL, RR] */
  wheels() {
    const [fx, fz] = this.forward();
    const rx = Math.cos(this.heading);
    const rz = -Math.sin(this.heading);
    const h = TRACK / 2;
    const fX = this.x + fx * WHEELBASE;
    const fZ = this.z + fz * WHEELBASE;
    return [
      [fX - rx * h, fZ - rz * h],
      [fX + rx * h, fZ + rz * h],
      [this.x - rx * h, this.z - rz * h],
      [this.x + rx * h, this.z + rz * h],
    ];
  }

  update(dt, course) {
    this.steer = clamp(this.steer, -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
    // 지면 높이와 경사
    const [fX, fZ] = this.front();
    const hr = course.elevation(this.x, this.z);
    const hf = course.elevation(fX, fZ);
    this.y = hr;
    this.pitch = Math.atan2(hf - hr, WHEELBASE);
    const gravity = -G * Math.sin(this.pitch); // 전진 방향 성분

    let a = gravity;
    const v = this.v;
    const dir = this.gear === 'D' ? 1 : this.gear === 'R' ? -1 : 0;
    const vmax = this.gear === 'R' ? 3.2 : 16.7;
    if (this.engine && dir) {
      const vd = v * dir;
      a += dir * this.throttle * 3.2 * clamp(1 - vd / vmax, 0, 1);
      // 크리프: 브레이크를 떼면 천천히 굴러간다
      if (this.throttle < 0.05 && this.brake < 0.05 && vd < 1.6) a += dir * 0.85 * (1 - Math.max(0, vd) / 1.6);
    }
    // 구름 저항 + 공기 저항 + 잔디
    const resist = 0.12 + 0.0006 * v * v + (this.offRoad ? 1.6 : 0);
    // 브레이크(정지 상태에서는 마찰로 붙잡기)
    const brakeA = this.brake * 7.5 + (this.parkBrake ? 6 : 0);
    if (this.gear === 'P') {
      this.v = 0;
      a = 0;
    } else if (Math.abs(v) < 0.05 && brakeA + resist >= Math.abs(a)) {
      this.v = 0;
      a = 0;
    } else {
      const opp = brakeA + resist;
      const sgn = Math.sign(v) || Math.sign(a);
      let nv = v + a * dt;
      // 마찰은 진행 반대 방향, 0 을 넘어가지 않게
      const fr = opp * dt;
      if (Math.abs(nv) <= fr && Math.sign(nv) === sgn) nv = 0;
      else nv -= sgn * fr;
      this.v = nv;
    }
    this.accel = (this.v - v) / dt;

    // 이동
    const delta = this.roadWheelAngle;
    this.yawRate = (this.v * Math.tan(delta)) / WHEELBASE;
    this.heading += this.yawRate * dt;
    const [fx, fz] = this.forward();
    const horiz = this.v * Math.cos(this.pitch);
    this.x += fx * horiz * dt;
    this.z += fz * horiz * dt;

    // 방향지시등 자동 해제(크게 돌렸다가 핸들을 풀면)
    if (this.signal !== 'off') {
      const want = this.signal === 'left' ? 1 : -1;
      if (this.steer * want > 180) this.signalPeak = 1;
      if (this.signalPeak && this.steer * want < 30) {
        this.signal = 'off';
        this.signalPeak = 0;
      }
    } else this.signalPeak = 0;
  }
}
