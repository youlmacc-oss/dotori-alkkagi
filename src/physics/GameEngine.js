/**
 * 도토리 알까기 — Matter.js 물리/조작 엔진.
 *
 * 가상 해상도 720×1280 뷰포트 안에서 비자나무 바둑판 테두리 바운드,
 * 흑·백 5알 대칭 배치, 슬링샷 조준/발사, 충돌음, 턴 종료 판정을 담당한다.
 */

import Matter from 'matter-js';
import { soundEngine as defaultSoundEngine } from '../audio/SoundEngine.js';
import { resultRevealDelayMs } from './ResultBeat.js';
import { planSameColorBondHold } from './SameColorBond.js';

const { Engine, World, Bodies, Body, Composite, Events, Runner, Query, Sleeping } = Matter;

export const VIRTUAL_WIDTH = 720;
export const VIRTUAL_HEIGHT = 1280;
export const STONE_RADIUS = 24;
export const STONE_VISUAL_SCALE = 1.14;
export const STONE_PICK_SLOP = 1.52;

export function pickNearestOwnStone(stones, point, radius = STONE_RADIUS, slop = STONE_PICK_SLOP) {
  if (!point || !stones?.length) return null;
  const maxD = (radius * slop) ** 2;
  let best = null;
  let bestD = maxD;
  for (const stone of stones) {
    const x = stone.body?.position?.x ?? stone.x;
    const y = stone.body?.position?.y ?? stone.y;
    const d = (x - point.x) ** 2 + (y - point.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = stone;
    }
  }
  return best;
}

/** 원격 샷은 id가 바뀌어도 색·좌표로 같은 돌을 찾는다. */
export function findLaunchStone(stones, shot = {}) {
  const list = (Array.isArray(stones) ? stones : []).filter((stone) => stone && !stone.fallen);
  if (shot.stoneId != null) {
    const byId = list.find((stone) => String(stone.id) === String(shot.stoneId));
    if (byId) return byId;
  }
  const colored = shot.color ? list.filter((stone) => stone.color === shot.color) : list;
  const px = Number(shot.x ?? shot.position?.x);
  const py = Number(shot.y ?? shot.position?.y);
  if (Number.isFinite(px) && Number.isFinite(py) && colored.length) {
    return pickNearestOwnStone(colored, { x: px, y: py }, 80, 8) || colored[0];
  }
  return colored[0] || null;
}

export function sameStoneId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** turnEnd 스냅샷은 id를 문자열로도 같은 돌에 붙인다. */
export function findRemoteStone(stones, data, index) {
  const list = Array.isArray(stones) ? stones : [];
  if (data?.id != null) {
    const found = list.find((stone) => sameStoneId(stone.id, data.id));
    if (found) return found;
  }
  return list[index] || null;
}

export const STONES_PER_SIDE = 5;

export const STONE_COLOR = Object.freeze({
  BLACK: 'black',
  WHITE: 'white',
});

export const PHASE = Object.freeze({
  IDLE: 'idle',
  AIMING: 'aiming',
  RESOLVING: 'resolving',
  GAME_OVER: 'gameOver',
  SPECTATING: 'spectating',
});

/** 비자나무 바둑판 — 720 정사각 월드에 맞춘 상하 대칭 배치 */
export const BOARD = Object.freeze({
  outer: Object.freeze({ x: 40, y: 40, size: 640 }),
  rim: 28,
  inner: Object.freeze({ x: 68, y: 68, size: 584 }),
});

export const SLINGSHOT = Object.freeze({
  MAX_PULL_DISTANCE: 360,
  MAX_LAUNCH_SPEED: 54,
  PULL_GAIN: 1,
  AIM_LINE_SCALE: 1.15,
  PULL_DEADZONE: 14,
  ENGINE_DELTA_MS: 1000 / 60,
  FRICTION_AIR: 0.025,
});

/** 3D 상판과 같은 치수. 격자선이 아니라 나무판 끝까지 생존한다. */
export const BOARD_VISUAL = Object.freeze({
  MESH: 480,
  INSET: 68,
});

export function boardFallBounds(world = VIRTUAL_WIDTH) {
  const usable = BOARD_VISUAL.MESH - BOARD_VISUAL.INSET;
  const half = BOARD_VISUAL.MESH / 2;
  const span = half * (world / usable);
  const mid = world / 2;
  return { min: mid - span, max: mid + span };
}

/** 드래그 거리 ↔ 발사 속도/조준선 길이 배율 (호스트 전용 UI) */
export const POWER_RATIO = Object.freeze({
  MIN: 1,
  MAX: 6,
  STEP: 0.1,
  DEFAULT: 3.8,
  STORAGE_KEY: 'dotori_power_ratio',
});

export function clampPowerScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return POWER_RATIO.DEFAULT;
  const clamped = Math.min(POWER_RATIO.MAX, Math.max(POWER_RATIO.MIN, n));
  return Number(clamped.toFixed(1));
}

/** 발사 물리와 분리한 조준선 화면 길이. 직전 배율로 복귀. */
export const AIM_GUIDE_VISUAL = Object.freeze({
  DESKTOP: 0.52,
  PHONE_MIN: 0.34,
  PHONE_MAX: 0.46,
  REF_WIDTH: 720,
  PHONE_MAX_WIDTH: 480,
  PHONE_TALL_MAX_WIDTH: 600,
  PHONE_MIN_ASPECT: 1.35,
});

export function isPhoneAimViewport({ width, height } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || w <= 0) return false;
  if (w <= AIM_GUIDE_VISUAL.PHONE_MAX_WIDTH) return true;
  const aspect = Number.isFinite(h) && h > 0 ? h / w : 0;
  return w <= AIM_GUIDE_VISUAL.PHONE_TALL_MAX_WIDTH && aspect >= AIM_GUIDE_VISUAL.PHONE_MIN_ASPECT;
}

export function aimGuideVisualScale(viewport = {}) {
  if (!isPhoneAimViewport(viewport)) return AIM_GUIDE_VISUAL.DESKTOP;
  const raw = Number(viewport.width) / AIM_GUIDE_VISUAL.REF_WIDTH;
  if (!Number.isFinite(raw) || raw <= 0) return AIM_GUIDE_VISUAL.PHONE_MIN;
  return Math.min(AIM_GUIDE_VISUAL.PHONE_MAX, Math.max(AIM_GUIDE_VISUAL.PHONE_MIN, raw));
}

export function scaleAimGuideEnd(origin, aimEnd, scale = 1) {
  if (!origin || !aimEnd) return aimEnd ?? null;
  const s = Number(scale);
  if (!Number.isFinite(s) || s === 1) return { x: aimEnd.x, y: aimEnd.y };
  return {
    x: origin.x + (aimEnd.x - origin.x) * s,
    y: origin.y + (aimEnd.y - origin.y) * s,
  };
}

export function readStoredPowerScale() {
  try {
    const raw = globalThis.localStorage?.getItem(POWER_RATIO.STORAGE_KEY);
    if (raw == null || raw === '') return POWER_RATIO.DEFAULT;
    return clampPowerScale(raw);
  } catch {
    return POWER_RATIO.DEFAULT;
  }
}

export function persistPowerScale(value) {
  const val = clampPowerScale(value);
  try {
    globalThis.localStorage?.setItem(POWER_RATIO.STORAGE_KEY, String(val));
  } catch {
    /* quota / private mode */
  }
  return val;
}

export function isLocalTestingHost(locationLike = globalThis.location) {
  const host = locationLike?.hostname;
  return host == null || host === '' || host === 'localhost' || host === '127.0.0.1';
}

export function canControlPowerRatio(engine, extras = {}) {
  if (!engine) return false;
  if (engine.phase === PHASE.SPECTATING || engine.gameMode === GAME_MODE.SPECTATE) return false;
  if (extras.isHost === true || engine.isHost === true) return true;
  if (engine.gameMode === GAME_MODE.AI || engine.gameMode === GAME_MODE.SOLO) return true;
  return isLocalTestingHost(extras.location);
}

export const TOUCH_FEEL = Object.freeze({
  EMA_ALPHA: 0.38,
  TENSION_EXPONENT: 1.15,
  POWER_STAGE_30: 0.3,
  POWER_STAGE_70: 0.7,
  POWER_STAGE_MAX: 1,
  STAGE_HAPTIC_MS: 8,
  RELEASE_HAPTIC_MS: 15,
});

export const REST = Object.freeze({
  SPEED_THRESHOLD: 0.05,
  ANGULAR_THRESHOLD: 0.04,
  FRAMES_REQUIRED: 18,
});

export const TURN = Object.freeze({
  LIMIT_MS: 15000,
  URGENT_MS: 5000,
  DELTA_CAP_MS: 100,
});

export function capTurnDeltaMs(delta, cap = TURN.DELTA_CAP_MS) {
  const n = Number(delta);
  const limit = Number(cap) > 0 ? Number(cap) : TURN.DELTA_CAP_MS;
  if (!Number.isFinite(n) || n <= 0) return SLINGSHOT.ENGINE_DELTA_MS;
  return Math.min(n, limit);
}

export const GAME_MODE = Object.freeze({
  AI: 'ai',
  PVP: 'pvp',
  SOLO: 'solo',
  SPECTATE: 'spectate',
});

/** 혼자일 때만 AI를 제안. 2명 이상이어도 AI/1인은 유지하고 1:1로 강제하지 않는다. */
export function defaultGameModeForLobbyCount(count) {
  return Number(count) >= 2 ? null : GAME_MODE.AI;
}

export function intendedGameMode(mode) {
  if (mode === GAME_MODE.SOLO) return GAME_MODE.SOLO;
  if (mode === GAME_MODE.SPECTATE) return GAME_MODE.SPECTATE;
  return GAME_MODE.AI;
}

/** 1:1을 연 뒤에는 대기실 기본값(혼자=AI)이 모드를 덮지 못한다. */
export function finalizeStartedMode(requested, current) {
  const want = intendedGameMode(requested);
  return current === want ? current : want;
}

export function shouldApplyLobbyDefaultMode(snapshot, nextMode, extras = {}) {
  if (extras.inRoom || extras.joining || extras.startingPvp) return false;
  if (!snapshot || nextMode == null) return false;
  if (snapshot.phase === PHASE.SPECTATING || snapshot.gameMode === GAME_MODE.SPECTATE) return false;
  if (
    snapshot.gameMode === GAME_MODE.AI
    || snapshot.gameMode === GAME_MODE.SOLO
    || snapshot.gameMode === GAME_MODE.PVP
  ) return false;
  if (snapshot.gameMode === nextMode) return false;
  if (snapshot.phase === PHASE.GAME_OVER) return true;
  if (snapshot.phase !== PHASE.IDLE) return false;
  const total = (snapshot.scores?.black ?? 0) + (snapshot.scores?.white ?? 0);
  const expected = (snapshot.formation?.count ?? 5) * 2;
  return total === expected && snapshot.currentTurn === STONE_COLOR.BLACK;
}

export const AI_DIFFICULTY = Object.freeze({
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  EXPERT: 'expert',
});

const CLASH_SOUND_MIN_SPEED = 0.4;

const STONE_BODY_OPTIONS = Object.freeze({
  restitution: 0.85,
  friction: 0.02,
  frictionAir: 0.025,
  frictionStatic: 0.05,
  density: 0.005,
  slop: 0,
  sleepThreshold: 28,
});

let nextStoneId = 1;

export function vectorMagnitude(vec) {
  return Math.hypot(vec.x, vec.y);
}

