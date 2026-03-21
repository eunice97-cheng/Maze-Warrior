"use strict";

const DEFAULT_TOTAL_LAYERS = 10;
const MIN_TOTAL_LAYERS = 4;
const MAX_TOTAL_LAYERS = 20;
const DEFAULT_DIAMOND_VALUE = 1;
const ENTRY_COUNT = 4;
const MAX_PLAYERS = 4;

function clampTotalLayers(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TOTAL_LAYERS;
  }
  return Math.min(MAX_TOTAL_LAYERS, Math.max(MIN_TOTAL_LAYERS, Math.round(numeric)));
}

function getGridSizeForLayers(totalLayers) {
  return clampTotalLayers(totalLayers) * 2 - 1;
}

function getLayerNodeCounts(totalLayers) {
  const safeTotalLayers = clampTotalLayers(totalLayers);
  return Array.from({ length: safeTotalLayers }, (_, index) => (index === 0 ? 1 : index * 8));
}

function getLayerDiamondValues(totalLayers, value = DEFAULT_DIAMOND_VALUE) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_DIAMOND_VALUE;
  return Array.from({ length: clampTotalLayers(totalLayers) }, () => safeValue);
}

function createEditorSettings(input = {}) {
  const totalLayers = clampTotalLayers(input.totalLayers);
  const defaultDiamondValue = Number.isFinite(Number(input.defaultDiamondValue))
    ? Math.max(0, Number(input.defaultDiamondValue))
    : DEFAULT_DIAMOND_VALUE;
  return {
    totalLayers,
    gridSize: getGridSizeForLayers(totalLayers),
    defaultDiamondValue,
    entryCount: ENTRY_COUNT,
    maxPlayers: MAX_PLAYERS,
  };
}

function createEditorRuleSnapshot(totalLayers, value = DEFAULT_DIAMOND_VALUE) {
  const settings = createEditorSettings({
    totalLayers,
    defaultDiamondValue: value,
  });
  return {
    totalLayers: settings.totalLayers,
    gridSize: settings.gridSize,
    entryCount: settings.entryCount,
    maxPlayers: settings.maxPlayers,
    layerNodeCounts: getLayerNodeCounts(settings.totalLayers),
    layerDiamondValues: getLayerDiamondValues(settings.totalLayers, settings.defaultDiamondValue),
  };
}

function createEmptyLayoutDefinition(input = {}) {
  const settings = createEditorSettings(input);
  return {
    totalLayers: settings.totalLayers,
    defaultDiamondValue: settings.defaultDiamondValue,
    commands: [],
  };
}

module.exports = {
  DEFAULT_TOTAL_LAYERS,
  MIN_TOTAL_LAYERS,
  MAX_TOTAL_LAYERS,
  DEFAULT_DIAMOND_VALUE,
  ENTRY_COUNT,
  MAX_PLAYERS,
  clampTotalLayers,
  getGridSizeForLayers,
  getLayerNodeCounts,
  getLayerDiamondValues,
  createEditorSettings,
  createEditorRuleSnapshot,
  createEmptyLayoutDefinition,
};
