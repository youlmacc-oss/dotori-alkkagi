import {
  GAME_MODE,
  GameEngine,
  PHASE,
  PULL_BLOCK_NOTICE,
  PULL_OVER_NOTICE,
  STONE_COLOR,
  defaultGameModeForLobbyCount,
  intendedGameMode,
  isOutsideInnerBoard,
  shouldApplyLobbyDefaultMode,
} from './physics/GameEngine.js';
import { TurnManager } from './ai/TurnManager.js';
import { SettingsModal } from './ui/FormationModal.js';
import { PowerRatioController } from './ui/SettingsPanel.js';
import { GUIDE_LINE_KEY, KILL_CAM, ResponsiveViewport, ThreeRenderer, shouldAttachKillCam } from './ui/ThreeRenderer.js';
import { isActionCamEnabled, isRearrangeAskEnabled, shouldBlockSettingsToLobby } from './ui/PlayPrefs.js';
import { aimChargeRatio, applyPowerFill, timerRingOffset } from './ui/HudPower.js';
import { exitGame, shouldQuitFromLobbyClose } from './ui/GameExit.js';
import { resultSubLine } from './physics/ResultBeat.js';
import { soundEngine } from './audio/SoundEngine.js';
import { RealtimeManager, bindPresenceUnload } from './network/RealtimeManager.js';
import { createRealtimeClient, readSupabaseConfig, readViteSupabaseEnv } from './network/RealtimeClient.js';
import {
  LOBBY_CAP,
  dedupePresenceUsers,
  filterOwnIdleRooms,
  idleLobbyPresence,
  mergeSelfPresence,
  applyLivePresence,
  retainKnownPeers,
  lobbySeatUsers,
  presenceFromMatch,
  presenceViewKey,
  roomTitle,
  openRoomCount,
  roomsFromPresence,
  canJoinPvpFromLobby,
  canJoinPvpRoom,
  canSpectatePvpRoom,
  isLobbyFullStatus,
  isPvpWaiting,
  SPECTATE_LOCAL_HINT,
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
  MY_NICK_LABEL,
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
  isPeerMatchStarted,
  matchPlayersFromPresence,
  overlayRoomAcorns,
  shouldFollowPeerStart,
  shouldHoldPvpStartGate,
} from './network/MatchStart.js';
import {
  canApplyRemoteBoard,
  isLaunchSync,
  isStaleEndedMatchSync,
  shouldApplyMatchSync,
  shouldFollowRemoteStart,
  shouldPublishMatchSync,
  shouldPulseMatchSync,
} from './network/MatchSync.js';
import {
  applyRoomGuest,
  applyRoomClearInvite,
  applyRoomInvite,
  applyRoomLeave,
  applyRoomRematch,
  applyRoomStart,
  incomingResetsForRematch,
  createRoomState,
  incomingClearsOpponent,
  mergeRoomState,
  pvpSeatColor,
  roomHasOpponent,
  shouldApplyRoomState,
  shouldKeepPvpRematch,
  shouldReturnToPvpWait,
  stampRoomAcorns,
} from './network/RoomState.js';
import {
  FIRST_HINT,
  PEER_REARRANGE_HINT,
  READY_ASK,
  READY_NO,
  READY_YES,
  answerReady,
  rearrangeCountHint,
  createMatchReady,
  isPeerRearranging,
  skipReadyAsk,
  stepMatchReady,
} from './network/MatchReady.js';
import {
  acornSettleKey,
  clearAcornHistory,
  settleSessionAcorns,
  shouldForfeitOnLeave,
  shouldForfeitOnOpponentGone,
  shouldSettleAcorns,
} from './network/AcornPolicy.js';
import {
  newNightUserId,
  readNightAcorns,
  readNightUserId,
  takeNightUserId,
  writeNightAcorns,
  writeNightClaim,
} from './network/NightSession.js';
import { isLiveRealtime, runLobbyClinic } from './network/LobbyClinic.js';
import { STALE_LEAVE_HINT, SWEEP_LEAVE_HINT } from './network/PresencePolicy.js';
import {
  INVITE_NICK_PLACEHOLDER,
  INVITE_ROOM_GONE_HINT,
  attemptInviteJoin,
  LOBBY_INVITE_ACCEPT,
  LOBBY_INVITE_BTN,
  LOBBY_INVITE_DECLINE,
  LOBBY_INVITE_EMPTY,
  LOBBY_INVITE_HINT,
  LOBBY_INVITE_SENT,
  canInviteLobbyUser,
  joinedMatchRoomId,
  clearInviteQuery,
  evaluateInviteJoin,
  evaluateLobbyInvite,
  findInviteRoom,
  inviteMissFallback,
  guestInviteNickname,
  idleLobbyInvitees,
  buildInviteReply,
  buildLobbyInvite,
  guestClaimHeld,
  incomingRejectsMyGuestSeat,
  INVITE_ACTION_ACCEPT,
  INVITE_ACTION_CANCEL,
  INVITE_ACTION_DECLINE,
  lobbyInviteAsk,
  pickJoinablePvp,
  roomFromInvite,
  shouldApplyInviteAccept,
  shouldApplyInviteDecline,
  shouldDismissInviteModal,
  shouldKeepHostInviteSheet,
  presenceInvitePayload,
  shouldOpenPresenceInvite,
  sentInviteFields,
  shouldRepublishOpenRoom,
  readStoredInviteRoom,
  resolveInviteRoom,
  writeStoredInviteRoom,
  inviteUrlFor,
  persistInviteNickname,
  PVP_GUIDE_ASK,
  PVP_ROOM_HINT,
  PVP_WAIT_EXPIRE_HINT,
  PVP_WAIT_EXPIRE_MS,
  readInvitePrefill,
  readInviteRoomId,
  roomOpenedAt,
  shareOrCopyInvite,
  shareViaKakaoTalk,
  shouldExpirePvpWait,
  shouldInvitePvp,
  PVP_PUBLIC_ENABLED,
} from './network/PvpInvite.js';
import {
  BOOK_SKIP_LABEL,
  BOOK_PLAY_LABEL,
  INVITE_ONLY_NOTICE,
  INVITE_ONLY_OK,
  guidePageAt,
  guidePageCount,
  hasSeenInviteOnlyNotice,
  hasSkipGuideOnConnect,
  markGuideBookSeen,
  markInviteOnlyNoticeSeen,
  renderClinicList,
  renderGuidePage,
  setSkipGuideOnConnect,
  shouldAutoOpenGuideBook,
  shouldOfferInviteOnlyNotice,
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
const inviteCopyBtn = document.getElementById('invite-copy');
const inviteShareSheet = document.getElementById('invite-share-sheet');
const inviteShareKakao = document.getElementById('invite-share-kakao');
const inviteShareApps = document.getElementById('invite-share-apps');
const inviteShareCopy = document.getElementById('invite-share-copy');
const inviteShareClose = document.getElementById('invite-share-close');
const inviteModal = document.getElementById('invite-nick-modal');
const guestNickInput = document.getElementById('guest-nickname-input');
const inviteEnterBtn = document.getElementById('btn-enter-room');
const inviteNickDesc = document.getElementById('invite-nick-desc');
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

let nightClaim = takeNightUserId({ makeId: newNightUserId });
const realtimeManager = new RealtimeManager({
  supabaseClient: createRealtimeClient(readViteSupabaseEnv()),
  channelName: 'dotori-lobby',
  userId: nightClaim.userId,
  presenceKey: nightClaim.userId,
  userCharacter: '🐶',
  nicknameStorage: globalThis.sessionStorage,
  onPresenceUpdate: (users) => {
    const mapped = users.map((u) => ({
      id: u.userId,
      userId: u.userId,
      presenceKey: u.presenceKey || u.userId,
      nickname: u.nickname,
      character: u.character,
      seat: u.seat,
      status: u.status,
      mode: u.mode,
      roomId: u.roomId,
      acorns: u.acorns,
      rearranging: Boolean(u.rearranging),
      started: Boolean(u.started),
      inviteTargetId: u.inviteTargetId || null,
      inviteAt: u.inviteAt,
      pvpOpenedAt: u.pvpOpenedAt,
      lastSeen: u.lastSeen,
      joinedAt: u.joinedAt,
      isOwner: u.userId === realtimeManager.userId,
    }));
    updateLobbyUserList(applyLivePresence(
      retainKnownPeers(lobbyUserList, mapped, {
        selfId: realtimeManager.userId,
        leftIds: realtimeManager.leftPresenceKeys(),
      }),
      selfPresence(),
    ));
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
  onPvpInvite: (payload) => {
    if (shouldApplyInviteDecline(payload, {
      myId: realtimeManager.userId,
      sentTargetId: sentLobbyInvite?.inviteTargetId,
    })) {
      sentLobbyInvite = null;
      matchRoom = applyRoomClearInvite(matchRoom);
      publishPresence();
      publishRoomState();
      return;
    }
    if (shouldApplyInviteAccept(payload, {
      myId: realtimeManager.userId,
      sentTargetId: sentLobbyInvite?.inviteTargetId,
      roomId: currentMatchRoomId(),
      inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    })) {
      applyHostAcceptedInvite(payload);
      return;
    }
    receiveLobbyInvite(payload);
  },
  onRoomState: (payload) => {
    applyIncomingRoomState(payload);
  },
  onSpectatorData: (gameState) => {
    applyIncomingMatchSync(gameState);
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
let lastLobbyViewKey = '';
let inMatchRoom = false;
let awaitingStart = false;
let matchReady = null;
let lastPublishedRearranging = false;
let activeRoomId = null;
let joiningRoom = false;
let joiningRoomId = '';
let startingPvp = false;
let matchRoom = null;
let pvpOpenedAt = null;
let pvpExpireTimer = 0;
let pendingInviteRoom = readInviteRoomId(window.location.search) || readStoredInviteRoom();
if (pendingInviteRoom) writeStoredInviteRoom(pendingInviteRoom);
let lastRoomMates = new Set();
let lastTimerSec = -1;
let sentLobbyInvite = null;
const lastSeenInviteAt = new Map();
let lastMatchSyncAt = 0;
let lastMatchSyncTs = 0;
let lastAcornSettleKey = '';

let settingsModal = null;

function applyLobbyDefaultMode(count) {
  const next = defaultGameModeForLobbyCount(count);
  if (!settingsModal) return;
  if (inMatchRoom || joiningRoom || startingPvp) {
    lastLobbyModeCount = count;
    return;
  }
  if (next == null || engine.gameMode === GAME_MODE.AI || engine.gameMode === GAME_MODE.SOLO || engine.gameMode === GAME_MODE.PVP) {
    lastLobbyModeCount = count;
    return;
  }
  if (engine.gameMode === next) {
    lastLobbyModeCount = count;
    return;
  }
  if (lastLobbyModeCount === count) return;
  if (!shouldApplyLobbyDefaultMode(engine.getSnapshot(), next, {
    inRoom: inMatchRoom,
    joining: joiningRoom,
    startingPvp,
  })) return;
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

function markSeatMine(el, mine) {
  if (!el) return;
  el.classList.toggle('is-mine', Boolean(mine));
  el.dataset.myNick = mine ? MY_NICK_LABEL : '';
}

function syncSeatNames() {
  if (engine.phase === PHASE.SPECTATING && engine.spectatorData) {
    if (seatNameBlack) seatNameBlack.textContent = engine.spectatorData.playerA || '';
    if (seatNameWhite) seatNameWhite.textContent = engine.spectatorData.playerB || '';
    markSeatMine(seatNameBlack, false);
    markSeatMine(seatNameWhite, false);
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
  const color = myStoneColor();
  const solo = engine.gameMode === GAME_MODE.SOLO;
  if (seatNameBlack) seatNameBlack.textContent = names.black;
  if (seatNameWhite) seatNameWhite.textContent = names.white;
  markSeatMine(seatNameBlack, solo || color === STONE_COLOR.BLACK);
  markSeatMine(seatNameWhite, solo || color === STONE_COLOR.WHITE);
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
  const inviteId = pendingInviteRoom || readStoredInviteRoom() || readInviteRoomId(window.location.search);
  if (inviteId && !inMatchRoom) {
    pendingInviteRoom = inviteId;
    if (guestNickInput) guestNickInput.value = nickInput.value;
    enterInviteRoom();
  }
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
  const seat = pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: currentMatchRoomId(),
  });
  return seat === STONE_COLOR.WHITE ? STONE_COLOR.WHITE : STONE_COLOR.BLACK;
}

function isMatchHost() {
  if (matchRoom?.hostId) return String(matchRoom.hostId) === String(realtimeManager.userId);
  return myStoneColor() === STONE_COLOR.BLACK;
}

function applyAcornResult(payload) {
  const settleKey = acornSettleKey({
    roomId: currentMatchRoomId(),
    matchGen: matchRoom?.matchGen,
    winner: payload?.winner,
  });
  const result = {
    mode: engine.gameMode,
    started: matchStarted,
    winner: payload?.winner,
    myColor: myStoneColor(),
    spectating: engine.phase === PHASE.SPECTATING,
    settleKey,
    lastSettledKey: lastAcornSettleKey,
  };
  if (shouldSettleAcorns(result)) lastAcornSettleKey = settleKey;
  sessionAcorns = writeNightAcorns(settleSessionAcorns(sessionAcorns, result));
  syncAcornHud();
  if (matchRoom?.roomId) publishRoomState();
}

function livePresencePool() {
  return applyLivePresence(
    [...lobbyUserList, ...Array.from(realtimeManager.onlineUsers.values())],
    selfPresence(),
  );
}

function matchPlayers() {
  return overlayRoomAcorns(
    matchPlayersFromPresence(lobbyRoomsUsers(), {
      myId: realtimeManager.userId,
      myAcorns: myAcorns(),
      mode: engine.gameMode,
      roomId: currentMatchRoomId(),
    }),
    matchRoom,
    { myId: realtimeManager.userId, myAcorns: myAcorns() },
  );
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
  if (beginMatchFromPeer()) return;
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
  if (!show) {
    stage?.classList.remove('is-rearranging');
    hint?.classList.remove('is-rearrange-count');
    if (askBox) askBox.hidden = true;
    if (inviteCopyBtn) inviteCopyBtn.hidden = true;
    return;
  }
  const view = currentReadyView();
  const pvp = engine.gameMode === GAME_MODE.PVP;
  const ready = roomHasOpponent(matchRoom) || hasPvpOpponent(matchPlayers());
  stage?.classList.toggle('is-rearranging', Boolean(view.rearranging));
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
  if (view.rearranging) {
    hintText = rearrangeCountHint(view.rearrangeCount);
    hintShow = Boolean(hintText);
  } else if (view.peerRearranging) {
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
    hint.classList.toggle('is-rearrange-count', Boolean(view.rearranging && hintShow));
    if (hintShow) hint.textContent = hintText;
  }
  syncInviteShare();
}

function peerHasStartedMatch() {
  if (matchRoom?.started && matchRoom.hostId !== realtimeManager.userId) return true;
  return isPeerMatchStarted(livePresencePool(), {
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
  });
}

function clearSentLobbyInvite() {
  sentLobbyInvite = null;
}

function publishRoomState() {
  if (!matchRoom?.roomId || !matchRoom?.hostId) return false;
  matchRoom = stampRoomAcorns(matchRoom, {
    myId: realtimeManager.userId,
    acorns: myAcorns(),
  });
  return realtimeManager.broadcastRoomState(matchRoom);
}

function syncMatchRoom(next) {
  if (!next?.roomId) return;
  matchRoom = next;
  if (roomHasOpponent(matchRoom)) clearSentLobbyInvite();
  syncInviteShare();
  syncStartGate();
}

function applyIncomingRoomState(payload) {
  if (!shouldApplyRoomState(payload, {
    myId: realtimeManager.userId,
    roomId: inMatchRoom ? currentMatchRoomId() : payload?.roomId,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
  })) return false;
  if (incomingRejectsMyGuestSeat(matchRoom, payload, realtimeManager.userId)) {
    bounceRejectedJoin();
    return true;
  }
  if (incomingClearsOpponent(matchRoom, payload)) {
    const wasStarted = matchStarted;
    const phase = engine.phase;
    syncMatchRoom(applyRoomLeave(matchRoom, { leaverId: payload?.leaverId }));
    if (shouldForfeitOnOpponentGone({
      mode: engine.gameMode,
      started: wasStarted,
      phase,
      spectating: phase === PHASE.SPECTATING,
      hadOpponent: true,
      hasOpponent: false,
    })) {
      forfeitOpponent(payload?.leaverId);
      return true;
    }
    returnToPvpWait();
    return true;
  }
  if (incomingResetsForRematch(matchRoom, payload)) {
    followPvpRematch(payload);
    return true;
  }
  const next = mergeRoomState(matchRoom, payload);
  if (!next) return false;
  syncMatchRoom(next);
  if (next.started && awaitingStart && !matchStarted) applyMatchStarted();
  return true;
}

function currentSentInvite() {
  return sentInviteFields({
    inRoom: inMatchRoom,
    started: matchStarted,
    mode: engine.gameMode,
    sent: sentLobbyInvite,
    hasOpponent: roomHasOpponent(matchRoom) || hasPvpOpponent(matchPlayersFromPresence(lobbyUserList, {
      myId: realtimeManager.userId,
      myAcorns: myAcorns(),
      mode: engine.gameMode,
      roomId: currentMatchRoomId(),
    })),
  });
}

function syncPresenceInvites(users) {
  if (inMatchRoom || engine.phase === PHASE.SPECTATING || pendingLobbyInvite) return;
  for (const user of users || []) {
    const hostId = String(user?.userId ?? user?.id ?? '');
    if (!shouldOpenPresenceInvite(user, realtimeManager.userId, lastSeenInviteAt.get(hostId) || 0)) {
      continue;
    }
    const verdict = evaluateLobbyInvite(presenceInvitePayload(user), realtimeManager.userId);
    if (!verdict.ok) continue;
    lastSeenInviteAt.set(hostId, Number(user.inviteAt) || Date.now());
    openLobbyInviteModal(verdict.invite);
    return;
  }
}

function applyMatchStarted() {
  if (!awaitingStart) return false;
  awaitingStart = false;
  matchStarted = true;
  clearSentLobbyInvite();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  clearMatchReady();
  matchRoom = applyRoomStart(matchRoom);
  soundEngine.playStart();
  syncStartGate();
  syncSceneMode();
  renderer.snapSeat(engine.getSnapshot());
  publishPresence();
  publishRoomState();
  publishMatchSync({ force: true, event: 'start' });
  return true;
}

function publishMatchSync({ force = false, event = '', launch = null } = {}) {
  const watching = engine.phase === PHASE.SPECTATING;
  const pvpLive = engine.gameMode === GAME_MODE.PVP && inMatchRoom && !watching;
  if (!shouldPublishMatchSync({
    inPvp: pvpLive,
    isHost: isMatchHost(),
    force,
    event,
  })) return false;
  if (!force && awaitingStart) return false;
  const now = Date.now();
  if (!force && now - lastMatchSyncAt < 180) return false;
  lastMatchSyncAt = now;
  return realtimeManager.broadcastSpectatorData({
    ...engine.getSnapshot(),
    stones: engine.stones,
    matchId: currentMatchRoomId(),
    roomId: currentMatchRoomId(),
    senderId: realtimeManager.userId,
    started: matchStarted,
    timestamp: now,
    event,
    kind: event === 'launch' ? 'launch' : 'board',
    launch,
    stoneId: launch?.stoneId,
    velocity: launch?.velocity,
    force: launch?.force,
    power: launch?.power,
    color: launch?.color,
  });
}

function applyIncomingMatchSync(payload) {
  const spectating = engine.phase === PHASE.SPECTATING;
  if (!shouldApplyMatchSync(payload, {
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
    lastTs: lastMatchSyncTs,
    spectating,
    inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP,
  })) return false;
  if (isStaleEndedMatchSync({
    awaitingStart,
    started: matchStarted,
    remotePhase: payload?.phase,
    remoteWinner: payload?.winner,
  })) return false;
  if (shouldFollowRemoteStart({
    awaitingStart,
    started: matchStarted,
    remoteStarted: payload?.started === true,
    mode: engine.gameMode,
    remotePhase: payload?.phase,
    remoteWinner: payload?.winner,
  })) {
    applyMatchStarted();
  }
  if (isLaunchSync(payload)) {
    lastMatchSyncTs = Number(payload?.timestamp) || lastMatchSyncTs;
    if (spectating) return false;
    const launched = engine.applyRemoteLaunch(payload);
    if (launched) flushMatchView();
    return launched;
  }
  if (!spectating && !canApplyRemoteBoard({
    localPhase: engine.phase,
    remotePhase: payload?.phase,
    localTurn: engine.currentTurn,
    remoteTurn: payload?.currentTurn,
    remoteEvent: payload?.event,
  })) return false;
  lastMatchSyncTs = Number(payload?.timestamp) || lastMatchSyncTs;
  const applied = spectating
    ? engine.updateSpectatorState(payload)
    : engine.applyRemoteMatchState(payload);
  if (applied) flushMatchView();
  return applied;
}

function flushMatchView() {
  const snap = engine.getSnapshot();
  renderer.draw(snap);
  syncHud(snap);
  syncStartGate();
}

function beginMatchIfAllowed() {
  if (!awaitingStart || !canStartNow()) return false;
  return applyMatchStarted();
}

function beginMatchFromPeer() {
  if (!shouldFollowPeerStart({
    awaitingStart,
    started: matchStarted,
    peerStarted: peerHasStartedMatch(),
    mode: engine.gameMode,
  })) return false;
  return applyMatchStarted();
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
  // [PVP 공개 중단] 1:1 대기 점멸 안내. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED && line.blink) {
    guide.textContent = rooms.length ? LOCATION_GUIDE : line.text;
    guide.classList.remove('is-wait-blink');
    return;
  }
  guide.textContent = line.text;
  guide.classList.toggle('is-wait-blink', line.blink);
}

function syncPvpInvite() {
  const pvpBtn = document.getElementById('lobby-mode-pvp');
  // [PVP 공개 중단] 1:1 버튼 점멸. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) {
    pvpBtn?.classList.remove('is-invite-blink');
    return;
  }
  const invite = shouldInvitePvp(lobbyRoomsUsers().length);
  pvpBtn?.classList.toggle('is-invite-blink', invite);
}

function closePvpGuidePick() {
  const pick = document.getElementById('pvp-guide-pick');
  if (pick) pick.hidden = true;
}

function openPvpGuidePick() {
  // [PVP 공개 중단] 가이드선 선택 팝업. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  const pick = document.getElementById('pvp-guide-pick');
  const ask = document.getElementById('pvp-guide-ask');
  if (ask) ask.textContent = PVP_GUIDE_ASK;
  if (pick) pick.hidden = false;
}

function confirmPvpGuide(enabled) {
  settingsModal?.setGuideEnabled(enabled);
  closePvpGuidePick();
  startOwnPvpRoom();
}

function startOwnPvpRoom() {
  // [PVP 공개 중단] 1:1 방 개설. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  startingPvp = true;
  try {
    settingsModal?.setGameMode(GAME_MODE.PVP, { startMatch: true });
    if (engine.gameMode !== GAME_MODE.PVP) {
      engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
    }
  } finally {
    startingPvp = false;
  }
}

function refreshLobbyPresence({ reconnect = false, publish = false } = {}) {
  if (realtimeManager.isConnected && !realtimeManager.channelNeedsReconnect()) {
    realtimeManager.resyncPresence({ force: true });
    if (publish) publishPresence();
    return;
  }
  if (reconnect && !realtimeManager._connecting) bootRealtime();
}

function showLobby() {
  lobbyVisible = true;
  lobbyUsers.hidden = false;
  syncNickField();
  refreshLobbyPresence({ reconnect: true, publish: true });
  renderLobby();
  syncSceneMode();
  if (shouldAutoOpenGuideBook() && !pendingInviteRoom) {
    bookOpenedByConnect = true;
    openLobbyBookSheet('guide');
    return;
  }
  // [PVP 공개 중단] 초대만 안내 팝업. 재개 시 아래 가드를 제거
  if (PVP_PUBLIC_ENABLED) offerInviteOnlyNotice({ guidebookSkippedOnConnect: hasSkipGuideOnConnect() });
}

function hideLobby({ force = false } = {}) {
  if (!inMatchRoom && !force) {
    showLobby();
    return;
  }
  closeLobbyBook();
  closeInviteOnlyNotice();
  closeLobbyInviteModal();
  closePvpGuidePick();
  lobbyVisible = false;
  lobbyUsers.hidden = true;
  syncSceneMode();
}

let bookPage = 0;
let bookTab = 'guide';
let bookOpenedByConnect = false;
let inviteOnlyNoticeShown = false;
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
    liveConfigured: readSupabaseConfig(readViteSupabaseEnv()).live,
    realtimeLive: isLiveRealtime(realtimeManager.supabaseClient),
    connected: Boolean(realtimeManager.isConnected),
    lobbyCap: LOBBY_CAP,
    hasInviteCopy: Boolean(inviteCopyBtn && inviteShareKakao),
    hasInviteNick: Boolean(inviteModal && guestNickInput && inviteEnterBtn),
    hasLobbyInvite: Boolean(document.getElementById('invite-lobby-list')),
    hasLobbyInviteModal: Boolean(document.getElementById('lobby-invite-modal') && document.getElementById('lobby-invite-accept')),
    hasInviteOnlyNotice: Boolean(document.getElementById('invite-only-notice') && document.getElementById('invite-only-ok')),
    hasBookSkip: Boolean(document.getElementById('lobby-book-skip')),
    hasBookPlay: Boolean(document.getElementById('lobby-book-play')),
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
  const playBtn = document.getElementById('lobby-book-play');
  const dock = document.getElementById('lobby-book-dock');
  const skip = document.getElementById('lobby-book-skip');
  const skipLabel = document.getElementById('lobby-book-skip-text');
  if (dock) dock.hidden = bookTab !== 'guide';
  if (startBtn) startBtn.hidden = bookTab !== 'guide';
  if (playBtn) {
    playBtn.hidden = bookTab !== 'guide';
    playBtn.textContent = BOOK_PLAY_LABEL;
  }
  if (skipLabel) skipLabel.textContent = BOOK_SKIP_LABEL;
  if (skip) skip.checked = hasSkipGuideOnConnect();
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
  const book = document.getElementById('lobby-book');
  if (book?.hidden !== false) bookOpenedByConnect = false;
  if (!lobbyVisible) {
    lobbyVisible = true;
    lobbyUsers.hidden = false;
    syncNickField();
    renderLobby();
    syncSceneMode();
  }
  openLobbyBookSheet(tab);
}

function closeLobbyBook({ offerNotice = false } = {}) {
  const book = document.getElementById('lobby-book');
  const wasOpen = Boolean(book && !book.hidden);
  if (book) book.hidden = true;
  // [PVP 공개 중단] 가이드 닫힘 후 초대만 안내. 재개 시 아래 가드를 제거
  if (PVP_PUBLIC_ENABLED && offerNotice && wasOpen) {
    offerInviteOnlyNotice({ guidebookClosed: bookOpenedByConnect });
  }
}

function closeInviteOnlyNotice() {
  const root = document.getElementById('invite-only-notice');
  if (root) root.hidden = true;
  markInviteOnlyNoticeSeen();
}

function offerInviteOnlyNotice(reason = {}) {
  // [PVP 공개 중단] 초대만 안내 팝업. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return false;
  if (!shouldOfferInviteOnlyNotice({
    alreadyShown: inviteOnlyNoticeShown || hasSeenInviteOnlyNotice(),
    inviteJoin: Boolean(pendingInviteRoom),
    ...reason,
  })) return false;
  const root = document.getElementById('invite-only-notice');
  const text = document.getElementById('invite-only-text');
  const ok = document.getElementById('invite-only-ok');
  if (text) text.textContent = INVITE_ONLY_NOTICE;
  if (ok) ok.textContent = INVITE_ONLY_OK;
  if (root) root.hidden = false;
  inviteOnlyNoticeShown = true;
  bookOpenedByConnect = false;
  return true;
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
    livePresencePool()
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
  const lost = [...lastRoomMates].filter((id) => !next.has(id));
  if (playDiff && engine.phase !== PHASE.SPECTATING) {
    for (const id of next) {
      if (!lastRoomMates.has(id)) soundEngine.playDoor('enter');
    }
    for (const id of lost) soundEngine.playDoor('leave');
  }
  const hadOpponent = lastRoomMates.size > 0 || roomHasOpponent(matchRoom);
  lastRoomMates = next;
  if (playDiff && lost.length) {
    const gone = {
      inRoom: inMatchRoom,
      mode: engine.gameMode,
      spectating: engine.phase === PHASE.SPECTATING,
      hadOpponent,
      hasOpponent: next.size > 0,
      started: matchStarted,
      phase: engine.phase,
    };
    if (shouldForfeitOnOpponentGone(gone)) {
      forfeitOpponent(lost[0]);
      return;
    }
    if (shouldReturnToPvpWait(gone)) returnToPvpWait();
  }
}

function syncPvpWait() {
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom || engine.phase === PHASE.SPECTATING) return;
  if (beginMatchFromPeer()) return;
  if (shouldHoldPvpStartGate({
    started: matchStarted,
    hasOpponent: roomHasOpponent(matchRoom) || hasPvpOpponent(matchPlayers()),
  })) {
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
  clearSentLobbyInvite();
  const joinedId = joinedMatchRoomId({
    joiningRoomId,
    joining: joiningRoom,
    myId: realtimeManager.userId,
  });
  if (joinedId) activeRoomId = joinedId;
  if (!joiningRoom && !joiningRoomId) {
    pendingInviteRoom = '';
    writeStoredInviteRoom('');
    matchRoom = createRoomState({
      roomId: activeRoomId,
      hostId: realtimeManager.userId,
      hostName: realtimeManager.userNickname,
    });
    publishRoomState();
  }
  beginMatchReady();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  syncNickLock();
  syncLobbyLeaveBtn();
  syncSceneMode();
  soundEngine.playDoor('enter');
  noteRoomMates(false);
  markPvpRoomOpened();
  armPvpWaitExpire();
  publishPresence();
  publishMatchSync({ force: true });
}

function handleSweepLeave() {
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  lastLobbyViewKey = '';
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  setTicker(SWEEP_LEAVE_HINT);
  showLobby();
  syncNickField();
}

function handleStaleLeave() {
  if (shouldForfeitOnLeave({
    mode: engine.gameMode,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
    phase: engine.phase,
  })) {
    publishRoomLeave();
  }
  stopTutorial('leave');
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  lobbyUserList = [];
  lastLobbyViewKey = '';
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  setTicker(STALE_LEAVE_HINT);
  showLobby();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  realtimeManager.connect().then(() => {
    realtimeManager.startHeartbeat();
    publishPresence();
    syncNickField();
  }).catch(() => {});
}

function returnToPvpWait() {
  if (!inMatchRoom || engine.gameMode !== GAME_MODE.PVP || engine.phase === PHASE.SPECTATING) {
    return false;
  }
  const me = realtimeManager.userId;
  const already = awaitingStart
    && !matchStarted
    && !roomHasOpponent(matchRoom)
    && matchRoom?.hostId === me;
  if (already) return false;
  hideResult();
  suppressResult = true;
  matchStarted = false;
  awaitingStart = true;
  clearSentLobbyInvite();
  clearMatchReady();
  joiningRoomId = '';
  joiningRoom = false;
  if (!matchRoom || matchRoom.hostId !== me) {
    activeRoomId = `room_${me}`;
    matchRoom = createRoomState({
      roomId: activeRoomId,
      hostId: me,
      hostName: realtimeManager.userNickname,
    });
  } else {
    matchRoom = applyRoomLeave(matchRoom, { leaverId: matchRoom.guestId });
  }
  engine.setHost(true);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.snapSeat(engine.getSnapshot());
  markPvpRoomOpened();
  armPvpWaitExpire();
  syncSceneMode();
  syncStartGate();
  publishRoomState();
  publishPresence();
  suppressResult = false;
  return true;
}

function forfeitOpponent(leaverId) {
  if (engine.phase === PHASE.GAME_OVER || engine.phase === PHASE.SPECTATING) return false;
  const who = String(leaverId || '');
  const leaverColor = who && matchRoom?.hostId && who === matchRoom.hostId
    ? STONE_COLOR.BLACK
    : STONE_COLOR.WHITE;
  return engine.surrender(leaverColor);
}

function restartPvpRematch() {
  if (!shouldKeepPvpRematch({
    mode: engine.gameMode,
    inRoom: inMatchRoom,
    roomId: matchRoom?.roomId,
    hostId: matchRoom?.hostId,
    guestId: matchRoom?.guestId,
  })) {
    enterMatchRoom();
    engine.setMatchConfig({ mode: engine.gameMode, difficulty: engine.aiDifficulty });
    renderer.resetFx();
    matchBadge.textContent = '흑 턴 15';
    return false;
  }
  joiningRoomId = matchRoom.hostId === realtimeManager.userId ? '' : matchRoom.roomId;
  joiningRoom = Boolean(joiningRoomId);
  matchRoom = applyRoomRematch(matchRoom);
  awaitingStart = true;
  matchStarted = false;
  lastMatchSyncTs = 0;
  lastAcornSettleKey = '';
  inMatchRoom = true;
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom.hostId,
    roomId: matchRoom.roomId,
  }) === STONE_COLOR.BLACK);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.resetFx();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  matchBadge.textContent = '흑 턴 15';
  syncStartGate();
  syncSceneMode();
  publishRoomState();
  publishPresence();
  joiningRoom = false;
  return true;
}

