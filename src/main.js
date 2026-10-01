import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { setMaxAnisotropy, redrawAllArt } from './core/canvasArt.js';
import { AudioEngine } from './core/audio.js';
import { Tooltip, Toast } from './core/ui.js';
import { InteractionManager } from './core/interaction.js';
import { XRInput, DesktopInput } from './core/input.js';
import { Locomotion, PointerVisuals } from './core/locomotion.js';
import { Particles, makeSoftTexture } from './core/particles.js';
import { mergeStatic } from './core/staticMerge.js';
import { initMaterials } from './world/props.js';
import { buildLab, LAYOUT } from './world/lab.js';
import { Missions } from './game/missions.js';
import { Hub } from './game/hub.js';
import { LedStation } from './stations/ledStation.js';
import { ScopeStation } from './stations/scopeStation.js';
import { LogicStation } from './stations/logicStation.js';
import { SolderStation } from './stations/solderStation.js';
import { ReportStation } from './stations/reportStation.js';

const $ = (id) => document.getElementById(id);

async function loadFonts() {
  if (!document.fonts?.load) return;
  const sample = '전자공학과 실험실 회로 저항 오실로스코프 납땜 논리 가나다라마바사아자차카타파하 0123456789 ABCabc';
  const specs = ['900 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '500 40px "Noto Sans KR"', '400 40px "Noto Sans KR"', '40px "Nanum Pen Script"', '40px "Share Tech Mono"'];
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 3500)),
  ]);
}

