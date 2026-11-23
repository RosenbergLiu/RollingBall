import { COIN_COLORS, COIN_HEX, totalCoins, type CoinColor, type CoinCounts } from '../game/coins';
import type { TouchVisual } from '../game/input';
import type { LevelDef } from '../game/level';
import { isUnlocked, type ProgressData } from '../game/progress';

export interface UIHandlers {
  play(): void;
  levels(): void;
  select(id: number): void;
  menu(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  next(): void;
  replay(): void;
}

export interface WinInfo {
  levelId: number;
  name: string;
  time: number;
  best: number;
  newBest: boolean;
  falls: number;
  nextName: string | null;
  unlockedNext: boolean;
  /** Coins collected during this run, per color. */
  coins: CoinCounts;
}

const COIN_NAMES: Record<CoinColor, string> = { yellow: 'Yellow', blue: 'Blue', purple: 'Purple', orange: 'Orange' };

/** A small coin icon in the given color. */
const coinIcon = (color: CoinColor) => `<span class="coin" style="--c:${COIN_HEX[color]}" aria-hidden="true"></span>`;

type Screen = 'loading' | 'menu' | 'levels' | 'hud' | 'gameover' | 'win' | 'pause';

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, '0')}` : s.toFixed(2);
}

const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>`;
const PAUSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

const TEMPLATE = /* html */ `
<svg class="touch" data-bind="touch" aria-hidden="true">
  <circle class="touch-range" data-bind="touch-range" />
  <line class="touch-line" data-bind="touch-line" />
  <circle class="touch-finger" data-bind="touch-finger" r="28" />
</svg>
<div class="ui">
  <section class="screen loading visible" data-screen="loading">
    <div class="spinner"></div>
  </section>

  <section class="screen menu" data-screen="menu">
    <div class="panel menu-panel">
      <div class="logo">
        <span class="logo-ball"></span>
        <h1>Rolling<br/>Ball</h1>
      </div>
      <p class="tagline">Steer a steel ball along floating tracks. No fences. Don't fall.</p>
      <div class="wallet" data-bind="wallet" aria-label="Your coins"></div>
      <button class="btn primary big" data-action="play">Play <span data-bind="play-level"></span></button>
      <button class="btn big" data-action="levels">Select Level</button>
      <p class="how">Touch &amp; drag anywhere — the ball is pushed toward your finger.<br/>The farther your finger is from the ball, the stronger the push.</p>
    </div>
  </section>

  <section class="screen levels" data-screen="levels">
    <header class="levels-header">
      <button class="btn" data-action="menu">‹ Menu</button>
      <h2>Select Level</h2>
      <span class="levels-count" data-bind="levels-count"></span>
    </header>
    <div class="level-grid scroll" data-bind="level-grid"></div>
  </section>

  <section class="hud" data-screen="hud">
    <div class="hud-top">
      <div class="pill level-pill"><b data-bind="hud-level"></b><span data-bind="hud-name"></span></div>
      <div class="pill timer" data-bind="hud-time">0.00</div>
      <div class="hud-right">
        <div class="pill coins-pill" data-bind="hud-coins-pill"><span class="coin" data-bind="hud-coin-icon" style="--c:${COIN_HEX.yellow}"></span><b data-bind="hud-coins">0</b></div>
        <div class="pill falls">Falls <b data-bind="hud-falls">0</b></div>
        <button class="btn round" data-action="pause" aria-label="Pause">${PAUSE}</button>
      </div>
    </div>
    <div class="progress"><div class="progress-fill" data-bind="hud-progress"></div></div>
    <div class="hint" data-bind="hint">
      Touch &amp; drag — the ball rolls toward your finger
      <small>Farther from the ball = stronger push. Reach the finish line!</small>
    </div>
  </section>

  <section class="banner" data-screen="gameover">
    <h2>Game Over</h2>
    <p>Respawning at the entrance…</p>
  </section>

  <section class="screen modal" data-screen="win">
    <div class="panel dialog">
      <div class="kicker">Level <span data-bind="win-level"></span> complete</div>
      <h2 data-bind="win-name"></h2>
      <div class="stats">
        <div><span>Time</span><b data-bind="win-time"></b></div>
        <div><span>Best</span><b data-bind="win-best"></b><em data-bind="win-newbest">New best!</em></div>
        <div><span>Falls</span><b data-bind="win-falls"></b></div>
      </div>
      <div class="win-coins" data-bind="win-coins"></div>
      <p class="unlock" data-bind="win-unlock"></p>
      <div class="actions">
        <button class="btn primary big" data-action="next" data-bind="win-next">Next Level ›</button>
        <div class="actions-row">
          <button class="btn" data-action="replay">Replay</button>
          <button class="btn" data-action="menu">Menu</button>
        </div>
      </div>
    </div>
  </section>

  <section class="screen modal" data-screen="pause">
    <div class="panel dialog">
      <h2>Paused</h2>
      <div class="actions">
        <button class="btn primary big" data-action="resume">Resume</button>
        <button class="btn" data-action="restart">Restart Level</button>
        <button class="btn" data-action="levels">Select Level</button>
        <button class="btn" data-action="menu">Main Menu</button>
      </div>
    </div>
  </section>
</div>`;

