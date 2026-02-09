const fs = require('fs');
const path = require('path');

const {
  encounterState,
  autoSaveEncounter,
  hydrateCurrentEncounterFromSource,
  applyEffects
} = require('../services/encounterService');
const { ENCOUNTERS_DIR } = require('../config/constants');

function isDefeatedEnemy(combatant) {
  if (!combatant) return false;
  const type = String(combatant.type || '').toLowerCase();
  const isEnemy = type === 'enemy' || type === 'monster' || type === 'e';
  if (!isEnemy) return false;
  const hpCurrent = Number(combatant?.hp?.current);
  return Number.isFinite(hpCurrent) && hpCurrent <= 0;
}

function findFirstActiveTurnIndex(combatants = []) {
  return combatants.findIndex((combatant) => !isDefeatedEnemy(combatant));
}

function findNextActiveTurnIndex(combatants = [], startIndex = 0) {
  if (!combatants.length) return -1;
  let idx = Number.isFinite(startIndex) ? startIndex : 0;
  for (let i = 0; i < combatants.length; i += 1) {
    idx = (idx + 1) % combatants.length;
    if (!isDefeatedEnemy(combatants[idx])) {
      return idx;
    }
  }
  return -1;
}

function registerCombatRoutes(app, { broadcastDisplayState }) {
  app.get('/api/encounter', (req, res) => {
    res.json(encounterState.currentEncounter);
  });

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
      const existingCount = encounterState.currentEncounter.combatants.filter(c => {
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

    encounterState.currentEncounter.combatants.push(combatant);

    encounterState.currentEncounter.combatants.sort((a, b) => {
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

  app.put('/api/combatants/:id', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    encounterState.currentEncounter.combatants[combatantIndex] = {
      ...encounterState.currentEncounter.combatants[combatantIndex],
      ...req.body
    };

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(encounterState.currentEncounter.combatants[combatantIndex]);
  });

  app.delete('/api/combatants/:id', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    encounterState.currentEncounter.combatants.splice(combatantIndex, 1);

    if (encounterState.currentEncounter.currentTurnIndex >= encounterState.currentEncounter.combatants.length) {
      encounterState.currentEncounter.currentTurnIndex = 0;
    }

    autoSaveEncounter();
    res.json({ message: 'Combatant removed' });
  });

  app.post('/api/initiative/roll', (req, res) => {
    const { combatantId, dexModifier } = req.body;
    const roll = Math.floor(Math.random() * 20) + 1;
    const initiative = roll + (dexModifier || 0);

    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === combatantId);

    if (combatantIndex !== -1) {
      encounterState.currentEncounter.combatants[combatantIndex].initiative = initiative;
      encounterState.currentEncounter.combatants[combatantIndex].dexModifier = dexModifier || 0;

      encounterState.currentEncounter.combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) {
          return b.initiative - a.initiative;
        }
        return b.dexModifier - a.dexModifier;
      });

      autoSaveEncounter();
    }

    res.json({ roll, initiative });
  });

  app.post('/api/initiative/roll-enemies', (req, res) => {
    encounterState.currentEncounter.combatants = encounterState.currentEncounter.combatants.map(combatant => {
      const normalizedType = (combatant.type || '').toLowerCase();
      if (['enemy', 'monster', 'e'].includes(normalizedType)) {
        const roll = Math.floor(Math.random() * 20) + 1;
        combatant.initiative = roll + (combatant.dexModifier || 0);
      }
      return combatant;
    });

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return (b.dexModifier || 0) - (a.dexModifier || 0);
    });

    autoSaveEncounter();
    res.json(encounterState.currentEncounter);
  });

  app.post('/api/initiative/reorder', (req, res) => {
    const { combatantIds } = req.body;

    const reordered = combatantIds.map(id =>
      encounterState.currentEncounter.combatants.find(c => c.id === id)
    ).filter(c => c);

    encounterState.currentEncounter.combatants = reordered;
    autoSaveEncounter();

    res.json({ message: 'Initiative reordered' });
  });

  app.post('/api/combatants/:id/hp', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { amount, type } = req.body;

    if (type === 'damage') {
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

      if (combatant.hp.current > 0) {
        combatant.deathSaves.successes = 0;
        combatant.deathSaves.failures = 0;
      }
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(combatant);
  });

  app.post('/api/combatants/:id/temp-hp', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { amount } = req.body;

    combatant.hp.temp = Math.max(combatant.hp.temp, amount);

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(combatant);
  });

  app.post('/api/combatants/:id/status-effects', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const effect = req.body;

    combatant.statusEffects.push(effect);

    autoSaveEncounter();
    res.json(combatant);
  });

  app.delete('/api/combatants/:id/status-effects/:index', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const effectIndex = parseInt(req.params.index);

    if (effectIndex >= 0 && effectIndex < combatant.statusEffects.length) {
      combatant.statusEffects.splice(effectIndex, 1);
    }

    autoSaveEncounter();
    res.json(combatant);
  });

  app.post('/api/combatants/:id/death-saves', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { successes, failures } = req.body;

    if (successes !== undefined) {
      combatant.deathSaves.successes = Math.max(0, Math.min(3, successes));
    }

    if (failures !== undefined) {
      combatant.deathSaves.failures = Math.max(0, Math.min(3, failures));
    }

    if (combatant.deathSaves.successes >= 3) {
      combatant.hp.current = 1;
      combatant.deathSaves.successes = 0;
      combatant.deathSaves.failures = 0;
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(combatant);
  });

  app.post('/api/combatants/:id/death-saves/roll', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const roll = Math.floor(Math.random() * 20) + 1;

    let result = '';

    if (roll === 1) {
      combatant.deathSaves.failures = Math.min(3, combatant.deathSaves.failures + 2);
      result = 'Critical Failure! 2 failures added.';
    } else if (roll === 20) {
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

    if (combatant.deathSaves.successes >= 3) {
      combatant.hp.current = 1;
      combatant.deathSaves.successes = 0;
      combatant.deathSaves.failures = 0;
      result += ' Stabilized at 1 HP.';
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json({ roll, result, combatant });
  });

  app.post('/api/combatants/:id/initiative', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);

    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const { initiative } = req.body;
    encounterState.currentEncounter.combatants[combatantIndex].initiative = parseInt(initiative) || 0;

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return b.dexModifier - a.dexModifier;
    });

    autoSaveEncounter();
    res.json(encounterState.currentEncounter);
  });

  app.post('/api/combat/start', (req, res) => {
    console.log('[start-combat] Endpoint called, current combatants:', encounterState.currentEncounter.combatants.length);
    if (encounterState.currentEncounter.combatants.length === 0) {
      console.log('[start-combat] ERROR: No combatants');
      return res.status(400).json({ error: 'No agents to start combat with' });
    }

    encounterState.currentEncounter.combatants.forEach(combatant => {
      if (!combatant.initiative) {
        const roll = Math.floor(Math.random() * 20) + 1;
        combatant.initiative = roll + combatant.dexModifier;
      }
    });

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return b.dexModifier - a.dexModifier;
    });

    const firstActiveIndex = findFirstActiveTurnIndex(encounterState.currentEncounter.combatants);
    if (firstActiveIndex === -1) {
      return res.status(400).json({ error: 'No active combatants in initiative order' });
    }

    encounterState.currentEncounter.combatActive = true;
    encounterState.currentEncounter.currentTurnIndex = firstActiveIndex;
    encounterState.currentEncounter.roundNumber = 1;

    if (!encounterState.currentEncounter.encounterId) {
      encounterState.currentEncounter.encounterId = `encounter-${Date.now()}`;
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(encounterState.currentEncounter);
  });

  app.post('/api/combat/end', (req, res) => {
    encounterState.currentEncounter.combatActive = false;
    autoSaveEncounter();
    broadcastDisplayState();
    res.json(encounterState.currentEncounter);
  });

  app.post('/api/combat/next-turn', (req, res) => {
    console.log('[next-turn] Called, current state:', {
      combatantsCount: encounterState.currentEncounter.combatants.length,
      currentTurnIndex: encounterState.currentEncounter.currentTurnIndex,
      roundNumber: encounterState.currentEncounter.roundNumber,
      combatActive: encounterState.currentEncounter.combatActive
    });

    if (encounterState.currentEncounter.combatants.length === 0) {
      console.log('[next-turn] ERROR: No combatants');
      return res.status(400).json({ error: 'No combatants in encounter' });
    }

    if (!encounterState.currentEncounter.combatActive) {
      console.log('[next-turn] ERROR: Combat not active');
      return res.status(400).json({ error: 'Combat has not started' });
    }

    const combatants = encounterState.currentEncounter.combatants;
    let currentTurnIndex = encounterState.currentEncounter.currentTurnIndex;

    if (!Number.isFinite(currentTurnIndex) || currentTurnIndex < 0 || currentTurnIndex >= combatants.length || isDefeatedEnemy(combatants[currentTurnIndex])) {
      currentTurnIndex = findFirstActiveTurnIndex(combatants);
      if (currentTurnIndex === -1) {
        encounterState.currentEncounter.combatActive = false;
        autoSaveEncounter();
        broadcastDisplayState();
        return res.status(400).json({ error: 'No active combatants in initiative order' });
      }
      encounterState.currentEncounter.currentTurnIndex = currentTurnIndex;
    }

    const currentCombatant = combatants[currentTurnIndex];
    console.log('[next-turn] Applying end-of-turn effects for:', currentCombatant.name);
    applyEffects(currentCombatant, 'end');

    const nextTurnIndex = findNextActiveTurnIndex(combatants, currentTurnIndex);
    if (nextTurnIndex === -1) {
      encounterState.currentEncounter.combatActive = false;
      autoSaveEncounter();
      broadcastDisplayState();
      return res.status(400).json({ error: 'No active combatants in initiative order' });
    }

    if (nextTurnIndex <= currentTurnIndex) {
      encounterState.currentEncounter.roundNumber++;
      console.log('[next-turn] New round:', encounterState.currentEncounter.roundNumber);

      encounterState.currentEncounter.combatants.forEach(combatant => {
        combatant.statusEffects = combatant.statusEffects
          .map(effect => ({
            ...effect,
            duration: effect.duration - 1
          }))
          .filter(effect => effect.duration > 0);
      });
    }

    encounterState.currentEncounter.currentTurnIndex = nextTurnIndex;
    const nextCombatant = encounterState.currentEncounter.combatants[nextTurnIndex];
    console.log('[next-turn] Applying start-of-turn effects for:', nextCombatant.name);
    applyEffects(nextCombatant, 'start');

    console.log('[next-turn] Returning state with', encounterState.currentEncounter.combatants.length, 'combatants');
    autoSaveEncounter();
    broadcastDisplayState();
    res.json(encounterState.currentEncounter);
  });

  app.post('/api/encounter/new', (req, res) => {
    encounterState.currentEncounter = {
      combatants: [],
      currentTurnIndex: 0,
      roundNumber: 1,
      encounterId: `encounter-${Date.now()}`,
      combatActive: false
    };

    autoSaveEncounter();
    res.json(encounterState.currentEncounter);
  });

  app.get('/api/encounter/:id', (req, res) => {
    const encounterPath = path.join(ENCOUNTERS_DIR, `${req.params.id}.json`);

    if (!fs.existsSync(encounterPath)) {
      return res.status(404).json({ error: 'Encounter not found' });
    }

    const fileEncounter = JSON.parse(fs.readFileSync(encounterPath, 'utf8'));
    hydrateCurrentEncounterFromSource(fileEncounter);
    res.json(encounterState.currentEncounter);
  });

  app.get('/api/encounters', (req, res) => {
    const encountersDir = ENCOUNTERS_DIR;

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
}

module.exports = {
  registerCombatRoutes
};
