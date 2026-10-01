import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XRHandPrimitiveModel } from 'three/addons/webxr/XRHandPrimitiveModel.js';

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** 컨트롤러/손/마우스를 하나로 추상화한 포인터 */
export class Pointer {
  constructor(id, kind) {
    this.id = id;
    this.kind = kind; // 'xr' | 'desktop'
    this.handedness = 'none';
    this.active = false;
    this.isHand = false;
    this.rayOrigin = new THREE.Vector3();
    this.rayDir = new THREE.Vector3(0, 0, -1);
    this.gripPos = new THREE.Vector3();
    this.gripQuat = new THREE.Quaternion();
    this.tipPos = new THREE.Vector3(); // 손가락 끝(포크) 위치
    this.rollUp = new THREE.Vector3(0, 1, 0); // 손목 비틀기 측정용
    this.pressed = false;
    this.justPressed = false;
    this.justReleased = false;
    this.axes = new THREE.Vector2();
    this.buttonA = false;
    this.buttonB = false;
    this.justA = false;
    this.justB = false;
    this.inputSource = null;
    this.held = null;
    this.knob = null;
    this.hover = null;
    this.rayLength = 4;
    this.rayVisible = true;
  }

  pulse(intensity = 0.4, ms = 30) {
    const gp = this.inputSource?.gamepad;
    const act = gp?.hapticActuators?.[0];
    try {
      if (act?.pulse) act.pulse(intensity, ms);
      else gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) { /* 일부 런타임은 미지원 */ }
  }
}

/** WebXR 컨트롤러 + 핸드 트래킹 */
export class XRInput {
  constructor(renderer, rig, scene) {
    this.renderer = renderer;
    this.rig = rig;
    this.scene = scene;
    this.pointers = [];
    const controllerModels = new XRControllerModelFactory();
    const handModels = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const p = new Pointer(i, 'xr');
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      rig.add(ray, grip, hand);
      p.ray = ray;
      p.grip = grip;
      p.hand = hand;
      p.selectHeld = false;
      p.squeezeHeld = false;
      p.pendingPress = false;
      p.prevPressed = false;

      const model = controllerModels.createControllerModel(grip);
      grip.add(model);
      const handModel = handModels.createHandModel(hand, 'mesh');
      hand.add(handModel);
      p.controllerModel = model;
      p.handModel = handModel;
      // 컨트롤러 모델(CDN)을 못 받아오면 보여줄 간단한 대체 모델
      p.fallback = makeFallbackController();
      p.fallback.visible = false;
      grip.add(p.fallback);
      p.connectedAt = 0;

      ray.addEventListener('connected', (e) => {
        p.inputSource = e.data;
        p.handedness = e.data.handedness;
        p.isHand = !!e.data.hand;
        p.active = true;
        p.connectedAt = performance.now();
      });
      ray.addEventListener('disconnected', () => {
        p.active = false;
        p.inputSource = null;
        p.selectHeld = p.squeezeHeld = false;
      });
      const down = (key) => () => {
        p[key] = true;
        p.pendingPress = true;
      };
      const up = (key) => () => {
        p[key] = false;
      };
      ray.addEventListener('selectstart', down('selectHeld'));
      ray.addEventListener('selectend', up('selectHeld'));
      ray.addEventListener('squeezestart', down('squeezeHeld'));
      ray.addEventListener('squeezeend', up('squeezeHeld'));

      this.pointers.push(p);
    }
  }

  update() {
    this.rig.updateMatrixWorld(true);
    for (const p of this.pointers) {
      if (!p.active) {
        p.justPressed = false;
        p.justReleased = p.prevPressed;
        p.pressed = false;
        p.prevPressed = false;
        continue;
      }
      // 버튼 상태(한 프레임 안에 눌렀다 뗀 빠른 클릭도 pendingPress로 잡는다)
      const down = p.selectHeld || p.squeezeHeld || p.pendingPress;
      p.justPressed = down && !p.prevPressed;
      p.justReleased = !down && p.prevPressed;
      p.pressed = down;
      p.prevPressed = down;
      p.pendingPress = false;

      // 레이
      p.ray.matrixWorld.decompose(p.rayOrigin, _q, _s);
      p.rayDir.set(0, 0, -1).applyQuaternion(_q).normalize();

      // 그립(손에 쥐는 위치)
      const hand = p.hand;
      const handTracked = p.isHand && hand.visible && hand.joints?.wrist;
      if (handTracked) {
        const thumb = hand.joints['thumb-tip'];
        const index = hand.joints['index-finger-tip'];
        const wrist = hand.joints.wrist;
        const meta = hand.joints['middle-finger-metacarpal'] || wrist;
        if (thumb && index) {
          const a = thumb.getWorldPosition(new THREE.Vector3());
          const b = index.getWorldPosition(new THREE.Vector3());
          p.gripPos.copy(a).add(b).multiplyScalar(0.5);
          p.tipPos.copy(b);
        } else {
          meta.getWorldPosition(p.gripPos);
          p.tipPos.copy(p.gripPos);
        }
        wrist.getWorldQuaternion(p.gripQuat);
      } else if (p.grip.visible) {
        p.grip.matrixWorld.decompose(p.gripPos, p.gripQuat, _s);
        // 컨트롤러 앞쪽 끝(포크 지점)
        p.tipPos.set(0, -0.01, -0.07).applyQuaternion(p.gripQuat).add(p.gripPos);
      } else {
        p.gripPos.copy(p.rayOrigin);
        p.gripQuat.copy(_q);
        p.tipPos.copy(p.rayOrigin);
      }
      p.rollUp.set(0, 1, 0).applyQuaternion(handTracked ? p.gripQuat : _q);

      // 모델 로딩 실패 대비
      const waited = performance.now() - p.connectedAt > 4000;
      p.fallback.visible = !p.isHand && waited && p.controllerModel.children.length === 0;
      if (p.isHand && waited && p.handModel.children.length === 0 && !p.handFallback && hand.joints?.wrist) {
        p.handFallback = true;
        p.handModel.motionController = new XRHandPrimitiveModel(p.handModel, hand, null, p.handedness, { primitive: 'sphere' });
      }

      // 스틱 / 버튼
      const gp = p.inputSource?.gamepad;
      if (gp) {
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        p.axes.set(ax[0] || 0, ax[1] || 0);
        const a = !!gp.buttons[4]?.pressed;
        const b = !!gp.buttons[5]?.pressed;
        p.justA = a && !p.buttonA;
        p.justB = b && !p.buttonB;
        p.buttonA = a;
        p.buttonB = b;
      } else {
        p.axes.set(0, 0);
        p.justA = p.justB = false;
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

function makeFallbackController() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.1, 16), mat);
  handle.rotation.x = -Math.PI / 2.6;
  handle.position.set(0, -0.02, 0.03);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 24), new THREE.MeshStandardMaterial({ color: 0x38d9ff, roughness: 0.4, emissive: 0x0c3a46 }));
  ring.position.set(0, 0.01, -0.03);
  ring.rotation.x = Math.PI / 3;
  g.add(handle, ring);
  return g;
}

