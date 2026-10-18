import * as THREE from 'three';
import { font, YEAR_COLORS, hexA } from '../core/util.js';

export const HALL_RADIUS = 15;
export const STATION_RADIUS = 9.5;
/** 학년별 스테이션 방향: 1학년 북(−Z), 2학년 동(+X), 3학년 남(+Z), 4학년 서(−X) */
export const YEAR_YAWS = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/** 원형 캠퍼스 홀: 하늘·바닥·벽·중앙 장식·조명 */
export function buildCampus(scene, interact) {
  const root = new THREE.Group();
  root.name = 'campus';
  scene.add(root);

  // 조명
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x1a1f2e, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(4, 10, 6);
  root.add(hemi, sun);

  // 하늘(그라데이션 돔 + 별)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: /* glsl */ `
        varying vec3 vP;
        void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vP;
        void main() {
          float h = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 low = vec3(0.04, 0.06, 0.12);
          vec3 mid = vec3(0.05, 0.08, 0.20);
          vec3 top = vec3(0.01, 0.015, 0.04);
          vec3 c = mix(low, mid, smoothstep(0.35, 0.55, h));
          c = mix(c, top, smoothstep(0.55, 1.0, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.raycast = () => {};
  root.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1400; i++) {
    const v = new THREE.Vector3().randomDirection();
    if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
    v.normalize().multiplyScalar(55);
    sp.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const dot = dotTexture();
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe3ff, size: 0.22, map: dot, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
  stars.raycast = () => {};
  root.add(stars);

  // 바닥
  const floorTex = makeFloorTexture();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(HALL_RADIUS, 96), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  root.add(floor);
  interact.setFloor(floor, (p) => Math.hypot(p.x, p.z) < HALL_RADIUS - 1.6);

  // 원형 벽 + 상단 발광 띠
  const wallTex = makeWallTexture();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(HALL_RADIUS, HALL_RADIUS, 6, 96, 1, true),
    new THREE.MeshStandardMaterial({ map: wallTex, side: THREE.BackSide, roughness: 0.8, metalness: 0.2, emissive: 0xffffff, emissiveMap: wallTex, emissiveIntensity: 0.35 }),
  );
  wall.position.y = 3;
  root.add(wall);
  interact.addBlocker(wall);
  for (const [y, op] of [[0.02, 0.9], [5.95, 0.6]]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(HALL_RADIUS - 0.02, 0.03, 6, 160), new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: op, toneMapped: false }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    root.add(band);
  }

  // 중앙 장식: 떠 있는 칩 + 학년 색 궤도
  const center = new THREE.Group();
  center.position.set(0, 0, -0.6);
  root.add(center);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x141c2e, roughness: 0.4, metalness: 0.6 }));
  plinth.position.y = 0.09;
  center.add(plinth);
  interact.addBlocker(plinth);
  const chip = new THREE.Group();
  chip.position.y = 3.1;
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), new THREE.MeshStandardMaterial({ color: 0x1b2333, roughness: 0.3, metalness: 0.7, map: makeChipTexture() }));
  chip.add(die);
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xd6dbe4, metalness: 0.9, roughness: 0.25 });
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 9; i++) {
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.12), pinMat);
      const off = (i - 4) * 0.09;
      const a = (side * Math.PI) / 2;
      pin.position.set(Math.sin(a) * 0.5 + Math.cos(a) * off, -0.03, Math.cos(a) * 0.5 - Math.sin(a) * off);
      pin.rotation.y = a;
      chip.add(pin);
    }
  }
  center.add(chip);
  const orbits = YEAR_COLORS.map((col, i) => {
    const o = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.22, 0.012, 8, 128), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, toneMapped: false }));
    o.position.y = 3.1;
    o.rotation.set(Math.PI / 2 + (i - 1.5) * 0.35, i * 0.8, 0);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
    bead.position.x = 1.0 + i * 0.22;
    o.add(bead);
    center.add(o);
    return o;
  });
  const coreGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  coreGlow.position.y = 3.1;
  coreGlow.raycast = () => {};
  center.add(coreGlow);
  const lightBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.05, 3, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x38d9ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  lightBeam.position.y = 1.6;
  lightBeam.raycast = () => {};
  center.add(lightBeam);

  // 떠다니는 빛 입자
  const NM = 260;
  const motes = new Float32Array(NM * 3);
  const seeds = [];
  for (let i = 0; i < NM; i++) {
    const r = Math.sqrt(Math.random()) * (HALL_RADIUS - 1);
    const a = Math.random() * Math.PI * 2;
    seeds.push([Math.cos(a) * r, 0.3 + Math.random() * 5, Math.sin(a) * r, Math.random() * 10]);
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const moteMat = new THREE.PointsMaterial({ color: 0x9fe7ff, size: 0.05, map: dot, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
  const motePts = new THREE.Points(moteGeo, moteMat);
  motePts.frustumCulled = false;
  motePts.raycast = () => {};
  root.add(motePts);

  return {
    root,
    floor,
    update(dt, t) {
      chip.rotation.y += dt * 0.25;
      chip.position.y = 3.1 + Math.sin(t * 0.8) * 0.08;
      orbits.forEach((o, i) => (o.rotation.z += dt * (0.25 + i * 0.08) * (i % 2 ? -1 : 1)));
      coreGlow.material.opacity = 0.06 + Math.sin(t * 1.3) * 0.03;
      for (let i = 0; i < NM; i++) {
        const s = seeds[i];
        motes[i * 3] = s[0] + Math.sin(t * 0.2 + s[3]) * 0.4;
        motes[i * 3 + 1] = s[1] + Math.sin(t * 0.3 + s[3] * 2) * 0.25;
        motes[i * 3 + 2] = s[2] + Math.cos(t * 0.17 + s[3]) * 0.4;
      }
      moteGeo.attributes.position.needsUpdate = true;
    },
  };
}

/** 부드러운 원형 점(별·먼지 입자용) */
export function dotTexture() {
  return canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

function canvasTex(w, h, draw, repeat = null) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function makeFloorTexture() {
  return canvasTex(2048, 2048, (c, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const R = w / 2;
    const px = R / HALL_RADIUS; // 1 m 당 픽셀
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, '#16213a');
    g.addColorStop(0.6, '#0d1526');
    g.addColorStop(1, '#070c17');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // 격자(회로 기판 느낌)
    c.strokeStyle = 'rgba(80,130,200,0.08)';
    c.lineWidth = 2;
    for (let x = 0; x < w; x += px) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
      c.beginPath();
      c.moveTo(0, x);
      c.lineTo(w, x);
      c.stroke();
    }
    // 동심원
    for (const [r, a] of [[1.6, 0.4], [3.2, 0.18], [6.4, 0.12], [HALL_RADIUS - 0.3, 0.3]]) {
      c.strokeStyle = `rgba(56,217,255,${a})`;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, r * px, 0, Math.PI * 2);
      c.stroke();
    }
    // 학년별 길(중앙 → 스테이션)
    YEAR_YAWS.forEach((yaw, i) => {
      const col = YEAR_COLORS[i];
      // 월드 (x, z) → 텍스처: 바닥이 −90° 회전되어 있어 텍스처 위쪽 = −Z
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      const p = (r) => [cx + dx * r * px, cy + dz * r * px];
      c.save();
      c.strokeStyle = hexA(col, 0.22);
      c.lineWidth = 0.9 * px;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(...p(2.2));
      c.lineTo(...p(STATION_RADIUS - 2.6));
      c.stroke();
      c.strokeStyle = hexA(col, 0.85);
      c.lineWidth = 6;
      c.setLineDash([px * 0.35, px * 0.25]);
      c.beginPath();
      c.moveTo(...p(2.2));
      c.lineTo(...p(STATION_RADIUS - 2.6));
      c.stroke();
      c.restore();
      // 바닥 글씨
      const [tx, ty] = p(4.2);
      c.save();
      c.translate(tx, ty);
      c.rotate(Math.atan2(dz, dx) + Math.PI / 2);
      c.fillStyle = hexA(col, 0.9);
      c.font = font(0.55 * px, 900);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${i + 1}학년`, 0, 0);
      c.font = font(0.5 * px, 900);
      c.fillText('▲', 0, -0.7 * px);
      c.restore();
    });
    // 중앙 엠블럼
    c.fillStyle = 'rgba(56,217,255,0.08)';
    c.beginPath();
    c.arc(cx, cy - 0.6 * px, 1.3 * px, 0, Math.PI * 2);
    c.fill();
  });
}

function makeWallTexture() {
  return canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = '#0a1020';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#0e1730';
    for (let x = 0; x < w; x += 128) c.fillRect(x + 4, 0, 120, h);
    c.strokeStyle = 'rgba(56,217,255,0.5)';
    c.lineWidth = 3;
    // 회로 트레이스 무늬
    for (let i = 0; i < 26; i++) {
      let x = (i * 97) % w;
      let y = 40 + ((i * 53) % (h - 80));
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (k % 2) y += (k * 17) % 60 - 20;
        else x += 40 + ((i + k) * 13) % 60;
        c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = 'rgba(56,217,255,0.8)';
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
    }
  }, [12, 1]);
}

function makeChipTexture() {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#1b2333';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(56,217,255,0.45)';
    c.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      c.beginPath();
      const y = 40 + i * 24;
      c.moveTo(30, y);
      c.lineTo(150 + ((i * 37) % 120), y);
      c.lineTo(180 + ((i * 37) % 120), y + 20);
      c.stroke();
    }
    c.fillStyle = '#38d9ff';
    c.font = font(64, 900);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('EE', w * 0.68, h * 0.42);
    c.font = font(30, 700);
    c.fillText('VR CAMPUS', w * 0.68, h * 0.56);
  });
}
