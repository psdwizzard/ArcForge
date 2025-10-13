function toggleAgentDetails(agentId) {
    const card = document.querySelector(`.agent-card[data-agent-id="${agentId}"]`);
    if (!card) {
        return;
    }

    const isCollapsed = card.classList.toggle('collapsed');
    agentCollapseState[agentId] = isCollapsed;

    const toggleButton = card.querySelector('.agent-toggle');
    if (toggleButton) {
        toggleButton.textContent = isCollapsed ? '▸' : '▾';
    }
}

// API Base URL
const API_BASE = 'http://localhost:3000/api';

// State
let encounterState = {
    combatants: [],
    currentTurnIndex: 0,
    roundNumber: 1
};
window.encounterState = encounterState;

let savedAgents = [];
window.savedAgents = savedAgents;
let draggedElement = null;
let currentAgentFilter = 'all';

// Track the most recent attack rolls per combatant card
const combatantAttackState = {};
window.combatantAttackState = combatantAttackState;

// Track collapsed state for combatant cards
const combatantCollapseState = {};
window.combatantCollapseState = combatantCollapseState;

let lastActiveCombatantId = null;
window.lastActiveCombatantId = lastActiveCombatantId;

// Track collapsed state for sidebar agent cards
const agentCollapseState = {};
window.agentCollapseState = agentCollapseState;

// Codex state
const codexState = {
    activeSection: 'character',
    characterSheets: [],
    enemySheets: [],
    journalEntries: [],
    activeCharacterId: null,
    activeEnemyId: null,
    activeJournalId: null
};

async function loadCodexData() {
    try {
        const allCharacters = await fetch(`${API_BASE}/characters`).then(res => res.json());
        codexState.characterSheets = allCharacters.filter(char => (char.agentType || 'p') !== 'e' && (char.agentType || 'p') !== 'enemy');
        const characterEnemies = allCharacters.filter(char => {
            const agentType = (char.agentType || 'p').toLowerCase();
            return agentType === 'e' || agentType === 'enemy';
        }).map(char => ({
            ...char,
            type: 'Character Enemy'
        }));

        codexState.enemySheets = [
            ...characterEnemies
        ];
    } catch (error) {
        console.error('Error loading character sheets:', error);
        codexState.characterSheets = [];
        codexState.enemySheets = [];
    }

    try {
        const creatureTemplates = await fetch(`${API_BASE}/creatures`).then(res => res.json());
        const mergedEnemySheets = [...codexState.enemySheets];

        creatureTemplates.forEach(creature => {
            const sheetId = creature.id || creature.name;
            const exists = mergedEnemySheets.some(existing => (existing.id || existing.name) === sheetId);
            if (!exists) {
                mergedEnemySheets.push(creature);
            }
        });

        codexState.enemySheets = mergedEnemySheets;
    } catch (error) {
        console.error('Error loading enemy sheets:', error);
        codexState.enemySheets = [];
    }

    // Placeholder journal entries (will be replaced with saved data later)
    if (!codexState.journalEntries || codexState.journalEntries.length === 0) {
        codexState.journalEntries = [];
    }
}

function initCodex() {
    const tabButtons = document.querySelectorAll('.codex-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchCodexSection(btn.dataset.codexSection));
    });

    document.getElementById('codex-journal-save-btn').addEventListener('click', handleJournalSave);
    document.getElementById('codex-journal-new-btn').addEventListener('click', handleJournalNew);

    renderCodex();
}

function switchCodexSection(section) {
    codexState.activeSection = section;
    renderCodex();
}

function renderCodex() {
    updateCodexTabs();
    renderCodexCharacters();
    renderCodexEnemies();
    renderCodexJournal();
}

function updateCodexTabs() {
    document.querySelectorAll('.codex-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.codexSection === codexState.activeSection);
    });

    document.querySelectorAll('.codex-section').forEach(section => {
        section.classList.toggle('active', section.id === `codex-${codexState.activeSection}-section`);
    });
}

