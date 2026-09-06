import {
  GAME_MODE,
  GameEngine,
  PHASE,
  PULL_BLOCK_NOTICE,
  PULL_OVER_NOTICE,
  STONE_COLOR,
  defaultGameModeForLobbyCount,
  isOutsideInnerBoard,
  shouldApplyLobbyDefaultMode,
} from './physics/GameEngine.js';
import { TurnManager } from './ai/TurnManager.js';
import { SettingsModal } from './ui/FormationModal.js';
import { PowerRatioController } from './ui/SettingsPanel.js';
import { GUIDE_LINE_KEY, KILL_CAM, ResponsiveViewport, ThreeRenderer, shouldAttachKillCam } from './ui/ThreeRenderer.js';
import { isActionCamEnabled, isRearrangeAskEnabled } from './ui/PlayPrefs.js';
import { aimChargeRatio, applyPowerFill, timerRingOffset } from './ui/HudPower.js';
import { exitGame } from './ui/GameExit.js';
import { resultSubLine } from './physics/ResultBeat.js';
import { soundEngine } from './audio/SoundEngine.js';
import { RealtimeManager } from './network/RealtimeManager.js';
import { createRealtimeClient, readSupabaseConfig } from './network/RealtimeClient.js';
import {
  LOBBY_CAP,
  mergeSelfPresence,
  presenceFromMatch,
  roomTitle,
  openRoomCount,
  roomsFromPresence,
  canJoinPvpRoom,
  isPvpWaiting,
  lobbyGuideLine,
  presenceStatusLabel,
  roomStatusLabel,
  watcherLine,
} from './network/LobbyRooms.js';
import {
  applySeededPresence,
  seedPlayingGuests,
} from './network/LobbySeed.js';
import {
  LOCATION_GUIDE,
  NICKNAME_HINT,
  NICKNAME_LOCKED_HINT,
  NICKNAME_MAX,
  canChangeNickname,
  clearPermanentNickname,
  funAiNickname,
  locationLabel,
  matchSeatNames,
  playerSeat,
  sortBySeat,
} from './network/Nickname.js';
import {
  PVP_WAIT_HINT,
  canStartMatch,
  firstPlayerId,
  hasPvpOpponent,
} from './network/MatchStart.js';
import {
  FIRST_HINT,
  PEER_REARRANGE_HINT,
  READY_ASK,
  READY_NO,
  READY_YES,
  answerReady,
  createMatchReady,
  isPeerRearranging,
  skipReadyAsk,
  stepMatchReady,
} from './network/MatchReady.js';
import {
  clearAcornHistory,
  settleSessionAcorns,
  shouldForfeitOnLeave,
} from './network/AcornPolicy.js';
import {
  ensureNightUserId,
  readNightAcorns,
  readNightUserId,
  writeNightAcorns,
} from './network/NightSession.js';
import { isLiveRealtime, runLobbyClinic } from './network/LobbyClinic.js';
import { KEEP_CONNECTED_NICKNAME, STALE_LEAVE_HINT, SWEEP_LEAVE_HINT } from './network/PresencePolicy.js';
import { PVP_GUIDE_ASK, PVP_ROOM_HINT, shouldInvitePvp } from './network/PvpInvite.js';
import {
  guidePageAt,
  guidePageCount,
  hasSeenGuideBook,
  markGuideBookSeen,
  renderClinicList,
  renderGuidePage,
} from './ui/GuideBook.js';
import {
  advanceTutorial,
  createTutorialState,
  isTutorialDone,
  startTutorialState,
  tutorialStep,
} from './ui/Tutorial.js';

const table = document.getElementById('table');
const stage = document.getElementById('stage');
const canvas = document.getElementById('board');
const powerFill = document.getElementById('power-fill');
const matchBadge = document.getElementById('match-badge');
const matchTimer = document.getElementById('match-timer');
const timerRing = document.getElementById('timer-ring');
const acornCount = document.getElementById('acorn-count');
const guideBtn = document.getElementById('guide-btn');
const resultModal = document.getElementById('result-modal');
const resultTitle = document.getElementById('result-title');
const resultSub = document.getElementById('result-sub');
const spectatorBadge = document.getElementById('spectator-badge');
const lobbyToggle = document.getElementById('lobby-toggle');
const lobbyUsers = document.getElementById('lobby-users');
const lobbyList = document.getElementById('lobby-list');
const lobbyClose = document.getElementById('lobby-close');
const lobbyOverlay = document.getElementById('lobby-overlay');
const userCount = document.getElementById('user-count');
const nickInput = document.getElementById('lobby-nick-input');
const nickHint = document.getElementById('lobby-nick-hint');
const nickSave = document.getElementById('lobby-nick-save');
const seatNameBlack = document.getElementById('seat-name-black');
const seatNameWhite = document.getElementById('seat-name-white');
const spectateBar = document.getElementById('spectate-bar');
const seatWatchers = document.getElementById('seat-watchers');
const tickerText = document.getElementById('ticker-billboard-text');
const pullBlockToast = document.getElementById('pull-block-toast');
let pullBlockToastTimer = 0;

const renderer = new ThreeRenderer(canvas);
const engine = new GameEngine({
  element: canvas,
  autoStart: true,
  soundEngine,
  mapPointer: (event) => renderer.pointerToMatter(event),
});
const turnManager = new TurnManager({ engine });

