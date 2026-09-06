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

export function shouldQuitFromLobbyClose(inMatch = false) {
  return !inMatch;
}

export function kakaoInAppCloseHref(ua = '') {
  const text = String(ua || '');
  if (!/KAKAOTALK|KAKAOSTORY/i.test(text)) return '';
  if (/iPad|iPhone|iPod/i.test(text)) return 'kakaoweb://closeBrowser';
  return 'kakaotalk://inappbrowser/close';
}

export function requestWindowClose(win = globalThis) {
  try {
    win.close?.();
    if (win.closed) return true;

    const selfWin = typeof win.open === 'function' ? win.open('', '_self') : null;
    selfWin?.close?.();
    if (win.closed) return true;

    try {
      win.top?.close?.();
    } catch {
      /* ignore */
    }
    if (win.closed) return true;

    const href = kakaoInAppCloseHref(win.navigator?.userAgent);
    if (href) {
      try {
        win.location.assign?.(href);
      } catch {
        if (win.location) win.location.href = href;
      }
    }
  } catch {
    return Boolean(win?.closed);
  }
  return Boolean(win.closed);
}

export function exitGame(deps = {}) {
  const shutdown = shutdownGameSession(deps);
  const screen = applyGameExitScreen(deps.root);
  const closed = requestWindowClose(deps.win);
  return { ...shutdown, closed, screen };
}