/**
 * 두 바둑돌 속도의 상대 속도 크기.
 * 충돌 법선이 있으면 법선 성분도 반영한다.
 */
export function computeRelativeVelocity(velA, velB, normal = null) {
  const relative = { x: velA.x - velB.x, y: velA.y - velB.y };
  let speed = vectorMagnitude(relative);
  if (normal) {
    const alongNormal = Math.abs(relative.x * normal.x + relative.y * normal.y);
    speed = Math.max(speed, alongNormal);
  }
  return speed;
}

export function clampPullVector(origin, pointer, maxPull = SLINGSHOT.MAX_PULL_DISTANCE) {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0 || mag <= maxPull) return { x: dx, y: dy };
  const scale = maxPull / mag;
  return { x: dx * scale, y: dy * scale };
}

export function emaPoint(previous, next, alpha = TOUCH_FEEL.EMA_ALPHA) {
  if (!previous) return { x: next.x, y: next.y };
  return {
    x: alpha * next.x + (1 - alpha) * previous.x,
    y: alpha * next.y + (1 - alpha) * previous.y,
  };
}

/** 비선형 탄성 장력 0..1. 당김이 늘수록 저항이 가파르게 오른다. */
export function computeElasticTension(normalizedPull, exponent = TOUCH_FEEL.TENSION_EXPONENT) {
  const t = Math.max(0, Math.min(1, normalizedPull));
  return t ** exponent;
}

/** 선형 파워 0..1 → 차징 단계 0 / 30% / 70% / MAX */
export function powerChargeStage(power) {
  if (power >= TOUCH_FEEL.POWER_STAGE_MAX - 1e-9) return 3;
  if (power >= TOUCH_FEEL.POWER_STAGE_70) return 2;
  if (power >= TOUCH_FEEL.POWER_STAGE_30) return 1;
  return 0;
}

export function launchForceFromVelocity(velocity, mass, deltaMs = SLINGSHOT.ENGINE_DELTA_MS) {
  const dt2 = deltaMs * deltaMs;
  return {
    x: (velocity.x * mass) / dt2,
    y: (velocity.y * mass) / dt2,
  };
}

/**
 * 슬링샷 당김 → 탄성 장력 → 발사 속도/충격량.
 * 손가락이 돌을 당긴 반대 방향으로 ApplyForce 충격량이 나간다.
 */
export function computeSlingshotLaunch(origin, pointer, options = {}) {
  const maxPull = options.maxPull ?? SLINGSHOT.MAX_PULL_DISTANCE;
  const maxSpeed = options.maxSpeed ?? SLINGSHOT.MAX_LAUNCH_SPEED;
  const deadzone = options.deadzone ?? SLINGSHOT.PULL_DEADZONE;
  const gain = options.gain ?? SLINGSHOT.PULL_GAIN;
  const mass = options.mass ?? 1;
  const rawX = pointer.x - origin.x;
  const rawY = pointer.y - origin.y;
  const rawMag = Math.hypot(rawX, rawY);
  const gained = { x: origin.x + rawX * gain, y: origin.y + rawY * gain };
  const pull = clampPullVector(origin, gained, maxPull);
  const mag = Math.hypot(pull.x, pull.y);
  const power = mag / maxPull;
  const tension = power;
  const powerScale = clampPowerScale(options.powerScale ?? POWER_RATIO.DEFAULT);
  const travel = mag * powerScale;
  const speed = Math.min(travel * SLINGSHOT.FRICTION_AIR, maxSpeed);
  const nx = mag === 0 ? 0 : -pull.x / mag;
  const ny = mag === 0 ? 0 : -pull.y / mag;
  const velocity = { x: nx * speed, y: ny * speed };
  const force = launchForceFromVelocity(velocity, mass);
  return {
    pull,
    force,
    velocity,
    tension,
    power,
    stage: powerChargeStage(power),
    inDeadzone: rawMag < deadzone,
    powerScale,
    travel,
  };
}

export function estimateLaunchTravel(velocity, frictionAir = 0.025) {
  const speed = Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0);
  if (speed < 1e-8) return 0;
  return speed / frictionAir;
}

/** 설정 바둑판 발사 시험 — Matter 속도와 공기저항을 그대로 쓴다. */
export const PREVIEW_LAUNCH = Object.freeze({
  FRICTION_AIR: 0.025,
  REST_SPEED: 0.12,
  RESTITUTION: 0.85,
});

export function createPreviewLaunchState(stones, index, velocity) {
  return stones.map((s, i) => ({
    x: s.x,
    y: s.y,
    color: s.color,
    vx: i === index ? velocity.x : 0,
    vy: i === index ? velocity.y : 0,
  }));
}

