import { Preferences } from '@capacitor/preferences';
import { sanitizeProgress, type ProgressData } from './progress';

const KEY = 'rolling-ball-progress-v1';

export async function loadProgress(levelCount: number): Promise<ProgressData> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return sanitizeProgress(value ? JSON.parse(value) : null, levelCount);
  } catch (err) {
    console.warn('Could not load progress', err);
    return sanitizeProgress(null, levelCount);
  }
}

export async function saveProgress(p: ProgressData): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify(p) });
  } catch (err) {
    console.warn('Could not save progress', err);
  }
}
