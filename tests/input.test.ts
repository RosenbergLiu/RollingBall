import { describe, expect, it } from 'vitest';
import { pushVector } from '../src/game/input';
import { defaultSettings, sanitizeSettings } from '../src/game/settings';

describe('push strength (touch and joystick)', () => {
  it('does nothing inside the dead zone and is full at the full distance', () => {
    expect(pushVector(3, 0, 100, 10)).toEqual({ active: true, x: 0, y: 0, strength: 0 });
    const full = pushVector(0, 100, 100, 10);
    expect(full.strength).toBeCloseTo(1);
    expect(full.y).toBeCloseTo(1);
    expect(pushVector(0, 400, 100, 10).strength).toBe(1); // clamped beyond the full distance
  });

  it('points along the offset and grows with distance', () => {
    const v = pushVector(30, -40, 100, 0);
    expect(v.strength).toBeCloseTo(0.5);
    expect(v.x).toBeCloseTo(0.3);
    expect(v.y).toBeCloseTo(-0.4);
  });
});

describe('settings', () => {
  it('default to touch control', () => {
    expect(defaultSettings()).toEqual({ control: 'touch' });
  });

  it('keep known control modes and drop broken or retired ones', () => {
    expect(sanitizeSettings({ control: 'joystick' })).toEqual({ control: 'joystick' });
    expect(sanitizeSettings({ control: 'touch', extra: 1 })).toEqual({ control: 'touch' });
    // Tilt was a control mode briefly; a device that saved it goes back to touch.
    expect(sanitizeSettings({ control: 'tilt' })).toEqual({ control: 'touch' });
    expect(sanitizeSettings(null)).toEqual({ control: 'touch' });
    expect(sanitizeSettings('joystick')).toEqual({ control: 'touch' });
  });
});
