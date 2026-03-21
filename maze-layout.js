"use strict";

const WALL_UP = "up";
const WALL_DOWN = "down";

function createLayoutBuilder() {
  const commands = [];

  function setWall(row, col, direction, state = WALL_DOWN) {
    commands.push({
      row,
      col,
      walls: {
        [direction]: state,
      },
    });
  }

  function openBetween(from, to) {
    if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
      throw new Error("openBetween expects [row, col] coordinate pairs.");
    }
    const [fromRow, fromCol] = from;
    const [toRow, toCol] = to;
    const rowDelta = toRow - fromRow;
    const colDelta = toCol - fromCol;
    if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) {
      throw new Error(`Cells ${fromRow}:${fromCol} and ${toRow}:${toCol} are not adjacent.`);
    }
    if (rowDelta === -1) {
      setWall(fromRow, fromCol, "north");
      return;
    }
    if (rowDelta === 1) {
      setWall(fromRow, fromCol, "south");
      return;
    }
    if (colDelta === -1) {
      setWall(fromRow, fromCol, "west");
      return;
    }
    setWall(fromRow, fromCol, "east");
  }

  function openPath(points) {
    for (let index = 0; index < points.length - 1; index += 1) {
      openBetween(points[index], points[index + 1]);
    }
  }

  function getLoopCoordinates(min, max) {
    const coordinates = [];
    for (let col = min; col <= max; col += 1) {
      coordinates.push([min, col]);
    }
    for (let row = min + 1; row <= max; row += 1) {
      coordinates.push([row, max]);
    }
    for (let col = max - 1; col >= min; col -= 1) {
      coordinates.push([max, col]);
    }
    for (let row = max - 1; row > min; row -= 1) {
      coordinates.push([row, min]);
    }
    return coordinates;
  }

  function openLoop(min, max) {
    const loop = getLoopCoordinates(min, max);
    for (let index = 0; index < loop.length; index += 1) {
      const current = loop[index];
      const next = loop[(index + 1) % loop.length];
      openBetween(current, next);
    }
  }

  return {
    commands,
    openPath,
    openLoop,
    setWall,
  };
}

const layout = createLayoutBuilder();

// Visible gate openings on the outer border.
layout.setWall(0, 9, "north");
layout.setWall(9, 18, "east");
layout.setWall(18, 9, "south");
layout.setWall(9, 0, "west");

// North private approach and mirrored side pockets.
layout.openPath([
  [0, 9],
  [1, 9],
  [2, 9],
  [3, 9],
  [4, 9],
]);
layout.openPath([
  [1, 9],
  [1, 8],
  [1, 7],
]);
layout.openPath([
  [1, 9],
  [1, 10],
  [1, 11],
]);
layout.openPath([
  [3, 9],
  [3, 8],
  [3, 7],
]);
layout.openPath([
  [3, 9],
  [3, 10],
  [3, 11],
]);

// East private approach and mirrored side pockets.
layout.openPath([
  [9, 18],
  [9, 17],
  [9, 16],
  [9, 15],
  [9, 14],
]);
layout.openPath([
  [9, 17],
  [8, 17],
  [7, 17],
]);
layout.openPath([
  [9, 17],
  [10, 17],
  [11, 17],
]);
layout.openPath([
  [9, 15],
  [8, 15],
  [7, 15],
]);
layout.openPath([
  [9, 15],
  [10, 15],
  [11, 15],
]);

// South private approach and mirrored side pockets.
layout.openPath([
  [18, 9],
  [17, 9],
  [16, 9],
  [15, 9],
  [14, 9],
]);
layout.openPath([
  [17, 9],
  [17, 8],
  [17, 7],
]);
layout.openPath([
  [17, 9],
  [17, 10],
  [17, 11],
]);
layout.openPath([
  [15, 9],
  [15, 8],
  [15, 7],
]);
layout.openPath([
  [15, 9],
  [15, 10],
  [15, 11],
]);

// West private approach and mirrored side pockets.
layout.openPath([
  [9, 0],
  [9, 1],
  [9, 2],
  [9, 3],
  [9, 4],
]);
layout.openPath([
  [9, 1],
  [8, 1],
  [7, 1],
]);
layout.openPath([
  [9, 1],
  [10, 1],
  [11, 1],
]);
layout.openPath([
  [9, 3],
  [8, 3],
  [7, 3],
]);
layout.openPath([
  [9, 3],
  [10, 3],
  [11, 3],
]);

// Shared contest rings.
layout.openLoop(4, 14);
layout.openLoop(5, 13);
layout.openLoop(6, 12);

// Symmetric connectors from the private lanes into the shared rings.
layout.openPath([
  [4, 9],
  [5, 9],
  [6, 9],
]);
layout.openPath([
  [9, 14],
  [9, 13],
  [9, 12],
]);
layout.openPath([
  [14, 9],
  [13, 9],
  [12, 9],
]);
layout.openPath([
  [9, 4],
  [9, 5],
  [9, 6],
]);

// Final mirrored spokes into the center.
layout.openPath([
  [6, 9],
  [7, 9],
  [8, 9],
  [9, 9],
]);
layout.openPath([
  [9, 12],
  [9, 11],
  [9, 10],
  [9, 9],
]);
layout.openPath([
  [12, 9],
  [11, 9],
  [10, 9],
  [9, 9],
]);
layout.openPath([
  [9, 6],
  [9, 7],
  [9, 8],
  [9, 9],
]);

const MAZE_LAYOUT = {
  defaultDiamondValue: 1,
  commands: layout.commands,
};

module.exports = {
  MAZE_LAYOUT,
  WALL_UP,
  WALL_DOWN,
};
