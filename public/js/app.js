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
// Use current hostname so it works on LAN
const API_BASE = `${window.location.protocol}//${window.location.hostname}:${window.location.port || 3000}/api`;
const DISPLAY_SOCKET_PATH = '/display';

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
    activeJournalId: null,
    observers: {
        characterList: null,
        enemyList: null
    }
};

const CODEX_ICON_FALLBACKS = {
    'amphibious': 'icons/magic/water/bubbles-air-water-blue.webp',
    'legendary resistance': 'icons/magic/defensive/illusion-evasion-echo-purple.webp',
    'legendary actions': 'icons/magic/control/reading-book-purple.webp',
    'legendary actions options': 'icons/magic/control/reading-book-purple.webp',
    'multiattack': 'icons/skills/melee/weapons-crossed-swords-purple.webp',
    'frightful presence': 'icons/creatures/abilities/dragon-head-blue.webp',
    'acid breath': 'icons/magic/acid/projectile-glowing-bubbles.webp'
};

function resolveCodexImagePath(imgPath, fallbackKey) {
    let resolved = imgPath;

    if (!resolved && fallbackKey) {
        const fallback = CODEX_ICON_FALLBACKS[fallbackKey.toLowerCase()];
        if (fallback) {
            resolved = fallback;
        }
    }

    if (!resolved) {
        return null;
    }

    // Normalize Foundry export paths like "data/creatures/library/icons/..." or "/data/creatures/library/icons/..."
    // Strip everything up to and including "library/" to get just "icons/..."
    if (resolved.includes('/library/')) {
        const beforeTransform = resolved;
        resolved = resolved.substring(resolved.indexOf('/library/') + '/library/'.length);
        console.log(`[resolveCodexImagePath] Transformed: ${beforeTransform} → ${resolved}`);
    }

    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        return resolved;
    }

    if (resolved.startsWith('/')) {
        return resolved;
    }

    const finalPath = `/db-assets/${resolved.replace(/^\/+/, '').replace(/^\/+/, '')}`;
    console.log(`[resolveCodexImagePath] Final path: ${finalPath}`);
    return finalPath;
}

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
                // Normalize Foundry creature structure to match our sheet format
                const normalized = {
                    ...creature,
                    specialAbilities: creature.items ? creature.items
                        .filter(item => item.type === 'feat')
                        .map(item => ({
                            name: item.name,
                            img: item.img,
                            icon: item.img,
                            description: item.system?.description?.value || ''
                        })) : [],
                    actions: creature.items ? creature.items
                        .filter(item => item.type === 'weapon')
                        .map(item => ({
                            name: item.name,
                            img: item.img,
                            icon: item.img,
                            description: item.system?.description?.value || '',
                            type: item.system?.actionType || '',
                            attackBonus: item.system?.attack?.bonus || undefined,
                            damage: item.system?.damage?.parts?.[0]?.[0] || '',
                            damageRoll: item.system?.damage?.parts?.[0]?.[0] || ''
                        })) : []
                };
                mergedEnemySheets.push(normalized);
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
    const tabButtons = document.querySelectorAll('#codex-view .codex-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchCodexSection(btn.dataset.codexSection));
    });

    document.getElementById('codex-journal-save-btn').addEventListener('click', handleJournalSave);
    document.getElementById('codex-journal-new-btn').addEventListener('click', handleJournalNew);

    // Ensure character tab is active on first render
    codexState.activeSection = 'character';
    renderCodex();

    setupCodexObservers();
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
    document.querySelectorAll('#codex-view .codex-tab-btn').forEach(btn => {
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
        const portraitUrl = resolveCodexImagePath(char.imagePath);
        card.innerHTML = `
            ${portraitUrl ? `<img class="codex-sheet-portrait" src="${portraitUrl}" alt="${char.name} portrait" loading="lazy">` : ''}
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

    enqueueCodexDetailRender('character');
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
        const portraitUrl = resolveCodexImagePath(enemy.imagePath);
        card.innerHTML = `
            ${portraitUrl ? `<img class="codex-sheet-portrait" src="${portraitUrl}" alt="${enemy.name} portrait" loading="lazy">` : ''}
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

    enqueueCodexDetailRender('enemy');
}

function getCodexSheetDetailHTML(sheet, type) {
    const portraitUrl = resolveCodexImagePath(sheet.imagePath);
    const portraitHTML = portraitUrl
        ? `<img src="${portraitUrl}" alt="${sheet.name} portrait" loading="lazy">`
        : '<div class="codex-sheet-placeholder">No Image</div>';

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
                ${sheet.specialAbilities.map(ability => {
                    const iconUrl = resolveCodexImagePath(ability.img || ability.icon, ability.name);
                    return `
                    <div class="codex-trait-block">
                        ${iconUrl ? `<img class="codex-trait-icon" src="${iconUrl}" alt="${ability.name}" loading="lazy">` : ''}
                        <div class="codex-trait-body">
                            <strong>${ability.name}.</strong> ${ability.description || ''}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `
        : '';

    const actionsHTML = sheet.actions && sheet.actions.length > 0
        ? `
            <div class="codex-notes">
                <h3>Actions</h3>
                ${sheet.actions.map(action => {
                    const iconUrl = resolveCodexImagePath(action.img || action.icon, action.name);
                    const actionDetails = [
                        action.type ? `(${action.type})` : '',
                        action.attackBonus !== undefined ? `Attack +${action.attackBonus}` : '',
                        action.damage || action.damageRoll || '',
                        action.description || ''
                    ].filter(Boolean).join(' — ');

                    return `
                    <div class="codex-trait-block">
                        ${iconUrl ? `<img class="codex-trait-icon" src="${iconUrl}" alt="${action.name}" loading="lazy">` : ''}
                        <div class="codex-trait-body">
                            <strong>${action.name}</strong> ${actionDetails}
                        </div>
                    </div>`;
                }).join('')}
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

function setupCodexObservers() {
    const characterList = document.getElementById('codex-character-list');
    const enemyList = document.getElementById('codex-enemy-list');

    if ('IntersectionObserver' in window) {
        if (characterList) {
            codexState.observers.characterList = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const sheetId = entry.target.dataset.sheetId;
                        if (sheetId && codexState.activeCharacterId !== sheetId) {
                            codexState.activeCharacterId = sheetId;
                            enqueueCodexDetailRender('character');
                        }
                    }
                });
            }, { root: characterList, threshold: 0.9 });
        }

        if (enemyList) {
            codexState.observers.enemyList = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const sheetId = entry.target.dataset.sheetId;
                        if (sheetId && codexState.activeEnemyId !== sheetId) {
                            codexState.activeEnemyId = sheetId;
                            enqueueCodexDetailRender('enemy');
                        }
                    }
                });
            }, { root: enemyList, threshold: 0.9 });
        }
    }
}

function enqueueCodexDetailRender(type) {
    window.requestAnimationFrame(() => {
        if (type === 'character') {
            renderCharacterDetail();
        } else if (type === 'enemy') {
            renderEnemyDetail();
        }
    });
}

function renderCharacterDetail() {
    const detailEl = document.getElementById('codex-character-detail');
    if (!detailEl) return;

    const activeChar = codexState.characterSheets.find(char => char.id === codexState.activeCharacterId);
    if (!activeChar) {
        detailEl.innerHTML = '<div class="empty-state">Select a character to view their sheet</div>';
        return;
    }

    detailEl.innerHTML = getCodexSheetDetailHTML(activeChar, 'character');
}

function renderEnemyDetail() {
    const detailEl = document.getElementById('codex-enemy-detail');
    if (!detailEl) return;

    const activeEnemy = codexState.enemySheets.find(enemy => (enemy.id || enemy.name) === codexState.activeEnemyId);
    if (!activeEnemy) {
        detailEl.innerHTML = '<div class="empty-state">Select an enemy to view their sheet</div>';
        return;
    }

    detailEl.innerHTML = getCodexSheetDetailHTML(activeEnemy, 'enemy');
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
    initAtlasMapModule();
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

        // Sync combatants to Atlas after loading (only if we have a session/encounter)
        console.log('[loadEncounterState] Checking sync conditions:', {
            hasSessionState: !!window.sessionState,
            hasCurrentEncounter: !!(window.sessionState?.currentEncounter),
            hasSyncFunction: typeof window.syncCombatantsToAtlas === 'function',
            hasAtlasMapState: !!window.atlasMapState
        });

        if (window.sessionState && window.sessionState.currentEncounter && typeof window.syncCombatantsToAtlas === 'function') {
            console.log('[loadEncounterState] Calling syncCombatantsToAtlas');
            window.syncCombatantsToAtlas();

            // Trigger auto-save to persist the sync
            if (typeof saveCurrentEncounter === 'function') {
                await saveCurrentEncounter();
            }
        } else {
            console.log('[loadEncounterState] Skipping sync - conditions not met');
        }
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

// Expose as window.loadCombatants for other modules
window.loadCombatants = loadEncounterState;

// Load saved agents (characters)
async function loadSavedAgents() {
    try {
        console.log('[loadSavedAgents] Fetching from:', `${API_BASE}/characters`);
        const response = await fetch(`${API_BASE}/characters`);
        console.log('[loadSavedAgents] Response status:', response.status, response.statusText);
        savedAgents = await response.json();
        console.log('[loadSavedAgents] Loaded agents:', savedAgents.length, savedAgents);
        
        // Expose to window for other modules
        window.charactersData = savedAgents;
        console.log('[loadSavedAgents] Exposed charactersData to window with', savedAgents.length, 'characters');
        
        refreshEncounterEnemyAgents();
    } catch (error) {
        console.error('[loadSavedAgents] Error loading saved agents:', error);
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
        console.log(`[getAttacksHTML] Skipping ${combatant.name}: not NPC/Enemy (type: ${combatant.type})`);
        return '';
    }

    // Find attacks from either the combatant itself (Monster Library) or saved agents (Crucible)
    let attacks = combatant.attacks || [];
    
    // If no attacks on combatant, try to find from saved agents
    if (attacks.length === 0) {
        const baseName = combatant.name.split(' - ')[0];
        const character = combatant.sourceId 
            ? savedAgents.find(a => a.id === combatant.sourceId) 
            : (savedAgents.find(a => a.name === combatant.name) || savedAgents.find(a => a.name === baseName));
        
        if (character && character.attacks) {
            attacks = character.attacks;
        }
    }

    console.log(`[getAttacksHTML] ${combatant.name}: sourceId=${combatant.sourceId}, combatant.attacks=${combatant.attacks?.length || 0}, final attacks=${attacks.length}`);

    if (attacks.length === 0) {
        console.log(`[getAttacksHTML] No attacks found for ${combatant.name}`);
        return '';
    }

    const attackOptions = attacks.map((attack, index) => {
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
            ${getSpecialAbilitiesHTML(combatant)}
        </div>
    `;
}

// Get special abilities HTML (non-attack actions like Multiattack, Breath Weapons, etc.)
function getSpecialAbilitiesHTML(combatant) {
    const specialAbilities = combatant.specialAbilities || [];
    
    if (specialAbilities.length === 0) {
        return '';
    }
    
    const abilitiesList = specialAbilities.map((ability, index) => {
        const abilityId = `ability-${combatant.id}-${index}`;
        return `
            <div class="special-ability-item">
                <div class="special-ability-header" onclick="toggleSpecialAbility('${abilityId}')">
                    <span class="special-ability-caret" id="caret-${abilityId}">▸</span>
                    <strong>${ability.name}</strong>
                </div>
                <div class="special-ability-description collapsed" id="${abilityId}">
                    ${ability.description || 'No description available.'}
                </div>
            </div>
        `;
    }).join('');
    
    return `
        <div class="special-abilities-section">
            <h4>Special Abilities:</h4>
            ${abilitiesList}
        </div>
    `;
}

// Toggle special ability description visibility
function toggleSpecialAbility(abilityId) {
    const description = document.getElementById(abilityId);
    const caret = document.getElementById(`caret-${abilityId}`);
    
    if (!description || !caret) {
        return;
    }
    
    const isCollapsed = description.classList.toggle('collapsed');
    caret.textContent = isCollapsed ? '▸' : '▾';
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

    // Get attacks from combatant or saved agents
    let attacks = attacker.attacks || [];
    if (attacks.length === 0) {
        const attackerBaseName = attacker.name.split(' - ')[0];
        const attackerData = attacker.sourceId 
            ? savedAgents.find(agent => agent.id === attacker.sourceId) 
            : (savedAgents.find(agent => agent.name === attacker.name) || savedAgents.find(agent => agent.name === attackerBaseName));
        if (attackerData && attackerData.attacks) {
            attacks = attackerData.attacks;
        }
    }
    
    if (!attacks || !attacks[attackIndex]) {
        updateAttackResultUI(attackerId, 'Attack data is missing for this combatant.', 'info');
        resetAttackUI(attackerId);
        return;
    }

    const attack = attacks[attackIndex];
    const attackBonus = Number(attack.attackBonus) || 0;
    const d20Roll = Math.floor(Math.random() * 20) + 1;
    const totalRoll = d20Roll + attackBonus;
    const targetAC = Number(target.ac) || 0;
    const isCritical = d20Roll === 20;
    const isCriticalMiss = d20Roll === 1;
    const hit = isCritical || (!isCriticalMiss && totalRoll >= targetAC);

    // Support both damageDice (from character builder) and damageRoll (from monster library)
    const damageFormula = attack.damageRoll || attack.damageDice || '';
    const sanitizedDamage = damageFormula.toString().replace(/\s+/g, '');
    const rolledDamage = hit ? Math.max(0, rollDice(sanitizedDamage, isCritical)) : 0;
    
    console.log(`[rollAttack] Attack: ${attack.name}, damageRoll: ${attack.damageRoll}, damageDice: ${attack.damageDice}, sanitized: ${sanitizedDamage}, rolled: ${rolledDamage}`);

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
    refreshEncounterEnemyAgents();
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
    const baseName = combatant.name.split(' - ')[0];
    const character = combatant.sourceId 
        ? savedAgents.find(a => a.id === combatant.sourceId) 
        : (savedAgents.find(a => a.name === combatant.name) || savedAgents.find(a => a.name === baseName));
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

// Atlas Map Module
const atlasMapState = {
    maps: [],
    settings: null,
    activeMapId: null,
    preview: {
        fit: 'fit',
        showGrid: true,
        zoom: 1,
        gridZoom: 1,
        offset: { x: 0, y: 0 }
    },
    displayConnected: false,
    ruler: {
        enabled: false,
        draggingPoint: null,
        start: { x: 120, y: 120 },
        end: { x: 240, y: 120 }
    },
    encounter: {
        zoom: 1,
        minZoom: 0.2,
        maxZoom: 6,
        offset: { x: 0, y: 0 },
        dragging: false,
        dragMoved: false,
        dragStart: null,
        originalOffset: { x: 0, y: 0 },
        placing: false,
        startArea: null,
        areaZoom: 1,
        minAreaZoom: 0.25,
        maxAreaZoom: 4,
        dirty: false,
        render: null,
        selectedEnemy: null,
        pending: [],
        placementMode: false,
        placementEntry: null,
        selectedToken: null,
        enemies: {
            monsters: [],
            agents: [],
            combined: [],
            filter: 'all',
            search: '',
            loading: false,
            loaded: false,
            error: null
        }
    },
    imageCache: new Map()
};

// Expose to other modules (e.g., session-manager) for cross-view sync
// This resolves race conditions where session-manager expects window.atlasMapState
// and ensures bidirectional sync can run reliably.
window.atlasMapState = atlasMapState;

// Lightweight sync debug HUD
function updateSyncDebugHUD(extra) {
    try {
        const el = document.getElementById('sync-debug');
        if (!el) return;

        const arenaCount = (window.encounterState?.combatants?.length) || 0;
        const pending = (window.atlasMapState?.encounter?.pending) || [];
        const pendingCount = pending.length;
        const placedCount = pending.filter(e => e.placed && e.position).length;
        const lastSaved = window.__lastEncounterSaveAt ? new Date(window.__lastEncounterSaveAt).toLocaleTimeString() : '—';

        el.textContent = `Sync • Arena: ${arenaCount} • Atlas (pending/placed): ${pendingCount}/${placedCount} • Saved: ${lastSaved}${extra ? ' • ' + extra : ''}`;
    } catch (e) {
        // no-op
    }
}

// Periodically refresh the HUD
setInterval(() => updateSyncDebugHUD(), 1000);

function getAtlasElements() {
    return {
        uploadInput: document.getElementById('atlas-map-upload-input'),
        listContainer: document.getElementById('atlas-map-list'),
        resolutionWidth: document.getElementById('atlas-resolution-width'),
        resolutionHeight: document.getElementById('atlas-resolution-height'),
        refreshRate: document.getElementById('atlas-refresh-rate'),
        diagonal: document.getElementById('atlas-diagonal'),
        ppi: document.getElementById('atlas-ppi'),
        autoCalibrateBtn: document.getElementById('atlas-auto-calibrate-btn'),
        manualCalibrateBtn: document.getElementById('atlas-manual-calibrate-btn'),
        gridInches: document.getElementById('atlas-grid-inches'),
        gridLine: document.getElementById('atlas-grid-line'),
        gridOpacity: document.getElementById('atlas-grid-opacity'),
        gridColor: document.getElementById('atlas-grid-color'),
        gridEnabled: document.getElementById('atlas-grid-enabled'),
        saveSettingsBtn: document.getElementById('atlas-save-settings-btn'),
        pushDisplayBtn: document.getElementById('atlas-push-display-btn'),
        previewCanvas: document.getElementById('atlas-preview-canvas'),
        previewEmpty: document.getElementById('atlas-preview-empty'),
        previewFit: document.getElementById('atlas-preview-fit'),
        previewGridToggle: document.getElementById('atlas-preview-grid'),
        previewZoomIn: document.getElementById('atlas-preview-zoom-in'),
        previewZoomOut: document.getElementById('atlas-preview-zoom-out'),
        previewZoomReset: document.getElementById('atlas-preview-zoom-reset'),
        displayStatus: document.getElementById('atlas-display-status'),
        atlasSection: document.getElementById('atlas-map-section'),
        encounterSection: document.getElementById('atlas-encounters-section'),
        encounterCanvas: document.getElementById('atlas-encounter-canvas'),
        encounterEmpty: document.getElementById('atlas-encounter-empty'),
        encounterZoomIn: document.getElementById('atlas-encounter-zoom-in'),
        encounterZoomOut: document.getElementById('atlas-encounter-zoom-out'),
        encounterZoomReset: document.getElementById('atlas-encounter-zoom-reset'),
        encounterGridOut: document.getElementById('atlas-encounter-grid-out'),
        encounterGridIn: document.getElementById('atlas-encounter-grid-in'),
        encounterGridReset: document.getElementById('atlas-encounter-grid-reset'),
        placeStartAreaBtn: document.getElementById('atlas-start-area-place'),
        clearStartAreaBtn: document.getElementById('atlas-start-area-clear'),
        saveStartAreaBtn: document.getElementById('atlas-start-area-save'),
        startAreaHint: document.getElementById('atlas-start-area-hint'),
        startAreaResolutionLabel: document.getElementById('atlas-start-area-resolution'),
        startAreaCoordsLabel: document.getElementById('atlas-start-area-coords'),
        startAreaGridLabel: document.getElementById('atlas-start-area-grid'),
        startAreaStatus: document.getElementById('atlas-start-area-status'),
        enemyPanel: document.getElementById('atlas-enemy-panel'),
        enemyList: document.getElementById('atlas-enemy-list'),
        enemyEmpty: document.getElementById('atlas-enemy-empty'),
        enemyDetail: document.getElementById('atlas-enemy-detail'),
        enemySearch: document.getElementById('atlas-enemy-search'),
        enemyFilterAll: document.getElementById('atlas-enemy-filter-all'),
        enemyFilterLibrary: document.getElementById('atlas-enemy-filter-library'),
        enemyFilterCustom: document.getElementById('atlas-enemy-filter-custom'),
        enemyRefreshBtn: document.getElementById('atlas-enemy-refresh'),
        enemyStagingList: document.getElementById('atlas-enemy-staging-list'),
        stagingClearAll: document.getElementById('atlas-staging-clear-all')
    };
}

function initAtlasMapModule() {
    const elements = getAtlasElements();
    if (!elements.atlasSection) {
        return;
    }

    setupAtlasSockets();
    bindAtlasMapEvents();
    initAtlasEncounterModule();
    loadAtlasInitialData();
    injectDisplayLaunchButton();
}

function setupAtlasSockets() {
    if (window.io) {
        atlasMapState.socket = io('/', { path: '/socket.io' });
        atlasMapState.socket.on('connect', () => {
            atlasMapState.displayConnected = true;
            atlasMapState.socket.emit('display:hello', {
                role: 'control'
            });
            updateDisplayStatus();
        });
        atlasMapState.socket.on('display:state', (payload) => {
            atlasMapState.displayConnected = true;
            if (payload) {
                updateAtlasStateFromSocket(payload);
            }
        });
        atlasMapState.socket.on('disconnect', () => {
            atlasMapState.displayConnected = false;
            updateDisplayStatus();
        });
    }
}

function loadAtlasInitialData() {
    Promise.all([
        fetch(`${API_BASE}/maps`).then((res) => res.json()),
        fetch(`${API_BASE}/atlas/settings`).then((res) => res.json())
    ]).then(([maps, settings]) => {
        atlasMapState.maps = maps || [];
        atlasMapState.settings = settings || null;
        atlasMapState.activeMapId = settings?.active_map_id || null;
        syncEncounterStateFromSettings(true);
        updateEncounterControls();
        updateEncounterSummary(null);
        renderAtlasMapList();
        populateSettingsForm();
        drawAtlasPreview();
        drawAtlasEncounter();
    }).catch((error) => {
        console.error('[Atlas] Failed to load initial data:', error);
        updateEncounterSummary(null);
    });
}

function bindAtlasMapEvents() {
    const elements = getAtlasElements();
    if (!elements.atlasSection) {
        return;
    }

    elements.uploadInput?.addEventListener('change', handleAtlasMapUpload);
    elements.pushDisplayBtn?.addEventListener('click', handleAtlasPushToDisplay);

    // Add refresh button event listener
    const refreshStatusBtn = document.getElementById('atlas-refresh-status-btn');
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', refreshDisplayStatus);
    }

    elements.previewFit?.addEventListener('change', (event) => {
        atlasMapState.preview.fit = event.target.value;
        drawAtlasPreview();
    });
    elements.previewGridToggle?.addEventListener('change', (event) => {
        atlasMapState.preview.showGrid = event.target.checked;
        drawAtlasPreview();
    });
    elements.previewZoomIn?.addEventListener('click', () => {
        atlasMapState.preview.zoom = Math.min(atlasMapState.preview.zoom + 0.1, 5);
        drawAtlasPreview();
    });
    elements.previewZoomOut?.addEventListener('click', () => {
        atlasMapState.preview.zoom = Math.max(atlasMapState.preview.zoom - 0.1, 0.1);
        drawAtlasPreview();
    });
    elements.previewZoomReset?.addEventListener('click', () => {
        atlasMapState.preview.zoom = 1;
        atlasMapState.preview.offset.x = 0;
        atlasMapState.preview.offset.y = 0;
        drawAtlasPreview();
    });

    // Grid zoom controls
    const gridZoomIn = document.getElementById('atlas-grid-zoom-in');
    const gridZoomOut = document.getElementById('atlas-grid-zoom-out');
    const gridZoomReset = document.getElementById('atlas-grid-zoom-reset');

    if (gridZoomIn) {
        gridZoomIn.addEventListener('click', () => {
            atlasMapState.preview.gridZoom = Math.min(atlasMapState.preview.gridZoom + 0.1, 3);
            drawAtlasPreview();
        });
    }

    if (gridZoomOut) {
        gridZoomOut.addEventListener('click', () => {
            atlasMapState.preview.gridZoom = Math.max(atlasMapState.preview.gridZoom - 0.1, 0.1);
            drawAtlasPreview();
        });
    }

    if (gridZoomReset) {
        gridZoomReset.addEventListener('click', () => {
            atlasMapState.preview.gridZoom = 1;
            drawAtlasPreview();
        });
    }

    elements.autoCalibrateBtn?.addEventListener('click', handleAtlasAutoCalibrate);
    elements.manualCalibrateBtn?.addEventListener('click', toggleAtlasManualCalibration);
    window.addEventListener('resize', handleAtlasResize);
    elements.previewCanvas?.addEventListener('wheel', handlePreviewWheel, { passive: false });
    elements.previewCanvas?.addEventListener('mousedown', startPreviewDrag);
    elements.previewCanvas?.addEventListener('mousemove', handlePreviewDrag);
    elements.previewCanvas?.addEventListener('mouseup', endPreviewDrag);
    elements.previewCanvas?.addEventListener('mouseleave', endPreviewDrag);
}

function handleAtlasResize() {
    drawAtlasPreview();
    drawAtlasEncounter();
}

function injectDisplayLaunchButton() {
    const library = document.querySelector('.atlas-map-library');
    if (!library || library.querySelector('.atlas-open-display')) {
        return;
    }

    const openBtn = document.createElement('a');
    openBtn.href = `${window.location.protocol}//${window.location.hostname}:3001/display`;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.className = 'btn btn-secondary atlas-open-display';
    openBtn.textContent = 'Open Player Display';

    library.appendChild(openBtn);
}

function handleAtlasMapUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        return;
    }

    files.forEach((file) => {
        const formData = new FormData();
        formData.append('file', file);
        uploadSingleMap(formData);
    });

    event.target.value = '';
}

function uploadSingleMap(formData) {
    fetch(`${API_BASE}/maps`, {
        method: 'POST',
        body: formData
    })
        .then((res) => {
            if (!res.ok) {
                return res.json()
                    .then((data) => {
                        const message = data?.error || `Upload failed: ${res.status}`;
                        throw new Error(message);
                    })
                    .catch(() => {
                        throw new Error(`Upload failed: ${res.status}`);
                    });
            }
            return res.json();
        })
        .then((record) => {
            atlasMapState.maps.push(record);
            renderAtlasMapList();
            atlasMapState.activeMapId = record.id;
            drawAtlasPreview();
            updateDisplayStatus();
        })
        .catch((error) => {
            console.error('[Atlas] Failed to upload map:', error);
            alert(error.message || 'Failed to upload map. Please try again.');
        });
}

function renderAtlasMapList() {
    const { listContainer } = getAtlasElements();
    if (!listContainer) {
        return;
    }

    if (!atlasMapState.maps.length) {
        listContainer.innerHTML = '<div class="atlas-empty-state">Upload a map to get started.</div>';
        return;
    }

    listContainer.innerHTML = '';
    atlasMapState.maps.forEach((map) => {
        const item = document.createElement('div');
        item.className = 'atlas-map-item';
        item.dataset.mapId = map.id;
        if (atlasMapState.activeMapId === map.id) {
            item.classList.add('active');
        }

        const thumbnail = document.createElement('img');
        thumbnail.src = map.file;
        thumbnail.alt = `${map.name} thumbnail`;
        thumbnail.className = 'atlas-map-thumbnail';
        thumbnail.loading = 'lazy';

        const meta = document.createElement('div');
        meta.className = 'atlas-map-meta';
        const nameEl = document.createElement('div');
        nameEl.className = 'atlas-map-name';
        nameEl.textContent = map.name;

        const detailsEl = document.createElement('div');
        detailsEl.className = 'atlas-map-details';
        if (map.width_px && map.height_px) {
            detailsEl.textContent = `${map.width_px} × ${map.height_px} px`;
        } else {
            detailsEl.textContent = 'Dimensions pending';
        }

        const actions = document.createElement('div');
        actions.className = 'atlas-map-actions';
        const activateBtn = document.createElement('button');
        activateBtn.className = 'btn btn-primary btn-small';
        activateBtn.textContent = map.id === atlasMapState.activeMapId ? 'Active' : 'Set Active';
        activateBtn.disabled = map.id === atlasMapState.activeMapId;
        activateBtn.addEventListener('click', () => setAtlasActiveMap(map.id));

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn btn-secondary btn-small';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', () => renameAtlasMap(map));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteAtlasMap(map.id));

        actions.append(activateBtn, renameBtn, deleteBtn);
        meta.append(nameEl, detailsEl, actions);
        item.append(thumbnail, meta);

        item.addEventListener('click', (event) => {
            if (event.target.tagName.toLowerCase() === 'button') {
                return;
            }
            atlasMapState.activeMapId = map.id;
            drawAtlasPreview();
            renderAtlasMapList();
        });

        listContainer.appendChild(item);
    });
}

