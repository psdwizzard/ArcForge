const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const { Server } = require('socket.io');
const { imageSize } = require('image-size');
const crypto = require('crypto');

const app = express();
const displayApp = express();
const PORT = 3000;
const DISPLAY_PORT = 3001;

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MAPS_DIR = path.join(ROOT_DIR, 'maps');
const ENCOUNTERS_DIR = path.join(DATA_DIR, 'encounters');
const DISPLAY_PUBLIC_DIR = path.join(ROOT_DIR, 'public-display');
const MAPS_DB_PATH = path.join(DATA_DIR, 'maps.json');
const ATLAS_SETTINGS_PATH = path.join(DATA_DIR, 'atlas_settings.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(MAPS_DIR, { recursive: true });
fs.mkdirSync(ENCOUNTERS_DIR, { recursive: true });
fs.mkdirSync(DISPLAY_PUBLIC_DIR, { recursive: true });

displayApp.use(express.static(DISPLAY_PUBLIC_DIR));
displayApp.use('/maps', express.static(MAPS_DIR));
displayApp.use('/uploads', express.static(path.join(__dirname, '../uploads')));
displayApp.use('/data/creatures/library', express.static(path.join(__dirname, '../data/creatures/library')));
displayApp.get('*', (req, res) => {
  res.sendFile(path.join(DISPLAY_PUBLIC_DIR, 'index.html'));
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Disable caching for development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Expires', '0');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/db-assets', express.static(path.join(__dirname, '../data/DBs')));
app.use('/data/creatures/library', express.static(path.join(__dirname, '../data/creatures/library')));
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use('/maps', express.static(MAPS_DIR));

const storage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    const targetDir = path.join(__dirname, '../uploads', file.fieldname || 'misc');
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: function filename(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Paths and persistence helpers for Atlas map management

const mapStorage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    cb(null, MAPS_DIR);
  },
  filename: function filename(req, file, cb) {
    const id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname) || '';
    cb(null, `${id}${ext}`);
  }
});

const mapUpload = multer({
  storage: mapStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for high-quality battle maps
});

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`[Atlas] Failed to read JSON file ${filePath}:`, error);
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`[Atlas] Failed to write JSON file ${filePath}:`, error);
  }
}

function generateId(prefix) {
  const base = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  return prefix ? `${prefix}-${base}` : base;
}

// In-memory encounter state
let currentEncounter = {
  combatants: [],
  currentTurnIndex: 0,
  roundNumber: 1,
  encounterId: null,
  combatActive: false  // Track if combat has started
};

// Utility function to save encounter to disk (auto-save)
function autoSaveEncounter() {
  if (currentEncounter.encounterId) {
    // Ensure encounters directory exists
    if (!fs.existsSync(ENCOUNTERS_DIR)) {
      fs.mkdirSync(ENCOUNTERS_DIR, { recursive: true });
    }
    const encounterPath = path.join(ENCOUNTERS_DIR, `${currentEncounter.encounterId}.json`);
    fs.writeFileSync(encounterPath, JSON.stringify(currentEncounter, null, 2));
  }
}

function hydrateCurrentEncounterFromSource(encounter) {
  const previousState = currentEncounter || {
    combatants: [],
    currentTurnIndex: 0,
    roundNumber: 1,
    encounterId: null,
    combatActive: false
  };

  if (!encounter) {
    currentEncounter = {
      combatants: [],
      currentTurnIndex: 0,
      roundNumber: 1,
      encounterId: null,
      combatActive: false
    };
    return;
  }

  let safeEncounter;
  try {
    safeEncounter = JSON.parse(JSON.stringify(encounter));
  } catch (error) {
    console.error('[Encounter] Failed to clone encounter for hydration:', error);
    safeEncounter = encounter;
  }

  const hasCombatants = Array.isArray(safeEncounter.combatants);
  const sourceCombatants = hasCombatants ? safeEncounter.combatants : previousState.combatants;

  const sanitizedCombatants = Array.isArray(sourceCombatants)
    ? sourceCombatants.map((combatant) => {
        if (!combatant || typeof combatant !== 'object') {
          return combatant;
        }
        const copy = { ...combatant };
        copy.hp = combatant.hp ? { ...combatant.hp } : { current: 0, max: 0, temp: 0 };
        copy.deathSaves = combatant.deathSaves ? { ...combatant.deathSaves } : { successes: 0, failures: 0 };
        copy.statusEffects = Array.isArray(combatant.statusEffects)
          ? combatant.statusEffects.map((effect) => (effect && typeof effect === 'object' ? { ...effect } : effect))
          : [];
        return copy;
      })
    : [];

  const hasIndex = Number.isInteger(safeEncounter.currentTurnIndex);
  let currentTurnIndex = hasIndex ? safeEncounter.currentTurnIndex : previousState.currentTurnIndex || 0;

  if (currentTurnIndex < 0) {
    currentTurnIndex = 0;
  }
  if (currentTurnIndex >= sanitizedCombatants.length) {
    currentTurnIndex = sanitizedCombatants.length > 0 ? sanitizedCombatants.length - 1 : 0;
  }

  const hasRound = Number.isInteger(safeEncounter.roundNumber) && safeEncounter.roundNumber > 0;
  const roundNumber = hasRound
    ? safeEncounter.roundNumber
    : (previousState.roundNumber && previousState.roundNumber > 0 ? previousState.roundNumber : 1);

  const encounterId = safeEncounter.encounterId || safeEncounter.id || previousState.encounterId || null;
  const combatActive = Object.prototype.hasOwnProperty.call(safeEncounter, 'combatActive')
    ? Boolean(safeEncounter.combatActive)
    : Boolean(previousState.combatActive);

  currentEncounter = {
    ...previousState,
    ...safeEncounter,
    combatants: sanitizedCombatants,
    currentTurnIndex,
    roundNumber,
    encounterId,
    combatActive
  };
}

function applyEffects(combatant, timing) {
  if (!combatant.statusEffects) return;

  combatant.statusEffects.forEach(effect => {
    if (effect.hpChange && effect.hpTiming === timing) {
      if (effect.hpChange > 0) {
        // Healing
        combatant.hp.current = Math.min(combatant.hp.max, combatant.hp.current + effect.hpChange);
      } else {
        // Damage
        let remainingDamage = Math.abs(effect.hpChange);
        if (combatant.hp.temp > 0) {
          if (combatant.hp.temp >= remainingDamage) {
            combatant.hp.temp -= remainingDamage;
            remainingDamage = 0;
          } else {
            remainingDamage -= combatant.hp.temp;
            combatant.hp.temp = 0;
          }
        }
        combatant.hp.current = Math.max(0, combatant.hp.current - remainingDamage);
      }
    }
  });
}

