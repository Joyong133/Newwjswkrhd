import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * 손 · 컨트롤러 · 마우스를 하나로 다루는 포인터.
 *  select : 누르기(레이 클릭). 손 = 핀치, 컨트롤러 = 트리거
 *  grab   : 잡기(핸들·레버).   손 = 핀치, 컨트롤러 = 그립
 *  tipPos : 손가락 끝(직접 누르기용). 손 = 검지 끝, 컨트롤러 = 앞쪽 끝
 */
export class Pointer {
  constructor(kind) {
    this.kind = kind; // 'hand' | 'controller' | 'desktop'
    this.handedness = 'none';
    this.active = false;
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3(0, 0, -1);
    this.tipPos = new THREE.Vector3();
    this.grabPos = new THREE.Vector3();
    this.select = false;
    this.justSelect = false;
    this.grab = false;
    this.justGrab = false;
    this.justRelease = false;
    this.trigger = 0;
    this.squeeze = 0;
    this.axes = new THREE.Vector2();
    this.justMenu = false;
    this.claimed = null; // 핸들/레버가 잡고 있으면 UI 는 이 포인터를 무시
    this.pinch = 1; // 엄지-검지 거리(m)
    this.inputSource = null;
    this.hover = null;
  }

  pulse(intensity = 0.3, ms = 25) {
    const gp = this.inputSource?.gamepad;
    try {
      const act = gp?.hapticActuators?.[0];
      if (act?.pulse) act.pulse(intensity, ms);
      else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) { /* 미지원 */ }
  }
}

/** WebXR 컨트롤러 + 핸드 트래킹 */
export class XRInput {
  constructor(renderer, rig) {
    this.rig = rig;
    this.slots = [];
    const cm = new XRControllerModelFactory();
    const hm = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      rig.add(ray, grip, hand);
      grip.add(cm.createControllerModel(grip));
      hand.add(hm.createHandModel(hand, 'mesh'));
      const slot = { ray, grip, hand, source: null, ctrl: new Pointer('controller'), handP: new Pointer('hand'), selEvt: false, selHeld: false, prevMenu: false };
      ray.addEventListener('connected', (e) => {
        slot.source = e.data;
      });
      ray.addEventListener('disconnected', () => {
        slot.source = null;
      });
      // 컨트롤러 트리거의 아주 빠른 클릭도 놓치지 않게
      ray.addEventListener('selectstart', () => {
        slot.selEvt = true;
        slot.selHeld = true;
      });
      ray.addEventListener('selectend', () => {
        slot.selHeld = false;
      });
      this.slots.push(slot);
    }
    this.pointers = [];
  }

  update() {
    this.rig.updateMatrixWorld(true);
    this.pointers = [];
    for (const s of this.slots) {
      const src = s.source;
      const isHand = !!src?.hand;
      const p = isHand ? s.handP : s.ctrl;
      const other = isHand ? s.ctrl : s.handP;
      if (other.active) this.deactivate(other);
      if (!src) {
        this.deactivate(p);
        continue;
      }
      p.active = true;
      p.inputSource = src;
      p.handedness = src.handedness;
      s.ray.matrixWorld.decompose(p.rayOrigin, _q, _s);
      p.rayDir.set(0, 0, -1).applyQuaternion(_q).normalize();
      if (isHand) this.updateHand(s, p);
      else this.updateController(s, p);
      s.selEvt = false;
      this.pointers.push(p);
    }
  }

  deactivate(p) {
    p.justRelease = p.grab;
    p.justSelect = p.justGrab = false;
    p.select = p.grab = false;
    p.pinching = p.fisting = false;
    p.active = false;
    p.claimed = null;
  }

  updateHand(s, p) {
    const j = s.hand.joints;
    const thumb = j['thumb-tip'];
    const index = j['index-finger-tip'];
    if (!thumb || !index || !s.hand.visible) {
      this.deactivate(p);
      return;
    }
    thumb.getWorldPosition(_a);
    index.getWorldPosition(_b);
    p.tipPos.copy(_b);
    p.pinch = _a.distanceTo(_b);
    // 집기(엄지·검지): 2 cm 이하로 붙이면 시작, 4 cm 이상 벌리면 끝
    const wasPinch = p.pinching;
    p.pinching = wasPinch ? p.pinch < 0.04 : p.pinch < 0.02;
    // 주먹 쥐기(중지·약지를 손바닥 쪽으로 말기) — 핸들을 감싸 잡는 자연스러운 동작
    const palm = j['middle-finger-metacarpal'];
    const mid = j['middle-finger-tip'];
    const ring = j['ring-finger-tip'];
    let fist = false;
    if (palm && mid && ring) {
      palm.getWorldPosition(_s);
      const dm = mid.getWorldPosition(new THREE.Vector3()).distanceTo(_s);
      const dr = ring.getWorldPosition(new THREE.Vector3()).distanceTo(_s);
      fist = p.fisting ? Math.max(dm, dr) < 0.085 : Math.max(dm, dr) < 0.065;
    }
    p.fisting = fist;
    if (p.pinching) p.grabPos.copy(_a).add(_b).multiplyScalar(0.5);
    else if (fist) p.grabPos.copy(_s);
    else p.grabPos.copy(_a).add(_b).multiplyScalar(0.5);
    const was = p.grab;
    const now = p.pinching || fist;
    p.justGrab = now && !was;
    p.justRelease = !now && was;
    p.grab = now;
    // UI 누르기는 집기로만
    p.justSelect = p.pinching && !wasPinch;
    p.select = p.pinching;
    p.trigger = p.squeeze = now ? 1 : 0;
    p.axes.set(0, 0);
    p.justMenu = false;
  }

  updateController(s, p) {
    s.grip.matrixWorld.decompose(p.grabPos, _q, _s);
    if (!s.grip.visible) p.grabPos.copy(p.rayOrigin);
    p.tipPos.set(0, -0.01, -0.075).applyQuaternion(_q).add(p.grabPos);
    const gp = s.source.gamepad;
    const trig = gp?.buttons[0]?.value ?? (s.selHeld ? 1 : 0);
    const sq = gp?.buttons[1]?.value ?? 0;
    p.trigger = trig;
    p.squeeze = sq;
    const sel = trig > 0.55 || s.selEvt;
    p.justSelect = sel && !p.select;
    p.select = trig > 0.4 || s.selHeld;
    const was = p.grab;
    const now = was ? sq > 0.35 : sq > 0.6;
    p.justGrab = now && !was;
    p.justRelease = !now && was;
    p.grab = now;
    if (gp) {
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      p.axes.set(ax[0] || 0, ax[1] || 0);
      const menu = !!(gp.buttons[4]?.pressed || gp.buttons[5]?.pressed);
      p.justMenu = menu && !s.prevMenu;
      s.prevMenu = menu;
    }
  }

  get(handedness) {
    return this.pointers.find((p) => p.handedness === handedness);
  }

  get handsMode() {
    return this.pointers.some((p) => p.kind === 'hand');
  }
}

