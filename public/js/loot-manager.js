// Loot Manager

let lootEncounterState = {};

function initLootManager() {
    const lootNavBtn = document.getElementById('nav-loot-btn');
    if (lootNavBtn) {
        lootNavBtn.addEventListener('click', () => {
            loadLootData();
        });
    }

    const distributeGoldBtn = document.getElementById('distribute-gold-btn');
    if (distributeGoldBtn) {
        distributeGoldBtn.addEventListener('click', distributeGold);
    }
}

async function distributeGold() {
    const players = lootEncounterState.combatants.filter(c => c.type === 'player');
    if (players.length === 0) {
        alert('No players to distribute gold to.');
        return;
    }

    let totalGold = 0;
    const goldRegex = /(\d+)\s*gp/i;

    lootEncounterState.combatants.forEach(creature => {
        if (creature.loot) {
            creature.loot = creature.loot.filter(item => {
                const match = item.match(goldRegex);
                if (match) {
                    totalGold += parseInt(match[1]);
                    return false;
                }
                return true;
            });
        }
    });

    if (totalGold === 0) {
        alert('No gold found in the loot pool.');
        return;
    }

    const goldPerPlayer = Math.floor(totalGold / players.length);
    const remainder = totalGold % players.length;

    players.forEach((player, index) => {
        if (!player.loot) {
            player.loot = [];
        }
        let share = goldPerPlayer;
        if (index < remainder) {
            share++;
        }
        player.loot.push(`${share} gp`);
    });

    try {
        for (const combatant of lootEncounterState.combatants) {
            await fetch(`${API_BASE}/combatants/${combatant.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(combatant)
            });
        }
        loadLootData();
    } catch (error) {
        console.error('Error distributing gold:', error);
    }
}

async function loadLootData() {
    try {
        const response = await fetch(`${API_BASE}/encounter`);
        lootEncounterState = await response.json();
        renderLootUI();
    } catch (error) {
        console.error('Error loading encounter state for loot:', error);
    }
}

function renderLootUI() {
    renderLootPool();
    renderPartyInventory();
}

function renderLootPool() {
    const lootPool = document.getElementById('loot-pool');
    lootPool.innerHTML = '';

    const defeatedCreatures = lootEncounterState.combatants.filter(c => c.hp.current === 0 && c.loot && c.loot.length > 0);

    if (defeatedCreatures.length === 0) {
        lootPool.innerHTML = '<div class="empty-state">No loot to distribute.</div>';
        return;
    }

    defeatedCreatures.forEach(creature => {
        creature.loot.forEach((item, index) => {
            const lootItem = document.createElement('div');
            lootItem.className = 'loot-item';
            lootItem.draggable = true;
            lootItem.dataset.creatureId = creature.id;
            lootItem.dataset.itemIndex = index;
            lootItem.textContent = item;
            lootItem.addEventListener('dragstart', handleLootDragStart);
            lootPool.appendChild(lootItem);
        });
    });
}

function renderPartyInventory() {
    const partyInventory = document.getElementById('party-inventory');
    partyInventory.innerHTML = '';

    const players = lootEncounterState.combatants.filter(c => c.type === 'player');

    if (players.length === 0) {
        partyInventory.innerHTML = '<div class="empty-state">No players in the encounter.</div>';
        return;
    }

    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-inventory-card';
        playerCard.dataset.playerId = player.id;

        let inventoryHTML = '';
        if (player.loot && player.loot.length > 0) {
            inventoryHTML = player.loot.map(item => `<div class="inventory-item">${item}</div>`).join('');
        }

        playerCard.innerHTML = `
            <div class="player-name">${player.name}</div>
            <div class="player-inventory">${inventoryHTML}</div>
        `;

        playerCard.addEventListener('dragover', handlePlayerDragOver);
        playerCard.addEventListener('drop', handlePlayerDrop);

        partyInventory.appendChild(playerCard);
    });
}

function handleLootDragStart(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({
        creatureId: e.target.dataset.creatureId,
        itemIndex: e.target.dataset.itemIndex
    }));
}

function handlePlayerDragOver(e) {
    e.preventDefault();
}

async function handlePlayerDrop(e) {
    e.preventDefault();
    const lootData = JSON.parse(e.dataTransfer.getData('text/plain'));
    const playerId = e.currentTarget.dataset.playerId;

    const creature = lootEncounterState.combatants.find(c => c.id === lootData.creatureId);
    const player = lootEncounterState.combatants.find(c => c.id === playerId);
    const item = creature.loot[lootData.itemIndex];

    if (!player.loot) {
        player.loot = [];
    }

    player.loot.push(item);
    creature.loot.splice(lootData.itemIndex, 1);

    try {
        await fetch(`${API_BASE}/combatants/${player.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(player)
        });

        await fetch(`${API_BASE}/combatants/${creature.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creature)
        });

        loadLootData();
    } catch (error) {
        console.error('Error distributing loot:', error);
    }
}

document.addEventListener('DOMContentLoaded', initLootManager);