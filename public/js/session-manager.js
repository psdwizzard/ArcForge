// Session and Encounter Management System

// State
const sessionState = {
    currentSession: null,
    currentEncounter: null,
    sessions: [],
    encounters: []
};
window.sessionState = sessionState;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initSessionManager);

function initSessionManager() {
    console.log('Session Manager Initialized');

    // Bind button events
    const newSessionBtn = document.getElementById('new-session-btn');
    const loadSessionBtn = document.getElementById('load-session-btn');
    const newEncounterBtn = document.getElementById('new-encounter-btn');
    const loadEncounterBtn = document.getElementById('load-encounter-btn');

    if (newSessionBtn) newSessionBtn.addEventListener('click', openNewSessionModal);
    if (loadSessionBtn) loadSessionBtn.addEventListener('click', openLoadSessionModal);
    if (newEncounterBtn) newEncounterBtn.addEventListener('click', openNewEncounterModal);
    if (loadEncounterBtn) loadEncounterBtn.addEventListener('click', openLoadEncounterModal);

    // Bind form submissions
    const sessionForm = document.getElementById('session-form');
    const encounterForm = document.getElementById('encounter-form');

    if (sessionForm) sessionForm.addEventListener('submit', handleCreateSession);
    if (encounterForm) encounterForm.addEventListener('submit', handleCreateEncounter);

    // Load sessions list on startup
    loadSessionsList();

    // Auto-load last session
    const lastSessionId = localStorage.getItem('lastSessionId');
    if (lastSessionId) {
        console.log('Auto-loading last session:', lastSessionId);
        loadSession(lastSessionId);
    }
}

// === SESSION MANAGEMENT ===

function openNewSessionModal() {
    const modal = document.getElementById('session-modal');
    const form = document.getElementById('session-form');

    if (form) form.reset();
    if (modal) modal.style.display = 'flex';

    loadSessionsList();
}

function openLoadSessionModal() {
    openNewSessionModal(); // Same modal, just focuses on the list
}

function closeSessionModal() {
    const modal = document.getElementById('session-modal');
    if (modal) modal.style.display = 'none';
}
window.closeSessionModal = closeSessionModal;