// Atlas map state
let mapsState = readJsonFile(MAPS_DB_PATH, []);
let currentSessionEncounter = null; // Track current encounter for display
let atlasSettings = readJsonFile(ATLAS_SETTINGS_PATH, {
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
});

function ensureAtlasDefaults() {
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

function clampNumber(value, min, max) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return min;
  }
  return Math.min(Math.max(numberValue, min), max);
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


ensureAtlasDefaults();

applyStartAreaViewport({ enforce: true });

function computePixelsPerInch(resolution, diagonal) {
  if (!resolution || !resolution.w || !resolution.h || !diagonal) {
    return 52.45;
  }

  const pixelDiagonal = Math.sqrt((resolution.w ** 2) + (resolution.h ** 2));
  return Number((pixelDiagonal / diagonal).toFixed(2));
}

function buildDisplayState() {
  const activeMap = mapsState.find((entry) => entry.id === atlasSettings.active_map_id) || null;
  const resolution = atlasSettings.display?.resolution || { w: 1920, h: 1080 };
  const diagonal = atlasSettings.display?.physical?.diagonal_in || 42;
  const ppi = atlasSettings.display?.physical?.ppi_override ?? computePixelsPerInch(resolution, diagonal);
  const inchesPerCell = atlasSettings.display?.grid?.inches_per_cell ?? 1;
  const gridZoom = atlasSettings.display?.viewport?.gridZoom || 1;
  const cellPx = ppi * inchesPerCell * gridZoom;

  // Get visible enemy tokens from current encounter
  const tokens = [];
  const tokensByCombatantId = new Map();
  const tokensByAtlasId = new Map();
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const normalizeImagePath = (value) => {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return trimmed;
    }
    if (trimmed.startsWith('./')) {
      return normalizeImagePath(trimmed.slice(2));
    }
    if (trimmed.startsWith('uploads/')) {
      return `/${trimmed}`;
    }
    if (trimmed.startsWith('data/')) {
      return `/${trimmed}`;
    }
    return `/data/creatures/library/${trimmed}`;
  };
  const enemyTypeSet = new Set(['enemy', 'monster', 'npc', 'e']);
  const combatantsByAtlasId = new Map();
  const combatantsByName = new Map();
  if (currentEncounter?.combatants?.length) {
    currentEncounter.combatants.forEach((combatant) => {
      if (combatant?.atlasTokenId) {
        combatantsByAtlasId.set(combatant.atlasTokenId, combatant);
      }
      if (combatant?.name && !combatantsByName.has(combatant.name)) {
        combatantsByName.set(combatant.name, combatant);
      }
    });
  }

  if (currentSessionEncounter && currentSessionEncounter.placedEnemies) {
    currentSessionEncounter.placedEnemies.forEach((enemy) => {
      if (enemy.placed && enemy.visible !== false && enemy.position) {
        let imagePath = enemy.imagePath
          || enemy.payload?.imagePath
          || enemy.payload?.tokenImage
          || enemy.payload?.portraitImage
          || null;

        if (imagePath && !imagePath.startsWith('/') && !imagePath.startsWith('http')) {
          imagePath = `/data/creatures/library/${imagePath}`;
        }

        const combatantMatch = combatantsByAtlasId.get(enemy.id)
          || (enemy.atlasTokenId ? combatantsByAtlasId.get(enemy.atlasTokenId) : null)
          || (enemy.combatantId ? currentEncounter.combatants.find(c => c.id === enemy.combatantId) : null)
          || combatantsByName.get(enemy.name);

        let hpCurrent = null;
        let hpMax = null;
        let hpTemp = null;

        const stagedHp = enemy.stats?.hp;
        if (stagedHp) {
          if (hpCurrent === null) hpCurrent = toNumber(stagedHp.current);
          if (hpMax === null) hpMax = toNumber(stagedHp.max);
          if (hpTemp === null) hpTemp = toNumber(stagedHp.temp);
        }

        if (hpCurrent === null && enemy.hp !== undefined) {
          hpCurrent = toNumber(enemy.hp);
        }

        if (combatantMatch?.hp) {
          const combatantHp = combatantMatch.hp;
          if (hpCurrent === null) hpCurrent = toNumber(combatantHp.current ?? combatantHp.value ?? combatantHp);
          if (hpMax === null) hpMax = toNumber(combatantHp.max);
          if (hpTemp === null) hpTemp = toNumber(combatantHp.temp);
        }

        if (hpMax === null && stagedHp) {
          hpMax = toNumber(stagedHp.max);
        }

        let hpPercent = null;
        if (hpCurrent !== null && hpMax !== null && hpMax > 0) {
          hpPercent = Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100)));
        } else if (hpCurrent !== null && hpMax === null) {
          hpPercent = null;
        }

        const tokenRecord = {
          id: enemy.id,
          atlasTokenId: enemy.atlasTokenId || enemy.id,
          combatantId: combatantMatch?.id || enemy.combatantId || null,
          name: enemy.name,
          x: enemy.position.x,
          y: enemy.position.y,
          mapId: enemy.position.mapId,
          imagePath,
          isEnemy: true,
          hpCurrent,
          hpMax,
          hpTemp,
          hpPercent,
          isDead: hpCurrent !== null ? hpCurrent <= 0 : false
        };

        tokens.push(tokenRecord);
        if (tokenRecord.combatantId) {
          tokensByCombatantId.set(tokenRecord.combatantId, tokenRecord);
        }
        if (tokenRecord.atlasTokenId) {
          tokensByAtlasId.set(tokenRecord.atlasTokenId, tokenRecord);
        }
      }
    });
  }

  // Get current turn information from combat tracker
  let currentTurn = null;
  if (currentEncounter && currentEncounter.combatActive && currentEncounter.combatants && currentEncounter.combatants.length > 0) {
    const currentCombatant = currentEncounter.combatants[currentEncounter.currentTurnIndex];
    if (currentCombatant) {
      // Check if this combatant has a corresponding placed enemy in the encounter
      const placedEnemy = currentSessionEncounter?.placedEnemies?.find(e =>
        e.name === currentCombatant.name || e.id === currentCombatant.atlasTokenId
      );

      // Only show if the combatant is visible (for enemies on the map, check their visibility)
      const isVisible = placedEnemy ? (placedEnemy.visible !== false) : true;

      const tokenId = placedEnemy?.id || currentCombatant.atlasTokenId || null;

      currentTurn = {
        name: currentCombatant.name,
        visible: isVisible,
        tokenId,
        atlasTokenId: currentCombatant.atlasTokenId || null,
        combatantId: currentCombatant.id
      };
    }
  }

  const initiativeOrder = [];
  if (currentEncounter?.combatants?.length) {
    currentEncounter.combatants.forEach((combatant, index) => {
      const type = (combatant.type || '').toLowerCase();
      const isEnemy = enemyTypeSet.has(type);
      const linkedEnemy = currentSessionEncounter?.placedEnemies?.find((enemy) => {
        if (!enemy) return false;
        if (enemy.combatantId && enemy.combatantId === combatant.id) return true;
        if (combatant.atlasTokenId && (enemy.atlasTokenId === combatant.atlasTokenId || enemy.id === combatant.atlasTokenId)) return true;
        if (enemy.id === combatant.atlasTokenId) return true;
        if (enemy.name && combatant.name && enemy.name === combatant.name) return true;
        return false;
      });
      const tokenMatch = tokensByCombatantId.get(combatant.id)
        || (combatant.atlasTokenId ? tokensByAtlasId.get(combatant.atlasTokenId) : null);

      const isVisible = linkedEnemy ? linkedEnemy.visible !== false : Boolean(tokenMatch || !isEnemy);
      if (!isVisible && isEnemy) {
        return;
      }

      let imagePath = combatant.imagePath
        || combatant.tokenImage
        || combatant.portraitImage
        || linkedEnemy?.imagePath
        || linkedEnemy?.payload?.imagePath
        || linkedEnemy?.payload?.tokenImage
        || linkedEnemy?.payload?.portraitImage
        || tokenMatch?.imagePath
        || null;

      imagePath = normalizeImagePath(imagePath);

      const hpCurrent = toNumber(combatant.hp?.current ?? combatant.hp?.value ?? combatant.hp);
      const hpMax = toNumber(combatant.hp?.max);
      const hpPercent = (hpCurrent !== null && hpMax !== null && hpMax > 0)
        ? Math.max(0, Math.min(100, Math.round((hpCurrent / hpMax) * 100)))
        : null;

      initiativeOrder.push({
        id: combatant.id,
        name: combatant.name,
        type: combatant.type || null,
        imagePath,
        isEnemy,
        isCurrent: Boolean(currentEncounter.combatActive && index === currentEncounter.currentTurnIndex),
        isVisible,
        atlasTokenId: combatant.atlasTokenId || linkedEnemy?.atlasTokenId || linkedEnemy?.id || tokenMatch?.atlasTokenId || null,
        tokenId: linkedEnemy?.id || linkedEnemy?.atlasTokenId || tokenMatch?.id || combatant.atlasTokenId || null,
        hpPercent,
        isDead: hpCurrent !== null ? hpCurrent <= 0 : false,
        order: index
      });
    });
  }

  return {
    type: 'DISPLAY_STATE',
    connected: displayConnectionCount > 0,
    map: activeMap
      ? { url: activeMap.file, name: activeMap.name, w: activeMap.width_px, h: activeMap.height_px }
      : null,
    viewport: {
      w: resolution.w,
      h: resolution.h,
      fit: atlasSettings.display?.viewport?.fit || 'fit',
      zoom: atlasSettings.display?.viewport?.zoom || 1,
      offset: atlasSettings.display?.viewport?.offset || { x: 0, y: 0 }
    },
    grid: {
      enabled: Boolean(atlasSettings.display?.grid?.enabled ?? true),
      cell_px: Number(cellPx.toFixed(2)),
      line_px: atlasSettings.display?.grid?.line_px ?? 2,
      color: atlasSettings.display?.grid?.color ?? '#3aaaff',
      opacity: atlasSettings.display?.grid?.opacity ?? 0.25
    },
    tokens: tokens,
    tokenSettings: {
      showEnemyHealthColors: atlasSettings.display?.tokens?.showEnemyHealthColors !== false
    },
    currentTurn: currentTurn,
    initiativeOrder: initiativeOrder,
    flavorMedia: activeFlavorMedia
  };
}