/** 데스크톱: 화면 중앙 조준점 + 포인터락 마우스 시점 */
export class DesktopInput {
  constructor(camera, dom, rig) {
    this.camera = camera;
    this.dom = dom;
    this.rig = rig;
    this.pointer = new Pointer(9, 'desktop');
    this.pointer.handedness = 'right';
    this.pointer.desktop = this;
    this.pointers = [this.pointer];
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.mouseDown = false;
    this.pending = false;
    this.prev = false;
    this.wheel = 0;
    this.mouseDX = 0;
    this.enabled = false;
    this.locked = false;
    this.justRotate = false;
    this.onUnlock = null;

    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        dom.requestPointerLock?.();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.pending = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.mouseDX += e.movementX;
      if (this.freezeLook) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.justRotate = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked && this.enabled) this.onUnlock?.();
    });
  }

  enable(on) {
    this.enabled = on;
    this.pointer.active = on;
    if (on) this.dom.requestPointerLock?.();
  }

  update(dt) {
    const p = this.pointer;
    const down = this.mouseDown || this.pending;
    p.justPressed = down && !this.prev;
    p.justReleased = !down && this.prev;
    p.pressed = down;
    this.prev = down;
    this.pending = false;

    // 시점
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(p.rayOrigin);
    this.camera.getWorldDirection(p.rayDir);
    this.camera.getWorldQuaternion(p.gripQuat);
    p.gripPos.copy(p.rayOrigin).addScaledVector(p.rayDir, 0.45);
    p.tipPos.copy(p.gripPos);
    p.rollUp.set(0, 1, 0).applyQuaternion(p.gripQuat);

    // 이동 축(WASD) → 왼손 스틱처럼 취급
    const x = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const y = (this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('KeyW') ? 1 : 0);
    this.move = new THREE.Vector2(x, y);
    this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  consumeMouseDX() {
    const d = this.mouseDX;
    this.mouseDX = 0;
    return d;
  }

  consumeRotate() {
    const r = this.justRotate;
    this.justRotate = false;
    return r;
  }
}

export { _m, _v };
