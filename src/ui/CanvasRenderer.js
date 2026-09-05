import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../physics/GameEngine.js';

const WALNUT = '#2C1B14';
const KAYA = '#E8C382';
const GOLD = '#FFD13B';
const AMBER = '#C87A38';
const RIM = '#5c3317';
const GRID = 'rgba(92, 51, 23, 0.28)';

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.fading = [];
  }

  spawnPop(x, y, intensity = 0.5) {
    const n = 8 + Math.floor(intensity * 10);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = 1.6 + Math.random() * 3.2 * intensity;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.04 + Math.random() * 0.03,
        size: 2.4 + Math.random() * 2.2,
        color: GOLD,
      });
    }
  }

  spawnFall(x, y, color) {
    this.fading.push({ x, y, life: 1, color, radius: 24 });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * (0.6 + Math.random() * 1.8),
        vy: Math.sin(a) * (0.6 + Math.random() * 1.8) + 1.4,
        life: 1,
        decay: 0.03,
        size: 2 + Math.random() * 2,
        color: AMBER,
      });
    }
  }

  draw(snapshot) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    this._drawTable(ctx);
    this._drawBoard(ctx, snapshot.board);
    this._drawStones(ctx, snapshot.stones);
    this._drawAim(ctx, snapshot.aim);
    this._tickFx(ctx);
  }

  _drawTable(ctx) {
    ctx.fillStyle = WALNUT;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  }

  _drawBoard(ctx, board) {
    const { outer, inner, rim } = board;
    ctx.fillStyle = RIM;
    ctx.fillRect(outer.x, outer.y, outer.size, outer.size);

    ctx.fillStyle = KAYA;
    ctx.fillRect(inner.x, inner.y, inner.size, inner.size);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    const lines = 10;
    const step = inner.size / lines;
    ctx.beginPath();
    for (let i = 1; i < lines; i++) {
      const p = inner.x + step * i;
      ctx.moveTo(p, inner.y);
      ctx.lineTo(p, inner.y + inner.size);
      const q = inner.y + step * i;
      ctx.moveTo(inner.x, q);
      ctx.lineTo(inner.x + inner.size, q);
    }
    ctx.stroke();

    ctx.strokeStyle = AMBER;
    ctx.lineWidth = Math.max(2, rim / 8);
    ctx.strokeRect(inner.x + 1, inner.y + 1, inner.size - 2, inner.size - 2);
  }

  _drawStones(ctx, stones) {
    for (const stone of stones) {
      if (stone.fallen) continue;
      this._stone(ctx, stone.x, stone.y, stone.radius, stone.color, 1, stone.angle);
    }
  }

  _stone(ctx, x, y, r, color, alpha, angle = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    const fill = color === 'black' ? '#16110d' : '#f6efe0';
    const edge = color === 'black' ? '#050302' : '#c8b089';
    const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r);
    grad.addColorStop(0, color === 'black' ? '#3a322c' : '#fffaf0');
    grad.addColorStop(1, fill);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  _drawAim(ctx, aim) {
    if (!aim?.active || aim.deadzone) return;
    const { origin, pullEnd, aimEnd, power, tension = power } = aim;

    ctx.save();
    ctx.strokeStyle = 'rgba(200, 122, 56, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(pullEnd.x, pullEnd.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 12 + power * 18;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2.2 + tension * 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(aimEnd.x, aimEnd.y);
    ctx.stroke();

    this._arrow(ctx, origin, aimEnd, 12 + tension * 10);
    ctx.restore();
  }

  _arrow(ctx, from, to, size) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(ang - 0.45), to.y - size * Math.sin(ang - 0.45));
    ctx.lineTo(to.x - size * Math.cos(ang + 0.45), to.y - size * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  _tickFx(ctx) {
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.life -= 0.045;
      if (f.life <= 0) {
        this.fading.splice(i, 1);
        continue;
      }
      this._stone(ctx, f.x, f.y, f.radius * (1 + (1 - f.life) * 0.35), f.color, f.life);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export function fitStage(stageEl, tableEl) {
  const vw = tableEl.clientWidth;
  const vh = tableEl.clientHeight;
  const scale = Math.min(vw / VIRTUAL_WIDTH, vh / VIRTUAL_HEIGHT);
  stageEl.style.transform = `scale(${scale})`;
}