function renameAtlasMap(map) {
    const newName = prompt('Enter map name:', map.name);
    if (!newName || newName === map.name) {
        return;
    }

    fetch(`${API_BASE}/maps/${map.id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName })
    }).then((res) => {
        if (!res.ok) {
            throw new Error('Rename failed');
        }
        map.name = newName;
        renderAtlasMapList();
    }).catch((error) => {
        console.error('[Atlas] Failed to rename map:', error);
        alert('Failed to rename map.');
    });
}

function deleteAtlasMap(mapId) {
    if (!confirm('Delete this map? This cannot be undone.')) {
        return;
    }

    fetch(`${API_BASE}/maps/${mapId}`, { method: 'DELETE' })
        .then((res) => {
            if (!res.ok) {
                throw new Error('Delete failed');
            }
            atlasMapState.maps = atlasMapState.maps.filter((entry) => entry.id !== mapId);
            if (atlasMapState.activeMapId === mapId) {
                atlasMapState.activeMapId = null;
                drawAtlasPreview();
                drawAtlasEncounter();
                updateEncounterSummary(null);
                updateEncounterControls();
            }
            renderAtlasMapList();
        })
        .catch((error) => {
            console.error('[Atlas] Failed to delete map:', error);
            alert('Failed to delete map.');
        });
}

function setAtlasActiveMap(mapId) {
    fetch(`${API_BASE}/atlas/active-map`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mapId })
    })
        .then((res) => {
            if (!res.ok) {
                throw new Error('Failed to set active map');
            }
            atlasMapState.activeMapId = mapId;
            resetEncounterView();
            syncEncounterStateFromSettings(true);
            updateEncounterControls();
            updateEncounterSummary(null);
            renderAtlasMapList();
            drawAtlasPreview();
            drawAtlasEncounter();
        })
        .catch((error) => {
            console.error('[Atlas] Failed to set active map:', error);
            alert('Failed to set active map.');
        });
}

function populateSettingsForm() {
    const elements = getAtlasElements();
    const settings = atlasMapState.settings;
    if (!elements || !settings) {
        return;
    }

    const resolution = settings.display?.resolution || { w: 1920, h: 1080 };
    elements.resolutionWidth.value = resolution.w;
    elements.resolutionHeight.value = resolution.h;
    elements.refreshRate.value = settings.display?.resolution?.refresh ?? '';
    elements.diagonal.value = settings.display?.physical?.diagonal_in ?? 42;
    const ppi = settings.display?.physical?.ppi_override ?? settings.display?.grid?.pixels_per_inch ?? '';
    elements.ppi.value = ppi;

    elements.gridInches.value = settings.display?.grid?.inches_per_cell ?? 1;
    elements.gridLine.value = settings.display?.grid?.line_px ?? 2;
    elements.gridOpacity.value = settings.display?.grid?.opacity ?? 0.25;
    if (settings.display?.grid?.color) {
        elements.gridColor.value = settings.display.grid.color;
    }
    elements.gridEnabled.checked = settings.display?.grid?.enabled ?? true;
    atlasMapState.preview.showGrid = elements.previewGridToggle.checked = settings.display?.grid?.enabled ?? true;
    atlasMapState.preview.fit = settings.display?.viewport?.fit || 'fit';
    atlasMapState.preview.zoom = settings.display?.viewport?.zoom || 1;
    atlasMapState.preview.gridZoom = settings.display?.viewport?.gridZoom || 1;
    atlasMapState.preview.offset = {
        x: settings.display?.viewport?.offset?.x || 0,
        y: settings.display?.viewport?.offset?.y || 0
    };
    const fitSelect = elements.previewFit;
    if (fitSelect) {
        fitSelect.value = atlasMapState.preview.fit;
    }
    updateEncounterSummary(atlasMapState.encounter.render?.startRect || null);
    drawAtlasPreview();
    drawAtlasEncounter();
}

function gatherSettingsPayload() {
    const elements = getAtlasElements();
    return {
        active_map_id: atlasMapState.activeMapId,
        display: {
            resolution: {
                w: Number(elements.resolutionWidth.value) || 1920,
                h: Number(elements.resolutionHeight.value) || 1080,
                refresh: elements.refreshRate.value ? Number(elements.refreshRate.value) : undefined
            },
            physical: {
                diagonal_in: Number(elements.diagonal.value) || 42,
                ppi_override: elements.ppi.value ? Number(elements.ppi.value) : null
            },
            grid: {
                inches_per_cell: Number(elements.gridInches.value) || 1,
                line_px: Number(elements.gridLine.value) || 2,
                opacity: Number(elements.gridOpacity.value) || 0.25,
                color: elements.gridColor.value || '#3aaaff',
                enabled: elements.gridEnabled.checked
            },
            viewport: {
                fit: atlasMapState.preview.fit,
                zoom: atlasMapState.preview.zoom,
                gridZoom: atlasMapState.preview.gridZoom,
                offset: atlasMapState.preview.offset
            }
        }
    };
}

function handleAtlasSaveSettings() {
    const payload = gatherSettingsPayload();
    fetch(`${API_BASE}/atlas/settings`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then((res) => res.json())
        .then((settings) => {
            atlasMapState.settings = settings;
            syncEncounterStateFromSettings(false);
            populateSettingsForm();
            alert('Display settings saved.');
        })
        .catch((error) => {
            console.error('[Atlas] Failed to save settings:', error);
            alert('Failed to save settings.');
        });
}

function handleAtlasPushToDisplay() {
    const payload = gatherSettingsPayload();

    // First save the settings
    fetch(`${API_BASE}/atlas/settings`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then((res) => res.json())
        .then((settings) => {
            atlasMapState.settings = settings;
            syncEncounterStateFromSettings(false);
            drawAtlasEncounter();

            // Then push the active map to display
            return fetch(`${API_BASE}/atlas/active-map`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mapId: payload.active_map_id })
            });
        })
        .then((res) => {
            if (!res.ok) {
                throw new Error('Failed to push display state');
            }
            alert('Settings saved and map pushed to display.');
        })
        .catch((error) => {
            console.error('[Atlas] Failed to push display state:', error);
            alert('Failed to push display state.');
        });
}

function handleAtlasAutoCalibrate() {
    const elements = getAtlasElements();
    const width = Number(elements.resolutionWidth.value);
    const height = Number(elements.resolutionHeight.value);
    const diagonal = Number(elements.diagonal.value);
    if (!width || !height || !diagonal) {
        alert('Enter resolution width/height and diagonal first.');
        return;
    }
    const ppi = Math.sqrt((width ** 2) + (height ** 2)) / diagonal;
    elements.ppi.value = ppi.toFixed(2);
    atlasMapState.settings.display.physical.ppi_override = ppi;
}

function toggleAtlasManualCalibration() {
    const elements = getAtlasElements();
    const wrapper = elements.previewCanvas?.parentElement;
    if (!wrapper) {
        return;
    }

    atlasMapState.ruler.enabled = !atlasMapState.ruler.enabled;
    wrapper.classList.toggle('atlas-calibrating', atlasMapState.ruler.enabled);
    drawAtlasPreview();

    if (atlasMapState.ruler.enabled) {
        alert('Drag the ruler endpoints to match a real-world inch on your display, then enter the measured inches to calibrate.');
    }
}

function updateDisplayStatus() {
    const { displayStatus } = getAtlasElements();
    if (!displayStatus) {
        return;
    }
    const connected = atlasMapState.displayConnected || (atlasMapState.lastDisplayState?.connected ?? false);
    displayStatus.textContent = connected ? 'Display connected' : 'Display not connected';
    displayStatus.classList.toggle('atlas-status-connected', connected);
    displayStatus.classList.toggle('atlas-status-disconnected', !connected);
}

async function refreshDisplayStatus() {
    const refreshBtn = document.getElementById('atlas-refresh-status-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '⏳';
    }

    try {
        // Query the server for connected displays
        const response = await fetch(`${API_BASE}/atlas/displays`);
        if (response.ok) {
            const data = await response.json();
            const isConnected = data.count > 0;

            // Update the state
            atlasMapState.displayConnected = isConnected;

            // Force socket to emit a hello message to refresh state
            if (atlasMapState.socket && atlasMapState.socket.connected) {
                atlasMapState.socket.emit('display:hello', { role: 'control' });
            }

            // Update the UI
            updateDisplayStatus();

            console.log(`[Atlas] Display status refreshed: ${isConnected ? 'connected' : 'not connected'} (${data.count} display(s))`);
        } else {
            console.error('[Atlas] Failed to fetch display status');
        }
    } catch (error) {
        console.error('[Atlas] Error refreshing display status:', error);
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄';
        }
    }
}

function applyDisplayResolution(viewport) {
    const elements = getAtlasElements();
    if (!viewport || !elements.resolutionWidth) {
        return;
    }
    elements.resolutionWidth.value = viewport.w;
    elements.resolutionHeight.value = viewport.h;
}

function applyDisplayGrid(grid) {
    const elements = getAtlasElements();
    if (!grid) {
        return;
    }
    elements.gridColor.value = grid.color || '#3aaaff';
    elements.gridLine.value = grid.line_px || 2;
    elements.gridOpacity.value = grid.opacity || 0.25;
    elements.gridEnabled.checked = grid.enabled ?? true;
    if (grid.cell_px && atlasMapState.settings?.display?.physical?.ppi_override) {
        const inches = grid.cell_px / atlasMapState.settings.display.physical.ppi_override;
        elements.gridInches.value = inches.toFixed(2);
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function initAtlasEncounterModule() {
    const elements = getAtlasElements();
    if (!elements?.encounterCanvas) {
        return;
    }

    elements.encounterZoomIn?.addEventListener('click', () => changeEncounterFrameZoom(0.25));
    elements.encounterZoomOut?.addEventListener('click', () => changeEncounterFrameZoom(-0.25));
    elements.encounterZoomReset?.addEventListener('click', () => {
        setEncounterFrameZoom(1);
    });

    elements.encounterGridIn?.addEventListener('click', () => changeEncounterGridZoom(0.1));
    elements.encounterGridOut?.addEventListener('click', () => changeEncounterGridZoom(-0.1));
    elements.encounterGridReset?.addEventListener('click', resetEncounterGridZoom);

    elements.enemySearch?.addEventListener('input', handleEncounterEnemySearch);
    elements.enemyFilterAll?.addEventListener('click', () => setEncounterEnemyFilter('all'));
    elements.enemyFilterLibrary?.addEventListener('click', () => setEncounterEnemyFilter('library'));
    elements.enemyFilterCustom?.addEventListener('click', () => setEncounterEnemyFilter('custom'));
    elements.enemyRefreshBtn?.addEventListener('click', () => loadEncounterEnemyLibrary(true));
    elements.stagingClearAll?.addEventListener('click', handleClearAllStagedEnemies);

    elements.placeStartAreaBtn?.addEventListener('click', () => {
        if (!atlasMapState.activeMapId) {
            alert('Select an active map to place a starting area.');
            return;
        }
        atlasMapState.encounter.placing = !atlasMapState.encounter.placing;
        updateEncounterControls();
        updateEncounterSummary(atlasMapState.encounter.render?.startRect || null);
        drawAtlasEncounter();
    });

    elements.clearStartAreaBtn?.addEventListener('click', () => {
        if (!atlasMapState.activeMapId) {
            return;
        }
        if (atlasMapState.encounter.startArea && !atlasMapState.encounter.dirty) {
            if (!confirm('Clear the starting area for this map?')) {
                return;
            }
        }
        clearEncounterStartingArea();
    });

    elements.saveStartAreaBtn?.addEventListener('click', saveEncounterStartArea);

    const canvas = elements.encounterCanvas;
    canvas.addEventListener('wheel', handleEncounterWheel, { passive: false });
    canvas.addEventListener('mousedown', startEncounterDrag);
    canvas.addEventListener('mousemove', handleEncounterDrag);
    window.addEventListener('mouseup', endEncounterDrag);
    canvas.addEventListener('mouseleave', endEncounterDrag);
    canvas.addEventListener('click', handleEncounterCanvasClick);

    // Add keyboard handler for arrow keys
    window.addEventListener('keydown', handleEncounterKeydown);

    updateEncounterEnemyFilterButtons();
    applyEncounterEnemyFilters();
    loadEncounterEnemyLibrary();
    updateEncounterControls();
    updateEncounterSummary(atlasMapState.encounter.render?.startRect || null);
}

function syncEncounterStateFromSettings(force) {
    if (!atlasMapState.settings) {
        return;
    }
    if (!force && atlasMapState.encounter.dirty) {
        return;
    }
    const encounterSettings = atlasMapState.settings.encounter || {};
    atlasMapState.settings.encounter = encounterSettings;
    const startAreas = encounterSettings.startingAreas || {};
    const mapId = atlasMapState.activeMapId;
    const savedArea = mapId && startAreas[mapId] ? { ...startAreas[mapId] } : null;
    atlasMapState.encounter.startArea = savedArea;
    const savedZoom = savedArea?.zoom ?? 1;
    atlasMapState.encounter.areaZoom = clamp(savedZoom, atlasMapState.encounter.minAreaZoom, atlasMapState.encounter.maxAreaZoom);
    if (atlasMapState.encounter.startArea) {
        atlasMapState.encounter.startArea.zoom = atlasMapState.encounter.areaZoom;
    }
    atlasMapState.preview.zoom = atlasMapState.settings?.display?.viewport?.zoom || atlasMapState.encounter.areaZoom || 1;

    // Load placed enemies from current encounter (not from atlas settings)
    // This will be handled by loadEncounter in session-manager.js
    // Don't touch the pending array here - it will be populated when encounter loads
    console.log('[Atlas] syncEncounterStateFromSettings called, current pending:', atlasMapState.encounter.pending);

    atlasMapState.encounter.dirty = false;
    atlasMapState.encounter.placing = false;
}

function resetEncounterView() {
    atlasMapState.encounter.zoom = 1;
    atlasMapState.encounter.offset = { x: 0, y: 0 };
    atlasMapState.encounter.dragging = false;
    atlasMapState.encounter.dragMoved = false;
    atlasMapState.encounter.dragStart = null;
    atlasMapState.encounter.originalOffset = { x: 0, y: 0 };
}

function updateEncounterControls() {
    const elements = getAtlasElements();
    const hasMap = Boolean(atlasMapState.activeMapId);
    const hasArea = Boolean(atlasMapState.encounter.startArea);

    if (elements.placeStartAreaBtn) {
        elements.placeStartAreaBtn.disabled = !hasMap;
        elements.placeStartAreaBtn.classList.toggle('btn-toggle-active', atlasMapState.encounter.placing && hasMap);
    }
    if (elements.clearStartAreaBtn) {
        elements.clearStartAreaBtn.disabled = !hasMap || (!hasArea && !atlasMapState.encounter.dirty);
    }
    if (elements.saveStartAreaBtn) {
        elements.saveStartAreaBtn.disabled = !hasMap || !atlasMapState.encounter.dirty;
    }
    if (elements.encounterGridIn) {
        elements.encounterGridIn.disabled = !hasMap;
    }
    if (elements.encounterGridOut) {
        elements.encounterGridOut.disabled = !hasMap;
    }
    if (elements.encounterGridReset) {
        elements.encounterGridReset.disabled = !hasMap;
    }
}

function updateEncounterSummary(rect) {
    const elements = getAtlasElements();

    if (elements.startAreaResolutionLabel) {
        const resolution = atlasMapState.settings?.display?.resolution;
        if (resolution?.w && resolution?.h) {
            elements.startAreaResolutionLabel.textContent = Math.round(resolution.w) + ' x ' + Math.round(resolution.h);
        } else {
            elements.startAreaResolutionLabel.textContent = '--';
        }
    }

    if (elements.startAreaGridLabel) {
        if (!atlasMapState.activeMapId) {
            elements.startAreaGridLabel.textContent = '--';
        } else {
            const metrics = getEncounterGridMetrics();
            const gridEnabled = atlasMapState.settings?.display?.grid?.enabled ?? true;
            if (!gridEnabled) {
                elements.startAreaGridLabel.textContent = 'Disabled';
            } else if (!metrics) {
                elements.startAreaGridLabel.textContent = '--';
            } else {
                const inchesPerCell = Number(atlasMapState.settings?.display?.grid?.inches_per_cell) || 1;
                const zoomDetails = [];
                if (Math.abs(metrics.gridZoom - 1) > 0.0001) {
                    zoomDetails.push('grid ' + metrics.gridZoom.toFixed(2) + 'x');
                }
                if (Math.abs(metrics.areaZoom - 1) > 0.0001) {
                    zoomDetails.push('view ' + metrics.areaZoom.toFixed(2) + 'x');
                }
                const zoomSuffix = zoomDetails.length ? ' @ ' + zoomDetails.join(', ') : '';
                elements.startAreaGridLabel.textContent = Math.round(metrics.zoomed) + ' px (' + inchesPerCell + '" cell' + zoomSuffix + ')';
            }
        }
    }

    if (!elements.startAreaStatus) {
        return;
    }

    if (!atlasMapState.activeMapId) {
        if (elements.startAreaCoordsLabel) {
            elements.startAreaCoordsLabel.textContent = '--';
        }
        elements.startAreaStatus.textContent = 'Select an active map to begin.';
        return;
    }

    if (!atlasMapState.encounter.startArea) {
        if (elements.startAreaCoordsLabel) {
            elements.startAreaCoordsLabel.textContent = '--';
        }
        if (elements.startAreaGridLabel) {
            elements.startAreaGridLabel.textContent = '--';
        }
        if (atlasMapState.encounter.dirty) {
            elements.startAreaStatus.textContent = 'Starting area will be cleared when you save.';
        } else if (atlasMapState.encounter.placing) {
            elements.startAreaStatus.textContent = 'Click on the map to set the starting area.';
        } else {
            elements.startAreaStatus.textContent = 'Click Place Starting Area to choose a starting view.';
        }
        return;
    }

    if (!rect) {
        if (elements.startAreaCoordsLabel) {
            elements.startAreaCoordsLabel.textContent = '--';
        }
        elements.startAreaStatus.textContent = 'Calculating starting area...';
        return;
    }

    if (elements.startAreaCoordsLabel) {
        elements.startAreaCoordsLabel.textContent = Math.round(rect.x) + ', ' + Math.round(rect.y);
    }
    const zoom = atlasMapState.encounter.areaZoom || 1;
    const zoomStatus = Math.abs(zoom - 1) > 0.0001 ? ` (Zoom ${zoom.toFixed(2)}x)` : '';
    elements.startAreaStatus.textContent = (atlasMapState.encounter.dirty ? 'Unsaved changes' : 'Starting area saved') + zoomStatus;
}



function updateEncounterEnemyFilterButtons() {
    const elements = getAtlasElements();
    const active = atlasMapState.encounter.enemies.filter || 'all';
    [
        [elements.enemyFilterAll, 'all'],
        [elements.enemyFilterLibrary, 'library'],
        [elements.enemyFilterCustom, 'custom']
    ].forEach(([button, value]) => {
        if (!button) {
            return;
        }
        button.classList.toggle('btn-toggle-active', active === value);
    });
}

function handleEncounterEnemySearch(event) {
    atlasMapState.encounter.enemies.search = (event.target?.value || '').trim();
    applyEncounterEnemyFilters();
}

function setEncounterEnemyFilter(filter) {
    const state = atlasMapState.encounter.enemies;
    const next = filter || 'all';
    if (state.filter === next) {
        updateEncounterEnemyFilterButtons();
        return;
    }
    state.filter = next;
    updateEncounterEnemyFilterButtons();
    applyEncounterEnemyFilters();
}

async function loadEncounterEnemyLibrary(force = false) {
    const state = atlasMapState.encounter.enemies;
    if (state.loading && !force) {
        return;
    }
    state.loading = true;
    state.error = null;
    updateEncounterEnemyLoadingState();
    applyEncounterEnemyFilters();
    try {
        await fetchEncounterMonsters(force);
        refreshEncounterEnemyAgents();
        state.loaded = true;
    } catch (error) {
        console.error('[Atlas][Encounter] Failed to load enemy library:', error);
        state.error = error;
    } finally {
        state.loading = false;
        applyEncounterEnemyFilters();
    }
}

async function fetchEncounterMonsters(force = false) {
    const state = atlasMapState.encounter.enemies;
    if (state.monsters.length > 0 && !force) {
        return;
    }
    try {
        const response = await fetch('/data/creatures/library/monsters_clean_with_images.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Unexpected monster payload');
        }
        state.monsters = data.map(normalizeEncounterMonster).filter(Boolean);
    } catch (error) {
        state.monsters = [];
        throw error;
    }
}

function buildEncounterEnemySearchKey(...parts) {
    return parts
        .filter((part) => part !== undefined && part !== null)
        .map((part) => String(part).toLowerCase())
        .join(' ');
}

function resolveEncounterMonsterImage(monster) {
    const candidate = monster?.tokenImage || monster?.token_image || monster?.image || monster?.portrait_image || monster?.img;
    return resolveMonsterImage(candidate);
}

function normalizeEncounterMonster(monster) {
    if (!monster) {
        return null;
    }
    const crValue = monster.crText ?? monster.cr ?? monster.challenge_rating ?? null;
    const acValue = monster.ac ?? monster.armor_class ?? null;
    const hpValue = monster.hp ?? monster.hit_points ?? null;
    const typeValue = monster.type || monster.subtype || 'Unknown';
    const alignmentValue = monster.alignment || '';
    const name = monster.name || 'Unnamed Monster';
    return {
        id: monster.id || name,
        name,
        source: 'library',
        type: typeValue,
        alignment: alignmentValue,
        cr: crValue,
        ac: acValue,
        hp: hpValue,
        image: resolveEncounterMonsterImage(monster),
        raw: monster,
        searchKey: buildEncounterEnemySearchKey(name, typeValue, alignmentValue, crValue)
    };
}

function normalizeEncounterAgent(agent) {
    if (!agent) {
        return null;
    }
    const typeLabel = getTypeDisplayName(agent.agentType || 'enemy');
    const name = agent.name || 'Unnamed Enemy';
    return {
        id: agent.id || name,
        name,
        source: 'custom',
        type: typeLabel,
        alignment: agent.alignment || '',
        level: agent.level ?? null,
        ac: agent.ac ?? null,
        hp: agent.hp ?? null,
        image: agent.imagePath || agent.avatar || null,
        raw: agent,
        searchKey: buildEncounterEnemySearchKey(name, typeLabel, agent.level, agent.alignment)
    };
}

function refreshEncounterEnemyAgents() {
    const state = atlasMapState.encounter.enemies;
    const enemies = (savedAgents || []).filter((agent) => isEnemyType(agent.agentType));
    state.agents = enemies.map(normalizeEncounterAgent).filter(Boolean);
    if (!state.loading) {
        applyEncounterEnemyFilters();
    }
}

function applyEncounterEnemyFilters() {
    const elements = getAtlasElements();
    if (!elements.enemyList) {
        return;
    }
    const state = atlasMapState.encounter.enemies;
    const filter = state.filter || 'all';
    const searchTerm = (state.search || '').toLowerCase();

    let list = [];
    if (filter === 'all' || filter === 'library') {
        list = list.concat(state.monsters);
    }
    if (filter === 'all' || filter === 'custom') {
        list = list.concat(state.agents);
    }

    if (searchTerm) {
        list = list.filter((enemy) => enemy.searchKey.includes(searchTerm));
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    state.combined = list;

    const currentSelection = atlasMapState.encounter.selectedEnemy;
    let activeSelection = null;
    if (currentSelection) {
        activeSelection = list.find((enemy) => enemy.id === currentSelection.id && enemy.source === currentSelection.source) || null;
    }
    if (!activeSelection && list.length > 0) {
        activeSelection = list[0];
    }
    atlasMapState.encounter.selectedEnemy = activeSelection;

    renderEncounterEnemyList(list);
    renderEncounterEnemyDetail(activeSelection);
    updateEncounterEnemyFilterButtons();
    updateEncounterEnemyLoadingState();
}

function updateEncounterEnemyLoadingState() {
    const elements = getAtlasElements();
    const state = atlasMapState.encounter.enemies;
    if (!elements.enemyEmpty) {
        return;
    }
    if (state.loading) {
        elements.enemyEmpty.textContent = 'Loading enemies...';
        elements.enemyEmpty.style.display = 'flex';
        return;
    }
    if (state.error) {
        elements.enemyEmpty.textContent = 'Failed to load enemies. Try refreshing.';
        elements.enemyEmpty.style.display = 'flex';
        return;
    }
    elements.enemyEmpty.style.display = 'none';
}

function renderEncounterEnemyList(enemies) {
    const elements = getAtlasElements();
    if (!elements.enemyList || !elements.enemyEmpty) {
        return;
    }
    const state = atlasMapState.encounter.enemies;

    elements.enemyList.innerHTML = '';

    if (state.loading) {
        elements.enemyEmpty.textContent = 'Loading enemies...';
        elements.enemyEmpty.style.display = 'flex';
        return;
    }

    if (state.error) {
        elements.enemyEmpty.textContent = 'Failed to load enemies. Try refreshing.';
        elements.enemyEmpty.style.display = 'flex';
        return;
    }

    if (!enemies || enemies.length === 0) {
        const hasAgents = state.agents.length > 0;
        const hasMonsters = state.monsters.length > 0;
        const message = state.search
            ? 'No enemies match your search.'
            : (!hasAgents && !hasMonsters)
                ? 'No enemies available yet. Create enemies in the Crucible or load the monster library.'
                : 'No enemies in this view.';
        elements.enemyEmpty.textContent = message;
        elements.enemyEmpty.style.display = 'flex';
        return;
    }

    elements.enemyEmpty.style.display = 'none';

    const selection = atlasMapState.encounter.selectedEnemy;

    enemies.forEach((enemy) => {
        const row = document.createElement('div');
        row.className = 'atlas-enemy-row';
        row.dataset.enemyId = enemy.id;
        row.dataset.enemySource = enemy.source;
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');

        if (selection && selection.id === enemy.id && selection.source === enemy.source) {
            row.classList.add('selected');
        }

        const metaParts = [];
        if (enemy.source === 'library' && enemy.cr !== null && enemy.cr !== undefined) {
            metaParts.push(`CR ${enemy.cr}`);
        }
        if (enemy.source === 'custom' && enemy.level !== null && enemy.level !== undefined) {
            metaParts.push(`Level ${enemy.level}`);
        }
        if (enemy.ac !== null && enemy.ac !== undefined) {
            metaParts.push(`AC ${enemy.ac}`);
        }
        if (enemy.hp !== null && enemy.hp !== undefined) {
            metaParts.push(`HP ${enemy.hp}`);
        }

        const imgSrc = enemy.image ? sanitizeEncounterText(enemy.image) : null;
        row.innerHTML = `
            ${imgSrc ? `<img src="${imgSrc}" alt="${sanitizeEncounterText(enemy.name)}">` : '<div class="atlas-enemy-avatar">?</div>'}
            <div class="atlas-enemy-info">
                <div class="atlas-enemy-name">${sanitizeEncounterText(enemy.name)}</div>
                <div class="atlas-enemy-subtext">${sanitizeEncounterText(getEncounterEnemySourceLabel(enemy.source))}</div>
            </div>
            <div class="atlas-enemy-meta">${sanitizeEncounterText(metaParts.join(' • ')) || '—'}</div>
        `;

        const selectHandler = () => selectEncounterEnemy(enemy);
        row.addEventListener('click', selectHandler);
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectHandler();
            }
        });

        elements.enemyList.appendChild(row);

    });
}

function renderEncounterEnemyDetail(enemy) {
    const elements = getAtlasElements();
    if (!elements.enemyDetail) {
        return;
    }

    const pendingCount = atlasMapState.encounter.pending?.length || 0;

    if (!enemy) {
        elements.enemyDetail.innerHTML = `
            <div class="atlas-enemy-detail-empty">Select an enemy to view its summary.</div>
            <div class="atlas-enemy-detail-actions">
                <span class="atlas-enemy-staging-count">Pending: ${pendingCount}</span>
            </div>
            <div class="atlas-enemy-detail-status" id="atlas-enemy-detail-status"></div>
        `;
        updateEncounterEnemyStagingCount();
        return;
    }

    const origin = getEncounterEnemySourceLabel(enemy.source);
    const metaParts = [];
    if (enemy.source === 'library' && enemy.cr !== null && enemy.cr !== undefined) {
        metaParts.push(`CR ${enemy.cr}`);
    }
    if (enemy.source === 'custom' && enemy.level !== null && enemy.level !== undefined) {
        metaParts.push(`Level ${enemy.level}`);
    }
    if (enemy.type) {
        metaParts.push(enemy.type);
    }
    if (enemy.alignment) {
        metaParts.push(enemy.alignment);
    }

    const defenses = [];
    if (enemy.ac !== null && enemy.ac !== undefined) {
        defenses.push(`AC ${enemy.ac}`);
    }
    if (enemy.hp !== null && enemy.hp !== undefined) {
        defenses.push(`HP ${enemy.hp}`);
    }

    const imageCandidates = [
        enemy.image,
        enemy.imagePath,
        enemy.tokenImage,
        enemy.token_image,
        enemy.portrait_image,
        enemy.img,
        enemy.raw?.tokenImage,
        enemy.raw?.token_image,
        enemy.raw?.image,
        enemy.raw?.portrait_image,
        enemy.raw?.img
    ];
    const resolvedImage = resolveEnemyImagePath(imageCandidates, { preferLibrary: enemy.source === 'library' });
    const imageSrc = resolvedImage ? sanitizeEncounterText(resolvedImage) : null;
    const imageMarkup = imageSrc
        ? `<img src="${imageSrc}" alt="${sanitizeEncounterText(enemy.name)}">`
        : '<div class="atlas-enemy-detail-avatar">?</div>';

    elements.enemyDetail.innerHTML = `
        <div class="atlas-enemy-detail-header">
            ${imageMarkup}
            <div>
                <div class="atlas-enemy-detail-title">${sanitizeEncounterText(enemy.name)}</div>
                <div class="atlas-enemy-detail-origin">${sanitizeEncounterText(origin)}</div>
            </div>
        </div>
        <div class="atlas-enemy-detail-body">
            <div class="atlas-enemy-detail-meta">${sanitizeEncounterText(metaParts.join(' • ')) || '—'}</div>
            <div class="atlas-enemy-detail-meta">${sanitizeEncounterText(defenses.join(' • ')) || '—'}</div>
        </div>
        <div class="atlas-enemy-detail-actions">
            <button type="button" id="atlas-enemy-add" class="btn btn-primary btn-small">Add to Encounter</button>
            <span class="atlas-enemy-staging-count">Pending: ${pendingCount}</span>
        </div>
        <div class="atlas-enemy-detail-status" id="atlas-enemy-detail-status"></div>
    `;

    const addBtn = document.getElementById('atlas-enemy-add');
    if (addBtn) {
        addBtn.addEventListener('click', () => handleEncounterEnemyAdd(enemy));
    }

    updateEncounterEnemyStagingCount();
}



function selectEncounterEnemy(enemy) {
    atlasMapState.encounter.selectedEnemy = enemy;
    renderEncounterEnemyList(atlasMapState.encounter.enemies.combined);
    renderEncounterEnemyDetail(enemy);
}

function coerceNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function extractPayloadAbilityScores(payload) {
    if (!payload) {
        return null;
    }
    const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const scores = {};
    abilityKeys.forEach((key) => {
        const direct = coerceNumber(payload[key]);
        const nested = coerceNumber(payload.abilities?.[key]);
        const value = direct ?? nested;
        if (value !== null && value !== undefined) {
            scores[key] = value;
        }
    });
    return Object.keys(scores).length ? scores : null;
}

function extractPayloadInventory(payload) {
    if (!payload) {
        return [];
    }
    const normalizeItem = (item) => ({
        id: item?.id || item?._id || item?.uuid || item?.name,
        name: item?.name || '',
        type: item?.type || item?.system?.type || null,
        price: item?.price ?? item?.system?.price ?? null,
        weight: item?.weight ?? item?.system?.weight ?? null
    });
    if (Array.isArray(payload.inventory) && payload.inventory.length) {
        return payload.inventory.map(normalizeItem);
    }
    if (Array.isArray(payload.items) && payload.items.length) {
        return payload.items.map(normalizeItem);
    }
    if (Array.isArray(payload.gear) && payload.gear.length) {
        return payload.gear.map(normalizeItem);
    }
    return [];
}

function extractPayloadGold(payload) {
    if (!payload) {
        return null;
    }
    const sources = [
        payload.gold,
        payload.currency?.gp,
        payload.coins?.gp,
        payload.treasure?.gold
    ];
    for (const value of sources) {
        const num = coerceNumber(value);
        if (num !== null && num !== undefined) {
            return num;
        }
    }
    return null;
}

function extractPayloadDexModifier(payload, abilityScores) {
    if (abilityScores?.dex !== undefined) {
        return modifierFromScore(abilityScores.dex);
    }
    const candidates = [
        payload?.dex_mod,
        payload?.dexModifier,
        payload?.abilities?.dex_mod,
        payload?.abilities?.dexModifier,
        payload?.dex
    ];
    for (const value of candidates) {
        const num = coerceNumber(value);
        if (num !== null && num !== undefined) {
            if (value === payload?.dex) {
                return modifierFromScore(num);
            }
            return num;
        }
    }
    return null;
}

function handleEncounterEnemyAdd(enemy) {
    if (!enemy) {
        return;
    }
    console.log(`[handleEncounterEnemyAdd] Adding enemy:`, enemy);
    console.log(`[handleEncounterEnemyAdd] enemy.image:`, enemy.image);
    console.log(`[handleEncounterEnemyAdd] enemy.raw:`, enemy.raw);
    
    atlasMapState.encounter.pending = atlasMapState.encounter.pending || [];
    const payload = enemy.raw || enemy;
    const abilityScores = extractPayloadAbilityScores(payload);
    const inventory = extractPayloadInventory(payload);
    const gold = extractPayloadGold(payload);

    const stats = {};
    const hpCandidates = [
        enemy?.hp,
        payload?.hp,
        payload?.hit_points,
        payload?.attributes?.hp?.value,
        payload?.hp?.value,
        payload?.hp?.average
    ];
    for (const candidate of hpCandidates) {
        if (candidate === undefined || candidate === null) {
            continue;
        }
        if (typeof candidate === 'object') {
            const num = coerceNumber(candidate.current ?? candidate.max);
            if (num !== null && num !== undefined) {
                stats.hp = { current: num, max: num, temp: 0 };
                break;
            }
        } else {
            const num = coerceNumber(candidate);
            if (num !== null && num !== undefined) {
                stats.hp = { current: num, max: num, temp: 0 };
                break;
            }
        }
    }

    const acCandidates = [
        enemy?.ac,
        payload?.ac,
        payload?.armor_class,
        payload?.attributes?.ac,
        payload?.ac?.value
    ];
    for (const candidate of acCandidates) {
        const num = coerceNumber(candidate);
        if (num !== null && num !== undefined) {
            stats.ac = num;
            break;
        }
    }

    const dexModifier = extractPayloadDexModifier(payload, abilityScores);
    if (dexModifier !== null && dexModifier !== undefined) {
        stats.dexModifier = dexModifier;
    }

    const entry = {
        id: `enc-enemy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: enemy.name,
        source: enemy.source,
        payload,
        placed: false,
        visible: enemy.visible !== false,
        inventory: inventory.map((item) => ({ ...item })),
        originCombatantId: null
    };

    const imageCandidates = [
        enemy.image,
        enemy.imagePath,
        enemy.tokenImage,
        enemy.token_image,
        enemy.portrait_image,
        enemy.portraitImage,  // camelCase
        enemy.img,
        payload?.imagePath,
        payload?.tokenImage,  // camelCase
        payload?.token_image,
        payload?.image,
        payload?.portrait_image,
        payload?.portraitImage,  // camelCase
        payload?.img
    ];
    
    console.log(`[handleEncounterEnemyAdd] ${enemy.name} source:`, enemy.source);
    console.log(`[handleEncounterEnemyAdd] ${enemy.name} payload.tokenImage:`, payload?.tokenImage);
    console.log(`[handleEncounterEnemyAdd] ${enemy.name} payload.portraitImage:`, payload?.portraitImage);
    
    const resolvedImagePath = resolveEnemyImagePath(imageCandidates, { preferLibrary: enemy.source === 'library' });
    console.log(`[handleEncounterEnemyAdd] ${enemy.name} resolvedImagePath:`, resolvedImagePath);
    
    if (resolvedImagePath) {
        entry.imagePath = resolvedImagePath;
    }

    if (Object.keys(stats).length) {
        entry.stats = stats;
        if (typeof stats.hp === 'object' && stats.hp !== null && typeof stats.hp.current === 'number') {
            entry.hp = stats.hp.current;
        } else if (typeof stats.hp === 'number') {
            entry.hp = stats.hp;
        }
    }
    if (abilityScores) {
        entry.abilities = abilityScores;
    }
    if (gold !== null && gold !== undefined) {
        entry.gold = gold;
    }

    atlasMapState.encounter.pending.push(entry);
    atlasMapState.encounter.dirty = true;
    updateEncounterEnemyStagingCount('Added to encounter queue');
    renderStagedEnemiesList();
}