// Socket.IO setup for display broadcast
const controlServer = http.createServer(app);
const mainIo = new Server(controlServer, {
  cors: {
    origin: '*'
  }
});

const displayServer = http.createServer(displayApp);
const displayIo = new Server(displayServer, {
  cors: {
    origin: '*'
  }
});

let displayConnectionCount = 0;

function broadcastDisplayState() {
  const payload = buildDisplayState();
  mainIo.emit('display:state', payload);
  displayIo.emit('display:state', payload);
}

mainIo.on('connection', (socket) => {
  socket.on('display:hello', (payload) => {
    if (payload && payload.resolution) {
      atlasSettings.display = atlasSettings.display || {};
      atlasSettings.display.resolution = payload.resolution;
      writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
    }
    socket.emit('display:state', buildDisplayState());
  });

  socket.on('settings:ui-scale', (payload) => {
    displayIo.emit('settings:ui-scale', payload);
  });
});

displayIo.on('connection', (socket) => {
  displayConnectionCount += 1;
  socket.on('display:hello', (payload) => {
    if (payload && payload.resolution) {
      atlasSettings.display = atlasSettings.display || {};
      atlasSettings.display.resolution = payload.resolution;
      writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
    }
    socket.emit('display:state', buildDisplayState());
    broadcastDisplayState();
  });
  socket.on('disconnect', () => {
    displayConnectionCount = Math.max(0, displayConnectionCount - 1);
    broadcastDisplayState();
  });
});

// Active flavor media state (shown on player display)
let activeFlavorMedia = null;

