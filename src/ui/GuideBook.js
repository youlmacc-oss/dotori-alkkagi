/**
 * 대기실 가이드북 페이지 — 규칙과 손맛을 한 장씩 보여 준다.
 */

export const BOOK_SEEN_KEY = 'dotori-alkkagi-book-seen';

export function hasSeenGuideBook(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem?.(BOOK_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markGuideBookSeen(storage = globalThis.sessionStorage) {
  try {
    storage?.setItem?.(BOOK_SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

export const GUIDE_PAGES = Object.freeze([
  Object.freeze({
    id: 'cover',
    kicker: '10인 비공개 대기실',
    title: '도토리 알까기',
    visual: 'cover',
    lead: '원목 판 위에서 알을 당기고 튕깁니다.',
    points: ['1인 연습', 'AI 대국', '1:1은 상대가 와야 시작'],
  }),
  Object.freeze({
    id: 'pull',
    kicker: '손맛',
    title: '뒤로 당기고 놓기',
    visual: 'sling',
    lead: '내 알을 잡아 반대 방향으로 당긴 뒤 손을 뗍니다.',
    points: ['바둑돌 위로는 당길 수 없습니다', '가까이 붙은 돌 축은 당길 수 없습니다', 'POWER가 찰수록 더 멀리 날아갑니다', '15초 안에 쏘지 않으면 턴이 넘어갑니다'],
  }),
  Object.freeze({
    id: 'modes',
    kicker: '방 만들기',
    title: '세 가지 대전',
    visual: 'modes',
    lead: '대기실에서 고른 모드가 곧 방입니다.',
    points: ['1인: 흑·백 모두 나', 'AI: 위는 봇, 아래는 나', '1:1: 사람이 들어올 때까지 대기 · AI가 대신 두지 않음'],
  }),
  Object.freeze({
    id: 'ready',
    kicker: '시작 전',
    title: '바둑돌을 다시 놓기',
    visual: 'ready',
    lead: '대전방에 들어오면 5초 동안 재배치를 묻습니다.',
    points: ['예를 누르면 10초 동안 자기 진영 돌을 옮깁니다', '아니오·무응답이면 시작 버튼을 기다립니다', '⚙️에서 재배치를 끄면 시작 버튼이 바로 나옵니다'],
  }),
  Object.freeze({
    id: 'acorn',
    kicker: '선공 · 도토리',
    title: '적은 쪽이 먼저',
    visual: 'acorn',
    lead: '시작은 10개. 1:1만 승 +1 / 패 −1, 음수도 됩니다.',
    points: ['도토리가 같으면 아이디 순', '1인·AI·관람은 숫자를 건드리지 않습니다', '같은 탭에서 F5를 눌러도 닉과 도토리는 남습니다'],
  }),
  Object.freeze({
    id: 'fall',
    kicker: '승패',
    title: '장외가 곧 승부',
    visual: 'fall',
    lead: '한 쪽 돌이 모두 판 밖으로 나가면 끝입니다.',
    points: ['장외 알은 판 밖 액션캠으로 따라갑니다', '⚙️에서 액션캠을 끄면 클로즈업이 없습니다', '마지막 알은 액션캠 뒤 한 박자 쉬고 결과', '기권은 바로 승부가 갈립니다'],
  }),
  Object.freeze({
    id: 'leave',
    kicker: '매너',
    title: '시작된 1:1은 나가면 패',
    visual: 'leave',
    lead: '시작 버튼 이후 대기방·기권은 상대 승리입니다.',
    points: ['상대를 기다리는 중 나가기는 정산 없음', '이미 끝난 판에서 대기실은 그냥 복귀', '관람 중 나가기는 도토리에 손대지 않음'],
  }),
  Object.freeze({
    id: 'room',
    kicker: '대기실',
    title: '방 · 관람 · 위치',
    visual: 'room',
    lead: '정원 10명. 위치 번호는 항상 공개됩니다.',
    points: ['참가하기는 비어 있는 1:1만', '기본 닉은 접속 중 도토리 최후 번호 다음', '같은 닉은 저장 때 다른 이름으로 바꿉니다', '접속이 5분 끊기면 대기실에서 나갑니다', '대기실에서 닉네임을 바꿀 수 있고 대전·관람 중에는 잠깁니다'],
  }),
  Object.freeze({
    id: 'sound',
    kicker: '설정',
    title: '소리·액션캠·재배치',
    visual: 'sound',
    lead: '⚙️에서 음량·판 색·감도·액션캠·시작 전 재배치를 맞춥니다.',
    points: ['액션캠을 끄면 장외 클로즈업이 없습니다', '재배치를 끄면 시작 버튼이 바로 나옵니다', '첫 터치로 소리가 열립니다', '모바일은 세로로 잡는 것이 기준입니다'],
  }),
]);

export function guidePageCount() {
  return GUIDE_PAGES.length;
}

export function guidePageAt(index) {
  const n = GUIDE_PAGES.length;
  if (!n) return null;
  const i = ((Number(index) % n) + n) % n;
  return GUIDE_PAGES[i];
}

export function renderGuideVisual(kind) {
  if (kind === 'sling') {
    return '<div class="book-visual is-sling" aria-hidden="true"><span class="book-stone is-black"></span><span class="book-pull"></span><span class="book-stone is-white"></span></div>';
  }
  if (kind === 'modes') {
    return '<div class="book-visual is-modes" aria-hidden="true"><span>1인</span><span>AI</span><span>1:1</span></div>';
  }
  if (kind === 'acorn') {
    return '<div class="book-visual is-acorn" aria-hidden="true"><span class="book-nut">10</span><span class="book-nut-delta">±1</span></div>';
  }
  if (kind === 'fall') {
    return '<div class="book-visual is-fall" aria-hidden="true"><span class="book-board"></span><span class="book-stone is-falling"></span></div>';
  }
  if (kind === 'leave') {
    return '<div class="book-visual is-leave" aria-hidden="true"><span class="book-flag">패</span></div>';
  }
  if (kind === 'room') {
    return '<div class="book-visual is-room" aria-hidden="true"><span>위치 1</span><span>관람</span></div>';
  }
  if (kind === 'ready') {
    return '<div class="book-visual is-ready" aria-hidden="true"><span>재배치</span><span>시작</span></div>';
  }
  if (kind === 'sound') {
    return '<div class="book-visual is-sound" aria-hidden="true"><span>♪</span></div>';
  }
  return '<div class="book-visual is-cover" aria-hidden="true"><span class="book-stone is-black"></span><span class="book-stone is-white"></span></div>';
}

export function renderGuidePage(page) {
  const next = page || guidePageAt(0);
  const points = (next.points || []).map((line) => `<li>${line}</li>`).join('');
  return `
    <p class="book-kicker">${next.kicker}</p>
    <h3 class="book-heading">${next.title}</h3>
    ${renderGuideVisual(next.visual)}
    <p class="book-lead">${next.lead}</p>
    <ul class="book-points">${points}</ul>
    ${next.id === 'cover' || next.id === 'pull'
      ? '<button type="button" class="book-tutorial-btn" data-tutorial-start>튜토리얼 시작</button>'
      : ''}
  `;
}

export function renderClinicList(report) {
  const rows = (report?.items || []).map((row) => `
    <li class="clinic-row is-${row.status}">
      <span class="clinic-mark" aria-hidden="true">${row.status === 'pass' ? '●' : row.status === 'warn' ? '▲' : '■'}</span>
      <span class="clinic-label">${row.label}</span>
      <span class="clinic-detail">${row.detail}</span>
    </li>
  `).join('');
  return `
    <p class="book-kicker">연동 점검</p>
    <h3 class="book-heading">${report?.summary || '점검'}</h3>
    <p class="clinic-lead">물리 · 액션캠 · 재배치 · 당김 · 정산 · 실시간</p>
    <ul class="clinic-list">${rows}</ul>
  `;
}
