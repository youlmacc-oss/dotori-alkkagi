/**
 * 게임 세션 종료: 물리/AI/실시간 끊기 + 종료 화면.
 */

export function shutdownGameSession(deps = {}) {
  const { engine, turnManager, realtimeManager, cancelFrame } = deps;
  turnManager?.detach?.();
  engine?.stop?.();
  engine?.unbindInput?.();
  const disc = realtimeManager?.disconnect?.();
  if (disc && typeof disc.catch === 'function') disc.catch(() => {});
  if (typeof cancelFrame === 'function') cancelFrame();
  return { stopped: true };
}

export function applyGameExitScreen(root) {
  if (!root?.querySelector) return null;
  const result = root.querySelector('#result-modal');
  const settings = root.querySelector('#settings-modal');
  const lobby = root.querySelector('#lobby-users');
  const screen = root.querySelector('#game-exit-screen');
  if (result) result.hidden = true;
  if (settings) {
    settings.hidden = true;
    settings.setAttribute?.('hidden', '');
  }
  if (lobby) lobby.hidden = true;
  if (screen) {
    screen.hidden = false;
    screen.removeAttribute?.('hidden');
  }
  root.classList?.add?.('is-game-exited');
  return screen ?? null;
}

export function requestWindowClose(win = globalThis) {
  try {
    win.close?.();
  } catch {
    return false;
  }
  return Boolean(win.closed);
}

export function exitGame(deps = {}) {
  const shutdown = shutdownGameSession(deps);
  const screen = applyGameExitScreen(deps.root);
  const closed = requestWindowClose(deps.win);
  return { ...shutdown, closed, screen };
}
