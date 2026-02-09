const fs = require('fs');
const path = require('path');

const { SESSIONS_DIR } = require('../config/constants');

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getSessionPath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(SESSIONS_DIR);
  return files
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
      return data;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function loadSession(sessionId) {
  const sessionPath = getSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
}

function saveSession(session) {
  ensureSessionsDir();
  const sessionPath = getSessionPath(session.id);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  return session;
}

function deleteSession(sessionId) {
  const sessionPath = getSessionPath(sessionId);
  if (!fs.existsSync(sessionPath)) {
    return false;
  }
  fs.unlinkSync(sessionPath);
  return true;
}

function createOrUpdateSession(session) {
  const nextSession = { ...session };

  if (!nextSession.id) {
    nextSession.id = `session-${Date.now()}`;
  }

  if (!nextSession.createdAt) {
    nextSession.createdAt = new Date().toISOString();
  }

  if (!nextSession.encounters) {
    nextSession.encounters = [];
  }

  saveSession(nextSession);
  return nextSession;
}

function createEncounter(sessionId, encounter) {
  const session = loadSession(sessionId);
  if (!session) {
    return { error: 'session-not-found' };
  }

  const nextEncounter = { ...encounter };
  if (!nextEncounter.id) {
    nextEncounter.id = `encounter-${Date.now()}`;
  }
  if (!nextEncounter.createdAt) {
    nextEncounter.createdAt = new Date().toISOString();
  }

  if (!session.encounters) {
    session.encounters = [];
  }

  session.encounters.push(nextEncounter);
  saveSession(session);

  return { session, encounter: nextEncounter };
}

function getEncounter(sessionId, encounterId) {
  const session = loadSession(sessionId);
  if (!session) {
    return { error: 'session-not-found' };
  }

  const encounter = session.encounters?.find((entry) => entry.id === encounterId) || null;
  if (!encounter) {
    return { error: 'encounter-not-found', session };
  }

  return { session, encounter };
}

function updateEncounter(sessionId, encounterId, payload) {
  const session = loadSession(sessionId);
  if (!session) {
    return { error: 'session-not-found' };
  }

  const encounterIndex = session.encounters?.findIndex((entry) => entry.id === encounterId);
  if (encounterIndex === -1 || encounterIndex === undefined) {
    return { error: 'encounter-not-found', session };
  }

  const mergedEncounter = {
    ...session.encounters[encounterIndex],
    ...payload
  };

  mergedEncounter.combatants = Array.isArray(mergedEncounter.combatants) ? mergedEncounter.combatants : [];

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

      const exists = mergedEncounter.combatants.find((combatant) => (
        (enemy.combatantId && combatant.id === enemy.combatantId)
        || (enemy.id && combatant.atlasTokenId === enemy.id)
      ));
      if (exists) {
        if (enemy.id && !exists.atlasTokenId) {
          exists.atlasTokenId = enemy.id;
        }
        return;
      }

      const baseName = String((enemy.name || 'Enemy')).split(' - ')[0].trim();
      const existingCount = mergedEncounter.combatants.filter((combatant) => {
        const type = (combatant.type || '').toLowerCase();
        if (!enemyTypeSet.has(type)) return false;
        const combatantBase = String(combatant.name || '').split(' - ')[0].trim();
        return combatantBase === baseName;
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

    const placedAtlasIds = new Set(
      placedEnemies
        .filter((enemy) => enemy && enemy.placed && enemy.position && (enemy.id || enemy.atlasTokenId))
        .map((enemy) => enemy.id || enemy.atlasTokenId)
    );

    mergedEncounter.combatants = mergedEncounter.combatants.filter((combatant) => {
      const type = (combatant.type || '').toLowerCase();
      if (!enemyTypeSet.has(type)) {
        return true;
      }
      if (!combatant.atlasTokenId) {
        return true;
      }
      return placedAtlasIds.has(combatant.atlasTokenId);
    });
  } catch (syncErr) {
    console.warn('[Sessions] Failed to auto-sync placed enemies into combatants:', syncErr);
  }

  session.encounters[encounterIndex] = mergedEncounter;
  saveSession(session);

  return { session, encounter: mergedEncounter };
}

function deleteEncounter(sessionId, encounterId) {
  const session = loadSession(sessionId);
  if (!session) {
    return { error: 'session-not-found' };
  }

  const encounterIndex = session.encounters?.findIndex((entry) => entry.id === encounterId);
  if (encounterIndex === -1 || encounterIndex === undefined) {
    return { error: 'encounter-not-found', session };
  }

  session.encounters.splice(encounterIndex, 1);
  saveSession(session);

  return { session };
}

function createDefaultSessionIfMissing() {
  if (!fs.existsSync(SESSIONS_DIR) || fs.readdirSync(SESSIONS_DIR).filter((file) => file.endsWith('.json')).length === 0) {
    console.log('[Server] No sessions found. Creating a default session.');
    const defaultSession = {
      id: `session-${Date.now()}`,
      name: 'Welcome to ArcForge!',
      description: 'This is your first session. Create an encounter to get started.',
      createdAt: new Date().toISOString(),
      encounters: []
    };
    saveSession(defaultSession);
  }
}

module.exports = {
  listSessions,
  loadSession,
  saveSession,
  deleteSession,
  createOrUpdateSession,
  createEncounter,
  getEncounter,
  updateEncounter,
  deleteEncounter,
  createDefaultSessionIfMissing
};
