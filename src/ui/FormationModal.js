import {
  AI_DIFFICULTY,
  FORMATION_COUNTS,
  FORMATION_MODE,
  FORMATION_SHAPE,
  FORMATION_SLOT,
  FORMATION_STORAGE_KEY,
  FORMATION_ZONE,
  formationStorageKey,
  GAME_MODE,
  finalizeStartedMode,
  intendedGameMode,
  POWER_RATIO,
  SLINGSHOT,
  STONE_COLOR,
  STONE_RADIUS,
  STONE_VISUAL_SCALE,
  computeSlingshotLaunch,
  estimateLaunchTravel,
  aimGuideVisualScale,
  createPreviewLaunchState,
  createPresetLayout,
  createRandomFormationLayout,
  stepPreviewLaunch,
  clampLayoutToFormationZone,
  clampToFormationZone,
  commitPlayLayout,
  getFormationZones,
  packCampGrid,
  resolveCustomFormationDrop,
  validateFormationLayout,
} from '../physics/GameEngine.js';
import { SETTINGS_APPLY_BLOCK } from './PlayPrefs.js';
import {
  BOARD_COLOR_DEFAULT,
  BOARD_COLOR_KEY,
  BOARD_MESH_SIZE,
  BOARD_WORLD_INSET,
  GUIDE_LINE_KEY,
  applyGuideButtonChrome,
  boardFaceToMatter,
  boardTonePalette,
  matterToBoardFace,
  shiftBoardHex,
} from './ThreeRenderer.js';
import { soundEngine } from '../audio/SoundEngine.js';
import {
  isActionCamEnabled,
  isRearrangeAskEnabled,
  setActionCamEnabled,
  setRearrangeAskEnabled,
} from './PlayPrefs.js';

const SHAPES_BY_COUNT = {
  1: [{ id: FORMATION_SHAPE.LINE, label: '대치' }],
  3: [
    { id: FORMATION_SHAPE.LINE, label: '일자' },
    { id: FORMATION_SHAPE.WEDGE, label: '쐐기' },
    { id: FORMATION_SHAPE.COLUMN, label: '종대' },
  ],
  5: [
    { id: FORMATION_SHAPE.LINE, label: '일자' },
    { id: FORMATION_SHAPE.WEDGE, label: '쐐기' },
    { id: FORMATION_SHAPE.DEFENSE, label: '방어' },
  ],
  7: [
    { id: FORMATION_SHAPE.LINE, label: '일자' },
    { id: FORMATION_SHAPE.WEDGE, label: '쐐기' },
    { id: FORMATION_SHAPE.DEFENSE, label: '방어' },
  ],
  9: [
    { id: FORMATION_SHAPE.LINE, label: '일자' },
    { id: FORMATION_SHAPE.WEDGE, label: '쐐기' },
    { id: FORMATION_SHAPE.DEFENSE, label: '방어' },
  ],
};

export const GAME_MODE_KEY = 'dotori_game_mode';
export const AI_DIFFICULTY_KEY = 'dotori_ai_difficulty';
export const PLAY_FORMATION_KEY = 'dotori-alkkagi:play-formation';

function parseFormationPayload(raw, slot = FORMATION_SLOT.MINE) {
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!FORMATION_COUNTS.includes(data.count) || !Array.isArray(data.positions)) return null;
  if (data.source && data.source !== slot) return null;
  const positions = clampLayoutToFormationZone(data.positions, undefined, FORMATION_ZONE.CUSTOM);
  if (!validateFormationLayout(positions, undefined, FORMATION_ZONE.CUSTOM).ok) return null;
  return { ...data, source: slot, positions };
}

export function loadFormationSlot(slot = FORMATION_SLOT.MINE) {
  try {
    const parsed = parseFormationPayload(localStorage.getItem(formationStorageKey(slot)), slot);
    if (parsed) return parsed;
    if (slot !== FORMATION_SLOT.MINE) return null;
    const legacy = parseFormationPayload(localStorage.getItem(FORMATION_STORAGE_KEY), FORMATION_SLOT.MINE);
    return legacy;
  } catch {
    return null;
  }
}

export function saveFormationSlot(slot, payload) {
  const body = {
    ...payload,
    source: slot,
    positions: payload.positions.map((s) => ({ ...s })),
  };
  localStorage.setItem(formationStorageKey(slot), JSON.stringify(body));
  return body;
}

export function loadMyFormation() {
  return loadFormationSlot(FORMATION_SLOT.MINE);
}

export function saveMyFormation(payload) {
  return saveFormationSlot(FORMATION_SLOT.MINE, payload);
}

