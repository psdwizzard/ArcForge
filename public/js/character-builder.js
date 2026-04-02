// Mutants & Masterminds 3e Skills with their associated abilities
const MM_SKILLS = [
    { name: 'Acrobatics', ability: 'agl' },
    { name: 'Athletics', ability: 'str' },
    { name: 'Close Combat', ability: 'fgt', ranked: true },
    { name: 'Deception', ability: 'pre' },
    { name: 'Expertise', ability: 'int', ranked: true },
    { name: 'Insight', ability: 'awe' },
    { name: 'Intimidation', ability: 'pre' },
    { name: 'Investigation', ability: 'int' },
    { name: 'Perception', ability: 'awe' },
    { name: 'Persuasion', ability: 'pre' },
    { name: 'Ranged Combat', ability: 'dex', ranked: true },
    { name: 'Sleight of Hand', ability: 'dex' },
    { name: 'Stealth', ability: 'agl' },
    { name: 'Technology', ability: 'int' },
    { name: 'Treatment', ability: 'int' },
    { name: 'Vehicles', ability: 'dex' }
];

// M&M ability abbreviations
const MM_ABILITIES = ['str', 'sta', 'agl', 'dex', 'fgt', 'int', 'awe', 'pre'];

// Defense definitions: each defense has a base ability
const MM_DEFENSES = {
    dodge:     { ability: 'agl' },
    parry:     { ability: 'fgt' },
    fortitude: { ability: 'sta' },
    will:      { ability: 'awe' },
    toughness: { ability: 'sta' }
};

// Current character state
let currentCharacter = null;
let savedCharacters = [];
window.savedCharacters = savedCharacters;

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

    const crucibleTabs = document.querySelectorAll('#crucible-tabs .codex-tab-btn');

    crucibleTabs.forEach(btn => {
        btn.addEventListener('click', () => switchCrucibleSection(btn.dataset.section));
    });
}

// Populate skills list with rank inputs (not checkboxes)
function populateSkills() {
    const skillsList = document.getElementById('skills-list');
    if (!skillsList) return;
    skillsList.innerHTML = '';

    MM_SKILLS.forEach((skill, index) => {
        const abilityVal = getAbilityValue(skill.ability);
        const skillItem = document.createElement('div');
        skillItem.className = 'skill-item';
        skillItem.innerHTML = `
            <label for="skill-${index}">${skill.name} (${skill.ability.toUpperCase()})</label>
            <input type="number" id="skill-${index}" data-skill="${skill.name}" data-ability="${skill.ability}" class="form-input skill-rank-input" min="0" max="20" value="0">
            <span class="skill-modifier" id="skill-mod-${index}">${formatMod(abilityVal)}</span>
        `;
        skillsList.appendChild(skillItem);

        // Attach listener for rank changes to update total
        const input = skillItem.querySelector(`#skill-${index}`);
        input.addEventListener('input', () => updateSkillTotal(index));
    });
}

// Format modifier for display
function formatMod(val) {
    return val >= 0 ? `+${val}` : `${val}`;
}

// Get an ability value from the form (M&M abilities ARE direct modifiers)
function getAbilityValue(ability) {
    const el = document.getElementById(`char-${ability}`);
    return el ? (parseInt(el.value) || 0) : 0;
}

// Update a single skill total display
function updateSkillTotal(index) {
    const skill = MM_SKILLS[index];
    const ranks = parseInt(document.getElementById(`skill-${index}`).value) || 0;
    const abilityVal = getAbilityValue(skill.ability);
    const total = abilityVal + ranks;
    const modDisplay = document.getElementById(`skill-mod-${index}`);
    if (modDisplay) {
        modDisplay.textContent = formatMod(total);
    }
}

// Update all skill totals (called when an ability value changes)
function updateAllSkillTotals() {
    MM_SKILLS.forEach((skill, index) => {
        updateSkillTotal(index);
    });
}

// Update defense base values from abilities
function updateDefenses() {
    Object.entries(MM_DEFENSES).forEach(([defense, def]) => {
        const abilityVal = getAbilityValue(def.ability);
        const defenseInput = document.getElementById(`char-${defense}`);
        if (defenseInput) {
            // Defense value = base ability + purchased ranks
            // We store total in the input; the base label shows the ability contribution
            const baseLabel = document.getElementById(`${defense}-base`);
            if (baseLabel) {
                baseLabel.textContent = `Base: ${formatMod(abilityVal)}`;
            }
        }
    });
}

