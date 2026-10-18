import * as THREE from 'three';
import { setMaxAnisotropy, redrawAll } from './core/panel.js';
import { yawOf, damp } from './core/util.js';
import { Audio } from './core/audio.js';
import { XRInput, DesktopInput } from './core/input.js';
import { Interact } from './core/interact.js';
import { Course } from './world/course.js';
import { Vehicle } from './car/vehicle.js';
import { Cockpit, EYE } from './car/cockpit.js';
import { Drive } from './exam/skilltest.js';
import { Hud } from './exam/hud.js';
import { Menu, Store } from './exam/menu.js';

const $ = (id) => document.getElementById(id);
const UP = new THREE.Vector3(0, 1, 0);

async function loadFonts() {
  if (!document.fonts?.load) return;
  const sample = '운전면허 기능시험 학과 경사로 직각주행 신호교차로 가속 돌발 종료 가나다라마바사 0123456789 ①②③④';
  const specs = ['900 40px "Noto Sans KR"', '800 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '500 40px "Noto Sans KR"', '800 40px "JetBrains Mono"'];
  await Promise.race([Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
}

/** 회전·가감속할 때 시야 가장자리를 어둡게(멀미 방지) */
function makeVignette(camera) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 40, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  m.position.z = -0.15;
  m.renderOrder = 999;
  m.raycast = () => {};
  camera.add(m);
  return m;
}

async function boot() {
  await loadFonts();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFoveation(0.6);
  $('app').appendChild(renderer.domElement);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9d3f0);
  scene.fog = new THREE.Fog(0xbfdcf0, 120, 420);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b45, 1.4));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
  sun.position.set(-30, 60, 20);
  scene.add(sun);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 c = mix(vec3(0.82,0.9,0.97), vec3(0.36,0.6,0.88), pow(h,0.6)); gl_FragColor = vec4(c,1.0); }',
    }),
  );
  sky.raycast = () => {};
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 700);
  const rig = new THREE.Group();
  rig.add(camera);

  const audio = new Audio();
  const store = new Store();
  audio.enabled = store.setting('sound', true);
  const interact = new Interact({ scene, audio });
  const course = new Course(scene, renderer.capabilities.getMaxAnisotropy());
  course.guide.visible = store.setting('guide', true);
  const vehicle = new Vehicle();
  const cockpit = new Cockpit({ vehicle, interact, audio });
  scene.add(cockpit.group);
  cockpit.group.add(rig);
  const xrInput = new XRInput(renderer, rig);
  const desktop = new DesktopInput(camera, renderer.domElement);
  const vignette = makeVignette(camera);

  // 시험관 안내판 · 메뉴 (차에 붙어 같이 움직인다)
  const hud = new Hud();
  hud.panel.mesh.position.set(-0.3, 1.36, -2.0);
  hud.panel.mesh.rotation.x = -0.12;
  cockpit.group.add(hud.panel.mesh);
  hud.set({ title: 'VR 운전면허 연습장', score: null });
  hud.say('메뉴에서 연습할 항목을 고르세요');

  let drive = null;
  const placeAtStart = () => {
    const p = course.pointAt(course.marks.start + 1.6);
    vehicle.reset(p.x, p.z, p.h);
    cockpit.place();
  };
  placeAtStart();

  const menuActions = {
    isDriving: () => !!drive && !drive.finished,
    startSkill: () => begin('test'),
    startFree: () => begin('free'),
    recenter: () => recenter(),
    toggleGuide: () => {
      store.set('guide', !store.setting('guide', true));
      course.guide.visible = store.setting('guide', true);
      menu.panel.invalidate();
    },
    toggleComfort: () => {
      store.set('comfort', !store.setting('comfort', true));
      menu.panel.invalidate();
    },
    toggleSound: () => {
      store.set('sound', !store.setting('sound', true));
      audio.setEnabled(store.setting('sound', true));
      menu.panel.invalidate();
    },
    resume: () => openMenu(false),
    stopDrive: () => {
      drive = null;
      hud.set({ title: 'VR 운전면허 연습장', score: null });
      hud.say('메뉴에서 연습할 항목을 고르세요');
      placeAtStart();
      menu.go('home');
    },
  };
  const menu = new Menu({ store, audio, actions: menuActions });
  menu.panel.mesh.position.set(-0.3, 1.24, -1.8);
  menu.panel.mesh.rotation.x = -0.1;
  cockpit.group.add(menu.panel.mesh);
  interact.addPanel(menu.panel);

  function openMenu(on) {
    menu.show(on);
    cockpit.wheelFrame.visible = !on; // 메뉴를 볼 때는 핸들을 숨겨 손이 걸리지 않게
    if (on) menu.panel.redraw();
  }
  openMenu(true);

  function begin(mode) {
    placeAtStart();
    drive = new Drive({
      mode,
      vehicle,
      course,
      hud,
      audio,
      onEnd: (res) => {
        if (mode !== 'test') return;
        setTimeout(() => {
          menu.showSkillResult(res);
          openMenu(true);
        }, 2500);
      },
    });
    openMenu(false);
  }

  cockpit.on('menu', () => {
    if (vehicle.kmh > 1) {
      hud.flash('차를 멈춘 뒤 메뉴를 여세요', 'warn');
      return;
    }
    openMenu(!menu.visible);
  });
  cockpit.on('recenter', () => recenter());
  cockpit.on('hint', (t) => hud.flash(t, 'warn'));

  // -------------------------------------------------------------------------
  // 자리 맞춤: 지금 머리 위치·방향을 운전석 눈 위치·정면으로
  // -------------------------------------------------------------------------
  function recenter() {
    if (renderer.xr.isPresenting) {
      const yaw = yawOf(camera.quaternion);
      rig.rotation.set(0, -yaw, 0);
      const off = camera.position.clone().applyAxisAngle(UP, -yaw);
      rig.position.copy(EYE).sub(off);
    } else {
      rig.rotation.set(0, 0, 0);
      rig.position.copy(EYE).sub(new THREE.Vector3(0, 1.6, 0));
      camera.position.set(0, 1.6, 0);
    }
    audio.play('select');
  }
  recenter();

  // -------------------------------------------------------------------------
  // 시작 화면 / 모드
  // -------------------------------------------------------------------------
  let mode = 'menu';
  const overlay = $('overlay');
  const btnVR = $('btn-vr');
  const btnDesk = $('btn-desktop');
  const status = $('xr-status');
  const hudEl = $('hud');
  let recenterIn = 0;

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
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
      session.addEventListener('end', () => {
        mode = 'menu';
        overlay.classList.remove('hidden');
        btnVR.textContent = 'VR 다시 들어가기 🥽';
        recenter();
      });
      await renderer.xr.setSession(session);
      mode = 'xr';
      desktop.enable(false);
      overlay.classList.add('hidden');
      hudEl.classList.add('hidden');
      recenterIn = 8;
    } catch (e) {
      status.textContent = `VR 세션을 시작할 수 없어요: ${e.message}`;
    }
  });

  const enterDesktop = async () => {
    await audio.resume();
    mode = 'desktop';
    overlay.classList.add('hidden');
    hudEl.classList.remove('hidden');
    recenter();
    desktop.enable(true);
    btnDesk.textContent = '계속하기';
  };
  btnDesk.addEventListener('click', enterDesktop);
  desktop.onUnlock = () => {
    if (mode !== 'desktop') return;
    desktop.enable(false);
    mode = 'menu';
    overlay.classList.remove('hidden');
    hudEl.classList.add('hidden');
  };
  desktop.onKey = (code) => {
    const k = {
      KeyE: () => cockpit.toggleEngine(),
      KeyB: () => cockpit.toggle('belt'),
      KeyL: () => cockpit.toggle('lights'),
      KeyI: () => cockpit.toggle('wiper'),
      KeyX: () => cockpit.toggle('hazard'),
      KeyZ: () => cockpit.setSignal('left'),
      KeyC: () => cockpit.setSignal('right'),
      KeyP: () => cockpit.toggle('parkBrake'),
      Digit1: () => cockpit.setGear('P'),
      Digit2: () => cockpit.setGear('R'),
      Digit3: () => cockpit.setGear('N'),
      Digit4: () => cockpit.setGear('D'),
      KeyM: () => cockpit.emit('menu'),
    }[code];
    if (k) {
      k();
      audio.play('click');
    }
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let redrawTimer = 0;
  document.fonts?.addEventListener?.('loadingdone', () => {
    clearTimeout(redrawTimer);
    redrawTimer = setTimeout(redrawAll, 250);
  });

  window.__drive = { THREE, scene, camera, rig, renderer, course, vehicle, cockpit, menu, hud, interact, desktop, enterDesktop, begin: (m) => begin(m), get drive() { return drive; }, store, recenter, openMenu };

  // -------------------------------------------------------------------------
  // 메인 루프
  // -------------------------------------------------------------------------
  let last = performance.now();
  let vig = 0;
  let menuAngle = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const xr = renderer.xr.isPresenting;
    let pointers = [];
    if (xr) {
      if (recenterIn > 0 && --recenterIn === 0) recenter();
      xrInput.update();
      pointers = xrInput.pointers;
      if (pointers.some((p) => p.justMenu)) cockpit.emit('menu');
    } else if (mode === 'desktop') {
      desktop.update();
      pointers = desktop.pointers;
      $('crosshair').classList.toggle('active', !!(interact.state.get(desktop.pointer)?.hoverPanel || interact.state.get(desktop.pointer)?.hoverBtn));
    } else {
      // 시작 화면 배경: 차 주변을 천천히 도는 카메라
      menuAngle += dt * 0.12;
      rig.position.set(EYE.x + Math.sin(menuAngle) * 6, -0.2, EYE.z + Math.cos(menuAngle) * 6 - 1);
      rig.rotation.set(0, 0, 0);
      camera.position.set(0, 1.6, 0);
      camera.rotation.set(-0.12, menuAngle, 0, 'YXZ');
    }

    // 1) 핸들·레버가 먼저 손을 가져가고  2) 나머지 손으로 UI
    cockpit.update(dt, { pointers, desktop: mode === 'desktop' && !xr ? desktop : null });
    if (menu.visible) {
      vehicle.throttle = 0;
      vehicle.brake = 1;
    }
    interact.update(pointers, dt);
    interact.updateVisuals(pointers);

    vehicle.update(dt, course);
    drive?.update(dt);
    cockpit.place();
    hud.update(dt);
    menu.panel.flush();
    audio.engine(vehicle.engine, Math.abs(vehicle.v), vehicle.throttle);

    // 멀미 방지 비네트
    const comfort = store.setting('comfort', true) && xr;
    const target = comfort ? Math.min(0.85, Math.abs(vehicle.yawRate) * 1.4 + Math.abs(vehicle.accel) * 0.05) : 0;
    vig = damp(vig, target, 6, dt);
    vignette.material.opacity = vig;
    vignette.visible = vig > 0.01;

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