function updateEncounterEnemyStagingCount(message) {
    const elements = getAtlasElements();
    const count = atlasMapState.encounter.pending?.length || 0;
    if (elements.enemyDetail) {
        const countLabel = elements.enemyDetail.querySelector('.atlas-enemy-staging-count');
        if (countLabel) {
            countLabel.textContent = `Pending: ${count}`;
        }
        const status = elements.enemyDetail.querySelector('#atlas-enemy-detail-status');
        if (status) {
            if (message) {
                status.textContent = message;
                status.style.display = 'block';
            } else {
                status.textContent = '';
                status.style.display = 'none';
            }
        }
    }
}

function renderStagedEnemiesList() {
    const elements = getAtlasElements();
    if (!elements.enemyStagingList) {
        return;
    }

    const pending = atlasMapState.encounter.pending || [];

    if (pending.length === 0) {
        elements.enemyStagingList.innerHTML = '<div class="atlas-empty-state">No enemies staged yet</div>';
        return;
    }

    elements.enemyStagingList.innerHTML = '';

    pending.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'atlas-staged-enemy-item';
        row.dataset.entryId = entry.id;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'atlas-staged-enemy-name';

        // Add placement status indicator
        if (entry.placed && entry.position) {
            const statusIcon = document.createElement('span');
            statusIcon.textContent = '✓ ';
            statusIcon.style.color = '#4ade80';
            statusIcon.style.fontWeight = 'bold';
            statusIcon.title = 'Placed on map at (' + Math.round(entry.position.x) + ', ' + Math.round(entry.position.y) + ')';
            nameSpan.appendChild(statusIcon);
        }

        const nameText = document.createTextNode(entry.name);
        nameSpan.appendChild(nameText);

        const actions = document.createElement('div');
        actions.className = 'atlas-staged-enemy-actions';

        const locationBtn = document.createElement('button');
        locationBtn.type = 'button';
        locationBtn.className = 'btn btn-secondary btn-small';
        locationBtn.textContent = entry.placed ? 'Reposition' : 'Location';
        locationBtn.title = entry.placed ? 'Change position on map' : 'Place on map';
        locationBtn.addEventListener('click', () => handleStagedEnemyLocation(entry.id));

        const cloneBtn = document.createElement('button');
        cloneBtn.type = 'button';
        cloneBtn.className = 'btn btn-secondary btn-small';
        cloneBtn.textContent = 'Clone';
        cloneBtn.title = 'Duplicate this enemy';
        cloneBtn.addEventListener('click', () => handleStagedEnemyClone(entry.id));

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-secondary btn-small';
        editBtn.textContent = 'Edit';
        editBtn.title = 'Edit this enemy';
        editBtn.addEventListener('click', () => handleStagedEnemyEdit(entry.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = 'Remove from staging';
        deleteBtn.addEventListener('click', () => handleStagedEnemyDelete(entry.id));

        actions.appendChild(locationBtn);
        actions.appendChild(cloneBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(nameSpan);
        row.appendChild(actions);

        elements.enemyStagingList.appendChild(row);
    });
}

function handleStagedEnemyLocation(entryId) {
    const pending = atlasMapState.encounter.pending || [];
    const entry = pending.find(e => e.id === entryId);
    if (!entry) {
        return;
    }

    if (!atlasMapState.activeMapId) {
        alert('Please select an active map before placing enemies.');
        return;
    }

    // Enter placement mode
    atlasMapState.encounter.placementMode = true;
    atlasMapState.encounter.placementEntry = entry;
    atlasMapState.encounter.placing = false; // Disable starting area placement

    // Visual feedback
    updateEncounterSummary(null, 'Click on the map to place ' + entry.name);
    drawAtlasEncounter();
}

function snapToGridCenter(mapX, mapY) {
    // Calculate cell size the same way the grid does
    const settings = atlasMapState.settings;
    if (!settings?.display?.grid) {
        return { x: mapX, y: mapY };
    }

    const grid = settings.display.grid;
    const ppi = settings.display.physical?.ppi_override || settings.display.grid.pixels_per_inch || 52.45;
    const cellPx = grid.inches_per_cell ? ppi * grid.inches_per_cell : grid.cell_px || 50;
    const gridZoom = atlasMapState.settings?.display?.viewport?.gridZoom || atlasMapState.preview.gridZoom || 1;

    // Cell size in map pixels (not canvas pixels - no scale applied here)
    const cellSize = cellPx * gridZoom;
    const halfCell = cellSize / 2;

    // Get grid offset if any (default to 0,0)
    const offsetX = grid.offset_x || 0;
    const offsetY = grid.offset_y || 0;

    // Adjust for offset, snap to nearest grid cell corner, then add half cell to get CENTER
    const adjustedX = mapX - offsetX;
    const adjustedY = mapY - offsetY;

    const gridX = Math.round(adjustedX / cellSize);
    const gridY = Math.round(adjustedY / cellSize);

    // Add half cell to move from corner to CENTER of the square
    return {
        x: gridX * cellSize + halfCell + offsetX,
        y: gridY * cellSize + halfCell + offsetY
    };
}

function placeEnemyToken(rawMapX, rawMapY) {
    const entry = atlasMapState.encounter.placementEntry;
    if (!entry) {
        return;
    }

    // Snap to grid center
    const snapped = snapToGridCenter(rawMapX, rawMapY);

    // Update the entry with position data
    entry.position = {
        x: snapped.x,
        y: snapped.y,
        mapId: atlasMapState.activeMapId
    };
    entry.placed = true;

    // Exit placement mode
    atlasMapState.encounter.placementMode = false;
    atlasMapState.encounter.placementEntry = null;
    atlasMapState.encounter.dirty = true;

    // Update UI
    updateEncounterSummary(null, entry.name + ' placed at (' + Math.round(snapped.x) + ', ' + Math.round(snapped.y) + ')');
    renderStagedEnemiesList();
    drawAtlasEncounter();
    if (typeof updateSyncDebugHUD === 'function') {
        updateSyncDebugHUD('placed');
    }

    // Add to Arena combat tracker
    addPlacedEnemyToCombat(entry);

    // Trigger encounter save
    if (typeof saveCurrentEncounter === 'function') {
        saveCurrentEncounter();
    }
}

async function addPlacedEnemyToCombat(entry) {
    // Check if this enemy has already been added to combat
    if (window.encounterState && window.encounterState.combatants) {
        const existing = window.encounterState.combatants.find(c => c.atlasTokenId === entry.id);
        if (existing) {
            console.log('[Atlas] Enemy already in combat, skipping:', entry.name);
            return;
        }
    }

    // Get the monster data if available (for enemies from library)
    let monster = null;
    if (entry.source === 'library' && entry.payload && typeof monstersById !== 'undefined') {
        monster = monstersById.get(entry.payload.id);
    }

    try {
        const entryStats = entry.stats || {};
        const entryAbilities = entry.abilities || null;
        const baseAbilities = entryAbilities || (monster?.abilities ? { ...monster.abilities } : null);
        const hpSource = entryStats.hp;
        let hpValue = null;
        if (typeof hpSource === 'object' && hpSource !== null) {
            hpValue = coerceNumber(hpSource.current ?? hpSource.max);
        } else if (hpSource !== undefined) {
            hpValue = coerceNumber(hpSource);
        }
        if (hpValue === null || hpValue === undefined) {
            hpValue = coerceNumber(entry.hp);
        }
        if (hpValue === null || hpValue === undefined) {
            hpValue = monster ? coerceNumber(monster.hp) : null;
        }
        if (hpValue === null || hpValue === undefined) {
            hpValue = 0;
        }

        const acValue = coerceNumber(entryStats.ac) ?? coerceNumber(entry.ac) ?? (monster ? coerceNumber(monster.ac) : null) ?? 10;
        let dexModifier = coerceNumber(entryStats.dexModifier);
        if (dexModifier === null || dexModifier === undefined) {
            const dexScore = baseAbilities?.dex ?? monster?.abilities?.dex ?? null;
            dexModifier = dexScore !== null && dexScore !== undefined ? modifierFromScore(dexScore) : 0;
        }

        const inventory = Array.isArray(entry.inventory) ? entry.inventory.map(item => ({ ...item })) : [];

        const imageCandidates = [
            entry.imagePath,
            entry.payload?.imagePath,
            entry.payload?.tokenImage,
            entry.payload?.token_image,
            entry.payload?.image,
            entry.payload?.portrait_image,
            entry.payload?.img,
            monster?.tokenImage,
            monster?.token_image,
            monster?.image,
            monster?.portrait_image,
            monster?.img
        ];
        const imagePath = resolveEnemyImagePath(imageCandidates, { preferLibrary: entry.source === 'library' });

        const combatantData = {
            name: entry.name,
            type: 'enemy',
            atlasTokenId: entry.id, // Link back to the placed token
            hp: hpValue,
            ac: acValue,
            dexModifier,
            imagePath,
            sourceId: monster ? monster.id : null
        };
        if (baseAbilities) {
            combatantData.abilities = { ...baseAbilities };
        }
        if (inventory.length) {
            combatantData.inventory = inventory;
        }
        if (typeof entry.gold === 'number') {
            combatantData.gold = entry.gold;
        }

        // Extract attacks if we have monster data
        if (monster && monster.actions) {
            combatantData.attacks = (monster.actions || []).filter(action => {
                const rawItem = (monster.raw?.items || []).find(item => item.name === action.name);
                if (rawItem && rawItem.system?.activities) {
                    const activities = Object.values(rawItem.system.activities);
                    return activities.some(a => a.type === 'attack');
                }
                return false;
            }).map(action => {
                let attackBonus = 0;
                let damageRoll = '';

                const rawItem = (monster.raw?.items || []).find(item => item.name === action.name);
                if (rawItem && rawItem.system?.activities) {
                    const activities = Object.values(rawItem.system.activities);
                    const attackActivity = activities.find(a => a.type === 'attack');

                    if (attackActivity) {
                        const bonusStr = attackActivity.attack?.bonus || '';
                        if (bonusStr && bonusStr.trim() !== '') {
                            attackBonus = parseInt(bonusStr);
                        } else {
                            const abilityKey = attackActivity.attack?.ability || 'str';
                            const abilityScore = monster.abilities?.[abilityKey] || 10;
                            const abilityMod = modifierFromScore(abilityScore);
                            const profBonus = Math.floor((monster.cr - 1) / 4) + 2;
                            attackBonus = abilityMod + profBonus;
                        }

                        const baseDamage = rawItem.system?.damage?.base;
                        if (baseDamage && baseDamage.number && baseDamage.denomination) {
                            const abilityKey = attackActivity.attack?.ability || 'str';
                            const abilityScore = monster.abilities?.[abilityKey] || 10;
                            const abilityMod = modifierFromScore(abilityScore);
                            damageRoll = `${baseDamage.number}d${baseDamage.denomination}+${abilityMod}`;
                        }

                        const damageParts = attackActivity.damage?.parts || [];
                        if (damageParts.length > 0) {
                            const extraDamage = damageParts.map(part => {
                                if (part.number && part.denomination) {
                                    return `${part.number}d${part.denomination}`;
                                }
                                return '';
                            }).filter(Boolean).join(' + ');
                            if (extraDamage) {
                                damageRoll = damageRoll ? `${damageRoll} + ${extraDamage}` : extraDamage;
                            }
                        }
                    }
                }

                return {
                    name: action.name,
                    attackBonus: attackBonus,
                    damageRoll: damageRoll,
                    description: action.description || ''
                };
            });

            combatantData.specialAbilities = (monster.actions || []).filter(action => {
                const rawItem = (monster.raw?.items || []).find(item => item.name === action.name);
                if (rawItem && rawItem.system?.activities) {
                    const activities = Object.values(rawItem.system.activities);
                    return !activities.some(a => a.type === 'attack');
                }
                return false;
            }).map(action => ({
                name: action.name,
                description: action.description || ''
            }));
        }

        console.log('[Atlas] Adding placed enemy to combat:', combatantData);

        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(combatantData)
        });

        if (response.ok) {
            // Trigger a refresh of the combat view
            if (typeof window.loadCombatants === 'function') {
                await window.loadCombatants();
            }
            if (typeof updateSyncDebugHUD === 'function') {
                updateSyncDebugHUD('added');
            }
            console.log('[Atlas] Successfully added to combat:', entry.name);
        } else {
            console.error('[Atlas] Failed to add to combat');
        }
    } catch (error) {
        console.error('[Atlas] Error adding to combat:', error);
    }
}

