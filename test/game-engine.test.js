"use strict";

const assert = require("node:assert/strict");
const {
  GAME_RULES,
  buildMaze,
  createDiamondState,
  editMazeWall,
  exportMazeLayout,
  findShortestPath,
  pickGateForPlayer,
  queuePathForPlayer,
  serializeRoom,
  startMatch,
  stopPlayerPath,
  tickRoom,
} = require("../game-engine");

function createHuman(name, joinedAt = 0, isHost = false) {
  return {
    id: `player-${name.toLowerCase()}`,
    token: `token-${name.toLowerCase()}`,
    name,
    isBot: false,
    isHost,
    connected: true,
    joinedAt,
    color: null,
    score: 0,
    diamondsCollected: 0,
    kills: 0,
    alive: false,
    path: [],
  };
}

function createRoom(code, players, contenderCount = players.length) {
  const maze = buildMaze(`${code}-seed`);
  return {
    code,
    seed: `${code}-seed`,
    createdAt: 0,
    state: "lobby",
    contenderCount,
    players,
    logs: [],
    maze,
    diamonds: createDiamondState(maze),
    safeOuterLayer: maze.totalLayers,
    winnerIds: [],
    botCounter: 0,
    version: 1,
    updatedAt: 0,
  };
}

function nodeIdByKey(maze, key) {
  const node = maze.nodes.find((candidate) => candidate.key === key);
  assert.ok(node, `Missing node ${key}`);
  return node.id;
}

function getCurrentDraftPlayer(room) {
  return room.players.find((player) => player.id === room.gateDraft.currentPlayerId) || null;
}

function getCurrentTurnPlayer(room) {
  return room.players.find((player) => player.id === room.turnState.currentPlayerId) || null;
}

function claimGate(room, seatIndex, now) {
  const player = getCurrentDraftPlayer(room);
  assert.ok(player, "Expected a current draft player");
  const result = pickGateForPlayer(room, player, seatIndex, now);
  assert.equal(result.ok, true, `Expected gate ${seatIndex} to be claimable`);
  return player;
}

function enterCurrentPlayer(room, now) {
  const player = getCurrentTurnPlayer(room);
  assert.ok(player, "Expected a current turn player");
  const result = queuePathForPlayer(room, player, player.entryNodeId, now);
  assert.equal(result.ok, true, "Expected the current player to enter the maze");
  return player;
}

function verifyDefaultLayoutSystem() {
  const maze = buildMaze("square-sealed-layout");
  const topEntryId = nodeIdByKey(maze, "0:9");
  const centerId = nodeIdByKey(maze, "9:9");

  assert.equal(maze.layout, "manual-square-layout");
  assert.equal(maze.gridSize, GAME_RULES.gridSize);
  assert.equal(maze.totalLayers, GAME_RULES.totalLayers);
  assert.equal(maze.entries.length, GAME_RULES.entryCount);
  assert.ok(maze.adjacency[topEntryId].length > 0);
  assert.ok(findShortestPath(maze, topEntryId, centerId));
}

function verifyLayoutExportRoundTrip() {
  const sourceMaze = buildMaze("export-layout-seed");
  editMazeWall(sourceMaze, nodeIdByKey(sourceMaze, "1:9"), "east", "up", "quad");
  editMazeWall(sourceMaze, nodeIdByKey(sourceMaze, "5:9"), "south", "down", "opposite");

  const exported = exportMazeLayout(sourceMaze);
  const rebuiltMaze = buildMaze("rebuilt-layout-seed", exported);

  assert.equal(exported.format, "maze-warrior-square-layout-v2");
  assert.equal(exported.layout, "editor-square-layout");
  assert.deepEqual(rebuiltMaze.wallMap, sourceMaze.wallMap);
  assert.deepEqual(rebuiltMaze.adjacency, sourceMaze.adjacency);
}

function verifyGateDraftStartsRunningWithReverseTurnOrder() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("DRAFT", [host, guest], 2);

  startMatch(room, 0);

  assert.equal(room.state, "draft");
  assert.ok(room.gateDraft.currentPlayerId);
  const firstPicker = claimGate(room, 1, 100);
  const secondPicker = claimGate(room, 3, 200);

  assert.equal(room.state, "running");
  assert.deepEqual(room.gateDraft.assignmentSequence, [firstPicker.id, secondPicker.id]);
  assert.deepEqual(room.turnState.order, [secondPicker.id, firstPicker.id]);

  const current = getCurrentTurnPlayer(room);
  const snapshot = serializeRoom(room, current.token, 250, "player");
  assert.equal(snapshot.controls.mustEnter, true);
  assert.deepEqual(snapshot.controls.neighborNodeIds, [current.entryNodeId]);
}

