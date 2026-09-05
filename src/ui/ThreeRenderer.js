import * as THREE from 'three';
import { GAME_MODE, POWER_RATIO, STONE_COLOR, STONE_RADIUS, STONE_VISUAL_SCALE, clampPowerScale, isOutsideInnerBoard } from '../physics/GameEngine.js';
import { isActionCamEnabled } from './PlayPrefs.js';
import { ndcBoundsFitBox, ndcBoxToCss, ndcLiftToClearBottom, playfieldNdcBox, PLAYFIELD_HUD, visualShellRect } from './ViewportShell.js';

export { visualShellRect };

export const GUIDE_LINE_KEY = 'dotori_guide_enabled';

/** 액션캠이 꺼져 있거나 이미 한 건이 진행 중이면 클로즈업을 붙이지 않는다. */
export function shouldAttachKillCam(actionCamEnabled, killCamActive) {
  return Boolean(actionCamEnabled) && !killCamActive;
}
export const BOARD_COLOR_KEY = 'dotori_board_color';
export const KAYA_HEX = '#f1bf70';
export const DEEP_GOLD_HEX = '#cc9900';
export const DEEP_KAYA_HEX = '#7a4208';
export const WARM_TONE_HEX = '#e89040';
export const BOARD_COLOR_DEFAULT = KAYA_HEX;
export const SEAT_YAW_MS = 900;

export function seatYawFor(mode, turn) {
  return mode === GAME_MODE.SOLO && turn === STONE_COLOR.WHITE ? Math.PI : 0;
}

/** 좌석 카메라는 고정 축을 돌고, 올림은 축을 옆으로 밀지 않는다. */
export function playSeatPose({
  yaw = 0,
  radius = 640,
  height = 780,
  shiftX = 0,
  lift = 0,
  lookBase = { x: 0, y: 15, z: 10 },
} = {}) {
  const cx = (Number(lookBase?.x) || 0) + (Number(shiftX) || 0);
  const cy = Number(lookBase?.y) || 0;
  const cz = Number(lookBase?.z) || 0;
  const sin = Math.sin(Number(yaw) || 0);
  const cos = Math.cos(Number(yaw) || 0);
  const r = Number(radius) || 0;
  const liftY = Number(lift) || 0;
  return {
    pivot: { x: cx, y: cy, z: cz },
    cam: {
      x: cx + sin * r,
      y: Number(height) || 0,
      z: cz + cos * r,
    },
    look: {
      x: cx,
      y: cy + liftY,
      z: cz,
    },
  };
}
export const BOARD_MESH_SIZE = 480;
export const BOARD_WORLD_INSET = 68;

export const KILL_CAM = Object.freeze({
  RUSH_IN_S: 0,
  SLOW_MO_S: 1.5,
  RUSH_OUT_S: 0,
  CLOSE_BACK: 132,
  CLOSE_UP: 44,
  CLOSE_SIDE: 28,
  DROP_DEPTH: 155,
  BASE_FOV: 38,
  CLOSE_FOV: 34,
  MIN_CAM_Y: 92,
  MIN_LOOK_Y: -80,
  MIN_SEPARATION: 96,
  MAX_FOCUS_XZ: 480,
  BOARD_LOOK_Y: 56,
  BOARD_HALF: BOARD_MESH_SIZE / 2,
  FRAME_HALF: BOARD_MESH_SIZE / 2 + 18,
  LOOK_OUT: 20,
  CAM_GAP: 72,
  LOOK_AHEAD: 120,
  CAM_OUT: 132,
  OUT_CLEAR: 72,
  FLY_Y: 360,
  SLAB_TOP: 98,
});

export function isValidKillCamFocus(p) {
  return Boolean(
    p
    && Number.isFinite(p.x)
    && Number.isFinite(p.y)
    && Number.isFinite(p.z),
  );
}

export function clampKillCamAxis(v, fallback, min, max) {
  const n = Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}

export function isKillCamOverBoard(p, pad = 0) {
  if (!isValidKillCamFocus(p)) return true;
  const half = KILL_CAM.FRAME_HALF + pad;
  return Math.abs(p.x) <= half && Math.abs(p.z) <= half;
}

export function isKillCamInsideBoard(p) {
  if (!isValidKillCamFocus(p)) return true;
  return isKillCamOverBoard(p, 8) && p.y < KILL_CAM.FLY_Y;
}

export function isKillCamAimingAtVoid(cam, look) {
  if (!isValidKillCamFocus(cam) || !isValidKillCamFocus(look)) return true;
  return Math.hypot(look.x, look.z) > Math.hypot(cam.x, cam.z) + 8;
}

export function killCamExitAxis(stone) {
  const x = Number.isFinite(stone?.x) ? stone.x : 0;
  const z = Number.isFinite(stone?.z) ? stone.z : 0;
  if (Math.abs(x) >= Math.abs(z)) return { nx: Math.sign(x || 1), nz: 0, side: z };
  return { nx: 0, nz: Math.sign(z || 1), side: x };
}

export function killCamSubject(stone) {
  const { nx, nz } = killCamExitAxis(stone);
  const rim = KILL_CAM.BOARD_HALF + KILL_CAM.LOOK_OUT;
  let x = Number.isFinite(stone?.x) ? stone.x : 0;
  let z = Number.isFinite(stone?.z) ? stone.z : 0;
  if (nx !== 0) {
    x = nx * Math.max(Math.abs(x), rim);
    z = clampKillCamAxis(z, 0, -88, 88);
  } else {
    z = nz * Math.max(Math.abs(z), rim);
    x = clampKillCamAxis(x, 0, -88, 88);
  }
  return {
    x: clampKillCamAxis(x, 0, -KILL_CAM.MAX_FOCUS_XZ, KILL_CAM.MAX_FOCUS_XZ),
    y: clampKillCamAxis(stone?.y, KILL_CAM.BOARD_LOOK_Y, KILL_CAM.MIN_LOOK_Y, 90),
    z: clampKillCamAxis(z, 0, -KILL_CAM.MAX_FOCUS_XZ, KILL_CAM.MAX_FOCUS_XZ),
  };
}

