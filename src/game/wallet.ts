import { COIN_COLORS, emptyCoinCounts, type CoinColor, type CoinCounts } from './coins';

/** The player's coin balance, one count per color. Coins have no use yet. */
export type Wallet = CoinCounts;

export const emptyWallet = (): Wallet => emptyCoinCounts();

export function addCoin(w: Wallet, color: CoinColor, amount = 1): Wallet {
  return { ...w, [color]: w[color] + amount };
}

export function sanitizeWallet(raw: unknown): Wallet {
  const out = emptyWallet();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const c of COIN_COLORS) {
    const v = r[c];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[c] = Math.floor(v);
  }
  return out;
}
