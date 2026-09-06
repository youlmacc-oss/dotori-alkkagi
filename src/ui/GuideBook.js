/**
 * 대기실 가이드북 페이지 — 규칙과 손맛을 한 장씩 보여 준다.
 */

export const BOOK_SEEN_KEY = 'dotori-alkkagi-book-seen';
export const BOOK_SKIP_KEY = 'dotori-alkkagi-book-skip';
export const BOOK_SKIP_LABEL = '다음 접속시에는 이 창을 띄우지 않음';
export const BOOK_PLAY_LABEL = '바로시작';

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

export function hasSkipGuideOnConnect(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(BOOK_SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipGuideOnConnect(on, storage = globalThis.localStorage) {
  const next = Boolean(on);
  try {
    if (next) storage?.setItem?.(BOOK_SKIP_KEY, '1');
    else storage?.removeItem?.(BOOK_SKIP_KEY);
  } catch {
    /* private mode */
  }
  return next;
}

export function shouldAutoOpenGuideBook({ session, local } = {}) {
  if (hasSkipGuideOnConnect(local ?? globalThis.localStorage)) return false;
  if (hasSeenGuideBook(session ?? globalThis.sessionStorage)) return false;
  return true;
}

export const INVITE_ONLY_NOTICE = '도토리 알까기 게임은 초대에 의해서만 게임을 할 수 있습니다. 대전방 개설후 게임상대를 초대하세요';
export const INVITE_ONLY_OK = '확인';
export const INVITE_ONLY_SEEN_KEY = 'dotori-alkkagi-invite-only-seen';

export function hasSeenInviteOnlyNotice(storage = globalThis.sessionStorage) {
  try {
    return storage?.getItem?.(INVITE_ONLY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markInviteOnlyNoticeSeen(storage = globalThis.sessionStorage) {
  try {
    storage?.setItem?.(INVITE_ONLY_SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function shouldOfferInviteOnlyNotice({
  alreadyShown = false,
  inviteJoin = false,
  guidebookClosed = false,
  tutorialEnded = false,
  tutorialSkipped = false,
  guidebookSkippedOnConnect = false,
} = {}) {
  if (alreadyShown || inviteJoin) return false;
  return guidebookClosed === true
    || tutorialEnded === true
    || tutorialSkipped === true
    || guidebookSkippedOnConnect === true;
}

export const GUIDE_PAGES = Object.freeze([
  Object.freeze({
    id: 'cover',
    kicker: '10인 비공개 대기실',
    title: '도토리 알까기',
    visual: 'cover',
    lead: '원목 판 위에서 알을 당기고 튕깁니다.',
    points: ['1인 연습', 'AI 대국', '1:1은 초대 또는 대기실 참가', '바로시작은 대기방 · 다음 접속 숨김 가능', '가이드를 닫거나 튜토리얼을 끝내면 초대만 가능하다는 안내'],
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
    points: ['1인: 흑·백 모두 나', 'AI: 위는 봇, 아래는 나', '1:1: 사람이 들어올 때까지 대기 · 혼자 열어도 AI가 대신 두지 않음', '호스트는 흑, 초대 입장은 백', '다시하기는 같은 방 · 같은 상대'],
  }),
  Object.freeze({
    id: 'ready',
    kicker: '시작 전',
    title: '바둑돌을 다시 놓기',
    visual: 'ready',
    lead: '대전방에 들어오면 5초 동안 재배치를 묻습니다.',
    points: ['예를 누르면 10초 동안 둘째 선 안에서 자기 진영 돌을 옮깁니다', '10부터 1까지 내려가며 셉니다', '아니오·무응답이면 시작 버튼을 기다립니다', '⚙️에서 재배치를 끄면 시작 버튼이 바로 나옵니다'],
  }),
  Object.freeze({
    id: 'acorn',
    kicker: '선공 · 도토리',
    title: '적은 쪽이 먼저',
    visual: 'acorn',
    lead: '시작은 10개. 1:1만 승 +1 / 패 −1, 음수도 됩니다.',
    points: ['도토리가 같으면 아이디 순', '1인·AI·관람은 숫자를 건드리지 않습니다', '창을 닫거나 끊겨도 시작된 1:1은 기권승으로 정산합니다', '같은 탭에서 F5를 눌러도 닉과 도토리는 남습니다'],
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
    lead: '시작된 판에서 나가거나 창을 닫거나 연결이 끊기면 기권입니다.',
    points: ['남은 사람은 승을 정산하고 결과창을 봅니다', '상대를 기다리는 중 나가기는 정산 없음 · 남은 사람은 상대 대기', '호스트가 대기 중 나가면 남은 사람이 자기 방을 엽니다', '다시하기는 같은 방을 유지합니다', '이미 끝난 판에서 대기실은 그냥 복귀', '관람 중 나가기는 도토리에 손대지 않음', '대기실 ✕는 게임 종료'],
  }),
  Object.freeze({
    id: 'room',
    kicker: '대기실',
    title: '방 · 관람 · 위치',
    visual: 'room',
    lead: '정원 10명. 위치 번호는 항상 공개됩니다.',
    points: ['1:1은 대기실에서 참가하기 또는 초대로 입장', '1:1 관람만 가능 · 1인·AI는 관람할 수 없습니다', '누가 1:1을 열면 방에 보이고 초대손님을 기다리는 중이라고 안내합니다', '이미 시작된 방에는 참가할 수 없고 끝난 방은 대국 종료로 보입니다', '대기실이 10명이면 11번째는 접속하지 않습니다', '방장이 대기방 친구를 초대할 수 있음', '받은 초대를 수락하면 호스트 방에 바로 붙습니다', '내 자리는 내닉네임으로 표시', '기본 닉은 접속 중 도토리 최후 번호 다음 · 최대 5글자', '같은 닉은 저장 때 다른 이름으로 바꿉니다', '접속이 5분 끊기면 대기실에서 나갑니다', '대기실에서 닉네임을 바꿀 수 있고 대전·관람 중에는 잠깁니다'],
  }),
  Object.freeze({
    id: 'sound',
    kicker: '설정',
    title: '소리·액션캠·재배치',
    visual: 'sound',
    lead: '⚙️에서 음량·판 색·감도·액션캠·시작 전 재배치를 맞춥니다.',
    points: ['액션캠을 끄면 장외 클로즈업이 없습니다', '재배치를 끄면 시작 버튼이 바로 나옵니다', '대국 중에는 설정을 적용할 수 없습니다', '첫 터치로 소리가 열립니다', '모바일은 세로로 잡는 것이 기준입니다', '다음 접속시 이 창을 숨길 수 있습니다'],
  }),
  Object.freeze({
    id: 'invite',
    kicker: '1:1 초대',
    title: '대기방 친구도 초대',
    visual: 'invite',
    lead: '이 게임은 초대에 의해서만 둘 수 있습니다. 대전방을 연 뒤 상대를 초대하세요.',
    points: ['방장이 친구 초대에서 대기 중인 사람을 고릅니다', '대기실 목록의 참가하기 · 초대하기로 들어갑니다', '카카오톡·다른 앱·링크 복사로도 보냅니다', '받은 쪽은 수락하면 초대한 방에 바로 붙고 호스트 초대 창은 접힙니다', '거절하면 호스트 초대는 지워집니다', '다른 사람을 다시 초대하면 이전 팝업은 닫힙니다', '참가는 한 명만 · 늦은 쪽은 대기실로 돌아갑니다', '이미 시작된 방에는 참가할 수 없습니다', '호스트는 흑, 참가·초대 입장은 백', '10분 안에 시작하지 않으면 대기실로 돌아갑니다'],
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
  if (kind === 'invite') {
    return '<div class="book-visual is-room" aria-hidden="true"><span>초대</span><span>수락</span></div>';
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
    <p class="clinic-lead">물리 · 1:1 입장·초대·기권 · 대기방 · 실시간</p>
    <ul class="clinic-list">${rows}</ul>
  `;
}
