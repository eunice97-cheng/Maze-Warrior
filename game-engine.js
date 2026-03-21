"use strict";

const crypto = require("crypto");
const {
  DEFAULT_TOTAL_LAYERS,
  createEditorRuleSnapshot,
  createEditorSettings,
  getLayerNodeCounts,
} = require("./maze-editor");
const {
  buildMazeModel,
  editWallSegment,
  exportLayoutDefinition,
  getSegmentKeyForNodeDirection,
} = require("./maze-core");
const { MAZE_LAYOUT } = require("./maze-layout");

const STATIC_GAME_RULES = Object.freeze({
  finalSafeLayers: 3,
  entryCount: 4,
  maxPlayers: 4,
  turnDurationMs: 10_000,
  draftDurationMs: 10_000,
  visionRange: 3,
});

const GAME_RULES = Object.freeze({
  ...STATIC_GAME_RULES,
  ...createEditorRuleSnapshot(DEFAULT_TOTAL_LAYERS),
});

const GATE_ASSIGNMENTS = Object.freeze([
  { seatIndex: 0, direction: "north", inwardDirection: "down", beastId: "xuanwu", beastName: "Black Tortoise", beastLabel: "玄武", beastShort: "X", color: "#7188a8" },
  { seatIndex: 1, direction: "east", inwardDirection: "left", beastId: "qinglong", beastName: "Azure Dragon", beastLabel: "青龍", beastShort: "Q", color: "#4dc7ff" },
  { seatIndex: 2, direction: "south", inwardDirection: "up", beastId: "zhuque", beastName: "Red Phoenix", beastLabel: "朱雀", beastShort: "Z", color: "#ff6157" },
  { seatIndex: 3, direction: "west", inwardDirection: "right", beastId: "baihu", beastName: "White Tiger", beastLabel: "白虎", beastShort: "B", color: "#efe6d2" },
]);

