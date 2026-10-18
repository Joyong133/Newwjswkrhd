import * as THREE from 'three';

const _v = new THREE.Vector3();

function visibleChain(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * 레이로 가리키고 트리거로 누르는 상호작용.
 * - 패널(캔버스 버튼), 3D 클릭 오브젝트, 바닥(순간이동)
 */
export class Interact {
  constructor({ scene, camera, audio, locomotion }) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.locomotion = locomotion;
    this.targets = []; // { mesh, kind, panel?, onClick?, onHover? }
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 30;
    this.floor = null;
    this.visuals = new Map();

    // 순간이동 표시
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), ringMat);
    dot.rotation.x = -Math.PI / 2;
    this.marker.add(ring, dot);
    this.marker.position.y = 0.01;
    this.marker.visible = false;
    this.marker.traverse((o) => (o.raycast = () => {}));
    scene.add(this.marker);
  }

  addPanel(panel) {
    const t = { mesh: panel.mesh, kind: 'panel', panel };
    this.targets.push(t);
    return () => this.remove(t);
  }

  addClickable(mesh, { onClick, onHover = null } = {}) {
    const t = { mesh, kind: 'mesh', onClick, onHover };
    this.targets.push(t);
    return () => this.remove(t);
  }

  /** 레이를 막기만 하는 표면(벽·받침대 등) */
  addBlocker(mesh) {
    const t = { mesh, kind: 'block' };
    this.targets.push(t);
    return () => this.remove(t);
  }

  setFloor(mesh, canTeleport = () => true) {
    this.floor = { mesh, kind: 'floor', canTeleport };
    this.targets.push(this.floor);
  }

  remove(t) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
  }

  pick(p) {
    this.raycaster.set(p.rayOrigin, p.rayDir);
    const meshes = [];
    for (const t of this.targets) {
      if (visibleChain(t.mesh)) {
        t.mesh.userData._t = t;
        meshes.push(t.mesh);
      }
    }
    const hits = this.raycaster.intersectObjects(meshes, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData._t) o = o.parent;
      if (!o) continue;
      const t = o.userData._t;
      return { t, point: h.point, uv: h.uv, distance: h.distance };
    }
    return null;
  }

  update(pointers, enabled = true) {
    let markerShown = false;
    for (const p of pointers) {
      if (!p.active || !enabled) {
        this.setHover(p, null);
        continue;
      }
      const hit = this.pick(p);
      p.hit = hit;
      let hoverKey = null;
      if (hit?.t.kind === 'panel' && hit.uv) {
        const b = hit.t.panel.hitTest(hit.uv);
        hit.button = b && b.enabled ? b : null;
        if (hit.button) hoverKey = hit.t.panel;
        hit.t.panel.setHover(hit.button?.id ?? null);
      } else if (hit?.t.kind === 'mesh') {
        hoverKey = hit.t;
      }
      this.setHover(p, hoverKey, hit);

      const canTp = hit?.t.kind === 'floor' && hit.distance > 0.5 && this.floor.canTeleport(hit.point);
      if (canTp && !markerShown) {
        this.marker.position.set(hit.point.x, 0.01, hit.point.z);
        markerShown = true;
      }

      if (p.justPressed && hit) {
        if (hit.button) {
          if (hit.t.panel.click(hit.button.id)) {
            this.audio?.play('click');
            p.pulse(0.35, 25);
          }
        } else if (hit.t.kind === 'mesh') {
          hit.t.onClick?.(hit);
          this.audio?.play('click');
          p.pulse(0.35, 25);
        } else if (canTp) {
          this.locomotion.teleport(hit.point);
          p.pulse(0.2, 20);
        }
      }
    }
    this.marker.visible = markerShown;
    if (markerShown) this.marker.rotation.y += 0.02;
  }

  setHover(p, key, hit = null) {
    if (p.hover === key) return;
    const prev = p.hover;
    if (prev) {
      if (prev.setHover) {
        // 다른 포인터가 같은 패널을 가리키고 있지 않을 때만 해제
        prev.setHover(null);
      } else prev.onHover?.(false);
    }
    p.hover = key;
    if (key) {
      if (!key.setHover) key.onHover?.(true);
      this.audio?.play('hover');
      p.pulse(0.08, 8);
    }
    if (!key && hit?.t?.kind === 'panel') hit.t.panel.setHover(null);
  }

  /** 컨트롤러 레이 + 커서 표시 */
  updateVisuals(pointers) {
    for (const p of pointers) {
      if (p.kind !== 'xr') continue;
      let v = this.visuals.get(p);
      if (!v) {
        v = this.makeVisual();
        this.visuals.set(p, v);
      }
      v.line.visible = p.active;
      v.cursor.visible = p.active && !!p.hit;
      if (!p.active) continue;
      const hovering = !!p.hover;
      const color = hovering ? 0x38d9ff : 0xffffff;
      v.lineMat.color.setHex(color);
      v.lineMat.opacity = hovering ? 0.95 : 0.45;
      v.cursorMat.color.setHex(color);
      const len = p.hit ? p.hit.distance : 1.5;
      const pos = v.line.geometry.attributes.position;
      pos.setXYZ(0, p.rayOrigin.x, p.rayOrigin.y, p.rayOrigin.z);
      _v.copy(p.rayOrigin).addScaledVector(p.rayDir, len);
      pos.setXYZ(1, _v.x, _v.y, _v.z);
      pos.needsUpdate = true;
      v.line.geometry.computeBoundingSphere();
      if (p.hit) {
        v.cursor.position.copy(p.rayOrigin).addScaledVector(p.rayDir, len - 0.004);
        v.cursor.lookAt(p.rayOrigin);
        v.cursor.scale.setScalar(Math.max(0.6, Math.min(5, len * 1.1)) * (hovering ? 1.4 : 1));
      }
    }
  }

  makeVisual() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false });
    const line = new THREE.Line(geo, lineMat);
    line.frustumCulled = false;
    line.raycast = () => {};
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
    const cursor = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.005, 0.008, 24), cursorMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 12), cursorMat);
    cursor.add(ring, dot);
    cursor.traverse((o) => {
      o.renderOrder = 50;
      o.raycast = () => {};
    });
    this.scene.add(line, cursor);
    return { line, lineMat, cursor, cursorMat };
  }
}