function followPvpRematch(payload) {
  syncMatchRoom(applyRoomRematch({
    ...matchRoom,
    ...payload,
    roomId: matchRoom?.roomId || payload?.roomId,
    hostId: matchRoom?.hostId || payload?.hostId,
    guestId: matchRoom?.guestId || payload?.guestId,
  }));
  hideResult();
  awaitingStart = true;
  matchStarted = false;
  lastMatchSyncTs = 0;
  lastAcornSettleKey = '';
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: matchRoom?.roomId,
  }) === STONE_COLOR.BLACK);
  engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
  beginMatchReady();
  renderer.resetFx();
  renderer.snapSeat(engine.getSnapshot());
  hideLobby({ force: true });
  matchBadge.textContent = '흑 턴 15';
  syncStartGate();
  syncSceneMode();
  publishRoomState();
  publishPresence();
  return true;
}

function publishRoomLeave() {
  if (!matchRoom?.roomId) return false;
  matchRoom = applyRoomLeave(matchRoom, { leaverId: realtimeManager.userId });
  return publishRoomState();
}

function leaveToWaitingRoom() {
  if (engine.phase === PHASE.SPECTATING) {
    leaveWatchedRoom();
    return;
  }
  const tutorialWas = Boolean(tutorial.active);
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
  publishRoomLeave();
  hideResult();
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  lastAcornSettleKey = '';
  clearMatchReady();
  activeRoomId = null;
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  soundEngine.playDoor('leave');
  settingsModal?.setGameMode(GAME_MODE.AI, { startMatch: false });
  publishIdleLobby();
  showLobby();
  if (tutorialWas) offerInviteOnlyNotice({ tutorialSkipped: true });
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
  joiningRoomId = '';
  matchRoom = null;
  lastRoomMates = new Set();
  pvpOpenedAt = null;
  clearPvpWaitExpire();
  soundEngine.playDoor('leave');
  exitSpectate();
  showLobby();
}

