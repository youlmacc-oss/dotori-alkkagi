/**
 * AI 턴 연출: 입력 잠금 → 고민(1.0~1.5s) → 조준선 0.5s → 발사.
 */

import { calculateShot, AI_THINK } from './AIBot.js';
import { GAME_MODE, PHASE, STONE_COLOR } from '../physics/GameEngine.js';

function toShotStone(stone) {
  return {
    id: stone.id,
    x: stone.body.position.x,
    y: stone.body.position.y,
    fallen: stone.fallen,
    radius: stone.radius,
  };
}

export class TurnManager {
  /**
   * @param {object} options
   * @param {import('../physics/GameEngine.js').GameEngine} options.engine
   */
  constructor(options = {}) {
    this.engine = options.engine;
    this.rng = options.rng ?? Math.random;
    this.thinkMinMs = options.thinkMinMs ?? AI_THINK.MIN_MS;
    this.thinkMaxMs = options.thinkMaxMs ?? AI_THINK.MAX_MS;
    this.aimMs = options.aimMs ?? AI_THINK.AIM_MS;
    this._token = 0;
    this._timers = [];
    this._unsubs = [];
  }

  attach() {
    this.detach();
    const engine = this.engine;
    this._unsubs.push(engine.on('turnEnd', (payload) => this.onTurnChange(payload?.nextTurn)));
    this._unsubs.push(engine.on('reset', () => this.onReset()));
    this._unsubs.push(engine.on('gameOver', () => this.cancel()));
    this._unsubs.push(engine.on('turnTimeout', () => this.cancel()));
    this.sync();
  }

  detach() {
    this.cancel();
    for (const off of this._unsubs) off();
    this._unsubs = [];
  }

  cancel() {
    this._token += 1;
    for (const id of this._timers) clearTimeout(id);
    this._timers = [];
  }

  onReset() {
    this.cancel();
    this.sync();
  }

  onTurnChange() {
    this.cancel();
    this.sync();
  }

  isAiControlling() {
    const engine = this.engine;
    return engine.gameMode === GAME_MODE.AI
      && engine.currentTurn === STONE_COLOR.WHITE
      && engine.phase !== PHASE.GAME_OVER;
  }

  sync() {
    const engine = this.engine;
    if (engine.isPaused?.()) {
      this.cancel();
      engine.setInputLocked(true);
      return;
    }
    if (engine.phase === PHASE.GAME_OVER || engine.gameMode !== GAME_MODE.AI) {
      this.cancel();
      if (engine.gameMode !== GAME_MODE.PVP || !engine.isPaused?.()) {
        engine.setInputLocked(false);
      }
      return;
    }
    if (this.isAiControlling()) {
      engine.setInputLocked(true);
      if (engine.phase === PHASE.IDLE && !engine.aim) this.schedule();
      return;
    }
    engine.setInputLocked(false);
  }

  schedule() {
    this.cancel();
    const token = this._token;
    const span = Math.max(0, this.thinkMaxMs - this.thinkMinMs);
    const think = this.thinkMinMs + rng01(this.rng) * span;
    this._timers.push(setTimeout(() => this._beginAim(token), think));
  }

  _beginAim(token) {
    if (token !== this._token) return;
    const engine = this.engine;
    if (engine.isPaused?.() || !this.isAiControlling() || engine.phase !== PHASE.IDLE) return;
    const shot = calculateShot(
      engine.getAliveStones(STONE_COLOR.WHITE).map(toShotStone),
      engine.getAliveStones(STONE_COLOR.BLACK).map(toShotStone),
      engine.aiDifficulty,
      { rng: this.rng, board: engine.board },
    );
    if (!shot.ok) return;
    engine.beginAiAim(shot);
    this._timers.push(setTimeout(() => this._fire(token), this.aimMs));
  }

  _fire(token) {
    if (token !== this._token) return;
    if (this.engine.isPaused?.() || !this.isAiControlling()) return;
    this.engine.dispatchAiShot();
  }
}

function rng01(rng) {
  const n = typeof rng === 'function' ? rng() : Math.random();
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export default TurnManager;