// Helper function to calculate ability modifier
function modifierFromScore(score) {
    return Math.floor((score - 10) / 2);
}

// Helper function to resolve monster images (use same logic as loot-manager)
function resolveMonsterImage(path) {
    if (!path) {
        return null;
    }
    const raw = String(path).trim();
    if (!raw) {
        return null;
    }
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }
    if (raw.startsWith('/')) {
        return raw;
    }
    const MONSTER_IMAGE_ROOT = '/data/creatures/library/';
    let normalized = raw.split('\\').join('/');
    while (normalized.startsWith('./')) {
        normalized = normalized.slice(2);
    }
    while (normalized.startsWith('../')) {
        normalized = normalized.slice(3);
    }
    while (normalized.startsWith('/')) {
        normalized = normalized.slice(1);
    }
    if (!normalized) {
        return null;
    }
    const libraryBaseRegex = /^data\/creatures\/library\/?/i;
    const relative = libraryBaseRegex.test(normalized) ? normalized.replace(libraryBaseRegex, '') : normalized;
    return `${MONSTER_IMAGE_ROOT}${encodeURI(relative)}`;
}

function resolveEnemyImagePath(candidates, options = {}) {
    if (!Array.isArray(candidates)) {
        return null;
    }
    const preferLibrary = options.preferLibrary === true;
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const value = String(candidate).trim();
        if (!value || value === '[object Object]') {
            continue;
        }
        if (value.startsWith('http://') || value.startsWith('https://')) {
            return value;
        }
        if (value.startsWith('/')) {
            return value;
        }
        const normalized = value.split('\\').join('/');
        if (normalized.startsWith('data:')) {
            return normalized;
        }
        if (normalized.startsWith('/')) {
            return normalized;
        }
        if (preferLibrary || normalized.toLowerCase().startsWith('data/creatures/library')) {
            return resolveMonsterImage(normalized);
        }
        if (normalized) {
            return normalized;
        }
    }
    return null;
}