function resolveJoinablePvp(room, invite) {
  const id = room?.id || invite?.roomId;
  return pickJoinablePvp([
    lobbyRooms().find((r) => r.id === id),
    resolveInviteRoom(lobbyRoomsUsers(), id),
    findInviteRoom(roomsFromPresence(lobbyRoomsUsers()), id),
    roomFromInvite(invite),
    room,
  ], realtimeManager.userId);
}

function applyHostAcceptedInvite(payload) {
  if (!inMatchRoom || engine.phase === PHASE.SPECTATING) return false;
  const next = applyRoomGuest(matchRoom || createRoomState({
    roomId: payload?.roomId || currentMatchRoomId(),
    hostId: realtimeManager.userId,
    hostName: realtimeManager.userNickname,
  }), {
    guestId: payload?.targetId,
    guestName: payload?.guestName,
  });
  if (!roomHasOpponent(next)) return false;
  syncMatchRoom(next);
  clearSentLobbyInvite();
  publishPresence();
  publishRoomState();
  syncPvpWait();
  return true;
}

function enterJoinedPvp(room) {
  joiningRoom = true;
  startingPvp = true;
  joiningRoomId = room.id;
  activeRoomId = room.id;
  engine.setHost(false);
  try {
    settingsModal.setGameMode(GAME_MODE.PVP, { startMatch: true });
    if (engine.gameMode !== GAME_MODE.PVP) {
      engine.setMatchConfig({ mode: GAME_MODE.PVP, difficulty: engine.aiDifficulty });
    }
  } finally {
    joiningRoom = false;
    startingPvp = false;
  }
  publishPresence();
  const hostId = room.hostId || String(room.id || '').replace(/^room_/, '');
  matchRoom = applyRoomGuest(matchRoom || createRoomState({
    roomId: room.id,
    hostId,
    hostName: room.hostName,
  }), {
    guestId: realtimeManager.userId,
    guestName: realtimeManager.userNickname,
  });
  engine.setHost(pvpSeatColor({
    myId: realtimeManager.userId,
    hostId: matchRoom?.hostId,
    roomId: matchRoom?.roomId || room.id,
  }) === STONE_COLOR.BLACK);
  renderer.snapSeat(engine.getSnapshot());
  if (!guestClaimHeld(matchRoom, realtimeManager.userId)) {
    bounceRejectedJoin();
    return false;
  }
  publishRoomState();
  return inMatchRoom && activeRoomId === room.id && engine.gameMode === GAME_MODE.PVP;
}

