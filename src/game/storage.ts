import { Preferences } from '@capacitor/preferences';
import { sanitizeProgress, type ProgressData } from './progress';
import { sanitizeSettings, type Settings } from './settings';
import { sanitizeWallet, type Wallet } from './wallet';

const KEY = 'rolling-ball-progress-v1';
const WALLET_KEY = 'rolling-ball-wallet-v1';
const SETTINGS_KEY = 'rolling-ball-settings-v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const { value } = await Preferences.get({ key: SETTINGS_KEY });
    return sanitizeSettings(value ? JSON.parse(value) : null);
  } catch (err) {
    console.warn('Could not load settings', err);
    return sanitizeSettings(null);
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(s) });
  } catch (err) {
    console.warn('Could not save settings', err);
  }
}

export async function loadWallet(): Promise<Wallet> {
  try {
    const { value } = await Preferences.get({ key: WALLET_KEY });
    return sanitizeWallet(value ? JSON.parse(value) : null);
  } catch (err) {
    console.warn('Could not load wallet', err);
    return sanitizeWallet(null);
  }
}

export async function saveWallet(w: Wallet): Promise<void> {
  try {
    await Preferences.set({ key: WALLET_KEY, value: JSON.stringify(w) });
  } catch (err) {
    console.warn('Could not save wallet', err);
  }
}

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
