// Item Browser

let cachedItemData = [];
let cachedCharacterData = [];
let filteredItems = [];
let selectedItemId = null;
let cachedMonsterData = [];
let filteredMonsters = [];
let selectedMonsterId = null;
let monstersById = new Map();

const MONSTER_IMAGE_ROOT = '/data/creatures/library/';

function resolveMonsterImage(path) {
    if (!path) {
        return null;
    }
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    const normalized = path.startsWith('/') ? path.slice(1) : path;
    return `${MONSTER_IMAGE_ROOT}${encodeURI(normalized)}`;
}

function initItemBrowser() {
    const itemsTab = document.getElementById('crucible-items-btn');
    if (itemsTab) {
        itemsTab.addEventListener('click', loadItemsData);
    }

    const categorySelect = document.getElementById('item-category-filter');
    if (categorySelect) {
        categorySelect.addEventListener('change', applyItemFilters);
    }

    const searchInput = document.getElementById('item-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyItemFilters);
    }
}

async function loadItemsData() {
    await Promise.all([fetchItemsIfNeeded(), fetchCharactersIfNeeded()]);
    populateItemCategories();
    applyItemFilters();
}

async function fetchItemsIfNeeded() {
    if (cachedItemData.length > 0) {
        return;
    }

    try {
        const response = await fetch('/data/DBs/items.json');
        cachedItemData = await response.json();
    } catch (error) {
        console.error('Error loading items catalog:', error);
        cachedItemData = [];
    }
}