function bounceRejectedJoin() {
  joiningRoom = false;
  joiningRoomId = '';
  inMatchRoom = false;
  awaitingStart = false;
  matchStarted = false;
  matchRoom = null;
  activeRoomId = null;
  lastRoomMates = new Set();
  setTicker(INVITE_ROOM_GONE_HINT);
  publishIdleLobby();
  showLobby();
}

function joinPvpRoom(room, invite) {
  // [PVP 공개 중단] 대기실 참가. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return false;
  let live = resolveJoinablePvp(room, invite);
  if (!canJoinPvpRoom(live, realtimeManager.userId)) {
    refreshLobbyPresence({ reconnect: false });
    live = resolveJoinablePvp(room, invite);
  }
  if (!canJoinPvpRoom(live, realtimeManager.userId)) {
    setTicker(INVITE_ROOM_GONE_HINT);
    return false;
  }
  return enterJoinedPvp(live);
}

function inviteHostState(users = lobbyRoomsUsers()) {
  return {
    mode: engine.gameMode,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    started: matchStarted,
    isHost: currentMatchRoomId() === `room_${realtimeManager.userId}`,
    users,
    myId: realtimeManager.userId,
    roomId: currentMatchRoomId(),
    myAcorns: myAcorns(),
    hasOpponent: roomHasOpponent(matchRoom) || hasPvpOpponent(matchPlayersFromPresence(users, {
      myId: realtimeManager.userId,
      myAcorns: myAcorns(),
      mode: engine.gameMode,
      roomId: currentMatchRoomId(),
    })),
  };
}