// Attach event listeners for character builder
function attachCharacterBuilderListeners() {
    // Navigation
    document.getElementById('nav-arena-btn').addEventListener('click', () => switchView('arena'));
    document.getElementById('nav-crucible-btn').addEventListener('click', () => switchView('crucible'));
    document.getElementById('nav-atlas-btn').addEventListener('click', () => switchView('atlas'));
    document.getElementById('nav-codex-btn').addEventListener('click', () => switchView('codex'));

    // Ability value changes - update defenses and skills
    MM_ABILITIES.forEach(ability => {
        const el = document.getElementById(`char-${ability}`);
        if (el) {
            el.addEventListener('input', () => {
                updateDefenses();
                updateAllSkillTotals();
            });
        }
    });

    // PL 10 Template button
    const pl10Btn = document.getElementById('pl10-template-btn');
    if (pl10Btn) {
        pl10Btn.addEventListener('click', applyPL10Template);
    }

    // Character form submission
    document.getElementById('character-form').addEventListener('submit', handleSaveCharacter);

    // Clear form button
    document.getElementById('clear-form-btn').addEventListener('click', clearCharacterForm);

    // Download JSON button
    document.getElementById('download-json-btn').addEventListener('click', handleDownloadJson);

    // Download template button
    const downloadTemplateBtn = document.getElementById('download-template-btn');
    if (downloadTemplateBtn) {
        downloadTemplateBtn.addEventListener('click', downloadCharacterTemplate);
    }

    // Upload JSON button
    const uploadJsonBtn = document.getElementById('upload-json-btn');
    const uploadJsonInput = document.getElementById('upload-json-input');
    if (uploadJsonBtn && uploadJsonInput) {
        uploadJsonBtn.addEventListener('click', () => uploadJsonInput.click());
        uploadJsonInput.addEventListener('change', handleJsonUpload);
    }

    // Add attack button
    document.getElementById('add-attack-btn').addEventListener('click', addAttackToForm);

    // Add power button
    const addPowerBtn = document.getElementById('add-power-btn');
    if (addPowerBtn) {
        addPowerBtn.addEventListener('click', addPowerToForm);
    }

    // Add advantage button
    const addAdvantageBtn = document.getElementById('add-advantage-btn');
    if (addAdvantageBtn) {
        addAdvantageBtn.addEventListener('click', addAdvantageToForm);
    }

    // Add complication button
    const addComplicationBtn = document.getElementById('add-complication-btn');
    if (addComplicationBtn) {
        addComplicationBtn.addEventListener('click', addComplicationToForm);
    }

    // Image upload
    const imageInput = document.getElementById('char-image');
    if (imageInput) {
        imageInput.addEventListener('change', handleCharacterImageUpload);
    }
}

// Apply PL 10 Template - fills in typical PL 10 starting values
function applyPL10Template() {
    // Set PL and PP
    const plInput = document.getElementById('char-power-level');
    const ppInput = document.getElementById('char-power-points');
    const hpInput = document.getElementById('char-hero-points');
    if (plInput) plInput.value = 10;
    if (ppInput) ppInput.value = 150;
    if (hpInput) hpInput.value = 1;

    // Typical PL 10 abilities
    const templateAbilities = { str: 2, sta: 2, agl: 2, dex: 2, fgt: 4, int: 1, awe: 2, pre: 1 };
    MM_ABILITIES.forEach(ability => {
        const el = document.getElementById(`char-${ability}`);
        if (el) el.value = templateAbilities[ability] || 0;
    });

    // Typical PL 10 defenses (total values including ability base)
    const defenseInputs = {
        dodge: 10,
        parry: 10,
        fortitude: 10,
        will: 10,
        toughness: 10
    };
    Object.entries(defenseInputs).forEach(([defense, val]) => {
        const el = document.getElementById(`char-${defense}`);
        if (el) el.value = val;
    });

    updateDefenses();
    updateAllSkillTotals();
    alert('PL 10 template applied! Adjust values as needed.');
}

