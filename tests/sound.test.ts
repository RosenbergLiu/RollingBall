import { describe, expect, it } from 'vitest';
import { BURST_POOL, BURST_SPECS, burstSize } from '../src/game/coinBurst';
import { COIN_COLORS } from '../src/game/coins';
import {
  COIN_VOICES,
  COMBO,
  CoinCombo,
  ROLL,
  WIND,
  comboAtTop,
  contactFactor,
  rollMix,
  voiceDuration,
  windMix,
} from '../src/game/sound';

const noJitter = () => 0.5;

describe('rolling sound', () => {
  it('is silent when the ball is stopped or nearly stopped', () => {
    for (const speed of [0, 0.1, ROLL.minSpeed]) {
      const m = rollMix(speed, 1);
      expect(m.rumble).toBe(0);
      expect(m.click).toBe(0);
      expect(m.clickRate).toBe(0);
    }
  });

  it('gets louder, brighter and higher with speed', () => {
    const speeds = [0.6, 1, 2, 4, 7, 10, 13];
    const mixes = speeds.map((v) => rollMix(v, 1));
    for (let i = 1; i < mixes.length; i++) {
      expect(mixes[i].rumble).toBeGreaterThan(mixes[i - 1].rumble);
      expect(mixes[i].click).toBeGreaterThan(mixes[i - 1].click);
      expect(mixes[i].cutoff).toBeGreaterThan(mixes[i - 1].cutoff);
      expect(mixes[i].rate).toBeGreaterThan(mixes[i - 1].rate);
    }
  });

  it('levels off at full speed instead of growing without limit', () => {
    const full = rollMix(ROLL.fullSpeed, 1);
    expect(full.rumble).toBeCloseTo(ROLL.rumble);
    expect(full.click).toBeCloseTo(ROLL.click);
    const faster = rollMix(40, 1);
    expect({ ...faster, clickRate: 0 }).toEqual({ ...full, clickRate: 0 });
  });

  it('clicks once per tile seam, capped at a gentle rate', () => {
    expect(rollMix(6, 1).clickRate).toBeCloseTo(6 / ROLL.tile);
    expect(rollMix(30, 1).clickRate).toBe(ROLL.maxClickRate);
  });

  it('goes quiet when the ball is in the air or falling', () => {
    const m = rollMix(10, 0);
    expect(m.rumble).toBe(0);
    expect(m.click).toBe(0);
    expect(m.clickRate).toBe(0);
    // Barely touching: fades, and no tile clicks.
    expect(rollMix(10, 0.3).rumble).toBeLessThan(rollMix(10, 1).rumble);
    expect(rollMix(10, 0.3).clickRate).toBe(0);
  });

  it('treats broken input as silence', () => {
    expect(rollMix(NaN, 1).rumble).toBe(0);
    expect(rollMix(5, NaN).rumble).toBe(0);
    expect(rollMix(-3, 1).rumble).toBe(0);
  });
});

describe('wind while in the air', () => {
  it('is silent on the ground and for a quick hop over a crest', () => {
    expect(windMix(12, 0).gain).toBe(0);
    expect(windMix(12, 0.06).gain).toBe(0);
  });

  it('fades in the longer the ball is in the air, then holds', () => {
    const gains = [0.1, 0.2, 0.3, 0.4].map((t) => windMix(10, t).gain);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeGreaterThan(gains[i - 1]);
    expect(windMix(10, 1).gain).toBeCloseTo(windMix(10, 3).gain, 6);
  });

  it('gets louder and brighter the faster the ball moves, up to a cap', () => {
    const slow = windMix(3, 1);
    const fast = windMix(15, 1);
    expect(fast.gain).toBeGreaterThan(slow.gain);
    expect(fast.cutoff).toBeGreaterThan(slow.cutoff);
    expect(windMix(100, 5).gain).toBeLessThanOrEqual(WIND.gain);
    expect(windMix(WIND.fullSpeed, 5).gain).toBeCloseTo(WIND.gain, 6);
  });

  it('is silent for bad input', () => {
    expect(windMix(Number.NaN, 1).gain).toBe(0);
    expect(windMix(10, Number.NaN).gain).toBe(0);
    expect(windMix(-5, 1).gain).toBeGreaterThanOrEqual(0);
  });
});

describe('ball contact', () => {
  const r = 0.5;
  it('is full while the ball rests on the surface', () => {
    expect(contactFactor(r, r)).toBe(1);
    expect(contactFactor(r + 0.03, r)).toBe(1);
    expect(contactFactor(r - 0.03, r)).toBe(1);
  });

  it('fades out as the ball leaves the surface, up or down', () => {
    expect(contactFactor(r + 0.12, r)).toBeGreaterThan(0);
    expect(contactFactor(r + 0.12, r)).toBeLessThan(1);
    expect(contactFactor(r + 0.4, r)).toBe(0); // hopping over a crest
    expect(contactFactor(r - 0.4, r)).toBe(0); // dropping off an edge or into a hole
    expect(contactFactor(NaN, r)).toBe(0);
  });
});