const realtimeManager = new RealtimeManager({
  supabaseClient: createRealtimeClient(import.meta.env),
  channelName: 'dotori-lobby',
  userId: ensureNightUserId(),
  userCharacter: '🐶',
  nicknameStorage: globalThis.sessionStorage,
  keepNickname: KEEP_CONNECTED_NICKNAME,
  onPresenceUpdate: (users) => {
    updateLobbyUserList(users.map((u) => ({
      id: u.userId,
      userId: u.userId,
      nickname: u.nickname,
      character: u.character,
      seat: u.seat,
      status: u.status,
      mode: u.mode,
      roomId: u.roomId,
      acorns: u.acorns,
      rearranging: Boolean(u.rearranging),
      isOwner: u.userId === realtimeManager.userId,
    })));
    syncNickField();
  },
  onLobbyFull: () => {
    setTicker(`대기실이 가득 찼습니다 (${LOBBY_CAP}명)`);
  },
  onStaleLeave: () => {
    handleStaleLeave();
  },
  onSweepLeave: () => {
    handleSweepLeave();
  },
  onSpectatorData: (gameState) => {
    if (engine.phase === PHASE.SPECTATING) {
      engine.updateSpectatorState(gameState);
    }
  },
});

let matchStarted = false;
let suppressResult = false;
clearAcornHistory();
clearPermanentNickname();
let sessionAcorns = readNightAcorns();
acornCount.textContent = String(sessionAcorns);
matchBadge.textContent = '흑 턴 15';

let lobbyVisible = false;
let lobbyUserList = [];
let lastLobbyModeCount = null;
let inMatchRoom = false;
let awaitingStart = false;
let matchReady = null;
let lastPublishedRearranging = false;
let activeRoomId = null;
let joiningRoom = false;
let lastRoomMates = new Set();
let lastTimerSec = -1;

let settingsModal = null;

function applyLobbyDefaultMode(count) {
  const next = defaultGameModeForLobbyCount(count);
  if (!settingsModal) return;
  if (next == null || engine.gameMode === GAME_MODE.AI || engine.gameMode === GAME_MODE.SOLO) {
    lastLobbyModeCount = count;
    return;
  }
  if (engine.gameMode === next) {
    lastLobbyModeCount = count;
    return;
  }
  if (lastLobbyModeCount === count) return;
  if (!shouldApplyLobbyDefaultMode(engine.getSnapshot(), next)) return;
  lastLobbyModeCount = count;
  settingsModal.syncLobbyDefaultMode(next);
}

function readGuideEnabled() {
  try {
    const raw = localStorage.getItem(GUIDE_LINE_KEY);
    if (raw == null) return true;
    return raw === '1' || raw === 'true' || raw === 'on';
  } catch {
    return true;
  }
}

function setTicker(text) {
  if (tickerText) tickerText.textContent = text;
}

function syncNickField() {
  if (nickInput && document.activeElement !== nickInput) {
    nickInput.value = realtimeManager.userNickname || '';
  }
  syncNickLock();
}

function pvpOpponentName() {
  const mine = realtimeManager.userId;
  const roomId = currentMatchRoomId();
  const other = lobbyUserList.find((u) => (
    (u.userId ?? u.id) !== mine
    && u.mode === GAME_MODE.PVP
    && u.status === 'playing'
    && u.roomId === roomId
    && u.nickname
  ));
  return other?.nickname || '';
}

function currentMatchRoomId() {
  if (engine.phase === PHASE.SPECTATING) return engine.spectatorData?.matchId || '';
  return activeRoomId || `room_${realtimeManager.userId}`;
}

function syncWatchers() {
  const rooms = lobbyRooms();
  const room = rooms.find((r) => r.id === currentMatchRoomId());
  let watchers = room?.watchers ? room.watchers.slice() : [];
  if (engine.phase === PHASE.SPECTATING) {
    const mine = realtimeManager.userNickname;
    if (mine && !watchers.some((w) => w.nickname === mine || w.id === realtimeManager.userId)) {
      watchers = [...watchers, { id: realtimeManager.userId, nickname: mine }];
    }
  }
  const line = watcherLine(watchers);
  if (seatWatchers) {
    seatWatchers.textContent = line;
    seatWatchers.hidden = !line;
  }
}

function syncSeatNames() {
  if (engine.phase === PHASE.SPECTATING && engine.spectatorData) {
    if (seatNameBlack) seatNameBlack.textContent = engine.spectatorData.playerA || '';
    if (seatNameWhite) seatNameWhite.textContent = engine.spectatorData.playerB || '';
    syncWatchers();
    return;
  }
  const mine = realtimeManager.userNickname || '도토리1';
  const names = matchSeatNames({
    mode: engine.gameMode,
    myName: mine,
    opponentName: pvpOpponentName(),
    seed: realtimeManager.userId,
    aiName: funAiNickname(realtimeManager.userId),
  });
  if (seatNameBlack) seatNameBlack.textContent = names.black;
  if (seatNameWhite) seatNameWhite.textContent = names.white;
  syncWatchers();
}

function nickLockState() {
  return {
    inMatch: Boolean(inMatchRoom),
    spectating: engine.phase === PHASE.SPECTATING,
  };
}

function isNickLocked() {
  return !canChangeNickname(nickLockState());
}

function syncNickLock() {
  const locked = isNickLocked();
  if (nickInput) {
    nickInput.readOnly = locked;
    nickInput.disabled = locked;
  }
  if (nickSave) nickSave.disabled = locked;
  if (nickHint) {
    nickHint.textContent = locked ? NICKNAME_LOCKED_HINT : NICKNAME_HINT;
    nickHint.classList.toggle('is-warn', false);
  }
}

function saveNickname() {
  if (!nickInput || isNickLocked()) return;
  const result = realtimeManager.setDisplayNickname(nickInput.value, { locked: isNickLocked() });
  nickInput.value = result.nickname;
  if (nickHint) {
    nickHint.textContent = result.renamed ? result.hint : (result.ok ? NICKNAME_HINT : result.hint);
    nickHint.classList.toggle('is-warn', !result.ok || Boolean(result.renamed));
  }
  publishPresence();
  syncSeatNames();
}

