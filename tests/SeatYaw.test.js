import { describe, expect, it } from 'vitest';
import { playSeatPose, seatYawFor } from '../src/ui/ThreeRenderer.js';
import { GAME_MODE, STONE_COLOR } from '../src/physics/GameEngine.js';

describe('1인 좌석 회전', () => {
  it('백 턴에서만 180도 돈다', () => {
    expect(seatYawFor(GAME_MODE.SOLO, STONE_COLOR.WHITE)).toBeCloseTo(Math.PI);
    expect(seatYawFor(GAME_MODE.SOLO, STONE_COLOR.BLACK)).toBe(0);
  });

  it('1:1은 내 돌이 앞에 오도록 백만 반대 자리에 앉는다', () => {
    expect(seatYawFor(GAME_MODE.PVP, STONE_COLOR.BLACK, STONE_COLOR.WHITE)).toBeCloseTo(Math.PI);
    expect(seatYawFor(GAME_MODE.PVP, STONE_COLOR.WHITE, STONE_COLOR.BLACK)).toBe(0);
    expect(seatYawFor(GAME_MODE.AI, STONE_COLOR.WHITE, STONE_COLOR.WHITE)).toBe(0);
    const whiteSeat = playSeatPose({ yaw: Math.PI, radius: 640, height: 780 });
    const blackSeat = playSeatPose({ yaw: 0, radius: 640, height: 780 });
    expect(whiteSeat.cam.z).toBeLessThan(0);
    expect(blackSeat.cam.z).toBeGreaterThan(0);
  });

  it('축은 그대로 두고 카메라만 반대편으로 돈다', () => {
    const lookBase = { x: 0, y: 15, z: 10 };
    const a = playSeatPose({
      yaw: 0, radius: 640, height: 780, shiftX: 12, lift: 28, lookBase,
    });
    const b = playSeatPose({
      yaw: Math.PI, radius: 640, height: 780, shiftX: 12, lift: 28, lookBase,
    });
    expect(a.pivot).toEqual(b.pivot);
    expect(a.look).toEqual(b.look);
    expect(a.cam.x + b.cam.x).toBeCloseTo(2 * a.pivot.x, 6);
    expect(a.cam.z + b.cam.z).toBeCloseTo(2 * a.pivot.z, 6);
    expect(a.cam.y).toBe(b.cam.y);
    const midX = (a.cam.x + b.cam.x) / 2;
    const midZ = (a.cam.z + b.cam.z) / 2;
    expect(midX).toBeCloseTo(a.look.x, 6);
    expect(midZ).toBeCloseTo(a.look.z, 6);
  });
});