function hostWaitingForInvite() {
  return shouldKeepHostInviteSheet({
    room: matchRoom,
    myId: realtimeManager.userId,
    inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
    mode: engine.gameMode,
    hasOpponent: roomHasOpponent(matchRoom) || hasPvpOpponent(matchPlayers()),
  });
}

function currentPvpOpenedAt() {
  return roomOpenedAt(lobbyUserList, currentMatchRoomId(), pvpOpenedAt);
}

function clearPvpWaitExpire() {
  if (pvpExpireTimer) clearTimeout(pvpExpireTimer);
  pvpExpireTimer = 0;
}

function markPvpRoomOpened() {
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom || matchStarted) {
    if (matchStarted || engine.gameMode !== GAME_MODE.PVP) pvpOpenedAt = null;
    return;
  }
  pvpOpenedAt = currentPvpOpenedAt() || pvpOpenedAt || Date.now();
}

function armPvpWaitExpire() {
  clearPvpWaitExpire();
  if (engine.gameMode !== GAME_MODE.PVP || !inMatchRoom || matchStarted) return;
  markPvpRoomOpened();
  const opened = currentPvpOpenedAt();
  if (!opened) return;
  const wait = Math.max(0, PVP_WAIT_EXPIRE_MS - (Date.now() - opened));
  pvpExpireTimer = setTimeout(() => expirePvpWait(), wait);
}

