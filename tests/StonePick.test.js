import { describe, expect, it } from 'vitest';
import { pickNearestOwnStone, STONE_RADIUS } from '../src/physics/GameEngine.js';

describe('알 집기', () => {
  it('손가락이 알 옆을 눌러도 가장 가까운 알을 집는다', () => {
    const stones = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 200, y: 100 },
    ];
    expect(pickNearestOwnStone(stones, { x: 100, y: 100 })?.id).toBe('a');
    expect(pickNearestOwnStone(stones, { x: 100 + STONE_RADIUS * 1.2, y: 100 })?.id).toBe('a');
    expect(pickNearestOwnStone(stones, { x: 100 + STONE_RADIUS * 2, y: 100 })).toBeNull();
  });
});
