import * as THREE from 'three';
import { clamp, yawOf } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** 스틱 이동 + 스냅 회전 + 페이드 순간이동. 이동 범위는 원형 홀 안으로 제한 */
export class Locomotion {
  constructor({ rig, camera, audio, radius = 13 }) {
    this.rig = rig;
    this.camera = camera;
    this.audio = audio;
    this.radius = radius;
    this.speed = 2.0;
    this.snapReady = true;
    this.fade = 0;
    this.fadeTarget = 0;
    this.pending = null;
    this.desktop = null;
    this.heightOffset = 0;

    this.fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.fadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), this.fadeMat);
    this.fadeMesh.renderOrder = 1000;
    this.fadeMesh.visible = false;
    this.fadeMesh.raycast = () => {};
    camera.add(this.fadeMesh);
  }

  headPosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }

  headYaw() {
    return yawOf(this.camera.getWorldQuaternion(_q));
  }

  /** 바닥 지점 pos 로 이동. yaw 를 주면 그 방향(0 = -Z)을 바라본다 */
  teleport(pos, yaw = null, instant = false) {
    if (instant) {
      this.apply(pos, yaw);
      return;
    }
    if (this.pending) return;
    this.pending = { pos: pos.clone(), yaw };
    this.fadeTarget = 1;
    this.audio?.play('whoosh');
  }

  apply(pos, yaw) {
    const p = _v2.copy(pos);
    const r = Math.hypot(p.x, p.z);
    if (r > this.radius) p.multiplyScalar(this.radius / r);
    if (this.desktop?.enabled) {
      this.rig.position.set(p.x, 0, p.z);
      this.rig.rotation.y = 0;
      if (yaw !== null) {
        this.desktop.yaw = yaw;
        this.desktop.pitch = -0.08;
      }
      return;
    }
    if (yaw !== null) this.rig.rotation.y = yaw - yawOf(this.camera.quaternion);
    this.rig.updateMatrixWorld(true);
    const off = _v.set(this.camera.position.x, 0, this.camera.position.z).applyAxisAngle(UP, this.rig.rotation.y);
    this.rig.position.set(p.x - off.x, this.heightOffset, p.z - off.z);
    this.rig.updateMatrixWorld(true);
  }

  setHeightOffset(h) {
    this.heightOffset = h;
    if (!this.desktop?.enabled) this.rig.position.y = h;
  }

  snapTurn(angle) {
    const head = this.headPosition(_v2);
    this.rig.position.sub(head).applyAxisAngle(UP, angle).add(head);
    this.rig.rotation.y += angle;
    this.audio?.play('tick');
  }

  update(dt, { move = null, turn = 0, run = false } = {}) {
    const sp = this.fadeTarget > this.fade ? 9 : 6;
    this.fade += clamp(this.fadeTarget - this.fade, -sp * dt, sp * dt);
    this.fadeMat.opacity = this.fade;
    this.fadeMesh.visible = this.fade > 0.01;
    if (this.pending && this.fade >= 0.99) {
      this.apply(this.pending.pos, this.pending.yaw);
      this.pending = null;
      this.fadeTarget = 0;
    }

    if (Math.abs(turn) > 0.7 && this.snapReady) {
      this.snapTurn(turn > 0 ? -Math.PI / 6 : Math.PI / 6);
      this.snapReady = false;
    } else if (Math.abs(turn) < 0.3) {
      this.snapReady = true;
    }

    if (move && move.lengthSq() > 0.03) {
      const yaw = this.headYaw();
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const m = move.length() > 1 ? move.clone().normalize() : move;
      const s = this.speed * (run ? 1.8 : 1) * dt;
      this.rig.position.x += (rx * m.x - fx * m.y) * s;
      this.rig.position.z += (rz * m.x - fz * m.y) * s;
      // 원형 경계
      const head = this.headPosition(_v2);
      const r = Math.hypot(head.x, head.z);
      if (r > this.radius) {
        const k = this.radius / r;
        this.rig.position.x += head.x * k - head.x;
        this.rig.position.z += head.z * k - head.z;
      }
    }
  }
}
