import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_STEPS,
  advanceTutorial,
  createTutorialState,
  isTutorialDone,
  startTutorialState,
  tutorialStep,
} from '../src/ui/Tutorial.js';

describe('가이드북 튜토리얼', () => {
  it('잡기 → 당기기 → 발사 순으로 완료된다', () => {
    let state = startTutorialState();
    expect(tutorialStep(state).id).toBe('pick');
    state = advanceTutorial(state, 'aimStart');
    expect(tutorialStep(state).id).toBe('pull');
    state = advanceTutorial(state, 'aimUpdate');
    expect(tutorialStep(state).id).toBe('release');
    state = advanceTutorial(state, 'launch');
    expect(isTutorialDone(state)).toBe(true);
    expect(tutorialStep(state).coach).toContain('잘하셨');
    state = advanceTutorial(state, 'finish');
    expect(state.active).toBe(false);
  });

  it('바로 발사해도 완료되고, 건너뛰면 꺼진다', () => {
    expect(TUTORIAL_STEPS).toHaveLength(4);
    let state = startTutorialState();
    state = advanceTutorial(state, 'launch');
    expect(isTutorialDone(state)).toBe(true);
    expect(advanceTutorial(startTutorialState(), 'skip').active).toBe(false);
    expect(advanceTutorial(createTutorialState(), 'aimStart').active).toBe(false);
  });
});