async function fetchCharactersIfNeeded(force = false) {
    if (cachedCharacterData.length > 0 && !force) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/characters`);
        cachedCharacterData = await response.json();
    } catch (error) {
        console.error('Error loading characters for item assignment:', error);
        cachedCharacterData = [];
    }
}

function populateItemCategories() {
    const categorySelect = document.getElementById('item-category-filter');
    if (!categorySelect) {
        return;
    }

    const categories = Array.from(new Set(cachedItemData.map(item => item.type || 'uncategorized'))).sort();
    categorySelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => `<option value="${category}">${capitalize(category)}</option>`).join('');
}

function applyItemFilters() {
    const categorySelect = document.getElementById('item-category-filter');
    const searchInput = document.getElementById('item-search-input');
    const category = categorySelect ? categorySelect.value : 'all';
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

    filteredItems = cachedItemData.filter(item => {
        const matchesCategory = category === 'all' || (item.type || 'uncategorized') === category;
        const matchesSearch = !term || item.name.toLowerCase().includes(term) || (item.system?.description?.value || '').toLowerCase().includes(term);
        return matchesCategory && matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name));

    renderItemList(filteredItems);

    if (!selectedItemId || !filteredItems.find(item => getItemId(item) === selectedItemId)) {
        selectedItemId = filteredItems.length > 0 ? getItemId(filteredItems[0]) : null;
    }

    renderItemDetail(selectedItemId ? filteredItems.find(item => getItemId(item) === selectedItemId) : null);
}

function renderItemList(items) {
    const list = document.getElementById('item-list');
    if (!list) {
        return;
    }

    list.innerHTML = '';

    if (!items || items.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 1rem;">No items found.</div>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        const itemId = getItemId(item);
        row.className = `item-row${selectedItemId === itemId ? ' active' : ''}`;
        row.dataset.itemId = itemId;

        const iconPath = getIconPath(item.img);

        row.innerHTML = `
            ${iconPath ? `<img src="${iconPath}" alt="${item.name}">` : '<div class="avatar-placeholder"></div>'}
            <div class="item-row-info">
                <h3>${item.name}</h3>
                <div class="item-row-meta">
                    <span>${capitalize(item.type || 'uncategorized')}</span>
                </div>
            </div>
            <div class="item-row-meta" style="text-align: right;">
                <span>Price: ${formatPrice(item.system?.price)}</span>
                <span>Weight: ${formatWeight(item.system?.weight)}</span>
            </div>
        `;

        row.addEventListener('click', () => {
            selectedItemId = itemId;
            document.querySelectorAll('.item-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            renderItemDetail(item);
        });

        list.appendChild(row);
    });
}

function renderItemDetail(item) {
    const detail = document.getElementById('item-detail');
    if (!detail) {
        return;
    }

    if (!item) {
        detail.innerHTML = '<div class="item-detail-empty">Select an item to view details.</div>';
        return;
    }

    const iconPath = getIconPath(item.img);

    detail.innerHTML = `
        <div class="item-detail-header">
            ${iconPath ? `<img src="${iconPath}" alt="${item.name}">` : ''}
            <div>
                <h2>${item.name}</h2>
                <div class="item-detail-meta">
                    <span>${capitalize(item.type || 'uncategorized')}</span>
                    <span>Price: ${formatPrice(item.system?.price)}</span>
                    <span>Weight: ${formatWeight(item.system?.weight)}</span>
                </div>
            </div>
        </div>
        <div class="item-detail-actions">
            <label for="item-owner-select">Assign to:</label>
            <select id="item-owner-select" class="form-input"></select>
            <button class="btn btn-primary" id="assign-item-btn">Add to Inventory</button>
        </div>
        <div class="item-detail-description">${item.system?.description?.value || '<p>No description provided.</p>'}</div>
    `;

    populateOwnerDropdown();

    const assignBtn = document.getElementById('assign-item-btn');
    if (assignBtn) {
        assignBtn.addEventListener('click', () => assignItemToOwner(item));
    }
}

function populateOwnerDropdown() {
    const select = document.getElementById('item-owner-select');
    if (!select) {
        return;
    }

    if (!cachedCharacterData || cachedCharacterData.length === 0) {
        select.innerHTML = '<option value="">No characters available</option>';
        select.disabled = true;
        return;
    }

    select.disabled = false;
    const sorted = [...cachedCharacterData].sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = '<option value="">Select character...</option>' + sorted.map(char => `<option value="${char.id}">${char.name} (${formatAgentType(char.agentType)})</option>`).join('');
}

async function assignItemToOwner(item) {
    const select = document.getElementById('item-owner-select');
    if (!select || !select.value) {
        alert('Select a character or enemy to assign this item.');
        return;
    }

    await fetchCharactersIfNeeded(true);
    const character = cachedCharacterData.find(char => char.id === select.value);
    if (!character) {
        alert('Character not found.');
        return;
    }

    if (!character.inventory) {
        character.inventory = [];
    }

    character.inventory.push({
        id: getItemId(item),
        name: item.name,
        type: item.type,
        price: item.system?.price ?? null,
        weight: item.system?.weight ?? null
    });

    try {
        const response = await fetch(`${API_BASE}/characters`, {
            method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(character)
        });

        if (response.ok) {
            await fetchCharactersIfNeeded(true);
            alert(`${item.name} added to ${character.name}'s inventory.`);
        } else {
            alert('Failed to assign item.');
        }
    } catch (error) {
        console.error('Error assigning item:', error);
        alert('Error assigning item. Check console for details.');
    }
}

function getItemId(item) {
    return item._id || item.system?.identifier || item.name;
}

function getIconPath(img) {
    const candidate = img || '';
    if (!candidate) {
        return null;
    }
    if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
        return candidate;
    }
    const normalized = candidate.startsWith('/') ? candidate.slice(1) : candidate;
    return `/data/DBs/${encodeURI(normalized)}`;
}

function formatPrice(price) {
    if (!price) {
        return '-';
    }
    const value = price.value ?? '-';
    const denom = price.denomination ?? '';
    return `${value} ${denom}`.trim();
}

function formatWeight(weight) {
    if (!weight) {
        return '-';
    }
    const value = weight.value ?? '-';
    const units = weight.units ?? '';
    return `${value} ${units}`.trim();
}

