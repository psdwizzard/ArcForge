// Item Browser

let cachedItemData = [];
let cachedCharacterData = [];
let filteredItems = [];
let selectedItemId = null;
let cachedMonsterData = [];
let filteredMonsters = [];
let selectedMonsterId = null;

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
        const response = await fetch('/data/DBs/monsters.json');
        cachedMonsterData = await response.json();
    } catch (error) {
        console.error('Error loading monster library:', error);
        cachedMonsterData = [];
    }
}

function populateMonsterCategories() {
    const categorySelect = document.getElementById('monster-category-filter');
    if (!categorySelect) {
        return;
    }

    const categories = Array.from(new Set(cachedMonsterData.map(monster => monster.type || 'npc'))).sort();
    categorySelect.innerHTML = '<option value="all">All Types</option>' + categories.map(category => `<option value="${category}">${capitalize(category)}</option>`).join('');
}

function applyMonsterFilters() {
    const categorySelect = document.getElementById('monster-category-filter');
    const searchInput = document.getElementById('monster-search-input');
    const category = categorySelect ? categorySelect.value : 'all';
    const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

    filteredMonsters = cachedMonsterData.filter(monster => {
        const matchesCategory = category === 'all' || (monster.type || 'npc') === category;
        const matchesSearch = !term || monster.name.toLowerCase().includes(term) || (monster.system?.details?.type?.value || '').toLowerCase().includes(term);
        return matchesCategory && matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name));

    renderMonsterList(filteredMonsters);

    if (!selectedMonsterId || !filteredMonsters.find(monster => getItemId(monster) === selectedMonsterId)) {
        selectedMonsterId = filteredMonsters.length > 0 ? getItemId(filteredMonsters[0]) : null;
    }

    renderMonsterDetail(selectedMonsterId ? filteredMonsters.find(monster => getItemId(monster) === selectedMonsterId) : null);
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
        const monsterId = getItemId(monster);
        row.className = `monster-row${selectedMonsterId === monsterId ? ' active' : ''}`;
        row.dataset.monsterId = monsterId;

        const iconPath = getIconPath(monster.img);

        row.innerHTML = `
            ${iconPath ? `<img src="${iconPath}" alt="${monster.name}">` : '<div class="avatar-placeholder">??</div>'}
            <div class="monster-row-info">
                <h3>${monster.name}</h3>
                <div class="monster-row-meta">
                    <span>${capitalize(monster.system?.details?.type?.value || monster.type || 'npc')}</span>
                </div>
            </div>
            <div class="monster-row-meta" style="text-align: right;">
                <span>CR: ${monster.system?.details?.cr ?? '—'}</span>
                <span>HP: ${monster.system?.attributes?.hp?.max ?? '—'}</span>
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

    const iconPath = getIconPath(monster.img);

    detail.innerHTML = `
        <div class="monster-detail-header">
            ${iconPath ? `<img src="${iconPath}" alt="${monster.name}">` : ''}
            <div>
                <h2>${monster.name}</h2>
                <div class="monster-detail-meta">
                    <span>Type: ${capitalize(monster.system?.details?.type?.value || monster.type || 'npc')}</span>
                    <span>CR: ${monster.system?.details?.cr ?? '—'}</span>
                    <span>Alignment: ${monster.system?.details?.alignment ?? '—'}</span>
                </div>
            </div>
        </div>
        <div class="monster-detail-actions">
            <button class="btn btn-primary" id="add-monster-to-combat-btn">Add to Combat</button>
        </div>
        <div class="monster-detail-stats">
            ${renderMonsterStats(monster)}
        </div>
        <div class="monster-detail-description">${monster.system?.details?.biography?.value || '<p>No description provided.</p>'}</div>
    `;

    const addBtn = document.getElementById('add-monster-to-combat-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addMonsterToCombat(monster));
    }
}

function renderMonsterStats(monster) {
    const stats = [
        { label: 'HP', value: `${monster.system?.attributes?.hp?.max ?? '—'} (AC ${monster.system?.attributes?.ac?.value ?? '—'})` },
        { label: 'Speed', value: monster.system?.attributes?.movement?.walk ?? '—' },
        { label: 'STR', value: monster.system?.abilities?.str?.value ?? '—' },
        { label: 'DEX', value: monster.system?.abilities?.dex?.value ?? '—' },
        { label: 'CON', value: monster.system?.abilities?.con?.value ?? '—' },
        { label: 'INT', value: monster.system?.abilities?.int?.value ?? '—' },
        { label: 'WIS', value: monster.system?.abilities?.wis?.value ?? '—' },
        { label: 'CHA', value: monster.system?.abilities?.cha?.value ?? '—' }
    ];

    return stats.map(stat => `
        <div class="monster-stat-card">
            <div class="monster-stat-label">${stat.label}</div>
            <div class="monster-stat-value">${stat.value}</div>
        </div>
    `).join('');
}

async function addMonsterToCombat(monster) {
    try {
        const response = await fetch(`${API_BASE}/combatants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: monster.name,
                type: 'enemy',
                hp: monster.system?.attributes?.hp?.max ?? 0,
                ac: monster.system?.attributes?.ac?.value ?? 10,
                dexModifier: modifierFromScore(monster.system?.abilities?.dex?.value ?? 10),
                imagePath: null
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