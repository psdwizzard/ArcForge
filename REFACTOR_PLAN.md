# ArcForge Server Refactoring Plan

## Current State
- **File**: `server/server.js`
- **Lines**: 2060
- **Issues**: Monolithic file containing all server logic, difficult to maintain and navigate

## Refactoring Goals
1. Separate concerns into logical modules
2. Improve maintainability and testability
3. Make it easier to find and modify specific functionality
4. Follow Node.js/Express best practices
5. Maintain backward compatibility (no breaking API changes)

## Proposed Structure

```
server/
├── server.js                 # Main entry point (minimal setup)
├── config/
│   ├── constants.js          # Ports, paths, directory constants
│   ├── middleware.js         # Express middleware setup
│   └── multer.js             # File upload configurations
├── utils/
│   ├── fileUtils.js          # readJsonFile, writeJsonFile
│   ├── idGenerator.js        # generateId
│   └── mathUtils.js          # clampNumber, computePixelsPerInch
├── services/
│   ├── encounterService.js   # Encounter state management
│   ├── atlasService.js       # Atlas/map state management
│   ├── displayService.js     # Display state building & broadcasting
│   └── sessionService.js     # Session management logic
├── routes/
│   ├── index.js              # Route aggregator
│   ├── atlasRoutes.js        # Map/Atlas endpoints
│   ├── combatRoutes.js       # Combat/combatant endpoints
│   ├── characterRoutes.js    # Character CRUD endpoints
│   ├── effectRoutes.js       # Effect CRUD endpoints
│   ├── sessionRoutes.js      # Session & encounter endpoints
│   ├── creatureRoutes.js     # Creature endpoints
│   └── devRoutes.js           # Development utilities
└── socket/
    └── socketHandlers.js     # Socket.IO event handlers
```

## Module Breakdown

### 1. Configuration Modules

#### `config/constants.js`
- Port definitions (PORT, DISPLAY_PORT)
- Directory paths (ROOT_DIR, DATA_DIR, MAPS_DIR, etc.)
- File paths (MAPS_DB_PATH, ATLAS_SETTINGS_PATH)
- Directory initialization

#### `config/middleware.js`
- Express app setup
- CORS configuration
- Body parser setup
- Static file serving
- Cache control headers

#### `config/multer.js`
- General file upload storage (upload)
- Map upload storage (mapUpload)
- Upload limits and configurations

### 2. Utility Modules

#### `utils/fileUtils.js`
- `readJsonFile(filePath, fallback)` - Safe JSON file reading
- `writeJsonFile(filePath, payload)` - Safe JSON file writing

#### `utils/idGenerator.js`
- `generateId(prefix)` - UUID/random ID generation

#### `utils/mathUtils.js`
- `clampNumber(value, min, max)` - Number clamping utility
- `computePixelsPerInch(resolution, diagonal)` - PPI calculation

### 3. Service Modules

#### `services/encounterService.js`
**State Management:**
- `currentEncounter` state object
- `autoSaveEncounter()` - Auto-save functionality
- `hydrateCurrentEncounterFromSource(encounter)` - State hydration
- `applyEffects(combatant, timing)` - Status effect application

**Exports:**
- State getters/setters
- Encounter manipulation functions

#### `services/atlasService.js`
**State Management:**
- `mapsState` - Map database
- `atlasSettings` - Atlas configuration
- `currentSessionEncounter` - Current session encounter reference

**Functions:**
- `ensureAtlasDefaults()` - Default settings initialization
- `computeStartAreaRect(map, resolution, startArea)` - Start area calculations
- `computeViewportFromStartArea(map, resolution, rect, gridZoom)` - Viewport calculations
- `resetDisplayViewport()` - Reset viewport to defaults
- `applyStartAreaViewport(options)` - Apply start area viewport

**Exports:**
- Map state management
- Settings management
- Viewport calculations

#### `services/displayService.js`
**State:**
- `displayConnectionCount` - Active display connections
- `activeFlavorMedia` - Current flavor media

**Functions:**
- `buildDisplayState()` - Construct display state payload
- `broadcastDisplayState()` - Broadcast to all connected displays

**Dependencies:**
- Requires encounterService for combatant data
- Requires atlasService for map/viewport data

#### `services/sessionService.js`
**Functions:**
- `createDefaultSession()` - Initialize default session
- Session CRUD operations
- Encounter synchronization logic (auto-creating combatants from placed enemies)

### 4. Route Modules

#### `routes/atlasRoutes.js`
**Endpoints:**
- `GET /api/maps` - List all maps
- `POST /api/maps` - Upload new map
- `PATCH /api/maps/:id` - Update map metadata
- `DELETE /api/maps/:id` - Delete map
- `GET /api/atlas/settings` - Get atlas settings
- `PATCH /api/atlas/settings` - Update atlas settings
- `POST /api/atlas/active-map` - Set active map
- `GET /api/atlas/displays` - List connected displays
- `POST /api/flavor-media` - Upload flavor media
- `POST /api/atlas/flavor-media/show` - Show flavor media
- `POST /api/atlas/flavor-media/hide` - Hide flavor media

**Dependencies:**
- atlasService
- displayService
- config/multer

