"use strict";

const { createEditorSettings, DEFAULT_DIAMOND_VALUE } = require("./maze-editor");

const WALL_UP = "up";
const WALL_DOWN = "down";
const SEGMENT_NAMES = Object.freeze(["north", "east", "south", "west"]);

function coordinateKey(row, col) {
  return `${row}:${col}`;
}

function normalizeWallState(value) {
  return String(value || "").toLowerCase() === WALL_DOWN ? WALL_DOWN : WALL_UP;
}

function normalizeWallDirection(value) {
  const direction = String(value || "").toLowerCase();
  const aliases = {
    up: "north",
    right: "east",
    down: "south",
    left: "west",
    north: "north",
    east: "east",
    south: "south",
    west: "west",
  };
  return aliases[direction] || null;
}

function getLayerCoordinates(layer, center) {
  if (layer === 1) {
    return [{ row: center, col: center }];
  }
  const radius = layer - 1;
  const min = center - radius;
  const max = center + radius;
  const coordinates = [];

  for (let col = min; col <= max; col += 1) {
    coordinates.push({ row: min, col });
  }
  for (let row = min + 1; row <= max; row += 1) {
    coordinates.push({ row, col: max });
  }
  for (let col = max - 1; col >= min; col -= 1) {
    coordinates.push({ row: max, col });
  }
  for (let row = max - 1; row > min; row -= 1) {
    coordinates.push({ row, col: min });
  }

  return coordinates;
}

function getSegmentIndexForNode(layer, index, count) {
  if (layer === 1 || count < 4) {
    return null;
  }
  const segmentSize = count / 4;
  return Math.floor(index / segmentSize) % 4;
}

function getWallSegmentKey(orientation, row, col) {
  return `${orientation}:${row}:${col}`;
}

function getNodeWallSegmentKeys(row, col) {
  return {
    north: getWallSegmentKey("h", row, col),
    east: getWallSegmentKey("v", row, col + 1),
    south: getWallSegmentKey("h", row + 1, col),
    west: getWallSegmentKey("v", row, col),
  };
}

function parseWallSegmentKey(key) {
  if (typeof key !== "string") {
    return null;
  }
  const [orientation, rowText, colText] = key.split(":");
  const row = Number(rowText);
  const col = Number(colText);
  if (!["h", "v"].includes(orientation) || !Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { key, orientation, row, col };
}

function getSegmentEndpoints(segment) {
  if (segment.orientation === "h") {
    return {
      start: { row: segment.row, col: segment.col },
      end: { row: segment.row, col: segment.col + 1 },
    };
  }
  return {
    start: { row: segment.row, col: segment.col },
    end: { row: segment.row + 1, col: segment.col },
  };
}

function rotatePillarCoordinate(row, col, turns, gridSize) {
  let nextRow = row;
  let nextCol = col;
  const safeTurns = ((turns % 4) + 4) % 4;
  for (let index = 0; index < safeTurns; index += 1) {
    const rotatedRow = nextCol;
    const rotatedCol = gridSize - nextRow;
    nextRow = rotatedRow;
    nextCol = rotatedCol;
  }
  return { row: nextRow, col: nextCol };
}

function normalizeSegmentFromEndpoints(start, end) {
  if (start.row === end.row) {
    return {
      orientation: "h",
      row: start.row,
      col: Math.min(start.col, end.col),
    };
  }
  return {
    orientation: "v",
    row: Math.min(start.row, end.row),
    col: start.col,
  };
}

function rotateSegmentKey(key, turns, gridSize) {
  const segment = parseWallSegmentKey(key);
  if (!segment) {
    return null;
  }
  const endpoints = getSegmentEndpoints(segment);
  const rotatedStart = rotatePillarCoordinate(endpoints.start.row, endpoints.start.col, turns, gridSize);
  const rotatedEnd = rotatePillarCoordinate(endpoints.end.row, endpoints.end.col, turns, gridSize);
  const normalized = normalizeSegmentFromEndpoints(rotatedStart, rotatedEnd);
  return getWallSegmentKey(normalized.orientation, normalized.row, normalized.col);
}

function normalizeMirrorMode(value) {
  const mode = String(value || "off").trim().toLowerCase();
  if (["opposite", "180", "half"].includes(mode)) {
    return "opposite";
  }
  if (["quad", "four-way", "4-way", "4way", "rotational"].includes(mode)) {
    return "quad";
  }
  return "off";
}

function getMirroredSegmentKeys(maze, segmentKey, mirrorMode = "off") {
  const mode = normalizeMirrorMode(mirrorMode);
  const turnsList = mode === "quad" ? [0, 1, 2, 3] : mode === "opposite" ? [0, 2] : [0];
  const keys = new Set();
  turnsList.forEach((turns) => {
    const rotated = rotateSegmentKey(segmentKey, turns, maze.gridSize);
    if (rotated) {
      keys.add(rotated);
    }
  });
  return Array.from(keys);
}

function resolveCommandNodeId(command, nodes, layers, coordinateToNodeId) {
  if (!command || typeof command !== "object") {
    return null;
  }
  if (Number.isInteger(command.nodeId) && nodes[command.nodeId]) {
    return command.nodeId;
  }
  if (typeof command.key === "string") {
    const [rowText, colText] = command.key.split(":");
    const row = Number(rowText);
    const col = Number(colText);
    if (Number.isInteger(row) && Number.isInteger(col)) {
      return coordinateToNodeId.get(coordinateKey(row, col)) ?? null;
    }
  }
  if (Number.isInteger(command.row) && Number.isInteger(command.col)) {
    return coordinateToNodeId.get(coordinateKey(command.row, command.col)) ?? null;
  }
  if (Number.isInteger(command.layer) && Number.isInteger(command.index) && layers[command.layer - 1]) {
    return layers[command.layer - 1][command.index] ?? null;
  }
  return null;
}

function createWallSegments(gridSize) {
  const wallSegments = [];
  const wallSegmentMap = {};

  for (let row = 0; row <= gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const key = getWallSegmentKey("h", row, col);
      const segment = {
        key,
        orientation: "h",
        row,
        col,
        state: WALL_UP,
      };
      wallSegments.push(segment);
      wallSegmentMap[key] = segment;
    }
  }

  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col <= gridSize; col += 1) {
      const key = getWallSegmentKey("v", row, col);
      const segment = {
        key,
        orientation: "v",
        row,
        col,
        state: WALL_UP,
      };
      wallSegments.push(segment);
      wallSegmentMap[key] = segment;
    }
  }

  return { wallSegments, wallSegmentMap };
}

