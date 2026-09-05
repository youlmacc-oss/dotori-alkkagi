/**
 * 가이드북 실전 튜토리얼: 잡기 → 당기기 → 발사.
 * 1인 판에서만 돌며 도토리는 건드리지 않는다.
 */

export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'pick',
    title: '1. 알 잡기',
    coach: '아래쪽 검은 알을 손가락으로 누르세요.',
  }),
  Object.freeze({
    id: 'pull',
    title: '2. 당기기',
    coach: '잡은 채로 화면 아래쪽으로 당기세요. 다른 돌 위로는 당기지 않습니다.',
  }),
  Object.freeze({
    id: 'release',
    title: '3. 발사',
    coach: '손을 떼면 알이 날아갑니다.',
  }),
  Object.freeze({
    id: 'done',
    title: '완료',
    coach: '잘하셨습니다. 가이드로 돌아가 1인·AI·1:1을 고르면 됩니다.',
  }),
]);

export function createTutorialState() {
  return { active: false, step: 0 };
}

export function startTutorialState() {
  return { active: true, step: 0 };
}

export function tutorialStep(state) {
  const index = Number(state?.step) || 0;
  return TUTORIAL_STEPS[Math.min(Math.max(0, index), TUTORIAL_STEPS.length - 1)];
}

export function isTutorialDone(state) {
  return Boolean(state?.active && tutorialStep(state).id === 'done');
}

export function advanceTutorial(state, event) {
  if (!state?.active) return state || createTutorialState();
  if (event === 'skip' || event === 'leave' || event === 'finish') {
    return createTutorialState();
  }
  const id = tutorialStep(state).id;
  if (event === 'launch' && id !== 'done') {
    return { active: true, step: TUTORIAL_STEPS.length - 1 };
  }
  if (id === 'pick' && event === 'aimStart') return { active: true, step: 1 };
  if (id === 'pull' && (event === 'aimUpdate' || event === 'powerStage')) {
    return { active: true, step: 2 };
  }
  if (id === 'release' && event === 'launch') {
    return { active: true, step: TUTORIAL_STEPS.length - 1 };
  }
  return state;
}
