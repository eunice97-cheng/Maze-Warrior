const APP_MODE = document.body?.dataset?.appMode === "gm" ? "gm" : "player";
const LEGACY_SESSION_KEY = "maze-warrior-session";
const SESSION_KEY = `${LEGACY_SESSION_KEY}:${APP_MODE}`;
const PLATFORM_SESSION_KEY = "maze-warrior-platform-session";
const PLATFORM_PENDING_AUTH_KEY = "maze-warrior-platform-auth";
const layerPalette = [
  "#ff6a4d",
  "#ff8a47",
  "#ffb142",
  "#f7da4a",
  "#cfe85e",
  "#82ea75",
  "#49d7c4",
  "#38beff",
  "#578dff",
  "#a97cff",
];
const segmentPalette = ["#ff8161", "#58c8ff", "#7de97d", "#ffd36c"];
const gateAssignments = [
  { seatIndex: 0, direction: "North", beastName: "Black Tortoise", beastLabel: "Xuanwu", beastShort: "X", iconPath: "/assets/player-icons/black-tortoise.png" },
  { seatIndex: 1, direction: "East", beastName: "Azure Dragon", beastLabel: "Qinglong", beastShort: "Q", iconPath: "/assets/player-icons/azure-dragon.png" },
  { seatIndex: 2, direction: "South", beastName: "Vermilion Bird", beastLabel: "Zhuque", beastShort: "Z", iconPath: "/assets/player-icons/vermilion-bird.png" },
  { seatIndex: 3, direction: "West", beastName: "White Tiger", beastLabel: "Baihu", beastShort: "B", iconPath: "/assets/player-icons/white-tiger.png" },
];