// Flavor media upload endpoint (separate from maps)
app.post('/api/flavor-media', mapUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const record = {
      id: generateId('flavor'),
      name: req.body?.name || path.parse(req.file.originalname).name,
      file: `/maps/${req.file.filename}`,
      created_at: new Date().toISOString()
    };

    res.json(record);
  } catch (error) {
    console.error('[FlavorMedia] Failed to process uploaded file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// Show flavor media to players
app.post('/api/atlas/flavor-media/show', (req, res) => {
  const { imagePath } = req.body;

  if (!imagePath) {
    return res.status(400).json({ error: 'imagePath is required' });
  }

  activeFlavorMedia = { imagePath };
  console.log('[FlavorMedia] Showing to players:', imagePath);

  broadcastDisplayState();
  res.json({ success: true, activeFlavorMedia });
});

// Hide flavor media from players
app.post('/api/atlas/flavor-media/hide', (req, res) => {
  console.log('[FlavorMedia] Hiding from players');
  activeFlavorMedia = null;

  broadcastDisplayState();
  res.json({ success: true });
});

// Map management endpoints
app.get('/api/maps', (req, res) => {
  res.json(mapsState);
});

app.post('/api/maps', (req, res) => {
  mapUpload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Atlas] Multer error during map upload:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
      }
      return res.status(500).json({ error: `Upload failed: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const storedPath = path.join(req.file.destination, req.file.filename);
      let dimensions = null;

      // Try to get image dimensions (optional, continue if it fails)
      try {
        dimensions = imageSize(storedPath);
      } catch (dimError) {
        console.warn('[Atlas] Could not determine image size from path:', dimError.message);
        // Image dimensions will remain null
      }

      const record = {
        id: generateId('map'),
        name: req.body?.name || path.parse(req.file.originalname).name,
        file: `/maps/${req.file.filename}`,
        width_px: dimensions?.width ?? null,
        height_px: dimensions?.height ?? null,
        created_at: new Date().toISOString(),
        meta: req.body?.meta || {}
      };

      console.log('[Atlas] Uploading map:', record.name, 'Size:', dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown');

      mapsState.push(record);
      writeJsonFile(MAPS_DB_PATH, mapsState);

      try {
        broadcastDisplayState();
      } catch (broadcastError) {
        console.warn('[Atlas] Failed to broadcast display state after map upload:', broadcastError.message);
      }

      res.json(record);
    } catch (error) {
      console.error('[Atlas] Failed to process uploaded map:', error);
      res.status(500).json({ error: 'Failed to process map' });
    }
  });
});

app.patch('/api/maps/:id', (req, res) => {
  const target = mapsState.find((entry) => entry.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: 'Map not found' });
  }

  if (req.body?.name) {
    target.name = req.body.name;
  }
  if (req.body?.meta) {
    target.meta = {
      ...target.meta,
      ...req.body.meta
    };
  }

  writeJsonFile(MAPS_DB_PATH, mapsState);

  if (atlasSettings.active_map_id === req.params.id) {
    applyStartAreaViewport({ enforce: true });
    writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
    broadcastDisplayState();
  }

  res.json(target);
});

app.delete('/api/maps/:id', (req, res) => {
  const index = mapsState.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Map not found' });
  }

  const [removed] = mapsState.splice(index, 1);
  if (removed && removed.file) {
    try {
      const filesystemPath = path.join(__dirname, '..', removed.file.replace(/^\//, ''));
      if (fs.existsSync(filesystemPath)) {
        fs.unlinkSync(filesystemPath);
      }
    } catch (error) {
      console.error('[Atlas] Failed to delete map file from disk:', error);
    }
  }

  if (atlasSettings.active_map_id === req.params.id) {
    atlasSettings.active_map_id = null;
    applyStartAreaViewport({ enforce: true });
    writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
    broadcastDisplayState();
  }

  writeJsonFile(MAPS_DB_PATH, mapsState);
  res.json({ success: true });
});

app.get('/api/atlas/settings', (req, res) => {
  res.json(atlasSettings);
});

app.patch('/api/atlas/settings', (req, res) => {
  // Deep merge for nested objects like display.viewport.offset
  function deepMerge(target, source) {
    const output = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        output[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
    return output;
  }

  atlasSettings = deepMerge(atlasSettings, req.body);

  ensureAtlasDefaults();

  // Only apply start area viewport if encounter settings changed
  // Don't apply if we're just updating viewport settings (offset, zoom, gridZoom, etc.)
  const isViewportOnlyUpdate = req.body?.display?.viewport && !req.body?.encounter && !req.body?.display?.grid && !req.body?.display?.resolution;

  console.log('[PATCH /api/atlas/settings] Request body:', JSON.stringify(req.body, null, 2));
  console.log('[PATCH /api/atlas/settings] isViewportOnlyUpdate:', isViewportOnlyUpdate);
  console.log('[PATCH /api/atlas/settings] Current viewport.zoom:', atlasSettings.display?.viewport?.zoom);

  if (req.body?.encounter) {
    console.log('[PATCH /api/atlas/settings] Applying start area viewport (encounter changed)');
    applyStartAreaViewport({ enforce: true });
  } else if (!isViewportOnlyUpdate) {
    console.log('[PATCH /api/atlas/settings] Applying start area viewport (not viewport-only update)');
    applyStartAreaViewport();
  } else {
    console.log('[PATCH /api/atlas/settings] Skipping start area viewport (viewport-only update)');
  }

  if (!atlasSettings.display?.physical?.ppi_override) {
    const computed = computePixelsPerInch(
      atlasSettings.display?.resolution,
      atlasSettings.display?.physical?.diagonal_in
    );
    atlasSettings.display.physical.ppi_override = null;
    atlasSettings.display.grid = atlasSettings.display.grid || {};
    atlasSettings.display.grid.pixels_per_inch = computed;
  }

  writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
  broadcastDisplayState();
  res.json(atlasSettings);
});

app.post('/api/atlas/active-map', (req, res) => {
  const { mapId } = req.body || {};
  if (!mapId) {
    return res.status(400).json({ error: 'mapId is required' });
  }

  const target = mapsState.find((entry) => entry.id === mapId);
  if (!target) {
    return res.status(404).json({ error: 'Map not found' });
  }

  atlasSettings.active_map_id = mapId;
  applyStartAreaViewport({ enforce: true });
  writeJsonFile(ATLAS_SETTINGS_PATH, atlasSettings);
  broadcastDisplayState();

  res.json({ success: true });
});

// Routes

// Get current encounter state
app.get('/api/encounter', (req, res) => {
  res.json(currentEncounter);
});

// Add combatant
app.post('/api/combatants', (req, res) => {
  try {
    console.log('[API] POST /api/combatants', {
      name: req.body?.name,
      type: req.body?.type,
      atlasTokenId: req.body?.atlasTokenId,
      sourceId: req.body?.sourceId
    });
  } catch (e) { /* no-op */ }
  const { name, type = 'monster', sourceId = null } = req.body;
  const normalizedType = (type || 'monster').toLowerCase();
  const enemyTypes = ['enemy', 'monster', 'e'];
  const baseName = (name || 'Enemy').split(' - ')[0];

  let finalName = name || 'Enemy';
  if (enemyTypes.includes(normalizedType)) {
    const existingCount = currentEncounter.combatants.filter(c => {
      const combatantType = (c.type || '').toLowerCase();
      if (!enemyTypes.includes(combatantType)) {
        return false;
      }

      const combatantBase = (c.name || '').split(' - ')[0];
      return combatantBase === baseName;
    }).length;

    finalName = `${baseName} - ${String(existingCount + 1).padStart(2, '0')}`;
  }

  const dexModifier = req.body.dexModifier || 0;
  let initiativeValue = req.body.initiative;
  if (initiativeValue === undefined || initiativeValue === null || initiativeValue === '') {
    if (enemyTypes.includes(normalizedType)) {
      const roll = Math.floor(Math.random() * 20) + 1;
      initiativeValue = roll + dexModifier;
    } else {
      initiativeValue = 0;
    }
  }

  const combatant = {
    id: `combatant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: finalName,
    type: req.body.type || 'monster',
    initiative: initiativeValue,
    dexModifier,
    imagePath: req.body.imagePath || null,
    sourceId,
    atlasTokenId: req.body.atlasTokenId || null,
    hp: {
      current: req.body.hp || 10,
      max: req.body.hp || 10,
      temp: 0
    },
    ac: req.body.ac || 10,
    statusEffects: [],
    deathSaves: {
      successes: 0,
      failures: 0
    },
    loot: req.body.loot || [],
    attacks: req.body.attacks || [],
    specialAbilities: req.body.specialAbilities || []
  };

  currentEncounter.combatants.push(combatant);

  // Sort by initiative (descending), then by DEX modifier (descending) for ties
  currentEncounter.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return b.dexModifier - a.dexModifier;
  });

  autoSaveEncounter();
  try {
    console.log('[API] Added combatant:', { id: combatant.id, name: combatant.name, type: combatant.type, initiative: combatant.initiative });
  } catch (e) { /* no-op */ }
  res.json(combatant);
});

