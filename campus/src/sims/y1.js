import * as THREE from 'three';
import { C, si, makeLabel, makeArrow, setArrow, shuffle } from '../core/util.js';
import { graphBg, Plot, legend, niceTicks } from './graph.js';
import { std, basic, box, sphere, cyl, Segments, halo, fibonacciDirs } from './kit.js';

/*
 * 시뮬레이션 정의
 *   params : 숫자형 { id, label, min, max, step, value, fmt } 또는 선택형 { id, label, options, value }
 *   actions: 버튼 { id, label }
 *   create(env) → { update(dt, P), draw(c, w, h, P), readout(P), onParam(P, id), onAction(id, P), animated }
 *   env.group 에 3D 를 넣으면 홀로그램 받침대 위에 표시된다(+Z 쪽이 학생 방향).
 */

const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));

// ---------------------------------------------------------------------------
// 미적분학: 테일러 급수
// ---------------------------------------------------------------------------
export const taylor = {
  title: '테일러 급수 근사',
  hint: '항의 개수 N 을 하나씩 늘려 보세요. 근사 다항식(분홍)이 원래 함수(파랑)에 점점 더 넓은 범위에서 겹칩니다.',
  params: [
    { id: 'fn', label: '함수', options: ['sin x', 'cos x', 'eˣ'], value: 0 },
    { id: 'n', label: '항의 개수 N', min: 1, max: 10, step: 1, value: 2, fmt: (v) => `${v}개` },
  ],
  create() {
    const exact = [Math.sin, Math.cos, Math.exp];
    const partial = (fn, n, x) => {
      let s = 0;
      for (let k = 0; k < n; k++) {
        if (fn === 0) s += ((k % 2 ? -1 : 1) * Math.pow(x, 2 * k + 1)) / fact(2 * k + 1);
        else if (fn === 1) s += ((k % 2 ? -1 : 1) * Math.pow(x, 2 * k)) / fact(2 * k);
        else s += Math.pow(x, k) / fact(k);
      }
      return s;
    };
    const terms = (fn, n) => {
      const out = [];
      for (let k = 0; k < Math.min(n, 4); k++) {
        if (fn === 0) out.push(k === 0 ? 'x' : `${k % 2 ? '−' : '+'} x${sup(2 * k + 1)}/${2 * k + 1}!`);
        else if (fn === 1) out.push(k === 0 ? '1' : `${k % 2 ? '−' : '+'} x${sup(2 * k)}/${2 * k}!`);
        else out.push(k === 0 ? '1' : k === 1 ? '+ x' : `+ x${sup(k)}/${k}!`);
      }
      return out.join(' ') + (n > 4 ? ' + …' : '');
    };
    return {
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const isExp = P.fn === 2;
        const r = isExp ? { xmin: -4, xmax: 3, ymin: -2, ymax: 16 } : { xmin: -7, xmax: 7, ymin: -2.5, ymax: 2.5 };
        const p = new Plot(c, 70, 60, w - 100, h - 120, r);
        p.axes({ xticks: niceTicks(r.xmin, r.xmax, 7), yticks: niceTicks(r.ymin, r.ymax, 5), xlabel: 'x', title: `${taylor.params[0].options[P.fn]} 와 ${P.n}항 근사` });
        p.fn(exact[P.fn], C.accent, { width: 5 });
        p.fn((x) => partial(P.fn, P.n, x), C.pink, { width: 4, glow: true });
        legend(c, 90, h - 30, [[C.accent, '원래 함수'], [C.pink, `${P.n}항 테일러 근사`]]);
      },
      readout(P) {
        const x0 = P.fn === 2 ? 2 : Math.PI;
        const err = Math.abs(exact[P.fn](x0) - partial(P.fn, P.n, x0));
        return [`근사식: ${terms(P.fn, P.n)}`, `x = ${P.fn === 2 ? '2' : 'π'} 에서 오차: ${err < 1e-4 ? err.toExponential(1) : err.toFixed(4)}`];
      },
    };
  },
};

