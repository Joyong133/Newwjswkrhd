import * as THREE from 'three';
import { Panel, drawCard, setMaxAnisotropy, redrawAll } from './core/panel.js';
import { C, font, damp } from './core/util.js';
import { Audio } from './core/audio.js';
import { XRInput, DesktopInput } from './core/input.js';
import { Locomotion } from './core/locomotion.js';
import { Interact } from './core/interact.js';
import { Progress } from './progress.js';
import { CURRICULUM } from './content/index.js';
import { buildCampus, YEAR_YAWS, STATION_RADIUS, HALL_RADIUS } from './world/campus.js';
import { YearStation } from './world/station.js';
import { Directory, makeDiploma } from './world/directory.js';
import { QuickMenu } from './world/menu.js';

const $ = (id) => document.getElementById(id);
const START = { pos: new THREE.Vector3(0, 0, 3.6), yaw: 0 };

async function loadFonts() {
  if (!document.fonts?.load) return;
  const sample = '전자공학과 캠퍼스 회로 신호 반도체 강의 실습 퀴즈 가나다라마바사아자차카타파하 0123456789 ABCabc ①②③④';
  const specs = ['900 40px "Noto Sans KR"', '800 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '500 40px "Noto Sans KR"', '700 40px "JetBrains Mono"'];
  await Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}

/** 머리를 느슨하게 따라오는 알림 */
class Notice {
  constructor(scene, camera) {
    this.camera = camera;
    this.text = '';
    this.timer = 0;
    this.opacity = 0;
    this.panel = new Panel({
      width: 0.7,
      height: 0.13,
      px: 1100,
      name: 'notice',
      depthTest: false,
      draw: (c, w, h) => {
        if (!this.text) return;
        drawCard(c, w, h, { accent: C.ok, radius: 36 });
        c.fillStyle = C.text;
        c.font = font(50, 800);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(this.text, w / 2, h / 2 + 2, w - 60);
      },
    });
    this.panel.mesh.renderOrder = 60;
    this.panel.mesh.visible = false;
    scene.add(this.panel.mesh);
  }

  show(text, sec = 2.6) {
    this.text = text;
    this.timer = sec;
    this.panel.redraw();
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.htm);
    this.htm = setTimeout(() => el.classList.add('hidden'), sec * 1000);
  }

  update(dt, xr) {
    this.timer -= dt;
    this.opacity = damp(this.opacity, this.timer > 0 ? 1 : 0, 10, dt);
    const m = this.panel.mesh;
    m.visible = xr && this.opacity > 0.02;
    this.panel.material.opacity = this.opacity;
    if (!m.visible) return;
    const pos = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    m.position.copy(pos).addScaledVector(dir, 1.0);
    m.position.y -= 0.25;
    m.lookAt(pos);
  }
}

/** 졸업 축하 색종이 */
class Confetti {
  constructor(scene) {
    this.n = 500;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.raycast = () => {};
    scene.add(this.points);
    this.t = 0;
  }

  burst(at) {
    const cols = ['#38d9ff', '#3ddc97', '#ffb547', '#c084fc', '#ff6ec7', '#ffd166'].map((h) => new THREE.Color(h));
    for (let i = 0; i < this.n; i++) {
      this.pos.set([at.x, at.y, at.z], i * 3);
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 1.5 + 0.5;
      v.multiplyScalar(2 + Math.random() * 3);
      this.vel.set([v.x, v.y, v.z], i * 3);
      const cc = cols[i % cols.length];
      this.col.set([cc.r, cc.g, cc.b], i * 3);
    }
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.visible = true;
    this.t = 6;
  }

  update(dt) {
    if (!this.points.visible) return;
    this.t -= dt;
    for (let i = 0; i < this.n; i++) {
      this.vel[i * 3 + 1] -= 3.2 * dt;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= 1 - dt * 0.9;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      if (this.pos[i * 3 + 1] < 0.02) this.pos[i * 3 + 1] = 0.02;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = Math.min(1, this.t);
    if (this.t <= 0) this.points.visible = false;
  }
}

async function boot() {
  await loadFonts();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(0.6);
  $('app').appendChild(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080f);
  scene.fog = new THREE.Fog(0x05080f, 22, 60);
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 120);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  camera.position.set(0, 1.6, 0);