// Switch between views
function switchView(view) {
    const arenaView = document.getElementById('arena-view');
    const crucibleView = document.getElementById('crucible-view');
    const crucibleChar = document.getElementById('crucible-character-section');
    const crucibleEffects = document.getElementById('crucible-effects-section');
    const crucibleItems = document.getElementById('crucible-items-section');
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
        if (crucibleChar && crucibleEffects && crucibleItems) {
            switchCrucibleSection('character');
        }
    } else if (view === 'crucible') {
        if (crucibleView) {
            crucibleView.style.display = 'block';
        }
        if (crucibleBtn) {
            crucibleBtn.classList.add('active');
        }
        if (crucibleChar && crucibleEffects && crucibleItems) {
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
        items: document.getElementById('crucible-items-section'),
        monsters: document.getElementById('crucible-monsters-section')
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
        } else if (section === 'items') {
            if (typeof loadItemsData === 'function') {
                loadItemsData();
            }
        } else if (section === 'monsters') {
            if (typeof loadMonstersData === 'function') {
                loadMonstersData();
            }
        }
    }

    document.querySelectorAll('#crucible-tabs .codex-tab-btn').forEach(btn => btn.classList.remove('active'));

    const tabBtn = document.querySelector(`#crucible-tabs .codex-tab-btn[data-section="${section}"]`);
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
}

// Get character data from form into an object (M&M 3e schema)
function getCharacterDataFromForm() {
    const character = {
        id: currentCharacter?.id || null,
        agentType: document.getElementById('char-agent-type').value,
        name: document.getElementById('char-name').value,
        powerLevel: parseInt(document.getElementById('char-power-level')?.value) || 10,
        powerPoints: parseInt(document.getElementById('char-power-points')?.value) || 150,
        heroPoints: parseInt(document.getElementById('char-hero-points')?.value) || 1,
        abilities: {},
        defenses: {},
        skills: {},
        attacks: currentCharacter?.attacks || [],
        powers: currentCharacter?.powers || [],
        advantages: currentCharacter?.advantages || [],
        complications: currentCharacter?.complications || [],
        notes: document.getElementById('char-notes').value,
        imagePath: document.getElementById('char-image-path').value || null
    };

    // Abilities
    MM_ABILITIES.forEach(ability => {
        character.abilities[ability] = parseInt(document.getElementById(`char-${ability}`)?.value) || 0;
    });

    // Defenses
    Object.keys(MM_DEFENSES).forEach(defense => {
        character.defenses[defense] = parseInt(document.getElementById(`char-${defense}`)?.value) || 0;
    });

    // Skills (ranks only)
    MM_SKILLS.forEach((skill, index) => {
        const ranks = parseInt(document.getElementById(`skill-${index}`)?.value) || 0;
        if (ranks > 0) {
            character.skills[skill.name] = ranks;
        }
    });

    return character;
}