function handleStagedEnemyClone(entryId) {
    const pending = atlasMapState.encounter.pending || [];
    const original = pending.find(e => e.id === entryId);
    if (!original) {
        return;
    }

    const clonedStats = original.stats ? JSON.parse(JSON.stringify(original.stats)) : null;
    const clonedAbilities = original.abilities ? { ...original.abilities } : null;
    const clonedInventory = Array.isArray(original.inventory) ? original.inventory.map(item => ({ ...item })) : [];
    const clone = {
        id: `enc-enemy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: original.name,
        source: original.source,
        payload: original.payload ? { ...original.payload } : null,
        placed: false,
        visible: original.visible !== false,
        inventory: clonedInventory,
        abilities: clonedAbilities || undefined,
        stats: clonedStats || undefined,
        gold: typeof original.gold === 'number' ? original.gold : undefined,
        hp: typeof original.hp === 'number' ? original.hp : undefined,
        originCombatantId: null
    };
    if (!clone.inventory.length) {
        delete clone.inventory;
    }
    if (!clone.abilities) {
        delete clone.abilities;
    }
    if (!clone.stats) {
        delete clone.stats;
    }
    if (clone.gold === undefined) {
        delete clone.gold;
    }
    if (clone.hp === undefined) {
        delete clone.hp;
    }
    if (!clone.payload) {
        delete clone.payload;
    }

    atlasMapState.encounter.pending.push(clone);
    atlasMapState.encounter.dirty = true;
    updateEncounterEnemyStagingCount(`Cloned ${original.name}`);
    renderStagedEnemiesList();
}

function handleStagedEnemyDelete(entryId) {
    const pending = atlasMapState.encounter.pending || [];
    const index = pending.findIndex(e => e.id === entryId);
    if (index === -1) {
        return;
    }

    pending.splice(index, 1);
    atlasMapState.encounter.dirty = true;
    updateEncounterEnemyStagingCount();
    renderStagedEnemiesList();
    drawAtlasEncounter();

    // Trigger encounter save
    if (typeof saveCurrentEncounter === 'function') {
        saveCurrentEncounter();
    }
    if (typeof updateSyncDebugHUD === 'function') {
        updateSyncDebugHUD('removed');
    }
}

function handleStagedEnemyEdit(entryId) {
    const elements = getAtlasElements();
    const editor = document.getElementById('atlas-agent-editor');
    if (!editor) return;

    const pending = atlasMapState.encounter.pending || [];
    const entry = pending.find(e => e.id === entryId);
    if (!entry) return;

    atlasMapState.encounter.editing = { entryId, combatantId: null };

    // Try to find corresponding combatant in Arena
    const combatants = (window.encounterState?.combatants) || [];
    const linked = combatants.find(c => c.atlasTokenId === entry.id) || combatants.find(c => c.name === entry.name);
    if (linked) {
        atlasMapState.encounter.editing.combatantId = linked.id;
    }

    // Populate form fields
    const byId = (id) => document.getElementById(id);
    const payload = entry.payload || {};
    const stats = entry.stats || {};
    const fallbackAbilities = entry.abilities || extractPayloadAbilityScores(payload) || {};
    const resolveAbilityScore = (key) => {
        const linkedValue = coerceNumber(linked?.abilities?.[key]);
        if (linkedValue !== null && linkedValue !== undefined) {
            return linkedValue;
        }
        const entryValue = coerceNumber(fallbackAbilities[key]);
        if (entryValue !== null && entryValue !== undefined) {
            return entryValue;
        }
        const payloadValue = coerceNumber(payload[key]) ?? coerceNumber(payload.abilities?.[key]);
        if (payloadValue !== null && payloadValue !== undefined) {
            return payloadValue;
        }
        return 10;
    };
    byId('ae-name').value = linked?.name || entry.name || '';
    let acNumber = coerceNumber(linked?.ac);
    if (acNumber === null || acNumber === undefined) {
        acNumber = coerceNumber(stats.ac);
    }
    if (acNumber === null || acNumber === undefined) {
        const acCandidates = [
            payload.ac,
            payload.armor_class,
            payload.attributes?.ac,
            payload.ac?.value
        ];
        for (const candidate of acCandidates) {
            acNumber = coerceNumber(candidate);
            if (acNumber !== null && acNumber !== undefined) {
                break;
            }
        }
    }
    byId('ae-ac').value = Number.isFinite(acNumber) ? acNumber : 10;

    const extractHpNumber = (value) => {
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value === 'object') {
            return coerceNumber(value.current ?? value.max ?? value.value);
        }
        return coerceNumber(value);
    };
    let hpNumber = extractHpNumber(linked?.hp);
    if (hpNumber === null || hpNumber === undefined) {
        hpNumber = extractHpNumber(stats.hp);
    }
    if (hpNumber === null || hpNumber === undefined) {
        const hpCandidates = [
            payload.hp,
            payload.hit_points,
            payload.attributes?.hp?.value,
            payload.hp?.value,
            payload.hp?.average
        ];
        for (const candidate of hpCandidates) {
            hpNumber = extractHpNumber(candidate);
            if (hpNumber !== null && hpNumber !== undefined) {
                break;
            }
        }
    }
    byId('ae-hp').value = Number.isFinite(hpNumber) ? hpNumber : 0;

    byId('ae-str').value = resolveAbilityScore('str');
    byId('ae-dex').value = resolveAbilityScore('dex');
    byId('ae-con').value = resolveAbilityScore('con');
    byId('ae-int').value = resolveAbilityScore('int');
    byId('ae-wis').value = resolveAbilityScore('wis');
    byId('ae-cha').value = resolveAbilityScore('cha');

    const baseInventory = (() => {
        if (Array.isArray(linked?.inventory) && linked.inventory.length) {
            return linked.inventory;
        }
        if (Array.isArray(entry.inventory) && entry.inventory.length) {
            return entry.inventory;
        }
        return extractPayloadInventory(payload);
    })();
    atlasMapState.encounter.editingInventory = baseInventory.map(it => {

        const resolvedName = typeof it === 'object' ? (it?.name ?? '') : String(it ?? '');

        return {

            id: it?.id || it?._id || it?.uuid || it?.name || resolvedName,

            name: resolvedName,

            type: it?.type || it?.system?.type || null,

            price: it?.price ?? it?.system?.price ?? null,

            weight: it?.weight ?? it?.system?.weight ?? null

        };

    });
    byId('ae-inventory').value = atlasMapState.encounter.editingInventory.length
        ? atlasMapState.encounter.editingInventory.map(i => i.name).join(', ')
        : (linked?.inventoryNotes || entry.inventoryNotes || '');
    let goldValue = coerceNumber(linked?.gold);
    if (goldValue === null || goldValue === undefined) {
        goldValue = coerceNumber(entry.gold);
    }
    if (goldValue === null || goldValue === undefined) {
        goldValue = extractPayloadGold(payload);
    }
    byId('ae-gold').value = Number.isFinite(goldValue) ? goldValue : 0;
    byId('ae-visible').checked = entry.visible !== false;

    // Wire buttons
    const status = byId('ae-status');
    status.textContent = linked ? `Editing Arena agent (${linked.name})` : 'Editing staged entry (not yet in Arena)';
    const saveBtn = byId('ae-save');
    const cancelBtn = byId('ae-cancel');
    const addBtn = byId('ae-item-add');
    const searchInput = byId('ae-item-search');

    // Render initial inventory list
    renderAgentEditorInventoryList();

    // Setup autocomplete
    let autocompleteContainer = null;
    let itemsCatalog = null;
    let selectedItemIndex = -1;

    async function showItemAutocomplete(term) {
        if (!itemsCatalog) {
            itemsCatalog = await getItemsCatalog();
        }

        // Filter items
        const searchTerm = term.trim().toLowerCase();
        if (!searchTerm) {
            hideItemAutocomplete();
            return;
        }

        const matches = itemsCatalog
            .filter(item => item.name.toLowerCase().includes(searchTerm))
            .slice(0, 20); // Limit to 20 results

        // Create autocomplete container if it doesn't exist
        if (!autocompleteContainer) {
            autocompleteContainer = document.createElement('div');
            autocompleteContainer.className = 'atlas-item-autocomplete';
            searchInput.parentElement.appendChild(autocompleteContainer);
        }

        // Clear previous results
        autocompleteContainer.innerHTML = '';

        if (matches.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'atlas-item-autocomplete-empty';
            emptyDiv.textContent = 'No items found';
            autocompleteContainer.appendChild(emptyDiv);
        } else {
            matches.forEach((item, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'atlas-item-autocomplete-item';
                itemDiv.dataset.index = index;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'atlas-item-autocomplete-item-name';
                nameSpan.textContent = item.name;

                const typeSpan = document.createElement('span');
                typeSpan.className = 'atlas-item-autocomplete-item-type';
                typeSpan.textContent = item.type || 'Item';

                itemDiv.appendChild(nameSpan);
                itemDiv.appendChild(typeSpan);

                itemDiv.onclick = () => {
                    addItemToInventory(item);
                    hideItemAutocomplete();
                    searchInput.value = '';
                };

                autocompleteContainer.appendChild(itemDiv);
            });
        }

        autocompleteContainer.style.display = 'block';
        selectedItemIndex = -1;
    }

    function hideItemAutocomplete() {
        if (autocompleteContainer) {
            autocompleteContainer.style.display = 'none';
            autocompleteContainer.innerHTML = '';
        }
        selectedItemIndex = -1;
    }

    function addItemToInventory(item) {
        atlasMapState.encounter.editingInventory.push({
            id: getItemIdSafe(item),
            name: item.name,
            type: item.type,
            price: item.system?.price ?? null,
            weight: item.system?.weight ?? null
        });
        renderAgentEditorInventoryList();
    }

    function navigateAutocomplete(direction) {
        if (!autocompleteContainer || autocompleteContainer.style.display === 'none') return;

        const items = autocompleteContainer.querySelectorAll('.atlas-item-autocomplete-item');
        if (items.length === 0) return;

        // Remove previous active state
        if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
            items[selectedItemIndex].classList.remove('active');
        }

        // Update index
        if (direction === 'down') {
            selectedItemIndex = (selectedItemIndex + 1) % items.length;
        } else if (direction === 'up') {
            selectedItemIndex = selectedItemIndex <= 0 ? items.length - 1 : selectedItemIndex - 1;
        }

        // Add active state
        items[selectedItemIndex].classList.add('active');
        items[selectedItemIndex].scrollIntoView({ block: 'nearest' });
    }

    function selectActiveItem() {
        if (selectedItemIndex >= 0 && autocompleteContainer) {
            const items = autocompleteContainer.querySelectorAll('.atlas-item-autocomplete-item');
            if (items[selectedItemIndex]) {
                items[selectedItemIndex].click();
                return true;
            }
        }
        return false;
    }

    if (searchInput) {
        // Show autocomplete as user types
        searchInput.addEventListener('input', (e) => {
            showItemAutocomplete(e.target.value);
        });

        // Handle keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateAutocomplete('down');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateAutocomplete('up');
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (!selectActiveItem()) {
                    // If no item selected from dropdown, use old behavior
                    addBtn.click();
                }
            } else if (e.key === 'Escape') {
                hideItemAutocomplete();
            }
        });

        // Hide autocomplete when clicking outside
        document.addEventListener('click', (e) => {
            if (searchInput && !searchInput.contains(e.target) && autocompleteContainer && !autocompleteContainer.contains(e.target)) {
                hideItemAutocomplete();
            }
        });
    }

    if (addBtn) {
        addBtn.onclick = async () => {
            const term = (searchInput?.value || '').trim().toLowerCase();
            if (!term) return;

            if (!itemsCatalog) {
                itemsCatalog = await getItemsCatalog();
            }

            const match = itemsCatalog.find(it => it.name.toLowerCase().includes(term));
            if (match) {
                addItemToInventory(match);
                searchInput.value = '';
                hideItemAutocomplete();
            } else {
                alert('No item found for that search.');
            }
        };
    }

    saveBtn.onclick = async () => {
        await saveAgentEditor();
    };
    cancelBtn.onclick = () => {
        hideAgentEditor();
    };

    editor.style.display = 'block';
}

function hideAgentEditor() {
    const editor = document.getElementById('atlas-agent-editor');
    if (editor) editor.style.display = 'none';
    atlasMapState.encounter.editing = null;
}

async function saveAgentEditor() {
    const editCtx = atlasMapState.encounter.editing;
    if (!editCtx) return;
    const pending = atlasMapState.encounter.pending || [];
    const entry = pending.find(e => e.id === editCtx.entryId);
    if (!entry) return;

    const byId = (id) => document.getElementById(id);
    const linkedCombatant = editCtx.combatantId
        ? (window.encounterState?.combatants || []).find(c => c.id === editCtx.combatantId)
        : null;
    const name = byId('ae-name').value.trim();
    const acInput = coerceNumber(byId('ae-ac').value);
    const hpInput = coerceNumber(byId('ae-hp').value);
    const abilities = {
        str: Number(byId('ae-str').value || 10),
        dex: Number(byId('ae-dex').value || 10),
        con: Number(byId('ae-con').value || 10),
        int: Number(byId('ae-int').value || 10),
        wis: Number(byId('ae-wis').value || 10),
        cha: Number(byId('ae-cha').value || 10)
    };
    let inventory = (atlasMapState.encounter.editingInventory || []);
    if (!inventory.length) {
        const inventoryText = byId('ae-inventory').value || '';
        inventory = inventoryText
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(label => ({ id: label, name: label }));
    }
    const normalizedInventory = inventory.map(it => {

        const resolvedName = typeof it === 'object' ? (it?.name ?? '') : String(it ?? '');

        return {

            id: it?.id || it?._id || it?.uuid || it?.name || resolvedName,

            name: resolvedName,

            type: it?.type || it?.system?.type || null,

            price: it?.price ?? it?.system?.price ?? null,

            weight: it?.weight ?? it?.system?.weight ?? null

        };

    });
    const gold = Number(byId('ae-gold').value || 0);
    const visible = !!byId('ae-visible').checked;

    const safeHpCurrent = Number.isFinite(hpInput) ? Math.max(hpInput, 0) : (coerceNumber(entry.stats?.hp?.current) ?? coerceNumber(linkedCombatant?.hp?.current) ?? 0);
    const safeHpMax = Math.max(safeHpCurrent, coerceNumber(entry.stats?.hp?.max) ?? coerceNumber(linkedCombatant?.hp?.max) ?? safeHpCurrent);
    const safeHpTemp = coerceNumber(linkedCombatant?.hp?.temp) ?? coerceNumber(entry.stats?.hp?.temp) ?? 0;
    const safeAc = Number.isFinite(acInput) ? acInput : (coerceNumber(entry.stats?.ac) ?? coerceNumber(linkedCombatant?.ac) ?? 10);
    const dexModifier = modifierFromScore(abilities.dex || 10);

    atlasMapState.encounter.editingInventory = normalizedInventory.map(item => ({ ...item }));

    // Always update the staged entry
    entry.name = name || entry.name;
    entry.visible = visible;
    entry.inventory = normalizedInventory.map(item => ({ ...item }));
    entry.abilities = { ...abilities };
    entry.gold = gold;
    entry.stats = entry.stats || {};
    entry.stats.ac = safeAc;
    entry.stats.hp = {
        current: safeHpCurrent,
        max: safeHpMax,
        temp: safeHpTemp
    };
    entry.hp = safeHpCurrent;
    entry.stats.dexModifier = dexModifier;
    atlasMapState.encounter.dirty = true;

    // If linked combatant exists, persist to Arena
    if (editCtx.combatantId) {
        try {
            const payload = {
                name,
                ac: safeAc,
                dexModifier,
                hp: { current: safeHpCurrent, max: safeHpMax, temp: safeHpTemp },
                abilities,
                inventory: entry.inventory.map(item => ({ ...item })),
                gold
            };
            const res = await fetch(`${API_BASE}/combatants/${editCtx.combatantId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                // Update local state
                const c = (window.encounterState?.combatants || []).find(c => c.id === editCtx.combatantId);
                if (c) {
                    c.name = payload.name;
                    c.ac = payload.ac;
                    c.dexModifier = payload.dexModifier;
                    c.hp = payload.hp;
                    c.abilities = payload.abilities;
                    c.inventory = payload.inventory;
                    c.gold = payload.gold;
                    c.flavorImages = payload.flavorImages;
                    c.flavorSounds = payload.flavorSounds;
                }
                if (typeof renderCombatantsList === 'function') {
                    renderCombatantsList();
                }
            }
        } catch (e) {
            console.error('[Atlas] Failed to update combatant:', e);
        }
    }

    // Re-render panels and map
    renderStagedEnemiesList();
    drawAtlasEncounter();
    if (typeof updateSyncDebugHUD === 'function') {
        updateSyncDebugHUD('edited');
    }

    // Save encounter to session
    if (typeof saveCurrentEncounter === 'function') {
        await saveCurrentEncounter();
    }
}

