import * as THREE from 'three';
import { clamp, yawOf } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** 스틱 이동 + 스냅 회전 + 순간이동(페이드) */
export class Locomotion {
  constructor({ rig, camera, audio }) {
    this.rig = rig;
    this.camera = camera;
    this.audio = audio;
    this.obstacles = [];
    this.bounds = { minX: -5.75, maxX: 5.75, minZ: -4.25, maxZ: 4.25 };
    this.radius = 0.2;
    this.speed = 1.5;
    this.snapReady = true;
    this.fadeLevel = 0;
    this.fadeTarget = 0;
    this.pending = null;
    this.desktop = null;
    this.heightOffset = 0; // 앉은 자세 모드: 시점을 올린다

    const fadeGeo = new THREE.SphereGeometry(0.25, 16, 12);
    this.fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.fadeMesh = new THREE.Mesh(fadeGeo, this.fadeMat);
    this.fadeMesh.renderOrder = 1000;
    this.fadeMesh.visible = false;
    this.fadeMesh.raycast = () => {};
    camera.add(this.fadeMesh);
  }

  addObstacle(box) {
    this.obstacles.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  }

  headPosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }

  headYaw() {
    return yawOf(this.camera.getWorldQuaternion(new THREE.Quaternion()));
  }

  /** 바닥 지점 pos 로 이동, yaw 방향을 바라보게 */
  teleport(pos, yaw = null, instant = false) {
    if (instant) {
      this.applyTeleport(pos, yaw);
      return;
    }
    if (this.pending) return;
    this.pending = { pos: pos.clone(), yaw };
    this.fadeTarget = 1;
    this.audio?.play('whoosh', null, { volume: 0.5 });
  }

  applyTeleport(pos, yaw) {
    if (this.desktop?.enabled) {
      this.rig.position.set(pos.x, 0, pos.z);
      if (yaw !== null) {
        this.desktop.yaw = yaw;
        this.desktop.pitch = -0.18;
      }
      return;
    }
    if (yaw !== null) {
      const camYawLocal = yawOf(this.camera.quaternion);
      this.rig.rotation.y = yaw - camYawLocal;
    }
    this.rig.updateMatrixWorld(true);
    const off = _v.set(this.camera.position.x, 0, this.camera.position.z).applyAxisAngle(UP, this.rig.rotation.y);
    this.rig.position.set(pos.x - off.x, this.heightOffset, pos.z - off.z);
    this.rig.updateMatrixWorld(true);
  }

  setSeated(on) {
    this.heightOffset = on ? 0.45 : 0;
    this.rig.position.y = this.desktop?.enabled ? 0 : this.heightOffset;
  }

  snapTurn(angle) {
    const head = this.headPosition(_v2);
    this.rig.position.sub(head).applyAxisAngle(UP, angle).add(head);
    this.rig.rotation.y += angle;
    this.audio?.play('tick', null, { volume: 0.25, rate: 0.6 });
  }

  update(dt, { move, turn, run = false }) {
    // 페이드
    const fadeSpeed = this.fadeTarget > this.fadeLevel ? 9 : 6;
    this.fadeLevel += clamp(this.fadeTarget - this.fadeLevel, -fadeSpeed * dt, fadeSpeed * dt);
    this.fadeMat.opacity = this.fadeLevel;
    this.fadeMesh.visible = this.fadeLevel > 0.01;
    if (this.pending && this.fadeLevel >= 0.99) {
      this.applyTeleport(this.pending.pos, this.pending.yaw);
      this.pending = null;
      this.fadeTarget = 0;
    }

    // 스냅 회전
    if (turn !== undefined && turn !== null) {
      if (Math.abs(turn) > 0.7 && this.snapReady) {
        this.snapTurn(turn > 0 ? -Math.PI / 6 : Math.PI / 6);
        this.snapReady = false;
      } else if (Math.abs(turn) < 0.3) {
        this.snapReady = true;
      }
    }

    // 스틱 이동
    if (move && move.lengthSq() > 0.02) {
      const yaw = this.headYaw();
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const m = move.length() > 1 ? move.clone().normalize() : move;
      const sp = this.speed * (run ? 1.8 : 1);
      const dx = (rx * m.x - fx * m.y) * sp * dt;
      const dz = (rz * m.x - fz * m.y) * sp * dt;
      this.rig.position.x += dx;
      this.rig.position.z += dz;
      this.resolveCollisions();
    }
  }

  resolveCollisions() {
    this.rig.updateMatrixWorld(true);
    const head = this.headPosition(_v2);
    let px = head.x;
    let pz = head.z;
    const r = this.radius;
    for (const o of this.obstacles) {
      if (px > o.minX - r && px < o.maxX + r && pz > o.minZ - r && pz < o.maxZ + r) {
        const pushL = px - (o.minX - r);
        const pushR = o.maxX + r - px;
        const pushB = pz - (o.minZ - r);
        const pushF = o.maxZ + r - pz;
        const min = Math.min(pushL, pushR, pushB, pushF);
        if (min === pushL) px = o.minX - r;
        else if (min === pushR) px = o.maxX + r;
        else if (min === pushB) pz = o.minZ - r;
        else pz = o.maxZ + r;
      }
    }
    px = clamp(px, this.bounds.minX, this.bounds.maxX);
    pz = clamp(pz, this.bounds.minZ, this.bounds.maxZ);
    this.rig.position.x += px - head.x;
    this.rig.position.z += pz - head.z;
  }
}