function showPullBlockToast(message = PULL_BLOCK_NOTICE) {
  if (!pullBlockToast) return;
  pullBlockToast.textContent = message;
  pullBlockToast.hidden = false;
  if (pullBlockToastTimer) clearTimeout(pullBlockToastTimer);
  pullBlockToastTimer = setTimeout(() => {
    pullBlockToast.hidden = true;
    pullBlockToastTimer = 0;
  }, 1600);
}

function hideResult() {
  resultModal.hidden = true;
}

function showResult(payload) {
  const ai = engine.gameMode === GAME_MODE.AI;
  if (payload.winner === 'draw') {
    resultTitle.textContent = '무승부';
  } else if (ai && payload.winner === STONE_COLOR.BLACK) {
    resultTitle.textContent = '승리!';
  } else if (ai && payload.winner === STONE_COLOR.WHITE) {
    resultTitle.textContent = '패배 (AI 승리)';
  } else {
    resultTitle.textContent = payload.winner === STONE_COLOR.BLACK ? '흑 승' : '백 승';
  }
  resultSub.textContent = resultSubLine(payload, engine.gameMode);
  resultModal.hidden = false;
}

function showSpectatorBadge(playerA, playerB) {
  const spectatorText = spectatorBadge.querySelector('.spectator-text');
  spectatorText.textContent = `실시간 관전 중 (${playerA} vs ${playerB})`;
  spectatorBadge.hidden = false;
  if (spectateBar) spectateBar.hidden = false;
}

function hideSpectatorBadge() {
  spectatorBadge.hidden = true;
  if (spectateBar) spectateBar.hidden = true;
}

function toggleLobby() {
  if (lobbyVisible) hideLobby();
  else showLobby();
}

function syncAcornHud() {
  if (acornCount) acornCount.textContent = String(sessionAcorns);
}

function myAcorns() {
  return sessionAcorns;
}

function myStoneColor() {
  const own = `room_${realtimeManager.userId}`;
  if (activeRoomId && activeRoomId !== own) return STONE_COLOR.WHITE;
  return STONE_COLOR.BLACK;
}

function applyAcornResult(payload) {
  sessionAcorns = writeNightAcorns(settleSessionAcorns(sessionAcorns, {
    mode: engine.gameMode,
    started: matchStarted,
    winner: payload?.winner,
    myColor: myStoneColor(),
    spectating: engine.phase === PHASE.SPECTATING,
  }));
  syncAcornHud();
}

function matchPlayers() {
  const mine = { userId: realtimeManager.userId, acorns: myAcorns() };
  const roomId = currentMatchRoomId();
  const others = lobbyUserList
    .filter((u) => (u.userId ?? u.id) !== mine.userId)
    .filter((u) => u.status === 'playing' && u.mode === engine.gameMode)
    .filter((u) => !roomId || u.roomId === roomId)
    .map((u) => ({ userId: u.userId ?? u.id, acorns: Number(u.acorns ?? 10) }));
  return [mine, ...others];
}

function canStartNow() {
  return canStartMatch({
    mode: engine.gameMode,
    userId: realtimeManager.userId,
    players: matchPlayers(),
  });
}

function currentReadyView(now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  return stepMatchReady(matchReady, now, {
    peerRearranging: isPeerRearranging(lobbyUserList, realtimeManager.userId, currentMatchRoomId()),
    askEnabled: isRearrangeAskEnabled(),
  });
}

function clearMatchReady() {
  matchReady = null;
  lastPublishedRearranging = false;
  engine.setPlacementOnly(false);
}

function beginMatchReady() {
  engine.setHost(myStoneColor() === STONE_COLOR.BLACK);
  matchReady = createMatchReady(typeof performance !== 'undefined' ? performance.now() : Date.now());
  lastPublishedRearranging = false;
  engine.setPlacementOnly(false);
}

function answerMatchReady(yes) {
  if (!awaitingStart || !matchReady || matchReady.answer != null) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  matchReady = answerReady(matchReady, yes, now);
  const view = currentReadyView(now);
  engine.setPlacementOnly(view.rearranging);
  lastPublishedRearranging = view.rearranging;
  publishPresence();
  syncStartGate();
}

function skipReadyAskNow() {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  matchReady = skipReadyAsk(matchReady ?? createMatchReady(now), now);
  if (matchReady.answer == null) matchReady = answerReady(matchReady, false, now);
  engine.setPlacementOnly(false);
  lastPublishedRearranging = false;
  publishPresence();
  syncStartGate();
}

function tickMatchReady() {
  if (!inMatchRoom || !awaitingStart || engine.phase === PHASE.SPECTATING) return;
  if (!matchReady) beginMatchReady();
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let view = currentReadyView(now);
  if (view.answer == null && !view.askVisible) {
    matchReady = answerReady(matchReady, false, now);
    view = currentReadyView(now);
  }
  if (engine.placementOnly !== view.rearranging) {
    engine.setPlacementOnly(view.rearranging);
  }
  if (lastPublishedRearranging !== view.rearranging) {
    lastPublishedRearranging = view.rearranging;
    publishPresence();
  }
  syncStartGate();
}

