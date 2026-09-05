import { describe, expect, it } from 'vitest';
import {
  KILL_CAM,
  boardKillCamFocus,
  isKillCamAimingAtVoid,
  isKillCamInsideBoard,
  isKillCamOverBoard,
  isValidKillCamFocus,
  killCamCloseUp,
  killCamFallDrop,
  killCamFlyPoint,
  followKillCamLookY,
  killCamSubject,
  nextFallRim,
  rescueKillCam,
  shouldAttachKillCam,
  stabilizeKillCam,
} from '../src/ui/ThreeRenderer.js';

describe('킬링캠 클로즈업', () => {
  it('판 밖에서 떨어지는 돌을 정면으로 본다', () => {
    const stone = { x: 210, y: 78, z: 0 };
    const shot = killCamCloseUp(stone);
    expect(isKillCamInsideBoard(shot.cam)).toBe(false);
    expect(isKillCamOverBoard(shot.cam)).toBe(false);
    expect(isKillCamAimingAtVoid(shot.cam, shot.look)).toBe(false);
    expect(shot.cam.x).toBeGreaterThan(shot.look.x);
    expect(shot.look.x).toBeGreaterThanOrEqual(KILL_CAM.BOARD_HALF);
    expect(shot.cam.y).toBeGreaterThanOrEqual(KILL_CAM.MIN_CAM_Y);
    const dist = Math.hypot(
      shot.cam.x - shot.look.x,
      shot.cam.y - shot.look.y,
      shot.cam.z - shot.look.z,
    );
    expect(dist).toBeGreaterThanOrEqual(KILL_CAM.MIN_SEPARATION - 1e-6);
  });

  it('돌이 판 아래로 떨어져도 카메라가 상판 안에 들어가지 않는다', () => {
    const shot = killCamCloseUp({ x: 210, y: -90, z: 40 });
    expect(shot.cam.y).toBeGreaterThanOrEqual(KILL_CAM.MIN_CAM_Y);
    expect(shot.look.y).toBeGreaterThanOrEqual(KILL_CAM.MIN_LOOK_Y);
    expect(shot.look.y).toBeLessThan(0);
    expect(isKillCamInsideBoard(shot.cam)).toBe(false);
    expect(isKillCamOverBoard(shot.cam)).toBe(false);
    expect(isKillCamAimingAtVoid(shot.cam, shot.look)).toBe(false);
    const dist = Math.hypot(
      shot.cam.x - shot.look.x,
      shot.cam.y - shot.look.y,
      shot.cam.z - shot.look.z,
    );
    expect(dist).toBeGreaterThanOrEqual(KILL_CAM.MIN_SEPARATION - 1e-6);
    expect(isValidKillCamFocus(shot.cam)).toBe(true);
  });

  it('NaN 초점은 유한한 카메라로 복구한다', () => {
    const shot = stabilizeKillCam({
      cam: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
      look: { x: Number.NaN, y: 10, z: 0 },
    });
    expect(isValidKillCamFocus(shot.cam)).toBe(true);
    expect(isValidKillCamFocus(shot.look)).toBe(true);
    expect(shot.cam.y).toBeGreaterThanOrEqual(KILL_CAM.MIN_CAM_Y);
  });

  it('낙하 1.5초를 슬로우 ease-in으로 쓴다', () => {
    expect(KILL_CAM.SLOW_MO_S).toBe(1.5);
    expect(KILL_CAM.RUSH_IN_S).toBeLessThan(0.2);
    expect(killCamFallDrop(0)).toBe(0);
    expect(killCamFallDrop(KILL_CAM.SLOW_MO_S)).toBe(KILL_CAM.DROP_DEPTH);
    const mid = killCamFallDrop(0.75);
    expect(mid).toBeLessThan(KILL_CAM.DROP_DEPTH * 0.5);
    expect(mid).toBeGreaterThan(0);
  });

  it('초점은 돌이고 카메라는 그 바깥에서 복구한다', () => {
    const deep = killCamCloseUp({ x: 210, y: -40, z: 40 });
    expect(deep.look.y).toBe(-40);
    expect(isKillCamAimingAtVoid(deep.cam, deep.look)).toBe(false);
    const rim = killCamSubject({ x: 40, z: 20 });
    expect(rim.x).toBeGreaterThanOrEqual(KILL_CAM.BOARD_HALF);
    const rescued = rescueKillCam({
      cam: { x: 12, y: 200, z: -8 },
      look: { x: 260, y: 50, z: 0 },
    });
    expect(isKillCamInsideBoard(rescued.cam)).toBe(false);
    expect(isKillCamOverBoard(rescued.cam)).toBe(false);
    expect(isKillCamAimingAtVoid(rescued.cam, rescued.look)).toBe(false);
    const mid = killCamFlyPoint({ x: 0, y: 780, z: 640 }, { x: 280, y: 56, z: 0 }, 0.45);
    expect(isKillCamInsideBoard(mid)).toBe(false);
    expect(mid.y).toBeGreaterThanOrEqual(KILL_CAM.MIN_CAM_Y);
    const wild = boardKillCamFocus({ x: 9000, y: Number.NaN, z: Number.NaN });
    expect(Math.abs(wild.x)).toBeLessThanOrEqual(KILL_CAM.MAX_FOCUS_XZ);
    expect(isValidKillCamFocus(wild)).toBe(true);
    const nanShot = killCamCloseUp({ x: Number.NaN, y: Number.NaN, z: Number.NaN });
    expect(isValidKillCamFocus(nanShot.cam)).toBe(true);
    expect(isKillCamInsideBoard(nanShot.cam)).toBe(false);
    expect(isKillCamAimingAtVoid(nanShot.cam, nanShot.look)).toBe(false);
  });

  it('고정 샷은 카메라 자리를 유지하고 낙사 돌은 겹치지 않는다', () => {
    const locked = killCamCloseUp({ x: 210, y: 78, z: 0 });
    const followed = followKillCamLookY(locked, -40);
    expect(followed.cam.x).toBe(locked.cam.x);
    expect(followed.cam.y).toBe(locked.cam.y);
    expect(followed.cam.z).toBe(locked.cam.z);
    expect(followed.look.x).toBe(locked.look.x);
    expect(followed.look.z).toBe(locked.look.z);
    expect(followed.look.y).toBe(-40);
    const a = nextFallRim({ x: 210, z: 0 }, []);
    const b = nextFallRim({ x: 200, z: 4 }, [a]);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(30);
  });

  it('액션캠이 꺼져 있으면 클로즈업을 붙이지 않는다', () => {
    expect(shouldAttachKillCam(true, null)).toBe(true);
    expect(shouldAttachKillCam(false, null)).toBe(false);
    expect(shouldAttachKillCam(true, { stoneId: 1 })).toBe(false);
  });
});