function renderCodexCharacters() {
    const listEl = document.getElementById('codex-character-list');
    const detailEl = document.getElementById('codex-character-detail');

    if (!listEl || !detailEl) return;

    if (!codexState || !codexState.characterSheets || codexState.characterSheets.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No characters saved yet</div>';
        detailEl.innerHTML = '<div class="empty-state">Create characters in the Crucible to view them here</div>';
        return;
    }

    listEl.innerHTML = '';

    codexState.characterSheets.forEach(char => {
        const card = document.createElement('div');
        card.className = 'codex-sheet-card';
        card.dataset.sheetId = char.id;
        card.innerHTML = `
            ${char.imagePath ? `<img class="codex-sheet-portrait" src="${char.imagePath}" alt="${char.name} portrait">` : ''}
            <div class="codex-sheet-meta">
                <div class="codex-sheet-name">${char.name}</div>
                <div class="codex-sheet-sub">${[char.race, char.class ? `${char.class} ${char.level || ''}` : ''].filter(Boolean).join(' • ')}</div>
                <div class="codex-sheet-sub">HP ${char.hp} • AC ${char.ac}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            codexState.activeCharacterId = char.id;
            renderCodexCharacters();
        });

        if (codexState.activeCharacterId === char.id) {
            card.classList.add('active');
        }

        listEl.appendChild(card);
    });

    if (!codexState.activeCharacterId && codexState.characterSheets.length > 0) {
        codexState.activeCharacterId = codexState.characterSheets[0].id;
    }

    const activeChar = codexState.characterSheets.find(char => char.id === codexState.activeCharacterId);
    if (!activeChar) {
        detailEl.innerHTML = '<div class="empty-state">Select a character to view their sheet</div>';
        return;
    }

    detailEl.innerHTML = getCodexSheetDetailHTML(activeChar, 'character');
}

function renderCodexEnemies() {
    const listEl = document.getElementById('codex-enemy-list');
    const detailEl = document.getElementById('codex-enemy-detail');

    if (!listEl || !detailEl) return;

    if (!codexState.enemySheets || codexState.enemySheets.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No enemies in the bestiary yet</div>';
        detailEl.innerHTML = '<div class="empty-state">Add JSON files to data/creatures to populate this list</div>';
        return;
    }

    listEl.innerHTML = '';

    codexState.enemySheets.forEach(enemy => {
        const card = document.createElement('div');
        card.className = 'codex-sheet-card';
        card.dataset.sheetId = enemy.id || enemy.name;
        card.innerHTML = `
            ${enemy.imagePath ? `<img class="codex-sheet-portrait" src="${enemy.imagePath}" alt="${enemy.name} portrait">` : ''}
            <div class="codex-sheet-meta">
                <div class="codex-sheet-name">${enemy.name}</div>
                <div class="codex-sheet-sub">CR ${enemy.cr || '—'} • ${enemy.type || ''}</div>
                <div class="codex-sheet-sub">HP ${enemy.hp || '—'} • AC ${enemy.ac || '—'}</div>
            </div>
        `;
        card.addEventListener('click', () => {
            codexState.activeEnemyId = enemy.id || enemy.name;
            renderCodexEnemies();
        });

        if (codexState.activeEnemyId === (enemy.id || enemy.name)) {
            card.classList.add('active');
        }

        listEl.appendChild(card);
    });

    if (!codexState.activeEnemyId && codexState.enemySheets.length > 0) {
        codexState.activeEnemyId = codexState.enemySheets[0].id || codexState.enemySheets[0].name;
    }

    const activeEnemy = codexState.enemySheets.find(enemy => (enemy.id || enemy.name) === codexState.activeEnemyId);
    if (!activeEnemy) {
        detailEl.innerHTML = '<div class="empty-state">Select an enemy to view their sheet</div>';
        return;
    }

    detailEl.innerHTML = getCodexSheetDetailHTML(activeEnemy, 'enemy');
}

function getCodexSheetDetailHTML(sheet, type) {
    const portraitHTML = sheet.imagePath ? `<img src="${sheet.imagePath}" alt="${sheet.name} portrait">` : '<div class="codex-sheet-placeholder">No Image</div>';

    const abilityBlock = sheet.abilities ? Object.entries(sheet.abilities).map(([ability, value]) => `
        <div class="codex-summary-block">
            <div class="codex-summary-label">${ability.toUpperCase()}</div>
            <div class="codex-summary-value">${value}</div>
        </div>
    `).join('') : '';

    const extraBlocks = [];

    if (type === 'character') {
        extraBlocks.push(`
            <div class="codex-summary-block">
                <div class="codex-summary-label">Class & Level</div>
                <div class="codex-summary-value">${sheet.class ? `${sheet.class} ${sheet.level || ''}` : '—'}</div>
            </div>
        `);
        extraBlocks.push(`
            <div class="codex-summary-block">
                <div class="codex-summary-label">Speed</div>
                <div class="codex-summary-value">${sheet.speed || '—'}</div>
            </div>
        `);
    } else if (type === 'enemy') {
        extraBlocks.push(`
            <div class="codex-summary-block">
                <div class="codex-summary-label">Challenge</div>
                <div class="codex-summary-value">CR ${sheet.cr || '—'}</div>
            </div>
        `);
        extraBlocks.push(`
            <div class="codex-summary-block">
                <div class="codex-summary-label">Type & Size</div>
                <div class="codex-summary-value">${[sheet.size, sheet.type].filter(Boolean).join(' • ') || '—'}</div>
            </div>
        `);
    }

    const traitsHTML = sheet.specialAbilities && sheet.specialAbilities.length > 0
        ? `
            <div class="codex-notes">
                <h3>Traits</h3>
                ${sheet.specialAbilities.map(ability => `
                    <div class="codex-trait-block">
                        <strong>${ability.name}.</strong> ${ability.description}
                    </div>
                `).join('')}
            </div>
        `
        : '';

    const actionsHTML = sheet.actions && sheet.actions.length > 0
        ? `
            <div class="codex-notes">
                <h3>Actions</h3>
                ${sheet.actions.map(action => `
                    <div class="codex-trait-block">
                        <strong>${action.name}</strong> ${action.type ? `(${action.type})` : ''} — ${action.damage || action.description || ''}
                    </div>
                `).join('')}
            </div>
        `
        : '';

    const lootHTML = type === 'enemy' && sheet.loot && sheet.loot.length > 0
        ? `
            <div class="codex-notes">
                <h3>Loot</h3>
                <ul class="codex-loot-list">
                    ${sheet.loot.map(item => `<li>${item.quantity || 1} × ${item.name}${item.value ? ` (${item.value} gp)` : ''}</li>`).join('')}
                </ul>
            </div>
        `
        : '';

    return `
        <div class="codex-sheet-header">
            <div class="codex-sheet-portrait-wrapper">
                ${portraitHTML}
            </div>
            <div class="codex-sheet-title">
                <div class="codex-sheet-nameplate">
                    <h2>${sheet.name}</h2>
                    <span class="codex-sheet-tag">${type === 'character' ? 'Character' : 'Enemy'}</span>
                </div>
                <div class="codex-sheet-subtitle">${type === 'character' ? [sheet.race, sheet.background].filter(Boolean).join(' • ') : [sheet.type, sheet.size].filter(Boolean).join(' • ')}</div>
                <div class="codex-sheet-primary-stats">
                    <span>HP <strong>${sheet.hp || '—'}</strong></span>
                    <span>AC <strong>${sheet.ac || '—'}</strong></span>
                    <span>DEX <strong>${sheet.dexModifier >= 0 ? '+' : ''}${sheet.dexModifier || 0}</strong></span>
                </div>
            </div>
        </div>
        <div class="codex-sheet-summary">
            ${abilityBlock}
            ${extraBlocks.join('')}
        </div>
        <div class="codex-notes">
            <div class="codex-notes-header">
                <h3>Notes</h3>
                <small>Use this space for session prep, tactics, or narrative cues. Notes auto-save with Save All Data.</small>
            </div>
            <textarea data-codex-notes="${sheet.id || sheet.name}" placeholder="Add encounter notes, roleplaying cues, or status updates...">${sheet.notes || ''}</textarea>
        </div>
        ${traitsHTML}
        ${actionsHTML}
        ${lootHTML}
    `;
}

function renderCodexJournal() {
    const listEl = document.getElementById('codex-journal-list');
    const editor = document.getElementById('codex-journal-text');

    if (!listEl || !editor) return;

    if (!codexState.journalEntries || codexState.journalEntries.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No journal entries yet</div>';
        editor.value = '';
        editor.placeholder = 'Click "New Entry" to start a journal entry.';
        return;
    }

    listEl.innerHTML = '';

    codexState.journalEntries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'codex-journal-entry';
        card.dataset.entryId = entry.id;
        card.innerHTML = `
            <div class="codex-journal-title">${entry.title || 'Untitled Entry'}</div>
            <div class="codex-journal-date">${new Date(entry.updatedAt || Date.now()).toLocaleString()}</div>
        `;
        card.addEventListener('click', () => selectJournalEntry(entry.id));
        if (codexState.activeJournalId === entry.id) {
            card.classList.add('active');
        }
        listEl.appendChild(card);
    });

    if (!codexState.activeJournalId && codexState.journalEntries.length > 0) {
        codexState.activeJournalId = codexState.journalEntries[0].id;
    }

    const activeEntry = codexState.journalEntries.find(entry => entry.id === codexState.activeJournalId);
    if (activeEntry) {
        editor.value = activeEntry.body || '';
        editor.placeholder = 'Write notes for this entry...';
    } else {
        editor.value = '';
        editor.placeholder = 'Select a journal entry to view or edit.';
    }
}

function selectJournalEntry(entryId) {
    codexState.activeJournalId = entryId;
    renderCodexJournal();
}

function handleJournalNew() {
    const newEntry = {
        id: `journal-${Date.now()}`,
        title: 'New Entry',
        body: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    codexState.journalEntries.unshift(newEntry);
    codexState.activeJournalId = newEntry.id;
    renderCodexJournal();
}

function handleJournalSave() {
    const activeEntry = codexState.journalEntries.find(entry => entry.id === codexState.activeJournalId);
    if (!activeEntry) {
        alert('No journal entry selected.');
        return;
    }

    const editor = document.getElementById('codex-journal-text');
    if (!editor) return;

    activeEntry.body = editor.value;
    activeEntry.updatedAt = Date.now();

    renderCodexJournal();
    alert('Journal entry saved.');
}

// Helper function to convert type codes to full names
function getTypeDisplayName(type) {
    const typeMap = {
        'p': 'Player',
        'n': 'NPC',
        'e': 'Enemy',
        'player': 'Player',
        'npc': 'NPC',
        'enemy': 'Enemy',
        'monster': 'Monster'
    };
    return typeMap[type] || type || 'Unknown';
}

// Initialize the application
async function init() {
    await loadEncounterState();
    await loadSavedAgents();
    await reloadEffectsData(); // Load effects
    if (typeof loadItemsData === 'function') {
        loadItemsData();
    }
    if (typeof loadMonstersData === 'function') {
        loadMonstersData();
    }
    await loadCodexData();
    attachEventListeners();
    renderCombatantsList();
    renderAgentsList();
    renderStatusEffectsDatalist(); // Create datalist
    window.renderCombatantsList = renderCombatantsList;
    window.renderAgentsList = renderAgentsList;
    updateCombatButtons();

    // Initialize character builder
    if (typeof initCharacterBuilder === 'function') {
        initCharacterBuilder();
    }

    // Initialize effects builder
    if (typeof initEffectsBuilder === 'function') {
        initEffectsBuilder();
    }

    initCodex();
    attachAtlasEventListeners();
}

// Load encounter state from server
async function loadEncounterState() {
    try {
        const response = await fetch(`${API_BASE}/encounter`);
        const data = await response.json();
        console.log('[loadEncounterState] Loaded encounter state:', data);

        // Ensure combatants array exists
        if (!data.combatants) {
            data.combatants = [];
        }

        encounterState = data;
        window.encounterState = encounterState; // Ensure it's accessible
        updateCombatButtons();
    } catch (error) {
        console.error('Error loading encounter state:', error);
        // Set a default state if loading fails
        encounterState = {
            combatants: [],
            currentTurnIndex: 0,
            roundNumber: 1,
            combatActive: false
        };
    }

    updateCombatButtons();
}

// Load saved agents (characters)
async function loadSavedAgents() {
    try {
        const response = await fetch(`${API_BASE}/characters`);
        savedAgents = await response.json();
    } catch (error) {
        console.error('Error loading saved agents:', error);
    }
}

function isEnemyType(type) {
    if (!type) {
        return false;
    }

    const normalized = type.toLowerCase();
    return normalized === 'enemy' || normalized === 'monster' || normalized === 'e';
}

async function reloadEffectsData() {
    try {
        const response = await fetch(`${API_BASE}/effects`);
        window.savedEffects = await response.json();
    } catch (error) {
        console.error('Error reloading effects data:', error);
    }
}
window.reloadEffectsData = reloadEffectsData;

// Create a datalist for status effects
function renderStatusEffectsDatalist() {
    const datalist = document.createElement('datalist');
    datalist.id = 'status-effects-list';

    if (window.savedEffects) {
        window.savedEffects.forEach(effect => {
            const option = document.createElement('option');
            option.value = effect.name;
            datalist.appendChild(option);
        });
    }

    document.body.appendChild(datalist);
}

// Attach event listeners
function attachEventListeners() {
    document.getElementById('start-combat-btn').addEventListener('click', handleStartCombat);
    const rollEnemyButton = document.getElementById('roll-enemy-initiative-btn');
    if (rollEnemyButton) {
        rollEnemyButton.addEventListener('click', handleRollEnemyInitiative);
    }
    document.getElementById('next-turn-btn').addEventListener('click', handleNextTurn);
    document.getElementById('end-combat-btn').addEventListener('click', handleEndCombat);
    document.getElementById('new-encounter-btn').addEventListener('click', handleNewEncounter);
    document.getElementById('create-new-agent-btn').addEventListener('click', handleCreateNewAgent);
    document.getElementById('agent-type-filter').addEventListener('change', handleAgentFilterChange);
}

// Update button visibility based on combat state
function updateCombatButtons() {
    const startBtn = document.getElementById('start-combat-btn');
    const rollEnemyBtn = document.getElementById('roll-enemy-initiative-btn');
    const nextBtn = document.getElementById('next-turn-btn');
    const endBtn = document.getElementById('end-combat-btn');

    if (encounterState.combatActive) {
        startBtn.style.display = 'none';
        if (rollEnemyBtn) {
            rollEnemyBtn.style.display = 'none';
        }
        nextBtn.style.display = 'inline-block';
        endBtn.style.display = 'inline-block';
    } else {
        startBtn.style.display = 'inline-block';
        if (rollEnemyBtn) {
        rollEnemyBtn.style.display = encounterState.combatants.some(c => isEnemyType(c.type)) ? 'inline-block' : 'none';
        }
        nextBtn.style.display = 'none';
        endBtn.style.display = 'none';
    }
}

// Handle agent filter change
function handleAgentFilterChange(e) {
    currentAgentFilter = e.target.value;
    renderAgentsList();
}

// Handle start combat
async function handleStartCombat() {
    if (encounterState.combatants.length === 0) {
        alert('Add agents before starting combat!');
        return;
    }

    const unrolledEnemies = encounterState.combatants.some(c => isEnemyType(c.type) && !c.initiative);
    if (unrolledEnemies) {
        const confirmRoll = confirm('Some enemies have no initiative yet. Roll enemy initiative now?');
        if (confirmRoll) {
            await handleRollEnemyInitiative();
        }
    }

    try {
        const response = await fetch(`${API_BASE}/combat/start`, {
            method: 'POST'
        });

        if (response.ok) {
            await loadEncounterState();
            document.getElementById('round-number').textContent = encounterState.roundNumber;
            renderCombatantsList();
            updateCombatButtons();
        }
    } catch (error) {
        console.error('Error starting combat:', error);
    }
}

// Handle end combat
async function handleEndCombat() {
    const confirmed = confirm('End combat? This will keep all agents but stop tracking turns.');
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/combat/end`, {
            method: 'POST'
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
            updateCombatButtons();
        }
    } catch (error) {
        console.error('Error ending combat:', error);
    }
}

// Handle next turn
async function handleNextTurn() {
    console.log('[handleNextTurn] Button clicked, encounterState:', encounterState);

    if (!encounterState || !encounterState.combatants || encounterState.combatants.length === 0) {
        console.log('[handleNextTurn] No combatants, returning early');
        alert('No combatants in the encounter. Add combatants before starting combat.');
        return;
    }

    try {
        // Auto-apply any pending damage/healing/status effects for ALL combatants
        console.log('[handleNextTurn] Processing pending damage/healing/effects for', encounterState.combatants.length, 'combatants');

        for (const combatant of encounterState.combatants) {
            const dmgInput = document.getElementById(`dmg-${combatant.id}`);
            const healInput = document.getElementById(`heal-${combatant.id}`);
            const tempInput = document.getElementById(`temp-${combatant.id}`);
            const statusNameInput = document.getElementById(`status-name-${combatant.id}`);
            const statusDurationInput = document.getElementById(`status-duration-${combatant.id}`);

            // Apply damage if there's a value
            if (dmgInput && dmgInput.value) {
                const amount = parseInt(dmgInput.value);
                if (amount > 0) {
                    console.log(`[handleNextTurn] Applying ${amount} damage to ${combatant.name}`);
                    const dmgResponse = await fetch(`${API_BASE}/combatants/${combatant.id}/hp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, type: 'damage' })
                    });
                    if (!dmgResponse.ok) {
                        console.error(`[handleNextTurn] Failed to apply damage to ${combatant.name}`);
                    }
                }
            }

            // Apply healing if there's a value
            if (healInput && healInput.value) {
                const amount = parseInt(healInput.value);
                if (amount > 0) {
                    console.log(`[handleNextTurn] Applying ${amount} healing to ${combatant.name}`);
                    const healResponse = await fetch(`${API_BASE}/combatants/${combatant.id}/hp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, type: 'heal' })
                    });
                    if (!healResponse.ok) {
                        console.error(`[handleNextTurn] Failed to apply healing to ${combatant.name}`);
                    }
                }
            }

            // Apply temp HP if there's a value
            if (tempInput && tempInput.value) {
                const amount = parseInt(tempInput.value);
                if (amount > 0) {
                    console.log(`[handleNextTurn] Applying ${amount} temp HP to ${combatant.name}`);
                    const tempResponse = await fetch(`${API_BASE}/combatants/${combatant.id}/temp-hp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount })
                    });
                    if (!tempResponse.ok) {
                        console.error(`[handleNextTurn] Failed to apply temp HP to ${combatant.name}`);
                    }
                }
            }

            // Apply status effect if there's a name entered
            if (statusNameInput && statusNameInput.value.trim()) {
                const name = statusNameInput.value.trim();
                const duration = parseInt(statusDurationInput.value) || 1;

                console.log(`[handleNextTurn] Adding status effect "${name}" (${duration} rounds) to ${combatant.name}`);

                let effect = window.savedEffects ? window.savedEffects.find(e => e.name.toLowerCase() === name.toLowerCase()) : null;

                if (!effect) {
                    effect = { name, duration, endOfTurn: true };
                } else {
                    effect = { ...effect, duration };
                }

                const effectResponse = await fetch(`${API_BASE}/combatants/${combatant.id}/status-effects`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(effect)
                });

                if (!effectResponse.ok) {
                    console.error(`[handleNextTurn] Failed to add status effect to ${combatant.name}`);
                }
            }
        }

        // Advance turn
        console.log('[handleNextTurn] Calling next-turn endpoint');
        const response = await fetch(`${API_BASE}/combat/next-turn`, {
            method: 'POST'
        });

        if (response.ok) {
            // The server now returns the full encounter state
            const newState = await response.json();
            console.log('[handleNextTurn] Turn advanced successfully, new state:', newState);

            // Ensure combatants array exists
            if (!newState.combatants) {
                newState.combatants = [];
            }

            encounterState = newState;
            window.encounterState = encounterState;
            document.getElementById('round-number').textContent = encounterState.roundNumber;
            renderCombatantsList();
        } else {
            console.error('[handleNextTurn] Server returned error:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('[handleNextTurn] Error response:', errorText);
            alert(`Failed to advance turn: ${response.statusText}`);
        }
    } catch (error) {
        console.error('[handleNextTurn] Exception caught:', error);
        alert(`Error advancing turn: ${error.message}`);
    }
}

// Handle new encounter
async function handleNewEncounter() {
    if (encounterState.combatants.length > 0) {
        const confirmed = confirm('Start a new encounter? This will clear all current combatants.');
        if (!confirmed) return;
    }

    try {
        const response = await fetch(`${API_BASE}/encounter/new`, {
            method: 'POST'
        });

        if (response.ok) {
            await loadEncounterState();
            document.getElementById('round-number').textContent = 1;
            renderCombatantsList();
            updateCombatButtons();
        }
    } catch (error) {
        console.error('Error creating new encounter:', error);
    }
}

// Render combatants list
function renderCombatantsList() {
    const container = document.getElementById('combatants-list');

    if (encounterState.combatants.length === 0) {
        container.innerHTML = '<div class="empty-state">No agents yet. Add some to start combat!</div>';
        updateCombatButtons();
        return;
    }

    container.innerHTML = '';

    updateCombatButtons();

    const activeCombatantId = encounterState.combatActive && encounterState.combatants.length > 0
        ? encounterState.combatants[encounterState.currentTurnIndex].id
        : null;

    if (lastActiveCombatantId && lastActiveCombatantId !== activeCombatantId) {
        if (combatantCollapseState[lastActiveCombatantId] === false) {
            combatantCollapseState[lastActiveCombatantId] = true;
        }
    }

    // If combat is active, reorder display so current turn is first
    let displayOrder = [...encounterState.combatants];
    if (encounterState.combatActive && encounterState.currentTurnIndex > 0) {
        const currentTurnIndex = encounterState.currentTurnIndex;
        displayOrder = [
            ...encounterState.combatants.slice(currentTurnIndex),
            ...encounterState.combatants.slice(0, currentTurnIndex)
        ];
    }

    displayOrder.forEach((combatant, displayIndex) => {
        // Check if this is the current turn (always first in display order when combat is active)
        const isCurrentTurn = encounterState.combatActive && displayIndex === 0;
        const card = createCombatantCard(combatant, isCurrentTurn);
        container.appendChild(card);
        syncAttackUIWithState(combatant.id);
    });

    lastActiveCombatantId = activeCombatantId;
    window.lastActiveCombatantId = lastActiveCombatantId;

    updateCombatButtons();
}

// Get attacks HTML for a combatant
function getAttacksHTML(combatant) {
    // Only show attacks for NPCs and enemies
    const isNPCorEnemy = combatant.type === 'n' || combatant.type === 'e' || combatant.type === 'npc' || combatant.type === 'enemy';
    if (!isNPCorEnemy) {
        return '';
    }

    // Find the character data from saved agents
    const character = combatant.sourceId ? savedAgents.find(a => a.id === combatant.sourceId) : savedAgents.find(a => a.name === combatant.name);

    if (!character || !character.attacks || character.attacks.length === 0) {
        return '';
    }

    const attackOptions = character.attacks.map((attack, index) => {
        const optionLabel = attack.name ? attack.name : `Attack ${index + 1}`;
        return `<option value="${index}">${optionLabel}</option>`;
    }).join('');

    const targetOptions = (encounterState.combatants || [])
        .filter(target => target.id !== combatant.id)
        .map(target => `<option value="${target.id}">${target.name} (AC ${target.ac})</option>`)
        .join('');

    const targetSelectDisabled = targetOptions ? '' : 'disabled';

    return `
        <div class="combatant-attacks">
            <div class="attack-controls">
                <div class="attack-controls-row">
                    <div class="attack-select-group">
                        <select class="attack-select" id="attack-select-${combatant.id}">
                            <option value="">Select attack</option>
                            ${attackOptions}
                        </select>
                        <select class="attack-target-select" id="attack-target-${combatant.id}" ${targetSelectDisabled}>
                            <option value="">Select target</option>
                            ${targetOptions}
                        </select>
                    </div>
                    <div class="attack-roll-group">
                        <button type="button" class="btn btn-small btn-secondary" onclick="rollAttack('${combatant.id}')">Roll</button>
                        <input type="number" class="attack-damage-input" id="attack-damage-${combatant.id}" placeholder="Damage" min="0" step="1" value="0" disabled>
                        <button type="button" class="btn btn-small btn-primary" id="attack-confirm-${combatant.id}" onclick="confirmAttack('${combatant.id}')" disabled>Confirm</button>
                    </div>
                </div>
                <div class="attack-result" id="attack-result-${combatant.id}"></div>
            </div>
        </div>
    `;
}

// Keep attack UI controls aligned with the last known state when re-rendering cards
function syncAttackUIWithState(combatantId) {
    const state = combatantAttackState[combatantId];
    const attackSelect = document.getElementById(`attack-select-${combatantId}`);
    const targetSelect = document.getElementById(`attack-target-${combatantId}`);
    const damageInput = document.getElementById(`attack-damage-${combatantId}`);
    const confirmButton = document.getElementById(`attack-confirm-${combatantId}`);

    if (!attackSelect || !targetSelect || !damageInput || !confirmButton) {
        return;
    }

    if (!state) {
        attackSelect.value = '';
        targetSelect.value = '';
        damageInput.value = '0';
        damageInput.disabled = true;
        confirmButton.disabled = true;
        updateAttackResultUI(combatantId, '', 'info');
        return;
    }

    if (typeof state.attackIndex === 'number') {
        attackSelect.value = String(state.attackIndex);
    }

    if (state.targetId) {
        targetSelect.value = state.targetId;
    }

    if (state.status === 'hit') {
        damageInput.disabled = false;
        damageInput.value = String(state.damage ?? 0);
        confirmButton.disabled = false;
    } else {
        damageInput.disabled = true;
        damageInput.value = '0';
        confirmButton.disabled = true;
    }

    if (state.message) {
        updateAttackResultUI(combatantId, state.message, state.status || 'info');
    }
}

// Update the result text block for a combatant's attack workflow
function updateAttackResultUI(combatantId, message, status = 'info') {
    const resultElement = document.getElementById(`attack-result-${combatantId}`);
    if (!resultElement) {
        return;
    }

    resultElement.textContent = message;
    resultElement.classList.remove('hit', 'miss', 'info');
    resultElement.classList.add(status);
}

// Reset the attack controls after damage is applied or cancelled
function resetAttackUI(combatantId) {
    delete combatantAttackState[combatantId];
    syncAttackUIWithState(combatantId);
}

function toggleCombatantDetails(combatantId) {
    const card = document.querySelector(`.combatant-card[data-combatant-id="${combatantId}"]`);
    if (!card) {
        return;
    }

    const isNowCollapsed = card.classList.toggle('collapsed');
    combatantCollapseState[combatantId] = isNowCollapsed;

    const toggleButton = card.querySelector('.combatant-toggle');
    if (toggleButton) {
        toggleButton.textContent = isNowCollapsed ? '▸' : '▾';
    }

    if (!isNowCollapsed) {
        syncAttackUIWithState(combatantId);
    }
}

// Roll to hit with the currently selected attack and target
function rollAttack(attackerId) {
    const attackSelect = document.getElementById(`attack-select-${attackerId}`);
    const targetSelect = document.getElementById(`attack-target-${attackerId}`);
    const damageInput = document.getElementById(`attack-damage-${attackerId}`);
    const confirmButton = document.getElementById(`attack-confirm-${attackerId}`);

    if (!attackSelect || !targetSelect || !damageInput || !confirmButton) {
        return;
    }

    const attackIndex = parseInt(attackSelect.value, 10);
    const targetId = targetSelect.value;

    if (Number.isNaN(attackIndex)) {
        updateAttackResultUI(attackerId, 'Select an attack before rolling.', 'info');
        damageInput.disabled = true;
        damageInput.value = '0';
        confirmButton.disabled = true;
        return;
    }

    if (!targetId) {
        updateAttackResultUI(attackerId, 'Select a target before rolling.', 'info');
        damageInput.disabled = true;
        damageInput.value = '0';
        confirmButton.disabled = true;
        return;
    }

    const attacker = encounterState.combatants.find(c => c.id === attackerId);
    const target = encounterState.combatants.find(c => c.id === targetId);

    if (!attacker || !target) {
        updateAttackResultUI(attackerId, 'Could not locate the selected combatants.', 'info');
        resetAttackUI(attackerId);
        return;
    }

    const attackerData = attacker.sourceId ? savedAgents.find(agent => agent.id === attacker.sourceId) : savedAgents.find(agent => agent.name === attacker.name);
    if (!attackerData || !attackerData.attacks || !attackerData.attacks[attackIndex]) {
        updateAttackResultUI(attackerId, 'Attack data is missing for this combatant.', 'info');
        resetAttackUI(attackerId);
        return;
    }

    const attack = attackerData.attacks[attackIndex];
    const attackBonus = Number(attack.attackBonus) || 0;
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const totalRoll = d20Roll + attackBonus;
    const targetAC = Number(target.ac) || 0;
    const isCritical = d20Roll === 20;
    const isCriticalMiss = d20Roll === 1;
    const hit = isCritical || (!isCriticalMiss && totalRoll >= targetAC);

    const sanitizedDamage = (attack.damageDice || '').toString().replace(/\s+/g, '');
    const rolledDamage = hit ? Math.max(0, rollDice(sanitizedDamage, isCritical)) : 0;

    let message = `${attack.name || 'Attack'} vs ${target.name}: rolled ${d20Roll}`;
    message += attackBonus ? ` + ${attackBonus} = ${totalRoll}` : '';
    message += ` against AC ${targetAC}.`;

    if (isCriticalMiss) {
        message += ' Critical miss!';
    } else if (isCritical) {
        message += ' Critical hit!';
    }

    if (hit) {
        const damageSuffix = attack.damageType ? ` ${attack.damageType}` : '';
        message += ` Pending damage: ${rolledDamage}${damageSuffix}.`;
    } else {
        message += ' Missed.';
    }

    combatantAttackState[attackerId] = {
        attackIndex,
        attackName: attack.name,
        attackBonus,
        targetId,
        targetName: target.name,
        d20Roll,
        totalRoll,
        isCritical,
        status: hit ? 'hit' : 'miss',
        damage: rolledDamage,
        message
    };

    if (hit) {
        damageInput.disabled = false;
        damageInput.value = String(rolledDamage);
        confirmButton.disabled = false;
    } else {
        damageInput.disabled = true;
        damageInput.value = '0';
        confirmButton.disabled = true;
    }

    updateAttackResultUI(attackerId, message, hit ? 'hit' : 'miss');
}

// Apply damage to the selected target if the attack roll was successful
async function confirmAttack(attackerId) {
    const state = combatantAttackState[attackerId];
    const damageInput = document.getElementById(`attack-damage-${attackerId}`);
    const confirmButton = document.getElementById(`attack-confirm-${attackerId}`);

    if (!state || state.status !== 'hit') {
        updateAttackResultUI(attackerId, 'Roll a successful attack before confirming damage.', 'info');
        return;
    }

    if (!damageInput || !confirmButton) {
        return;
    }

    const amount = parseInt(damageInput.value, 10);
    if (Number.isNaN(amount) || amount < 0) {
        updateAttackResultUI(attackerId, 'Enter a non-negative damage amount.', 'info');
        damageInput.focus();
        return;
    }

    if (amount === 0) {
        updateAttackResultUI(attackerId, 'No damage applied.', 'info');
        resetAttackUI(attackerId);
        return;
    }

    try {
        confirmButton.disabled = true;
        const response = await fetch(`${API_BASE}/combatants/${state.targetId}/hp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, type: 'damage' })
        });

        if (!response.ok) {
            throw new Error(`Failed to apply damage: ${response.statusText}`);
        }

        resetAttackUI(attackerId);
        await loadEncounterState();
        renderCombatantsList();
        alert(`${amount} damage applied to ${state.targetName}.`);
    } catch (error) {
        console.error('Error applying damage:', error);
        updateAttackResultUI(attackerId, 'Failed to apply damage. Please try again.', 'info');
        confirmButton.disabled = false;
    }
}

