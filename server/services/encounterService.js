const fs = require('fs');
const path = require('path');

const { ENCOUNTERS_DIR } = require('../config/constants');

// ── M&M 3E Default Combatant Template ──────────────────────────────────────

function defaultConditions() {
  return {
    bruised: 0,
    dazed: false,
    staggered: false,
    incapacitated: false,
    dying: false,
    blind: false,
    bound: false,
    compelled: false,
    controlled: false,
    defenseless: false,
    disabled: false,
    exhausted: false,
    fatigued: false,
    hindered: false,
    immobile: false,
    impaired: false,
    prone: false,
    restrained: false,
    stunned: false,
    surprised: false,
    transformed: false,
    unaware: false,
    vulnerable: false,
    weakened: false
  };
}

function defaultAbilities() {
  return { str: 0, sta: 0, agl: 0, dex: 0, fgt: 0, int: 0, awe: 0, pre: 0 };
}

function defaultDefenses() {
  return { dodge: 0, parry: 0, fortitude: 0, will: 0, toughness: 0 };
}

// ── Encounter State ────────────────────────────────────────────────────────

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

// ── Hydration ──────────────────────────────────────────────────────────────

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
        // M&M 3E: ensure conditions, abilities, defenses are properly deep-copied
        copy.conditions = combatant.conditions
          ? { ...defaultConditions(), ...combatant.conditions }
          : defaultConditions();
        copy.abilities = combatant.abilities
          ? { ...defaultAbilities(), ...combatant.abilities }
          : defaultAbilities();
        copy.defenses = combatant.defenses
          ? { ...defaultDefenses(), ...combatant.defenses }
          : defaultDefenses();
        copy.statusEffects = Array.isArray(combatant.statusEffects)
          ? combatant.statusEffects.map((effect) => (effect && typeof effect === 'object' ? { ...effect } : effect))
          : [];
        copy.attacks = Array.isArray(combatant.attacks)
          ? combatant.attacks.map((a) => (a && typeof a === 'object' ? { ...a } : a))
          : [];
        copy.powers = Array.isArray(combatant.powers) ? [...combatant.powers] : [];
        copy.advantages = Array.isArray(combatant.advantages) ? [...combatant.advantages] : [];
        copy.equipment = Array.isArray(combatant.equipment) ? [...combatant.equipment] : [];
        copy.heroPoints = Number.isFinite(combatant.heroPoints) ? combatant.heroPoints : 1;
        copy.powerLevel = Number.isFinite(combatant.powerLevel) ? combatant.powerLevel : 10;
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

// ── M&M 3E Resistance Check ───────────────────────────────────────────────

/**
 * Calculate the result of a resistance check (the core M&M 3E mechanic).
 *
 * @param {number} roll       - The d20 roll result
 * @param {number} defense    - The defense value (e.g. toughness)
 * @param {number} dc         - The difficulty class (usually 15 + effect rank)
 * @param {number} bruised    - Current bruised count (penalty to toughness checks)
 * @param {string} defenseType - Which defense is being checked ('toughness', 'fortitude', 'will')
 * @returns {{ total, margin, degrees, results[] }}
 */