const BOT_NAMES = ["Vanta", "Rook", "Nova", "Cinder", "Apex", "Glint", "Flare", "Cipher", "Mica", "Quill"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashToSeed(input) {
  const digest = crypto.createHash("sha256").update(String(input)).digest();
  return digest.readUInt32LE(0) || 1;
}

function createRng(seedInput) {
  let state = hashToSeed(seedInput);
  return function nextRandom() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function describeNode(node) {
  if (!node) {
    return "an unknown cell";
  }
  if (node.layer === 1) {
    return `the core (${node.row + 1},${node.col + 1})`;
  }
  return `row ${node.row + 1}, col ${node.col + 1} on layer ${node.layer}`;
}

function getMazeTotalLayers(maze) {
  return Number.isInteger(maze?.totalLayers) ? maze.totalLayers : DEFAULT_TOTAL_LAYERS;
}

function getRoomRules(room) {
  const totalLayers = getMazeTotalLayers(room?.maze);
  return {
    ...STATIC_GAME_RULES,
    ...createEditorRuleSnapshot(totalLayers, room?.maze?.nodes?.[0]?.diamondValue ?? 1),
  };
}

function getGateAssignment(seatIndex) {
  return GATE_ASSIGNMENTS.find((entry) => entry.seatIndex === seatIndex) || null;
}

function editMazeWall(maze, nodeId, direction, state, mirrorMode = "off") {
  const segmentKey = getSegmentKeyForNodeDirection(maze, nodeId, direction);
  if (!segmentKey) {
    return { ok: false, reason: "invalid-wall" };
  }
  const result = editWallSegment(maze, segmentKey, state, mirrorMode);
  return {
    ok: result.ok,
    applied: (result.applied || []).map((entry) => ({
      segmentKey: entry.segmentKey,
      state: entry.state,
    })),
  };
}

function editMazeSegment(maze, segmentKey, state, mirrorMode = "off") {
  return editWallSegment(maze, segmentKey, state, mirrorMode);
}

function exportMazeLayout(maze, metadata = {}) {
  return exportLayoutDefinition(maze, metadata);
}

function buildMaze(seed = "maze-warrior", layoutDefinition = MAZE_LAYOUT) {
  return buildMazeModel({
    ...layoutDefinition,
    seed,
    layout:
      layoutDefinition?.layout === "editor-square-layout"
        ? "editor-square-layout"
        : "manual-square-layout",
  });
}

function createDiamondState(maze) {
  return maze.nodes.map((node) => node.diamondValue);
}

function mazeNeedsUpgrade(maze, editorSettings = createEditorSettings()) {
  const expectedNodeCount = getLayerNodeCounts(editorSettings.totalLayers).reduce((sum, count) => sum + count, 0);
  return !maze ||
    (maze.layout !== "manual-square-layout" && maze.layout !== "editor-square-layout") ||
    maze.totalLayers !== editorSettings.totalLayers ||
    maze.gridSize !== editorSettings.gridSize ||
    !Array.isArray(maze.nodes) ||
    maze.nodes.length !== expectedNodeCount ||
    !Array.isArray(maze.segments) ||
    maze.segments.length !== GAME_RULES.entryCount ||
    !Array.isArray(maze.wallMap) ||
    maze.wallMap.length !== maze.nodes.length ||
    !Array.isArray(maze.wallTargets) ||
    maze.wallTargets.length !== maze.nodes.length;
}

function ensurePlayerRuntimeState(room, player) {
  player.connected = Boolean(player.connected);
  player.score = Number(player.score) || 0;
  player.diamondsCollected = Number(player.diamondsCollected) || 0;
  player.kills = Number(player.kills) || 0;
  player.positionState = player.positionState || "unassigned";
  player.beastId = player.beastId || null;
  player.beastName = player.beastName || null;
  player.beastLabel = player.beastLabel || null;
  player.beastShort = player.beastShort || null;
  player.direction = player.direction || null;
  player.seatIndex = Number.isInteger(player.seatIndex) ? player.seatIndex : null;
  player.entryNodeId = Number.isInteger(player.entryNodeId) ? player.entryNodeId : null;
  player.currentNodeId = Number.isInteger(player.currentNodeId) ? player.currentNodeId : null;
  player.discoveredNodeIds =
    player.discoveredNodeIds instanceof Set
      ? player.discoveredNodeIds
      : new Set(Array.isArray(player.discoveredNodeIds) ? player.discoveredNodeIds : []);
  player.knownDiamondValues =
    Array.isArray(player.knownDiamondValues) && player.knownDiamondValues.length === room.maze.nodes.length
      ? player.knownDiamondValues.slice()
      : Array(room.maze.nodes.length).fill(null);
  player.knownWallStates =
    player.knownWallStates && typeof player.knownWallStates === "object" ? { ...player.knownWallStates } : {};
  player.botIntent = player.botIntent || null;
}

function normalizeRoom(room) {
  room.logs = room.logs || [];
  room.players = room.players || [];
  room.editorSettings = createEditorSettings(room.editorSettings);
  room.editorMetadata = room.editorMetadata || {
    name: `${room.code || "Maze"} Draft`,
    author: "",
    notes: "",
    version: 1,
    createdAt: null,
    updatedAt: null,
  };
  room.editorHistory = room.editorHistory || {
    past: [],
    future: [],
  };
  const rebuiltMaze = mazeNeedsUpgrade(room.maze, room.editorSettings);
  room.maze = rebuiltMaze
    ? buildMaze(room.seed || room.code || "maze-warrior", {
        totalLayers: room.editorSettings.totalLayers,
        defaultDiamondValue: room.editorSettings.defaultDiamondValue,
        metadata: room.editorMetadata,
        commands: [],
      })
    : room.maze;
  room.maze.metadata = room.editorMetadata;
  room.diamonds =
    rebuiltMaze || !Array.isArray(room.diamonds) || room.diamonds.length !== room.maze.nodes.length
      ? createDiamondState(room.maze)
      : room.diamonds;
  room.safeOuterLayer = room.safeOuterLayer || room.maze.totalLayers || room.editorSettings.totalLayers;
  room.botCounter = room.botCounter || 0;
  room.version = room.version || 0;
  room.rng = room.rng || createRng(room.seed || room.code || "maze-warrior");
  room.turnState = {
    roundNumber: room.turnState?.roundNumber || 0,
    order: Array.isArray(room.turnState?.order) ? room.turnState.order.slice() : [],
    index: Number.isInteger(room.turnState?.index) ? room.turnState.index : 0,
    currentPlayerId: room.turnState?.currentPlayerId || null,
    startedAt: room.turnState?.startedAt || null,
    deadlineAt: room.turnState?.deadlineAt || null,
  };
  room.purgeState = {
    roundsUntilNextPurge:
      room.purgeState?.roundsUntilNextPurge == null ? null : Number(room.purgeState.roundsUntilNextPurge),
    nextLayer: Number.isInteger(room.purgeState?.nextLayer) ? room.purgeState.nextLayer : null,
  };
  room.gateDraft = {
    order: Array.isArray(room.gateDraft?.order) ? room.gateDraft.order.slice() : [],
    index: Number.isInteger(room.gateDraft?.index) ? room.gateDraft.index : 0,
    currentPlayerId: room.gateDraft?.currentPlayerId || null,
    deadlineAt: room.gateDraft?.deadlineAt || null,
    availableSeats: Array.isArray(room.gateDraft?.availableSeats)
      ? room.gateDraft.availableSeats.slice()
      : GATE_ASSIGNMENTS.map((entry) => entry.seatIndex),
    assignmentSequence: Array.isArray(room.gateDraft?.assignmentSequence)
      ? room.gateDraft.assignmentSequence.slice()
      : [],
  };
  room.winnerIds = Array.isArray(room.winnerIds) ? room.winnerIds : [];
  room.awaitingCoreClaimPlayerId = room.awaitingCoreClaimPlayerId || null;
  room.players.forEach((player) => ensurePlayerRuntimeState(room, player));
}

function markRoomChanged(room) {
  room.version += 1;
  room.updatedAt = Date.now();
}

function addLog(room, message, type = "system", now = Date.now(), detail = "") {
  room.logs.unshift({
    id: `${now}-${Math.floor(room.rng() * 1_000_000)}`,
    type,
    message,
    detail,
    matchTimeMs: room.startedAt == null ? 0 : Math.max(0, now - room.startedAt),
    at: now,
  });
  room.logs = room.logs.slice(0, 48);
  markRoomChanged(room);
}

function createBotPlayer(room, now = Date.now()) {
  room.botCounter += 1;
  return {
    id: `bot-${room.botCounter}-${Math.floor(room.rng() * 1_000_000)}`,
    token: null,
    name: BOT_NAMES[(room.botCounter - 1) % BOT_NAMES.length],
    isBot: true,
    isHost: false,
    connected: true,
    joinedAt: now,
    color: null,
    score: 0,
    diamondsCollected: 0,
    kills: 0,
    alive: true,
    positionState: "unassigned",
    currentNodeId: null,
    entryNodeId: null,
    seatIndex: null,
    beastId: null,
    beastName: null,
    beastLabel: null,
    beastShort: null,
    direction: null,
    discoveredNodeIds: new Set(),
    knownDiamondValues: [],
    knownWallStates: {},
    botIntent: null,
  };
}

function shuffleValues(values, rng) {
  const next = values.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const temp = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = temp;
  }
  return next;
}

function getPlayerById(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function getCurrentTurnPlayer(room) {
  return getPlayerById(room, room.turnState.currentPlayerId);
}

function getAlivePlayers(room) {
  return room.players.filter((player) => player.alive);
}

function getSoleSurvivor(room) {
  const alivePlayers = getAlivePlayers(room);
  return alivePlayers.length === 1 ? alivePlayers[0] : null;
}

function getVisionOriginNodeId(player) {
  if (!player || !player.alive) {
    return null;
  }
  if (player.positionState === "inside") {
    return player.currentNodeId;
  }
  if (player.positionState === "outside") {
    return player.entryNodeId;
  }
  return null;
}

function computeVisibleNodeIds(room, player) {
  const originNodeId = getVisionOriginNodeId(player);
  if (originNodeId == null) {
    return new Set();
  }
  const visibleNodeIds = new Set([originNodeId]);
  const queue = [{ nodeId: originNodeId, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= GAME_RULES.visionRange) {
      continue;
    }
    for (const neighborId of room.maze.adjacency[current.nodeId]) {
      if (visibleNodeIds.has(neighborId)) {
        continue;
      }
      visibleNodeIds.add(neighborId);
      queue.push({
        nodeId: neighborId,
        depth: current.depth + 1,
      });
    }
  }
  return visibleNodeIds;
}

function updatePlayerKnowledge(room, player) {
  ensurePlayerRuntimeState(room, player);
  const visibleNodeIds = computeVisibleNodeIds(room, player);
  visibleNodeIds.forEach((nodeId) => {
    player.discoveredNodeIds.add(nodeId);
    player.knownDiamondValues[nodeId] = room.diamonds[nodeId] > 0 ? room.diamonds[nodeId] : 0;
    const wallSegmentKeys = room.maze.nodes[nodeId]?.wallSegmentKeys || {};
    Object.values(wallSegmentKeys).forEach((segmentKey) => {
      if (!segmentKey) {
        return;
      }
      const segment = room.maze.wallSegmentMap?.[segmentKey];
      if (segment) {
        player.knownWallStates[segmentKey] = segment.state;
      }
    });
  });
}

function resetPlayerForMatch(room, player) {
  player.score = 0;
  player.diamondsCollected = 0;
  player.kills = 0;
  player.alive = true;
  player.positionState = "unassigned";
  player.currentNodeId = null;
  player.entryNodeId = null;
  player.seatIndex = null;
  player.color = null;
  player.beastId = null;
  player.beastName = null;
  player.beastLabel = null;
  player.beastShort = null;
  player.direction = null;
  player.eliminatedAt = null;
  player.eliminatedReason = null;
  player.discoveredNodeIds = new Set();
  player.knownDiamondValues = Array(room.maze.nodes.length).fill(null);
  player.knownWallStates = {};
  player.botIntent = null;
}

function assignGateToPlayer(room, player, seatIndex) {
  const gate = getGateAssignment(seatIndex);
  if (!gate || !room.gateDraft.availableSeats.includes(seatIndex)) {
    return false;
  }
  player.seatIndex = seatIndex;
  player.entryNodeId = room.maze.entries[seatIndex];
  player.currentNodeId = null;
  player.positionState = "outside";
  player.color = gate.color;
  player.beastId = gate.beastId;
  player.beastName = gate.beastName;
  player.beastLabel = gate.beastLabel;
  player.beastShort = gate.beastShort;
  player.direction = gate.direction;
  room.gateDraft.availableSeats = room.gateDraft.availableSeats.filter((value) => value !== seatIndex);
  updatePlayerKnowledge(room, player);
  markRoomChanged(room);
  return true;
}

function determineWinners(room, aliveOnly) {
  const candidates = aliveOnly ? room.players.filter((player) => player.alive) : room.players.slice();
  if (!candidates.length) {
    return [];
  }
  const bestScore = Math.max(...candidates.map((player) => player.score));
  return candidates.filter((player) => player.score === bestScore).map((player) => player.id);
}

function finishMatch(room, now, reason, aliveOnly) {
  room.state = "finished";
  room.finishedAt = now;
  room.awaitingCoreClaimPlayerId = null;
  room.turnState.currentPlayerId = null;
  room.turnState.deadlineAt = null;
  room.gateDraft.currentPlayerId = null;
  room.gateDraft.deadlineAt = null;
  room.nextPurgeAt = null;
  room.winnerIds = determineWinners(room, aliveOnly);
  const winners = room.players.filter((player) => room.winnerIds.includes(player.id));
  const winnerText = winners.length
    ? winners.map((player) => `${player.name}`).join(", ")
    : "No one";
  const messages = {
    survivor: `${winnerText} won as the last of the Marked standing.`,
    coreClaim: `${winnerText} reached the core and claimed the maze.`,
    extinction: `${winnerText} finished with the best score after total destruction.`,
  };
  addLog(room, messages[reason] || messages.survivor, "finish", now);
}

function isPlayerOnCore(room, player) {
  return Boolean(
    player &&
      player.alive &&
      player.positionState === "inside" &&
      player.currentNodeId != null &&
      player.currentNodeId === getCoreNodeId(room)
  );
}

function evaluateMatchState(room, now) {
  const soleSurvivor = getSoleSurvivor(room);
  if (!soleSurvivor) {
    if (!getAlivePlayers(room).length) {
      finishMatch(room, now, "extinction", false);
      return true;
    }
    if (room.awaitingCoreClaimPlayerId != null) {
      room.awaitingCoreClaimPlayerId = null;
      markRoomChanged(room);
    }
    return false;
  }

  if (isPlayerOnCore(room, soleSurvivor)) {
    finishMatch(room, now, "coreClaim", true);
    return true;
  }

  if (room.awaitingCoreClaimPlayerId !== soleSurvivor.id) {
    room.awaitingCoreClaimPlayerId = soleSurvivor.id;
    addLog(room, `${soleSurvivor.name} is the last of the Marked. Reach the core to claim victory.`, "system", now);
  }
  return false;
}

function fillRoomWithBots(room, now) {
  const rules = getRoomRules(room);
  const humans = room.players.filter((player) => !player.isBot).slice(0, rules.maxPlayers);
  const totalPlayers = clamp(
    Math.max(room.contenderCount || humans.length || 1, humans.length || 1),
    1,
    rules.maxPlayers
  );
  room.players = humans;
  while (room.players.length < totalPlayers) {
    room.players.push(createBotPlayer(room, now));
  }
}

function assignBotGates(room) {
  const availableSeats = shuffleValues(room.gateDraft.availableSeats, room.rng);
  const bots = room.players.filter((player) => player.isBot && player.seatIndex == null);
  bots.forEach((bot, index) => {
    const seatIndex = availableSeats[index];
    if (seatIndex == null) {
      return;
    }
    assignGateToPlayer(room, bot, seatIndex);
    room.gateDraft.assignmentSequence.push(bot.id);
  });
}

function beginRunning(room, now) {
  room.state = "running";
  room.awaitingCoreClaimPlayerId = null;
  room.turnState.roundNumber = 1;
  room.turnState.order = room.gateDraft.assignmentSequence.slice().reverse();
  room.turnState.index = 0;
  room.turnState.currentPlayerId = room.turnState.order[0] || null;
  room.turnState.startedAt = now;
  room.turnState.deadlineAt = room.turnState.currentPlayerId ? now + GAME_RULES.turnDurationMs : null;
  room.purgeState = {
    roundsUntilNextPurge:
      room.safeOuterLayer > GAME_RULES.finalSafeLayers ? room.safeOuterLayer + 3 : null,
    nextLayer: room.safeOuterLayer > GAME_RULES.finalSafeLayers ? room.safeOuterLayer : null,
  };
  addLog(room, "The banner claim is complete. The first round has begun.", "system", now);
}

function startMatch(room, now = Date.now()) {
  normalizeRoom(room);
  fillRoomWithBots(room, now);
  room.state = "draft";
  room.startedAt = now;
  room.finishedAt = null;
  room.winnerIds = [];
  room.awaitingCoreClaimPlayerId = null;
  room.logs = [];
  room.safeOuterLayer = room.maze.totalLayers;
  room.nextPurgeAt = null;
  room.diamonds = createDiamondState(room.maze);
  room.players.forEach((player) => resetPlayerForMatch(room, player));
  room.gateDraft = {
    order: shuffleValues(
      room.players.filter((player) => !player.isBot).map((player) => player.id),
      room.rng
    ),
    index: 0,
    currentPlayerId: null,
    deadlineAt: null,
    availableSeats: GATE_ASSIGNMENTS.map((entry) => entry.seatIndex),
    assignmentSequence: [],
  };
  room.turnState = {
    roundNumber: 0,
    order: [],
    index: 0,
    currentPlayerId: null,
    startedAt: null,
    deadlineAt: null,
  };
  room.purgeState = {
    roundsUntilNextPurge: null,
    nextLayer: null,
  };

  if (!room.gateDraft.order.length) {
    assignBotGates(room);
    beginRunning(room, now);
    return room;
  }

  room.gateDraft.currentPlayerId = room.gateDraft.order[0];
  room.gateDraft.deadlineAt = now + GAME_RULES.draftDurationMs;
  addLog(room, "The banner claim has started. Claim a banner when your turn arrives.", "system", now);
  return room;
}

function pickGateForPlayer(room, player, seatIndex, now = Date.now()) {
  normalizeRoom(room);
  if (room.state !== "draft") {
    return { ok: false, reason: "not-drafting" };
  }
  if (!player || player.id !== room.gateDraft.currentPlayerId || player.isBot) {
    return { ok: false, reason: "not-your-pick" };
  }
  if (!assignGateToPlayer(room, player, seatIndex)) {
    return { ok: false, reason: "seat-taken" };
  }
  room.gateDraft.assignmentSequence.push(player.id);
  addLog(room, `${player.name} claimed the ${player.beastName} banner.`, "draft", now);
  room.gateDraft.index += 1;
  if (room.gateDraft.index >= room.gateDraft.order.length) {
    room.gateDraft.currentPlayerId = null;
    room.gateDraft.deadlineAt = null;
    assignBotGates(room);
    beginRunning(room, now);
    return { ok: true, started: true };
  }
  room.gateDraft.currentPlayerId = room.gateDraft.order[room.gateDraft.index];
  room.gateDraft.deadlineAt = now + GAME_RULES.draftDurationMs;
  markRoomChanged(room);
  return { ok: true };
}

function chooseDirectionalNeighbor(room, player, direction) {
  if (!player || !player.alive) {
    return null;
  }
  if (player.positionState === "outside") {
    const gate = getGateAssignment(player.seatIndex);
    if (!gate || gate.inwardDirection !== direction) {
      return null;
    }
    return player.entryNodeId;
  }
  const directionMap = {
    up: "north",
    right: "east",
    down: "south",
    left: "west",
  };
  const wallDirection = directionMap[direction];
  if (!wallDirection || player.currentNodeId == null) {
    return null;
  }
  const targetNodeId = room.maze.wallTargets?.[player.currentNodeId]?.[wallDirection] ?? null;
  if (targetNodeId == null) {
    return null;
  }
  return room.maze.adjacency[player.currentNodeId].includes(targetNodeId) ? targetNodeId : null;
}

function getPlayerControls(room, player) {
  const currentTurn = getCurrentTurnPlayer(room);
  if (!player || !player.alive || room.state !== "running" || currentTurn?.id !== player.id) {
    return null;
  }
  if (player.positionState === "outside") {
    const directions = {
      up: null,
      right: null,
      down: null,
      left: null,
    };
    const gate = getGateAssignment(player.seatIndex);
    if (gate) {
      directions[gate.inwardDirection] = player.entryNodeId;
    }
    return {
      neighborNodeIds: player.entryNodeId == null ? [] : [player.entryNodeId],
      directions,
      canStop: false,
      mustEnter: true,
    };
  }
  return {
    neighborNodeIds: room.maze.adjacency[player.currentNodeId].slice(),
    directions: {
      up: chooseDirectionalNeighbor(room, player, "up"),
      right: chooseDirectionalNeighbor(room, player, "right"),
      down: chooseDirectionalNeighbor(room, player, "down"),
      left: chooseDirectionalNeighbor(room, player, "left"),
    },
    canStop: true,
    mustEnter: false,
  };
}

function findShortestPath(maze, fromNodeId, toNodeId) {
  if (fromNodeId === toNodeId) {
    return [fromNodeId];
  }
  const queue = [fromNodeId];
  const previous = new Map([[fromNodeId, null]]);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const neighbor of maze.adjacency[current]) {
      if (previous.has(neighbor)) {
        continue;
      }
      previous.set(neighbor, current);
      if (neighbor === toNodeId) {
        const path = [toNodeId];
        let step = current;
        while (step != null) {
          path.push(step);
          step = previous.get(step);
        }
        return path.reverse();
      }
      queue.push(neighbor);
    }
  }
  return null;
}

