// Current effect state
let currentEffect = null;
let savedEffects = [];
window.savedEffects = savedEffects;

// Initialize effects builder
function initEffectsBuilder() {
    attachEffectsBuilderListeners();
    loadSavedEffects();
    window.renderEffectsList = renderEffectsList;
}

// Attach event listeners for effects builder
function attachEffectsBuilderListeners() {
    // Navigation
    const effectsNavBtn = document.getElementById('nav-effects-btn');
    if (effectsNavBtn) {
        effectsNavBtn.addEventListener('click', () => switchView('effects'));
    }

    const lootNavBtn = document.getElementById('nav-loot-btn');
    if (lootNavBtn) {
        lootNavBtn.addEventListener('click', () => switchView('loot'));
    }

    // Effects form submission
    document.getElementById('effects-form').addEventListener('submit', handleSaveEffect);

    // Clear form button
    document.getElementById('clear-effect-btn').addEventListener('click', clearEffectsForm);
}

// Switch between views (extend existing function)
const originalSwitchView = typeof switchView !== 'undefined' ? switchView : null;
function switchView(view) {
    const combatView = document.getElementById('combat-view');
    const characterView = document.getElementById('character-view');
    const effectsView = document.getElementById('effects-view');
    const lootView = document.getElementById('loot-view');
    const combatBtn = document.getElementById('nav-combat-btn');
    const charactersBtn = document.getElementById('nav-characters-btn');
    const effectsBtn = document.getElementById('nav-effects-btn');
    const lootBtn = document.getElementById('nav-loot-btn');

    // Hide all views
    combatView.style.display = 'none';
    characterView.style.display = 'none';
    effectsView.style.display = 'none';
    lootView.style.display = 'none';

    // Remove all active classes
    combatBtn.classList.remove('active');
    charactersBtn.classList.remove('active');
    effectsBtn.classList.remove('active');
    lootBtn.classList.remove('active');

    // Show selected view
    if (view === 'combat') {
        combatView.style.display = 'grid';
        combatBtn.classList.add('active');
    } else if (view === 'characters') {
        characterView.style.display = 'block';
        charactersBtn.classList.add('active');
    } else if (view === 'effects') {
        effectsView.style.display = 'block';
        effectsBtn.classList.add('active');
    } else if (view === 'loot') {
        lootView.style.display = 'block';
        lootBtn.classList.add('active');
    }
}

// Make switchView available globally if it wasn't before
if (typeof window.switchView === 'undefined') {
    window.switchView = switchView;
}

