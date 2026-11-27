import type { CoinColor } from './coins';

/*
 * Sound effects, synthesized with the Web Audio API (no audio files):
 * - rolling: a soft rumble plus a tile click at every tile seam, following the ball's speed;
 * - wind: air rushing past while the ball is off the ground (a drop, a fall);
 * - coin pickups: a bright chime that climbs in a quick combo, richer for rarer coins.
 *
 * The top half is pure rules (unit-tested in tests/sound.test.ts); the bottom half builds the
 * audio graph. Everything runs through a soft limiter so nothing gets loud or harsh.
 */

// ---------------------------------------------------------------------- rolling rules

export const ROLL = {
  /** Below this speed (m/s) the ball counts as stopped: silence. */
  minSpeed: 0.25,
  /** The sound fades in over this much speed above minSpeed. */
  fadeIn: 1,
  /** At and above this speed the rolling sound is at its fullest. */
  fullSpeed: 14,
  /** Meters between tile seams: the floor texture has 2×2 tiles per 4 m (view.ts, platform.ts). */
  tile: 2,
  /** Clicks per second at most, so top speed doesn't turn into a buzz. */
  maxClickRate: 9,
  /**
   * Rumble level at full speed. Tuned by measuring the final output: at a typical 7 m/s the
   * rolling bed sits around -27 dBFS RMS, well under the coin chimes (peaks around -8 dBFS).
   */
  rumble: 0.3,
  /** Tile click level at full speed: subtle ticks, peaking far below a chime. */
  click: 0.15,
};

export interface RollMix {
  /** Rumble level (0 = silent). */
  rumble: number;
  /** Tile click level. */
  click: number;
  /** Rumble low-pass cutoff (Hz): brighter when faster. */
  cutoff: number;
  /** Center of the faint steel "singing" band (Hz). */
  ring: number;
  /** Playback rate of the rumble texture: higher pitch when faster. */
  rate: number;
  /** Tile clicks per second (0 = none). */
  clickRate: number;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * How firmly the ball sits on the track, from the height of its center above the surface:
 * 1 when resting on it (one radius up), fading to 0 when it hops over a crest, drops into
 * a hole or rolls off an edge.
 */
export function contactFactor(height: number, radius: number): number {
  if (!Number.isFinite(height)) return 0;
  return 1 - smoothstep(0.05, 0.2, Math.abs(height - radius));
}

/**
 * The rolling sound for a ball speed (m/s) and contact (0..1). Louder, brighter and higher
 * with speed on a gentle curve that levels off at full speed (so it never gets shouty), and
 * silent when the ball stops or leaves the track.
 */
export function rollMix(speed: number, contact: number): RollMix {
  const v = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const c = Number.isFinite(contact) ? Math.min(1, Math.max(0, contact)) : 0;
  const s = Math.min(1, v / ROLL.fullSpeed);
  const moving = smoothstep(ROLL.minSpeed, ROLL.minSpeed + ROLL.fadeIn, v);
  const level = moving * c;
  return {
    rumble: ROLL.rumble * level * (0.2 + 0.8 * Math.sqrt(s)),
    click: ROLL.click * level * (0.45 + 0.55 * s),
    cutoff: 160 + 1100 * Math.pow(s, 1.3),
    ring: 650 + 1500 * s,
    rate: 0.6 + 0.8 * s,
    clickRate: level > 0.5 ? Math.min(ROLL.maxClickRate, v / ROLL.tile) : 0,
  };
}

// ---------------------------------------------------------------------- wind rules

export const WIND = {
  /** In the air for less than this (s): silent, so hops over crests stay quiet. */
  delay: 0.08,
  /** Then the wind fades in over this long (s). */
  fadeIn: 0.3,
  /**
   * Wind level at full speed. Measured on the final output: about -23 dBFS RMS at full speed
   * and -27 at a typical 12 m/s fall, level with the rolling bed and well under the chimes.
   */
  gain: 0.4,
  /** At and above this speed (m/s) the wind is at its loudest and brightest. */
  fullSpeed: 18,
};

export interface WindMix {
  /** Wind level (0 = silent). */
  gain: number;
  /** Center of the wind's band-pass (Hz): brighter when faster. */
  cutoff: number;
}

/** The wind for the ball's speed (m/s) and how long it has been in the air (s). */
export function windMix(speed: number, airTime: number): WindMix {
  if (!Number.isFinite(speed) || !Number.isFinite(airTime)) return { gain: 0, cutoff: 450 };
  const s = Math.min(1, Math.max(0, speed) / WIND.fullSpeed);
  const fade = smoothstep(WIND.delay, WIND.delay + WIND.fadeIn, airTime);
  return { gain: WIND.gain * fade * (0.35 + 0.65 * s), cutoff: 450 + 1600 * s };
}

// ---------------------------------------------------------------------- coin rules

export const COMBO = {
  /** A pickup within this many seconds of the previous one continues the combo. */
  gap: 1.1,
  /** Pitch of each combo step in semitones: a major pentatonic run up one octave. */
  scale: [0, 2, 4, 7, 9, 12],
  /** Random pitch variation of every pickup (± semitones), so repeats never sound canned. */
  jitter: 0.15,
};

export interface ComboNote {
  /** 0 for the first pickup, then 1, 2, … while pickups keep coming quickly. */
  step: number;
  /** Pitch offset in semitones (combo step plus a little random variation). */
  semitones: number;
}

/** Quick pickups in a row climb a scale; a short gap starts over at the bottom. */
export class CoinCombo {
  private step = -1;
  private last = -Infinity;