function eliminatePlayer(room, player, reason, now) {
  if (!player || !player.alive) {
    return;
  }
  player.alive = false;
  player.eliminatedAt = now;
  player.eliminatedReason = reason;
  player.positionState = "eliminated";
  player.currentNodeId = null;
  markRoomChanged(room);
}

function collectDiamond(room, player, now) {
  if (!player || !player.alive || player.positionState !== "inside" || player.currentNodeId == null) {
    return 0;
  }
  const diamondValue = room.diamonds[player.currentNodeId];
  if (!diamondValue) {
    return 0;
  }
  room.diamonds[player.currentNodeId] = 0;
  player.score += diamondValue;
  player.diamondsCollected += diamondValue;
  player.knownDiamondValues[player.currentNodeId] = 0;
  addLog(room, `${player.name} collected a diamond.`, "diamond", now);
  return diamondValue;
}

function resolveCombatAtNode(room, nodeId, now) {
  const contestants = room.players.filter(
    (player) => player.alive && player.positionState === "inside" && player.currentNodeId === nodeId
  );
  if (contestants.length < 2) {
    return false;
  }

  const highestScore = Math.max(...contestants.map((player) => player.score));
  const leaders = contestants.filter((player) => player.score === highestScore);

  if (leaders.length > 1) {
    contestants.forEach((player) => {
      eliminatePlayer(room, player, "combat", now);
      player.score = 0;
    });
    addLog(room, `${leaders.map((player) => player.name).join(" and ")} clashed at equal strength. Both were destroyed.`, "combat", now);
    return true;
  }

  const winner = leaders[0];
  const losers = contestants.filter((player) => player.id !== winner.id);
  const stolenScore = losers.reduce((sum, player) => sum + player.score, 0);
  losers.forEach((player) => {
    eliminatePlayer(room, player, "combat", now);
    player.score = 0;
  });
  winner.score += stolenScore;
  winner.kills += losers.length;
  markRoomChanged(room);
  addLog(room, `${winner.name} won a clash and remained on the node.`, "combat", now);
  return true;
}

