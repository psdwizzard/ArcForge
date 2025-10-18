# Project Plan – ArcForge Battle Tracker

## Context
- Local-first D&D 5e companion app combining initiative tracking, combat automation, status management, and loot workflows (see `README.md`).
- Tech stack: Express backend served from `server/`, static frontend assets in `public/`, JSON persistence under `data/`.
- Workspace tools include utility batch scripts (`start.bat`, `restart-server.bat`, `kill-server.bat`) for Windows-driven workflows.

## Guidance from `@dnd-battle-tracker-architect`
- Follow phased development: Phase 1 initiative, Phase 2 combat stats, Phase 3 combatant management, Phase 4 loot, Phase 5 persistence.
- Prioritize DM workflow efficiency, minimizing click count and cognitive load.
- Enforce 5e rule accuracy (initiative ties, status durations, death saves, etc.).
- Maintain clean separation between game logic and UI; keep drag-and-drop smooth and resilient.
- Validate and persist encounter/creature data without corruption; prefer JSON unless complexity demands more.

## Current State Snapshot
- Core features cover combat tracker, attack workflow, character/effects builders, loot manager, and local persistence.
- Items catalog loads from `data/DBs/items.json` with filtering, searching, and inventory assignment.
- Monster catalog pulls from `data/creatures/library/monsters_clean_with_images.json`, including token art, full stats, traits/actions, and direct “Add to Combat” support.
- Combatants store `sourceId` so Arena cards retrieve attacks/effects from catalog data.
- Codex defaults to Character tab; stat summary cards tightened for consistency.
- **Atlas Map Module** now supports image uploads, library management, per-display viewport controls (fit/zoom/pan), and broadcasts state to a dedicated player view at `:3001`.
- Display handshake tracks active viewers, allowing instant push of map/grid updates across LAN.
- Map and display settings persist to JSON (`data/maps.json`, `data/atlas_settings.json`) for quick restart recovery.
- No automated tests yet; testing strategy remains an open gap per `README.md`.

- Atlas encounter setup allows zoom-tuned starting areas that persist to display viewports.
- Encounter view includes a side-by-side enemy library with search/filter across monster data and saved enemies, plus staging for on-map placement.
- **Session & Encounter Management** integrated with Atlas - sessions auto-load on startup, encounters persist combatants and placed enemy positions.
- **Bidirectional Arena ↔ Atlas Sync** system bridges two encounter storage systems (legacy in-memory vs. session-based) to keep combat tracker and map placement in sync.

## Active Focus & Current Work

### Atlas Encounters - Enemy Placement & Combat Integration (COMPLETE)

**Goal:** Seamlessly link the Arena combat tracker with Atlas map-based enemy placement so DMs can manage enemies in either view and see changes reflected everywhere.

**Recent Accomplishments:**
- ✅ Enemy token placement on map with grid snapping to square centers
- ✅ Token sizing scaled to match grid cell dimensions (80% diameter)
- ✅ Click-to-select tokens with arrow key movement (one grid cell at a time)
- ✅ Auto-numbering system for duplicate enemy names (e.g., "Pig - 01", "Pig - 02")
- ✅ Session/encounter auto-load using localStorage (remembers last session and encounter)
- ✅ Removed all alert() popups for cleaner UX
- ✅ 2x2 button grid layout in staging area to show more enemy information
- ✅ Agent Editor for stat/inventory editing (HP, AC, abilities, gold, inventory with autocomplete)
- ✅ Encounter Flavor Media upload system (images & sounds separate from agent data)
- ✅ Enemy token display on player screen (port 3001) with visibility control

**Current Technical Challenge - Dual Encounter Systems:**

The app has TWO separate encounter persistence systems that need to work together:

1. **Legacy System (Arena)**:
   - Endpoint: `/api/encounter`
   - Storage: In-memory `currentEncounter` object in `server/server.js`
   - Auto-saves every 30 seconds via `autoSaveEncounter()`
   - Used by Arena combat tracker

2. **Session-Based System (Atlas)**:
   - Endpoints: `/api/sessions/:sessionId/encounters/:encounterId`
   - Storage: JSON files in `data/sessions/*.json`
   - Saves via `saveCurrentEncounter()` in `session-manager.js`
   - Used by Session Manager and Atlas Encounters

**Synchronization Architecture:**

*Files Modified:*
- `public/js/session-manager.js`: Handles session/encounter CRUD, auto-load, and bidirectional sync
- `public/js/app.js`: Arena combat state, Atlas map rendering, token placement, keyboard controls