function expirePvpWait() {
  if (!shouldExpirePvpWait({
    mode: engine.gameMode,
    openedAt: currentPvpOpenedAt(),
    started: matchStarted,
  })) return;
  leaveToWaitingRoom();
  setTicker(PVP_WAIT_EXPIRE_HINT);
}

function syncInviteShare() {
  const show = hostWaitingForInvite();
  if (inviteCopyBtn) inviteCopyBtn.hidden = !show;
  if (!show) closeInviteShareSheet();
}

function currentInviteUrl() {
  return inviteUrlFor(currentMatchRoomId(), window.location);
}

function renderLobbyInviteList({ refresh = false } = {}) {
  const list = document.getElementById('invite-lobby-list');
  const hint = document.getElementById('invite-lobby-hint');
  if (hint) hint.textContent = LOBBY_INVITE_HINT;
  if (!list) return;
  list.innerHTML = '';
  if (refresh) realtimeManager.resyncPresence({ force: true });
  const guests = idleLobbyInvitees(
    applyLivePresence(
      [...lobbyUserList, ...Array.from(realtimeManager.onlineUsers.values())],
      selfPresence(),
    ),
    realtimeManager.userId,
  );
  if (!guests.length) {
    const empty = document.createElement('p');
    empty.className = 'invite-lobby-empty';
    empty.textContent = LOBBY_INVITE_EMPTY;
    list.appendChild(empty);
    return;
  }
  guests.forEach((user) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'invite-lobby-user';
    row.textContent = `${user.nickname || '손님'} · ${LOBBY_INVITE_BTN}`;
    row.addEventListener('click', () => sendLobbyInvite(user));
    list.appendChild(row);
  });
}

function openInviteShareSheet() {
  // [PVP 공개 중단] 초대 링크 시트. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  if (!hostWaitingForInvite() || !inviteShareSheet) return;
  refreshLobbyPresence({ reconnect: true });
  renderLobbyInviteList({ refresh: true });
  inviteShareSheet.hidden = false;
}

function closeInviteShareSheet() {
  if (inviteShareSheet) inviteShareSheet.hidden = true;
}

function openInviteNickModal(roomId) {
  // [PVP 공개 중단] 초대 링크 닉 입력. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  pendingInviteRoom = roomId;
  writeStoredInviteRoom(roomId);
  if (inviteNickDesc) {
    inviteNickDesc.textContent = `[방 코드: ${roomId}] 방으로 입장합니다. 사용할 닉네임을 입력해 주세요.`;
  }
  if (guestNickInput) {
    guestNickInput.placeholder = INVITE_NICK_PLACEHOLDER;
    guestNickInput.value = String(readInvitePrefill(realtimeManager.nicknameStorage) || '').slice(0, 5);
  }
  if (inviteModal) inviteModal.hidden = false;
  hideLobby({ force: true });
  queueMicrotask(() => guestNickInput?.focus());
}

function closeInviteNickModal() {
  if (inviteModal) inviteModal.hidden = true;
}

let pendingLobbyInvite = null;

function closeLobbyInviteModal() {
  pendingLobbyInvite = null;
  const modal = document.getElementById('lobby-invite-modal');
  if (modal) modal.hidden = true;
}

function openLobbyInviteModal(invite) {
  // [PVP 공개 중단] 수락/거절 팝업. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  pendingLobbyInvite = invite;
  const modal = document.getElementById('lobby-invite-modal');
  const ask = document.getElementById('lobby-invite-ask');
  const accept = document.getElementById('lobby-invite-accept');
  const decline = document.getElementById('lobby-invite-decline');
  if (ask) ask.textContent = lobbyInviteAsk(invite.hostName);
  if (accept) accept.textContent = LOBBY_INVITE_ACCEPT;
  if (decline) decline.textContent = LOBBY_INVITE_DECLINE;
  if (modal) modal.hidden = false;
}

function receiveLobbyInvite(payload) {
  if (shouldDismissInviteModal(pendingLobbyInvite, payload, realtimeManager.userId)) {
    closeLobbyInviteModal();
    return;
  }
  const verdict = evaluateLobbyInvite(payload, realtimeManager.userId);
  if (!verdict.ok) return;
  if (inMatchRoom || engine.phase === PHASE.SPECTATING) return;
  openLobbyInviteModal(verdict.invite);
}

async function sendLobbyInvite(target) {
  // [PVP 공개 중단] 대기실 초대 전송. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return;
  if (!canInviteLobbyUser({ ...inviteHostState(), target })) return;
  const payload = buildLobbyInvite({
    roomId: currentMatchRoomId(),
    hostId: realtimeManager.userId,
    hostName: realtimeManager.userNickname,
    targetId: target.userId ?? target.id,
  });
  const prevTarget = sentLobbyInvite?.inviteTargetId;
  if (prevTarget && prevTarget !== payload.targetId) {
    void realtimeManager.broadcastPvpInvite(buildInviteReply({
      roomId: payload.roomId,
      hostId: payload.hostId,
      targetId: prevTarget,
    }, INVITE_ACTION_CANCEL));
  }
  sentLobbyInvite = { inviteTargetId: payload.targetId, inviteAt: Date.now() };
  matchRoom = applyRoomInvite(matchRoom || createRoomState({
    roomId: payload.roomId,
    hostId: payload.hostId,
    hostName: payload.hostName,
  }), payload.targetId);
  let ok = await realtimeManager.broadcastPvpInvite(payload);
  if (!ok) ok = await realtimeManager.broadcastPvpInvite(payload);
  void publishPresence();
  void publishRoomState();
  if (ok) setTicker(LOBBY_INVITE_SENT);
}