  /** Registers a pickup at `time` (seconds) and returns its pitch. */
  next(time: number, random: () => number = Math.random): ComboNote {
    this.step = time - this.last <= COMBO.gap ? this.step + 1 : 0;
    this.last = time;
    const top = COMBO.scale.length - 1;
    const jitter = (random() * 2 - 1) * COMBO.jitter;
    return { step: this.step, semitones: COMBO.scale[Math.min(this.step, top)] + jitter };
  }

  reset(): void {
    this.step = -1;
    this.last = -Infinity;
  }
}

/** True once a combo has climbed to the top of the scale (gets an extra sparkle). */
export const comboAtTop = (step: number) => step >= COMBO.scale.length - 1;

export interface CoinVoice {
  /** Arpeggio in semitones above the pickup pitch. */
  notes: number[];
  /** Seconds between arpeggio notes. */
  spacing: number;
  /** Ring time of each note (s)… */
  decay: number;
  /** …and how many times longer the last one rings. */
  tail: number;
  /** Peak level of each note. */
  gain: number;
  /** High glitter pings sprinkled over the chime. */
  sparkles: number;
  /** A warm low chord under the chime: the jackpot. */
  bloom: boolean;
}

/** Rarer coins sound progressively more special; orange is a jackpot. */
export const COIN_VOICES: Record<CoinColor, CoinVoice> = {
  yellow: { notes: [0], spacing: 0, decay: 0.3, tail: 1, gain: 0.3, sparkles: 0, bloom: false },
  blue: { notes: [0, 7], spacing: 0.06, decay: 0.32, tail: 1.4, gain: 0.28, sparkles: 2, bloom: false },
  purple: { notes: [-5, 0, 4, 7], spacing: 0.055, decay: 0.34, tail: 1.9, gain: 0.26, sparkles: 4, bloom: false },
  orange: { notes: [-12, -5, 0, 4, 7, 12], spacing: 0.06, decay: 0.38, tail: 3, gain: 0.26, sparkles: 10, bloom: true },
};

/** How long a coin's chime lasts (s), not counting the echo. */
export function voiceDuration(v: CoinVoice): number {
  return (v.notes.length - 1) * v.spacing + v.decay * v.tail;
}

/** Pitch of a coin pickup with no combo: G5. */
export const COIN_BASE_HZ = 784;

export const semitoneRatio = (n: number) => Math.pow(2, n / 12);

/** Music tiles count their notes in semitones from C5. */
export const MUSIC_BASE_HZ = 523.25;

/** The pitch (Hz) of a music tile note given in semitones from C5 (A4 = -3 → 440 Hz). */
export const noteHz = (semitones: number) => MUSIC_BASE_HZ * semitoneRatio(semitones);

/** High notes sound louder to the ear (and to small speakers): turn them down a little. */
const highTame = (hz: number) => (hz > 1200 ? Math.sqrt(1200 / hz) : 1);

// ---------------------------------------------------------------------- audio graph

/** Overall volume (before the limiter). */
const MASTER = 0.8;

/** Half a second of white noise, the raw material of the boost whoosh. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.6);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Two seconds of seamless rumble texture: brown noise (deep, soft) with a sprinkle of tiny
 * grit impulses, which become a finer, faster texture as the playback rate rises with speed.
 */
function rumbleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 2);
  const fade = Math.floor(sr * 0.1);
  const raw = new Float32Array(len + fade);
  let brown = 0;
  let grit = 0;
  for (let i = 0; i < raw.length; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    if (Math.random() < 0.004) grit += (Math.random() * 2 - 1) * 0.5;
    grit *= 0.85;
    raw[i] = brown * 3.5 + grit;
  }
  const buffer = ctx.createBuffer(1, len, sr);
  const out = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < len; i++) {
    // Cross-fade the overhang into the start so the loop has no seam.
    out[i] = i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i];
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < len; i++) out[i] *= 0.9 / (peak || 1);
  return buffer;
}