// Update combatant
app.put('/api/combatants/:id', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  // Update combatant with provided fields
  currentEncounter.combatants[combatantIndex] = {
    ...currentEncounter.combatants[combatantIndex],
    ...req.body
  };

  autoSaveEncounter();
  res.json(currentEncounter.combatants[combatantIndex]);
});

// Delete combatant
app.delete('/api/combatants/:id', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  currentEncounter.combatants.splice(combatantIndex, 1);

  // Adjust current turn index if necessary
  if (currentEncounter.currentTurnIndex >= currentEncounter.combatants.length) {
    currentEncounter.currentTurnIndex = 0;
  }

  autoSaveEncounter();
  res.json({ message: 'Combatant removed' });
});

// Roll initiative for a combatant
app.post('/api/initiative/roll', (req, res) => {
  const { combatantId, dexModifier } = req.body;
  const roll = Math.floor(Math.random() * 20) + 1;
      const initiative = roll + (dexModifier || 0);

  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === combatantId);

  if (combatantIndex !== -1) {
    currentEncounter.combatants[combatantIndex].initiative = initiative;
    currentEncounter.combatants[combatantIndex].dexModifier = dexModifier || 0;

    // Re-sort combatants
    currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return b.dexModifier - a.dexModifier;
    });

    autoSaveEncounter();
  }

  res.json({ roll, initiative });
});

// Roll initiative for all enemies
app.post('/api/initiative/roll-enemies', (req, res) => {
  currentEncounter.combatants = currentEncounter.combatants.map(combatant => {
    const normalizedType = (combatant.type || '').toLowerCase();
    if (['enemy', 'monster', 'e'].includes(normalizedType)) {
      const roll = Math.floor(Math.random() * 20) + 1;
      combatant.initiative = roll + (combatant.dexModifier || 0);
    }
    return combatant;
  });

  currentEncounter.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return (b.dexModifier || 0) - (a.dexModifier || 0);
  });

  autoSaveEncounter();
  res.json(currentEncounter);
});

// Reorder initiative (for drag-and-drop)
app.post('/api/initiative/reorder', (req, res) => {
  const { combatantIds } = req.body;

  // Reorder combatants array based on provided order
  const reordered = combatantIds.map(id =>
    currentEncounter.combatants.find(c => c.id === id)
  ).filter(c => c); // Filter out any undefined values

  currentEncounter.combatants = reordered;
  autoSaveEncounter();

  res.json({ message: 'Initiative reordered' });
});

// Modify HP (damage or healing)
app.post('/api/combatants/:id/hp', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const { amount, type } = req.body; // type: 'damage' or 'heal'

  if (type === 'damage') {
    // Apply damage to temp HP first, then regular HP
    let remainingDamage = amount;

    if (combatant.hp.temp > 0) {
      if (combatant.hp.temp >= remainingDamage) {
        combatant.hp.temp -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= combatant.hp.temp;
        combatant.hp.temp = 0;
      }
    }

    combatant.hp.current = Math.max(0, combatant.hp.current - remainingDamage);
  } else if (type === 'heal') {
    combatant.hp.current = Math.min(combatant.hp.max, combatant.hp.current + amount);

    // Reset death saves if healed from 0 HP
    if (combatant.hp.current > 0) {
      combatant.deathSaves.successes = 0;
      combatant.deathSaves.failures = 0;
    }
  }

  autoSaveEncounter();
  res.json(combatant);
});

// Set temporary HP
app.post('/api/combatants/:id/temp-hp', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const { amount } = req.body;

  // Temp HP doesn't stack - take the higher value
  combatant.hp.temp = Math.max(combatant.hp.temp, amount);

  autoSaveEncounter();
  res.json(combatant);
});

// Add status effect
app.post('/api/combatants/:id/status-effects', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const effect = req.body;

  combatant.statusEffects.push(effect);

  autoSaveEncounter();
  res.json(combatant);
});

// Remove status effect
app.delete('/api/combatants/:id/status-effects/:index', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const effectIndex = parseInt(req.params.index);

  if (effectIndex >= 0 && effectIndex < combatant.statusEffects.length) {
    combatant.statusEffects.splice(effectIndex, 1);
  }

  autoSaveEncounter();
  res.json(combatant);
});

// Update death saves
app.post('/api/combatants/:id/death-saves', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const { successes, failures } = req.body;

  if (successes !== undefined) {
    combatant.deathSaves.successes = Math.max(0, Math.min(3, successes));
  }

  if (failures !== undefined) {
    combatant.deathSaves.failures = Math.max(0, Math.min(3, failures));
  }

  // Check for stabilization or death
  if (combatant.deathSaves.successes >= 3) {
    // Stabilized - set to 1 HP
    combatant.hp.current = 1;
    combatant.deathSaves.successes = 0;
    combatant.deathSaves.failures = 0;
  }

  autoSaveEncounter();
  res.json(combatant);
});

