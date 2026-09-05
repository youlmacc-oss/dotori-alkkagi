import { describe, expect, it } from 'vitest';
import {
  BOARD_COLOR_DEFAULT,
  BOARD_MESH_SIZE,
  DEEP_GOLD_HEX,
  DEEP_KAYA_HEX,
  KAYA_HEX,
  seatYawFor,
  boardFaceToMatter,
  boardTonePalette,
  matterToBoardFace,
  shiftBoardHex,
} from '../src/ui/ThreeRenderer.js';
import { GAME_MODE, createDefaultStoneLayout, STONE_COLOR, STONE_RADIUS } from '../src/physics/GameEngine.js';

describe('바둑판 톤', () => {
  it('색조를 돌리면 hex가 바뀐다', () => {
    const left = shiftBoardHex(BOARD_COLOR_DEFAULT, -30, 1);
    const mid = shiftBoardHex(BOARD_COLOR_DEFAULT, 0, 1);
    const right = shiftBoardHex(BOARD_COLOR_DEFAULT, 30, 1);
    expect(left).not.toBe(mid);
    expect(right).not.toBe(mid);
    expect(left).not.toBe(right);
  });

  it('색조를 왼쪽으로 돌리면 황토로 짙어지고 격자가 남는다', () => {
    const left = shiftBoardHex(BOARD_COLOR_DEFAULT, -40, 1);
    const mid = shiftBoardHex(BOARD_COLOR_DEFAULT, 0, 1);
    const leftHi = shiftBoardHex(BOARD_COLOR_DEFAULT, -40, 1.35);
    const r = parseInt(left.slice(1, 3), 16);
    const g = parseInt(left.slice(3, 5), 16);
    const b = parseInt(left.slice(5, 7), 16);
    const midSum = parseInt(mid.slice(1, 3), 16) + parseInt(mid.slice(3, 5), 16) + parseInt(mid.slice(5, 7), 16);
    const leftSum = r + g + b;
    const hr = parseInt(leftHi.slice(1, 3), 16);
    const hg = parseInt(leftHi.slice(3, 5), 16);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(g).toBeLessThan(r * 0.82);
    expect(r).toBeGreaterThan(110);
    expect(r).toBeLessThan(190);
    expect(leftSum).toBeLessThan(midSum);
    expect(left.toLowerCase()).not.toBe('#efd42e');
    expect(Math.abs(r - parseInt(DEEP_KAYA_HEX.slice(1, 3), 16))).toBeLessThan(40);
    expect(hr - hg).toBeGreaterThan(20);
    const pal = boardTonePalette(left);
    const midPal = boardTonePalette(mid);
    const gold = shiftBoardHex(BOARD_COLOR_DEFAULT, -22, 1);
    expect(Math.abs(parseInt(gold.slice(1, 3), 16) - parseInt(DEEP_GOLD_HEX.slice(1, 3), 16))).toBeLessThan(45);
    expect(pal.inkDark).toBe(true);
    expect(pal.grid).toContain('70, 40, 18');
    expect(pal.grainCount).toBeGreaterThan(midPal.grainCount);
    expect(pal.roughness).toBeLessThan(midPal.roughness);
    expect(pal.clearcoat).toBeGreaterThan(midPal.clearcoat);
    expect(pal.sheen).toContain('255, 224, 150');
  });

  it('밝기를 내리면 더 어두워진다', () => {
    const dim = shiftBoardHex(BOARD_COLOR_DEFAULT, 0, 0.55);
    const mid = shiftBoardHex(BOARD_COLOR_DEFAULT, 0, 1);
    const bright = shiftBoardHex(BOARD_COLOR_DEFAULT, 0, 1.3);
    expect(dim).not.toBe(mid);
    expect(bright).not.toBe(mid);
    expect(boardTonePalette(dim).light).toBe(false);
    expect(boardTonePalette(bright).light).toBe(true);
  });

  it('어두운 프리셋은 밝은 격자를 쓴다', () => {
    const ebony = boardTonePalette('#3A2B20');
    const jade = boardTonePalette('#2A4849');
    expect(ebony.light).toBe(false);
    expect(jade.light).toBe(false);
    expect(ebony.grid).toContain('255');
    expect(jade.grid).toContain('255');
  });

  it('비자나무 기본톤은 메인 판과 같은 황금빛이다', () => {
    const kaya = boardTonePalette(BOARD_COLOR_DEFAULT);
    expect(kaya.light).toBe(true);
    expect(BOARD_COLOR_DEFAULT.toLowerCase()).toBe(KAYA_HEX.toLowerCase());
    expect(kaya.fill.toLowerCase()).toBe(KAYA_HEX.toLowerCase());
    expect(kaya.grid).toContain('70, 40, 18');
  });

  it('설정 판 좌표는 메인 3D 판과 같은 얼굴 비율을 쓴다', () => {
    const mid = matterToBoardFace(360, 360);
    expect(mid.u).toBeCloseTo(0.5);
    expect(mid.v).toBeCloseTo(0.5);
    const back = boardFaceToMatter(mid.u, mid.v);
    expect(back.x).toBeCloseTo(360);
    expect(back.y).toBeCloseTo(360);
  });

  it('기본 5알 일자의 화면 비율이 메인 판 둘째 줄과 같다', () => {
    const layout = createDefaultStoneLayout();
    const whites = layout.filter((s) => s.color === STONE_COLOR.WHITE);
    const blacks = layout.filter((s) => s.color === STONE_COLOR.BLACK);
    const wv = matterToBoardFace(whites[0].x, whites[0].y).v;
    const bv = matterToBoardFace(blacks[0].x, blacks[0].y).v;
    const line1 = (68 + 111) / 1024;
    const line7 = (68 + 7 * 111) / 1024;
    expect(wv).toBeCloseTo(line1, 1);
    expect(bv).toBeCloseTo(line7, 1);
    expect(STONE_RADIUS * ((BOARD_MESH_SIZE - 68) / 720) / BOARD_MESH_SIZE).toBeCloseTo(0.0286, 3);
  });

  it('1인 모드 백 턴은 180도 좌석이다', () => {
    expect(seatYawFor(GAME_MODE.SOLO, STONE_COLOR.WHITE)).toBeCloseTo(Math.PI);
    expect(seatYawFor(GAME_MODE.SOLO, STONE_COLOR.BLACK)).toBe(0);
    expect(seatYawFor(GAME_MODE.AI, STONE_COLOR.WHITE)).toBe(0);
  });
});