/** Three seconds of seamless white noise: the raw air of the wind (long enough not to sound looped). */
function windBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 3);
  const fade = Math.floor(sr * 0.1);
  const raw = new Float32Array(len + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1;
  const buffer = ctx.createBuffer(1, len, sr);
  const out = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) out[i] = (i < fade ? raw[i] * (i / fade) + raw[len + i] * (1 - i / fade) : raw[i]) * 0.8;
  return buffer;
}

/** A few slightly different tile clicks: a soft steel "tick" over a short wooden "tock". */
function clickBuffers(ctx: BaseAudioContext): AudioBuffer[] {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.045);
  return [1, 0.82, 0.68].map((amp, v) => {
    const buffer = ctx.createBuffer(1, len, sr);
    const d = buffer.getChannelData(0);
    const tick = 1900 + v * 260;
    const tock = 420 - v * 40;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] =
        amp *
        (Math.sin(2 * Math.PI * tick * t) * Math.exp(-t / 0.0045) * 0.55 +
          Math.sin(2 * Math.PI * tock * t) * Math.exp(-t / 0.014) * 0.6 +
          (Math.random() * 2 - 1) * Math.exp(-t / 0.0012) * 0.35);
    }
    return buffer;
  });
}

/**
 * The whole sound graph on any audio context (also an OfflineAudioContext, for checking
 * levels): master bus with a soft limiter, the rolling layers and the coin chimes.
 */
export class SoundGraph {
  readonly master: GainNode;
  private readonly sfx: GainNode;
  private readonly rumble: GainNode;
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly ringFilter: BiquadFilterNode;
  private readonly rumbleSource: AudioBufferSourceNode;
  private readonly clickBus: GainNode;
  private readonly clicks: AudioBuffer[];
  private readonly wind: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windSource: AudioBufferSourceNode;
  private readonly gust: OscillatorNode;
  private noise: AudioBuffer | null = null;

  constructor(readonly ctx: BaseAudioContext) {
    // A safety ceiling only: normal play stays below it, so nothing pumps or gets squashed.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(limiter);

    // Coin chimes: softened top end plus a short, dark echo for a bit of sparkle and space.
    this.sfx = ctx.createGain();
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5500;
    this.sfx.connect(soften).connect(this.master);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.13;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.25;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.sfx.connect(delay).connect(echoTone).connect(wet).connect(this.master);
    echoTone.connect(feedback).connect(delay);

    // Rolling: a looped rumble texture through a speed-dependent low-pass, with a faint
    // band-pass "steel singing" layer, plus tile clicks on their own bus.
    this.rumbleSource = ctx.createBufferSource();
    this.rumbleSource.buffer = rumbleBuffer(ctx);
    this.rumbleSource.loop = true;
    // Deep sub-bass is inaudible on iPad speakers but would eat headroom: cut it.
    const rumbleFloor = ctx.createBiquadFilter();
    rumbleFloor.type = 'highpass';
    rumbleFloor.frequency.value = 90;
    rumbleFloor.Q.value = 0.7;
    this.rumbleSource.connect(rumbleFloor);
    this.rumbleFilter = ctx.createBiquadFilter();
    this.rumbleFilter.type = 'lowpass';
    this.rumbleFilter.Q.value = 0.7;
    this.ringFilter = ctx.createBiquadFilter();
    this.ringFilter.type = 'bandpass';
    this.ringFilter.Q.value = 2.5;
    const ringLevel = ctx.createGain();
    ringLevel.gain.value = 0.6;
    this.rumble = ctx.createGain();
    this.rumble.gain.value = 0;
    rumbleFloor.connect(this.rumbleFilter).connect(this.rumble);
    rumbleFloor.connect(this.ringFilter).connect(ringLevel).connect(this.rumble);
    this.rumble.connect(this.master);

    this.clicks = clickBuffers(ctx);
    this.clickBus = ctx.createGain();
    const clickTone = ctx.createBiquadFilter();
    clickTone.type = 'lowpass';
    clickTone.frequency.value = 4200;
    this.clickBus.connect(clickTone).connect(this.master);
    this.applyRoll(rollMix(0, 0), 0);

    // Wind: looped noise through a band-pass whose center sways slowly (gusts), so the air
    // rushing past never sounds like a steady hiss.
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = windBuffer(ctx);
    this.windSource.loop = true;
    const windFloor = ctx.createBiquadFilter();
    windFloor.type = 'highpass';
    windFloor.frequency.value = 160;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.9;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    this.windSource.connect(windFloor).connect(this.windFilter).connect(this.wind).connect(this.master);
    this.gust = ctx.createOscillator();
    this.gust.frequency.value = 0.45;
    const gustDepth = ctx.createGain();
    gustDepth.gain.value = 160;
    this.gust.connect(gustDepth).connect(this.windFilter.frequency);
    this.applyWind(windMix(0, 0), 0);
  }

