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

### Atlas Display Controls & Real-time Updates (2025-01-18)

**Goal:** Improve DM workflow by adding real-time viewport controls and fixing UI/sync issues.

**Issues Fixed:**
1. **Session Auto-load Errors:** Fresh installs showed alert popups when localStorage contained stale session IDs
2. **Verbose Debug Display:** Sync debug text cluttered the UI header
3. **Atlas Encounters Layout:** Section expanded uncontrollably when clicking in map area
4. **No Display Pan Controls:** No way to adjust viewport on player display (port 3001) without manual saves
5. **Infinite Redraw Loops:** State mutations in draw functions caused continuous re-rendering, preventing token interaction
6. **Manual Save Required:** Grid and viewport zoom required clicking "Save" button to update display

**Solutions Implemented:**

*Session Management (session-manager.js):*
- Added `isAutoLoad` parameter to `loadSession()` and `loadEncounter()` for graceful error handling
- Silent localStorage cleanup on auto-load failures instead of showing alerts
- Improved UX on fresh installs

*UI Improvements (index.html, styles.css):*
- Replaced sync debug div with compact LED indicator (green when saved <5s ago, red otherwise)
- Added save timestamp display below LED
- Fixed broken `.atlas-start-area-hint` CSS causing layout expansion
- Set `.atlas-encounter-layout` height to 900px for proper content visibility
- Fixed `.atlas-enemy-list-wrapper` overlapping detail section

*Display Pan Controls (app.js, index.html, styles.css):*
- Added directional arrow buttons (up/down/left/right) in encounter header
- Pan amount: 3/4 of display resolution by default, 1/4 when "Fine" checkbox enabled
- Buttons update BOTH local canvas (port 3000) AND player display (port 3001)
- Created `panDisplayViewport()` to send viewport offset updates to server
- Created `panLocalEncounterCanvas()` to sync local view with display
- Fixed backwards pan directions (up was down, left was right)

*Real-time Settings Updates (app.js):*
- Grid settings (color, opacity, line width, enabled) update display immediately on change
- Grid zoom buttons (+/-/reset) broadcast to display without save button
- Viewport zoom buttons broadcast to display without save button
- Created `updateGridSettingsOnServer()`, `updateGridZoomOnServer()`, `updateViewportZoomOnServer()`
- All settings use PATCH requests with minimal payloads to avoid triggering unwanted side effects

*Infinite Loop Fixes (app.js):*
- **Critical:** Removed state mutations from `drawAtlasEncounter()` (lines 5570-5571 commented out)
- State mutations during rendering caused continuous redraws, blocking all user interaction
- Added debug logging to track draw call frequency

*Server Improvements (server/server.js):*
- Enhanced `/api/atlas/settings` PATCH endpoint to use deep merge for nested objects
- Added detection for viewport-only updates vs encounter changes
- Skip `applyStartAreaViewport()` when only panning/zooming to prevent server from reverting changes
- Added debug logging for troubleshooting viewport update issues

*Display Client Fixes (public-display/js/display.js):*
- Fixed `handleDisplayState()` to redraw when viewport/grid settings change (not just on new map load)
- Check if map URL unchanged before reloading image - immediate redraw for settings changes
- Enables real-time zoom/pan/grid updates on player display

**Current Status:**
- ✅ Session auto-load works cleanly on fresh installs
- ✅ Clean LED indicator shows save status
- ✅ Atlas Encounters layout stable and properly sized
- ✅ Pan display buttons work with fine adjustment mode
- ✅ Grid settings update player display in real-time
- ✅ Grid zoom updates player display in real-time
- ✅ Viewport zoom updates control interface (port 3000) correctly
- ⚠️ Viewport zoom server persistence needs verification - may require restart to test
- ⚠️ Token click functionality needs testing after redraw loop fix

### Token Display & Image Rendering Fixes (2025-01-17)

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

### Bug Fixes & Network Playtest Success (2025-01-20)

**Goal:** Fix critical bugs blocking gameplay and successfully playtest over LAN with player display.

**Issues Fixed:**

1. **Duplicate API_BASE Declaration**
   - Error: `Uncaught SyntaxError: Identifier 'API_BASE' has already been declared`
   - Both `session-manager.js` and `app.js` declared the same constant
   - Fixed by removing duplicate from `app.js:18`, keeping only in `session-manager.js:4`

2. **Map Upload File Size & Error Handling**
   - Issue: Maps larger than 25MB failed with server crashes
   - Increased limit from 25MB → 100MB for high-quality battle maps (server/server.js:87)
   - Added proper multer error handling with helpful messages
   - Graceful fallback when imageSize library can't read dimensions
   - Maps now upload successfully without crashing server

3. **Flavor Media Display on Network Devices**
   - Issue: Flavor images loaded but never displayed on port 3001 player view
   - Root cause: Image URL comparison bug - relative paths vs absolute URLs never matched
   - Fixed URL normalization in display client (public-display/js/display.js:275-276)
   - Flavor media now works with or without active map loaded
   - Display client properly detects when image is already loaded vs needs reload

**Playtest Results:**
- ✅ **Successful first live playtest over LAN!**
- ✅ DM workflow significantly reduced cognitive load
- ✅ Combat tracker, initiative, and HP management worked flawlessly
- ✅ Atlas map display on separate screen (port 3001) enhanced player immersion
- ✅ Flavor media system allowed DM to reveal encounter art in real-time
- ✅ Custom enemies from character builder integrated smoothly with encounters

