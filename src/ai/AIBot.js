/**
 * 클라이언트 벡터 샷 엔진 — 대기실 싱글 AI.
 * Matter.js 바디가 아니라 좌표 스냅샷만 받아 조준 각도/파워를 계산한다.
 */

import {
  AI_DIFFICULTY,
  BOARD,
  SLINGSHOT,
  STONE_RADIUS,
  computeSlingshotLaunch,
  resolvePullBlock,
} from '../physics/GameEngine.js';

export { AI_DIFFICULTY };

export const AI_ERROR_DEG = Object.freeze({
  [AI_DIFFICULTY.BEGINNER]: 12,
  [AI_DIFFICULTY.INTERMEDIATE]: 3,
  [AI_DIFFICULTY.EXPERT]: 0,
});

export const AI_THINK = Object.freeze({
  MIN_MS: 1000,
  MAX_MS: 1500,
  AIM_MS: 500,
});

const DEG = Math.PI / 180;
const DOUBLE_ALIGN_COS = Math.cos(18 * DEG);
/** 반지름 합 + 여유. 이 안이면 붙어 있어 바로 충돌한다. */
export const STONE_CONTACT_SLOP = 6;

export function stonesInContact(a, b, slop = STONE_CONTACT_SLOP) {
  if (!a || !b) return false;
  const ra = a.radius ?? STONE_RADIUS;
  const rb = b.radius ?? STONE_RADIUS;
  return dist(a, b) <= ra + rb + slop;
}

function rng01(rng) {
  const n = typeof rng === 'function' ? rng() : Math.random();
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function asPoint(stone) {
  if (!stone) return null;
  const x = stone.body?.position?.x ?? stone.x;
  const y = stone.body?.position?.y ?? stone.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: stone.id,
    x,
    y,
    radius: stone.radius ?? STONE_RADIUS,
    fallen: Boolean(stone.fallen),
  };
}