#### `routes/combatRoutes.js`
**Endpoints:**
- `GET /api/encounter` - Get current encounter
- `POST /api/encounter/new` - Create new encounter
- `GET /api/encounter/:id` - Load encounter by ID
- `GET /api/encounters` - List saved encounters
- `POST /api/combatants` - Add combatant
- `PUT /api/combatants/:id` - Update combatant
- `DELETE /api/combatants/:id` - Delete combatant
- `POST /api/combatants/:id/hp` - Modify HP
- `POST /api/combatants/:id/temp-hp` - Set temp HP
- `POST /api/combatants/:id/status-effects` - Add status effect
- `DELETE /api/combatants/:id/status-effects/:index` - Remove status effect
- `POST /api/combatants/:id/death-saves` - Update death saves
- `POST /api/combatants/:id/death-saves/roll` - Roll death save
- `POST /api/combatants/:id/initiative` - Set initiative
- `POST /api/initiative/roll` - Roll initiative for one
- `POST /api/initiative/roll-enemies` - Roll initiative for all enemies
- `POST /api/initiative/reorder` - Reorder initiative
- `POST /api/combat/start` - Start combat
- `POST /api/combat/end` - End combat
- `POST /api/combat/next-turn` - Advance to next turn

**Dependencies:**
- encounterService
- displayService

#### `routes/characterRoutes.js`
**Endpoints:**
- `GET /api/characters` - List all characters
- `GET /api/characters/:id` - Get character by ID
- `POST /api/characters` - Create/update character
- `DELETE /api/characters/:id` - Delete character
- `POST /api/uploads/characters` - Upload character image

**Dependencies:**
- config/multer
- utils/fileUtils

#### `routes/effectRoutes.js`
**Endpoints:**
- `GET /api/effects` - List all effects
- `GET /api/effects/:id` - Get effect by ID
- `POST /api/effects` - Create/update effect
- `DELETE /api/effects/:id` - Delete effect

**Dependencies:**
- utils/fileUtils

#### `routes/sessionRoutes.js`
**Endpoints:**
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session by ID
- `POST /api/sessions` - Create/update session
- `DELETE /api/sessions/:id` - Delete session
- `POST /api/sessions/:sessionId/encounters` - Create encounter in session
- `GET /api/sessions/:sessionId/encounters/:encounterId` - Get encounter from session
- `PUT /api/sessions/:sessionId/encounters/:encounterId` - Update encounter in session
- `DELETE /api/sessions/:sessionId/encounters/:encounterId` - Delete encounter from session

**Dependencies:**
- sessionService
- encounterService
- displayService

#### `routes/creatureRoutes.js`
**Endpoints:**
- `GET /api/creatures` - List all creature templates

**Dependencies:**
- utils/fileUtils

#### `routes/devRoutes.js`
**Endpoints:**
- `POST /api/dev/restart` - Restart server
- `POST /api/save` - Save all data (legacy)
- `GET /api/load` - Load all data (legacy)

#### `routes/index.js`
- Aggregates all route modules
- Exports router setup function

### 5. Socket Module

#### `socket/socketHandlers.js`
**Handlers:**
- `mainIo` connection handler (control server)
- `displayIo` connection handler (display server)
- Socket event handlers:
  - `display:hello` - Display client handshake
  - `settings:ui-scale` - UI scale updates

**Dependencies:**
- displayService
- atlasService

### 6. Main Server File

#### `server.js` (Refactored)
**Responsibilities:**
- Import all modules
- Initialize Express apps
- Setup middleware
- Register routes
- Initialize Socket.IO
- Start HTTP servers
- Initialize default session

**Should be ~100-150 lines**

## Migration Strategy

### Phase 1: Extract Configuration & Utilities
1. Create `config/` directory and modules
2. Create `utils/` directory and modules
3. Update `server.js` to use new modules
4. Test that server still works

### Phase 2: Extract Services
1. Create `services/` directory
2. Extract encounter service (most complex)
3. Extract atlas service
4. Extract display service
5. Extract session service
6. Update `server.js` to use services
7. Test thoroughly

### Phase 3: Extract Routes
1. Create `routes/` directory
2. Extract routes one module at a time:
   - Start with simplest (creatureRoutes)
   - Then characterRoutes, effectRoutes
   - Then combatRoutes (most complex)
   - Then atlasRoutes
   - Finally sessionRoutes
3. Create `routes/index.js` aggregator
4. Update `server.js` to use route modules
5. Test all endpoints

### Phase 4: Extract Socket Handlers
1. Create `socket/` directory
2. Extract socket handlers
3. Update `server.js`
4. Test Socket.IO functionality

### Phase 5: Cleanup & Documentation
1. Remove old code from `server.js`
2. Add JSDoc comments to all modules
3. Create/update README with new structure
4. Verify all functionality works

## Testing Strategy

After each phase:
1. Start server
2. Test all affected endpoints
3. Test Socket.IO connections
4. Test file uploads
5. Test display broadcasting
6. Verify no regressions

## Benefits

1. **Maintainability**: Each module has a single responsibility
2. **Testability**: Services can be unit tested independently
3. **Readability**: Easier to find specific functionality
4. **Scalability**: Easy to add new routes/services
5. **Collaboration**: Multiple developers can work on different modules
6. **Reusability**: Services can be reused across routes

## Potential Challenges

1. **Circular Dependencies**: Services may depend on each other
   - Solution: Use dependency injection or event emitters
   
2. **State Management**: Shared state between modules
   - Solution: Keep state in services, pass references

3. **Breaking Changes**: Risk of introducing bugs during refactor
   - Solution: Test thoroughly after each phase, keep old code until verified

4. **File Paths**: Relative paths may break
   - Solution: Use `__dirname` consistently, test path resolution

## Estimated Effort

- **Phase 1**: 1-2 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 4-6 hours
- **Phase 4**: 1-2 hours
- **Phase 5**: 1-2 hours

**Total**: ~10-16 hours of focused work

## Next Steps

1. Review and approve this plan
2. Create backup of current `server.js`
3. Begin Phase 1 implementation
4. Test after each phase
5. Iterate based on feedback

