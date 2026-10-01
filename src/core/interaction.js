import * as THREE from 'three';
import { clamp, damp, easeOutCubic, wrapAngle, yawOf, quatFromYaw } from './util.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s1 = new THREE.Vector3(1, 1, 1);
const _box = new THREE.Box3();
const UP = new THREE.Vector3(0, 1, 0);
const FLIP = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI);

// ---------------------------------------------------------------------------
// 호버 외곽선(인버티드 헐) 머티리얼
// ---------------------------------------------------------------------------
const outlineMaterials = new Map();
function outlineMaterial(color = 0x38d9ff, thickness = 0.0022) {
  const key = `${color}_${thickness}`;
  if (outlineMaterials.has(key)) return outlineMaterials.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uThickness: { value: thickness },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      void main() {
        gl_FragColor = vec4(uColor, 0.75 + 0.25 * sin(uTime * 6.0));
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
  });
  outlineMaterials.set(key, m);
  return m;
}

export function tickOutlines(time) {
  for (const m of outlineMaterials.values()) m.uniforms.uTime.value = time;
}

function meshesOf(obj) {
  const out = [];
  obj.traverse((o) => {
    if (o.isMesh && !o.userData.noCollide) out.push(o);
  });
  return out;
}

function visibleChain(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 상호작용 대상 기본 클래스
// ---------------------------------------------------------------------------
export class Interactable {
  constructor(object, opts = {}) {
    this.object = object;
    this.name = opts.name || object.name || '';
    this.info = opts.info || null;
    this.enabled = true;
    this.colliders = opts.colliders || meshesOf(object);
    this.outlineTargets = opts.outline === false ? [] : opts.outline || this.colliders;
    this.outlineColor = opts.outlineColor || 0x38d9ff;
    this.outlineThickness = opts.outlineThickness || 0.0022;
    this.onHoverChange = opts.onHover || null;
    this.hoverCount = 0;
    this.outlines = null;
    this.center = opts.center || new THREE.Vector3();
    this.grabRadius = opts.grabRadius ?? 0.05;
  }

  worldCenter(target = new THREE.Vector3()) {
    return target.copy(this.center).applyMatrix4(this.object.matrixWorld);
  }

  hoverOn() {
    this.hoverCount++;
    if (this.hoverCount === 1) this.applyHover(true);
  }

  hoverOff() {
    this.hoverCount = Math.max(0, this.hoverCount - 1);
    if (this.hoverCount === 0) this.applyHover(false);
  }

  applyHover(on) {
    if (this.onHoverChange) this.onHoverChange(on);
    if (!this.outlineTargets.length) return;
    if (!this.outlines) {
      const mat = outlineMaterial(this.outlineColor, this.outlineThickness);
      this.outlines = this.outlineTargets.map((mesh) => {
        const o = new THREE.Mesh(mesh.geometry, mat);
        o.userData.noCollide = true;
        o.raycast = () => {};
        o.renderOrder = 2;
        mesh.add(o);
        return o;
      });
    }
    for (const o of this.outlines) o.visible = on;
  }

  getInfo() {
    if (!this.info) return null;
    return typeof this.info === 'function' ? this.info() : this.info;
  }
}

// ---------------------------------------------------------------------------
// 잡을 수 있는 물체
// ---------------------------------------------------------------------------
export class Grabbable extends Interactable {
  constructor(object, opts = {}) {
    super(object, opts);
    this.type = 'grab';
    this.kind = opts.kind || 'item';
    this.state = 'free';
    this.holdOffset = opts.holdOffset || null; // {pos, quat} (그립 기준)
    this.snapToHand = !!opts.snapToHand;
    this.tip = opts.tip || null; // 도구 끝(로컬)
    this.desktopQuat = opts.desktopQuat || new THREE.Quaternion();
    this.restQuat = opts.restQuat || new THREE.Quaternion();
    this.restHeight = opts.restHeight ?? 0;
    this.grabRadius = opts.grabRadius ?? 0.05;
    this.respawnOnFloor = opts.respawnOnFloor ?? true;
    this.homeZone = null;
    this.homePose = null;
    this.zone = null;
    this.holder = null;
    this.velocity = new THREE.Vector3();
    this.history = [];
    this.onGrab = opts.onGrab || null;
    this.onRelease = opts.onRelease || null;
    this.onHeld = opts.onHeld || null;
    this.desktopFlip = false;
    this.offsetFrom = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.offsetTo = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.blend = 1;
    this.floorTimer = 0;
  }

  setHomeZone(zone) {
    this.homeZone = zone;
  }

  setHomePose(parent) {
    this.homePose = { parent, position: this.object.position.clone(), quaternion: this.object.quaternion.clone() };
  }
}

// ---------------------------------------------------------------------------
// 회전 노브(로터리 엔코더): 잡고 손목을 비틀거나, 스틱/휠로 조절
// ---------------------------------------------------------------------------
export class Knob extends Interactable {
  constructor(object, opts = {}) {
    super(object, opts);
    this.type = 'knob';
    this.axis = (opts.axis || new THREE.Vector3(0, 0, 1)).clone().normalize();
    this.detent = opts.detent || THREE.MathUtils.degToRad(18);
    this.spin = opts.spin || object;
    this.onStep = opts.onStep || (() => true);
    this.grabRadius = opts.grabRadius ?? 0.04;
    this.lastAngle = 0;
    this.accum = 0;
    this.stickTimer = 0;
    this.e1 = new THREE.Vector3();
    this.e2 = new THREE.Vector3();
    this.axisW = new THREE.Vector3();
  }

  computeBasis() {
    this.object.updateWorldMatrix(true, false);
    this.object.getWorldQuaternion(_q1);
    this.axisW.copy(this.axis).applyQuaternion(_q1).normalize();
    // 축에 수직인 기준 벡터
    const ref = Math.abs(this.axisW.y) < 0.9 ? UP : _v1.set(1, 0, 0);
    this.e1.copy(ref).addScaledVector(this.axisW, -ref.dot(this.axisW)).normalize();
    this.e2.crossVectors(this.axisW, this.e1);
  }

  measure(p) {
    const u = _v2.copy(p.rollUp).addScaledVector(this.axisW, -p.rollUp.dot(this.axisW));
    if (u.lengthSq() < 0.04) {
      u.set(1, 0, 0).applyQuaternion(p.gripQuat);
      u.addScaledVector(this.axisW, -u.dot(this.axisW));
    }
    return Math.atan2(u.dot(this.e2), u.dot(this.e1));
  }

  begin(p) {
    this.computeBasis();
    this.lastAngle = this.measure(p);
    this.accum = 0;
    this.stickTimer = 0;
  }

  twist(p, dt) {
    const cur = this.measure(p);
    this.accum += wrapAngle(cur - this.lastAngle);
    this.lastAngle = cur;
    // 축(사용자 쪽) 기준 시계방향 = 음의 각도 = 값 증가
    let guard = 0;
    while (this.accum <= -this.detent && guard++ < 10) {
      this.step(+1, p);
      this.accum += this.detent;
    }
    while (this.accum >= this.detent && guard++ < 20) {
      this.step(-1, p);
      this.accum -= this.detent;
    }
    // 스틱 좌우로도 조절
    const x = p.axes.x;
    if (Math.abs(x) > 0.55) {
      this.stickTimer -= dt;
      if (this.stickTimer <= 0) {
        this.step(x > 0 ? 1 : -1, p);
        this.stickTimer = Math.abs(x) > 0.9 ? 0.07 : 0.16;
      }
    } else {
      this.stickTimer = 0;
    }
  }

  step(dir, p) {
    const ok = this.onStep(dir);
    if (ok === false) {
      p?.pulse(0.6, 40);
      return false;
    }
    this.spin.rotateOnAxis(this.axis, -dir * this.detent);
    p?.pulse(0.18, 12);
    this.manager?.audio?.play('tick', this.object, { volume: 0.5, rate: 0.9 + Math.random() * 0.2 });
    return true;
  }
}

// ---------------------------------------------------------------------------
// 버튼 / 스위치
// ---------------------------------------------------------------------------
export class Button extends Interactable {
  constructor(object, opts = {}) {
    super(object, opts);
    this.type = 'button';
    this.onPress = opts.onPress || (() => {});
    this.cap = opts.cap || object;
    this.travel = opts.travel ?? 0.004;
    this.pressAxis = (opts.axis || new THREE.Vector3(0, 0, -1)).clone();
    this.capRest = this.cap.position.clone();
    this.pressT = 0;
    this.cooldown = 0;
    this.poke = opts.poke ?? true;
    this.sound = opts.sound ?? 'click';
    this.pokers = new Set();
  }

  press(p) {
    if (!this.enabled || this.cooldown > 0) return;
    this.cooldown = 0.25;
    this.pressT = 0.14;
    p?.pulse(0.35, 22);
    if (this.sound) this.manager?.audio?.play(this.sound, this.object, { volume: 0.7 });
    this.onPress(p);
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.travel > 0) {
      this.pressT = Math.max(0, this.pressT - dt);
      const k = this.pressT > 0 ? 1 : 0;
      const target = _v1.copy(this.capRest).addScaledVector(this.pressAxis, this.travel * k);
      this.cap.position.lerp(target, 1 - Math.exp(-40 * dt));
    }
  }
}