*Key Functions:*
- `syncCombatantsToAtlas()` (session-manager.js:620-684): Takes enemies from Arena `encounterState.combatants` and adds them to Atlas `pending` array for map placement
- `addPlacedEnemyToCombat()` (app.js:3792-3914): Takes placed map tokens and adds them to Arena as combatants with full stats/attacks
- `saveCurrentEncounter()` (session-manager.js:528-583): Saves both combatants AND placedEnemies to session-based encounter JSON
- `loadEncounter()` (session-manager.js:380-462): Restores combatants to Arena and placedEnemies to Atlas map

*Data Flow:*

**Adding Enemy in Arena:**
1. User adds monster from Codex → POST to `/api/combatants`
2. Server adds to `currentEncounter.combatants` with auto-numbering
3. `loadEncounterState()` fetches updated combatants
4. `syncCombatantsToAtlas()` checks each combatant, adds enemies to `atlasMapState.encounter.pending` (marked as `placed: false`)
5. `saveCurrentEncounter()` persists to session-based encounter JSON
6. Enemy appears in Arena (with initiative) AND Atlas staging list (ready to place on map)

**Adding Enemy in Atlas:**
1. User selects from library → clicks "Location" → places on map
2. `placeEnemyToken()` sets position, marks `placed: true`
3. `addPlacedEnemyToCombat()` adds to Arena via POST `/api/combatants` with full monster data
4. `saveCurrentEncounter()` saves `placedEnemies` array with positions
5. Enemy appears on map (with position) AND in Arena (ready for combat)

**On Page Reload:**
1. `localStorage` triggers auto-load of last session + encounter
2. `loadEncounter()` restores `combatants` → Arena shows all enemies
3. `loadEncounter()` restores `placedEnemies` → Map shows all placed tokens
4. Retry loop waits for `atlasMapState` initialization, then calls `syncCombatantsToAtlas()`
5. Both views display synchronized data

*Current Issues Being Debugged:*
- `atlasMapState` initialization timing - using 100ms retry loop (up to 2 seconds) to ensure it's ready before sync
- `placedEnemies` field coming back as `undefined` from server - investigating why data isn't persisting
- Need to verify the session-based encounter save endpoint is properly storing the `placedEnemies` array

*Token Rendering Details:*
- Token size calculation: `cellPx * scale * gridZoom * 0.4` (matches grid drawing exactly)
- Grid snapping: Snap to `gridX * cellSize + halfCell + offsetX` for square centers
- Selection highlight: Yellow border when token selected
- Keyboard movement: Arrow keys move exactly one grid cell, Escape to deselect

## Recent Session Accomplishments

### Token Display & Image Rendering Fixes (2025-10-18)

**Issue:** Enemy tokens were invisible in Atlas Encounters view and showing as red circles (no images) on player display (port 3001).

**Root Causes Identified:**
1. **Tiny Token Size:** Token radius calculation using `cellPx * scale * gridZoom * 0.4` resulted in ~4px tokens when `gridZoom=0.2`, making them essentially invisible
2. **Missing Image Paths:** Library monster image paths not preserved through save/load cycle due to:
   - Field name mismatch: `normalizeMonsterData()` converts `token_image` → `tokenImage` (camelCase), but sync code looked for snake_case
   - Payload stripping: `syncCombatantsToAtlas()` reduced monster payload to just `{ id: "..." }`, losing all image data
   - Missing window exposure: `monstersById` and `charactersData` not exposed globally for cross-module access

**Solutions Implemented:**

*Token Visibility (app.js, display.js):*
- Added minimum token radius: 20px for Atlas Encounters, 25px for player display
- Improved token styling: Solid colors, thicker borders (4-5px white), larger fonts
- Added visual debugging: Crosshair markers and test circles to verify rendering
- Enhanced name labels: Dark backgrounds, better padding, bold text

*Image Path Resolution (session-manager.js, server/server.js):*
- Fixed field name references: Changed all `token_image`/`portrait_image` lookups to use camelCase (`tokenImage`/`portraitImage`)
- Exposed data globally: `window.monstersById` (loot-manager.js) and `window.charactersData` (app.js)
- Enhanced `loadEncounter()`: Retry mechanism waits for libraries to load, then resolves missing image paths
- Enhanced `syncCombatantsToAtlas()`: Preserves full monster payload and resolves images from library
- Enhanced `saveCurrentEncounter()`: Checks multiple image path sources (entry, payload camelCase/snake_case)
- Updated server `buildDisplayState()`: Checks `payload.tokenImage`/`portraitImage` (camelCase) and handles relative paths
- Custom enemy support: Looks up character data by name (strips auto-number suffix) to get image paths