function applyNodeWallCommand(maze, nodeId, direction, state) {
  const normalizedDirection = normalizeWallDirection(direction);
  if (!normalizedDirection || !maze.nodes[nodeId]) {
    return false;
  }
  const segmentKey = maze.nodes[nodeId].wallSegmentKeys[normalizedDirection];
  return setWallSegmentState(maze, segmentKey, state);
}

function applyLayoutCommands(maze, layoutDefinition) {
  const commands = Array.isArray(layoutDefinition?.commands) ? layoutDefinition.commands : [];
  const diamondCommands = Array.isArray(layoutDefinition?.diamondCommands) ? layoutDefinition.diamondCommands : [];
  const segmentCommands = Array.isArray(layoutDefinition?.segmentCommands) ? layoutDefinition.segmentCommands : [];

  commands.forEach((command) => {
    const nodeId = resolveCommandNodeId(command, maze.nodes, maze.layers, maze.coordinateToNodeId);
    if (nodeId == null) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(command, "diamondValue")) {
      const diamondValue = Number(command.diamondValue);
      if (Number.isFinite(diamondValue) && diamondValue >= 0) {
        maze.nodes[nodeId].diamondValue = diamondValue;
      }
    }
    if (!command.walls || typeof command.walls !== "object") {
      return;
    }
    Object.entries(command.walls).forEach(([directionKey, state]) => {
      applyNodeWallCommand(maze, nodeId, directionKey, state);
    });
  });

  Object.entries(layoutDefinition?.nodeOverrides || {}).forEach(([key, override]) => {
    const nodeId = resolveCommandNodeId({ key }, maze.nodes, maze.layers, maze.coordinateToNodeId);
    if (nodeId == null) {
      return;
    }
    if (override && Object.prototype.hasOwnProperty.call(override, "diamondValue")) {
      const diamondValue = Number(override.diamondValue);
      if (Number.isFinite(diamondValue) && diamondValue >= 0) {
        maze.nodes[nodeId].diamondValue = diamondValue;
      }
    }
    if (override?.walls) {
      Object.entries(override.walls).forEach(([directionKey, state]) => {
        applyNodeWallCommand(maze, nodeId, directionKey, state);
      });
    }
  });

  segmentCommands.forEach((command) => {
    const segmentKey =
      typeof command?.key === "string"
        ? command.key
        : getWallSegmentKey(command?.orientation, Number(command?.row), Number(command?.col));
    setWallSegmentState(maze, segmentKey, command?.state);
  });

  diamondCommands.forEach((command) => {
    const nodeId = resolveCommandNodeId(command, maze.nodes, maze.layers, maze.coordinateToNodeId);
    if (nodeId == null) {
      return;
    }
    const diamondValue = Number(command.diamondValue);
    if (Number.isFinite(diamondValue) && diamondValue >= 0) {
      maze.nodes[nodeId].diamondValue = diamondValue;
    }
  });
}