function formatAgentType(agentType) {
    const map = {
        'p': 'Player',
        'player': 'Player',
        'n': 'NPC',
        'npc': 'NPC',
        'e': 'Enemy',
        'enemy': 'Enemy'
    };
    return map[agentType] || 'Character';
}

function capitalize(value) {
    if (!value) {
        return '';
    }
    return value.charAt(0).toUpperCase() + value.slice(1);
}

document.addEventListener('DOMContentLoaded', () => {
    initItemBrowser();
    initMonsterLibrary();
});

// Monster Library

function initMonsterLibrary() {
    const monstersTab = document.getElementById('crucible-monsters-btn');
    if (monstersTab) {
        monstersTab.addEventListener('click', loadMonstersData);
    }

    const categorySelect = document.getElementById('monster-category-filter');
    if (categorySelect) {
        categorySelect.addEventListener('change', applyMonsterFilters);
    }

    const searchInput = document.getElementById('monster-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', applyMonsterFilters);
    }
}

async function loadMonstersData() {
    await Promise.all([fetchMonstersIfNeeded(), fetchCharactersIfNeeded(true)]);
    populateMonsterCategories();
    applyMonsterFilters();
}

async function fetchMonstersIfNeeded(force = false) {
    if (cachedMonsterData.length > 0 && !force) {
        return;
    }

    try {
        const response = await fetch('/data/creatures/library/monsters_clean_with_images.json');
        const rawMonsters = await response.json();
        if (!Array.isArray(rawMonsters)) {
            console.error('[MonsterLibrary] Unexpected monster JSON format:', rawMonsters);
            cachedMonsterData = [];
            monstersById = new Map();
            return;
        }
        console.log('[MonsterLibrary] Loaded raw monsters:', rawMonsters.length, rawMonsters[0]);
        cachedMonsterData = rawMonsters.map(normalizeMonsterData);
        console.log('[MonsterLibrary] Normalized monsters:', cachedMonsterData.length, cachedMonsterData[0]);
        monstersById = new Map(cachedMonsterData.map(monster => [monster.id, monster]));
    } catch (error) {
        console.error('Error loading monster library:', error);
        cachedMonsterData = [];
        monstersById = new Map();
    }
}

function populateMonsterCategories() {
    const categorySelect = document.getElementById('monster-category-filter');
    if (!categorySelect) {
        return;
    }

    const categories = Array.from(new Set(cachedMonsterData.map(monster => monster.type || 'Unknown'))).sort();
    categorySelect.innerHTML = '<option value="all">All Types</option>' + categories.map(category => `<option value="${category}">${capitalize(category)}</option>`).join('');
}

function applyMonsterFilters() {
    const categorySelect = document.getElementById('monster-category-filter');
    const searchInput = document.getElementById('monster-search-input');
    const category = categorySelect ? categorySelect.value : 'all';
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

    filteredMonsters = cachedMonsterData.filter(monster => {
        const matchesCategory = category === 'all' || (monster.type || 'Unknown') === category;
        const matchesSearch =
            !term ||
            monster.name.toLowerCase().includes(term) ||
            (monster.environment && monster.environment.toLowerCase().includes(term)) ||
            (monster.alignment && monster.alignment.toLowerCase().includes(term));
        return matchesCategory && matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name));

    renderMonsterList(filteredMonsters);

    if (!selectedMonsterId || !filteredMonsters.find(monster => monster.id === selectedMonsterId)) {
        selectedMonsterId = filteredMonsters.length > 0 ? filteredMonsters[0].id : null;
    }

    renderMonsterDetail(selectedMonsterId ? monstersById.get(selectedMonsterId) : null);
}