export function emergencyKillCamShot(stone) {
  const look = killCamSubject(stone);
  const { nx, nz } = killCamExitAxis(look);
  const px = -nz;
  const pz = nx;
  let cam = {
    x: look.x + nx * KILL_CAM.CLOSE_BACK + px * KILL_CAM.CLOSE_SIDE,
    y: Math.max(KILL_CAM.MIN_CAM_Y, look.y + KILL_CAM.CLOSE_UP),
    z: look.z + nz * KILL_CAM.CLOSE_BACK + pz * KILL_CAM.CLOSE_SIDE,
  };
  if (isKillCamOverBoard(cam, 0)) {
    cam = {
      x: nx * (KILL_CAM.FRAME_HALF + KILL_CAM.CAM_GAP) + px * KILL_CAM.CLOSE_SIDE,
      y: KILL_CAM.MIN_CAM_Y,
      z: nz * (KILL_CAM.FRAME_HALF + KILL_CAM.CAM_GAP) + pz * KILL_CAM.CLOSE_SIDE,
    };
  }
  return stabilizeKillCam({ cam, look });
}

export function pushCamOutsideBoard(cam) {
  return emergencyKillCamShot(cam).cam;
}

export function boardKillCamFocus(stone) {
  return killCamSubject(stone);
}

export function rescueKillCam(shot) {
  const seed = isValidKillCamFocus(shot?.look) ? shot.look : shot?.cam;
  const next = emergencyKillCamShot(seed);
  if (isKillCamOverBoard(next.cam) || isKillCamAimingAtVoid(next.cam, next.look)) {
    return emergencyKillCamShot({ x: 0, y: KILL_CAM.BOARD_LOOK_Y, z: KILL_CAM.BOARD_HALF });
  }
  return next;
}

export function killCamFlyPoint(from, to) {
  return emergencyKillCamShot(to || from).cam;
}

export function stabilizeKillCam(shot) {
  const lim = KILL_CAM.MAX_FOCUS_XZ + KILL_CAM.CLOSE_BACK + 80;
  const cam = {
    x: clampKillCamAxis(shot?.cam?.x, 0, -lim, lim),
    y: Number.isFinite(shot?.cam?.y) ? shot.cam.y : KILL_CAM.MIN_CAM_Y,
    z: clampKillCamAxis(shot?.cam?.z, 220, -lim, lim),
  };
  const look = {
    x: clampKillCamAxis(shot?.look?.x, 0, -KILL_CAM.MAX_FOCUS_XZ, KILL_CAM.MAX_FOCUS_XZ),
    y: Number.isFinite(shot?.look?.y) ? shot.look.y : KILL_CAM.BOARD_LOOK_Y,
    z: clampKillCamAxis(shot?.look?.z, 0, -KILL_CAM.MAX_FOCUS_XZ, KILL_CAM.MAX_FOCUS_XZ),
  };
  cam.y = Math.max(KILL_CAM.MIN_CAM_Y, cam.y);
  look.y = Math.max(KILL_CAM.MIN_LOOK_Y, look.y);
  let dx = cam.x - look.x;
  let dy = cam.y - look.y;
  let dz = cam.z - look.z;
  let d = Math.hypot(dx, dy, dz);
  if (d < KILL_CAM.MIN_SEPARATION) {
    if (d < 1e-4) {
      dx = 0;
      dy = 1;
      dz = 1;
      d = Math.hypot(dx, dy, dz);
    }
    const s = KILL_CAM.MIN_SEPARATION / d;
    cam.x = look.x + dx * s;
    cam.y = Math.max(KILL_CAM.MIN_CAM_Y, look.y + dy * s);
    cam.z = look.z + dz * s;
  }
  return { cam, look };
}

export function nextFallRim(subject, taken = []) {
  const base = killCamSubject(subject);
  const { nx, nz } = killCamExitAxis(base);
  const px = -nz;
  const pz = nx;
  for (let i = 0; i < 9; i += 1) {
    const slot = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
    const next = {
      ...base,
      x: base.x + px * slot * 40,
      z: base.z + pz * slot * 40,
    };
    if (!(taken || []).some((t) => Math.hypot((t?.x ?? 0) - next.x, (t?.z ?? 0) - next.z) < 36)) {
      return next;
    }
  }
  return base;
}

export function followKillCamLookY(locked, subjectY) {
  const cam = locked?.cam && isValidKillCamFocus(locked.cam)
    ? { x: locked.cam.x, y: locked.cam.y, z: locked.cam.z }
    : emergencyKillCamShot({ x: 0, z: KILL_CAM.BOARD_HALF }).cam;
  const lookX = Number.isFinite(locked?.look?.x) ? locked.look.x : cam.x;
  const lookZ = Number.isFinite(locked?.look?.z) ? locked.look.z : cam.z;
  return {
    cam,
    look: {
      x: lookX,
      y: clampKillCamAxis(subjectY, locked?.look?.y ?? KILL_CAM.BOARD_LOOK_Y, KILL_CAM.MIN_LOOK_Y, 90),
      z: lookZ,
    },
  };
}

export function killCamCloseUp(stone) {
  return rescueKillCam(emergencyKillCamShot(stone));
}

export function killCamFallDrop(t, duration = KILL_CAM.SLOW_MO_S, depth = KILL_CAM.DROP_DEPTH) {
  const u = Math.max(0, Math.min(1, Number(t) / duration));
  return u * u * u * depth;
}

// 1. 바둑판 크기 및 입체 두께 정의
const BOARD_SIZE = BOARD_MESH_SIZE;
const BOARD_THICKNESS = 70;   // 70px의 묵직한 통원목 두께
const STONE_Y = BOARD_THICKNESS + 8; // 판 윗면에 완벽 안착
const SIDE_WOOD = 0x241208;   // 짙은 다크 에보니 월넛 (상판과의 명암 대비 극대화)

export function matterToBoardFace(x, y, worldW = 720, worldH = 720) {
  const usable = BOARD_MESH_SIZE - BOARD_WORLD_INSET;
  return {
    u: ((x - worldW / 2) * (usable / worldW) + BOARD_MESH_SIZE / 2) / BOARD_MESH_SIZE,
    v: ((y - worldH / 2) * (usable / worldH) + BOARD_MESH_SIZE / 2) / BOARD_MESH_SIZE,
  };
}

export function boardFaceToMatter(u, v, worldW = 720, worldH = 720) {
  const usable = BOARD_MESH_SIZE - BOARD_WORLD_INSET;
  return {
    x: worldW / 2 + (u * BOARD_MESH_SIZE - BOARD_MESH_SIZE / 2) * (worldW / usable),
    y: worldH / 2 + (v * BOARD_MESH_SIZE - BOARD_MESH_SIZE / 2) * (worldH / usable),
  };
}