function resolvePurge(room, now) {
  if (room.safeOuterLayer <= GAME_RULES.finalSafeLayers) {
    room.purgeState.roundsUntilNextPurge = null;
    room.purgeState.nextLayer = null;
    return;
  }

  const purgedLayer = room.safeOuterLayer;
  const casualties = [];
  room.players.forEach((player) => {
    if (!player.alive) {
      return;
    }
    const occupiedNodeId = player.positionState === "inside" ? player.currentNodeId : player.entryNodeId;
    const occupiedNode = room.maze.nodes[occupiedNodeId];
    if (!occupiedNode || occupiedNode.layer !== purgedLayer) {
      return;
    }
    casualties.push(player.name);
    eliminatePlayer(room, player, "purge", now);
  });

  room.safeOuterLayer = Math.max(GAME_RULES.finalSafeLayers, purgedLayer - 1);
  if (room.safeOuterLayer > GAME_RULES.finalSafeLayers) {
    room.purgeState.roundsUntilNextPurge = room.safeOuterLayer + 3;
    room.purgeState.nextLayer = room.safeOuterLayer;
  } else {
    room.purgeState.roundsUntilNextPurge = null;
    room.purgeState.nextLayer = null;
  }

  const casualtyText = casualties.length ? ` ${casualties.join(", ")} were caught on it.` : "";
  addLog(room, `Layer ${purgedLayer} was purged.${casualtyText}`, "purge", now);
}

