(function() {
    const cloneInventory = (items) => Array.isArray(items) ? items.map(item => (item && typeof item === 'object' ? { ...item } : item)) : [];

    function normalizeTokens(value) {
        if (!value) {
            return [];
        }
        return String(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .map(token => token.trim())
            .filter(Boolean);
    }

    function syncArenaCombatantsToAtlas() {
        if (!window.encounterState) {
            console.log('[Atlas] syncArenaCombatantsToAtlas: encounterState unavailable');
            return;
        }
        if (!window.atlasMapState || !window.atlasMapState.encounter) {
            console.log('[Atlas] syncArenaCombatantsToAtlas: atlas state unavailable');
            return;
        }

        const combatants = Array.isArray(window.encounterState.combatants)
            ? window.encounterState.combatants
            : [];

        if (!Array.isArray(window.atlasMapState.encounter.pending)) {
            window.atlasMapState.encounter.pending = [];
        }

        const pending = window.atlasMapState.encounter.pending;
        const pendingByOrigin = new Map(
            pending
                .filter(entry => entry && entry.originCombatantId)
                .map(entry => [entry.originCombatantId, entry])
        );

        const enemyTokens = new Set(['enemy', 'enemies', 'monster', 'monsters', 'npc', 'n', 'e', 'creature', 'hostile']);
        const playerTokens = new Set(['player', 'players', 'pc', 'pcs', 'p']);

        let added = 0;

        combatants.forEach(combatant => {
            const tokens = new Set([
                ...normalizeTokens(combatant.type),
                ...normalizeTokens(combatant.agentType),
                ...normalizeTokens(combatant.faction),
                ...normalizeTokens(combatant.role)
            ]);
            const rawType = (combatant.type || '').toLowerCase().trim();
            if (rawType) {
                tokens.add(rawType);
            }

            if (Array.from(tokens).some(token => playerTokens.has(token))) {
                return;
            }

            const hasEnemyToken = Array.from(tokens).some(token => enemyTokens.has(token));
            const autoNumbered = / - \d{2}$/.test(combatant.name || '');
            const shouldStage = hasEnemyToken || (!hasEnemyToken && (rawType === 'enemy' || rawType === 'monster' || rawType === 'npc' || rawType === 'n' || rawType === 'e' || autoNumbered));
            if (!shouldStage) {
                return;
            }

            const existingEntry = pendingByOrigin.get(combatant.id) || pending.find(entry => {
                if (!entry) return false;
                if (entry.originCombatantId && entry.originCombatantId === combatant.id) {
                    return true;
                }
                if (entry.atlasTokenId && combatant.atlasTokenId && entry.atlasTokenId === combatant.atlasTokenId) {
                    return true;
                }
                return entry.name === combatant.name;
            });

            const hpValue = typeof combatant.hp === 'object' ? (combatant.hp.current ?? combatant.hp.max ?? null) : combatant.hp;
            const acValue = typeof combatant.ac === 'number' ? combatant.ac : null;
            const dexValue = typeof combatant.dexModifier === 'number' ? combatant.dexModifier : null;

            if (existingEntry) {
                existingEntry.name = combatant.name;
                existingEntry.source = combatant.sourceId ? 'library' : (existingEntry.source || 'custom');
                if (combatant.sourceId) {
                    existingEntry.payload = { id: combatant.sourceId };
                }
                existingEntry.originCombatantId = combatant.id;
                if (typeof existingEntry.visible === 'undefined') {
                    existingEntry.visible = combatant.visible !== false;
                }
                existingEntry.stats = existingEntry.stats || {};
                existingEntry.stats.hp = hpValue ?? existingEntry.stats.hp ?? null;
                if (acValue !== null) {
                    existingEntry.stats.ac = acValue;
                }
                if (dexValue !== null) {
                    existingEntry.stats.dexModifier = dexValue;
                }
                if (combatant.abilities) {
                    existingEntry.abilities = { ...combatant.abilities };
                }
                if (Array.isArray(combatant.inventory)) {
                    existingEntry.inventory = cloneInventory(combatant.inventory);
                }
                if (typeof combatant.gold === 'number') {
                    existingEntry.gold = combatant.gold;
                }
                existingEntry.atlasTokenId = combatant.atlasTokenId || existingEntry.atlasTokenId || null;
                return;
            }

            const entryId = combatant.atlasTokenId || ('arena-' + combatant.id);
            const newEntry = {
                id: entryId,
                name: combatant.name,
                source: combatant.sourceId ? 'library' : 'custom',
                payload: combatant.sourceId ? { id: combatant.sourceId } : null,
                placed: false,
                position: null,
                atlasTokenId: combatant.atlasTokenId || null,
                originCombatantId: combatant.id,
                visible: combatant.visible !== false,
                stats: {
                    hp: hpValue ?? null,
                    ac: acValue,
                    dexModifier: dexValue
                },
                abilities: combatant.abilities ? { ...combatant.abilities } : null,
                inventory: cloneInventory(combatant.inventory),
                gold: typeof combatant.gold === 'number' ? combatant.gold : null
            };

            pending.push(newEntry);
            pendingByOrigin.set(combatant.id, newEntry);
            added += 1;
        });

        if (added) {
            console.log('[Atlas] Synced', added, 'combatant(s) from Arena to Atlas staging');
        }

        if (typeof renderStagedEnemiesList === 'function') {
            renderStagedEnemiesList();
        }
        if (typeof updateEncounterEnemyStagingCount === 'function') {
            updateEncounterEnemyStagingCount();
        }
        if (typeof updateSyncDebugHUD === 'function') {
            updateSyncDebugHUD();
        }
    }

    const originalAddPlacedEnemyToCombat = window.addPlacedEnemyToCombat;
    window.addPlacedEnemyToCombat = async function(entry) {
        if (!entry) {
            return;
        }

        entry.atlasTokenId = entry.atlasTokenId || entry.id;

        const combatants = (window.encounterState?.combatants) || [];
        if (entry.originCombatantId) {
            const existing = combatants.find(c => c.id === entry.originCombatantId);
            if (existing) {
                console.log('[Atlas] Linking existing combatant to token:', existing.name, entry.id);
                if (existing.atlasTokenId !== entry.id) {
                    try {
                        await fetch(`${API_BASE}/combatants/${existing.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ atlasTokenId: entry.id })
                        });
                        existing.atlasTokenId = entry.id;
                    } catch (error) {
                        console.error('[Atlas] Failed to link existing combatant to token', error);
                    }
                }
                return;
            }
        }

        if (combatants.find(c => c.atlasTokenId === entry.id)) {
            console.log('[Atlas] Combatant already linked to token, skipping create');
            return;
        }

        if (typeof originalAddPlacedEnemyToCombat === 'function') {
            return originalAddPlacedEnemyToCombat.call(this, entry);
        }
    };

    const originalLoadCombatants = window.loadCombatants;
    if (typeof originalLoadCombatants === 'function') {
        window.loadCombatants = async function(...args) {
            const result = await originalLoadCombatants.apply(this, args);
            if (typeof window.syncCombatantsToAtlas === 'function') {
                window.syncCombatantsToAtlas();
            }
            return result;
        };
    }

    window.syncCombatantsToAtlas = syncArenaCombatantsToAtlas;
})();