function syncStartGate() {
  const gate = document.getElementById('match-start-gate');
  const hint = document.getElementById('pvp-start-hint');
  const btn = document.getElementById('match-start');
  const askBox = document.getElementById('ready-ask-box');
  const ask = document.getElementById('ready-ask');
  const yesBtn = document.getElementById('ready-ask-yes');
  const noBtn = document.getElementById('ready-ask-no');
  const show = inMatchRoom && awaitingStart && engine.phase !== PHASE.SPECTATING;
  if (gate) gate.hidden = !show;
  if (!show) return;
  const view = currentReadyView();
  const pvp = engine.gameMode === GAME_MODE.PVP;
  const ready = hasPvpOpponent(matchPlayers());
  if (ask) ask.textContent = READY_ASK;
  if (yesBtn) yesBtn.textContent = READY_YES;
  if (noBtn) noBtn.textContent = READY_NO;
  if (askBox) askBox.hidden = !view.askVisible;
  if (btn) {
    btn.hidden = !view.startVisible;
    btn.disabled = !canStartNow();
    const lead = firstPlayerId(matchPlayers());
    btn.title = !ready
      ? PVP_WAIT_HINT
      : pvp && lead && lead !== realtimeManager.userId ? '선공만 시작할 수 있습니다' : '시작';
  }
  let hintText = '';
  let hintShow = false;
  if (view.peerRearranging) {
    hintText = PEER_REARRANGE_HINT;
    hintShow = true;
  } else if (pvp && !ready) {
    hintText = PVP_WAIT_HINT;
    hintShow = true;
  } else if (view.startVisible && view.firstHint) {
    hintText = FIRST_HINT;
    hintShow = true;
  }
  if (hint) {
    hint.hidden = !hintShow;
    if (hintShow) hint.textContent = hintText;
  }
}

function beginMatchIfAllowed() {
  if (!awaitingStart || !canStartNow()) return false;
  awaitingStart = false;
  matchStarted = true;
  clearMatchReady();
  soundEngine.playStart();
  syncStartGate();
  syncSceneMode();
  return true;
}

function syncSceneMode() {
  const spectating = engine.phase === PHASE.SPECTATING;
  const lobbyMode = !spectating && (!inMatchRoom || lobbyVisible);
  stage.classList.toggle('is-lobby', lobbyMode);
  soundEngine.setAmbience(lobbyMode ? 'lobby' : awaitingStart ? 'wait' : spectating ? 'wait' : 'match');
  if (lobbyMode || (awaitingStart && !spectating)) {
    turnManager.cancel();
    engine.pauseMatch();
    syncStartGate();
    return;
  }
  if (!spectating) {
    engine.resumeMatch();
    turnManager.sync();
  }
  syncStartGate();
}

function syncLobbyWaitGuide(rooms = lobbyRooms()) {
  const guide = document.getElementById('lobby-location-guide');
  if (!guide) return;
  const line = lobbyGuideLine(rooms, LOCATION_GUIDE);
  guide.textContent = line.text;
  guide.classList.toggle('is-wait-blink', line.blink);
}

function syncPvpInvite() {
  const pvpBtn = document.getElementById('lobby-mode-pvp');
  const invite = shouldInvitePvp(lobbyRoomsUsers().length);
  pvpBtn?.classList.toggle('is-invite-blink', invite);
}

function closePvpGuidePick() {
  const pick = document.getElementById('pvp-guide-pick');
  if (pick) pick.hidden = true;
}

function openPvpGuidePick() {
  const pick = document.getElementById('pvp-guide-pick');
  const ask = document.getElementById('pvp-guide-ask');
  if (ask) ask.textContent = PVP_GUIDE_ASK;
  if (pick) pick.hidden = false;
}

function confirmPvpGuide(enabled) {
  settingsModal?.setGuideEnabled(enabled);
  closePvpGuidePick();
  settingsModal?.setGameMode(GAME_MODE.PVP, { startMatch: true });
}

function showLobby() {
  lobbyVisible = true;
  lobbyUsers.hidden = false;
  syncNickField();
  renderLobby();
  syncSceneMode();
  if (!hasSeenGuideBook()) openLobbyBookSheet('guide');
}

function hideLobby({ force = false } = {}) {
  if (!inMatchRoom && !force) {
    showLobby();
    return;
  }
  closeLobbyBook();
  closePvpGuidePick();
  lobbyVisible = false;
  lobbyUsers.hidden = true;
  syncSceneMode();
}

let bookPage = 0;
let bookTab = 'guide';
let tutorial = createTutorialState();

function clinicSnapshot() {
  return {
    engine,
    renderer,
    soundUnlocked: Boolean(soundEngine.isUnlocked),
    volume: soundEngine.volume,
    muted: soundEngine.muted,
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    acorns: sessionAcorns,
    nightUserId: readNightUserId(),
    hasSolo: Boolean(document.getElementById('lobby-mode-solo')),
    hasAi: Boolean(document.getElementById('lobby-mode-ai')),
    hasPvp: Boolean(document.getElementById('lobby-mode-pvp')),
    pvpWaitHint: PVP_WAIT_HINT,
    hasStartGate: Boolean(document.getElementById('match-start')),
    hasReadyAsk: Boolean(document.getElementById('ready-ask-box')),
    hasSurrender: Boolean(document.getElementById('surrender-btn')),
    hasLeave: Boolean(document.getElementById('lobby-leave')),
    hasVolume: Boolean(document.getElementById('settings-volume')),
    hasActionCam: Boolean(document.getElementById('settings-action-cam')),
    hasRearrangeAsk: Boolean(document.getElementById('settings-rearrange-ask')),
    actionCamOn: renderer.actionCamEnabled !== false && isActionCamEnabled(),
    rearrangeAskOn: isRearrangeAskEnabled(),
    pullOverNotice: PULL_OVER_NOTICE,
    pullBlockNotice: PULL_BLOCK_NOTICE,
    killCamSlowMo: KILL_CAM.SLOW_MO_S,
    killCamOffSkips: shouldAttachKillCam(false, null) === false
      && shouldAttachKillCam(true, null) === true,
    liveConfigured: readSupabaseConfig(import.meta.env).live,
    realtimeLive: isLiveRealtime(realtimeManager.supabaseClient),
    connected: Boolean(realtimeManager.isConnected),
    lobbyCap: LOBBY_CAP,
  };
}