  const audio = new Audio();
  const progress = new Progress(CURRICULUM);
  const locomotion = new Locomotion({ rig, camera, audio, radius: HALL_RADIUS - 1.6 });
  const interact = new Interact({ scene, camera, audio, locomotion });
  const xrInput = new XRInput(renderer, rig);
  const desktop = new DesktopInput(camera, renderer.domElement, rig);
  locomotion.desktop = desktop;
  const notice = new Notice(scene, camera);
  const confetti = new Confetti(scene);

  audio.enabled = progress.setting('sound', true);
  audio.speechOn = progress.setting('speech', true);

  const ctx = {
    scene,
    camera,
    interact,
    audio,
    progress,
    heightOffset: progress.setting('height', 0),
    notify: (t) => notice.show(t),
  };
  locomotion.setHeightOffset(ctx.heightOffset);

  const campus = buildCampus(scene, interact);
  const stations = CURRICULUM.map((year, i) => new YearStation({ year, yaw: YEAR_YAWS[i], radius: STATION_RADIUS, ctx }));

  ctx.goYear = (i) => {
    const s = stations[i].spot();
    locomotion.teleport(s.pos, s.yaw);
    notice.show(`${CURRICULUM[i].title} · ${CURRICULUM[i].theme}`);
  };
  ctx.goHome = () => locomotion.teleport(START.pos, START.yaw);
  ctx.adjustHeight = (d) => {
    ctx.heightOffset = Math.max(-0.3, Math.min(0.8, +(ctx.heightOffset + d).toFixed(2)));
    locomotion.setHeightOffset(ctx.heightOffset);
    progress.setSetting('height', ctx.heightOffset);
    menu.panel.invalidate();
  };
  ctx.toggleSound = () => {
    audio.setEnabled(!audio.enabled);
    progress.setSetting('sound', audio.enabled);
    menu.panel.invalidate();
  };
  ctx.toggleSpeech = () => {
    audio.speechOn = !audio.speechOn;
    if (!audio.speechOn) audio.stopSpeech();
    progress.setSetting('speech', audio.speechOn);
    menu.panel.invalidate();
  };