// Handle save character
async function handleSaveCharacter(e) {
    e.preventDefault();

    const characterData = getCharacterDataFromForm();

    console.log('[handleSaveCharacter] Character data to save:', characterData);

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

    // Don't include the ID in the download
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

function downloadCharacterTemplate() {
    const template = {
        agentType: 'p',
        name: 'Hero Name',
        powerLevel: 10,
        powerPoints: 150,
        heroPoints: 1,
        abilities: {
            str: 0, sta: 0, agl: 0, dex: 0,
            fgt: 0, int: 0, awe: 0, pre: 0
        },
        defenses: {
            dodge: 0, parry: 0, fortitude: 0, will: 0, toughness: 0
        },
        skills: {},
        attacks: [],
        powers: [
            { name: '', type: '', rank: 0, extras: '', flaws: '', descriptors: '', cost: 0, notes: '' }
        ],
        advantages: [
            { name: '', ranks: 1, notes: '' }
        ],
        complications: [
            { type: 'Motivation', description: '' },
            { type: 'Identity', description: '' }
        ],
        notes: '',
        imagePath: null
    };

    const filename = 'mm3e_character_template.json';
    const jsonString = JSON.stringify(template, null, 2);
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
                characterData.skills = {};
            }
            if (!characterData.attacks) {
                characterData.attacks = [];
            }
            if (!characterData.powers) {
                characterData.powers = [];
            }
            if (!characterData.advantages) {
                characterData.advantages = [];
            }
            if (!characterData.complications) {
                characterData.complications = [];
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

                // Load the character into the form for review
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

// Render characters list (M&M format: PL, defenses)
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

        const plInfo = char.powerLevel ? `PL ${char.powerLevel}` : 'PL ?';
        const defenses = char.defenses || {};
        const defLine = `Dodge ${defenses.dodge || 0} | Parry ${defenses.parry || 0} | Tough ${defenses.toughness || 0} | Fort ${defenses.fortitude || 0} | Will ${defenses.will || 0}`;

        const portrait = char.imagePath ? `<img class="character-list-portrait" src="${char.imagePath}" alt="${char.name} portrait">` : '';

        card.innerHTML = `
            <div class="character-card-header">
                <div class="character-card-info">
                    <div class="character-list-name">${char.name}</div>
                    <div class="character-list-info">${plInfo} | ${char.powerPoints || 0} PP</div>
                    <div class="character-list-info">${defLine}</div>
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

// Populate the character form with data from an object (M&M 3e schema)
function populateFormWithData(character) {
    document.getElementById('char-agent-type').value = character.agentType || 'player';
    document.getElementById('char-name').value = character.name || '';

    // Power Level, Power Points, Hero Points
    const plInput = document.getElementById('char-power-level');
    const ppInput = document.getElementById('char-power-points');
    const hpInput = document.getElementById('char-hero-points');
    if (plInput) plInput.value = character.powerLevel || 10;
    if (ppInput) ppInput.value = character.powerPoints || 150;
    if (hpInput) hpInput.value = character.heroPoints || 1;

    // Abilities
    const abilities = character.abilities || {};
    MM_ABILITIES.forEach(ability => {
        const el = document.getElementById(`char-${ability}`);
        if (el) el.value = abilities[ability] || 0;
    });

    // Defenses
    const defenses = character.defenses || {};
    Object.keys(MM_DEFENSES).forEach(defense => {
        const el = document.getElementById(`char-${defense}`);
        if (el) el.value = defenses[defense] || 0;
    });

    // Notes
    document.getElementById('char-notes').value = character.notes || '';

    // Image
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

    // Skills (rank-based)
    const skills = character.skills || {};
    MM_SKILLS.forEach((skill, index) => {
        const input = document.getElementById(`skill-${index}`);
        if (input) {
            input.value = skills[skill.name] || 0;
        }
    });

    // Update computed values
    updateDefenses();
    updateAllSkillTotals();

    // Ensure currentCharacter has arrays for dynamic lists
    if (!currentCharacter) {
        currentCharacter = { ...character };
    }
    if (!currentCharacter.attacks) currentCharacter.attacks = [];
    if (!currentCharacter.powers) currentCharacter.powers = [];
    if (!currentCharacter.advantages) currentCharacter.advantages = [];
    if (!currentCharacter.complications) currentCharacter.complications = [];

    // Copy arrays from loaded data
    if (character.attacks) currentCharacter.attacks = [...character.attacks];
    if (character.powers) currentCharacter.powers = [...character.powers];
    if (character.advantages) currentCharacter.advantages = [...character.advantages];
    if (character.complications) currentCharacter.complications = [...character.complications];

    // Render dynamic lists
    renderAttacksList();
    renderPowersList();
    renderAdvantagesList();
    renderComplicationsList();

    // Scroll to top of form
    const formSection = document.querySelector('.character-form-section');
    if (formSection) formSection.scrollTop = 0;
}

// Add character to combat (M&M version)
async function addCharacterToCombat(charId) {
    const character = savedCharacters.find(c => c.id === charId);
    if (!character) return;

    const defenses = character.defenses || {};

    try {
        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: character.name,
                type: character.agentType,
                hp: defenses.toughness || 0,
                ac: defenses.dodge || 0,
                dexModifier: character.abilities?.agl || 0,
                initiative: 0,
                imagePath: character.imagePath || null,
                sourceId: character.id
            })
        });

        if (response.ok) {
            alert(`${character.name} added to combat!`);
            switchView('combat');
            if (typeof loadEncounterState === 'function') {
                await loadEncounterState();
            }
            if (typeof renderCombatantsList === 'function') {
                renderCombatantsList();
            }
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
    const plInput = document.getElementById('char-power-level');
    const ppInput = document.getElementById('char-power-points');
    const hpInput = document.getElementById('char-hero-points');
    if (plInput) plInput.value = 10;
    if (ppInput) ppInput.value = 150;
    if (hpInput) hpInput.value = 1;

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

    // Reset abilities to 0 (M&M abilities are direct modifiers)
    MM_ABILITIES.forEach(ability => {
        const el = document.getElementById(`char-${ability}`);
        if (el) el.value = 0;
    });

    // Reset defenses to 0
    Object.keys(MM_DEFENSES).forEach(defense => {
        const el = document.getElementById(`char-${defense}`);
        if (el) el.value = 0;
    });

    // Reset skill ranks to 0
    MM_SKILLS.forEach((skill, index) => {
        const input = document.getElementById(`skill-${index}`);
        if (input) input.value = 0;
    });

    updateDefenses();
    updateAllSkillTotals();

    // Clear dynamic lists
    const attacksList = document.getElementById('attacks-list');
    if (attacksList) attacksList.innerHTML = '';

    const powersList = document.getElementById('powers-list');
    if (powersList) powersList.innerHTML = '';

    const advantagesList = document.getElementById('advantages-list');
    if (advantagesList) advantagesList.innerHTML = '';

    const complicationsList = document.getElementById('complications-list');
    if (complicationsList) complicationsList.innerHTML = '';
}

// ==================== ATTACKS ====================

// Add attack to form (M&M format)
function addAttackToForm() {
    if (!currentCharacter) {
        currentCharacter = { id: null, attacks: [], powers: [], advantages: [], complications: [] };
    }
    if (!currentCharacter.attacks) {
        currentCharacter.attacks = [];
    }

    const attack = {
        name: '',
        type: 'close',
        attackBonus: 0,
        effectRank: 0,
        resistedBy: 'toughness',
        notes: ''
    };

    currentCharacter.attacks.push(attack);
    renderAttacksList();
}

// Render attacks list (M&M format)
function renderAttacksList() {
    const container = document.getElementById('attacks-list');
    if (!container) return;

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
                <select class="form-input attack-type-input" onchange="updateAttackField(${index}, 'type', this.value)">
                    <option value="close" ${attack.type === 'close' ? 'selected' : ''}>Close</option>
                    <option value="ranged" ${attack.type === 'ranged' ? 'selected' : ''}>Ranged</option>
                </select>
                <input type="number" placeholder="+0" class="form-input attack-bonus-input" value="${attack.attackBonus || 0}"
                       onchange="updateAttackField(${index}, 'attackBonus', parseInt(this.value))" title="Attack Bonus">
                <input type="number" placeholder="Rank" class="form-input attack-rank-input" value="${attack.effectRank || 0}"
                       onchange="updateAttackField(${index}, 'effectRank', parseInt(this.value))" title="Effect Rank">
                <select class="form-input attack-resist-input" onchange="updateAttackField(${index}, 'resistedBy', this.value)">
                    <option value="toughness" ${attack.resistedBy === 'toughness' ? 'selected' : ''}>vs Toughness</option>
                    <option value="fortitude" ${attack.resistedBy === 'fortitude' ? 'selected' : ''}>vs Fortitude</option>
                    <option value="will" ${attack.resistedBy === 'will' ? 'selected' : ''}>vs Will</option>
                </select>
                <input type="text" placeholder="Notes" class="form-input attack-notes-input" value="${attack.notes || ''}"
                       onchange="updateAttackField(${index}, 'notes', this.value)">
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

// ==================== POWERS ====================

// Add power to form
function addPowerToForm() {
    if (!currentCharacter) {
        currentCharacter = { id: null, attacks: [], powers: [], advantages: [], complications: [] };
    }
    if (!currentCharacter.powers) {
        currentCharacter.powers = [];
    }

    const power = {
        name: '',
        type: '',
        rank: 1,
        extras: '',
        flaws: '',
        descriptors: '',
        cost: 0,
        notes: ''
    };

    currentCharacter.powers.push(power);
    renderPowersList();
}

// Render powers list
function renderPowersList() {
    const container = document.getElementById('powers-list');
    if (!container) return;

    if (!currentCharacter || !currentCharacter.powers || currentCharacter.powers.length === 0) {
        container.innerHTML = '<div class="empty-state">No powers added yet</div>';
        return;
    }

    container.innerHTML = '';

    currentCharacter.powers.forEach((power, index) => {
        const powerDiv = document.createElement('div');
        powerDiv.className = 'power-item';
        powerDiv.innerHTML = `
            <div class="power-inputs">
                <input type="text" placeholder="Power name" class="form-input" value="${power.name || ''}"
                       onchange="updatePowerField(${index}, 'name', this.value)">
                <input type="text" placeholder="Type (e.g. Damage, Move)" class="form-input" value="${power.type || ''}"
                       onchange="updatePowerField(${index}, 'type', this.value)">
                <input type="number" placeholder="Rank" class="form-input power-rank-input" min="0" value="${power.rank || 1}"
                       onchange="updatePowerField(${index}, 'rank', parseInt(this.value))">
                <input type="text" placeholder="Extras" class="form-input" value="${power.extras || ''}"
                       onchange="updatePowerField(${index}, 'extras', this.value)">
                <input type="text" placeholder="Flaws" class="form-input" value="${power.flaws || ''}"
                       onchange="updatePowerField(${index}, 'flaws', this.value)">
                <input type="text" placeholder="Descriptors" class="form-input" value="${power.descriptors || ''}"
                       onchange="updatePowerField(${index}, 'descriptors', this.value)">
                <input type="number" placeholder="Cost" class="form-input power-cost-input" value="${power.cost || 0}"
                       onchange="updatePowerField(${index}, 'cost', parseInt(this.value))">
                <input type="text" placeholder="Notes" class="form-input" value="${power.notes || ''}"
                       onchange="updatePowerField(${index}, 'notes', this.value)">
                <button type="button" class="btn btn-danger btn-small" onclick="removePower(${index})">Remove</button>
            </div>
        `;
        container.appendChild(powerDiv);
    });
}

// Update power field
function updatePowerField(index, field, value) {
    if (!currentCharacter || !currentCharacter.powers || !currentCharacter.powers[index]) return;
    currentCharacter.powers[index][field] = value;
}

// Remove power
function removePower(index) {
    if (!currentCharacter || !currentCharacter.powers) return;
    currentCharacter.powers.splice(index, 1);
    renderPowersList();
}

// ==================== ADVANTAGES ====================

// Add advantage to form
function addAdvantageToForm() {
    if (!currentCharacter) {
        currentCharacter = { id: null, attacks: [], powers: [], advantages: [], complications: [] };
    }
    if (!currentCharacter.advantages) {
        currentCharacter.advantages = [];
    }

    const advantage = {
        name: '',
        ranks: 1,
        notes: ''
    };

    currentCharacter.advantages.push(advantage);
    renderAdvantagesList();
}

// Render advantages list
function renderAdvantagesList() {
    const container = document.getElementById('advantages-list');
    if (!container) return;

    if (!currentCharacter || !currentCharacter.advantages || currentCharacter.advantages.length === 0) {
        container.innerHTML = '<div class="empty-state">No advantages added yet</div>';
        return;
    }

    container.innerHTML = '';

    currentCharacter.advantages.forEach((advantage, index) => {
        const advDiv = document.createElement('div');
        advDiv.className = 'advantage-item';
        advDiv.innerHTML = `
            <div class="advantage-inputs">
                <input type="text" placeholder="Advantage name" class="form-input" value="${advantage.name || ''}"
                       onchange="updateAdvantageField(${index}, 'name', this.value)">
                <input type="number" placeholder="Ranks" class="form-input advantage-rank-input" min="1" value="${advantage.ranks || 1}"
                       onchange="updateAdvantageField(${index}, 'ranks', parseInt(this.value))">
                <input type="text" placeholder="Notes" class="form-input" value="${advantage.notes || ''}"
                       onchange="updateAdvantageField(${index}, 'notes', this.value)">
                <button type="button" class="btn btn-danger btn-small" onclick="removeAdvantage(${index})">Remove</button>
            </div>
        `;
        container.appendChild(advDiv);
    });
}

// Update advantage field
function updateAdvantageField(index, field, value) {
    if (!currentCharacter || !currentCharacter.advantages || !currentCharacter.advantages[index]) return;
    currentCharacter.advantages[index][field] = value;
}

// Remove advantage
function removeAdvantage(index) {
    if (!currentCharacter || !currentCharacter.advantages) return;
    currentCharacter.advantages.splice(index, 1);
    renderAdvantagesList();
}

// ==================== COMPLICATIONS ====================

// Add complication to form
function addComplicationToForm() {
    if (!currentCharacter) {
        currentCharacter = { id: null, attacks: [], powers: [], advantages: [], complications: [] };
    }
    if (!currentCharacter.complications) {
        currentCharacter.complications = [];
    }

    const complication = {
        type: '',
        description: ''
    };

    currentCharacter.complications.push(complication);
    renderComplicationsList();
}

// Render complications list
function renderComplicationsList() {
    const container = document.getElementById('complications-list');
    if (!container) return;

    if (!currentCharacter || !currentCharacter.complications || currentCharacter.complications.length === 0) {
        container.innerHTML = '<div class="empty-state">No complications added yet</div>';
        return;
    }

    container.innerHTML = '';

    currentCharacter.complications.forEach((complication, index) => {
        const compDiv = document.createElement('div');
        compDiv.className = 'complication-item';
        compDiv.innerHTML = `
            <div class="complication-inputs">
                <select class="form-input complication-type-input" onchange="updateComplicationField(${index}, 'type', this.value)">
                    <option value="" ${!complication.type ? 'selected' : ''}>Select Type...</option>
                    <option value="Motivation" ${complication.type === 'Motivation' ? 'selected' : ''}>Motivation</option>
                    <option value="Identity" ${complication.type === 'Identity' ? 'selected' : ''}>Identity</option>
                    <option value="Weakness" ${complication.type === 'Weakness' ? 'selected' : ''}>Weakness</option>
                    <option value="Enemy" ${complication.type === 'Enemy' ? 'selected' : ''}>Enemy</option>
                    <option value="Relationship" ${complication.type === 'Relationship' ? 'selected' : ''}>Relationship</option>
                    <option value="Disability" ${complication.type === 'Disability' ? 'selected' : ''}>Disability</option>
                    <option value="Prejudice" ${complication.type === 'Prejudice' ? 'selected' : ''}>Prejudice</option>
                    <option value="Power Loss" ${complication.type === 'Power Loss' ? 'selected' : ''}>Power Loss</option>
                    <option value="Responsibility" ${complication.type === 'Responsibility' ? 'selected' : ''}>Responsibility</option>
                    <option value="Secret" ${complication.type === 'Secret' ? 'selected' : ''}>Secret</option>
                    <option value="Temper" ${complication.type === 'Temper' ? 'selected' : ''}>Temper</option>
                    <option value="Obsession" ${complication.type === 'Obsession' ? 'selected' : ''}>Obsession</option>
                    <option value="Quirk" ${complication.type === 'Quirk' ? 'selected' : ''}>Quirk</option>
                    <option value="Other" ${complication.type === 'Other' ? 'selected' : ''}>Other</option>
                </select>
                <input type="text" placeholder="Description" class="form-input complication-desc-input" value="${complication.description || ''}"
                       onchange="updateComplicationField(${index}, 'description', this.value)">
                <button type="button" class="btn btn-danger btn-small" onclick="removeComplication(${index})">Remove</button>
            </div>
        `;
        container.appendChild(compDiv);
    });
}

// Update complication field
function updateComplicationField(index, field, value) {
    if (!currentCharacter || !currentCharacter.complications || !currentCharacter.complications[index]) return;
    currentCharacter.complications[index][field] = value;
}

// Remove complication
function removeComplication(index) {
    if (!currentCharacter || !currentCharacter.complications) return;
    currentCharacter.complications.splice(index, 1);
    renderComplicationsList();
}

// ==================== GLOBAL EXPORTS ====================

// Make functions globally available
window.updateAttackField = updateAttackField;
window.removeAttack = removeAttack;
window.updatePowerField = updatePowerField;
window.removePower = removePower;
window.updateAdvantageField = updateAdvantageField;
window.removeAdvantage = removeAdvantage;
window.updateComplicationField = updateComplicationField;
window.removeComplication = removeComplication;
