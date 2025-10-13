// D&D 5e Skills with their associated abilities
const DND_SKILLS = [
    { name: 'Acrobatics', ability: 'dex' },
    { name: 'Animal Handling', ability: 'wis' },
    { name: 'Arcana', ability: 'int' },
    { name: 'Athletics', ability: 'str' },
    { name: 'Deception', ability: 'cha' },
    { name: 'History', ability: 'int' },
    { name: 'Insight', ability: 'wis' },
    { name: 'Intimidation', ability: 'cha' },
    { name: 'Investigation', ability: 'int' },
    { name: 'Medicine', ability: 'wis' },
    { name: 'Nature', ability: 'int' },
    { name: 'Perception', ability: 'wis' },
    { name: 'Performance', ability: 'cha' },
    { name: 'Persuasion', ability: 'cha' },
    { name: 'Religion', ability: 'int' },
    { name: 'Sleight of Hand', ability: 'dex' },
    { name: 'Stealth', ability: 'dex' },
    { name: 'Survival', ability: 'wis' }
];

// Class data with hit dice and proficiencies
const CLASS_DATA = {
    barbarian: { hitDice: 12, savingThrows: ['str', 'con'], skillChoices: 2, skills: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    bard: { hitDice: 8, savingThrows: ['dex', 'cha'], skillChoices: 3, skills: 'any' },
    cleric: { hitDice: 8, savingThrows: ['wis', 'cha'], skillChoices: 2, skills: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    druid: { hitDice: 8, savingThrows: ['int', 'wis'], skillChoices: 2, skills: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    fighter: { hitDice: 10, savingThrows: ['str', 'con'], skillChoices: 2, skills: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'] },
    monk: { hitDice: 8, savingThrows: ['str', 'dex'], skillChoices: 2, skills: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    paladin: { hitDice: 10, savingThrows: ['wis', 'cha'], skillChoices: 2, skills: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    ranger: { hitDice: 10, savingThrows: ['str', 'dex'], skillChoices: 3, skills: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    rogue: { hitDice: 8, savingThrows: ['dex', 'int'], skillChoices: 4, skills: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
    sorcerer: { hitDice: 6, savingThrows: ['con', 'cha'], skillChoices: 2, skills: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    warlock: { hitDice: 8, savingThrows: ['wis', 'cha'], skillChoices: 2, skills: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    wizard: { hitDice: 6, savingThrows: ['int', 'wis'], skillChoices: 2, skills: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'] }
};

// Race data with ability score modifiers and traits
const RACE_DATA = {
    human: { abilityScores: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, size: 'Medium' },
    elf: { abilityScores: { dex: 2 }, speed: 30, size: 'Medium' },
    dwarf: { abilityScores: { con: 2 }, speed: 25, size: 'Medium' },
    halfling: { abilityScores: { dex: 2 }, speed: 25, size: 'Small' },
    dragonborn: { abilityScores: { str: 2, cha: 1 }, speed: 30, size: 'Medium' },
    gnome: { abilityScores: { int: 2 }, speed: 25, size: 'Small' },
    'half-elf': { abilityScores: { cha: 2 }, speed: 30, size: 'Medium' },
    'half-orc': { abilityScores: { str: 2, con: 1 }, speed: 30, size: 'Medium' },
    tiefling: { abilityScores: { cha: 2, int: 1 }, speed: 30, size: 'Medium' }
};

// Current character state
let currentCharacter = null;
let savedCharacters = [];
window.savedCharacters = savedCharacters;

// Calculate ability modifier from ability score
function calculateModifier(score) {
    return Math.floor((score - 10) / 2);
}

// Calculate proficiency bonus from level
function calculateProficiencyBonus(level) {
    return Math.ceil(level / 4) + 1;
}

// Initialize character builder
function initCharacterBuilder() {
    populateSkills();
    attachCharacterBuilderListeners();
    loadSavedCharacters();
    window.renderCharactersList = renderCharactersList;

    const charTabBtn = document.getElementById('crucible-character-btn');
    const effectsTabBtn = document.getElementById('crucible-effects-btn');
    const lootTabBtn = document.getElementById('crucible-loot-btn');

    if (charTabBtn && effectsTabBtn && lootTabBtn) {
        charTabBtn.addEventListener('click', () => switchCrucibleSection('character'));
        effectsTabBtn.addEventListener('click', () => switchCrucibleSection('effects'));
        lootTabBtn.addEventListener('click', () => switchCrucibleSection('loot'));
    }
}

// Populate skills list
function populateSkills() {
    const skillsList = document.getElementById('skills-list');
    skillsList.innerHTML = '';

    DND_SKILLS.forEach((skill, index) => {
        const skillItem = document.createElement('div');
        skillItem.className = 'skill-item';
        skillItem.innerHTML = `
            <input type="checkbox" id="skill-${index}" data-skill="${skill.name}" data-ability="${skill.ability}">
            <label for="skill-${index}">${skill.name}</label>
            <span class="skill-modifier" id="skill-mod-${index}">+0</span>
        `;
        skillsList.appendChild(skillItem);
    });
}

// Attach event listeners for character builder
function attachCharacterBuilderListeners() {
    // Navigation
    document.getElementById('nav-arena-btn').addEventListener('click', () => switchView('arena'));
    document.getElementById('nav-crucible-btn').addEventListener('click', () => switchView('crucible'));
    document.getElementById('nav-atlas-btn').addEventListener('click', () => switchView('atlas'));
    document.getElementById('nav-codex-btn').addEventListener('click', () => switchView('codex'));

    // Ability score changes
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        document.getElementById(`char-${ability}`).addEventListener('input', () => {
            updateAbilityModifier(ability);
            updateSkillModifiers();
        });
    });

    // Standard array button
    document.getElementById('standard-array-btn').addEventListener('click', applyStandardArray);

    // Roll stats button
    document.getElementById('roll-stats-btn').addEventListener('click', rollStats);

    // Character form submission
    document.getElementById('character-form').addEventListener('submit', handleSaveCharacter);

    // Clear form button
    document.getElementById('clear-form-btn').addEventListener('click', clearCharacterForm);

    // Download JSON button
    document.getElementById('download-json-btn').addEventListener('click', handleDownloadJson);

    // Upload JSON button
    const uploadJsonBtn = document.getElementById('upload-json-btn');
    const uploadJsonInput = document.getElementById('upload-json-input');
    uploadJsonBtn.addEventListener('click', () => uploadJsonInput.click());
    uploadJsonInput.addEventListener('change', handleJsonUpload);

    // Class and level changes
    document.getElementById('char-class').addEventListener('change', updateCharacterFromClass);
    document.getElementById('char-level').addEventListener('input', updateCharacterFromLevel);

    // Race change
    document.getElementById('char-race').addEventListener('change', updateCharacterFromRace);

    // Add attack button
    document.getElementById('add-attack-btn').addEventListener('click', addAttackToForm);

    const imageInput = document.getElementById('char-image');
    if (imageInput) {
        imageInput.addEventListener('change', handleCharacterImageUpload);
    }
}

// Switch between views
function switchView(view) {
    const arenaView = document.getElementById('arena-view');
    const crucibleView = document.getElementById('crucible-view');
    const crucibleChar = document.getElementById('crucible-character-section');
    const crucibleEffects = document.getElementById('crucible-effects-section');
    const crucibleLoot = document.getElementById('crucible-loot-section');
    const atlasView = document.getElementById('atlas-view');
    const codexView = document.getElementById('codex-view');

    const arenaBtn = document.getElementById('nav-arena-btn');
    const crucibleBtn = document.getElementById('nav-crucible-btn');
    const atlasBtn = document.getElementById('nav-atlas-btn');
    const codexBtn = document.getElementById('nav-codex-btn');

    [arenaView, crucibleView, atlasView, codexView].forEach(viewEl => {
        if (viewEl) {
            viewEl.style.display = 'none';
        }
    });

    [arenaBtn, crucibleBtn, atlasBtn, codexBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
        }
    });

    if (view === 'arena') {
        if (arenaView) {
            arenaView.style.display = 'grid';
        }
        if (arenaBtn) {
            arenaBtn.classList.add('active');
        }
        if (crucibleChar && crucibleEffects && crucibleLoot) {
            switchCrucibleSection('character');
        }
    } else if (view === 'crucible') {
        if (crucibleView) {
            crucibleView.style.display = 'block';
        }
        if (crucibleBtn) {
            crucibleBtn.classList.add('active');
        }
        if (crucibleChar && crucibleEffects && crucibleLoot) {
            const activeTab = document.querySelector('.crucible-tab-btn.active');
            const activeSection = (activeTab && activeTab.dataset.section) || 'character';
            switchCrucibleSection(activeSection);
        }
    } else if (view === 'atlas') {
        if (atlasView) {
            atlasView.style.display = 'flex';
        }
        if (atlasBtn) {
            atlasBtn.classList.add('active');
        }
    } else if (view === 'codex') {
        if (codexView) {
            codexView.style.display = 'flex';
        }
        if (codexBtn) {
            codexBtn.classList.add('active');
        }
    }
}

function switchCrucibleSection(section) {
    const sections = {
        character: document.getElementById('crucible-character-section'),
        effects: document.getElementById('crucible-effects-section'),
        loot: document.getElementById('crucible-loot-section')
    };

    Object.values(sections).forEach(sec => {
        if (sec) {
            sec.classList.remove('active');
            sec.style.display = 'none';
        }
    });

    const target = sections[section];
    if (target) {
        target.classList.add('active');
        if (section === 'character') {
            target.style.display = 'grid';
        } else {
            target.style.display = 'block';
        }
        if (section === 'effects') {
            if (typeof loadSavedEffects === 'function') {
                loadSavedEffects();
            }
        } else if (section === 'loot') {
            if (typeof loadLootData === 'function') {
                loadLootData();
            }
        }
    }

    document.querySelectorAll('.crucible-tab-btn').forEach(btn => btn.classList.remove('active'));

    const tabBtn = document.getElementById(`crucible-${section}-btn`);
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
}

// Update ability modifier display
function updateAbilityModifier(ability) {
    const score = parseInt(document.getElementById(`char-${ability}`).value) || 10;
    const modifier = calculateModifier(score);
    const modDisplay = document.getElementById(`${ability}-mod`);
    modDisplay.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;

    if (ability === 'dex') {
        const initiativeModDisplay = document.getElementById('char-initiative-mod');
        initiativeModDisplay.textContent = modifier >= 0 ? `+${modifier}` : `${modifier}`;
    }
}

// Update all skill modifiers based on ability scores and proficiencies
function updateSkillModifiers() {
    const level = parseInt(document.getElementById('char-level').value) || 1;
    const profBonus = calculateProficiencyBonus(level);

    DND_SKILLS.forEach((skill, index) => {
        const checkbox = document.getElementById(`skill-${index}`);
        const modDisplay = document.getElementById(`skill-mod-${index}`);
        const abilityScore = parseInt(document.getElementById(`char-${skill.ability}`).value) || 10;
        const abilityMod = calculateModifier(abilityScore);
        const isProficient = checkbox.checked;

        const totalMod = abilityMod + (isProficient ? profBonus : 0);
        modDisplay.textContent = totalMod >= 0 ? `+${totalMod}` : `${totalMod}`;
    });
}

// Apply standard array (15, 14, 13, 12, 10, 8)
function applyStandardArray() {
    const standardArray = [15, 14, 13, 12, 10, 8];
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    abilities.forEach((ability, index) => {
        document.getElementById(`char-${ability}`).value = standardArray[index];
        updateAbilityModifier(ability);
    });

    updateSkillModifiers();
}

// Roll 4d6 drop lowest for stats
function rollStats() {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    abilities.forEach(ability => {
        // Roll 4d6
        const rolls = [];
        for (let i = 0; i < 4; i++) {
            rolls.push(Math.floor(Math.random() * 6) + 1);
        }

        // Sort and drop lowest
        rolls.sort((a, b) => b - a);
        const total = rolls[0] + rolls[1] + rolls[2];

        document.getElementById(`char-${ability}`).value = total;
        updateAbilityModifier(ability);
    });

    updateSkillModifiers();
    alert('Stats rolled! Review and adjust as needed.');
}

// Update character based on selected class
function updateCharacterFromClass() {
    const selectedClass = document.getElementById('char-class').value;
    if (!selectedClass) return;

    const classData = CLASS_DATA[selectedClass];
    if (!classData) return;

    const level = parseInt(document.getElementById('char-level').value) || 1;
    const conMod = calculateModifier(parseInt(document.getElementById('char-con').value) || 10);

    // Calculate HP (class hit dice + CON modifier per level)
    const hp = classData.hitDice + (classData.hitDice / 2 + 1) * (level - 1) + (conMod * level);
    document.getElementById('char-hp').value = Math.floor(hp);
}

// Update character based on level
function updateCharacterFromLevel() {
    updateCharacterFromClass();
    updateSkillModifiers();
}

// Update character based on selected race
function updateCharacterFromRace() {
    const selectedRace = document.getElementById('char-race').value;
    if (!selectedRace) return;

    const raceData = RACE_DATA[selectedRace];
    if (!raceData) return;

    // Update speed
    document.getElementById('char-speed').value = raceData.speed;

    // Note: Racial ability score bonuses should be applied manually by the user
    // to avoid overwriting their chosen scores
}

// Get character data from form into an object
function getCharacterDataFromForm() {
    const character = {
        id: currentCharacter?.id || null, // Keep id for updates, but it can be null for new characters
        agentType: document.getElementById('char-agent-type').value,
        name: document.getElementById('char-name').value,
        race: document.getElementById('char-race').value,
        class: document.getElementById('char-class').value,
        level: parseInt(document.getElementById('char-level').value),
        abilities: {
            str: parseInt(document.getElementById('char-str').value),
            dex: parseInt(document.getElementById('char-dex').value),
            con: parseInt(document.getElementById('char-con').value),
            int: parseInt(document.getElementById('char-int').value),
            wis: parseInt(document.getElementById('char-wis').value),
            cha: parseInt(document.getElementById('char-cha').value)
        },
        hp: parseInt(document.getElementById('char-hp').value),
        ac: parseInt(document.getElementById('char-ac').value),
        speed: parseInt(document.getElementById('char-speed').value),
        skills: [],
        attacks: currentCharacter?.attacks || [],
        notes: document.getElementById('char-notes').value,
        imagePath: document.getElementById('char-image-path').value || null
    };

    // Get proficient skills
    DND_SKILLS.forEach((skill, index) => {
        const checkbox = document.getElementById(`skill-${index}`);
        if (checkbox.checked) {
            character.skills.push(skill.name);
        }
    });

    return character;
}

// Handle save character
async function handleSaveCharacter(e) {
    e.preventDefault();

    const characterData = getCharacterDataFromForm();

    console.log('[handleSaveCharacter] Character data to save:', characterData);
    console.log('[handleSaveCharacter] Attacks in data:', characterData.attacks);

    // Ensure character has an ID for saving
    if (!characterData.id) {
        characterData.id = `char-${Date.now()}`;
    }

    try {
        const response = await fetch(`${API_BASE}/characters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(characterData)
        });

        if (response.ok) {
            alert(`Character "${characterData.name}" saved successfully!`);
            await loadSavedCharacters();

            // Also refresh agents list in combat view
            if (typeof loadSavedAgents === 'function') {
                await loadSavedAgents();
            }
            if (typeof renderAgentsList === 'function') {
                renderAgentsList();
            }

            currentCharacter = savedCharacters.find(c => c.id === characterData.id);
            if (currentCharacter) {
                populateFormWithData(currentCharacter);
            } else {
                populateFormWithData(characterData);
            }
        }
    } catch (error) {
        console.error('Error saving character:', error);
        alert('Failed to save character');
    }
}

// Handle download character as JSON
function handleDownloadJson() {
    const characterData = getCharacterDataFromForm();

    // Don't include the ID in the template
    delete characterData.id;

    const characterName = characterData.name.trim().replace(/\s+/g, '_') || 'character_template';
    const filename = `${characterName}.json`;

    const jsonString = JSON.stringify(characterData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

// Handle upload character from JSON
async function handleJsonUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async function(e) {
        try {
            const characterData = JSON.parse(e.target.result);

            // Ensure character has an ID for saving
            if (!characterData.id) {
                characterData.id = `char-${Date.now()}`;
            }

            // Ensure required fields have defaults
            if (!characterData.agentType) {
                characterData.agentType = 'p';
            }
            if (!characterData.skills) {
                characterData.skills = [];
            }

            // Save the character to the server
            const response = await fetch(`${API_BASE}/characters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(characterData)
            });

            if (response.ok) {
                alert(`Character "${characterData.name}" uploaded and saved successfully!`);

                // Reload saved characters list
                await loadSavedCharacters();

                // Also refresh agents list in combat view
                if (typeof loadSavedAgents === 'function') {
                    await loadSavedAgents();
                }
                if (typeof renderAgentsList === 'function') {
                    renderAgentsList();
                }

                // Optionally load the character into the form for review
                clearCharacterForm();
                populateFormWithData(characterData);
            } else {
                alert('Error: Failed to save character to server.');
            }

        } catch (error) {
            console.error('Error parsing or saving JSON file:', error);
            alert('Error: Could not parse the selected file. Please ensure it is a valid character JSON.');
        }
    };

    reader.onerror = function() {
        alert('Error reading file.');
    };

    reader.readAsText(file);

    // Reset the file input so the same file can be loaded again
    event.target.value = '';
}

async function handleCharacterImageUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const preview = document.getElementById('char-image-preview');
    const statusText = document.getElementById('char-image-status');

    if (statusText) {
        statusText.textContent = 'Uploading...';
    }

    const formData = new FormData();
    formData.append('characterImage', file);

    try {
        const response = await fetch(`${API_BASE}/uploads/characters`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        const data = await response.json();
        if (preview) {
            preview.src = data.path;
            preview.style.display = 'block';
        }

        const hiddenInput = document.getElementById('char-image-path');
        if (hiddenInput) {
            hiddenInput.value = data.path;
        }

        if (statusText) {
            statusText.textContent = 'Image uploaded successfully';
        }
    } catch (error) {
        console.error('Error uploading character image:', error);
        if (statusText) {
            statusText.textContent = 'Upload failed';
        }
    }
}

// Load saved characters
async function loadSavedCharacters() {
    try {
        const response = await fetch(`${API_BASE}/characters`);
        savedCharacters = await response.json();
        renderCharactersList();
    } catch (error) {
        console.error('Error loading characters:', error);
    }
}

// Render characters list
function renderCharactersList() {
    const container = document.getElementById('characters-list');

    if (savedCharacters.length === 0) {
        container.innerHTML = '<div class="empty-state">No characters saved yet</div>';
        return;
    }

    container.innerHTML = '';

    savedCharacters.forEach(char => {
        const card = document.createElement('div');
        card.className = 'character-list-card';

        const classLevel = char.class && char.level ? `${char.class} ${char.level}` : 'No class';
        const raceInfo = char.race ? char.race : '';

        const portrait = char.imagePath ? `<img class="character-list-portrait" src="${char.imagePath}" alt="${char.name} portrait">` : '';

        card.innerHTML = `
            <div class="character-card-header">
                <div class="character-card-info">
            <div class="character-list-name">${char.name}</div>
            <div class="character-list-info">${raceInfo} ${classLevel}</div>
            <div class="character-list-info">HP: ${char.hp} | AC: ${char.ac}</div>
                </div>
                ${portrait}
            </div>
            <div class="character-list-actions">
                <button class="btn btn-small btn-primary" onclick="loadCharacterToForm('${char.id}')">Edit</button>
                <button class="btn btn-small btn-secondary" onclick="addCharacterToCombat('${char.id}')">Add to Combat</button>
                <button class="btn btn-small btn-danger" onclick="deleteCharacter('${char.id}')">Delete</button>
            </div>
        `;

        container.appendChild(card);
    });
}

// Load character into form for editing
async function loadCharacterToForm(charId) {
    const character = savedCharacters.find(c => c.id === charId);
    if (!character) return;

    currentCharacter = character;
    populateFormWithData(character);
}

// Populate the character form with data from an object
function populateFormWithData(character) {
    document.getElementById('char-agent-type').value = character.agentType || 'player';
    document.getElementById('char-name').value = character.name;
    document.getElementById('char-race').value = character.race || '';
    document.getElementById('char-class').value = character.class || '';
    document.getElementById('char-level').value = character.level;
    document.getElementById('char-str').value = character.abilities.str;
    document.getElementById('char-dex').value = character.abilities.dex;
    document.getElementById('char-con').value = character.abilities.con;
    document.getElementById('char-int').value = character.abilities.int;
    document.getElementById('char-wis').value = character.abilities.wis;
    document.getElementById('char-cha').value = character.abilities.cha;
    document.getElementById('char-hp').value = character.hp;
    document.getElementById('char-ac').value = character.ac;
    document.getElementById('char-speed').value = character.speed;
    document.getElementById('char-notes').value = character.notes || '';

    const imagePathInput = document.getElementById('char-image-path');
    const preview = document.getElementById('char-image-preview');
    const statusText = document.getElementById('char-image-status');

    if (imagePathInput) {
        imagePathInput.value = character.imagePath || '';
    }

    if (preview) {
        if (character.imagePath) {
            preview.src = character.imagePath;
            preview.style.display = 'block';
        } else {
            preview.src = '';
            preview.style.display = 'none';
        }
    }

    if (statusText) {
        statusText.textContent = character.imagePath ? 'Image loaded' : '';
    }

    // Update modifiers
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        updateAbilityModifier(ability);
    });

    // Set skills
    DND_SKILLS.forEach((skill, index) => {
        const checkbox = document.getElementById(`skill-${index}`);
        checkbox.checked = character.skills.includes(skill.name);
    });

    updateSkillModifiers();

    // Load attacks if they exist
    if (character.attacks && character.attacks.length > 0) {
        renderAttacksList();
    }

    // Scroll to top of form
    document.querySelector('.character-form-section').scrollTop = 0;
}

// Add character to combat
async function addCharacterToCombat(charId) {
    const character = savedCharacters.find(c => c.id === charId);
    if (!character) return;

    const dexMod = calculateModifier(character.abilities.dex);

    try {
        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: character.name,
                type: character.agentType,
                hp: character.hp,
                ac: character.ac,
                dexModifier: dexMod,
                initiative: 0,
                imagePath: character.imagePath || null
            })
        });

        if (response.ok) {
            alert(`${character.name} added to combat!`);
            switchView('combat');
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error adding character to combat:', error);
        alert('Failed to add character to combat');
    }
}

