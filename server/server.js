const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = 3000;

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

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const targetDir = path.join(__dirname, '../uploads', file.fieldname || 'misc');
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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
    const encounterPath = path.join(__dirname, '../data/encounters', `${currentEncounter.encounterId}.json`);
    fs.writeFileSync(encounterPath, JSON.stringify(currentEncounter, null, 2));
  }
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

// Routes

// Get current encounter state
app.get('/api/encounter', (req, res) => {
  res.json(currentEncounter);
});

// Add combatant
app.post('/api/combatants', (req, res) => {
  const combatant = {
    id: `combatant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: req.body.name,
    type: req.body.type || 'monster',
    initiative: req.body.initiative || 0,
    dexModifier: req.body.dexModifier || 0,
    imagePath: req.body.imagePath || null,
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
    loot: req.body.loot || []
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
  if (currentEncounter.combatants.length === 0) {
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
  res.json(currentEncounter);
});

// End combat
app.post('/api/combat/end', (req, res) => {
  currentEncounter.combatActive = false;
  autoSaveEncounter();
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

  currentEncounter = JSON.parse(fs.readFileSync(encounterPath, 'utf8'));
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

  // Create directory if it doesn't exist
  if (!fs.existsSync(charactersDir)) {
    fs.mkdirSync(charactersDir, { recursive: true });
    return res.json([]);
  }

  const files = fs.readdirSync(charactersDir);
  const characters = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(charactersDir, f), 'utf8'));
      return data;
    });

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


// Start server
app.listen(PORT, () => {
  console.log(`ArcForge server running on http://localhost:${PORT}`);
  console.log(`Ready to track initiative and manage combat!`);
});
