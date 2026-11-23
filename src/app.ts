import './style.css';
import { Game } from './game/game';
import { LEVELS } from './game/levels';
import { initPhysics } from './game/physics';
import { loadProgress } from './game/storage';

/** Loads the physics engine and saved progress, then starts the game. */
export async function startApp(): Promise<void> {
  const [progress] = await Promise.all([loadProgress(LEVELS.length), initPhysics()]);
  const game = new Game(document.getElementById('app')!, progress);
  game.start();
  const boot = document.getElementById('boot');
  if (boot) {
    requestAnimationFrame(() => boot.classList.add('done'));
    setTimeout(() => boot.remove(), 600);
  }
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
}
