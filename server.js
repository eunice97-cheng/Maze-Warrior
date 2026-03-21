"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { createEditorSettings, createEmptyLayoutDefinition } = require("./maze-editor");
const {
  GAME_RULES,
  buildMaze,
  createDiamondState,
  editMazeSegment,
  editMazeWall,
  exportMazeLayout,
  pickGateForPlayer,
  startMatch,
  tickRoom,
  queuePathForPlayer,
  queueDirectionalMove,
  stopPlayerPath,
  serializeRoom,
} = require("./game-engine");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const BUNDLED_EXPORTS_DIR = path.join(__dirname, "exports");
const EXPORTS_DIR = resolveStoragePath(process.env.MAZE_EXPORTS_DIR, BUNDLED_EXPORTS_DIR);
const DEFAULT_PLAY_LAYOUT_FILE = process.env.DEFAULT_PLAY_LAYOUT_FILE || "DENUG-layout.json";
// Keep workshop and full-map GM tools available locally, but opt-in for production deploys.
const GM_TOOLS_ENABLED =
  process.env.NODE_ENV !== "production" || String(process.env.MAZE_ENABLE_GM_TOOLS || "").toLowerCase() === "true";
const EXTERNAL_EXPORTS_STORAGE = path.resolve(EXPORTS_DIR) !== path.resolve(BUNDLED_EXPORTS_DIR);
const rooms = new Map();

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
};

function resolveStoragePath(input, fallback) {
  const value = String(input || "").trim();
  if (!value) {
    return fallback;
  }
  return path.normalize(path.isAbsolute(value) ? value : path.join(__dirname, value));
}

function getExportDirectories() {
  const directories = [];
  const pushDirectory = (directory, source) => {
    const resolvedPath = path.resolve(directory);
    if (!directories.some((entry) => entry.directory === resolvedPath)) {
      directories.push({ directory: resolvedPath, source });
    }
  };

  pushDirectory(EXPORTS_DIR, EXTERNAL_EXPORTS_STORAGE ? "runtime" : "repository");
  if (EXTERNAL_EXPORTS_STORAGE) {
    pushDirectory(BUNDLED_EXPORTS_DIR, "bundled");
  }
  return directories;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

function sendHealth(response) {
  sendJson(response, 200, {
    ok: true,
    service: "maze-warrior",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    activeRooms: rooms.size,
    gmToolsEnabled: GM_TOOLS_ENABLED,
    layoutStorageMode: EXTERNAL_EXPORTS_STORAGE ? "external" : "repository",
  });
}

async function ensureExportsWriteDirectory() {
  if (!EXTERNAL_EXPORTS_STORAGE) {
    return;
  }
  await fs.mkdir(EXPORTS_DIR, { recursive: true });
}

async function readExportCandidatesFromDirectory(directory, source) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
      .map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        const raw = await fs.readFile(fullPath, "utf8");
        const payload = JSON.parse(raw);
        const layout = payload?.layout || payload || {};
        const stat = await fs.stat(fullPath);
        return {
          source,
          fileName: entry.name,
          fullPath,
          payload,
          layout,
          exportedAt: payload.exportedAt || stat.mtime.toISOString(),
          complexity: getLayoutComplexity(layout),
        };
      })
  );
}

async function listExportCandidates() {
  await ensureExportsWriteDirectory();
  const candidatesByFileName = new Map();
  const priority = {
    runtime: 3,
    repository: 2,
    bundled: 1,
  };

  const results = await Promise.all(
    getExportDirectories().map(({ directory, source }) => readExportCandidatesFromDirectory(directory, source))
  );

  results.flat().forEach((candidate) => {
    const existing = candidatesByFileName.get(candidate.fileName);
    if (!existing || priority[candidate.source] > priority[existing.source]) {
      candidatesByFileName.set(candidate.fileName, candidate);
    }
  });

  return Array.from(candidatesByFileName.values());
}