function renderAgentEditorInventoryList() {
    const list = document.getElementById('ae-inv-list');
    if (!list) return;
    const items = atlasMapState.encounter.editingInventory || [];
    if (!items.length) {
        list.innerHTML = '<div class="atlas-empty-state" style="padding: 0.25rem 0;">No items</div>';
        return;
    }
    list.innerHTML = '';
    items.forEach((it, idx) => {
        const row = document.createElement('div');
        row.className = 'atlas-inventory-row';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr auto';
        row.style.gap = '6px';
        row.style.alignItems = 'center';
        const name = document.createElement('span');
        name.textContent = it.name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-danger btn-small';
        remove.textContent = 'Remove';
        remove.onclick = () => {
            items.splice(idx, 1);
            renderAgentEditorInventoryList();
        };
        row.appendChild(name);
        row.appendChild(remove);
        list.appendChild(row);
    });
}

// Removed renderAgentEditorMediaLists() - flavor media is now separate from agent editor

async function getItemsCatalog() {
    // Try to reuse cache if already loaded by loot-manager
    if (window.cachedItemData && Array.isArray(window.cachedItemData) && window.cachedItemData.length) {
        return window.cachedItemData;
    }
    try {
        const res = await fetch('/data/DBs/items.json');
        const data = await res.json();
        window.cachedItemData = data;
        return data;
    } catch (e) {
        console.error('[Atlas] Failed to load items catalog:', e);
        return [];
    }
}

function getItemIdSafe(item) {
    return item._id || item.system?.identifier || item.name;
}

function handleClearAllStagedEnemies() {
    if (atlasMapState.encounter.pending?.length > 0) {
        if (!confirm('Clear all staged enemies?')) {
            return;
        }
    }

    atlasMapState.encounter.pending = [];
    atlasMapState.encounter.dirty = true;
    updateEncounterEnemyStagingCount();
    renderStagedEnemiesList();
    if (typeof updateSyncDebugHUD === 'function') {
        updateSyncDebugHUD('cleared');
    }
}
function getEncounterEnemySourceLabel(source) {
    if (source === 'library') {
        return 'Monster Library';
    }
    if (source === 'custom') {
        return 'Crucible Enemy';
    }
    return 'Enemy';
}

function sanitizeEncounterText(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

window.refreshEncounterEnemyAgents = refreshEncounterEnemyAgents;

function getActiveEncounterMap() {
    return atlasMapState.maps.find((entry) => entry.id === atlasMapState.activeMapId) || null;
}

function getAtlasMapImage(map) {
    if (!map) {
        return Promise.reject(new Error('No map selected'));
    }
    if (!atlasMapState.imageCache) {
        atlasMapState.imageCache = new Map();
    }
    const cache = atlasMapState.imageCache;
    const cached = cache.get(map.id);
    if (cached) {
        if (cached instanceof HTMLImageElement && cached.complete && cached.naturalWidth > 0) {
            return Promise.resolve(cached);
        }
        if (typeof cached.then === 'function') {
            return cached;
        }
    }
    const loader = new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            cache.set(map.id, image);
            resolve(image);
        };
        image.onerror = (error) => {
            cache.delete(map.id);
            reject(error);
        };
        image.src = map.file;
    });
    cache.set(map.id, loader);
    return loader;
}

function getEncounterGridMetrics() {
    const settings = atlasMapState.settings;
    if (!settings?.display) {
        return null;
    }

    const resolution = settings.display.resolution || {};
    const physical = settings.display.physical || {};
    const grid = settings.display.grid || {};
    const viewport = settings.display.viewport || {};

    let baseCell = Number(grid.cell_px);
    let ppi = Number(settings.display.physical?.ppi_override);

    if (!Number.isFinite(ppi)) {
        const storedPpi = Number(grid.pixels_per_inch);
        if (Number.isFinite(storedPpi)) {
            ppi = storedPpi;
        } else {
            const width = Number(resolution.w);
            const height = Number(resolution.h);
            const diagonal = Number(physical.diagonal_in);
            if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0 && Number.isFinite(diagonal) && diagonal > 0) {
                const pixelDiagonal = Math.sqrt((width ** 2) + (height ** 2));
                ppi = pixelDiagonal / diagonal;
            }
        }
    }

    if (!Number.isFinite(baseCell)) {
        const inchesPerCell = Number(grid.inches_per_cell) || 1;
        const fallbackPpi = Number.isFinite(ppi) ? ppi : 52.45;
        baseCell = fallbackPpi * inchesPerCell;
    }

    if (!Number.isFinite(baseCell) || baseCell <= 0) {
        return null;
    }

    const viewportGridZoom = Number(viewport.gridZoom) || Number(atlasMapState.preview.gridZoom) || 1;
    const gridZoom = clamp(viewportGridZoom, 0.05, 5);
    const configured = baseCell * gridZoom;
    const areaZoom = clamp(atlasMapState.encounter.areaZoom || Number(viewport.zoom) || 1, atlasMapState.encounter.minAreaZoom || 0.25, atlasMapState.encounter.maxAreaZoom || 4);
    const effective = configured * areaZoom;

    return {
        base: baseCell,
        configured,
        zoomed: effective,
        gridZoom: gridZoom,
        areaZoom
    };
}

function computeStartAreaDimensions(mapWidth, mapHeight) {
    const resolution = atlasMapState.settings?.display?.resolution;
    let width = Number(resolution?.w) || 1920;
    let height = Number(resolution?.h) || 1080;
    if (width <= 0 || height <= 0) {
        width = 1920;
        height = 1080;
    }
    const scaleFactor = Math.min(mapWidth / width, mapHeight / height, 1);
    const baseWidth = width * scaleFactor;
    const baseHeight = height * scaleFactor;
    const minZoom = atlasMapState.encounter.minAreaZoom || 0.25;
    const maxZoom = atlasMapState.encounter.maxAreaZoom || 4;
    const areaZoom = clamp(atlasMapState.encounter.areaZoom || 1, minZoom, maxZoom);

    let adjustedWidth = baseWidth / areaZoom;
    let adjustedHeight = baseHeight / areaZoom;
    const fitScale = Math.min(mapWidth / adjustedWidth, mapHeight / adjustedHeight, 1);
    adjustedWidth *= fitScale;
    adjustedHeight *= fitScale;

    return {
        width: adjustedWidth,
        height: adjustedHeight,
        zoom: areaZoom
    };
}

function computeEncounterStartRect(mapWidth, mapHeight) {
    if (!atlasMapState.encounter.startArea) {
        return null;
    }
    const dims = computeStartAreaDimensions(mapWidth, mapHeight);
    if (!dims.width || !dims.height) {
        return null;
    }
    let x = atlasMapState.encounter.startArea.x ?? 0;
    let y = atlasMapState.encounter.startArea.y ?? 0;
    x = clamp(x, 0, Math.max(0, mapWidth - dims.width));
    y = clamp(y, 0, Math.max(0, mapHeight - dims.height));
    atlasMapState.encounter.areaZoom = dims.zoom;
    atlasMapState.encounter.startArea.x = x;
    atlasMapState.encounter.startArea.y = y;
    atlasMapState.encounter.startArea.zoom = dims.zoom;
    return { x, y, width: dims.width, height: dims.height };
}

function positionEncounterStartArea(mapX, mapY) {
    const render = atlasMapState.encounter.render;
    if (!render) {
        return;
    }
    const dims = computeStartAreaDimensions(render.mapWidth, render.mapHeight);
    if (!dims.width || !dims.height) {
        return;
    }
    const halfW = dims.width / 2;
    const halfH = dims.height / 2;
    const x = clamp(mapX - halfW, 0, Math.max(0, render.mapWidth - dims.width));
    const y = clamp(mapY - halfH, 0, Math.max(0, render.mapHeight - dims.height));
    atlasMapState.encounter.startArea = { x, y, zoom: atlasMapState.encounter.areaZoom || 1 };
}

function drawStartAreaOverlay(ctx, rect) {
    const render = atlasMapState.encounter.render;
    if (!render) {
        return;
    }
    const x = render.offsetX + rect.x * render.scale;
    const y = render.offsetY + rect.y * render.scale;
    const w = rect.width * render.scale;
    const h = rect.height * render.scale;

    ctx.save();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.16)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

function findTokenAtPosition(mapX, mapY) {
    const pending = atlasMapState.encounter.pending || [];
    const activeMapId = atlasMapState.activeMapId;

    if (!activeMapId) {
        return null;
    }

    // Calculate cell size for hit detection
    const settings = atlasMapState.settings;
    if (!settings?.display?.grid) {
        return null;
    }

    const grid = settings.display.grid;
    const ppi = settings.display.physical?.ppi_override || settings.display.grid.pixels_per_inch || 52.45;
    const cellPx = grid.inches_per_cell ? ppi * grid.inches_per_cell : grid.cell_px || 50;
    const gridZoom = atlasMapState.settings?.display?.viewport?.gridZoom || atlasMapState.preview.gridZoom || 1;
    const cellSize = cellPx * gridZoom;
    const tokenRadius = cellSize * 0.4;

    // Check each token from front to back
    for (let i = pending.length - 1; i >= 0; i--) {
        const entry = pending[i];
        if (!entry.placed || !entry.position || entry.position.mapId !== activeMapId) {
            continue;
        }

        const dx = mapX - entry.position.x;
        const dy = mapY - entry.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= tokenRadius) {
            return entry;
        }
    }

    return null;
}

function drawEnemyTokens(ctx, scale, offsetX, offsetY) {
    const pending = atlasMapState.encounter.pending || [];
    const activeMapId = atlasMapState.activeMapId;
    const selectedToken = atlasMapState.encounter.selectedToken;

    console.log('[drawEnemyTokens] Called with pending count:', pending.length, 'activeMapId:', activeMapId);

    if (!activeMapId) {
        console.log('[drawEnemyTokens] No active map ID, returning');
        return;
    }

    // Calculate cell size the same way the grid does
    const settings = atlasMapState.settings;
    if (!settings?.display?.grid) {
        console.warn('[drawEnemyTokens] No grid settings available, using defaults');
        // Use default values instead of returning
        const defaultCellPx = 50;
        const defaultGridZoom = atlasMapState.preview?.gridZoom || 1;
        const scaledCellPx = defaultCellPx * scale * defaultGridZoom;
        const tokenRadius = scaledCellPx * 0.4;
        
        ctx.save();
        drawTokensWithRadius(ctx, pending, activeMapId, selectedToken, offsetX, offsetY, scale, tokenRadius);
        ctx.restore();
        return;
    }

    const grid = settings.display.grid;
    const ppi = settings.display.physical?.ppi_override || settings.display.grid.pixels_per_inch || 52.45;
    const cellPx = grid.inches_per_cell ? ppi * grid.inches_per_cell : grid.cell_px || 50;
    const gridZoom = atlasMapState.settings?.display?.viewport?.gridZoom || atlasMapState.preview.gridZoom || 1;

    // This is the cell size on the canvas (matches grid drawing)
    const scaledCellPx = cellPx * scale * gridZoom;

    // Token should be 80% of cell diameter (40% radius)
    let tokenRadius = scaledCellPx * 0.4;
    
    // TEMP FIX: Ensure minimum visible size (increased to 20px for better visibility)
    tokenRadius = Math.max(tokenRadius, 20);
    
    console.log('[drawEnemyTokens] Token size calculation:', {
        cellPx: cellPx,
        scale: scale,
        gridZoom: gridZoom,
        scaledCellPx: scaledCellPx,
        tokenRadius: tokenRadius
    });

    ctx.save();
    drawTokensWithRadius(ctx, pending, activeMapId, selectedToken, offsetX, offsetY, scale, tokenRadius);
    ctx.restore();
}

function drawTokensWithRadius(ctx, pending, activeMapId, selectedToken, offsetX, offsetY, scale, tokenRadius) {
    let drawnCount = 0;
    let skippedCount = 0;
    const skippedReasons = [];
    
    pending.forEach(entry => {
        if (!entry.placed || !entry.position) {
            skippedCount++;
            skippedReasons.push(`${entry.name}: not placed or no position`);
            return;
        }

        // Only draw tokens on the current map
        if (entry.position.mapId !== activeMapId) {
            skippedCount++;
            skippedReasons.push(`${entry.name}: map ID mismatch (token: ${entry.position.mapId}, active: ${activeMapId})`);
            return;
        }
        // Respect visibility toggle (default visible if not set)
        if (entry.visible === false) {
            skippedCount++;
            skippedReasons.push(`${entry.name}: not visible`);
            return;
        }

        const isSelected = selectedToken && selectedToken.id === entry.id;

        // Convert map coordinates to canvas coordinates
        const canvasX = offsetX + (entry.position.x * scale);
        const canvasY = offsetY + (entry.position.y * scale);

        if (drawnCount === 0) {
            // Log first token's coordinates for debugging
            console.log('[drawTokensWithRadius] First token coordinates:', {
                name: entry.name,
                mapPos: { x: entry.position.x, y: entry.position.y },
                canvasPos: { x: canvasX, y: canvasY },
                scale: scale,
                offsetX: offsetX,
                offsetY: offsetY,
                tokenRadius: tokenRadius
            });
        }

        drawnCount++;

        // Draw selection highlight if selected
        if (isSelected) {
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, tokenRadius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#fbbf24'; // Yellow highlight
            ctx.lineWidth = 4;
            ctx.stroke();
        }

        // Draw token circle with VERY visible colors
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, tokenRadius, 0, Math.PI * 2);
        
        // Bright solid red fill (no transparency to ensure visibility)
        ctx.fillStyle = '#ef4444'; // Bright red
        ctx.fill();
        
        // Thick white border for contrast
        ctx.strokeStyle = isSelected ? '#fbbf24' : '#ffffff'; // Yellow if selected, white otherwise
        ctx.lineWidth = 4;
        ctx.stroke();

        // Draw name label with background for better visibility
        const fontSize = Math.max(10, Math.min(16, tokenRadius * 0.6));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Truncate name if too long
        let displayName = entry.name;
        if (displayName.length > 12) {
            displayName = displayName.substring(0, 10) + '...';
        }

        // Draw dark background behind text
        const textMetrics = ctx.measureText(displayName);
        const textWidth = textMetrics.width;
        const padding = 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(
            canvasX - textWidth / 2 - padding,
            canvasY - fontSize / 2 - padding,
            textWidth + padding * 2,
            fontSize + padding * 2
        );

        // Draw white text on top
        ctx.fillStyle = '#ffffff';
        ctx.fillText(displayName, canvasX, canvasY);
    });

    console.log('[drawTokensWithRadius] Drew', drawnCount, 'tokens, skipped', skippedCount);
    if (skippedCount > 0) {
        console.log('[drawTokensWithRadius] Skipped reasons:', skippedReasons);
    }
}

