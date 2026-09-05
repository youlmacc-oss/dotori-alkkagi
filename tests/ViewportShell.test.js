import { describe, expect, it } from 'vitest';
import { ndcBoundsFitBox, ndcBoxToCss, ndcLiftToClearBottom, playfieldNdcBox, visualShellRect } from '../src/ui/ViewportShell.js';

describe('모바일 셸 높이', () => {
  it('보이는 영역(주소창·하단 바가 있는 높이)에 맞춘다', () => {
    const shell = visualShellRect(
      { width: 360, height: 640, offsetTop: 80, offsetLeft: 0 },
      { width: 360, height: 780 },
    );
    expect(shell.height).toBe(640);
    expect(shell.top).toBe(80);
    expect(shell.width).toBe(360);
  });

  it('visualViewport가 없으면 창 크기를 쓴다', () => {
    const shell = visualShellRect(null, { width: 393, height: 852 });
    expect(shell).toEqual({ width: 393, height: 852, top: 0, left: 0 });
  });

  it('HUD·FAB를 피해 판을 키울 박스를 만든다', () => {
    const box = playfieldNdcBox({ width: 393, height: 852 });
    expect(box.right).toBeGreaterThan(0.9);
    expect(box.left).toBeCloseTo(-0.97, 2);
    expect(box.top).toBeLessThan(1);
    expect(box.bottom).toBeGreaterThan(-1);
    expect(ndcBoundsFitBox(
      { minX: -0.9, maxX: 0.6, minY: -0.5, maxY: 0.7 },
      box,
    )).toBe(true);
    expect(ndcBoundsFitBox(
      { minX: -0.99, maxX: 0.9, minY: -0.9, maxY: 0.95 },
      box,
    )).toBe(false);
  });

  it('아래 닉네임을 피하도록 판을 위로 올린다', () => {
    expect(ndcLiftToClearBottom(
      { minY: -0.4, maxY: 0.3 },
      { bottom: -0.2, top: 0.8 },
    )).toBeCloseTo(0.2);
    expect(ndcLiftToClearBottom(
      { minY: -0.4, maxY: 0.75 },
      { bottom: -0.2, top: 0.8 },
    )).toBeCloseTo(0.05);
    expect(ndcLiftToClearBottom(
      { minY: -0.1, maxY: 0.3 },
      { bottom: -0.2, top: 0.8 },
    )).toBe(0);
  });

  it('판 NDC를 스테이지 픽셀로 바꾼다', () => {
    const box = ndcBoxToCss({ minX: -0.5, maxX: 0.5, minY: -0.2, maxY: 0.4 }, { width: 200, height: 100 });
    expect(box.cx).toBe(100);
    expect(box.cy).toBe(45);
    expect(box.width).toBe(100);
    expect(box.left).toBe(50);
  });
});