function startNextRound(room, now) {
  if (room.purgeState.roundsUntilNextPurge != null) {
    room.purgeState.roundsUntilNextPurge -= 1;
    if (room.purgeState.roundsUntilNextPurge <= 0) {
      resolvePurge(room, now);
    } else {
      markRoomChanged(room);
    }
  }

  const survivors = room.turnState.order.filter((playerId) => getPlayerById(room, playerId)?.alive);
  if (!survivors.length) {
    finishMatch(room, now, "extinction", false);
    return;
  }
  if (evaluateMatchState(room, now)) {
    return;
  }
  const rotated = survivors.length > 1 ? survivors.slice(1).concat(survivors[0]) : survivors;
  room.turnState.roundNumber += 1;
  room.turnState.order = rotated;
  room.turnState.index = 0;
  room.turnState.currentPlayerId = rotated[0];
  room.turnState.startedAt = now;
  room.turnState.deadlineAt = now + GAME_RULES.turnDurationMs;
  addLog(room, `Round ${room.turnState.roundNumber} has begun.`, "turn", now);
}

function advanceTurn(room, now) {
  if (room.state !== "running") {
    return;
  }
  if (evaluateMatchState(room, now)) {
    return;
  }

  let nextIndex = room.turnState.index + 1;
  while (nextIndex < room.turnState.order.length) {
    const nextPlayer = getPlayerById(room, room.turnState.order[nextIndex]);
    if (nextPlayer && nextPlayer.alive) {
      room.turnState.index = nextIndex;
      room.turnState.currentPlayerId = nextPlayer.id;
      room.turnState.startedAt = now;
      room.turnState.deadlineAt = now + GAME_RULES.turnDurationMs;
      markRoomChanged(room);
      return;
    }
    nextIndex += 1;
  }

  startNextRound(room, now);
}