// Roll death save
app.post('/api/combatants/:id/death-saves/roll', (req, res) => {
  const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

  if (combatantIndex === -1) {
    return res.status(404).json({ error: 'Combatant not found' });
  }

  const combatant = currentEncounter.combatants[combatantIndex];
  const roll = Math.floor(Math.random() * 20) + 1;

  let result = '';

  if (roll === 1) {
    // Natural 1 = 2 failures
    combatant.deathSaves.failures = Math.min(3, combatant.deathSaves.failures + 2);
    result = 'Critical Failure! 2 failures added.';
  } else if (roll === 20) {
    // Natural 20 = regain 1 HP
    combatant.hp.current = 1;
    combatant.deathSaves.successes = 0;
    combatant.deathSaves.failures = 0;
    result = 'Critical Success! Regained 1 HP.';
  } else if (roll >= 10) {
    combatant.deathSaves.successes = Math.min(3, combatant.deathSaves.successes + 1);
    result = 'Success!';
  } else {
    combatant.deathSaves.failures = Math.min(3, combatant.deathSaves.failures + 1);
    result = 'Failure!';
  }

  // Check for stabilization
  if (combatant.deathSaves.successes >= 3) {
    combatant.hp.current = 1;
    combatant.deathSaves.successes = 0;
    combatant.deathSaves.failures = 0;
    result += ' Stabilized at 1 HP.';
  }

  autoSaveEncounter();
  res.json({ roll, result, combatant });
});

// Set initiative for a combatant
app.post('/api/combatants/:id/initiative', (req, res) => {
    const combatantIndex = currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
        return res.status(404).json({ error: 'Combatant not found' });
    }

    const { initiative } = req.body;
    currentEncounter.combatants[combatantIndex].initiative = parseInt(initiative) || 0;

    // Re-sort combatants by initiative
    currentEncounter.combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) {
            return b.initiative - a.initiative;
        }
        return b.dexModifier - a.dexModifier;
    });

    autoSaveEncounter();
    res.json(currentEncounter);
});

// Start combat - roll initiative for all and begin
app.post('/api/combat/start', (req, res) => {
  console.log('[start-combat] Endpoint called, current combatants:', currentEncounter.combatants.length);
  if (currentEncounter.combatants.length === 0) {
    console.log('[start-combat] ERROR: No combatants');
    return res.status(400).json({ error: 'No agents to start combat with' });
  }

  // Roll initiative for combatants that don't have it set
  currentEncounter.combatants.forEach(combatant => {
    if (!combatant.initiative) {
        const roll = Math.floor(Math.random() * 20) + 1;
        combatant.initiative = roll + combatant.dexModifier;
    }
  });

  // Sort by initiative (descending), then by DEX modifier (descending) for ties
  currentEncounter.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return b.dexModifier - a.dexModifier;
  });

  currentEncounter.combatActive = true;
  currentEncounter.currentTurnIndex = 0;
  currentEncounter.roundNumber = 1;

  if (!currentEncounter.encounterId) {
    currentEncounter.encounterId = `encounter-${Date.now()}`;
  }

  autoSaveEncounter();
  broadcastDisplayState();
  res.json(currentEncounter);
});

// End combat
app.post('/api/combat/end', (req, res) => {
  currentEncounter.combatActive = false;
  autoSaveEncounter();
  broadcastDisplayState();
  res.json(currentEncounter);
});

// Next turn
app.post('/api/combat/next-turn', (req, res) => {
  console.log('[next-turn] Called, current state:', {
    combatantsCount: currentEncounter.combatants.length,
    currentTurnIndex: currentEncounter.currentTurnIndex,
    roundNumber: currentEncounter.roundNumber,
    combatActive: currentEncounter.combatActive
  });

  if (currentEncounter.combatants.length === 0) {
    console.log('[next-turn] ERROR: No combatants');
    return res.status(400).json({ error: 'No combatants in encounter' });
  }

  if (!currentEncounter.combatActive) {
    console.log('[next-turn] ERROR: Combat not active');
    return res.status(400).json({ error: 'Combat has not started' });
  }

  // Apply end-of-turn effects for the current combatant
  const currentCombatant = currentEncounter.combatants[currentEncounter.currentTurnIndex];
  console.log('[next-turn] Applying end-of-turn effects for:', currentCombatant.name);
  applyEffects(currentCombatant, 'end');

  currentEncounter.currentTurnIndex++;

  // If we've gone through all combatants, start new round
  if (currentEncounter.currentTurnIndex >= currentEncounter.combatants.length) {
    currentEncounter.currentTurnIndex = 0;
    currentEncounter.roundNumber++;
    console.log('[next-turn] New round:', currentEncounter.roundNumber);

    // Decrement status effect durations
    currentEncounter.combatants.forEach(combatant => {
      combatant.statusEffects = combatant.statusEffects
        .map(effect => ({
          ...effect,
          duration: effect.duration - 1
        }))
        .filter(effect => effect.duration > 0);
    });
  }

  // Apply start-of-turn effects for the new combatant
  const nextCombatant = currentEncounter.combatants[currentEncounter.currentTurnIndex];
  console.log('[next-turn] Applying start-of-turn effects for:', nextCombatant.name);
  applyEffects(nextCombatant, 'start');

  console.log('[next-turn] Returning state with', currentEncounter.combatants.length, 'combatants');
  autoSaveEncounter();
  broadcastDisplayState();
  res.json(currentEncounter);
});

// New encounter
app.post('/api/encounter/new', (req, res) => {
  currentEncounter = {
    combatants: [],
    currentTurnIndex: 0,
    roundNumber: 1,
    encounterId: `encounter-${Date.now()}`,
    combatActive: false
  };

  autoSaveEncounter();
  res.json(currentEncounter);
});

// Load encounter
app.get('/api/encounter/:id', (req, res) => {
  const encounterPath = path.join(__dirname, '../data/encounters', `${req.params.id}.json`);

  if (!fs.existsSync(encounterPath)) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  const fileEncounter = JSON.parse(fs.readFileSync(encounterPath, 'utf8'));
  hydrateCurrentEncounterFromSource(fileEncounter);
  res.json(currentEncounter);
});

// Upload character image
app.post('/api/uploads/characters', upload.single('characterImage'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const relativePath = `/uploads/${req.file.fieldname || 'characters'}/${req.file.filename}`;
  res.json({
    filename: req.file.filename,
    path: relativePath,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// List saved encounters
app.get('/api/encounters', (req, res) => {
  const encountersDir = path.join(__dirname, '../data/encounters');

  if (!fs.existsSync(encountersDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(encountersDir);
  const encounters = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(encountersDir, f), 'utf8'));
      return {
        id: data.encounterId,
        name: f.replace('.json', ''),
        combatantCount: data.combatants.length,
        roundNumber: data.roundNumber
      };
    });

  res.json(encounters);
});

// Get creature templates
app.get('/api/creatures', (req, res) => {
  const creaturesDir = path.join(__dirname, '../data/creatures');

  if (!fs.existsSync(creaturesDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(creaturesDir);
  const creatures = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(creaturesDir, f), 'utf8'));
      return data;
    });

  res.json(creatures);
});

// Character management endpoints

