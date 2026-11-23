import { Preferences } from '@capacitor/preferences';
import { sanitizeProgress, type ProgressData } from './progress';
import { sanitizeWallet, type Wallet } from './wallet';

const KEY = 'rolling-ball-progress-v1';
const WALLET_KEY = 'rolling-ball-wallet-v1';

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
