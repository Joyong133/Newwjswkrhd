import * as THREE from 'three';
import { C, si, makeLabel, makeArrow, setArrow, font, drawWrapped } from '../core/util.js';
import { graphBg, Plot, legend, niceTicks } from './graph.js';
import { std, basic, glass, box, sphere, cyl, halo } from './kit.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------------------
// 디지털신호처리: 샘플링과 에일리어싱(+ 마차 바퀴 효과)
// ---------------------------------------------------------------------------
const FS = [8, 10, 16, 20, 40];
export const sampling = {
  title: '샘플링과 에일리어싱',
  hint: '신호 주파수 f 를 나이퀴스트 주파수(f_s/2) 보다 크게 올려 보세요. 샘플(노란 점)만 보면 전혀 다른 느린 파형(분홍)으로 보입니다. 홀로그램 바퀴도 f_s 로 깜빡이며 찍혀서 거꾸로 도는 것처럼 보여요!',
  params: [
    { id: 'f', label: '신호 주파수 f', min: 1, max: 19, step: 1, value: 3, fmt: (v) => `${v} Hz` },
    { id: 'fs', label: '샘플링 f_s', options: FS.map((f) => `${f} Hz`), value: 2 },
  ],
  create({ group }) {
    const alias = (f, fs) => f - fs * Math.round(f / fs);
    // 3D: 스트로보로 찍히는 바퀴
    const wheel = new THREE.Group();
    wheel.position.set(0, 0.4, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 10, 48), std(0xb8c4d6, { metalness: 0.6 }));
    wheel.add(rim);
    for (let k = 0; k < 8; k++) {
      const s = box(0.006, 0.2, 0.006, std(k === 0 ? 0xff5d6c : 0x7c8aa0, k === 0 ? { emissive: 0x551010 } : {}));
      s.position.set(Math.sin((k / 8) * Math.PI * 2) * 0.1, Math.cos((k / 8) * Math.PI * 2) * 0.1, 0);
      s.rotation.z = -(k / 8) * Math.PI * 2;
      if (k === 0) s.scale.x = 2.2;
      wheel.add(s);
    }
    const hub = cyl(0.025, 0.03, std(0x3a4a66), 20);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);
    const lbl = makeLabel('f_s 로 찍은 바퀴', { size: 0.028, color: '#93a6c3' });
    lbl.position.set(0, 0.12, 0);
    group.add(lbl);
    let t = 0;
    return {
      update(dt, P) {
        t += dt;
        const fs = FS[P.fs];
        // 바퀴는 실제로 f 회전/초. 하지만 화면은 f_s 순간에만 갱신(스트로보)
        const ts = Math.floor(t * fs) / fs;
        wheel.rotation.z = -2 * Math.PI * (P.f / 8) * ts;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const fs = FS[P.fs];
        const fa = alias(P.f, fs);
        const p = new Plot(c, 80, 60, w - 110, 300, { xmin: 0, xmax: 1, ymin: -1.3, ymax: 1.3 });
        p.axes({ xticks: niceTicks(0, 1, 5), yticks: [-1, 0, 1], xlabel: 't [s]', title: `시간 영역 · f = ${P.f} Hz, f_s = ${fs} Hz` });
        p.fn((x) => Math.sin(2 * Math.PI * P.f * x), 'rgba(56,217,255,0.55)', { width: 2.5, n: 1200 });
        if (Math.abs(fa) !== P.f) p.fn((x) => Math.sin(2 * Math.PI * fa * x), C.pink, { width: 3.5, dash: [10, 6] });
        for (let n = 0; n <= fs; n++) {
          const x = n / fs;
          const y = Math.sin(2 * Math.PI * P.f * x);
          p.poly([[x, 0], [x, y]], 'rgba(255,224,102,0.7)', { width: 2 });
          p.dot(x, y, '#ffe066', 6);
        }
        const fmax = 42;
        const sp = new Plot(c, 80, 478, w - 110, h - 540, { xmin: 0, xmax: fmax, ymin: 0, ymax: 1.3 });
        sp.axes({ xticks: niceTicks(0, fmax, 8), xlabel: '주파수 [Hz]', title: '주파수 영역 (f_s/2 에서 접힘)' });
        c.fillStyle = 'rgba(255,93,108,0.08)';
        c.fillRect(sp.X(fs / 2), sp.y, sp.X(fmax) - sp.X(fs / 2), sp.h);
        sp.vline(fs / 2, C.bad, [8, 6], 2.5);
        sp.label('f_s/2', fs / 2, 1.2, C.bad, { dx: 6 });
        sp.vline(fs, 'rgba(255,224,102,0.6)', [4, 6], 2);
        sp.label('f_s', fs, 1.05, '#ffe066', { dx: 6 });
        const bar = (f, col) => {
          c.fillStyle = col;
          c.fillRect(sp.X(f) - 5, sp.Y(1), 10, sp.Y(0) - sp.Y(1));
        };
        bar(P.f, C.accent);
        if (Math.abs(fa) !== P.f) bar(Math.abs(fa), C.pink);
        legend(c, 100, 412, [['rgba(56,217,255,0.8)', '원래 신호'], ['#ffe066', '샘플'], [C.pink, '보이는 신호(에일리어스)']]);
      },
      readout(P) {
        const fs = FS[P.fs];
        const fa = Math.abs(alias(P.f, fs));
        return [`나이퀴스트 주파수 f_s/2 = ${fs / 2} Hz`, P.f <= fs / 2 ? (P.f === fs / 2 ? '경계! 샘플 위치에 따라 정보가 사라질 수 있음' : '✅ 정상 샘플링: 복원 가능') : `⚠ 에일리어싱! ${P.f} Hz 가 ${fa} Hz 로 보임`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// VLSI: CMOS 인버터
// ---------------------------------------------------------------------------
export const cmos = {
  title: 'CMOS 인버터 전달 특성',
  hint: 'V_in 을 0 → 1.8 V 로 올려 보세요. 처음엔 위쪽 PMOS 가, 나중엔 아래쪽 NMOS 가 켜집니다. 둘 다 반쯤 켜지는 중간(약 0.9 V)에서만 VDD → GND 로 관통 전류(노란 입자)가 흘러요.',
  params: [{ id: 'vin', label: '입력 V_in', min: 0, max: 1.8, step: 0.1, value: 0, fmt: (v) => `${v.toFixed(1)} V` }],
  create({ group }) {
    const VDD = 1.8;
    const VT = 0.45;
    const K = 1e-3;
    const lam = 0.06;
    const id = (vgs, vds) => {
      if (vgs <= VT) return 1e-9 * vds;
      const ov = vgs - VT;
      return vds < ov ? K * (ov * vds - (vds * vds) / 2) * (1 + lam * vds) : (K / 2) * ov * ov * (1 + lam * vds);
    };
    const solve = (vin) => {
      let lo = 0;
      let hi = VDD;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        const f = id(vin, m) - id(VDD - vin, VDD - m);
        if (f > 0) hi = m;
        else lo = m;
      }
      const vo = (lo + hi) / 2;
      return [vo, id(vin, vo)];
    };
    const curve = [];
    let imax = 0;
    for (let i = 0; i <= 180; i++) {
      const vin = (i / 180) * VDD;
      const [vo, idd] = solve(vin);
      curve.push([vin, vo, idd]);
      imax = Math.max(imax, idd);
    }
    // 3D 회로
    const rail = (y, col, name) => {
      const m = box(0.36, 0.014, 0.05, basic(col));
      m.position.set(0.03, y, 0);
      const l = makeLabel(name, { size: 0.03, color: '#' + col.toString(16).padStart(6, '0') });
      l.position.set(0.27, y, 0);
      group.add(m, l);
    };
    rail(0.68, 0xff6b81, 'VDD');
    rail(0.08, 0x7c8aa0, 'GND');
    const tr = (y, col, name) => {
      const body = box(0.1, 0.13, 0.06, glass(col, 0.25));
      body.position.set(0.03, y, 0);
      const ch = box(0.016, 0.13, 0.064, basic(col, { transparent: true, opacity: 0.2 }));
      ch.position.set(0.03, y, 0);
      const gate = box(0.012, 0.11, 0.064, std(0xb8c4d6, { metalness: 0.7 }));
      gate.position.set(-0.035, y, 0);
      const l = makeLabel(name, { size: 0.026 });
      l.position.set(0.15, y, 0);
      group.add(body, ch, gate, l);
      return ch;
    };
    const chP = tr(0.52, 0xff6b81, 'PMOS');
    const chN = tr(0.24, 0x4da3ff, 'NMOS');
    const wm = std(0x8899aa);
    const v1 = box(0.006, 0.09, 0.006, wm);
    v1.position.set(0.03, 0.62, 0);
    const v2 = box(0.006, 0.08, 0.006, wm);
    v2.position.set(0.03, 0.38, 0);
    const v3 = box(0.006, 0.09, 0.006, wm);
    v3.position.set(0.03, 0.135, 0);
    const vin = box(0.006, 0.28, 0.006, wm);
    vin.position.set(-0.08, 0.38, 0);
    const vinH = box(0.1, 0.006, 0.006, wm);
    vinH.position.set(-0.13, 0.38, 0);
    const out = box(0.18, 0.006, 0.006, wm);
    out.position.set(0.12, 0.38, 0);
    group.add(v1, v2, v3, vin, vinH, out);
    [0.52, 0.24].forEach((y) => {
      const g = box(0.045, 0.006, 0.006, wm);
      g.position.set(-0.06, y, 0);
      group.add(g);
    });
    const inNode = sphere(0.02, basic(0x333333));
    inNode.position.set(-0.19, 0.38, 0);
    const outNode = sphere(0.022, basic(0x333333));
    outNode.position.set(0.22, 0.38, 0);
    const outGlow = halo(0x3ddc97, 0.06);
    outNode.add(outGlow);
    const li = makeLabel('V_in', { size: 0.028 });
    li.position.set(-0.19, 0.43, 0);
    const lo = makeLabel('V_out', { size: 0.028 });
    lo.position.set(0.22, 0.43, 0);
    group.add(inNode, outNode, li, lo);
    const NP = 12;
    const parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.007, 8, 6), basic(0xffe066), NP);
    group.add(parts);
    const m4 = new THREE.Matrix4();
    let cur = [0, VDD, 0];
    let ph = 0;
    return {
      onParam(P) {
        cur = solve(P.vin);
        const n = clamp01((P.vin - VT) / (VDD - VT));
        const p = clamp01((VDD - P.vin - VT) / (VDD - VT));
        chN.material.opacity = 0.15 + n * 0.8;
        chP.material.opacity = 0.15 + p * 0.8;
        const b = cur[0] / VDD;
        outNode.material.color.setRGB(0.2 + b * 0.3, 0.2 + b * 0.66, 0.2 + b * 0.39);
        outGlow.material.opacity = b * 0.5;
        const bi = P.vin / VDD;
        inNode.material.color.setRGB(0.2 + bi * 0.02, 0.2 + bi * 0.65, 0.2 + bi * 0.8);
      },
      update(dt) {
        const frac = cur[1] / imax;
        ph += dt * frac * 1.2;
        for (let i = 0; i < NP; i++) {
          const y = 0.66 - ((((i / NP + ph) % 1) + 1) % 1) * 0.56;
          parts.setMatrixAt(i, m4.makeTranslation(0.03, y, 0.036));
        }
        parts.count = frac > 0.03 ? NP : 0;
        parts.instanceMatrix.needsUpdate = true;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const p = new Plot(c, 90, 60, w - 150, h - 130, { xmin: 0, xmax: VDD, ymin: 0, ymax: VDD * 1.05 });
        p.axes({ xticks: niceTicks(0, VDD, 6), yticks: niceTicks(0, VDD, 6), xlabel: 'V_in [V]', ylabel: 'V_out [V]', title: '전압 전달 특성(VTC)과 관통 전류' });
        p.poly(curve.map(([x, , i]) => [x, (i / imax) * VDD * 0.9]), 'rgba(255,224,102,0.8)', { width: 3, fill: 'rgba(255,224,102,0.08)' });
        p.poly(curve.map(([x, y]) => [x, y]), C.accent, { width: 5 });
        p.dot(P.vin, cur[0], C.pink, 10);
        p.label(`(${P.vin.toFixed(1)}, ${cur[0].toFixed(2)})`, P.vin, cur[0], C.pink, { dx: 14, dy: -8 });
        legend(c, 110, h - 32, [[C.accent, 'V_out'], ['#ffe066', 'I_DD (상대값)']]);
      },
      readout(P) {
        const st = P.vin < VT ? 'PMOS ON · NMOS OFF → 출력 HIGH' : P.vin > VDD - VT ? 'PMOS OFF · NMOS ON → 출력 LOW' : '둘 다 부분 ON → 전환 구간';
        return [`V_out = ${cur[0].toFixed(2)} V · ${st}`, `I_DD = ${si(cur[1], 'A')}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 전력전자: 벅 컨버터
// ---------------------------------------------------------------------------
const LS = [10e-6, 22e-6, 47e-6, 100e-6];
export const buck = {
  title: '벅 컨버터 V_out = D·V_in',
  hint: '듀티비 D 를 바꾸면 출력 전압이 비례해서 바뀝니다. 인덕터 L 을 키우면 삼각파 전류 리플이 줄어들어요. 홀로그램은 실제보다 10만 배 느리게 보여 주는 스위치입니다.',
  params: [
    { id: 'vin', label: '입력 V_in', min: 5, max: 24, step: 1, value: 12, fmt: (v) => `${v} V` },
    { id: 'd', label: '듀티비 D', min: 0.1, max: 0.9, step: 0.05, value: 0.4, fmt: (v) => `${Math.round(v * 100)}%` },
    { id: 'l', label: '인덕터 L', options: LS.map((l) => si(l, 'H')), value: 1 },
  ],
  create({ group }) {
    const FSW = 100e3;
    const RL = 5;
    const calc = (P) => {
      const vo = P.d * P.vin;
      const io = vo / RL;
      const di = ((P.vin - vo) * P.d) / (LS[P.l] * FSW);
      return { vo, io, di, dcm: di / 2 > io };
    };
    // 3D: 스위치 · 다이오드 · 인덕터 · 커패시터 · 부하
    const base = box(0.6, 0.012, 0.2, std(0x16223a));
    base.position.y = 0.2;
    group.add(base);
    const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.045, 0.012, 80, 8, 1, 6), std(0xd08a3a, { metalness: 0.6, emissive: 0x000000 }));
    coil.position.set(0, 0.33, 0);
    const lL = makeLabel('L', { size: 0.03, color: '#ffb547' });
    lL.position.set(0, 0.42, 0);
    const sw = box(0.09, 0.012, 0.02, std(0xb8c4d6, { metalness: 0.8 }));
    sw.geometry.translate(0.045, 0, 0);
    sw.position.set(-0.26, 0.33, 0);
    const swL = makeLabel('스위치', { size: 0.024, color: '#93a6c3' });
    swL.position.set(-0.22, 0.4, 0);
    const pin = sphere(0.01, std(0x8899aa));
    pin.position.set(-0.165, 0.33, 0);
    const cap = cyl(0.03, 0.08, std(0x2b4c7e), 20);
    cap.position.set(0.15, 0.26, 0);
    const lamp = sphere(0.04, basic(0x553300));
    lamp.position.set(0.26, 0.33, 0);
    const lampGlow = halo(0xffc04d, 0.1);
    lamp.add(lampGlow);
    const ll = makeLabel('부하', { size: 0.024, color: '#93a6c3' });
    ll.position.set(0.26, 0.41, 0);
    group.add(coil, lL, sw, swL, pin, cap, lamp, ll);
    let t = 0;
    return {
      animated: true,
      onParam(P) {
        const r = calc(P);
        const b = clamp01(r.vo / 21.6);
        lamp.material.color.setRGB(0.33 + b * 0.67, 0.2 + b * 0.62, b * 0.4);
        lampGlow.material.opacity = b * 0.6;
      },
      update(dt, P) {
        t = (t + dt / 1.2) % 1;
        const on = t < P.d;
        sw.rotation.z = on ? 0 : 0.5;
        coil.material.emissive.setHex(on ? 0x3a2000 : 0x101820);
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const r = calc(P);
        const T = 1 / FSW;
        const top = new Plot(c, 90, 60, w - 120, 230, { xmin: 0, xmax: 3 * T, ymin: -1, ymax: 26 });
        top.axes({ xticks: [0, T, 2 * T, 3 * T], xfmt: (v) => `${Math.round(v * 1e6)} µs`, yticks: [0, 6, 12, 18, 24], title: '스위치 노드 전압 v_sw 와 출력 V_out' });
        top.fn((x) => ((x / T) % 1 < P.d ? P.vin : 0), C.accent, { width: 3.5, n: 1200 });
        top.hline(r.vo, C.pink, [10, 6], 3.5);
        top.label(`V_out = ${r.vo.toFixed(1)} V`, 3 * T, r.vo, C.pink, { align: 'right', dy: -6 });
        top.poly([[(t % 1) * T, -1], [(t % 1) * T, 26]], 'rgba(255,224,102,0.5)', { width: 2 });
        const imx = Math.max(1, r.io + r.di) * 1.25;
        const bot = new Plot(c, 90, 360, w - 120, h - 430, { xmin: 0, xmax: 3 * T, ymin: 0, ymax: imx });
        bot.axes({ xticks: [0, T, 2 * T, 3 * T], xfmt: (v) => `${Math.round(v * 1e6)} µs`, yticks: niceTicks(0, imx, 4), ylabel: 'i_L [A]', title: '인덕터 전류 i_L' });
        bot.fn((x) => {
          const ph = (x / T) % 1;
          const lo = r.io - r.di / 2;
          const v = ph < P.d ? lo + (r.di * ph) / P.d : lo + r.di - (r.di * (ph - P.d)) / (1 - P.d);
          return Math.max(0, v);
        }, '#ffb547', { width: 4, n: 1200 });
        bot.hline(r.io, 'rgba(255,255,255,0.4)');
      },
      readout(P) {
        const r = calc(P);
        return [`V_out = ${r.vo.toFixed(2)} V · I_out = ${r.io.toFixed(2)} A (부하 5 Ω)`, `전류 리플 Δi_L = ${r.di.toFixed(2)} A${r.dcm ? '  ⚠ 불연속 모드(DCM)에 가까움' : ''}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 안테나: 배열 안테나 빔 조향
// ---------------------------------------------------------------------------
const NS = [1, 2, 4, 8];
const DS = [0.25, 0.5, 1.0];
export const antenna = {
  title: '배열 안테나와 빔 조향',
  hint: '안테나 소자(노란 막대)가 앞뒤로 나란히 서 있고, 빔은 좌우로 뻗습니다. N 을 늘리면 빔이 날카로워지고, 위상차 β 를 돌리면 빔이 앞뒤로 휘어요(위상 배열 레이더·5G). 간격 d = 1λ 이면 원치 않는 그레이팅 로브가 생깁니다.',
  params: [
    { id: 'n', label: '소자 수 N', options: NS.map((n) => `${n}개`), value: 2 },
    { id: 'd', label: '간격 d', options: DS.map((d) => `${d} λ`), value: 1 },
    { id: 'b', label: '위상차 β', min: -180, max: 180, step: 30, value: 0, fmt: (v) => `${v}°` },
  ],
  create({ group }) {
    const cy = 0.4;
    const geo = new THREE.SphereGeometry(1, 72, 48);
    const base = geo.attributes.position.array.slice();
    const colors = new Float32Array(base.length);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    mesh.position.y = cy;
    group.add(mesh);
    const rods = [];
    for (let i = 0; i < 8; i++) {
      const r = cyl(0.004, 0.07, std(0xffe066, { emissive: 0x403000 }), 8);
      group.add(r);
      rods.push(r);
    }
    const beamArrow = makeArrow(0xffffff, 0.004);
    group.add(beamArrow);
    const lx = makeLabel('↕ 배열 축(앞뒤)', { size: 0.024, color: '#93a6c3' });
    lx.position.set(0, cy - 0.1, 0.12);
    group.add(lx);
    // 배열 축 = +Z. cosγ = 방향 벡터의 z 성분
    const AF = (cosg, N, d, b) => {
      if (N === 1) return 1;
      const psi = 2 * Math.PI * d * cosg + b;
      const s = Math.sin(psi / 2);
      if (Math.abs(s) < 1e-6) return 1;
      return Math.abs(Math.sin((N * psi) / 2) / (N * s));
    };
    const mainCos = ({ N, d, b }) => (N === 1 ? null : -b / (2 * Math.PI * d));
    const col = new THREE.Color();
    let cur = null;
    return {
      onParam(P) {
        const N = NS[P.n];
        const d = DS[P.d];
        const b = (P.b * Math.PI) / 180;
        cur = { N, d, b };
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          const z = base[i * 3 + 2];
          const elem = Math.sqrt(Math.max(0, 1 - y * y)); // 수직 다이폴: sin θ
          const r = AF(z, N, d, b) * elem;
          const R = 0.02 + r * 0.26;
          pos.setXYZ(i, x * R, y * R, z * R);
          col.setHSL(0.66 - r * 0.66, 1, 0.35 + r * 0.25);
          colors[i * 3] = col.r;
          colors[i * 3 + 1] = col.g;
          colors[i * 3 + 2] = col.b;
        }
        pos.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        geo.computeBoundingSphere();
        rods.forEach((r, i) => {
          r.visible = i < N;
          r.position.set(0, cy, (i - (N - 1) / 2) * d * 0.05);
        });
        const mc = mainCos(cur);
        beamArrow.visible = mc !== null && Math.abs(mc) <= 1;
        if (beamArrow.visible) setArrow(beamArrow, new THREE.Vector3(0, cy, 0), new THREE.Vector3(Math.sqrt(1 - mc * mc), 0, mc).multiplyScalar(0.33));
      },
      draw(c, w, h) {
        graphBg(c, w, h);
        const { N, d, b } = cur;
        const cx = w / 2;
        const cyy = h / 2 + 30;
        const R = Math.min(w, h) * 0.38;
        c.strokeStyle = 'rgba(120,170,220,0.2)';
        c.lineWidth = 1.5;
        for (const k of [0.25, 0.5, 0.75, 1]) {
          c.beginPath();
          c.arc(cx, cyy, R * k, 0, Math.PI * 2);
          c.stroke();
        }
        c.font = font(20, 600);
        c.fillStyle = C.dim;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (let a = 0; a < 360; a += 30) {
          const r = (a * Math.PI) / 180;
          c.beginPath();
          c.moveTo(cx, cyy);
          c.lineTo(cx + Math.cos(r) * R, cyy - Math.sin(r) * R);
          c.stroke();
        }
        c.fillText('← 왼쪽', cx - R - 10, cyy - 20);
        c.fillText('오른쪽 →', cx + R + 10, cyy - 20);
        c.fillText('학생 쪽 ↓', cx, cyy + R + 22);
        // 위에서 본 모습: 그림 x = 월드 x, 그림 아래쪽 = 월드 +Z(학생 쪽)
        c.beginPath();
        for (let i = 0; i <= 720; i++) {
          const ph = (i / 720) * Math.PI * 2;
          const r = AF(-Math.sin(ph), N, d, b) * R;
          const x = cx + Math.cos(ph) * r;
          const y = cyy - Math.sin(ph) * r;
          if (i) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.fillStyle = 'rgba(255,110,199,0.18)';
        c.fill();
        c.strokeStyle = C.pink;
        c.lineWidth = 3.5;
        c.stroke();
        c.fillStyle = '#ffe066';
        for (let i = 0; i < N; i++) {
          c.beginPath();
          c.arc(cx, cyy + (i - (N - 1) / 2) * d * 40, 6, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = C.text;
        c.font = font(26, 700);
        c.textAlign = 'left';
        c.textBaseline = 'top';
        c.fillText('수평면 방사 패턴 (위에서 본 모습)', 24, 20);
      },
      readout() {
        const mc = mainCos(cur);
        if (mc === null) return ['단일 다이폴: 수평면 전방향(도넛 모양)', '소자 수를 늘려 보세요'];
        const { N, d } = cur;
        const steer = Math.abs(mc) <= 1 ? (Math.asin(mc) * 180) / Math.PI : null;
        const where = steer === null ? '' : steer > 0.5 ? ' (학생 쪽으로)' : steer < -0.5 ? ' (뒤쪽으로)' : ' (정확히 좌우)';
        return [steer === null ? '주 빔 없음(위상차가 너무 큼)' : `주 빔: 좌우 방향에서 ${Math.abs(steer).toFixed(1)}° 조향${where}`, `빔 폭 ≈ ${(102 / (N * d)) | 0}°${d >= 1 ? '  ⚠ 그레이팅 로브!' : ''}`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 임베디드: PWM
// ---------------------------------------------------------------------------
const PF = [2, 20, 1000];
export const pwm = {
  title: 'PWM 으로 LED 밝기와 모터 속도 제어',
  hint: '듀티비를 바꾸면 평균 전압이 바뀌어 LED 밝기와 팬 속도가 달라집니다. 2 Hz 에서는 깜빡임이 보이지만, 1 kHz 로 올리면 눈에는 일정한 밝기로 보여요.',
  params: [
    { id: 'd', label: '듀티비', min: 0, max: 100, step: 10, value: 30, fmt: (v) => `${v}%` },
    { id: 'f', label: 'PWM 주파수', options: PF.map((f) => si(f, 'Hz')), value: 0 },
  ],
  create({ group }) {
    const ledMat = basic(0x330a0a);
    const led = sphere(0.05, ledMat, 24);
    led.position.set(-0.16, 0.42, 0);
    const glow = halo(0xff4040, 0.13);
    led.add(glow);
    const ledBase = cyl(0.055, 0.03, std(0x2b2f36), 24);
    ledBase.position.set(-0.16, 0.35, 0);
    const fan = new THREE.Group();
    fan.position.set(0.15, 0.42, 0);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), std(0x2b2f36));
    fan.add(frame);
    const blades = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const bl = box(0.09, 0.03, 0.004, std(0x9fd8ff, { metalness: 0.2 }));
      bl.geometry.translate(0.05, 0, 0);
      bl.rotation.z = (k / 5) * Math.PI * 2;
      bl.rotation.x = 0.3;
      blades.add(bl);
    }
    blades.add(cyl(0.02, 0.02, std(0x555c66), 16).rotateX(Math.PI / 2));
    fan.add(blades);
    const stand = box(0.015, 0.2, 0.015, std(0x2b2f36));
    stand.position.set(0.15, 0.24, 0);
    const l1 = makeLabel('LED', { size: 0.028, color: '#93a6c3' });
    l1.position.set(-0.16, 0.54, 0);
    const l2 = makeLabel('DC 모터 팬', { size: 0.028, color: '#93a6c3' });
    l2.position.set(0.15, 0.57, 0);
    group.add(led, ledBase, fan, stand, l1, l2);
    let t = 0;
    let speed = 0;
    let state = 0;
    return {
      animated: true,
      update(dt, P) {
        t += dt;
        const f = PF[P.f];
        const d = P.d / 100;
        state = f >= 1000 ? d : (t * f) % 1 < d ? 1 : 0;
        ledMat.color.setRGB(0.2 + state * 0.8, 0.04 + state * 0.25, 0.04 + state * 0.2);
        glow.material.opacity = state * 0.6;
        speed += (d * 25 - speed) * Math.min(1, dt * 1.5);
        blades.rotation.z -= speed * dt;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const d = P.d / 100;
        const p = new Plot(c, 80, 60, w - 110, h - 140, { xmin: 0, xmax: 3, ymin: -0.5, ymax: 6 });
        p.axes({ xticks: [0, 1, 2, 3], xfmt: (v) => `${v}T`, yticks: [0, 1, 2, 3, 4, 5], xlabel: '시간 (주기 T)', ylabel: 'V', title: `PWM 파형 · 듀티 ${P.d}% · ${si(PF[P.f], 'Hz')}` });
        p.fn((x) => (x % 1 < d ? 5 : 0), C.accent, { width: 4, n: 1500 });
        p.hline(5 * d, C.pink, [10, 6], 3.5);
        p.label(`평균 = ${(5 * d).toFixed(1)} V`, 3, 5 * d, C.pink, { align: 'right', dy: -6 });
        if (PF[P.f] < 1000) {
          const x = (t * PF[P.f]) % 3;
          p.poly([[x, -0.5], [x, 6]], 'rgba(255,224,102,0.6)', { width: 2 });
        }
        legend(c, 100, h - 32, [[C.accent, 'MCU 핀 출력 (0 / 5 V)'], [C.pink, '평균 전압']]);
      },
      readout(P) {
        return [`V_avg = D × 5 V = ${((P.d / 100) * 5).toFixed(2)} V`, PF[P.f] < 50 ? '주파수가 낮아 깜빡임이 눈에 보임' : '눈의 잔상 효과로 일정한 밝기로 보임'];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 반도체 공정: 단면으로 보는 8단계
// ---------------------------------------------------------------------------
const STEPS = [
  ['웨이퍼 준비', '단결정 실리콘(p형) 웨이퍼를 세정한다. 먼지 하나가 칩을 망가뜨리므로 클린룸에서 작업!'],
  ['산화', '약 1000 °C 산소 분위기에서 표면에 얇은 SiO₂ 절연막(흰색)을 기른다.'],
  ['감광액(PR) 도포', '웨이퍼를 빠르게 회전시키며 빛에 반응하는 감광액(빨강)을 얇고 고르게 바른다.'],
  ['노광', '마스크(검정 판)의 틈으로 자외선(보라)을 쏘아 PR 에 패턴을 새긴다. EUV 는 13.5 nm 빛을 쓴다.'],
  ['현상', '현상액으로 빛을 받은 PR 을 녹여 없앤다(포지티브 PR). 가운데에 창이 열린다.'],
  ['식각', '플라즈마로 PR 이 없는 곳의 산화막을 깎아 낸다. 이제 실리콘 표면이 드러났다.'],
  ['이온 주입', '인(P) 이온을 가속해 창 아래에 박아 넣어 n+ 영역(파랑)을 만든다. PR·산화막이 마스크 역할.'],
  ['금속 배선', 'PR 을 벗겨 내고 알루미늄·구리를 증착해 n+ 영역과 연결하는 전극(은색)을 만든다.'],
];
export const wafer = {
  title: '반도체 8대 공정 체험(단면)',
  hint: '공정 단계 ◀ ▶ 를 눌러 한 단계씩 진행하세요. 홀로그램의 단면 블록에 층이 쌓이고 깎이는 과정을 볼 수 있습니다.',
  params: [{ id: 'step', label: '공정 단계', options: STEPS.map((s, i) => `${i + 1}. ${s[0]}`), value: 0 }],
  create({ group }) {
    const Wd = 0.5;
    const D = 0.2;
    const sub = box(Wd, 0.14, D, std(0x5a6b88, { roughness: 0.4, metalness: 0.3 }));
    sub.position.y = 0.21;
    group.add(sub);
    const L = [];
    const layer = (x0, x1, y, hgt, mat, show) => {
      const m = box(x1 - x0, hgt, D, mat);
      m.geometry.translate(0, hgt / 2, 0);
      m.position.set((x0 + x1) / 2, y, 0);
      m.scale.y = 0.001;
      m.visible = false;
      group.add(m);
      L.push({ m, show, k: 0 });
      return m;
    };
    const oxMat = std(0xe8eef8, { transparent: true, opacity: 0.85, roughness: 0.2 });
    const prMat = std(0xd8344a, { roughness: 0.5 });
    const prExp = std(0xff9aa8, { roughness: 0.5, emissive: 0x401020 });
    const top = 0.28;
    const ow = 0.06;
    layer(-Wd / 2, -ow, top, 0.02, oxMat, (s) => s >= 1);
    layer(ow, Wd / 2, top, 0.02, oxMat, (s) => s >= 1);
    layer(-ow, ow, top, 0.02, oxMat, (s) => s >= 1 && s < 5);
    layer(-Wd / 2, -ow, top + 0.02, 0.03, prMat, (s) => s >= 2 && s < 7);
    layer(ow, Wd / 2, top + 0.02, 0.03, prMat, (s) => s >= 2 && s < 7);
    const prMid = layer(-ow, ow, top + 0.02, 0.03, prMat, (s) => s >= 2 && s < 4);
    layer(-ow, ow, top - 0.03, 0.03, std(0x3d7bff, { emissive: 0x0a2050, transparent: true, opacity: 0.9 }), (s) => s >= 6);
    layer(-ow + 0.005, ow - 0.005, top, 0.05, std(0xd9dde5, { metalness: 0.9, roughness: 0.25 }), (s) => s >= 7);
    layer(-0.16, 0.16, top + 0.05, 0.015, std(0xd9dde5, { metalness: 0.9, roughness: 0.25 }), (s) => s >= 7);
    // 노광: 마스크 + 자외선
    const mask = new THREE.Group();
    const mk1 = box(Wd / 2 - ow, 0.008, D + 0.04, basic(0x111111));
    mk1.position.set(-(Wd / 2 + ow) / 2, 0.52, 0);
    const mk2 = mk1.clone();
    mk2.position.x *= -1;
    const uv = box(ow * 2, 0.2, D, basic(0xa78bfa, { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    uv.position.set(0, 0.42, 0);
    const uvTop = box(Wd + 0.04, 0.1, D, basic(0xa78bfa, { transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    uvTop.position.set(0, 0.6, 0);
    mask.add(mk1, mk2, uv, uvTop);
    mask.visible = false;
    group.add(mask);
    // 이온 주입 입자
    const NI = 60;
    const ions = new THREE.InstancedMesh(new THREE.SphereGeometry(0.005, 6, 4), basic(0x7fb8ff), NI);
    ions.visible = false;
    group.add(ions);
    const ip = [];
    for (let i = 0; i < NI; i++) ip.push([(Math.random() - 0.5) * Wd * 0.95, Math.random(), (Math.random() - 0.5) * D * 0.9]);
    // 회전하는 전체 웨이퍼(장식)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0, '#8fa3c8');
    grd.addColorStop(0.5, '#d6c3f0');
    grd.addColorStop(1, '#8fd8e8');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(20,30,60,0.45)';
    g.lineWidth = 2;
    for (let x = 16; x < 512; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 512);
      g.stroke();
      g.beginPath();
      g.moveTo(0, x);
      g.lineTo(512, x);
      g.stroke();
    }
    const wt = new THREE.CanvasTexture(cv);
    wt.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.11, 48), new THREE.MeshStandardMaterial({ map: wt, metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide, transparent: true, alphaTest: 0.1 }));
    disc.position.set(0, 0.7, -0.08);
    group.add(disc);
    let step = 0;
    let t = 0;
    return {
      animated: false,
      onParam(P) {
        step = P.step;
      },
      update(dt) {
        t += dt;
        for (const l of L) {
          const want = l.show(step) ? 1 : 0;
          l.k += (want - l.k) * Math.min(1, dt * 4);
          if (Math.abs(want - l.k) < 0.005) l.k = want;
          l.m.visible = l.k > 0.01;
          l.m.scale.y = Math.max(0.001, l.k);
        }
        prMid.material = step === 3 ? prExp : prMat;
        mask.visible = step === 3;
        uv.material.opacity = 0.25 + Math.sin(t * 8) * 0.12;
        ions.visible = step === 6;
        if (ions.visible) {
          const m4 = new THREE.Matrix4();
          ip.forEach((p, i) => {
            p[1] = (p[1] + dt * 1.5) % 1;
            const inWin = Math.abs(p[0]) < ow;
            const stopY = inWin ? top - 0.015 : top + 0.05;
            const y = Math.max(stopY, 0.62 - p[1] * 0.4);
            ions.setMatrixAt(i, m4.makeTranslation(p[0], y, p[2]));
          });
          ions.instanceMatrix.needsUpdate = true;
        }
        disc.rotation.z += dt * 0.3;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        c.textBaseline = 'top';
        c.textAlign = 'left';
        const rowH = 50;
        STEPS.forEach(([name], i) => {
          const y = 30 + i * rowH;
          const cur = i === P.step;
          if (cur) {
            c.fillStyle = 'rgba(56,217,255,0.18)';
            c.fillRect(20, y - 6, w - 40, rowH - 4);
          }
          c.fillStyle = i < P.step ? C.ok : cur ? C.accent : C.dim;
          c.font = font(cur ? 30 : 26, cur ? 800 : 600);
          c.fillText(`${i < P.step ? '✔' : i + 1 + '.'} ${name}`, 40, y);
        });
        c.fillStyle = C.text;
        c.font = font(27, 500);
        const y0 = 30 + STEPS.length * rowH + 16;
        c.strokeStyle = C.line;
        c.beginPath();
        c.moveTo(30, y0 - 8);
        c.lineTo(w - 30, y0 - 8);
        c.stroke();
        drawWrapped(c, STEPS[P.step][1], 40, y0 + 6, w - 80, 38, 3);
      },
      readout(P) {
        return [`현재: ${P.step + 1}. ${STEPS[P.step][0]}`, P.step === STEPS.length - 1 ? '🎉 트랜지스터의 한 영역이 완성되었습니다!' : '다음 단계 ▶ 를 눌러 진행하세요'];
      },
    };
  },
};