/** 캔버스 패널 안의 버튼들 */
export class PanelItem extends Interactable {
  constructor(panel, opts = {}) {
    super(panel.mesh, { ...opts, colliders: [panel.mesh], outline: false });
    this.type = 'panel';
    this.panel = panel;
  }
}

// ---------------------------------------------------------------------------
// 스냅 존: 브레드보드 구멍, IC 소켓, 부품함 칸 등
// ---------------------------------------------------------------------------
export class SnapZone {
  constructor({ parent, position, quaternion, accepts, radius = 0.05, allowFlip = true, onSnap, onUnsnap, marker = null, name = 'zone' }) {
    this.anchor = new THREE.Object3D();
    this.anchor.name = name;
    if (position) this.anchor.position.copy(position);
    if (quaternion) this.anchor.quaternion.copy(quaternion);
    parent.add(this.anchor);
    this.accepts = accepts || (() => true);
    this.radius = radius;
    this.allowFlip = allowFlip;
    this.onSnap = onSnap || null;
    this.onUnsnap = onUnsnap || null;
    this.marker = marker;
    this.occupant = null;
    this.flipped = false;
    this.enabled = true;
    this.previewLevel = 0;
    this.name = name;
    if (marker) {
      this.anchor.add(marker);
      marker.visible = false;
    }
  }