// Create a combatant card element
function createCombatantCard(combatant, isCurrentTurn) {
    const card = document.createElement('div');
    card.className = 'combatant-card';
    card.dataset.combatantId = combatant.id;
    if (combatant.sourceId) {
        card.dataset.sourceId = combatant.sourceId;
    }

    switch (combatant.type) {
        case 'p':
        case 'player':
            card.classList.add('type-player');
            break;
        case 'n':
        case 'npc':
            card.classList.add('type-npc');
            break;
        case 'e':
        case 'enemy':
        case 'monster':
            card.classList.add('type-enemy');
            break;
        default:
            break;
    }

    const storedState = combatantCollapseState[combatant.id];
    const isCollapsed = !isCurrentTurn && storedState !== false;

    if (isCurrentTurn) {
        card.classList.add('current-turn');
        combatantCollapseState[combatant.id] = false;
    }

    if (isCollapsed) {
        card.classList.add('collapsed');
    } else {
        card.classList.remove('collapsed');
    }

    // Determine HP color class
    const hpPercent = (combatant.hp.current / combatant.hp.max) * 100;
    let hpClass = 'hp';
    if (combatant.hp.current === 0) {
        hpClass = 'hp dead';
    } else if (hpPercent <= 25) {
        hpClass = 'hp critical';
    } else if (hpPercent <= 50) {
        hpClass = 'hp low';
    }

    // Build status effects HTML
    let statusEffectsHTML = '';
    if (combatant.statusEffects && combatant.statusEffects.length > 0) {
        statusEffectsHTML = '<div class="status-effects">';
        combatant.statusEffects.forEach((effect, effectIndex) => {
            statusEffectsHTML += `
                <div class="status-effect">
                    <span class="status-effect-name">${effect.name}</span>
                    <span class="status-effect-duration">(${effect.duration})</span>
                    <button class="status-effect-remove" onclick="removeStatusEffect('${combatant.id}', ${effectIndex})">×</button>
                </div>
            `;
        });
        statusEffectsHTML += '</div>';
    }

    // Build death saves HTML if at 0 HP (only for players and NPCs, not enemies)
    let deathSavesHTML = '';
    if (combatant.hp.current === 0 && (combatant.type === 'player' || combatant.type === 'npc')) {
        deathSavesHTML = `
            <div class="death-saves">
                <div class="death-saves-title">Death Saves</div>
                <div class="death-saves-row">
                    <div class="death-save-group">
                        <span class="death-save-label">Successes</span>
                        <div class="death-save-circles">
                            ${[1, 2, 3].map(i => `
                                <div class="death-save-circle ${combatant.deathSaves.successes >= i ? 'success' : ''}"
                                     onclick="updateDeathSave('${combatant.id}', 'successes', ${i})"></div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="death-save-group">
                        <span class="death-save-label">Failures</span>
                        <div class="death-save-circles">
                            ${[1, 2, 3].map(i => `
                                <div class="death-save-circle ${combatant.deathSaves.failures >= i ? 'failure' : ''}"
                                     onclick="updateDeathSave('${combatant.id}', 'failures', ${i})"></div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="death-saves-actions">
                    <button class="btn btn-small btn-primary" onclick="rollDeathSave('${combatant.id}')">Roll Death Save</button>
                </div>
            </div>
        `;
    } else if (combatant.hp.current === 0 && (combatant.type === 'enemy' || combatant.type === 'monster')) {
        // Just show "DEAD" for enemies/monsters
        deathSavesHTML = `
            <div class="death-saves" style="text-align: center; padding: 0.5rem;">
                <div class="death-saves-title">DEAD</div>
            </div>
        `;
    }

    // Temp HP display
    const tempHPDisplay = combatant.hp.temp > 0 ? ` (+${combatant.hp.temp})` : '';

    // Header display helpers
    const displayName = combatant.name || 'Unknown';
    const nameHTML = `<div class="combatant-name">${displayName}</div>`;
    const sanitizedName = displayName.trim();
    const avatarInitial = sanitizedName ? sanitizedName.charAt(0).toUpperCase() : '?';
    const avatarHTML = `<div class="combatant-avatar">
        ${combatant.imagePath ? `<img class="combatant-avatar-image" src="${combatant.imagePath}" alt="${displayName} portrait">` : `<span class="combatant-avatar-initial">${avatarInitial}</span>`}
    </div>`;
    const typeLabel = getTypeDisplayName(combatant.type);

    const initiativeRollValue = getInitiativeRollValue(combatant);
    const totalInitiativeDisplay = getInitiativeTotalDisplay(combatant);

    card.innerHTML = `
        <div class="combatant-header">
            <div class="combatant-header-main">
                <button class="combatant-toggle" type="button" onclick="toggleCombatantDetails('${combatant.id}')">${isCollapsed ? '▸' : '▾'}</button>
                ${avatarHTML}
                <div class="combatant-name-section">
                    <div class="combatant-name-row">
                        ${nameHTML}
                        <div class="combatant-type">${typeLabel}</div>
                    </div>
                </div>
                <button class="btn btn-small btn-danger combatant-remove-inline" onclick="removeCombatant('${combatant.id}')">Remove</button>
            </div>
            <div class="combatant-summary">
            <div class="combatant-initiative">
                <span class="initiative-mod" title="DEX Modifier">${combatant.dexModifier >= 0 ? '+' : ''}${combatant.dexModifier}</span>
                <span class="initiative-plus">+</span>
                <input type="number" class="initiative-roll-input" id="initiative-roll-${combatant.id}" value="${initiativeRollValue}" onchange="updateInitiativeRoll('${combatant.id}')" title="d20 Roll">
                <span class="initiative-equals">=</span>
                <span class="initiative-total" id="initiative-total-${combatant.id}">${totalInitiativeDisplay}</span>
            </div>
                <div class="combatant-summary-stats">
                    <span class="summary-stat hp">HP ${combatant.hp.current} / ${combatant.hp.max}${tempHPDisplay}</span>
                    <span class="summary-stat ac">AC ${combatant.ac}</span>
                    <span class="summary-stat dex">DEX ${combatant.dexModifier >= 0 ? '+' : ''}${combatant.dexModifier}</span>
        </div>
            </div>
        </div>
        <div class="combatant-details">
        <div class="combatant-stats">
            <div class="stat">
                <div class="stat-label">HP</div>
                <div class="stat-value ${hpClass}">${combatant.hp.current} / ${combatant.hp.max}${tempHPDisplay}</div>
            </div>
            <div class="stat">
                <div class="stat-label">AC</div>
                <div class="stat-value">${combatant.ac}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DEX</div>
                <div class="stat-value">${combatant.dexModifier >= 0 ? '+' : ''}${combatant.dexModifier}</div>
            </div>
        </div>
        ${statusEffectsHTML}
        ${deathSavesHTML}
        <div class="hp-controls">
            <div class="hp-input-group">
                <input type="number" class="hp-input" id="dmg-${combatant.id}" placeholder="0" min="0">
                <button class="btn btn-small btn-danger" onclick="applyDamage('${combatant.id}')">Damage</button>
            </div>
            <div class="hp-input-group">
                <input type="number" class="hp-input" id="heal-${combatant.id}" placeholder="0" min="0">
                <button class="btn btn-small btn-success" onclick="applyHealing('${combatant.id}')">Heal</button>
            </div>
            <div class="hp-input-group">
                <input type="number" class="hp-input" id="temp-${combatant.id}" placeholder="Temp" min="0">
                <button class="btn btn-small btn-secondary" onclick="applyTempHP('${combatant.id}')">Temp HP</button>
            </div>
        </div>
        <div class="add-status-controls">
            <input type="text" class="status-input" id="status-name-${combatant.id}" placeholder="Status effect" list="status-effects-list" onchange="handleEffectSelection(event)" onkeypress="if(event.key==='Enter') addStatusEffect('${combatant.id}')">
            <input type="number" class="duration-input" id="status-duration-${combatant.id}" placeholder="Rds" min="1" value="1" onkeypress="if(event.key==='Enter') addStatusEffect('${combatant.id}')">
            <button class="btn btn-small btn-secondary" onclick="addStatusEffect('${combatant.id}')">Add</button>
        </div>
        ${getAttacksHTML(combatant)}
        </div>
    `;

    return card;
}

// Handle effect selection from datalist
function handleEffectSelection(event) {
    const input = event.target;
    const combatantId = input.id.replace('status-name-', '');
    const durationInput = document.getElementById(`status-duration-${combatantId}`);
    const selectedEffect = window.savedEffects.find(e => e.name.toLowerCase() === input.value.toLowerCase());

    if (selectedEffect) {
        durationInput.value = selectedEffect.duration || 1;
    }
}

// Apply damage
async function applyDamage(combatantId) {
    const input = document.getElementById(`dmg-${combatantId}`);
    const amount = parseInt(input.value) || 0;

    if (amount <= 0) return;

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/hp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, type: 'damage' })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error applying damage:', error);
    }
}