// Delete character
async function deleteCharacter(charId) {
    const character = savedCharacters.find(c => c.id === charId);
    if (!character) return;

    const confirmed = confirm(`Delete character "${character.name}"?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/characters/${charId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadSavedCharacters();

            // Also refresh agents list in combat view
            if (typeof loadSavedAgents === 'function') {
                await loadSavedAgents();
            }
            if (typeof renderAgentsList === 'function') {
                renderAgentsList();
            }
        }
    } catch (error) {
        console.error('Error deleting character:', error);
        alert('Failed to delete character');
    }
}

// Clear character form
function clearCharacterForm() {
    currentCharacter = null;
    document.getElementById('character-form').reset();

    // Reset to default values
    document.getElementById('char-level').value = 1;
    document.getElementById('char-hp').value = 10;
    document.getElementById('char-ac').value = 10;
    document.getElementById('char-speed').value = 30;

    const imagePreview = document.getElementById('char-image-preview');
    const imagePathInput = document.getElementById('char-image-path');
    const statusText = document.getElementById('char-image-status');

    if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }

    if (imagePathInput) {
        imagePathInput.value = '';
    }

    if (statusText) {
        statusText.textContent = '';
    }

    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        document.getElementById(`char-${ability}`).value = 10;
        updateAbilityModifier(ability);
    });

    // Uncheck all skills
    DND_SKILLS.forEach((skill, index) => {
        document.getElementById(`skill-${index}`).checked = false;
    });

    updateSkillModifiers();

    // Clear attacks list
    document.getElementById('attacks-list').innerHTML = '';
}

// Add attack to form
function addAttackToForm() {
    // Initialize currentCharacter if it doesn't exist
    if (!currentCharacter) {
        currentCharacter = {
            id: null,
            attacks: []
        };
    }
    if (!currentCharacter.attacks) {
        currentCharacter.attacks = [];
    }

    const attackId = `attack-${Date.now()}`;
    const attack = {
        id: attackId,
        name: '',
        attackBonus: 0,
        damageDice: '1d6',
        damageType: 'slashing'
    };

    currentCharacter.attacks.push(attack);
    renderAttacksList();

    console.log('[addAttackToForm] Current attacks:', currentCharacter.attacks);
}

// Render attacks list
function renderAttacksList() {
    const container = document.getElementById('attacks-list');

    if (!currentCharacter || !currentCharacter.attacks || currentCharacter.attacks.length === 0) {
        container.innerHTML = '<div class="empty-state">No attacks added yet</div>';
        return;
    }

    container.innerHTML = '';

    currentCharacter.attacks.forEach((attack, index) => {
        const attackDiv = document.createElement('div');
        attackDiv.className = 'attack-item';
        attackDiv.innerHTML = `
            <div class="attack-inputs">
                <input type="text" placeholder="Attack name" class="form-input" value="${attack.name || ''}"
                       onchange="updateAttackField(${index}, 'name', this.value)">
                <input type="number" placeholder="+0" class="form-input attack-bonus-input" value="${attack.attackBonus || 0}"
                       onchange="updateAttackField(${index}, 'attackBonus', parseInt(this.value))">
                <input type="text" placeholder="1d6" class="form-input attack-damage-input" value="${attack.damageDice || '1d6'}"
                       onchange="updateAttackField(${index}, 'damageDice', this.value)">
                <select class="form-input attack-type-input" onchange="updateAttackField(${index}, 'damageType', this.value)">
                    <option value="slashing" ${attack.damageType === 'slashing' ? 'selected' : ''}>Slashing</option>
                    <option value="piercing" ${attack.damageType === 'piercing' ? 'selected' : ''}>Piercing</option>
                    <option value="bludgeoning" ${attack.damageType === 'bludgeoning' ? 'selected' : ''}>Bludgeoning</option>
                    <option value="fire" ${attack.damageType === 'fire' ? 'selected' : ''}>Fire</option>
                    <option value="cold" ${attack.damageType === 'cold' ? 'selected' : ''}>Cold</option>
                    <option value="lightning" ${attack.damageType === 'lightning' ? 'selected' : ''}>Lightning</option>
                    <option value="acid" ${attack.damageType === 'acid' ? 'selected' : ''}>Acid</option>
                    <option value="poison" ${attack.damageType === 'poison' ? 'selected' : ''}>Poison</option>
                    <option value="psychic" ${attack.damageType === 'psychic' ? 'selected' : ''}>Psychic</option>
                    <option value="necrotic" ${attack.damageType === 'necrotic' ? 'selected' : ''}>Necrotic</option>
                    <option value="radiant" ${attack.damageType === 'radiant' ? 'selected' : ''}>Radiant</option>
                    <option value="force" ${attack.damageType === 'force' ? 'selected' : ''}>Force</option>
                </select>
                <button type="button" class="btn btn-danger btn-small" onclick="removeAttack(${index})">Remove</button>
            </div>
        `;
        container.appendChild(attackDiv);
    });
}

// Update attack field
function updateAttackField(index, field, value) {
    if (!currentCharacter || !currentCharacter.attacks || !currentCharacter.attacks[index]) return;
    currentCharacter.attacks[index][field] = value;
}

// Remove attack
function removeAttack(index) {
    if (!currentCharacter || !currentCharacter.attacks) return;
    currentCharacter.attacks.splice(index, 1);
    renderAttacksList();
}

// Make functions globally available
window.updateAttackField = updateAttackField;
window.removeAttack = removeAttack;