function verifyFirstTurnTimeoutEliminatesOutsidePlayerButKeepsMatchRunning() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("ENTRY", [host, guest], 2);

  startMatch(room, 0);
  claimGate(room, 0, 100);
  claimGate(room, 2, 200);

  const firstTurnPlayer = getCurrentTurnPlayer(room);
  tickRoom(room, room.turnState.deadlineAt);
  const remainingPlayer = room.players.find((player) => player.alive);

  assert.equal(firstTurnPlayer.alive, false);
  assert.equal(firstTurnPlayer.eliminatedReason, "missed-entry");
  assert.equal(room.state, "running");
  assert.equal(getCurrentTurnPlayer(room).id, remainingPlayer.id);
}

function verifyTimeoutInsideHoldsPosition() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("HOLD", [host, guest], 2);

  startMatch(room, 0);
  claimGate(room, 0, 100);
  claimGate(room, 2, 200);

  const firstEntered = enterCurrentPlayer(room, 300);
  const secondEntered = enterCurrentPlayer(room, 400);
  const roundTwoPlayer = getCurrentTurnPlayer(room);
  const positionBefore = roundTwoPlayer.currentNodeId;

  tickRoom(room, room.turnState.deadlineAt);

  assert.equal(roundTwoPlayer.alive, true);
  assert.equal(roundTwoPlayer.currentNodeId, positionBefore);
  assert.notEqual(getCurrentTurnPlayer(room).id, roundTwoPlayer.id);
  assert.ok([firstEntered.id, secondEntered.id].includes(getCurrentTurnPlayer(room).id));
}

function verifyTieCombatDestroysBoth() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("TIE", [host, guest], 2);

  startMatch(room, 0);
  claimGate(room, 0, 100);
  claimGate(room, 2, 200);

  const hostNodeId = nodeIdByKey(room.maze, "1:9");
  const guestNodeId = nodeIdByKey(room.maze, "1:8");
  host.alive = true;
  guest.alive = true;
  host.positionState = "inside";
  guest.positionState = "inside";
  host.currentNodeId = hostNodeId;
  guest.currentNodeId = guestNodeId;
  host.score = 2;
  guest.score = 2;
  room.state = "running";
  room.turnState = {
    roundNumber: 2,
    order: [guest.id, host.id],
    index: 0,
    currentPlayerId: guest.id,
    startedAt: 0,
    deadlineAt: 10_000,
  };
  room.purgeState = {
    roundsUntilNextPurge: 10,
    nextLayer: room.safeOuterLayer,
  };

  const result = queuePathForPlayer(room, guest, hostNodeId, 500);

  assert.equal(result.ok, true);
  assert.equal(host.alive, false);
  assert.equal(guest.alive, false);
  assert.equal(room.state, "finished");
}

function verifySoleSurvivorMustReachCoreToWin() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("CORE", [host, guest], 2);

  startMatch(room, 0);
  claimGate(room, 0, 100);
  claimGate(room, 2, 200);

  const attackerNodeId = nodeIdByKey(room.maze, "9:7");
  const clashNodeId = nodeIdByKey(room.maze, "9:8");
  const coreNodeId = nodeIdByKey(room.maze, "9:9");
  assert.ok(room.maze.adjacency[attackerNodeId].includes(clashNodeId));
  assert.ok(room.maze.adjacency[clashNodeId].includes(coreNodeId));

  host.alive = true;
  guest.alive = true;
  host.positionState = "inside";
  guest.positionState = "inside";
  host.currentNodeId = attackerNodeId;
  guest.currentNodeId = clashNodeId;
  host.score = 3;
  guest.score = 1;
  room.diamonds[clashNodeId] = 0;
  room.diamonds[coreNodeId] = 0;
  room.state = "running";
  room.turnState = {
    roundNumber: 4,
    order: [host.id, guest.id],
    index: 0,
    currentPlayerId: host.id,
    startedAt: 0,
    deadlineAt: 10_000,
  };
  room.purgeState = {
    roundsUntilNextPurge: 7,
    nextLayer: room.safeOuterLayer,
  };

  const clashResult = queuePathForPlayer(room, host, clashNodeId, 500);

  assert.equal(clashResult.ok, true);
  assert.equal(guest.alive, false);
  assert.equal(room.state, "running");
  assert.equal(host.currentNodeId, clashNodeId);
  assert.equal(getCurrentTurnPlayer(room).id, host.id);
  assert.equal(serializeRoom(room, host.token, 550, "player").victory.requiresCoreClaim, true);

  const coreResult = queuePathForPlayer(room, host, coreNodeId, 600);

  assert.equal(coreResult.ok, true);
  assert.equal(room.state, "finished");
  assert.deepEqual(room.winnerIds, [host.id]);
}

