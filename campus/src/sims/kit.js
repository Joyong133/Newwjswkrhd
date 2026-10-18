import * as THREE from 'three';

/** 시뮬레이션에서 자주 쓰는 3D 부품 */
export const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...opts });
export const basic = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...opts });
export const glass = (color, opacity = 0.25) =>
  new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.2, metalness: 0, depthWrite: false });

export function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

export function sphere(r, mat, seg = 20) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat);
}

export function cyl(r, h, mat, seg = 20) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
}

/** 매 프레임 갱신 가능한 선분 묶음 */
export class Segments {
  constructor(maxSegments, color = 0xffffff, opacity = 0.8, vertexColors = false) {
    this.max = maxSegments;
    this.positions = new Float32Array(maxSegments * 6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    if (vertexColors) {
      this.colors = new Float32Array(maxSegments * 6);
      this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    }
    this.material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, vertexColors });
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.count = 0;
  }

  begin() {
    this.count = 0;
  }

  add(a, b, color = null) {
    if (this.count >= this.max) return;
    const i = this.count * 6;
    this.positions[i] = a.x;
    this.positions[i + 1] = a.y;
    this.positions[i + 2] = a.z;
    this.positions[i + 3] = b.x;
    this.positions[i + 4] = b.y;
    this.positions[i + 5] = b.z;
    if (color && this.colors) {
      this.colors[i] = this.colors[i + 3] = color.r;
      this.colors[i + 1] = this.colors[i + 4] = color.g;
      this.colors[i + 2] = this.colors[i + 5] = color.b;
    }
    this.count++;
  }

  addXYZ(x1, y1, z1, x2, y2, z2) {
    if (this.count >= this.max) return;
    const i = this.count * 6;
    this.positions.set([x1, y1, z1, x2, y2, z2], i);
    this.count++;
  }

  end() {
    this.geometry.setDrawRange(0, this.count * 2);
    this.geometry.attributes.position.needsUpdate = true;
    if (this.colors) this.geometry.attributes.color.needsUpdate = true;
  }
}

/** 발광 후광(가산 혼합 구) */
export function halo(color, r) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 20, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  m.raycast = () => {};
  return m;
}

/** 피보나치 구 위의 균일한 방향 n 개 */
export function fibonacciDirs(n) {
  const out = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push(new THREE.Vector3(Math.cos(g * i) * r, y, Math.sin(g * i) * r));
  }
  return out;
}
