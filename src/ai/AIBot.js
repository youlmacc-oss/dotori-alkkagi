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
  [AI_DIFFICULTY.BEGINNER]: 0,
  [AI_DIFFICULTY.INTERMEDIATE]: 0,
  [AI_DIFFICULTY.EXPERT]: 0,
});

export const AI_THINK = Object.freeze({
  MIN_MS: 1000,
  MAX_MS: 1500,
  AIM_MS: 500,
});

const DEG = Math.PI / 180;
const DOUBLE_ALIGN_COS = Math.cos(32 * DEG);
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

/** 발사선이 타깃 원에 깊게 들어가 물리 스텝에서도 맞는다. */
export function aimHitsStone(shooter, angle, target, embed = 8) {
  if (!shooter || !target || !Number.isFinite(angle)) return false;
  const ra = shooter.radius ?? STONE_RADIUS;
  const rb = target.radius ?? STONE_RADIUS;
  const dx = target.x - shooter.x;
  const dy = target.y - shooter.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 1e-6) return true;
  if (gap <= ra + rb + 2) return true;
  const dirx = Math.cos(angle);
  const diry = Math.sin(angle);
  if (dx * dirx + dy * diry <= 0) return false;
  const miss = Math.abs(dx * diry - dy * dirx);
  return miss <= Math.max(4, ra + rb - embed);
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

/**
 * 난이도별 조준 오차(도). 초급·중급·고급 모두 0.
 */
export function aimErrorDeg(difficulty, rng = Math.random) {
  const cap = AI_ERROR_DEG[difficulty] ?? AI_ERROR_DEG[AI_DIFFICULTY.BEGINNER];
  if (cap <= 0) return 0;
  return (rng01(rng) * 2 - 1) * cap;
}