const dom = {
  portal: document.querySelector("#portal"),
  app: document.querySelector("#app"),
  statusBanner: document.querySelector("#status-banner"),
  winOverlay: document.querySelector("#win-overlay"),
  announcementTitle: document.querySelector("#announcement-title"),
  announcementCopy: document.querySelector("#announcement-copy"),
  announcementDismiss: document.querySelector("#announcement-dismiss"),
  createForm: document.querySelector("#create-form"),
  joinForm: document.querySelector("#join-form"),
  createName: document.querySelector("#create-name"),
  createContenders: document.querySelector("#create-contenders"),
  joinName: document.querySelector("#join-name"),
  joinCode: document.querySelector("#join-code"),
  roomCode: document.querySelector("#room-code"),
  phaseCopy: document.querySelector("#phase-copy"),
  purgeTimer: document.querySelector("#purge-timer"),
  safeLayers: document.querySelector("#safe-layers"),
  turnStatus: document.querySelector("#turn-status"),
  youStatus: document.querySelector("#you-status"),
  layerStrip: document.querySelector("#layer-strip"),
  startButton: document.querySelector("#start-button"),
  leaveButton: document.querySelector("#leave-button"),
  mazeSvg: document.querySelector("#maze-svg"),
  boardCaption: document.querySelector("#board-caption"),
  scoreboard: document.querySelector("#scoreboard"),
  eventLog: document.querySelector("#event-log"),
  controlPad: document.querySelector("#control-pad"),
  editorPanel: document.querySelector("#editor-panel"),
  editorLayoutName: document.querySelector("#editor-layout-name"),
  editorLayoutNotes: document.querySelector("#editor-layout-notes"),
  saveMetadata: document.querySelector("#save-metadata"),
  editorTotalLayers: document.querySelector("#editor-total-layers"),
  applyCanvas: document.querySelector("#apply-canvas"),
  editorMirrorMode: document.querySelector("#editor-mirror-mode"),
  undoLayout: document.querySelector("#undo-layout"),
  redoLayout: document.querySelector("#redo-layout"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  resetView: document.querySelector("#reset-view"),
  centerCore: document.querySelector("#center-core"),
  editorStatus: document.querySelector("#editor-status"),
  editorMinimap: document.querySelector("#editor-minimap"),
  editorValidation: document.querySelector("#editor-validation"),
  toggleNodeColors: document.querySelector("#toggle-node-colors"),
  toggleDiamonds: document.querySelector("#toggle-diamonds"),
  exportLayout: document.querySelector("#export-layout"),
  platformAlert: document.querySelector("#platform-alert"),
  platformSeasonName: document.querySelector("#platform-season-name"),
  platformSeasonCopy: document.querySelector("#platform-season-copy"),
  platformPublicationTitle: document.querySelector("#platform-publication-title"),
  platformPublicationCopy: document.querySelector("#platform-publication-copy"),
  platformReadyCount: document.querySelector("#platform-ready-count"),
  platformReadyCopy: document.querySelector("#platform-ready-copy"),
  platformRefresh: document.querySelector("#platform-refresh"),
  platformAuthSignedOut: document.querySelector("#platform-auth-signed-out"),
  platformAuthSignedIn: document.querySelector("#platform-auth-signed-in"),
  platformAuthRequestForm: document.querySelector("#platform-auth-request-form"),
  platformAuthDisplayName: document.querySelector("#platform-auth-display-name"),
  platformAuthEmail: document.querySelector("#platform-auth-email"),
  platformAuthVerifyForm: document.querySelector("#platform-auth-verify-form"),
  platformAuthVerifyEmail: document.querySelector("#platform-auth-verify-email"),
  platformAuthVerifyToken: document.querySelector("#platform-auth-verify-token"),
  platformProfileName: document.querySelector("#platform-profile-name"),
  platformProfileEmail: document.querySelector("#platform-profile-email"),
  platformMembershipCopy: document.querySelector("#platform-membership-copy"),
  seasonClanGrid: document.querySelector("#season-clan-grid"),
  platformSignOut: document.querySelector("#platform-sign-out"),
  platformRepresentativeCopy: document.querySelector("#platform-representative-copy"),
  platformSlotList: document.querySelector("#platform-slot-list"),
  platformVolunteerForm: document.querySelector("#platform-volunteer-form"),
  platformVolunteerNote: document.querySelector("#platform-volunteer-note"),
  platformNominationStatus: document.querySelector("#platform-nomination-status"),
};

const state = {
  room: null,
  session: null,
  eventSource: null,
  geometryCache: null,
  geometryCacheKey: null,
  timerInterval: null,
  clockOffsetMs: 0,
  lastActionSentAt: 0,
  lastAnnouncedFinishedAt: null,
  editorMessage: "",
  editorView: {
    showNodeColors: true,
    showDiamonds: true,
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    pointerId: null,
    lastClientX: 0,
    lastClientY: 0,
  },
  platform: {
    status: null,
    clans: [],
    currentSeason: null,
    publications: [],
    me: null,
    session: null,
    pendingAuth: null,
    alertTone: "info",
  },
};

function isGmMode() {
  return APP_MODE === "gm";
}

function hasRoomShell() {
  return Boolean(dom.portal && dom.app);
}

function getStatusSealMarkup(player, statusText, toneClass) {
  const iconPath = getPlayerIconPath(player);
  return `
    <div class="runner-seal ${toneClass}" aria-hidden="true">
      <div class="runner-seal-banner">
        ${iconPath ? `<img class="runner-seal-icon" src="${iconPath}" alt="" />` : ""}
      </div>
      <span class="runner-seal-stamp">${statusText}</span>
    </div>
  `;
}

function bind(element, eventName, handler, options) {
  if (!element) {
    return;
  }
  element.addEventListener(eventName, handler, options);
}

function showStatus(message, tone = "info") {
  dom.statusBanner.textContent = message;
  dom.statusBanner.classList.remove("hidden");
  dom.statusBanner.style.color = tone === "error" ? "#ffe7e1" : "#fff1cf";
  dom.statusBanner.style.borderColor =
    tone === "error" ? "rgba(255, 131, 118, 0.54)" : "rgba(255, 214, 120, 0.36)";
  dom.statusBanner.style.background =
    tone === "error"
      ? "linear-gradient(180deg, rgba(88, 24, 22, 0.94), rgba(58, 18, 16, 0.92))"
      : "linear-gradient(180deg, rgba(86, 56, 19, 0.92), rgba(58, 36, 12, 0.9))";
  dom.statusBanner.style.boxShadow =
    tone === "error"
      ? "0 18px 42px rgba(44, 9, 8, 0.34)"
      : "0 18px 42px rgba(52, 31, 5, 0.24)";
}

function clearStatus() {
  dom.statusBanner.classList.add("hidden");
}

function hideAnnouncement() {
  dom.winOverlay?.classList.add("hidden");
}

function showWinnerAnnouncement(room) {
  if (!dom.winOverlay || !dom.announcementTitle || !dom.announcementCopy) {
    return;
  }
  const winners = room?.players?.filter((player) => room.winners.includes(player.id)) || [];
  const finishLog = room?.logs?.find((entry) => entry.type === "finish") || null;
  dom.announcementTitle.textContent =
    winners.length === 1
      ? `${winners[0].name} Recovered The Core`
      : winners.length > 1
        ? "Match Ends In A Tie"
        : "Maze Core Retrieved";
  dom.announcementCopy.textContent =
    finishLog?.message ||
    (winners.length === 1
      ? `${winners[0].name} secured the maze core for their clan.`
      : "The match has ended.");
  dom.winOverlay.classList.remove("hidden");
}

function syncWinnerAnnouncement(previousRoom, nextRoom) {
  if (!nextRoom || nextRoom.state !== "finished" || nextRoom.finishedAt == null) {
    if (previousRoom?.state === "finished" && nextRoom?.state !== "finished") {
      hideAnnouncement();
    }
    return;
  }
  if (state.lastAnnouncedFinishedAt === nextRoom.finishedAt || previousRoom?.finishedAt === nextRoom.finishedAt) {
    return;
  }
  state.lastAnnouncedFinishedAt = nextRoom.finishedAt;
  showWinnerAnnouncement(nextRoom);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function capitalize(value) {
  const normalized = String(value || "");
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
}

function sanitizeSvgId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "runner";
}

function getModeQuery() {
  return `mode=${encodeURIComponent(APP_MODE)}`;
}

function buildRoomStatePath(code, token) {
  return `/api/rooms/${code}/state?token=${encodeURIComponent(token || "")}&${getModeQuery()}`;
}

function buildRoomEventsPath(code, token) {
  return `/api/rooms/${code}/events?token=${encodeURIComponent(token || "")}&${getModeQuery()}`;
}

function isLimitedPlayerView(room = state.room) {
  return Boolean(room && room.viewerMode === "player" && !room.visibility?.fullView);
}

function getVisibleNodeIds(room = state.room) {
  return new Set(room?.visibility?.visibleNodeIds || []);
}

function getDiscoveredNodeIds(room = state.room) {
  return new Set(room?.visibility?.discoveredNodeIds || []);
}

function getCurrentTurnPlayer(room = state.room) {
  return room?.players?.find((player) => player.id === room?.turn?.currentPlayerId) || null;
}

function getDraftPlayer(room = state.room) {
  return room?.players?.find((player) => player.id === room?.draft?.currentPlayerId) || null;
}

function getGateMeta(seatIndex, room = state.room) {
  const claimed = room?.players?.find((player) => player.seatIndex === seatIndex);
  const fallback = gateAssignments.find((entry) => entry.seatIndex === seatIndex) || null;
  if (claimed?.beastName) {
    return {
      seatIndex,
      direction: capitalize(claimed.direction),
      beastName: claimed.beastName,
      beastLabel: fallback?.beastLabel || claimed.beastLabel,
      beastShort: claimed.beastShort,
      color: claimed.color,
      iconPath: fallback?.iconPath || "",
    };
  }
  return fallback;
}

function getPlayerIconPath(player) {
  if (!player) {
    return "";
  }
  const localGate = gateAssignments.find((entry) => entry.seatIndex === player.seatIndex);
  return localGate?.iconPath || "";
}

function getDeadlineCountdown(deadlineAt) {
  if (deadlineAt == null) {
    return null;
  }
  return Math.max(0, deadlineAt - (Date.now() + state.clockOffsetMs));
}

function formatRounds(count) {
  if (count == null) {
    return "No purge scheduled";
  }
  return `${count} round${count === 1 ? "" : "s"}`;
}

function getPurgeCountdownCopy(room = state.room) {
  if (!room?.purge?.nextLayer || room.purge.roundsUntilNextPurge == null) {
    return `Purge stops at ${room?.purge?.stopsAtLayer || 3} layers.`;
  }
  return `Layer ${room.purge.nextLayer} purges in ${formatRounds(room.purge.roundsUntilNextPurge)}.`;
}

function getVictoryClaimant(room = state.room) {
  return room?.players?.find((player) => player.id === room?.victory?.soleSurvivorId) || null;
}

function getCoreClaimInstruction(room, viewer) {
  if (!room?.victory?.requiresCoreClaim) {
    return "";
  }
  const claimant = getVictoryClaimant(room);
  if (!claimant) {
    return " Reach the center core to secure the maze core for your clan.";
  }
  if (viewer?.id === claimant.id) {
    return " You are the last of the Marked. Move to the center core and secure it for your clan.";
  }
  return ` ${claimant.name} is the last of the Marked and must reach the center core to secure it for their clan.`;
}

function getViewerDangerCopy(room, viewer) {
  if (!room?.purge?.nextLayer || !viewer?.alive) {
    return "";
  }
  const occupiedNodeId = viewer.positionState === "inside" ? viewer.currentNodeId : viewer.entryNodeId;
  const occupiedNode = room.maze.nodes?.[occupiedNodeId];
  if (!occupiedNode || occupiedNode.layer !== room.purge.nextLayer) {
    return "";
  }
  if ((room.purge.roundsUntilNextPurge || 0) <= 2) {
    return ` Warning: you are still on layer ${room.purge.nextLayer}.`;
  }
  return ` You are currently on the next layer to be purged.`;
}

function saveSession(session) {
  state.session = session;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

function clearSession() {
  state.session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}

function loadSession() {
  try {
    const value = localStorage.getItem(SESSION_KEY) || localStorage.getItem(LEGACY_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function savePlatformSession(session) {
  state.platform.session = session;
  localStorage.setItem(PLATFORM_SESSION_KEY, JSON.stringify(session));
}

function clearPlatformSession() {
  state.platform.session = null;
  state.platform.me = null;
  localStorage.removeItem(PLATFORM_SESSION_KEY);
}

function loadPlatformSession() {
  try {
    const value = localStorage.getItem(PLATFORM_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function savePendingPlatformAuth(payload) {
  state.platform.pendingAuth = payload;
  localStorage.setItem(PLATFORM_PENDING_AUTH_KEY, JSON.stringify(payload));
}

function clearPendingPlatformAuth() {
  state.platform.pendingAuth = null;
  localStorage.removeItem(PLATFORM_PENDING_AUTH_KEY);
}

function loadPendingPlatformAuth() {
  try {
    const value = localStorage.getItem(PLATFORM_PENDING_AUTH_KEY);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function getPlatformSession() {
  if (state.platform.session) {
    return state.platform.session;
  }
  const stored = loadPlatformSession();
  if (stored) {
    state.platform.session = stored;
  }
  return state.platform.session;
}

function getPlatformAccessToken() {
  return getPlatformSession()?.accessToken || "";
}

function getPlatformStateSeason() {
  return state.platform.me?.currentSeason || state.platform.currentSeason || null;
}

function getPlatformStatePublication() {
  return state.platform.me?.currentPublication || state.platform.publications?.[0] || null;
}

function formatPlatformDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function setPlatformAlert(message, tone = "info") {
  if (!dom.platformAlert) {
    return;
  }
  state.platform.alertTone = tone;
  dom.platformAlert.textContent = message;
  dom.platformAlert.classList.remove("is-error", "is-success");
  if (tone === "error") {
    dom.platformAlert.classList.add("is-error");
  } else if (tone === "success") {
    dom.platformAlert.classList.add("is-success");
  }
}

function clearPlatformAlert(tone = "info") {
  const configured = state.platform.status?.configured;
  if (!configured) {
    setPlatformAlert(
      "Supabase platform services are not configured yet. Add the project keys to enable registration, seasonal clans, and bearer selection.",
      "error"
    );
    return;
  }
  if (tone === "success") {
    return;
  }
  setPlatformAlert(
    "Registration, clan selection, and bearer volunteering now run through the seasonal registry.",
    "info"
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function platformApi(path, options = {}) {
  const accessToken = getPlatformAccessToken();
  return api(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

function getPlatformSeasonCopy(season) {
  if (!season) {
    return "No active or upcoming season has been published yet.";
  }
  if (season.status === "upcoming") {
    return `Upcoming season. Opens ${formatPlatformDateTime(season.starts_at) || "soon"}.`;
  }
  if (season.clan_selection_starts_at && Date.now() < Date.parse(season.clan_selection_starts_at)) {
    return `Clan selection opens ${formatPlatformDateTime(season.clan_selection_starts_at) || "soon"}.`;
  }
  if (season.clan_selection_ends_at && Date.now() > Date.parse(season.clan_selection_ends_at)) {
    return "Clan selection is closed for this season.";
  }
  return "Clan selection is open for registered Maze Warriors.";
}

function getPlatformPublicationCopy(publication) {
  if (!publication) {
    return "When a maze is published, its readiness and representative slots will appear here.";
  }
  if (publication.scheduled_start_at) {
    return `All clans are ready. Descent scheduled for ${formatPlatformDateTime(publication.scheduled_start_at)}.`;
  }
  if (publication.allClansReady) {
    return "All four clans are locked in. Waiting for the city to announce the descent time.";
  }
  return publication.short_description || "Waiting for each clan to confirm one Marked Bearer.";
}

function getPlatformReadinessCopy(publication) {
  if (!publication) {
    return "The city will announce readiness here once a maze has been published.";
  }
  const clansReady = Number(publication.clansReady) || 0;
  const clansTotal = Number(publication.clansTotal) || 4;
  if (publication.scheduled_start_at) {
    return `Scheduled for ${formatPlatformDateTime(publication.scheduled_start_at)}.`;
  }
  if (publication.allClansReady) {
    return "All clans are locked and the official start announcement can be made.";
  }
  const clansRemaining = Math.max(0, clansTotal - clansReady);
  return `${clansRemaining} clan${clansRemaining === 1 ? "" : "s"} still need a confirmed bearer.`;
}

function getSortedPlatformClans() {
  const directionOrder = { east: 0, west: 1, south: 2, north: 3 };
  return [...(state.platform.clans || [])].sort((left, right) => {
    const leftOrder = directionOrder[String(left.direction || "").toLowerCase()];
    const rightOrder = directionOrder[String(right.direction || "").toLowerCase()];
    if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

function renderSeasonClanGrid() {
  if (!dom.seasonClanGrid) {
    return;
  }
  const season = getPlatformStateSeason();
  const configured = Boolean(state.platform.status?.configured);
  const session = getPlatformSession();
  const me = state.platform.me;
  const currentMembership = me?.currentMembership || null;
  const currentClanId = currentMembership?.clan_id || me?.currentClan?.id || "";
  const clans = getSortedPlatformClans();

  if (!clans.length) {
    dom.seasonClanGrid.innerHTML = '<div class="platform-alert">Clan data is not available yet.</div>';
    return;
  }

  dom.seasonClanGrid.innerHTML = clans
    .map((clan) => {
      const isCurrent = currentClanId === clan.id;
      const isLocked = Boolean(currentMembership) && !isCurrent;
      const canJoin = configured && Boolean(session?.accessToken) && Boolean(season?.id) && !currentMembership;
      let actionLabel = "Swear To This Clan";
      if (!configured) {
        actionLabel = "Registry Offline";
      } else if (!session?.accessToken) {
        actionLabel = "Sign In First";
      } else if (!season?.id) {
        actionLabel = "Season Unavailable";
      } else if (isCurrent) {
        actionLabel = "Your Seasonal Clan";
      } else if (currentMembership) {
        actionLabel = "Season Locked";
      }
      return `
        <article class="season-clan-card ${isCurrent ? "is-current" : ""} ${isLocked ? "is-locked" : ""}" style="--clan-accent: ${escapeAttribute(clan.accent_color || "#e8c889")}">
          <div class="season-clan-header">
            <div>
              <strong>${escapeHtml(clan.name || "Unknown Clan")}</strong>
              <p class="season-clan-direction">${escapeHtml(clan.direction || "District")}</p>
            </div>
            <button
              class="${isCurrent ? "ghost-button" : "action-button"}"
              type="button"
              data-action="join-clan"
              data-clan-id="${escapeAttribute(clan.id)}"
              ${canJoin ? "" : "disabled"}
            >
              ${escapeHtml(actionLabel)}
            </button>
          </div>
          <p>${escapeHtml(clan.summary || "A seasonal house of the entrance city.")}</p>
        </article>
      `;
    })
    .join("");
}

function renderRepresentativeSlots() {
  if (!dom.platformSlotList || !dom.platformRepresentativeCopy || !dom.platformVolunteerForm || !dom.platformNominationStatus) {
    return;
  }

  const publication = getPlatformStatePublication();
  const me = state.platform.me;
  const session = getPlatformSession();
  const currentClanId = me?.currentMembership?.clan_id || me?.currentClan?.id || "";
  const mySlot =
    me?.currentRepresentativeSlot ||
    publication?.representativeSlots?.find((slot) => slot.clan_id === currentClanId) ||
    null;
  const myNomination = me?.myNomination || null;
  const canVolunteer =
    Boolean(state.platform.status?.configured) &&
    Boolean(session?.accessToken) &&
    Boolean(publication?.id) &&
    Boolean(currentClanId) &&
    ["collecting_representatives", "ready"].includes(publication?.status || "") &&
    !(mySlot?.profile_id && mySlot.profile_id !== me?.user?.id && ["confirmed", "locked"].includes(mySlot.status));

  if (!publication) {
    dom.platformRepresentativeCopy.textContent =
      "There is no published maze gathering representatives right now.";
    dom.platformSlotList.innerHTML = '<div class="platform-alert">Publish a maze to begin collecting Marked Bearers.</div>';
    dom.platformVolunteerForm.classList.add("hidden");
    dom.platformNominationStatus.classList.add("hidden");
    return;
  }

  const slotOrder = new Map(getSortedPlatformClans().map((clan, index) => [clan.id, index]));
  const slots = [...(publication.representativeSlots || [])].sort((left, right) => {
    return (slotOrder.get(left.clan_id) ?? 99) - (slotOrder.get(right.clan_id) ?? 99);
  });

  dom.platformRepresentativeCopy.textContent =
    publication.scheduled_start_at
      ? `All clans are ready. The descent is scheduled for ${formatPlatformDateTime(publication.scheduled_start_at)}.`
      : "Once all four houses lock in their bearer, the city announces the official start time.";

  dom.platformSlotList.innerHTML = slots
    .map((slot) => {
      const isReady = ["confirmed", "locked"].includes(slot.status) && Boolean(slot.profile_id);
      const representativeName = slot.representative?.display_name || "Awaiting bearer";
      const statusLabel = isReady ? "Locked In" : "Awaiting Clan";
      const detail = isReady
        ? `${representativeName} carries this clan's mark into the maze.`
        : "No confirmed bearer yet for this published maze.";
      return `
        <article class="platform-slot-card ${isReady ? "is-ready" : "is-waiting"}" style="--slot-accent: ${escapeAttribute(slot.clan?.accent_color || "#e8c889")}">
          <div class="platform-slot-header">
            <div>
              <strong>${escapeHtml(slot.clan?.name || "Unknown Clan")}</strong>
              <p class="platform-slot-representative">${escapeHtml(representativeName)}</p>
            </div>
            <span class="platform-slot-status ${isReady ? "is-ready" : "is-waiting"}">${escapeHtml(statusLabel)}</span>
          </div>
          <p>${escapeHtml(detail)}</p>
        </article>
      `;
    })
    .join("");

  dom.platformVolunteerForm.classList.toggle("hidden", !publication);
  const volunteerButton = dom.platformVolunteerForm.querySelector("button[type='submit']");
  if (dom.platformVolunteerNote) {
    dom.platformVolunteerNote.disabled = !canVolunteer;
  }
  if (volunteerButton) {
    volunteerButton.disabled = !canVolunteer;
  }

  let nominationCopy = "";
  let nominationTone = "info";
  if (!state.platform.status?.configured) {
    nominationCopy = "The registry is offline until Supabase keys are configured.";
    nominationTone = "error";
  } else if (!session?.accessToken) {
    nominationCopy = "Sign in to your registry entry before offering yourself as a Marked Bearer.";
  } else if (!currentClanId) {
    nominationCopy = "Choose your clan for the current season first.";
  } else if (mySlot?.profile_id === me?.user?.id && ["confirmed", "locked"].includes(mySlot.status)) {
    nominationCopy = "Your clan has already locked you in as its Marked Bearer for this maze.";
    nominationTone = "success";
  } else if (myNomination?.status === "pending") {
    nominationCopy = "Your offer has been recorded and is waiting for clan leadership confirmation.";
  } else if (mySlot?.profile_id && mySlot.profile_id !== me?.user?.id && ["confirmed", "locked"].includes(mySlot.status)) {
    nominationCopy = "Your clan already has a confirmed Marked Bearer for this contest.";
  } else {
    nominationCopy = "Your clan still needs its bearer. Volunteer here if you can answer the summons.";
  }

  dom.platformNominationStatus.classList.remove("hidden", "is-error", "is-success");
  if (nominationTone === "error") {
    dom.platformNominationStatus.classList.add("is-error");
  } else if (nominationTone === "success") {
    dom.platformNominationStatus.classList.add("is-success");
  }
  dom.platformNominationStatus.textContent = nominationCopy;
}

function renderPlatformDashboard() {
  if (!dom.platformAlert) {
    return;
  }
  const season = getPlatformStateSeason();
  const publication = getPlatformStatePublication();
  const session = getPlatformSession();
  const me = state.platform.me;
  const signedIn = Boolean(session?.accessToken && me?.user);

  if (dom.platformSeasonName) {
    dom.platformSeasonName.textContent = season?.name || "No season published";
  }
  if (dom.platformSeasonCopy) {
    dom.platformSeasonCopy.textContent = getPlatformSeasonCopy(season);
  }
  if (dom.platformPublicationTitle) {
    dom.platformPublicationTitle.textContent = publication?.title || "No maze published";
  }
  if (dom.platformPublicationCopy) {
    dom.platformPublicationCopy.textContent = getPlatformPublicationCopy(publication);
  }
  if (dom.platformReadyCount) {
    const ready = publication?.clansReady || 0;
    const total = publication?.clansTotal || 4;
    dom.platformReadyCount.textContent = publication ? `${ready} / ${total} clans locked` : "Waiting for publication";
  }
  if (dom.platformReadyCopy) {
    dom.platformReadyCopy.textContent = getPlatformReadinessCopy(publication);
  }

  dom.platformAuthSignedOut?.classList.toggle("hidden", signedIn);
  dom.platformAuthSignedIn?.classList.toggle("hidden", !signedIn);

  const pendingAuth = state.platform.pendingAuth || null;
  if (dom.platformAuthDisplayName && !dom.platformAuthDisplayName.value && pendingAuth?.displayName) {
    dom.platformAuthDisplayName.value = pendingAuth.displayName;
  }
  if (dom.platformAuthEmail && !dom.platformAuthEmail.value && pendingAuth?.email) {
    dom.platformAuthEmail.value = pendingAuth.email;
  }
  if (dom.platformAuthVerifyEmail && !dom.platformAuthVerifyEmail.value && pendingAuth?.email) {
    dom.platformAuthVerifyEmail.value = pendingAuth.email;
  }

  if (dom.platformProfileName) {
    dom.platformProfileName.textContent = me?.profile?.display_name || me?.user?.email || "Signed in";
  }
  if (dom.platformProfileEmail) {
    dom.platformProfileEmail.textContent = me?.user?.email || "";
  }
  if (dom.platformMembershipCopy) {
    if (!state.platform.status?.configured) {
      dom.platformMembershipCopy.textContent =
        "The registry is offline until the Supabase platform settings are configured.";
    } else if (!signedIn) {
      dom.platformMembershipCopy.textContent =
        "Register with your email first, then swear to one clan for the whole season.";
    } else if (me?.currentClan?.name && season?.name) {
      dom.platformMembershipCopy.textContent = `You are sworn to ${me.currentClan.name} for ${season.name}. This oath lasts until the season ends.`;
    } else if (season?.name) {
      dom.platformMembershipCopy.textContent = `Choose one clan for ${season.name}. You can only hold one seasonal oath at a time.`;
    } else {
      dom.platformMembershipCopy.textContent = "Wait for the city to publish the next season before choosing a clan.";
    }
  }

  renderSeasonClanGrid();
  renderRepresentativeSlots();
}

async function loadPlatformDashboard() {
  if (isGmMode() || !dom.platformAlert) {
    return;
  }

  setPlatformAlert("Refreshing the seasonal registry.");

  try {
    const [statusResponse, clanResponse, seasonResponse, publicationResponse] = await Promise.all([
      api("/api/platform/status"),
      api("/api/platform/clans"),
      api("/api/platform/seasons/current"),
      api("/api/platform/publications/current?limit=3"),
    ]);

    state.platform.status = statusResponse.platform || null;
    state.platform.clans = Array.isArray(clanResponse.clans) ? clanResponse.clans : [];
    state.platform.currentSeason = seasonResponse.season || null;
    state.platform.publications = Array.isArray(publicationResponse.publications) ? publicationResponse.publications : [];
    state.platform.pendingAuth = loadPendingPlatformAuth();
    state.platform.me = null;

    const session = getPlatformSession();
    if (state.platform.status?.configured && session?.accessToken) {
      try {
        state.platform.me = await platformApi("/api/platform/me");
      } catch (error) {
        const message = String(error?.message || "");
        if (/token|sign|profile/i.test(message)) {
          clearPlatformSession();
          setPlatformAlert("Your registry session expired. Sign in again to manage your clan oath.", "error");
        } else {
          throw error;
        }
      }
    }

    renderPlatformDashboard();
    if (state.platform.alertTone !== "error") {
      clearPlatformAlert(state.platform.alertTone);
    }
  } catch (error) {
    renderPlatformDashboard();
    setPlatformAlert(error.message || "Could not load the seasonal registry.", "error");
  }
}

function clearPlatformAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  ["access_token", "refresh_token", "expires_at", "expires_in", "token_type", "type", "token_hash"].forEach((key) => {
    url.searchParams.delete(key);
  });
  const hashParams = new URLSearchParams(String(url.hash || "").replace(/^#/, ""));
  ["access_token", "refresh_token", "expires_at", "expires_in", "token_type", "type", "token_hash"].forEach((key) => {
    hashParams.delete(key);
  });
  const nextPath =
    `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}` +
    `${hashParams.toString() ? `#${hashParams.toString()}` : ""}`;
  window.history.replaceState({}, document.title, nextPath);
}

async function restorePlatformAuthFromUrl() {
  if (isGmMode() || !dom.platformAlert) {
    return;
  }

  state.platform.session = loadPlatformSession();
  state.platform.pendingAuth = loadPendingPlatformAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(String(window.location.hash || "").replace(/^#/, ""));
  const accessToken = hashParams.get("access_token") || searchParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") || searchParams.get("refresh_token");

  if (accessToken) {
    savePlatformSession({
      accessToken,
      refreshToken: refreshToken || "",
      expiresAt: hashParams.get("expires_at") || searchParams.get("expires_at") || null,
      expiresIn: hashParams.get("expires_in") || searchParams.get("expires_in") || null,
      tokenType: hashParams.get("token_type") || searchParams.get("token_type") || "bearer",
    });
    clearPendingPlatformAuth();
    clearPlatformAuthParamsFromUrl();
    setPlatformAlert("Your sign-in link was accepted. Loading your registry entry.", "success");
    return;
  }

  const tokenHash = searchParams.get("token_hash") || hashParams.get("token_hash");
  const authType = searchParams.get("type") || hashParams.get("type");
  if (!tokenHash || !authType) {
    return;
  }

  setPlatformAlert("Finishing your registry sign-in.");
  try {
    const result = await api("/api/platform/auth/verify", {
      method: "POST",
      body: {
        tokenHash,
        type: authType,
        displayName: state.platform.pendingAuth?.displayName || "",
      },
    });
    savePlatformSession(result.session);
    state.platform.me = result.state || null;
    clearPendingPlatformAuth();
    setPlatformAlert("Your Maze Warrior registry entry is active.", "success");
  } catch (error) {
    setPlatformAlert(error.message || "Could not finish your sign-in link.", "error");
  } finally {
    clearPlatformAuthParamsFromUrl();
  }
}

async function startCurrentRoom(contenderCount = state.room?.contenderCount) {
  if (!state.session || !state.room) {
    return;
  }
  await api(`/api/rooms/${state.session.code}/start`, {
    method: "POST",
    body: {
      mode: APP_MODE,
      token: state.session.token,
      contenderCount,
    },
  });
}

function setRoom(room) {
  const previousRoom = state.room;
  const previousGridSize = state.room?.maze?.gridSize || null;
  state.room = room;
  state.clockOffsetMs = (room.serverNow || Date.now()) - Date.now();
  if (previousGridSize !== room?.maze?.gridSize) {
    state.geometryCache = null;
    state.geometryCacheKey = null;
    resetEditorViewport();
  }
  render();
  syncWinnerAnnouncement(previousRoom, room);
}

async function connectSession(session) {
  clearStatus();
  saveSession(session);
  const initial = await api(buildRoomStatePath(session.code, session.token));
  setRoom(initial);
  document.body.classList.add("in-room");
  dom.portal?.classList.add("hidden");
  dom.app?.classList.remove("hidden");
  openEventStream();
}

function openEventStream() {
  if (!state.session) {
    return;
  }
  if (state.eventSource) {
    state.eventSource.close();
  }
  const { code, token } = state.session;
  const source = new EventSource(buildRoomEventsPath(code, token));
  source.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    setRoom(payload);
  };
  source.onerror = () => {
    showStatus("Live connection interrupted. Retrying...", "error");
  };
  source.onopen = () => {
    clearStatus();
  };
  state.eventSource = source;
}

function disconnectSession() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  clearSession();
  state.room = null;
  state.geometryCache = null;
  state.geometryCacheKey = null;
  state.lastActionSentAt = 0;
  state.lastAnnouncedFinishedAt = null;
  document.body.classList.remove("in-room");
  dom.app?.classList.add("hidden");
  dom.portal?.classList.remove("hidden");
  clearStatus();
  hideAnnouncement();
}

function getViewer() {
  if (!state.room) {
    return null;
  }
  return state.room.players.find((player) => player.id === state.room.viewerId) || null;
}

function editorIsAvailable() {
  return Boolean(isGmMode() && dom.editorPanel && state.room && state.room.state === "lobby" && state.room.viewerIsHost);
}

function clampZoom(value) {
  return Math.min(3.25, Math.max(0.55, value));
}

function resetEditorViewport() {
  state.editorView.zoom = 1;
  state.editorView.panX = 0;
  state.editorView.panY = 0;
}

function getBaseViewFrame(room) {
  const metrics = getGridMetrics(room);
  const padding = metrics.cellSize * 1.8;
  return {
    x: metrics.origin - padding,
    y: metrics.origin - padding,
    width: metrics.boardSize + padding * 2,
    height: metrics.boardSize + padding * 2,
  };
}

function getEditorViewBox(room) {
  const base = getBaseViewFrame(room);
  const width = base.width / state.editorView.zoom;
  const height = base.height / state.editorView.zoom;
  return {
    x: base.x + (base.width - width) / 2 + state.editorView.panX,
    y: base.y + (base.height - height) / 2 + state.editorView.panY,
    width,
    height,
  };
}

function formatTime(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.floor(seconds / 60)}m ago`;
}

function formatMatchTime(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getNodeLabel(room, nodeId) {
  const node = room?.maze?.nodes?.[nodeId];
  if (!node) {
    return "Unknown";
  }
  if (node.layer === 1) {
    return `Core (${node.row + 1},${node.col + 1})`;
  }
  return `L${node.layer} (${node.row + 1},${node.col + 1})`;
}

function getBotIntentCopy(room, player) {
  if (!player?.botIntent || !player.alive) {
    return "";
  }
  const target = getNodeLabel(room, player.botIntent.targetNodeId);
  const stepCopy = player.botIntent.pathLength
    ? ` · ${player.botIntent.pathLength} step${player.botIntent.pathLength === 1 ? "" : "s"}`
    : "";
  const reasonMap = {
    sweep: "Sweeping nearby diamonds",
    dive: "Diving deeper",
    pressure: "Pressuring a rival",
    fallback: "Escaping inward",
  };
  const reason = reasonMap[player.botIntent.reason] || "Routing";
  return `${reason} toward ${target}${stepCopy}`;
}

function getGridMetrics(room) {
  const gridSize = room.maze.gridSize || room.rules.gridSize || 19;
  const cellSize = 48;
  const boardSize = gridSize * cellSize;
  return {
    gridSize,
    cellSize,
    boardSize,
    origin: -boardSize / 2,
  };
}

function getLayerBounds(layer, room) {
  const metrics = getGridMetrics(room);
  const inset = (room.rules.totalLayers - layer) * metrics.cellSize;
  return {
    x: metrics.origin + inset,
    y: metrics.origin + inset,
    size: metrics.boardSize - inset * 2,
  };
}

function getNodeRect(node, metrics) {
  return {
    x: metrics.origin + node.col * metrics.cellSize,
    y: metrics.origin + node.row * metrics.cellSize,
    size: metrics.cellSize,
  };
}

function getNodeCenter(node, metrics) {
  return {
    x: metrics.origin + node.col * metrics.cellSize + metrics.cellSize / 2,
    y: metrics.origin + node.row * metrics.cellSize + metrics.cellSize / 2,
  };
}

function hexToRgba(hex, alpha) {
  const normalized = String(hex || "").replace("#", "");
  const source =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => value + value)
          .join("")
      : normalized;
  const red = Number.parseInt(source.slice(0, 2), 16) || 255;
  const green = Number.parseInt(source.slice(2, 4), 16) || 255;
  const blue = Number.parseInt(source.slice(4, 6), 16) || 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function buildGeometryCache(room) {
  const metrics = getGridMetrics(room);
  const key = `${room.maze.nodes.length}-${metrics.gridSize}-${metrics.cellSize}-${room.maze.layout || "maze"}`;
  if (state.geometryCache && state.geometryCacheKey === key) {
    return state.geometryCache;
  }
  const positions = {};
  const rects = {};
  const wallSegments = {};
  const pillars = {};
  const nodesByKey = {};
  room.maze.nodes.forEach((node) => {
    positions[node.id] = getNodeCenter(node, metrics);
    rects[node.id] = getNodeRect(node, metrics);
    nodesByKey[node.key] = node;
  });
  (room.maze.wallSegments || []).forEach((segment) => {
    if (segment.orientation === "h") {
      const x1 = metrics.origin + segment.col * metrics.cellSize;
      const y1 = metrics.origin + segment.row * metrics.cellSize;
      wallSegments[segment.key] = {
        x1,
        y1,
        x2: x1 + metrics.cellSize,
        y2: y1,
      };
      return;
    }
    const x1 = metrics.origin + segment.col * metrics.cellSize;
    const y1 = metrics.origin + segment.row * metrics.cellSize;
    wallSegments[segment.key] = {
      x1,
      y1,
      x2: x1,
      y2: y1 + metrics.cellSize,
    };
  });
  (room.maze.pillars || []).forEach((pillar) => {
    pillars[pillar.key] = {
      x: metrics.origin + pillar.col * metrics.cellSize,
      y: metrics.origin + pillar.row * metrics.cellSize,
    };
  });
  state.geometryCache = {
    metrics,
    positions,
    rects,
    wallSegments,
    pillars,
    nodesByKey,
  };
  state.geometryCacheKey = key;
  return state.geometryCache;
}

function buildPositionCache(room) {
  return buildGeometryCache(room).positions;
}

function getNodeRects(room) {
  return buildGeometryCache(room).rects;
}

function getWallSegmentGeometry(room) {
  return buildGeometryCache(room).wallSegments;
}

function getPillarGeometry(room) {
  return buildGeometryCache(room).pillars;
}

function getNodesByKey(room) {
  return buildGeometryCache(room).nodesByKey;
}

function buildWallClass(nodeLayer, safeOuterLayer, extraClass = "") {
  const classes = ["maze-wall"];
  if (extraClass) {
    classes.push(extraClass);
  }
  if (nodeLayer > safeOuterLayer) {
    classes.push("is-purged");
  }
  return classes.join(" ");
}

function buildMazeCells(room, safeOuterLayer) {
  const rects = getNodeRects(room);
  const visibleNodeIds = getVisibleNodeIds(room);
  const discoveredNodeIds = getDiscoveredNodeIds(room);
  const limitedView = isLimitedPlayerView(room) && !editorIsAvailable();
  return room.maze.nodes
    .map((node) => {
      const rect = rects[node.id];
      const color = layerPalette[node.layer - 1] || "#ffffff";
      const segmentColor =
        node.segmentIndex == null
          ? "rgba(255,255,255,0.16)"
          : hexToRgba(segmentPalette[node.segmentIndex], 0.26);
      const discovered = !limitedView || discoveredNodeIds.has(node.id);
      const visible = !limitedView || visibleNodeIds.has(node.id);
      const classes = ["maze-cell"];
      let fill = "transparent";
      let stroke = segmentColor;

      if (node.layer > safeOuterLayer) {
        return "";
      } else if (!discovered) {
        classes.push("is-hidden");
        fill = "rgba(4, 4, 4, 0.94)";
        stroke = "transparent";
      } else if (!visible) {
        classes.push("is-memory");
        fill = state.editorView.showNodeColors ? hexToRgba(color, 0.06) : "rgba(255,255,255,0.015)";
        stroke = hexToRgba(segmentPalette[node.segmentIndex] || "#ffffff", 0.08);
      } else {
        classes.push("is-visible");
        fill = state.editorView.showNodeColors
          ? node.layer > safeOuterLayer
            ? hexToRgba(color, 0.04)
            : room.state === "running" && node.layer === safeOuterLayer
              ? hexToRgba(color, 0.2)
              : hexToRgba(color, 0.13)
          : node.layer > safeOuterLayer
            ? "rgba(255,255,255,0.012)"
            : room.state === "running" && node.layer === safeOuterLayer
              ? "rgba(255,255,255,0.045)"
              : "rgba(255,255,255,0.02)";
      }

      return `<rect class="${classes.join(" ")}" x="${rect.x}" y="${rect.y}" width="${rect.size}" height="${rect.size}" fill="${fill}" style="stroke:${stroke};"></rect>`;
    })
    .join("");
}

function buildMazeWalls(room, safeOuterLayer) {
  const wallGeometry = getWallSegmentGeometry(room);
  const nodesByKey = getNodesByKey(room);
  const limitedView = isLimitedPlayerView(room) && !editorIsAvailable();
  return (room.maze.wallSegments || [])
    .filter((segment) => segment.state !== "down" && segment.state !== "unknown")
    .map((segment) => {
      const geometry = wallGeometry[segment.key];
      if (!geometry) {
        return "";
      }
      const adjacentLayers = [];
      if (segment.orientation === "h") {
        const aboveNode = nodesByKey[`${segment.row - 1}:${segment.col}`];
        const belowNode = nodesByKey[`${segment.row}:${segment.col}`];
        if (aboveNode) {
          adjacentLayers.push(aboveNode.layer);
        }
        if (belowNode) {
          adjacentLayers.push(belowNode.layer);
        }
      } else {
        const leftNode = nodesByKey[`${segment.row}:${segment.col - 1}`];
        const rightNode = nodesByKey[`${segment.row}:${segment.col}`];
        if (leftNode) {
          adjacentLayers.push(leftNode.layer);
        }
        if (rightNode) {
          adjacentLayers.push(rightNode.layer);
        }
      }
      const lineLayer = adjacentLayers.length ? Math.min(...adjacentLayers) : safeOuterLayer;
      const maxAdjacentLayer = adjacentLayers.length ? Math.max(...adjacentLayers) : safeOuterLayer;
      if (lineLayer > safeOuterLayer || maxAdjacentLayer > safeOuterLayer) {
        return "";
      }
      const extraClass =
        segment.row === 0 ||
        segment.col === 0 ||
        segment.row === room.maze.gridSize ||
        segment.col === room.maze.gridSize
          ? "outer-wall"
          : "";
      const classes = [buildWallClass(lineLayer, safeOuterLayer, extraClass)];
      if (limitedView) {
        classes.push("is-known");
      }
      return `<line class="${classes.join(" ")}" x1="${geometry.x1}" y1="${geometry.y1}" x2="${geometry.x2}" y2="${geometry.y2}"></line>`;
    })
    .join("");
}

function buildWallEditorOverlay(room) {
  const wallGeometry = getWallSegmentGeometry(room);
  const pillarGeometry = getPillarGeometry(room);
  const segments = [];
  const pillars = [];
  const hitPadding = 12;
  const pillarRadius = 6;
  const barThickness = 12;

  function pushWall(segment) {
    const geometry = wallGeometry[segment.key];
    if (!geometry) {
      return;
    }
    const { x1, y1, x2, y2 } = geometry;
    const stateClass = segment.state === "down" ? "is-open" : "is-closed";
    const horizontal = y1 === y2;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const hitX = horizontal ? minX : x1 - hitPadding;
    const hitY = horizontal ? y1 - hitPadding : minY;
    const hitWidth = horizontal ? Math.abs(x2 - x1) : hitPadding * 2;
    const hitHeight = horizontal ? hitPadding * 2 : Math.abs(y2 - y1);
    const barX = horizontal ? minX + pillarRadius : x1 - barThickness / 2;
    const barY = horizontal ? y1 - barThickness / 2 : minY + pillarRadius;
    const barWidth = horizontal ? Math.abs(x2 - x1) - pillarRadius * 2 : barThickness;
    const barHeight = horizontal ? barThickness : Math.abs(y2 - y1) - pillarRadius * 2;
    segments.push(
      `<g class="editor-wall-group ${stateClass}">
        <rect
          class="editor-wall-hitbox"
          data-segment-key="${segment.key}"
          x="${hitX}"
          y="${hitY}"
          width="${hitWidth}"
          height="${hitHeight}"
          rx="6"
          ry="6"
        ></rect>
        <rect
          class="editor-wall-bar ${stateClass}"
          x="${barX}"
          y="${barY}"
          width="${barWidth}"
          height="${barHeight}"
          rx="4"
          ry="4"
        ></rect>
      </g>`
    );
  }

  (room.maze.wallSegments || []).forEach(pushWall);
  (room.maze.pillars || []).forEach((pillar) => {
    const point = pillarGeometry[pillar.key];
    if (point) {
      pillars.push(`<circle class="editor-pillar" cx="${point.x}" cy="${point.y}" r="${pillarRadius}"></circle>`);
    }
  });

  return `
    <g class="editor-segments">${segments.join("")}</g>
    <g class="editor-pillars">${pillars.join("")}</g>
  `;
}

function getViewerForRoom(room = state.room) {
  return room?.players?.find((candidate) => candidate.id === room?.viewerId) || null;
}

function getPlayerScoreText(player, room = state.room) {
  if (!player.alive) {
    return "Fallen";
  }
  if (player.score == null) {
    return getViewerForRoom(room)?.alive === false ? "Unknown" : "Hidden";
  }
  return `${player.score} score`;
}

function getPlayerBeastText(player) {
  if (!player?.beastName) {
    return player?.seatIndex == null ? "Clan unchosen" : `${capitalize(player.direction)} gate`;
  }
  return player.beastName;
}

function getPlayerLocationText(room, player) {
  const viewer = getViewerForRoom(room);
  if (!player.alive) {
    return `Destroyed by ${player.eliminatedReason || "combat"}`;
  }
  if (room?.state === "finished" && room.winners?.includes(player.id)) {
    return "Secured the core";
  }
  if (isLimitedPlayerView(room) && player.id !== room.viewerId && !player.visibleToViewer) {
    return viewer?.alive === false ? "Position concealed" : "Unseen";
  }
  if (player.positionState === "outside" && player.direction) {
    return `Waiting at the ${capitalize(player.direction)} gate`;
  }
  if (player.currentNodeId == null) {
    return isLimitedPlayerView(room) ? "Location hidden" : "Position unknown";
  }
  return `Seen at ${getNodeLabel(room, player.currentNodeId)}`;
}

function getBotIntentSummary(room, player) {
  if (!player?.botIntent || !player.alive) {
    return "";
  }
  const target = getNodeLabel(room, player.botIntent.targetNodeId);
  const stepCount = Number(player.botIntent.pathLength) || 0;
  const reasonMap = {
    diamond: "Sweeping nearby diamonds",
    core: "Driving toward the core",
  };
  const reason = reasonMap[player.botIntent.reason] || "Routing";
  return `${reason} toward ${target}${stepCount ? ` | ${stepCount} steps` : ""}`;
}

function setBoardCaption(text, alert = false) {
  dom.boardCaption.textContent = text;
  dom.boardCaption.classList.toggle("is-alert", Boolean(alert));
}

function getFinishMessage(room) {
  const finishLog = room?.logs?.find((entry) => entry.type === "finish");
  if (finishLog?.message) {
    return finishLog.message;
  }
  const winners = room?.players?.filter((player) => room.winners.includes(player.id)) || [];
  if (winners.length === 1) {
    return `${winners[0].name} secured the maze core for their clan.`;
  }
  if (winners.length > 1) {
    return `${winners.map((player) => player.name).join(", ")} finished on top.`;
  }
  return "The match is over.";
}

function setPhaseStatus(text, tone = "neutral") {
  dom.phaseCopy.textContent = text;
  dom.phaseCopy.className = `masthead-status is-${tone}`;
}

function renderHeader() {
  const room = state.room;
  const viewer = getViewer();
  const currentTurnPlayer = getCurrentTurnPlayer(room);
  const draftPlayer = getDraftPlayer(room);
  const victoryClaimant = getVictoryClaimant(room);
  const coreClaimInstruction = getCoreClaimInstruction(room, viewer);
  const dangerCopy = getViewerDangerCopy(room, viewer);
  dom.roomCode.textContent = room.code;
  dom.safeLayers.textContent = `${room.safeOuterLayer}/${room.rules.totalLayers}`;
  dom.startButton.classList.toggle("hidden", !(room.viewerIsHost && room.state === "lobby"));
  dom.startButton.textContent = "Start Clan Draft";

  if (room.state === "lobby") {
    const humans = room.players.filter((player) => !player.isBot).length;
    const requiredHumans = Math.max(1, Number(room.contenderCount) || humans || 1);
    setPhaseStatus(`Lobby | ${humans}/${requiredHumans} Marked`, "lobby");
    dom.purgeTimer.textContent = "Lobby Open";
    dom.turnStatus.textContent = "Not started";
    dom.youStatus.textContent = viewer ? "Ready" : "Spectating";
    setBoardCaption(isGmMode()
      ? "Build or inspect the maze in lobby, then start the room after the selected number of human testers have joined."
      : "Host a room or join one by code. The match begins only after the required number of human players have assembled.");
    return;
  }

  if (room.state === "draft") {
    setPhaseStatus(viewer?.id === room.draft?.currentPlayerId ? "Choose clan" : "Clan draft", "draft");
    dom.purgeTimer.textContent = `Clan Draft ${formatTime(getDeadlineCountdown(room.draft?.deadlineAt) || 0)}`;
    dom.turnStatus.textContent = draftPlayer
      ? viewer?.id === draftPlayer.id
        ? "Choose your clan"
        : `${draftPlayer.name} choosing clan`
      : "Clan draft";
    if (viewer?.seatIndex != null) {
      dom.youStatus.textContent = `${getPlayerBeastText(viewer)} | ${capitalize(viewer.direction)} gate`;
    } else if (viewer?.id === room.draft?.currentPlayerId) {
      dom.youStatus.textContent = "Choose your clan";
    } else {
      dom.youStatus.textContent = viewer ? "Waiting for clan draft" : "Spectating";
    }
    setBoardCaption(viewer?.id === room.draft?.currentPlayerId
      ? "Choose one open clan. Your beast, icon, and opening gate are locked in as soon as you join it."
      : "Watch the clan draft order. Chosen clans lock each Marked into a district and gate before round one.");
    return;
  }

  if (room.state === "finished") {
    const winners = room.players.filter((player) => room.winners.includes(player.id));
    const winnerText = winners.length ? winners.map((player) => player.name).join(", ") : "No winner";
    setPhaseStatus("Conquered", "finished");
    dom.purgeTimer.textContent = "Arena Locked";
    dom.turnStatus.textContent = "Finished";
    dom.youStatus.textContent = viewer?.alive ? "Survived" : viewer ? "Eliminated" : "Spectating";
    setBoardCaption(getFinishMessage(room));
    return;
  }

  const turnTimer = formatTime(getDeadlineCountdown(room.turn?.deadlineAt) || 0);
  setPhaseStatus(
    room.victory?.requiresCoreClaim && victoryClaimant
      ? viewer?.id === victoryClaimant.id
        ? "Claim core"
        : "Final chase"
      : currentTurnPlayer
        ? viewer?.id === currentTurnPlayer.id
          ? "Your turn"
          : "Live"
        : "Live",
    room.victory?.requiresCoreClaim && victoryClaimant
      ? "danger"
      : viewer?.id === currentTurnPlayer?.id
        ? "live"
        : "neutral"
  );
  dom.purgeTimer.textContent = `Turn Timer ${turnTimer}`;
  dom.turnStatus.textContent = room.victory?.requiresCoreClaim && victoryClaimant
    ? viewer?.id === victoryClaimant.id
      ? "Secure the core"
      : `${victoryClaimant.name} advancing`
    : currentTurnPlayer
      ? viewer?.id === currentTurnPlayer.id
        ? "Your move"
        : `${currentTurnPlayer.name} moving`
      : "Waiting";
  if (viewer?.alive) {
    if (room.victory?.requiresCoreClaim && viewer.id === victoryClaimant?.id) {
      dom.youStatus.textContent = `${getPlayerBeastText(viewer)} | Last Marked`;
    } else if (viewer.positionState === "outside") {
      dom.youStatus.textContent = `${getPlayerBeastText(viewer)} | Must enter`;
    } else {
      dom.youStatus.textContent = `${getPlayerBeastText(viewer)} | ${getPlayerScoreText(viewer, room)}`;
    }
  } else {
    dom.youStatus.textContent = viewer ? `Destroyed by ${viewer.eliminatedReason || "combat"}` : "Spectating";
  }

  if (viewer?.alive && room.turn?.currentPlayerId === viewer.id) {
    if (room.victory?.requiresCoreClaim && viewer.id === victoryClaimant?.id) {
      setBoardCaption(`You are the last of the Marked. Move to the center core and secure it for your clan.${dangerCopy}`, true);
      return;
    }
    setBoardCaption(
      viewer.positionState === "outside"
        ? `Opening move: step into the maze through your own clan gate before the timer expires.${dangerCopy}`
        : `Your turn: move exactly one node.${dangerCopy}`,
      true
    );
    return;
  }

  if (room.victory?.requiresCoreClaim) {
    setBoardCaption(`${coreClaimInstruction.trimStart()}${dangerCopy}`, true);
    return;
  }

  setBoardCaption(
    viewer?.alive
      ? `Map what you can see, remember stale diamonds carefully, and wait for your turn.${dangerCopy}`
      : "Stay to watch the rest of the room play out.",
    Boolean(dangerCopy)
  );
}

function renderScoreboard() {
  const players = state.room.players
    .slice()
    .sort((left, right) => {
      if (left.isCurrentTurn !== right.isCurrentTurn) {
        return Number(right.isCurrentTurn) - Number(left.isCurrentTurn);
      }
      if (left.alive !== right.alive) {
        return Number(right.alive) - Number(left.alive);
      }
      return (right.score || 0) - (left.score || 0) || left.name.localeCompare(right.name);
    });

  dom.scoreboard.innerHTML = players
    .map((player) => {
      const viewerTag = player.id === state.room.viewerId ? " - You" : "";
      const roleTag = player.isBot ? " [BOT]" : "";
      const isWinner = state.room.state === "finished" && state.room.winners.includes(player.id);
      const statusSeal = isWinner ? "Victor" : !player.alive ? "Fallen" : "";
      const turnTag =
        state.room.victory?.requiresCoreClaim && player.id === state.room.victory.soleSurvivorId && player.alive
          ? "Sole survivor | Secure core"
          : player.isCurrentTurn
            ? "Turn now"
            : player.id === state.room.draft?.currentPlayerId
              ? "Draft pick"
              : "";
      const stats = [
        player.kills == null ? null : `Kills ${player.kills}`,
        player.diamondsCollected == null ? null : `Diamonds ${player.diamondsCollected}`,
      ]
        .filter(Boolean)
        .join(" | ");
      const footerText = isWinner
        ? "Claimed the maze"
        : !player.alive
          ? stats || "Defeated"
          : [turnTag || "Standing", stats].filter(Boolean).join(" | ");

      return `
        <article class="score-row ${player.isCurrentTurn ? "is-current-turn" : ""} ${!player.alive ? "is-out" : ""} ${isWinner ? "is-winner" : ""} ${statusSeal ? "has-seal" : ""}">
          <div class="score-topline">
            <span class="runner-chip">${player.name}${roleTag}${viewerTag}</span>
            ${statusSeal ? "" : `<strong>${getPlayerScoreText(player, state.room)}</strong>`}
          </div>
          <div class="runner-meta">${getPlayerBeastText(player)}</div>
          <div class="runner-meta">${getPlayerLocationText(state.room, player)}</div>
          <div class="runner-meta">${footerText}</div>
          ${statusSeal
            ? getStatusSealMarkup(player, statusSeal, isWinner ? "is-victor" : "is-fallen")
            : ""}
          ${player.isBot && isGmMode() ? `<div class="runner-intent">${getBotIntentSummary(state.room, player) || "Holding position"}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderLayerStrip() {
  const room = state.room;
  if (!room || room.state === "lobby") {
    dom.layerStrip.innerHTML = "";
    dom.layerStrip.classList.add("hidden");
    return;
  }

  dom.layerStrip.classList.remove("hidden");
  const chips = [];
  const totalLayers = room.rules.totalLayers;
  const columns = totalLayers >= 16 ? 8 : totalLayers >= 12 ? 6 : totalLayers >= 9 ? 5 : Math.max(4, totalLayers);
  dom.layerStrip.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  for (let layer = room.rules.totalLayers; layer >= 1; layer -= 1) {
    const color = layerPalette[layer - 1] || "#ffffff";
    const isNextLayer =
      room.state === "running" && layer === room.purge?.nextLayer && room.purge?.roundsUntilNextPurge != null;
    const roundsUntilPurge = isNextLayer ? Number(room.purge.roundsUntilNextPurge) : null;
    const classes = ["layer-chip"];
    if (layer > room.safeOuterLayer) {
      classes.push("is-purged");
    } else {
      classes.push("is-safe");
      if (isNextLayer) {
        classes.push("is-current");
        if (roundsUntilPurge <= 1) {
          classes.push("is-critical");
        } else if (roundsUntilPurge <= 3) {
          classes.push("is-warning");
        }
      }
    }
    const strongCopy =
      layer > room.safeOuterLayer
        ? "Purged"
        : isNextLayer
          ? `In ${formatRounds(room.purge.roundsUntilNextPurge)}`
          : "Standing";
    const metaCopy =
      layer === room.rules.finalSafeLayers
        ? "Purge stops here"
        : isNextLayer
          ? "Next to fall"
          : layer === room.rules.totalLayers
            ? "Outer"
            : layer === 1
              ? "Core"
              : "Ring";

    chips.push(`
      <article class="${classes.join(" ")}" style="background: linear-gradient(180deg, ${color}26, rgba(255,255,255,0.04)); border-color: ${color}44;">
        <span>Layer ${layer}</span>
        <strong>${strongCopy}</strong>
        <em>${metaCopy}</em>
      </article>
    `);
  }
  dom.layerStrip.innerHTML = chips.join("");
}

function renderEventLog() {
  if (!state.room.logs.length) {
    dom.eventLog.innerHTML = '<div class="empty-state">No arena events yet.</div>';
    return;
  }
  const typeLabels = {
    system: "System",
    draft: "Banner",
    turn: "Turn",
    diamond: "Diamond",
    combat: "Combat",
    purge: "Purge",
    finish: "Finish",
  };
  dom.eventLog.innerHTML = state.room.logs
    .map(
      (entry) => `
        <article class="event-item">
          <div class="event-topline">
            <time datetime="${new Date(entry.at).toISOString()}">${entry.matchTimeMs != null ? formatMatchTime(entry.matchTimeMs) : timeAgo(entry.at)}</time>
            <span class="event-badge is-${entry.type || "system"}">${typeLabels[entry.type] || "Event"}</span>
          </div>
          <p>${entry.message}</p>
          ${entry.detail ? `<div class="event-detail">${entry.detail}</div>` : ""}
        </article>
      `
    )
    .join("");
}

function renderEditorValidation() {
  if (!dom.editorValidation || !dom.editorMinimap) {
    return;
  }
  if (!editorIsAvailable()) {
    dom.editorValidation.innerHTML = "";
    dom.editorMinimap.innerHTML = "";
    return;
  }
  const validation = state.room?.maze?.validation;
  if (!validation) {
    dom.editorValidation.innerHTML = '<div class="empty-state">Validation data unavailable.</div>';
    return;
  }

  const entryLines = (validation.entryDistances || [])
    .map((entry) => `<div class="editor-checkline">Gate ${entry.gate}: ${entry.reachesCore ? `${entry.distanceToCore} to core` : "blocked"}</div>`)
    .join("");

  dom.editorValidation.innerHTML = `
    <article class="editor-check ${validation.allEntriesReachCore ? "is-good" : "is-warn"}">
      <strong>${validation.allEntriesReachCore ? "All entries reach the core" : "Some entries are blocked"}</strong>
      <span>${validation.symmetricEntryDistances ? "Entry distances are symmetric." : "Entry distances are not yet symmetric."}</span>
    </article>
    <article class="editor-check">
      <strong>${validation.reachableNodeCount} reachable cells</strong>
      <span>${validation.isolatedNodeCount} isolated cells</span>
    </article>
    <article class="editor-check">
      <strong>${validation.deadEndCount} dead ends</strong>
      <span>${validation.fairnessGap == null ? "No fairness delta yet." : `Path delta ${validation.fairnessGap}`}</span>
    </article>
    <div class="editor-checkstack">${entryLines}</div>
  `;
}

function renderEditorMinimap() {
  if (!dom.editorMinimap) {
    return;
  }
  if (!editorIsAvailable()) {
    dom.editorMinimap.innerHTML = "";
    return;
  }
  const wallGeometry = getWallSegmentGeometry(state.room);
  const pillarGeometry = getPillarGeometry(state.room);
  const base = getBaseViewFrame(state.room);
  const viewBox = getEditorViewBox(state.room);
  const size = 180;
  const padding = 12;
  const scale = (size - padding * 2) / base.width;

  const wallMarkup = (state.room.maze.wallSegments || [])
    .filter((segment) => segment.state !== "down")
    .map((segment) => {
      const geometry = wallGeometry[segment.key];
      if (!geometry) {
        return "";
      }
      return `<line class="minimap-wall" x1="${padding + (geometry.x1 - base.x) * scale}" y1="${padding + (geometry.y1 - base.y) * scale}" x2="${padding + (geometry.x2 - base.x) * scale}" y2="${padding + (geometry.y2 - base.y) * scale}"></line>`;
    })
    .join("");

  const pillarMarkup = Object.values(pillarGeometry)
    .map((point) => `<circle class="minimap-pillar" cx="${padding + (point.x - base.x) * scale}" cy="${padding + (point.y - base.y) * scale}" r="1.9"></circle>`)
    .join("");

  const frameX = padding + (viewBox.x - base.x) * scale;
  const frameY = padding + (viewBox.y - base.y) * scale;
  const frameWidth = viewBox.width * scale;
  const frameHeight = viewBox.height * scale;

  dom.editorMinimap.innerHTML = `
    <rect class="minimap-bg" x="0" y="0" width="${size}" height="${size}" rx="16" ry="16"></rect>
    ${wallMarkup}
    ${pillarMarkup}
    <rect class="minimap-frame" x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="8" ry="8"></rect>
  `;
}

function renderEditorPanel() {
  if (!dom.editorPanel) {
    return;
  }
  const visible = editorIsAvailable();
  dom.editorPanel.classList.toggle("hidden", !visible);
  if (!visible) {
    return;
  }
  if (document.activeElement !== dom.editorLayoutName) {
    dom.editorLayoutName.value = state.room.editorMetadata?.name || "";
  }
  if (document.activeElement !== dom.editorLayoutNotes) {
    dom.editorLayoutNotes.value = state.room.editorMetadata?.notes || "";
  }
  dom.editorTotalLayers.value = String(state.room.editorSettings?.totalLayers || state.room.rules.totalLayers || 10);
  dom.toggleNodeColors.textContent = state.editorView.showNodeColors ? "Hide Node Color" : "Show Node Color";
  dom.toggleDiamonds.textContent = state.editorView.showDiamonds ? "Hide Diamonds" : "Show Diamonds";
  dom.toggleNodeColors.classList.toggle("is-active", !state.editorView.showNodeColors);
  dom.toggleDiamonds.classList.toggle("is-active", !state.editorView.showDiamonds);
  dom.undoLayout.disabled = !state.room.editorHistory?.canUndo;
  dom.redoLayout.disabled = !state.room.editorHistory?.canRedo;
  const mirrorMode = dom.editorMirrorMode.value;
  const mirrorLabel =
    mirrorMode === "quad"
      ? "Four-way mirror is active. Each click updates all four segments."
      : mirrorMode === "opposite"
        ? "Opposite mirror is active. Each click updates the matching opposite side."
        : "Mirror is off. Only the wall you click will change.";
  dom.editorStatus.textContent =
    state.editorMessage ||
    `Lobby-only editor: click wall bars to switch them up or down, drag to pan, and hold Ctrl while using the mouse wheel to zoom. ${mirrorLabel}`;
  renderEditorValidation();
  renderEditorMinimap();
}

function renderControlPad() {
  if (!dom.controlPad) {
    return;
  }
  const controls = state.room?.controls;
  const roomRunning = state.room?.state === "running";
  const viewer = getViewer();
  dom.controlPad.querySelectorAll("button").forEach((button) => {
    const direction = button.dataset.direction;
    const action = button.dataset.action;
    let enabled = Boolean(roomRunning && viewer && viewer.alive);
    if (enabled && direction) {
      enabled = Boolean(controls && controls.directions && controls.directions[direction] != null);
    }
    if (enabled && action === "stop") {
      enabled = Boolean(controls && controls.canStop);
    }
    button.disabled = !enabled;
  });
}

function renderMaze() {
  const room = state.room;
  const viewer = getViewer();
  const geometry = buildGeometryCache(room);
  const positions = geometry.positions;
  const rects = geometry.rects;
  const metrics = getGridMetrics(room);
  const safeOuterLayer = room.safeOuterLayer;
  const visibleNodeIds = getVisibleNodeIds(room);
  const discoveredNodeIds = getDiscoveredNodeIds(room);
  const legalMoveIds = new Set(room.controls?.neighborNodeIds || []);
  const limitedView = isLimitedPlayerView(room) && !editorIsAvailable();
  const draftAvailableSeats = new Set(room.draft?.availableSeats || []);
  const mazeCells = buildMazeCells(room, safeOuterLayer);
  const walls = editorIsAvailable() ? "" : buildMazeWalls(room, safeOuterLayer);
  const editorOverlay = editorIsAvailable() ? buildWallEditorOverlay(room) : "";
  const currentViewBox = editorIsAvailable() ? getEditorViewBox(room) : getBaseViewFrame(room);
  dom.mazeSvg.setAttribute("viewBox", `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);

  const layerBoundaries = Array.from({ length: room.rules.totalLayers }, (_, index) => {
    const layer = index + 1;
    if (layer > safeOuterLayer) {
      return "";
    }
    const bounds = getLayerBounds(layer, room);
    return `<rect class="layer-boundary" x="${bounds.x}" y="${bounds.y}" width="${bounds.size}" height="${bounds.size}" rx="12" ry="12"></rect>`;
  }).join("");

  const purgedRings = "";

  const segmentDividers = "";

  const cells = room.maze.nodes
    .map((node) => {
      const position = positions[node.id];
      const rect = rects[node.id];
      const diamondValue = room.diamonds[node.id];
      const active = node.layer <= safeOuterLayer;
      const color = layerPalette[node.layer - 1] || "#ffffff";
      const discovered = !limitedView || discoveredNodeIds.has(node.id);
      const visible = !limitedView || visibleNodeIds.has(node.id);
      const isCurrent = viewer && node.id === viewer.currentNodeId;
      const isLegal = legalMoveIds.has(node.id);
      const showDiamond = state.editorView.showDiamonds && discovered && diamondValue > 0;
      return `
        <g data-node-id="${node.id}">
          ${isCurrent ? `<rect class="current-node-ring" x="${rect.x + 7}" y="${rect.y + 7}" width="${rect.size - 14}" height="${rect.size - 14}" rx="8" ry="8"></rect>` : ""}
          ${
            active && showDiamond
              ? `<rect
                  class="diamond ${visible ? "" : "is-memory"}"
                  x="${position.x - 4}"
                  y="${position.y - 4}"
                  width="8"
                  height="8"
                  rx="2"
                  transform="rotate(45 ${position.x} ${position.y})"
                  fill="${color}"
                  style="color:${color};"
                ></rect>`
              : ""
          }
          ${
            active && discovered && (editorIsAvailable() || isLegal)
              ? `<rect class="node-hit ${isLegal ? "is-legal" : ""}" data-node-id="${node.id}" x="${rect.x + 4}" y="${rect.y + 4}" width="${rect.size - 8}" height="${rect.size - 8}" rx="6" ry="6"></rect>`
              : ""
          }
        </g>
      `;
    })
    .join("");

  const entryOffsets = [
    { x: 0, y: -metrics.cellSize * 0.95 },
    { x: metrics.cellSize * 0.95, y: 0 },
    { x: 0, y: metrics.cellSize * 0.95 },
    { x: -metrics.cellSize * 0.95, y: 0 },
  ];

  const entries = room.maze.entries
    .map((nodeId, index) => {
      const entryNode = room.maze.nodes[nodeId];
      if (!entryNode || entryNode.layer > safeOuterLayer) {
        return "";
      }
      const point = positions[nodeId];
      const offset = entryOffsets[index] || { x: 0, y: 0 };
      const gateMeta = getGateMeta(index, room);
      const selectable = room.state === "draft" && viewer?.id === room.draft?.currentPlayerId && draftAvailableSeats.has(index);
      const entryClasses = [
        "entry-marker",
        selectable ? "is-selectable" : "",
        draftAvailableSeats.has(index) ? "is-open" : "is-claimed",
      ]
        .filter(Boolean)
        .join(" ");
      const iconPath = gateMeta?.iconPath || "";
      const clipId = `entry-clip-${sanitizeSvgId(`${room.code || "room"}-${index}`)}`;
      return `
        <g class="${entryClasses}" transform="translate(${point.x + offset.x} ${point.y + offset.y})" ${selectable ? `data-seat-index="${index}"` : ""}>
          <circle r="16"></circle>
          ${iconPath
            ? `
          <defs>
            <clipPath id="${clipId}">
              <circle r="11.5"></circle>
            </clipPath>
          </defs>
          <image
            class="entry-icon"
            href="${iconPath}"
            x="-11.5"
            y="-11.5"
            width="23"
            height="23"
            preserveAspectRatio="xMidYMid slice"
            clip-path="url(#${clipId})"
          ></image>`
            : `<text y="7">${gateMeta?.beastShort || index + 1}</text>`}
          ${room.state === "draft" ? `<text class="entry-caption" y="31">${escapeHtml(gateMeta?.direction || "")}</text>` : ""}
        </g>
      `;
    })
    .join("");

  const players = room.players
    .filter(
      (player) =>
        player.alive &&
        player.visibleToViewer &&
        (!player.currentNodeId || room.maze.nodes[player.currentNodeId]?.layer <= safeOuterLayer) &&
        (player.currentNodeId != null || player.positionState === "outside")
    )
    .map((player) => {
      const entryOffset = entryOffsets[player.seatIndex || 0] || { x: 0, y: 0 };
      const point =
        player.currentNodeId != null
          ? positions[player.currentNodeId]
          : {
              x: positions[player.entryNodeId]?.x + entryOffset.x * 1.55,
              y: positions[player.entryNodeId]?.y + entryOffset.y * 1.55,
            };
      if (!point || Number.isNaN(point.x) || Number.isNaN(point.y)) {
        return "";
      }
      const radius = player.id === room.viewerId ? 14 : 12;
      const nameOffset = player.id === room.viewerId ? 28 : 24;
      const iconPath = getPlayerIconPath(player);
      const portraitRadius = Math.max(8, radius - 2);
      const clipId = `runner-clip-${sanitizeSvgId(player.id)}`;
      const shellClass = [
        "runner-shell",
        player.alive ? "" : "is-dead",
        player.positionState === "outside" ? "is-outside" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const tokenAttributes =
        player.currentNodeId != null ? `data-node-id="${player.currentNodeId}"` : "";
      return `
        <g class="runner-token ${player.positionState === "outside" ? "is-outside" : ""}" transform="translate(${point.x} ${point.y})" ${tokenAttributes}>
          <circle class="runner-halo" r="${radius + 3}" fill="${player.color || "#e8c889"}"></circle>
          ${iconPath
            ? `
          <defs>
            <clipPath id="${clipId}">
              <circle r="${portraitRadius}"></circle>
            </clipPath>
          </defs>
          <image
            class="runner-portrait"
            href="${iconPath}"
            x="${-portraitRadius}"
            y="${-portraitRadius}"
            width="${portraitRadius * 2}"
            height="${portraitRadius * 2}"
            preserveAspectRatio="xMidYMid slice"
            clip-path="url(#${clipId})"
          ></image>`
            : `<circle class="runner-shell-fill" r="${portraitRadius}" fill="${player.color || "#e8c889"}"></circle>
          <text class="runner-label" y="1">${escapeHtml(player.beastShort || player.name.slice(0, 1).toUpperCase())}</text>`}
          <circle class="${shellClass}" r="${radius}" fill="none"></circle>
          <text class="runner-name" y="${nameOffset}">${player.name}</text>
        </g>
      `;
    })
    .join("");

  dom.mazeSvg.innerHTML = `
    ${mazeCells}
    ${segmentDividers}
    ${layerBoundaries}
    ${purgedRings}
    ${walls}
    ${cells}
    ${editorOverlay}
    ${entries}
    ${players}
  `;
}

function refreshTimer() {
  if (!state.room) {
    return;
  }
  if (state.room.state === "draft") {
    dom.purgeTimer.textContent = `Banner Claim ${formatTime(getDeadlineCountdown(state.room.draft?.deadlineAt) || 0)}`;
    return;
  }
  if (state.room.state === "running") {
    dom.purgeTimer.textContent = `Turn Timer ${formatTime(getDeadlineCountdown(state.room.turn?.deadlineAt) || 0)}`;
  }
}

function render() {
  if (!state.room) {
    return;
  }
  renderHeader();
  renderScoreboard();
  renderLayerStrip();
  renderControlPad();
  renderEditorPanel();
  renderEventLog();
  renderMaze();
  refreshTimer();

  if (!state.timerInterval) {
    state.timerInterval = setInterval(refreshTimer, 250);
  }
}

function setEditorMessage(message) {
  state.editorMessage = message;
}

async function sendAction(payload) {
  if (!state.session || !state.room) {
    return;
  }
  const viewer = getViewer();
  if (!viewer || !viewer.alive || state.room.state !== "running") {
    return;
  }
  const now = Date.now();
  if (now - state.lastActionSentAt < 90) {
    return;
  }
  state.lastActionSentAt = now;
  try {
    await api(`/api/rooms/${state.session.code}/action`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        ...payload,
      },
    });
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function sendDraftPick(seatIndex) {
  if (!state.session || !state.room) {
    return;
  }
  try {
    await api(`/api/rooms/${state.session.code}/draft/pick`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        seatIndex,
      },
    });
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function sendWallEdit(segmentKey) {
  if (!state.session || !editorIsAvailable()) {
    return;
  }
  try {
    const response = await api(`/api/rooms/${state.session.code}/editor/wall`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        segmentKey,
        mirrorMode: dom.editorMirrorMode.value,
      },
    });
    if (response.room) {
      setRoom(response.room);
    } else if (state.session) {
      const latest = await api(buildRoomStatePath(state.session.code, state.session.token));
      setRoom(latest);
    }
    const wallAction = response.applied?.[0]?.state === "down" ? "opened" : "closed";
    const mirrorMode = dom.editorMirrorMode.value;
    const mirrorLabel =
      mirrorMode === "quad" ? " with four-way mirroring" : mirrorMode === "opposite" ? " with opposite mirroring" : "";
    setEditorMessage(`Segment ${segmentKey} ${wallAction}${mirrorLabel}.`);
    render();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function exportLayoutDesign() {
  if (!state.session || !editorIsAvailable()) {
    return;
  }
  try {
    const response = await api(`/api/rooms/${state.session.code}/editor/export`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        name: dom.editorLayoutName.value,
        notes: dom.editorLayoutNotes.value,
      },
    });
    setEditorMessage(`Layout exported to ${response.exportPath}. Move that file into the live rotation when you are ready for human trials.`);
    render();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function applyEditorCanvas() {
  if (!state.session || !editorIsAvailable()) {
    return;
  }
  try {
    const response = await api(`/api/rooms/${state.session.code}/editor/config`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        totalLayers: Number(dom.editorTotalLayers.value),
      },
    });
    if (response.room) {
      setRoom(response.room);
    }
    setEditorMessage(`Canvas rebuilt to ${Number(dom.editorTotalLayers.value)} layers. Wall layout reset to a sealed editor baseline.`);
    render();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function saveEditorMetadata() {
  if (!state.session || !editorIsAvailable()) {
    return;
  }
  try {
    const response = await api(`/api/rooms/${state.session.code}/editor/metadata`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
        name: dom.editorLayoutName.value,
        notes: dom.editorLayoutNotes.value,
      },
    });
    if (response.room) {
      setRoom(response.room);
    }
    setEditorMessage("Layout details saved.");
    render();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function stepEditorHistory(direction) {
  if (!state.session || !editorIsAvailable()) {
    return;
  }
  try {
    const response = await api(`/api/rooms/${state.session.code}/editor/${direction}`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        token: state.session.token,
      },
    });
    if (response.room) {
      setRoom(response.room);
    }
    setEditorMessage(direction === "undo" ? "Undid the latest layout change." : "Redid the next layout change.");
    render();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleCreate(event) {
  event.preventDefault();
  try {
    const response = await api("/api/rooms", {
      method: "POST",
      body: {
        mode: APP_MODE,
        name: dom.createName.value,
        contenderCount: Number(dom.createContenders.value),
      },
    });
    await connectSession(response.session);
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleJoin(event) {
  event.preventDefault();
  try {
    const code = dom.joinCode.value.trim().toUpperCase();
    const response = await api(`/api/rooms/${code}/join`, {
      method: "POST",
      body: {
        mode: APP_MODE,
        name: dom.joinName.value,
      },
    });
    await connectSession(response.session);
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function handleStart() {
  if (!state.session || !state.room) {
    return;
  }
  try {
    await startCurrentRoom(state.room.contenderCount);
  } catch (error) {
    showStatus(error.message, "error");
  }
}

function handleNodeClick(event) {
  const room = state.room;
  const viewer = getViewer();
  if (!room || room.state !== "running" || !viewer || !viewer.alive) {
    return;
  }
  const target = event.target.closest("[data-node-id]");
  if (!target) {
    return;
  }
  const targetNodeId = Number(target.getAttribute("data-node-id"));
  if (Number.isNaN(targetNodeId)) {
    return;
  }
  if (!room.controls?.neighborNodeIds?.includes(targetNodeId)) {
    return;
  }
  sendAction({
    kind: "route",
    targetNodeId,
  });
}

function handleDraftPickClick(event) {
  const room = state.room;
  const viewer = getViewer();
  if (!room || room.state !== "draft" || !viewer || room.draft?.currentPlayerId !== viewer.id) {
    return false;
  }
  const gate = event.target.closest("[data-seat-index]");
  if (!gate) {
    return false;
  }
  const seatIndex = Number(gate.getAttribute("data-seat-index"));
  if (Number.isNaN(seatIndex)) {
    return false;
  }
  sendDraftPick(seatIndex);
  return true;
}

function handleWallClick(event) {
  if (!editorIsAvailable()) {
    return false;
  }
  const wall = event.target?.closest?.("[data-segment-key]") || null;
  if (!wall) {
    return false;
  }
  const segmentKey = wall.getAttribute("data-segment-key");
  if (!segmentKey) {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  sendWallEdit(segmentKey);
  return true;
}

function handleControlPadClick(event) {
  const button = event.target.closest("button");
  if (!button || button.disabled) {
    return;
  }
  if (button.dataset.action === "stop") {
    sendAction({ kind: "stop" });
    return;
  }
  if (button.dataset.direction) {
    sendAction({
      kind: "direction",
      direction: button.dataset.direction,
    });
  }
}

function handleAnnouncementDismiss() {
  hideAnnouncement();
}

function handleAnnouncementOverlayClick(event) {
  if (event.target !== dom.winOverlay) {
    return;
  }
  hideAnnouncement();
}

function handleKeyDown(event) {
  if (event.key === "Escape" && dom.winOverlay && !dom.winOverlay.classList.contains("hidden")) {
    event.preventDefault();
    hideAnnouncement();
    return;
  }
  const activeTag = document.activeElement?.tagName;
  if (activeTag && ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(activeTag)) {
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const keyMap = {
    " ": { kind: "stop" },
    Spacebar: { kind: "stop" },
  };

  const action = keyMap[event.key];
  if (!action) {
    return;
  }
  event.preventDefault();
  if (action.kind === "stop") {
    sendAction({ kind: "stop" });
  }
}

function handleMazeClick(event) {
  if (editorIsAvailable()) {
    return;
  }
  if (handleWallClick(event)) {
    return;
  }
  if (handleDraftPickClick(event)) {
    return;
  }
  handleNodeClick(event);
}

function handleMazePointerDown(event) {
  if (!editorIsAvailable()) {
    return;
  }
  if (handleWallClick(event)) {
    return;
  }
  state.editorView.isPanning = true;
  state.editorView.pointerId = event.pointerId;
  state.editorView.lastClientX = event.clientX;
  state.editorView.lastClientY = event.clientY;
  dom.mazeSvg.setPointerCapture?.(event.pointerId);
}

function handleMazePointerMove(event) {
  if (!editorIsAvailable() || !state.editorView.isPanning || state.editorView.pointerId !== event.pointerId || !state.room) {
    return;
  }
  const currentViewBox = getEditorViewBox(state.room);
  const scaleX = currentViewBox.width / dom.mazeSvg.clientWidth;
  const scaleY = currentViewBox.height / dom.mazeSvg.clientHeight;
  const deltaX = (event.clientX - state.editorView.lastClientX) * scaleX;
  const deltaY = (event.clientY - state.editorView.lastClientY) * scaleY;
  state.editorView.panX -= deltaX;
  state.editorView.panY -= deltaY;
  state.editorView.lastClientX = event.clientX;
  state.editorView.lastClientY = event.clientY;
  render();
}

function endMazePan(event) {
  if (state.editorView.pointerId != null && event?.pointerId != null && state.editorView.pointerId !== event.pointerId) {
    return;
  }
  state.editorView.isPanning = false;
  state.editorView.pointerId = null;
}

function handleMazeWheel(event) {
  if (!editorIsAvailable()) {
    return;
  }
  if (!event.ctrlKey) {
    return;
  }
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  updateEditorZoom(state.editorView.zoom * factor);
}

function handleEditorViewToggle(event) {
  const target = event.currentTarget;
  if (target === dom.toggleNodeColors) {
    state.editorView.showNodeColors = !state.editorView.showNodeColors;
  } else if (target === dom.toggleDiamonds) {
    state.editorView.showDiamonds = !state.editorView.showDiamonds;
  }
  render();
}

function handleExportLayout() {
  exportLayoutDesign();
}

function handleApplyCanvas() {
  applyEditorCanvas();
}

function handleSaveMetadata() {
  saveEditorMetadata();
}

function handleUndoLayout() {
  stepEditorHistory("undo");
}

function handleRedoLayout() {
  stepEditorHistory("redo");
}

function updateEditorZoom(nextZoom) {
  state.editorView.zoom = clampZoom(nextZoom);
  render();
}

function handleZoomIn() {
  updateEditorZoom(state.editorView.zoom * 1.2);
}

function handleZoomOut() {
  updateEditorZoom(state.editorView.zoom / 1.2);
}

function handleResetView() {
  resetEditorViewport();
  render();
}

function handleCenterCore() {
  state.editorView.panX = 0;
  state.editorView.panY = 0;
  render();
}

async function handlePlatformRefresh() {
  await loadPlatformDashboard();
}

async function handlePlatformAuthRequest(event) {
  event.preventDefault();
  if (!dom.platformAuthDisplayName || !dom.platformAuthEmail) {
    return;
  }
  const displayName = dom.platformAuthDisplayName.value.trim();
  const email = dom.platformAuthEmail.value.trim();
  if (!displayName || !email) {
    setPlatformAlert("A display name and email are required to register.", "error");
    return;
  }
  try {
    await api("/api/platform/auth/request-code", {
      method: "POST",
      body: {
        displayName,
        email,
      },
    });
    savePendingPlatformAuth({
      displayName,
      email,
      requestedAt: Date.now(),
    });
    if (dom.platformAuthVerifyEmail) {
      dom.platformAuthVerifyEmail.value = email;
    }
    setPlatformAlert("Check your email for the sign-in link. If your template sends a code, you can verify it below.", "success");
    renderPlatformDashboard();
  } catch (error) {
    setPlatformAlert(error.message || "Could not send your sign-in email.", "error");
  }
}

async function handlePlatformAuthVerify(event) {
  event.preventDefault();
  if (!dom.platformAuthVerifyEmail || !dom.platformAuthVerifyToken) {
    return;
  }
  const email = dom.platformAuthVerifyEmail.value.trim() || state.platform.pendingAuth?.email || "";
  const token = dom.platformAuthVerifyToken.value.trim();
  if (!email || !token) {
    setPlatformAlert("Enter both the email address and the one-time code from your email.", "error");
    return;
  }
  try {
    const result = await api("/api/platform/auth/verify", {
      method: "POST",
      body: {
        email,
        token,
        displayName: state.platform.pendingAuth?.displayName || "",
      },
    });
    savePlatformSession(result.session);
    state.platform.me = result.state || null;
    clearPendingPlatformAuth();
    dom.platformAuthVerifyToken.value = "";
    await loadPlatformDashboard();
    setPlatformAlert("You are now registered as a Maze Warrior.", "success");
  } catch (error) {
    setPlatformAlert(error.message || "Could not verify your sign-in code.", "error");
  }
}

async function handleSeasonClanGridClick(event) {
  const button = event.target.closest("[data-action='join-clan']");
  if (!button || button.disabled) {
    return;
  }
  const season = getPlatformStateSeason();
  const clanId = button.getAttribute("data-clan-id");
  if (!season?.id || !clanId) {
    setPlatformAlert("The current season is not ready for clan selection yet.", "error");
    return;
  }
  try {
    const result = await platformApi(`/api/platform/seasons/${season.id}/join-clan`, {
      method: "POST",
      body: {
        clanId,
      },
    });
    await loadPlatformDashboard();
    setPlatformAlert(
      result.alreadyJoined
        ? `Your seasonal oath to ${result.clan?.name || "that clan"} is already active.`
        : `${result.clan?.name || "That clan"} has accepted your seasonal oath.`,
      "success"
    );
  } catch (error) {
    setPlatformAlert(error.message || "Could not join that clan for the season.", "error");
  }
}

async function handlePlatformVolunteer(event) {
  event.preventDefault();
  const publication = getPlatformStatePublication();
  if (!publication?.id) {
    setPlatformAlert("There is no published maze accepting bearers right now.", "error");
    return;
  }
  try {
    await platformApi(`/api/platform/publications/${publication.id}/volunteer`, {
      method: "POST",
      body: {
        note: dom.platformVolunteerNote?.value || "",
      },
    });
    if (dom.platformVolunteerNote) {
      dom.platformVolunteerNote.value = "";
    }
    await loadPlatformDashboard();
    setPlatformAlert("Your clan offer has been recorded. Clan leadership can now confirm you as its bearer.", "success");
  } catch (error) {
    setPlatformAlert(error.message || "Could not volunteer as a Marked Bearer.", "error");
  }
}

function handlePlatformSignOut() {
  clearPlatformSession();
  clearPendingPlatformAuth();
  renderPlatformDashboard();
  setPlatformAlert("You left the registry on this browser.", "success");
}

async function restoreSession() {
  if (!hasRoomShell()) {
    return;
  }
  const saved = loadSession();
  if (!saved) {
    return;
  }
  try {
    await connectSession(saved);
  } catch (error) {
    disconnectSession();
  }
}

async function initializeApp() {
  if (!isGmMode()) {
    await restorePlatformAuthFromUrl();
    await loadPlatformDashboard();
  }
  if (hasRoomShell()) {
    await restoreSession();
  }
}

bind(dom.createForm, "submit", handleCreate);
bind(dom.joinForm, "submit", handleJoin);
bind(dom.startButton, "click", handleStart);
bind(dom.leaveButton, "click", disconnectSession);
bind(dom.announcementDismiss, "click", handleAnnouncementDismiss);
bind(dom.winOverlay, "click", handleAnnouncementOverlayClick);
bind(dom.mazeSvg, "click", handleMazeClick);
bind(dom.mazeSvg, "pointerdown", handleMazePointerDown);
bind(dom.mazeSvg, "pointermove", handleMazePointerMove);
bind(dom.mazeSvg, "pointerup", endMazePan);
bind(dom.mazeSvg, "pointercancel", endMazePan);
bind(dom.mazeSvg, "wheel", handleMazeWheel, { passive: false });
bind(dom.controlPad, "click", handleControlPadClick);
bind(dom.saveMetadata, "click", handleSaveMetadata);
bind(dom.applyCanvas, "click", handleApplyCanvas);
bind(dom.undoLayout, "click", handleUndoLayout);
bind(dom.redoLayout, "click", handleRedoLayout);
bind(dom.zoomIn, "click", handleZoomIn);
bind(dom.zoomOut, "click", handleZoomOut);
bind(dom.resetView, "click", handleResetView);
bind(dom.centerCore, "click", handleCenterCore);
bind(dom.editorMirrorMode, "change", renderEditorPanel);
bind(dom.toggleNodeColors, "click", handleEditorViewToggle);
bind(dom.toggleDiamonds, "click", handleEditorViewToggle);
bind(dom.exportLayout, "click", handleExportLayout);
bind(dom.platformRefresh, "click", handlePlatformRefresh);
bind(dom.platformAuthRequestForm, "submit", handlePlatformAuthRequest);
bind(dom.platformAuthVerifyForm, "submit", handlePlatformAuthVerify);
bind(dom.seasonClanGrid, "click", handleSeasonClanGridClick);
bind(dom.platformVolunteerForm, "submit", handlePlatformVolunteer);
bind(dom.platformSignOut, "click", handlePlatformSignOut);
window.addEventListener("keydown", handleKeyDown);

initializeApp();
