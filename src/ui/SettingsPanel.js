/**
 * 호스트 전용 발사 감도 배율 컨트롤러.
 */

import {
  POWER_RATIO,
  canControlPowerRatio,
  clampPowerScale,
  persistPowerScale,
  readStoredPowerScale,
} from '../physics/GameEngine.js';

function stopBubble(event) {
  event.stopPropagation();
}

export class PowerRatioController {
  constructor({ root, engine, renderer, isHost } = {}) {
    this.root = root;
    this.engine = engine;
    this.renderer = renderer;
    this.panels = [...(root?.querySelectorAll('.power-ratio-panel') ?? [])];

    if (typeof isHost === 'boolean' && engine) engine.isHost = isHost;

    const initial = readStoredPowerScale();
    this.apply(initial, { persist: false });

    for (const panel of this.panels) {
      const slider = panel.querySelector('input[type="range"]');
      const dec = panel.querySelector('[data-power-dec]');
      const inc = panel.querySelector('[data-power-inc]');
      slider?.addEventListener('input', (event) => {
        stopBubble(event);
        this.apply(slider.value);
      });
      dec?.addEventListener('click', (event) => {
        stopBubble(event);
        this.nudge(-POWER_RATIO.STEP);
      });
      inc?.addEventListener('click', (event) => {
        stopBubble(event);
        this.nudge(POWER_RATIO.STEP);
      });
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'click']) {
        panel.addEventListener(type, stopBubble);
      }
    }

    this._unsubs = [];
    if (engine?.on) {
      this._unsubs.push(engine.on('spectatorEnter', () => this.syncVisibility()));
      this._unsubs.push(engine.on('spectatorExit', () => this.syncVisibility()));
      this._unsubs.push(engine.on('hostChange', () => this.syncVisibility()));
    }
    this.syncVisibility();
  }

  nudge(delta) {
    const current = this.engine?.powerScale ?? POWER_RATIO.DEFAULT;
    return this.apply(current + delta);
  }

  apply(raw, { persist = true } = {}) {
    const val = clampPowerScale(raw);
    this.engine?.setPowerScale(val);
    this.renderer?.setAimScale(val);
    for (const panel of this.panels) {
      const slider = panel.querySelector('input[type="range"]');
      const valueEl = panel.querySelector('.power-ratio-value');
      if (slider) slider.value = String(val);
      if (valueEl) valueEl.textContent = `${val.toFixed(1)}x`;
    }
    if (persist) persistPowerScale(val);
    return val;
  }

  syncVisibility() {
    for (const panel of this.panels) {
      if (panel.id === 'settings-power-ratio') continue;
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
    return canControlPowerRatio(this.engine);
  }
}

export { canControlPowerRatio, POWER_RATIO };