export class UI {
  private readonly screens = new Map<Screen, HTMLElement>();
  private readonly binds = new Map<string, HTMLElement>();
  private lastTimeText = '';
  private lastFalls = -1;
  private lastProgress = -1;

  constructor(
    root: HTMLElement,
    private readonly levels: LevelDef[],
    private readonly h: UIHandlers,
  ) {
    root.insertAdjacentHTML('beforeend', TEMPLATE);
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => this.screens.set(el.dataset.screen as Screen, el));
    root.querySelectorAll<HTMLElement>('[data-bind]').forEach((el) => this.binds.set(el.dataset.bind!, el));
    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      this.dispatch(btn.dataset.action!, btn);
    });
  }

  private bind(name: string): HTMLElement {
    return this.binds.get(name)!;
  }

  private dispatch(action: string, el: HTMLElement): void {
    switch (action) {
      case 'play':
        return this.h.play();
      case 'levels':
        return this.h.levels();
      case 'select':
        return this.h.select(Number(el.dataset.level));
      case 'menu':
        return this.h.menu();
      case 'pause':
        return this.h.pause();
      case 'resume':
        return this.h.resume();
      case 'restart':
        return this.h.restart();
      case 'next':
        return this.h.next();
      case 'replay':
        return this.h.replay();
    }
  }

  private only(...names: Screen[]): void {
    for (const [name, el] of this.screens) el.classList.toggle('visible', names.includes(name));
  }

  showMenu(playLevel: number, wallet: CoinCounts): void {
    this.bind('play-level').textContent = `· Level ${playLevel}`;
    this.bind('wallet').innerHTML = COIN_COLORS.map(
      (c) => `<span class="wallet-chip" title="${COIN_NAMES[c]} coins">${coinIcon(c)}<b>${wallet[c]}</b></span>`,
    ).join('');
    this.setTouch(null);
    this.only('menu');
  }

  showLevels(progress: ProgressData): void {
    const grid = this.bind('level-grid');
    const done = this.levels.filter((l) => progress.best[l.id] !== undefined).length;
    this.bind('levels-count').textContent = `${done} / ${this.levels.length} completed`;
    grid.innerHTML = this.levels
      .map((l) => {
        const unlocked = isUnlocked(progress, l.id);
        const best = progress.best[l.id];
        const t = l.theme;
        return `
        <button class="level-card ${unlocked ? '' : 'locked'} ${best !== undefined ? 'done' : ''}"
          data-action="select" data-level="${l.id}" ${unlocked ? '' : 'disabled aria-disabled="true"'}
          style="--a:${t.tileA};--b:${t.side};--rim:${t.rim}">
          <span class="level-num">${l.id}</span>
          <span class="level-name">${l.name}</span>
          <span class="level-tag">${l.tagline}</span>
          <span class="level-best">${
            !unlocked ? `${LOCK} Locked` : best !== undefined ? `${CHECK} Best ${formatTime(best)}s` : 'Not completed'
          }</span>
        </button>`;
      })
      .join('');
    this.setTouch(null);
    this.only('levels');
  }

  showPlaying(def: LevelDef): void {
    this.bind('hud-level').textContent = `Level ${def.id}`;
    this.bind('hud-name').textContent = def.name;
    this.only('hud');
  }

  updateHud(time: number, falls: number, progress: number): void {
    const text = formatTime(time);
    if (text !== this.lastTimeText) {
      this.lastTimeText = text;
      this.bind('hud-time').textContent = text;
    }
    if (falls !== this.lastFalls) {
      this.lastFalls = falls;
      this.bind('hud-falls').textContent = String(falls);
    }
    const p = Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 1000;
    if (p !== this.lastProgress) {
      this.lastProgress = p;
      this.bind('hud-progress').style.transform = `scaleX(${p})`;
    }
  }

  /** Coins collected this run; `color` is the coin just picked up (bumps the counter). */
  setRunCoins(total: number, color?: CoinColor): void {
    this.bind('hud-coins').textContent = String(total);
    if (!color) return;
    this.bind('hud-coin-icon').style.setProperty('--c', COIN_HEX[color]);
    const pill = this.bind('hud-coins-pill');
    pill.classList.remove('bump');
    void pill.offsetWidth; // restart the animation
    pill.classList.add('bump');
  }

  showHint(on: boolean): void {
    this.bind('hint').classList.toggle('visible', on);
  }

  showGameOver(on: boolean): void {
    this.screens.get('gameover')!.classList.toggle('visible', on);
    if (on) this.setTouch(null);
  }

  showPause(on: boolean): void {
    this.screens.get('pause')!.classList.toggle('visible', on);
    if (on) this.setTouch(null);
  }

  showWin(info: WinInfo): void {
    this.bind('win-level').textContent = String(info.levelId);
    this.bind('win-name').textContent = info.name;
    this.bind('win-time').textContent = `${formatTime(info.time)}s`;
    this.bind('win-best').textContent = `${formatTime(info.best)}s`;
    this.bind('win-newbest').style.display = info.newBest ? '' : 'none';
    this.bind('win-falls').textContent = String(info.falls);
    const got = COIN_COLORS.filter((c) => info.coins[c] > 0);
    this.bind('win-coins').innerHTML =
      totalCoins(info.coins) === 0
        ? '<span class="win-coins-none">No coins this time</span>'
        : `<span class="win-coins-label">Coins</span>` +
          got.map((c) => `<span class="wallet-chip">${coinIcon(c)}<b>+${info.coins[c]}</b></span>`).join('');
    const next = this.bind('win-next') as HTMLButtonElement;
    if (info.nextName) {
      next.style.display = '';
      next.textContent = `Next: ${info.nextName} ›`;
    } else {
      next.style.display = 'none';
    }
    this.bind('win-unlock').textContent = info.nextName
      ? info.unlockedNext
        ? `Unlocked level ${info.levelId + 1}: ${info.nextName}`
        : ''
      : 'You finished every level. Try beating your best times!';
    this.setTouch(null);
    this.only('hud', 'win');
  }

  /** Draws the push indicator: a range ring around the ball and a line to the finger. */
  setTouch(v: TouchVisual | null): void {
    const svg = this.bind('touch');
    if (!v || !v.active) {
      svg.classList.remove('visible');
      return;
    }
    svg.classList.add('visible');
    const range = this.bind('touch-range');
    range.setAttribute('cx', String(v.cx));
    range.setAttribute('cy', String(v.cy));
    range.setAttribute('r', String(v.radius));
    const line = this.bind('touch-line');
    line.setAttribute('x1', String(v.cx));
    line.setAttribute('y1', String(v.cy));
    line.setAttribute('x2', String(v.x));
    line.setAttribute('y2', String(v.y));
    line.style.strokeWidth = String(3 + v.strength * 7);
    line.style.opacity = String(0.35 + v.strength * 0.6);
    const finger = this.bind('touch-finger');
    finger.setAttribute('cx', String(v.x));
    finger.setAttribute('cy', String(v.y));
  }
}
