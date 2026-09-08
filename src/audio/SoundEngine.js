export const CLASH_REF_VELOCITY = 25;
export const CLASH_MIN_VELOCITY = 0.35;
export const CLASH_COOLDOWN_MS = 55;
export const SOUND_VOL_KEY = 'dotori-alkkagi-volume';
export const SOUND_MUTE_KEY = 'dotori-alkkagi-mute';
export const DEFAULT_VOLUME = 0.8;

export const CLASH_SPRITE = Object.freeze({
  LIGHT: 'hit_light',
  MEDIUM: 'hit_medium',
  HEAVY: 'hit_heavy',
});

export function computeClashIntensity(velocity) {
  return Math.min(1, Math.max(0.1, Number(velocity) / CLASH_REF_VELOCITY));
}

export function selectClashSprite(intensity) {
  if (intensity < 0.3) return CLASH_SPRITE.LIGHT;
  if (intensity <= 0.7) return CLASH_SPRITE.MEDIUM;
  return CLASH_SPRITE.HEAVY;
}

export function clashHapticMs(intensity) {
  const i = clamp(intensity, 0, 1);
  return Math.round(i * (i > 0.7 ? 58 : 45));
}

export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readFlag(storage, key) {
  try {
    return storage?.getItem?.(key);
  } catch {
    return null;
  }
}

export function readStoredVolume(storage = globalThis.localStorage) {
  const raw = readFlag(storage, SOUND_VOL_KEY);
  if (raw == null) return DEFAULT_VOLUME;
  return clampVolume(Number(raw));
}

export function readStoredMute(storage = globalThis.localStorage) {
  return readFlag(storage, SOUND_MUTE_KEY) === '1';
}

export class SoundEngine {
  constructor(options = {}) {
    this.audioCtx = null;
    this.isUnlocked = false;
    this.volume = readStoredVolume(options.storage ?? globalThis.localStorage);
    this.muted = readStoredMute(options.storage ?? globalThis.localStorage);
    this._storage = options.storage ?? globalThis.localStorage;
    this._master = null;
    this._lastClashAt = 0;
    this._now = options.now ?? (() => Date.now());
    this._ambience = null;
    this._pull = null;
    this._vibrate = options.vibrate ?? ((ms) => {
      try {
        globalThis.navigator?.vibrate?.(ms);
      } catch {
        /* haptic unsupported */
      }
    });
    this._bindUnlockEvents();
  }

  effectiveGain() {
    return this.muted ? 0 : this.volume;
  }

  setVolume(value, { persist = true } = {}) {
    this.volume = clampVolume(value);
    this._syncMaster();
    if (persist) {
      try {
        this._storage?.setItem?.(SOUND_VOL_KEY, String(this.volume));
      } catch {
        /* ignore */
      }
    }
    return this.volume;
  }

  setMuted(muted, { persist = true } = {}) {
    this.muted = Boolean(muted);
    this._syncMaster();
    if (persist) {
      try {
        this._storage?.setItem?.(SOUND_MUTE_KEY, this.muted ? '1' : '0');
      } catch {
        /* ignore */
      }
    }
    return this.muted;
  }