  worldPos(target = new THREE.Vector3()) {
    return this.anchor.getWorldPosition(target);
  }

  setPreview(level) {
    // 0: 숨김, 1: 들고 있는 부품이 들어갈 수 있음, 2: 가까이 있음(여기 놓으면 꽂힘)
    if (this.previewLevel === level) return;
    this.previewLevel = level;
    if (!this.marker) return;
    this.marker.visible = level > 0;
    this.marker.traverse((o) => {
      if (o.material) {
        o.material.opacity = level === 2 ? 0.95 : 0.35;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 매니저
// ---------------------------------------------------------------------------
export class InteractionManager {
  constructor({ scene, camera, audio, tooltip }) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.tooltip = tooltip;
    this.items = [];
    this.grabbables = [];
    this.knobs = [];
    this.buttons = [];
    this.zones = [];
    this.colliders = [];
    this.blockers = [];
    this.supports = [];
    this.tweens = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10;
    this.bounds = { minX: -5.8, maxX: 5.8, minZ: -4.3, maxZ: 4.3 };
    this.time = 0;
    this.listeners = { grab: [], release: [] };
  }

  add(item) {
    item.manager = this;
    this.items.push(item);
    if (item.type === 'grab') this.grabbables.push(item);
    if (item.type === 'knob') this.knobs.push(item);
    if (item.type === 'button') this.buttons.push(item);
    for (const c of item.colliders) {
      c.userData.item = item;
      this.colliders.push(c);
    }
    return item;
  }

  addZone(zone) {
    this.zones.push(zone);
    return zone;
  }

  /** 레이를 막는(그리고 데스크톱에서 물체를 올려놓을) 표면 */
  addBlocker(mesh) {
    this.blockers.push(mesh);
  }

  /** 떨어진 물체가 멈추는 수평면 (월드 좌표 사각형) */
  addSupport(minX, maxX, minZ, maxZ, y) {
    this.supports.push({ minX, maxX, minZ, maxZ, y });
  }

  addSupportFromBox(box) {
    this.addSupport(box.min.x, box.max.x, box.min.z, box.max.z, box.max.y);
  }

  on(evt, fn) {
    this.listeners[evt]?.push(fn);
  }

  emit(evt, ...args) {
    for (const fn of this.listeners[evt] || []) fn(...args);
  }

  // -------------------------------------------------------------------------
  update(pointers, dt) {
    this.time += dt;
    tickOutlines(this.time);

    for (const p of pointers) {
      if (!p.active) {
        if (p.held) this.release(p);
        if (p.knob) p.knob = null;
        if (p.hover) {
          p.hover.hoverOff(p);
          p.hover = null;
        }
        continue;
      }
      if (p.held) {
        this.updateHeld(p, dt);
        if (p.justReleased) this.release(p);
        continue;
      }
      if (p.knob) {
        if (p.kind === 'desktop') this.desktopKnob(p);
        else p.knob.twist(p, dt);
        if (p.justReleased || !p.pressed) {
          p.knob.hoverOff(p);
          p.knob = null;
          if (p.kind === 'desktop') p.desktop.freezeLook = false;
        }
        continue;
      }
      const hit = this.pick(p);
      this.setHover(p, hit);
      if (p.kind === 'desktop' && p.hover?.type === 'knob') {
        const w = p.desktop.consumeWheel();
        if (w) p.hover.step(-w, p);
      }
      if (p.justPressed && hit?.item) this.activate(p, hit);
      this.pokeButtons(p);
    }

    for (const b of this.buttons) b.update(dt);
    this.updateTweens(dt);
    this.updatePhysics(dt);
    this.updateZonePreview(pointers);
    this.updateTooltip(pointers, dt);
  }

  pick(p) {
    // 1) 손 근처에 있는 물체 직접 잡기(XR)
    if (p.kind === 'xr') {
      let best = null;
      let bestD = Infinity;
      for (const g of this.grabbables) {
        if (!g.enabled || g.state === 'held' || g.state === 'tween' || !visibleChain(g.object)) continue;
        const d = g.worldCenter(_v1).distanceTo(p.gripPos) - g.grabRadius;
        if (d < 0.035 && d < bestD) {
          best = g;
          bestD = d;
        }
      }
      for (const k of this.knobs) {
        if (!k.enabled || !visibleChain(k.object)) continue;
        const d = k.worldCenter(_v1).distanceTo(p.gripPos) - k.grabRadius;
        if (d < 0.03 && d < bestD) {
          best = k;
          bestD = d;
        }
      }
      if (best) {
        const point = best.worldCenter(new THREE.Vector3());
        p.rayLength = Math.max(0.05, point.distanceTo(p.rayOrigin));
        return { item: best, point, distance: 0, near: true };
      }
    }
    // 2) 레이캐스트
    this.raycaster.set(p.rayOrigin, p.rayDir);
    const hits = this.raycaster.intersectObjects(this.colliders.concat(this.blockers), false);
    for (const h of hits) {
      const item = h.object.userData.item;
      if (!item) {
        p.rayLength = h.distance;
        return { item: null, point: h.point, distance: h.distance };
      }
      if (!item.enabled || item.state === 'held' || item.state === 'tween' || !visibleChain(h.object)) continue;
      p.rayLength = h.distance;
      return { item, point: h.point, distance: h.distance, uv: h.uv, near: false };
    }
    p.rayLength = 3;
    return null;
  }

  setHover(p, hit) {
    const item = hit?.item || null;
    if (p.hover !== item) {
      if (p.hover) {
        p.hover.hoverOff(p);
        if (p.hover.type === 'panel') p.hover.panel.setHover(null);
      }
      if (item) {
        item.hoverOn(p);
        if (item.type !== 'panel') {
          p.pulse(0.08, 8);
          this.audio?.play('hover', null, { volume: 0.25 });
        }
      }
      p.hover = item;
    }
    p.hit = hit;
    if (item?.type === 'panel' && hit.uv) {
      const b = item.panel.hitTest(hit.uv);
      const id = b && b.enabled ? b.id : null;
      if (item.panel.hoverId !== id && id) {
        p.pulse(0.1, 8);
        this.audio?.play('hover', null, { volume: 0.3 });
      }
      item.panel.setHover(id);
    }
  }

  activate(p, hit) {
    const item = hit.item;
    switch (item.type) {
      case 'grab':
        this.grab(p, item, hit.near);
        break;
      case 'knob':
        p.knob = item;
        item.hoverOn(p);
        item.begin(p);
        p.pulse(0.3, 20);
        if (p.kind === 'desktop') {
          p.desktop.freezeLook = true;
          p.desktop.consumeMouseDX();
        }
        break;
      case 'button':
        item.press(p);
        break;
      case 'panel': {
        const b = hit.uv && item.panel.hitTest(hit.uv);
        if (b && item.panel.click(b.id)) {
          p.pulse(0.35, 20);
          this.audio?.play('click', null, { volume: 0.6 });
        }
        break;
      }
      default:
        break;
    }
  }

  pokeButtons(p) {
    if (p.kind !== 'xr' || !p.isHand) return;
    for (const b of this.buttons) {
      if (!b.poke || !b.enabled) continue;
      let inside = false;
      for (const c of b.colliders) {
        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
        _box.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld).expandByScalar(0.006);
        if (_box.containsPoint(p.tipPos)) {
          inside = true;
          break;
        }
      }
      if (inside && !b.pokers.has(p)) {
        b.pokers.add(p);
        b.press(p);
      } else if (!inside) {
        b.pokers.delete(p);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 잡기 / 놓기
  // -------------------------------------------------------------------------
  holderMatrix(p, target = _m1) {
    return target.compose(p.gripPos, p.gripQuat, _s1);
  }

  grab(p, item, near) {
    if (item.holder && item.holder !== p) {
      item.holder.held = null;
    }
    if (item.zone) this.unsnap(item);
    this.tweens = this.tweens.filter((t) => t.item !== item);
    item.state = 'held';
    item.holder = p;
    item.floorTimer = 0;
    p.held = item;
    if (p.hover) {
      p.hover.hoverOff(p);
      p.hover = null;
    }
    this.scene.attach(item.object);
    item.object.updateMatrixWorld(true);
    item.history.length = 0;

    const inv = this.holderMatrix(p, _m1).invert();
    const rel = _m2.multiplyMatrices(inv, item.object.matrixWorld);
    rel.decompose(item.offsetFrom.pos, item.offsetFrom.quat, _v3);
    if (p.kind === 'desktop') {
      item.blend = 0;
    } else if (item.holdOffset && (item.snapToHand || !near)) {
      item.offsetTo.pos.copy(item.holdOffset.pos);
      item.offsetTo.quat.copy(item.holdOffset.quat);
      item.blend = 0;
    } else if (!near) {
      item.offsetTo.quat.copy(item.offsetFrom.quat);
      item.offsetTo.pos.set(0, 0, -0.06).sub(_v1.copy(item.center).applyQuaternion(item.offsetTo.quat));
      item.blend = 0;
    } else {
      item.offsetTo.pos.copy(item.offsetFrom.pos);
      item.offsetTo.quat.copy(item.offsetFrom.quat);
      item.blend = 1;
    }
    p.pulse(0.45, 30);
    this.audio?.play('grab', item.object, { volume: 0.6 });
    item.onGrab?.(p);
    this.emit('grab', item, p);
  }

  updateHeld(p, dt) {
    const item = p.held;
    item.blend = Math.min(1, item.blend + dt / 0.16);
    if (p.kind === 'desktop') {
      this.desktopHold(p, item, dt);
    } else {
      const t = easeOutCubic(item.blend);
      _v1.lerpVectors(item.offsetFrom.pos, item.offsetTo.pos, t);
      _q1.slerpQuaternions(item.offsetFrom.quat, item.offsetTo.quat, t);
      _m2.compose(_v1, _q1, _s1);
      _m2.premultiply(this.holderMatrix(p, _m1));
      _m2.decompose(item.object.position, item.object.quaternion, _v3);
    }
    item.object.updateMatrixWorld(true);
    item.history.push({ pos: item.object.position.clone(), t: this.time });
    if (item.history.length > 8) item.history.shift();
    item.onHeld?.(p, dt);
  }

  desktopHold(p, item, dt) {
    const d = p.desktop;
    if (d.consumeRotate()) item.desktopFlip = !item.desktopFlip;
    this.raycaster.set(p.rayOrigin, p.rayDir);
    const targets = this.blockers.concat(this.colliders.filter((c) => c.userData.item !== item && c.userData.item?.type !== 'panel'));
    const hits = this.raycaster.intersectObjects(targets, false).filter((h) => h.distance > 0.05 && visibleChain(h.object));
    const hit = hits.find((h) => !h.object.userData.item || h.object.userData.item.type !== 'grab' || h.object.userData.item.state === 'snapped');
    const dist = hit ? clamp(hit.distance, 0.22, 1.1) : 0.55;
    const point = _v1.copy(p.rayOrigin).addScaledVector(p.rayDir, dist);
    const targetQuat = _q1;
    const targetPos = _v2;
    if (item.tip) {
      // 도구: 끝이 조준점에 닿도록
      p.desktop.camera.getWorldQuaternion(targetQuat).multiply(item.desktopQuat);
      const tipW = _v3.copy(item.tip).applyQuaternion(targetQuat);
      targetPos.copy(point).sub(tipW);
      if (hit?.face) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        targetPos.addScaledVector(n, 0.002);
      }
    } else {
      const yaw = yawOf(p.gripQuat) + (item.desktopFlip ? Math.PI : 0);
      quatFromYaw(yaw, targetQuat).multiply(item.desktopQuat);
      targetPos.copy(point);
      if (hit) targetPos.y += 0.025;
    }
    const k = item.blend < 1 ? 1 - Math.exp(-18 * dt) : 1 - Math.exp(-30 * dt);
    item.object.position.lerp(targetPos, k);
    item.object.quaternion.slerp(targetQuat, k);
  }

  release(p) {
    const item = p.held;
    p.held = null;
    if (!item) return;
    item.holder = null;
    const zone = this.findZone(item);
    for (const z of this.zones) z.setPreview(0);
    if (zone) {
      this.snapInto(item, zone, true);
    } else {
      item.state = 'falling';
      item.velocity.set(0, 0, 0);
      if (p.kind === 'xr' && item.history.length >= 3) {
        const a = item.history[0];
        const b = item.history[item.history.length - 1];
        const dtH = Math.max(0.016, b.t - a.t);
        item.velocity.subVectors(b.pos, a.pos).divideScalar(dtH);
        if (item.velocity.length() > 5) item.velocity.setLength(5);
      }
    }
    p.pulse(0.25, 20);
    item.onRelease?.(p, zone);
    this.emit('release', item, p, zone);
  }

  findZone(item) {
    let best = null;
    let bestD = Infinity;
    item.object.getWorldPosition(_v1);
    for (const z of this.zones) {
      if (!z.enabled || z.occupant || !z.accepts(item)) continue;
      const d = z.worldPos(_v2).distanceTo(_v1);
      if (d < z.radius && d < bestD) {
        best = z;
        bestD = d;
      }
    }
    return best;
  }

  updateZonePreview(pointers) {
    const heldItems = pointers.filter((p) => p.active && p.held).map((p) => p.held);
    for (const z of this.zones) {
      let level = 0;
      for (const item of heldItems) {
        if (!z.enabled || z.occupant || !z.accepts(item)) continue;
        level = Math.max(level, 1);
        if (this.findZone(item) === z) level = 2;
      }
      z.setPreview(level);
    }
  }

  snapInto(item, zone, animate = true) {
    zone.occupant = item;
    item.zone = zone;
    // 극성/방향: 부품의 X축이 존의 X축과 반대면 뒤집어 꽂는다
    zone.anchor.updateWorldMatrix(true, false);
    zone.anchor.getWorldQuaternion(_q2);
    const itemX = _v1.set(1, 0, 0).applyQuaternion(item.object.getWorldQuaternion(_q1));
    const zoneX = _v2.set(1, 0, 0).applyQuaternion(_q2);
    const flipped = zone.allowFlip && itemX.dot(zoneX) < 0;
    zone.flipped = flipped;
    const localQuat = flipped ? FLIP.clone() : new THREE.Quaternion();
    const finish = () => {
      zone.anchor.attach(item.object);
      item.object.position.set(0, 0, 0);
      item.object.quaternion.copy(localQuat);
      item.state = 'snapped';
      if (animate) this.audio?.play('snap', item.object, { volume: 0.8 });
      zone.onSnap?.(item, flipped);
    };
    if (!animate) {
      finish();
      return;
    }
    const toPos = zone.worldPos(new THREE.Vector3());
    const toQuat = _q2.clone().multiply(localQuat);
    this.tweenTo(item, toPos, toQuat, 0.12, finish);
  }

  unsnap(item) {
    const zone = item.zone;
    if (!zone) return;
    zone.occupant = null;
    item.zone = null;
    zone.onUnsnap?.(item, zone.flipped);
    zone.flipped = false;
  }

  /** 홈 위치로 돌려보내기 */
  sendHome(item, animate = true) {
    if (item.holder) {
      item.holder.held = null;
      item.holder = null;
    }
    if (item.zone) this.unsnap(item);
    if (item.homeZone) {
      if (item.homeZone.occupant && item.homeZone.occupant !== item) {
        // 자리가 찼으면 바로 위에 떨어뜨린다
        this.scene.attach(item.object);
        item.homeZone.worldPos(item.object.position).y += 0.15;
        item.state = 'falling';
        item.velocity.set(0, 0, 0);
        return;
      }
      this.scene.attach(item.object);
      if (animate) this.snapInto(item, item.homeZone, true);
      else this.snapInto(item, item.homeZone, false);
      return;
    }
    if (item.homePose) {
      const { parent, position, quaternion } = item.homePose;
      parent.updateWorldMatrix(true, false);
      const wp = position.clone().applyMatrix4(parent.matrixWorld);
      const wq = parent.getWorldQuaternion(new THREE.Quaternion()).multiply(quaternion);
      const done = () => {
        parent.attach(item.object);
        item.object.position.copy(position);
        item.object.quaternion.copy(quaternion);
        item.state = 'free';
      };
      this.scene.attach(item.object);
      if (animate) this.tweenTo(item, wp, wq, 0.5, done);
      else done();
    }
  }

  tweenTo(item, toPos, toQuat, dur, onDone) {
    this.scene.attach(item.object);
    item.state = 'tween';
    this.tweens = this.tweens.filter((t) => t.item !== item);
    this.tweens.push({
      item,
      fromPos: item.object.position.clone(),
      fromQuat: item.object.quaternion.clone(),
      toPos: toPos.clone(),
      toQuat: toQuat.clone(),
      t: 0,
      dur,
      onDone,
    });
  }

  updateTweens(dt) {
    if (!this.tweens.length) return;
    const done = [];
    for (const tw of this.tweens) {
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = easeOutCubic(tw.t);
      // 멀리서 날아오는 경우 살짝 위로 아치를 그린다
      tw.item.object.position.lerpVectors(tw.fromPos, tw.toPos, k);
      const arc = Math.sin(k * Math.PI) * Math.min(0.15, tw.fromPos.distanceTo(tw.toPos) * 0.3);
      tw.item.object.position.y += arc;
      tw.item.object.quaternion.slerpQuaternions(tw.fromQuat, tw.toQuat, k);
      if (tw.t >= 1) done.push(tw);
    }
    for (const tw of done) {
      this.tweens.splice(this.tweens.indexOf(tw), 1);
      tw.onDone?.();
    }
  }

  // -------------------------------------------------------------------------
  // 놓친 물체의 간단한 낙하 물리
  // -------------------------------------------------------------------------
  supportAt(x, z, maxY) {
    let best = { y: 0, floor: true };
    for (const s of this.supports) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ && s.y <= maxY && s.y > best.y) {
        best = { y: s.y, floor: false };
      }
    }
    return best;
  }

  updatePhysics(dt) {
    for (const g of this.grabbables) {
      if (g.state === 'falling') {
        const o = g.object;
        g.velocity.y -= 9.8 * dt;
        g.velocity.x = damp(g.velocity.x, 0, 0.6, dt);
        g.velocity.z = damp(g.velocity.z, 0, 0.6, dt);
        const prevY = o.position.y;
        o.position.addScaledVector(g.velocity, dt);
        o.position.x = clamp(o.position.x, this.bounds.minX, this.bounds.maxX);
        o.position.z = clamp(o.position.z, this.bounds.minZ, this.bounds.maxZ);
        const sup = this.supportAt(o.position.x, o.position.z, prevY - g.restHeight + 0.02);
        if (o.position.y - g.restHeight <= sup.y) {
          o.position.y = sup.y + g.restHeight;
          g.velocity.set(0, 0, 0);
          g.state = 'resting';
          g.restOnFloor = sup.floor;
          g.floorTimer = 0;
          const yaw = Math.atan2(-_v1.set(1, 0, 0).applyQuaternion(o.quaternion).z, _v1.x);
          const target = quatFromYaw(yaw, new THREE.Quaternion()).multiply(g.restQuat);
          g.restTween = { from: o.quaternion.clone(), to: target, t: 0 };
          this.audio?.play('grab', o, { volume: sup.floor ? 0.9 : 0.5, rate: 0.6 });
        }
      } else if (g.state === 'resting') {
        if (g.restTween) {
          g.restTween.t = Math.min(1, g.restTween.t + dt / 0.18);
          g.object.quaternion.slerpQuaternions(g.restTween.from, g.restTween.to, easeOutCubic(g.restTween.t));
          if (g.restTween.t >= 1) g.restTween = null;
        }
        if (g.restOnFloor && g.respawnOnFloor && (g.homeZone || g.homePose)) {
          g.floorTimer += dt;
          if (g.floorTimer > 1.6) {
            g.floorTimer = 0;
            g.restOnFloor = false;
            this.audio?.play('whoosh', g.object, { volume: 0.4, rate: 1.6 });
            this.sendHome(g, true);
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  updateTooltip(pointers, dt) {
    if (!this.tooltip) return;
    let item = null;
    for (const p of pointers) {
      if (!p.active) continue;
      const cand = p.held || p.knob || p.hover;
      if (cand && cand.info) {
        item = cand;
        if (p.handedness === 'right') break;
      }
    }
    if (item) {
      const info = item.getInfo();
      if (info) {
        const pos = item.worldCenter(_v1);
        pos.y += item.tooltipLift ?? 0.06;
        this.tooltip.show(info.title, info.text || '', pos, this.camera);
      } else this.tooltip.hide();
    } else this.tooltip.hide();
    this.tooltip.update(dt, this.camera);
  }

  desktopKnob(p) {
    const d = p.desktop;
    const w = d.consumeWheel();
    if (w) p.knob.step(-w, p);
    p.knob.dragAccum = (p.knob.dragAccum || 0) + d.consumeMouseDX();
    while (p.knob.dragAccum > 28) {
      p.knob.step(1, p);
      p.knob.dragAccum -= 28;
    }
    while (p.knob.dragAccum < -28) {
      p.knob.step(-1, p);
      p.knob.dragAccum += 28;
    }
  }
}