// Apply healing
async function applyHealing(combatantId) {
    const input = document.getElementById(`heal-${combatantId}`);
    const amount = parseInt(input.value) || 0;

    if (amount <= 0) return;

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/hp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, type: 'heal' })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error applying healing:', error);
    }
}

// Apply temporary HP
async function applyTempHP(combatantId) {
    const input = document.getElementById(`temp-${combatantId}`);
    const amount = parseInt(input.value) || 0;

    if (amount <= 0) return;

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/temp-hp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error applying temp HP:', error);
    }
}

// Add status effect
async function addStatusEffect(combatantId) {
    const nameInput = document.getElementById(`status-name-${combatantId}`);
    const durationInput = document.getElementById(`status-duration-${combatantId}`);

    const name = nameInput.value.trim();
    const duration = parseInt(durationInput.value) || 1;

    if (!name) return;

    let effect = window.savedEffects.find(e => e.name.toLowerCase() === name.toLowerCase());

    if (!effect) {
        effect = { name, duration, endOfTurn: true };
    } else {
        effect = { ...effect, duration };
    }

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/status-effects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(effect)
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error adding status effect:', error);
    }
}

// Remove status effect
async function removeStatusEffect(combatantId, effectIndex) {
    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/status-effects/${effectIndex}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error removing status effect:', error);
    }
}

