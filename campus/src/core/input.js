import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** 컨트롤러·손·마우스를 하나로 추상화한 포인터 */
export class Pointer {
  constructor(kind) {
    this.kind = kind; // 'xr' | 'desktop'
    this.handedness = 'none';
    this.active = false;
    this.isHand = false;
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3(0, 0, -1);
    this.pressed = false;
    this.justPressed = false;
    this.justReleased = false;
    this.axes = new THREE.Vector2();
    this.justMenu = false;
    this.inputSource = null;
    this.hover = null;
    this.hit = null;
  }

  pulse(intensity = 0.3, ms = 25) {
    const gp = this.inputSource?.gamepad;
    try {
      const act = gp?.hapticActuators?.[0];
      if (act?.pulse) act.pulse(intensity, ms);
      else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) { /* 일부 런타임은 진동 미지원 */ }
  }
}

/** WebXR 컨트롤러 + 핸드 트래킹(엄지·검지 핀치 = 선택) */
export class XRInput {
  constructor(renderer, rig) {
    this.rig = rig;
    this.pointers = [];
    const controllerModels = new XRControllerModelFactory();
    const handModels = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const p = new Pointer('xr');
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      rig.add(ray, grip, hand);
      grip.add(controllerModels.createControllerModel(grip));
      hand.add(handModels.createHandModel(hand, 'mesh'));
      Object.assign(p, { ray, held: false, pending: false, prev: false, prevMenu: false });
      ray.addEventListener('connected', (e) => {
        p.inputSource = e.data;
        p.handedness = e.data.handedness;
        p.isHand = !!e.data.hand;
        p.active = true;
      });
      ray.addEventListener('disconnected', () => {
        p.active = false;
        p.inputSource = null;
        p.held = false;
      });
      const down = () => {
        p.held = true;
        p.pending = true;
      };
      const up = () => {
        p.held = false;
      };
      ray.addEventListener('selectstart', down);
      ray.addEventListener('selectend', up);
      ray.addEventListener('squeezestart', down);
      ray.addEventListener('squeezeend', up);
      this.pointers.push(p);
    }
  }

  update() {
    this.rig.updateMatrixWorld(true);
    for (const p of this.pointers) {
      if (!p.active) {
        p.justPressed = false;
        p.justReleased = p.prev;
        p.pressed = p.prev = false;
        continue;
      }
      // 한 프레임 안에 눌렀다 뗀 빠른 클릭도 pending 으로 잡는다
      const down = p.held || p.pending;
      p.justPressed = down && !p.prev;
      p.justReleased = !down && p.prev;
      p.pressed = down;
      p.prev = down;
      p.pending = false;

      p.ray.matrixWorld.decompose(p.rayOrigin, _q, _s);
      p.rayDir.set(0, 0, -1).applyQuaternion(_q).normalize();

      const gp = p.inputSource?.gamepad;
      if (gp) {
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        p.axes.set(ax[0] || 0, ax[1] || 0);
        // A/X(4) 또는 B/Y(5) → 메뉴
        const menu = !!(gp.buttons[4]?.pressed || gp.buttons[5]?.pressed);
        p.justMenu = menu && !p.prevMenu;
        p.prevMenu = menu;
      } else {
        p.axes.set(0, 0);
        p.justMenu = false;
      }
    }
  }

  get left() {
    return this.pointers.find((p) => p.active && p.handedness === 'left');
  }

  get right() {
    return this.pointers.find((p) => p.active && p.handedness === 'right');
  }
}

/** 데스크톱: 화면 중앙 조준점 + 포인터락 마우스 시점 + WASD */
export class DesktopInput {
  constructor(camera, dom, rig) {
    this.camera = camera;
    this.dom = dom;
    this.rig = rig;
    this.pointer = new Pointer('desktop');
    this.pointer.handedness = 'right';
    this.pointers = [this.pointer];
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.down = false;
    this.pending = false;
    this.prev = false;
    this.enabled = false;
    this.locked = false;
    this.move = new THREE.Vector2();
    this.onUnlock = null;
    this.onKey = null;

    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        this.down = true;
        this.pending = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.down = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * 0.0022));
    });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      this.onKey?.(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked && this.enabled) this.onUnlock?.();
    });
  }

  requestLock() {
    try {
      const r = this.dom.requestPointerLock?.();
      r?.catch?.(() => {});
    } catch (e) { /* 미리보기 iframe 등 */ }
  }

  enable(on) {
    this.enabled = on;
    this.pointer.active = on;
    if (on) this.requestLock();
  }

  update() {
    const p = this.pointer;
    const down = this.down || this.pending;
    p.justPressed = down && !this.prev;
    p.justReleased = !down && this.prev;
    p.pressed = down;
    this.prev = down;
    this.pending = false;

    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(p.rayOrigin);
    this.camera.getWorldDirection(p.rayDir);

    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    this.move.set(x, y);
    this.run = k.has('ShiftLeft') || k.has('ShiftRight');
  }
}
