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

        // Defense modifiers
        dodgeMod: parseInt(document.getElementById('effect-dodge-mod').value) || 0,
        parryMod: parseInt(document.getElementById('effect-parry-mod').value) || 0,
        fortitudeMod: parseInt(document.getElementById('effect-fortitude-mod').value) || 0,
        willMod: parseInt(document.getElementById('effect-will-mod').value) || 0,
        toughnessMod: parseInt(document.getElementById('effect-toughness-mod').value) || 0,

        // Conditions
        conditions: {
            bruised: parseInt(document.getElementById('effect-bruised').value) || 0,
            dazed: document.getElementById('effect-dazed').checked,
            staggered: document.getElementById('effect-staggered').checked,
            incapacitated: document.getElementById('effect-incapacitated').checked,
            dying: document.getElementById('effect-dying').checked,
            blind: document.getElementById('effect-blind').checked,
            bound: document.getElementById('effect-bound').checked,
            compelled: document.getElementById('effect-compelled').checked,
            controlled: document.getElementById('effect-controlled').checked,
            defenseless: document.getElementById('effect-defenseless').checked,
            disabled: document.getElementById('effect-disabled').checked,
            exhausted: document.getElementById('effect-exhausted').checked,
            fatigued: document.getElementById('effect-fatigued').checked,
            hindered: document.getElementById('effect-hindered').checked,
            immobile: document.getElementById('effect-immobile').checked,
            impaired: document.getElementById('effect-impaired').checked,
            prone: document.getElementById('effect-prone').checked,
            restrained: document.getElementById('effect-restrained').checked,
            stunned: document.getElementById('effect-stunned').checked,
            surprised: document.getElementById('effect-surprised').checked,
            transformed: document.getElementById('effect-transformed').checked,
            unaware: document.getElementById('effect-unaware').checked,
            vulnerable: document.getElementById('effect-vulnerable').checked,
            weakened: document.getElementById('effect-weakened').checked
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
        if (effect.attackMod && effect.attackMod !== 'none') summary.push(`Attack: ${effect.attackMod}`);
        const defMods = [];
        if (effect.dodgeMod) defMods.push(`Dodge ${effect.dodgeMod > 0 ? '+' : ''}${effect.dodgeMod}`);
        if (effect.parryMod) defMods.push(`Parry ${effect.parryMod > 0 ? '+' : ''}${effect.parryMod}`);
        if (effect.fortitudeMod) defMods.push(`Fort ${effect.fortitudeMod > 0 ? '+' : ''}${effect.fortitudeMod}`);
        if (effect.willMod) defMods.push(`Will ${effect.willMod > 0 ? '+' : ''}${effect.willMod}`);
        if (effect.toughnessMod) defMods.push(`Tough ${effect.toughnessMod > 0 ? '+' : ''}${effect.toughnessMod}`);
        if (defMods.length > 0) summary.push(defMods.join(', '));

        const activeConditions = Object.keys(effect.conditions || {}).filter(k => effect.conditions[k])
            .map(k => k === 'bruised' ? `Bruised x${effect.conditions[k]}` : k);
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

    document.getElementById('effect-dodge-mod').value = effect.dodgeMod || '';
    document.getElementById('effect-parry-mod').value = effect.parryMod || '';
    document.getElementById('effect-fortitude-mod').value = effect.fortitudeMod || '';
    document.getElementById('effect-will-mod').value = effect.willMod || '';
    document.getElementById('effect-toughness-mod').value = effect.toughnessMod || '';

    // Set conditions
    if (effect.conditions) {
        document.getElementById('effect-bruised').value = effect.conditions.bruised || 0;
        document.getElementById('effect-dazed').checked = effect.conditions.dazed || false;
        document.getElementById('effect-staggered').checked = effect.conditions.staggered || false;
        document.getElementById('effect-incapacitated').checked = effect.conditions.incapacitated || false;
        document.getElementById('effect-dying').checked = effect.conditions.dying || false;
        document.getElementById('effect-blind').checked = effect.conditions.blind || false;
        document.getElementById('effect-bound').checked = effect.conditions.bound || false;
        document.getElementById('effect-compelled').checked = effect.conditions.compelled || false;
        document.getElementById('effect-controlled').checked = effect.conditions.controlled || false;
        document.getElementById('effect-defenseless').checked = effect.conditions.defenseless || false;
        document.getElementById('effect-disabled').checked = effect.conditions.disabled || false;
        document.getElementById('effect-exhausted').checked = effect.conditions.exhausted || false;
        document.getElementById('effect-fatigued').checked = effect.conditions.fatigued || false;
        document.getElementById('effect-hindered').checked = effect.conditions.hindered || false;
        document.getElementById('effect-immobile').checked = effect.conditions.immobile || false;
        document.getElementById('effect-impaired').checked = effect.conditions.impaired || false;
        document.getElementById('effect-prone').checked = effect.conditions.prone || false;
        document.getElementById('effect-restrained').checked = effect.conditions.restrained || false;
        document.getElementById('effect-stunned').checked = effect.conditions.stunned || false;
        document.getElementById('effect-surprised').checked = effect.conditions.surprised || false;
        document.getElementById('effect-transformed').checked = effect.conditions.transformed || false;
        document.getElementById('effect-unaware').checked = effect.conditions.unaware || false;
        document.getElementById('effect-vulnerable').checked = effect.conditions.vulnerable || false;
        document.getElementById('effect-weakened').checked = effect.conditions.weakened || false;
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

    // Reset defense modifiers
    document.getElementById('effect-dodge-mod').value = '';
    document.getElementById('effect-parry-mod').value = '';
    document.getElementById('effect-fortitude-mod').value = '';
    document.getElementById('effect-will-mod').value = '';
    document.getElementById('effect-toughness-mod').value = '';

    // Reset conditions
    document.getElementById('effect-bruised').value = 0;
    document.getElementById('effect-dazed').checked = false;
    document.getElementById('effect-staggered').checked = false;
    document.getElementById('effect-incapacitated').checked = false;
    document.getElementById('effect-dying').checked = false;
    document.getElementById('effect-blind').checked = false;
    document.getElementById('effect-bound').checked = false;
    document.getElementById('effect-compelled').checked = false;
    document.getElementById('effect-controlled').checked = false;
    document.getElementById('effect-defenseless').checked = false;
    document.getElementById('effect-disabled').checked = false;
    document.getElementById('effect-exhausted').checked = false;
    document.getElementById('effect-fatigued').checked = false;
    document.getElementById('effect-hindered').checked = false;
    document.getElementById('effect-immobile').checked = false;
    document.getElementById('effect-impaired').checked = false;
    document.getElementById('effect-prone').checked = false;
    document.getElementById('effect-restrained').checked = false;
    document.getElementById('effect-stunned').checked = false;
    document.getElementById('effect-surprised').checked = false;
    document.getElementById('effect-transformed').checked = false;
    document.getElementById('effect-unaware').checked = false;
    document.getElementById('effect-vulnerable').checked = false;
    document.getElementById('effect-weakened').checked = false;
}

// Make functions globally available
window.loadEffectToForm = loadEffectToForm;
window.deleteEffect = deleteEffect;