export function legalizeShotPointer(shooter, angle, power, others, target) {
  const origin = { x: shooter.x, y: shooter.y, id: shooter.id, radius: shooter.radius };
  const ra = shooter.radius ?? STONE_RADIUS;
  const rb = target?.radius ?? STONE_RADIUS;
  const close = target ? dist(shooter, target) <= ra + rb + 8 : false;
  const deltas = close
    ? [0, 22, -22, 44, -44, 66, -66, 88, -88]
    : [0, 6, -6, 10, -10, 14, -14, 18, -18, 22, -22];
  for (const d of deltas) {
    const nextAngle = angle + d * DEG;
    if (target && !aimHitsStone(shooter, nextAngle, target)) continue;
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

function finishPower(shooter, target, inner, angle, level) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const d = dist(shooter, target);
  const targetExit = rayRoom(target, dir, inner);
  const shooterExit = rayRoom(shooter, dir, inner);
  const diesBeforeHit = shooterExit < d - 8;
  let power;
  if (level === AI_DIFFICULTY.BEGINNER) {
    power = 0.86 + Math.min(0.12, d / 640);
    if (targetExit < 220) power = Math.max(power, 0.93);
    if (diesBeforeHit) power = Math.min(power, 0.84);
    return clamp(power, 0.82, 0.98);
  }
  if (level === AI_DIFFICULTY.INTERMEDIATE) {
    power = 0.91 + Math.min(0.08, d / 560);
    if (targetExit < 240) power = Math.max(power, 0.96);
    if (diesBeforeHit) power = Math.min(power, 0.88);
    return clamp(power, 0.88, 0.99);
  }
  power = 0.95 + Math.min(0.05, d / 480);
  if (targetExit < 260) power = Math.max(power, 0.98);
  if (diesBeforeHit) power = Math.min(power, 0.9);
  return clamp(power, 0.92, 1);
}

export function scoreKnockoutShot(shooter, target, inner) {
  const d = dist(shooter, target);
  const angle = launchAngle(shooter, target);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const targetExit = rayRoom(target, dir, inner);
  const shooterExit = rayRoom(shooter, dir, inner);
  let score = Math.max(0, 240 - targetExit) * 2.4 + Math.max(0, 420 - d);
  if (shooterExit < d + 40) score -= 480;
  return score;
}

export function bestKnockoutPair(aiStones, playerStones, inner) {
  const pool = eligibleShotPairs(aiStones, playerStones);
  let best = null;
  let bestScore = -Infinity;
  for (const pair of pool) {
    const score = scoreKnockoutShot(pair.shooter, pair.target, inner);
    if (score > bestScore) {
      bestScore = score;
      best = pair;
    }
  }
  return best ?? nearestPair(aiStones, playerStones);
}

function scoreStrongKnockout(shooter, target, inner) {
  const d = dist(shooter, target);
  const angle = launchAngle(shooter, target);
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const targetExit = rayRoom(target, dir, inner);
  const shooterExit = rayRoom(shooter, dir, inner);
  let score = Math.max(0, 280 - targetExit) * 3.2 + Math.max(0, 420 - d);
  if (shooterExit < d + 40) score -= 640;
  return score;
}

function bestStrongKnockoutPair(aiStones, playerStones, inner) {
  const pool = eligibleShotPairs(aiStones, playerStones);
  let best = null;
  let bestScore = -Infinity;
  for (const pair of pool) {
    const score = scoreStrongKnockout(pair.shooter, pair.target, inner);
    if (score > bestScore) {
      bestScore = score;
      best = pair;
    }
  }
  return best ?? nearestPair(aiStones, playerStones);
}

function escapeCandidates(pos, inner) {
  const dirs = [
    { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
    { x: -0.7071, y: -0.7071 }, { x: 0.7071, y: -0.7071 },
    { x: -0.7071, y: 0.7071 }, { x: 0.7071, y: 0.7071 },
  ];
  return dirs
    .map((d) => {
      const n = normalize(d);
      return { d: n, room: rayRoom(pos, n, inner) };
    })
    .sort((a, b) => a.room - b.room);
}

function cutLaunchAngle(shooter, target, escapeDir) {
  const gap = (shooter.radius ?? STONE_RADIUS) + (target.radius ?? STONE_RADIUS);
  return launchAngle(shooter, {
    x: target.x - escapeDir.x * gap,
    y: target.y - escapeDir.y * gap,
  });
}

function scoreMasterShot(shooter, target, inner, angle) {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const d = dist(shooter, target);
  const targetExit = rayRoom(target, dir, inner);
  const shooterExit = rayRoom(shooter, dir, inner);
  let score = Math.max(0, 360 - targetExit) * 5.2 + Math.max(0, 380 - d) * 0.45;
  if (targetExit < 140) score += 260;
  if (targetExit < 80) score += 180;
  if (shooterExit < d - 8) score -= 720;
  else if (shooterExit < d + 12) score -= 80;
  return score;
}

function collectHitShots(aiStones, playerStones, inner, options = {}) {
  const cutCount = Math.max(1, Number(options.cuts) || 8);
  const extras = options.extras === true;
  const pool = eligibleShotPairs(aiStones, playerStones);
  const shots = [];
  const dbl = findDoubleShot(aiStones, playerStones);
  if (dbl && aimHitsStone(dbl.shooter, launchAngle(dbl.shooter, dbl.target), dbl.target)) {
    const angle = launchAngle(dbl.shooter, dbl.target);
    shots.push({
      shooter: dbl.shooter,
      target: dbl.target,
      angle,
      kind: 'double',
      score: scoreMasterShot(dbl.shooter, dbl.target, inner, angle) + 800,
    });
  }
  for (const pair of pool) {
    const direct = launchAngle(pair.shooter, pair.target);
    const angles = [
      direct,
      ...escapeCandidates(pair.target, inner).slice(0, cutCount)
        .map((e) => cutLaunchAngle(pair.shooter, pair.target, e.d)),
    ];
    if (extras) {
      for (const d of [4, -4, 8, -8, 12, -12]) angles.push(direct + d * DEG);
    }
    for (const angle of angles) {
      if (!aimHitsStone(pair.shooter, angle, pair.target)) continue;
      shots.push({
        shooter: pair.shooter,
        target: pair.target,
        angle,
        kind: 'knockout',
        score: scoreMasterShot(pair.shooter, pair.target, inner, angle),
      });
    }
  }
  shots.sort((a, b) => b.score - a.score);
  return shots;
}

export function pickMasterShot(aiStones, playerStones, inner, options = {}) {
  const hits = collectHitShots(aiStones, playerStones, inner, options);
  if (hits[0]) return hits[0];
  const fallback = nearestPair(aiStones, playerStones);
  if (!fallback) return null;
  return {
    shooter: fallback.shooter,
    target: fallback.target,
    angle: launchAngle(fallback.shooter, fallback.target),
    kind: 'knockout',
  };
}

function pickClassicExpert(ai, player, inner) {
  const dbl = findDoubleShot(ai, player);
  if (dbl) {
    return { shooter: dbl.shooter, target: dbl.target, angle: launchAngle(dbl.shooter, dbl.target), kind: 'double' };
  }
  const pair = bestKnockoutPair(ai, player, inner);
  return {
    shooter: pair.shooter,
    target: pair.target,
    angle: launchAngle(pair.shooter, pair.target),
    kind: 'knockout',
  };
}

/**
 * @param {Array} aiStones 백(AI) 생존 돌
 * @param {Array} playerStones 흑(유저) 생존 돌
 * @param {string} difficulty beginner | intermediate | expert
 * @param {{ rng?: () => number, board?: { inner: { x:number, y:number, size:number } } }} [options]
 */
export function calculateShot(aiStones, playerStones, difficulty = AI_DIFFICULTY.EXPERT, options = {}) {
  const rng = options.rng ?? Math.random;
  const inner = options.board?.inner ?? BOARD.inner;
  const ai = livePoints(aiStones);
  const player = livePoints(playerStones);
  const level = Object.values(AI_DIFFICULTY).includes(difficulty)
    ? difficulty
    : AI_DIFFICULTY.EXPERT;

  if (ai.length === 0 || player.length === 0) {
    return { ok: false, reason: 'no-stones' };
  }

  const search = level === AI_DIFFICULTY.BEGINNER
    ? { cuts: 6, extras: true }
    : level === AI_DIFFICULTY.INTERMEDIATE
      ? { cuts: 8, extras: true }
      : { cuts: 10, extras: true };
  const candidates = collectHitShots(ai, player, inner, search);
  if (!candidates.length) {
    const fallback = pickMasterShot(ai, player, inner, search);
    if (!fallback) return { ok: false, reason: 'no-stones' };
    candidates.push(fallback);
  }

  const errorDeg = aimErrorDeg(level, rng);
  const all = [...ai, ...player];
  let shooter;
  let target;
  let kind = 'knockout';
  let power;
  let angle;
  let pointer;
  let locked = false;
  for (const candidate of candidates) {
    const nextPower = finishPower(candidate.shooter, candidate.target, inner, candidate.angle, level);
    let nextAngle = candidate.angle + errorDeg * DEG;
    if (!aimHitsStone(candidate.shooter, nextAngle, candidate.target)) nextAngle = candidate.angle;
    const origin = {
      x: candidate.shooter.x,
      y: candidate.shooter.y,
      id: candidate.shooter.id,
      radius: candidate.shooter.radius,
    };
    let nextPointer = pointerFromAim(origin, nextAngle, nextPower);
    if (resolvePullBlock(origin, nextPointer, all)) {
      const legal = legalizeShotPointer(candidate.shooter, nextAngle, nextPower, all, candidate.target);
      if (!legal) continue;
      nextAngle = legal.angle;
      nextPointer = legal.pointer;
    }
    if (!aimHitsStone(candidate.shooter, nextAngle, candidate.target)) continue;
    shooter = candidate.shooter;
    target = candidate.target;
    kind = candidate.kind;
    power = nextPower;
    angle = nextAngle;
    pointer = nextPointer;
    locked = true;
    break;
  }
  if (!locked) {
    const fallback = candidates[0];
    shooter = fallback.shooter;
    target = fallback.target;
    kind = fallback.kind;
    power = finishPower(shooter, target, inner, fallback.angle, level);
    angle = fallback.angle;
    pointer = pointerFromAim(shooter, angle, power);
  }

  const origin = { x: shooter.x, y: shooter.y, id: shooter.id, radius: shooter.radius };
  let physics = computeSlingshotLaunch(origin, pointer);
  const launchDir = Math.atan2(physics.velocity.y, physics.velocity.x);
  if (!aimHitsStone(shooter, launchDir, target)) {
    angle = launchAngle(shooter, target);
    pointer = pointerFromAim(origin, angle, power);
    physics = computeSlingshotLaunch(origin, pointer);
  }

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

export default {
  calculateShot,
  aimErrorDeg,
  aimHitsStone,
  findDoubleShot,
  pickMasterShot,
  bestKnockoutPair,
  scoreKnockoutShot,
  eligibleShotPairs,
  stonesInContact,
  pointerFromAim,
  AI_THINK,
  AI_ERROR_DEG,
};