*Data Flow for Images:*
1. Library monster added → `handleEncounterEnemyAdd()` resolves `payload.tokenImage` via `resolveEnemyImagePath()`
2. On save → `saveCurrentEncounter()` extracts image from `entry.imagePath` or `payload.tokenImage`/`portraitImage`
3. On load → `loadEncounter()` restores images, waits for libraries, then fills in missing paths
4. On sync → `syncCombatantsToAtlas()` fetches full monster data from `window.monstersById` including images
5. Server broadcast → `buildDisplayState()` checks multiple image sources and sends to display
6. Display renders → Shows monster portrait if available, otherwise solid red circle with white border

**Current Status:**
- ✅ Tokens visible in Atlas Encounters view (bright red with white borders, minimum 20px radius)
- ✅ Library monster images display on player view (port 3001)
- ✅ Custom enemy images display on player view
- ✅ Debug helpers available: `debugAtlasTokens()` in browser console
- ⚠️ Need to verify newly-added library monsters get images (testing required)

### Encounter Flavor Media System (2025-01-17)
- Created dedicated flavor media upload section separate from agent editor
- File upload buttons for images and audio with visual preview grids
- Image previews with click-to-view full size functionality
- HTML5 audio players for sound preview with visible controls
- Separate `/api/flavor-media` endpoint to prevent confusion with map uploads
- Persistence through encounter save/load system
- Responsive grid layout with 140px minimum column width

### Agent Editor Improvements
- Removed old flavor media fields from agent editor (now separate)
- Fixed persistence issues - agent stats now save correctly
- Widened agent editor panel to 600px (max 650px) for better usability
- Clean separation between agent properties and encounter flavor content

### Player Display Token Rendering
- Server-side token data included in `buildDisplayState()`
- `currentSessionEncounter` tracks active encounter for display broadcast
- Display client renders enemy tokens as red circles on map
- Token positions scale with viewport zoom/fit modes
- Visibility control - only enemies marked "Visible on Map" appear
- Real-time updates via Socket.IO when encounter changes
- Token size scales with grid cell size

**Technical Implementation:**
- Server: `buildDisplayState()` filters `placedEnemies` for `placed: true` and `visible !== false`
- Server: Encounter GET/PUT endpoints update `currentSessionEncounter` and broadcast state
- Client: `drawTokens()` converts map coordinates to screen coordinates and renders tokens
- Client: Token radius calculated as `(cellSize * scale) / 2` for proper grid alignment

## Next Steps
- Add token duplication/deletion features in Atlas UI
- Implement token color customization (enemy vs NPC vs ally)
- Add initiative order indicators on player display tokens
- Extend map display profiles to allow naming multiple screens/devices and switching resolutions quickly
- Extend monster filtering (CR, environment, alignment) and add map-aware AoE targeting heuristics
- Plan incremental introduction of testing (Jest/Vitest) covering initiative, attack flows, catalog loaders, map broadcasting, and Arena↔Atlas sync
- Document architectural decisions (catalog normalization, `sourceId` usage, display socket contract, dual encounter system sync) and future enhancements here to keep team alignment.

## Encounter UI TODOs (Atlas) — Completed

Context: Agent Editor, items picker, Arena↔Atlas sync, flavor media, and player display token rendering all implemented and working.

- Layout ✅
  - Three columns: Enemy Library (≈400px), Map (flex/550px), Agent Editor (600px max 650px)
  - Agent Editor in separate right-side panel
  - Flavor Media section in encounters footer area

- Agent Editor ✅
  - Dark theme across all inputs and lists
  - Item search with autocomplete from DB
  - Inventory list with remove actions
  - Stats persistence working correctly

- Persistence ✅
  - Staged overrides (hp, ac, abilities, inventory, gold, visible) persist on staged entries
  - Overrides apply when creating Arena combatants from placed tokens
  - PUT updates mirror in UI immediately
  - Session save/restore includes placedEnemies with visible flags and positions

- Player Display ✅
  - Enemy tokens render on player screen (port 3001)
  - Visibility control works (only visible enemies shown)
  - Real-time updates via Socket.IO

- Control Center integration (Future)
  - Visibility bulk toggles (show/hide all), layer groups, and a manual "Sync Now" button

- QA/Testing (Future)
  - Add smoke tests for editor save, staged→Arena application, session load/restore, and visibility rendering

## Open Questions
- What UX do we want for large monster libraries in Arena (search, favorites, encounter presets)?
- How should multiple display profiles be represented in the UI and persisted? (Per-device naming/lookups?)
- Are there pending features or bug reports not captured in version control or `todo.md`?
- Any upcoming UX changes that require additional asset or data restructuring?