function resolvePreviewCollisions(state, onClash) {
  const min = STONE_RADIUS * 2;
  for (let i = 0; i < state.length; i++) {
    for (let j = i + 1; j < state.length; j++) {
      const a = state[i];
      const b = state[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-4;
      if (dist >= min) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = (min - dist) * 0.5;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;
      onClash?.(Math.abs(vn));
      const impulse = -(1 + PREVIEW_LAUNCH.RESTITUTION) * vn * 0.5;
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

export function stepPreviewLaunch(state, dtMs = SLINGSHOT.ENGINE_DELTA_MS, onClash) {
  const steps = Math.max(0, dtMs) / SLINGSHOT.ENGINE_DELTA_MS;
  const damp = (1 - PREVIEW_LAUNCH.FRICTION_AIR) ** steps;
  for (const s of state) {
    s.x += s.vx * steps;
    s.y += s.vy * steps;
    s.vx *= damp;
    s.vy *= damp;
  }
  resolvePreviewCollisions(state, onClash);
  const moving = state.some((s) => Math.hypot(s.vx, s.vy) > PREVIEW_LAUNCH.REST_SPEED);
  return { state, moving };
}

export function simulatePreviewLaunch(stones, index, velocity, ticks = 240) {
  const state = createPreviewLaunchState(stones, index, velocity);
  let moving = true;
  for (let i = 0; i < ticks && moving; i++) {
    moving = stepPreviewLaunch(state).moving;
  }
  return state;
}

// 돌 중심이 나무 상판 밖으로 나가면 낙사. 격자선이 아니라 판 끝.
export const FALL_BOUNDS = boardFallBounds(VIRTUAL_WIDTH);
/** 장외로 날아간 돌을 받는 안전망. 상판보다 멀리 두어 끝 반사를 막는다. */
export const WORLD_CATCH_PAD = 280;

export function isOutsideInnerBoard(position, _inner = BOARD.inner) {
  const { min, max } = boardFallBounds();
  const x = Number(position?.x);
  const y = Number(position?.y);
  return (
    !Number.isFinite(x)
    || !Number.isFinite(y)
    || x < min
    || x > max
    || y < min
    || y > max
  );
}

function isStoneBody(body) {
  return Boolean(body && body.plugin && body.plugin.kind === 'stone');
}

function stoneSpeed(body) {
  return vectorMagnitude(body.velocity);
}

function isBodyAtRest(body) {
  if (body.isSleeping) return true;
  return stoneSpeed(body) < REST.SPEED_THRESHOLD
    && Math.abs(body.angularVelocity) < REST.ANGULAR_THRESHOLD;
}

function copyXY(pos) {
  return { x: pos.x, y: pos.y };
}

/** 접촉보다 조금 넓은 근접. 이 안이면 그 돌 방향으로 당길 수 없다. */
export const STONE_NEAR_SLOP = 14;
export const PULL_BLOCK_COS = Math.cos((40 * Math.PI) / 180);
export const PULL_BLOCK_NOTICE = '붙어 있는 돌 방향으로는 당길 수 없습니다.';
export const PULL_OVER_NOTICE = '바둑돌위로 당길수 없습니다';

export function stonePoint(stone) {
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

export function stonesNearby(a, b, slop = STONE_NEAR_SLOP) {
  const pa = stonePoint(a);
  const pb = stonePoint(b);
  if (!pa || !pb) return false;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y) <= pa.radius + pb.radius + slop;
}

/** 당김이 근접한 돌 축(그 돌 방향·반대)을 향하면 그 이웃을 반환한다. */
export function findBlockedNearbyAim(shooter, pointer, others) {
  const origin = stonePoint(shooter);
  if (!origin || !pointer) return null;
  const px = pointer.x - origin.x;
  const py = pointer.y - origin.y;
  const pullLen = Math.hypot(px, py);
  if (pullLen < SLINGSHOT.PULL_DEADZONE) return null;
  const pnx = px / pullLen;
  const pny = py / pullLen;
  for (const raw of others ?? []) {
    const n = stonePoint(raw);
    if (!n || n.fallen || n.id === origin.id) continue;
    if (!stonesNearby(origin, n)) continue;
    const dx = n.x - origin.x;
    const dy = n.y - origin.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return n;
    const align = Math.abs((dx / len) * pnx + (dy / len) * pny);
    if (align >= PULL_BLOCK_COS) return n;
  }
  return null;
}

export function segmentHitsDisk(ax, ay, bx, by, cx, cy, radius) {
  const r = Number(radius) || 0;
  const abx = bx - ax;
  const aby = by - ay;
  const acx = cx - ax;
  const acy = cy - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) return Math.hypot(acx, acy) <= r;
  let t = (acx * abx + acy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(cx - (ax + abx * t), cy - (ay + aby * t)) <= r;
}

/** 당김선(원점→포인터)이 다른 돌 위를 지나면 그 돌을 반환한다. */
export function findPullOverStone(shooter, pointer, others) {
  const origin = stonePoint(shooter);
  if (!origin || !pointer) return null;
  const px = pointer.x - origin.x;
  const py = pointer.y - origin.y;
  const pullLen = Math.hypot(px, py);
  if (pullLen < SLINGSHOT.PULL_DEADZONE) return null;
  const nx = px / pullLen;
  const ny = py / pullLen;
  const start = origin.radius + 0.5;
  const ax = origin.x + nx * start;
  const ay = origin.y + ny * start;
  for (const raw of others ?? []) {
    const n = stonePoint(raw);
    if (!n || n.fallen || n.id === origin.id) continue;
    if (segmentHitsDisk(ax, ay, pointer.x, pointer.y, n.x, n.y, n.radius)) return n;
  }
  return null;
}

export function resolvePullBlock(shooter, pointer, others) {
  const over = findPullOverStone(shooter, pointer, others);
  if (over) return { stone: over, message: PULL_OVER_NOTICE, kind: 'over' };
  const near = findBlockedNearbyAim(shooter, pointer, others);
  if (near) return { stone: near, message: PULL_BLOCK_NOTICE, kind: 'near' };
  return null;
}

export const FORMATION_COUNTS = Object.freeze([3, 5, 7, 9]);

export function resolveFormationCount(stoneCount) {
  if (stoneCount === 1 || FORMATION_COUNTS.includes(stoneCount)) return stoneCount;
  return STONES_PER_SIDE;
}
export const FORMATION_ZONE_RATIO = 0.3;
export const FORMATION_MIN_SEPARATION = STONE_RADIUS * 2 * 1.2;
export const FORMATION_STORAGE_KEY = 'dotori-alkkagi:my-formation';
export const FORMATION_SLOT = Object.freeze({
  MINE: 'mine',
  CUSTOM: 'custom',
  PRESET: 'preset',
});
export function formationStorageKey(slot) {
  const id = slot === FORMATION_SLOT.CUSTOM || slot === FORMATION_SLOT.PRESET
    ? slot
    : FORMATION_SLOT.MINE;
  return `${FORMATION_STORAGE_KEY}:${id}`;
}
export const FORMATION_ZONE = Object.freeze({
  PRESET: 'preset',
  CUSTOM: 'custom',
});
export const FORMATION_MODE = Object.freeze({
  PRESET: 'preset',
  CUSTOM: 'custom',
});

/** 9줄 바둑판에서 진영 첫째 선(위 1 · 아래 7). */
export const FORMATION_FIRST_LINE = Object.freeze({
  WHITE: 1,
  BLACK: 7,
});
export const FORMATION_SECOND_LINE = Object.freeze({
  WHITE: 2,
  BLACK: 6,
});

/** 3D 상판 9줄과 같은 격자선 → Matter 좌표 */
export function boardGridLineMatterY(index, world = VIRTUAL_WIDTH) {
  const tex = 1024;
  const pad = 68;
  const mesh = 480;
  const inset = 68;
  const t = (pad + Number(index) * ((tex - pad * 2) / 8)) / tex;
  const usable = mesh - inset;
  return world / 2 + (t * mesh - mesh / 2) * (world / usable);
}
export const boardGridLineMatterX = boardGridLineMatterY;
export const FORMATION_EDGE_LINE = Object.freeze({
  MIN: 0,
  MAX: 8,
});
export const FORMATION_SHAPE = Object.freeze({
  LINE: 'line',
  WEDGE: 'wedge',
  COLUMN: 'column',
  DEFENSE: 'defense',
});

/** 1알 정면 대치 요청 좌표 (존 밖이면 클램프). */
export const FORMATION_FACEOFF_REQUEST = Object.freeze({
  black: Object.freeze({ x: VIRTUAL_WIDTH / 2, y: 640 }),
  white: Object.freeze({ x: VIRTUAL_WIDTH / 2, y: 100 }),
});

export function getFormationZones(board = BOARD, kind = FORMATION_ZONE.PRESET) {
  const { inner } = board;
  const r = STONE_RADIUS;
  const minX = inner.x + r;
  const maxX = inner.x + inner.size - r;
  if (kind === FORMATION_ZONE.CUSTOM) {
    const edges = getRearrangeZones();
    return {
      inner,
      kind: FORMATION_ZONE.CUSTOM,
      minX: edges.minX,
      maxX: edges.maxX,
      white: edges.white,
      black: edges.black,
    };
  }
  const zoneH = inner.size * FORMATION_ZONE_RATIO;
  const edges = getRearrangeZones();
  return {
    inner,
    kind: FORMATION_ZONE.PRESET,
    minX: Math.min(minX, edges.minX),
    maxX: Math.max(maxX, edges.maxX),
    white: {
      minY: Math.min(inner.y + r, edges.white.minY),
      maxY: Math.max(inner.y + zoneH, edges.white.maxY),
    },
    black: {
      minY: Math.min(inner.y + inner.size - zoneH, edges.black.minY),
      maxY: Math.max(inner.y + inner.size - r, edges.black.maxY),
    },
  };
}

export function clampToFormationZone(x, y, color, board = BOARD, kind = FORMATION_ZONE.PRESET) {
  const zones = getFormationZones(board, kind);
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  return {
    x: Math.min(zones.maxX, Math.max(zones.minX, x)),
    y: Math.min(band.maxY, Math.max(band.minY, y)),
    color,
  };
}

export function isInFormationZone(x, y, color, board = BOARD, kind = FORMATION_ZONE.PRESET) {
  const zones = getFormationZones(board, kind);
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  return x >= zones.minX && x <= zones.maxX && y >= band.minY && y <= band.maxY;
}

export function hasStoneOverlap(x, y, others, minSep = FORMATION_MIN_SEPARATION) {
  return others.some((other) => Math.hypot(other.x - x, other.y - y) < minSep - 1e-6);
}

/**
 * 프리셋은 진영 30% 구역, 내 진형/커스텀은 첫째 선 이내 + 지름×1.2 겹침 검사.
 * 실패 시 이전 유효 좌표로 복귀한다.
 */
export function validateStonePlacement(
  spot,
  others = [],
  previous = null,
  board = BOARD,
  kind = FORMATION_ZONE.PRESET,
) {
  if (!isInFormationZone(spot.x, spot.y, spot.color, board, kind)) {
    return {
      ok: false,
      reason: 'zone',
      x: previous?.x ?? spot.x,
      y: previous?.y ?? spot.y,
    };
  }
  if (hasStoneOverlap(spot.x, spot.y, others)) {
    return {
      ok: false,
      reason: 'overlap',
      x: previous?.x ?? spot.x,
      y: previous?.y ?? spot.y,
    };
  }
  return { ok: true, reason: null, x: spot.x, y: spot.y };
}

export function resolveCustomFormationDrop(origin, pointer, color, others = [], board = BOARD) {
  const kind = FORMATION_ZONE.CUSTOM;
  const zones = getFormationZones(board, kind);
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  if (isInFormationZone(pointer.x, pointer.y, color, board, kind)) {
    return {
      ...validateStonePlacement({ x: pointer.x, y: pointer.y, color }, others, origin, board, kind),
      action: 'place',
    };
  }
  const offBack = color === STONE_COLOR.WHITE ? pointer.y < band.minY : pointer.y > band.maxY;
  if (offBack) {
    return { ok: false, reason: 'launch', action: 'launch', x: origin.x, y: origin.y };
  }
  const clamped = clampToFormationZone(pointer.x, pointer.y, color, board, kind);
  return {
    ...validateStonePlacement(clamped, others, origin, board, kind),
    action: 'place',
  };
}

/** 시작 전 재배치: 첫째 선까지만, 좌우·자기 끝은 9줄 가장자리까지. */
export function getRearrangeZones() {
  const left = boardGridLineMatterX(FORMATION_EDGE_LINE.MIN);
  const right = boardGridLineMatterX(FORMATION_EDGE_LINE.MAX);
  const top = boardGridLineMatterY(FORMATION_EDGE_LINE.MIN);
  const bottom = boardGridLineMatterY(FORMATION_EDGE_LINE.MAX);
  const whiteFar = boardGridLineMatterY(FORMATION_FIRST_LINE.WHITE);
  const blackFar = boardGridLineMatterY(FORMATION_FIRST_LINE.BLACK);
  return {
    minX: Math.min(left, right),
    maxX: Math.max(left, right),
    white: {
      minY: Math.min(top, whiteFar),
      maxY: Math.max(top, whiteFar),
    },
    black: {
      minY: Math.min(blackFar, bottom),
      maxY: Math.max(blackFar, bottom),
    },
  };
}

export function clampToRearrangeZone(x, y, color) {
  const zones = getRearrangeZones();
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  return {
    x: Math.min(zones.maxX, Math.max(zones.minX, x)),
    y: Math.min(band.maxY, Math.max(band.minY, y)),
    color,
  };
}

export function isInRearrangeZone(x, y, color) {
  const zones = getRearrangeZones();
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  return x >= zones.minX && x <= zones.maxX && y >= band.minY && y <= band.maxY;
}

/** 대전 시작 전 재배치: 첫째 선·판 끝으로 클램프. 설정용 뒤로당김=발사와 분리. */
export function resolveMatchRearrangeDrop(origin, pointer, color, others = []) {
  const clamped = clampToRearrangeZone(pointer.x, pointer.y, color);
  if (!isInRearrangeZone(clamped.x, clamped.y, color)) {
    return {
      ok: false,
      reason: 'zone',
      action: 'place',
      x: origin?.x ?? clamped.x,
      y: origin?.y ?? clamped.y,
    };
  }
  if (hasStoneOverlap(clamped.x, clamped.y, others)) {
    return {
      ok: false,
      reason: 'overlap',
      action: 'place',
      x: origin?.x ?? clamped.x,
      y: origin?.y ?? clamped.y,
    };
  }
  return { ok: true, reason: null, action: 'place', x: clamped.x, y: clamped.y };
}

export function rearrangeZoneRects(board = BOARD, color = null) {
  const zones = getRearrangeZones(board);
  const bands = [];
  if (!color || color === STONE_COLOR.WHITE) {
    bands.push({
      color: STONE_COLOR.WHITE,
      minX: zones.minX,
      maxX: zones.maxX,
      minY: zones.white.minY,
      maxY: zones.white.maxY,
    });
  }
  if (!color || color === STONE_COLOR.BLACK) {
    bands.push({
      color: STONE_COLOR.BLACK,
      minX: zones.minX,
      maxX: zones.maxX,
      minY: zones.black.minY,
      maxY: zones.black.maxY,
    });
  }
  return bands;
}

export function clampLayoutToFormationZone(layout, board = BOARD, kind = FORMATION_ZONE.CUSTOM) {
  return (layout ?? []).map((spot) => {
    const clamped = clampToFormationZone(spot.x, spot.y, spot.color, board, kind);
    return { ...spot, x: clamped.x, y: clamped.y };
  });
}

export function campsAreSegregated(layout, board = BOARD, kind = FORMATION_ZONE.PRESET) {
  return (layout ?? []).every((spot) => (
    isInFormationZone(spot.x, spot.y, spot.color, board, kind)
    && isOnHomeHalf(spot, board)
  ));
}

export function isOnHomeHalf(spot, board = BOARD) {
  const mid = board.inner.y + board.inner.size / 2;
  if (spot?.color === STONE_COLOR.WHITE) return Number(spot.y) < mid - 1e-6;
  return Number(spot.y) > mid + 1e-6;
}

export function packHomeRow(count, color, board = BOARD, kind = FORMATION_ZONE.PRESET) {
  return packCampGrid(count, color, board, kind, 'row');
}

export function packCampGrid(count, color, board = BOARD, kind = FORMATION_ZONE.PRESET, prefer = 'row') {
  const n = Math.max(1, Number(count) || 1);
  const zones = getFormationZones(board, kind);
  const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
  const sep = FORMATION_MIN_SEPARATION;
  const width = Math.max(sep, zones.maxX - zones.minX);
  const height = Math.max(0, band.maxY - band.minY);
  const maxCols = Math.max(1, Math.floor(width / sep) + 1);
  const maxRows = Math.max(1, height < sep ? 1 : Math.floor(height / sep) + 1);
  let cols;
  let rows;
  if (prefer === 'column') {
    rows = Math.min(n, maxRows);
    cols = Math.ceil(n / rows);
    if (cols > maxCols) {
      cols = maxCols;
      rows = Math.min(maxRows, Math.ceil(n / cols));
    }
  } else {
    cols = Math.min(n, maxCols);
    rows = Math.ceil(n / cols);
    if (rows > maxRows) {
      rows = maxRows;
      cols = Math.min(maxCols, Math.ceil(n / rows));
    }
  }
  const gapX = cols === 1 ? 0 : Math.min(sep, width / Math.max(1, cols - 1));
  const gapY = rows === 1 ? 0 : Math.min(sep, height / Math.max(1, rows - 1));
  const usedW = gapX * (cols - 1);
  const startX = cols === 1 ? (zones.minX + zones.maxX) / 2 : zones.minX + Math.max(0, (width - usedW) / 2);
  const spots = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = cols === 1 ? startX : startX + gapX * col;
    const y = color === STONE_COLOR.WHITE
      ? band.minY + gapY * row
      : band.maxY - gapY * row;
    spots.push({ ...clampToFormationZone(x, y, color, board, kind), color });
  }
  return spots;
}

export function separateCampsForPlay(layout, count, board = BOARD, kind = FORMATION_ZONE.CUSTOM) {
  const n = resolveFormationCount(count);
  const homes = {
    [STONE_COLOR.BLACK]: packCampGrid(n, STONE_COLOR.BLACK, board, kind),
    [STONE_COLOR.WHITE]: packCampGrid(n, STONE_COLOR.WHITE, board, kind),
  };
  const next = [];
  for (const color of [STONE_COLOR.BLACK, STONE_COLOR.WHITE]) {
    const group = (layout ?? []).filter((s) => s.color === color);
    for (let i = 0; i < n; i += 1) {
      const spot = group[i];
      const home = homes[color][i];
      if (!spot) {
        next.push({ ...home, color });
        continue;
      }
      const clamped = clampToFormationZone(spot.x, spot.y, color, board, kind);
      const ok = isOnHomeHalf(clamped, board)
        && isInFormationZone(clamped.x, clamped.y, color, board, kind);
      next.push(ok
        ? { ...spot, color, x: clamped.x, y: clamped.y }
        : { ...home, color });
    }
  }
  if (validateFormationLayout(next, board, kind).ok && next.every((s) => isOnHomeHalf(s, board))) {
    return next;
  }
  return [...homes[STONE_COLOR.BLACK], ...homes[STONE_COLOR.WHITE]];
}

export function enforceOwnCamps(layout, board = BOARD, kind = FORMATION_ZONE.PRESET, stoneCount = null) {
  const src = Array.isArray(layout) ? layout : [];
  const blacks = src.filter((s) => s.color === STONE_COLOR.BLACK);
  const whites = src.filter((s) => s.color === STONE_COLOR.WHITE);
  const guessed = blacks.length === whites.length ? blacks.length : Math.max(blacks.length, whites.length);
  const n = resolveFormationCount(stoneCount ?? (guessed === 1 ? 1 : guessed));
  return separateCampsForPlay(src, n, board, kind);
}

export function commitPlayLayout(count, draft, board = BOARD, kind = FORMATION_ZONE.CUSTOM) {
  const n = resolveFormationCount(count);
  return separateCampsForPlay(
    clampLayoutToFormationZone(draft ?? [], board, kind),
    n,
    board,
    kind,
  );
}

export function validateFormationLayout(layout, board = BOARD, kind = FORMATION_ZONE.PRESET) {
  for (let i = 0; i < layout.length; i++) {
    const others = layout.filter((_, j) => j !== i);
    const result = validateStonePlacement(layout[i], others, layout[i], board, kind);
    if (!result.ok) return { ok: false, index: i, reason: result.reason };
  }
  const blacks = layout.filter((s) => s.color === STONE_COLOR.BLACK).length;
  const whites = layout.filter((s) => s.color === STONE_COLOR.WHITE).length;
  if (blacks !== whites) return { ok: false, index: -1, reason: 'count' };
  return { ok: true, index: -1, reason: null };
}

function rowXs(count, inner, padX) {
  const cx = inner.x + inner.size / 2;
  if (count <= 1) return [cx];
  const pad = padX ?? (count >= 7 ? 40 : 88);
  const span = inner.size - pad * 2;
  const gap = span / (count - 1);
  return Array.from({ length: count }, (_, i) => inner.x + pad + gap * i);
}

function gapXs(rearXs) {
  const gaps = [];
  for (let i = 0; i < rearXs.length - 1; i += 1) {
    gaps.push((rearXs[i] + rearXs[i + 1]) / 2);
  }
  return gaps;
}

function alignedXs(rearXs, n) {
  if (n <= 0) return [];
  if (n === 1) return [rearXs[Math.floor(rearXs.length / 2)]];
  if (n >= rearXs.length) return rearXs.slice();
  const picked = [];
  let i = 0;
  let j = rearXs.length - 1;
  while (picked.length < n && i <= j) {
    if (picked.length < n) picked.push(rearXs[i]);
    i += 1;
    if (picked.length < n && i <= j) {
      picked.push(rearXs[j]);
      j -= 1;
    }
  }
  return picked.sort((a, b) => a - b);
}

function mirrorY(y, inner) {
  return inner.y + inner.size - (y - inner.y);
}

function pairByMirror(whiteSpots, board = BOARD) {
  const { inner } = board;
  const black = whiteSpots.map((spot) => ({
    x: spot.x,
    y: mirrorY(spot.y, inner),
    color: STONE_COLOR.BLACK,
  }));
  const white = whiteSpots.map((spot) => ({ ...spot, color: STONE_COLOR.WHITE }));
  return [...black, ...white];
}

function homeY(color, board = BOARD) {
  const { inner } = board;
  return color === STONE_COLOR.WHITE
    ? inner.y + STONE_RADIUS
    : inner.y + inner.size - STONE_RADIUS;
}

function campRowYs(board = BOARD) {
  const zones = getFormationZones(board, FORMATION_ZONE.CUSTOM);
  const gap = FORMATION_MIN_SEPARATION;
  const whiteFront = zones.white.maxY;
  const whiteRear = Math.max(zones.white.minY, whiteFront - gap);
  return { whiteRear, whiteFront };
}

export function createPresetLayout(stoneCount = STONES_PER_SIDE, shape = FORMATION_SHAPE.LINE, board = BOARD) {
  const count = resolveFormationCount(stoneCount);
  const { inner } = board;
  const resolvedShape = count === 1
    ? FORMATION_SHAPE.LINE
    : (count === 3 && shape === FORMATION_SHAPE.DEFENSE
      ? FORMATION_SHAPE.WEDGE
      : (count === 5 && shape === FORMATION_SHAPE.COLUMN ? FORMATION_SHAPE.LINE : shape));

  if (count === 1) {
    const white = clampToFormationZone(
      FORMATION_FACEOFF_REQUEST.white.x,
      FORMATION_FACEOFF_REQUEST.white.y,
      STONE_COLOR.WHITE,
      board,
    );
    const black = clampToFormationZone(
      FORMATION_FACEOFF_REQUEST.black.x,
      FORMATION_FACEOFF_REQUEST.black.y,
      STONE_COLOR.BLACK,
      board,
    );
    return [
      { x: black.x, y: black.y, color: STONE_COLOR.BLACK },
      { x: white.x, y: white.y, color: STONE_COLOR.WHITE },
    ];
  }

  const whiteHome = homeY(STONE_COLOR.WHITE, board);
  const { whiteRear, whiteFront } = campRowYs(board);

  if (resolvedShape === FORMATION_SHAPE.COLUMN) {
    const whites = packCampGrid(count, STONE_COLOR.WHITE, board, FORMATION_ZONE.PRESET, 'column');
    return pairByMirror(whites.map((s) => ({ x: s.x, y: s.y })), board);
  }

  if (resolvedShape === FORMATION_SHAPE.WEDGE && count === 3) {
    const rear = rowXs(2, inner);
    return pairByMirror([
      { x: rear[0], y: whiteRear },
      { x: rear[1], y: whiteRear },
      { x: gapXs(rear)[0], y: whiteFront },
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.WEDGE && count === 5) {
    const rear = rowXs(3, inner);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...gapXs(rear).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.DEFENSE && count === 5) {
    const rear = rowXs(3, inner);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...alignedXs(rear, 2).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.WEDGE && count === 7) {
    const rear = rowXs(4, inner, 56);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...gapXs(rear).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.WEDGE && count === 9) {
    const rear = rowXs(5, inner, 40);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...gapXs(rear).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.DEFENSE && count === 7) {
    const rear = rowXs(4, inner, 56);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...alignedXs(rear, 3).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  if (resolvedShape === FORMATION_SHAPE.DEFENSE && count === 9) {
    const rear = rowXs(5, inner, 40);
    return pairByMirror([
      ...rear.map((x) => ({ x, y: whiteRear })),
      ...alignedXs(rear, 4).map((x) => ({ x, y: whiteFront })),
    ], board);
  }

  return pairByMirror(rowXs(count, inner).map((x) => ({ x, y: whiteHome })), board);
}

/**
 * 흑 하단 · 백 상단 5알 일자진 (기본).
 */
export function createDefaultStoneLayout(board = BOARD) {
  return createPresetLayout(STONES_PER_SIDE, FORMATION_SHAPE.LINE, board);
}

/** 모든 대전(1인·AI·1:1, 첫판·다시하기) 시작 기본: 설정 알 수 일자. */
export function defaultMatchLayout(stoneCount = STONES_PER_SIDE, board = BOARD) {
  const count = resolveFormationCount(stoneCount);
  return enforceOwnCamps(
    createPresetLayout(count, FORMATION_SHAPE.LINE, board),
    board,
    FORMATION_ZONE.PRESET,
    count,
  );
}

export function createRandomFormationLayout(stoneCount = STONES_PER_SIDE, board = BOARD, rng = Math.random) {
  const count = resolveFormationCount(stoneCount);
  const zones = getFormationZones(board, FORMATION_ZONE.CUSTOM);
  const roll = typeof rng === 'function' ? rng : Math.random;
  const layout = [];
  const placeOne = (color, slot) => {
    const band = color === STONE_COLOR.BLACK ? zones.black : zones.white;
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = zones.minX + roll() * (zones.maxX - zones.minX);
      const y = band.minY + roll() * (Math.max(band.maxY - band.minY, 1));
      if (!hasStoneOverlap(x, y, layout)) return { x, y, color };
    }
    const fallback = clampToFormationZone(
      zones.minX + slot * FORMATION_MIN_SEPARATION,
      color === STONE_COLOR.WHITE ? band.minY : band.maxY,
      color,
      board,
      FORMATION_ZONE.CUSTOM,
    );
    return { x: fallback.x, y: fallback.y, color };
  };
  for (const color of [STONE_COLOR.WHITE, STONE_COLOR.BLACK]) {
    for (let slot = 0; slot < count; slot++) layout.push(placeOne(color, slot));
  }
  return enforceOwnCamps(layout, board, FORMATION_ZONE.CUSTOM, count);
}

export class GameEngine {
  /**
   * @param {object} [options]
   * @param {HTMLElement} [options.element] 포인터 입력을 받을 DOM (보통 canvas)
   * @param {import('../audio/SoundEngine.js').SoundEngine} [options.soundEngine]
   * @param {string} [options.firstTurn]
   * @param {boolean} [options.autoStart]
   */
  constructor(options = {}) {
    this.virtualWidth = VIRTUAL_WIDTH;
    this.virtualHeight = VIRTUAL_HEIGHT;
    this.stoneRadius = STONE_RADIUS;
    this.board = {
      outer: { ...BOARD.outer },
      rim: BOARD.rim,
      inner: { ...BOARD.inner },
    };

    this.soundEngine = options.soundEngine ?? defaultSoundEngine;
    this._haptic = options.haptic ?? null;
    this.mapPointer = options.mapPointer ?? null;
    this.element = options.element ?? null;

    this.engine = Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
      enableSleeping: true,
      positionIterations: 24,
      velocityIterations: 18,
      constraintIterations: 6,
    });
    this.world = this.engine.world;
    this.world.gravity.x = 0;
    this.world.gravity.y = 0;

    this.runner = Runner.create({ isFixed: true, delta: 1000 / 60 });

    this.stones = [];
    this._fallTimers = [];
    this.bounds = null;
    this.fallZones = [];

    this.phase = PHASE.IDLE;
    this.currentTurn = options.firstTurn ?? STONE_COLOR.BLACK;
    this.winner = null;
    this.restFrames = 0;
    this.aim = null;
    this._pointerId = null;
    this._running = false;
    this._paused = false;
    this._remoteLaunchStoneId = null;
    this._remoteLaunchTs = 0;
    this._shotFromRemote = false;
    this.localTimer = true;
    this.timerAuthority = true;
    this.turnRemainingMs = TURN.LIMIT_MS;
    this.gameMode = options.gameMode === GAME_MODE.PVP
      ? GAME_MODE.PVP
      : options.gameMode === GAME_MODE.SOLO
        ? GAME_MODE.SOLO
        : GAME_MODE.AI;
    this.isHost = options.isHost !== false;
    this.powerScale = clampPowerScale(options.powerScale ?? readStoredPowerScale());
    this.aiDifficulty = options.aiDifficulty === AI_DIFFICULTY.BEGINNER
      || options.aiDifficulty === AI_DIFFICULTY.INTERMEDIATE
      || options.aiDifficulty === AI_DIFFICULTY.EXPERT
      ? options.aiDifficulty
      : AI_DIFFICULTY.EXPERT;
    this.inputLocked = false;
    this.aiOpponent = false;
    this.aiColor = STONE_COLOR.WHITE;
    this.placementOnly = false;
    this._place = null;
    this._lastPullBlockAt = 0;
    this._lastFallAt = 0;
    this._resultTimer = 0;
    this.formation = {
      count: STONES_PER_SIDE,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.LINE,
      layout: createDefaultStoneLayout(this.board),
    };

    this._listeners = new Map();
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundPointerCancel = this._onPointerCancel.bind(this);
    this._boundTouchGuard = this._onTouchGuard.bind(this);

    this._bondHits = [];
    this._onAfterUpdate = this._handleAfterUpdate.bind(this);
    this._onCollisionStart = this._handleCollisionStart.bind(this);

    Events.on(this.engine, 'afterUpdate', this._onAfterUpdate);
    Events.on(this.engine, 'collisionStart', this._onCollisionStart);

    this._buildBoardBounds();
    this._spawnStones(createDefaultStoneLayout(this.board));

    if (this.element) {
      this.bindInput(this.element);
    }

    if (options.autoStart !== false) {
      this.start();
    }
  }

  start() {
    if (this._paused) return;
    if (!this._running) {
      Runner.run(this.runner, this.engine);
      this._running = true;
    }
  }

  stop() {
    if (this._running) {
      Runner.stop(this.runner);
      this._running = false;
    }
  }

  isPaused() {
    return Boolean(this._paused);
  }

  pauseMatch() {
    this._paused = true;
    this.inputLocked = true;
    this.stop();
    return this.getSnapshot();
  }

  resumeMatch() {
    this._paused = false;
    if (this.phase !== PHASE.SPECTATING) this.inputLocked = false;
    this.start();
    return this.getSnapshot();
  }

  reset(layout) {
    this._clearResultTimer();
    this._lastFallAt = 0;
    this._clearStones();
    this.phase = PHASE.IDLE;
    this.currentTurn = STONE_COLOR.BLACK;
    this.winner = null;
    this.restFrames = 0;
    this.aim = null;
    this._pointerId = null;
    this._place = null;
    this.turnRemainingMs = TURN.LIMIT_MS;
    this.inputLocked = false;
    const kind = this.formation?.mode === FORMATION_MODE.CUSTOM
      ? FORMATION_ZONE.CUSTOM
      : FORMATION_ZONE.PRESET;
    const nextLayout = enforceOwnCamps(
      layout ?? this.formation?.layout ?? createDefaultStoneLayout(this.board),
      this.board,
      kind,
      this.formation?.count,
    );
    if (this.formation) this.formation.layout = nextLayout;
    this._spawnStones(nextLayout);
    this.emit('reset', this.getSnapshot());
  }

  /**
   * 기존 물리 바디를 제거한 뒤 현재(또는 전달) 진형으로 재초기화한다.
   */
  resetBoard(layout) {
    this.reset(layout);
    return this.getSnapshot();
  }

  /**
   * @param {1|3|5} stoneCount
   * @param {'preset'|'custom'} mode
   * @param {string|Array<{x:number,y:number,color:string}>|object} [customPositions]
   */
  setupFormation(stoneCount, mode = FORMATION_MODE.PRESET, customPositions) {
    const count = resolveFormationCount(stoneCount);
    const resolvedMode = mode === FORMATION_MODE.CUSTOM
      ? FORMATION_MODE.CUSTOM
      : FORMATION_MODE.PRESET;

    let shape = FORMATION_SHAPE.LINE;
    let layout;

    if (resolvedMode === FORMATION_MODE.CUSTOM) {
      const raw = Array.isArray(customPositions)
        ? customPositions
        : customPositions?.positions;
      const normalized = this._normalizeCustomLayout(count, raw);
      layout = enforceOwnCamps(
        normalized.length ? normalized : createPresetLayout(count, FORMATION_SHAPE.LINE, this.board),
        this.board,
        FORMATION_ZONE.CUSTOM,
        count,
      );
      shape = FORMATION_SHAPE.LINE;
    } else {
      if (typeof customPositions === 'string') shape = customPositions;
      else if (customPositions?.shape) shape = customPositions.shape;
      layout = enforceOwnCamps(
        createPresetLayout(count, shape, this.board),
        this.board,
        FORMATION_ZONE.PRESET,
        count,
      );
    }

    layout = separateCampsForPlay(
      layout,
      count,
      this.board,
      resolvedMode === FORMATION_MODE.CUSTOM ? FORMATION_ZONE.CUSTOM : FORMATION_ZONE.PRESET,
    );
    this.formation = { count, mode: resolvedMode, shape, layout };
    this.resetBoard(layout);
    return { ok: true, reason: null, layout, formation: this.formation };
  }

  applyDefaultMatchFormation(stoneCount = this.formation?.count) {
    return this.setupFormation(stoneCount, FORMATION_MODE.PRESET, FORMATION_SHAPE.LINE);
  }

  /**
   * 커스텀 드래그 한 점 검증. 실패 시 이전 좌표 유지.
   */
  tryPlaceCustomStone(index, x, y) {
    const layout = this.formation.layout.map((s) => ({ ...s }));
    const stone = layout[index];
    if (!stone) return { ok: false, reason: 'missing', x, y };
    const previous = { x: stone.x, y: stone.y };
    const others = layout.filter((_, i) => i !== index);
    const result = validateStonePlacement(
      { x, y, color: stone.color },
      others,
      previous,
      this.board,
      FORMATION_ZONE.CUSTOM,
    );
    if (result.ok) {
      stone.x = result.x;
      stone.y = result.y;
      this.formation = { ...this.formation, mode: FORMATION_MODE.CUSTOM, layout };
    }
    return result;
  }

  destroy() {
    this._clearResultTimer();
    this._clearFallTimers();
    this.stop();
    this.unbindInput();
    Events.off(this.engine, 'afterUpdate', this._onAfterUpdate);
    Events.off(this.engine, 'collisionStart', this._onCollisionStart);
    World.clear(this.world, false);
    Engine.clear(this.engine);
    this.stones = [];
    this._listeners.clear();
  }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  bindInput(element) {
    this.unbindInput();
    this.element = element;
    element.style.touchAction = 'none';
    const touchOpts = { passive: false };
    element.addEventListener('pointerdown', this._boundPointerDown, touchOpts);
    element.addEventListener('pointermove', this._boundPointerMove, touchOpts);
    element.addEventListener('pointerup', this._boundPointerUp, touchOpts);
    element.addEventListener('pointercancel', this._boundPointerCancel, touchOpts);
    element.addEventListener('touchstart', this._boundTouchGuard, touchOpts);
    element.addEventListener('touchmove', this._boundTouchGuard, touchOpts);
    element.addEventListener('touchend', this._boundTouchGuard, touchOpts);
    element.addEventListener('touchcancel', this._boundTouchGuard, touchOpts);
  }

  unbindInput() {
    const element = this.element;
    if (!element) return;
    element.removeEventListener('pointerdown', this._boundPointerDown);
    element.removeEventListener('pointermove', this._boundPointerMove);
    element.removeEventListener('pointerup', this._boundPointerUp);
    element.removeEventListener('pointercancel', this._boundPointerCancel);
    element.removeEventListener('touchstart', this._boundTouchGuard);
    element.removeEventListener('touchmove', this._boundTouchGuard);
    element.removeEventListener('touchend', this._boundTouchGuard);
    element.removeEventListener('touchcancel', this._boundTouchGuard);
    this.element = null;
  }

  getBoard() {
    return {
      virtual: { width: this.virtualWidth, height: this.virtualHeight },
      outer: { ...this.board.outer },
      inner: { ...this.board.inner },
      rim: this.board.rim,
    };
  }

  /**
   * 슬링샷 조준선 가이드. UI 레이어가 이 데이터로 점선/파워 게이지를 그린다.
   */
  getAimGuide() {
    if (!this.aim || this.phase !== PHASE.AIMING) {
      return { active: false };
    }

    const origin = copyXY(this.aim.stone.body.position);
    const shot = computeSlingshotLaunch(origin, this.aim.pointer, { powerScale: this.powerScale });

    const pullEnd = { x: origin.x + shot.pull.x, y: origin.y + shot.pull.y };
    return {
      active: true,
      origin,
      start: origin,
      current: pullEnd,
      pullEnd,
      aimEnd: (() => {
        const speed = Math.hypot(shot.velocity.x, shot.velocity.y) || 1;
        const travel = shot.travel ?? estimateLaunchTravel(shot.velocity);
        return {
          x: origin.x + (shot.velocity.x / speed) * travel,
          y: origin.y + (shot.velocity.y / speed) * travel,
        };
      })(),
      power: shot.power,
      tension: shot.tension,
      stage: shot.stage,
      color: this.aim.stone.color,
      stoneId: this.aim.stone.id,
      deadzone: shot.inDeadzone,
      velocity: shot.velocity,
    };
  }

  getSnapshot() {
    const alive = (color) => this.stones.filter((s) => !s.fallen && s.color === color).length;

    return {
      phase: this.phase,
      currentTurn: this.currentTurn,
      winner: this.winner,
      board: this.getBoard(),
      aim: this.getAimGuide(),
      scores: {
        black: alive(STONE_COLOR.BLACK),
        white: alive(STONE_COLOR.WHITE),
      },
      stones: this.stones.map((stone) => ({
        id: stone.id,
        color: stone.color,
        fallen: stone.fallen,
        radius: this.stoneRadius,
        x: stone.body.position.x,
        y: stone.body.position.y,
        angle: stone.body.angle,
        speed: stone.fallen ? 0 : stoneSpeed(stone.body),
      })),
      formation: {
        count: this.formation.count,
        mode: this.formation.mode,
        shape: this.formation.shape,
      },
      timer: {
        remainingMs: Math.max(0, this.turnRemainingMs),
        totalMs: TURN.LIMIT_MS,
        ratio: Math.max(0, Math.min(1, this.turnRemainingMs / TURN.LIMIT_MS)),
        urgent: this.turnRemainingMs <= TURN.URGENT_MS && this.phase !== PHASE.GAME_OVER,
        running: !this._paused && (this.phase === PHASE.IDLE || this.phase === PHASE.AIMING),
      },
      gameMode: this.gameMode,
      myColor: this.gameMode === GAME_MODE.SOLO
        ? this.currentTurn
        : this.gameMode === GAME_MODE.PVP
          ? (this.isHost !== false ? STONE_COLOR.BLACK : STONE_COLOR.WHITE)
          : STONE_COLOR.BLACK,
      aiDifficulty: this.aiDifficulty,
      inputLocked: Boolean(this.inputLocked),
      paused: Boolean(this._paused),
      placementOnly: Boolean(this.placementOnly),
      placementColor: this.placementColor(),
    };
  }

  getAliveStones(color) {
    return this.stones.filter((s) => !s.fallen && (!color || s.color === color));
  }

  setInputLocked(locked) {
    if (this._paused) {
      this.inputLocked = true;
      return true;
    }
    this.inputLocked = Boolean(locked);
    return this.inputLocked;
  }

  setHost(isHost) {
    this.isHost = Boolean(isHost);
    this.emit('hostChange', this.isHost);
    return this.isHost;
  }

  placementColor() {
    if (this.gameMode === GAME_MODE.SOLO) return null;
    return this.isHost !== false ? STONE_COLOR.BLACK : STONE_COLOR.WHITE;
  }

  canPlaceStone(stone) {
    if (!stone || stone.fallen) return false;
    const color = this.placementColor();
    return !color || stone.color === color;
  }

  setPlacementOnly(on) {
    this.placementOnly = Boolean(on);
    if (!this.placementOnly && this._place) {
      this._endPlacement();
    }
    return this.placementOnly;
  }

  placeStoneAt(stone, point, from = null) {
    if (!stone || !point || !this.canPlaceStone(stone)) {
      return { ok: false, reason: 'denied', x: stone?.body?.position?.x ?? 0, y: stone?.body?.position?.y ?? 0 };
    }
    const origin = from ?? { x: stone.body.position.x, y: stone.body.position.y };
    const others = this.getAliveStones()
      .filter((s) => s.id !== stone.id)
      .map((s) => ({ x: s.body.position.x, y: s.body.position.y, color: s.color }));
    const drop = this.placementOnly
      ? resolveMatchRearrangeDrop(origin, point, stone.color, others)
      : resolveCustomFormationDrop(origin, point, stone.color, others, this.board);
    if (drop.ok && drop.action === 'place') {
      Body.setPosition(stone.body, { x: drop.x, y: drop.y });
      Body.setVelocity(stone.body, { x: 0, y: 0 });
      this._syncFormationFromStones();
      return { ok: true, reason: null, x: drop.x, y: drop.y };
    }
    return { ok: false, reason: drop.reason ?? 'reject', x: origin.x, y: origin.y };
  }

  _syncFormationFromStones() {
    if (!this.formation) return;
    const layout = this.stones.map((s) => ({
      id: s.id,
      color: s.color,
      x: s.body.position.x,
      y: s.body.position.y,
    }));
    this.formation = { ...this.formation, mode: FORMATION_MODE.CUSTOM, layout };
  }

  _pickPlacementStoneAt(point) {
    const color = this.placementColor();
    return pickNearestOwnStone(
      color ? this.getAliveStones(color) : this.getAliveStones(),
      point,
      this.stoneRadius,
      STONE_PICK_SLOP * 1.7,
    );
  }

  _beginPlacement(stone) {
    this._place = {
      stone,
      origin: { x: stone.body.position.x, y: stone.body.position.y },
    };
  }

  _movePlacement(point) {
    if (!this._place?.stone) return;
    this.placeStoneAt(this._place.stone, point, this._place.origin);
  }

  _endPlacement() {
    if (this._place?.stone) this._syncFormationFromStones();
    this._place = null;
  }

  _cancelPlacement() {
    const stone = this._place?.stone;
    const origin = this._place?.origin;
    if (stone && origin) {
      Body.setPosition(stone.body, origin);
      Body.setVelocity(stone.body, { x: 0, y: 0 });
      this._syncFormationFromStones();
    }
    this._place = null;
  }

  setPowerScale(multiplier, { persist = false } = {}) {
    this.powerScale = clampPowerScale(multiplier);
    if (persist) persistPowerScale(this.powerScale);
    this.emit('powerScale', this.powerScale);
    return this.powerScale;
  }

  isHumanInputBlocked() {
    const myColor = this.gameMode === GAME_MODE.PVP
      ? (this.isHost !== false ? STONE_COLOR.BLACK : STONE_COLOR.WHITE)
      : null;
    return Boolean(
      this.inputLocked
      || this.phase === PHASE.SPECTATING
      || this.phase === PHASE.GAME_OVER
      || (this.gameMode === GAME_MODE.AI && this.currentTurn !== STONE_COLOR.BLACK)
      || (myColor != null && this.currentTurn !== myColor),
    );
  }

  /**
   * 게임 모드/난이도 변경 후 판을 즉시 재초기화한다.
   */
  setMatchConfig({ mode, difficulty } = {}) {
    if (mode === GAME_MODE.PVP || mode === GAME_MODE.AI || mode === GAME_MODE.SOLO || mode === GAME_MODE.SPECTATE) {
      this.gameMode = mode;
    }
    if (difficulty === AI_DIFFICULTY.BEGINNER
      || difficulty === AI_DIFFICULTY.INTERMEDIATE
      || difficulty === AI_DIFFICULTY.EXPERT) {
      this.aiDifficulty = difficulty;
    }
    if (this.gameMode !== GAME_MODE.SPECTATE) {
      this.spectatorData = null;
    }
    if (this.gameMode !== GAME_MODE.PVP) {
      this.aiOpponent = false;
      this.aiColor = STONE_COLOR.WHITE;
    }
    this.inputLocked = false;
    this.applyDefaultMatchFormation(this.formation?.count);
    return this.getSnapshot();
  }

  setAiOpponent(on, color = STONE_COLOR.WHITE) {
    this.aiOpponent = Boolean(on);
    this.aiColor = color === STONE_COLOR.BLACK ? STONE_COLOR.BLACK : STONE_COLOR.WHITE;
    return this.aiOpponent;
  }

  /**
   * 관전 모드로 전환한다.
   * @param {object} spectatorData - 관전할 게임 데이터
   * @param {string} spectatorData.matchId - 관전할 매치 ID
   * @param {string} spectatorData.playerA - 플레이어 A 이름
   * @param {string} spectatorData.playerB - 플레이어 B 이름
   */
  enterSpectatorMode(spectatorData) {
    this.phase = PHASE.SPECTATING;
    this.gameMode = GAME_MODE.SPECTATE;
    this.inputLocked = true;
    this.spectatorData = spectatorData;
    this.emit('spectatorEnter', { ...spectatorData, snapshot: this.getSnapshot() });
    return this.getSnapshot();
  }

  /**
   * 관전 모드를 종료하고 일반 모드로 복귀한다.
   */
  exitSpectatorMode() {
    this.phase = PHASE.IDLE;
    this.gameMode = GAME_MODE.AI;
    this.inputLocked = false;
    this.spectatorData = null;
    this.reset();
    this.emit('spectatorExit', this.getSnapshot());
    return this.getSnapshot();
  }

  _remoteStonesNeedRebuild(remoteStones) {
    if (!Array.isArray(remoteStones) || remoteStones.length === 0) return false;
    if (this.stones.length !== remoteStones.length) return true;
    return remoteStones.some((data, index) => {
      const stone = findRemoteStone(this.stones, data, index);
      if (!stone) return true;
      if (data.color && stone.color && data.color !== stone.color) return true;
      return false;
    });
  }

  _rebuildFromRemoteStones(remoteStones) {
    const layout = remoteStones.map((stone) => ({
      id: stone.id,
      x: Number(stone.position?.x ?? stone.x),
      y: Number(stone.position?.y ?? stone.y),
      color: stone.color === STONE_COLOR.WHITE ? STONE_COLOR.WHITE : STONE_COLOR.BLACK,
    })).filter((spot) => Number.isFinite(spot.x) && Number.isFinite(spot.y));
    if (!layout.length) return false;
    this._clearStones();
    this._spawnStones(layout);
    if (this.formation) {
      this.formation.layout = layout;
      this.formation.count = Math.max(1, Math.floor(layout.length / 2));
    }
    return true;
  }

  setLocalTimer(on) {
    this.localTimer = on !== false;
    return this.localTimer;
  }

  setTimerAuthority(on) {
    this.timerAuthority = on !== false;
    return this.timerAuthority;
  }

  applyRemoteMatchState(gameState, { asSpectator = false } = {}) {
    if (!gameState) return false;
    if (gameState.event === 'timer') {
      if (gameState.currentTurn) this.currentTurn = gameState.currentTurn;
      if (gameState.turnRemainingMs !== undefined) {
        this.turnRemainingMs = gameState.turnRemainingMs;
      }
      return true;
    }
    const localPhase = this.phase;
    const remotePhase = gameState.phase;
    const localTurn = this.currentTurn;
    const remoteTurn = gameState.currentTurn;
    if (
      localPhase === PHASE.GAME_OVER
      && gameState.event !== 'start'
      && (remotePhase === PHASE.AIMING || remotePhase === PHASE.IDLE)
    ) {
      return false;
    }
    if (
      (localPhase === PHASE.AIMING || localPhase === PHASE.RESOLVING)
      && gameState.event === 'start'
      && !(remoteTurn && localTurn && remoteTurn !== localTurn)
    ) {
      return false;
    }
    const launchTs = Number(this._remoteLaunchTs) || 0;
    const remoteTs = Number(gameState.timestamp) || 0;
    if (
      localPhase === PHASE.RESOLVING
      && gameState.event === 'turnEnd'
      && launchTs
      && remoteTs
      && remoteTs < launchTs
    ) {
      return false;
    }
    const restAuthority = gameState.event === 'turnEnd'
      || gameState.event === 'gameOver'
      || gameState.event === 'start';
    if (
      !restAuthority
      && (localPhase === PHASE.RESOLVING || localPhase === PHASE.AIMING)
      && (remotePhase === PHASE.AIMING || remotePhase === PHASE.IDLE)
      && !(remoteTurn && localTurn && remoteTurn !== localTurn)
    ) {
      return false;
    }
    if (asSpectator && this.phase !== PHASE.SPECTATING) return false;
    if (!asSpectator && this.phase === PHASE.SPECTATING) return false;

    if (Array.isArray(gameState.stones) && gameState.stones.length) {
      if (this._remoteStonesNeedRebuild(gameState.stones)) {
        this._rebuildFromRemoteStones(gameState.stones);
      }
      gameState.stones.forEach((stoneData, index) => {
        const stone = findRemoteStone(this.stones, stoneData, index);
        if (!stone?.body) return;
        const pos = stoneData.position || { x: stoneData.x, y: stoneData.y };
        if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
          Body.setPosition(stone.body, { x: pos.x, y: pos.y });
        }
        const vel = stoneData.velocity || { x: 0, y: 0 };
        Body.setVelocity(stone.body, { x: vel.x || 0, y: vel.y || 0 });
        Body.setAngularVelocity(stone.body, 0);
        if (restAuthority) Sleeping.set(stone.body, true);
        stone.fallen = Boolean(stoneData.fallen);
        if (stone.fallen) {
          stone.body.collisionFilter.mask = 0;
        }
      });
    }

    if (asSpectator) {
      this.phase = PHASE.SPECTATING;
    } else if (gameState.winner) {
      this.phase = PHASE.GAME_OVER;
    } else if (remotePhase && remotePhase !== PHASE.SPECTATING) {
      this.phase = remotePhase;
      this.aim = null;
    }
    if (gameState.currentTurn) this.currentTurn = gameState.currentTurn;
    if (gameState.turnRemainingMs !== undefined) {
      this.turnRemainingMs = gameState.turnRemainingMs;
    }
    if (gameState.event === 'start') {
      this.winner = gameState.winner ?? null;
    } else if (gameState.winner) {
      this.winner = gameState.winner;
    }
    if (gameState.event === 'turnEnd' || gameState.event === 'start') {
      this._remoteLaunchStoneId = null;
      this._remoteLaunchTs = 0;
      this._shotFromRemote = false;
    }
    if (asSpectator) {
      this.emit('spectatorUpdate', { gameState, snapshot: this.getSnapshot() });
    } else if (gameState.winner && localPhase !== PHASE.GAME_OVER) {
      this.emit('gameOver', { winner: gameState.winner, reason: 'remote' });
    }
    return true;
  }

  updateSpectatorState(gameState) {
    return this.applyRemoteMatchState(gameState, { asSpectator: true });
  }

  applyRemoteLaunch(shot = {}, { ignorePause = false, wake = false } = {}) {
    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.SPECTATING) return false;
    if (this._paused) {
      if (ignorePause !== true && wake !== true) return false;
      this._paused = false;
    }
    if (Array.isArray(shot.stones) && shot.stones.length) {
      shot.stones.forEach((stoneData, index) => {
        const remote = findRemoteStone(this.stones, stoneData, index);
        if (!remote?.body || remote.fallen) return;
        const pos = stoneData.position || { x: stoneData.x, y: stoneData.y };
        if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
          Body.setPosition(remote.body, { x: pos.x, y: pos.y });
        }
      });
    }
    const stone = findLaunchStone(this.stones, shot);
    if (!stone?.body) return false;
    if (this.phase === PHASE.RESOLVING && this._remoteLaunchStoneId === stone.id) return false;
    const force = shot.force;
    const vel = shot.velocity;
    const hasForce = Number.isFinite(force?.x) && Number.isFinite(force?.y)
      && (Number(force.x) !== 0 || Number(force.y) !== 0);
    const hasVel = Number.isFinite(vel?.x) && Number.isFinite(vel?.y)
      && (Number(vel.x) !== 0 || Number(vel.y) !== 0);
    if (!hasForce && !hasVel) return false;
    const originX = Number(shot.x ?? shot.position?.x);
    const originY = Number(shot.y ?? shot.position?.y);
    if (Number.isFinite(originX) && Number.isFinite(originY)) {
      Body.setPosition(stone.body, { x: originX, y: originY });
    }
    this._cancelAim();
    Sleeping.set(stone.body, false);
    Body.setVelocity(stone.body, { x: 0, y: 0 });
    Body.setAngularVelocity(stone.body, 0);
    if (hasForce) Body.applyForce(stone.body, stone.body.position, { x: force.x, y: force.y });
    else Body.setVelocity(stone.body, { x: vel.x, y: vel.y });
    this.aim = null;
    this.phase = PHASE.RESOLVING;
    this._remoteLaunchStoneId = stone.id;
    this._remoteLaunchTs = Number(shot.timestamp) > 0 ? Number(shot.timestamp) : Date.now();
    this._shotFromRemote = true;
    this.restFrames = 0;
    if (shot.currentTurn) this.currentTurn = shot.currentTurn;
    this.emit('launch', {
      stoneId: stone.id,
      color: stone.color,
      velocity: hasVel ? { x: vel.x, y: vel.y } : { x: 0, y: 0 },
      force: hasForce ? { x: force.x, y: force.y } : { x: 0, y: 0 },
      power: Number(shot.power) || 0,
      remote: true,
    });
    return true;
  }

  beginAiAim(shot, options = {}) {
    if (!shot?.ok || this.phase === PHASE.GAME_OVER || this.phase === PHASE.RESOLVING) return false;
    const stone = this.stones.find((s) => s.id === shot.shooterId && !s.fallen);
    if (!stone) return false;
    if (
      (this.gameMode === GAME_MODE.AI || this.aiOpponent)
      && stone.color !== (this.aiColor || STONE_COLOR.WHITE)
    ) return false;
    const neighbors = this.getAliveStones().filter((s) => s.id !== stone.id);
    if (options.force !== true && resolvePullBlock(stone, shot.pointer, neighbors)) return false;
    Sleeping.set(stone.body, false);
    this.aim = {
      stone,
      pointer: { x: shot.pointer.x, y: shot.pointer.y },
      hapticStage: 0,
      ai: true,
    };
    this.phase = PHASE.AIMING;
    this.emit('aimStart', this.getAimGuide());
    return true;
  }

  dispatchAiShot() {
    this._launchIfAiming();
  }

  // --- board & stones -------------------------------------------------------

  _buildBoardBounds() {
    const { outer, inner, rim } = this.board;
    const wallT = 80;
    const catchPad = WORLD_CATCH_PAD;
    const playMin = FALL_BOUNDS.min;
    const playMax = FALL_BOUNDS.max;
    const playSize = playMax - playMin;
    const mid = (playMin + playMax) / 2;
    const span = playSize + catchPad * 2 + wallT * 2;

    // 안전망만 멀리 둔다. 상판 끝(0/720)에는 반사 벽이 없다.
    const worldWalls = [
      Bodies.rectangle(mid, playMin - catchPad - wallT / 2, span, wallT, { isStatic: true, label: 'worldWall' }),
      Bodies.rectangle(mid, playMax + catchPad + wallT / 2, span, wallT, { isStatic: true, label: 'worldWall' }),
      Bodies.rectangle(playMin - catchPad - wallT / 2, mid, wallT, span, { isStatic: true, label: 'worldWall' }),
      Bodies.rectangle(playMax + catchPad + wallT / 2, mid, wallT, span, { isStatic: true, label: 'worldWall' }),
    ];

    for (const wall of worldWalls) {
      wall.restitution = 0;
      wall.friction = 1;
      wall.plugin = { kind: 'worldWall' };
    }

    const zoneDepth = catchPad;

    // 바둑판 4개 모서리 바깥쪽에만 낙하 센서 배치
    const zones = [
      Bodies.rectangle(mid, playMin - zoneDepth / 2, playSize + zoneDepth * 2, zoneDepth, {
        isStatic: true, isSensor: true, label: 'fallZone',
      }),
      Bodies.rectangle(mid, playMax + zoneDepth / 2, playSize + zoneDepth * 2, zoneDepth, {
        isStatic: true, isSensor: true, label: 'fallZone',
      }),
      Bodies.rectangle(playMin - zoneDepth / 2, mid, zoneDepth, playSize, {
        isStatic: true, isSensor: true, label: 'fallZone',
      }),
      Bodies.rectangle(playMax + zoneDepth / 2, mid, zoneDepth, playSize, {
        isStatic: true, isSensor: true, label: 'fallZone',
      }),
    ];

    for (const zone of zones) {
      zone.plugin = { kind: 'fallZone' };
    }

    this.bounds = { outer, inner, rim, worldWalls };
    this.fallZones = zones;

    Composite.add(this.world, [...worldWalls, ...zones]);
  }

  _spawnStones(layout) {
    const used = new Set();
    const stones = [];
    let auto = 1;

    for (const spot of layout) {
      let id = Number(spot.id);
      if (!Number.isFinite(id) || id <= 0 || used.has(id)) {
        while (used.has(auto)) auto += 1;
        id = auto;
      }
      used.add(id);
      auto = Math.max(auto, id + 1);
      const body = Bodies.circle(spot.x, spot.y, this.stoneRadius, {
        ...STONE_BODY_OPTIONS,
        label: 'stone',
        render: {
          fillStyle: spot.color === STONE_COLOR.BLACK ? '#1c1c1c' : '#f4efe4',
          strokeStyle: spot.color === STONE_COLOR.BLACK ? '#050505' : '#c8b89a',
          lineWidth: 1,
        },
      });

      const stone = {
        id,
        color: spot.color,
        fallen: false,
        body,
      };

      body.plugin = { kind: 'stone', stoneId: stone.id, color: stone.color };
      Sleeping.set(body, true);
      stones.push(stone);
    }

    this.stones = stones;
    nextStoneId = (used.size ? Math.max(...used) : 0) + 1;
    Composite.add(this.world, stones.map((s) => s.body));
  }

  _clearFallTimers() {
    for (const timer of this._fallTimers) clearTimeout(timer);
    this._fallTimers = [];
  }

  _clearStones() {
    this._clearFallTimers();
    for (const stone of this.stones) {
      Composite.remove(this.world, stone.body);
    }
    this.stones = [];
  }

  _normalizeCustomLayout(count, raw) {
    if (!Array.isArray(raw) || raw.length !== count * 2) return [];
    return raw.map((spot) => ({
      x: Number(spot.x),
      y: Number(spot.y),
      color: spot.color === STONE_COLOR.WHITE ? STONE_COLOR.WHITE : STONE_COLOR.BLACK,
    }));
  }

  _findStoneByBody(body) {
    const id = body?.plugin?.stoneId;
    if (id == null) return null;
    return this.stones.find((s) => s.id === id) ?? null;
  }

  // --- slingshot input ------------------------------------------------------

  _onTouchGuard(event) {
    event.preventDefault();
  }

  _vibrate(ms) {
    const haptic = this._haptic
      ?? (typeof navigator !== 'undefined' ? navigator.vibrate?.bind(navigator) : null);
    try {
      haptic?.(ms);
    } catch {
      /* ignore unsupported devices */
    }
  }

  _pulseChargeHaptic(power) {
    if (!this.aim) return;
    const stage = powerChargeStage(power);
    if (stage <= (this.aim.hapticStage ?? 0)) return;
    this.aim.hapticStage = stage;
    this._vibrate(TOUCH_FEEL.STAGE_HAPTIC_MS);
    this.emit('powerStage', { stage, power, ms: TOUCH_FEEL.STAGE_HAPTIC_MS });
  }

  _onPointerDown(event) {
    if (this.placementOnly) {
      if (this.phase === PHASE.SPECTATING || this.phase === PHASE.GAME_OVER) return;
      event.preventDefault();
      this.soundEngine?.unlock?.();
      const stone = this._pickPlacementStoneAt(this._clientToVirtual(event));
      if (!stone) return;
      this._pointerId = event.pointerId;
      this.element?.setPointerCapture?.(event.pointerId);
      this._beginPlacement(stone);
      return;
    }
    if (this.phase !== PHASE.IDLE) return;
    if (this.isHumanInputBlocked()) return;
    event.preventDefault();

    this.soundEngine?.unlock?.();

    const point = this._clientToVirtual(event);
    const stone = this._pickOwnStoneAt(point);
    if (!stone) return;

    this._pointerId = event.pointerId;
    this.element?.setPointerCapture?.(event.pointerId);

    Sleeping.set(stone.body, false);
    this.aim = { stone, pointer: point, hapticStage: 0 };
    this.phase = PHASE.AIMING;
    this._pulseChargeHaptic(this.getAimGuide().power);
    this.emit('aimStart', this.getAimGuide());
  }

  _emitPullBlocked(neighbor, message = PULL_BLOCK_NOTICE) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - (this._lastPullBlockAt || 0) < 900) return;
    this._lastPullBlockAt = now;
    this.emit('pullBlocked', {
      message,
      neighborId: neighbor?.id ?? null,
    });
  }

  _onPointerMove(event) {
    if (this.placementOnly && this._place && event.pointerId === this._pointerId) {
      event.preventDefault();
      this._movePlacement(this._clientToVirtual(event));
      return;
    }
    if (this.phase !== PHASE.AIMING || event.pointerId !== this._pointerId) return;
    event.preventDefault();
    const raw = this._clientToVirtual(event);
    const next = emaPoint(this.aim.pointer, raw);
    const others = this.getAliveStones().filter((s) => s.id !== this.aim.stone.id);
    const blocked = resolvePullBlock(this.aim.stone, next, others);
    if (blocked) {
      this._emitPullBlocked(blocked.stone, blocked.message);
      return;
    }
    this.aim.pointer = next;
    const guide = this.getAimGuide();
    this._pulseChargeHaptic(guide.power);
    this.emit('aimUpdate', guide);
  }

  _onPointerUp(event) {
    if (event.pointerId !== this._pointerId) return;
    event.preventDefault();
    this._releasePointer(event);
    if (this.placementOnly) {
      this._endPlacement();
      return;
    }
    this._launchIfAiming();
  }

  _onPointerCancel(event) {
    if (event.pointerId !== this._pointerId) return;
    this._releasePointer(event);
    if (this.placementOnly) {
      this._cancelPlacement();
      return;
    }
    this._cancelAim();
  }

  _releasePointer(event) {
    try {
      this.element?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* already released */
    }
    this._pointerId = null;
  }

  _launchIfAiming() {
    if (this.phase !== PHASE.AIMING || !this.aim) return;

    const { stone, pointer } = this.aim;
    const origin = copyXY(stone.body.position);
    const shot = computeSlingshotLaunch(origin, pointer, { mass: stone.body.mass, powerScale: this.powerScale });

    if (shot.inDeadzone) {
      this._cancelAim();
      return;
    }

    const others = this.getAliveStones().filter((s) => s.id !== stone.id);
    if (resolvePullBlock(stone, pointer, others)) {
      this._cancelAim();
      return;
    }

    const { x: vx, y: vy } = shot.velocity;

    Sleeping.set(stone.body, false);
    Body.setVelocity(stone.body, { x: 0, y: 0 });
    Body.setAngularVelocity(stone.body, 0);
    Body.applyForce(stone.body, stone.body.position, shot.force);
    this._vibrate(TOUCH_FEEL.RELEASE_HAPTIC_MS);

    this.aim = null;
    this.phase = PHASE.RESOLVING;
    this._remoteLaunchStoneId = stone.id;
    this._remoteLaunchTs = Date.now();
    this._shotFromRemote = false;
    this.restFrames = 0;

    this.emit('launch', {
      stoneId: stone.id,
      color: stone.color,
      x: origin.x,
      y: origin.y,
      position: { x: origin.x, y: origin.y },
      velocity: { x: vx, y: vy },
      force: shot.force,
      tension: shot.tension,
      power: shot.power,
    });
  }

  _cancelAim() {
    if (this.aim) {
      const body = this.aim.stone.body;
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
      Sleeping.set(body, true);
    }
    this.aim = null;
    if (this.phase === PHASE.AIMING) {
      this.phase = PHASE.IDLE;
    }
    this.emit('aimCancel', null);
  }

  _pickOwnStoneAt(point) {
    return pickNearestOwnStone(
      this.getAliveStones(this.currentTurn),
      point,
      this.stoneRadius,
    );
  }

  _clientToVirtual(event) {
    if (typeof this.mapPointer === 'function') {
      const mapped = this.mapPointer(event);
      if (mapped && Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
        return mapped;
      }
    }

    const element = this.element;
    if (!element) {
      return { x: event.clientX, y: event.clientY };
    }

    const rect = element.getBoundingClientRect();
    const scale = Math.min(rect.width / this.virtualWidth, rect.height / this.virtualHeight);
    const offsetX = (rect.width - this.virtualWidth * scale) / 2;
    const offsetY = (rect.height - this.virtualHeight * scale) / 2;

    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
  }

  // --- collisions, 낙사, turn settle ----------------------------------------

  _handleCollisionStart(event) {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;

      if (isStoneBody(bodyA) && isStoneBody(bodyB)) {
        this._playClash(bodyA, bodyB, pair);
        const sa = this._findStoneByBody(bodyA);
        const sb = this._findStoneByBody(bodyB);
        if (sa && sb && !sa.fallen && !sb.fallen) {
          this._bondHits.push({
            a: sa,
            b: sb,
            relSpeed: computeRelativeVelocity(
              bodyA.velocity,
              bodyB.velocity,
              pair.collision?.normal ?? null,
            ),
            velA: { x: bodyA.velocity.x, y: bodyA.velocity.y },
            velB: { x: bodyB.velocity.x, y: bodyB.velocity.y },
          });
        }
        continue;
      }

      const stoneBody = isStoneBody(bodyA) ? bodyA : isStoneBody(bodyB) ? bodyB : null;
      const other = stoneBody === bodyA ? bodyB : bodyA;
      if (stoneBody && other?.plugin?.kind === 'fallZone') {
        const stone = this._findStoneByBody(stoneBody);
        if (stone && isOutsideInnerBoard(stone.body.position)) this._fallStone(stone);
      }
    }
  }

  _playClash(bodyA, bodyB, pair) {
    const relativeVelocity = computeRelativeVelocity(
      bodyA.velocity,
      bodyB.velocity,
      pair.collision?.normal ?? null,
    );

    if (relativeVelocity >= CLASH_SOUND_MIN_SPEED) {
      this.soundEngine?.playClashByVelocity?.(relativeVelocity, 'stone');
    }
    this.emit('clash', {
      a: bodyA.plugin.stoneId,
      b: bodyB.plugin.stoneId,
      relativeVelocity,
      x: (bodyA.position.x + bodyB.position.x) / 2,
      y: (bodyA.position.y + bodyB.position.y) / 2,
    });
  }

  _applySameColorBonds() {
    if (this.phase !== PHASE.RESOLVING || this.placementOnly) {
      this._bondHits = [];
      return;
    }
    const plans = planSameColorBondHold(this.getAliveStones(), this._bondHits);
    this._bondHits = [];
    for (const plan of plans) {
      Body.setVelocity(plan.a.body, plan.va);
      Body.setVelocity(plan.b.body, plan.vb);
      if (plan.pos?.pa) Body.setPosition(plan.a.body, plan.pos.pa);
      if (plan.pos?.pb) Body.setPosition(plan.b.body, plan.pos.pb);
    }
  }

  _handleAfterUpdate() {
    this._applySameColorBonds();
    this._tickTurnTimer(capTurnDeltaMs(this.engine.timing?.lastDelta ?? SLINGSHOT.ENGINE_DELTA_MS));
    this._checkFallenStones();

    if (this.phase === PHASE.AIMING && this.aim) {
      const body = this.aim.stone.body;
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    }

    if (this.phase !== PHASE.RESOLVING) return;

    if (this._allStonesAtRest()) {
      this.restFrames += 1;
      if (this.restFrames >= REST.FRAMES_REQUIRED) {
        this._settleTurn();
      }
    } else {
      this.restFrames = 0;
    }
  }

  _checkFallenStones() {
    for (const stone of this.stones) {
      if (stone.fallen) continue;
      if (isOutsideInnerBoard(stone.body.position, this.board.inner)) {
        this._fallStone(stone);
      }
    }
  }

  /** 테스트/리플레이용 고정 스텝. Runner 없이 물리만 진행한다. */
  step(frames = 1, delta = 1000 / 60) {
    for (let i = 0; i < frames; i++) {
      Engine.update(this.engine, delta);
    }
  }

  _fallStone(stone) {
    if (stone.fallen) return;
    stone.fallen = true;
    stone.body.collisionFilter.mask = 0;
    Sleeping.set(stone.body, false);
    const pos = stone.body.position;
    const dx = pos.x - 360;
    const dy = pos.y - 360;
    const len = Math.hypot(dx, dy) || 1;
    const outward = 2.4;
    Body.setVelocity(stone.body, {
      x: stone.body.velocity.x + (dx / len) * outward,
      y: stone.body.velocity.y + (dy / len) * outward,
    });
    this._lastFallAt = Date.now();
    this.emit('stoneFallen', {
      id: stone.id,
      color: stone.color,
      x: stone.body.position.x,
      y: stone.body.position.y,
    });
    setTimeout(() => {
      try {
        Composite.remove(this.world, stone.body);
      } catch (e) {}
    }, 1000);
  }

  _allStonesAtRest() {
    const alive = this.getAliveStones();
    if (alive.length === 0) return true;
    return alive.every((stone) => isBodyAtRest(stone.body));
  }

  _settleTurn() {
    for (const stone of this.getAliveStones()) {
      Body.setVelocity(stone.body, { x: 0, y: 0 });
      Body.setAngularVelocity(stone.body, 0);
      Sleeping.set(stone.body, true);
    }
    this._passTurn();
  }

  _tickTurnTimer(deltaMs) {
    if (this.localTimer === false) return;
    if (this.phase !== PHASE.IDLE && this.phase !== PHASE.AIMING) return;
    this.turnRemainingMs -= deltaMs;
    if (this.turnRemainingMs <= 0) {
      this.turnRemainingMs = 0;
      if (this.timerAuthority !== false) this.expireTurn();
    }
  }

  /**
   * 15초 타임오버: 조준 강제 취소, 발사 없이 상대 턴.
   */
  expireTurn() {
    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.RESOLVING) return;
    const previous = this.currentTurn;
    const pid = this._pointerId;
    this._cancelAim();
    if (pid != null) {
      try {
        this.element?.releasePointerCapture?.(pid);
      } catch {
        /* already released */
      }
      this._pointerId = null;
    }
    this.emit('turnTimeout', { previous });
    this._passTurn();
  }

  _clearResultTimer() {
    if (this._resultTimer) {
      clearTimeout(this._resultTimer);
      this._resultTimer = 0;
    }
  }

  _emitGameOver(payload, { delay = false } = {}) {
    const wait = delay ? resultRevealDelayMs(this._lastFallAt) : 0;
    const send = () => {
      this._resultTimer = 0;
      this.emit('gameOver', payload);
    };
    if (wait <= 0) {
      send();
      return;
    }
    this._clearResultTimer();
    this._resultTimer = setTimeout(send, wait);
  }

  surrender(color = this.currentTurn) {
    if (this.phase === PHASE.GAME_OVER || this.phase === PHASE.SPECTATING) return false;
    this._cancelAim?.();
    this._clearResultTimer();
    this.phase = PHASE.GAME_OVER;
    this.winner = color === STONE_COLOR.BLACK ? STONE_COLOR.WHITE : STONE_COLOR.BLACK;
    const blackLeft = this.getAliveStones(STONE_COLOR.BLACK).length;
    const whiteLeft = this.getAliveStones(STONE_COLOR.WHITE).length;
    this._emitGameOver({
      winner: this.winner,
      reason: 'surrender',
      scores: { black: blackLeft, white: whiteLeft },
    });
    return true;
  }

  _passTurn() {
    const blackLeft = this.getAliveStones(STONE_COLOR.BLACK).length;
    const whiteLeft = this.getAliveStones(STONE_COLOR.WHITE).length;
    if (blackLeft === 0 || whiteLeft === 0) {
      this.phase = PHASE.GAME_OVER;
      if (blackLeft === 0 && whiteLeft === 0) this.winner = 'draw';
      else this.winner = blackLeft > 0 ? STONE_COLOR.BLACK : STONE_COLOR.WHITE;
      this._emitGameOver({ winner: this.winner, scores: { black: blackLeft, white: whiteLeft } }, { delay: true });
      return;
    }
    const previous = this.currentTurn;
    this.currentTurn = previous === STONE_COLOR.BLACK ? STONE_COLOR.WHITE : STONE_COLOR.BLACK;
    this.phase = PHASE.IDLE;
    this._remoteLaunchStoneId = null;
    this._remoteLaunchTs = 0;
    this.restFrames = 0;
    this.turnRemainingMs = TURN.LIMIT_MS;
    const remoteShot = this._shotFromRemote === true;
    this._shotFromRemote = false;
    this.emit('turnEnd', {
      previous,
      nextTurn: this.currentTurn,
      scores: { black: blackLeft, white: whiteLeft },
      remote: remoteShot,
    });
  }
}

export default GameEngine;