function resolveTurnMove(room, player, targetNodeId, now, timeout = false) {
  if (!player || !player.alive || room.state !== "running" || room.turnState.currentPlayerId !== player.id) {
    return { ok: false, reason: "not-your-turn" };
  }

  if (player.positionState === "outside") {
    if (targetNodeId == null || targetNodeId !== player.entryNodeId) {
      eliminatePlayer(room, player, "missed-entry", now);
      addLog(room, `${player.name} failed to enter the maze on the opening move and was destroyed outside.`, "turn", now);
      advanceTurn(room, now);
      return { ok: true, eliminated: true };
    }

    player.positionState = "inside";
    player.currentNodeId = player.entryNodeId;
    updatePlayerKnowledge(room, player);
    collectDiamond(room, player, now);
    addLog(room, `${player.name} entered the maze beneath the ${player.direction} banner.`, "turn", now);
    resolveCombatAtNode(room, player.currentNodeId, now);
    if (room.state === "running") {
      advanceTurn(room, now);
    }
    return { ok: true, entered: true };
  }

  if (targetNodeId == null || targetNodeId === player.currentNodeId) {
    if (timeout) {
      addLog(room, `${player.name} ran out of time and held position.`, "turn", now);
    }
    advanceTurn(room, now);
    return { ok: true, held: true };
  }

  if (!room.maze.adjacency[player.currentNodeId].includes(targetNodeId)) {
    return { ok: false, reason: "blocked" };
  }

  player.currentNodeId = targetNodeId;
  updatePlayerKnowledge(room, player);
  resolveCombatAtNode(room, targetNodeId, now);
  if (player.alive && player.currentNodeId === targetNodeId) {
    collectDiamond(room, player, now);
    updatePlayerKnowledge(room, player);
  }
  if (room.state === "running") {
    advanceTurn(room, now);
  }
  return { ok: true, moved: true };
}

function queuePathForPlayer(room, player, targetNodeId, now = Date.now()) {
  normalizeRoom(room);
  return resolveTurnMove(room, player, targetNodeId, now, false);
}

function queueDirectionalMove(room, player, direction, now = Date.now()) {
  normalizeRoom(room);
  const targetNodeId = chooseDirectionalNeighbor(room, player, direction);
  if (targetNodeId == null) {
    return { ok: false, reason: "blocked" };
  }
  return resolveTurnMove(room, player, targetNodeId, now, false);
}

function stopPlayerPath(room, player, now = Date.now()) {
  normalizeRoom(room);
  if (!player || !player.alive || room.state !== "running" || room.turnState.currentPlayerId !== player.id) {
    return { ok: false, reason: "not-your-turn" };
  }
  if (player.positionState === "outside") {
    return { ok: false, reason: "must-enter" };
  }
  return resolveTurnMove(room, player, null, now, false);
}

function getCoreNodeId(room) {
  const center = Math.floor(room.maze.gridSize / 2);
  return room.maze.coordinateToNodeId?.get(`${center}:${center}`) ?? null;
}

