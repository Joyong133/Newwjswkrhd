/** Web Audio 로 합성하는 효과음(파일 0개) + 한국어 읽어주기(speechSynthesis) */
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.ambient = null;
    this.speechOn = true;
  }

  async resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    switch (name) {
      case 'click':
        this.tone(1800, 0.05, { type: 'square', vol: 0.05 });
        this.tone(900, 0.06, { vol: 0.08 });
        break;
      case 'hover':
        this.tone(2400, 0.03, { vol: 0.025 });
        break;
      case 'tick':
        this.tone(700, 0.04, { type: 'triangle', vol: 0.06 });
        break;
      case 'ok':
        this.tone(880, 0.18, { vol: 0.14 });
        this.tone(1320, 0.3, { vol: 0.14, at: 0.1 });
        break;
      case 'bad':
        this.tone(220, 0.25, { type: 'sawtooth', vol: 0.06, slide: 0.7 });
        break;
      case 'page':
        this.tone(1200, 0.08, { type: 'triangle', vol: 0.05, slide: 1.4 });
        break;
      case 'whoosh': {
        const c = this.ctx;
        const src = c.createBufferSource();
        src.buffer = this.noise;
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.2;
        const t = c.currentTime;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2500, t + 0.3);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        src.connect(f).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 0.45);
        break;
      }
      case 'fanfare':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.8 : 0.22, { type: 'triangle', vol: 0.12, at: i * 0.14 }));
        break;
      case 'select':
        this.tone(660, 0.08, { type: 'triangle', vol: 0.08 });
        this.tone(990, 0.12, { type: 'triangle', vol: 0.07, at: 0.06 });
        break;
      default:
        break;
    }
  }

  /** 잔잔한 배경 패드(두 개의 디튠된 사인 + 저역 필터) */
  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05, c.currentTime + 4);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const oscs = [110, 164.8, 220.6, 277.2].map((fr, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = fr;
      o.detune.value = (i - 1.5) * 6;
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 0.05 + i * 0.03;
      lg.gain.value = 8;
      lfo.connect(lg).connect(o.detune);
      lfo.start();
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g).connect(this.master);
    this.ambient = { g, oscs };
  }

  speak(text) {
    const s = window.speechSynthesis;
    if (!s || !this.speechOn) return false;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[•·]/g, ', '));
    u.lang = 'ko-KR';
    u.rate = 1.02;
    const ko = s.getVoices?.().find((v) => v.lang?.startsWith('ko'));
    if (ko) u.voice = ko;
    s.speak(u);
    return true;
  }

  stopSpeech() {
    window.speechSynthesis?.cancel();
  }
}