// Update death save
async function updateDeathSave(combatantId, type, value) {
    const combatant = encounterState.combatants.find(c => c.id === combatantId);
    if (!combatant) return;

    // Toggle the value
    const currentValue = combatant.deathSaves[type];
    const newValue = currentValue === value ? value - 1 : value;

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/death-saves`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [type]: newValue })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error updating death save:', error);
    }
}

// Roll death save
async function rollDeathSave(combatantId) {
    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/death-saves/roll`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            alert(`Rolled ${data.roll}: ${data.result}`);
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error rolling death save:', error);
    }
}

// Remove combatant
async function removeCombatant(combatantId) {
    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error removing combatant:', error);
    }
}

// Render agents list
function renderAgentsList() {
    const container = document.getElementById('agents-list');

    if (savedAgents.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No agents created yet</div>';
        return;
    }

    // Filter agents by type
    let filteredAgents = savedAgents;
    if (currentAgentFilter !== 'all') {
        filteredAgents = savedAgents.filter(agent => agent.agentType === currentAgentFilter);
    }

    // Sort by ID (newest first - IDs are timestamps)
    filteredAgents.sort((a, b) => {
        // Extract timestamp from ID (format: char-{timestamp})
        const getTimestamp = (id) => {
            const match = id.match(/\d+/);
            return match ? parseInt(match[0]) : 0;
        };
        return getTimestamp(b.id) - getTimestamp(a.id);
    });

    if (filteredAgents.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No agents of this type</div>';
        return;
    }

    container.innerHTML = '';

    filteredAgents.forEach(agent => {
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.dataset.agentId = agent.id;

        const agentType = agent.agentType || 'p';
        const typeLabel = getTypeDisplayName(agentType);
        const colorClass = agentType === 'p' || agentType === 'player' ? 'player'
            : (agentType === 'n' || agentType === 'npc' ? 'npc' : 'enemy');

        card.classList.add(`agent-type-${colorClass}`);

        const storedCollapsed = agentCollapseState[agent.id];
        const isCollapsed = storedCollapsed !== false;

        if (isCollapsed) {
            card.classList.add('collapsed');
        }

        const detailsHTML = `
            <div class="agent-details">
                ${agent.imagePath ? `<img class="agent-list-portrait" src="${agent.imagePath}" alt="${agent.name} portrait">` : ''}
                <div class="agent-info-text">
                    <div class="agent-info-line">${agent.race || ''}</div>
                    <div class="agent-info-line">HP: ${agent.hp} | AC: ${agent.ac}</div>
                    <div class="agent-info-line">Type: ${typeLabel}</div>
                </div>
            </div>
        `;

        card.innerHTML = `
            <div class="agent-header">
                <button class="agent-toggle" type="button" onclick="toggleAgentDetails('${agent.id}')">${isCollapsed ? '▸' : '▾'}</button>
            <div class="agent-name">${agent.name}</div>
                <div class="agent-actions-inline">
                    <button class="btn btn-small btn-${colorClass}" onclick="addAgentToCombatFromList('${agent.id}')">Add</button>
                <button class="btn btn-small btn-secondary" onclick="editAgentFromList('${agent.id}')">Edit</button>
            </div>
            </div>
            ${detailsHTML}
        `;

        container.appendChild(card);
    });
}