/** 데스크톱: 마우스 시점 + 화면 중앙 조준 + 키보드 운전 */
export class DesktopInput {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pointer = new Pointer('desktop');
    this.pointer.handedness = 'right';
    this.pointers = [this.pointer];
    this.yaw = 0;
    this.pitch = -0.12;
    this.keys = new Set();
    this.enabled = false;
    this.locked = false;
    this.down = false;
    this.pending = false;
    this.prev = false;
    this.onUnlock = null;
    this.onKey = null;
    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.down = true;
        this.pending = true;
      }
    });
    window.addEventListener('mouseup', () => (this.down = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.yaw = Math.max(-2.2, Math.min(2.2, this.yaw - e.movementX * 0.0022));
      this.pitch = Math.max(-1.3, Math.min(1.1, this.pitch - e.movementY * 0.0022));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.onKey?.(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked && this.enabled) this.onUnlock?.();
    });
  }

  lock() {
    try {
      this.dom.requestPointerLock?.()?.catch?.(() => {});
    } catch (e) { /* 미리보기 등 */ }
  }

  enable(on) {
    this.enabled = on;
    this.pointer.active = on;
    if (on) this.lock();
  }

  update() {
    const p = this.pointer;
    const down = this.down || this.pending;
    p.justSelect = down && !this.prev;
    p.select = down;
    this.prev = down;
    this.pending = false;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(p.rayOrigin);
    this.camera.getWorldDirection(p.rayDir);
    p.tipPos.set(0, -1000, 0); // 마우스는 직접 누르기 없음
  }

  /** 키보드 운전 입력 */
  drive() {
    const k = this.keys;
    return {
      accel: k.has('ArrowUp') || k.has('KeyW') ? 1 : 0,
      brake: k.has('ArrowDown') || k.has('KeyS') || k.has('Space') ? 1 : 0,
      steer: (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0) - (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0),
    };
  }
}