function chooseBotTargetNode(room, player) {
  if (player.positionState === "outside") {
    return player.entryNodeId;
  }

  if (getSoleSurvivor(room)?.id === player.id) {
    const coreNodeId = getCoreNodeId(room);
    if (coreNodeId != null) {
      const pathToCore = findShortestPath(room.maze, player.currentNodeId, coreNodeId);
      if (pathToCore && pathToCore.length > 1) {
        player.botIntent = {
          targetNodeId: coreNodeId,
          reason: "core",
          pathLength: pathToCore.length - 1,
        };
        return pathToCore[1];
      }
    }
  }

  const adjacentEnemies = room.players.filter(
    (candidate) =>
      candidate.alive &&
      candidate.id !== player.id &&
      candidate.positionState === "inside" &&
      room.maze.adjacency[player.currentNodeId].includes(candidate.currentNodeId)
  );
  const killableEnemy = adjacentEnemies
    .slice()
    .sort((left, right) => left.score - right.score)
    .find((candidate) => player.score > candidate.score);
  if (killableEnemy) {
    return killableEnemy.currentNodeId;
  }

  const diamondTargets = room.maze.nodes
    .filter((node) => room.diamonds[node.id] > 0)
    .map((node) => ({
      nodeId: node.id,
      layer: node.layer,
      path: findShortestPath(room.maze, player.currentNodeId, node.id),
    }))
    .filter((entry) => entry.path && entry.path.length > 1)
    .sort((left, right) => {
      if (left.path.length !== right.path.length) {
        return left.path.length - right.path.length;
      }
      if (left.layer !== right.layer) {
        return left.layer - right.layer;
      }
      return left.nodeId - right.nodeId;
    });
  if (diamondTargets.length) {
    const target = diamondTargets[0];
    player.botIntent = {
      targetNodeId: target.nodeId,
      reason: "diamond",
      pathLength: target.path.length - 1,
    };
    return target.path[1];
  }

  const coreNodeId = getCoreNodeId(room);
  if (coreNodeId != null) {
    const pathToCore = findShortestPath(room.maze, player.currentNodeId, coreNodeId);
    if (pathToCore && pathToCore.length > 1) {
      player.botIntent = {
        targetNodeId: coreNodeId,
        reason: "core",
        pathLength: pathToCore.length - 1,
      };
      return pathToCore[1];
    }
  }

  const neighbors = room.maze.adjacency[player.currentNodeId].slice().sort((left, right) => {
    const leftNode = room.maze.nodes[left];
    const rightNode = room.maze.nodes[right];
    return leftNode.layer - rightNode.layer || left - right;
  });
  player.botIntent = null;
  return neighbors[0] ?? null;
}

function runBotTurn(room, player, now) {
  const targetNodeId = chooseBotTargetNode(room, player);
  return resolveTurnMove(room, player, targetNodeId, now, false);
}

function autoPickCurrentGate(room, now) {
  const currentPlayer = getPlayerById(room, room.gateDraft.currentPlayerId);
  if (!currentPlayer) {
    return false;
  }
  const shuffledSeats = shuffleValues(room.gateDraft.availableSeats, room.rng);
  const seatIndex = shuffledSeats[0];
  if (seatIndex == null) {
    return false;
  }
  pickGateForPlayer(room, currentPlayer, seatIndex, now);
  addLog(room, `${currentPlayer.name} ran out of time. A banner was assigned automatically.`, "draft", now);
  return true;
}

function tickRoom(room, now = Date.now()) {
  normalizeRoom(room);
  if (room.state !== "draft" && room.state !== "running") {
    return false;
  }

  let changed = false;
  let loopGuard = 0;
  while (loopGuard < 24) {
    loopGuard += 1;
    if (room.state === "draft") {
      if (!room.gateDraft.currentPlayerId || now < room.gateDraft.deadlineAt) {
        break;
      }
      autoPickCurrentGate(room, now);
      changed = true;
      continue;
    }

    const currentPlayer = getCurrentTurnPlayer(room);
    if (!currentPlayer) {
      break;
    }
    if (!currentPlayer.alive) {
      advanceTurn(room, now);
      changed = true;
      continue;
    }
    if (currentPlayer.isBot) {
      runBotTurn(room, currentPlayer, now);
      changed = true;
      continue;
    }
    if (room.turnState.deadlineAt != null && now >= room.turnState.deadlineAt) {
      resolveTurnMove(room, currentPlayer, null, now, true);
      changed = true;
      continue;
    }
    break;
  }

  return changed;
}

function buildViewerMaze(room, viewer, fullView) {
  if (fullView) {
    return {
      nodes: room.maze.nodes,
      edges: room.maze.edges,
      entries: room.maze.entries,
      segments: room.maze.segments,
      pillars: room.maze.pillars,
      wallSegments: room.maze.wallSegments,
      adjacency: room.maze.adjacency,
      layers: room.maze.layers,
      wallMap: room.maze.wallMap,
      wallTargets: room.maze.wallTargets,
      validation: room.maze.validation,
      metadata: room.maze.metadata,
      totalLayers: room.maze.totalLayers,
      gridSize: room.maze.gridSize,
      layout: room.maze.layout || "generic",
    };
  }

  if (!viewer) {
    return {
      nodes: room.maze.nodes,
      edges: [],
      entries: room.maze.entries,
      segments: room.maze.segments,
      pillars: room.maze.pillars,
      wallSegments: room.maze.wallSegments.map((segment) => ({
        key: segment.key,
        orientation: segment.orientation,
        row: segment.row,
        col: segment.col,
        state: "unknown",
      })),
      adjacency: [],
      layers: room.maze.layers,
      wallMap: [],
      wallTargets: [],
      validation: null,
      metadata: room.maze.metadata,
      totalLayers: room.maze.totalLayers,
      gridSize: room.maze.gridSize,
      layout: room.maze.layout || "generic",
      visibleNodeIds: [],
      discoveredNodeIds: [],
    };
  }

  const visibleNodeIds = computeVisibleNodeIds(room, viewer);
  return {
    nodes: room.maze.nodes,
    edges: [],
    entries: room.maze.entries,
    segments: room.maze.segments,
    pillars: room.maze.pillars,
    wallSegments: room.maze.wallSegments.map((segment) => ({
      key: segment.key,
      orientation: segment.orientation,
      row: segment.row,
      col: segment.col,
      state: viewer.knownWallStates[segment.key] || "unknown",
    })),
    adjacency: [],
    layers: room.maze.layers,
    wallMap: [],
    wallTargets: [],
    validation: null,
    metadata: room.maze.metadata,
    totalLayers: room.maze.totalLayers,
    gridSize: room.maze.gridSize,
    layout: room.maze.layout || "generic",
    visibleNodeIds: Array.from(visibleNodeIds),
    discoveredNodeIds: Array.from(viewer.discoveredNodeIds),
  };
}

