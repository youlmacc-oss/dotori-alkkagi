import { describe, expect, it, vi } from 'vitest';
import {
  applyGameExitScreen,
  exitGame,
  kakaoInAppCloseHref,
  requestWindowClose,
  shouldQuitFromLobbyClose,
  shutdownGameSession,
} from '../src/ui/GameExit.js';

describe('게임종료', () => {
  it('물리·AI·실시간 세션을 끊는다', () => {
    const engine = { stop: vi.fn(), unbindInput: vi.fn() };
    const turnManager = { detach: vi.fn() };
    const realtimeManager = { disconnect: vi.fn(() => Promise.reject(new Error('ignore'))) };
    const cancelFrame = vi.fn();
    expect(shutdownGameSession({ engine, turnManager, realtimeManager, cancelFrame }))
      .toEqual({ stopped: true });
    expect(turnManager.detach).toHaveBeenCalledOnce();
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(engine.unbindInput).toHaveBeenCalledOnce();
    expect(realtimeManager.disconnect).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });

  it('종료 화면을 켜고 결과·설정·대기실을 닫는다', () => {
    const nodes = {
      '#result-modal': { hidden: false },
      '#settings-modal': { hidden: false, setAttribute: vi.fn() },
      '#lobby-users': { hidden: false },
      '#game-exit-screen': { hidden: true, removeAttribute: vi.fn() },
    };
    const root = {
      classList: { add: vi.fn() },
      querySelector: (sel) => nodes[sel] ?? null,
    };
    expect(applyGameExitScreen(root)).toBe(nodes['#game-exit-screen']);
    expect(nodes['#result-modal'].hidden).toBe(true);
    expect(nodes['#settings-modal'].hidden).toBe(true);
    expect(nodes['#lobby-users'].hidden).toBe(true);
    expect(nodes['#game-exit-screen'].hidden).toBe(false);
    expect(nodes['#game-exit-screen'].removeAttribute).toHaveBeenCalledWith('hidden');
    expect(root.classList.add).toHaveBeenCalledWith('is-game-exited');
  });

  it('대기실 X는 종료하고 대국 중 X는 접는다', () => {
    expect(shouldQuitFromLobbyClose(false)).toBe(true);
    expect(shouldQuitFromLobbyClose(true)).toBe(false);
  });

  it('카카오 인앱이면 닫기 스킴을 고른다', () => {
    expect(kakaoInAppCloseHref('Mozilla/5.0 KAKAOTALK Android')).toBe('kakaotalk://inappbrowser/close');
    expect(kakaoInAppCloseHref('Mozilla/5.0 KAKAOTALK iPhone')).toBe('kakaoweb://closeBrowser');
    expect(kakaoInAppCloseHref('Mozilla/5.0 Chrome')).toBe('');
  });

  it('창이 닫히면 true, 아니면 false', () => {
    const closedWin = { close: vi.fn(), closed: true };
    expect(requestWindowClose(closedWin)).toBe(true);
    expect(closedWin.close).toHaveBeenCalledOnce();
    expect(requestWindowClose({ close: vi.fn(), closed: false })).toBe(false);
  });

  it('직접 닫기가 막히면 self 창으로 다시 닫는다', () => {
    const opened = { close: vi.fn() };
    const win = {
      closed: false,
      close: vi.fn(),
      open: vi.fn(() => {
        win.closed = true;
        return opened;
      }),
    };
    expect(requestWindowClose(win)).toBe(true);
    expect(win.open).toHaveBeenCalledWith('', '_self');
    expect(opened.close).toHaveBeenCalledOnce();
  });

  it('exitGame은 세션 종료 후 화면을 바꾸고 창 닫기를 시도한다', () => {
    const engine = { stop: vi.fn(), unbindInput: vi.fn() };
    const screen = { hidden: true, removeAttribute: vi.fn() };
    const root = {
      classList: { add: vi.fn() },
      querySelector: (sel) => (sel === '#game-exit-screen' ? screen : { hidden: false, setAttribute: vi.fn() }),
    };
    const win = { close: vi.fn(), closed: false };
    const result = exitGame({ engine, root, win });
    expect(result.stopped).toBe(true);
    expect(result.closed).toBe(false);
    expect(result.screen).toBe(screen);
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(win.close).toHaveBeenCalledOnce();
    expect(screen.hidden).toBe(false);
  });
});
