import { describe, expect, it } from 'vitest';
import {
  BOARD_SPIN_STEP,
  boardSpinFabVisible,
  canBoardSpin,
  canBoardSpinButton,
  isBoardSpinTap,
  isBoardSpinTarget,
  nextBoardSpin,
} from '../src/ui/BoardSpin.js';
import { playSeatPose } from '../src/ui/ThreeRenderer.js';
import { PHASE } from '../src/physics/GameEngine.js';

describe('바둑판 45도 보기 회전', () => {
  it('한 번마다 45도씩 더하고 여덟 번이면 한 바퀴다', () => {
    expect(BOARD_SPIN_STEP).toBeCloseTo(Math.PI / 4);
    expect(nextBoardSpin(0)).toBeCloseTo(Math.PI / 4);
    let yaw = 0;
    for (let i = 0; i < 8; i++) yaw = nextBoardSpin(yaw);
    expect(yaw).toBeCloseTo(Math.PI * 2);
  });

  it('턴 버튼은 대전이 시작된 뒤에만 보이고 조준 중이 아니면 누를 수 있다', () => {
    const ready = {
      inMatch: true,
      matchStarted: true,
      phase: PHASE.IDLE,
    };
    expect(boardSpinFabVisible(ready)).toBe(true);
    expect(boardSpinFabVisible({ ...ready, matchStarted: false })).toBe(false);
    expect(boardSpinFabVisible({ ...ready, lobby: true })).toBe(false);
    expect(boardSpinFabVisible({ ...ready, spectating: true })).toBe(false);
    expect(canBoardSpinButton(ready)).toBe(true);
    expect(canBoardSpinButton({ ...ready, inputBlocked: true })).toBe(true);
    expect(canBoardSpinButton({ ...ready, aiming: true })).toBe(false);
    expect(canBoardSpinButton({ ...ready, phase: PHASE.RESOLVING })).toBe(false);
  });

  it('대전 시작 후 내 턴 IDLE에서만 돈다', () => {
    const ready = {
      inMatch: true,
      matchStarted: true,
      phase: PHASE.IDLE,
    };
    expect(canBoardSpin(ready)).toBe(true);
    expect(canBoardSpin({ ...ready, inMatch: false })).toBe(false);
    expect(canBoardSpin({ ...ready, matchStarted: false })).toBe(false);
    expect(canBoardSpin({ ...ready, phase: PHASE.AIMING })).toBe(false);
    expect(canBoardSpin({ ...ready, phase: PHASE.RESOLVING })).toBe(false);
    expect(canBoardSpin({ ...ready, aiming: true })).toBe(false);
    expect(canBoardSpin({ ...ready, inputBlocked: true })).toBe(false);
    expect(canBoardSpin({ ...ready, placementOnly: true })).toBe(false);
    expect(canBoardSpin({ ...ready, killCam: true })).toBe(false);
    expect(canBoardSpin({ ...ready, paused: true })).toBe(false);
  });

  it('돌 근처와 판 밖은 돌리지 않고 빈 나무만 돌린다', () => {
    const stones = [{ id: 1, x: 360, y: 360 }];
    expect(isBoardSpinTarget({ x: 80, y: 80 }, stones)).toBe(true);
    expect(isBoardSpinTarget({ x: 360, y: 360 }, stones)).toBe(false);
    expect(isBoardSpinTarget({ x: 390, y: 360 }, stones)).toBe(false);
    expect(isBoardSpinTarget({ x: 10, y: 360 }, stones)).toBe(false);
    expect(isBoardSpinTarget({ x: 360, y: 360 }, [{ id: 1, x: 360, y: 360, fallen: true }])).toBe(true);
  });

  it('끌기는 탭이 아니고 짧은 누름만 탭이다', () => {
    expect(isBoardSpinTap({ x: 100, y: 100 }, { x: 104, y: 102 })).toBe(true);
    expect(isBoardSpinTap({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(false);
  });

  it('보기 회전은 좌석 축을 밀지 않는다', () => {
    const lookBase = { x: 0, y: 15, z: 10 };
    const a = playSeatPose({ yaw: 0, radius: 640, height: 780, lookBase });
    const b = playSeatPose({ yaw: BOARD_SPIN_STEP, radius: 640, height: 780, lookBase });
    expect(a.pivot).toEqual(b.pivot);
    expect(a.look).toEqual(b.look);
    expect(a.cam.y).toBe(b.cam.y);
  });
});