function buildViewerPlayers(room, viewer, fullView) {
  const visibleNodeIds = viewer ? computeVisibleNodeIds(room, viewer) : new Set();
  return room.players.map((player) => {
    const isSelf = Boolean(viewer && viewer.id === player.id);
    const visibleToViewer =
      fullView ||
      isSelf ||
      (player.positionState === "inside" && player.currentNodeId != null && visibleNodeIds.has(player.currentNodeId));
    return {
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      isHost: player.isHost,
      connected: player.connected,
      score: fullView || isSelf ? player.score : null,
      diamondsCollected: fullView || isSelf ? player.diamondsCollected : null,
      kills: fullView || isSelf ? player.kills : null,
      alive: player.alive,
      color: player.color,
      currentNodeId: visibleToViewer ? player.currentNodeId : null,
      seatIndex: player.seatIndex,
      entryNodeId: player.entryNodeId,
      beastId: player.beastId,
      beastName: player.beastName,
      beastLabel: player.beastLabel,
      beastShort: player.beastShort,
      direction: player.direction,
      positionState: player.positionState,
      visibleToViewer,
      eliminatedReason: player.eliminatedReason || null,
      botIntent: fullView ? player.botIntent || null : null,
      path: [],
      isCurrentTurn: room.turnState.currentPlayerId === player.id,
    };
  });
}

function buildViewerDiamonds(room, viewer, fullView) {
  if (fullView) {
    return room.diamonds.slice();
  }
  return viewer ? viewer.knownDiamondValues.slice() : Array(room.diamonds.length).fill(null);
}

function buildViewerLogs(room, fullView) {
  if (fullView) {
    return room.logs;
  }
  return room.logs
    .filter((entry) => ["system", "draft", "turn", "purge", "finish"].includes(entry.type))
    .map((entry) => ({
      ...entry,
      detail: "",
    }));
}

function serializeRoom(room, viewerToken = null, now = Date.now(), viewMode = "gm") {
  normalizeRoom(room);
  const rules = getRoomRules(room);
  const viewer = room.players.find((player) => player.token && player.token === viewerToken) || null;
  const host = room.players.find((player) => player.isHost) || null;
  const soleSurvivor = getSoleSurvivor(room);
  const fullView = viewMode === "gm";
  const maze = buildViewerMaze(room, viewer, fullView);
  return {
    code: room.code,
    state: room.state,
    contenderCount: room.contenderCount,
    createdAt: room.createdAt,
    startedAt: room.startedAt || null,
    finishedAt: room.finishedAt || null,
    safeOuterLayer: room.safeOuterLayer,
    nextPurgeAt: null,
    winners: room.winnerIds || [],
    serverNow: now,
    version: room.version,
    rules,
    editorSettings: room.editorSettings,
    editorMetadata: room.editorMetadata || null,
    editorHistory: {
      canUndo: Boolean(room.editorHistory?.past?.length),
      canRedo: Boolean(room.editorHistory?.future?.length),
      undoDepth: room.editorHistory?.past?.length || 0,
      redoDepth: room.editorHistory?.future?.length || 0,
    },
    viewerMode: viewMode,
    viewerIsHost: Boolean(viewer && viewer.isHost),
    viewerId: viewer ? viewer.id : null,
    hostPlayerId: host ? host.id : null,
    controls: viewer ? getPlayerControls(room, viewer) : null,
    draft: {
      order: room.gateDraft.order.slice(),
      currentPlayerId: room.gateDraft.currentPlayerId,
      currentIndex: room.gateDraft.index,
      deadlineAt: room.gateDraft.deadlineAt,
      availableSeats: room.gateDraft.availableSeats.slice(),
      assignmentSequence: room.gateDraft.assignmentSequence.slice(),
    },
    turn: {
      roundNumber: room.turnState.roundNumber,
      order: room.turnState.order.slice(),
      currentPlayerId: room.turnState.currentPlayerId,
      currentIndex: room.turnState.index,
      startedAt: room.turnState.startedAt,
      deadlineAt: room.turnState.deadlineAt,
    },
    purge: {
      roundsUntilNextPurge: room.purgeState.roundsUntilNextPurge,
      nextLayer: room.purgeState.nextLayer,
      stopsAtLayer: GAME_RULES.finalSafeLayers,
    },
    victory: {
      soleSurvivorId: soleSurvivor?.id || null,
      requiresCoreClaim: Boolean(room.state === "running" && soleSurvivor && !isPlayerOnCore(room, soleSurvivor)),
      coreNodeId: getCoreNodeId(room),
    },
    visibility: fullView
      ? {
          fullView: true,
          visibleNodeIds: room.maze.nodes.map((node) => node.id),
          discoveredNodeIds: room.maze.nodes.map((node) => node.id),
        }
      : {
          fullView: false,
          visibleNodeIds: maze.visibleNodeIds || [],
          discoveredNodeIds: maze.discoveredNodeIds || [],
        },
    maze,
    diamonds: buildViewerDiamonds(room, viewer, fullView),
    players: buildViewerPlayers(room, viewer, fullView),
    logs: buildViewerLogs(room, fullView),
  };
}

module.exports = {
  GAME_RULES,
  GATE_ASSIGNMENTS,
  buildMaze,
  createDiamondState,
  editMazeWall,
  editMazeSegment,
  exportMazeLayout,
  startMatch,
  tickRoom,
  queuePathForPlayer,
  queueDirectionalMove,
  stopPlayerPath,
  serializeRoom,
  findShortestPath,
  createRng,
  getPlayerControls,
  pickGateForPlayer,
};