  /** Starts the (silent until mixed in) rumble and wind loops. */
  start(): void {
    this.rumbleSource.start();
    this.windSource.start();
    this.gust.start();
  }

  /** Glides the wind toward a mix; `smoothing` is the time constant (0 = at once). */
  applyWind(mix: WindMix, smoothing: number): void {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number, k: number) => (k > 0 ? p.setTargetAtTime(v, now, k) : p.setValueAtTime(v, now));
    set(this.wind.gain, mix.gain, smoothing);
    set(this.windFilter.frequency, mix.cutoff, smoothing * 2);
  }

  /** Glides the rolling layers toward a mix; `smoothing` is the time constant (0 = at once). */
  applyRoll(mix: RollMix, smoothing: number): void {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number, k = smoothing) => (k > 0 ? p.setTargetAtTime(v, now, k) : p.setValueAtTime(v, now));
    set(this.rumble.gain, mix.rumble);
    set(this.clickBus.gain, mix.click);
    set(this.rumbleFilter.frequency, mix.cutoff, smoothing * 1.5);
    set(this.ringFilter.frequency, mix.ring, smoothing * 1.5);
    set(this.rumbleSource.playbackRate, mix.rate, smoothing * 2);
  }

  /** One tile click at `when`, slightly varied so a run of them never sounds mechanical. */
  click(when: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.clicks[Math.floor(Math.random() * this.clicks.length)];
    src.playbackRate.value = 0.92 + Math.random() * 0.16;
    src.connect(this.clickBus);
    src.start(when);
  }

  /** A bell-like note: a sine with two quieter overtones that fade first, with a tiny upward "blip". */
  private chime(when: number, hz: number, gain: number, decay: number): void {
    const ctx = this.ctx;
    const g = gain * highTame(hz);
    for (const [mult, level, life] of [
      [1, 1, 1],
      [2, 0.28, 0.45],
      [2.98, 0.1, 0.25],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(hz * mult * 0.985, when);
      osc.frequency.exponentialRampToValueAtTime(hz * mult, when + 0.025);
      const env = ctx.createGain();
      const end = when + decay * life;
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(g * level, when + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(this.sfx);
      osc.start(when);
      osc.stop(end + 0.02);
    }
  }

  /** A short, quiet, very high ping (glitter). */
  private sparkle(when: number, hz: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = hz;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(gain * highTame(hz), when + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
    osc.connect(env).connect(this.sfx);
    osc.start(when);
    osc.stop(when + 0.16);
  }

  /** A warm, swelling low chord under the jackpot chime. */
  private bloom(when: number, hz: number): void {
    for (const [ratio, level] of [
      [0.25, 0.1],
      [0.375, 0.07],
      [0.5, 0.05],
    ]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz * ratio;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(level, when + 0.05);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 1.1);
      osc.connect(env).connect(this.sfx);
      osc.start(when);
      osc.stop(when + 1.15);
    }
  }

  /**
   * A music tile: a wooden mallet note, like a kids' marimba. A warm tone, its bright
   * tuned overtone and a soft knock, all short so quick notes stay clear.
   */
  mallet(when: number, hz: number): void {
    const ctx = this.ctx;
    const tame = highTame(hz);
    for (const [mult, level, decay] of [
      [1, 0.34, 0.6],
      [3.93, 0.1, 0.1],
      [9.2, 0.035, 0.025],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(level * tame, when + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      osc.connect(env).connect(this.sfx);
      osc.start(when);
      osc.stop(when + decay + 0.02);
    }
  }

  /** Landing after a drop: a soft, low "thump" with a little wooden knock. */
  thump(when: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, when);
    osc.frequency.exponentialRampToValueAtTime(55, when + 0.14);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.45, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(env).connect(this.master);
    osc.start(when);
    osc.stop(when + 0.25);
    this.click(when);
  }

  /** Boost arrows: a rising "whoosh" of air with a zooming tone underneath. */
  whoosh(when: number): void {
    const ctx = this.ctx;
    this.noise ??= noiseBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(350, when);
    band.frequency.exponentialRampToValueAtTime(2600, when + 0.32);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.55, when + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    src.connect(band).connect(env).connect(this.master);
    src.start(when);
    src.stop(when + 0.55);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, when);
    osc.frequency.exponentialRampToValueAtTime(880, when + 0.35);
    const tone = ctx.createGain();
    tone.gain.setValueAtTime(0.0001, when);
    tone.gain.exponentialRampToValueAtTime(0.1, when + 0.05);
    tone.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    osc.connect(tone).connect(this.sfx);
    osc.start(when);
    osc.stop(when + 0.45);
  }

  /** A checkpoint gate: a calm, rising two-note bell over a warm chord, with a little glitter. */
  gate(when: number): void {
    const hz = COIN_BASE_HZ * semitoneRatio(-5); // D5, under the coin chimes
    this.chime(when, hz, 0.3, 0.6);
    this.chime(when + 0.14, hz * semitoneRatio(7), 0.3, 1.3);
    this.bloom(when, hz * 2);
    for (let i = 0; i < 3; i++) this.sparkle(when + 0.18 + i * 0.07, COIN_BASE_HZ * 2.6 * semitoneRatio(COMBO.scale[i * 2]), 0.06);
  }

  /** A coin pickup: the color's arpeggio at `hz`, with glitter; `top` adds a combo sparkle. */
  coin(color: CoinColor, hz: number, when: number, top = false): void {
    const v = COIN_VOICES[color];
    v.notes.forEach((n, i) => {
      const last = i === v.notes.length - 1;
      this.chime(when + i * v.spacing, hz * semitoneRatio(n), v.gain, v.decay * (last ? v.tail : 1));
    });
    if (v.bloom) this.bloom(when, hz);
    const sparkles = v.sparkles + (top ? 2 : 0);
    const spread = voiceDuration(v) * 0.8;
    for (let i = 0; i < sparkles; i++) {
      // Glitter on the notes of the pentatonic scale, two octaves up (≈ 2–3.5 kHz).
      const note = COMBO.scale[Math.floor(Math.random() * COMBO.scale.length)];
      this.sparkle(when + 0.03 + Math.random() * spread, COIN_BASE_HZ * 2.6 * semitoneRatio(note), 0.07);
    }
  }
}

// ---------------------------------------------------------------------- live sound

const ignore = () => {};

/**
 * The game's sound. Audio starts on the first tap (iOS only allows it inside a user gesture),
 * pauses while the app is hidden, and can be switched off in Settings.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private graph: SoundGraph | null = null;
  private readonly combo = new CoinCombo();
  private clickPhase = 0;
  private paramClock = 0;
  private lastRumble = 0;
  private windClock = 0;
  private lastWind = 0;
  private lastCoinAt = 0;
  private offTimer = 0;
  /** Audio could not be set up on this device: stay silent, don't retry on every tap. */
  private failed = false;

  constructor(private enabled: boolean) {}

  get on(): boolean {
    return this.enabled;
  }

  /** Taps (re)start audio; hiding the app pauses it. */
  listen(target: EventTarget): void {
    const unlock = () => this.unlock();
    for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
      target.addEventListener(type, unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(ignore);
      else if (this.enabled) this.ctx.resume().catch(ignore);
    });
  }

  /** Creates or resumes the audio context. Call it inside a user tap. */
  unlock(): void {
    if (!this.enabled || document.hidden) return;
    if (!this.ctx && !this.failed) this.create();
    // iOS can also leave it 'interrupted' (a call, Siri): any tap brings it back.
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(ignore);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    clearTimeout(this.offTimer);
    if (on) {
      this.unlock();
      if (this.ctx && this.graph) this.graph.master.gain.setTargetAtTime(MASTER, this.ctx.currentTime, 0.02);
      return;
    }
    if (!this.ctx || !this.graph) return;
    this.graph.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    const ctx = this.ctx;
    this.offTimer = window.setTimeout(() => {
      if (!this.enabled) ctx.suspend().catch(ignore);
    }, 200);
  }

  private create(): void {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      this.failed = true;
      return;
    }
    // 'ambient': game sounds mix with other audio (music the family is playing) and follow
    // the mute setting, like most iPad games. iPadOS 16.4+; older systems keep the default.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'ambient';
      } catch {
        // Not supported: the default session is fine.
      }
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      this.graph = new SoundGraph(ctx);
      this.graph.start();
      this.ctx = ctx;
    } catch (err) {
      // No sound rather than a broken game.
      console.warn('Audio unavailable', err);
      ctx?.close().catch(ignore);
      this.graph = null;
      this.failed = true;
      return;
    }
    // A tiny silent buffer played inside the tap fully wakes the audio output on iOS.
    const wake = this.ctx.createBufferSource();
    wake.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    wake.connect(this.ctx.destination);
    wake.start();
  }

  private ready(): boolean {
    return this.enabled && this.ctx !== null && this.ctx.state === 'running';
  }

  /**
   * Call every frame. `speed` in m/s, `contact` 0..1 (see contactFactor); pass 0 for both
   * whenever the ball isn't rolling in play (paused, Game Over, menus, win screen).
   */
  roll(speed: number, contact: number, dt: number): void {
    if (!this.ready()) return;
    const graph = this.graph!;
    const mix = rollMix(speed, contact);
    if (mix.clickRate > 0 && dt > 0) {
      this.clickPhase += mix.clickRate * dt;
      if (this.clickPhase >= 1) {
        this.clickPhase %= 1; // at most one per frame
        graph.click(this.ctx!.currentTime + 0.01);
      }
    } else {
      // Start the next roll part-way to a seam, so the first click isn't always at the same spot.
      this.clickPhase = Math.random() * 0.6;
    }
    // Parameter glides are refreshed ~30 times a second, and once when going silent.
    this.paramClock -= dt;
    const silent = mix.rumble === 0;
    if (silent && this.lastRumble === 0) return;
    if (!silent && this.paramClock > 0) return;
    this.paramClock = 1 / 30;
    // Fade out faster than in: leaving the track or pausing cuts the sound promptly but softly.
    graph.applyRoll(mix, mix.rumble < this.lastRumble ? 0.035 : 0.06);
    this.lastRumble = mix.rumble;
  }

  /**
   * Call every frame. `speed` in m/s, `airTime` how long the ball has been off the ground (s);
   * pass 0 for both whenever there should be no wind. `fade` is how quickly it dies away
   * (time constant, s): quick on landing, slower after Game Over.
   */
  air(speed: number, airTime: number, dt: number, fade = 0.05): void {
    if (!this.ready()) return;
    const mix = windMix(speed, airTime);
    this.windClock -= dt;
    const silent = mix.gain === 0;
    if (silent && this.lastWind === 0) return;
    if (!silent && this.windClock > 0) return;
    this.windClock = 1 / 30;
    this.graph!.applyWind(mix, mix.gain < this.lastWind ? fade : 0.08);
    this.lastWind = mix.gain;
  }

  /** A music tile's note, in semitones from C5. */
  note(semitones: number): void {
    if (!this.ready()) return;
    this.graph!.mallet(this.ctx!.currentTime + 0.005, noteHz(semitones));
  }

  /** The thump of landing after a drop or a fall onto a lower platform. */
  land(): void {
    if (!this.ready()) return;
    this.graph!.thump(this.ctx!.currentTime + 0.005);
  }

  /** The whoosh of rolling onto boost arrows. */
  boost(): void {
    if (!this.ready()) return;
    this.graph!.whoosh(this.ctx!.currentTime + 0.005);
  }

  /** The chime for rolling through a checkpoint gate. */
  checkpoint(): void {
    if (!this.ready()) return;
    this.graph!.gate(this.ctx!.currentTime + 0.01);
  }

  /** A coin pickup chime; quick pickups in a row climb in pitch. */
  coin(color: CoinColor): void {
    if (!this.ready()) return;
    const now = this.ctx!.currentTime;
    const { step, semitones } = this.combo.next(now);
    // Two coins in the same frame: play them one after the other.
    const when = Math.max(now + 0.005, this.lastCoinAt + 0.06);
    this.lastCoinAt = when;
    this.graph!.coin(color, COIN_BASE_HZ * semitoneRatio(semitones), when, comboAtTop(step));
  }
}
