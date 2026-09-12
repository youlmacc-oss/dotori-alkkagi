/**
 * 대전 중 같은 색이 붙어 있을 때만 쓰는 붙임.
 * 다른 색 충돌·단독 알·조준 당김은 여기로 들어오지 않는다.
 */

export const SAME_COLOR_BOND = Object.freeze({
  SCALE: 1.5,
  CONTACT_SLOP: 6,
  /** 30% 당김으로 단독 알이 나가는 속력. 문턱 = 이 값 × 1.5 */
  BASELINE_SPEED: 360 * 3.8 * 0.025 * 0.3,
});

export function sameColorBondThreshold(scale = SAME_COLOR_BOND.SCALE) {
  return SAME_COLOR_BOND.BASELINE_SPEED * Number(scale);
}

function pointOf(stone) {
  const x = stone?.body?.position?.x ?? stone?.x;
  const y = stone?.body?.position?.y ?? stone?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: stone.id,
    color: stone.color,
    fallen: Boolean(stone.fallen),
    x,
    y,
    radius: stone.radius ?? 24,
    vx: stone.body?.velocity?.x ?? stone.vx ?? 0,
    vy: stone.body?.velocity?.y ?? stone.vy ?? 0,
  };
}

export function stonesInSameColorContact(a, b, slop = SAME_COLOR_BOND.CONTACT_SLOP) {
  const pa = pointOf(a);
  const pb = pointOf(b);
  if (!pa || !pb || pa.fallen || pb.fallen) return false;
  if (pa.id === pb.id || pa.color !== pb.color) return false;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y) <= pa.radius + pb.radius + slop;
}

export function bondAxis(from, to) {
  const a = pointOf(from);
  const b = pointOf(to);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len, len };
}

export function incomingFacingCos(incomingDir, bondOut) {
  if (!incomingDir || !bondOut) return 0;
  const il = Math.hypot(incomingDir.x, incomingDir.y);
  if (il < 1e-6) return 0;
  return Math.max(0, (incomingDir.x / il) * bondOut.x + (incomingDir.y / il) * bondOut.y);
}

export function effectiveBondSpeed(incomingSpeed, cos) {
  return Math.max(0, Number(incomingSpeed) || 0) * Math.max(0, Number(cos) || 0);
}

export function shouldHoldSameColorBond(effectiveSpeed, threshold = sameColorBondThreshold()) {
  return Number(effectiveSpeed) < Number(threshold);
}

export function collectSameColorBonds(stones = []) {
  const live = (Array.isArray(stones) ? stones : []).filter((s) => s && !s.fallen);
  const pairs = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      if (!stonesInSameColorContact(live[i], live[j])) continue;
      pairs.push({ a: live[i], b: live[j] });
    }
  }
  return pairs;
}

function hitInvolves(hit, stone) {
  const id = stone?.id;
  return id != null && (hit?.a?.id === id || hit?.b?.id === id);
}

function otherOf(hit, stone) {
  if (!hit || !stone) return null;
  return hit.a?.id === stone.id ? hit.b : hit.b?.id === stone.id ? hit.a : null;
}

function incomingForBond(pair, hits = []) {
  const axis = bondAxis(pair.a, pair.b);
  const pa = pointOf(pair.a);
  const pb = pointOf(pair.b);
  if (!axis || !pa || !pb) return { speed: 0, cos: 0 };

  let best = { speed: 0, cos: 0, external: false };
  for (const hit of hits) {
    const aHit = hitInvolves(hit, pair.a);
    const bHit = hitInvolves(hit, pair.b);
    if (!aHit && !bHit) continue;
    const speed = Math.max(0, Number(hit.relSpeed) || 0);
    if (aHit && bHit) {
      if (speed > best.speed) best = { speed, cos: 1, external: false };
      continue;
    }
    const hitStone = aHit ? pair.a : pair.b;
    const partner = aHit ? pair.b : pair.a;
    const striker = otherOf(hit, hitStone);
    if (!striker || striker.color === hitStone.color) continue;
    const out = bondAxis(partner, hitStone);
    if (!out) continue;
    const fromA = hit.a?.id === striker.id;
    const sv = fromA
      ? { x: hit.velA?.x ?? 0, y: hit.velA?.y ?? 0 }
      : { x: hit.velB?.x ?? 0, y: hit.velB?.y ?? 0 };
    const cos = incomingFacingCos(sv, { x: -out.x, y: -out.y });
    if (!best.external || speed * cos > best.speed * best.cos) {
      best = { speed, cos, external: true };
    }
  }

  if (best.external) return best;
  const sep = (pb.vx - pa.vx) * axis.x + (pb.vy - pa.vy) * axis.y;
  return { speed: Math.abs(sep), cos: 1, external: false };
}

export function holdVelocities(a, b) {
  const pa = pointOf(a);
  const pb = pointOf(b);
  const axis = bondAxis(a, b);
  if (!pa || !pb || !axis) return null;
  let vax = pa.vx;
  let vay = pa.vy;
  let vbx = pb.vx;
  let vby = pb.vy;
  const sep = (vbx - vax) * axis.x + (vby - vay) * axis.y;
  if (sep > 0) {
    vax += (sep * 0.5) * axis.x;
    vay += (sep * 0.5) * axis.y;
    vbx -= (sep * 0.5) * axis.x;
    vby -= (sep * 0.5) * axis.y;
  }
  const vx = (vax + vbx) * 0.5;
  const vy = (vay + vby) * 0.5;
  return {
    va: { x: vx, y: vy },
    vb: { x: vx, y: vy },
  };
}

export function holdPositions(a, b, slop = SAME_COLOR_BOND.CONTACT_SLOP) {
  const pa = pointOf(a);
  const pb = pointOf(b);
  const axis = bondAxis(a, b);
  if (!pa || !pb || !axis) return null;
  const need = pa.radius + pb.radius;
  const gap = axis.len - need;
  if (gap <= 0.4 || gap > slop + 2) return null;
  const half = gap * 0.5;
  return {
    pa: { x: pa.x + axis.x * half, y: pa.y + axis.y * half },
    pb: { x: pb.x - axis.x * half, y: pb.y - axis.y * half },
  };
}

export function planSameColorBondHold(stones = [], hits = [], threshold = sameColorBondThreshold()) {
  const plans = [];
  for (const pair of collectSameColorBonds(stones)) {
    const incoming = incomingForBond(pair, hits);
    const effective = effectiveBondSpeed(incoming.speed, incoming.cos);
    if (!shouldHoldSameColorBond(effective, threshold)) continue;
    const vel = holdVelocities(pair.a, pair.b);
    if (!vel) continue;
    plans.push({
      a: pair.a,
      b: pair.b,
      va: vel.va,
      vb: vel.vb,
      pos: holdPositions(pair.a, pair.b),
    });
  }
  return plans;
}