function renderLobbyBook() {
  const body = document.getElementById('lobby-book-body');
  const nav = document.getElementById('lobby-book-nav');
  const dots = document.getElementById('lobby-book-dots');
  const guideTab = document.getElementById('lobby-book-tab-guide');
  const clinicTab = document.getElementById('lobby-book-tab-clinic');
  if (!body) return;
  guideTab?.classList.toggle('is-on', bookTab === 'guide');
  clinicTab?.classList.toggle('is-on', bookTab === 'clinic');
  if (nav) nav.hidden = bookTab !== 'guide';
  const startBtn = document.getElementById('lobby-book-tutorial');
  if (startBtn) startBtn.hidden = bookTab !== 'guide';
  if (bookTab === 'clinic') {
    body.innerHTML = renderClinicList(runLobbyClinic(clinicSnapshot()));
    return;
  }
  const page = guidePageAt(bookPage);
  body.innerHTML = renderGuidePage(page);
  if (dots) {
    dots.innerHTML = '';
    for (let i = 0; i < guidePageCount(); i += 1) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = i === bookPage ? 'book-dot is-on' : 'book-dot';
      dot.setAttribute('aria-label', `${i + 1}쪽`);
      dot.addEventListener('click', () => {
        bookPage = i;
        renderLobbyBook();
      });
      dots.appendChild(dot);
    }
  }
}

function openLobbyBookSheet(tab = 'guide') {
  bookTab = tab === 'clinic' ? 'clinic' : 'guide';
  const book = document.getElementById('lobby-book');
  if (book) book.hidden = false;
  markGuideBookSeen();
  renderLobbyBook();
}

function openLobbyBook(tab = 'guide') {
  if (!lobbyVisible) {
    lobbyVisible = true;
    lobbyUsers.hidden = false;
    syncNickField();
    renderLobby();
    syncSceneMode();
  }
  openLobbyBookSheet(tab);
}

function closeLobbyBook() {
  const book = document.getElementById('lobby-book');
  if (book) book.hidden = true;
}

function syncTutorialCoach() {
  const root = document.getElementById('tutorial-coach');
  const title = document.getElementById('tutorial-title');
  const text = document.getElementById('tutorial-text');
  const skip = document.getElementById('tutorial-skip');
  const finish = document.getElementById('tutorial-finish');
  if (!root) return;
  if (!tutorial.active) {
    root.hidden = true;
    return;
  }
  const step = tutorialStep(tutorial);
  if (title) title.textContent = step.title;
  if (text) text.textContent = step.coach;
  if (skip) skip.hidden = isTutorialDone(tutorial);
  if (finish) finish.hidden = !isTutorialDone(tutorial);
  root.hidden = false;
  setTicker(step.coach);
}

function noteTutorial(event) {
  if (!tutorial.active) return;
  tutorial = advanceTutorial(tutorial, event);
  syncTutorialCoach();
}

function startTutorialPlay() {
  closeLobbyBook();
  tutorial = startTutorialState();
  settingsModal.setGameMode(GAME_MODE.SOLO, { startMatch: true });
  beginMatchIfAllowed();
  syncTutorialCoach();
}

function stopTutorial(event = 'leave') {
  if (!tutorial.active) return;
  tutorial = advanceTutorial(tutorial, event);
  syncTutorialCoach();
}

function syncLobbyLeaveBtn() {
  const btn = document.getElementById('lobby-leave');
  if (!btn) return;
  btn.hidden = engine.phase === PHASE.SPECTATING;
}

function playingMates() {
  const roomId = currentMatchRoomId();
  const mine = realtimeManager.userId;
  return new Set(
    lobbyUserList
      .filter((u) => (u.userId ?? u.id) !== mine)
      .filter((u) => u.roomId === roomId && u.status === 'playing')
      .map((u) => u.userId ?? u.id),
  );
}

function noteRoomMates(playDiff) {
  if (!inMatchRoom) {
    lastRoomMates = new Set();
    return;
  }
  const next = playingMates();
  if (playDiff && engine.phase !== PHASE.SPECTATING) {
    for (const id of next) {
      if (!lastRoomMates.has(id)) soundEngine.playDoor('enter');
    }
    for (const id of lastRoomMates) {
      if (!next.has(id)) soundEngine.playDoor('leave');
    }
  }
  lastRoomMates = next;
}

function syncPvpWait() {
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom || engine.phase === PHASE.SPECTATING) return;
  if (!hasPvpOpponent(matchPlayers())) {
    awaitingStart = true;
    turnManager.cancel();
    engine.pauseMatch();
  }
  syncStartGate();
}

function enterMatchRoom() {
  inMatchRoom = true;
  awaitingStart = true;
  matchStarted = false;
  if (!joiningRoom) activeRoomId = `room_${realtimeManager.userId}`;
  beginMatchReady();
  hideLobby({ force: true });
  syncNickLock();
  syncLobbyLeaveBtn();
  syncSceneMode();
  soundEngine.playDoor('enter');
  noteRoomMates(false);
}

function handleSweepLeave() {
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  clearMatchReady();
  activeRoomId = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  setTicker(SWEEP_LEAVE_HINT);
  showLobby();
  syncNickField();
}

function handleStaleLeave() {
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  clearMatchReady();
  activeRoomId = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  setTicker(STALE_LEAVE_HINT);
  showLobby();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  realtimeManager.connect().then(() => {
    realtimeManager.startHeartbeat();
    publishPresence();
    syncNickField();
  }).catch(() => {});
}

function leaveToWaitingRoom() {
  if (engine.phase === PHASE.SPECTATING) {
    leaveWatchedRoom();
    return;
  }
  stopTutorial('leave');
  if (shouldForfeitOnLeave({
    mode: engine.gameMode,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
    phase: engine.phase,
  })) {
    suppressResult = true;
    engine.surrender(myStoneColor());
    suppressResult = false;
  }
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  clearMatchReady();
  activeRoomId = null;
  lastRoomMates = new Set();
  soundEngine.playDoor('leave');
  publishPresence();
  showLobby();
}