function renderMonsterList(monsters) {
    const list = document.getElementById('monster-list');
    if (!list) {
        return;
    }

    list.innerHTML = '';

    if (!monsters || monsters.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 1rem;">No monsters found.</div>';
        return;
    }

    monsters.forEach(monster => {
        const row = document.createElement('div');
        const monsterId = monster.id;
        row.className = `monster-row${selectedMonsterId === monsterId ? ' active' : ''}`;
        row.dataset.monsterId = monsterId;

        const iconPath = resolveMonsterImage(monster.tokenImage);

        row.innerHTML = `
            ${iconPath ? `<img src="${iconPath}" alt="${monster.name}">` : '<div class="avatar-placeholder">??</div>'}
            <div class="monster-row-info">
                <h3>${monster.name}</h3>
                <div class="monster-row-meta">
                    <span>${capitalize(monster.type || 'Unknown')}</span>
                </div>
            </div>
            <div class="monster-row-meta" style="text-align: right;">
                <span>CR: ${monster.crText}</span>
                <span>HP: ${monster.hp ?? '—'}</span>
            </div>
        `;

        row.addEventListener('click', () => {
            selectedMonsterId = monsterId;
            document.querySelectorAll('.monster-row').forEach(r => r.classList.remove('active'));
            row.classList.add('active');
            renderMonsterDetail(monster);
        });

        list.appendChild(row);
    });
}