async function announceInviteAccept(invite) {
  if (!invite?.roomId || !invite?.hostId) return false;
  const reply = buildInviteReply(invite, INVITE_ACTION_ACCEPT, {
    guestName: realtimeManager.userNickname,
  });
  let ok = await realtimeManager.broadcastPvpInvite(reply);
  if (!ok) ok = await realtimeManager.broadcastPvpInvite(reply);
  void publishPresence();
  void publishRoomState();
  return ok;
}

async function acceptLobbyInvite() {
  const invite = pendingLobbyInvite;
  const result = await attemptInviteJoin({
    roomId: invite?.roomId,
    join: (roomId) => joinRoom(roomId, { invite }),
    refresh: () => refreshLobbyPresence({ reconnect: false, publish: true }),
  });
  closeLobbyInviteModal();
  if (result.ok) void announceInviteAccept(invite);
  if (!result.ok) setTicker(INVITE_ROOM_GONE_HINT);
}

function joinRoom(roomId, extras = {}) {
  // [PVP 공개 중단] 초대 방 입장. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return false;
  if (extras.nickname != null) {
    const named = guestInviteNickname(
      extras.nickname,
      lobbyUserList.filter((u) => (u.userId ?? u.id) !== realtimeManager.userId),
      realtimeManager.userId,
    );
    realtimeManager.setDisplayNickname(named.nickname);
    persistInviteNickname(named.nickname, realtimeManager.nicknameStorage);
    syncNickField();
  }
  const room = pickJoinablePvp([
    resolveInviteRoom(lobbyRoomsUsers(), roomId),
    findInviteRoom(roomsFromPresence(lobbyRoomsUsers()), roomId),
    roomFromInvite(extras.invite || { roomId, hostId: extras.hostId, hostName: extras.hostName }),
  ], realtimeManager.userId);
  if (!room) return false;
  if (room.hostId === realtimeManager.userId) {
    joiningRoom = false;
    activeRoomId = room.id;
    startOwnPvpRoom();
    return engine.gameMode === GAME_MODE.PVP;
  }
  const verdict = evaluateInviteJoin(room, realtimeManager.userId);
  if (!verdict.ok) return false;
  return joinPvpRoom(verdict.room, extras.invite);
}

async function enterInviteRoom() {
  // [PVP 공개 중단] 초대 링크 입장. 재개 시 아래 가드를 제거
  if (!PVP_PUBLIC_ENABLED) return false;
  const roomId = pendingInviteRoom || readStoredInviteRoom() || readInviteRoomId(window.location.search);
  if (!roomId) return false;
  pendingInviteRoom = roomId;
  writeStoredInviteRoom(roomId);
  const rawNick = guestNickInput?.value || nickInput?.value;
  const named = guestInviteNickname(
    rawNick,
    lobbyUserList.filter((u) => (u.userId ?? u.id) !== realtimeManager.userId),
    realtimeManager.userId,
  );
  persistInviteNickname(named.nickname, realtimeManager.nicknameStorage);
  realtimeManager.setDisplayNickname(named.nickname);
  syncNickField();
  if (nickInput) nickInput.value = named.nickname;
  const started = Date.now();
  while (Date.now() - started < 12000) {
    if (realtimeManager.isConnected && joinRoom(roomId, { nickname: named.nickname, role: 'guest' })) {
      closeInviteNickModal();
      clearInviteQuery(window);
      writeStoredInviteRoom('');
      pendingInviteRoom = '';
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  enterLobbyAfterInviteMiss();
  return false;
}

function enterLobbyAfterInviteMiss() {
  const miss = inviteMissFallback(false);
  closeInviteNickModal();
  clearInviteQuery(window);
  writeStoredInviteRoom('');
  pendingInviteRoom = '';
  if (miss.hint) setTicker(miss.hint);
  showLobby();
}

async function copyInviteLink() {
  if (!hostWaitingForInvite()) return;
  openInviteShareSheet();
}

async function shareInviteToKakao() {
  if (!hostWaitingForInvite()) return;
  const result = await shareViaKakaoTalk(currentInviteUrl());
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

async function shareInviteToApps() {
  if (!hostWaitingForInvite()) return;
  const result = await shareOrCopyInvite(currentInviteUrl());
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

async function copyInviteUrlOnly() {
  if (!hostWaitingForInvite()) return;
  const result = await shareOrCopyInvite(currentInviteUrl(), { share: null });
  closeInviteShareSheet();
  if (result.hint) setTicker(result.hint);
}

function selfPresence() {
  const snap = engine.getSnapshot();
  const watching = snap.phase === PHASE.SPECTATING;
  return {
    ...presenceFromMatch({
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
    started: matchStarted,
    ended: snap.phase === PHASE.GAME_OVER,
    ...currentSentInvite(),
    pvpOpenedAt: snap.gameMode === GAME_MODE.PVP && inMatchRoom && !matchStarted
      ? currentPvpOpenedAt()
      : null,
    }),
    presenceKey: realtimeManager.presenceKey || realtimeManager.userId,
  };
}

function publishPresence() {
  const next = selfPresence();
  const tracked = realtimeManager.updatePresence(next);
  updateLobbyUserList(mergeSelfPresence(lobbyUserList, next));
  return tracked;
}

function publishIdleLobby() {
  const next = idleLobbyPresence({
    userId: realtimeManager.userId,
    nickname: realtimeManager.userNickname,
    character: realtimeManager.userCharacter,
    acorns: myAcorns(),
  });
  realtimeManager.updatePresence({
    ...next,
    status: 'lobby',
    mode: null,
    roomId: null,
    rearranging: false,
    started: false,
    inviteTargetId: null,
    inviteAt: null,
    pvpOpenedAt: null,
  });
  clearSentLobbyInvite();
  updateLobbyUserList(mergeSelfPresence(lobbyUserList, next));
}

function lobbyRooms() {
  return filterOwnIdleRooms(
    roomsFromPresence(lobbyRoomsUsers()),
    realtimeManager.userId,
    inMatchRoom,
  );
}

function updateLobbyUserList(users) {
  const next = dedupePresenceUsers(users).slice(0, LOBBY_CAP);
  const key = `${presenceViewKey(next)}#${roomsFromPresence(next).map((r) => r.id).sort().join(',')}`;
  const same = key === lastLobbyViewKey && lastLobbyViewKey !== '';
  lobbyUserList = next;
  lastLobbyViewKey = key;
  syncPresenceInvites(next);
  syncInviteShare();
  if (inviteShareSheet && !inviteShareSheet.hidden) renderLobbyInviteList({ refresh: false });
  if (same) {
    beginMatchFromPeer();
    syncPvpWait();
    syncStartGate();
    if (lobbyVisible) {
      syncLobbyRoomCount();
      syncLobbyWaitGuide();
      syncPvpInvite();
    }
    return;
  }
  noteRoomMates(true);
  syncPvpWait();
  if (lobbyVisible) renderLobby();
  else syncLobbyRoomCount();
  applyLobbyDefaultMode(lobbyUserList.length);
  syncStartGate();
  if (inMatchRoom && engine.gameMode === GAME_MODE.PVP && !matchStarted) {
    const shared = currentPvpOpenedAt();
    if (shared && shared !== pvpOpenedAt) pvpOpenedAt = shared;
    armPvpWaitExpire();
  }
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
    status.className = (PVP_PUBLIC_ENABLED && isPvpWaiting(room)) ? 'lobby-room-status is-wait-blink' : 'lobby-room-status';
    status.textContent = roomStatusLabel(room);
    info.appendChild(name);
    info.appendChild(status);

    const watch = document.createElement('button');
    watch.type = 'button';
    watch.className = 'spectate-btn';
    if (PVP_PUBLIC_ENABLED && canJoinPvpFromLobby(room, realtimeManager.userId)) {
      watch.textContent = '참가하기';
      const enter = () => joinPvpRoom(room);
      watch.addEventListener('click', (event) => {
        event.stopPropagation();
        enter();
      });
      row.addEventListener('click', enter);
    } else {
      watch.textContent = '관람하기';
      watch.addEventListener('click', () => {
        if (!canSpectatePvpRoom(room)) {
          setTicker(SPECTATE_LOCAL_HINT);
          return;
        }
        enterSpectateRoom(room);
      });
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

  sortBySeat(lobbySeatUsers(lobbyUserList)).forEach((user) => {
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

    const inviteTarget = canInviteLobbyUser({
      ...inviteHostState(),
      target: user,
    });
    const statusEl = document.createElement(inviteTarget ? 'button' : 'div');
    statusEl.className = inviteTarget ? 'lobby-user-status lobby-user-invite' : 'lobby-user-status';
    statusEl.textContent = inviteTarget ? LOBBY_INVITE_BTN : presenceStatusLabel(user, rooms);
    if (inviteTarget) {
      statusEl.type = 'button';
      statusEl.addEventListener('click', () => sendLobbyInvite(user));
    }

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
  publishMatchSync({ force: true });
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
  if (payload?.remote) return;
  publishMatchSync({ force: true, event: 'launch', launch: payload });
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
  publishMatchSync({ force: true, event: 'turnEnd' });
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
  publishMatchSync({ force: true, event: 'gameOver' });
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
  publishMatchSync();
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
      joiningRoomId = '';
      matchRoom = null;
      pvpOpenedAt = null;
      clearPvpWaitExpire();
      publishIdleLobby();
      showLobby();
    } else {
      const mode = intendedGameMode(payload?.mode);
      if (payload?.mode && engine.gameMode !== mode) {
        engine.setMatchConfig({ mode, difficulty: payload?.difficulty });
      }
      enterMatchRoom();
    }
    matchBadge.textContent = '흑 턴 15';
    if (!payload?.toLobby) publishPresence();
    noteRoomMates(false);
  },
  onPvpPick: openPvpGuidePick,
  shouldBlockApply: () => shouldBlockSettingsToLobby({
    inRoom: inMatchRoom,
    started: matchStarted,
    spectating: engine.phase === PHASE.SPECTATING,
  }),
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
function shelvePvpPublicUi() {
  // [PVP 공개 중단] 1:1 버튼 숨김. 재개 시 PVP_PUBLIC_ENABLED = true
  if (PVP_PUBLIC_ENABLED) return;
  document.querySelectorAll('[data-mode="pvp"]').forEach((el) => {
    el.classList.add('is-pvp-shelved');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
  });
}

shelvePvpPublicUi();
if (PVP_PUBLIC_ENABLED && pendingInviteRoom) openInviteNickModal(pendingInviteRoom);
else {
  if (!PVP_PUBLIC_ENABLED) {
    pendingInviteRoom = '';
    writeStoredInviteRoom('');
    clearInviteQuery(window);
  }
  showLobby();
}

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
  if (restartPvpRematch()) return;
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
lobbyClose.addEventListener('click', () => {
  if (shouldQuitFromLobbyClose(inMatchRoom)) quitGameFromLobby();
  else hideLobby();
});
lobbyOverlay.addEventListener('click', hideLobby);
document.getElementById('lobby-book-open')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-bar-clinic')?.addEventListener('click', () => openLobbyBook('clinic'));
document.getElementById('lobby-location-guide')?.addEventListener('click', () => openLobbyBook('guide'));
document.getElementById('lobby-book-close')?.addEventListener('click', () => closeLobbyBook({ offerNotice: true }));
document.getElementById('invite-only-ok')?.addEventListener('click', closeInviteOnlyNotice);
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
document.getElementById('lobby-book-play')?.addEventListener('click', () => {
  closeLobbyBook({ offerNotice: true });
  showLobby();
});
document.getElementById('lobby-book-skip')?.addEventListener('change', (event) => {
  setSkipGuideOnConnect(Boolean(event.target?.checked));
});
document.getElementById('lobby-book-body')?.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-tutorial-start]')) startTutorialPlay();
});
document.getElementById('tutorial-skip')?.addEventListener('click', () => {
  stopTutorial('skip');
  leaveToWaitingRoom();
  offerInviteOnlyNotice({ tutorialSkipped: true });
});
document.getElementById('tutorial-finish')?.addEventListener('click', () => {
  stopTutorial('finish');
  leaveToWaitingRoom();
  offerInviteOnlyNotice({ tutorialEnded: true });
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

inviteCopyBtn?.addEventListener('click', () => {
  copyInviteLink();
});
inviteShareKakao?.addEventListener('click', () => {
  shareInviteToKakao();
});
inviteShareApps?.addEventListener('click', () => {
  shareInviteToApps();
});
inviteShareCopy?.addEventListener('click', () => {
  copyInviteUrlOnly();
});
inviteShareClose?.addEventListener('click', () => {
  closeInviteShareSheet();
});
document.getElementById('lobby-invite-accept')?.addEventListener('click', () => {
  acceptLobbyInvite();
});
document.getElementById('lobby-invite-decline')?.addEventListener('click', () => {
  const invite = pendingLobbyInvite;
  closeLobbyInviteModal();
  if (invite) {
    void realtimeManager.broadcastPvpInvite(buildInviteReply(invite, INVITE_ACTION_DECLINE));
  }
});
inviteEnterBtn?.addEventListener('click', () => {
  enterInviteRoom();
});
guestNickInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    enterInviteRoom();
  }
});
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
  if (!realtimeManager.isConnected) bootRealtime();
});