// Debug helper - call from console: debugAtlasTokens()
window.debugAtlasTokens = function() {
    console.log('=== ATLAS TOKEN DEBUG ===');
    console.log('atlasMapState.activeMapId:', atlasMapState?.activeMapId);
    console.log('atlasMapState.encounter.pending:', atlasMapState?.encounter?.pending);
    console.log('Pending tokens:', atlasMapState?.encounter?.pending?.length || 0);
    
    if (atlasMapState?.encounter?.pending) {
        atlasMapState.encounter.pending.forEach((entry, idx) => {
            console.log(`Token ${idx}:`, {
                name: entry.name,
                placed: entry.placed,
                visible: entry.visible,
                position: entry.position,
                positionMapId: entry.position?.mapId,
                matches: entry.position?.mapId === atlasMapState.activeMapId
            });
        });
    }
    
    console.log('atlasMapState.settings?.display?.grid:', atlasMapState?.settings?.display?.grid);
    console.log('=== END DEBUG ===');
};

function drawAtlasEncounter() {
    const { encounterCanvas, encounterEmpty, startAreaHint } = getAtlasElements();
    if (!encounterCanvas) {
        return;
    }

    const container = encounterCanvas.parentElement;
    if (!container) {
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const ctx = encounterCanvas.getContext('2d');

    encounterCanvas.width = Math.max(1, Math.floor(width * dpr));
    encounterCanvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const map = getActiveEncounterMap();
    if (!map) {
        if (encounterEmpty) {
            encounterEmpty.style.display = 'flex';
        }
        if (startAreaHint) {
            startAreaHint.style.display = 'none';
        }
        atlasMapState.encounter.render = null;
        updateEncounterSummary(null);
        return;
    }

    if (encounterEmpty) {
        encounterEmpty.style.display = 'none';
    }

    getAtlasMapImage(map).then((image) => {
        if (atlasMapState.activeMapId !== map.id) {
            return;
        }

        const baseScale = Math.min(width / image.width, height / image.height) || 1;
        const zoom = atlasMapState.encounter.zoom;
        const scale = baseScale * zoom;

        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;

        const centerX = (width - drawWidth) / 2;
        const centerY = (height - drawHeight) / 2;

        const margin = 200;
        let actualX = centerX + atlasMapState.encounter.offset.x;
        let actualY = centerY + atlasMapState.encounter.offset.y;

        const minActualX = Math.min(0, width - drawWidth) - margin;
        const maxActualX = Math.max(0, width - drawWidth) + margin;
        const minActualY = Math.min(0, height - drawHeight) - margin;
        const maxActualY = Math.max(0, height - drawHeight) + margin;

        actualX = clamp(actualX, minActualX, maxActualX);
        actualY = clamp(actualY, minActualY, maxActualY);

        atlasMapState.encounter.offset.x = actualX - centerX;
        atlasMapState.encounter.offset.y = actualY - centerY;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, actualX, actualY, drawWidth, drawHeight);

        const gridEnabled = atlasMapState.settings?.display?.grid?.enabled ?? true;
        if (atlasMapState.preview.showGrid && gridEnabled) {
            const metrics = getEncounterGridMetrics();
            if (metrics) {
                drawGridOnContext(ctx, {
                    x: actualX,
                    y: actualY,
                    width: drawWidth,
                    height: drawHeight,
                    scale
                });
            }
        }

        const rect = computeEncounterStartRect(image.width, image.height);
        const renderGridMetrics = getEncounterGridMetrics();
        atlasMapState.encounter.render = {
            baseScale,
            scale,
            offsetX: actualX,
            offsetY: actualY,
            canvasWidth: width,
            canvasHeight: height,
            mapWidth: image.width,
            mapHeight: image.height,
            startRect: rect,
            gridCellPx: renderGridMetrics ? renderGridMetrics.zoomed : null
        };

        if (rect) {
            drawStartAreaOverlay(ctx, rect);
        }

        // Draw placed enemy tokens
        drawEnemyTokens(ctx, scale, actualX, actualY);

        // DEBUG: Draw test markers
        if (atlasMapState.encounter.pending && atlasMapState.encounter.pending.length > 0) {
            ctx.save();
            // Green marker at canvas center
            ctx.fillStyle = 'lime';
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Draw large crosshairs at token positions to show where they actually are
            atlasMapState.encounter.pending.forEach((entry, idx) => {
                if (!entry.placed || !entry.position || entry.position.mapId !== atlasMapState.activeMapId) {
                    return;
                }
                
                const tokenX = actualX + (entry.position.x * scale);
                const tokenY = actualY + (entry.position.y * scale);
                
                // Draw a bright yellow crosshair
                ctx.strokeStyle = idx === 0 ? 'yellow' : 'cyan';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(tokenX - 50, tokenY);
                ctx.lineTo(tokenX + 50, tokenY);
                ctx.moveTo(tokenX, tokenY - 50);
                ctx.lineTo(tokenX, tokenY + 50);
                ctx.stroke();
                
                // Draw a circle around it
                ctx.beginPath();
                ctx.arc(tokenX, tokenY, 30, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.restore();
        }

        // Update cursor based on mode
        if (atlasMapState.encounter.placementMode) {
            encounterCanvas.style.cursor = 'crosshair';
        } else if (atlasMapState.encounter.placing) {
            encounterCanvas.style.cursor = 'crosshair';
        } else {
            encounterCanvas.style.cursor = 'grab';
        }

        if (startAreaHint) {
            startAreaHint.style.display = 'block';
            if (atlasMapState.encounter.placementMode && atlasMapState.encounter.placementEntry) {
                startAreaHint.textContent = 'Click on the map to place ' + atlasMapState.encounter.placementEntry.name + ' (will snap to grid).';
                startAreaHint.style.color = '#fbbf24'; // Yellow color for placement mode
            } else if (atlasMapState.encounter.placing) {
                startAreaHint.textContent = 'Click on the map to set the starting area.';
                startAreaHint.style.color = ''; // Reset color
            } else if (rect) {
                startAreaHint.textContent = 'Drag to pan or place a new starting area when needed.';
                startAreaHint.style.color = ''; // Reset color
            } else {
                startAreaHint.textContent = 'Click Place Starting Area to choose where play begins.';
                startAreaHint.style.color = ''; // Reset color
            }
        }

        updateEncounterSummary(rect);
    }).catch((error) => {
        console.error('[Atlas] Failed to load encounter map:', error);
        if (encounterEmpty) {
            encounterEmpty.textContent = 'Failed to load map preview.';
            encounterEmpty.style.display = 'flex';
        }
        if (startAreaHint) {
            startAreaHint.style.display = 'none';
        }
        atlasMapState.encounter.render = null;
        updateEncounterSummary(null);
    });
}

function handleEncounterWheel(event) {
    if (!atlasMapState.encounter) {
        return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    const pointer = getEncounterPointer(event);
    changeEncounterZoom(delta, pointer ? { x: pointer.x, y: pointer.y } : null);
}

function startEncounterDrag(event) {
    if (event.button !== 0) {
        return;
    }
    if (!atlasMapState.encounter.render) {
        return;
    }
    atlasMapState.encounter.dragging = true;
    atlasMapState.encounter.dragMoved = false;
    atlasMapState.encounter.dragStart = { x: event.clientX, y: event.clientY };
    atlasMapState.encounter.originalOffset = { ...atlasMapState.encounter.offset };
}

function handleEncounterDrag(event) {
    if (!atlasMapState.encounter.dragging) {
        return;
    }
    const dx = event.clientX - atlasMapState.encounter.dragStart.x;
    const dy = event.clientY - atlasMapState.encounter.dragStart.y;
    if (!atlasMapState.encounter.dragMoved) {
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            atlasMapState.encounter.dragMoved = true;
        }
    }
    atlasMapState.encounter.offset.x = atlasMapState.encounter.originalOffset.x + dx;
    atlasMapState.encounter.offset.y = atlasMapState.encounter.originalOffset.y + dy;
    drawAtlasEncounter();
}

function endEncounterDrag() {
    atlasMapState.encounter.dragging = false;
}

function handleEncounterCanvasClick(event) {
    if (atlasMapState.encounter.dragMoved) {
        atlasMapState.encounter.dragMoved = false;
        return;
    }
    if (!atlasMapState.activeMapId) {
        return;
    }

    const pointer = getEncounterPointer(event);
    if (!pointer) {
        return;
    }

    // Handle enemy placement mode
    if (atlasMapState.encounter.placementMode && atlasMapState.encounter.placementEntry) {
        placeEnemyToken(pointer.mapX, pointer.mapY);
        return;
    }

    // Check if clicking on a placed token
    const clickedToken = findTokenAtPosition(pointer.mapX, pointer.mapY);
    if (clickedToken) {
        atlasMapState.encounter.selectedToken = clickedToken;
        drawAtlasEncounter();
        return;
    }

    // Deselect token if clicking empty space
    if (atlasMapState.encounter.selectedToken) {
        atlasMapState.encounter.selectedToken = null;
        drawAtlasEncounter();
        return;
    }

    // Handle starting area placement mode
    if (!atlasMapState.encounter.placing && atlasMapState.encounter.startArea) {
        return;
    }
    positionEncounterStartArea(pointer.mapX, pointer.mapY);
    atlasMapState.encounter.dirty = true;
    updateEncounterControls();
    drawAtlasEncounter();
}

function handleEncounterKeydown(event) {
    // Only handle arrow keys when in Atlas Encounters view
    const activeView = document.querySelector('.atlas-section.active');
    if (!activeView || activeView.id !== 'atlas-encounters-section') {
        return;
    }

    // Check if user is typing in an input field
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    // Only handle if a token is selected
    const selectedToken = atlasMapState.encounter.selectedToken;
    if (!selectedToken || !selectedToken.position) {
        return;
    }

    // Check if this is an arrow key or escape - if so, prevent default first
    const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key);
    if (!isArrowKey) {
        return;
    }

    // Prevent default page scrolling for arrow keys
    event.preventDefault();

    // Calculate grid cell size
    const settings = atlasMapState.settings;
    if (!settings?.display?.grid) {
        return;
    }

    const grid = settings.display.grid;
    const ppi = settings.display.physical?.ppi_override || settings.display.grid.pixels_per_inch || 52.45;
    const cellPx = grid.inches_per_cell ? ppi * grid.inches_per_cell : grid.cell_px || 50;
    const gridZoom = atlasMapState.settings?.display?.viewport?.gridZoom || atlasMapState.preview.gridZoom || 1;
    const cellSize = cellPx * gridZoom;

    let moved = false;

    switch (event.key) {
        case 'ArrowUp':
            selectedToken.position.y -= cellSize;
            moved = true;
            break;
        case 'ArrowDown':
            selectedToken.position.y += cellSize;
            moved = true;
            break;
        case 'ArrowLeft':
            selectedToken.position.x -= cellSize;
            moved = true;
            break;
        case 'ArrowRight':
            selectedToken.position.x += cellSize;
            moved = true;
            break;
        case 'Escape':
            // Deselect token on Escape
            atlasMapState.encounter.selectedToken = null;
            drawAtlasEncounter();
            return;
    }

    if (moved) {
        atlasMapState.encounter.dirty = true;
        renderStagedEnemiesList(); // Update coordinates display
        drawAtlasEncounter();

        // Trigger encounter save
        if (typeof saveCurrentEncounter === 'function') {
            saveCurrentEncounter();
        }
    }
}

function changeEncounterFrameZoom(delta) {
    const encounter = atlasMapState.encounter;
    const min = encounter.minAreaZoom || 0.25;
    const max = encounter.maxAreaZoom || 4;
    const current = encounter.areaZoom || 1;
    const next = clamp(current + delta, min, max);
    setEncounterFrameZoom(next);
}

function setEncounterFrameZoom(nextZoom) {
    const encounter = atlasMapState.encounter;
    const min = encounter.minAreaZoom || 0.25;
    const max = encounter.maxAreaZoom || 4;
    const clamped = clamp(nextZoom, min, max);
    const previous = encounter.areaZoom || 1;
    if (Math.abs(clamped - previous) < 0.0001) {
        return;
    }

    let center = null;
    const render = encounter.render;
    if (render?.startRect && encounter.startArea) {
        center = {
            x: encounter.startArea.x + render.startRect.width / 2,
            y: encounter.startArea.y + render.startRect.height / 2
        };
    }

    encounter.areaZoom = clamped;
    if (encounter.startArea && center) {
        positionEncounterStartArea(center.x, center.y);
    }

    if (encounter.startArea) {
        encounter.dirty = true;
        encounter.startArea.zoom = clamped;
    }

    atlasMapState.settings = atlasMapState.settings || {};
    atlasMapState.settings.display = atlasMapState.settings.display || {};
    atlasMapState.settings.display.viewport = atlasMapState.settings.display.viewport || {};
    atlasMapState.settings.display.viewport.zoom = clamped;
    atlasMapState.settings.display.viewport.fit = 'pixel';

    atlasMapState.preview.zoom = clamped;
    drawAtlasPreview();

    updateEncounterSummary(null);
    drawAtlasEncounter();
}

function changeEncounterGridZoom(delta) {
    if (!atlasMapState.settings?.display) {
        return;
    }
    atlasMapState.settings = atlasMapState.settings || {};
    atlasMapState.settings.display = atlasMapState.settings.display || {};
    const current = Number(atlasMapState.preview.gridZoom) || Number(atlasMapState.settings.display?.viewport?.gridZoom) || 1;
    const next = clamp(current + delta, 0.1, 4);
    if (Math.abs(next - current) < 0.0001) {
        return;
    }

    const rounded = Number(next.toFixed(2));
    atlasMapState.preview.gridZoom = rounded;
    atlasMapState.settings.display = atlasMapState.settings.display || {};
    atlasMapState.settings.display.viewport = atlasMapState.settings.display.viewport || {};
    atlasMapState.settings.display.viewport.gridZoom = rounded;

    updateEncounterSummary(atlasMapState.encounter.render?.startRect || null);
    drawAtlasPreview();
    drawAtlasEncounter();
}

function resetEncounterGridZoom() {
    if (!atlasMapState.settings?.display) {
        return;
    }
    atlasMapState.preview.gridZoom = 1;
    atlasMapState.settings.display = atlasMapState.settings.display || {};
    atlasMapState.settings.display.viewport = atlasMapState.settings.display.viewport || {};
    atlasMapState.settings.display.viewport.gridZoom = 1;
    updateEncounterSummary(atlasMapState.encounter.render?.startRect || null);
    drawAtlasPreview();
    drawAtlasEncounter();
}

function changeEncounterZoom(delta, focusPoint) {
    const encounter = atlasMapState.encounter;
    const newZoom = (encounter.zoom || 1) + delta;
    setEncounterZoom(newZoom, focusPoint);
}

function setEncounterZoom(newZoom, focusPoint) {
    const encounter = atlasMapState.encounter;
    const clamped = clamp(newZoom, encounter.minZoom, encounter.maxZoom);
    const render = encounter.render;
    const previous = encounter.zoom || 1;
    encounter.zoom = clamped;
    if (!render) {
        drawAtlasEncounter();
        return;
    }
    if (Math.abs(clamped - previous) < 0.0001) {
        return;
    }

    const baseScale = render.baseScale;
    const newScale = baseScale * clamped;
    const drawWidth = render.mapWidth * newScale;
    const drawHeight = render.mapHeight * newScale;
    const centerX = (render.canvasWidth - drawWidth) / 2;
    const centerY = (render.canvasHeight - drawHeight) / 2;

    const prevScale = render.scale || baseScale;
    const focus = focusPoint || {
        x: render.canvasWidth / 2,
        y: render.canvasHeight / 2
    };
    const mapX = (focus.x - render.offsetX) / prevScale;
    const mapY = (focus.y - render.offsetY) / prevScale;

    const actualX = focus.x - mapX * newScale;
    const actualY = focus.y - mapY * newScale;

    encounter.offset.x = actualX - centerX;
    encounter.offset.y = actualY - centerY;
    drawAtlasEncounter();
}

function getEncounterPointer(event) {
    const elements = getAtlasElements();
    const render = atlasMapState.encounter.render;
    if (!elements.encounterCanvas || !render) {
        return null;
    }
    const rect = elements.encounterCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mapX = (x - render.offsetX) / render.scale;
    const mapY = (y - render.offsetY) / render.scale;
    return { x, y, mapX, mapY };
}

function saveEncounterStartArea() {
    const mapId = atlasMapState.activeMapId;
    const elements = getAtlasElements();
    if (!mapId) {
        alert('Select an active map before saving.');
        return;
    }

    const encounterSettings = atlasMapState.settings?.encounter || {};
    const startAreas = { ...(encounterSettings.startingAreas || {}) };

    if (atlasMapState.encounter.startArea) {
        startAreas[mapId] = {
            x: Number(atlasMapState.encounter.startArea.x.toFixed(2)),
            y: Number(atlasMapState.encounter.startArea.y.toFixed(2)),
            zoom: Number((atlasMapState.encounter.areaZoom || 1).toFixed(2))
        };
    } else {
        delete startAreas[mapId];
    }

    // Save placed enemies (serialize the pending array)
    const placedEnemies = (atlasMapState.encounter.pending || []).map(entry => ({
        id: entry.id,
        name: entry.name,
        source: entry.source,
        payload: entry.payload,
        placed: entry.placed || false,
        visible: entry.visible !== false,
        position: entry.position ? {
            x: Number(entry.position.x.toFixed(2)),
            y: Number(entry.position.y.toFixed(2)),
            mapId: entry.position.mapId
        } : null
    }));

    console.log('[Atlas] Saving placed enemies:', placedEnemies);

    // Preserve the current gridZoom setting
    const currentGridZoom = atlasMapState.settings?.display?.viewport?.gridZoom || 1;

    const payload = {
        encounter: {
            ...encounterSettings,
            startingAreas: startAreas,
            placedEnemies: placedEnemies
        },
        display: {
            ...atlasMapState.settings?.display,
            viewport: {
                ...atlasMapState.settings?.display?.viewport,
                gridZoom: Number(currentGridZoom.toFixed(2))
            }
        }
    };

    if (elements.saveStartAreaBtn) {
        elements.saveStartAreaBtn.disabled = true;
        elements.saveStartAreaBtn.textContent = 'Saving...';
    }

    fetch(`${API_BASE}/atlas/settings`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then((res) => res.json())
        .then((settings) => {
            console.log('[Atlas] Settings saved successfully. Received back:', settings);
            console.log('[Atlas] Placed enemies in saved settings:', settings.encounter?.placedEnemies);
            atlasMapState.settings = settings;
            syncEncounterStateFromSettings(true);
            populateSettingsForm();
            updateEncounterControls();
            drawAtlasEncounter();
        })
        .catch((error) => {
            console.error('[Atlas] Failed to save starting area:', error);
            alert('Failed to save starting area.');
        })
        .finally(() => {
            if (elements.saveStartAreaBtn) {
                elements.saveStartAreaBtn.disabled = false;
                elements.saveStartAreaBtn.textContent = 'Save';
            }
        });
}

function clearEncounterStartingArea() {
    atlasMapState.encounter.startArea = null;
    atlasMapState.encounter.areaZoom = 1;
    if (atlasMapState.settings?.display?.viewport) {
        atlasMapState.settings.display.viewport.zoom = 1;
    }
    atlasMapState.preview.zoom = 1;
    atlasMapState.encounter.dirty = true;
    atlasMapState.encounter.placing = false;
    updateEncounterControls();
    updateEncounterSummary(null);
    drawAtlasPreview();
    drawAtlasEncounter();
}
function drawAtlasPreview() {
    const { previewCanvas, previewEmpty } = getAtlasElements();
    if (!previewCanvas) {
        return;
    }
    const container = previewCanvas.parentElement;
    if (container) {
        previewCanvas.width = container.clientWidth;
        previewCanvas.height = container.clientHeight;
    }
    const ctx = previewCanvas.getContext('2d');
    const activeMap = atlasMapState.maps.find((entry) => entry.id === atlasMapState.activeMapId);
    if (!activeMap) {
        previewEmpty.style.display = 'block';
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        return;
    }

    previewEmpty.style.display = 'none';
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('error', () => {
        console.error('[Atlas] Failed to load preview image:', activeMap.file);
        previewEmpty.style.display = 'block';
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    });
    image.onload = () => {
        const dpr = window.devicePixelRatio || 1;
        previewCanvas.width = (container?.clientWidth || previewCanvas.width) * dpr;
        previewCanvas.height = (container?.clientHeight || previewCanvas.height) * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

        const clientWidth = previewCanvas.width / dpr;
        const clientHeight = previewCanvas.height / dpr;
        const scale = calculatePreviewScale(image, clientWidth, clientHeight, atlasMapState.preview.fit, atlasMapState.preview.zoom);
        const drawWidth = scale ? image.width * scale : clientWidth;
        const drawHeight = scale ? image.height * scale : clientHeight;
        const offsetX = (clientWidth - drawWidth) / 2 + atlasMapState.preview.offset.x;
        const offsetY = (clientHeight - drawHeight) / 2 + atlasMapState.preview.offset.y;

        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

        if (atlasMapState.preview.showGrid && atlasMapState.settings?.display?.grid?.enabled) {
            drawGridOnContext(ctx, {
                x: offsetX,
                y: offsetY,
                width: drawWidth,
                height: drawHeight,
                scale: scale || 1
            });
        }

        if (atlasMapState.ruler.enabled) {
            drawCalibrationRuler(ctx, scale || 1);
            enableRulerInteractions(previewCanvas);
        }
    };
    image.src = activeMap.file;
}

function calculatePreviewScale(image, containerWidth, containerHeight, fitMode, zoom = 1) {
    switch (fitMode) {
        case 'fill':
            return Math.max(containerWidth / image.width, containerHeight / image.height) * zoom;
        case 'stretch':
            return null;
        case 'pixel':
            return 1 * zoom;
        case 'fit':
        default:
            return Math.min(containerWidth / image.width, containerHeight / image.height) * zoom;
    }
}

function drawGridOnContext(ctx, area) {
    const settings = atlasMapState.settings;
    if (!settings?.display?.grid) {
        return;
    }

    const grid = settings.display.grid;
    const ppi = settings.display.physical?.ppi_override || settings.display.grid.pixels_per_inch || 52.45;
    const cellPx = grid.inches_per_cell ? ppi * grid.inches_per_cell : grid.cell_px || 50;

    // Apply grid zoom if set (defaults to 1)
    const gridZoom = atlasMapState.preview.gridZoom || 1;

    // Scale the cell size for rendering on the preview canvas
    const scaledCellPx = cellPx * area.scale * gridZoom;

    if (!scaledCellPx || !Number.isFinite(scaledCellPx) || scaledCellPx <= 0) {
        return;
    }

    ctx.save();
    ctx.globalAlpha = grid.opacity ?? 0.25;
    ctx.strokeStyle = grid.color || '#3aaaff';
    ctx.lineWidth = grid.line_px || 2;
    ctx.beginPath();

    for (let x = area.x; x <= area.x + area.width; x += scaledCellPx) {
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.height);
    }

    for (let y = area.y; y <= area.y + area.height; y += scaledCellPx) {
        ctx.moveTo(area.x, y);
        ctx.lineTo(area.x + area.width, y);
    }

    ctx.stroke();
    ctx.restore();
}

function drawCalibrationRuler(ctx, scale) {
    const elements = getAtlasElements();
    const wrapper = elements.previewCanvas?.parentElement;
    if (!wrapper) {
        return;
    }

    let overlay = wrapper.querySelector('.atlas-ruler-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'atlas-ruler-overlay';
        wrapper.appendChild(overlay);
    }

    overlay.innerHTML = '';
    const startPoint = createRulerPoint(atlasMapState.ruler.start);
    const endPoint = createRulerPoint(atlasMapState.ruler.end);
    overlay.append(startPoint, endPoint);

    const line = document.createElement('div');
    line.className = 'atlas-ruler-line';
    const dx = atlasMapState.ruler.end.x - atlasMapState.ruler.start.x;
    const dy = atlasMapState.ruler.end.y - atlasMapState.ruler.start.y;
    const length = Math.sqrt((dx ** 2) + (dy ** 2));
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    line.style.width = `${length}px`;
    line.style.left = `${atlasMapState.ruler.start.x}px`;
    line.style.top = `${atlasMapState.ruler.start.y}px`;
    line.style.transform = `rotate(${angle}deg)`;
    overlay.appendChild(line);

    const measuredPixels = length * (window.devicePixelRatio || 1);
    const settings = atlasMapState.settings;
    const ppi = settings.display?.physical?.ppi_override || settings.display?.grid?.pixels_per_inch;
    if (ppi) {
        const inches = measuredPixels / ppi;
        console.log(`[Atlas] Calibration measurement: ${inches.toFixed(2)} inches`);
    }
}

function createRulerPoint(position) {
    const point = document.createElement('div');
    point.className = 'atlas-ruler-point';
    point.style.left = `${position.x - 8}px`;
    point.style.top = `${position.y - 8}px`;
    return point;
}

function enableRulerInteractions(canvas) {
    const wrapper = canvas.parentElement;
    const overlay = wrapper.querySelector('.atlas-ruler-overlay');
    if (!overlay) {
        return;
    }

    overlay.querySelectorAll('.atlas-ruler-point').forEach((point, index) => {
        point.addEventListener('pointerdown', (event) => {
            atlasMapState.ruler.draggingPoint = point;
            point.setPointerCapture(event.pointerId);
        });
        point.addEventListener('pointermove', (event) => {
            if (atlasMapState.ruler.draggingPoint !== point) {
                return;
            }
            const rect = overlay.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            point.style.left = `${x - 8}px`;
            point.style.top = `${y - 8}px`;
            const position = index === 0 ? atlasMapState.ruler.start : atlasMapState.ruler.end;
            position.x = x;
            position.y = y;
        });
        point.addEventListener('pointerup', () => {
            atlasMapState.ruler.draggingPoint = null;
        });
    });
}

// Dev restart button handler
document.getElementById('dev-restart-btn')?.addEventListener('click', async () => {
    if (!confirm('Restart server and reload page?\n\nNote: Server must be running with start.bat for automatic restart.')) return;

    try {
        // Show a loading indicator
        const restartBtn = document.getElementById('dev-restart-btn');
        const originalText = restartBtn.textContent;
        restartBtn.textContent = '⏳';
        restartBtn.disabled = true;

        // Trigger server restart
        await fetch(`${API_BASE}/dev/restart`, { method: 'POST' });

        // Wait for server to restart (nodemon will handle the restart)
        let attempts = 0;
        const maxAttempts = 20;

        const checkServer = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`${API_BASE}/encounter`, { method: 'HEAD' });
                if (response.ok) {
                    clearInterval(checkServer);
                    // Server is back up, reload the page
                    window.location.reload();
                }
            } catch (error) {
                // Server not ready yet
                if (attempts >= maxAttempts) {
                    clearInterval(checkServer);
                    restartBtn.textContent = originalText;
                    restartBtn.disabled = false;
                    alert('Server restart timed out. Please check if the server is running with start.bat');
                }
            }
        }, 500);
    } catch (error) {
        console.error('Error triggering restart:', error);
        alert('Failed to restart server. Please ensure the server is running with start.bat for auto-restart support.');
    }
});