// Get all characters
app.get('/api/characters', (req, res) => {
  const charactersDir = path.join(__dirname, '../data/characters');

  console.log(`[API] GET /api/characters from ${req.ip}`);
  console.log(`[API] Characters directory: ${charactersDir}`);

  // Create directory if it doesn't exist
  if (!fs.existsSync(charactersDir)) {
    console.log('[API] Characters directory does not exist, creating...');
    fs.mkdirSync(charactersDir, { recursive: true });
    return res.json([]);
  }

  const files = fs.readdirSync(charactersDir);
  console.log(`[API] Found ${files.length} files in characters directory:`, files);
  
  const characters = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(charactersDir, f), 'utf8'));
      return data;
    });

  console.log(`[API] Returning ${characters.length} characters`);
  res.json(characters);
});

// Get single character
app.get('/api/characters/:id', (req, res) => {
  const characterPath = path.join(__dirname, '../data/characters', `${req.params.id}.json`);

  if (!fs.existsSync(characterPath)) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const character = JSON.parse(fs.readFileSync(characterPath, 'utf8'));
  res.json(character);
});

// Create or update character
app.post('/api/characters', (req, res) => {
  const charactersDir = path.join(__dirname, '../data/characters');

  // Create directory if it doesn't exist
  if (!fs.existsSync(charactersDir)) {
    fs.mkdirSync(charactersDir, { recursive: true });
  }

  const character = req.body;

  // Ensure character has an ID
  if (!character.id) {
    character.id = `char-${Date.now()}`;
  }

  const characterPath = path.join(charactersDir, `${character.id}.json`);
  fs.writeFileSync(characterPath, JSON.stringify(character, null, 2));

  res.json(character);
});

// Delete character
app.delete('/api/characters/:id', (req, res) => {
  const characterPath = path.join(__dirname, '../data/characters', `${req.params.id}.json`);

  if (!fs.existsSync(characterPath)) {
    return res.status(404).json({ error: 'Character not found' });
  }

  fs.unlinkSync(characterPath);
  res.json({ message: 'Character deleted' });
});

// Effects management endpoints

// Get all effects
app.get('/api/effects', (req, res) => {
  const effectsDir = path.join(__dirname, '../data/effects');

  // Create directory if it doesn't exist
  if (!fs.existsSync(effectsDir)) {
    fs.mkdirSync(effectsDir, { recursive: true });
    return res.json([]);
  }

  const files = fs.readdirSync(effectsDir);
  const effects = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(effectsDir, f), 'utf8'));
      return data;
    });

  res.json(effects);
});

// Get single effect
app.get('/api/effects/:id', (req, res) => {
  const effectPath = path.join(__dirname, '../data/effects', `${req.params.id}.json`);

  if (!fs.existsSync(effectPath)) {
    return res.status(404).json({ error: 'Effect not found' });
  }

  const effect = JSON.parse(fs.readFileSync(effectPath, 'utf8'));
  res.json(effect);
});

// Create or update effect
app.post('/api/effects', (req, res) => {
  const effectsDir = path.join(__dirname, '../data/effects');

  // Create directory if it doesn't exist
  if (!fs.existsSync(effectsDir)) {
    fs.mkdirSync(effectsDir, { recursive: true });
  }

  const effect = req.body;

  // Ensure effect has an ID
  if (!effect.id) {
    effect.id = `effect-${Date.now()}`;
  }

  const effectPath = path.join(effectsDir, `${effect.id}.json`);
  fs.writeFileSync(effectPath, JSON.stringify(effect, null, 2));

  res.json(effect);
});

// Delete effect
app.delete('/api/effects/:id', (req, res) => {
  const effectPath = path.join(__dirname, '../data/effects', `${req.params.id}.json`);

  if (!fs.existsSync(effectPath)) {
    return res.status(404).json({ error: 'Effect not found' });
  }

  fs.unlinkSync(effectPath);
  res.json({ message: 'Effect deleted' });
});

// Save all data
app.post('/api/save', (req, res) => {
    const dataPath = path.join(__dirname, '../data/data.json');
    fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2));
    res.json({ message: 'Data saved successfully' });
});

// Load all data
app.get('/api/load', (req, res) => {
    const dataPath = path.join(__dirname, '../data/data.json');
    if (fs.existsSync(dataPath)) {
        const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        res.json(data);
    } else {
        res.status(404).json({ error: 'No saved data found' });
    }
});

// Session management endpoints

const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Get all sessions
app.get('/api/sessions', (req, res) => {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return res.json([]);
  }

  const files = fs.readdirSync(SESSIONS_DIR);
  const sessions = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
      return data;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(sessions);
});

// Get single session
app.get('/api/sessions/:id', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.id}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  res.json(session);
});

// Create or update session
app.post('/api/sessions', (req, res) => {
  const session = req.body;

  if (!session.id) {
    session.id = `session-${Date.now()}`;
  }

  if (!session.createdAt) {
    session.createdAt = new Date().toISOString();
  }

  if (!session.encounters) {
    session.encounters = [];
  }

  const sessionPath = path.join(SESSIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  res.json(session);
});

// Delete session
app.delete('/api/sessions/:id', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.id}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  fs.unlinkSync(sessionPath);
  res.json({ message: 'Session deleted' });
});

// Create encounter in session
app.post('/api/sessions/:sessionId/encounters', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.sessionId}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const encounter = req.body;

  if (!encounter.id) {
    encounter.id = `encounter-${Date.now()}`;
  }

  if (!encounter.createdAt) {
    encounter.createdAt = new Date().toISOString();
  }

  if (!session.encounters) {
    session.encounters = [];
  }

  session.encounters.push(encounter);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  // Hydrate server in-memory state to this newly created encounter so
  // Atlas placements can immediately add to Arena without requiring a load call.
  try {
    currentSessionEncounter = encounter;
    hydrateCurrentEncounterFromSource(encounter);
    broadcastDisplayState();
  } catch (e) {
    console.warn('[Sessions] Failed to hydrate new encounter into server state:', e);
  }

  res.json(encounter);
});

// Get encounter from session
app.get('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.sessionId}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const encounter = session.encounters?.find(e => e.id === req.params.encounterId);

  if (!encounter) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  // Update the current session encounter for display
  currentSessionEncounter = encounter;
  hydrateCurrentEncounterFromSource(encounter);
  broadcastDisplayState();

  res.json(encounter);
});