// Handle save effect
async function handleSaveEffect(e) {
    e.preventDefault();

    // Get all form values
    const effect = {
        id: currentEffect?.id || `effect-${Date.now()}`,
        name: document.getElementById('effect-name').value,
        duration: parseInt(document.getElementById('effect-duration').value),
        description: document.getElementById('effect-description').value,

        // HP changes
        hpChange: parseInt(document.getElementById('effect-hp-change').value) || 0,
        hpTiming: document.getElementById('effect-hp-timing').value,

        // Roll modifiers
        attackMod: document.getElementById('effect-attack-mod').value,
        attackValue: parseInt(document.getElementById('effect-attack-value').value) || 0,
        saveMod: document.getElementById('effect-save-mod').value,
        saveValue: parseInt(document.getElementById('effect-save-value').value) || 0,
        abilityMod: document.getElementById('effect-ability-mod').value,
        abilityValue: parseInt(document.getElementById('effect-ability-value').value) || 0,

        // Stat modifiers
        acMod: parseInt(document.getElementById('effect-ac-mod').value) || 0,
        speedMod: parseInt(document.getElementById('effect-speed-mod').value) || 0,

        // Conditions
        conditions: {
            incapacitated: document.getElementById('effect-incapacitated').checked,
            unconscious: document.getElementById('effect-unconscious').checked,
            stunned: document.getElementById('effect-stunned').checked,
            paralyzed: document.getElementById('effect-paralyzed').checked,
            restrained: document.getElementById('effect-restrained').checked,
            blinded: document.getElementById('effect-blinded').checked,
            deafened: document.getElementById('effect-deafened').checked,
            invisible: document.getElementById('effect-invisible').checked
        }
    };

    try {
        const response = await fetch(`${API_BASE}/effects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(effect)
        });

        if (response.ok) {
            alert(`Effect "${effect.name}" saved successfully!`);
            await loadSavedEffects();
            clearEffectsForm();
            if (typeof window.reloadEffectsData === 'function') {
                window.reloadEffectsData();
            }
        }
    } catch (error) {
        console.error('Error saving effect:', error);
        alert('Failed to save effect');
    }
}

// Load saved effects
async function loadSavedEffects() {
    try {
        const response = await fetch(`${API_BASE}/effects`);
        savedEffects = await response.json();
        renderEffectsList();
    } catch (error) {
        console.error('Error loading effects:', error);
    }
}

// Render effects list
function renderEffectsList() {
    const container = document.getElementById('effects-list');

    if (savedEffects.length === 0) {
        container.innerHTML = '<div class="empty-state">No effects created yet</div>';
        return;
    }

    container.innerHTML = '';

    savedEffects.forEach(effect => {
        const card = document.createElement('div');
        card.className = 'effect-card';

        // Build effect summary
        let summary = [];
        if (effect.duration) summary.push(`Duration: ${effect.duration} rounds`);
        if (effect.hpChange !== 0) {
            const hpText = effect.hpChange > 0 ? `+${effect.hpChange} HP` : `${effect.hpChange} HP`;
            summary.push(`${hpText} per ${effect.hpTiming}`);
        }
        if (effect.acMod !== 0) summary.push(`AC ${effect.acMod > 0 ? '+' : ''}${effect.acMod}`);
        if (effect.attackMod && effect.attackMod !== 'none') summary.push(`Attack: ${effect.attackMod}`);

        const activeConditions = Object.keys(effect.conditions || {}).filter(k => effect.conditions[k]);
        if (activeConditions.length > 0) {
            summary.push(`Conditions: ${activeConditions.join(', ')}`);
        }

        card.innerHTML = `
            <div class="effect-card-name">${effect.name}</div>
            <div class="effect-card-info">${effect.description || 'No description'}</div>
            <div class="effect-card-info">${summary.join(' | ')}</div>
            <div class="effect-card-actions">
                <button class="btn btn-small btn-secondary" onclick="loadEffectToForm('${effect.id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteEffect('${effect.id}')">Delete</button>
            </div>
        `;

        container.appendChild(card);
    });
}

// Load effect into form for editing
async function loadEffectToForm(effectId) {
    const effect = savedEffects.find(e => e.id === effectId);
    if (!effect) return;

    currentEffect = effect;

    document.getElementById('effect-name').value = effect.name;
    document.getElementById('effect-duration').value = effect.duration;
    document.getElementById('effect-description').value = effect.description || '';

    document.getElementById('effect-hp-change').value = effect.hpChange || '';
    document.getElementById('effect-hp-timing').value = effect.hpTiming;

    document.getElementById('effect-attack-mod').value = effect.attackMod;
    document.getElementById('effect-attack-value').value = effect.attackValue || '';
    document.getElementById('effect-save-mod').value = effect.saveMod;
    document.getElementById('effect-save-value').value = effect.saveValue || '';
    document.getElementById('effect-ability-mod').value = effect.abilityMod;
    document.getElementById('effect-ability-value').value = effect.abilityValue || '';

    document.getElementById('effect-ac-mod').value = effect.acMod || '';
    document.getElementById('effect-speed-mod').value = effect.speedMod || '';

    // Set conditions
    if (effect.conditions) {
        document.getElementById('effect-incapacitated').checked = effect.conditions.incapacitated || false;
        document.getElementById('effect-unconscious').checked = effect.conditions.unconscious || false;
        document.getElementById('effect-stunned').checked = effect.conditions.stunned || false;
        document.getElementById('effect-paralyzed').checked = effect.conditions.paralyzed || false;
        document.getElementById('effect-restrained').checked = effect.conditions.restrained || false;
        document.getElementById('effect-blinded').checked = effect.conditions.blinded || false;
        document.getElementById('effect-deafened').checked = effect.conditions.deafened || false;
        document.getElementById('effect-invisible').checked = effect.conditions.invisible || false;
    }

    // Scroll to top of form
    document.querySelector('.effects-form-section').scrollTop = 0;
}

// Delete effect
async function deleteEffect(effectId) {
    const effect = savedEffects.find(e => e.id === effectId);
    if (!effect) return;

    const confirmed = confirm(`Delete effect "${effect.name}"?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`${API_BASE}/effects/${effectId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadSavedEffects();
        }
    } catch (error) {
        console.error('Error deleting effect:', error);
        alert('Failed to delete effect');
    }
}

// Clear effects form
function clearEffectsForm() {
    currentEffect = null;
    document.getElementById('effects-form').reset();

    // Reset to default values
    document.getElementById('effect-duration').value = 1;
    document.getElementById('effect-hp-timing').value = 'start';
    document.getElementById('effect-attack-mod').value = 'none';
    document.getElementById('effect-save-mod').value = 'none';
    document.getElementById('effect-ability-mod').value = 'none';

    // Uncheck all conditions
    document.getElementById('effect-incapacitated').checked = false;
    document.getElementById('effect-unconscious').checked = false;
    document.getElementById('effect-stunned').checked = false;
    document.getElementById('effect-paralyzed').checked = false;
    document.getElementById('effect-restrained').checked = false;
    document.getElementById('effect-blinded').checked = false;
    document.getElementById('effect-deafened').checked = false;
    document.getElementById('effect-invisible').checked = false;
}

// Make functions globally available
window.loadEffectToForm = loadEffectToForm;
window.deleteEffect = deleteEffect;
