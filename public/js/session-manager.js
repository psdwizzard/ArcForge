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
            updateSessionDisplay();

            // Clear form and refresh list
            e.target.reset();
            loadSessionsList();

            alert(`Session "${sessionData.name}" created successfully!`);
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

            // Clear current encounter when loading a new session
            sessionState.currentEncounter = null;

            updateSessionDisplay();
            updateEncounterDisplay();
            closeSessionModal();

            console.log('Session loaded:', session);
            alert(`Session "${session.name}" loaded!`);
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
            alert('Session deleted successfully.');
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

            alert(`Encounter "${encounterData.name}" created successfully!`);
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
            }

            updateEncounterDisplay();
            closeEncounterModal();

            console.log('Encounter loaded:', encounter);
            alert(`Encounter "${encounter.name}" loaded!`);
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
            alert('Encounter deleted successfully.');
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

    try {
        const sessionId = sessionState.currentSession.id;
        const encounterId = sessionState.currentEncounter.id;

        const response = await fetch(`${API_BASE}/sessions/${sessionId}/encounters/${encounterId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionState.currentEncounter)
        });

        if (response.ok) {
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