// Update encounter in session
app.put('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.sessionId}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const encounterIndex = session.encounters?.findIndex(e => e.id === req.params.encounterId);

  if (encounterIndex === -1 || encounterIndex === undefined) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  // Merge incoming payload
  const mergedEncounter = {
    ...session.encounters[encounterIndex],
    ...req.body
  };

  // Ensure arrays exist
  mergedEncounter.combatants = Array.isArray(mergedEncounter.combatants) ? mergedEncounter.combatants : [];

  // As a safety net, auto-create Arena combatants for any placed Atlas enemies
  // that haven't been linked/added yet. This covers fresh sessions where
  // placement happened before Arena was hydrated or the client call failed.
  try {
    const placedEnemies = Array.isArray(mergedEncounter.placedEnemies) ? mergedEncounter.placedEnemies : [];
    const enemyTypeSet = new Set(['enemy', 'monster', 'npc', 'e', 'n']);

    const findImagePath = (enemy) => {
      let imagePath = enemy.imagePath
        || enemy.payload?.imagePath
        || enemy.payload?.tokenImage
        || enemy.payload?.portraitImage
        || null;
      if (imagePath && !String(imagePath).startsWith('/') && !String(imagePath).startsWith('http')) {
        imagePath = `/data/creatures/library/${imagePath}`;
      }
      return imagePath;
    };

    const coerceNumber = (val, fallback = null) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : fallback;
    };

    placedEnemies.forEach((enemy) => {
      if (!enemy || enemy.placed !== true) return;

      // Skip if a matching combatant already exists
      const exists = mergedEncounter.combatants.find((c) => (
        (enemy.combatantId && c.id === enemy.combatantId)
        || (enemy.id && c.atlasTokenId === enemy.id)
      ));
      if (exists) {
        // Ensure atlasTokenId linkage
        if (enemy.id && !exists.atlasTokenId) {
          exists.atlasTokenId = enemy.id;
        }
        return;
      }

      // Build a minimal combatant record
      const baseName = String((enemy.name || 'Enemy')).split(' - ')[0].trim();
      // Count existing enemies with same base name for auto-numbering
      const existingCount = mergedEncounter.combatants.filter((c) => {
        const t = (c.type || '').toLowerCase();
        if (!enemyTypeSet.has(t)) return false;
        const cBase = String(c.name || '').split(' - ')[0].trim();
        return cBase === baseName;
      }).length;
      const finalName = `${baseName} - ${String(existingCount + 1).padStart(2, '0')}`;

      const hpFromStats = enemy.stats?.hp;
      const hpCurrent = typeof hpFromStats === 'object'
        ? coerceNumber(hpFromStats?.current ?? hpFromStats?.max, null)
        : coerceNumber(enemy.hp, null);
      const hpMax = typeof hpFromStats === 'object'
        ? coerceNumber(hpFromStats?.max, null)
        : coerceNumber(enemy.hp, null);
      const acValue = coerceNumber(enemy.stats?.ac ?? enemy.ac, 10);
      const dexMod = coerceNumber(enemy.stats?.dexModifier, 0);
      const imagePath = findImagePath(enemy);

      const combatant = {
        id: `combatant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: finalName,
        type: 'enemy',
        initiative: 0,
        dexModifier: dexMod || 0,
        imagePath: imagePath || null,
        sourceId: enemy.source === 'library' ? (enemy.payload?.id || null) : null,
        atlasTokenId: enemy.id || enemy.atlasTokenId || null,
        hp: {
          current: hpCurrent ?? 10,
          max: hpMax ?? 10,
          temp: 0
        },
        ac: acValue,
        statusEffects: [],
        deathSaves: { successes: 0, failures: 0 },
        loot: [],
        attacks: [],
        specialAbilities: []
      };

      mergedEncounter.combatants.push(combatant);
    });

    // Prune Arena combatants that no longer have a placed token
    const placedAtlasIds = new Set(
      placedEnemies.filter(e => e && e.placed && e.position && (e.id || e.atlasTokenId)).map(e => e.id || e.atlasTokenId)
    );
    mergedEncounter.combatants = mergedEncounter.combatants.filter((c) => {
      const t = (c.type || '').toLowerCase();
      if (!enemyTypeSet.has(t)) {
        return true; // keep non-enemy (e.g., PCs)
      }
      if (!c.atlasTokenId) {
        return true; // keep enemies not linked to map token
      }
      return placedAtlasIds.has(c.atlasTokenId);
    });
  } catch (syncErr) {
    console.warn('[Sessions] Failed to auto-sync placed enemies into combatants:', syncErr);
  }

  session.encounters[encounterIndex] = mergedEncounter;

  // Update the current session encounter for display
  currentSessionEncounter = session.encounters[encounterIndex];
  hydrateCurrentEncounterFromSource(currentSessionEncounter);

  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  // Broadcast updated display state with new enemy positions
  broadcastDisplayState();

  res.json(session.encounters[encounterIndex]);
});

// Delete encounter from session
app.delete('/api/sessions/:sessionId/encounters/:encounterId', (req, res) => {
  const sessionPath = path.join(SESSIONS_DIR, `${req.params.sessionId}.json`);

  if (!fs.existsSync(sessionPath)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  const encounterIndex = session.encounters?.findIndex(e => e.id === req.params.encounterId);

  if (encounterIndex === -1 || encounterIndex === undefined) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  session.encounters.splice(encounterIndex, 1);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  res.json({ message: 'Encounter deleted' });
});

// Dev restart endpoint
app.post('/api/dev/restart', (req, res) => {
  console.log('[DEV] Restart requested');
  res.json({ message: 'Server restarting...' });

  setTimeout(() => {
    console.log('[DEV] Shutting down...');
    process.exit(0);
  }, 500);
});

app.get('/api/atlas/displays', (req, res) => {
  const sockets = Array.from(displayIo.sockets.sockets.values()).map((socket) => ({
    id: socket.id,
    handshake: {
      address: socket.handshake.address,
      issued: socket.handshake.issued
    }
  }));
  res.json({ count: sockets.length, displays: sockets });
});

// Create a default session if none exist
function createDefaultSession() {
  if (!fs.existsSync(SESSIONS_DIR) || fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).length === 0) {
    console.log('[Server] No sessions found. Creating a default session.');
    const defaultSession = {
      id: `session-${Date.now()}`,
      name: 'Welcome to ArcForge!',
      description: 'This is your first session. Create an encounter to get started.',
      createdAt: new Date().toISOString(),
      encounters: []
    };
    const sessionPath = path.join(SESSIONS_DIR, `${defaultSession.id}.json`);
    fs.writeFileSync(sessionPath, JSON.stringify(defaultSession, null, 2));
  }
}

// Start server
controlServer.listen(PORT, () => {
  const address = `http://${process.env.HOSTNAME || 'localhost'}:${PORT}`;
  console.log(`ArcForge control server listening on ${address}`);
  createDefaultSession();
});

displayServer.listen(DISPLAY_PORT, () => {
  console.log(`ArcForge display server listening on port ${DISPLAY_PORT}`);
});