function bootRealtime(attempt = 0) {
  if (!nightClaim?.userId) {
    nightClaim = takeNightUserId({ makeId: newNightUserId, tabToken: nightClaim?.tabToken });
  }
  realtimeManager.userId = nightClaim.userId;
  realtimeManager.presenceKey = nightClaim.userId;
  return realtimeManager.connect().then((status) => {
    if (isLobbyFullStatus(status)) {
      setTicker(`대기실이 가득 찼습니다 (${LOBBY_CAP}명)`);
      showLobby();
      return;
    }
    if (status && status !== 'SUBSCRIBED') return;
    sessionAcorns = writeNightAcorns(readNightAcorns());
    syncAcornHud();
    writeNightClaim(realtimeManager.userId, nightClaim.tabToken);
    realtimeManager.startHeartbeat();
    publishPresence();
    syncNickField();
  }).catch(() => {
    if (attempt >= 1) return;
    return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => bootRealtime(attempt + 1));
  });
}

bootRealtime();
bindPresenceUnload(realtimeManager, window, () => {
  if (inMatchRoom && engine.phase !== PHASE.SPECTATING) publishRoomLeave();
});

function onLobbyResume() {
  refreshLobbyPresence({ reconnect: true, publish: true });
  if (inMatchRoom && matchStarted && engine.phase !== PHASE.SPECTATING) {
    publishMatchSync({ force: true });
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') onLobbyResume();
});
window.addEventListener('focus', onLobbyResume);
window.addEventListener('pageshow', onLobbyResume);
if (!window.__dotoriLobbyRefresh) {
  window.__dotoriLobbyRefresh = setInterval(() => {
    if (lobbyVisible) refreshLobbyPresence({ reconnect: false });
    if (shouldRepublishOpenRoom({
      inRoom: inMatchRoom && engine.phase !== PHASE.SPECTATING,
      mode: engine.gameMode,
      started: matchStarted,
    })) {
      void realtimeManager.broadcastLobbyHint();
    } else if (shouldPulseMatchSync({
      inPvp: inMatchRoom && engine.gameMode === GAME_MODE.PVP && engine.phase !== PHASE.SPECTATING,
      started: matchStarted,
      spectating: engine.phase === PHASE.SPECTATING,
    })) {
      publishMatchSync({ force: true, event: 'pulse' });
    }
  }, 2000);
}

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
  joinRoom,
  runLobbyClinic: () => runLobbyClinic(clinicSnapshot()),
};

export { engine, renderer, viewport, settingsModal, turnManager, powerRatioController };
