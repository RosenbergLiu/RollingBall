export interface ProgressData {
  /** Highest unlocked level id (levels 1..unlocked are playable). */
  unlocked: number;
  /** Best completion time in seconds, by level id. */
  best: Record<string, number>;
}

export const defaultProgress = (): ProgressData => ({ unlocked: 1, best: {} });

export function sanitizeProgress(raw: unknown, levelCount: number): ProgressData {
  const out = defaultProgress();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<ProgressData>;
  if (typeof r.unlocked === 'number' && Number.isFinite(r.unlocked)) {
    out.unlocked = Math.min(levelCount, Math.max(1, Math.floor(r.unlocked)));
  }
  if (r.best && typeof r.best === 'object') {
    for (const [k, v] of Object.entries(r.best)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out.best[k] = v;
    }
  }
  return out;
}

export function isUnlocked(p: ProgressData, levelId: number): boolean {
  return levelId >= 1 && levelId <= p.unlocked;
}

export interface CompletionResult {
  progress: ProgressData;
  newBest: boolean;
  best: number;
  unlockedNext: boolean;
}

/** Records a finished run: keeps the best time and unlocks the next level. */
export function recordCompletion(p: ProgressData, levelId: number, time: number, levelCount: number): CompletionResult {
  const prev = p.best[levelId];
  const newBest = prev === undefined || time < prev;
  const best = { ...p.best };
  if (newBest) best[levelId] = time;
  const unlocked = Math.min(levelCount, Math.max(p.unlocked, levelId + 1));
  return {
    progress: { unlocked, best },
    newBest,
    best: best[levelId],
    unlockedNext: unlocked > p.unlocked,
  };
}

/** The level the Play button starts: the first unlocked level without a best time. */
export function nextPlayableLevel(p: ProgressData, levelCount: number): number {
  for (let id = 1; id <= Math.min(p.unlocked, levelCount); id++) {
    if (p.best[id] === undefined) return id;
  }
  return Math.min(p.unlocked, levelCount);
}
