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
## Active Focus & Next Steps
- Wire staged enemies into on-map placement tools (tokens, visibility toggles, duplication).
- Extend map display profiles to allow naming multiple screens/devices and switching resolutions quickly.
- Extend monster filtering (CR, environment, alignment) and add map-aware AoE targeting heuristics.
- Plan incremental introduction of testing (Jest/Vitest) covering initiative, attack flows, catalog loaders, and map broadcasting.
- Document architectural decisions (catalog normalization, `sourceId` usage, display socket contract) and future enhancements here to keep team alignment.

## Open Questions
- What UX do we want for large monster libraries in Arena (search, favorites, encounter presets)?
- How should multiple display profiles be represented in the UI and persisted? (Per-device naming/lookups?)
- Are there pending features or bug reports not captured in version control or `todo.md`?
- Any upcoming UX changes that require additional asset or data restructuring?