function calculateResistanceResult(roll, defense, dc, bruised, defenseType) {
  // Bruised penalty applies only to Toughness checks
  const penalty = defenseType === 'toughness' ? bruised : 0;
  const total = roll + defense - penalty;
  const margin = dc - total;

  if (margin <= 0) {
    return { total, margin: 0, degrees: 0, result: 'success', effects: [] };
  }

  if (margin <= 5) {
    return {
      total, margin, degrees: 1, result: 'one_degree',
      effects: defenseType === 'toughness'
        ? [{ type: 'bruised', description: 'Bruised (-1 to future Toughness checks)' }]
        : [{ type: 'minor', description: `Failed ${defenseType} check by 1 degree` }]
    };
  }

  if (margin <= 10) {
    return {
      total, margin, degrees: 2, result: 'two_degrees',
      effects: defenseType === 'toughness'
        ? [
            { type: 'bruised', description: 'Bruised (-1 to future Toughness checks)' },
            { type: 'dazed', description: 'Dazed (limited to free actions and a single standard action)' }
          ]
        : [{ type: 'moderate', description: `Failed ${defenseType} check by 2 degrees` }]
    };
  }

  if (margin <= 15) {
    return {
      total, margin, degrees: 3, result: 'three_degrees',
      effects: defenseType === 'toughness'
        ? [
            { type: 'bruised', description: 'Bruised (-1 to future Toughness checks)' },
            { type: 'staggered', description: 'Staggered (limited to a single action)' }
          ]
        : [{ type: 'severe', description: `Failed ${defenseType} check by 3 degrees` }]
    };
  }

  return {
    total, margin, degrees: 4, result: 'four_degrees',
    effects: defenseType === 'toughness'
      ? [{ type: 'incapacitated', description: 'Incapacitated (knocked out of the fight)' }]
      : [{ type: 'critical', description: `Failed ${defenseType} check by 4+ degrees` }]
  };
}

/**
 * Apply the results of a Toughness resistance check to a combatant's conditions.
 */
function applyToughnessResult(combatant, degrees) {
  if (degrees >= 4) {
    combatant.conditions.incapacitated = true;
    combatant.conditions.bruised += 1;
    return;
  }

  if (degrees >= 3) {
    combatant.conditions.bruised += 1;
    if (combatant.conditions.staggered) {
      // Already staggered -> incapacitated
      combatant.conditions.incapacitated = true;
    } else {
      combatant.conditions.staggered = true;
    }
    return;
  }

  if (degrees >= 2) {
    combatant.conditions.bruised += 1;
    combatant.conditions.dazed = true;
    return;
  }

  if (degrees >= 1) {
    combatant.conditions.bruised += 1;
    return;
  }
}

// ── Effect Application (timed status effects) ─────────────────────────────

function applyEffects(combatant, timing) {
  if (!combatant.statusEffects) return;

  combatant.statusEffects.forEach(effect => {
    // M&M timed effects: apply defense modifiers, condition changes, etc.
    if (effect.timing === timing || effect.hpTiming === timing) {
      // Defense modifications
      if (effect.toughnessMod) {
        combatant.defenses.toughness += effect.toughnessMod;
      }
      if (effect.dodgeMod) {
        combatant.defenses.dodge += effect.dodgeMod;
      }
      if (effect.parryMod) {
        combatant.defenses.parry += effect.parryMod;
      }
      if (effect.fortitudeMod) {
        combatant.defenses.fortitude += effect.fortitudeMod;
      }
      if (effect.willMod) {
        combatant.defenses.will += effect.willMod;
      }
    }
  });

  // Auto-clear Dazed at end of the combatant's turn (M&M rule: Dazed lasts until end of next turn)
  if (timing === 'end' && combatant.conditions.dazed) {
    combatant.conditions.dazed = false;
  }
}

// ── Condition Severity (for display token coloring) ────────────────────────

/**
 * Returns a severity level 0-3 for display purposes.
 * 0 = clean, 1 = bruised, 2 = dazed/staggered, 3 = incapacitated/dying
 */
function getConditionSeverity(conditions) {
  if (!conditions) return 0;
  if (conditions.incapacitated || conditions.dying) return 3;
  if (conditions.staggered || conditions.dazed || conditions.stunned) return 2;
  if (conditions.bruised > 0) return 1;
  return 0;
}

module.exports = {
  encounterState,
  autoSaveEncounter,
  hydrateCurrentEncounterFromSource,
  applyEffects,
  calculateResistanceResult,
  applyToughnessResult,
  getConditionSeverity,
  defaultConditions,
  defaultAbilities,
  defaultDefenses
};