  const directory = new Directory({ ctx, curriculum: CURRICULUM, stations });
  const menu = new QuickMenu({ ctx, curriculum: CURRICULUM });
  const diploma = makeDiploma(progress);
  scene.add(diploma.mesh);
  diploma.mesh.visible = progress.overall().graduated;
  progress.on(() => {
    diploma.mesh.visible = progress.overall().graduated;
    if (diploma.mesh.visible) diploma.invalidate();
  });
  ctx.onGraduate = () => {
    diploma.mesh.visible = true;
    diploma.redraw();
    audio.play('fanfare');
    notice.show('🎓 축하합니다! 전 과정을 이수했어요. 중앙 홀에 졸업장이 있어요!', 6);
    confetti.burst(camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)));
  };

  // 글꼴 서브셋이 늦게 오면 캔버스 다시 그리기
  let redrawTimer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redrawAll, 250);
  });

  // -------------------------------------------------------------------------
  // 시작 화면 / 모드
  // -------------------------------------------------------------------------
  let mode = 'menu';
  const overlay = $('overlay');
  const btnVR = $('btn-vr');
  const btnDesk = $('btn-desktop');
  const status = $('xr-status');
  const hud = $('hud');
  let startTeleport = 0;

  (async () => {
    if (!('xr' in navigator)) {
      btnVR.textContent = 'VR 미지원 브라우저';
      status.textContent = '메타 퀘스트 브라우저에서 이 주소를 열면 VR 로 들어갈 수 있어요. (HTTPS 필요)';
      return;
    }
    try {
      if (await navigator.xr.isSessionSupported('immersive-vr')) {
        btnVR.disabled = false;
        btnVR.textContent = 'VR 시작 🥽';
      } else {
        btnVR.textContent = 'VR 기기 없음';
        status.textContent = 'VR 헤드셋이 감지되지 않았어요. 데스크톱 모드로 먼저 둘러보세요.';
      }
    } catch (e) {
      btnVR.textContent = 'VR 사용 불가';
      status.textContent = `WebXR 확인 실패: ${e.message}`;
    }
  })();

  btnVR.addEventListener('click', async () => {
    await audio.resume();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      session.addEventListener('end', () => {
        mode = 'menu';
        overlay.classList.remove('hidden');
        btnVR.textContent = 'VR 다시 들어가기 🥽';
        camera.position.set(0, 1.6, 0);
        camera.rotation.set(0, 0, 0);
        rig.rotation.set(0, 0, 0);
      });
      await renderer.xr.setSession(session);
      mode = 'xr';
      desktop.enable(false);
      overlay.classList.add('hidden');
      hud.classList.add('hidden');
      startTeleport = 4;
      audio.startAmbient();
    } catch (e) {
      status.textContent = `VR 세션을 시작할 수 없어요: ${e.message}`;
    }
  });

  const enterDesktop = async () => {
    await audio.resume();
    audio.startAmbient();
    const first = !desktop.visited;
    mode = 'desktop';
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    camera.position.set(0, 1.6, 0);
    rig.rotation.set(0, 0, 0);
    desktop.enable(true);
    if (first) {
      desktop.visited = true;
      rig.position.set(START.pos.x, 0, START.pos.z);
      desktop.yaw = START.yaw;
      desktop.pitch = -0.05;
    }
    btnDesk.textContent = '계속하기';
  };
  btnDesk.addEventListener('click', enterDesktop);
  desktop.onUnlock = () => {
    if (mode !== 'desktop') return;
    desktop.enable(false);
    mode = 'menu';
    overlay.classList.remove('hidden');
    hud.classList.add('hidden');
  };
  desktop.onKey = (code) => {
    if (code === 'KeyM') menu.toggle();
    if (code === 'KeyH') ctx.goHome();
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (n >= 0) ctx.goYear(n);
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.__campus = { THREE, scene, camera, rig, renderer, stations, directory, menu, progress, interact, locomotion, desktop, enterDesktop, ctx, CURRICULUM };

  // -------------------------------------------------------------------------
  // 메인 루프
  // -------------------------------------------------------------------------
  let last = performance.now();
  let time = 0;
  let menuAngle = 0;
  const head = new THREE.Vector3();
  const crosshair = $('crosshair');

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    const xr = renderer.xr.isPresenting;
    let pointers = [];
    if (xr) {
      // 머리 자세가 들어온 뒤(몇 프레임 후) 시작 위치로 맞춘다
      if (startTeleport > 0 && --startTeleport === 0) locomotion.teleport(START.pos, START.yaw, true);
      xrInput.update();
      pointers = xrInput.pointers;
      const L = xrInput.left;
      const R = xrInput.right;
      locomotion.update(dt, { move: L ? L.axes : null, turn: R ? R.axes.x : 0 });
      if (pointers.some((p) => p.active && p.justMenu)) menu.toggle();
    } else if (mode === 'desktop') {
      desktop.update();
      pointers = desktop.pointers;
      locomotion.update(dt, { move: desktop.move, run: desktop.run });
      crosshair.classList.toggle('active', !!desktop.pointer.hover);
    } else {
      // 시작 화면 배경: 천천히 도는 카메라
      menuAngle += dt * 0.05;
      rig.position.set(Math.sin(menuAngle) * 5, 0, Math.cos(menuAngle) * 5);
      camera.position.set(0, 2.4, 0);
      camera.rotation.set(-0.08, menuAngle, 0, 'YXZ');
    }

    interact.update(pointers, mode !== 'menu' || xr);
    interact.updateVisuals(pointers);
    camera.getWorldPosition(head);
    campus.update(dt, time);
    for (const s of stations) s.update(dt, head, time);
    directory.update();
    menu.update();
    diploma.flush();
    notice.update(dt, xr);
    confetti.update(dt);
    renderer.render(scene, camera);
  });

  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 800);
}

boot().catch((e) => {
  console.error(e);
  const l = $('loading');
  if (l) l.querySelector('p').textContent = `로딩 실패: ${e.message}`;
});