function setWallSegmentState(maze, segmentKey, state) {
  const segment = maze?.wallSegmentMap?.[segmentKey];
  if (!segment) {
    return false;
  }
  segment.state = normalizeWallState(state);
  return true;
}

function rebuildDerivedState(maze) {
  const adjacency = Array.from({ length: maze.nodes.length }, () => []);
  const edges = [];
  const edgeSet = new Set();

  function commitEdge(a, b) {
    if (a == null || b == null || a === b) {
      return;
    }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (edgeSet.has(key)) {
      return;
    }
    edgeSet.add(key);
    edges.push({ a, b });
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  maze.wallMap = maze.nodes.map((node) => {
    const walls = {
      north: normalizeWallState(maze.wallSegmentMap[node.wallSegmentKeys.north]?.state),
      east: normalizeWallState(maze.wallSegmentMap[node.wallSegmentKeys.east]?.state),
      south: normalizeWallState(maze.wallSegmentMap[node.wallSegmentKeys.south]?.state),
      west: normalizeWallState(maze.wallSegmentMap[node.wallSegmentKeys.west]?.state),
    };
    if (walls.north === WALL_DOWN && maze.wallTargets[node.id].north != null) {
      commitEdge(node.id, maze.wallTargets[node.id].north);
    }
    if (walls.east === WALL_DOWN && maze.wallTargets[node.id].east != null) {
      commitEdge(node.id, maze.wallTargets[node.id].east);
    }
    if (walls.south === WALL_DOWN && maze.wallTargets[node.id].south != null) {
      commitEdge(node.id, maze.wallTargets[node.id].south);
    }
    if (walls.west === WALL_DOWN && maze.wallTargets[node.id].west != null) {
      commitEdge(node.id, maze.wallTargets[node.id].west);
    }
    return walls;
  });

  adjacency.forEach((neighbors) => neighbors.sort((left, right) => left - right));
  maze.edges = edges;
  maze.adjacency = adjacency;
  maze.validation = validateMazeModel(maze);
  return maze;
}

function findShortestPath(adjacency, fromNodeId, toNodeId) {
  if (fromNodeId === toNodeId) {
    return [fromNodeId];
  }
  const queue = [fromNodeId];
  const previous = new Map([[fromNodeId, null]]);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const neighbor of adjacency[current]) {
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

function validateMazeModel(maze) {
  const center = Math.floor(maze.gridSize / 2);
  const coreNodeId = maze.coordinateToNodeId.get(coordinateKey(center, center)) ?? null;
  const entrySummaries = maze.entries.map((entryNodeId, index) => {
    const path = coreNodeId == null ? null : findShortestPath(maze.adjacency, entryNodeId, coreNodeId);
    return {
      gate: index + 1,
      entryNodeId,
      distanceToCore: path ? path.length - 1 : null,
      reachesCore: Boolean(path),
    };
  });

  const frontier = [];
  const reachable = new Set();
  maze.entries.forEach((entryNodeId) => {
    if (entryNodeId == null) {
      return;
    }
    reachable.add(entryNodeId);
    frontier.push(entryNodeId);
  });
  for (let head = 0; head < frontier.length; head += 1) {
    const current = frontier[head];
    for (const neighbor of maze.adjacency[current]) {
      if (reachable.has(neighbor)) {
        continue;
      }
      reachable.add(neighbor);
      frontier.push(neighbor);
    }
  }

  const reachableNodeIds = Array.from(reachable);
  const deadEnds = reachableNodeIds.filter((nodeId) => maze.adjacency[nodeId].length <= 1);
  const finiteDistances = entrySummaries
    .map((entry) => entry.distanceToCore)
    .filter((distance) => Number.isInteger(distance));

  return {
    reachableNodeCount: reachable.size,
    isolatedNodeCount: maze.nodes.length - reachable.size,
    deadEndCount: deadEnds.length,
    allEntriesReachCore: entrySummaries.every((entry) => entry.reachesCore),
    entryDistances: entrySummaries,
    symmetricEntryDistances:
      finiteDistances.length === maze.entries.length &&
      new Set(finiteDistances).size === 1,
    fairnessGap:
      finiteDistances.length > 1 ? Math.max(...finiteDistances) - Math.min(...finiteDistances) : null,
  };
}

function buildMazeModel(layoutDefinition = {}) {
  const settings = createEditorSettings(layoutDefinition);
  const totalLayers = settings.totalLayers;
  const gridSize = settings.gridSize;
  const center = Math.floor(gridSize / 2);
  const nodes = [];
  const layers = [];
  const coordinateToNodeId = new Map();
  let nextId = 0;

  for (let layer = 1; layer <= totalLayers; layer += 1) {
    const coordinates = getLayerCoordinates(layer, center);
    const layerNodeIds = [];
    coordinates.forEach(({ row, col }, index) => {
      const x = col - center;
      const y = row - center;
      const segmentIndex = getSegmentIndexForNode(layer, index, coordinates.length);
      const node = {
        id: nextId,
        key: coordinateKey(row, col),
        layerKey: `${layer}:${index}`,
        layer,
        row,
        col,
        x,
        y,
        index,
        count: coordinates.length,
        angle: Math.atan2(y, x),
        segmentIndex,
        segment: segmentIndex == null ? "core" : SEGMENT_NAMES[segmentIndex],
        diamondValue: settings.defaultDiamondValue,
        wallSegmentKeys: getNodeWallSegmentKeys(row, col),
      };
      nodes.push(node);
      layerNodeIds.push(nextId);
      coordinateToNodeId.set(node.key, nextId);
      nextId += 1;
    });
    layers.push(layerNodeIds);
  }

  const wallTargets = nodes.map((node) => ({
    north: coordinateToNodeId.get(coordinateKey(node.row - 1, node.col)) ?? null,
    east: coordinateToNodeId.get(coordinateKey(node.row, node.col + 1)) ?? null,
    south: coordinateToNodeId.get(coordinateKey(node.row + 1, node.col)) ?? null,
    west: coordinateToNodeId.get(coordinateKey(node.row, node.col - 1)) ?? null,
  }));
  const { wallSegments, wallSegmentMap } = createWallSegments(gridSize);
  const pillars = [];
  for (let row = 0; row <= gridSize; row += 1) {
    for (let col = 0; col <= gridSize; col += 1) {
      pillars.push({
        key: coordinateKey(row, col),
        row,
        col,
      });
    }
  }

  const entries = [
    coordinateToNodeId.get(coordinateKey(0, center)),
    coordinateToNodeId.get(coordinateKey(center, gridSize - 1)),
    coordinateToNodeId.get(coordinateKey(gridSize - 1, center)),
    coordinateToNodeId.get(coordinateKey(center, 0)),
  ];
  const segments = SEGMENT_NAMES.map((name, segmentIndex) => ({
    name,
    segmentIndex,
    entryNodeId: entries[segmentIndex],
    nodeIds: nodes
      .filter((node) => node.segmentIndex === segmentIndex)
      .map((node) => node.id),
  })).map((segment) => ({
    ...segment,
    nodeCount: segment.nodeIds.length,
  }));

  const maze = {
    seed: String(layoutDefinition.seed || "maze-warrior"),
    layout: layoutDefinition.layout || "editor-square-layout",
    format: layoutDefinition.format || "maze-warrior-square-layout-v2",
    totalLayers,
    gridSize,
    nodes,
    layers,
    entries,
    segments,
    pillars,
    wallSegments,
    wallSegmentMap,
    wallTargets,
    coordinateToNodeId,
    adjacency: [],
    edges: [],
    validation: null,
    metadata: {
      name: layoutDefinition?.metadata?.name || "Untitled Layout",
      author: layoutDefinition?.metadata?.author || "",
      notes: layoutDefinition?.metadata?.notes || "",
      version: Number(layoutDefinition?.metadata?.version) || 1,
      createdAt: layoutDefinition?.metadata?.createdAt || null,
      updatedAt: layoutDefinition?.metadata?.updatedAt || null,
    },
  };

  applyLayoutCommands(maze, layoutDefinition);
  return rebuildDerivedState(maze);
}

function editWallSegment(maze, segmentKey, state, mirrorMode = "off") {
  if (!maze?.wallSegmentMap?.[segmentKey]) {
    return { ok: false, reason: "invalid-segment" };
  }
  const wallState = normalizeWallState(state);
  const applied = [];
  getMirroredSegmentKeys(maze, segmentKey, mirrorMode).forEach((key) => {
    if (setWallSegmentState(maze, key, wallState)) {
      applied.push({ segmentKey: key, state: wallState });
    }
  });
  rebuildDerivedState(maze);
  return { ok: applied.length > 0, applied };
}

function getSegmentKeyForNodeDirection(maze, nodeId, direction) {
  const normalizedDirection = normalizeWallDirection(direction);
  if (!normalizedDirection || !maze?.nodes?.[nodeId]) {
    return null;
  }
  return maze.nodes[nodeId].wallSegmentKeys[normalizedDirection] || null;
}

function exportLayoutDefinition(maze, metadata = {}) {
  if (!maze) {
    return {
      format: "maze-warrior-square-layout-v2",
      layout: "editor-square-layout",
      totalLayers: 10,
      gridSize: 19,
      totalNodes: 0,
      defaultDiamondValue: DEFAULT_DIAMOND_VALUE,
      sourceOfTruth: "wall-segments",
      metadata,
      segmentCommands: [],
      diamondCommands: [],
      commands: [],
    };
  }

  const uniqueDiamondValues = new Set(maze.nodes.map((node) => Number(node.diamondValue) || 0));
  const defaultDiamondValue = uniqueDiamondValues.size === 1 ? (Number(maze.nodes[0]?.diamondValue) || 1) : 1;
  const segmentCommands = maze.wallSegments
    .filter((segment) => segment.state === WALL_DOWN)
    .map((segment) => ({
      key: segment.key,
      orientation: segment.orientation,
      row: segment.row,
      col: segment.col,
      state: segment.state,
    }));
  const diamondCommands = maze.nodes
    .filter((node) => Number(node.diamondValue) !== defaultDiamondValue)
    .map((node) => ({
      row: node.row,
      col: node.col,
      diamondValue: Number(node.diamondValue),
    }));

  const legacyCommands = maze.nodes.flatMap((node) => {
    const commands = [];
    const walls = {};
    if (maze.wallMap[node.id]?.north === WALL_DOWN) {
      walls.north = WALL_DOWN;
    }
    if (maze.wallMap[node.id]?.west === WALL_DOWN) {
      walls.west = WALL_DOWN;
    }
    if (node.col === maze.gridSize - 1 && maze.wallMap[node.id]?.east === WALL_DOWN) {
      walls.east = WALL_DOWN;
    }
    if (node.row === maze.gridSize - 1 && maze.wallMap[node.id]?.south === WALL_DOWN) {
      walls.south = WALL_DOWN;
    }
    if (Object.keys(walls).length) {
      commands.push({
        row: node.row,
        col: node.col,
        walls,
      });
    }
    return commands;
  });

  return {
    format: "maze-warrior-square-layout-v2",
    layout: "editor-square-layout",
    totalLayers: maze.totalLayers,
    gridSize: maze.gridSize,
    totalNodes: maze.nodes.length,
    defaultDiamondValue,
    sourceOfTruth: "wall-segments",
    metadata: {
      name: metadata.name || maze.metadata?.name || "Untitled Layout",
      author: metadata.author || maze.metadata?.author || "",
      notes: metadata.notes ?? maze.metadata?.notes ?? "",
      version: Number(metadata.version || maze.metadata?.version) || 1,
      createdAt: metadata.createdAt || maze.metadata?.createdAt || null,
      updatedAt: metadata.updatedAt || maze.metadata?.updatedAt || null,
    },
    segmentCommands,
    diamondCommands,
    commands: legacyCommands,
  };
}

module.exports = {
  WALL_UP,
  WALL_DOWN,
  coordinateKey,
  normalizeWallState,
  normalizeWallDirection,
  getLayerCoordinates,
  getSegmentIndexForNode,
  getWallSegmentKey,
  parseWallSegmentKey,
  getNodeWallSegmentKeys,
  getSegmentKeyForNodeDirection,
  buildMazeModel,
  rebuildDerivedState,
  setWallSegmentState,
  editWallSegment,
  getMirroredSegmentKeys,
  exportLayoutDefinition,
  validateMazeModel,
};