function quitGameFromLobby() {
  if (gameExited) return;
  gameExited = true;
  settingsModal.close(false);
  exitGame({
    engine,
    turnManager,
    realtimeManager,
    root: stage,
    win: window,
    cancelFrame: () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    },
  });
}

function enterSpectateRoom(room) {
  engine.enterSpectatorMode({
    matchId: room.id,
    playerA: room.playerA,
    playerB: room.playerB,
    mode: room.mode,
  });
  hideLobby({ force: true });
  soundEngine.playDoor('enter');
}

function exitSpectate() {
  engine.exitSpectatorMode();
}

function leaveWatchedRoom() {
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  clearMatchReady();
  activeRoomId = null;
  lastRoomMates = new Set();
  soundEngine.playDoor('leave');
  exitSpectate();
  showLobby();
}

function joinPvpRoom(room) {
  if (!canJoinPvpRoom(room, realtimeManager.userId)) return;
  joiningRoom = true;
  activeRoomId = room.id;
  try {
    settingsModal.setGameMode(GAME_MODE.PVP, { startMatch: true });
  } finally {
    joiningRoom = false;
  }
}

function selfPresence() {
  const snap = engine.getSnapshot();
  const watching = snap.phase === PHASE.SPECTATING;
  return presenceFromMatch({
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    character: realtimeManager.userCharacter,
    mode: snap.gameMode,
    phase: snap.phase,
    roomId: currentMatchRoomId(),
    watchRoomId: watching ? engine.spectatorData?.matchId : null,
    inRoom: inMatchRoom,
    acorns: myAcorns(),
    rearranging: Boolean(engine.placementOnly && awaitingStart),
  });
}

function publishPresence() {
  const next = selfPresence();
  realtimeManager.updatePresence(next);
  updateLobbyUserList(mergeSelfPresence(lobbyUserList, next));
}

function lobbyRooms() {
  return roomsFromPresence(lobbyRoomsUsers());
}

function updateLobbyUserList(users) {
  lobbyUserList = users.slice(0, LOBBY_CAP);
  noteRoomMates(true);
  syncPvpWait();
  if (lobbyVisible) renderLobby();
  else syncLobbyRoomCount();
  applyLobbyDefaultMode(lobbyUserList.length);
  syncStartGate();
}

function syncLobbyRoomCount() {
  if (userCount) userCount.textContent = String(openRoomCount(lobbyRoomsUsers()));
}

function lobbyRoomsUsers() {
  return lobbyUserList.some((u) => (u.userId ?? u.id) === realtimeManager.userId)
    ? lobbyUserList
    : [selfPresence(), ...lobbyUserList];
}

function renderLobby() {
  if (!lobbyList) return;
  lobbyList.innerHTML = '';

  const rooms = lobbyRooms();
  syncLobbyRoomCount();
  syncLobbyWaitGuide(rooms);
  syncPvpInvite();
  rooms.forEach((room) => {
    const row = document.createElement('div');
    row.className = 'lobby-room';

    const info = document.createElement('div');
    info.className = 'lobby-room-info';
    const name = document.createElement('div');
    name.className = 'lobby-room-name';
    name.textContent = roomTitle(room);
    const status = document.createElement('div');
    status.className = isPvpWaiting(room) ? 'lobby-room-status is-wait-blink' : 'lobby-room-status';
    status.textContent = roomStatusLabel(room);
    info.appendChild(name);
    info.appendChild(status);

    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'spectate-btn';
    if (canJoinPvpRoom(room, realtimeManager.userId)) {
      watch.textContent = '참가하기';
      watch.addEventListener('click', () => joinPvpRoom(room));
    } else {
      watch.textContent = '관람하기';
      watch.addEventListener('click', () => enterSpectateRoom(room));
    }

    row.appendChild(info);
    row.appendChild(watch);
    lobbyList.appendChild(row);
  });

  if (engine.phase === PHASE.SPECTATING) {
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'spectate-exit';
    stop.textContent = '관람 종료';
    stop.addEventListener('click', () => {
      exitSpectate();
      hideLobby();
    });
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'spectate-exit';
    leave.textContent = '게임방 나가기';
    leave.addEventListener('click', leaveWatchedRoom);
    lobbyList.appendChild(leave);
    lobbyList.appendChild(stop);
  }

  if (rooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lobby-empty';
    empty.id = 'lobby-empty';
    empty.textContent = '개설된 대국 방이 없습니다';
    lobbyList.appendChild(empty);
  }
  const hint = document.createElement('div');
  hint.className = 'lobby-pvp-hint';
  hint.id = 'lobby-pvp-hint';
  hint.textContent = PVP_ROOM_HINT;
  lobbyList.appendChild(hint);

  sortBySeat(lobbyUserList).forEach((user) => {
    const userEl = document.createElement('div');
    userEl.className = `lobby-user ${user.isOwner ? 'owner' : ''}`;

    const locEl = document.createElement('div');
    locEl.className = 'lobby-user-loc';
    locEl.textContent = locationLabel(playerSeat(user));

    const avatarEl = document.createElement('div');
    avatarEl.className = 'lobby-user-avatar';
    avatarEl.textContent = user.character || '🐶';

    const nameEl = document.createElement('div');
    nameEl.className = 'lobby-user-name';
    nameEl.textContent = user.nickname || `유저${user.id}`;

    const statusEl = document.createElement('div');
    statusEl.className = 'lobby-user-status';
    statusEl.textContent = presenceStatusLabel(user, rooms);

    userEl.appendChild(locEl);
    userEl.appendChild(avatarEl);
    userEl.appendChild(nameEl);
    userEl.appendChild(statusEl);
    lobbyList.appendChild(userEl);
  });
}