async function handleCreateSession(e) {
    e.preventDefault();

    const nameInput = document.getElementById('session-name-input');
    const descInput = document.getElementById('session-description-input');

    const sessionData = {
        id: generateId(),
        name: nameInput.value,
        description: descInput.value || '',
        createdAt: new Date().toISOString(),
        encounters: []
    };

    try {
        const response = await fetch(`${API_BASE}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionData)
        });

        if (response.ok) {
            const savedSession = await response.json();
            console.log('Session created:', savedSession);

            // Set as current session
            sessionState.currentSession = savedSession;

            // Save to localStorage for auto-load next time
            localStorage.setItem('lastSessionId', savedSession.id);

            updateSessionDisplay();

            // Clear form and refresh list
            e.target.reset();
            loadSessionsList();
        } else {
            throw new Error('Failed to create session');
        }
    } catch (error) {
        console.error('Error creating session:', error);
        alert('Failed to create session. Please try again.');
    }
}

async function loadSessionsList() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);

        if (response.ok) {
            const sessions = await response.json();
            sessionState.sessions = sessions;
            renderSessionsList(sessions);
        } else {
            console.warn('No sessions found or error loading sessions');
            renderSessionsList([]);
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        renderSessionsList([]);
    }
}

function renderSessionsList(sessions) {
    const listContainer = document.getElementById('sessions-list');
    if (!listContainer) return;

    if (sessions.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">No sessions saved yet</div>';
        return;
    }

    listContainer.innerHTML = sessions.map(session => {
        const isActive = sessionState.currentSession && sessionState.currentSession.id === session.id;
        const encounterCount = session.encounters ? session.encounters.length : 0;
        const dateStr = new Date(session.createdAt).toLocaleDateString();

        return `
            <div class="session-card ${isActive ? 'active' : ''}" data-session-id="${session.id}">
                <div class="session-card-name">${escapeHtml(session.name)}</div>
                <div class="session-card-info">
                    ${encounterCount} encounter(s) • Created ${dateStr}
                </div>
                ${session.description ? `<div class="session-card-info">${escapeHtml(session.description)}</div>` : ''}
                <div class="session-card-actions">
                    <button class="btn btn-primary btn-small" onclick="loadSession('${session.id}')">Load</button>
                    <button class="btn btn-danger btn-small" onclick="deleteSession('${session.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadSession(sessionId) {
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}`);

        if (response.ok) {
            const session = await response.json();
            sessionState.currentSession = session;
            sessionState.encounters = session.encounters || [];

            // Save to localStorage for auto-load next time
            localStorage.setItem('lastSessionId', sessionId);

            updateSessionDisplay();
            updateEncounterDisplay();
            closeSessionModal();

            console.log('Session loaded:', session);

            // Auto-load the last encounter if one exists
            const lastEncounterId = localStorage.getItem('lastEncounterId_' + sessionId);
            if (lastEncounterId && session.encounters && session.encounters.length > 0) {
                const encounterExists = session.encounters.find(e => e.id === lastEncounterId);
                if (encounterExists) {
                    console.log('Auto-loading last encounter:', lastEncounterId);
                    loadEncounter(lastEncounterId);
                } else {
                    // Clear current encounter if the saved one doesn't exist
                    sessionState.currentEncounter = null;
                }
            } else {
                // Clear current encounter when loading a new session
                sessionState.currentEncounter = null;
            }
        } else {
            throw new Error('Failed to load session');
        }
    } catch (error) {
        console.error('Error loading session:', error);
        alert('Failed to load session. Please try again.');
    }
}
window.loadSession = loadSession;

async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // If we deleted the current session, clear it
            if (sessionState.currentSession && sessionState.currentSession.id === sessionId) {
                sessionState.currentSession = null;
                sessionState.currentEncounter = null;
                sessionState.encounters = [];
                updateSessionDisplay();
                updateEncounterDisplay();
            }

            loadSessionsList();
        } else {
            throw new Error('Failed to delete session');
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Failed to delete session. Please try again.');
    }
}
window.deleteSession = deleteSession;

function updateSessionDisplay() {
    const sessionNameEl = document.getElementById('current-session-name');

    if (sessionNameEl) {
        if (sessionState.currentSession) {
            sessionNameEl.textContent = sessionState.currentSession.name;
        } else {
            sessionNameEl.textContent = 'No Session';
        }
    }
}

// === ENCOUNTER MANAGEMENT ===

function openNewEncounterModal() {
    if (!sessionState.currentSession) {
        alert('Please create or load a session first!');
        return;
    }

    const modal = document.getElementById('encounter-modal');
    const form = document.getElementById('encounter-form');

    if (form) form.reset();
    if (modal) modal.style.display = 'flex';

    // Populate map dropdown (if we have maps loaded)
    populateMapDropdown();

    // Load encounters for current session
    renderEncountersList();
}

function openLoadEncounterModal() {
    if (!sessionState.currentSession) {
        alert('Please create or load a session first!');
        return;
    }

    openNewEncounterModal(); // Same modal, just focuses on the list
}

function closeEncounterModal() {
    const modal = document.getElementById('encounter-modal');
    if (modal) modal.style.display = 'none';
}
window.closeEncounterModal = closeEncounterModal;

async function handleCreateEncounter(e) {
    e.preventDefault();

    if (!sessionState.currentSession) {
        alert('No active session! Please create or load a session first.');
        return;
    }

    const nameInput = document.getElementById('encounter-name-input');
    const mapSelect = document.getElementById('encounter-map-select');
    const descInput = document.getElementById('encounter-description-input');

    const encounterData = {
        id: generateId(),
        name: nameInput.value,
        mapId: mapSelect.value || null,
        description: descInput.value || '',
        createdAt: new Date().toISOString(),
        combatants: [],
        roundNumber: 1,
        currentTurnIndex: 0
    };

    try {
        const sessionId = sessionState.currentSession.id;
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/encounters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(encounterData)
        });

        if (response.ok) {
            const savedEncounter = await response.json();
            console.log('Encounter created:', savedEncounter);

            // Add to session's encounters
            if (!sessionState.currentSession.encounters) {
                sessionState.currentSession.encounters = [];
            }
            sessionState.currentSession.encounters.push(savedEncounter);
            sessionState.encounters = sessionState.currentSession.encounters;

            // Set as current encounter
            sessionState.currentEncounter = savedEncounter;
            updateEncounterDisplay();

            // Clear form and refresh list
            e.target.reset();
            renderEncountersList();
        } else {
            throw new Error('Failed to create encounter');
        }
    } catch (error) {
        console.error('Error creating encounter:', error);
        alert('Failed to create encounter. Please try again.');
    }
}

function renderEncountersList() {
    const listContainer = document.getElementById('encounters-list');
    if (!listContainer) return;

    if (!sessionState.currentSession) {
        listContainer.innerHTML = '<div class="empty-state">No session loaded</div>';
        return;
    }

    const encounters = sessionState.currentSession.encounters || [];

    if (encounters.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">No encounters in this session</div>';
        return;
    }

    listContainer.innerHTML = encounters.map(encounter => {
        const isActive = sessionState.currentEncounter && sessionState.currentEncounter.id === encounter.id;
        const combatantCount = encounter.combatants ? encounter.combatants.length : 0;
        const dateStr = new Date(encounter.createdAt).toLocaleDateString();

        return `
            <div class="encounter-card ${isActive ? 'active' : ''}" data-encounter-id="${encounter.id}">
                <div class="encounter-card-name">${escapeHtml(encounter.name)}</div>
                <div class="encounter-card-info">
                    ${combatantCount} combatant(s) • Round ${encounter.roundNumber || 1}
                </div>
                <div class="encounter-card-info">Created ${dateStr}</div>
                ${encounter.description ? `<div class="encounter-card-info">${escapeHtml(encounter.description)}</div>` : ''}
                <div class="encounter-card-actions">
                    <button class="btn btn-success btn-small" onclick="loadEncounter('${encounter.id}')">Load</button>
                    <button class="btn btn-danger btn-small" onclick="deleteEncounter('${encounter.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadEncounter(encounterId) {
    if (!sessionState.currentSession) {
        alert('No active session!');
        return;
    }

    try {
        const sessionId = sessionState.currentSession.id;
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/encounters/${encounterId}`);

        if (response.ok) {
            const encounter = await response.json();
            console.log('[Session] Full encounter data received:', encounter);
            console.log('[Session] Encounter.placedEnemies:', encounter.placedEnemies);

            sessionState.currentEncounter = encounter;

            // Load encounter data into the main encounter state
            if (window.encounterState) {
                window.encounterState.combatants = encounter.combatants || [];
                window.encounterState.roundNumber = encounter.roundNumber || 1;
                window.encounterState.currentTurnIndex = encounter.currentTurnIndex || 0;

                // Re-render combatants list if the function exists
                if (typeof renderCombatantsList === 'function') {
                    renderCombatantsList();
                }

                // Sync combatants to Atlas (so enemies added in Arena show up in Atlas)
                // Retry until atlasMapState is ready
                let retryCount = 0;
                const maxRetries = 20; // Try for 2 seconds
                const syncInterval = setInterval(() => {
                    retryCount++;
                    if (window.atlasMapState) {
                        console.log('[Session] atlasMapState is ready, calling syncCombatantsToAtlas');
                        clearInterval(syncInterval);
                        syncCombatantsToAtlas();
                    } else if (retryCount >= maxRetries) {
                        console.log('[Session] atlasMapState still not ready after', retryCount * 100, 'ms');
                        clearInterval(syncInterval);
                    }
                }, 100);
            }

            // Load placed enemies into Atlas state
            const savedEnemies = encounter.placedEnemies || [];
            console.log('[Session] Loading placed enemies from encounter:', savedEnemies);

            if (window.atlasMapState && window.atlasMapState.encounter) {
                window.atlasMapState.encounter.pending = savedEnemies.map(entry => ({
                    ...entry,
                    position: entry.position ? { ...entry.position } : null
                }));
                console.log('[Session] Restored to Atlas pending array:', window.atlasMapState.encounter.pending);

                // Re-render staging list and map if the functions exist
                if (typeof renderStagedEnemiesList === 'function') {
                    renderStagedEnemiesList();
                }
                if (typeof drawAtlasEncounter === 'function') {
                    drawAtlasEncounter();
                }

                // Re-add all placed enemies to combat (DON'T do this - they're already in encounter.combatants)
                // if (savedEnemies.length > 0 && typeof addPlacedEnemyToCombat === 'function') {
                //     console.log('[Session] Re-adding placed enemies to combat...');
                //     savedEnemies.forEach(entry => {
                //         if (entry.placed) {
                //             addPlacedEnemyToCombat(entry);
                //         }
                //     });
                // }
            }

            updateEncounterDisplay();
            closeEncounterModal();

            // Save to localStorage for auto-load next time
            if (sessionState.currentSession) {
                localStorage.setItem('lastEncounterId_' + sessionState.currentSession.id, encounterId);
            }

            // Load flavor media from encounter
            if (typeof loadFlavorMediaFromEncounter === 'function') {
                loadFlavorMediaFromEncounter();
            }

            console.log('Encounter loaded:', encounter);
        } else {
            throw new Error('Failed to load encounter');
        }
    } catch (error) {
        console.error('Error loading encounter:', error);
        alert('Failed to load encounter. Please try again.');
    }
}
window.loadEncounter = loadEncounter;

async function deleteEncounter(encounterId) {
    if (!sessionState.currentSession) {
        alert('No active session!');
        return;
    }

    if (!confirm('Are you sure you want to delete this encounter? This cannot be undone.')) {
        return;
    }

    try {
        const sessionId = sessionState.currentSession.id;
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/encounters/${encounterId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Remove from session's encounters
            if (sessionState.currentSession.encounters) {
                sessionState.currentSession.encounters = sessionState.currentSession.encounters.filter(
                    e => e.id !== encounterId
                );
                sessionState.encounters = sessionState.currentSession.encounters;
            }

            // If we deleted the current encounter, clear it
            if (sessionState.currentEncounter && sessionState.currentEncounter.id === encounterId) {
                sessionState.currentEncounter = null;
                updateEncounterDisplay();

                // Clear main encounter state
                if (window.encounterState) {
                    window.encounterState.combatants = [];
                    window.encounterState.roundNumber = 1;
                    window.encounterState.currentTurnIndex = 0;

                    if (typeof renderCombatantsList === 'function') {
                        renderCombatantsList();
                    }
                }
            }

            renderEncountersList();
        } else {
            throw new Error('Failed to delete encounter');
        }
    } catch (error) {
        console.error('Error deleting encounter:', error);
        alert('Failed to delete encounter. Please try again.');
    }
}
window.deleteEncounter = deleteEncounter;

function updateEncounterDisplay() {
    const encounterNameEl = document.getElementById('current-encounter-name');

    if (encounterNameEl) {
        if (sessionState.currentEncounter) {
            encounterNameEl.textContent = sessionState.currentEncounter.name;
        } else {
            encounterNameEl.textContent = 'No Encounter';
        }
    }
}

async function saveCurrentEncounter() {
    if (!sessionState.currentSession || !sessionState.currentEncounter) {
        console.warn('No active session or encounter to save');
        return;
    }

    // Sync the main encounter state to the current encounter
    if (window.encounterState) {
        sessionState.currentEncounter.combatants = window.encounterState.combatants;
        sessionState.currentEncounter.roundNumber = window.encounterState.roundNumber;
        sessionState.currentEncounter.currentTurnIndex = window.encounterState.currentTurnIndex;
    }

    // Sync placed enemies from Atlas state
    if (window.atlasMapState && window.atlasMapState.encounter) {
        const placedEnemies = (window.atlasMapState.encounter.pending || []).map(entry => ({
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
            } : null,
            atlasTokenId: entry.id  // Link to the placed token
        }));
        sessionState.currentEncounter.placedEnemies = placedEnemies;
        console.log('[Session] Saving placed enemies to encounter:', placedEnemies);
    }

    // ALSO: Sync combatants back to placed enemies list
    // This ensures enemies added in Arena also appear in Atlas
    if (window.encounterState && window.atlasMapState) {
        syncCombatantsToAtlas();
    }

    try {
        const sessionId = sessionState.currentSession.id;
        const encounterId = sessionState.currentEncounter.id;

        const response = await fetch(`${API_BASE}/sessions/${sessionId}/encounters/${encounterId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionState.currentEncounter)
        });

        if (response.ok) {
            window.__lastEncounterSaveAt = Date.now();
            if (typeof updateSyncDebugHUD === 'function') {
                updateSyncDebugHUD('autosave');
            }
            console.log('Encounter auto-saved');
            return true;
        } else {
            console.error('Failed to auto-save encounter');
            return false;
        }
    } catch (error) {
        console.error('Error auto-saving encounter:', error);
        return false;
    }
}
window.saveCurrentEncounter = saveCurrentEncounter;

