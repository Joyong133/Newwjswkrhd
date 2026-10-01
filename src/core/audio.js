import * as THREE from 'three';

/**
 * 모든 소리를 Web Audio로 직접 합성한다(외부 음원 파일 없음).
 * 3D 공간 음향은 THREE.PositionalAudio 사용.
 */
export class AudioEngine {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.sr = this.ctx.sampleRate;
    this.buffers = {};
    this.pool = [];
    this.flat = [];
    this.anchor = new THREE.Group();
    this.loops = [];
    this.enabled = true;
    this.build();
  }

  attachTo(scene) {
    scene.add(this.anchor);
    for (let i = 0; i < 14; i++) {
      const holder = new THREE.Object3D();
      const pa = new THREE.PositionalAudio(this.listener);
      pa.setRefDistance(0.6);
      pa.setRolloffFactor(1.4);
      pa.setDistanceModel('inverse');
      holder.add(pa);
      this.anchor.add(holder);
      this.pool.push({ holder, audio: pa });
    }
    for (let i = 0; i < 6; i++) this.flat.push(new THREE.Audio(this.listener));
  }

  async resume() {
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (e) { /* 무시 */ }
    }
  }

  // ---------- 합성 유틸 ----------
  buf(seconds, fn, channels = 1) {
    const len = Math.max(1, Math.floor(seconds * this.sr));
    const b = this.ctx.createBuffer(channels, len, this.sr);
    for (let c = 0; c < channels; c++) {
      const d = b.getChannelData(c);
      fn(d, this.sr, c);
    }
    return b;
  }

  /** 끊김 없이 반복되는 루프 버퍼: 앞쪽 여분(pre-roll)을 꼬리에 크로스페이드한다 */
  loopBuf(seconds, fn, channels = 1, fade = 0.15) {
    const len = Math.max(1, Math.floor(seconds * this.sr));
    const n = Math.min(Math.floor(fade * this.sr), Math.floor(len / 3));
    const b = this.ctx.createBuffer(channels, len, this.sr);
    for (let c = 0; c < channels; c++) {
      const full = new Float32Array(len + n);
      fn(full, this.sr, c);
      const out = b.getChannelData(c);
      for (let j = 0; j < len; j++) out[j] = full[n + j];
      for (let i = 0; i < n; i++) {
        const a = i / n;
        out[len - n + i] = out[len - n + i] * (1 - a) + full[i] * a;
      }
    }
    return b;
  }

  build() {
    const sr = this.sr;
    const TAU = Math.PI * 2;
    const noise = () => Math.random() * 2 - 1;

    // 짧은 딸깍 (버튼)
    this.buffers.click = this.buf(0.06, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 140);
        d[i] = (noise() * 0.5 + Math.sin(TAU * 2400 * t) * 0.6) * env * 0.7;
      }
    });

    // 노브 디텐트
    this.buffers.tick = this.buf(0.025, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (noise() * 0.6 + Math.sin(TAU * 4200 * t) * 0.4) * Math.exp(-t * 400) * 0.5;
      }
    });

    // 부품 꽂기
    this.buffers.snap = this.buf(0.16, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const a = Math.exp(-t * 220) * (noise() * 0.6 + Math.sin(TAU * 1800 * t) * 0.5);
        const t2 = t - 0.045;
        const b = t2 > 0 ? Math.exp(-t2 * 260) * (noise() * 0.5 + Math.sin(TAU * 1300 * t2) * 0.6) : 0;
        const thump = Math.sin(TAU * 140 * t) * Math.exp(-t * 40) * 0.35;
        d[i] = (a + b * 0.8 + thump) * 0.6;
      }
    });

    // 잡기
    this.buffers.grab = this.buf(0.09, (d) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (noise() - lp) * 0.25;
        d[i] = lp * Math.exp(-t * 60) * 0.6 + Math.sin(TAU * 520 * t) * Math.exp(-t * 90) * 0.15;
      }
    });

    // 벨 소리 계열
    const bell = (notes, dur, gap, decay = 6) =>
      this.buf(dur + gap * notes.length, (d) => {
        notes.forEach((f, n) => {
          const start = Math.floor(n * gap * sr);
          for (let i = start; i < d.length; i++) {
            const t = (i - start) / sr;
            const env = Math.min(1, t * 400) * Math.exp(-t * decay);
            d[i] += (Math.sin(TAU * f * t) * 0.55 + Math.sin(TAU * f * 2.01 * t) * 0.18 + Math.sin(TAU * f * 3.98 * t) * 0.06) * env * 0.38;
          }
        });
      });

    this.buffers.chime = bell([1046.5, 1318.5, 1568], 0.7, 0.07, 7);
    this.buffers.success = bell([523.25, 659.25, 783.99, 1046.5, 1318.5], 1.4, 0.11, 3.5);
    this.buffers.fanfare = bell([392, 523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5, 1568], 2.2, 0.13, 2.4);
    this.buffers.hover = this.buf(0.03, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = Math.sin(TAU * 3200 * t) * Math.exp(-t * 220) * 0.12;
      }
    });

    // 에러 버저
    this.buffers.error = this.buf(0.5, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = t < 0.2 ? 330 : 247;
        const env = (t < 0.2 ? Math.exp(-(t) * 6) : Math.exp(-(t - 0.2) * 6)) * Math.min(1, (t % 0.2) * 200);
        const sq = Math.sign(Math.sin(TAU * f * t)) * 0.25 + Math.sin(TAU * f * t) * 0.35;
        d[i] = sq * env * 0.35;
      }
    });

    // 멀티미터 삑
    this.buffers.beep = this.buf(0.12, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = Math.sin(TAU * 2730 * t) * Math.min(1, t * 500) * Math.min(1, (0.12 - t) * 200) * 0.25;
      }
    });

    // LED 터짐
    this.buffers.pop = this.buf(0.7, (d) => {
      let hp = 0;
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = noise();
        hp = 0.92 * (hp + n - prev);
        prev = n;
        const crack = hp * Math.exp(-t * 55) * 1.0;
        const thump = Math.sin(TAU * (90 - t * 60) * t) * Math.exp(-t * 14) * 0.7;
        const fizz = noise() * Math.exp(-t * 6) * 0.08;
        d[i] = Math.tanh((crack + thump + fizz) * 1.4) * 0.8;
      }
    });

    // 납땜 지글지글 (루프)
    this.buffers.sizzle = this.loopBuf(1.6, (d) => {
      let lp = 0;
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const n = noise();
        const hp = n - prev;
        prev = n;
        lp += (hp - lp) * 0.5;
        const crackle = Math.random() < 0.0016 ? (Math.random() * 2 - 1) * 2.5 : 0;
        const wob = 0.6 + 0.4 * Math.sin((i / sr) * TAU * 3.1) * Math.sin((i / sr) * TAU * 0.7);
        d[i] = (lp * 0.35 * wob + crackle * 0.3);
      }
    });

    // 형광등 험 (한국 60Hz → 120Hz)
    this.buffers.hum = this.buf(2.0, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        d[i] = (Math.sin(TAU * 120 * t) * 0.5 + Math.sin(TAU * 240 * t) * 0.22 + Math.sin(TAU * 360 * t) * 0.1 + Math.sin(TAU * 480 * t) * 0.05 + noise() * 0.02) * 0.25;
      }
    });

    // 실내 룸톤 + 빗소리 (스테레오 루프)
    this.buffers.rain = this.loopBuf(6.0, (d, s, ch) => {
      let lp1 = 0;
      let lp2 = 0;
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const n = noise();
        lp1 += (n - lp1) * 0.18;
        lp2 += (lp1 - lp2) * 0.35;
        const hp = lp1 - prev;
        prev = lp1;
        let drop = 0;
        if (Math.random() < 0.0009) drop = (Math.random() * 0.8 + 0.2) * (ch ? 1 : 0.8);
        d[i] = lp2 * 0.5 + hp * 0.35 + drop * Math.random() * 0.6;
      }
      // 작은 빗방울 '톡'
      for (let k = 0; k < 140; k++) {
        const start = Math.floor(Math.random() * (d.length - 2000));
        const f = 1800 + Math.random() * 2800;
        const a = 0.05 + Math.random() * 0.12;
        for (let j = 0; j < 1600; j++) {
          const t = j / sr;
          d[start + j] += Math.sin(TAU * f * t * (1 - t * 3)) * Math.exp(-t * 160) * a;
        }
      }
    }, 2);

    // 천둥
    this.buffers.thunder = this.buf(5.5, (d) => {
      let lp = 0;
      let lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (noise() - lp) * 0.03;
        lp2 += (lp - lp2) * 0.08;
        const env = Math.min(1, t * 3) * Math.exp(-t * 0.9) * (0.7 + 0.3 * Math.sin(t * 7.3) * Math.sin(t * 2.1));
        const crack = t < 0.4 ? noise() * Math.exp(-t * 12) * 0.15 : 0;
        d[i] = Math.tanh((lp2 * 9 * env + crack) * 1.2) * 0.9;
      }
    });

    // 팬(흄 추출기) 루프
    this.buffers.fan = this.loopBuf(2.0, (d) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (noise() - lp) * 0.08;
        d[i] = (lp * 0.9 + Math.sin(TAU * 180 * t) * 0.06 + Math.sin(TAU * 360 * t) * 0.03) * 0.5;
      }
    });

    // 순간이동 휙
    this.buffers.whoosh = this.buf(0.45, (d) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const k = 0.02 + 0.3 * Math.sin((t / 0.45) * Math.PI);
        lp += (noise() - lp) * k;
        d[i] = lp * Math.sin((t / 0.45) * Math.PI) * 0.6;
      }
    });

    // 릴레이 (전원 ON)
    this.buffers.relay = this.buf(0.18, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const a = Math.exp(-t * 300) * noise();
        const t2 = t - 0.03;
        const b = t2 > 0 ? Math.exp(-t2 * 200) * noise() * 0.7 : 0;
        d[i] = (a + b + Math.sin(TAU * 95 * t) * Math.exp(-t * 30) * 0.3) * 0.6;
      }
    });

    // 시계 째깍
    this.buffers.tickTock = this.buf(2.0, (d) => {
      const tick = (start, f) => {
        for (let j = 0; j < 900; j++) {
          const t = j / sr;
          d[start + j] += (noise() * 0.5 + Math.sin(TAU * f * t) * 0.5) * Math.exp(-t * 500) * 0.35;
        }
      };
      tick(0, 3100);
      tick(Math.floor(sr), 2600);
    });

    // 프린터 구동
    this.buffers.printer = this.buf(2.6, (d) => {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        lp += (noise() - lp) * 0.12;
        const motor = Math.sin(TAU * (220 + 20 * Math.sin(t * 9)) * t) * 0.12;
        const steps = Math.sin(TAU * 38 * t) > 0.92 ? noise() * 0.4 : 0;
        const env = Math.min(1, t * 6) * Math.min(1, (2.6 - t) * 4);
        d[i] = (lp * 0.4 + motor + steps) * env * 0.5;
      }
    });

    // 종이 스르륵
    this.buffers.paper = this.buf(0.35, (d) => {
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = noise();
        const hp = n - prev;
        prev = n;
        d[i] = hp * Math.sin((t / 0.35) * Math.PI) * 0.35;
      }
    });

    // 휴대폰 진동 '부르르'
    this.buffers.buzz = this.buf(0.95, (d) => {
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const on = (t < 0.35 || (t > 0.5 && t < 0.85)) ? 1 : 0;
        const env = on * Math.min(1, (t % 0.5) * 60);
        const motor = Math.sign(Math.sin(TAU * 172 * t)) * 0.5 + Math.sin(TAU * 344 * t) * 0.2;
        d[i] = motor * env * (0.8 + 0.2 * Math.sin(TAU * 23 * t)) * 0.35;
      }
    });

    // '앗 뜨거' 치익
    this.buffers.hiss = this.buf(0.6, (d) => {
      let prev = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = noise();
        d[i] = (n - prev) * Math.exp(-t * 5) * 0.5;
        prev = n;
      }
    });
  }

  // ---------- 재생 ----------
  /** 위치 지정 1회 재생 */
  play(name, at = null, { volume = 1, rate = 1, ref = 0.6 } = {}) {
    if (!this.enabled) return;
    const buffer = this.buffers[name];
    if (!buffer) return;
    if (!at) {
      const a = this.flat.find((x) => !x.isPlaying) || this.flat[0];
      if (a.isPlaying) a.stop();
      a.setBuffer(buffer);
      a.setVolume(volume);
      a.setPlaybackRate(rate);
      a.play();
      return;
    }
    let slot = this.pool.find((p) => !p.audio.isPlaying);
    if (!slot) {
      slot = this.pool[0];
      slot.audio.stop();
    }
    // 풀 순서를 돌려 가장 오래된 슬롯을 다음에 재사용
    this.pool.push(this.pool.splice(this.pool.indexOf(slot), 1)[0]);
    const p = at.isVector3 ? at : at.getWorldPosition(new THREE.Vector3());
    slot.holder.position.copy(p);
    slot.holder.updateMatrixWorld(true);
    slot.audio.setBuffer(buffer);
    slot.audio.setRefDistance(ref);
    slot.audio.setVolume(volume);
    slot.audio.setPlaybackRate(rate);
    slot.audio.play();
  }

  /** 오브젝트에 붙는 반복 재생 사운드 */
  loop(name, object3D, { volume = 0.5, ref = 0.8, rolloff = 1.2, autoplay = true, rate = 1 } = {}) {
    const pa = new THREE.PositionalAudio(this.listener);
    pa.setBuffer(this.buffers[name]);
    pa.setLoop(true);
    pa.setRefDistance(ref);
    pa.setRolloffFactor(rolloff);
    pa.setVolume(volume);
    pa.setPlaybackRate(rate);
    object3D.add(pa);
    const handle = {
      audio: pa,
      baseVolume: volume,
      playing: false,
      start: () => {
        if (handle.playing || this.ctx.state !== 'running') return;
        pa.play();
        handle.playing = true;
      },
      stop: () => {
        if (!handle.playing) return;
        pa.stop();
        handle.playing = false;
      },
      setVolume: (v) => pa.setVolume(v),
      autoplay,
    };
    this.loops.push(handle);
    return handle;
  }

  /** 오디오 컨텍스트 시작 후 자동 재생 루프 켜기 */
  startAmbient() {
    for (const h of this.loops) if (h.autoplay) h.start();
  }

  setMasterVolume(v) {
    this.listener.setMasterVolume(v);
  }
}
