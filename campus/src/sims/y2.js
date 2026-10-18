import * as THREE from 'three';
import { C, si, makeLabel, makeArrow, setArrow, font, MONO } from '../core/util.js';
import { graphBg, Plot, legend, niceTicks } from './graph.js';
import { std, basic, box, sphere, cyl, Segments, halo } from './kit.js';

const niceUp = (x) => {
  const m = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / m;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * m;
};

// ---------------------------------------------------------------------------
// 회로이론: RC 충·방전
// ---------------------------------------------------------------------------
const RS = [1e3, 2.2e3, 4.7e3, 10e3, 22e3, 47e3, 100e3];
const CS = [1e-6, 10e-6, 47e-6, 100e-6];
export const rc = {
  title: 'RC 회로의 충전과 방전',
  hint: 'R 이나 C 를 키우면 시상수 τ = RC 가 커져 곡선이 느려집니다(시간축 숫자를 보세요). t = τ 에서 63.2% 지점을 확인해 보세요.',
  params: [
    { id: 'r', label: '저항 R', options: RS.map((r) => si(r, 'Ω')), value: 3 },
    { id: 'c', label: '커패시터 C', options: CS.map((c) => si(c, 'F')), value: 3 },
    { id: 'vs', label: '전원 Vs', min: 1, max: 12, step: 1, value: 5, fmt: (v) => `${v} V` },
    { id: 'mode', label: '동작', options: ['충전', '방전'], value: 0 },
  ],
  create({ group }) {
    // 3D: 평행판 커패시터 + 전하
    const plateMat = std(0xb8c4d6, { metalness: 0.7, roughness: 0.3 });
    const pA = box(0.26, 0.26, 0.01, plateMat);
    const pB = box(0.26, 0.26, 0.01, plateMat);
    pA.position.set(0, 0.38, 0.06);
    pB.position.set(0, 0.38, -0.06);
    group.add(pA, pB);
    const n = 36;
    const geo = new THREE.SphereGeometry(0.009, 8, 6);
    const plus = new THREE.InstancedMesh(geo, basic(0xff5d6c), n);
    const minus = new THREE.InstancedMesh(geo, basic(0x4da3ff), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = ((i % 6) - 2.5) * 0.04;
      const y = 0.38 + (Math.floor(i / 6) - 2.5) * 0.04;
      plus.setMatrixAt(i, m4.makeTranslation(x, y, 0.072));
      minus.setMatrixAt(i, m4.makeTranslation(x, y, -0.072));
    }
    group.add(plus, minus);
    const field = new Segments(36, 0xffe066, 0.6);
    field.begin();
    for (let i = 0; i < 36; i++) {
      const x = ((i % 6) - 2.5) * 0.04;
      const y = 0.38 + (Math.floor(i / 6) - 2.5) * 0.04;
      field.addXYZ(x, y, 0.05, x, y, -0.05);
    }
    field.end();
    group.add(field.mesh);
    const lbl = makeLabel('v_C', { size: 0.035, color: '#ffe066' });
    lbl.position.set(0, 0.56, 0);
    group.add(lbl);
    let t = 0;
    let frac = 0;
    return {
      animated: true,
      onParam() {
        t = 0;
      },
      update(dt, P) {
        t = (t + dt / 4) % 1.15;
        const k = Math.min(1, t);
        const tau = RS[P.r] * CS[P.c];
        const win = niceUp(6 * tau);
        const tt = k * win;
        frac = P.mode === 0 ? 1 - Math.exp(-tt / tau) : Math.exp(-tt / tau);
        const show = Math.round(frac * n);
        plus.count = minus.count = show;
        field.material.opacity = 0.1 + frac * 0.7;
        this.tNow = tt;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const tau = RS[P.r] * CS[P.c];
        const win = niceUp(6 * tau);
        const unit = win >= 1 ? ['s', 1] : ['ms', 1e3];
        const p = new Plot(c, 90, 60, w - 130, h - 130, { xmin: 0, xmax: win, ymin: 0, ymax: P.vs * 1.15 });
        p.axes({ xticks: niceTicks(0, win, 6), yticks: niceTicks(0, P.vs * 1.1, 5), xfmt: (v) => `${+(v * unit[1]).toPrecision(3)}`, xlabel: `t [${unit[0]}]`, ylabel: 'v_C [V]', title: P.mode === 0 ? 'v_C(t) = Vs(1 − e^(−t/τ))' : 'v_C(t) = Vs·e^(−t/τ)' });
        const f = (x) => (P.mode === 0 ? P.vs * (1 - Math.exp(-x / tau)) : P.vs * Math.exp(-x / tau));
        for (let k = 1; k <= 5; k++) if (k * tau <= win) p.vline(k * tau, 'rgba(255,224,102,0.25)', [4, 6], 1.5);
        p.fn(f, C.accent, { width: 5, glow: true });
        const y1 = f(tau);
        p.hline(y1, 'rgba(255,110,199,0.6)');
        p.dot(tau, y1, C.pink, 9);
        p.label(`t = τ → ${P.mode === 0 ? '63.2%' : '36.8%'}`, tau, y1, C.pink, { dx: 14, dy: -8 });
        const tn = this.tNow ?? 0;
        p.dot(Math.min(tn, win), f(Math.min(tn, win)), '#ffffff', 7);
      },
      readout(P) {
        const tau = RS[P.r] * CS[P.c];
        return [`τ = R·C = ${si(tau, 's')}`, `5τ = ${si(5 * tau, 's')} 후 ${P.mode === 0 ? '99.3% 충전' : '0.7% 남음'}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 공업수학: 2계 미분방정식(질량-스프링-댐퍼)
// ---------------------------------------------------------------------------
export const spring = {
  title: "x'' + 2ζωₙx' + ωₙ²x = 0",
  hint: '감쇠비 ζ 를 0.2 → 1.0 → 2.0 으로 바꾸고 [당기기]를 눌러 보세요. 부족감쇠는 출렁이고, 임계감쇠(ζ = 1)가 가장 빨리 멈춥니다.',
  params: [
    { id: 'z', label: '감쇠비 ζ', min: 0, max: 2, step: 0.1, value: 0.2, fmt: (v) => v.toFixed(1) },
    { id: 'wn', label: '고유진동수 ωₙ', min: 2, max: 8, step: 1, value: 4, fmt: (v) => `${v} rad/s` },
  ],
  actions: [{ id: 'pull', label: '⬇ 당기기' }],
  create({ group }) {
    const top = 0.68;
    const ceil = box(0.3, 0.02, 0.12, std(0x3a4a66));
    ceil.position.y = top + 0.01;
    group.add(ceil);
    const NP = 220;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
    const coil = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fd8ff }));
    coil.frustumCulled = false;
    group.add(coil);
    const mass = box(0.12, 0.08, 0.12, std(0xffb547, { metalness: 0.3 }));
    group.add(mass);
    const ml = makeLabel('m', { size: 0.05, color: '#3a2500' });
    ml.position.z = 0.061;
    mass.add(ml);
    const rest = makeLabel('평형점', { size: 0.025, color: '#93a6c3' });
    rest.position.set(0.16, 0.36, 0);
    group.add(rest);
    const tick = box(0.04, 0.002, 0.002, basic(0x93a6c3));
    tick.position.set(0.1, 0.36, 0);
    group.add(tick);
    let x = 1;
    let v = 0;
    let still = 0;
    const hist = [];
    let time = 0;
    return {
      animated: true,
      onAction() {
        x = 1;
        v = 0;
      },
      update(dt, P) {
        const sub = 8;
        const h = dt / sub;
        for (let i = 0; i < sub; i++) {
          const a = -2 * P.z * P.wn * v - P.wn * P.wn * x;
          v += a * h;
          x += v * h;
        }
        time += dt;
        hist.push([time, x]);
        while (hist.length && hist[0][0] < time - 6) hist.shift();
        if (Math.abs(x) < 0.01 && Math.abs(v) < 0.02) still += dt;
        else still = 0;
        if (still > 2) {
          x = 1;
          v = 0;
          still = 0;
        }
        const my = 0.36 - x * 0.13;
        mass.position.set(0, my, 0);
        const pos = geo.attributes.position;
        const y0 = top;
        const y1 = my + 0.04;
        for (let i = 0; i < NP; i++) {
          const k = i / (NP - 1);
          const ang = k * Math.PI * 2 * 12;
          const r = k < 0.04 || k > 0.96 ? 0 : 0.035;
          pos.setXYZ(i, Math.cos(ang) * r, y0 + (y1 - y0) * k, Math.sin(ang) * r);
        }
        pos.needsUpdate = true;
      },
      draw(c, w, h) {
        graphBg(c, w, h);
        const p = new Plot(c, 80, 60, w - 110, h - 120, { xmin: -6, xmax: 0, ymin: -1.2, ymax: 1.2 });
        p.axes({ xticks: niceTicks(-6, 0, 6), yticks: [-1, -0.5, 0, 0.5, 1], xlabel: 't − 현재 [s]', ylabel: 'x(t)', title: '변위 x(t) 기록' });
        p.poly(hist.map(([tt, xx]) => [tt - time, xx]), C.accent, { width: 4 });
        if (hist.length) p.dot(0, hist[hist.length - 1][1], C.pink, 9);
      },
      readout(P) {
        const kind = P.z === 0 ? '무감쇠 — 영원히 진동' : P.z < 1 ? '부족감쇠 — 진동하며 수렴' : P.z === 1 ? '임계감쇠 — 가장 빠른 수렴' : '과감쇠 — 천천히 수렴';
        const wd = P.z < 1 ? `ω_d = ωₙ√(1−ζ²) = ${(P.wn * Math.sqrt(1 - P.z * P.z)).toFixed(2)} rad/s` : '진동하지 않음';
        return [kind, wd];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 전자기학 1: 직선 전류의 자기장
// ---------------------------------------------------------------------------
export const wireB = {
  title: '직선 전류 주위의 자기장',
  hint: '오른손 엄지를 전류(노란 화살표) 방향으로 두면 네 손가락이 감기는 방향이 자기장입니다. 전류의 부호를 바꾸면 회전 방향이 뒤집혀요.',
  params: [
    { id: 'i', label: '전류 I', min: -10, max: 10, step: 2, value: 6, fmt: (v) => `${v} A` },
    { id: 'r', label: '측정 거리 r', min: 1, max: 10, step: 1, value: 3, fmt: (v) => `${v} cm` },
  ],
  create({ group }) {
    const wire = cyl(0.008, 0.66, std(0xd08a3a, { metalness: 0.7, roughness: 0.3 }), 16);
    wire.position.y = 0.38;
    group.add(wire);
    const iArrow = makeArrow(0xffe066, 0.008);
    group.add(iArrow);
    const radii = [0.06, 0.11, 0.16, 0.22, 0.28];
    const levels = [0.2, 0.38, 0.56];
    const rings = new Segments(radii.length * levels.length * 48, 0x4da3ff, 0.5);
    group.add(rings.mesh);
    rings.begin();
    for (const y of levels)
      for (const r of radii)
        for (let k = 0; k < 48; k++) {
          const a1 = (k / 48) * Math.PI * 2;
          const a2 = ((k + 1) / 48) * Math.PI * 2;
          rings.addXYZ(Math.cos(a1) * r, y, Math.sin(a1) * r, Math.cos(a2) * r, y, Math.sin(a2) * r);
        }
    rings.end();
    const coneGeo = new THREE.ConeGeometry(0.011, 0.03, 10);
    const perRing = 6;
    const cones = new THREE.InstancedMesh(coneGeo, basic(0x7fd4ff), radii.length * perRing);
    group.add(cones);
    const probe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 6, 64), basic(0xff6ec7));
    probe.rotation.x = Math.PI / 2;
    probe.position.y = 0.38;
    group.add(probe);
    let probeLabel = null;
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), basic(0xffe066), 10);
    group.add(dots);
    let phase = 0;
    let iPhase = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tan = new THREE.Vector3();
    const s1 = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    return {
      onParam(P) {
        const rv = 0.03 + P.r * 0.025;
        probe.scale.set(rv, rv, 1);
        if (probeLabel) {
          probeLabel.userData.disposeLabel();
          group.remove(probeLabel);
        }
        const B = (2e-7 * Math.abs(P.i)) / (P.r / 100);
        probeLabel = makeLabel(`B = ${si(B, 'T')}`, { size: 0.03, color: '#ff9bd8' });
        probeLabel.position.set(rv, 0.42, 0.02);
        group.add(probeLabel);
        setArrow(iArrow, new THREE.Vector3(0.03, 0.38 - Math.sign(P.i) * 0.08, 0), new THREE.Vector3(0, Math.sign(P.i) * 0.16, 0));
        rings.material.opacity = 0.15 + Math.min(0.6, Math.abs(P.i) / 14);
      },
      update(dt, P) {
        const s = Math.sign(P.i);
        phase += dt * 0.8 * (P.i / 10);
        let idx = 0;
        radii.forEach((r) => {
          for (let k = 0; k < perRing; k++) {
            const a = (k / perRing) * Math.PI * 2 + phase * (0.08 / r);
            p.set(Math.cos(a) * r, 0.38, Math.sin(a) * r);
            // B 방향 = I(ŷ) × r̂
            tan.set(p.z, 0, -p.x).normalize().multiplyScalar(s || 1);
            q.setFromUnitVectors(up, tan);
            const sc = P.i === 0 ? 0.001 : Math.min(1.3, 0.5 + 0.06 / r);
            m4.compose(p, q, s1.set(sc, sc, sc));
            cones.setMatrixAt(idx++, m4);
          }
        });
        cones.instanceMatrix.needsUpdate = true;
        iPhase += dt * P.i * 0.03;
        for (let k = 0; k < 10; k++) {
          const y = 0.06 + ((((k / 10 + iPhase) % 1) + 1) % 1) * 0.64;
          dots.setMatrixAt(k, m4.makeTranslation(0, y, 0.009));
        }
        dots.count = P.i === 0 ? 0 : 10;
        dots.instanceMatrix.needsUpdate = true;
      },
      readout(P) {
        const B = (2e-7 * Math.abs(P.i)) / (P.r / 100);
        return [`B = µ₀I / (2πr) = ${si(B, 'T')}`, `지구 자기장(약 50 µT)의 ${(B / 50e-6).toFixed(2)}배`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 디지털논리: 전가산기
// ---------------------------------------------------------------------------
export const logic = {
  title: '전가산기 (Full Adder)',
  hint: '홀로그램의 스위치 A · B · Cin 을 직접 눌러 보세요(아래 버튼도 가능). 초록 선은 1, 어두운 선은 0. 오른쪽 진리표에서 현재 줄이 강조됩니다.',
  params: [
    { id: 'a', label: '입력 A', options: ['0', '1'], value: 1 },
    { id: 'b', label: '입력 B', options: ['0', '1'], value: 0 },
    { id: 'cin', label: '입력 Cin', options: ['0', '1'], value: 1 },
  ],
  create({ group, addClickable, setParam }) {
    const back = box(0.74, 0.6, 0.012, std(0x0b1426, { roughness: 0.8 }));
    back.position.set(0, 0.38, -0.012);
    group.add(back);
    const ON = new THREE.Color(0x3ddc97);
    const OFF = new THREE.Color(0x2a3550);
    const wires = [];
    const wire = (pts, sig) => {
      const mat = basic(0x2a3550);
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1e-4) continue;
        const m = box(Math.abs(x2 - x1) + 0.005, Math.abs(y2 - y1) + 0.005, 0.004, mat);
        m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
        group.add(m);
      }
      wires.push({ mat, sig });
    };
    const gates = [];
    const gate = (name, x, y, sig) => {
      const m = box(0.085, 0.065, 0.024, std(0x1d2a44, { emissive: 0x000000 }));
      m.position.set(x, y, 0.004);
      const l = makeLabel(name, { size: 0.026, color: '#ffffff' });
      l.position.z = 0.013;
      m.add(l);
      group.add(m);
      gates.push({ m, sig });
    };
    const S = { a: 0, b: 0, cin: 0 };
    const x1 = () => S.a ^ S.b;
    const sum = () => x1() ^ S.cin;
    const and1 = () => S.a & S.b;
    const and2 = () => x1() & S.cin;
    const cout = () => and1() | and2();
    const yA = 0.58;
    const yB = 0.46;
    const yC = 0.18;
    // 입력 → 게이트 배선
    wire([[-0.28, yA], [-0.2, yA], [-0.2, 0.49], [-0.15, 0.49]], () => S.a);
    wire([[-0.28, yB], [-0.22, yB], [-0.22, 0.47], [-0.15, 0.47]], () => S.b);
    wire([[-0.2, yA], [-0.18, yA], [-0.18, 0.33], [-0.15, 0.33]], () => S.a);
    wire([[-0.22, yB], [-0.24, yB], [-0.24, 0.31], [-0.15, 0.31]], () => S.b);
    wire([[-0.28, yC], [0.0, yC], [0.0, 0.41], [0.04, 0.41]], () => S.cin);
    wire([[0.0, yC], [0.0, 0.23], [0.04, 0.23]], () => S.cin);
    wire([[-0.06, 0.48], [-0.02, 0.48], [-0.02, 0.43], [0.04, 0.43]], x1);
    wire([[-0.02, 0.43], [-0.02, 0.25], [0.04, 0.25]], x1);
    wire([[0.13, 0.42], [0.27, 0.42]], sum);
    wire([[-0.06, 0.32], [0.17, 0.32], [0.17, 0.3], [0.18, 0.3]], and1);
    wire([[0.13, 0.24], [0.17, 0.24], [0.17, 0.26], [0.18, 0.26]], and2);
    wire([[0.25, 0.28], [0.27, 0.28]], cout);
    gate('XOR', -0.105, 0.48, x1);
    gate('AND', -0.105, 0.32, and1);
    gate('XOR', 0.085, 0.42, sum);
    gate('AND', 0.085, 0.24, and2);
    gate('OR', 0.215, 0.28, cout);
    // 입력 스위치(누를 수 있음)
    const switches = [];
    [['a', 'A', yA], ['b', 'B', yB], ['cin', 'Cin', yC]].forEach(([id, name, y]) => {
      const m = box(0.06, 0.05, 0.03, std(0x2a3550, { emissive: 0x000000 }));
      m.position.set(-0.3, y, 0.01);
      group.add(m);
      const l = makeLabel(name, { size: 0.026 });
      l.position.set(-0.3, y + 0.045, 0.01);
      group.add(l);
      addClickable(m, {
        onClick: () => setParam(id, S[id] ? 0 : 1),
        onHover: (on) => m.scale.setScalar(on ? 1.15 : 1),
      });
      switches.push({ id, m });
    });
    // 출력 LED
    const leds = [['S', 0.42, sum], ['Cout', 0.28, cout]].map(([name, y, sig]) => {
      const m = sphere(0.022, basic(0x333333));
      m.position.set(0.3, y, 0.01);
      const h = halo(0x3ddc97, 0.05);
      m.add(h);
      const l = makeLabel(name, { size: 0.026 });
      l.position.set(0.3, y + 0.045, 0.01);
      group.add(m, l);
      return { m, h, sig };
    });
    const refresh = () => {
      for (const w of wires) w.mat.color.copy(w.sig() ? ON : OFF);
      for (const g of gates) g.m.material.emissive.setHex(g.sig() ? 0x0f5c3a : 0x000000);
      for (const s of switches) {
        s.m.material.color.setHex(S[s.id] ? 0x3ddc97 : 0x2a3550);
        s.m.material.emissive.setHex(S[s.id] ? 0x0f5c3a : 0x000000);
      }
      for (const l of leds) {
        l.m.material.color.setHex(l.sig() ? 0x7dffc4 : 0x333333);
        l.h.visible = !!l.sig();
      }
    };
    return {
      onParam(P) {
        S.a = P.a;
        S.b = P.b;
        S.cin = P.cin;
        refresh();
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        c.fillStyle = C.text;
        c.font = font(30, 700);
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText('전가산기 진리표', 40, 26);
        const cols = ['A', 'B', 'Cin', 'S', 'Cout'];
        const x0 = 110;
        const cw = 160;
        const rh = 58;
        const y0 = 90;
        c.font = font(30, 700, MONO);
        c.textAlign = 'center';
        cols.forEach((t, i) => {
          c.fillStyle = i < 3 ? C.accent : C.ok;
          c.fillText(t, x0 + i * cw + cw / 2, y0);
        });
        const cur = P.a * 4 + P.b * 2 + P.cin;
        for (let r = 0; r < 8; r++) {
          const a = (r >> 2) & 1;
          const b = (r >> 1) & 1;
          const ci = r & 1;
          const s = a ^ b ^ ci;
          const co = (a & b) | ((a ^ b) & ci);
          const y = y0 + 50 + r * rh;
          if (r === cur) {
            c.fillStyle = 'rgba(61,220,151,0.22)';
            c.fillRect(x0 - 10, y - 8, cw * 5 + 20, rh - 4);
            c.strokeStyle = C.ok;
            c.lineWidth = 3;
            c.strokeRect(x0 - 10, y - 8, cw * 5 + 20, rh - 4);
          }
          [a, b, ci, s, co].forEach((v, i) => {
            c.fillStyle = r === cur ? '#ffffff' : C.muted;
            c.fillText(String(v), x0 + i * cw + cw / 2, y);
          });
        }
        c.strokeStyle = C.line;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x0 + 3 * cw, y0 - 6);
        c.lineTo(x0 + 3 * cw, y0 + 50 + 8 * rh);
        c.stroke();
      },
      readout(P) {
        const s = P.a ^ P.b ^ P.cin;
        const co = (P.a & P.b) | ((P.a ^ P.b) & P.cin);
        return [`${P.a} + ${P.b} + ${P.cin} = ${P.a + P.b + P.cin} = (${co}${s})₂`, `S = A⊕B⊕Cin = ${s},  Cout = ${co}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 신호및시스템: 푸리에 급수(회전 원 + 스펙트럼)
// ---------------------------------------------------------------------------
export const fourier = {
  title: '푸리에 급수 — 사인파로 파형 만들기',
  hint: '왼쪽의 회전하는 원(페이저)들을 이어 붙인 끝점이 오른쪽 파형을 그립니다. N 을 늘리면 구형파의 모서리가 날카로워지지만, 모서리의 약 9% 튀어나옴(깁스)은 남아요.',
  params: [
    { id: 'wave', label: '목표 파형', options: ['구형파', '톱니파', '삼각파'], value: 0 },
    { id: 'n', label: '고조파 개수 N', min: 1, max: 25, step: 1, value: 3, fmt: (v) => `${v}개` },
  ],
  create() {
    let t = 0;
    const coeffs = (wave, N) => {
      const out = [];
      for (let n = 1; out.length < N; n++) {
        if (wave === 0 && n % 2 === 1) out.push([n, 4 / (n * Math.PI)]);
        else if (wave === 1) out.push([n, (2 * (n % 2 ? 1 : -1)) / (n * Math.PI)]);
        else if (wave === 2 && n % 2 === 1) out.push([n, ((8 / (Math.PI * Math.PI * n * n)) * (((n - 1) / 2) % 2 ? -1 : 1))]);
      }
      return out;
    };
    const target = (wave, x) => {
      const ph = ((x / (2 * Math.PI)) % 1 + 1) % 1;
      if (wave === 0) return ph < 0.5 ? 1 : -1;
      if (wave === 1) return ph < 0.5 ? 2 * ph : 2 * ph - 2;
      return ph < 0.25 ? 4 * ph : ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4;
    };
    return {
      animated: true,
      update(dt) {
        t += dt * 1.1;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const cs = coeffs(P.wave, P.n);
        const sumAt = (x) => cs.reduce((s, [n, b]) => s + b * Math.sin(n * x), 0);
        // 회전 원
        const cx = 175;
        const cy = 250;
        const sc = 105;
        let x = cx;
        let y = cy;
        c.lineWidth = 2;
        for (const [n, b] of cs) {
          const r = Math.abs(b) * sc;
          c.strokeStyle = 'rgba(56,217,255,0.35)';
          c.beginPath();
          c.arc(x, y, r, 0, Math.PI * 2);
          c.stroke();
          const nx = x + b * sc * Math.cos(n * t);
          const ny = y - b * sc * Math.sin(n * t);
          c.strokeStyle = 'rgba(234,242,255,0.8)';
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(nx, ny);
          c.stroke();
          x = nx;
          y = ny;
        }
        // 파형(오른쪽): 시간이 흐르며 왼쪽에서 밀려 나감
        const p = new Plot(c, 360, cy - sc * 1.35, w - 390, sc * 2.7, { xmin: 0, xmax: 4 * Math.PI, ymin: -1.35, ymax: 1.35 });
        p.axes({ yticks: [-1, 0, 1] });
        p.fn((u) => target(P.wave, t - u), 'rgba(147,166,195,0.5)', { width: 2.5, n: 600 });
        p.fn((u) => sumAt(t - u), C.pink, { width: 4, n: 600, glow: true });
        c.strokeStyle = 'rgba(255,224,102,0.7)';
        c.setLineDash([6, 6]);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(p.X(0), p.Y(sumAt(t)));
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = '#ffe066';
        c.beginPath();
        c.arc(x, y, 6, 0, Math.PI * 2);
        c.fill();
        // 스펙트럼
        const sp = new Plot(c, 70, h - 140, w - 110, 100, { xmin: 0, xmax: 26, ymin: 0, ymax: 1.35 });
        sp.axes({ xticks: [1, 5, 10, 15, 20, 25], title: '진폭 스펙트럼 |bₙ| (고조파 차수 n)' });
        for (const [n, b] of cs) {
          if (n > 25) continue;
          c.fillStyle = C.accent;
          const bw = 14;
          c.fillRect(sp.X(n) - bw / 2, sp.Y(Math.abs(b)), bw, sp.Y(0) - sp.Y(Math.abs(b)));
        }
        legend(c, 380, 34, [['rgba(147,166,195,0.8)', '목표 파형'], [C.pink, `N = ${P.n} 합성`]]);
      },
      readout(P) {
        const cs = coeffs(P.wave, P.n);
        const top = cs.slice(0, 3).map(([n, b]) => `${b.toFixed(2)}·sin ${n}ωt`).join(' + ');
        return [`x(t) ≈ ${top}${cs.length > 3 ? ' + …' : ''}`, `사용한 최고 차수: ${cs[cs.length - 1][0]}차 고조파`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 전자회로 1: 다이오드 동작점(부하선)
// ---------------------------------------------------------------------------
const DR = [100, 220, 470, 1000];
export const diode = {
  title: '다이오드 회로의 동작점(Q점)',
  hint: '전원 Vs 를 0.25 V 씩 올려 보세요. 약 0.6 V 까지는 전류가 거의 0 이다가 그 뒤로 급격히 흐릅니다. 부하선(분홍)과 다이오드 곡선(파랑)의 교점이 동작점입니다.',
  params: [
    { id: 'vs', label: '전원 Vs', min: 0, max: 5, step: 0.25, value: 2, fmt: (v) => `${v.toFixed(2)} V` },
    { id: 'r', label: '직렬 저항 R', options: DR.map((r) => si(r, 'Ω')), value: 0 },
    { id: 'model', label: '모델', options: ['실제(쇼클리)', '이상적 0.7 V'], value: 0 },
  ],
  create({ group }) {
    const IS = 1e-14;
    const VT = 0.02585;
    const solve = (P) => {
      const R = DR[P.r];
      if (P.model === 1) return P.vs <= 0.7 ? [P.vs, 0] : [0.7, (P.vs - 0.7) / R];
      let lo = 0;
      let hi = P.vs;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        const f = IS * (Math.exp(m / VT) - 1) - (P.vs - m) / R;
        if (f > 0) hi = m;
        else lo = m;
      }
      const v = (lo + hi) / 2;
      return [v, (P.vs - v) / R];
    };
    // 3D: 큰 LED 모형
    const domeMat = basic(0x551111, { transparent: true, opacity: 0.85 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 0.5;
    const body = cyl(0.07, 0.12, domeMat, 24);
    body.position.y = 0.44;
    const rim = cyl(0.08, 0.015, domeMat, 24);
    rim.position.y = 0.38;
    const legMat = std(0xc0c6d0, { metalness: 0.8 });
    const leg1 = box(0.008, 0.28, 0.008, legMat);
    leg1.position.set(-0.025, 0.24, 0);
    const leg2 = box(0.008, 0.24, 0.008, legMat);
    leg2.position.set(0.025, 0.26, 0);
    const glow = halo(0xff4040, 0.16);
    glow.position.y = 0.46;
    group.add(dome, body, rim, leg1, leg2, glow);
    const lA = makeLabel('애노드(+)', { size: 0.022, color: '#93a6c3' });
    lA.position.set(-0.09, 0.12, 0);
    const lK = makeLabel('캐소드(−)', { size: 0.022, color: '#93a6c3' });
    lK.position.set(0.09, 0.15, 0);
    group.add(lA, lK);
    return {
      onParam(P) {
        const [, i] = solve(P);
        const b = Math.min(1, i / 0.02);
        domeMat.color.setRGB(0.33 + b * 0.67, 0.07 + b * 0.25, 0.07 + b * 0.2);
        glow.material.opacity = b * 0.6;
        glow.scale.setScalar(0.5 + b);
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const R = DR[P.r];
        const [vq, iq] = solve(P);
        const xmax = Math.max(1, P.vs) * 1.05;
        const ymax = Math.max(1e-3, (P.vs / R) * 1.15);
        const mA = (v) => `${+(v * 1e3).toPrecision(3)}`;
        const p = new Plot(c, 100, 60, w - 140, h - 130, { xmin: 0, xmax, ymin: 0, ymax });
        p.axes({ xticks: niceTicks(0, xmax, 6), yticks: niceTicks(0, ymax, 5), yfmt: mA, xlabel: 'V_D [V]', ylabel: 'I_D [mA]', title: '다이오드 I-V 곡선과 부하선' });
        if (P.model === 0) p.fn((v) => IS * (Math.exp(v / VT) - 1), C.accent, { width: 5, n: 800 });
        else p.poly([[0, 0], [0.7, 0], [0.7, ymax * 2]], C.accent, { width: 5 });
        p.poly([[0, P.vs / R], [P.vs, 0]], C.pink, { width: 3.5, dash: [10, 8] });
        p.dot(vq, iq, '#ffe066', 11);
        p.label(`Q (${vq.toFixed(2)} V, ${mA(iq)} mA)`, vq, iq, '#ffe066', { dx: 16, dy: -10 });
        legend(c, 120, h - 32, [[C.accent, '다이오드'], [C.pink, `부하선 I = (Vs − V)/R`]]);
      },
      readout(P) {
        const [v, i] = solve(P);
        return [`V_D = ${v.toFixed(3)} V,  I_D = ${si(i, 'A')}`, `저항 전압 V_R = ${(P.vs - v).toFixed(2)} V`];
      },
    };
  },
};