  _bindUnlockEvents() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true });
  }

  unlock() {
    const ctx = this._ensureCtx();
    this.isUnlocked = Boolean(ctx);
    return this.isUnlocked;
  }

  _ensureCtx() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.audioCtx) this.audioCtx = new AudioContextClass();
    this._resumeCtx(this.audioCtx);
    return this.audioCtx;
  }

  _resumeCtx(ctx) {
    if (!ctx || ctx.state === 'running') return ctx;
    try {
      ctx.resume();
    } catch {
      /* resume is user-gesture bound */
    }
    return ctx;
  }

  /** 재생은 이미 열린 컨텍스트만 쓴다. 로드 시 만들면 suspended로 고정된다. */
  _ctx() {
    const ctx = this.audioCtx;
    if (!ctx) return null;
    this._resumeCtx(ctx);
    return ctx;
  }

  _out(ctx) {
    if (!this._master || this._master.context !== ctx) {
      this._master = ctx.createGain();
      this._master.connect(ctx.destination);
    }
    this._syncMaster();
    return this._master;
  }

  _syncMaster() {
    if (this._master) this._master.gain.value = this.effectiveGain();
  }

  _noiseBuffer(duration = 0.08) {
    const ctx = this.audioCtx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    return buffer;
  }

  _tone(ctx, {
    type = 'sine', freq = 440, endFreq = 120, vol = 0.12, attack = 0, dur = 0.12, filter,
  } = {}) {
    const now = ctx.currentTime + attack;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + dur);
    gain.gain.setValueAtTime(Math.max(0.0001, vol), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.freq || 400, now);
      osc.connect(f);
      f.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(this._out(ctx));
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  playStoneHit(intensity = 1, surface = 'stone') {
    const ctx = this._ctx();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const i = clamp(intensity, 0.15, 1);
    const board = surface === 'board';
    const volume = (board ? 0.12 : 0.18) + i * (board ? 0.28 : 0.42);

    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = board ? 'sine' : 'triangle';
    body.frequency.setValueAtTime((board ? 340 : 520) * (0.86 + i * 0.28), now);
    body.frequency.exponentialRampToValueAtTime(board ? 70 : 120, now + 0.09);
    bodyGain.gain.setValueAtTime(volume, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    body.connect(bodyGain);
    bodyGain.connect(this._out(ctx));
    body.start(now);
    body.stop(now + 0.12);

    const click = ctx.createBufferSource();
    click.buffer = this._noiseBuffer(0.045);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime((board ? 900 : 1800) + i * (board ? 400 : 900), now);
    band.Q.value = board ? 1.4 : 2.4;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(volume * (board ? 0.35 : 0.55), now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    click.connect(band);
    band.connect(clickGain);
    clickGain.connect(this._out(ctx));
    click.start(now);
    click.stop(now + 0.05);
    return true;
  }

  playFlick(power = 0.5) {
    const ctx = this._ctx();
    if (!ctx) return false;
    this.stopPull();
    const p = clamp(power, 0.12, 1);
    this._tone(ctx, {
      type: 'sine', freq: 880 + p * 220, endFreq: 420, vol: 0.16 + p * 0.22, dur: 0.08,
    });
    return true;
  }

  playFall() {
    const ctx = this._ctx();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const tumble = ctx.createOscillator();
    const tumbleGain = ctx.createGain();
    tumble.type = 'sawtooth';
    tumble.frequency.setValueAtTime(180, now);
    tumble.frequency.exponentialRampToValueAtTime(48, now + 0.28);
    tumbleGain.gain.setValueAtTime(0.12, now);
    tumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(420, now);
    tumble.connect(low);
    low.connect(tumbleGain);
    tumbleGain.connect(this._out(ctx));
    tumble.start(now);
    tumble.stop(now + 0.32);

    const rumble = ctx.createBufferSource();
    rumble.buffer = this._noiseBuffer(0.22);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.08, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    rumble.connect(rumbleGain);
    rumbleGain.connect(this._out(ctx));
    rumble.start(now);
    rumble.stop(now + 0.23);
    return true;
  }

  playDoor(kind = 'enter') {
    const ctx = this._ctx();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const enter = kind !== 'leave';
    this._tone(ctx, {
      type: 'sawtooth',
      freq: enter ? 220 : 140,
      endFreq: enter ? 92 : 58,
      vol: enter ? 0.11 : 0.09,
      dur: enter ? 0.26 : 0.2,
      filter: { type: 'bandpass', freq: enter ? 380 : 240 },
    });
    this._tone(ctx, {
      type: 'triangle',
      freq: enter ? 720 : 260,
      endFreq: enter ? 180 : 90,
      vol: 0.14,
      attack: enter ? 0.04 : 0.02,
      dur: 0.1,
    });
    return true;
  }

  playStart() {
    const ctx = this._ctx();
    if (!ctx) return false;
    this._tone(ctx, { type: 'triangle', freq: 620, endFreq: 240, vol: 0.2, dur: 0.14 });
    this._tone(ctx, { type: 'sine', freq: 880, endFreq: 440, vol: 0.1, attack: 0.04, dur: 0.1 });
    return true;
  }

  playTurn() {
    const ctx = this._ctx();
    if (!ctx) return false;
    this._tone(ctx, { type: 'sine', freq: 660, endFreq: 420, vol: 0.09, dur: 0.07 });
    return true;
  }

  playTimerTick() {
    const ctx = this._ctx();
    if (!ctx) return false;
    this._tone(ctx, { type: 'square', freq: 920, endFreq: 700, vol: 0.06, dur: 0.04 });
    return true;
  }

  playResult(kind = 'win') {
    const ctx = this._ctx();
    if (!ctx) return false;
    if (kind === 'lose') {
      this._tone(ctx, { type: 'triangle', freq: 280, endFreq: 90, vol: 0.16, dur: 0.28 });
      return true;
    }
    if (kind === 'draw' || kind === 'end') {
      this._tone(ctx, { type: 'sine', freq: 400, endFreq: 300, vol: 0.1, dur: 0.16 });
      return true;
    }
    this._tone(ctx, { type: 'triangle', freq: 520, endFreq: 780, vol: 0.14, dur: 0.12 });
    this._tone(ctx, { type: 'sine', freq: 780, endFreq: 1040, vol: 0.1, attack: 0.08, dur: 0.16 });
    return true;
  }

  playSurrender() {
    const ctx = this._ctx();
    if (!ctx) return false;
    this._tone(ctx, {
      type: 'sawtooth', freq: 110, endFreq: 48, vol: 0.14, dur: 0.32, filter: { type: 'lowpass', freq: 220 },
    });
    return true;
  }

  setPull(power = 0) {
    const ctx = this._ctx();
    if (!ctx) return false;
    const p = clamp(power, 0, 1);
    if (p < 0.04) {
      this.stopPull();
      return false;
    }
    if (!this._pull) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      gain.gain.value = 0.001;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 240;
      osc.connect(f);
      f.connect(gain);
      gain.connect(this._out(ctx));
      osc.start();
      this._pull = { osc, gain };
    }
    this._pull.osc.frequency.setTargetAtTime(70 + p * 90, ctx.currentTime, 0.04);
    this._pull.gain.gain.setTargetAtTime(0.02 + p * 0.05, ctx.currentTime, 0.05);
    return true;
  }

  stopPull() {
    if (!this._pull) return;
    try {
      this._pull.gain.gain.exponentialRampToValueAtTime(0.001, this._pull.osc.context.currentTime + 0.04);
      this._pull.osc.stop(this._pull.osc.context.currentTime + 0.06);
    } catch {
      /* already stopped */
    }
    this._pull = null;
  }

  setAmbience(mode = 'off') {
    const ctx = this._ctx();
    if (!ctx) return false;
    if (mode === 'off') {
      this._stopAmbience();
      return false;
    }
    if (!this._ambience) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 62;
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(this._out(ctx));
      osc.start();
      this._ambience = { osc, gain };
    }
    const vol = mode === 'lobby' ? 0.012 : mode === 'wait' ? 0.02 : 0.028;
    this._ambience.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.2);
    return true;
  }

  _stopAmbience() {
    if (!this._ambience) return;
    try {
      this._ambience.gain.gain.exponentialRampToValueAtTime(0.001, this._ambience.osc.context.currentTime + 0.15);
      this._ambience.osc.stop(this._ambience.osc.context.currentTime + 0.2);
    } catch {
      /* already stopped */
    }
    this._ambience = null;
  }

  playClashByVelocity(velocity, surface = 'stone') {
    if (velocity < CLASH_MIN_VELOCITY) return null;
    const intensity = computeClashIntensity(velocity);
    const sprite = selectClashSprite(intensity);
    const now = this._now();
    if (now - this._lastClashAt < CLASH_COOLDOWN_MS) {
      return { intensity, sprite, surface, skipped: true };
    }
    this._lastClashAt = now;
    this.playStoneHit(intensity, surface);
    this._vibrate(clashHapticMs(intensity));
    return { intensity, sprite, surface, skipped: false };
  }
}

export const soundEngine = new SoundEngine();