renderer.setGuideEnabled(readGuideEnabled());

engine.on('reset', () => {
  renderer.resetFx();
  hideResult();
  syncSceneMode();
  setTicker('READY: 바둑알을 뒤로 당겨 튕겨내세요!');
  publishPresence();
});

engine.on('aimStart', () => {
  noteTutorial('aimStart');
});

engine.on('aimUpdate', () => {
  noteTutorial('aimUpdate');
});

engine.on('powerStage', () => {
  noteTutorial('powerStage');
});

engine.on('pullBlocked', (payload) => {
  showPullBlockToast(payload?.message ?? PULL_BLOCK_NOTICE);
});

engine.on('launch', (payload) => {
  soundEngine.playFlick(payload?.power ?? 0.5);
  noteTutorial('launch');
  if (!tutorial.active) setTicker('발사!');
});

engine.on('clash', (payload) => {
  const intensity = Math.min(1, payload.relativeVelocity / 16);
  renderer.spawnPop(payload.x, payload.y, intensity);
  if (payload.relativeVelocity >= 8) {
    renderer.spawnShake(Math.min(1, (payload.relativeVelocity - 8) / 12));
  }
});

engine.on('stoneFallen', (payload) => {
  if (!isOutsideInnerBoard({ x: payload.x, y: payload.y })) return;
  soundEngine.playFall();
  renderer.spawnFall(payload.id, { x: payload.x, y: payload.y });
  if (!tutorial.active) setTicker('장외 탈락!');
});

engine.on('turnEnd', () => {
  matchBadge.textContent = engine.currentTurn === 'black' ? '흑 턴' : '백 턴';
  if (!tutorial.active) {
    setTicker(engine.currentTurn === 'black' ? '흑 차례입니다' : '백 차례입니다');
  }
  soundEngine.playTurn();
});

engine.on('gameOver', (payload) => {
  matchBadge.textContent = payload.winner === 'draw' ? '무승부' : `${payload.winner === 'black' ? '흑' : '백'} 승`;
  applyAcornResult(payload);
  if (payload.reason === 'surrender') soundEngine.playSurrender();
  else {
    const kind = payload.winner === 'draw'
      ? 'draw'
      : engine.gameMode === GAME_MODE.SOLO
        ? 'end'
        : (payload.winner === myStoneColor() || (engine.gameMode === GAME_MODE.AI && payload.winner === STONE_COLOR.BLACK))
          ? 'win'
          : 'lose';
    soundEngine.playResult(kind);
  }
  if (tutorial.active) noteTutorial('launch');
  if (!suppressResult && !tutorial.active) showResult(payload);
  applyLobbyDefaultMode(lobbyUserList.length);
  publishPresence();
});

engine.on('spectatorEnter', (data) => {
  showSpectatorBadge(data.playerA, data.playerB);
  syncLobbyLeaveBtn();
  setTicker(`🔴 관람 중: ${data.playerA} vs ${data.playerB}`);
  publishPresence();
});

engine.on('spectatorExit', () => {
  hideSpectatorBadge();
  if (inMatchRoom) enterMatchRoom();
  else syncSceneMode();
  syncLobbyLeaveBtn();
  setTicker('READY: 바둑알을 뒤로 당겨 튕겨내세요!');
  publishPresence();
});

function syncHud(snapshot) {
  applyPowerFill(powerFill, aimChargeRatio(snapshot.aim));
  if (snapshot.phase === PHASE.AIMING && snapshot.aim) {
    soundEngine.setPull(aimChargeRatio(snapshot.aim));
  } else {
    soundEngine.stopPull();
  }
  const ratio = snapshot.timer?.ratio ?? 1;
  timerRing.style.strokeDashoffset = String(timerRingOffset(ratio));
  matchTimer.classList.toggle('is-urgent', Boolean(snapshot.timer?.urgent && snapshot.timer?.running));
  const secs = Math.max(0, Math.ceil((snapshot.timer?.remainingMs ?? 0) / 1000));
  if (snapshot.timer?.urgent && snapshot.timer?.running && secs !== lastTimerSec && secs <= 5) {
    soundEngine.playTimerTick();
  }
  lastTimerSec = snapshot.timer?.running ? secs : -1;
  const clock = snapshot.timer?.running ? ` ${secs}` : '';
  const thinking = snapshot.gameMode === GAME_MODE.AI
    && snapshot.currentTurn === STONE_COLOR.WHITE
    && snapshot.phase === PHASE.IDLE
    && snapshot.inputLocked;
  syncSeatNames();
  if (snapshot.phase === PHASE.SPECTATING) {
    matchBadge.textContent = '관전 중';
  } else if (snapshot.phase === PHASE.AIMING) {
    matchBadge.textContent = `조준${clock}`;
  } else if (snapshot.phase === PHASE.RESOLVING) {
    matchBadge.textContent = '진행';
  } else if (snapshot.phase === PHASE.IDLE && snapshot.winner == null) {
    if (thinking) matchBadge.textContent = `고민${clock}`;
    else matchBadge.textContent = `${snapshot.currentTurn === 'black' ? '흑 턴' : '백 턴'}${clock}`;
  }
}

let frameId = 0;
let gameExited = false;

function frame() {
  if (gameExited) return;
  tickMatchReady();
  const snapshot = engine.getSnapshot();
  renderer.draw(snapshot);
  syncHud(snapshot);
  frameId = requestAnimationFrame(frame);
}

const viewport = new ResponsiveViewport({ table, stage, renderer });
settingsModal = new SettingsModal({
  root: stage,
  engine,
  renderer,
  onApply: (payload) => {
    hideResult();
    hideSpectatorBadge();
    if (payload?.toLobby) {
      inMatchRoom = false;
      awaitingStart = false;
      matchStarted = false;
      clearMatchReady();
      activeRoomId = null;
      showLobby();
    } else {
      enterMatchRoom();
    }
    matchBadge.textContent = '흑 턴 15';
    publishPresence();
    noteRoomMates(false);
  },
  onPvpPick: openPvpGuidePick,
});
const powerRatioController = new PowerRatioController({
  root: stage,
  engine,
  renderer,
});