function loadMatchConfig() {
  try {
    const rawMode = localStorage.getItem(GAME_MODE_KEY);
    const mode = rawMode === GAME_MODE.PVP
      ? GAME_MODE.PVP
      : rawMode === GAME_MODE.SOLO
        ? GAME_MODE.SOLO
        : GAME_MODE.AI;
    const raw = localStorage.getItem(AI_DIFFICULTY_KEY);
    const difficulty = raw === AI_DIFFICULTY.BEGINNER || raw === AI_DIFFICULTY.EXPERT
      ? raw
      : AI_DIFFICULTY.INTERMEDIATE;
    return { mode, difficulty };
  } catch {
    return { mode: GAME_MODE.AI, difficulty: AI_DIFFICULTY.INTERMEDIATE };
  }
}

function saveMatchConfig(mode, difficulty) {
  try {
    localStorage.setItem(GAME_MODE_KEY, mode);
    localStorage.setItem(AI_DIFFICULTY_KEY, difficulty);
  } catch { /* ignore */ }
}

export function loadPlayFormation() {
  try {
    const raw = localStorage.getItem(PLAY_FORMATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const count = Number(data.count);
    if (!FORMATION_COUNTS.includes(count) || !Array.isArray(data.positions)) return null;
    const positions = commitPlayLayout(count, data.positions, undefined, FORMATION_ZONE.CUSTOM);
    return {
      count,
      mode: data.mode === FORMATION_MODE.PRESET ? FORMATION_MODE.PRESET : FORMATION_MODE.CUSTOM,
      shape: data.shape,
      positions,
    };
  } catch {
    return null;
  }
}

export function savePlayFormation(payload) {
  const body = {
    count: payload.count,
    mode: payload.mode,
    shape: payload.shape,
    positions: (payload.positions ?? []).map((s) => ({ ...s })),
  };
  localStorage.setItem(PLAY_FORMATION_KEY, JSON.stringify(body));
  return body;
}

function loadBoardColorState() {
  try {
    const raw = localStorage.getItem(BOARD_COLOR_KEY);
    if (!raw) return { preset: 'kaya', base: BOARD_COLOR_DEFAULT, hue: 0, bright: 1 };
    const data = JSON.parse(raw);
    const base = (data.base ?? BOARD_COLOR_DEFAULT).toLowerCase() === '#e9c587'
      ? BOARD_COLOR_DEFAULT
      : (data.base ?? BOARD_COLOR_DEFAULT);
    return {
      preset: data.preset ?? 'kaya',
      base,
      hue: Number(data.hue) || 0,
      bright: Number(data.bright) || 1,
    };
  } catch {
    return { preset: 'kaya', base: BOARD_COLOR_DEFAULT, hue: 0, bright: 1 };
  }
}

function saveBoardColorState(state) {
  localStorage.setItem(BOARD_COLOR_KEY, JSON.stringify(state));
}

export class SettingsModal {
  constructor({ root, engine, renderer, onApply, onGuideChange, onPvpPick, shouldBlockApply }) {
    this.root = root;
    this.engine = engine;
    this.renderer = renderer;
    this.onApply = onApply;
    this.onGuideChange = onGuideChange;
    this.onPvpPick = onPvpPick;
    this.shouldBlockApply = shouldBlockApply;
    this.count = engine.formation?.count ?? 5;
    this.mode = FORMATION_MODE.PRESET;
    this.shape = engine.formation?.shape ?? FORMATION_SHAPE.LINE;
    this.draft = createPresetLayout(this.count, this.shape);
    this.drag = null;
    this.color = loadBoardColorState();
    this.committedColor = { ...this.color };
    const match = loadMatchConfig();
    this.gameMode = engine.gameMode ?? match.mode;
    this.aiDifficulty = engine.aiDifficulty ?? match.difficulty;

    this.modal = root.querySelector('#settings-modal');
    this.tonePanel = root.querySelector('#board-tone-panel');
    this.preview = root.querySelector('#formation-preview');
    this.ctx = this.preview.getContext('2d');
    this.shapeRow = root.querySelector('#formation-shapes');
    this.status = root.querySelector('#formation-status');
    this.hue = root.querySelector('#board-hue');
    this.bright = root.querySelector('#board-bright');
    this.settingsGuide = root.querySelector('#settings-guide');
    this.hudGuide = root.querySelector('#guide-btn');

    root.querySelector('#lobby-settings')?.addEventListener('click', () => this.open());
    root.querySelector('#settings-btn')?.addEventListener('click', () => this.open());
    root.querySelector('#settings-close').addEventListener('click', () => this.close(true));
    root.querySelector('#settings-apply').addEventListener('click', () => this.apply());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close(true);
    });
    root.querySelector('.settings-bar')?.addEventListener('click', (event) => event.stopPropagation());
    root.querySelector('.settings-dock')?.addEventListener('click', (event) => event.stopPropagation());
    root.querySelector('#formation-load')?.addEventListener('click', () => this.loadSaved());
    root.querySelector('#formation-save')?.addEventListener('click', () => this.saveMine());
    this.usingMine = false;
    this.testSim = null;
    this.aimPreview = null;
    root.querySelector('#board-color-reset').addEventListener('click', () => this.resetColor());

    for (const chip of root.querySelectorAll('[data-count]')) {
      chip.addEventListener('click', () => this.setCount(Number(chip.dataset.count)));
    }
    for (const tab of root.querySelectorAll('[data-tab]')) {
      tab.addEventListener('click', () => this.setTab(tab.dataset.tab));
    }
    for (const chip of root.querySelectorAll('.color-chip')) {
      chip.addEventListener('click', () => this.setPreset(chip.dataset.preset, chip.dataset.hex));
    }

    this.hue.addEventListener('input', () => {
      this.color.hue = Number(this.hue.value);
      this.previewBoardColor();
    });
    this.bright.addEventListener('input', () => {
      this.color.bright = Number(this.bright.value) / 100;
      this.previewBoardColor();
    });
    this.settingsGuide.addEventListener('click', () => this.toggleGuide());
    this.bindVolumeControls();
    this.bindPlayToggles();

    for (const btn of root.querySelectorAll('[data-mode]')) {
      btn.addEventListener('click', () => {
        if (btn.dataset.mode === 'pvp' || btn.id === 'lobby-mode-pvp') {
          if (this.onPvpPick) {
            this.onPvpPick();
            return;
          }
        }
        this.setGameMode(btn.dataset.mode, { startMatch: Boolean(btn.id?.startsWith('lobby-mode')) });
      });
    }
    for (const btn of root.querySelectorAll('[data-diff]')) {
      btn.addEventListener('click', () => this.setDifficulty(btn.dataset.diff));
    }

    this.preview.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.preview.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.preview.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.preview.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this._onViewport = () => {
      if (!this.modal.hidden) this.pinToStage();
    };
    window.addEventListener('resize', this._onViewport);

    if (this.tonePanel) {
      const stop = (event) => event.stopPropagation();
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'mousedown', 'click']) {
        this.tonePanel.addEventListener(type, stop);
      }
    }

    this.renderer.setBoardColor(this.resolvedColor());
    engine.setMatchConfig({ mode: this.gameMode, difficulty: this.aiDifficulty });
    const play = loadPlayFormation();
    if (play?.count) this.count = play.count;
    this.shape = FORMATION_SHAPE.LINE;
    this.mode = FORMATION_MODE.PRESET;
    this.usingMine = false;
    const started = this.engine.applyDefaultMatchFormation(this.count);
    this.draft = started.layout ?? createPresetLayout(this.count, FORMATION_SHAPE.LINE);
    this.syncChrome();
    this.drawPreview();
  }

  resolvedColor() {
    return shiftBoardHex(this.color.base, this.color.hue, this.color.bright);
  }

  bindVolumeControls() {
    const slider = this.root.querySelector('#settings-volume');
    const mute = this.root.querySelector('#settings-mute');
    const sync = () => {
      if (slider) slider.value = String(Math.round(soundEngine.volume * 100));
      if (mute) {
        mute.classList.toggle('is-on', soundEngine.muted);
        mute.setAttribute('aria-pressed', soundEngine.muted ? 'true' : 'false');
        mute.textContent = soundEngine.muted ? '음소거' : '소리';
      }
    };
    slider?.addEventListener('input', () => {
      soundEngine.setVolume(Number(slider.value) / 100);
      if (soundEngine.muted && Number(slider.value) > 0) soundEngine.setMuted(false);
      sync();
    });
    mute?.addEventListener('click', () => {
      soundEngine.setMuted(!soundEngine.muted);
      sync();
    });
    sync();
  }

  bindPlayToggles() {
    const action = this.root.querySelector('#settings-action-cam');
    const rearrange = this.root.querySelector('#settings-rearrange-ask');
    action?.addEventListener('change', () => this.commitPlayPrefs());
    rearrange?.addEventListener('change', () => this.commitPlayPrefs());
    this.syncPlayToggles();
  }

  syncPlayToggles() {
    const action = this.root.querySelector('#settings-action-cam');
    const rearrange = this.root.querySelector('#settings-rearrange-ask');
    if (action) action.checked = isActionCamEnabled();
    if (rearrange) rearrange.checked = isRearrangeAskEnabled();
  }

  commitPlayPrefs() {
    const action = this.root.querySelector('#settings-action-cam');
    const rearrange = this.root.querySelector('#settings-rearrange-ask');
    if (action) {
      const on = setActionCamEnabled(action.checked);
      this.renderer.setActionCamEnabled(on);
    }
    if (rearrange) setRearrangeAskEnabled(rearrange.checked);
  }

  previewBoardColor() {
    const hex = this.resolvedColor();
    this.renderer.setBoardColor(hex);
    this.syncColorChips();
    const pal = boardTonePalette(hex);
    this.preview.style.borderColor = pal.rim;
    this.drawPreview();
  }

  open() {
    this.draft = this.engine.formation?.layout?.map((s) => ({ ...s }))
      ?? createPresetLayout(this.count, this.shape);
    this.count = this.engine.formation?.count ?? this.count;
    this.shape = this.engine.formation?.shape ?? this.shape;
    this.committedColor = { ...this.color };
    this.modal.hidden = false;
    this.root.classList.add('is-settings');
    if (this.tonePanel) this.tonePanel.hidden = false;
    this.pinToStage();
    this.syncChrome();
    this.previewSync();
    this.previewBoardColor();
    this.setStatus('설정 판에서 진형을 보고, 돌을 당겨 발사 감을 시험하세요');
  }

  sizeSettingsBoard() {
    const stage = this.modal?.querySelector('.settings-lab-stage');
    const wrap = this.modal?.querySelector('.settings-board-wrap');
    if (!stage || !wrap || this.modal.hidden) return;
    const box = stage.getBoundingClientRect();
    const side = Math.max(160, Math.floor(Math.min(box.width, box.height)));
    wrap.style.width = `${side}px`;
    wrap.style.height = `${side}px`;
  }

  pinToStage() {
    const box = this.root.getBoundingClientRect();
    this.modal.style.position = 'fixed';
    this.modal.style.top = `${box.top}px`;
    this.modal.style.left = `${box.left}px`;
    this.modal.style.width = `${box.width}px`;
    this.modal.style.height = `${box.height}px`;
    this.modal.style.right = 'auto';
    this.modal.style.bottom = 'auto';
    this.modal.style.margin = '0';
    this.modal.style.transform = 'none';
    this.sizeSettingsBoard();
    requestAnimationFrame(() => this.sizeSettingsBoard());
  }

  close(revertColor = false) {
    this.drag = null;
    this.modal.hidden = true;
    this.root.classList.remove('is-settings');
    this.modal.style.position = '';
    this.modal.style.top = '';
    this.modal.style.left = '';
    this.modal.style.width = '';
    this.modal.style.height = '';
    this.modal.style.right = '';
    this.modal.style.bottom = '';
    if (revertColor) {
      this.color = { ...this.committedColor };
      this.renderer.setBoardColor(shiftBoardHex(this.color.base, this.color.hue, this.color.bright));
    }
  }

  setTab(tab) {
    this.testSim = null;
    this.aimPreview = null;
    if (tab === 'mine') {
      this.usingMine = true;
      this.mode = FORMATION_MODE.CUSTOM;
      const saved = loadFormationSlot(FORMATION_SLOT.MINE);
      if (saved) {
        this.count = saved.count;
        this.shape = saved.shape ?? FORMATION_SHAPE.LINE;
        this.draft = saved.positions.map((s) => ({ ...s }));
        this.setStatus('내 진형입니다. 첫째 선 안에서 돌을 자유롭게 옮기세요');
      } else {
        this.draft = clampLayoutToFormationZone(this.draft, undefined, FORMATION_ZONE.CUSTOM);
        this.setStatus('내 진형이 없습니다. 돌을 옮긴 뒤 진형 저장을 누르세요');
      }
    } else if (tab === 'custom') {
      this.usingMine = false;
      this.mode = FORMATION_MODE.CUSTOM;
      this.draft = clampLayoutToFormationZone(this.draft, undefined, FORMATION_ZONE.CUSTOM);
      this.setStatus('직접 놓기 · 첫째 선 안에 돌을 자유롭게 두세요');
    } else {
      this.usingMine = false;
      this.mode = FORMATION_MODE.PRESET;
      this.draft = createRandomFormationLayout(this.count);
      this.setStatus('임의 배치했습니다. 프리셋을 다시 누르면 다른 배치가 나옵니다');
    }
    this.syncChrome();
    this.previewSync();
  }

  setCount(count) {
    this.count = FORMATION_COUNTS.includes(count) ? count : 5;
    const shapes = SHAPES_BY_COUNT[this.count];
    if (!shapes.some((s) => s.id === this.shape)) this.shape = shapes[0].id;
    if (this.mode === FORMATION_MODE.PRESET && !this.usingMine) {
      this.draft = createRandomFormationLayout(this.count);
    } else {
      this.draft = clampLayoutToFormationZone(
        createPresetLayout(this.count, this.shape),
        undefined,
        FORMATION_ZONE.CUSTOM,
      );
    }
    this.testSim = null;
    this.aimPreview = null;
    this.syncChrome();
    this.previewSync();
  }

  setShape(shape) {
    this.shape = shape;
    this.mode = FORMATION_MODE.PRESET;
    this.usingMine = false;
    this.draft = clampLayoutToFormationZone(
      createPresetLayout(this.count, shape),
      undefined,
      FORMATION_ZONE.CUSTOM,
    );
    this.testSim = null;
    this.aimPreview = null;
    this.syncChrome();
    this.previewSync();
  }

  previewSync() {
    this.draft = commitPlayLayout(this.count, this.draft, undefined, FORMATION_ZONE.CUSTOM);
    this.drawPreview();
  }

  syncLobbyDefaultMode(mode) {
    if (mode == null) return false;
    if (this.gameMode === GAME_MODE.PVP || this.engine.gameMode === GAME_MODE.PVP) {
      return false;
    }
    const next = intendedGameMode(mode);
    if (this.gameMode === next && this.engine.gameMode === next) {
      this.syncChrome();
      return false;
    }
    this.setGameMode(next, { startMatch: false });
    return true;
  }

  setGameMode(mode, options = {}) {
    const next = intendedGameMode(mode);
    this.gameMode = next;
    saveMatchConfig(next, this.aiDifficulty);
    this.engine.setMatchConfig({ mode: next, difficulty: this.aiDifficulty });
    const kept = finalizeStartedMode(next, this.engine.gameMode);
    if (this.gameMode !== kept || this.engine.gameMode !== kept) {
      this.gameMode = kept;
      saveMatchConfig(kept, this.aiDifficulty);
      this.engine.setMatchConfig({ mode: kept, difficulty: this.aiDifficulty });
    }
    this.renderer.resetFx();
    this.syncChrome();
    this.drawPreview();
    if (options.startMatch) {
      this.shape = FORMATION_SHAPE.LINE;
      this.mode = FORMATION_MODE.PRESET;
      const started = this.engine.applyDefaultMatchFormation(this.count);
      this.draft = started.layout ?? createPresetLayout(this.count, FORMATION_SHAPE.LINE);
      savePlayFormation({
        count: this.count,
        mode: FORMATION_MODE.PRESET,
        shape: FORMATION_SHAPE.LINE,
        positions: this.draft,
      });
      this.onApply?.({ mode: kept, difficulty: this.aiDifficulty, reset: true, toLobby: false });
    }
  }

  setDifficulty(difficulty) {
    if (difficulty !== AI_DIFFICULTY.BEGINNER
      && difficulty !== AI_DIFFICULTY.INTERMEDIATE
      && difficulty !== AI_DIFFICULTY.EXPERT) return;
    this.aiDifficulty = difficulty;
    saveMatchConfig(this.gameMode, this.aiDifficulty);
    this.engine.setMatchConfig({ mode: this.gameMode, difficulty: this.aiDifficulty });
    this.syncChrome();
  }

  setPreset(preset, hex) {
    this.color.preset = preset;
    this.color.base = hex;
    this.previewBoardColor();
  }

  resetColor() {
    this.color = { preset: 'kaya', base: BOARD_COLOR_DEFAULT, hue: 0, bright: 1 };
    this.previewBoardColor();
    this.syncChrome();
  }

  setGuideEnabled(enabled) {
    const next = Boolean(enabled);
    this.renderer.setGuideEnabled(next);
    if (!next) this.aimPreview = null;
    try {
      localStorage.setItem(GUIDE_LINE_KEY, next ? '1' : '0');
    } catch { /* ignore */ }
    this.syncGuideButtons();
    this.drawPreview();
    this.onGuideChange?.(next);
    return next;
  }

  toggleGuide() {
    return this.setGuideEnabled(!this.renderer.guideEnabled);
  }

  isPlacementMode() {
    return this.mode === FORMATION_MODE.CUSTOM;
  }

  placementSlot() {
    if (this.usingMine) return FORMATION_SLOT.MINE;
    if (this.mode === FORMATION_MODE.CUSTOM) return FORMATION_SLOT.CUSTOM;
    return FORMATION_SLOT.PRESET;
  }

  loadSaved() {
    const slot = this.placementSlot();
    const saved = loadFormationSlot(slot);
    if (!saved) {
      this.setStatus(slot === FORMATION_SLOT.MINE
        ? '저장된 내 진형이 없습니다'
        : '이 배치 유형에 저장된 진형이 없습니다');
      return;
    }
    this.testSim = null;
    this.aimPreview = null;
    this.count = saved.count;
    this.shape = saved.shape ?? FORMATION_SHAPE.LINE;
    this.draft = saved.positions.map((s) => ({ ...s }));
    this.syncChrome();
    this.previewSync();
    this.setStatus(slot === FORMATION_SLOT.MINE
      ? '내 진형의 마지막 저장을 불러왔습니다'
      : '이 배치 유형의 마지막 진형을 불러왔습니다');
  }

  zoneKind() {
    return FORMATION_ZONE.CUSTOM;
  }

  saveMine() {
    this.draft = clampLayoutToFormationZone(this.draft, undefined, FORMATION_ZONE.CUSTOM);
    const check = validateFormationLayout(this.draft, undefined, FORMATION_ZONE.CUSTOM);
    if (!check.ok) {
      this.setStatus('배치가 유효하지 않아 저장할 수 없습니다');
      return;
    }
    const slot = this.placementSlot();
    saveFormationSlot(slot, {
      count: this.count,
      shape: this.shape,
      positions: this.draft.map((s) => ({ ...s })),
    });
    this.syncChrome();
    this.previewSync();
    this.setStatus(slot === FORMATION_SLOT.MINE ? '내 진형을 저장했습니다' : '이 배치 유형의 진형을 저장했습니다');
  }

  apply() {
    if (this.shouldBlockApply?.()) {
      this.setStatus(SETTINGS_APPLY_BLOCK);
      return;
    }
    this.shape = FORMATION_SHAPE.LINE;
    this.mode = FORMATION_MODE.PRESET;
    this.usingMine = false;
    const result = this.engine.applyDefaultMatchFormation(this.count);
    if (!result.ok) {
      this.setStatus('적용에 실패했습니다');
      return;
    }
    this.draft = result.layout ?? createPresetLayout(this.count, FORMATION_SHAPE.LINE);
    savePlayFormation({
      count: this.count,
      mode: FORMATION_MODE.PRESET,
      shape: FORMATION_SHAPE.LINE,
      positions: this.draft,
    });
    saveMatchConfig(this.gameMode, this.aiDifficulty);
    this.engine.setMatchConfig({ mode: this.gameMode, difficulty: this.aiDifficulty });
    this.renderer.resetFx();
    this.renderer.setBoardColor(this.resolvedColor());
    this.committedColor = { ...this.color };
    saveBoardColorState(this.color);
    this.commitPlayPrefs();
    this.onApply?.({ ...result, toLobby: true });
    this.close(false);
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  syncGuideButtons() {
    const on = this.renderer.guideEnabled;
    const hint = on ? '조준선 사용중' : '조준선 미사용';
    this.settingsGuide.classList.toggle('is-on', on);
    this.settingsGuide.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.settingsGuide.setAttribute('title', hint);
    this.settingsGuide.textContent = hint;
    applyGuideButtonChrome(this.hudGuide, on);
  }

  syncColorChips() {
    for (const chip of this.root.querySelectorAll('.color-chip')) {
      chip.classList.toggle('is-on', chip.dataset.preset === this.color.preset);
    }
    this.hue.value = String(this.color.hue);
    this.bright.value = String(Math.round(this.color.bright * 100));
  }

  syncChrome() {
    for (const chip of this.root.querySelectorAll('[data-count]')) {
      chip.classList.toggle('is-on', Number(chip.dataset.count) === this.count);
    }
    for (const tab of this.root.querySelectorAll('[data-tab]')) {
      const on = tab.dataset.tab === 'mine'
        ? this.usingMine
        : tab.dataset.tab === 'custom'
          ? this.mode === FORMATION_MODE.CUSTOM && !this.usingMine
          : this.mode === FORMATION_MODE.PRESET && !this.usingMine;
      tab.classList.toggle('is-on', on);
    }
    this.shapeRow.innerHTML = '';
    for (const shape of SHAPES_BY_COUNT[this.count]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `formation-shape${this.shape === shape.id && this.mode === FORMATION_MODE.PRESET ? ' is-on' : ''}`;
      btn.textContent = shape.label;
      btn.addEventListener('click', () => this.setShape(shape.id));
      this.shapeRow.appendChild(btn);
    }
    this.preview.style.touchAction = 'none';
    this.root.querySelector('.settings-dock')?.classList.toggle('is-custom', this.mode === FORMATION_MODE.CUSTOM);
    this.syncColorChips();
    this.syncGuideButtons();
    this.syncPlayToggles();
    this.syncModeChrome();
    this.sizeSettingsBoard();
  }

  syncModeChrome() {
    for (const btn of this.root.querySelectorAll('[data-mode]')) {
      btn.classList.toggle('is-on', btn.dataset.mode === this.gameMode);
    }
    for (const btn of this.root.querySelectorAll('[data-diff]')) {
      btn.classList.toggle('is-on', btn.dataset.diff === this.aiDifficulty);
    }
    const diffRow = this.root.querySelector('#ai-diff-chips');
    if (diffRow) diffRow.hidden = this.gameMode !== GAME_MODE.AI;
  }

  boardMetrics() {
    const size = Math.min(this.preview.width, this.preview.height);
    return {
      pad: 0,
      size,
      scale: size * ((BOARD_MESH_SIZE - BOARD_WORLD_INSET) / 720) / BOARD_MESH_SIZE,
      originX: (this.preview.width - size) / 2,
      originY: (this.preview.height - size) / 2,
    };
  }

  toPreview(x, y) {
    const m = this.boardMetrics();
    const { u, v } = matterToBoardFace(x, y);
    return {
      x: m.originX + u * m.size,
      y: m.originY + v * m.size,
    };
  }

  toBoard(px, py) {
    const m = this.boardMetrics();
    return boardFaceToMatter((px - m.originX) / m.size, (py - m.originY) / m.size);
  }

  hitIndex(px, py) {
    const r = STONE_RADIUS * STONE_VISUAL_SCALE * this.boardMetrics().scale + 8;
    let best = -1;
    let bestD = r;
    for (let i = 0; i < this.draft.length; i++) {
      const p = this.toPreview(this.draft[i].x, this.draft[i].y);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  canvasPoint(event) {
    const rect = this.preview.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.preview.width / rect.width),
      y: (event.clientY - rect.top) * (this.preview.height / rect.height),
    };
  }

  onPointerDown(event) {
    const { x: px, y: py } = this.canvasPoint(event);
    const index = this.hitIndex(px, py);
    if (index < 0) return;
    this.testSim = null;
    this.preview.setPointerCapture(event.pointerId);
    const stone = this.draft[index];
    this.drag = {
      index,
      prev: { x: stone.x, y: stone.y },
      startPx: px,
      startPy: py,
    };
    if (!this.isPlacementMode() && this.renderer.guideEnabled) {
      this.aimPreview = { origin: { ...stone }, pointer: this.toBoard(px, py) };
    } else {
      this.aimPreview = null;
    }
    this.drawPreview();
  }

  onPointerMove(event) {
    if (!this.drag) return;
    const { x: px, y: py } = this.canvasPoint(event);
    const board = this.toBoard(px, py);
    if (this.isPlacementMode()) {
      const stone = this.draft[this.drag.index];
      const clamped = clampToFormationZone(board.x, board.y, stone.color, undefined, FORMATION_ZONE.CUSTOM);
      stone.x = clamped.x;
      stone.y = clamped.y;
      this.aimPreview = null;
    } else if (this.renderer.guideEnabled) {
      this.aimPreview = { origin: { ...this.drag.prev }, pointer: board };
    } else {
      this.aimPreview = null;
    }
    this.drawPreview();
  }

  onPointerUp(event) {
    if (!this.drag) return;
    try {
      this.preview.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    const { x: px, y: py } = this.canvasPoint(event);
    const pointer = this.toBoard(px, py);
    const origin = this.drag.prev;
    const shot = computeSlingshotLaunch(origin, pointer, {
      powerScale: this.engine.powerScale,
    });
    const pullDist = Math.hypot(pointer.x - origin.x, pointer.y - origin.y);

    if (this.isPlacementMode()) {
      const stone = this.draft[this.drag.index];
      const others = this.draft.filter((_, i) => i !== this.drag.index);
      const clamped = clampToFormationZone(pointer.x, pointer.y, stone.color, undefined, FORMATION_ZONE.CUSTOM);
      const drop = resolveCustomFormationDrop(this.drag.prev, { x: clamped.x, y: clamped.y }, stone.color, others);
      stone.x = drop.ok ? drop.x : origin.x;
      stone.y = drop.ok ? drop.y : origin.y;
      if (!drop.ok) this.setStatus(drop.reason === 'overlap' ? '겹침으로 되돌렸습니다' : '첫째 선 안으로 되돌렸습니다');
      else this.setStatus('배치됨 · 첫째 선 안에서 자유롭게 옮기세요');
    } else if (!shot.inDeadzone && pullDist >= SLINGSHOT.PULL_DEADZONE) {
      this.draft[this.drag.index].x = origin.x;
      this.draft[this.drag.index].y = origin.y;
      this.startLaunchTest(this.drag.index, shot.velocity);
      this.setStatus(`발사 테스트 ${this.engine.powerScale.toFixed(1)}x`);
      this.drag = null;
      this.aimPreview = null;
      return;
    }
    this.drag = null;
    this.aimPreview = null;
    this.previewSync();
  }

  startLaunchTest(index, velocity) {
    this.testSim = createPreviewLaunchState(this.draft, index, velocity);
    let last = performance.now();
    const tick = (now) => {
      if (!this.testSim) return;
      const dt = Math.min(32, Math.max(0, now - last));
      last = now;
      const { moving } = stepPreviewLaunch(this.testSim, dt, (vel) => {
        this.engine.soundEngine?.playClashByVelocity?.(vel);
      });
      this.drawPreview();
      if (moving) requestAnimationFrame(tick);
      else {
        this.testSim = null;
        this.drawPreview();
      }
    };
    requestAnimationFrame(tick);
  }

  drawPreview() {
    const ctx = this.ctx;
    const w = this.preview.width;
    const h = this.preview.height;
    const m = this.boardMetrics();
    const zones = getFormationZones(undefined, this.zoneKind());

    const hex = this.resolvedColor();
    const pal = boardTonePalette(hex);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pal.lo;
    ctx.fillRect(0, 0, w, h);
    const wood = ctx.createLinearGradient(m.originX, m.originY, m.originX + m.size, m.originY + m.size);
    wood.addColorStop(0, pal.hi);
    wood.addColorStop(0.46, hex);
    wood.addColorStop(1, pal.lo);
    ctx.fillStyle = wood;
    ctx.fillRect(m.originX, m.originY, m.size, m.size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.originX, m.originY, m.size, m.size);
    ctx.clip();
    const grains = Math.max(12, Math.round((pal.grainCount || 72) * 0.22));
    ctx.strokeStyle = pal.grain;
    ctx.lineWidth = 1.1 + (pal.grainWidth - 2) * 0.35;
    for (let i = 1; i < grains; i++) {
      const gy = m.originY + (m.size * i) / grains;
      ctx.beginPath();
      ctx.moveTo(m.originX, gy);
      ctx.quadraticCurveTo(m.originX + m.size * 0.5, gy + (i % 2 ? 4 : -4), m.originX + m.size, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = pal.grainDeep;
    ctx.lineWidth += 0.6;
    for (let i = 2; i < grains; i += 5) {
      const gy = m.originY + (m.size * i) / grains;
      ctx.beginPath();
      ctx.moveTo(m.originX, gy);
      ctx.quadraticCurveTo(m.originX + m.size * 0.45, gy + 7, m.originX + m.size, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = pal.grainHi;
    ctx.lineWidth = 1;
    for (let i = 3; i < grains; i += 3) {
      const gy = m.originY + (m.size * i) / grains;
      ctx.beginPath();
      ctx.moveTo(m.originX, gy);
      ctx.quadraticCurveTo(m.originX + m.size * 0.55, gy - 3, m.originX + m.size, gy);
      ctx.stroke();
    }
    const gloss = ctx.createLinearGradient(m.originX, m.originY, m.originX + m.size, m.originY + m.size);
    gloss.addColorStop(0.32, 'rgba(255,230,160,0)');
    gloss.addColorStop(0.5, pal.sheen);
    gloss.addColorStop(0.68, 'rgba(255,230,160,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(m.originX, m.originY, m.size, m.size);
    ctx.restore();

    const texPad = m.size * (68 / 1024);
    const step = (m.size - texPad * 2) / 8;
    ctx.strokeStyle = pal.inkDark ? '#3e1d08' : pal.grid;
    ctx.lineWidth = Math.max(1.6, m.size / 200);
    for (let i = 0; i <= 8; i++) {
      const p = m.originX + texPad + i * step;
      ctx.beginPath();
      ctx.moveTo(m.originX + texPad, m.originY + texPad + i * step);
      ctx.lineTo(m.originX + m.size - texPad, m.originY + texPad + i * step);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, m.originY + texPad);
      ctx.lineTo(p, m.originY + m.size - texPad);
      ctx.stroke();
    }
    ctx.fillStyle = pal.inkDark ? '#3e1d08' : pal.grid;
    for (const gx of [2, 4, 6]) {
      for (const gy of [2, 4, 6]) {
        ctx.beginPath();
        ctx.arc(
          m.originX + texPad + gx * step,
          m.originY + texPad + gy * step,
          gx === 4 && gy === 4 ? 3.2 : 2.6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    const paintZone = (band, color) => {
      const a = this.toPreview(zones.minX, band.minY);
      const b = this.toPreview(zones.maxX, band.maxY);
      ctx.fillStyle = color;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    };
    paintZone(zones.white, pal.zoneWhite);
    paintZone(zones.black, pal.zoneBlack);

    if (this.aimPreview && this.renderer.guideEnabled && !this.isPlacementMode()) {
      const a = this.toPreview(this.aimPreview.origin.x, this.aimPreview.origin.y);
      const b = this.toPreview(this.aimPreview.pointer.x, this.aimPreview.pointer.y);
      ctx.strokeStyle = 'rgba(255, 68, 34, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const shot = computeSlingshotLaunch(this.aimPreview.origin, this.aimPreview.pointer, {
        powerScale: this.engine.powerScale,
      });
      const visualScale = aimGuideVisualScale({
        width: this.preview.clientWidth || this.preview.width,
        height: this.preview.clientHeight || this.preview.height,
      });
      const travel = (shot.travel ?? estimateLaunchTravel(shot.velocity)) * visualScale;
      const speed = Math.hypot(shot.velocity.x, shot.velocity.y) || 1;
      const end = this.toPreview(
        this.aimPreview.origin.x + (shot.velocity.x / speed) * travel,
        this.aimPreview.origin.y + (shot.velocity.y / speed) * travel,
      );
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.95)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    const stones = this.testSim || this.draft;
    for (const stone of stones) {
      const p = this.toPreview(stone.x, stone.y);
      const r = STONE_RADIUS * STONE_VISUAL_SCALE * m.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = stone.color === STONE_COLOR.BLACK ? '#141010' : '#f4ead8';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffd13b';
      ctx.stroke();
    }
  }
}

export { SettingsModal as FormationModal };