function verifyPlayerViewHidesRivalsAndKeepsRememberedDiamonds() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("FOG", [host, guest], 2);

  startMatch(room, 0);
  if (getCurrentDraftPlayer(room).id === host.id) {
    claimGate(room, 0, 100);
    claimGate(room, 2, 200);
  } else {
    claimGate(room, 2, 100);
    claimGate(room, 0, 200);
  }

  enterCurrentPlayer(room, 300);
  enterCurrentPlayer(room, 400);

  const rememberedNodeId = nodeIdByKey(room.maze, "2:9");
  assert.equal(host.knownDiamondValues[rememberedNodeId], 1);

  host.currentNodeId = nodeIdByKey(room.maze, "9:9");
  guest.currentNodeId = nodeIdByKey(room.maze, "18:9");
  host.positionState = "inside";
  guest.positionState = "inside";
  guest.score = 4;
  room.diamonds[rememberedNodeId] = 0;

  const playerView = serializeRoom(room, host.token, 500, "player");
  const gmView = serializeRoom(room, host.token, 500, "gm");

  assert.equal(playerView.players.find((player) => player.id === host.id).score, host.score);
  assert.equal(playerView.players.find((player) => player.id === guest.id).score, null);
  assert.equal(playerView.players.find((player) => player.id === guest.id).currentNodeId, null);
  assert.equal(playerView.diamonds[rememberedNodeId], 1);
  assert.ok(!playerView.visibility.visibleNodeIds.includes(rememberedNodeId));
  assert.equal(gmView.players.find((player) => player.id === guest.id).score, 4);
  assert.equal(gmView.players.find((player) => player.id === guest.id).currentNodeId, guest.currentNodeId);
}

function verifyRoundBasedPurgeDropsOuterLayerAndKillsOccupants() {
  const host = createHuman("Host", 0, true);
  const guest = createHuman("Guest", 1, false);
  const room = createRoom("PURGE", [host, guest], 2);

  startMatch(room, 0);
  claimGate(room, 0, 100);
  claimGate(room, 2, 200);

  host.alive = true;
  guest.alive = true;
  host.positionState = "inside";
  guest.positionState = "inside";
  host.currentNodeId = nodeIdByKey(room.maze, "3:9");
  guest.currentNodeId = nodeIdByKey(room.maze, "4:9");
  room.state = "running";
  room.safeOuterLayer = 7;
  room.turnState = {
    roundNumber: 10,
    order: [host.id, guest.id],
    index: 1,
    currentPlayerId: guest.id,
    startedAt: 0,
    deadlineAt: 10_000,
  };
  room.purgeState = {
    roundsUntilNextPurge: 1,
    nextLayer: 7,
  };

  const result = stopPlayerPath(room, guest, 600);

  assert.equal(result.ok, true);
  assert.equal(host.alive, false);
  assert.equal(host.eliminatedReason, "purge");
  assert.equal(room.safeOuterLayer, 6);
  assert.equal(room.state, "running");
  assert.equal(getCurrentTurnPlayer(room).id, guest.id);
}

verifyDefaultLayoutSystem();
verifyLayoutExportRoundTrip();
verifyGateDraftStartsRunningWithReverseTurnOrder();
verifyFirstTurnTimeoutEliminatesOutsidePlayerButKeepsMatchRunning();
verifyTimeoutInsideHoldsPosition();
verifyTieCombatDestroysBoth();
verifySoleSurvivorMustReachCoreToWin();
verifyPlayerViewHidesRivalsAndKeepsRememberedDiamonds();
verifyRoundBasedPurgeDropsOuterLayerAndKillsOccupants();

console.log("Engine checks passed.");