function livePoints(stones) {
  return (Array.isArray(stones) ? stones : [])
    .map(asPoint)
    .filter((s) => s && s.id != null && !s.fallen);
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function launchAngle(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function vec(from, to) {
  return { x: to.x - from.x, y: to.y - from.y };
}

function normalize(v) {
  const m = Math.hypot(v.x, v.y);
  if (m < 1e-8) return { x: 0, y: 0 };
  return { x: v.x / m, y: v.y / m };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function pickIndex(len, rng) {
  if (len <= 1) return 0;
  return Math.min(len - 1, Math.floor(rng01(rng) * len));
}

/**
 * 난이도별 조준 오차(도). 초급 ±12, 중급 ±3, 고급 0.
 */
export function aimErrorDeg(difficulty, rng = Math.random) {
  const cap = AI_ERROR_DEG[difficulty] ?? AI_ERROR_DEG[AI_DIFFICULTY.BEGINNER];
  if (cap <= 0) return 0;
  return (rng01(rng) * 2 - 1) * cap;
}

export function legalizeShotPointer(shooter, angle, power, others) {
  const origin = { x: shooter.x, y: shooter.y, id: shooter.id, radius: shooter.radius };
  const deltas = [0, 22, -22, 44, -44, 66, -66, 88, -88, 110, -110];
  for (const d of deltas) {
    const nextAngle = angle + d * DEG;
    const pointer = pointerFromAim(origin, nextAngle, power);
    if (!resolvePullBlock(origin, pointer, others)) {
      return { angle: nextAngle, pointer };
    }
  }
  return null;
}

export function pointerFromAim(origin, angle, power) {
  const p = clamp(power, 0.12, 1);
  const pull = Math.max(SLINGSHOT.PULL_DEADZONE + 2, p * SLINGSHOT.MAX_PULL_DISTANCE);
  return {
    x: origin.x - Math.cos(angle) * pull,
    y: origin.y - Math.sin(angle) * pull,
  };
}

function rayRoom(pos, dir, inner) {
  const n = normalize(dir);
  let t = Infinity;
  if (n.x > 1e-8) t = Math.min(t, (inner.x + inner.size - pos.x) / n.x);
  else if (n.x < -1e-8) t = Math.min(t, (inner.x - pos.x) / n.x);
  if (n.y > 1e-8) t = Math.min(t, (inner.y + inner.size - pos.y) / n.y);
  else if (n.y < -1e-8) t = Math.min(t, (inner.y - pos.y) / n.y);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

function shooterTouchesOpponent(shooter, playerStones) {
  return playerStones.some((p) => stonesInContact(shooter, p));
}

function allPairs(aiStones, playerStones) {
  const pairs = [];
  for (const shooter of aiStones) {
    const stuckShooter = shooterTouchesOpponent(shooter, playerStones);
    for (const target of playerStones) {
      pairs.push({
        shooter,
        target,
        distance: dist(shooter, target),
        stuckPair: stonesInContact(shooter, target),
        stuckShooter,
      });
    }
  }
  return pairs;
}

/** 붙어 있는 흑·백은 건너뛰고, 간격 있는 수를 고른다. 대안이 없을 때만 접촉 수를 허용. */
export function eligibleShotPairs(aiStones, playerStones) {
  const pairs = allPairs(aiStones, playerStones);
  if (pairs.length === 0) return [];
  const free = pairs.filter((p) => !p.stuckPair && !p.stuckShooter);
  if (free.length) return free;
  const gapped = pairs.filter((p) => !p.stuckPair);
  return gapped.length ? gapped : pairs;
}

function nearestPair(aiStones, playerStones) {
  const pool = eligibleShotPairs(aiStones, playerStones);
  let best = null;
  let bestD = Infinity;
  for (const pair of pool) {
    if (pair.distance < bestD) {
      bestD = pair.distance;
      best = pair;
    }
  }
  return best;
}

/**
 * 슈터 → 타깃1 → 타깃2 가 거의 일직선이면 연쇄(더블) 샷.
 */
export function findDoubleShot(aiStones, playerStones) {
  let best = null;
  let bestAlign = DOUBLE_ALIGN_COS;
  for (const shooter of aiStones) {
    if (shooterTouchesOpponent(shooter, playerStones)) continue;
    for (let i = 0; i < playerStones.length; i++) {
      const t1 = playerStones[i];
      if (stonesInContact(shooter, t1)) continue;
      const a = vec(shooter, t1);
      const na = normalize(a);
      if (na.x === 0 && na.y === 0) continue;
      for (let j = 0; j < playerStones.length; j++) {
        if (i === j) continue;
        const t2 = playerStones[j];
        const b = vec(t1, t2);
        const nb = normalize(b);
        const align = dot(na, nb);
        if (align > bestAlign) {
          bestAlign = align;
          best = { shooter, target: t1, second: t2, align };
        }
      }
    }
  }
  return best;
}

function safeLaunchAngle(shooter, target, inner) {
  let angle = launchAngle(shooter, target);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const travel = dist(shooter, target);
  const room = rayRoom(shooter, dir, inner);
  if (room > travel + 72) {
    return { angle, kind: 'direct' };
  }
  const cx = inner.x + inner.size / 2;
  const cy = inner.y + inner.size / 2;
  let delta = Math.atan2(cy - shooter.y, cx - shooter.x) - angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const max = 16 * DEG;
  return { angle: angle + clamp(delta, -max, max), kind: 'safe' };
}

function knockoutPower(shooter, target, inner, conservative) {
  const d = dist(shooter, target);
  let power = 0.42 + Math.min(0.46, d / 880);
  const angle = launchAngle(shooter, target);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  if (rayRoom(target, dir, inner) < 130) power *= 0.86;
  if (conservative) {
    const travel = d;
    if (rayRoom(shooter, dir, inner) < travel + 88) power = Math.min(power, 0.6);
  }
  return clamp(power, 0.46, 0.9);
}

function beginnerPower(rng) {
  const r = rng01(rng);
  if (r < 0.32) return 0.22 + rng01(rng) * 0.2;
  if (r < 0.48) return 0.92 + rng01(rng) * 0.08;
  return 0.46 + rng01(rng) * 0.3;
}

/**
 * @param {Array} aiStones 백(AI) 생존 돌
 * @param {Array} playerStones 흑(유저) 생존 돌
 * @param {string} difficulty beginner | intermediate | expert
 * @param {{ rng?: () => number, board?: { inner: { x:number, y:number, size:number } } }} [options]
 */
export function calculateShot(aiStones, playerStones, difficulty = AI_DIFFICULTY.INTERMEDIATE, options = {}) {
  const rng = options.rng ?? Math.random;
  const inner = options.board?.inner ?? BOARD.inner;
  const ai = livePoints(aiStones);
  const player = livePoints(playerStones);
  const level = Object.values(AI_DIFFICULTY).includes(difficulty)
    ? difficulty
    : AI_DIFFICULTY.BEGINNER;

  if (ai.length === 0 || player.length === 0) {
    return { ok: false, reason: 'no-stones' };
  }

  let shooter;
  let target;
  let kind = 'direct';
  let baseAngle;
  let power;

  if (level === AI_DIFFICULTY.BEGINNER) {
    const pool = eligibleShotPairs(ai, player);
    const pick = pool[pickIndex(pool.length, rng)] ?? nearestPair(ai, player);
    shooter = pick.shooter;
    target = pick.target;
    baseAngle = launchAngle(shooter, target);
    power = beginnerPower(rng);
    kind = 'random';
  } else if (level === AI_DIFFICULTY.INTERMEDIATE) {
    const pair = nearestPair(ai, player);
    shooter = pair.shooter;
    target = pair.target;
    baseAngle = launchAngle(shooter, target);
    power = knockoutPower(shooter, target, inner, false);
    kind = 'nearest';
  } else {
    const dbl = findDoubleShot(ai, player);
    if (dbl) {
      shooter = dbl.shooter;
      target = dbl.target;
      const aimed = safeLaunchAngle(shooter, target, inner);
      baseAngle = aimed.angle;
      kind = 'double';
    } else {
      const pair = nearestPair(ai, player);
      shooter = pair.shooter;
      target = pair.target;
      const aimed = safeLaunchAngle(shooter, target, inner);
      baseAngle = aimed.angle;
      kind = aimed.kind;
    }
    power = knockoutPower(shooter, target, inner, true);
  }

  const errorDeg = aimErrorDeg(level, rng);
  let angle = baseAngle + errorDeg * DEG;
  const origin = { x: shooter.x, y: shooter.y, id: shooter.id, radius: shooter.radius };
  let pointer = pointerFromAim(origin, angle, power);
  const all = [...ai, ...player];
  if (resolvePullBlock(origin, pointer, all)) {
    const legal = legalizeShotPointer(shooter, angle, power, all);
    if (!legal) return { ok: false, reason: 'blocked-nearby' };
    angle = legal.angle;
    pointer = legal.pointer;
  }
  const physics = computeSlingshotLaunch(origin, pointer);

  return {
    ok: true,
    difficulty: level,
    kind,
    shooterId: shooter.id,
    targetId: target.id,
    origin,
    pointer,
    angle,
    errorDeg,
    errorCapDeg: AI_ERROR_DEG[level],
    power: physics.power,
    velocity: physics.velocity,
  };
}

export default { calculateShot, aimErrorDeg, findDoubleShot, eligibleShotPairs, stonesInContact, pointerFromAim, AI_THINK, AI_ERROR_DEG };