describe('coin pickup combo', () => {
  it('starts at the base pitch', () => {
    const combo = new CoinCombo();
    expect(combo.next(10, noJitter)).toEqual({ step: 0, semitones: 0 });
  });

  it('climbs the scale for quick pickups in a row', () => {
    const combo = new CoinCombo();
    const notes = [0, 0.3, 0.6, 1.2, 1.8].map((t) => combo.next(t, noJitter));
    expect(notes.map((n) => n.step)).toEqual([0, 1, 2, 3, 4]);
    expect(notes.map((n) => n.semitones)).toEqual(COMBO.scale.slice(0, 5));
  });

  it('starts over after a short gap', () => {
    const combo = new CoinCombo();
    combo.next(0, noJitter);
    combo.next(0.5, noJitter);
    expect(combo.next(0.5 + COMBO.gap + 0.01, noJitter)).toEqual({ step: 0, semitones: 0 });
    combo.next(5, noJitter);
    combo.reset();
    expect(combo.next(5.1, noJitter).step).toBe(0);
  });

  it('holds at the top of the scale on a long run', () => {
    const combo = new CoinCombo();
    const top = COMBO.scale[COMBO.scale.length - 1];
    let last = combo.next(0, noJitter);
    for (let i = 1; i < 12; i++) last = combo.next(i * 0.25, noJitter);
    expect(last.step).toBe(11);
    expect(last.semitones).toBe(top);
    expect(comboAtTop(last.step)).toBe(true);
    expect(comboAtTop(0)).toBe(false);
  });

  it('varies the pitch only slightly', () => {
    const lo = new CoinCombo().next(0, () => 0).semitones;
    const hi = new CoinCombo().next(0, () => 0.999999).semitones;
    expect(lo).toBeCloseTo(-COMBO.jitter);
    expect(hi).toBeCloseTo(COMBO.jitter);
    expect(COMBO.jitter).toBeLessThan(0.5); // well under a semitone: never sounds off-key
  });
});

describe('coin voices', () => {
  it('sound more special the rarer the coin', () => {
    const voices = COIN_COLORS.map((c) => COIN_VOICES[c]);
    for (let i = 1; i < voices.length; i++) {
      expect(voices[i].notes.length).toBeGreaterThan(voices[i - 1].notes.length);
      expect(voices[i].sparkles).toBeGreaterThan(voices[i - 1].sparkles);
      expect(voiceDuration(voices[i])).toBeGreaterThan(voiceDuration(voices[i - 1]));
    }
  });

  it('give only orange the jackpot bloom', () => {
    expect(COIN_COLORS.filter((c) => COIN_VOICES[c].bloom)).toEqual(['orange']);
  });

  it('stay short and soft', () => {
    for (const c of COIN_COLORS) {
      expect(voiceDuration(COIN_VOICES[c])).toBeLessThan(1.5);
      expect(COIN_VOICES[c].gain).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('coin pickup burst', () => {
  it('is bigger the rarer the coin', () => {
    const specs = COIN_COLORS.map((c) => BURST_SPECS[c]);
    for (let i = 1; i < specs.length; i++) {
      expect(specs[i].sparks).toBeGreaterThan(specs[i - 1].sparks);
      expect(specs[i].flash).toBeGreaterThan(specs[i - 1].flash);
      expect(specs[i].glitter).toBeGreaterThan(specs[i - 1].glitter);
    }
  });

  it('thins out at lower detail but never vanishes', () => {
    for (const c of COIN_COLORS) {
      const full = burstSize(BURST_SPECS[c], 1);
      const lite = burstSize(BURST_SPECS[c], 0.6);
      expect(full).toEqual({ sparks: BURST_SPECS[c].sparks, glitter: BURST_SPECS[c].glitter });
      expect(lite.sparks).toBeLessThan(full.sparks);
      expect(burstSize(BURST_SPECS[c], 0).sparks).toBeGreaterThanOrEqual(6);
    }
  });

  it('fits several bursts in the particle pool at once', () => {
    // One flash and one ring per burst, plus sparks and glitter.
    const biggest = Math.max(...COIN_COLORS.map((c) => BURST_SPECS[c].sparks + BURST_SPECS[c].glitter + 2));
    expect(biggest * 3).toBeLessThanOrEqual(BURST_POOL);
  });
});