// Auto-save encounter every 30 seconds if there's an active encounter
setInterval(() => {
    if (sessionState.currentEncounter) {
        saveCurrentEncounter();
    }
}, 30000);

// === HELPER FUNCTIONS ===

function populateMapDropdown() {
    const mapSelect = document.getElementById('encounter-map-select');
    if (!mapSelect) return;

    // TODO: Fetch available maps from Atlas
    // For now, just keep the default "No Map" option
    mapSelect.innerHTML = '<option value="">No Map</option>';
}

function generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sync combatants from Arena to Atlas
// This ensures that enemies added in the Arena also appear in the Atlas pending list
function syncCombatantsToAtlas() {
    console.log('[Session] syncCombatantsToAtlas called');

    if (!window.encounterState) {
        console.log('[Session] No encounterState, skipping sync');
        return;
    }

    if (!window.atlasMapState) {
        console.log('[Session] No atlasMapState, skipping sync');
        return;
    }

    const combatants = window.encounterState.combatants || [];
    const pending = window.atlasMapState.encounter.pending || [];

    console.log('[Session] Syncing combatants to Atlas:', {
        combatantsCount: combatants.length,
        pendingCount: pending.length,
        combatants: combatants.map(c => ({ name: c.name, type: c.type, id: c.id }))
    });

    let addedCount = 0;

    // For each combatant that's an enemy/NPC (not PCs) and NOT already in pending
    combatants.forEach(combatant => {
        const t = (combatant.type || '').toLowerCase();
        // Treat enemies/monsters and NPCs as placeable on Atlas; exclude players/PCs
        const isEnemy = ['enemy', 'monster', 'e', 'npc', 'n'].includes(t);
        const isPlayer = ['player', 'pc', 'p'].includes(t);
        if (isPlayer) {
            console.log('[Session] Skipping player/PC:', combatant.name, combatant.type);
            return;
        }
        if (!isEnemy) {
            console.log('[Session] Skipping non-enemy:', combatant.name, combatant.type);
            return;
        }

        // Check if this combatant is already in the pending list
        const existingEntry = pending.find(entry => entry.atlasTokenId === combatant.id || entry.name === combatant.name);
        if (existingEntry) {
            console.log('[Session] Combatant already exists in pending:', combatant.name);
            return;  // Already exists, skip
        }

        // Add this combatant to the pending list (without a position yet - not placed on map)
        const newEntry = {
            id: combatant.atlasTokenId || `atlas-${combatant.id}`,
            name: combatant.name,
            source: combatant.sourceId ? 'library' : 'custom',
            payload: combatant.sourceId ? { id: combatant.sourceId } : null,
            placed: false,  // Not placed on map yet
            position: null,
            atlasTokenId: combatant.id
        };

        pending.push(newEntry);
        addedCount++;
        console.log('[Session] Added Arena combatant to Atlas pending:', newEntry);
    });

    console.log('[Session] Sync complete. Added', addedCount, 'new enemies to Atlas');

    // Update the pending array
    window.atlasMapState.encounter.pending = pending;

    // Re-render the staging list
    if (typeof renderStagedEnemiesList === 'function') {
        renderStagedEnemiesList();
    }
}

// Make it globally accessible
window.syncCombatantsToAtlas = syncCombatantsToAtlas;
