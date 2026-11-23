// Tiny entry point: it lets the loading spinner paint before the large game chunk
// (three.js + the Rapier physics engine) is downloaded, parsed and compiled.

// Block page scrolling, rubber-banding and pinch-zoom; only `.scroll` areas may pan.
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement).closest?.('.scroll')) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

function showError(err: unknown): void {
  console.error(err);
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;inset:0;z-index:20;margin:0;padding:24px;color:#fecdd3;background:#1a0710;white-space:pre-wrap;font:14px ui-monospace,monospace';
  el.textContent = `Failed to start the game:\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
  document.body.appendChild(el);
}

// Two frames: the first schedules a paint, the second runs after it was committed.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    setTimeout(() => import('./app').then((m) => m.startApp()).catch(showError), 60);
  }),
);