try {
  localStorage.removeItem('dotori-alkkagi-scene-bg');
} catch {
  /* ignore */
}

turnManager.attach();
syncSceneMode();
showLobby();

document.getElementById('match-start')?.addEventListener('click', () => {
  beginMatchIfAllowed();
});
document.getElementById('ready-ask-yes')?.addEventListener('click', () => {
  answerMatchReady(true);
});
document.getElementById('ready-ask-no')?.addEventListener('click', () => {
  answerMatchReady(false);
});

guideBtn.addEventListener('click', () => {
  settingsModal.toggleGuide();
});

document.getElementById('result-again').addEventListener('click', () => {
  hideResult();
  enterMatchRoom();
  engine.setMatchConfig({ mode: engine.gameMode, difficulty: engine.aiDifficulty });
  renderer.resetFx();
  matchBadge.textContent = '흑 턴 15';
});

document.getElementById('surrender-btn')?.addEventListener('click', () => {
  if (engine.phase === PHASE.GAME_OVER || engine.phase === PHASE.SPECTATING) return;
  engine.surrender(engine.currentTurn);
});

document.getElementById('lobby-leave')?.addEventListener('click', () => {
  leaveToWaitingRoom();
});

document.getElementById('result-exit')?.addEventListener('click', () => {
  leaveToWaitingRoom();
});

document.getElementById('lobby-exit')?.addEventListener('click', () => {
  quitGameFromLobby();
});

lobbyToggle?.addEventListener('click', toggleLobby);
lobbyClose.addEventListener('click', hideLobby);
lobbyOverlay.addEventListener('click', hideLobby);
document.getElementById('lobby-book-open')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-clinic')?.addEventListener('click', () => openLobbyBook('clinic'));
document.getElementById('lobby-location-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-close')?.addEventListener('click', closeLobbyBook);
document.getElementById('lobby-book-tab-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-tab-clinic')?.addEventListener('click', () => openLobbyBook('clinic'));
document.getElementById('lobby-book-prev')?.addEventListener('click', () => {
  bookPage = (bookPage + guidePageCount() - 1) % guidePageCount();
  renderLobbyBook();
});
document.getElementById('lobby-book-next')?.addEventListener('click', () => {
  bookPage = (bookPage + 1) % guidePageCount();
  renderLobbyBook();
});
document.getElementById('lobby-book-tutorial')?.addEventListener('click', startTutorialPlay);
document.getElementById('lobby-book-body')?.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-tutorial-start]')) startTutorialPlay();
});
document.getElementById('tutorial-skip')?.addEventListener('click', () => {
  stopTutorial('skip');
  leaveToWaitingRoom();
  openLobbyBook('guide');
});
document.getElementById('tutorial-finish')?.addEventListener('click', () => {
  stopTutorial('finish');
  leaveToWaitingRoom();
  openLobbyBook('guide');
});
document.getElementById('pvp-guide-on')?.addEventListener('click', () => confirmPvpGuide(true));
document.getElementById('pvp-guide-off')?.addEventListener('click', () => confirmPvpGuide(false));
document.getElementById('pvp-guide-cancel')?.addEventListener('click', closePvpGuidePick);

document.getElementById('lobby-settings')?.addEventListener('click', () => {
  settingsModal.open();
});

nickInput?.addEventListener('input', () => {
  const chars = Array.from(nickInput.value);
  if (chars.length > NICKNAME_MAX) {
    nickInput.value = chars.slice(0, NICKNAME_MAX).join('');
    if (nickHint) {
      nickHint.textContent = NICKNAME_HINT;
      nickHint.classList.add('is-warn');
    }
  }
});

document.getElementById('spectate-stop')?.addEventListener('click', () => {
  soundEngine.playDoor('leave');
  exitSpectate();
});
document.getElementById('spectate-leave')?.addEventListener('click', leaveWatchedRoom);

nickSave?.addEventListener('click', saveNickname);
nickInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveNickname();
  }
});

requestAnimationFrame(frame);

window.addEventListener('offline', () => realtimeManager.noteDisconnect());
window.addEventListener('online', () => {
  realtimeManager.noteReconnect();
  if (!realtimeManager.isConnected) {
    realtimeManager.connect().then(() => {
      realtimeManager.startHeartbeat();
      publishPresence();
      syncNickField();
    }).catch(() => {});
  }
});

realtimeManager.connect().then(() => {
  sessionAcorns = writeNightAcorns(readNightAcorns());
  syncAcornHud();
  realtimeManager.startHeartbeat();
  publishPresence();
  syncNickField();
}).catch(() => {});

function seedVirtualLobby() {
  const guests = seedPlayingGuests(9);
  const added = applySeededPresence(realtimeManager, guests);
  publishPresence();
  showLobby();
  return {
    ok: added === 9 && lobbyRooms().length >= 9 && lobbyUserList.length >= 10,
    guests: added,
    rooms: lobbyRooms().length,
    users: lobbyUserList.length,
  };
}

globalThis.__dotori = {
  engine,
  renderer,
  viewport,
  settingsModal,
  turnManager,
  realtimeManager,
  soundEngine,
  powerRatioController,
  seedVirtualLobby,
  openLobbyBook,
  closeLobbyBook,
  startTutorialPlay,
  skipReadyAsk: skipReadyAskNow,
  runLobbyClinic: () => runLobbyClinic(clinicSnapshot()),
};

export { engine, renderer, viewport, settingsModal, turnManager, powerRatioController };
