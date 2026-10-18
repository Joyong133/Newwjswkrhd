import * as THREE from 'three';
import { C, si, makeLabel, makeArrow, setArrow, font, MONO } from '../core/util.js';
import { graphBg, Plot, legend, niceTicks } from './graph.js';
import { std, basic, glass, box, sphere, cyl, Segments, halo } from './kit.js';

// ---------------------------------------------------------------------------
// 전자회로 2: 반전 증폭기(클리핑·대역폭)
// ---------------------------------------------------------------------------
const GAINS = [1, 2, 5, 10, 20, 50];
const VCCS = [5, 12, 15];
const FREQS = [100, 1e3, 10e3, 50e3, 100e3, 500e3];
export const opamp = {
  title: '반전 증폭기 Vout = −(Rf/Rin)·Vin',
  hint: '이득이나 입력 진폭을 키우면 출력이 전원 레일(빨간 점선)에 부딪혀 잘립니다(클리핑). 주파수를 올리면 GBW 한계로 이득이 줄고 위상이 밀려요.',
  params: [
    { id: 'g', label: '이득 Rf/Rin', options: GAINS.map((g) => `${g}`), value: 3 },
    { id: 'vin', label: '입력 진폭', min: 0.1, max: 2, step: 0.1, value: 0.5, fmt: (v) => `${v.toFixed(1)} V` },
    { id: 'vcc', label: '전원 ±Vcc', options: VCCS.map((v) => `±${v} V`), value: 1 },
    { id: 'f', label: '입력 주파수', options: FREQS.map((f) => si(f, 'Hz')), value: 1 },
  ],
  create({ group }) {
    const GBW = 1e6;
    const calc = (P) => {
      const G = GAINS[P.g];
      const f = FREQS[P.f];
      const fc = GBW / (1 + G);
      const A = G / Math.sqrt(1 + (f / fc) ** 2);
      const ph = -Math.atan(f / fc);
      const rail = VCCS[P.vcc] - 1.5;
      return { G, f, fc, A, ph, rail, clip: A * P.vin > rail };
    };
    // 3D: 연산증폭기 삼각형 기호
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, -0.13);
    shape.lineTo(-0.12, 0.13);
    shape.lineTo(0.14, 0);
    shape.closePath();
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006 }), std(0x1d2a44, { emissive: 0x000000 }));
    tri.position.set(0, 0.38, -0.02);
    group.add(tri);
    const lm = makeLabel('−', { size: 0.05 });
    lm.position.set(-0.09, 0.44, 0.03);
    const lp = makeLabel('+', { size: 0.05 });
    lp.position.set(-0.09, 0.32, 0.03);
    group.add(lm, lp);
    const wm = std(0x8899aa);
    const w1 = box(0.12, 0.006, 0.006, wm);
    w1.position.set(-0.18, 0.44, 0);
    const w2 = box(0.12, 0.006, 0.006, wm);
    w2.position.set(-0.18, 0.32, 0);
    const w3 = box(0.12, 0.006, 0.006, wm);
    w3.position.set(0.2, 0.38, 0);
    group.add(w1, w2, w3);
    // 귀환 저항
    const rf = cyl(0.014, 0.1, std(0xe6d3a3), 12);
    rf.rotation.z = Math.PI / 2;
    rf.position.set(0, 0.6, 0);
    const fb = new Segments(4, 0x8899aa, 1);
    fb.begin();
    fb.addXYZ(-0.2, 0.44, 0, -0.2, 0.6, 0);
    fb.addXYZ(-0.2, 0.6, 0, -0.05, 0.6, 0);
    fb.addXYZ(0.05, 0.6, 0, 0.22, 0.6, 0);
    fb.addXYZ(0.22, 0.6, 0, 0.22, 0.38, 0);
    fb.end();
    const lrf = makeLabel('Rf', { size: 0.03, color: '#ffe066' });
    lrf.position.set(0, 0.65, 0);
    group.add(rf, fb.mesh, lrf);
    const out = sphere(0.025, basic(0x3ddc97));
    out.position.set(0.28, 0.38, 0);
    const outGlow = halo(0x3ddc97, 0.06);
    out.add(outGlow);
    group.add(out);
    let t = 0;
    return {
      animated: true,
      onParam(P) {
        const r = calc(P);
        out.material.color.setHex(r.clip ? 0xff5d6c : 0x3ddc97);
        outGlow.material.color.setHex(r.clip ? 0xff5d6c : 0x3ddc97);
        tri.material.emissive.setHex(r.clip ? 0x3a0808 : 0x06281a);
      },
      update(dt) {
        t += dt * 0.25;
        outGlow.material.opacity = 0.25 + 0.2 * Math.sin(t * 20);
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const r = calc(P);
        const ymax = VCCS[P.vcc] + 1;
        const p = new Plot(c, 80, 60, w - 110, h - 130, { xmin: 0, xmax: 2, ymin: -ymax, ymax });
        p.axes({ xticks: [0, 0.5, 1, 1.5, 2], yticks: niceTicks(-ymax, ymax, 6), xfmt: (v) => `${v}T`, xlabel: '시간 (주기 T)', ylabel: 'V', title: `반전 증폭기 · f = ${si(r.f, 'Hz')}` });
        p.hline(r.rail, 'rgba(255,93,108,0.8)');
        p.hline(-r.rail, 'rgba(255,93,108,0.8)');
        const ph0 = t * Math.PI * 2;
        p.fn((x) => P.vin * Math.sin(2 * Math.PI * x + ph0), C.accent, { width: 4 });
        p.fn((x) => Math.max(-r.rail, Math.min(r.rail, -r.A * P.vin * Math.sin(2 * Math.PI * x + ph0 + r.ph))), C.pink, { width: 4.5, glow: true });
        legend(c, 100, h - 32, [[C.accent, 'Vin'], [C.pink, 'Vout'], ['rgba(255,93,108,0.9)', '출력 한계(레일)']]);
      },
      readout(P) {
        const r = calc(P);
        return [
          `|A(f)| = ${r.A.toFixed(2)} (설정 ${r.G}) · 대역폭 f_c ≈ ${si(r.fc, 'Hz')}`,
          r.clip ? `⚠ 클리핑! 출력 ${(r.A * P.vin).toFixed(1)} V > 한계 ${r.rail.toFixed(1)} V` : `출력 진폭 ${(r.A * P.vin).toFixed(2)} V · 위상 ${(180 + (r.ph * 180) / Math.PI).toFixed(0)}°`,
        ];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 전자기학 2: 전자기파(E, B)
// ---------------------------------------------------------------------------
const EMF = [1e9, 2.4e9, 5e9, 10e9, 28e9];
const EM_VIS = [0.6, 0.36, 0.24, 0.16, 0.1];
export const emwave = {
  title: '전자기파의 전파 — E ⟂ B ⟂ k',
  hint: '빨간 E 와 파란 B 가 서로 수직으로 진동하며 흰 화살표 방향으로 나아갑니다. 편파를 "원형"으로 바꾸면 E 가 나선을 그려요.',
  params: [
    { id: 'f', label: '주파수', options: EMF.map((f) => si(f, 'Hz')), value: 1 },
    { id: 'amp', label: '진폭', min: 0.2, max: 1, step: 0.2, value: 0.8, fmt: (v) => v.toFixed(1) },
    { id: 'pol', label: '편파', options: ['선형', '원형'], value: 0 },
  ],
  create({ group }) {
    const N = 64;
    const x0 = -0.33;
    const x1 = 0.33;
    const cy = 0.38;
    const E = new Segments(N * 2, 0xff5d6c, 0.9);
    const B = new Segments(N * 2, 0x4da3ff, 0.9);
    group.add(E.mesh, B.mesh);
    const axis = makeArrow(0xffffff, 0.004);
    setArrow(axis, new THREE.Vector3(x0, cy, 0), new THREE.Vector3(x1 - x0 + 0.05, 0, 0));
    group.add(axis);
    const lk = makeLabel('진행 방향 k', { size: 0.028 });
    lk.position.set(0.3, cy - 0.04, 0);
    const lE = makeLabel('E', { size: 0.045, color: '#ff8a95' });
    lE.position.set(x0 - 0.03, cy + 0.15, 0);
    const lB = makeLabel('B', { size: 0.045, color: '#7fb8ff' });
    lB.position.set(x0 - 0.03, cy, 0.15);
    group.add(lk, lE, lB);
    let ph = 0;
    return {
      update(dt, P) {
        ph += dt * (2 + P.f * 0.6);
        const lam = EM_VIS[P.f];
        const A = 0.15 * P.amp;
        E.begin();
        B.begin();
        let pe = null;
        let pb = null;
        for (let i = 0; i < N; i++) {
          const x = x0 + ((x1 - x0) * i) / (N - 1);
          const arg = (2 * Math.PI * (x - x0)) / lam - ph;
          let ey = Math.cos(arg);
          let ez = P.pol ? Math.sin(arg) : 0;
          // B = k̂ × E / c  → (ey ŷ → ez' ẑ), (ez ẑ → −ŷ)
          const by = -ez;
          const bz = ey;
          ey *= A;
          ez *= A;
          const te = new THREE.Vector3(x, cy + ey, ez);
          const tb = new THREE.Vector3(x, cy + by * A * 0.7, bz * A * 0.7);
          if (i % 2 === 0) {
            E.addXYZ(x, cy, 0, te.x, te.y, te.z);
            B.addXYZ(x, cy, 0, tb.x, tb.y, tb.z);
          }
          if (pe) {
            E.add(pe, te);
            B.add(pb, tb);
          }
          pe = te;
          pb = tb;
        }
        E.end();
        B.end();
      },
      readout(P) {
        const lam = 3e8 / EMF[P.f];
        return [`λ = c / f = ${si(lam, 'm')}`, `반파장 다이폴 길이 ≈ ${si(lam / 2, 'm')}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 반도체소자: PN 접합
// ---------------------------------------------------------------------------
const PNV = [-3, -2, -1, -0.5, 0, 0.3, 0.5, 0.6, 0.65, 0.7];
export const pn = {
  title: 'PN 접합과 공핍 영역',
  hint: '바이어스를 역방향(−)으로 하면 가운데 공핍 영역이 넓어지고, 순방향 0.6 V 이상이면 좁아지며 정공(빨강)과 전자(파랑)가 경계를 넘어 재결합(번쩍!)합니다.',
  params: [{ id: 'v', label: '바이어스 V', options: PNV.map((v) => `${v > 0 ? '+' : ''}${v} V`), value: 4 }],
  create({ group }) {
    const cy = 0.38;
    const Wx = 0.32;
    const pBox = box(Wx, 0.24, 0.16, glass(0xff6b81, 0.18));
    pBox.position.set(-Wx / 2, cy, 0);
    const nBox = box(Wx, 0.24, 0.16, glass(0x4da3ff, 0.18));
    nBox.position.set(Wx / 2, cy, 0);
    const dep = box(1, 0.245, 0.165, glass(0xffffff, 0.12));
    dep.position.set(0, cy, 0);
    group.add(pBox, nBox, dep);
    const lp = makeLabel('p형', { size: 0.04, color: '#ff9aa8' });
    lp.position.set(-0.2, cy + 0.17, 0);
    const ln = makeLabel('n형', { size: 0.04, color: '#9ccaff' });
    ln.position.set(0.2, cy + 0.17, 0);
    const ld = makeLabel('공핍 영역', { size: 0.026, color: '#ffffff' });
    ld.position.set(0, cy - 0.16, 0);
    group.add(lp, ln, ld);
    const eArrow = makeArrow(0xffe066, 0.004);
    group.add(eArrow);
    // 고정 이온(공핍 영역 안)
    const ionGeo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const ionsN = new THREE.InstancedMesh(ionGeo, basic(0x9ccaff), 60);
    const ionsP = new THREE.InstancedMesh(ionGeo, basic(0xff9aa8), 60);
    group.add(ionsN, ionsP);
    const ionPos = [];
    for (let i = 0; i < 60; i++) ionPos.push([Math.random(), cy + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.13]);
    // 이동 캐리어
    const NC = 70;
    const cGeo = new THREE.SphereGeometry(0.009, 8, 6);
    const holes = new THREE.InstancedMesh(cGeo, basic(0xff5d6c), NC);
    const elecs = new THREE.InstancedMesh(cGeo, basic(0x4da3ff), NC);
    group.add(holes, elecs);
    const mk = (side) => {
      const arr = [];
      for (let i = 0; i < NC; i++) arr.push({ x: side * (0.05 + Math.random() * 0.26), y: cy + (Math.random() - 0.5) * 0.2, z: (Math.random() - 0.5) * 0.13, cross: 0 });
      return arr;
    };
    const H = mk(-1);
    const El = mk(1);
    const flashes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 8, 6), basic(0xffffff, { transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 20);
    group.add(flashes);
    const fl = [];
    let W = 0.08;
    let rate = 0;
    let acc = 0;
    const m4 = new THREE.Matrix4();
    const I = (v) => 1e-14 * (Math.exp(v / 0.02585) - 1);
    return {
      onParam(P) {
        const v = PNV[P.v];
        W = 0.08 * Math.sqrt(Math.max(0.02, (0.7 - v) / 0.7));
        W = Math.min(W, 0.3);
        dep.scale.x = W;
        rate = v > 0.4 ? Math.min(40, Math.log10(1 + I(v) * 1e5) * 22) : 0;
        let ni = 0;
        ionPos.forEach(([f, y, z], i) => {
          const x = (W / 2) * f;
          ionsN.setMatrixAt(i, m4.makeTranslation(x, y, z));
          ionsP.setMatrixAt(i, m4.makeTranslation(-x, y, z));
          ni++;
        });
        ionsN.count = ionsP.count = Math.round(ni * Math.min(1, W / 0.12));
        ionsN.instanceMatrix.needsUpdate = ionsP.instanceMatrix.needsUpdate = true;
        setArrow(eArrow, new THREE.Vector3(W / 2, cy + 0.135, 0.085), new THREE.Vector3(-W, 0, 0));
      },
      update(dt) {
        acc += rate * dt;
        const step = (arr, side) => {
          for (const c of arr) {
            if (c.cross) {
              c.x -= side * dt * 0.25;
              if (-side * c.x > 0.02 + Math.random() * 0.15) {
                fl.push({ x: c.x, y: c.y, z: c.z, t: 0.35 });
                c.cross = 0;
                c.x = side * 0.31;
              }
            } else {
              c.x += (Math.random() - 0.5) * dt * 0.25;
              c.y += (Math.random() - 0.5) * dt * 0.25;
              c.z += (Math.random() - 0.5) * dt * 0.25;
              const minX = W / 2 + 0.01;
              if (side * c.x < minX) c.x = side * minX;
              if (side * c.x > 0.31) c.x = side * 0.31;
              c.y = Math.max(cy - 0.11, Math.min(cy + 0.11, c.y));
              c.z = Math.max(-0.07, Math.min(0.07, c.z));
            }
          }
        };
        while (acc >= 1) {
          acc -= 1;
          const arr = Math.random() < 0.5 ? H : El;
          const c = arr[(Math.random() * NC) | 0];
          if (!c.cross) c.cross = 1;
        }
        step(H, -1);
        step(El, 1);
        H.forEach((c, i) => holes.setMatrixAt(i, m4.makeTranslation(c.x, c.y, c.z)));
        El.forEach((c, i) => elecs.setMatrixAt(i, m4.makeTranslation(c.x, c.y, c.z)));
        holes.instanceMatrix.needsUpdate = elecs.instanceMatrix.needsUpdate = true;
        for (let i = fl.length - 1; i >= 0; i--) {
          fl[i].t -= dt;
          if (fl[i].t <= 0) fl.splice(i, 1);
        }
        while (fl.length > 20) fl.shift();
        fl.forEach((f, i) => {
          const s = f.t / 0.35;
          flashes.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(f.x, f.y, f.z));
        });
        flashes.count = fl.length;
        flashes.instanceMatrix.needsUpdate = true;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const v = PNV[P.v];
        const p = new Plot(c, 100, 60, w - 140, h - 130, { xmin: -3.2, xmax: 0.8, ymin: -0.5, ymax: 6 });
        p.axes({ xticks: [-3, -2, -1, 0, 0.7], yticks: [0, 2, 4, 6], xlabel: 'V [V]', ylabel: 'I [mA]', title: 'PN 다이오드 I-V:  I = I_s(e^(V/V_T) − 1)' });
        p.fn((x) => I(x) * 1e3, C.accent, { width: 5, n: 600 });
        p.dot(v, I(v) * 1e3, C.pink, 10);
        p.label(v > 0.4 ? '순방향: 전류 급증' : v < 0 ? '역방향: 전류 ≈ 0' : '평형', v, I(v) * 1e3, C.pink, { dx: v > 0.4 ? -16 : 14, dy: -12, align: v > 0.4 ? 'right' : 'left' });
      },
      readout(P) {
        const v = PNV[P.v];
        const Wr = Math.sqrt(Math.max(0.02, (0.7 - v) / 0.7));
        return [`공핍 폭 W ≈ ${Wr.toFixed(2)} × W₀ (평형 대비)`, `I = ${si(I(v), 'A')}  (${v > 0 ? '순방향' : v < 0 ? '역방향' : '무바이어스'})`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 제어공학: PID 드론 고도 제어
// ---------------------------------------------------------------------------
export const control = {
  title: 'PID 로 드론 고도 맞추기',
  hint: 'Kp 만 쓰면 출렁이고 목표에 못 미칩니다. Kd 로 출렁임을 줄이고, Ki 로 남은 오차를 없애 보세요. 목표: 오버슈트 10% 이하, 정착 시간 3 초 이하!',
  params: [
    { id: 'kp', label: '비례 Kp', min: 0, max: 20, step: 1, value: 5, fmt: (v) => `${v}` },
    { id: 'ki', label: '적분 Ki', min: 0, max: 10, step: 0.5, value: 0, fmt: (v) => v.toFixed(1) },
    { id: 'kd', label: '미분 Kd', min: 0, max: 5, step: 0.25, value: 0, fmt: (v) => v.toFixed(2) },
  ],
  create({ group }) {
    const T = 12;
    let ys = [];
    let metrics = {};
    const simulate = (P) => {
      const dt = 0.002;
      let y = 0;
      let v = 0;
      let integ = 0;
      ys = [];
      let maxY = 0;
      let unstable = false;
      for (let i = 0; i <= T / dt; i++) {
        const e = 1 - y;
        integ += e * dt;
        const u = P.kp * e + P.ki * integ - P.kd * v;
        // 플랜트: y'' + 1.2y' + y = u
        const a = u - 1.2 * v - y;
        v += a * dt;
        y += v * dt;
        if (i % 20 === 0) ys.push(y);
        maxY = Math.max(maxY, y);
        if (Math.abs(y) > 50) {
          unstable = true;
          break;
        }
      }
      const final = ys[ys.length - 1];
      let ts = 0;
      ys.forEach((yy, i) => {
        if (Math.abs(yy - 1) > 0.02) ts = (i + 1) * 0.04;
      });
      metrics = { os: Math.max(0, (maxY - 1) * 100), ts, ess: Math.abs(1 - final), unstable, settled: ts < T - 0.1 };
    };
    // 드론
    const drone = new THREE.Group();
    const body = box(0.08, 0.025, 0.08, std(0x2b2f36));
    drone.add(body);
    const rotors = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
      const arm = box(0.07, 0.008, 0.01, std(0x555c66));
      arm.position.set(sx * 0.04, 0, sz * 0.04);
      arm.rotation.y = sx * sz > 0 ? -Math.PI / 4 : Math.PI / 4;
      const rotor = cyl(0.035, 0.003, basic(0x9fd8ff, { transparent: true, opacity: 0.45 }), 16);
      rotor.position.set(sx * 0.065, 0.012, sz * 0.065);
      drone.add(arm, rotor);
      rotors.push(rotor);
    });
    const led = sphere(0.008, basic(0x3ddc97));
    led.position.set(0, 0, 0.042);
    drone.add(led);
    group.add(drone);
    const goal = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.11, 40), basic(0xffe066, { side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    goal.rotation.x = -Math.PI / 2;
    goal.position.y = 0.48;
    const gl = makeLabel('목표 고도', { size: 0.026, color: '#ffe066' });
    gl.position.set(0.17, 0.5, 0);
    const pad = cyl(0.08, 0.01, std(0x3a4a66), 24);
    pad.position.y = 0.08;
    group.add(goal, gl, pad);
    let tp = 0;
    return {
      animated: true,
      onParam(P) {
        simulate(P);
        tp = 0;
      },
      update(dt) {
        tp += dt * 2;
        if (tp > T + 3) tp = 0;
        const i = Math.min(ys.length - 1, Math.floor(Math.min(tp, T) / 0.04));
        const y = ys[i] ?? 0;
        drone.position.y = Math.max(0.1, Math.min(0.78, 0.1 + y * 0.38));
        drone.rotation.z = Math.sin(tp * 3) * 0.03;
        for (const r of rotors) r.rotation.y += dt * 40;
        led.material.color.setHex(Math.abs(y - 1) < 0.02 ? 0x3ddc97 : 0xffb547);
      },
      draw(c, w, h) {
        graphBg(c, w, h);
        const top = Math.max(1.6, Math.min(3, metrics.os / 100 + 1.2));
        const p = new Plot(c, 80, 60, w - 110, h - 130, { xmin: 0, xmax: T, ymin: 0, ymax: top });
        p.axes({ xticks: niceTicks(0, T, 6), yticks: niceTicks(0, top, 4), xlabel: 't [s]', ylabel: '고도 y', title: '계단 응답 (목표 = 1)' });
        p.poly([[0, 1.02], [T, 1.02]], 'rgba(61,220,151,0.35)', { dash: [4, 6], width: 1.5 });
        p.poly([[0, 0.98], [T, 0.98]], 'rgba(61,220,151,0.35)', { dash: [4, 6], width: 1.5 });
        p.hline(1, '#ffe066');
        p.poly(ys.map((y, i) => [i * 0.04, y]), C.accent, { width: 4.5 });
        const i = Math.min(ys.length - 1, Math.floor(Math.min(tp, T) / 0.04));
        p.dot(i * 0.04, ys[i] ?? 0, C.pink, 9);
        legend(c, 100, h - 32, [[C.accent, '드론 고도'], ['#ffe066', '목표'], ['rgba(61,220,151,0.7)', '±2% 범위']]);
      },
      readout(P) {
        if (metrics.unstable) return ['⚠ 불안정! 응답이 발산합니다', 'Kp 나 Ki 를 낮춰 보세요'];
        const ok = metrics.os <= 10 && metrics.settled && metrics.ts <= 3 && metrics.ess < 0.02;
        return [
          `오버슈트 ${metrics.os.toFixed(1)}% · 정착 ${metrics.settled ? metrics.ts.toFixed(2) + ' s' : '12 s 초과'}`,
          `정상상태 오차 ${(metrics.ess * 100).toFixed(1)}%${ok ? '   ✅ 목표 달성!' : P.ki === 0 && P.kp > 0 ? '   (Ki 로 오차 제거)' : ''}`,
        ];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 통신이론: AM · FM · BPSK
// ---------------------------------------------------------------------------
function besselJ(n, x) {
  const an = Math.abs(n);
  let s = 0;
  let fk = 1;
  for (let k = 0; k < 30; k++) {
    if (k > 0) fk *= k;
    let fkn = 1;
    for (let j = 2; j <= k + an; j++) fkn *= j;
    s += ((k % 2 ? -1 : 1) * Math.pow(x / 2, 2 * k + an)) / (fk * fkn);
  }
  return n < 0 && an % 2 ? -s : s;
}
export const modulation = {
  title: '변조: 메시지를 반송파에 싣기',
  hint: 'AM 은 진폭이, FM 은 주파수(촘촘함)가, BPSK 는 위상이 바뀝니다. 아래 스펙트럼에서 FM 의 변조 지수 β 를 키우면 대역폭이 넓어지는 걸 확인하세요.',
  params: [
    { id: 'mode', label: '방식', options: ['AM', 'FM', 'BPSK'], value: 0 },
    { id: 'k', label: '변조 지수 m/β', min: 0.2, max: 3, step: 0.2, value: 0.8, fmt: (v) => v.toFixed(1) },
    { id: 'fc', label: '반송파 fc/fm', options: ['8', '12', '20'], value: 1 },
  ],
  create() {
    let t = 0;
    const bits = [1, 0, 1, 1, 0, 1, 0, 0];
    return {
      animated: true,
      update(dt) {
        t += dt * 0.15;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const fc = [8, 12, 20][P.fc];
        const k = P.k;
        const msg = (x) => (P.mode === 2 ? (bits[Math.floor(((x + t) * 4) % 8)] ? 1 : -1) : Math.cos(2 * Math.PI * (x + t)));
        const sig = (x) => {
          const tt = x + t;
          if (P.mode === 0) return (1 + k * Math.cos(2 * Math.PI * tt)) * Math.cos(2 * Math.PI * fc * tt);
          if (P.mode === 1) return Math.cos(2 * Math.PI * fc * tt + k * Math.sin(2 * Math.PI * tt));
          return msg(x) * Math.cos(2 * Math.PI * fc * tt);
        };
        const top = new Plot(c, 80, 40, w - 110, 120, { xmin: 0, xmax: 2, ymin: -1.3, ymax: 1.3 });
        top.axes({ title: '메시지 신호 m(t)' + (P.mode === 2 ? ' — 비트열' : '') });
        top.fn(msg, C.accent, { width: 4, n: 800 });
        const amp = P.mode === 0 ? 1 + k : 1;
        const mid = new Plot(c, 80, 205, w - 110, 180, { xmin: 0, xmax: 2, ymin: -amp * 1.1, ymax: amp * 1.1 });
        mid.axes({ title: `변조된 신호 s(t) — ${['AM', 'FM', 'BPSK'][P.mode]}` });
        if (P.mode === 0) {
          mid.fn((x) => 1 + k * Math.cos(2 * Math.PI * (x + t)), 'rgba(255,224,102,0.6)', { width: 2, dash: [6, 6] });
          mid.fn((x) => -(1 + k * Math.cos(2 * Math.PI * (x + t))), 'rgba(255,224,102,0.6)', { width: 2, dash: [6, 6] });
        }
        mid.fn(sig, C.pink, { width: 2.5, n: 1400 });
        const sp = new Plot(c, 80, 440, w - 110, h - 500, { xmin: -10, xmax: 10, ymin: 0, ymax: 1.1 });
        sp.axes({ xticks: [-10, -5, 0, 5, 10], xfmt: (v) => (v === 0 ? 'fc' : `${v > 0 ? '+' : ''}${v}fm`), title: '스펙트럼 (반송파 fc 중심)' });
        const bar = (f, a, col = C.ok) => {
          if (f < -10 || f > 10) return;
          c.fillStyle = col;
          c.fillRect(sp.X(f) - 5, sp.Y(Math.min(1.1, a)), 10, sp.Y(0) - sp.Y(Math.min(1.1, a)));
        };
        if (P.mode === 0) {
          bar(0, 1);
          bar(-1, k / 2);
          bar(1, k / 2);
        } else if (P.mode === 1) {
          for (let n = -10; n <= 10; n++) bar(n, Math.abs(besselJ(n, k)));
        } else {
          sp.fn((f) => {
            const x = (Math.PI * f) / 4;
            return f === 0 ? 1 : Math.pow(Math.sin(x) / x, 2);
          }, C.ok, { width: 3, n: 600 });
        }
      },
      readout(P) {
        if (P.mode === 0) return [`대역폭 = 2·fm`, P.k > 1 ? '⚠ 과변조(m > 1): 포락선이 뒤집혀 왜곡!' : `변조 지수 m = ${P.k.toFixed(1)}`];
        if (P.mode === 1) return [`카슨 대역폭 ≈ 2(β + 1)·fm = ${(2 * (P.k + 1)).toFixed(1)}·fm`, `측파대 개수 ≈ β + 1 = ${Math.round(P.k + 1)}쌍`];
        return ['BPSK: 비트 1 → 0°,  비트 0 → 180°', '주엽 대역폭 = 2 × 비트율'];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 확률: 갈톤 보드(이항 분포 → 정규 분포)
// ---------------------------------------------------------------------------
export const galton = {
  title: '갈톤 보드 — 이항 분포',
  hint: '[공 떨어뜨리기]를 여러 번 눌러 보세요. 공이 많아질수록 막대가 이론 분포(노란 점)에 가까워집니다. p 를 바꾸면 분포가 한쪽으로 기울어요.',
  params: [
    { id: 'rows', label: '핀 줄 수 n', min: 4, max: 12, step: 1, value: 10, fmt: (v) => `${v}줄` },
    { id: 'p', label: '오른쪽 확률 p', min: 0.1, max: 0.9, step: 0.1, value: 0.5, fmt: (v) => v.toFixed(1) },
  ],
  actions: [
    { id: 'clear', label: '🧹 비우기' },
    { id: 'drop', label: '⚪ 공 50개 떨어뜨리기' },
  ],
  create({ group, refresh }) {
    const topY = 0.7;
    const pegH = 0.36;
    const MAXP = 78;
    const pegs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), std(0xb8c4d6, { metalness: 0.6 }), MAXP);
    group.add(pegs);
    const MAXB = 90;
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 10, 8), std(0xffb547, { emissive: 0x3a2000 }), MAXB);
    group.add(balls);
    const binMeshes = [];
    for (let i = 0; i < 13; i++) {
      const m = box(1, 1, 0.03, std(0x38d9ff, { emissive: 0x0b2c38 }));
      group.add(m);
      binMeshes.push(m);
    }
    const back = box(0.66, 0.68, 0.01, std(0x0b1426));
    back.position.set(0, 0.38, -0.03);
    group.add(back);
    let R = 10;
    let dx = 0.04;
    let counts = [];
    let total = 0;
    let queue = 0;
    let spawnT = 0;
    const active = [];
    const m4 = new THREE.Matrix4();
    const pegX = (r, k) => (k - r / 2) * dx;
    const pegY = (r) => topY - (r / Math.max(1, R - 1)) * pegH;
    const layout = (P) => {
      R = P.rows;
      dx = 0.6 / (R + 2);
      let i = 0;
      for (let r = 0; r < R; r++) for (let k = 0; k <= r; k++) pegs.setMatrixAt(i++, m4.makeTranslation(pegX(r, k), pegY(r), 0));
      pegs.count = i;
      pegs.instanceMatrix.needsUpdate = true;
      counts = new Array(R + 1).fill(0);
      total = 0;
      active.length = 0;
      queue = 0;
      updBins();
    };
    const updBins = () => {
      const mx = Math.max(10, ...counts);
      binMeshes.forEach((m, k) => {
        m.visible = k <= R;
        if (!m.visible) return;
        const hgt = Math.max(0.002, (counts[k] / mx) * 0.24);
        m.scale.set(dx * 0.8, hgt, 1);
        m.position.set((k - R / 2) * dx, 0.06 + hgt / 2, 0);
      });
    };
    return {
      animated: true,
      onParam(P, id) {
        if (id === 'rows' || id === undefined) layout(P);
      },
      onAction(id, P) {
        if (id === 'drop') queue += 50;
        else layout(P);
      },
      update(dt, P) {
        spawnT -= dt;
        if (queue > 0 && spawnT <= 0 && active.length < MAXB) {
          spawnT = 0.05;
          queue--;
          const path = [];
          for (let r = 0; r < R; r++) path.push(Math.random() < P.p ? 1 : 0);
          active.push({ s: -0.6, path });
        }
        for (let i = active.length - 1; i >= 0; i--) {
          const b = active[i];
          b.s += dt * 7;
          if (b.s >= R) {
            const k = b.path.reduce((a, v) => a + v, 0);
            counts[k]++;
            total++;
            active.splice(i, 1);
            updBins();
            if (total % 5 === 0 || queue === 0) refresh();
          }
        }
        active.forEach((b, i) => {
          let x;
          let y;
          if (b.s < 0) {
            x = 0;
            y = topY + 0.05 + (-b.s) * 0.05;
          } else {
            const r = Math.floor(b.s);
            const f = b.s - r;
            const k = b.path.slice(0, r).reduce((a, v) => a + v, 0);
            const x0 = pegX(r, k);
            const x1 = (k + b.path[r] - (r + 1) / 2) * dx;
            x = x0 + (x1 - x0) * f;
            const y0 = pegY(r) + 0.014;
            const y1 = r + 1 < R ? pegY(r + 1) + 0.014 : 0.32;
            y = y0 + (y1 - y0) * f * f + Math.sin(f * Math.PI) * 0.012;
          }
          balls.setMatrixAt(i, m4.makeTranslation(x, y, 0.004));
        });
        balls.count = active.length;
        balls.instanceMatrix.needsUpdate = true;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const n = P.rows;
        const pmf = [];
        let comb = 1;
        for (let k = 0; k <= n; k++) {
          if (k > 0) comb = (comb * (n - k + 1)) / k;
          pmf.push(comb * Math.pow(P.p, k) * Math.pow(1 - P.p, n - k));
        }
        const ymax = Math.max(...pmf, ...counts.map((x) => (total ? x / total : 0))) * 1.2;
        const p = new Plot(c, 90, 60, w - 120, h - 130, { xmin: -0.7, xmax: n + 0.7, ymin: 0, ymax });
        p.axes({ xticks: Array.from({ length: n + 1 }, (_, i) => i), yticks: niceTicks(0, ymax, 4), xfmt: (v) => `${v}`, xlabel: 'k (오른쪽으로 튄 횟수)', ylabel: '확률', title: `이항 분포 B(${n}, ${P.p.toFixed(1)}) · 공 ${total}개` });
        counts.forEach((cnt, k) => {
          if (!total) return;
          const f = cnt / total;
          c.fillStyle = 'rgba(56,217,255,0.75)';
          c.fillRect(p.X(k - 0.35), p.Y(f), p.X(k + 0.35) - p.X(k - 0.35), p.Y(0) - p.Y(f));
        });
        const mu = n * P.p;
        const sg = Math.sqrt(n * P.p * (1 - P.p));
        p.fn((x) => Math.exp(-((x - mu) ** 2) / (2 * sg * sg)) / (sg * Math.sqrt(2 * Math.PI)), 'rgba(255,110,199,0.8)', { width: 3 });
        pmf.forEach((v, k) => p.dot(k, v, '#ffe066', 7));
        legend(c, 110, h - 32, [['rgba(56,217,255,0.9)', '실험'], ['#ffe066', '이항 분포'], [C.pink, '정규 근사']]);
      },
      readout(P) {
        const n = P.rows;
        const mean = total ? counts.reduce((a, cnt, k) => a + cnt * k, 0) / total : 0;
        return [`이론 평균 np = ${(n * P.p).toFixed(2)},  분산 np(1−p) = ${(n * P.p * (1 - P.p)).toFixed(2)}`, total ? `실험 평균 = ${mean.toFixed(2)}  (공 ${total}개)` : '공을 떨어뜨려 보세요!'];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 컴퓨터구조: 5단계 파이프라인
// ---------------------------------------------------------------------------
const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const STAGE_COL = [0x38d9ff, 0x3ddc97, 0xffb547, 0xc084fc, 0xff6ec7];
export const pipeline = {
  title: '5단계 명령어 파이프라인',
  hint: '"데이터 의존"을 켜면 명령어가 앞 명령어의 결과를 기다리며 멈춥니다(회색 버블). 포워딩을 켜고 끄며 CPI 를 비교해 보세요.',
  params: [
    { id: 'haz', label: '데이터 의존', options: ['없음', '있음'], value: 1 },
    { id: 'fwd', label: '포워딩', options: ['켜짐', '꺼짐'], value: 1 },
    { id: 'speed', label: '클럭 속도', options: ['느리게', '보통', '빠르게'], value: 1 },
  ],
  create({ group, refresh }) {
    const NI = 200;
    let S = null;
    const schedule = (P) => {
      const IF = [];
      const ID = [];
      const EX = [];
      const kind = [];
      for (let i = 0; i < NI; i++) {
        kind.push(i % 4 === 0 ? 'lw' : 'add');
        let stall = 0;
        if (P.haz && i > 0) stall = kind[i - 1] === 'lw' ? (P.fwd === 0 ? 1 : 2) : P.fwd === 0 ? 0 : 2;
        IF.push(i === 0 ? 0 : ID[i - 1]);
        ID.push(i === 0 ? 1 : Math.max(IF[i] + 1, EX[i - 1]));
        EX.push(i === 0 ? 2 : Math.max(ID[i] + 1, EX[i - 1] + 1 + stall));
      }
      const cpi = (EX[NI - 1] - EX[20]) / (NI - 21);
      return { IF, ID, EX, kind, cpi };
    };
    const stageAt = (i, c) => {
      if (c < S.IF[i]) return -1;
      if (c < S.ID[i]) return 0;
      if (c < S.EX[i]) return 1;
      if (c === S.EX[i]) return 2;
      if (c === S.EX[i] + 1) return 3;
      if (c === S.EX[i] + 2) return 4;
      return 5;
    };
    const stalled = (i, c) => stageAt(i, c) === 1 && c > S.ID[i];
    // 3D 단계 상자
    const sx = (k) => (k - 2) * 0.14;
    STAGES.forEach((name, k) => {
      const m = box(0.12, 0.11, 0.09, glass(STAGE_COL[k], 0.16));
      m.position.set(sx(k), 0.36, 0);
      const l = makeLabel(name, { size: 0.03, color: '#' + STAGE_COL[k].toString(16).padStart(6, '0') });
      l.position.set(sx(k), 0.45, 0);
      group.add(m, l);
    });
    const rail = box(0.84, 0.006, 0.006, basic(0x334155));
    rail.position.set(0, 0.3, 0);
    group.add(rail);
    // 명령어 큐브 풀
    const tex = [];
    for (let n = 0; n < 12; n++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff';
      g.font = font(54, 800, MONO);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`I${n + 1}`, 64, 68);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      tex.push(t);
    }
    const pool = [];
    for (let k = 0; k < 8; k++) {
      const cube = box(0.06, 0.06, 0.06, std(0x38d9ff, { emissive: 0x0b2c38 }));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: tex[0], transparent: true, toneMapped: false }));
      face.position.z = 0.031;
      cube.add(face);
      group.add(cube);
      pool.push({ cube, face });
    }
    const bubbles = [2, 3, 4].map((k) => {
      const b = sphere(0.025, std(0x667085, { transparent: true, opacity: 0.7 }));
      b.position.set(sx(k), 0.36, 0);
      group.add(b);
      return b;
    });
    let c = 0;
    let lastInt = -1;
    let completed = 0;
    return {
      animated: true,
      onParam(P, id) {
        if (id === 'speed') return;
        S = schedule(P);
        c = 0;
        lastInt = -1;
      },
      update(dt, P) {
        c += dt * [0.6, 1.2, 2.5][P.speed];
        const ci = Math.floor(c);
        if (S.EX[60] < ci) {
          c = 0;
          return;
        }
        const f = c - ci;
        const e = f < 0.3 ? 0 : Math.min(1, (f - 0.3) / 0.4);
        const ee = e * e * (3 - 2 * e);
        let used = 0;
        completed = 0;
        for (let i = 0; i < 64 && used < pool.length; i++) {
          const s0 = stageAt(i, ci);
          const s1 = stageAt(i, ci + 1);
          if (s0 === 5) {
            completed++;
            continue;
          }
          if (s0 < 0 && s1 < 0) break;
          const a = s0 < 0 ? -1 : s0;
          const b = s1 > 4 ? 5.5 : s1;
          const k = a + (b - a) * ee;
          const it = pool[used++];
          it.cube.visible = true;
          it.cube.position.set(sx(k), 0.36 + (stalled(i, ci) ? Math.sin(c * 20) * 0.004 : 0), 0.0);
          it.cube.material.color.setHex(S.kind[i] === 'lw' ? 0xffb547 : 0x38d9ff);
          it.cube.material.emissive.setHex(stalled(i, ci) ? 0x5a1010 : 0x0b2c38);
          it.face.material.map = tex[i % 12];
          const sc = s0 < 0 ? ee : b > 5 ? 1 - Math.max(0, k - 4.5) : 1;
          it.cube.scale.setScalar(Math.max(0.01, sc));
        }
        for (let k = used; k < pool.length; k++) pool[k].cube.visible = false;
        const exBusy = (cc) => S.EX.some((x) => x === cc);
        bubbles[0].visible = ci > 2 && !exBusy(ci);
        bubbles[1].visible = ci > 3 && !exBusy(ci - 1);
        bubbles[2].visible = ci > 4 && !exBusy(ci - 2);
        if (ci !== lastInt) {
          lastInt = ci;
          refresh();
        }
      },
      draw(cx, w, h, P) {
        graphBg(cx, w, h);
        const ci = Math.floor(c);
        const C0 = Math.max(0, ci - 6);
        let i0 = 0;
        while (i0 < NI - 1 && S.EX[i0] + 2 < C0) i0++;
        const rows = 8;
        const cols = 14;
        const x0 = 120;
        const y0 = 90;
        const cw = (w - x0 - 30) / cols;
        const rh = (h - y0 - 30) / rows;
        cx.font = font(22, 700, MONO);
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.fillStyle = C.text;
        cx.font = font(26, 700);
        cx.textAlign = 'left';
        cx.fillText('파이프라인 다이어그램 (가로: 클럭 사이클)', 20, 32);
        cx.font = font(20, 600, MONO);
        cx.textAlign = 'center';
        for (let k = 0; k < cols; k++) {
          const cc = C0 + k;
          if (cc === ci) {
            cx.fillStyle = 'rgba(255,224,102,0.12)';
            cx.fillRect(x0 + k * cw, y0 - 30, cw, rows * rh + 30);
          }
          cx.fillStyle = cc === ci ? '#ffe066' : C.dim;
          cx.fillText(`${cc + 1}`, x0 + k * cw + cw / 2, y0 - 14);
        }
        for (let r = 0; r < rows; r++) {
          const i = i0 + r;
          const y = y0 + r * rh;
          cx.fillStyle = S.kind[i] === 'lw' ? '#ffb547' : C.accent;
          cx.textAlign = 'left';
          cx.font = font(20, 700, MONO);
          cx.fillText(`I${(i % 12) + 1} ${S.kind[i]}`, 14, y + rh / 2);
          cx.textAlign = 'center';
          for (let k = 0; k < cols; k++) {
            const cc = C0 + k;
            const s = stageAt(i, cc);
            if (s < 0 || s > 4) continue;
            const st = stalled(i, cc);
            const col = st ? '#667085' : '#' + STAGE_COL[s].toString(16).padStart(6, '0');
            cx.fillStyle = col + (cc <= ci ? 'cc' : '44');
            cx.fillRect(x0 + k * cw + 2, y + 3, cw - 4, rh - 6);
            cx.fillStyle = cc <= ci ? '#04121c' : 'rgba(234,242,255,0.6)';
            cx.font = font(18, 800, MONO);
            cx.fillText(st ? '∙' : STAGES[s], x0 + k * cw + cw / 2, y + rh / 2);
          }
        }
      },
      readout(P) {
        return [`CPI ≈ ${S.cpi.toFixed(2)}  (이상적 1.00)`, P.haz ? (P.fwd === 0 ? '포워딩: lw 다음 명령만 1사이클 스톨' : '포워딩 없음: 의존마다 2사이클 스톨') : '의존 없음: 매 사이클 명령어 1개 완료'];
      },
    };
  },
};