function renderMonsterDetail(monster) {
    const detail = document.getElementById('monster-detail');
    if (!detail) {
        return;
    }

    if (!monster) {
        detail.innerHTML = '<div class="monster-detail-empty">Select a monster to view details.</div>';
        return;
    }

    const portraitPath = resolveMonsterImage(monster.portraitImage || monster.tokenImage);

    detail.innerHTML = `
        <div class="monster-detail-header">
            ${portraitPath ? `<img src="${portraitPath}" alt="${monster.name}">` : ''}
            <div>
                <h2>${monster.name}</h2>
                <div class="monster-detail-meta">
                    <span>Type: ${capitalize(monster.type || 'Unknown')}</span>
                    <span>Size: ${monster.size || '—'}</span>
                    <span>Alignment: ${monster.alignment || '—'}</span>
                    <span>CR: ${monster.crText}</span>
                    ${monster.xp ? `<span>XP: ${monster.xp}</span>` : ''}
                    ${monster.environment ? `<span>Environment: ${monster.environment}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="monster-detail-actions">
            <button class="btn btn-primary" id="add-monster-to-combat-btn">Add to Combat</button>
        </div>
        <div class="monster-detail-stats">
            ${renderMonsterStatCard('HP', monster.hp ? `${monster.hp} (${monster.hpFormula || '—'})` : '—')}
            ${renderMonsterStatCard('AC', monster.ac ? `${monster.ac}${monster.acType ? ` (${monster.acType})` : ''}` : '—')}
            ${renderMonsterStatCard('Speed', monster.speedText || '—')}
            ${renderMonsterStatCard('STR', monster.abilities.str ?? '—')}
            ${renderMonsterStatCard('DEX', monster.abilities.dex ?? '—')}
            ${renderMonsterStatCard('CON', monster.abilities.con ?? '—')}
            ${renderMonsterStatCard('INT', monster.abilities.int ?? '—')}
            ${renderMonsterStatCard('WIS', monster.abilities.wis ?? '—')}
            ${renderMonsterStatCard('CHA', monster.abilities.cha ?? '—')}
        </div>
        <div class="monster-detail-info">
            ${renderDetailRow('Saving Throws', monster.savesText)}
            ${renderDetailRow('Skills', monster.skillsText)}
            ${renderDetailRow('Senses', monster.sensesText)}
            ${renderDetailRow('Damage Resistances', monster.resistancesText)}
            ${renderDetailRow('Damage Immunities', monster.immunitiesText)}
            ${renderDetailRow('Damage Vulnerabilities', monster.vulnerabilitiesText)}
            ${renderDetailRow('Condition Immunities', monster.conditionImmunitiesText)}
            ${renderDetailRow('Languages', monster.languagesText)}
            ${monster.telepathy ? renderDetailRow('Telepathy', monster.telepathy) : ''}
        </div>
        ${renderAbilitySections(monster)}
    `;

    const addBtn = document.getElementById('add-monster-to-combat-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addMonsterToCombat(monster));
    }
}

function renderMonsterStatCard(label, value) {
    return `
        <div class="monster-stat-card">
            <div class="monster-stat-label">${label}</div>
            <div class="monster-stat-value">${value}</div>
        </div>
    `;
}

function renderDetailRow(label, value) {
    if (!value || value === '—') {
        return '';
    }
    return `
        <div class="monster-detail-row">
            <span class="monster-detail-row-label">${label}:</span>
            <span class="monster-detail-row-value">${value}</span>
        </div>
    `;
}

function renderAbilitySections(monster) {
    const sections = [];

    if (monster.traits.length > 0) {
        sections.push(renderAbilitySection('Traits', monster.traits));
    }
    if (monster.actions.length > 0) {
        sections.push(renderAbilitySection('Actions', monster.actions));
    }
    if (monster.bonusActions.length > 0) {
        sections.push(renderAbilitySection('Bonus Actions', monster.bonusActions));
    }
    if (monster.reactions.length > 0) {
        sections.push(renderAbilitySection('Reactions', monster.reactions));
    }
    if (monster.legendaryActions.length > 0) {
        sections.push(renderAbilitySection('Legendary Actions', monster.legendaryActions));
    }

    return sections.join('');
}

function renderAbilitySection(title, abilities) {
    return `
        <div class="monster-ability-section">
            <h3>${title}</h3>
            ${abilities.map(ability => {
                const abilityIcon = resolveMonsterImage(ability.icon);
                return `
                <div class="monster-ability">
                    <div class="monster-ability-header">
                        ${abilityIcon ? `<img src="${abilityIcon}" alt="${ability.name}">` : ''}
                        <h4>${ability.name}</h4>
                    </div>
                    <div class="monster-ability-description">${ability.description}</div>
                </div>
            `;}).join('')}
        </div>
    `;
}

async function addMonsterToCombat(monster) {
    try {
        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: monster.name,
                type: 'enemy',
                hp: monster.hp ?? 0,
                ac: monster.ac ?? 10,
                dexModifier: modifierFromScore(monster.abilities.dex ?? 10),
                imagePath: resolveMonsterImage(monster.tokenImage),
                sourceId: monster.id
            })
        });

        if (response.ok) {
            alert(`${monster.name} added to combat.`);
        } else {
            alert('Failed to add monster to combat.');
        }
    } catch (error) {
        console.error('Error adding monster to combat:', error);
        alert('Error adding monster to combat. Check console for details.');
    }
}

function modifierFromScore(score) {
    return Math.floor((score - 10) / 2);
}

function normalizeMonsterData(raw) {
    const parseList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
        return String(value)
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean);
    };

    const formatSpeed = () => {
        const segments = [];
        if (raw.speed_walk) segments.push(`Walk ${raw.speed_walk} ft.`);
        if (raw.speed_fly) segments.push(`Fly ${raw.speed_fly} ft.${raw.can_hover ? ' (hover)' : ''}`);
        if (raw.speed_swim) segments.push(`Swim ${raw.speed_swim} ft.`);
        if (raw.speed_climb) segments.push(`Climb ${raw.speed_climb} ft.`);
        if (raw.speed_burrow) segments.push(`Burrow ${raw.speed_burrow} ft.`);
        return segments.join(', ');
    };

    const formatSenses = () => {
        const segments = [];
        if (raw.darkvision) segments.push(`Darkvision ${raw.darkvision} ft.`);
        if (raw.blindsight) segments.push(`Blindsight ${raw.blindsight} ft.`);
        if (raw.tremorsense) segments.push(`Tremorsense ${raw.tremorsense} ft.`);
        if (raw.truesight) segments.push(`Truesight ${raw.truesight} ft.`);
        if (raw.special_senses) segments.push(raw.special_senses);
        return segments.join(', ');
    };

    const crText = formatChallengeRating(raw.cr);

    const abilities = categorizeMonsterAbilities(raw.items || []);

    return {
        id: raw.id || raw._id || raw.name,
        name: raw.name,
        type: raw.type,
        size: raw.size,
        alignment: raw.alignment,
        environment: raw.environment,
        cr: raw.cr,
        crText,
        xp: raw.xp,
        hp: raw.hp,
        hpFormula: raw.hp_formula,
        ac: raw.ac,
        acType: raw.ac_type,
        speedText: formatSpeed(),
        abilities: {
            str: raw.str,
            dex: raw.dex,
            con: raw.con,
            int: raw.int,
            wis: raw.wis,
            cha: raw.cha
        },
        sensesText: formatSenses() || '—',
        skillsText: parseList(raw.skills).map(formatSkillName).join(', ') || '—',
        savesText: parseList(raw.saves).map(formatSaveName).join(', ') || '—',
        resistancesText: parseList(raw.damage_resistances).join(', ') || '—',
        immunitiesText: parseList(raw.damage_immunities).join(', ') || '—',
        vulnerabilitiesText: parseList(raw.damage_vulnerabilities).join(', ') || '—',
        conditionImmunitiesText: parseList(raw.condition_immunities).join(', ') || '—',
        languagesText: parseList(raw.languages).join(', ') || '—',
        telepathy: raw.telepathy,
        tokenImage: raw.token_image,
        portraitImage: raw.portrait_image,
        traits: abilities.traits,
        actions: abilities.actions,
        bonusActions: abilities.bonusActions,
        reactions: abilities.reactions,
        legendaryActions: abilities.legendaryActions,
        raw
    };
}

function categorizeMonsterAbilities(items) {
    const result = {
        traits: [],
        actions: [],
        bonusActions: [],
        reactions: [],
        legendaryActions: []
    };

    items.forEach(item => {
        if (!item) return;
        const description = item.system?.description?.value || '';
        const ability = {
            name: item.name,
            description,
            icon: item.img
        };

        const activities = Object.values(item.system?.activities || {});
        const activationTypes = new Set(activities.map(activity => activity.activation?.type).filter(Boolean));

        if (activationTypes.has('legendary')) {
            result.legendaryActions.push(ability);
        } else if (activationTypes.has('reaction')) {
            result.reactions.push(ability);
        } else if (activationTypes.has('bonus') || activationTypes.has('bonusAction')) {
            result.bonusActions.push(ability);
        } else if (activationTypes.has('action') || activationTypes.has('attack')) {
            result.actions.push(ability);
        } else {
            result.traits.push(ability);
        }
    });

    return result;
}

function formatChallengeRating(cr) {
    if (cr === null || cr === undefined) return '—';
    const map = {
        0: '0',
        0.125: '1/8',
        0.25: '1/4',
        0.5: '1/2'
    };
    return map[cr] || cr;
}

function formatSkillName(code) {
    const SKILL_MAP = {
        acr: 'Acrobatics',
        ani: 'Animal Handling',
        arc: 'Arcana',
        ath: 'Athletics',
        dec: 'Deception',
        his: 'History',
        ins: 'Insight',
        itm: 'Intimidation',
        inv: 'Investigation',
        med: 'Medicine',
        nat: 'Nature',
        prc: 'Perception',
        prf: 'Performance',
        per: 'Persuasion',
        rel: 'Religion',
        slt: 'Sleight of Hand',
        ste: 'Stealth',
        surv: 'Survival'
    };
    const clean = code.toLowerCase().replace(/[^a-z]/g, '').slice(0, 3);
    return SKILL_MAP[clean] || code;
}

function formatSaveName(name) {
    const clean = name.toUpperCase();
    return clean;
}