function updateAtlasStateFromSocket(payload) {
    atlasMapState.lastDisplayState = payload;
    if (payload?.grid) {
        applyDisplayGrid(payload.grid);
    }
    if (payload?.viewport) {
        applyDisplayResolution(payload.viewport);
    }
    if (typeof payload?.connected === 'boolean') {
        atlasMapState.displayConnected = payload.connected;
        updateDisplayStatus();
    }
}

function handlePreviewWheel(event) {
    if (!atlasMapState.preview) {
        return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    const newZoom = Math.min(Math.max(atlasMapState.preview.zoom + delta, 0.1), 5);
    if (newZoom !== atlasMapState.preview.zoom) {
        atlasMapState.preview.zoom = newZoom;
        drawAtlasPreview();
    }
}

function startPreviewDrag(event) {
    if (!atlasMapState.preview) {
        return;
    }
    atlasMapState.preview.dragging = true;
    atlasMapState.preview.dragStart = { x: event.clientX, y: event.clientY };
    atlasMapState.preview.originalOffset = { ...atlasMapState.preview.offset };
}

function handlePreviewDrag(event) {
    if (!atlasMapState.preview || !atlasMapState.preview.dragging) {
        return;
    }
    const dx = event.clientX - atlasMapState.preview.dragStart.x;
    const dy = event.clientY - atlasMapState.preview.dragStart.y;
    atlasMapState.preview.offset.x = atlasMapState.preview.originalOffset.x + dx;
    atlasMapState.preview.offset.y = atlasMapState.preview.originalOffset.y + dy;
    drawAtlasPreview();
}

function endPreviewDrag() {
    if (atlasMapState.preview) {
        atlasMapState.preview.dragging = false;
    }
}

// ==========================================
// Flavor Media Upload Functionality
// ==========================================

// Initialize flavor media arrays in atlasMapState
if (!atlasMapState.encounter.flavorImages) {
    atlasMapState.encounter.flavorImages = [];
}
if (!atlasMapState.encounter.flavorSounds) {
    atlasMapState.encounter.flavorSounds = [];
}

function bindFlavorMediaEvents() {
    const imageUpload = document.getElementById('flavor-image-upload');
    const soundUpload = document.getElementById('flavor-sound-upload');

    if (imageUpload) {
        imageUpload.addEventListener('change', handleFlavorImageUpload);
    }

    if (soundUpload) {
        soundUpload.addEventListener('change', handleFlavorSoundUpload);
    }
}

function handleFlavorImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        return;
    }

    files.forEach((file) => {
        const formData = new FormData();
        formData.append('file', file);
        uploadFlavorMedia(formData, 'image');
    });

    event.target.value = '';
}

function handleFlavorSoundUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        return;
    }

    files.forEach((file) => {
        const formData = new FormData();
        formData.append('file', file);
        uploadFlavorMedia(formData, 'sound');
    });

    event.target.value = '';
}

function uploadFlavorMedia(formData, type) {
    const endpoint = '/flavor-media';

    fetch(API_BASE + endpoint, {
        method: 'POST',
        body: formData
    })
        .then((res) => {
            if (!res.ok) {
                return res.json()
                    .then((data) => {
                        const message = data && data.error ? data.error : 'Upload failed: ' + res.status;
                        throw new Error(message);
                    })
                    .catch(() => {
                        throw new Error('Upload failed: ' + res.status);
                    });
            }
            return res.json();
        })
        .then((record) => {
            console.log('[FlavorMedia] Upload response:', record);
            // Extract filename from file path (e.g., "/maps/abc123.png" -> "abc123.png")
            const filename = record.file ? record.file.split('/').pop() : record.name;
            const mediaItem = {
                id: record.id || Date.now().toString(),
                path: record.file,
                filename: filename,
                type: type
            };
            console.log('[FlavorMedia] Created mediaItem:', mediaItem);

            if (type === 'image') {
                atlasMapState.encounter.flavorImages.push(mediaItem);
            } else {
                atlasMapState.encounter.flavorSounds.push(mediaItem);
            }

            renderFlavorMediaLists();
            saveFlavorMediaToEncounter();
        })
        .catch((error) => {
            console.error('[Atlas] Failed to upload ' + type + ':', error);
            alert(error.message || 'Failed to upload ' + type + '. Please try again.');
        });
}

function renderFlavorMediaLists() {
    renderFlavorImagesList();
    renderFlavorSoundsList();
}

function renderFlavorImagesList() {
    const container = document.getElementById('flavor-images-list');
    if (!container) {
        return;
    }

    const images = atlasMapState.encounter.flavorImages || [];

    if (images.length === 0) {
        container.innerHTML = '<div class="atlas-empty-state">No images uploaded yet</div>';
        return;
    }

    container.innerHTML = '';

    images.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'atlas-flavor-media-item';

        const img = document.createElement('img');
        img.className = 'atlas-flavor-media-item-preview';
        const imgPath = item.path || item.filename;
        img.src = imgPath.startsWith('/') ? imgPath : '/maps/' + imgPath;
        img.alt = item.filename;
        img.title = item.filename + ' (click to view full size)';
        img.onclick = () => window.open(img.src, '_blank');
        img.onerror = () => {
            console.warn('[FlavorMedia] Failed to load image:', img.src);
            img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="80"%3E%3Crect fill="%23374151" width="100" height="80"/%3E%3Ctext x="50" y="40" text-anchor="middle" fill="%239ca3af" font-size="12"%3E✗ Error%3C/text%3E%3C/svg%3E';
        };
        console.log('[FlavorMedia] Image src:', img.src);

        const name = document.createElement('div');
        name.className = 'atlas-flavor-media-item-name';
        name.textContent = item.filename;
        name.title = item.filename;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'atlas-flavor-media-item-remove';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => removeFlavorMedia('image', index);

        itemEl.appendChild(img);
        itemEl.appendChild(name);
        itemEl.appendChild(removeBtn);
        container.appendChild(itemEl);
    });
}

function renderFlavorSoundsList() {
    const container = document.getElementById('flavor-sounds-list');
    if (!container) {
        return;
    }

    const sounds = atlasMapState.encounter.flavorSounds || [];

    if (sounds.length === 0) {
        container.innerHTML = '<div class="atlas-empty-state">No sounds uploaded yet</div>';
        return;
    }

    container.innerHTML = '';

    sounds.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'atlas-flavor-media-item';
        itemEl.style.flexDirection = 'column';
        itemEl.style.padding = '10px';

        const audioPath = item.path || item.filename;
        const audioSrc = audioPath.startsWith('/') ? audioPath : '/maps/' + audioPath;
        console.log('[FlavorMedia] Sound src:', audioSrc);

        const audioWrapper = document.createElement('div');
        audioWrapper.className = 'atlas-flavor-media-item-preview';
        audioWrapper.style.width = '100%';
        audioWrapper.style.height = 'auto';
        audioWrapper.style.display = 'flex';
        audioWrapper.style.flexDirection = 'column';
        audioWrapper.style.gap = '6px';
        audioWrapper.style.background = '#1f2937';
        audioWrapper.style.padding = '8px';
        audioWrapper.style.borderRadius = '3px';

        const icon = document.createElement('div');
        icon.style.fontSize = '1.5em';
        icon.style.textAlign = 'center';
        icon.textContent = '🔊';

        const audio = document.createElement('audio');
        audio.controls = true;
        audio.style.width = '100%';
        audio.style.height = 'auto';
        audio.style.minHeight = '40px';
        audio.src = audioSrc;
        audio.onerror = () => {
            console.warn('[FlavorMedia] Failed to load audio:', audioSrc);
            icon.textContent = '✗';
            icon.style.color = '#ef4444';
        };

        audioWrapper.appendChild(icon);
        audioWrapper.appendChild(audio);

        const name = document.createElement('div');
        name.className = 'atlas-flavor-media-item-name';
        name.textContent = item.filename;
        name.title = item.filename;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'atlas-flavor-media-item-remove';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => removeFlavorMedia('sound', index);

        itemEl.appendChild(audioWrapper);
        itemEl.appendChild(name);
        itemEl.appendChild(removeBtn);
        container.appendChild(itemEl);
    });
}

function removeFlavorMedia(type, index) {
    if (type === 'image') {
        atlasMapState.encounter.flavorImages.splice(index, 1);
    } else {
        atlasMapState.encounter.flavorSounds.splice(index, 1);
    }

    renderFlavorMediaLists();
    saveFlavorMediaToEncounter();
}

function saveFlavorMediaToEncounter() {
    if (typeof saveCurrentEncounter === 'function') {
        const currentEncounter = window.sessionState && window.sessionState.currentEncounter;
        if (currentEncounter) {
            currentEncounter.flavorImages = atlasMapState.encounter.flavorImages;
            currentEncounter.flavorSounds = atlasMapState.encounter.flavorSounds;
            saveCurrentEncounter();
        }
    }
}

function loadFlavorMediaFromEncounter() {
    const currentEncounter = window.sessionState && window.sessionState.currentEncounter;
    if (currentEncounter) {
        atlasMapState.encounter.flavorImages = currentEncounter.flavorImages || [];
        atlasMapState.encounter.flavorSounds = currentEncounter.flavorSounds || [];
        renderFlavorMediaLists();
    }
}

if (document.getElementById('flavor-image-upload')) {
    bindFlavorMediaEvents();
    loadFlavorMediaFromEncounter();
}
