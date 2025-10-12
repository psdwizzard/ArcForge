// Data Manager

function initDataManager() {
    console.log('Data Manager Initialized');
    const saveBtn = document.getElementById('save-data-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveData);
    }

    const loadBtn = document.getElementById('load-data-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', loadData);
    }
}

async function saveData() {
    const data = {
        encounterState: window.encounterState,
        savedAgents: window.savedAgents,
        savedCharacters: window.savedCharacters,
        savedEffects: window.savedEffects
    };

    try {
        const response = await fetch(`${API_BASE}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            alert('Data saved successfully!');
        }
    } catch (error) {
        console.error('Error saving data:', error);
        alert('Failed to save data.');
    }
}

async function loadData() {
    try {
        const response = await fetch(`${API_BASE}/load`);
        if (response.ok) {
            const data = await response.json();
            window.encounterState = data.encounterState;
            window.savedAgents = data.savedAgents;
            window.savedCharacters = data.savedCharacters;
            window.savedEffects = data.savedEffects;

            // Re-render all the views
            renderCombatantsList();
            renderAgentsList();
            renderCharactersList();
            renderEffectsList();

            alert('Data loaded successfully!');
        } else {
            alert('No saved data found.');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data.');
    }
}

document.addEventListener('DOMContentLoaded', initDataManager);