// Handle create new agent button
function handleCreateNewAgent() {
    // Switch to character builder view and clear form
    if (typeof switchView === 'function') {
        switchView('crucible');
    }
    if (typeof clearCharacterForm === 'function') {
        clearCharacterForm();
    }
}

// Add agent to combat from list
async function addAgentToCombatFromList(agentId) {
    const agent = savedAgents.find(a => a.id === agentId);
    if (!agent) return;

    const dexMod = agent.abilities ? Math.floor((agent.abilities.dex - 10) / 2) : 0;

    try {
        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: agent.name,
                type: agent.agentType || 'player',
                hp: agent.hp,
                ac: agent.ac,
                dexModifier: dexMod,
                initiative: 0,
                imagePath: agent.imagePath || null
            })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error adding agent to combat:', error);
    }
}

// Edit agent from list
function editAgentFromList(agentId) {
    // Switch to character builder and load the agent
    if (typeof switchView === 'function') {
        switchView('crucible');
    }
    if (typeof loadCharacterToForm === 'function') {
        loadCharacterToForm(agentId);
    }
}

// Drag and drop handlers
function handleDragStart(e) {
    // Prevent dragging if the drag started on a clickable name
    if (e.target.classList.contains('combatant-name-clickable')) {
        e.preventDefault();
        return false;
    }

    draggedElement = e.currentTarget;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');

    // Remove all drag-over classes
    document.querySelectorAll('.combatant-card').forEach(card => {
        card.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }

    e.dataTransfer.dropEffect = 'move';

    const afterElement = getDragAfterElement(e.currentTarget.parentElement, e.clientY);
    const dragging = document.querySelector('.dragging');

    if (afterElement == null) {
        e.currentTarget.parentElement.appendChild(dragging);
    } else {
        e.currentTarget.parentElement.insertBefore(dragging, afterElement);
    }

    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }

    e.preventDefault();

    // Get new order of combatant IDs
    const combatantCards = document.querySelectorAll('.combatant-card');
    const newOrder = Array.from(combatantCards).map(card => card.dataset.combatantId);

    // Update server with new order
    reorderInitiative(newOrder);

    return false;
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.combatant-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Reorder initiative on server
async function reorderInitiative(combatantIds) {
    try {
        const response = await fetch(`${API_BASE}/initiative/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ combatantIds })
        });

        if (response.ok) {
            await loadEncounterState();
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error reordering initiative:', error);
    }
}

// Update initiative based on a d20 roll
async function updateInitiativeRoll(combatantId) {
    const rollInput = document.getElementById(`initiative-roll-${combatantId}`);
    if (rollInput.value === '') {
        rollInput.dataset.manualEntry = 'false';
        const combatant = encounterState.combatants.find(c => c.id === combatantId);
        if (combatant) {
            const totalDisplay = document.getElementById(`initiative-total-${combatantId}`);
            totalDisplay.textContent = combatant.initiative || 0;
        }

        try {
            const response = await fetch(`${API_BASE}/combatants/${combatantId}/initiative`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initiative: null })
            });

            if (response.ok) {
                const newState = await response.json();
                if (!newState.combatants) {
                    newState.combatants = [];
                }

                encounterState = newState;
                window.encounterState = encounterState;
                renderCombatantsList();
            }
        } catch (error) {
            console.error('Error clearing initiative:', error);
        }

        return;
    }

    const roll = parseInt(rollInput.value) || 0;
    rollInput.dataset.manualEntry = 'true';

    const combatant = encounterState.combatants.find(c => c.id === combatantId);
    if (!combatant) return;

    const totalInitiative = roll + combatant.dexModifier;

    const totalDisplay = document.getElementById(`initiative-total-${combatantId}`);
    totalDisplay.textContent = totalInitiative;

    try {
        const response = await fetch(`${API_BASE}/combatants/${combatantId}/initiative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initiative: totalInitiative })
        });

        if (response.ok) {
            const newState = await response.json();

            if (!newState.combatants) {
                newState.combatants = [];
            }

            encounterState = newState;
            window.encounterState = encounterState;
            renderCombatantsList();
        }
    } catch (error) {
        console.error('Error setting initiative:', error);
    }
}