function parseHexRgb(hex) {
  const n = String(hex).replace('#', '');
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    hue2rgb(p, q, h + 1 / 3) * 255,
    hue2rgb(p, q, h) * 255,
    hue2rgb(p, q, h - 1 / 3) * 255,
  ];
}

export function shiftBoardHex(hexColor, hueShift = 0, brightRatio = 100) {
  try {
    let ratio = Number(brightRatio);
    if (!Number.isFinite(ratio)) ratio = 100;
    if (Math.abs(ratio) <= 2) ratio *= 100;
    const t = Math.max(-1, Math.min(1, Number(hueShift) / 40 || 0));
    let [r, g, b] = parseHexRgb(hexColor);
    if (t < 0) {
      const gold = parseHexRgb(DEEP_GOLD_HEX);
      const kaya = parseHexRgb(DEEP_KAYA_HEX);
      const k = -t;
      if (k < 0.55) {
        const u = k / 0.55;
        r += (gold[0] - r) * u;
        g += (gold[1] - g) * u;
        b += (gold[2] - b) * u;
      } else {
        const u = (k - 0.55) / 0.45;
        r = gold[0] + (kaya[0] - gold[0]) * u;
        g = gold[1] + (kaya[1] - gold[1]) * u;
        b = gold[2] + (kaya[2] - gold[2]) * u;
      }
      const hsl = rgbToHsl(r, g, b);
      hsl.h += k * (0.108 - hsl.h) * 0.35;
      hsl.s = Math.min(0.92, Math.max(0.55, hsl.s + k * 0.06));
      hsl.l = Math.max(0.26, hsl.l);
      [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
    } else if (t > 0) {
      const warm = parseHexRgb(WARM_TONE_HEX);
      r += (warm[0] - r) * t;
      g += (warm[1] - g) * t;
      b += (warm[2] - b) * t;
    }
    const hsl = rgbToHsl(r, g, b);
    hsl.l = Math.min(1, Math.max(0, hsl.l * (ratio / 100)));
    [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
    return rgbToHex(r, g, b);
  } catch {
    return hexColor;
  }
}

export function boardTonePalette(hex) {
  const [r, g, b] = parseHexRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  const light = hsl.l >= 0.42;
  const ochreFamily = hsl.h >= 0.04 && hsl.h <= 0.18;
  const inkDark = light || (ochreFamily && hsl.l >= 0.22);
  const grainBoost = Math.max(0, 0.62 - hsl.l);
  const hi = rgbToHex(...hslToRgb(hsl.h, Math.min(1, hsl.s + 0.04), Math.min(1, hsl.l + 0.08)));
  const lo = rgbToHex(...hslToRgb(hsl.h, hsl.s, Math.max(0, hsl.l - 0.1)));
  const grainA = inkDark ? (0.14 + grainBoost * 0.28) : (0.1 + grainBoost * 0.18);
  return {
    fill: rgbToHex(r, g, b),
    hi,
    lo,
    l: hsl.l,
    inkDark,
    grainCount: Math.round(80 + grainBoost * 130),
    grainWidth: 1.8 + grainBoost * 1.8,
    grain: inkDark ? `rgba(70, 40, 18, ${grainA.toFixed(3)})` : `rgba(255, 220, 150, ${Math.min(0.22, 0.08 + grainBoost * 0.2)})`,
    grainDeep: inkDark ? `rgba(48, 24, 8, ${(0.08 + grainBoost * 0.22).toFixed(3)})` : `rgba(255, 230, 170, 0.12)`,
    grainHi: `rgba(255, 214, 120, ${(0.07 + grainBoost * 0.12).toFixed(3)})`,
    sheen: `rgba(255, 224, 150, ${(0.1 + grainBoost * 0.1).toFixed(3)})`,
    roughness: Math.max(0.14, 0.3 - grainBoost * 0.28),
    metalness: 0.06 + grainBoost * 0.05,
    clearcoat: 0.24 + grainBoost * 0.3,
    clearcoatRoughness: Math.max(0.1, 0.24 - grainBoost * 0.1),
    envIntensity: 0.55 + grainBoost * 0.4,
    grid: inkDark ? 'rgba(70, 40, 18, 0.78)' : 'rgba(255, 224, 160, 0.55)',
    rim: inkDark ? 'rgba(44, 27, 20, 0.5)' : 'rgba(255, 209, 59, 0.4)',
    zoneWhite: inkDark ? 'rgba(244, 234, 216, 0.22)' : 'rgba(255, 240, 210, 0.14)',
    zoneBlack: inkDark ? 'rgba(20, 12, 8, 0.22)' : 'rgba(0, 0, 0, 0.32)',
    light,
  };
}

export class ResponsiveViewport {
  constructor({ table, stage, renderer }) {
    this.table = table;
    this.stage = stage;
    this.renderer = renderer;
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', this.onResize);
      vv.addEventListener('scroll', this.onResize);
    }
    this.onResize();
  }

  sync() {
    this.onResize();
  }

  fitShell() {
    const shell = visualShellRect(window.visualViewport, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    document.documentElement.style.setProperty('--app-shell-w', `${shell.width}px`);
    document.documentElement.style.setProperty('--app-shell-h', `${shell.height}px`);
    if (!this.table) return shell;
    this.table.style.position = 'fixed';
    this.table.style.top = `${shell.top}px`;
    this.table.style.left = `${shell.left}px`;
    this.table.style.width = `${shell.width}px`;
    this.table.style.height = `${shell.height}px`;
    this.table.style.right = 'auto';
    this.table.style.bottom = 'auto';
    return shell;
  }

  onResize() {
    const shell = this.fitShell();
    if (!this.stage || !this.renderer) return;
    const w = this.stage.clientWidth || shell.width;
    const h = this.stage.clientHeight || shell.height;
    this.renderer.resize(w, h);
  }
}

export class ThreeRenderer {
  constructor(canvas) {
    this.canvas = canvas || document.getElementById('board');
    this.guideEnabled = true;
    this.actionCamEnabled = isActionCamEnabled();
    this.aimScale = POWER_RATIO.DEFAULT;
    this.boardColor = BOARD_COLOR_DEFAULT;
    this.stonesMap = new Map();
    this.falling = new Map();
    this.fallenDone = new Set();
    this.pops = [];
    this.aimLineMesh = null;
    this.pullLineMesh = null;
    this.aimTargetDot = null;
    this.shakeAmp = 0;
    this.shakeDecay = 16;
    this._lastT = (typeof performance !== 'undefined' ? performance.now() : 0);

    this.worldWidth = 720;
    this.worldHeight = 720;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x140a05);

    const w = this.canvas.clientWidth || 720;
    const h = this.canvas.clientHeight || 1280;

    // 카메라: 판 전체가 상하단 UI 사이 정중앙에 오도록 시선 중심(lookTarget)을 위로(+35) 보정
    this.camera = new THREE.PerspectiveCamera(KILL_CAM.BASE_FOV, w / h, 4, 4000);
    this.camBase = new THREE.Vector3(0, 780, 640);
    this.camRadius = 640;
    this.camHeight = 780;
    this.boardYaw = 0;
    this.boardYawTarget = 0;
    this.yawFrom = 0;
    this.yawTo = 0;
    this.yawT = 1;
    this.lookBase = new THREE.Vector3(0, 15, 10);
    this.lookTarget = this.lookBase.clone();
    this.frameShiftX = 0;
    this.frameLiftZ = 0;
    this.killCam = null;
    this._lastKillCamShot = null;
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookTarget);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const worldScale = (BOARD_SIZE - 68) / this.worldWidth;
    this.stoneGeo = new THREE.SphereGeometry(STONE_RADIUS * worldScale * STONE_VISUAL_SCALE, 32, 18);
    this.stoneGeo.scale(1, 0.46, 1);
    this.blackMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.15,
      metalness: 0.28,
    });
    this.whiteMat = new THREE.MeshStandardMaterial({
      color: 0xfcf9f2,
      roughness: 0.18,
      metalness: 0.1,
    });

    this._initLighting();
    this._createWoodBoard();
    this._createAimGuideLine();
    this._fitQuarterView();
  }

  _posePlayCamera(dist, shiftX, liftZ = this.frameLiftZ || 0) {
    const pitchRad = (52 * Math.PI) / 180;
    this.camHeight = Math.sin(pitchRad) * dist;
    this.camRadius = Math.cos(pitchRad) * dist;
    this.frameShiftX = shiftX;
    this.frameLiftZ = liftZ;
    this._applySeatCamera(true);
  }

  _liftZToPlayfield(sizeBox, liftBox) {
    this.frameLiftZ = 0;
    this._applySeatCamera(true);
    const face0 = this.getBoardNdcBounds();
    const base0 = this.getBoardNdcBounds({ includeBase: true });
    const room = Math.max(0, sizeBox.top - face0.maxY);
    const want = Math.max(
      ndcLiftToClearBottom(base0, liftBox),
      Math.min(0.11, room * 0.28),
    );
    if (want <= 1e-4) return 0;
    this.frameLiftZ = 28;
    this._applySeatCamera(true);
    const base1 = this.getBoardNdcBounds({ includeBase: true });
    this.frameLiftZ = 0;
    const k = (base1.minY - base0.minY) / 28;
    if (Math.abs(k) < 1e-6) return 0;
    let lift = want / k;
    this.frameLiftZ = lift;
    this._applySeatCamera(true);
    const face = this.getBoardNdcBounds();
    if (face.maxY > sizeBox.top) {
      const room = sizeBox.top - face0.maxY;
      const kTop = (face.maxY - face0.maxY) / (lift || 1);
      if (kTop > 1e-6) lift = Math.min(lift, room / kTop);
    }
    this.frameLiftZ = 0;
    return lift;
  }

  _shiftXToPlayfield(box) {
    this._applySeatCamera(true);
    const a = this.getBoardNdcBounds();
    this.frameShiftX = 20;
    this._applySeatCamera(true);
    const b = this.getBoardNdcBounds();
    const k = ((b.minX + b.maxX) / 2 - (a.minX + a.maxX) / 2) / 20;
    this.frameShiftX = 0;
    if (Math.abs(k) < 1e-6) return 0;
    const midA = (a.minX + a.maxX) / 2;
    const midBox = (box.left + box.right) / 2;
    return (midBox - midA) / k;
  }

  _fitQuarterView() {
    const w = this.canvas?.clientWidth || 720;
    const h = this.canvas?.clientHeight || 1280;
    if (w < 8 || h < 8) return;
    const box = playfieldNdcBox({ width: w, height: h });
    const liftBox = playfieldNdcBox({ width: w, height: h }, {
      ...PLAYFIELD_HUD,
      bottomPx: PLAYFIELD_HUD.nameBottomPx,
    });
    let lo = 280;
    let hi = 2800;
    let bestDist = 1600;
    let bestShift = 0;
    this.frameLiftZ = 0;
    for (let i = 0; i < 16; i += 1) {
      const mid = (lo + hi) / 2;
      this._posePlayCamera(mid, 0, 0);
      const shift = this._shiftXToPlayfield(box);
      this._posePlayCamera(mid, shift, 0);
      const bounds = this.getBoardNdcBounds();
      if (ndcBoundsFitBox(bounds, box)) {
        bestDist = mid;
        bestShift = shift;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    this._posePlayCamera(bestDist, bestShift, 0);
    const lift = this._liftZToPlayfield(box, liftBox);
    if (this.killCam) {
      this.frameShiftX = bestShift;
      this.frameLiftZ = lift;
      const pitchRad = (52 * Math.PI) / 180;
      this.camHeight = Math.sin(pitchRad) * bestDist;
      this.camRadius = Math.cos(pitchRad) * bestDist;
      this._applySeatCamera(false);
      return;
    }
    this._posePlayCamera(bestDist, bestShift, lift);
    this.pinPlayfieldChrome();
  }

  pinPlayfieldChrome() {
    const stage = this.canvas?.closest?.('#stage') || (typeof document !== 'undefined'
      ? document.getElementById('stage')
      : null);
    if (!stage) return;
    const w = this.canvas?.clientWidth || stage.clientWidth || 720;
    const h = this.canvas?.clientHeight || stage.clientHeight || 1280;
    if (w < 8 || h < 8) return;
    const face = ndcBoxToCss(this.getBoardNdcBounds(), { width: w, height: h });
    const base = ndcBoxToCss(this.getBoardNdcBounds({ includeBase: true }), { width: w, height: h });
    const set = (name, value) => {
      const next = `${Math.round(value)}px`;
      if (stage.style.getPropertyValue(name) !== next) stage.style.setProperty(name, next);
    };
    set('--board-left', face.left);
    set('--board-right', face.right);
    set('--board-top', face.top);
    set('--board-width', face.width);
    set('--board-cx', face.cx);
    set('--board-cy', face.cy);
    set('--board-bottom', base.bottom);
  }

  _applySeatCamera(applyToCamera = true) {
    const pose = playSeatPose({
      yaw: this.boardYaw,
      radius: this.camRadius || 640,
      height: this.camHeight || 780,
      shiftX: this.frameShiftX || 0,
      lift: this.frameLiftZ || 0,
      lookBase: this.lookBase,
    });
    this.camBase.set(pose.cam.x, pose.cam.y, pose.cam.z);
    this.lookTarget.set(pose.look.x, pose.look.y, pose.look.z);
    if (!applyToCamera) return;
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
  }

  syncSeat(snapshot, dt) {
    if (this.killCam) return;
    const rotating = snapshot?.phase !== 'resolving' && snapshot?.phase !== 'gameOver';
    const target = rotating
      ? seatYawFor(snapshot?.gameMode, snapshot?.currentTurn)
      : this.boardYawTarget;
    if (target !== this.boardYawTarget) {
      this.yawFrom = this.boardYaw;
      this.yawTo = target;
      this.boardYawTarget = target;
      this.yawT = 0;
    }
    if (this.yawT < 1) {
      this.yawT = Math.min(1, this.yawT + dt / (SEAT_YAW_MS / 1000));
      const e = 0.5 - 0.5 * Math.cos(Math.PI * this.yawT);
      this.boardYaw = this.yawFrom + (this.yawTo - this.yawFrom) * e;
    } else {
      this.boardYaw = this.boardYawTarget;
    }
    this._applySeatCamera(!this.killCam);
  }

  _initLighting() {
    // 화사한 온화한 환경광
    const amb = new THREE.AmbientLight(0xffeedb, 1.35);
    this.scene.add(amb);

    // 입체 그림자를 또렷하게 떨어뜨리는 주 광원
    const sun = new THREE.DirectionalLight(0xfff7ea, 1.6);
    sun.position.set(160, 750, 300);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.bias = -0.0003;
    const d = 400;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    // 반대편 측면 음영을 살리는 윤곽 보조광
    const rim = new THREE.DirectionalLight(0xffc878, 0.38);
    rim.position.set(-180, 420, -180);
    this.scene.add(rim);

    const gloss = new THREE.DirectionalLight(0xffe6b0, 0.55);
    gloss.position.set(80, 520, 220);
    this.scene.add(gloss);
  }

  _ensureWoodEnv() {
    if (this._woodEnv) return this._woodEnv;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x2a1810);
    envScene.add(new THREE.HemisphereLight(0xfff1d0, 0x2a1408, 1.5));
    const hot = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe2a0 }),
    );
    hot.position.set(6, 10, 4);
    envScene.add(hot);
    this._woodEnv = pmrem.fromScene(envScene, 0.05).texture;
    pmrem.dispose();
    return this._woodEnv;
  }

  _createWoodMaps(hex = this.boardColor || KAYA_HEX) {
    const size = 1024;
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d');
    const rough = document.createElement('canvas');
    rough.width = size;
    rough.height = size;
    const rctx = rough.getContext('2d');
    const pal = boardTonePalette(hex);
    const grey = Math.round(70 + pal.roughness * 120);

    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, size, size);
    rctx.fillStyle = `rgb(${grey},${grey},${grey})`;
    rctx.fillRect(0, 0, size, size);

    const base = ctx.createLinearGradient(0, 0, 0, size);
    base.addColorStop(0, pal.hi);
    base.addColorStop(0.5, hex);
    base.addColorStop(1, pal.lo);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const sheen = ctx.createLinearGradient(0, 0, size, size);
    sheen.addColorStop(0.3, 'rgba(255,230,160,0)');
    sheen.addColorStop(0.48, pal.sheen);
    sheen.addColorStop(0.66, 'rgba(255,230,160,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);

    const strokeGrain = (target, style, width, count, wobble) => {
      target.strokeStyle = style;
      target.lineWidth = width;
      for (let i = 0; i < count; i++) {
        target.beginPath();
        const y = Math.random() * size;
        target.moveTo(0, y);
        target.bezierCurveTo(
          size * 0.35,
          y + (Math.random() - 0.5) * wobble,
          size * 0.65,
          y + (Math.random() - 0.5) * wobble,
          size,
          y,
        );
        target.stroke();
      }
    };
    strokeGrain(ctx, pal.grain, pal.grainWidth, pal.grainCount, 25);
    strokeGrain(ctx, pal.grainDeep, pal.grainWidth + 1, Math.round(pal.grainCount * 0.16), 40);
    strokeGrain(ctx, pal.grainHi, pal.grainWidth * 0.7, Math.round(pal.grainCount * 0.35), 18);
    strokeGrain(rctx, 'rgba(210,210,210,0.55)', pal.grainWidth, pal.grainCount, 25);
    strokeGrain(rctx, 'rgba(30,30,30,0.35)', pal.grainWidth * 0.7, Math.round(pal.grainCount * 0.3), 18);

    ctx.strokeStyle = pal.inkDark ? '#3e1d08' : pal.grid;
    ctx.lineWidth = 3.8;
    const pad = 68;
    const step = (size - pad * 2) / 8;
    for (let i = 0; i < 9; i++) {
      const pos = pad + i * step;
      ctx.beginPath();
      ctx.moveTo(pad, pos);
      ctx.lineTo(size - pad, pos);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(pos, pad);
      ctx.lineTo(pos, size - pad);
      ctx.stroke();
    }

    ctx.fillStyle = pal.inkDark ? '#3e1d08' : pal.grid;
    const dots = [2, 4, 6];
    dots.forEach((gx) => {
      dots.forEach((gy) => {
        ctx.beginPath();
        ctx.arc(pad + gx * step, pad + gy * step, gx === 4 && gy === 4 ? 8 : 6.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    const roughTex = new THREE.CanvasTexture(rough);
    roughTex.anisotropy = 8;
    roughTex.needsUpdate = true;
    return { map: tex, roughnessMap: roughTex, pal };
  }

  _createWoodBoard() {
    const group = new THREE.Group();

    // 1. 하단 바닥 원형 펠트
    const feltGeo = new THREE.CylinderGeometry(360, 360, 8, 64);
    const feltMat = new THREE.MeshLambertMaterial({ color: 0x162419 });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.y = 4;
    felt.receiveShadow = true;
    group.add(felt);

    // 2. 두꺼운 통원목 바둑판 (상판은 밝은 비자나무 + 4면 옆면은 짙은 월넛)
    const boardGeo = new THREE.BoxGeometry(BOARD_SIZE, BOARD_THICKNESS, BOARD_SIZE);
    
    const maps = this._createWoodMaps();
    this.boardMat = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      roughness: maps.pal.roughness,
      metalness: maps.pal.metalness,
      clearcoat: maps.pal.clearcoat,
      clearcoatRoughness: maps.pal.clearcoatRoughness,
      envMap: this._ensureWoodEnv(),
      envMapIntensity: maps.pal.envIntensity,
    });

    const sideMat = new THREE.MeshStandardMaterial({
      color: SIDE_WOOD,
      roughness: 0.52,
      metalness: 0.06,
    });

    // [+X, -X, +Y, -Y, +Z, -Z] 매핑
    const materials = [
      sideMat,
      sideMat,
      this.boardMat, // 윗면만 격자 상판
      sideMat,
      sideMat,       // 정면 두꺼운 옆면
      sideMat
    ];

    const board = new THREE.Mesh(boardGeo, materials);
    board.position.y = BOARD_THICKNESS / 2;
    board.receiveShadow = true;
    board.castShadow = true;
    group.add(board);
    this.boardTop = board;

    // 3. 하단 테두리 턱
    const frameGeo = new THREE.BoxGeometry(BOARD_SIZE + 36, BOARD_THICKNESS - 12, BOARD_SIZE + 36);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x180c05 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = (BOARD_THICKNESS - 12) / 2;
    frame.receiveShadow = true;
    group.add(frame);

    this.boardMesh = group;
    this.scene.add(group);
  }

  _createAimGuideLine() {
    const aimGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const aimMat = new THREE.LineBasicMaterial({
      color: 0xffcc00,
      linewidth: 4,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.aimLineMesh = new THREE.Line(aimGeo, aimMat);
    this.aimLineMesh.renderOrder = 999;
    this.aimLineMesh.visible = false;
    this.scene.add(this.aimLineMesh);

    const pullGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    ]);
    const pullMat = new THREE.LineBasicMaterial({
      color: 0xff4422,
      linewidth: 4,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    this.pullLineMesh = new THREE.Line(pullGeo, pullMat);
    this.pullLineMesh.renderOrder = 999;
    this.pullLineMesh.visible = false;
    this.scene.add(this.pullLineMesh);

    const ringGeo = new THREE.RingGeometry(6, 9, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    this.aimTargetDot = new THREE.Mesh(ringGeo, ringMat);
    this.aimTargetDot.renderOrder = 999;
    this.aimTargetDot.rotation.x = -Math.PI / 2;
    this.aimTargetDot.visible = false;
    this.scene.add(this.aimTargetDot);
  }

  _matterToThree(x, y) {
    const mx = Number.isFinite(x) ? x : this.worldWidth / 2;
    const my = Number.isFinite(y) ? y : this.worldHeight / 2;
    const scaleX = (BOARD_SIZE - 68) / this.worldWidth;
    const scaleZ = (BOARD_SIZE - 68) / this.worldHeight;
    return {
      x: (mx - this.worldWidth / 2) * scaleX,
      y: STONE_Y,
      z: (my - this.worldHeight / 2) * scaleZ,
    };
  }

  pointerToMatter(event) {
    const rect = this.canvas.getBoundingClientRect();
    const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
    const clientY = event.clientY ?? (event.touches && event.touches[0]?.clientY) ?? 0;

    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -STONE_Y);
    const hit = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, hit);

    if (hit) {
      const scaleX = this.worldWidth / (BOARD_SIZE - 68);
      const scaleZ = this.worldHeight / (BOARD_SIZE - 68);
      return {
        x: hit.x * scaleX + this.worldWidth / 2,
        y: hit.z * scaleZ + this.worldHeight / 2,
      };
    }
    return { x: 0, y: 0 };
  }

  setGuideEnabled(enabled) {
    this.guideEnabled = Boolean(enabled);
    if (!this.guideEnabled) {
      if (this.aimLineMesh) this.aimLineMesh.visible = false;
      if (this.pullLineMesh) this.pullLineMesh.visible = false;
      if (this.aimTargetDot) this.aimTargetDot.visible = false;
    }
  }

  setActionCamEnabled(enabled) {
    this.actionCamEnabled = Boolean(enabled);
    if (!this.actionCamEnabled && this.killCam) {
      this.killCam = null;
      this._lastKillCamShot = null;
      this.camera.near = 4;
      this.camera.fov = KILL_CAM.BASE_FOV;
      this.camera.updateProjectionMatrix();
    }
    return this.actionCamEnabled;
  }

  setAimScale(multiplier) {
    this.aimScale = clampPowerScale(multiplier);
    return this.aimScale;
  }

  getBoardNdcBounds({ includeBase = false } = {}) {
    const half = BOARD_SIZE / 2;
    const ys = includeBase ? [BOARD_THICKNESS, 0] : [BOARD_THICKNESS];
    const corners = [];
    for (const y of ys) {
      corners.push(
        new THREE.Vector3(-half, y, -half),
        new THREE.Vector3(half, y, -half),
        new THREE.Vector3(-half, y, half),
        new THREE.Vector3(half, y, half),
      );
    }
    if (includeBase) {
      corners.push(
        new THREE.Vector3(0, 4, 360),
        new THREE.Vector3(-180, 4, 310),
        new THREE.Vector3(180, 4, 310),
        new THREE.Vector3(0, 0, half + 18),
      );
    }
    let minX = 1;
    let maxX = -1;
    let minY = 1;
    let maxY = -1;
    for (const corner of corners) {
      corner.project(this.camera);
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    const pad = 0.04;
    return {
      contained: minX >= -1 - pad && maxX <= 1 + pad && minY >= -1 - pad && maxY <= 1 + pad,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  setBoardColor(hex) {
    this.boardColor = hex;
    if (!this.boardMat) return;
    const prev = this.boardMat.map;
    const prevRough = this.boardMat.roughnessMap;
    const maps = this._createWoodMaps(hex);
    this.boardMat.map = maps.map;
    this.boardMat.roughnessMap = maps.roughnessMap;
    this.boardMat.color.set(0xffffff);
    this.boardMat.roughness = maps.pal.roughness;
    this.boardMat.metalness = maps.pal.metalness;
    this.boardMat.clearcoat = maps.pal.clearcoat;
    this.boardMat.clearcoatRoughness = maps.pal.clearcoatRoughness;
    this.boardMat.envMap = this._ensureWoodEnv();
    this.boardMat.envMapIntensity = maps.pal.envIntensity;
    this.boardMat.needsUpdate = true;
    prev?.dispose();
    prevRough?.dispose();
  }

  resetFx() {
    for (const pop of this.pops) {
      this.scene.remove(pop.group);
      pop.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.pops.length = 0;
    this.falling.clear();
    this.fallenDone = new Set();
    for (const mesh of this.stonesMap.values()) {
      mesh.rotation.set(0, 0, 0);
    }
    this.killCam = null;
    this._lastKillCamShot = null;
    this.shakeAmp = 0;
    this.camera.fov = KILL_CAM.BASE_FOV;
    this.camera.near = 4;
    this.camera.updateProjectionMatrix();
    this._applySeatCamera(true);
  }

  spawnPop(x, y, intensity = 0.5) {
    const p = this._matterToThree(x, y);
    const i = Math.min(1, Math.max(0.2, intensity));
    const group = new THREE.Group();
    group.position.set(p.x, p.y + 6, p.z);

    const ringGeo = new THREE.RingGeometry(3, 9, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const sparkCount = 8;
    for (let n = 0; n < sparkCount; n++) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(2, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff4cc, transparent: true, opacity: 1 }),
      );
      const a = (n / sparkCount) * Math.PI * 2;
      spark.userData.vx = Math.cos(a) * (9 + i * 16);
      spark.userData.vz = Math.sin(a) * (9 + i * 16);
      spark.userData.vy = 5 + i * 8;
      group.add(spark);
    }

    this.scene.add(group);
    this.pops.push({ group, ring, age: 0, life: 0.42 + i * 0.18 });
  }

  spawnShake(intensity = 0.5) {
    this.shakeAmp = Math.max(this.shakeAmp, 7 + Math.min(1, intensity) * 16);
  }

  spawnFall(id, fallPosition) {
    if (this.falling.has(id) || this.fallenDone.has(id)) return;
    if (fallPosition && !isOutsideInnerBoard(fallPosition)) return;
    const taken = [];
    for (const other of this.falling.values()) {
      if (other?.rim) taken.push(other.rim);
    }
    const mapped = fallPosition
      ? this._matterToThree(fallPosition.x, fallPosition.y)
      : null;
    const meshPos = this.stonesMap.get(id)?.position;
    const raw = isValidKillCamFocus(mapped)
      ? mapped
      : isValidKillCamFocus(meshPos)
        ? { x: meshPos.x, y: meshPos.y, z: meshPos.z }
        : { x: 0, y: STONE_Y, z: KILL_CAM.BOARD_HALF };
    const focus = nextFallRim(raw, taken);
    this.falling.set(id, {
      t: 0,
      duration: KILL_CAM.SLOW_MO_S,
      spin: (Math.random() - 0.5) * 1.2,
      rim: { x: focus.x, z: focus.z },
    });
    if (!shouldAttachKillCam(this.actionCamEnabled, this.killCam)) return;
    const locked = killCamCloseUp({ ...focus, y: STONE_Y });
    this.killCam = {
      t: 0,
      phase: 'hold',
      stoneId: id,
      locked,
      seedFocus: focus,
      lastFocus: { ...focus, y: STONE_Y },
    };
    this.camera.near = 12;
    this.camera.updateProjectionMatrix();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this._fitQuarterView();
  }

  _killCamFocus() {
    const k = this.killCam;
    const id = k?.stoneId;
    const mesh = id != null ? this.stonesMap.get(id) : null;
    const live = mesh
      ? { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }
      : null;
    if (isValidKillCamFocus(live)) {
      k.lastFocus = live;
      return live;
    }
    if (isValidKillCamFocus(k?.lastFocus)) return k.lastFocus;
    if (isValidKillCamFocus(k?.seedFocus)) return k.seedFocus;
    return killCamSubject({ x: 0, y: STONE_Y, z: KILL_CAM.BOARD_HALF });
  }

  _setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.04) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  _updateFx(dt) {
    let camX = this.camBase.x;
    let camY = this.camBase.y;
    let camZ = this.camBase.z;
    const restPose = playSeatPose({
      yaw: this.boardYaw,
      radius: this.camRadius || 640,
      height: this.camHeight || 780,
      shiftX: this.frameShiftX || 0,
      lift: this.frameLiftZ || 0,
      lookBase: this.lookBase,
    });
    const restLook = new THREE.Vector3(restPose.look.x, restPose.look.y, restPose.look.z);
    let look = restLook;
    let fov = KILL_CAM.BASE_FOV;

    if (this.killCam) {
      const k = this.killCam;
      k.t += Number.isFinite(dt) ? Math.min(0.033, dt) : 0.016;
      if (k.t >= KILL_CAM.SLOW_MO_S) {
        this.killCam = null;
        this._lastKillCamShot = null;
        this.camera.near = 4;
        this.camera.updateProjectionMatrix();
      } else {
        const live = this._killCamFocus();
        const locked = k.locked && isValidKillCamFocus(k.locked.cam)
          ? k.locked
          : killCamCloseUp(live);
        k.locked = { cam: locked.cam, look: { ...locked.look, x: locked.look.x, z: locked.look.z } };
        const close = followKillCamLookY(k.locked, live.y);
        camX = close.cam.x;
        camY = close.cam.y;
        camZ = close.cam.z;
        look = new THREE.Vector3(close.look.x, close.look.y, close.look.z);
        fov = KILL_CAM.CLOSE_FOV;
        this._lastKillCamShot = close;
        this.lookTarget.copy(look);
      }
    }

    this._setFov(fov);

    if (this.shakeAmp > 0.08 && !this.killCam) {
      this.shakeAmp *= Math.exp(-this.shakeDecay * dt);
      this.camera.position.set(
        camX + (Math.random() - 0.5) * this.shakeAmp,
        camY + (Math.random() - 0.5) * this.shakeAmp * 0.35,
        camZ + (Math.random() - 0.5) * this.shakeAmp,
      );
    } else {
      this.shakeAmp = this.killCam
        ? this.shakeAmp * Math.exp(-this.shakeDecay * dt)
        : 0;
      this.camera.position.set(camX, camY, camZ);
    }
    this.camera.lookAt(this.lookTarget);

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.age += dt;
      const t = pop.age / pop.life;
      const scale = 1 + t * 3.2;
      pop.ring.scale.set(scale, scale, scale);
      pop.ring.material.opacity = Math.max(0, 0.92 * (1 - t));
      pop.group.children.forEach((child) => {
        if (child === pop.ring || !child.userData.vx) return;
        child.position.x += child.userData.vx * dt;
        child.position.y += child.userData.vy * dt;
        child.position.z += child.userData.vz * dt;
        child.userData.vy -= 28 * dt;
        if (child.material) child.material.opacity = Math.max(0, 1 - t);
      });
      if (t >= 1) {
        this.scene.remove(pop.group);
        pop.group.traverse((child) => {
          if (child.geometry && child !== this.stoneGeo) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.pops.splice(i, 1);
      }
    }
  }

  _ensureStone(id, color) {
    const mat = color === 'white' || color === STONE_COLOR.WHITE ? this.whiteMat : this.blackMat;
    let mesh = this.stonesMap.get(id);
    if (mesh) {
      if (mesh.material !== mat) mesh.material = mat;
      mesh.userData.stoneColor = color === 'white' || color === STONE_COLOR.WHITE ? 'white' : 'black';
      return mesh;
    }
    mesh = new THREE.Mesh(this.stoneGeo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.stoneColor = color === 'white' || color === STONE_COLOR.WHITE ? 'white' : 'black';
    this.scene.add(mesh);
    this.stonesMap.set(id, mesh);
    return mesh;
  }

  draw(snapshot) {
    if (!snapshot) return;
    const now = typeof performance !== 'undefined' ? performance.now() : this._lastT + 16;
    const rawDt = (now - this._lastT) / 1000;
    const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0, rawDt)) || 0.016 : 0.016;
    this._lastT = now;
    this.syncSeat(snapshot, dt);
    if (!this.killCam) this.pinPlayfieldChrome();

    const currentIds = new Set();

    if (snapshot.stones) {
      snapshot.stones.forEach((s) => {
        currentIds.add(s.id);
        if (this.fallenDone.has(s.id)) return;
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
        const mesh = this._ensureStone(s.id, s.color);
        const p = this._matterToThree(s.x, s.y);
        const fullyOff = isOutsideInnerBoard({ x: s.x, y: s.y });
        if (s.fallen && fullyOff) this.spawnFall(s.id, { x: s.x, y: s.y });
        if (this.falling.has(s.id) && fullyOff) {
          const fall = this.falling.get(s.id);
          if (!fall.rim) fall.rim = { x: p.x, z: p.z };
          fall.t += dt;
          const drop = killCamFallDrop(fall.t, fall.duration);
          mesh.position.x = fall.rim.x;
          mesh.position.z = fall.rim.z;
          mesh.position.y = STONE_Y - drop;
          mesh.rotation.x += fall.spin * dt;
          mesh.rotation.z += fall.spin * 0.55 * dt;
          if (s.angle != null) mesh.rotation.y = s.angle + fall.t * 1.15;
          const featured = this.killCam?.stoneId === s.id;
          if (fall.t >= fall.duration + KILL_CAM.RUSH_OUT_S && !featured) {
            this.scene.remove(mesh);
            this.stonesMap.delete(s.id);
            this.falling.delete(s.id);
            this.fallenDone.add(s.id);
          }
        } else if (!this.fallenDone.has(s.id)) {
          mesh.position.set(p.x, p.y, p.z);
          mesh.rotation.x = 0;
          mesh.rotation.z = 0;
          mesh.rotation.y = s.angle != null ? s.angle : 0;
        }
      });
    }

    for (const [id, mesh] of this.stonesMap.entries()) {
      if (!currentIds.has(id) && !this.falling.has(id)) {
        this.scene.remove(mesh);
        this.stonesMap.delete(id);
      }
    }

    const aim = snapshot.aim;
    const pullFrom = aim?.start || aim?.origin;
    const pullTo = aim?.current || aim?.pullEnd;
    if (this.killCam) {
      if (this.pullLineMesh) this.pullLineMesh.visible = false;
      if (this.aimLineMesh) this.aimLineMesh.visible = false;
      if (this.aimTargetDot) this.aimTargetDot.visible = false;
    } else if (this.guideEnabled && aim?.active && pullFrom && pullTo) {
      const pStart = this._matterToThree(pullFrom.x, pullFrom.y);
      const pCurrent = this._matterToThree(pullTo.x, pullTo.y);
      const lineY = STONE_Y + 5;

      if (this.pullLineMesh) {
        const pullPositions = this.pullLineMesh.geometry.attributes.position;
        pullPositions.setXYZ(0, pStart.x, lineY, pStart.z);
        pullPositions.setXYZ(1, pCurrent.x, lineY, pCurrent.z);
        pullPositions.needsUpdate = true;
        this.pullLineMesh.visible = true;
      }

      const dx = pStart.x - pCurrent.x;
      const dz = pStart.z - pCurrent.z;
      const pullDist = Math.hypot(dx, dz);

      if (pullDist > 1) {
        const mapped = aim.aimEnd ? this._matterToThree(aim.aimEnd.x, aim.aimEnd.y) : null;
        const aimEnd = mapped
          ? { x: mapped.x, y: lineY, z: mapped.z }
          : {
            x: pStart.x + (dx / pullDist) * (pullDist * this.aimScale),
            y: lineY,
            z: pStart.z + (dz / pullDist) * (pullDist * this.aimScale),
          };
        const aimPositions = this.aimLineMesh.geometry.attributes.position;
        aimPositions.setXYZ(0, pStart.x, lineY, pStart.z);
        aimPositions.setXYZ(1, aimEnd.x, lineY, aimEnd.z);
        aimPositions.needsUpdate = true;
        this.aimLineMesh.visible = true;

        if (this.aimTargetDot) {
          this.aimTargetDot.position.set(aimEnd.x, lineY + 0.5, aimEnd.z);
          this.aimTargetDot.visible = true;
        }
      } else {
        this.aimLineMesh.visible = false;
        if (this.aimTargetDot) this.aimTargetDot.visible = false;
      }
    } else {
      this.aimLineMesh.visible = false;
      if (this.pullLineMesh) this.pullLineMesh.visible = false;
      if (this.aimTargetDot) this.aimTargetDot.visible = false;
    }

    this._updateFx(dt);
    this.renderer.render(this.scene, this.camera);
  }
}