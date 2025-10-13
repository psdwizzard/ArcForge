// Item Browser

let cachedItemData = [];
let cachedCharacterData = [];
let filteredItems = [];
let selectedItemId = null;

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

async function fetchCharactersIfNeeded() {
    if (cachedCharacterData.length > 0) {
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
    if (!img) {
        return null;
    }
    const normalized = img.startsWith('/') ? img.slice(1) : img;
    return `/data/DBs/${normalized}`;
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
});