function getInitiativeRollValue(combatant) {
    if (!combatant.initiative) {
        return '';
    }
    return combatant.initiative - (combatant.dexModifier || 0);
}

function getInitiativeTotalDisplay(combatant) {
    return combatant.initiative || 0;
}

// Show attacks modal for a combatant
async function showAttacksModal(combatantId) {
    console.log('[showAttacksModal] Called with combatantId:', combatantId);

    const combatant = encounterState.combatants.find(c => c.id === combatantId);
    console.log('[showAttacksModal] Found combatant:', combatant);

    if (!combatant) {
        console.error('[showAttacksModal] Combatant not found!');
        return;
    }

    // Find the character data from saved agents
    const character = combatant.sourceId ? savedAgents.find(a => a.id === combatant.sourceId) : savedAgents.find(a => a.name === combatant.name);
    console.log('[showAttacksModal] Found character:', character);
    console.log('[showAttacksModal] Character attacks:', character?.attacks);

    const modal = document.getElementById('attack-modal');
    const modalTitle = document.getElementById('attack-modal-title');
    const modalBody = document.getElementById('attack-modal-body');

    modalTitle.textContent = `${combatant.name}'s Attacks`;

    if (!character || !character.attacks || character.attacks.length === 0) {
        console.log('[showAttacksModal] No attacks found, showing empty state');
        modalBody.innerHTML = '<div class="empty-state">No attacks configured for this character</div>';
        modal.style.display = 'flex';
        return;
    }

    modalBody.innerHTML = '';

    character.attacks.forEach(attack => {
        console.log('[showAttacksModal] Adding attack:', attack);
        const attackItem = document.createElement('div');
        attackItem.className = 'attack-modal-item';
        attackItem.onclick = () => performAttack(combatantId, attack);

        attackItem.innerHTML = `
            <div class="attack-modal-name">${attack.name}</div>
            <div class="attack-modal-details">
                <span>Attack: +${attack.attackBonus}</span>
                <span>Damage: ${attack.damageDice} ${attack.damageType}</span>
            </div>
        `;

        modalBody.appendChild(attackItem);
    });

    console.log('[showAttacksModal] Showing modal');
    modal.style.display = 'flex';
}