**Technical Changes:**
- `public/js/app.js:18` - Removed duplicate API_BASE constant
- `server/server.js:87` - Increased map upload limit to 100MB
- `server/server.js:561-614` - Enhanced error handling for map uploads
- `public-display/js/display.js:34-130` - Refactored draw() to support flavor media without maps
- `public-display/js/display.js:262-299` - Fixed image URL comparison with proper normalization
- `public/js/app.js:3695-3706` - Added debugging logs for enemy library filtering

## 🧠 Playtest Learnings — Arena Module (2025-01-20)

Based on live D&D session feedback, identified key improvements for DM workflow and player experience.

### ✅ What Worked Well

- Core initiative flow was smooth and reliable
- Encounter setup and sync worked flawlessly between DM and player displays
- Visual clarity was solid overall; players tracked turns easily once announced
- HP tracking, damage application, and status effects performed without issues
- Flavor media reveals enhanced dramatic moments

### ⚙️ Priority Feature Requests

**1. Custom Effects Tracker**

**Goal:** Track temporary effects (spells, conditions, cooldowns) directly in Arena without switching views.

**Requirements:**
- Simple input field: Effect Name + Duration (rounds)
- Add button → logs effect to combatant sheet
- Each round, effect counter decrements automatically
- Optional: visual timer icon or list in combatant panel

**Examples:**
- "Poison – 6 rounds"
- "Shield of Faith – 3 rounds cooldown"
- "Bless – 10 rounds"

**Implementation Notes:**
- Integrate with existing status effects system
- Add to combatant card UI alongside HP/AC controls
- Persist in encounter state for save/restore
- Consider visual distinction between conditions (negative) vs buffs (positive)

---

**2. Enemy Movement Controls (in Arena)**

**Goal:** Avoid switching back to Atlas for repositioning tokens during combat.

**Requirements:**
- Add "Move" button next to each enemy in the Arena list
- Clicking opens quick grid controls (arrow pad or numeric input)
- Show counter of how many grid squares moved (based on grid size from Atlas)
- Update token position on map display in real-time

**Optional Enhancements:**
- Arrow keys for manual movement when token selected
- Display movement summary: "Goblin-01 moved 20 ft."
- Highlight movement range based on creature speed
- Undo last move button

**Implementation Notes:**
- Sync with Atlas `placedEnemies` positions
- Broadcast position updates to port 3001 display
- Respect grid snapping settings from Atlas
- Consider movement history for tactical replay

---

**3. Initiative Display Repositioning**

**Goal:** Improve visibility of active turn on player map (port 3001).

**Current Issue:** "Whose Turn It Is" displayed at bottom of screen, easy to miss.

**Requirements:**
- Move current turn indicator to top of screen, directly beneath map name
- Add subtle animation or highlight to draw player attention
- Ensure text is large and readable from across the table

**Acceptance Criteria:**
- Active turn name visible at a glance without scanning screen edges
- No overlap with map content or grid
- Smooth transition between turns

**Implementation Notes:**
- Update `public-display/js/display.js` draw order
- Position after map name/header, before map rendering
- Consider pulse animation or glow effect
- Test visibility at various display resolutions

---

**4. Enemy Health Ring Color System**

**Status:** Completed (Oct 20, 2025)

**What changed:**
- Server now emits combatant HP (current/max/temp, derived percent, death state) with each display payload.
- Player display (`public-display/js/display.js`) renders a ring using the 100/75/50/25/0 color tiers and falls back to the legacy red ring when data is missing.
- Active token glow remains distinct (white halo) and layers above the health ring.
- New Atlas setting toggle (`Show enemy health ring colors`) controls the feature; defaults to on and persists in `data/atlas_settings.json`.

**Follow-ups:**
- Optionally extend to the DM-side canvas if we revive the `port 3000` map view.
- Explore an alternate palette for color-blind accessibility.

---

**5. Active Turn Glow**

**Goal:** Make it easy for players to identify whose turn it is visually on the map.

**Requirements:**
- When an enemy or player token is active, add soft glow effect (outline or radial)
- Glow color distinct from HP ring (suggest white or cyan)
- Only one glow active at a time (current initiative actor)

**Behavior:**
- Glow appears when turn starts
- Glow disappears when turn ends
- Synchronize with Arena turn advancement
- Works for both player and enemy tokens

**Implementation Notes:**
- Add to `buildDisplayState()` to include `currentTurn` token ID
- Update display client to render glow effect
- Use canvas shadow/blur or stroke for glow
- Test performance with multiple tokens on screen
- Consider pulsing animation vs static glow

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


### Atlas Fine Pan Controls & Display Header (2025-10-22)

**Highlights:**
- Added a dedicated square-count input tied to the "Fine" pan toggle so DMs can define exact grid movement without leaving the Arena.
- Fine pans now translate the chosen square count into pixel offsets, preventing unintended zoom/resize effects in Atlas Encounters.
- Persist fine-pan preferred distance alongside other viewport settings; autosave restores the custom value on reload.
- Player display (port 3001) banner now stacks an enlarged map title with the active turn label for better table visibility.

**Follow-Up:**
- Investigate intermittent start-combat failures when the Arena shows no combatants despite active Atlas tokens (likely sync edge case).