function sup(n) {
  const m = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  return String(n).split('').map((d) => m[+d]).join('');
}

// ---------------------------------------------------------------------------
// 일반물리: 두 전하의 전기장(3D 전기력선)
// ---------------------------------------------------------------------------
export const coulomb = {
  title: '두 점전하의 전기장',
  hint: '홀로그램에서 전기력선이 + 에서 나와 − 로 들어가는 모습을 보세요. 부호를 같게 하면 척력, 다르게 하면 인력! 흐르는 빛 알갱이는 전기장 방향입니다.',
  params: [
    { id: 'q1', label: '전하 q₁', min: -3, max: 3, step: 1, value: 2, fmt: (v) => `${v > 0 ? '+' : ''}${v} µC` },
    { id: 'q2', label: '전하 q₂', min: -3, max: 3, step: 1, value: -2, fmt: (v) => `${v > 0 ? '+' : ''}${v} µC` },
    { id: 'r', label: '거리 r', min: 4, max: 20, step: 2, value: 10, fmt: (v) => `${v} cm` },
  ],
  create({ group }) {
    const cy = 0.36;
    const charges = [0, 1].map(() => {
      const m = sphere(0.032, std(0xffffff, { emissive: 0x000000 }));
      group.add(m);
      const h = halo(0xffffff, 0.06);
      m.add(h);
      const arrow = makeArrow(0xffe066, 0.006);
      group.add(arrow);
      return { mesh: m, halo: h, arrow, pos: new THREE.Vector3(), q: 0, label: null };
    });
    const lines = new Segments(9000, 0xbfe6ff, 0.55);
    group.add(lines.mesh);
    const dots = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xfff3a0, size: 0.012, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    dots.frustumCulled = false;
    group.add(dots);
    let paths = [];
    let phases = [];

    const field = (p, out) => {
      out.set(0, 0, 0);
      for (const ch of charges) {
        if (!ch.q) continue;
        const d = p.clone().sub(ch.pos);
        const r3 = Math.pow(Math.max(d.length(), 0.01), 3);
        out.addScaledVector(d, ch.q / r3);
      }
      return out;
    };

    const rebuild = (P) => {
      const s = 0.06 + ((P.r - 4) / 16) * 0.44;
      charges[0].pos.set(-s / 2, cy, 0);
      charges[1].pos.set(s / 2, cy, 0);
      charges[0].q = P.q1;
      charges[1].q = P.q2;
      for (const ch of charges) {
        ch.mesh.position.copy(ch.pos);
        const col = ch.q > 0 ? 0xff5d6c : ch.q < 0 ? 0x4da3ff : 0x888888;
        ch.mesh.material.color.setHex(col);
        ch.mesh.material.emissive.setHex(col).multiplyScalar(0.5);
        ch.halo.material.color.setHex(col);
        ch.mesh.scale.setScalar(0.7 + Math.abs(ch.q) * 0.15);
        if (ch.label) {
          ch.label.userData.disposeLabel();
          group.remove(ch.label);
        }
        ch.label = makeLabel(`${ch.q > 0 ? '+' : ''}${ch.q} µC`, { size: 0.035, color: '#ffffff' });
        ch.label.position.copy(ch.pos).add(new THREE.Vector3(0, 0.09, 0));
        group.add(ch.label);
      }
      // 전기력선 적분
      const anyPos = charges.some((c) => c.q > 0);
      const seeds = charges.filter((c) => (anyPos ? c.q > 0 : c.q < 0));
      const sign = anyPos ? 1 : -1;
      lines.begin();
      paths = [];
      const E = new THREE.Vector3();
      for (const ch of seeds) {
        const n = 8 + Math.abs(ch.q) * 6;
        for (const dir of fibonacciDirs(n)) {
          const p = ch.pos.clone().addScaledVector(dir, 0.036);
          const path = [p.clone()];
          for (let i = 0; i < 260; i++) {
            field(p, E);
            const len = E.length();
            if (len < 1e-9) break;
            const prev = p.clone();
            p.addScaledVector(E, (sign * 0.007) / len);
            lines.add(prev, p);
            path.push(p.clone());
            if (p.distanceTo(new THREE.Vector3(0, cy, 0)) > 0.4) break;
            if (charges.some((c) => c !== ch && c.q && p.distanceTo(c.pos) < 0.03)) break;
          }
          if (path.length > 4) paths.push(path);
        }
      }
      lines.end();
      phases = paths.map(() => Math.random());
      dots.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(paths.length * 3), 3));
      // 쿨롱 힘 화살표
      const F = (8.99e9 * P.q1 * P.q2 * 1e-12) / Math.pow(P.r / 100, 2);
      const L = Math.abs(F) > 0 ? Math.min(0.16, 0.03 + 0.045 * Math.log10(1 + Math.abs(F))) : 0;
      const dirOut = Math.sign(F); // + 면 서로 밀어냄
      setArrow(charges[0].arrow, charges[0].pos.clone().add(new THREE.Vector3(-0.04 * dirOut || 0, 0, 0)), new THREE.Vector3(-L * dirOut, 0, 0));
      setArrow(charges[1].arrow, charges[1].pos.clone().add(new THREE.Vector3(0.04 * dirOut || 0, 0, 0)), new THREE.Vector3(L * dirOut, 0, 0));
    };

    return {
      onParam: rebuild,
      update(dt) {
        const pos = dots.geometry.attributes.position;
        if (!pos) return;
        for (let i = 0; i < paths.length; i++) {
          const path = paths[i];
          phases[i] = (phases[i] + dt * 0.35) % 1;
          const k = phases[i] * (path.length - 1);
          const a = path[Math.floor(k)];
          const b = path[Math.min(path.length - 1, Math.floor(k) + 1)];
          const f = k - Math.floor(k);
          pos.setXYZ(i, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
        }
        pos.needsUpdate = true;
      },
      readout(P) {
        const F = (8.99e9 * P.q1 * P.q2 * 1e-12) / Math.pow(P.r / 100, 2);
        const kind = F > 0 ? '척력(밀어냄)' : F < 0 ? '인력(끌어당김)' : '힘 없음';
        return [`F = k·q₁q₂/r² = ${Math.abs(F).toPrecision(3)} N  · ${kind}`, `노란 화살표 = 각 전하가 받는 힘`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 선형대수: 2×2 행렬의 선형 변환
// ---------------------------------------------------------------------------
export const matrix = {
  title: '선형 변환 A = [[a, b], [c, d]]',
  hint: 'a, b, c, d 를 바꾸면 격자가 늘어나고 기울어집니다. 빨강 î 은 (a, c), 초록 ĵ 은 (b, d) 로 이동! 노란 평행사변형의 넓이가 행렬식입니다.',
  params: [
    { id: 'a', label: 'a', min: -2, max: 2, step: 0.5, value: 1.5, fmt: (v) => v.toFixed(1) },
    { id: 'b', label: 'b', min: -2, max: 2, step: 0.5, value: 0.5, fmt: (v) => v.toFixed(1) },
    { id: 'c', label: 'c', min: -2, max: 2, step: 0.5, value: 0, fmt: (v) => v.toFixed(1) },
    { id: 'd', label: 'd', min: -2, max: 2, step: 0.5, value: 1, fmt: (v) => v.toFixed(1) },
  ],
  actions: [{ id: 'replay', label: '▶ 변환 다시 보기' }],
  create({ group }) {
    const u = 0.072;
    const origin = new THREE.Vector3(0, 0.4, 0);
    const base = new Segments(20, 0x5d6f8c, 0.5);
    const grid = new Segments(40, 0x38d9ff, 0.85);
    const eig = new Segments(4, 0xffe066, 0.9);
    group.add(base.mesh, grid.mesh, eig.mesh);
    base.begin();
    for (let i = -2; i <= 2; i++) {
      base.addXYZ(i * u, origin.y - 2 * u, -0.002, i * u, origin.y + 2 * u, -0.002);
      base.addXYZ(-2 * u, origin.y + i * u, -0.002, 2 * u, origin.y + i * u, -0.002);
    }
    base.end();
    const ihat = makeArrow(0xff5d6c, 0.005);
    const jhat = makeArrow(0x3ddc97, 0.005);
    group.add(ihat, jhat);
    const areaGeo = new THREE.BufferGeometry();
    areaGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    areaGeo.setIndex([0, 1, 2, 0, 2, 3]);
    const area = new THREE.Mesh(areaGeo, basic(0xffe066, { transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    area.frustumCulled = false;
    group.add(area);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.66), basic(0x0a1830, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    back.position.set(0, origin.y, -0.01);
    group.add(back);

    let t = 0;
    let M = [1, 0, 0, 1];
    const map = (m, x, y) => new THREE.Vector3((m[0] * x + m[1] * y) * u, origin.y + (m[2] * x + m[3] * y) * u, 0);
    const draw = (m, showEig) => {
      grid.begin();
      for (let i = -2; i <= 2; i++) {
        grid.add(map(m, i, -2), map(m, i, 2));
        grid.add(map(m, -2, i), map(m, 2, i));
      }
      grid.end();
      setArrow(ihat, origin, map(m, 1, 0).sub(origin));
      setArrow(jhat, origin, map(m, 0, 1).sub(origin));
      const pts = [map(m, 0, 0), map(m, 1, 0), map(m, 1, 1), map(m, 0, 1)];
      const pa = areaGeo.attributes.position;
      pts.forEach((p, i) => pa.setXYZ(i, p.x, p.y, 0.001));
      pa.needsUpdate = true;
      const det = m[0] * m[3] - m[1] * m[2];
      area.material.color.setHex(det < 0 ? 0xff5d6c : 0xffe066);
      eig.begin();
      if (showEig) {
        for (const v of eigen(M).vecs) {
          const L = 2.6;
          eig.addXYZ(-v[0] * L * u, origin.y - v[1] * L * u, 0.002, v[0] * L * u, origin.y + v[1] * L * u, 0.002);
        }
      }
      eig.end();
    };
    return {
      onParam(P) {
        M = [P.a, P.b, P.c, P.d];
        t = 0;
      },
      onAction() {
        t = 0;
      },
      update(dt) {
        if (t > 1.2) return;
        t += dt / 1.6;
        const e = Math.min(1, t) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * Math.min(1, t) + 2, 2) / 2;
        const m = [1 + (M[0] - 1) * e, M[1] * e, M[2] * e, 1 + (M[3] - 1) * e];
        draw(m, t >= 1);
      },
      readout(P) {
        const det = P.a * P.d - P.b * P.c;
        const ev = eigen([P.a, P.b, P.c, P.d]);
        return [
          `det A = ad − bc = ${det.toFixed(2)}${det === 0 ? '  → 역행렬 없음!' : det < 0 ? '  → 방향 뒤집힘' : ''}`,
          ev.real ? `고유값 λ = ${ev.l.map((x) => x.toFixed(2)).join(', ')}  (노란 선 = 고유벡터)` : `고유값 = ${ev.re.toFixed(2)} ± ${ev.im.toFixed(2)}j  (회전 성분 → 실수 고유벡터 없음)`,
        ];
      },
    };
  },
};

function eigen([a, b, c, d]) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < -1e-9) return { real: false, re: tr / 2, im: Math.sqrt(-disc) / 2, vecs: [] };
  const s = Math.sqrt(Math.max(0, disc));
  const l = [(tr + s) / 2, (tr - s) / 2];
  const vecs = [];
  for (const lam of l) {
    let v;
    if (Math.abs(b) > 1e-9) v = [b, lam - a];
    else if (Math.abs(c) > 1e-9) v = [lam - d, c];
    else v = Math.abs(lam - a) < 1e-9 ? [1, 0] : [0, 1];
    const n = Math.hypot(v[0], v[1]) || 1;
    vecs.push([v[0] / n, v[1] / n]);
  }
  if (Math.abs(disc) < 1e-9) vecs.pop();
  return { real: true, l: Math.abs(disc) < 1e-9 ? [l[0]] : l, vecs };
}

// ---------------------------------------------------------------------------
// C 프로그래밍: 정렬 알고리즘
// ---------------------------------------------------------------------------
export const sort = {
  title: '정렬 알고리즘 시각화',
  hint: '[섞기] 후 [▶ 정렬 시작]을 누르세요. 노란 막대는 비교, 빨간 막대는 교환 중입니다. 알고리즘마다 비교 횟수가 얼마나 다른지 비교해 보세요.',
  params: [
    { id: 'algo', label: '알고리즘', options: ['버블 정렬', '선택 정렬', '삽입 정렬', '퀵 정렬'], value: 0 },
    { id: 'speed', label: '속도', options: ['느리게', '보통', '빠르게', '매우 빠르게'], value: 1 },
  ],
  actions: [
    { id: 'shuffle', label: '🔀 섞기' },
    { id: 'run', label: '▶ 정렬 시작' },
  ],
  create({ group, audio, refresh }) {
    const N = 16;
    const bars = [];
    const plate = box(0.72, 0.02, 0.16, std(0x16223a));
    plate.position.y = 0.09;
    group.add(plate);
    for (let i = 0; i < N; i++) {
      const v = i + 1;
      const m = box(0.03, 1, 0.05, std(0x38d9ff, { emissive: 0x0b2c38 }));
      m.scale.y = v * 0.026;
      group.add(m);
      bars.push({ v, mesh: m, x: 0 });
    }
    let arr = shuffle(bars);
    let gen = null;
    let running = false;
    let timer = 0;
    let cmp = 0;
    let swp = 0;
    let done = false;
    let hl = [];
    let runLabel = '▶ 정렬 시작';
    const slotX = (i) => (i - (N - 1) / 2) * 0.042;

    function* bubble(a) {
      for (let i = 0; i < a.length - 1; i++)
        for (let j = 0; j < a.length - 1 - i; j++) {
          yield ['cmp', j, j + 1];
          if (a[j].v > a[j + 1].v) yield ['swap', j, j + 1];
        }
    }
    function* selection(a) {
      for (let i = 0; i < a.length - 1; i++) {
        let m = i;
        for (let j = i + 1; j < a.length; j++) {
          yield ['cmp', m, j];
          if (a[j].v < a[m].v) m = j;
        }
        if (m !== i) yield ['swap', i, m];
      }
    }
    function* insertion(a) {
      for (let i = 1; i < a.length; i++)
        for (let j = i; j > 0; j--) {
          yield ['cmp', j - 1, j];
          if (a[j - 1].v > a[j].v) yield ['swap', j - 1, j];
          else break;
        }
    }
    function* quick(a, lo = 0, hi = a.length - 1) {
      if (lo >= hi) return;
      let i = lo;
      for (let j = lo; j < hi; j++) {
        yield ['cmp', j, hi];
        if (a[j].v < a[hi].v) {
          if (i !== j) yield ['swap', i, j];
          i++;
        }
      }
      if (i !== hi) yield ['swap', i, hi];
      yield* quick(a, lo, i - 1);
      yield* quick(a, i + 1, hi);
    }
    const algos = [bubble, selection, insertion, quick];
    const color = (m, hex, em) => {
      m.material.color.setHex(hex);
      m.material.emissive.setHex(em);
    };
    const reset = (P, doShuffle) => {
      if (doShuffle) arr = shuffle(bars);
      gen = algos[P.algo](arr);
      running = false;
      cmp = swp = 0;
      done = false;
      hl = [];
      runLabel = '▶ 정렬 시작';
    };
    return {
      actionLabel: (id) => (id === 'run' ? runLabel : null),
      onParam(P, id) {
        if (id === 'algo' || id === undefined) reset(P, id === undefined);
      },
      onAction(id, P) {
        if (id === 'shuffle') reset(P, true);
        if (id === 'run') {
          if (done) reset(P, true);
          running = !running;
          runLabel = running ? '⏸ 일시정지' : '▶ 계속';
        }
      },
      update(dt, P) {
        const rate = [3, 8, 20, 60][P.speed];
        if (running && !done) {
          timer += dt * rate;
          while (timer >= 1 && !done) {
            timer -= 1;
            const step = gen.next();
            if (step.done) {
              done = true;
              running = false;
              hl = [];
              runLabel = '🔁 다시 섞어 정렬';
              audio.play('ok');
              refresh();
              break;
            }
            const [type, i, j] = step.value;
            hl = [type, i, j];
            if (type === 'cmp') cmp++;
            else {
              swp++;
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            refresh();
          }
        }
        arr.forEach((b, i) => {
          b.x += (slotX(i) - b.x) * Math.min(1, dt * 14);
          b.mesh.position.set(b.x, 0.1 + b.mesh.scale.y / 2, 0);
          if (done) color(b.mesh, 0x3ddc97, 0x0c3a24);
          else if (hl[0] && (i === hl[1] || i === hl[2])) color(b.mesh, hl[0] === 'cmp' ? 0xffe066 : 0xff5d6c, hl[0] === 'cmp' ? 0x3a3000 : 0x3a0808);
          else color(b.mesh, 0x38d9ff, 0x0b2c38);
        });
      },
      readout(P) {
        const big = ['O(n²)', 'O(n²)', 'O(n²)', 'O(n log n) 평균'][P.algo];
        return [`비교 ${cmp}회 · 교환 ${swp}회${done ? ' · 완료!' : ''}`, `시간 복잡도: ${big}   (n = ${N})`];
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 전기전자공학개론: 옴의 법칙 회로
// ---------------------------------------------------------------------------
const R_LIST = [10, 22, 47, 100, 220, 470, 1000];
export const ohm = {
  title: '옴의 법칙 — 전지·저항·전구',
  hint: '전압 V 를 올리거나 저항 R 을 줄이면 전류 I 가 커져 홀로그램 속 전자가 빨라지고 전구가 밝아집니다. 그래프의 점이 동작점입니다.',
  params: [
    { id: 'v', label: '전압 V', min: 0, max: 12, step: 1, value: 6, fmt: (v) => `${v} V` },
    { id: 'r', label: '저항 R', options: R_LIST.map((r) => si(r, 'Ω')), value: 3 },
  ],
  create({ group }) {
    const z = 0;
    const L = -0.24;
    const Rt = 0.24;
    const B = 0.1;
    const T = 0.56;
    const wireMat = std(0xd08a3a, { metalness: 0.6, roughness: 0.35 });
    const seg = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const m = cyl(0.005, len, wireMat, 8);
      m.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
      m.rotation.z = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
      group.add(m);
    };
    seg(L, B, Rt, B);
    seg(Rt, B, Rt, T);
    seg(Rt, T, L, T);
    seg(L, T, L, B);
    // 전지
    const bat = cyl(0.035, 0.14, std(0x2b2f36), 24);
    bat.position.set(L, 0.33, z);
    const cap = cyl(0.036, 0.04, std(0xc0392b), 24);
    cap.position.set(L, 0.42, z);
    group.add(bat, cap);
    const plus = makeLabel('+', { size: 0.04, color: '#ff8a8a' });
    plus.position.set(L + 0.06, 0.42, z);
    group.add(plus);
    // 저항
    const res = cyl(0.018, 0.11, std(0xe6d3a3), 16);
    res.rotation.z = Math.PI / 2;
    res.position.set(0, T, z);
    group.add(res);
    [-0.03, -0.01, 0.01, 0.035].forEach((x, i) => {
      const band = cyl(0.0195, 0.008, std([0x8b4513, 0x000000, 0xc0392b, 0xd4af37][i]), 16);
      band.rotation.z = Math.PI / 2;
      band.position.set(x, T, z);
      group.add(band);
    });
    // 전구
    const bulbMat = basic(0xffd27a, { transparent: true, opacity: 0.9 });
    const bulb = sphere(0.045, bulbMat, 24);
    bulb.position.set(Rt, 0.33, z);
    const glow = halo(0xffc04d, 0.11);
    bulb.add(glow);
    group.add(bulb);
    // 전자
    const n = 44;
    const eMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 8, 6), basic(0x7fd4ff), n);
    group.add(eMesh);
    const perim = 2 * (Rt - L) + 2 * (T - B);
    const at = (s) => {
      s = ((s % perim) + perim) % perim;
      const w = Rt - L;
      const hh = T - B;
      if (s < w) return [L + s, B];
      s -= w;
      if (s < hh) return [Rt, B + s];
      s -= hh;
      if (s < w) return [Rt - s, T];
      s -= w;
      return [L, T - s];
    };
    let phase = 0;
    const m4 = new THREE.Matrix4();
    const label = makeLabel('전자 흐름 (− → +)', { size: 0.028, color: '#7fd4ff' });
    label.position.set(0, 0.05, z);
    group.add(label);
    let I = 0;
    return {
      onParam(P) {
        I = P.v / R_LIST[P.r];
        const Pw = P.v * I;
        const b = Math.min(1, Math.log10(1 + Pw * 20) / Math.log10(1 + 14.4 * 20));
        bulbMat.color.setRGB(0.25 + b * 0.75, 0.2 + b * 0.62, 0.12 + b * 0.35);
        glow.material.opacity = b * 0.55;
        glow.scale.setScalar(0.6 + b * 0.8);
      },
      update(dt) {
        // 전자는 전류와 반대 방향(전지 − 극 → 회로 → + 극)
        phase -= dt * Math.min(0.5, 0.02 + Math.sqrt(I) * 0.35);
        for (let i = 0; i < n; i++) {
          const [x, y] = at(phase + (i / n) * perim);
          m4.makeTranslation(x, y, z + 0.008);
          eMesh.setMatrixAt(i, m4);
        }
        eMesh.instanceMatrix.needsUpdate = true;
      },
      draw(c, w, h, P) {
        graphBg(c, w, h);
        const p = new Plot(c, 90, 60, w - 130, h - 130, { xmin: 0, xmax: 12, ymin: 0, ymax: 1.25 });
        p.axes({ xticks: niceTicks(0, 12, 6), yticks: niceTicks(0, 1.2, 6), xlabel: 'V [V]', ylabel: 'I [A]', title: 'I-V 특성: I = V / R' });
        R_LIST.forEach((r, i) => {
          if (i !== P.r) p.fn((v) => v / r, 'rgba(147,166,195,0.35)', { width: 2 });
        });
        p.fn((v) => v / R_LIST[P.r], C.accent, { width: 5, glow: true });
        p.dot(P.v, P.v / R_LIST[P.r], C.pink, 10);
        legend(c, 110, h - 32, [[C.accent, `R = ${si(R_LIST[P.r], 'Ω')}`], ['rgba(147,166,195,0.6)', '다른 저항값']]);
      },
      readout(P) {
        const i = P.v / R_LIST[P.r];
        return [`I = V/R = ${si(i, 'A')}`, `P = V·I = ${si(P.v * i, 'W')}`];
      },
    };
  },
};