// Close attack modal
function closeAttackModal() {
    const modal = document.getElementById('attack-modal');
    modal.style.display = 'none';
}

// Perform an attack
async function performAttack(attackerId, attack) {
    closeAttackModal();

    // Get all valid targets (players and NPCs)
    const targets = encounterState.combatants.filter(c =>
        (c.type === 'p' || c.type === 'player' || c.type === 'n' || c.type === 'npc') &&
        c.hp.current > 0
    );

    if (targets.length === 0) {
        alert('No valid targets available!');
        return;
    }

    // Let user select a target
    const targetNames = targets.map((t, i) => `${i + 1}. ${t.name} (AC ${t.ac}, HP ${t.hp.current}/${t.hp.max})`).join('\n');
    const targetSelection = prompt(`Select target for ${attack.name}:\n\n${targetNames}\n\nEnter number:`);

    if (!targetSelection) return;

    const targetIndex = parseInt(targetSelection) - 1;
    if (targetIndex < 0 || targetIndex >= targets.length) {
        alert('Invalid target selection!');
        return;
    }

    const target = targets[targetIndex];

    // Roll to hit (d20 + attack bonus)
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const attackRoll = d20Roll + (attack.attackBonus || 0);

    const isCrit = d20Roll === 20;
    const isCritFail = d20Roll === 1;

    let resultMessage = `${attack.name} Attack:\nRolled: ${d20Roll} + ${attack.attackBonus} = ${attackRoll}\nTarget AC: ${target.ac}\n\n`;

    if (isCritFail) {
        resultMessage += 'CRITICAL MISS!\nThe attack automatically fails.';
        alert(resultMessage);
        return;
    }

    if (isCrit || attackRoll >= target.ac) {
        // Hit! Roll damage
        const damageRoll = rollDice(attack.damageDice, isCrit);
        resultMessage += isCrit ? 'CRITICAL HIT!\n' : 'HIT!\n';
        resultMessage += `Damage: ${damageRoll} ${attack.damageType} damage`;

        const confirmed = confirm(`${resultMessage}\n\nApply ${damageRoll} damage to ${target.name}?`);

        if (confirmed) {
            try {
                const response = await fetch(`${API_BASE}/combatants/${target.id}/hp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: damageRoll, type: 'damage' })
                });

                if (response.ok) {
                    await loadEncounterState();
                    renderCombatantsList();
                    alert(`${damageRoll} damage applied to ${target.name}!`);
                } else {
                    alert('Failed to apply damage');
                }
            } catch (error) {
                console.error('Error applying damage:', error);
                alert('Error applying damage');
            }
        }
    } else {
        resultMessage += 'MISS!\nThe attack does not hit.';
        alert(resultMessage);
    }
}

// Roll dice (e.g., "2d6+3")
function rollDice(diceString, isCrit = false) {
    // Parse dice string like "2d6+3" or "1d8" or "2d6"
    const match = diceString.match(/(\d+)?d(\d+)([+-]\d+)?/i);
    if (!match) return 0;

    let numDice = parseInt(match[1]) || 1;
    const diceSize = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;

    // Double dice on critical hit
    if (isCrit) {
        numDice *= 2;
    }

    let total = modifier;
    for (let i = 0; i < numDice; i++) {
        total += Math.floor(Math.random() * diceSize) + 1;
    }

    return total;
}

// Make functions globally available
window.showAttacksModal = showAttacksModal;
window.closeAttackModal = closeAttackModal;

async function handleRollEnemyInitiative() {
    if (!encounterState || !encounterState.combatants) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/initiative/roll-enemies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            encounterState = data;
            window.encounterState = encounterState;
            renderCombatantsList();
            updateCombatButtons();
        }
    } catch (error) {
        console.error('Error rolling enemy initiative:', error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

function attachAtlasEventListeners() {
    const atlasTabs = document.querySelectorAll('#atlas-tabs .codex-tab-btn');
    atlasTabs.forEach(btn => {
        btn.addEventListener('click', () => switchAtlasSection(btn.dataset.atlasSection));
    });
}

function switchAtlasSection(section) {
    document.querySelectorAll('#atlas-tabs .codex-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.atlasSection === section);
    });

    document.querySelectorAll('.atlas-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `atlas-${section}-section`);
    });
}
