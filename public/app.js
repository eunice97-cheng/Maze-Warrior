const APP_MODE = document.body?.dataset?.appMode === "gm" ? "gm" : "player";
const LEGACY_SESSION_KEY = "maze-warrior-session";
const SESSION_KEY = `${LEGACY_SESSION_KEY}:${APP_MODE}`;
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
  { seatIndex: 2, direction: "South", beastName: "Red Phoenix", beastLabel: "Zhuque", beastShort: "Z", iconPath: "/assets/player-icons/vermilion-bird.png" },
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
  simulationForm: document.querySelector("#simulation-form"),
  createName: document.querySelector("#create-name"),
  createContenders: document.querySelector("#create-contenders"),
  joinName: document.querySelector("#join-name"),
  joinCode: document.querySelector("#join-code"),
  simulationExport: document.querySelector("#simulation-export"),
  simulationHint: document.querySelector("#simulation-hint"),
  simulationButton: document.querySelector("#simulation-button"),
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
  simulationExports: [],
  simulationExportsLoaded: false,
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
};

function isGmMode() {
  return APP_MODE === "gm";
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
  dom.statusBanner.style.borderColor =
    tone === "error" ? "rgba(255, 101, 101, 0.4)" : "rgba(255, 204, 92, 0.25)";
  dom.statusBanner.style.background =
    tone === "error" ? "rgba(255, 89, 89, 0.12)" : "rgba(255, 174, 67, 0.12)";
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
      ? `${winners[0].name} Wins`
      : winners.length > 1
        ? "Match Ends In A Tie"
        : "Maze Conquered";
  dom.announcementCopy.textContent =
    finishLog?.message ||
    (winners.length === 1
      ? `${winners[0].name} has claimed the maze.`
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
    return " Reach the center core to be declared the winner.";
  }
  if (viewer?.id === claimant.id) {
    return " You are the last of the Marked. Move to the center core to claim the maze.";
  }
  return ` ${claimant.name} is the last of the Marked and must reach the center core to win.`;
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

function getSelectedSimulationExport() {
  const fileName = dom.simulationExport.value;
  return state.simulationExports.find((entry) => entry.fileName === fileName) || null;
}

function renderSimulationExports() {
  if (!dom.simulationExport || !dom.simulationHint || !dom.simulationButton) {
    return;
  }
  if (!state.simulationExportsLoaded) {
    dom.simulationExport.innerHTML = '<option value="">Loading saved layouts...</option>';
    dom.simulationExport.disabled = true;
    dom.simulationButton.disabled = true;
    dom.simulationHint.textContent = "Checking the exports folder for saved layouts.";
    return;
  }
  if (!state.simulationExports.length) {
    dom.simulationExport.innerHTML = '<option value="">No exported layouts yet</option>';
    dom.simulationExport.disabled = true;
    dom.simulationButton.disabled = true;
    dom.simulationHint.textContent = "Export a layout from the lobby editor first, then come back here to run a 4-bot simulation.";
    return;
  }

  const currentValue = dom.simulationExport.value;
  const nextValue = state.simulationExports.some((entry) => entry.fileName === currentValue)
    ? currentValue
    : state.simulationExports[0].fileName;
  dom.simulationExport.innerHTML = state.simulationExports
    .map((entry) => `<option value="${escapeHtml(entry.fileName)}">${escapeHtml(entry.name)}</option>`)
    .join("");
  dom.simulationExport.value = nextValue;
  dom.simulationExport.disabled = false;
  dom.simulationButton.disabled = false;

  const selected = getSelectedSimulationExport();
  if (!selected) {
    dom.simulationHint.textContent = "Pick a saved layout to launch a spectator sim.";
    return;
  }
  const details = [
    selected.fileName,
    selected.totalLayers ? `${selected.totalLayers} layers` : null,
    selected.gridSize ? `${selected.gridSize}x${selected.gridSize} grid` : null,
    selected.author ? `by ${selected.author}` : null,
  ].filter(Boolean);
  const note = selected.notes ? ` ${selected.notes}` : "";
  dom.simulationHint.textContent = `${details.join(" | ")}.${note} The sim will fill all four gates with bots and open in spectator mode.`;
}

async function loadSimulationExports() {
  try {
    const response = await api("/api/dev/simulations/exports");
    state.simulationExports = Array.isArray(response.exports) ? response.exports : [];
  } catch (error) {
    state.simulationExports = [];
    showStatus(error.message, "error");
  } finally {
    state.simulationExportsLoaded = true;
    renderSimulationExports();
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
  dom.portal.classList.add("hidden");
  dom.app.classList.remove("hidden");
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
  dom.app.classList.add("hidden");
  dom.portal.classList.remove("hidden");
  renderSimulationExports();
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
    return player?.seatIndex == null ? "Banner unclaimed" : `${capitalize(player.direction)} banner`;
  }
  return player.beastName;
}

function getPlayerLocationText(room, player) {
  const viewer = getViewerForRoom(room);
  if (!player.alive) {
    return `Destroyed by ${player.eliminatedReason || "combat"}`;
  }
  if (room?.state === "finished" && room.winners?.includes(player.id)) {
    return "Reached the core";
  }
  if (isLimitedPlayerView(room) && player.id !== room.viewerId && !player.visibleToViewer) {
    return viewer?.alive === false ? "Position concealed" : "Unseen";
  }
  if (player.positionState === "outside" && player.direction) {
    return `Waiting at the ${capitalize(player.direction)} banner`;
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
    return `${winners[0].name} claimed the maze.`;
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
  dom.startButton.textContent = "Start Banner Claim";

  if (room.state === "lobby") {
    const humans = room.players.filter((player) => !player.isBot).length;
    setPhaseStatus(`Lobby | ${humans} Marked`, "lobby");
    dom.purgeTimer.textContent = "Lobby Open";
    dom.turnStatus.textContent = "Not started";
    dom.youStatus.textContent = viewer ? "Ready" : "Spectating";
    setBoardCaption(isGmMode()
      ? "Build or inspect the maze in lobby, then start the room when the Marked are ready."
      : "Host a room or join one by code. Once the match starts, the room shifts into banner claim and turn order.");
    return;
  }

  if (room.state === "draft") {
    setPhaseStatus(viewer?.id === room.draft?.currentPlayerId ? "Claim banner" : "Banner claim", "draft");
    dom.purgeTimer.textContent = `Banner Claim ${formatTime(getDeadlineCountdown(room.draft?.deadlineAt) || 0)}`;
    dom.turnStatus.textContent = draftPlayer
      ? viewer?.id === draftPlayer.id
        ? "Claim your banner"
        : `${draftPlayer.name} choosing`
      : "Banner claim";
    if (viewer?.seatIndex != null) {
      dom.youStatus.textContent = `${getPlayerBeastText(viewer)} | ${capitalize(viewer.direction)} banner`;
    } else if (viewer?.id === room.draft?.currentPlayerId) {
      dom.youStatus.textContent = "Claim your banner";
    } else {
      dom.youStatus.textContent = viewer ? "Waiting for banner claim" : "Spectating";
    }
    setBoardCaption(viewer?.id === room.draft?.currentPlayerId
      ? "Choose one open banner. Your beast, icon, and opening side are locked in as soon as you claim it."
      : "Watch the banner claim order. Claimed banners lock each Marked into their beast and entry side before round one.");
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
      ? "Claim the core"
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
      setBoardCaption(`You are the last of the Marked. Move to the center core to claim the maze.${dangerCopy}`, true);
      return;
    }
    setBoardCaption(
      viewer.positionState === "outside"
        ? `Opening move: step into the maze through your own banner before the timer expires.${dangerCopy}`
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
          ? "Sole survivor | Reach core"
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
    state.editorMessage || `Lobby-only editor: click the wall bars between pillars to switch them up or down. ${mirrorLabel}`;
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
    setEditorMessage(`Layout exported to ${response.exportPath}. Tell me to use that file and I can finalize this maze from the saved design.`);
    await loadSimulationExports();
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

async function handleSimulation(event) {
  event.preventDefault();
  const selected = getSelectedSimulationExport();
  if (!selected) {
    showStatus("Pick a saved layout first.", "error");
    return;
  }
  dom.simulationButton.disabled = true;
  try {
    const response = await api("/api/dev/simulations/export", {
      method: "POST",
      body: {
        fileName: selected.fileName,
      },
    });
    await connectSession(response.spectatorSession);
  } catch (error) {
    showStatus(error.message, "error");
    renderSimulationExports();
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

async function restoreSession() {
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

bind(dom.createForm, "submit", handleCreate);
bind(dom.joinForm, "submit", handleJoin);
bind(dom.simulationForm, "submit", handleSimulation);
bind(dom.simulationExport, "change", renderSimulationExports);
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
window.addEventListener("keydown", handleKeyDown);

if (isGmMode()) {
  renderSimulationExports();
  loadSimulationExports();
}
restoreSession();
