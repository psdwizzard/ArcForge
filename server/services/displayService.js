const { atlasState } = require('./atlasService');
const { encounterState, getConditionSeverity } = require('./encounterService');
const { computePixelsPerInch } = require('../utils/mathUtils');

const displayState = {
  displayConnectionCount: 0,
  activeFlavorMedia: null
};

function buildDisplayState() {
  const activeMap = atlasState.mapsState.find((entry) => entry.id === atlasState.atlasSettings.active_map_id) || null;
  const resolution = atlasState.atlasSettings.display?.resolution || { w: 1920, h: 1080 };
  const diagonal = atlasState.atlasSettings.display?.physical?.diagonal_in || 42;
  const ppi = atlasState.atlasSettings.display?.physical?.ppi_override ?? computePixelsPerInch(resolution, diagonal);
  const inchesPerCell = atlasState.atlasSettings.display?.grid?.inches_per_cell ?? 1;
  const gridZoom = atlasState.atlasSettings.display?.viewport?.gridZoom || 1;
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
  if (encounterState.currentEncounter?.combatants?.length) {
    encounterState.currentEncounter.combatants.forEach((combatant) => {
      if (combatant?.atlasTokenId) {
        combatantsByAtlasId.set(combatant.atlasTokenId, combatant);
      }
      if (combatant?.name && !combatantsByName.has(combatant.name)) {
        combatantsByName.set(combatant.name, combatant);
      }
    });
  }

  if (atlasState.currentSessionEncounter && atlasState.currentSessionEncounter.placedEnemies) {
    atlasState.currentSessionEncounter.placedEnemies.forEach((enemy) => {
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
          || (enemy.combatantId ? encounterState.currentEncounter.combatants.find(c => c.id === enemy.combatantId) : null)
          || combatantsByName.get(enemy.name);

        // M&M 3E: Use condition severity instead of HP for token status
        const conditions = combatantMatch?.conditions || null;
        const severity = conditions ? getConditionSeverity(conditions) : 0;
        const isIncapacitated = conditions ? Boolean(conditions.incapacitated || conditions.dying) : false;

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
          // M&M 3E condition-based status (replaces HP)
          conditionSeverity: severity,  // 0=clean, 1=bruised, 2=dazed/staggered, 3=incapacitated
          bruisedCount: conditions?.bruised || 0,
          isIncapacitated,
          isDead: isIncapacitated
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
  if (encounterState.currentEncounter && encounterState.currentEncounter.combatActive && encounterState.currentEncounter.combatants && encounterState.currentEncounter.combatants.length > 0) {
    const currentCombatant = encounterState.currentEncounter.combatants[encounterState.currentEncounter.currentTurnIndex];
    if (currentCombatant) {
      const placedEnemy = atlasState.currentSessionEncounter?.placedEnemies?.find(e =>
        e.name === currentCombatant.name || e.id === currentCombatant.atlasTokenId
      );
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
  if (encounterState.currentEncounter?.combatants?.length) {
    encounterState.currentEncounter.combatants.forEach((combatant, index) => {
      const type = (combatant.type || '').toLowerCase();
      const isEnemy = enemyTypeSet.has(type);
      const linkedEnemy = atlasState.currentSessionEncounter?.placedEnemies?.find((enemy) => {
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

      // M&M 3E: condition-based status instead of HP
      const conditions = combatant.conditions || {};
      const severity = getConditionSeverity(conditions);
      const isIncapacitated = Boolean(conditions.incapacitated || conditions.dying);

      if (isEnemy && isIncapacitated) {
        return;
      }

      initiativeOrder.push({
        id: combatant.id,
        name: combatant.name,
        type: combatant.type || null,
        imagePath,
        isEnemy,
        isCurrent: Boolean(encounterState.currentEncounter.combatActive && index === encounterState.currentEncounter.currentTurnIndex),
        isVisible,
        atlasTokenId: combatant.atlasTokenId || linkedEnemy?.atlasTokenId || linkedEnemy?.id || tokenMatch?.atlasTokenId || null,
        tokenId: linkedEnemy?.id || linkedEnemy?.atlasTokenId || tokenMatch?.id || combatant.atlasTokenId || null,
        conditionSeverity: severity,
        isIncapacitated,
        isDead: isIncapacitated,
        order: index
      });
    });
  }

  return {
    type: 'DISPLAY_STATE',
    connected: displayState.displayConnectionCount > 0,
    map: activeMap
      ? { url: activeMap.file, name: activeMap.name, w: activeMap.width_px, h: activeMap.height_px }
      : null,
    viewport: {
      w: resolution.w,
      h: resolution.h,
      fit: atlasState.atlasSettings.display?.viewport?.fit || 'fit',
      zoom: atlasState.atlasSettings.display?.viewport?.zoom || 1,
      offset: atlasState.atlasSettings.display?.viewport?.offset || { x: 0, y: 0 }
    },
    rotation: Number(atlasState.atlasSettings.display?.rotation) === 180 ? 180 : 0,
    grid: {
      enabled: Boolean(atlasState.atlasSettings.display?.grid?.enabled ?? true),
      cell_px: Number(cellPx.toFixed(2)),
      line_px: atlasState.atlasSettings.display?.grid?.line_px ?? 2,
      color: atlasState.atlasSettings.display?.grid?.color ?? '#3aaaff',
      opacity: atlasState.atlasSettings.display?.grid?.opacity ?? 0.25
    },
    tokens: tokens,
    tokenSettings: {
      showEnemyHealthColors: atlasState.atlasSettings.display?.tokens?.showEnemyHealthColors !== false
    },
    currentTurn: currentTurn,
    initiativeOrder: initiativeOrder,
    flavorMedia: displayState.activeFlavorMedia
  };
}

function incrementDisplayConnections() {
  displayState.displayConnectionCount += 1;
}

function decrementDisplayConnections() {
  displayState.displayConnectionCount = Math.max(0, displayState.displayConnectionCount - 1);
}

function setActiveFlavorMedia(imagePath) {
  displayState.activeFlavorMedia = { imagePath };
  return displayState.activeFlavorMedia;
}

function clearActiveFlavorMedia() {
  displayState.activeFlavorMedia = null;
}

module.exports = {
  displayState,
  buildDisplayState,
  incrementDisplayConnections,
  decrementDisplayConnections,
  setActiveFlavorMedia,
  clearActiveFlavorMedia
};
