const fs = require('fs');
const path = require('path');

const {
  encounterState,
  autoSaveEncounter,
  hydrateCurrentEncounterFromSource,
  applyEffects,
  calculateResistanceResult,
  applyToughnessResult,
  defaultConditions,
  defaultAbilities,
  defaultDefenses
} = require('../services/encounterService');
const { ENCOUNTERS_DIR } = require('../config/constants');

// ── M&M 3E: "defeated" means incapacitated (no HP in M&M) ─────────────────

function isDefeatedEnemy(combatant) {
  if (!combatant) return false;
  const type = String(combatant.type || '').toLowerCase();
  const isEnemy = type === 'enemy' || type === 'monster' || type === 'e';
  if (!isEnemy) return false;
  return Boolean(combatant.conditions?.incapacitated);
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

  // ── Get current encounter state ─────────────────────────────────────────

  app.get('/api/encounter', (req, res) => {
    res.json(encounterState.currentEncounter);
  });

  // ── Add combatant (M&M 3E schema) ──────────────────────────────────────

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
        if (!enemyTypes.includes(combatantType)) return false;
        const combatantBase = (c.name || '').split(' - ')[0];
        return combatantBase === baseName;
      }).length;
      finalName = `${baseName} - ${String(existingCount + 1).padStart(2, '0')}`;
    }

    // M&M uses Agility for initiative (replaces D&D's DEX modifier)
    const abilities = req.body.abilities
      ? { ...defaultAbilities(), ...req.body.abilities }
      : defaultAbilities();
    const agilityModifier = req.body.agilityModifier ?? abilities.agl ?? 0;

    let initiativeValue = req.body.initiative;
    if (initiativeValue === undefined || initiativeValue === null || initiativeValue === '') {
      if (enemyTypes.includes(normalizedType)) {
        const roll = Math.floor(Math.random() * 20) + 1;
        initiativeValue = roll + agilityModifier;
      } else {
        initiativeValue = 0;
      }
    }

    const combatant = {
      id: `combatant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: finalName,
      type: req.body.type || 'monster',
      initiative: initiativeValue,
      agilityModifier,
      imagePath: req.body.imagePath || null,
      sourceId,
      atlasTokenId: req.body.atlasTokenId || null,

      // M&M 3E Abilities (8 abilities, direct modifiers)
      abilities,

      // M&M 3E Defenses
      defenses: req.body.defenses
        ? { ...defaultDefenses(), ...req.body.defenses }
        : defaultDefenses(),

      // M&M 3E Condition Track (replaces HP)
      conditions: defaultConditions(),

      // Hero Points
      heroPoints: req.body.heroPoints ?? 1,

      // Power Level
      powerLevel: req.body.powerLevel ?? 10,

      // Combat data
      attacks: req.body.attacks || [],
      powers: req.body.powers || [],
      advantages: req.body.advantages || [],
      skills: req.body.skills || {},
      equipment: req.body.equipment || [],
      specialAbilities: req.body.specialAbilities || [],
      statusEffects: []
    };

    encounterState.currentEncounter.combatants.push(combatant);

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return (b.agilityModifier || 0) - (a.agilityModifier || 0);
    });

    autoSaveEncounter();
    try {
      console.log('[API] Added combatant:', { id: combatant.id, name: combatant.name, type: combatant.type, initiative: combatant.initiative });
    } catch (e) { /* no-op */ }
    res.json(combatant);
  });

  // ── Update combatant ────────────────────────────────────────────────────

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

  // ── Remove combatant ───────────────────────────────────────────────────

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

  // ── Initiative ──────────────────────────────────────────────────────────

  app.post('/api/initiative/roll', (req, res) => {
    const { combatantId, agilityModifier } = req.body;
    const roll = Math.floor(Math.random() * 20) + 1;
    const initiative = roll + (agilityModifier || 0);

    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === combatantId);
    if (combatantIndex !== -1) {
      encounterState.currentEncounter.combatants[combatantIndex].initiative = initiative;
      encounterState.currentEncounter.combatants[combatantIndex].agilityModifier = agilityModifier || 0;

      encounterState.currentEncounter.combatants.sort((a, b) => {
        if (b.initiative !== a.initiative) {
          return b.initiative - a.initiative;
        }
        return (b.agilityModifier || 0) - (a.agilityModifier || 0);
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
        combatant.initiative = roll + (combatant.agilityModifier || 0);
      }
      return combatant;
    });

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return (b.agilityModifier || 0) - (a.agilityModifier || 0);
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
      return (b.agilityModifier || 0) - (a.agilityModifier || 0);
    });

    autoSaveEncounter();
    res.json(encounterState.currentEncounter);
  });

  // ── M&M 3E: Resistance Check (core combat mechanic) ────────────────────

  app.post('/api/combatants/:id/resistance-check', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);
    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { dc, defense = 'toughness', modifier = 0 } = req.body;

    if (!dc && dc !== 0) {
      return res.status(400).json({ error: 'DC is required' });
    }

    const defenseValue = (combatant.defenses?.[defense] ?? 0) + modifier;
    const bruised = combatant.conditions?.bruised ?? 0;
    const roll = Math.floor(Math.random() * 20) + 1;

    const result = calculateResistanceResult(roll, defenseValue, dc, bruised, defense);

    // Apply conditions based on result (for Toughness checks)
    if (defense === 'toughness') {
      applyToughnessResult(combatant, result.degrees);
    }

    autoSaveEncounter();
    broadcastDisplayState();

    res.json({
      roll,
      defense,
      defenseValue,
      bruisedPenalty: defense === 'toughness' ? bruised : 0,
      dc,
      ...result,
      combatant
    });
  });

  // ── M&M 3E: Direct condition manipulation ──────────────────────────────

  app.post('/api/combatants/:id/conditions', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);
    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { condition, value } = req.body;

    if (!combatant.conditions) {
      combatant.conditions = defaultConditions();
    }

    if (condition === 'bruised') {
      combatant.conditions.bruised = Math.max(0, Number(value) || 0);
    } else if (condition in combatant.conditions) {
      combatant.conditions[condition] = Boolean(value);
    } else {
      return res.status(400).json({ error: `Unknown condition: ${condition}` });
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(combatant);
  });

  // ── M&M 3E: Hero Points ────────────────────────────────────────────────

  app.post('/api/combatants/:id/hero-points', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);
    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { amount } = req.body;

    combatant.heroPoints = Math.max(0, (combatant.heroPoints || 0) + (amount || 0));

    autoSaveEncounter();
    res.json(combatant);
  });

  // ── M&M 3E: Recover from condition ─────────────────────────────────────

  app.post('/api/combatants/:id/recover', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);
    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    const { condition } = req.body;

    if (!combatant.conditions) {
      combatant.conditions = defaultConditions();
    }

    if (condition === 'bruised') {
      combatant.conditions.bruised = Math.max(0, combatant.conditions.bruised - 1);
    } else if (condition === 'all') {
      // Full recovery
      combatant.conditions = defaultConditions();
    } else if (condition in combatant.conditions) {
      combatant.conditions[condition] = false;
    } else {
      return res.status(400).json({ error: `Unknown condition: ${condition}` });
    }

    autoSaveEncounter();
    broadcastDisplayState();
    res.json(combatant);
  });

  // ── Status Effects (timed) ─────────────────────────────────────────────

  app.post('/api/combatants/:id/status-effects', (req, res) => {
    const combatantIndex = encounterState.currentEncounter.combatants.findIndex(c => c.id === req.params.id);
    if (combatantIndex === -1) {
      return res.status(404).json({ error: 'Combatant not found' });
    }

    const combatant = encounterState.currentEncounter.combatants[combatantIndex];
    combatant.statusEffects.push(req.body);

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

  // ── Combat Flow ─────────────────────────────────────────────────────────

  app.post('/api/combat/start', (req, res) => {
    console.log('[start-combat] Endpoint called, current combatants:', encounterState.currentEncounter.combatants.length);
    if (encounterState.currentEncounter.combatants.length === 0) {
      console.log('[start-combat] ERROR: No combatants');
      return res.status(400).json({ error: 'No agents to start combat with' });
    }

    encounterState.currentEncounter.combatants.forEach(combatant => {
      if (!combatant.initiative) {
        const roll = Math.floor(Math.random() * 20) + 1;
        combatant.initiative = roll + (combatant.agilityModifier || 0);
      }
    });

    encounterState.currentEncounter.combatants.sort((a, b) => {
      if (b.initiative !== a.initiative) {
        return b.initiative - a.initiative;
      }
      return (b.agilityModifier || 0) - (a.agilityModifier || 0);
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

  // ── Encounter CRUD ──────────────────────────────────────────────────────

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
