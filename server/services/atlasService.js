const { MAPS_DB_PATH, ATLAS_SETTINGS_PATH } = require('../config/constants');
const { readJsonFile } = require('../utils/fileUtils');
const { clampNumber } = require('../utils/mathUtils');

const atlasState = {
  mapsState: readJsonFile(MAPS_DB_PATH, []),
  currentSessionEncounter: null,
  atlasSettings: readJsonFile(ATLAS_SETTINGS_PATH, {
    display: {
      resolution: { w: 1920, h: 1080 },
      physical: { diagonal_in: 42, ppi_override: null },
      grid: {
        inches_per_cell: 1,
        pixels_per_inch: 52.45,
        color: '#3aaaff',
        opacity: 0.25,
        line_px: 2
      },
      rotation: 0,
      viewport: {
        fit: 'fit',
        zoom: 1,
        gridZoom: 1,
        offset: { x: 0, y: 0 }
      },
      tokens: {
        showEnemyHealthColors: true
      }
    },
    active_map_id: null,
    encounter: {
      startingAreas: {}
    }
  })
};

function ensureAtlasDefaults() {
  const { atlasSettings } = atlasState;
  atlasSettings.display = atlasSettings.display || {};
  atlasSettings.display.resolution = atlasSettings.display.resolution || { w: 1920, h: 1080 };
  atlasSettings.display.physical = atlasSettings.display.physical || { diagonal_in: 42, ppi_override: null };
  atlasSettings.display.grid = {
    inches_per_cell: 1,
    pixels_per_inch: 52.45,
    color: '#3aaaff',
    opacity: 0.25,
    line_px: 2,
    ...(atlasSettings.display.grid || {})
  };
  atlasSettings.display.rotation = Number(atlasSettings.display.rotation) === 180 ? 180 : 0;
  atlasSettings.display.viewport = {
    fit: 'fit',
    zoom: 1,
    gridZoom: 1,
    offset: { x: 0, y: 0 },
    ...(atlasSettings.display.viewport || {})
  };
  atlasSettings.display.tokens = {
    showEnemyHealthColors: true,
    ...(atlasSettings.display.tokens || {})
  };
  atlasSettings.encounter = atlasSettings.encounter || {};
  atlasSettings.encounter.startingAreas = atlasSettings.encounter.startingAreas || {};
}

function computeStartAreaRect(map, resolution, startArea) {
  if (!map || !map.width_px || !map.height_px) {
    return null;
  }
  const mapWidth = Number(map.width_px) || 0;
  const mapHeight = Number(map.height_px) || 0;
  const displayWidth = Number(resolution?.w) || 1920;
  const displayHeight = Number(resolution?.h) || 1080;
  if (!mapWidth || !mapHeight || !displayWidth || !displayHeight) {
    return null;
  }
  const scaleFactor = Math.min(mapWidth / displayWidth, mapHeight / displayHeight, 1);
  const baseWidth = displayWidth * scaleFactor;
  const baseHeight = displayHeight * scaleFactor;
  const minZoom = 0.25;
  const maxZoom = 4;
  const zoom = clampNumber(startArea?.zoom ?? 1, minZoom, maxZoom);

  let rectWidth = baseWidth / zoom;
  let rectHeight = baseHeight / zoom;
  const fitScale = Math.min(mapWidth / rectWidth, mapHeight / rectHeight, 1);
  rectWidth *= fitScale;
  rectHeight *= fitScale;

  const maxX = Math.max(0, mapWidth - rectWidth);
  const maxY = Math.max(0, mapHeight - rectHeight);
  const rawX = Number(startArea?.x ?? 0);
  const rawY = Number(startArea?.y ?? 0);
  const x = clampNumber(rawX, 0, maxX);
  const y = clampNumber(rawY, 0, maxY);
  return { x, y, width: rectWidth, height: rectHeight, zoom };
}

function computeViewportFromStartArea(map, resolution, rect, gridZoom = 1) {
  if (!map || !rect) {
    return null;
  }
  const mapWidth = Number(map.width_px) || 0;
  const mapHeight = Number(map.height_px) || 0;
  const displayWidth = Number(resolution?.w) || 1920;
  const displayHeight = Number(resolution?.h) || 1080;
  if (!mapWidth || !mapHeight || !displayWidth || !displayHeight) {
    return null;
  }
  const zoomX = displayWidth / rect.width;
  const zoomY = displayHeight / rect.height;
  const computedZoom = Math.min(zoomX, zoomY);
  const zoom = Number((rect.zoom ?? computedZoom).toFixed(4)) || 1;
  const drawWidth = mapWidth * zoom;
  const drawHeight = mapHeight * zoom;
  const offsetX = -((rect.x * zoom) + ((displayWidth - drawWidth) / 2));
  const offsetY = -((rect.y * zoom) + ((displayHeight - drawHeight) / 2));
  return {
    fit: 'pixel',
    zoom,
    gridZoom,
    offset: {
      x: Number(offsetX.toFixed(2)),
      y: Number(offsetY.toFixed(2))
    }
  };
}

function resetDisplayViewport() {
  const { atlasSettings } = atlasState;
  atlasSettings.display = atlasSettings.display || {};
  atlasSettings.display.viewport = atlasSettings.display.viewport || {};
  const viewport = atlasSettings.display.viewport;
  const gridZoom = Number.isFinite(viewport.gridZoom) ? viewport.gridZoom : 1;
  const fit = viewport.fit && viewport.fit !== 'pixel' ? viewport.fit : 'fit';
  atlasSettings.display.viewport = {
    fit,
    zoom: 1,
    gridZoom,
    offset: { x: 0, y: 0 }
  };
}

function applyStartAreaViewport(options = {}) {
  const { atlasSettings, mapsState } = atlasState;
  const { enforce = false } = options;
  const mapId = atlasSettings.active_map_id;
  if (!mapId) {
    if (enforce) {
      resetDisplayViewport();
    }
    return;
  }

  const map = mapsState.find((entry) => entry.id === mapId);
  if (!map || !map.width_px || !map.height_px) {
    if (enforce) {
      resetDisplayViewport();
    }
    return;
  }

  const startAreas = atlasSettings.encounter?.startingAreas || {};
  const startArea = startAreas[mapId];
  const resolution = atlasSettings.display?.resolution || { w: 1920, h: 1080 };

  if (!startArea) {
    if (enforce) {
      resetDisplayViewport();
    }
    return;
  }

  const rect = computeStartAreaRect(map, resolution, startArea);
  if (!rect) {
    if (enforce) {
      resetDisplayViewport();
    }
    return;
  }

  atlasSettings.encounter.startingAreas[mapId] = {
    x: Number(rect.x.toFixed(2)),
    y: Number(rect.y.toFixed(2)),
    zoom: Number((rect.zoom ?? 1).toFixed(2))
  };

  const viewport = computeViewportFromStartArea(map, resolution, rect, atlasSettings.display?.viewport?.gridZoom || 1);
  if (!viewport) {
    return;
  }

  atlasSettings.display.viewport = {
    ...atlasSettings.display.viewport,
    ...viewport
  };
}

module.exports = {
  atlasState,
  ensureAtlasDefaults,
  computeStartAreaRect,
  computeViewportFromStartArea,
  resetDisplayViewport,
  applyStartAreaViewport
};
