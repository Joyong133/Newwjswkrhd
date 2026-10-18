import * as THREE from 'three';

const _v = new THREE.Vector3();
const _l = new THREE.Vector3();
const _box = new THREE.Box3();

function visibleChain(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * 손 친화 UI 상호작용
 *  - 패널: 레이 + 집기/트리거로 클릭, 또는 손가락으로 직접 터치(포크)
 *  - 3D 버튼: 손가락으로 누르기, 또는 레이로 클릭
 * 핸들·레버를 잡고 있는 포인터(claimed)는 무시한다.
 */
export class Interact {
  constructor({ scene, audio }) {
    this.scene = scene;
    this.audio = audio;
    this.panels = [];
    this.buttons = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 12;
    this.state = new Map(); // 포인터별 포크 상태
    this.visuals = new Map();
  }

  addPanel(panel) {
    this.panels.push(panel);
  }

  /** mesh 를 누를 수 있는 3D 버튼으로 등록 */
  addButton(mesh, { onPress, onHover = null, cooldown = 0.35 } = {}) {
    const b = { mesh, onPress, onHover, cooldown, cool: 0, inside: new Set(), hovered: 0, enabled: true };
    mesh.userData.button = b;
    this.buttons.push(b);
    return b;
  }

  press(b, p) {
    if (!b.enabled || b.cool > 0) return;
    b.cool = b.cooldown;
    b.onPress?.(p);
    this.audio?.play('click');
    p?.pulse(0.4, 25);
    // 눌림 애니메이션
    b.pressT = 0.15;
  }

  update(pointers, dt) {
    for (const b of this.buttons) {
      b.cool = Math.max(0, b.cool - dt);
      if (b.pressT > 0) {
        b.pressT -= dt;
        b.mesh.scale.setScalar(b.pressT > 0 ? 0.92 : 1);
      }
    }
    for (const p of pointers) {
      let st = this.state.get(p);
      if (!st) {
        st = { prevZ: new Map(), armed: new Map(), near: false, hoverPanel: null, hoverBtn: null };
        this.state.set(p, st);
      }
      if (!p.active || p.claimed) {
        this.clearHover(p, st);
        p.hit = null;
        continue;
      }
      // 1) 손가락 직접 누르기
      st.near = false;
      if (p.kind !== 'desktop') this.poke(p, st);
      // 2) 레이 (손가락이 패널 바로 앞에 있으면 끈다)
      if (st.near) {
        p.hit = null;
        continue;
      }
      const hit = this.pick(p);
      p.hit = hit;
      let hp = null;
      let hb = null;
      if (hit?.panel && hit.uv) {
        const btn = hit.panel.hitTest(hit.uv);
        if (btn?.enabled) {
          hp = hit.panel;
          hp.setHover(btn.id);
          if (p.justSelect && hp.click(btn.id)) {
            this.audio?.play('click');
            p.pulse(0.35, 20);
          }
        }
      } else if (hit?.button) {
        hb = hit.button;
        if (p.justSelect) this.press(hb, p);
      }
      if (st.hoverPanel && st.hoverPanel !== hp) st.hoverPanel.setHover(null);
      if (hb !== st.hoverBtn) {
        st.hoverBtn?.onHover?.(false);
        hb?.onHover?.(true);
        if (hb) this.audio?.play('hover');
      }
      if (hp && hp !== st.hoverPanel) this.audio?.play('hover');
      st.hoverPanel = hp;
      st.hoverBtn = hb;
    }
  }

  clearHover(p, st) {
    st.hoverPanel?.setHover(null);
    st.hoverBtn?.onHover?.(false);
    st.hoverPanel = null;
    st.hoverBtn = null;
  }

  poke(p, st) {
    // 3D 버튼
    for (const b of this.buttons) {
      if (!b.enabled || !visibleChain(b.mesh)) continue;
      b.mesh.updateWorldMatrix(true, false);
      if (!b.mesh.geometry.boundingBox) b.mesh.geometry.computeBoundingBox();
      _box.copy(b.mesh.geometry.boundingBox).applyMatrix4(b.mesh.matrixWorld);
      const inside = _box.clone().expandByScalar(0.006).containsPoint(p.tipPos);
      const near = _box.clone().expandByScalar(0.05).containsPoint(p.tipPos);
      if (near) st.near = true;
      if (inside && !b.inside.has(p)) {
        b.inside.add(p);
        this.press(b, p);
      } else if (!_box.clone().expandByScalar(0.02).containsPoint(p.tipPos)) {
        b.inside.delete(p);
      }
    }
    // 패널
    for (const panel of this.panels) {
      const m = panel.mesh;
      if (!visibleChain(m)) continue;
      m.updateWorldMatrix(true, false);
      _l.copy(p.tipPos);
      m.worldToLocal(_l);
      const inX = Math.abs(_l.x) <= panel.width / 2 + 0.01;
      const inY = Math.abs(_l.y) <= panel.height / 2 + 0.01;
      const z = _l.z;
      const prev = st.prevZ.get(panel) ?? 1;
      st.prevZ.set(panel, z);
      if (!inX || !inY) continue;
      if (z < 0.08 && z > -0.05) {
        st.near = true;
        const uv = { x: _l.x / panel.width + 0.5, y: _l.y / panel.height + 0.5 };
        const btn = panel.hitTest(uv);
        panel.setHover(btn?.enabled ? btn.id : null);
        st.hoverPanel = panel;
        this.showTouchCursor(p, panel, _l, z);
        const armed = st.armed.get(panel) ?? true;
        if (armed && prev > 0.008 && z <= 0.008) {
          st.armed.set(panel, false);
          if (btn?.enabled && panel.click(btn.id)) {
            this.audio?.play('click');
            p.pulse(0.45, 25);
          }
        }
        if (z > 0.03) st.armed.set(panel, true);
      } else {
        st.armed.set(panel, true);
      }
    }
  }

  pick(p) {
    this.raycaster.set(p.rayOrigin, p.rayDir);
    const meshes = [];
    for (const panel of this.panels) if (visibleChain(panel.mesh)) meshes.push(panel.mesh);
    for (const b of this.buttons) if (b.enabled && visibleChain(b.mesh)) meshes.push(b.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    const h = hits[0];
    if (!h) return null;
    return { point: h.point, uv: h.uv, distance: h.distance, panel: h.object.userData.panel || null, button: h.object.userData.button || null };
  }

  // -------------------------------------------------------------------------
  // 레이·커서 표시
  // -------------------------------------------------------------------------
  visual(p) {
    let v = this.visuals.get(p);
    if (v) return v;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false });
    const line = new THREE.Line(geo, lineMat);
    line.frustumCulled = false;
    const curMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
    const cursor = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0065, 24), curMat);
    cursor.renderOrder = 80;
    const touchMat = new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
    const touch = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), touchMat);
    touch.renderOrder = 81;
    for (const o of [line, cursor, touch]) {
      o.raycast = () => {};
      o.visible = false;
      this.scene.add(o);
    }
    v = { line, lineMat, cursor, curMat, touch, touchMat, touchT: 0 };
    this.visuals.set(p, v);
    return v;
  }

  showTouchCursor(p, panel, local, z) {
    const v = this.visual(p);
    v.touchT = 2;
    _v.set(local.x, local.y, 0.002);
    panel.mesh.localToWorld(_v);
    v.touch.position.copy(_v);
    v.touch.quaternion.copy(panel.mesh.getWorldQuaternion(new THREE.Quaternion()));
    const r = 0.006 + Math.max(0, z) * 0.25;
    v.touch.scale.setScalar(r);
    v.touchMat.color.setHex(z < 0.01 ? 0x3ddc97 : 0x38d9ff);
  }

  updateVisuals(pointers) {
    for (const p of pointers) {
      if (p.kind === 'desktop') continue;
      const v = this.visual(p);
      const st = this.state.get(p);
      v.touchT--;
      v.touch.visible = p.active && v.touchT > 0;
      const showRay = p.active && !p.claimed && !st?.near;
      v.line.visible = showRay;
      v.cursor.visible = showRay && !!p.hit;
      if (!showRay) continue;
      const hovering = !!(st?.hoverPanel || st?.hoverBtn);
      const col = hovering ? 0x38d9ff : 0xffffff;
      v.lineMat.color.setHex(col);
      v.lineMat.opacity = hovering ? 0.9 : p.kind === 'hand' ? 0.25 : 0.4;
      v.curMat.color.setHex(col);
      const len = p.hit ? p.hit.distance : 0.6;
      const pos = v.line.geometry.attributes.position;
      pos.setXYZ(0, p.rayOrigin.x, p.rayOrigin.y, p.rayOrigin.z);
      _v.copy(p.rayOrigin).addScaledVector(p.rayDir, len);
      pos.setXYZ(1, _v.x, _v.y, _v.z);
      pos.needsUpdate = true;
      v.line.geometry.computeBoundingSphere();
      if (p.hit) {
        v.cursor.position.copy(p.rayOrigin).addScaledVector(p.rayDir, len - 0.003);
        v.cursor.lookAt(p.rayOrigin);
        v.cursor.scale.setScalar(Math.max(0.6, len * 1.3) * (hovering ? 1.4 : 1));
      }
    }
  }
}