/** 컨트롤러 레이 + 커서 */
export class PointerVisuals {
  constructor(scene) {
    this.scene = scene;
    this.items = new Map();
    const geo = new THREE.CylinderGeometry(0.0011, 0.0016, 1, 6, 1, true);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -0.5);
    this.rayGeo = geo;
    this.cursorGeo = new THREE.RingGeometry(0.0045, 0.0075, 24);
    this.dotGeo = new THREE.CircleGeometry(0.0025, 16);
  }

  makeFor(p) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uOpacity: { value: 0.6 } },
      vertexShader: /* glsl */ `
        varying float vT;
        void main() {
          vT = -position.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vT;
        void main() {
          float a = smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
          gl_FragColor = vec4(uColor, a * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    });
    const ray = new THREE.Mesh(this.rayGeo, mat);
    ray.raycast = () => {};
    ray.renderOrder = 5;
    ray.frustumCulled = false;
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
    const cursor = new THREE.Group();
    const ring = new THREE.Mesh(this.cursorGeo, cMat);
    const dot = new THREE.Mesh(this.dotGeo, cMat);
    cursor.add(ring, dot);
    cursor.renderOrder = 6;
    ring.renderOrder = dot.renderOrder = 6;
    ring.raycast = dot.raycast = () => {};
    this.scene.add(ray, cursor);
    const v = { ray, cursor, mat, cMat };
    this.items.set(p, v);
    return v;
  }

  update(pointers, camera) {
    const camPos = camera.getWorldPosition(_v);
    for (const p of pointers) {
      if (p.kind !== 'xr') continue;
      const v = this.items.get(p) || this.makeFor(p);
      const show = p.active && !p.held;
      v.ray.visible = show;
      v.cursor.visible = show && !!p.hit;
      if (!show) continue;
      const hovering = !!(p.hover || p.knob);
      const color = hovering ? 0x38d9ff : 0xffffff;
      v.mat.uniforms.uColor.value.setHex(color);
      v.mat.uniforms.uOpacity.value = hovering ? 0.95 : p.isHand ? 0.35 : 0.5;
      v.cMat.color.setHex(color);
      const len = p.knob ? p.knob.worldCenter(_v2).distanceTo(p.rayOrigin) : p.hit ? p.rayLength : 1.2;
      v.ray.position.copy(p.rayOrigin);
      v.ray.lookAt(_v2.copy(p.rayOrigin).add(p.rayDir));
      // lookAt 은 +Z 를 향하므로 레이 지오메트리(-Z)에 맞게 뒤집는다
      v.ray.rotateY(Math.PI);
      v.ray.scale.set(1, 1, Math.max(0.01, len / (p.hit ? 1 : 0.8)));
      if (p.hit) {
        v.cursor.position.copy(p.rayOrigin).addScaledVector(p.rayDir, len - 0.003);
        v.cursor.lookAt(camPos);
        const s = Math.max(0.7, Math.min(4, len * 1.2));
        v.cursor.scale.setScalar(s * (hovering ? 1.4 : 1));
      }
    }
  }
}