async function readExportPayloadByFileName(fileName) {
  const normalizedFileName = path.basename(String(fileName || ""));
  if (!normalizedFileName) {
    throw new Error("An export file name is required.");
  }

  for (const { directory, source } of getExportDirectories()) {
    const fullPath = path.join(directory, normalizedFileName);
    try {
      const raw = await fs.readFile(fullPath, "utf8");
      return {
        source,
        fullPath,
        payload: JSON.parse(raw),
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Export file not found: ${normalizedFileName}`);
}

async function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sanitizeName(name, fallback = "Runner") {
  const cleaned = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18);
  return cleaned || fallback;
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    const randomByte = crypto.randomBytes(1)[0];
    code += alphabet[randomByte % alphabet.length];
  }
  if (rooms.has(code)) {
    return createRoomCode();
  }
  return code;
}

function createSimulationRoom(layoutPayload, sourceName = "simulation") {
  const code = createRoomCode();
  const seed = `${code}-${Date.now()}-${sourceName}`;
  const layout = layoutPayload?.layout || layoutPayload;
  const metadata = layout?.metadata || {
    name: sourceName,
    author: "simulation",
    notes: "",
  };
  const editorSettings = createEditorSettings({
    totalLayers: layout?.totalLayers,
    defaultDiamondValue: layout?.defaultDiamondValue,
  });
  const room = {
    id: crypto.randomUUID(),
    code,
    seed,
    createdAt: Date.now(),
    state: "lobby",
    contenderCount: GAME_RULES.maxPlayers,
    players: [],
    logs: [],
    listeners: new Set(),
    editorSettings,
    editorMetadata: {
      ...metadata,
      version: Math.max(1, Number(metadata.version) || 1),
      createdAt: metadata.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    editorHistory: {
      past: [],
      future: [],
    },
    maze: buildMaze(seed, layout),
    diamonds: [],
    safeOuterLayer: editorSettings.totalLayers,
    nextPurgeAt: null,
    winnerIds: [],
    botCounter: 0,
    version: 1,
    lastBroadcastVersion: 0,
    lastBroadcastAt: 0,
    updatedAt: Date.now(),
  };
  room.maze.metadata = room.editorMetadata;
  room.diamonds = createDiamondState(room.maze);
  startMatch(room);
  rooms.set(code, room);
  return room;
}

async function listSimulationExports() {
  const exports = (await listExportCandidates()).map((candidate) => {
    const metadata = candidate.layout.metadata || {};
    return {
      fileName: candidate.fileName,
      roomCode: candidate.payload.roomCode || null,
      exportedAt: candidate.exportedAt,
      totalLayers: candidate.layout.totalLayers || null,
      gridSize: candidate.layout.gridSize || null,
      name: metadata.name || candidate.fileName,
      author: metadata.author || "",
      notes: metadata.notes || "",
      source: candidate.source,
    };
  });
  return exports.sort((left, right) => String(right.exportedAt).localeCompare(String(left.exportedAt)));
}

function getLayoutComplexity(layout) {
  if (!layout || typeof layout !== "object") {
    return 0;
  }
  return (
    (Array.isArray(layout.segmentCommands) ? layout.segmentCommands.length : 0) +
    (Array.isArray(layout.commands) ? layout.commands.length : 0) +
    (Array.isArray(layout.diamondCommands) ? layout.diamondCommands.length : 0)
  );
}

async function getDefaultPlayableLayout() {
  const candidates = await listExportCandidates();

  if (!candidates.length) {
    return null;
  }

  const pinned = candidates.find((candidate) => candidate.fileName === DEFAULT_PLAY_LAYOUT_FILE);
  if (pinned) {
    return pinned;
  }

  candidates.sort((left, right) => {
    if (right.complexity !== left.complexity) {
      return right.complexity - left.complexity;
    }
    return String(right.exportedAt).localeCompare(String(left.exportedAt));
  });
  return candidates[0];
}

function createHumanPlayer(name, isHost) {
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name: sanitizeName(name),
    isBot: false,
    isHost,
    connected: false,
    joinedAt: Date.now(),
    color: null,
    score: 0,
    diamondsCollected: 0,
    kills: 0,
    alive: false,
    path: [],
  };
}

async function makeRoom(hostName, contenderCount) {
  const code = createRoomCode();
  const hostPlayer = createHumanPlayer(hostName, true);
  const seed = `${code}-${Date.now()}`;
  const defaultLayout = await getDefaultPlayableLayout();
  const baseLayout = defaultLayout?.layout || null;
  const editorSettings = createEditorSettings({
    totalLayers: baseLayout?.totalLayers || GAME_RULES.totalLayers,
    defaultDiamondValue: baseLayout?.defaultDiamondValue,
  });
  const initialMetadata = {
    name:
      baseLayout?.metadata?.name ||
      (defaultLayout ? defaultLayout.fileName.replace(/\.json$/i, "") : `${code} Draft`),
    author: baseLayout?.metadata?.author || hostPlayer.name,
    notes: baseLayout?.metadata?.notes || "",
    version: Math.max(1, Number(baseLayout?.metadata?.version) || 1),
    createdAt: baseLayout?.metadata?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const room = {
    id: crypto.randomUUID(),
    code,
    seed,
    createdAt: Date.now(),
    state: "lobby",
    contenderCount: Math.min(GAME_RULES.maxPlayers, Math.max(1, Number(contenderCount) || GAME_RULES.maxPlayers)),
    players: [hostPlayer],
    logs: [],
    listeners: new Set(),
    editorSettings,
    editorMetadata: initialMetadata,
    editorHistory: {
      past: [],
      future: [],
    },
    maze: buildMaze(seed, baseLayout || createEmptyLayoutDefinition(editorSettings)),
    diamonds: [],
    safeOuterLayer: editorSettings.totalLayers,
    nextPurgeAt: null,
    winnerIds: [],
    botCounter: 0,
    version: 1,
    lastBroadcastVersion: 0,
    lastBroadcastAt: 0,
    updatedAt: Date.now(),
  };
  room.maze.metadata = room.editorMetadata;
  room.diamonds = createDiamondState(room.maze);
  rooms.set(code, room);
  return { room, hostPlayer };
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase()) || null;
}

function getPlayerByToken(room, token) {
  if (!token) {
    return null;
  }
  return room.players.find((player) => player.token === token) || null;
}

function ensureEditorHistory(room) {
  room.editorHistory = room.editorHistory || {
    past: [],
    future: [],
  };
}

function createEditorSnapshot(room) {
  return exportMazeLayout(room.maze, {
    ...(room.editorMetadata || {}),
    updatedAt: new Date().toISOString(),
  });
}

function pushEditorHistory(room) {
  ensureEditorHistory(room);
  room.editorHistory.past.push(createEditorSnapshot(room));
  room.editorHistory.future = [];
  room.editorHistory.past = room.editorHistory.past.slice(-120);
}

function applyEditorSnapshot(room, snapshot) {
  const layout = snapshot?.layout ? snapshot.layout : snapshot;
  room.editorSettings = createEditorSettings({
    ...(room.editorSettings || {}),
    totalLayers: layout?.totalLayers,
    defaultDiamondValue: layout?.defaultDiamondValue,
  });
  room.editorMetadata = {
    ...(room.editorMetadata || {}),
    ...(layout?.metadata || snapshot?.metadata || {}),
  };
  room.maze = buildMaze(room.seed, {
    ...layout,
    metadata: room.editorMetadata,
  });
  room.diamonds = createDiamondState(room.maze);
  room.safeOuterLayer = room.editorSettings.totalLayers;
}

function bumpEditorRevision(room) {
  room.editorMetadata = room.editorMetadata || {};
  room.editorMetadata.version = Math.max(1, Number(room.editorMetadata.version) || 1) + 1;
  room.editorMetadata.updatedAt = new Date().toISOString();
}

function broadcastRoom(room, now = Date.now()) {
  const staleListeners = [];
  room.listeners.forEach((listener) => {
    try {
      listener.response.write(
        `data: ${JSON.stringify(serializeRoom(room, listener.token, now, listener.viewMode || "player"))}\n\n`
      );
    } catch (error) {
      staleListeners.push(listener);
    }
  });
  staleListeners.forEach((listener) => {
    room.listeners.delete(listener);
  });
  room.lastBroadcastVersion = room.version;
  room.lastBroadcastAt = now;
}

async function serveStatic(requestPath, response) {
  const routeAliases = {
    "/": "/index.html",
    "/gm": "/gm.html",
    "/gm/": "/gm.html",
  };
  const resolvedPath = routeAliases[requestPath] || requestPath;
  if (!GM_TOOLS_ENABLED && resolvedPath === "/gm.html") {
    sendText(response, 404, "Not found");
    return;
  }
  const fullPath = path.normalize(path.join(PUBLIC_DIR, resolvedPath));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  try {
    const extension = path.extname(fullPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";
    const content = await fs.readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch (error) {
    sendText(response, 404, "Not found");
  }
}

function roomSummary(room, player) {
  return {
    code: room.code,
    token: player.token,
    playerId: player.id,
    name: player.name,
  };
}

function ensureLobbyRoom(room, response) {
  if (!room) {
    sendJson(response, 404, { error: "Room not found." });
    return false;
  }
  if (room.state !== "lobby") {
    sendJson(response, 409, { error: "This match already started." });
    return false;
  }
  return true;
}

function normalizeViewMode(value) {
  return String(value || "").toLowerCase() === "gm" && GM_TOOLS_ENABLED ? "gm" : "player";
}

function getUrlViewMode(url) {
  return normalizeViewMode(url.searchParams.get("mode"));
}

function ensureGmToolsEnabled(response) {
  if (GM_TOOLS_ENABLED) {
    return true;
  }
  sendJson(response, 403, { error: "GM tools are disabled in this environment." });
  return false;
}

async function handleApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendHealth(response);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    try {
      const body = await parseJsonBody(request);
      const viewMode = normalizeViewMode(body.mode);
      const { room, hostPlayer } = await makeRoom(body.name, body.contenderCount);
      sendJson(response, 201, {
        session: roomSummary(room, hostPlayer),
        room: serializeRoom(room, hostPlayer.token, Date.now(), viewMode),
      });
    } catch (error) {
      sendJson(response, 400, { error: "Invalid room request." });
    }
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/dev/simulations/exports") {
    if (!ensureGmToolsEnabled(response)) {
      return true;
    }
    try {
      const exports = await listSimulationExports();
      sendJson(response, 200, { exports });
    } catch (error) {
      sendJson(response, 500, { error: "Could not load exported layouts.", detail: error.message });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/dev/simulations/export") {
    if (!ensureGmToolsEnabled(response)) {
      return true;
    }
    try {
      const body = await parseJsonBody(request);
      const fileName = path.basename(String(body.fileName || ""));
      if (!fileName) {
        sendJson(response, 400, { error: "An export file name is required." });
        return true;
      }
      const exportRecord = await readExportPayloadByFileName(fileName);
      const payload = exportRecord.payload;
      const room = createSimulationRoom(payload, fileName);
      sendJson(response, 201, {
        ok: true,
        fileName,
        source: exportRecord.source,
        room: serializeRoom(room, null, Date.now(), "gm"),
        spectatorSession: {
          code: room.code,
          token: "",
        },
      });
    } catch (error) {
      sendJson(response, 400, { error: "Could not bootstrap simulation.", detail: error.message });
    }
    return true;
  }

  if (segments[0] !== "api" || segments[1] !== "rooms" || !segments[2]) {
    return false;
  }

  const room = getRoom(segments[2]);

  if (request.method === "POST" && segments[3] === "editor") {
    if (!ensureGmToolsEnabled(response)) {
      return true;
    }
  }

  if (request.method === "POST" && segments[3] === "join") {
    if (!ensureLobbyRoom(room, response)) {
      return true;
    }
    const humans = room.players.filter((player) => !player.isBot);
    if (humans.length >= GAME_RULES.maxPlayers) {
      sendJson(response, 409, { error: "The lobby is already full." });
      return true;
    }
    try {
      const body = await parseJsonBody(request);
      const viewMode = normalizeViewMode(body.mode);
      const player = createHumanPlayer(body.name, false);
      room.players.push(player);
      room.version += 1;
      room.updatedAt = Date.now();
      broadcastRoom(room);
      sendJson(response, 200, {
        session: roomSummary(room, player),
        room: serializeRoom(room, player.token, Date.now(), viewMode),
      });
    } catch (error) {
      sendJson(response, 400, { error: "Invalid join request." });
    }
    return true;
  }

  if (!room) {
    sendJson(response, 404, { error: "Room not found." });
    return true;
  }

  if (request.method === "GET" && segments[3] === "state") {
    const token = url.searchParams.get("token");
    const viewMode = getUrlViewMode(url);
    sendJson(response, 200, serializeRoom(room, token, Date.now(), viewMode));
    return true;
  }

  if (request.method === "GET" && segments[3] === "events") {
    const token = url.searchParams.get("token");
    const viewMode = getUrlViewMode(url);
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    const listener = { token, response, viewMode };
    room.listeners.add(listener);
    const player = getPlayerByToken(room, token);
    if (player) {
      player.connected = true;
      room.version += 1;
      room.updatedAt = Date.now();
    }
    response.write(`data: ${JSON.stringify(serializeRoom(room, token, Date.now(), viewMode))}\n\n`);
    request.on("close", () => {
      room.listeners.delete(listener);
      if (player) {
        player.connected = false;
        room.version += 1;
        room.updatedAt = Date.now();
      }
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "start") {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can start the match." });
      return true;
    }
    if (room.state !== "lobby") {
      sendJson(response, 409, { error: "The match already started." });
      return true;
    }
    if (body.contenderCount) {
      room.contenderCount = Math.min(
        GAME_RULES.maxPlayers,
        Math.max(room.players.filter((member) => !member.isBot).length, Number(body.contenderCount) || room.contenderCount)
      );
    }
    startMatch(room);
    broadcastRoom(room);
    sendJson(response, 200, serializeRoom(room, body.token, Date.now(), viewMode));
    return true;
  }

  if (request.method === "POST" && segments[3] === "draft" && segments[4] === "pick") {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player) {
      sendJson(response, 403, { error: "Unknown player session." });
      return true;
    }
    const seatIndex = Number(body.seatIndex);
    const result = pickGateForPlayer(room, player, seatIndex);
    if (!result.ok) {
      const messages = {
        "not-drafting": "The room is not in gate draft right now.",
        "not-your-pick": "It is not your pick.",
        "seat-taken": "That gate is no longer available.",
      };
      sendJson(response, 400, { error: messages[result.reason] || "That gate pick is invalid." });
      return true;
    }
    broadcastRoom(room);
    sendJson(response, 200, serializeRoom(room, body.token, Date.now(), viewMode));
    return true;
  }

  if (request.method === "POST" && segments[3] === "editor" && segments[4] === "wall") {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can edit the maze layout." });
      return true;
    }
    if (room.state !== "lobby") {
      sendJson(response, 409, { error: "Wall editing is only available in the lobby." });
      return true;
    }
    const nodeId = Number(body.nodeId);
    const direction = String(body.direction || "");
    const segmentKey = typeof body.segmentKey === "string" ? body.segmentKey : null;
    const currentState = segmentKey
      ? room.maze.wallSegmentMap?.[segmentKey]?.state
      : room.maze.wallMap?.[nodeId]?.[direction];
    const nextState =
      body.state === "up" || body.state === "down"
        ? body.state
        : currentState === "down"
          ? "up"
          : "down";
    pushEditorHistory(room);
    const result = segmentKey
      ? editMazeSegment(room.maze, segmentKey, nextState, body.mirrorMode)
      : editMazeWall(room.maze, nodeId, direction, nextState, body.mirrorMode);
    if (!result.ok) {
      sendJson(response, 400, { error: "That wall edit is invalid." });
      return true;
    }
    bumpEditorRevision(room);
    room.maze.metadata = room.editorMetadata;
    room.version += 1;
    room.updatedAt = Date.now();
    broadcastRoom(room);
    sendJson(response, 200, {
      ok: true,
      applied: result.applied,
      room: serializeRoom(room, body.token, Date.now(), viewMode),
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "editor" && segments[4] === "config") {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can change the editor canvas." });
      return true;
    }
    if (room.state !== "lobby") {
      sendJson(response, 409, { error: "Canvas settings can only be changed in the lobby." });
      return true;
    }

    pushEditorHistory(room);
    room.editorSettings = createEditorSettings({
      ...room.editorSettings,
      totalLayers: body.totalLayers,
    });
    room.maze = buildMaze(room.seed, {
      ...createEmptyLayoutDefinition(room.editorSettings),
      metadata: room.editorMetadata,
    });
    room.diamonds = createDiamondState(room.maze);
    room.safeOuterLayer = room.editorSettings.totalLayers;
    bumpEditorRevision(room);
    room.maze.metadata = room.editorMetadata;
    room.version += 1;
    room.updatedAt = Date.now();
    broadcastRoom(room);
    sendJson(response, 200, {
      ok: true,
      room: serializeRoom(room, body.token, Date.now(), viewMode),
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "editor" && segments[4] === "metadata") {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can edit layout metadata." });
      return true;
    }
    if (room.state !== "lobby") {
      sendJson(response, 409, { error: "Layout metadata can only be changed in the lobby." });
      return true;
    }

    room.editorMetadata = {
      ...(room.editorMetadata || {}),
      name: String(body.name || room.editorMetadata?.name || `${room.code} Draft`).trim().slice(0, 48),
      author: String(body.author || room.editorMetadata?.author || player.name).trim().slice(0, 32),
      notes: String(body.notes || "").trim().slice(0, 400),
      updatedAt: new Date().toISOString(),
    };
    room.maze.metadata = room.editorMetadata;
    room.version += 1;
    room.updatedAt = Date.now();
    broadcastRoom(room);
    sendJson(response, 200, {
      ok: true,
      room: serializeRoom(room, body.token, Date.now(), viewMode),
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "editor" && (segments[4] === "undo" || segments[4] === "redo")) {
    const body = await parseJsonBody(request);
    const viewMode = normalizeViewMode(body.mode);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can change editor history." });
      return true;
    }
    if (room.state !== "lobby") {
      sendJson(response, 409, { error: "Editor history is only available in the lobby." });
      return true;
    }

    ensureEditorHistory(room);
    const direction = segments[4];
    if (direction === "undo") {
      const snapshot = room.editorHistory.past.pop();
      if (!snapshot) {
        sendJson(response, 409, { error: "Nothing to undo." });
        return true;
      }
      room.editorHistory.future.push(createEditorSnapshot(room));
      applyEditorSnapshot(room, snapshot);
    } else {
      const snapshot = room.editorHistory.future.pop();
      if (!snapshot) {
        sendJson(response, 409, { error: "Nothing to redo." });
        return true;
      }
      room.editorHistory.past.push(createEditorSnapshot(room));
      applyEditorSnapshot(room, snapshot);
    }

    room.version += 1;
    room.updatedAt = Date.now();
    broadcastRoom(room);
    sendJson(response, 200, {
      ok: true,
      room: serializeRoom(room, body.token, Date.now(), viewMode),
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "editor" && segments[4] === "export") {
    const body = await parseJsonBody(request);
    const player = getPlayerByToken(room, body.token);
    if (!player || !player.isHost) {
      sendJson(response, 403, { error: "Only the host can export the maze layout." });
      return true;
    }

    const exportPayload = {
      roomCode: room.code,
      exportedAt: new Date().toISOString(),
      state: room.state,
      safeOuterLayer: room.safeOuterLayer,
      layout: exportMazeLayout(room.maze, {
        ...(room.editorMetadata || {}),
        name: String(body.name || room.editorMetadata?.name || `${room.code} Draft`).trim().slice(0, 48),
        author: String(body.author || room.editorMetadata?.author || player.name).trim().slice(0, 32),
        notes: String(body.notes || room.editorMetadata?.notes || "").trim().slice(0, 400),
        updatedAt: new Date().toISOString(),
      }),
    };
    const fileName = `${room.code}-layout.json`;
    const exportPath = path.join(EXPORTS_DIR, fileName);

    room.editorMetadata = {
      ...(exportPayload.layout.metadata || {}),
    };
    room.maze.metadata = room.editorMetadata;

    await ensureExportsWriteDirectory();
    await fs.writeFile(exportPath, `${JSON.stringify(exportPayload, null, 2)}\n`, "utf8");

    sendJson(response, 200, {
      ok: true,
      fileName,
      exportPath,
      layout: exportPayload.layout,
    });
    return true;
  }

  if (request.method === "POST" && segments[3] === "action") {
    const body = await parseJsonBody(request);
    const player = getPlayerByToken(room, body.token);
    if (!player) {
      sendJson(response, 403, { error: "Unknown player session." });
      return true;
    }
    if (room.state !== "running") {
      sendJson(response, 409, { error: "The match is not running." });
      return true;
    }
    let result;
    if (body.kind === "direction") {
      result = queueDirectionalMove(room, player, String(body.direction || ""));
    } else if (body.kind === "stop") {
      result = stopPlayerPath(room, player);
    } else {
      const targetNodeId = Number(body.targetNodeId);
      result = queuePathForPlayer(room, player, targetNodeId);
    }
    if (!result.ok) {
      sendJson(response, 400, { error: "That move is no longer valid." });
      return true;
    }
    broadcastRoom(room);
    sendJson(response, 200, { ok: true });
    return true;
  }

  sendJson(response, 404, { error: "API route not found." });
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/health") {
      sendHealth(response);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (!handled) {
        sendJson(response, 404, { error: "API route not found." });
      }
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: "Server error", detail: error.message });
  }
});

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    tickRoom(room, now);
    const shouldBroadcast =
      room.version !== room.lastBroadcastVersion ||
      (room.state === "running" && now - room.lastBroadcastAt >= 1000);
    if (shouldBroadcast) {
      broadcastRoom(room, now);
    }
    const expired =
      room.state === "finished"
        ? now - (room.finishedAt || room.updatedAt) > 30 * 60_000
        : now - room.updatedAt > 6 * 60 * 60_000;
    if (expired && room.listeners.size === 0) {
      rooms.delete(code);
    }
  });
}, 250);

async function startServer() {
  await ensureExportsWriteDirectory();
  server.listen(PORT, () => {
    console.log(`Maze Warrior running at http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Maze Warrior failed to start.", error);
  process.exit(1);
});