async function boot() {
  await loadFonts();
  const env = {};

  // -------------------------------------------------------------------------
  // 품질 프리셋: 퀘스트 2/1은 그림자를 끈다 (?q=low|high 로 강제 가능)
  // -------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const ua = navigator.userAgent;
  const quality = params.get('q') || (/Quest(?! ?(3|Pro))/i.test(ua) ? 'low' : 'high');

  // -------------------------------------------------------------------------
  // 렌더러 / 씬
  // -------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(1);
  $('app').appendChild(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b14);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 60);
  const rig = new THREE.Group();
  rig.name = 'playerRig';
  rig.add(camera);
  scene.add(rig);
  camera.position.set(0, 1.6, 0);

  initMaterials();

  // -------------------------------------------------------------------------
  // 시스템
  // -------------------------------------------------------------------------
  const audio = new AudioEngine(camera);
  audio.attachTo(scene);
  const tooltip = new Tooltip(scene);
  const toast = new Toast(camera, scene);
  const interaction = new InteractionManager({ scene, camera, audio, tooltip });
  const locomotion = new Locomotion({ rig, camera, audio });
  const particles = {
    smoke: new Particles({ max: 320, texture: makeSoftTexture('smoke'), blending: THREE.NormalBlending }),
    sparks: new Particles({ max: 160, texture: makeSoftTexture('glow'), blending: THREE.AdditiveBlending, sizeScale: 1 }),
    confetti: new Particles({ max: 400, texture: makeSoftTexture('square'), blending: THREE.NormalBlending }),
  };
  for (const p of Object.values(particles)) scene.add(p.points);

  const xrInput = new XRInput(renderer, rig, scene);
  const desktop = new DesktopInput(camera, renderer.domElement, rig);
  locomotion.desktop = desktop;
  const visuals = new PointerVisuals(scene);
  let mode = 'menu'; // 'menu' | 'desktop' | 'xr'
  const isXR = () => renderer.xr.isPresenting;
  const pointers = () => (isXR() ? xrInput.pointers : mode === 'desktop' ? desktop.pointers : []);

  const lab = buildLab({ scene, interaction, locomotion });
  const missions = new Missions();
  const startPos = new THREE.Vector3(LAYOUT.start.x, 0, LAYOUT.start.z);
  let stations = {};
  let hub = null;
  // 모든 실험 초기화(최종 평가 화면의 "처음부터 다시")
  const resetAll = () => {
    missions.reset();
    for (const s of Object.values(stations)) s.reset();
    hub?.reset();
    env.dawn = -1;
    env.dawnK = 0;
    locomotion.teleport(startPos, LAYOUT.start.yaw);
    toast.show('처음부터 다시!\n모든 실험 장비를 초기화했어요', 'ok', 3);
  };
  const ctx = { scene, camera, rig, renderer, interaction, audio, toast, missions, particles, locomotion, lab, pointers, isXR, resetAll };

  stations = {
    led: new LedStation({ ...ctx, bench: lab.benches.benchA }),
    scope: new ScopeStation({ ...ctx, bench: lab.benches.benchB }),
    logic: new LogicStation({ ...ctx, bench: lab.benches.benchC }),
    solder: new SolderStation({ ...ctx, bench: lab.benches.benchD }),
  };
  hub = new Hub(ctx);
  ctx.hub = hub;
  stations.report = new ReportStation({ ...ctx, desk: lab.ta, stations });

  // 정적 메시 합치기 → 드로우콜 감소
  const staticGroup = new THREE.Group();
  staticGroup.name = 'static';
  scene.add(staticGroup);
  const stats = mergeStatic(lab.root, staticGroup);
  console.info('[lab] quality:', quality, '· merged static meshes:', stats);
  renderer.shadowMap.needsUpdate = true;

  // 폰트 서브셋이 늦게 도착하면 캔버스 텍스처를 다시 그린다
  let redrawTimer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(() => redrawAllArt(), 250);
  });

  // -------------------------------------------------------------------------
  // 환경 연출: 비, 번개, 형광등 깜빡임, 시계
  // -------------------------------------------------------------------------
  const rainAnchor = new THREE.Object3D();
  rainAnchor.position.set(0, 2.0, -4.4);
  scene.add(rainAnchor);
  const rainLoop = audio.loop('rain', rainAnchor, { volume: 0.55, ref: 3.5, rolloff: 0.6 });
  const humAnchor = new THREE.Object3D();
  humAnchor.position.copy(lab.flickerPanelPos);
  scene.add(humAnchor);
  audio.loop('hum', humAnchor, { volume: 0.05, ref: 1.0, rolloff: 1.5 });
  const clockAnchor = new THREE.Object3D();
  lab.clock.group.add(clockAnchor);
  audio.loop('tickTock', clockAnchor, { volume: 0.35, ref: 0.8, rolloff: 1.6 });

  const storyStart = performance.now();
  Object.assign(env, { lightning: 18 + Math.random() * 20, flash: 0, flicker: 4, flickerT: 0, dawn: -1, dawnK: 0 });
  missions.on((type) => {
    if (type === 'submitted') env.dawn = 0;
  });
  function updateEnvironment(dt) {
    lab.rainTex.offset.y += dt * 0.9;
    lab.rainTex.offset.x = Math.sin(performance.now() * 0.0003) * 0.02;
    // 시계: 이야기 속 시간 22:47에서 실제 시간만큼 흐름
    const secs = 22 * 3600 + 47 * 60 + 12 + (performance.now() - storyStart) / 1000;
    const s = secs % 60;
    const m = (secs / 60) % 60;
    const h = (secs / 3600) % 12;
    lab.clock.second.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
    lab.clock.minute.rotation.z = -(m / 60) * Math.PI * 2;
    lab.clock.hour.rotation.z = -(h / 12) * Math.PI * 2;
    // 보고서 제출 후: 비가 그치고 새벽이 밝아온다
    if (env.dawn >= 0) {
      env.dawn += dt;
      env.dawnK = Math.min(1, env.dawn / 8);
      lab.rainMat.opacity = 0.55 * (1 - env.dawnK);
      rainLoop.setVolume(0.55 * (1 - env.dawnK));
    } else if (env.dawnK === 0) {
      lab.rainMat.opacity = 0.55;
      rainLoop.setVolume(0.55);
    }
    // 번개
    env.lightning -= dt;
    if (env.lightning <= 0) {
      env.lightning = 25 + Math.random() * 35;
      env.flash = 0.45;
      setTimeout(() => audio.play('thunder', rainAnchor, { volume: 0.9, ref: 4 }), 900 + Math.random() * 1600);
    }
    if (env.dawnK > 0) env.flash = 0;
    if (env.flash > 0) {
      env.flash -= dt;
      const k = env.flash > 0.3 || (env.flash < 0.18 && env.flash > 0.1) ? 1 : 0;
      lab.cityMat.color.setScalar(0.7 + k * 2.3);
      lab.hemi.intensity = 1.25 + k * 0.6;
    } else {
      const d = env.dawnK;
      lab.cityMat.color.setRGB(0.7 + d * 0.9, 0.7 + d * 0.55, 0.7 + d * 0.35);
      lab.hemi.intensity = 1.25;
    }
    // 한 형광등이 가끔 깜빡임
    env.flicker -= dt;
    if (env.flicker <= 0) {
      env.flickerT = 0.5 + Math.random() * 0.6;
      env.flicker = 6 + Math.random() * 10;
    }
    if (env.flickerT > 0) {
      env.flickerT -= dt;
      lab.flickerMat.emissiveIntensity = Math.random() < 0.5 ? 0.3 : 2.4;
    } else lab.flickerMat.emissiveIntensity = 2.4;
  }

  // -------------------------------------------------------------------------
  // 시작 화면 / 모드 전환
  // -------------------------------------------------------------------------
  const overlay = $('overlay');
  const btnVR = $('btn-vr');
  const btnDesk = $('btn-desktop');
  const status = $('xr-status');
  const hud = $('hud');
  let startTeleport = false;

  async function checkXR() {
    if (!('xr' in navigator)) {
      btnVR.textContent = 'VR 미지원 브라우저';
      status.textContent = '메타 퀘스트 브라우저에서 이 주소를 열면 VR로 체험할 수 있어요. (HTTPS 필요)';
      return;
    }
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-vr');
      if (ok) {
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
  }
  checkXR();

  btnVR.addEventListener('click', async () => {
    await audio.resume();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
      });
      session.addEventListener('end', onSessionEnd);
      await renderer.xr.setSession(session);
      mode = 'xr';
      desktop.enable(false);
      overlay.classList.add('hidden');
      hud.classList.add('hidden');
      $('toast').classList.add('hidden');
      startTeleport = true;
      audio.startAmbient();
    } catch (e) {
      status.textContent = `VR 세션을 시작할 수 없어요: ${e.message}`;
    }
  });

  function onSessionEnd() {
    mode = 'menu';
    camera.position.set(0, 1.6, 0);
    camera.rotation.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    overlay.classList.remove('hidden');
    btnVR.textContent = 'VR 다시 들어가기 🥽';
  }

  btnDesk.addEventListener('click', async () => {
    await audio.resume();
    audio.startAmbient();
    enterDesktop();
  });

  function enterDesktop() {
    const first = mode !== 'desktop' && !desktop.visited;
    mode = 'desktop';
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    camera.position.set(0, 1.6, 0);
    rig.rotation.set(0, 0, 0);
    desktop.enable(true);
    if (first) {
      desktop.visited = true;
      rig.position.copy(startPos);
      desktop.yaw = 0;
      desktop.pitch = -0.08;
    }
    btnDesk.textContent = '계속하기';
  }

  desktop.onUnlock = () => {
    if (mode !== 'desktop') return;
    // ESC → 메뉴
    desktop.enable(false);
    mode = 'menu';
    overlay.classList.remove('hidden');
    hud.classList.add('hidden');
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 테스트/디버그용 핸들
  window.__lab = { THREE, scene, camera, rig, renderer, interaction, stations, missions, hub, locomotion, desktop, audio, lab, enterDesktop, particles, pointers, xrInput };

  // -------------------------------------------------------------------------
  // 메인 루프
  // -------------------------------------------------------------------------
  let lastTime = performance.now();
  let menuAngle = 0;
  const headPos = new THREE.Vector3();
  const crosshair = $('crosshair');

  renderer.setAnimationLoop(() => {
    const nowT = performance.now();
    const dt = Math.min(0.05, (nowT - lastTime) / 1000);
    lastTime = nowT;
    const xr = isXR();
    let ptrs = [];

    if (xr) {
      if (startTeleport) {
        startTeleport = false;
        locomotion.teleport(startPos, LAYOUT.start.yaw, true);
      }
      xrInput.update();
      ptrs = xrInput.pointers;
      const left = xrInput.left;
      const right = xrInput.right;
      locomotion.update(dt, {
        move: left && !left.knob ? left.axes : null,
        turn: right && !right.knob ? right.axes.x : 0,
      });
    } else if (mode === 'desktop') {
      desktop.update(dt);
      ptrs = desktop.pointers;
      locomotion.update(dt, { move: desktop.move, run: desktop.run });
      crosshair.classList.toggle('active', !!(desktop.pointer.hover || desktop.pointer.held || desktop.pointer.knob));
    } else {
      // 메뉴 배경: 천천히 둘러보는 카메라
      menuAngle += dt * 0.08;
      rig.position.set(4.6, 0, 3.9);
      camera.position.set(0, 1.95, 0);
      camera.rotation.set(-0.2, 0.78 + Math.sin(menuAngle) * 0.32, 0, 'YXZ');
    }

    interaction.update(ptrs, dt);
    for (const s of Object.values(stations)) s.update(dt);
    camera.getWorldPosition(headPos);
    hub.update(dt, { pointers: ptrs, isXR: xr, headPos });
    for (const p of Object.values(particles)) p.update(dt);
    visuals.update(ptrs, camera);
    updateEnvironment(dt);
    toast.update(dt);
    toast.mesh.visible = toast.mesh.visible && xr;

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
