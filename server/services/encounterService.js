const fs = require('fs');
const path = require('path');

const { ENCOUNTERS_DIR } = require('../config/constants');

const encounterState = {
  currentEncounter: {
    combatants: [],
    currentTurnIndex: 0,
    roundNumber: 1,
    encounterId: null,
    combatActive: false
  }
};

function autoSaveEncounter() {
  const { currentEncounter } = encounterState;
  if (currentEncounter.encounterId) {
    if (!fs.existsSync(ENCOUNTERS_DIR)) {
      fs.mkdirSync(ENCOUNTERS_DIR, { recursive: true });
    }
    const encounterPath = path.join(ENCOUNTERS_DIR, `${currentEncounter.encounterId}.json`);
    fs.writeFileSync(encounterPath, JSON.stringify(currentEncounter, null, 2));
  }
}

function hydrateCurrentEncounterFromSource(encounter) {
  const { currentEncounter } = encounterState;
  const previousState = currentEncounter || {
    combatants: [],
    currentTurnIndex: 0,
    roundNumber: 1,
    encounterId: null,
    combatActive: false
  };

  if (!encounter) {
    encounterState.currentEncounter = {
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

  encounterState.currentEncounter = {
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
        combatant.hp.current = Math.min(combatant.hp.max, combatant.hp.current + effect.hpChange);
      } else {
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

module.exports = {
  encounterState,
  autoSaveEncounter,
  hydrateCurrentEncounterFromSource,
  applyEffects
};
