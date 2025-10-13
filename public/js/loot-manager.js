// Item Browser

let cachedItemData = [];
let filteredItems = [];

function initItemBrowser() {
    const itemsTab = document.getElementById('crucible-items-btn');
    if (itemsTab) {
        itemsTab.addEventListener('click', loadItemsData);
    }

    const categorySelect = document.getElementById('item-category-filter');
    if (categorySelect) {
        categorySelect.addEventListener('change', handleCategoryChange);
    }
}

async function loadItemsData() {
    if (cachedItemData.length === 0) {
        try {
            const response = await fetch('data/DBs/items.json');
            cachedItemData = await response.json();
        } catch (error) {
            console.error('Error loading items catalog:', error);
            renderItems([]);
            return;
        }
    }

    populateItemCategories();
    handleCategoryChange();
}

function populateItemCategories() {
    const categorySelect = document.getElementById('item-category-filter');
    if (!categorySelect) {
        return;
    }

    const categories = Array.from(new Set(cachedItemData.map(item => item.type || 'Uncategorized'))).sort();
    categorySelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => `<option value="${category}">${capitalize(category)}</option>`).join('');
}

function handleCategoryChange() {
    const categorySelect = document.getElementById('item-category-filter');
    const category = categorySelect ? categorySelect.value : 'all';

    if (category === 'all') {
        filteredItems = cachedItemData;
    } else {
        filteredItems = cachedItemData.filter(item => (item.type || 'Uncategorized') === category);
    }

    renderItems(filteredItems);
}

function renderItems(items) {
    const browser = document.getElementById('item-browser');
    if (!browser) {
        return;
    }

    browser.innerHTML = '';

    if (!items || items.length === 0) {
        browser.innerHTML = '<div class="empty-state">No items found for this category.</div>';
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-header">
                ${item.img ? `<img src="${item.img}" alt="${item.name}">` : ''}
                <div>
                    <h3>${item.name}</h3>
                    <p class="item-type">${capitalize(item.type || 'Uncategorized')}</p>
                </div>
            </div>
            <div class="item-card-body">
                ${item.system?.description?.value || '<p>No description provided.</p>'}
            </div>
            <div class="item-card-meta">
                <span>Price: ${item.system?.price?.value ?? '-'} ${item.system?.price?.denomination ?? ''}</span>
                <span>Weight: ${item.system?.weight?.value ?? '-'} ${item.system?.weight?.units ?? ''}</span>
            </div>
        `;
        browser.appendChild(card);
    });
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