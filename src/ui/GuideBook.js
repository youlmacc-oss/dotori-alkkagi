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

export function shouldOfferInviteOnlyNotice(_reason = {}) {
  return false;
}

export const GUIDE_PAGES = Object.freeze([
  Object.freeze({
    id: 'cover',
    kicker: '대기실',
    title: '도토리 알까기',
    visual: 'cover',
    lead: '원목 판 위에서 알을 당기고 튕깁니다.',
    points: ['1인 연습', 'AI 대국', '시작 전 3·5·7·9알과 일자·쐐기·방어를 고릅니다', '바로시작은 시작 화면 · 다음 접속 숨김 가능'],
  }),
  Object.freeze({
    id: 'pull',
    kicker: '손맛',
    title: '뒤로 당기고 놓기',
    visual: 'sling',
    lead: '내 알을 잡아 반대 방향으로 당긴 뒤 손을 뗍니다.',
    points: ['바둑돌 위로는 당길 수 없습니다', '가까이 붙은 돌 축은 당길 수 없습니다', '같은 색이 붙어 있으면 약한 충격으로는 갈라지지 않습니다', '정면으로 세게 쳐야 붙임이 풀립니다', 'POWER가 찰수록 더 멀리 날아갑니다', '15초 안에 쏘지 않으면 턴이 넘어갑니다'],
  }),
  Object.freeze({
    id: 'modes',
    kicker: '방 만들기',
    title: '두 가지 대전',
    visual: 'modes',
    lead: '대기실에서 고른 모드가 곧 방입니다.',
    points: ['1인: 흑·백 모두 나 · 호스트(흑)가 먼저', 'AI: 위는 봇, 아래는 나', 'AI는 상대 알이 붙거나 5mm 안이면 때리지 않고 판 안으로 달아납니다', '다시하기는 같은 모드로 한 판 더'],
  }),
  Object.freeze({
    id: 'ready',
    kicker: '시작 전',
    title: '바둑돌을 다시 놓기',
    visual: 'ready',
    lead: '대전방에 들어오면 5초 동안 재배치를 묻습니다.',
    points: ['시작 전 같은 줄에서 3알·5알·7알·9알과 일자형·쐐기형·방어형을 고릅니다', '고르면 본판이 바로 바뀌고 저장 진형에 남습니다', '예를 누르면 10초 동안 첫째 선 안에서 자기 진영 돌을 옮깁니다', '10부터 1까지 내려가며 셉니다', '아니오·무응답이면 시작 버튼을 기다립니다', '⚙️에서 재배치를 끄면 시작 버튼이 바로 나옵니다'],
  }),
  Object.freeze({
    id: 'acorn',
    kicker: '선공 · 도토리',
    title: '호스트가 먼저',
    visual: 'acorn',
    lead: '선공은 호스트(흑). 도토리는 접속마다 10개, AI 대전만 승 +1 / 패 −1.',
    points: ['1인은 호스트(흑)가 먼저입니다', 'AI는 내가 흑·선공입니다', '1인 연습은 도토리를 건드리지 않습니다', 'AI 대전만 ±1 정산합니다', '창을 닫으면 도토리는 다시 10개입니다'],
  }),
  Object.freeze({
    id: 'fall',
    kicker: '승패',
    title: '장외가 곧 승부',
    visual: 'fall',
    lead: '한 쪽 돌이 모두 판 밖으로 나가면 끝입니다.',
    points: ['장외는 격자선이 아니라 나무판 끝입니다', '장외 알은 판 밖 액션캠으로 따라갑니다', '⚙️에서 액션캠을 끄면 클로즈업이 없습니다', '마지막 알은 액션캠 뒤 한 박자 쉬고 결과', '기권은 바로 승부가 갈립니다'],
  }),
  Object.freeze({
    id: 'sound',
    kicker: '설정',
    title: '소리·액션캠·재배치',
    visual: 'sound',
    lead: '⚙️에서 음량·판 색·감도·액션캠·시작 전 재배치·이력을 맞춥니다.',
    points: ['액션캠을 끄면 장외 클로즈업이 없습니다', '재배치를 끄면 시작 버튼이 바로 나옵니다', '조준선 켜기·끄기와 색은 ⚙️에서 맞춥니다', '이력은 조회만 하고 앱이 지우지 않습니다', '왼쪽 턴은 반시계, 오른쪽과 빈 판 탭은 시계 +45°', '대국 중에는 설정을 적용할 수 없습니다', '첫 터치로 소리가 열립니다', '모바일은 세로로 잡는 것이 기준입니다', '다음 접속시 이 창을 숨길 수 있습니다'],
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
    return '<div class="book-visual is-modes" aria-hidden="true"><span>1인</span><span>AI</span></div>';
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
    <p class="clinic-lead">물리 · 붙임 · AI 도주 · 알 수·진형 · 이력 · 턴 · 조준선 · 설정</p>
    <ul class="clinic-list">${rows}</ul>
  `;
}
